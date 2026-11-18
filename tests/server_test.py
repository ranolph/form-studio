"""Focused integration tests for persistence, exports and request boundaries."""
from pathlib import Path
import base64
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import re
import socket
import struct
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import quote
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server


def tetrahedron():
    result = bytearray(80) + bytearray(struct.pack("<I", 4))
    points = ((0., 0., 0.), (10., 0., 0.), (0., 10., 0.), (0., 0., 10.))
    for face in ((0, 2, 1), (0, 1, 3), (0, 3, 2), (1, 2, 3)):
        result += struct.pack("<12fH", 0., 0., 1., *(v for i in face for v in points[i]), 0)
    return bytes(result)


class FakeLayerHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def output(self, code, data, cookie=False):
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        if cookie:
            self.send_header("Set-Cookie", "layer_library_session=" + "s" * 43 + "; HttpOnly; SameSite=Strict")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/api/library":
            return self.output(200, {"items": [self.server.existing_item] if self.server.existing_item else []})
        self.output(200, {"app_name": "Layer Library", "authenticated": True, "login_required": False,
                          "access_mode": "trusted_lan", "csrf_token": "c" * 43, "version": "1.0.5"}, True)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers["Content-Length"]))
        self.server.upload_count += 1
        self.server.received = raw
        self.server.headers_received = dict(self.headers)
        if self.server.mode == "drop":
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        if self.server.mode == "reject":
            return self.output(200, {"items": [], "errors": [{"message": "Invalid mesh"}]})
        filename = re.search(rb'filename="([^"]+)"', raw).group(1).decode()
        item = self.server.existing_item or {"id": "a" * 32, "filename": filename, "collection": "Form Studio", "notes": "", "tags": []}
        return self.output(200, {"items": [item], "errors": []})

    def do_PUT(self):
        self.server.metadata = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.output(200, {"id": "a" * 32})


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.static = Path(self.temp.name) / "static"
        self.static.mkdir()
        (self.static / "index.html").write_text("<h1>Test</h1>")
        (Path(self.temp.name) / "private.txt").write_text("should not escape")
        self.layer = ThreadingHTTPServer(("127.0.0.1", 0), FakeLayerHandler)
        self.layer.upload_count, self.layer.mode = 0, "ok"
        self.layer.existing_item, self.layer.metadata = None, None
        self.layer_thread = threading.Thread(target=self.layer.serve_forever, daemon=True)
        self.layer_thread.start()
        self.store = server.Store(Path(self.temp.name) / "data", f"http://127.0.0.1:{self.layer.server_port}")
        self.app = server.FormServer(("127.0.0.1", 0), self.store, self.static)
        self.thread = threading.Thread(target=self.app.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        for app in (self.app, self.layer):
            app.shutdown()
            app.server_close()
        self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.app.server_port, timeout=5)
        sent = {"X-Form-Studio": "1"}
        if isinstance(payload, dict):
            sent["Content-Type"] = "application/json"
            payload = json.dumps(payload).encode()
        sent.update(headers or {})
        connection.request(method, path, body=payload, headers=sent)
        response = connection.getresponse()
        raw = response.read()
        result = json.loads(raw) if response.getheader("Content-Type", "").startswith("application/json") else raw
        connection.close()
        return response.status, result

    def export(self, request_id=None):
        return self.request("POST", "/api/layer-library", tetrahedron(), {
            "Content-Type": "application/octet-stream", "X-Request-ID": request_id or str(uuid.uuid4()),
            "X-Model-Name": quote("My pot"), "X-Design-Params": quote(json.dumps({"height": 100, "diameter": 80})),
        })

    def stage(self, request_id, params, name="Image pot", headers=None):
        return self.request("POST", "/api/layer-library/recipe", {
            "requestId": request_id, "name": name, "params": params,
        }, headers)

    def export_staged(self, request_id, **headers):
        return self.request("POST", "/api/layer-library", tetrahedron(), {
            "Content-Type": "application/octet-stream", "X-Request-ID": request_id,
            "X-Recipe-ID": request_id, **headers,
        })

    @staticmethod
    def large_recipe():
        mask = base64.b64encode(bytes(range(256)) * 16).decode()
        image = base64.b64encode(bytes(range(256)) * 64).decode()
        return {"height": 160, "effects": [
            {"id": str(uuid.uuid4()), "type": "image", "mask": {"width": 64, "height": 64, "data": mask},
             "image": {"width": 128, "height": 128, "data": image}, "depthTop": depth}
            for depth in (1, 2, 3)
        ]}

    def test_save_update_conflict_soft_delete(self):
        code, body = self.request("POST", "/api/designs", {"name": "Pot", "params": {"height": 100}})
        self.assertEqual(code, 200)
        design = body["design"]
        code, body = self.request("POST", "/api/designs", {"id": design["id"], "name": "Pot v2", "params": {"height": 110}, "expectedUpdatedAt": design["updatedAt"]})
        self.assertEqual(code, 200)
        code, _ = self.request("POST", "/api/designs", {"id": design["id"], "name": "Old client", "params": {"height": 99}, "expectedUpdatedAt": design["updatedAt"]})
        self.assertEqual(code, 409)
        code, _ = self.request("DELETE", "/api/designs/" + design["id"])
        self.assertEqual(code, 200)
        self.assertEqual(self.request("GET", "/api/designs")[1]["designs"], [])
        self.assertEqual(len(self.request("GET", "/api/trash")[1]["designs"]), 1)
        self.assertEqual(self.request("POST", "/api/designs/" + design["id"] + "/restore")[0], 200)
        restarted = server.Store(self.store.path)
        self.assertEqual(restarted.config()["layerLibraryUrl"], self.store.config()["layerLibraryUrl"])

    def test_export_cookie_csrf_multipart_metadata_idempotence(self):
        request_id = str(uuid.uuid4())
        code, body = self.export(request_id)
        self.assertEqual(code, 200, body)
        self.assertTrue(body["ok"])
        self.assertEqual(self.layer.upload_count, 1)
        self.assertIn(b'name="files"; filename="My-pot--fs-', self.layer.received)
        self.assertIn(b'Form Studio\r\n', self.layer.received)
        self.assertEqual(self.layer.headers_received["X-CSRF-Token"], "c" * 43)
        self.assertIn("layer_library_session=", self.layer.headers_received["Cookie"])
        self.assertEqual(self.layer.metadata["title"], "My pot")
        self.assertIn('"height": 100', self.layer.metadata["notes"])
        self.assertTrue(body["recipeIncluded"])
        self.assertEqual(self.export(request_id)[0], 200)
        self.assertEqual(self.layer.upload_count, 1)

    def test_deduplicated_existing_model_keeps_user_metadata(self):
        previous = {"id": "a" * 32, "filename": "my-special-pot.stl", "title": "Original custom title",
                    "collection": "Favourites", "notes": "Keep my printing notes", "tags": ["personal"]}
        self.layer.existing_item = previous.copy()
        code, body = self.export()
        self.assertEqual(code, 200, body)
        self.assertTrue(body["reused"])
        self.assertEqual(body["collection"], "Favourites")
        self.assertIsNone(self.layer.metadata)
        self.assertEqual(self.layer.existing_item, previous)

    def test_concurrent_dedup_marker_blocks_metadata_overwrite(self):
        # Another client can create an identical STL after our ID snapshot.
        original = FakeLayerHandler.do_GET
        def changed_catalog(handler):
            if handler.path == "/api/library":
                return handler.output(200, {"items": []})
            return original(handler)
        self.layer.existing_item = {"id": "a" * 32, "filename": "another-request.stl", "collection": "Form Studio", "notes": "", "tags": []}
        with patch.object(FakeLayerHandler, "do_GET", changed_catalog):
            code, body = self.export()
        self.assertEqual(code, 200)
        self.assertTrue(body["reused"])
        self.assertIsNone(self.layer.metadata)

    def test_uncertain_response_never_reuploads(self):
        self.layer.mode = "drop"
        request_id = str(uuid.uuid4())
        code, body = self.export(request_id)
        self.assertEqual(code, 502)
        self.assertTrue(body["uncertain"])
        self.layer.mode = "ok"
        self.assertEqual(self.export(request_id)[0], 502)
        self.assertEqual(self.layer.upload_count, 1)

    def test_http200_rejection_is_not_success(self):
        self.layer.mode = "reject"
        code, body = self.export()
        self.assertEqual(code, 422)
        self.assertIn("Invalid mesh", body["error"])

    def test_cross_origin_public_proxy_and_path_traversal_rejected(self):
        self.assertEqual(self.request("POST", "/api/designs", {"name": "x", "params": {"height": 1}}, {"Origin": "http://evil.example"})[0], 403)
        self.assertEqual(self.request("PUT", "/api/config", {"layerLibraryUrl": "http://8.8.8.8:8777"})[0], 400)
        self.assertEqual(self.request("PUT", "/api/config", {"layerLibraryUrl": "http://169.254.169.254"})[0], 400)
        self.assertEqual(self.request("GET", "/%2e%2e/private.txt")[0], 404)
        self.assertEqual(self.request("GET", "/api/health")[1]["service"], "form-studio")

    def test_stl_and_recipe_validation(self):
        self.assertEqual(server.validate_stl(tetrahedron()), 4)
        for data in (b"solid fake", tetrahedron()[:-1]):
            with self.assertRaises(server.APIError):
                server.validate_stl(data)
        invalid = bytearray(tetrahedron())
        struct.pack_into("<f", invalid, 100, float("nan"))
        with self.assertRaises(server.APIError):
            server.validate_stl(invalid)
        with self.assertRaises(server.APIError):
            server.validate_params({"height": float("inf")})

    def test_large_recipe_save_stage_restart_and_export_are_complete(self):
        params = self.large_recipe()
        self.assertGreater(len(server.json_bytes(params)), 64 * 1024)
        request_id = str(uuid.uuid4())
        self.assertEqual(self.stage(request_id, params), (200, {"ok": True, "requestId": request_id}))
        code, saved = self.request("POST", "/api/designs", {"name": "Image pot", "params": params})
        self.assertEqual(code, 200, saved)
        self.store = server.Store(self.store.path)
        self.app.store = self.store
        self.assertEqual(self.store.staged_recipe(request_id), ("Image pot", params))
        code, loaded = self.request("GET", "/api/designs/" + saved["design"]["id"])
        self.assertEqual(code, 200)
        self.assertEqual(loaded["design"]["params"], params)
        code, result = self.export_staged(request_id)
        self.assertEqual(code, 200, result)
        self.assertTrue(result["ok"])
        self.assertFalse(result["recipeIncluded"])
        self.assertIn("10,000-character", result["warning"])
        self.assertIn("recipe JSON", result["warning"])
        self.assertEqual(self.layer.metadata["title"], "Image pot")
        self.assertLessEqual(len(self.layer.metadata["notes"]), server.LIBRARY_NOTES_LIMIT)
        self.assertNotIn('"params"', self.layer.metadata["notes"])
        # Repeating both phases never sends the STL twice, even after a restart.
        self.assertEqual(self.stage(request_id, params)[0], 200)
        self.assertEqual(self.export_staged(request_id), (200, result))
        self.assertEqual(self.layer.upload_count, 1)
        self.assertEqual(self.store.staged_recipe(request_id)[1], params)

    def test_recipe_identity_conflicts_and_binding_to_upload(self):
        request_id = str(uuid.uuid4())
        params = {"height": 120, "diameter": 80}
        self.assertEqual(self.stage(request_id, params)[0], 200)
        self.assertEqual(self.stage(request_id, {"diameter": 80, "height": 120})[0], 200)
        self.assertEqual(self.stage(request_id, params, name="Changed title")[0], 409)
        self.assertEqual(self.stage(request_id, {"height": 121, "diameter": 80})[0], 409)
        self.assertEqual(self.export_staged(request_id, **{"X-Recipe-ID": str(uuid.uuid4())})[0], 400)
        self.assertEqual(self.export_staged(request_id, **{"X-Design-Params": quote(json.dumps(params))})[0], 400)
        self.assertEqual(self.export_staged(str(uuid.uuid4()))[0], 410)
        self.assertEqual(self.export(request_id)[0], 409)
        self.assertEqual(self.layer.upload_count, 0)
        self.assertEqual(self.export_staged(request_id)[0], 200)
        self.assertEqual(self.layer.upload_count, 1)

    def test_recipe_staging_request_boundaries(self):
        request_id = str(uuid.uuid4())
        params = {"height": 100}
        self.assertEqual(self.stage(request_id, params, headers={"Origin": "http://evil.example"})[0], 403)
        self.assertEqual(self.stage(request_id, params, headers={"X-Form-Studio": "0"})[0], 403)
        self.assertEqual(self.stage(request_id, params, headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.stage(request_id, {"image": "x" * (server.MAX_SETTING_TEXT + 1)})[0], 400)
        oversized = {"requestId": request_id, "name": "Large", "params": {"image": "x" * server.MAX_JSON}}
        self.assertEqual(self.request("POST", "/api/layer-library/recipe", oversized)[0], 413)
        self.assertEqual(self.layer.upload_count, 0)

    def test_staged_recipe_retention_count_and_legacy_schema_compatibility(self):
        first, second, third = (str(uuid.uuid4()) for _ in range(3))
        params = {"height": 100, "diameter": 80}
        with patch.object(server, "MAX_STAGED_RECIPES", 2):
            self.assertEqual(self.stage(first, params)[0], 200)
            self.assertEqual(self.stage(second, params)[0], 200)
            self.assertEqual(self.stage(third, params)[0], 429)
            self.assertEqual(self.export_staged(first)[0], 200)
            self.assertEqual(self.stage(third, params)[0], 200)
            with self.assertRaises(server.APIError) as error:
                self.store.staged_recipe(first)
            self.assertEqual(error.exception.status, 410)
            # Evicting a completed large body does not release its ID binding.
            self.assertEqual(self.stage(first, {"height": 101})[0], 409)
            with self.store.db() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM export_recipes").fetchone()[0], 2)
                db.execute("UPDATE export_recipes SET updated_at='2000-01-01T00:00:00+00:00' WHERE id=?", (second,))
            self.assertEqual(self.stage(first, {"diameter": 80, "height": 100})[0], 200)
            self.assertEqual(self.export_staged(first)[0], 200)
            self.assertEqual(self.layer.upload_count, 1)
        # The previous release inserts six values without a column list. New
        # tables keep that operation valid during a deployment rollback.
        legacy_id = str(uuid.uuid4())
        with self.store.db() as db:
            db.execute("INSERT INTO exports VALUES(?,?,'uncertain',NULL,?,?)", (legacy_id, "legacy", server.now(), server.now()))
        self.assertEqual(self.stage(legacy_id, params)[0], 409)


if __name__ == "__main__":
    unittest.main(verbosity=2)
