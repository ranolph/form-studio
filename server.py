#!/usr/bin/env python3
"""Form Studio: a dependency-free server for a trusted home network.

Geometry is generated in the browser. The server persists recipes and forwards
validated STL files through Layer Library's existing session-protected API.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
from http import cookies
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import logging
import math
import mimetypes
import os
from pathlib import Path
import re
import socket
import sqlite3
import ssl
import struct
import threading
from urllib.parse import unquote, urlsplit
import uuid

VERSION = "1.2.0"
DEFAULT_LIBRARY = ""
DEFAULT_BED_SIZE = (256, 256, 256)
MAX_JSON = 256 * 1024
MAX_PARAMS = 240 * 1024
MAX_SETTING_TEXT = 32 * 1024
MAX_STAGED_RECIPES = 256
STAGED_RECIPE_DAYS = 30
LIBRARY_NOTES_LIMIT = 10000
MAX_STL = 64 * 1024 * 1024
MAX_RESPONSE = 2 * 1024 * 1024
LOG = logging.getLogger("form-studio")
LOCAL_NETWORKS = tuple(ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10",
    "127.0.0.0/8", "::1/128", "fc00::/7",
))


class APIError(Exception):
    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status, self.message, self.extra = status, message, extra


def parse_bed_size(value):
    """Read an axis-aligned printer volume in millimetres, in X,Y,Z order."""
    try:
        parts = value.split(",") if isinstance(value, str) else list(value)
        dimensions = [float(part) for part in parts]
        if len(dimensions) != 3 or any(not math.isfinite(v) or v <= 0 or v > 2000 for v in dimensions):
            raise ValueError()
    except (TypeError, ValueError):
        raise argparse.ArgumentTypeError("Build volume must be three positive millimetre dimensions, such as 220,220,250 (maximum 2000 per axis).") from None
    return dimensions


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def json_bytes(value, *, sort_keys=False):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=sort_keys, separators=(",", ":")).encode("utf-8")


def recipe_digest(name, params):
    """Ignore JSON key ordering when binding a transfer to immutable settings."""
    return hashlib.sha256(json_bytes({"name": name, "params": params}, sort_keys=True)).hexdigest()


def clean_name(value):
    if not isinstance(value, str):
        raise APIError(400, "Give the design a name.")
    result = "".join(c for c in value if c.isprintable()).strip()[:120]
    if not result:
        raise APIError(400, "Give the design a name.")
    return result


def valid_id(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise APIError(400, "The design or request ID is invalid.") from None


def validate_params(value):
    if not isinstance(value, dict) or not value or len(value) > 120:
        raise APIError(400, "Design settings must be a nonempty JSON object.")

    def visit(item, depth=0):
        if depth > 6:
            raise APIError(400, "Design settings are nested too deeply.")
        if isinstance(item, dict):
            if len(item) > 120 or any(not isinstance(k, str) or len(k) > 80 for k in item):
                raise APIError(400, "Design settings contain invalid keys.")
            for child in item.values():
                visit(child, depth + 1)
        elif isinstance(item, list):
            if len(item) > 256:
                raise APIError(400, "A design setting contains too many entries.")
            for child in item:
                visit(child, depth + 1)
        elif isinstance(item, str):
            if len(item) > MAX_SETTING_TEXT:
                raise APIError(400, "A design setting is too long.")
        elif isinstance(item, (int, float)) and not isinstance(item, bool):
            if not math.isfinite(item) or abs(item) > 1e8:
                raise APIError(400, "Design measurements must be finite numbers.")
        elif item is not None and not isinstance(item, bool):
            raise APIError(400, "Unsupported design setting.")

    visit(value)
    if len(json_bytes(value)) > MAX_PARAMS:
        raise APIError(400, "Design settings are too large.")
    return value


def parse_library_url(value, resolve=False):
    if not isinstance(value, str) or len(value) > 256:
        raise APIError(400, "Enter the Layer Library address.")
    value = value.strip().rstrip("/")
    if not value:
        return None
    try:
        if any(c.isspace() or ord(c) < 32 for c in value) or "\\" in value:
            raise ValueError()
        parsed = urlsplit(value)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname or
                parsed.username is not None or parsed.password is not None or
                parsed.path or parsed.query or parsed.fragment):
            raise ValueError()
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        raise APIError(400, "Use a local HTTP address such as http://your-nas:8777, without a path.") from None
    host = parsed.hostname
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        if not resolve:
            # DNS is checked again and pinned at connection time.
            if not re.fullmatch(r"[A-Za-z0-9.-]{1,253}", host):
                raise APIError(400, "The Layer Library hostname is invalid.")
            return value
        try:
            addresses = list(dict.fromkeys(info[4][0] for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)))
        except OSError:
            raise APIError(502, "The server cannot resolve this Layer Library address. Try its LAN IP address.") from None
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.version == 6 and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not any(ip.version == network.version and ip in network for network in LOCAL_NETWORKS):
            raise APIError(400, "Use the private LAN or Tailscale address of Layer Library.")
    if resolve:
        return parsed, addresses
    return value


class Store:
    def __init__(self, directory, default_library=DEFAULT_LIBRARY, bed_size=DEFAULT_BED_SIZE):
        self.path = Path(directory).resolve()
        self.path.mkdir(parents=True, exist_ok=True)
        self.db_path = self.path / "form-studio.sqlite3"
        self.export_slots = threading.BoundedSemaphore(2)
        self.bed_size = parse_bed_size(bed_size)
        with self.db() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS designs(
                    id TEXT PRIMARY KEY,name TEXT NOT NULL,params TEXT NOT NULL,
                    created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT
                );
                CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS exports(
                    id TEXT PRIMARY KEY,digest TEXT NOT NULL,state TEXT NOT NULL,
                    response TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS export_recipe_keys(
                    id TEXT PRIMARY KEY,digest TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS export_recipes(
                    id TEXT PRIMARY KEY,name TEXT NOT NULL,params TEXT NOT NULL,
                    created_at TEXT NOT NULL,updated_at TEXT NOT NULL
                );
            """)
            db.execute("INSERT OR IGNORE INTO settings VALUES('layerLibraryUrl',?)", (default_library.rstrip("/"),))
            db.execute("UPDATE exports SET state='uncertain',updated_at=? WHERE state='sending'", (now(),))
            self.purge_expired_recipes(db)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def config(self):
        with self.db() as db:
            url = db.execute("SELECT value FROM settings WHERE key='layerLibraryUrl'").fetchone()[0]
        return {"layerLibraryUrl": url, "layerLibraryConfigured": bool(url), "bedSize": list(self.bed_size), "version": VERSION}

    @staticmethod
    def design(row):
        return {"id": row["id"], "name": row["name"], "params": json.loads(row["params"]),
                "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    def save_design(self, data):
        name, params = clean_name(data.get("name")), validate_params(data.get("params"))
        supplied_id = data.get("id")
        design_id = valid_id(supplied_id) if supplied_id else str(uuid.uuid4())
        stamp = now()
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM designs WHERE id=?", (design_id,)).fetchone()
            if previous and previous["deleted_at"]:
                raise APIError(409, "This design is in the trash. Save a new copy instead.")
            expected = data.get("expectedUpdatedAt")
            if previous and expected and previous["updated_at"] != expected:
                raise APIError(409, "This design was changed on another device. Reload it or save a new copy.")
            if supplied_id and not previous:
                raise APIError(404, "The saved design no longer exists. Save a new copy.")
            if previous:
                db.execute("UPDATE designs SET name=?,params=?,updated_at=? WHERE id=?",
                           (name, json_bytes(params).decode(), stamp, design_id))
            else:
                db.execute("INSERT INTO designs VALUES(?,?,?,?,?,NULL)",
                           (design_id, name, json_bytes(params).decode(), stamp, stamp))
            result = db.execute("SELECT * FROM designs WHERE id=?", (design_id,)).fetchone()
        return self.design(result)

    @staticmethod
    def purge_expired_recipes(db):
        cutoff = (datetime.now(timezone.utc) - timedelta(days=STAGED_RECIPE_DAYS)).isoformat(timespec="microseconds")
        db.execute("""DELETE FROM export_recipes WHERE updated_at < ? AND NOT EXISTS
                      (SELECT 1 FROM exports WHERE exports.id=export_recipes.id AND state='sending')""", (cutoff,))

    @staticmethod
    def check_recipe_key(db, request_id, digest):
        key = db.execute("SELECT digest FROM export_recipe_keys WHERE id=?", (request_id,)).fetchone()
        if key and key["digest"] != digest:
            raise APIError(409, "This request ID already belongs to different design settings. Keep the original recipe when retrying.")
        return key

    def stage_recipe(self, data):
        request_id = valid_id(data.get("requestId"))
        name, params = clean_name(data.get("name")), validate_params(data.get("params"))
        digest, stamp = recipe_digest(name, params), now()
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            key = self.check_recipe_key(db, request_id, digest)
            if not key and db.execute("SELECT 1 FROM exports WHERE id=?", (request_id,)).fetchone():
                # v1.0 receipts hash the STL and metadata together. Their metadata
                # cannot be authenticated independently; preserve that receipt.
                raise APIError(409, "This request ID belongs to an earlier transfer. Check Layer Library before starting another export.")
            self.purge_expired_recipes(db)
            previous = db.execute("SELECT 1 FROM export_recipes WHERE id=?", (request_id,)).fetchone()
            if not previous and db.execute("SELECT COUNT(*) FROM export_recipes").fetchone()[0] >= MAX_STAGED_RECIPES:
                # Retain in-flight, unsubmitted and uncertain transfers. Completed
                # bodies can be restaged against their immutable identity hash.
                db.execute("""DELETE FROM export_recipes WHERE id IN (
                    SELECT export_recipes.id FROM export_recipes JOIN exports USING(id)
                    WHERE exports.state IN ('complete','rejected') ORDER BY export_recipes.updated_at LIMIT 1
                )""")
                if db.execute("SELECT COUNT(*) FROM export_recipes").fetchone()[0] >= MAX_STAGED_RECIPES:
                    raise APIError(429, "Too many recipes are waiting to export. Finish an existing transfer before starting another.")
            db.execute("INSERT OR IGNORE INTO export_recipe_keys VALUES(?,?)", (request_id, digest))
            # Canonical ordering also gives an expired/restaged recipe the same
            # export fingerprint when a client serializes its keys differently.
            db.execute("""INSERT INTO export_recipes VALUES(?,?,?,?,?)
                          ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at""",
                       (request_id, name, json_bytes(params, sort_keys=True).decode(), stamp, stamp))
        return {"ok": True, "requestId": request_id}

    def staged_recipe(self, request_id):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            self.purge_expired_recipes(db)
            row = db.execute("SELECT name,params FROM export_recipes WHERE id=?", (request_id,)).fetchone()
            if row:
                db.execute("UPDATE export_recipes SET updated_at=? WHERE id=?", (now(), request_id))
        if not row:
            raise APIError(410, "This staged recipe is unavailable or expired. Stage the same recipe with the same request ID before uploading.", requestId=request_id)
        return row["name"], json.loads(row["params"])

    def export_receipt(self, request_id, digest):
        with self.db() as db:
            row = db.execute("SELECT * FROM exports WHERE id=?", (request_id,)).fetchone()
        if not row:
            return None
        if row["digest"] != digest:
            raise APIError(409, "This request ID already belongs to a different model.")
        if row["response"]:
            response = json.loads(row["response"])
            status = response.pop("_status", 200)
            if status >= 400:
                raise APIError(status, response.pop("error"), **response)
            return response
        raise APIError(409, "This transfer is still running or its outcome is uncertain. Check Layer Library before sending a new copy.",
                       uncertain=True, requestId=request_id)

    def start_export(self, request_id, digest, metadata_digest):
        try:
            with self.db() as db:
                db.execute("BEGIN IMMEDIATE")
                self.check_recipe_key(db, request_id, metadata_digest)
                db.execute("INSERT OR IGNORE INTO export_recipe_keys VALUES(?,?)", (request_id, metadata_digest))
                db.execute("INSERT INTO exports VALUES(?,?,'sending',NULL,?,?)", (request_id, digest, now(), now()))
        except sqlite3.IntegrityError:
            return self.export_receipt(request_id, digest)
        return None

    def finish_export(self, request_id, state, response, status=200):
        with self.db() as db:
            db.execute("UPDATE exports SET state=?,response=?,updated_at=? WHERE id=?",
                       (state, json_bytes(dict(response, _status=status)).decode(), now(), request_id))


class LocalHTTP:
    """Small HTTP client: private addresses only, DNS pinned, no redirects/proxy."""
    def __init__(self, base):
        self.base = base
        self.cookie = ""
        self.csrf = ""

    def request(self, method, path, body=None, headers=None, timeout=12):
        parsed, addresses = parse_library_url(self.base, resolve=True)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        connection = http.client.HTTPConnection(parsed.hostname, port, timeout=timeout)
        sock = socket.create_connection((addresses[0], port), timeout=timeout)
        if parsed.scheme == "https":
            try:
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=parsed.hostname)
            except Exception:
                sock.close()
                raise
        connection.sock = sock
        request_headers = {"Host": parsed.netloc, "Accept": "application/json", "Origin": self.base,
                           "User-Agent": "Form-Studio/" + VERSION, "Connection": "close"}
        if self.cookie:
            request_headers["Cookie"] = self.cookie
        if self.csrf:
            request_headers["X-CSRF-Token"] = self.csrf
        request_headers.update(headers or {})
        try:
            connection.request(method, path, body=body, headers=request_headers)
            response = connection.getresponse()
            raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise APIError(502, "Layer Library returned an unexpectedly large response.")
            if 300 <= response.status < 400:
                raise APIError(502, "Layer Library redirected the request. Use its direct LAN address.")
            for key, value in response.getheaders():
                if key.lower() == "set-cookie":
                    jar = cookies.SimpleCookie()
                    jar.load(value)
                    if "layer_library_session" in jar:
                        self.cookie = "layer_library_session=" + jar["layer_library_session"].value
            try:
                data = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                raise APIError(502, "The address did not return a valid Layer Library API response.") from None
            if response.status >= 400:
                detail = data.get("detail", data.get("error", "Request rejected")) if isinstance(data, dict) else "Request rejected"
                raise APIError(502, "Layer Library: " + str(detail)[:300])
            return data
        finally:
            connection.close()

    def prepare(self):
        result = self.request("GET", "/api/session")
        if (not isinstance(result, dict) or result.get("app_name") != "Layer Library" or
                result.get("authenticated") is not True or result.get("login_required") is not False or
                result.get("access_mode") != "trusted_lan" or not self.cookie):
            raise APIError(502, "This address is not the supported open-access Layer Library. Check its URL and update status.")
        token = result.get("csrf_token")
        if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{20,128}", token):
            raise APIError(502, "Layer Library did not provide a valid upload session.")
        self.csrf = token
        return result


def validate_stl(data):
    if len(data) < 84:
        raise APIError(400, "The STL is incomplete.")
    count = struct.unpack_from("<I", data, 80)[0]
    if count < 4 or 84 + 50 * count != len(data):
        raise APIError(400, "Export a complete binary STL from Form Studio.")
    # Validate coordinates without making another large copy of the mesh.
    for offset in range(84, len(data), 50):
        values = struct.unpack_from("<12f", data, offset)
        if not all(math.isfinite(v) and abs(v) <= 100000 for v in values):
            raise APIError(400, "The STL contains invalid coordinates.")
    return count


def forward_model(store, data, name, params, request_id):
    validate_stl(data)
    metadata_digest = recipe_digest(name, params)
    with store.db() as db:
        store.check_recipe_key(db, request_id, metadata_digest)
    hasher = hashlib.sha256(data)
    hasher.update(json_bytes({"name": name, "params": params}))
    digest = hasher.hexdigest()
    previous = store.export_receipt(request_id, digest)
    if previous:
        return previous
    base = store.config()["layerLibraryUrl"]
    if not base:
        raise APIError(400, "Set your Layer Library URL in settings first.")
    if not store.export_slots.acquire(blocking=False):
        raise APIError(429, "Two exports are already running. Wait a moment and try again.")
    try:
        client = LocalHTTP(base)
        try:
            client.prepare()
        except APIError:
            raise
        except (OSError, http.client.HTTPException) as exc:
            LOG.info("Layer Library preflight failed: %s", type(exc).__name__)
            raise APIError(502, "Cannot reach Layer Library. Check the URL and that the app is running.") from None
        existing_ids = None
        try:
            catalog = client.request("GET", "/api/library")
            if isinstance(catalog, dict) and isinstance(catalog.get("items"), list):
                existing_ids = {item["id"] for item in catalog["items"] if isinstance(item, dict) and isinstance(item.get("id"), str)}
        except (APIError, OSError, http.client.HTTPException):
            # Export still works. Without a reliable snapshot, no existing
            # model's descriptive metadata will be changed.
            pass
        previous = store.start_export(request_id, digest, metadata_digest)
        if previous:
            return previous
        slug = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-")[:70] or "form-studio-design"
        if slug.lower().endswith(".stl"):
            slug = slug[:-4]
        filename = slug + "--fs-" + uuid.UUID(request_id).hex + ".stl"
        boundary = "formstudio" + uuid.uuid4().hex
        start = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"collection\"\r\n\r\nForm Studio\r\n"
                 f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{filename}\"\r\n"
                 "Content-Type: application/octet-stream\r\n\r\n").encode()
        end = f"\r\n--{boundary}--\r\n".encode()
        try:
            result = client.request("POST", "/api/models/upload", (start, data, end),
                                    {"Content-Type": "multipart/form-data; boundary=" + boundary,
                                     "Content-Length": str(len(start) + len(data) + len(end))}, timeout=120)
            if not isinstance(result, dict) or not isinstance(result.get("items"), list) or len(result["items"]) != 1:
                if isinstance(result, dict) and not result.get("items") and result.get("errors"):
                    message = "Layer Library rejected the model: " + str(result["errors"][0].get("message", "Upload failed"))[:300]
                    store.finish_export(request_id, "rejected", {"error": message, "requestId": request_id}, 422)
                    raise APIError(422, message, requestId=request_id)
                raise ValueError("Missing upload receipt")
            item = result["items"][0]
            model_id = item.get("id") if isinstance(item, dict) else None
            if not isinstance(model_id, str) or not re.fullmatch(r"[a-f0-9-]{16,40}", model_id):
                raise ValueError("Invalid upload receipt")
        except APIError as exc:
            if exc.status == 422:
                raise
            message = "The upload result is uncertain. Check the Form Studio collection in Layer Library before sending again."
            store.finish_export(request_id, "uncertain", {"error": message, "uncertain": True, "requestId": request_id}, 502)
            raise APIError(502, message, uncertain=True, requestId=request_id) from None
        except (ValueError, OSError, http.client.HTTPException):
            message = "The connection ended before the upload was confirmed. Check Layer Library before sending again."
            store.finish_export(request_id, "uncertain", {"error": message, "uncertain": True, "requestId": request_id}, 502)
            raise APIError(502, message, uncertain=True, requestId=request_id) from None
        # Layer Library deduplicates by STL hash, including concurrent uploads.
        # A returned ID alone does not establish ownership of the model. Both
        # the pre-upload snapshot and this request's unique filename must match
        # a fresh, unedited record before we attach our title and recipe notes.
        reused = (existing_ids is not None and model_id in existing_ids) or item.get("filename") != filename
        created_here = (existing_ids is not None and model_id not in existing_ids and
                        item.get("filename") == filename and item.get("collection") == "Form Studio" and
                        not item.get("notes") and not item.get("tags"))
        collection = item.get("collection", "")
        if reused:
            message = "This exact model is already in Layer Library. Its name, collection and notes were preserved."
        elif collection == "Form Studio":
            message = "Saved to the Form Studio collection in Layer Library."
        else:
            message = "Saved to Layer Library."
        notes = "Created with Form Studio. Dimensions are in millimetres.\n\n"
        recipe = json.dumps({"application": "Form Studio", "schemaVersion": 1,
                             "params": {**params, "name": name}}, ensure_ascii=False, indent=2)
        recipe_fits = len(notes + recipe) <= LIBRARY_NOTES_LIMIT
        response = {"ok": True, "url": base + "/", "modelId": model_id, "requestId": request_id,
                    "message": message, "reused": reused, "collection": collection, "recipeIncluded": False}
        if not recipe_fits:
            response["warning"] = ("The STL was saved. Its full editable recipe exceeds Layer Library's 10,000-character notes limit. "
                                   "Save the design in Form Studio or download its recipe JSON to keep all image maps and painted masks.")
        # Record success before the optional metadata update: failure must never
        # trigger a second upload or turn a successful model transfer into failure.
        store.finish_export(request_id, "complete", response)
        if not created_here:
            if not reused:
                response["warning"] = (response.get("warning", "") + " " +
                                       "Descriptive notes were left unchanged because the existing library could not be checked.").strip()
                store.finish_export(request_id, "complete", response)
            return response
        if recipe_fits:
            notes += recipe
        else:
            notes += ("The complete editable recipe exceeds this library's notes limit. "
                      "Save the design in Form Studio or download its recipe JSON to keep all settings, image maps and painted masks.")
        try:
            client.request("PUT", "/api/models/" + model_id,
                           json_bytes({"title": name, "collection": "Form Studio", "tags": ["form-studio"], "notes": notes}),
                           {"Content-Type": "application/json"})
            response["recipeIncluded"] = recipe_fits
        except (APIError, OSError, http.client.HTTPException):
            response["warning"] = (response.get("warning", "") + " " +
                                   "The STL was saved, but its descriptive notes could not be updated.").strip()
        store.finish_export(request_id, "complete", response)
        return response
    finally:
        store.export_slots.release()


class FormServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 32

    def __init__(self, address, store, static):
        self.store, self.static = store, Path(static).resolve()
        self.slots = threading.BoundedSemaphore(24)
        self.upload_slots = threading.BoundedSemaphore(2)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "FormStudio/" + VERSION
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(45)

    def log_message(self, fmt, *args):
        LOG.info("%s %s", self.client_address[0], fmt % args)

    def send(self, status, payload, content_type="application/json; charset=utf-8"):
        if not isinstance(payload, bytes):
            payload = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def mutation_check(self):
        if self.headers.get("X-Form-Studio") != "1":
            raise APIError(403, "Refresh Form Studio before trying again.")
        if self.headers.get("Sec-Fetch-Site", "").lower() not in ("", "same-origin", "none"):
            raise APIError(403, "Cross-site requests are not allowed.")
        origin = self.headers.get("Origin")
        if origin:
            parsed = urlsplit(origin)
            if (parsed.scheme not in ("http", "https") or parsed.netloc.lower() != self.headers.get("Host", "").lower() or
                    parsed.path or parsed.query or parsed.fragment or parsed.username is not None):
                raise APIError(403, "Cross-site requests are not allowed.")

    def body(self, limit):
        if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) != 1:
            raise APIError(400, "Send the complete request with a Content-Length header.")
        try:
            length = int(self.headers["Content-Length"])
        except ValueError:
            raise APIError(400, "Invalid request length.") from None
        if length < 0 or length > limit:
            raise APIError(413, "The request is too large.")
        data = self.rfile.read(length)
        if len(data) != length:
            raise APIError(400, "The request was interrupted before it finished.")
        return data

    def json_body(self):
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            raise APIError(415, "Send design settings as JSON.")
        try:
            data = json.loads(self.body(MAX_JSON), parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))
        except (ValueError, UnicodeDecodeError):
            raise APIError(400, "The JSON settings are invalid.") from None
        if not isinstance(data, dict):
            raise APIError(400, "Expected a JSON object.")
        return data

    def handle_api(self):
        route = urlsplit(self.path).path
        store = self.server.store
        method = "GET" if self.command == "HEAD" else self.command
        if method not in ("GET", "OPTIONS"):
            self.mutation_check()
        if method == "GET" and route == "/api/health":
            return self.send(200, {"ok": True, "version": VERSION, "service": "form-studio", "bundle": os.environ.get("FORM_STUDIO_BUNDLE", "development")})
        if route == "/api/config":
            if method == "GET":
                return self.send(200, store.config())
            if method == "PUT":
                data = self.json_body()
                value = parse_library_url(data.get("layerLibraryUrl")) or ""
                if value:
                    parse_library_url(value, resolve=True)
                with store.db() as db:
                    db.execute("UPDATE settings SET value=? WHERE key='layerLibraryUrl'", (value,))
                return self.send(200, store.config())
        if route == "/api/designs":
            if method == "GET":
                with store.db() as db:
                    rows = db.execute("SELECT * FROM designs WHERE deleted_at IS NULL ORDER BY updated_at DESC").fetchall()
                return self.send(200, {"designs": [store.design(row) for row in rows]})
            if method == "POST":
                return self.send(200, {"design": store.save_design(self.json_body())})
        match = re.fullmatch(r"/api/designs/([^/]+)(/restore)?", route)
        if match:
            design_id = valid_id(match[1])
            with store.db() as db:
                row = db.execute("SELECT * FROM designs WHERE id=?", (design_id,)).fetchone()
                if not row or (row["deleted_at"] and not match[2]):
                    raise APIError(404, "Design not found.")
                if method == "GET" and not match[2]:
                    return self.send(200, {"design": store.design(row)})
                if method == "DELETE" and not match[2]:
                    db.execute("UPDATE designs SET deleted_at=?,updated_at=? WHERE id=?", (now(), now(), design_id))
                    return self.send(200, {"ok": True})
                if method == "POST" and match[2]:
                    db.execute("UPDATE designs SET deleted_at=NULL,updated_at=? WHERE id=?", (now(), design_id))
                    return self.send(200, {"ok": True})
        if method == "GET" and route == "/api/trash":
            with store.db() as db:
                rows = db.execute("SELECT * FROM designs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").fetchall()
            return self.send(200, {"designs": [store.design(row) for row in rows]})
        if method == "POST" and route == "/api/layer-library/test":
            # The small request body is optional; always consume it for keepalive.
            if self.headers.get("Content-Length"):
                self.body(MAX_JSON)
            base = store.config()["layerLibraryUrl"]
            if not base:
                raise APIError(400, "Set the Layer Library URL first.")
            try:
                session = LocalHTTP(base).prepare()
            except APIError:
                raise
            except (OSError, http.client.HTTPException):
                raise APIError(502, "Cannot reach Layer Library. Check the URL and that the app is running.") from None
            return self.send(200, {"ok": True, "message": "Connected to Layer Library " + str(session.get("version", "")), "url": base + "/"})
        if method == "POST" and route == "/api/layer-library/recipe":
            return self.send(200, store.stage_recipe(self.json_body()))
        if method == "POST" and route == "/api/layer-library":
            if self.headers.get("Content-Type", "").split(";")[0] not in ("application/octet-stream", "model/stl"):
                raise APIError(415, "Send a binary STL file.")
            request_id = valid_id(self.headers.get("X-Request-ID"))
            staged_id = self.headers.get("X-Recipe-ID")
            raw_params = self.headers.get("X-Design-Params")
            if staged_id:
                if valid_id(staged_id) != request_id:
                    raise APIError(400, "The staged recipe ID must match the upload request ID.")
                if raw_params:
                    raise APIError(400, "Use the staged recipe or the legacy recipe header, not both.")
                name, params = store.staged_recipe(request_id)
            else:
                name = clean_name(unquote(self.headers.get("X-Model-Name", "Form Studio design")))
                if raw_params:
                    if len(raw_params) > 24000:
                        raise APIError(400, "The recipe header is too large. Stage the recipe before uploading.")
                    try:
                        params = validate_params(json.loads(unquote(raw_params)))
                    except (ValueError, UnicodeDecodeError):
                        raise APIError(400, "The design recipe is invalid.") from None
                else:
                    params = {"name": name}
            if not self.server.upload_slots.acquire(blocking=False):
                raise APIError(429, "Two exports are already running. Wait a moment and try again.")
            try:
                return self.send(200, forward_model(store, self.body(MAX_STL), name, params, request_id))
            finally:
                self.server.upload_slots.release()
        raise APIError(404 if method != "OPTIONS" else 405, "This endpoint is not available.")

    def dispatch(self):
        try:
            if urlsplit(self.path).path.startswith("/api/"):
                return self.handle_api()
            if self.command not in ("GET", "HEAD"):
                raise APIError(405, "Method not allowed.")
            path = unquote(urlsplit(self.path).path)
            if path == "/":
                path = "/index.html"
            target = (self.server.static / path.lstrip("/")).resolve()
            if not target.is_relative_to(self.server.static) or not target.is_file() or any(p.startswith(".") for p in Path(path).parts):
                raise APIError(404, "File not found.")
            mime = {".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8"}.get(target.suffix)
            mime = mime or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            return self.send(200, target.read_bytes(), mime)
        except APIError as exc:
            self.close_connection = True
            self.send(exc.status, {"error": exc.message, **exc.extra})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except (ValueError, OSError, sqlite3.Error):
            self.close_connection = True
            LOG.exception("Request failed")
            self.send(500, {"error": "The server could not complete this request. Check its data folder and app logs."})

    do_GET = dispatch
    do_HEAD = dispatch
    do_POST = dispatch
    do_PUT = dispatch
    do_DELETE = dispatch
    do_OPTIONS = dispatch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("FORM_STUDIO_HOST", os.environ.get("HOST", "0.0.0.0")))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    parser.add_argument("--data", default=os.environ.get("FORM_STUDIO_DATA", os.environ.get("DATA_DIR", str(Path(__file__).parent / "data"))))
    parser.add_argument("--static", default=str(Path(__file__).parent / "static"))
    parser.add_argument("--bed-size", type=parse_bed_size, default=os.environ.get("FORM_STUDIO_BED_SIZE", "256,256,256"),
                        help="Printer build volume in millimetres, in X,Y,Z order (default: 256,256,256)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    store = Store(args.data, os.environ.get("LAYER_LIBRARY_URL", DEFAULT_LIBRARY), args.bed_size)
    server = FormServer((args.host, args.port), store, args.static)
    LOG.info("Form Studio %s listening on %s:%s", VERSION, args.host, args.port)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
