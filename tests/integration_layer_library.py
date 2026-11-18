#!/usr/bin/env python3
"""Optional end-to-end check against a sibling Layer Library source checkout.

Run with a Python environment containing Layer Library's runtime requirements:
    python tests/integration_layer_library.py --layer-source ../layer-library

Node.js generates two synthetic STL fixtures from this checkout's geometry.js.
Both HTTP servers use ephemeral loopback ports. Databases, imported models,
generated fixtures and import-time bootstrap data are removed when the test ends.
No running installation, printer, external service or personal model is used.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import importlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import ProxyHandler, Request, build_opener
import uuid


ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
HTTP = build_opener(ProxyHandler({}))

GENERATOR = r"""
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [source, output] = process.argv.slice(1);
const {PRESETS, EFFECT_DEFAULTS, normalizeParams, generateMesh, encodeSTL} =
  await import(pathToFileURL(source).href);
const regular = normalizeParams({...structuredClone(PRESETS.find(p=>p.id==='spiral-planter').params),
  name:'Integration spiral planter'});
function raster(size, mask=false) {
  const bytes=Buffer.alloc(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size, v=y/size;
    const value=mask ? .55+.4*Math.cos((u-.5)*Math.PI)*Math.sin(v*Math.PI)
      : .5+.22*Math.sin(u*Math.PI*8)+.18*Math.cos(v*Math.PI*6);
    bytes[y*size+x]=Math.round(255*Math.max(0,Math.min(1,value)));
  }
  return {width:size,height:size,data:bytes.toString('base64'),
    ...(mask?{invert:false}:{name:'Synthetic contour'})};
}
const painted = normalizeParams({...structuredClone(PRESETS.find(p=>p.id==='image-contour-cup').params),
  name:'Integration painted image cup',height:123,diameter:103,
  effects:[{...EFFECT_DEFAULTS,id:'integration-image',pattern:'image',depthBottom:.7,depthTop:1.2,
    image:raster(128),mask:raster(64,true)}]});
const fixtures=[];
for(const [id,params] of [['spiral-planter',regular],['painted-image-cup',painted]]) {
  const mesh=generateMesh(params,'standard');
  writeFileSync(join(output,id+'.stl'),Buffer.from(encodeSTL(mesh)));
  fixtures.push({id,params,stats:mesh.stats});
}
writeFileSync(join(output,'fixtures.json'),JSON.stringify(fixtures));
"""


def check(report, condition, label):
    if not condition:
        raise AssertionError(label)
    report["checks"].append(label)


def request(base, path, method="GET", body=None, headers=None, binary=False):
    supplied = {"Origin": base, "X-Form-Studio": "1", **(headers or {})}
    if isinstance(body, dict):
        supplied["Content-Type"] = "application/json"
        body = json.dumps(body).encode()
    try:
        response = HTTP.open(Request(base + path, data=body, headers=supplied, method=method), timeout=120)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, raw if binary else json.loads(raw), response.headers


def api(base, path, method="GET", body=None, headers=None):
    status, data, _ = request(base, path, method, body, headers)
    if status != 200:
        raise AssertionError(f"{method} {path} returned HTTP {status}")
    return data


@contextmanager
def isolated_environment(temp):
    changes = {"DATA_DIR": str(temp / "bootstrap"), "SEED_DIR": "",
               "BACKUP_SERVICE_ORIGIN": "", "MAX_UPLOAD_MB": "64"}
    previous = {key: os.environ.get(key) for key in changes}
    (temp / "bootstrap").mkdir()
    os.environ.update(changes)
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def load_module(name, path, package=False):
    spec = importlib.util.spec_from_file_location(
        name, path, submodule_search_locations=[str(path.parent)] if package else None)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load an application module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@contextmanager
def running_layer(layer, temp, uvicorn):
    app = layer.create_app(data_dir=temp / "layer-data", seed_dir="")
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(64)
    base = f"http://127.0.0.1:{listener.getsockname()[1]}"
    runner = uvicorn.Server(uvicorn.Config(app, log_level="error", timeout_graceful_shutdown=5))
    thread = threading.Thread(target=runner.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 15
        while not runner.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(.05)
        if not runner.started:
            raise RuntimeError("Layer Library test server did not start")
        yield base
    finally:
        runner.should_exit = True
        thread.join(10)
        if thread.is_alive():
            runner.force_exit = True
            thread.join(5)
        listener.close()
        app.state.store.pool.shutdown(wait=True)
        if thread.is_alive():
            raise RuntimeError("Layer Library test server did not stop")


@contextmanager
def running_form(form, temp, layer_base):
    store = form.Store(temp / "form-data", layer_base)
    server = form.FormServer(("127.0.0.1", 0), store, ROOT / "static")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(5)
        if thread.is_alive():
            raise RuntimeError("Form Studio test server did not stop")


def exercise(form, layer, base, layer_base, temp, fixtures, report):
    health = api(base, "/api/health")
    check(report, health["ok"] and health["service"] == "form-studio"
          and health["version"] == form.VERSION, "Form Studio health reports the source version")
    health = api(layer_base, "/api/health")
    check(report, health["status"] == "ok" and health["version"] == layer.VERSION,
          "Layer Library health reports the source version")
    empty = api(layer_base, "/api/library")
    check(report, empty["items"] == [] and empty["stats"]["models"] == 0,
          "A fresh Layer Library starts empty without personal or seeded models")

    _, session, headers = request(layer_base, "/api/session")
    cookie = headers.get("Set-Cookie", "")
    check(report, session["app_name"] == "Layer Library" and session["authenticated"]
          and not session["login_required"] and session["access_mode"] == "trusted_lan"
          and len(session["csrf_token"]) == 43 and "layer_library_session=" in cookie
          and "HttpOnly" in cookie and "SameSite=strict" in cookie,
          "The actual session endpoint issues a CSRF token and protected session cookie")
    status, _, _ = request(layer_base, "/api/models/upload", "POST", b"")
    check(report, status == 403, "Layer Library rejects an upload without a session")
    status, _, _ = request(layer_base, "/api/models/upload", "POST", b"",
                           {"Cookie": cookie.split(";", 1)[0]})
    check(report, status == 403, "Layer Library rejects a session without its CSRF token")
    connection = api(base, "/api/layer-library/test", "POST", {})
    check(report, connection["ok"], "Form Studio completes the actual Layer Library handshake")

    regular, painted = fixtures
    params = regular["params"]
    saved = api(base, "/api/designs", "POST", {"name": params["name"], "params": params})["design"]
    check(report, saved["params"] == params, "Saving a generated preset retains its complete editable recipe")
    body = (temp / "fixtures" / f"{regular['id']}.stl").read_bytes()
    request_id = str(uuid.uuid4())
    export_headers = {"Content-Type": "application/octet-stream", "X-Model-Name": quote(params["name"]),
                      "X-Design-Params": quote(json.dumps(params)), "X-Request-ID": request_id}
    result = api(base, "/api/layer-library", "POST", body, export_headers)
    check(report, result["ok"] and result["modelId"], "The generated preset uploads through the real multipart STL API")
    repeat = api(base, "/api/layer-library", "POST", body, export_headers)
    check(report, repeat["modelId"] == result["modelId"], "Retrying the same request ID returns the original library model")
    collection = api(layer_base, "/api/library")
    check(report, len(collection["items"]) == 1, "A repeated export creates exactly one library model")
    item = collection["items"][0]
    recipe = json.loads(item["notes"].split("\n\n", 1)[1])
    check(report, item["title"] == params["name"] and item["collection"] == "Form Studio"
          and recipe["application"] == "Form Studio" and recipe["schemaVersion"] == 1
          and recipe["params"] == params and "profilePoints" in recipe["params"],
          "Library metadata includes the title, collection and importable recipe schema")
    original_file = temp / "layer-data" / "files" / f"{item['id']}.stl"
    check(report, original_file.read_bytes() == body, "Layer Library stores the first generated STL byte-for-byte")
    check(report, item["size_bytes"] == len(body) and item["triangle_count"] == regular["stats"]["triangles"]
          and all(abs(item["dimensions"][axis] - regular["stats"]["dimensions"][i]) < .001
                  for i, axis in enumerate(("x", "y", "z"))),
          "Layer Library's mesh inspection matches generated dimensions and triangle count")
    status, downloaded, _ = request(layer_base, item["download_url"], binary=True)
    check(report, status == 200 and downloaded == body, "The actual library download returns identical STL bytes")

    client = form.LocalHTTP(layer_base)
    client.prepare()
    custom = {"title": "My annotated favourite", "collection": "Printing queue",
              "tags": ["keep-metadata", "gift"], "notes": "Synthetic printing notes.\nPreserve these settings."}
    client.request("PUT", "/api/models/" + item["id"], json.dumps(custom).encode(),
                   {"Content-Type": "application/json"})
    previous = client.request("PUT", "/api/models/" + item["id"] + "/featured", b'{"featured":true}',
                              {"Content-Type": "application/json"})
    check(report, previous["featured"] is True and all(previous[key] == value for key, value in custom.items()),
          "A real user session can annotate, organise and feature the existing model")
    alternative = {**params, "name": "Another export title", "color": "#9cbca3"}
    duplicate_headers = {**export_headers, "X-Model-Name": quote(alternative["name"]),
                         "X-Design-Params": quote(json.dumps(alternative)), "X-Request-ID": str(uuid.uuid4())}
    duplicate = api(base, "/api/layer-library", "POST", body, duplicate_headers)
    check(report, duplicate["ok"] and duplicate["reused"] is True and duplicate["modelId"] == item["id"]
          and duplicate["collection"] == "Printing queue", "A new request ID reuses identical geometry and reports its retained collection")
    after = api(layer_base, "/api/models/" + item["id"])
    check(report, all(after[key] == previous[key] for key in
                      ("title", "collection", "tags", "notes", "updated_at", "featured")) and after["featured"] is True,
          "Deduplication preserves custom metadata, modification time and the enabled featured flag")
    check(report, len(api(layer_base, "/api/library")["items"]) == 1 and original_file.read_bytes() == body,
          "Deduplication adds no model and leaves the original STL bytes unchanged")

    check(report, len(api(base, "/api/designs")["designs"]) == 1, "The saved Form Studio design appears in the design list")
    api(base, "/api/designs/" + saved["id"], "DELETE", b"")
    trash = api(base, "/api/trash")["designs"]
    check(report, api(base, "/api/designs")["designs"] == [] and len(trash) == 1
          and trash[0]["params"] == params, "Deleting a design moves its complete recipe into recoverable trash")
    api(base, "/api/designs/" + saved["id"] + "/restore", "POST", b"")
    restored = api(base, "/api/designs")["designs"]
    check(report, len(restored) == 1 and restored[0]["id"] == saved["id"] and restored[0]["params"] == params
          and api(base, "/api/trash")["designs"] == [], "Restoring a design recovers its identity and every recipe setting")

    large = painted["params"]
    check(report, len(json.dumps(large)) > 10000 and large["effects"][0]["image"]["width"] == 128
          and large["effects"][0]["mask"]["width"] == 64,
          "The synthetic painted-image recipe exceeds the library notes limit")
    large_saved = api(base, "/api/designs", "POST", {"name": large["name"], "params": large})["design"]
    check(report, large_saved["params"] == large, "Form Studio saves the entire oversized image and mask recipe")
    large_id = str(uuid.uuid4())
    staged = api(base, "/api/layer-library/recipe", "POST", {"requestId": large_id, "name": large["name"], "params": large})
    check(report, staged["ok"] and staged["requestId"] == large_id, "Large recipe staging binds the recipe to its export request")
    large_body = (temp / "fixtures" / f"{painted['id']}.stl").read_bytes()
    large_headers = {"Content-Type": "application/octet-stream", "X-Request-ID": large_id, "X-Recipe-ID": large_id}
    large_result = api(base, "/api/layer-library", "POST", large_body, large_headers)
    check(report, large_result["ok"] and large_result.get("warning") and large_result["recipeIncluded"] is False
          and large_result["modelId"] != item["id"], "The distinct painted-image STL succeeds with an explicit oversized-recipe warning")
    large_repeat = api(base, "/api/layer-library", "POST", large_body, large_headers)
    check(report, large_repeat["modelId"] == large_result["modelId"], "A staged large-recipe retry returns the same library model")
    large_item = api(layer_base, "/api/models/" + large_result["modelId"])
    check(report, large_item["collection"] == "Form Studio" and large_item["title"] == large["name"]
          and len(large_item["notes"]) <= 10000 and "exceeds" in large_item["notes"]
          and '"application"' not in large_item["notes"], "Oversized notes retain a readable explanation instead of truncated recipe JSON")
    large_file = temp / "layer-data" / "files" / f"{large_item['id']}.stl"
    check(report, large_file.read_bytes() == large_body, "Layer Library stores the second generated STL byte-for-byte")
    check(report, len(api(layer_base, "/api/library")["items"]) == 2
          and len(list((temp / "layer-data" / "files").glob("*.stl"))) == 2,
          "Both distinct exports and their retries leave exactly two STL models")
    check(report, api(base, "/api/designs/" + large_saved["id"])["design"]["params"] == large,
          "Exporting an oversized recipe does not alter the complete saved design")
    report["models"] = [{"fixture": fixture["id"], "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                         "triangles": fixture["stats"]["triangles"]}
                        for fixture, data in ((regular, body), (painted, large_body))]
    report["initial_library_models"] = 0
    report["final_library_models"] = 2


def run(args, report):
    import uvicorn

    node = shutil.which(args.node)
    if node is None:
        raise RuntimeError("Node.js was not found; install Node.js 20 or newer")
    layer_source = args.layer_source.resolve()
    for required in ("app/__init__.py", "app/main.py"):
        if not (layer_source / required).is_file():
            raise RuntimeError("--layer-source must point to the complete Layer Library repository")
    temp_path = None
    try:
        with tempfile.TemporaryDirectory(prefix="form-layer-integration-") as directory:
            temp_path = Path(directory)
            fixtures_dir = temp_path / "fixtures"
            fixtures_dir.mkdir()
            subprocess.run([node, "--input-type=module", "-e", GENERATOR, str(ROOT / "static/geometry.js"),
                            str(fixtures_dir)], check=True, timeout=120)
            fixtures = json.loads((fixtures_dir / "fixtures.json").read_text())
            for fixture in fixtures:
                stats = fixture["stats"]
                check(report, stats["watertight"] and stats["components"] == 1
                      and stats["boundaryEdges"] == 0 and stats["nonManifoldEdges"] == 0,
                      f"The current geometry engine generates a valid {fixture['id']} fixture")
            check(report, (fixtures_dir / "spiral-planter.stl").read_bytes()
                  != (fixtures_dir / "painted-image-cup.stl").read_bytes(), "The two generated STL fixtures are distinct")
            with isolated_environment(temp_path):
                form = load_module("_integration_form_server", ROOT / "server.py")
                load_module("_integration_layer_library", layer_source / "app/__init__.py", package=True)
                layer = importlib.import_module("_integration_layer_library.main")
                report["form_version"], report["layer_version"] = form.VERSION, layer.VERSION
                try:
                    with running_layer(layer, temp_path, uvicorn) as layer_base:
                        with running_form(form, temp_path, layer_base) as base:
                            exercise(form, layer, base, layer_base, temp_path, fixtures, report)
                    check(report, True, "Both temporary HTTP servers shut down cleanly")
                    report["servers_stopped"] = True
                finally:
                    # main.py creates a default app on import. It never serves
                    # requests here, and its data path is the temporary bootstrap.
                    layer.app.state.store.pool.shutdown(wait=True)
        check(report, not temp_path.exists(), "All fixture, database, model and bootstrap data is removed")
    finally:
        report["temporary_data_removed"] = temp_path is None or not temp_path.exists()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--layer-source", type=Path, required=True, help="Path to the complete Layer Library source checkout")
    parser.add_argument("--node", default="node", help="Node.js executable (default: node)")
    parser.add_argument("--report", type=Path, help="Optional JSON result file; the same result is printed to stdout")
    args = parser.parse_args()
    report = {"passed": False, "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "checks": [], "servers_stopped": False, "temporary_data_removed": False}
    try:
        run(args, report)
        report["passed"] = True
    except Exception as error:
        # Keep portable reports free of workstation paths, session credentials
        # and exception payloads. Failed check labels contain only test intent.
        report["error_type"] = type(error).__name__
        if isinstance(error, AssertionError):
            report["failed_check"] = str(error)
        print(f"Integration failed: {error}", file=sys.stderr)
    report["check_count"] = len(report["checks"])
    output = json.dumps(report, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output)
    print(output, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
