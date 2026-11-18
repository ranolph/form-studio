# Contributing to Form Studio

Use an issue to describe a substantial feature or behaviour change before
investing in a large patch. Small fixes can go straight into a pull request.

## Development

Follow the local installation instructions in [README.md](README.md). Keep
runtime data outside tracked source. Use synthetic or redistributable test
fixtures; do not include your personal library, printer configuration or saved
database.

The server uses Python's standard library. Node.js 20 or newer runs the geometry
and rendering checks; no npm install is needed.

```sh
python3 -m unittest discover -s tests -p '*_test.py'
npm test
```

Preserve compatibility with saved recipes when changing geometry or
randomisation. Keep STL geometry independent of display-only colours, lighting
and layer-line effects. Add a focused regression check when a behaviour change
has a meaningful failure mode.

## Pull requests

Explain the problem, the resulting behaviour and how you verified the change.
Keep unrelated changes separate. Run the relevant checks and mention anything
you could not verify.

The GitHub Actions workflow also builds and starts the Docker Compose
application. A passing Python/JavaScript test suite alone does not verify the
container.

## Optional Layer Library integration check

With the complete Layer Library repository checked out beside this repository,
use Python 3.12 or newer and Node.js 20 or newer. Install Layer Library's runtime
requirements into a disposable virtual environment, then run:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r ../layer-library/requirements.txt
.venv/bin/python tests/integration_layer_library.py --layer-source ../layer-library
```

The check starts both actual applications on temporary loopback ports, generates
two STL meshes from the current geometry engine, and verifies upload, session/CSRF
handling, recipe metadata, retries, deduplication, featured-state preservation,
saved-design trash/restore and oversized image recipes. All databases and model
files are temporary and removed afterward. It does not contact an existing app
or printer. Add `--report ../cross-app-integration.json` to save the JSON result
outside either repository. This optional check is separate from the standard
unit-test and Docker workflows.

## Licensing

Contributions are provided under the repository's MIT License. Preserve
third-party copyright notices and include licence information for any new
dependency or asset.

