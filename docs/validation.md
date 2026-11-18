# Release validation

Prepared for the public Form Studio **1.2.0** source package on **18 November
2026**. These results describe source and local application checks. They are
not a claim that the application was deployed to a live NAS.

## Checks completed

| Area | Result |
| --- | --- |
| Python backend and configuration | 17 tests passed, including real process launches with environment and CLI overrides. |
| Fresh public defaults | No configured Layer Library address; generic build volume; isolated temporary storage. |
| Main interface script | JavaScript syntax check passed. |
| Geometry and rendering preservation | Geometry, worker, WebGL viewer, software renderer and randomisation modules are byte-for-byte unchanged from the previously validated 1.2.0 implementation. |
| Actual companion-app integration | 36 checks passed against the complete public Layer Library 1.0.6 source. |
| Installation examples | YAML parses; documented settings, paths and ports were checked against source. |
| Public package review | Required source/assets and notices included; personal addresses, live data, uploaded models and installation credentials excluded. |

The companion-app check generates two meshes using the included geometry engine:
a spiral planter with **124,416 triangles** and an image-relief cup with
**185,088 triangles**. Both were transferred through the real Layer Library
multipart API and stored byte-for-byte. The check also verifies session/CSRF
handling, retries, duplicate preservation of custom metadata and Featured status,
editable recipes, saved-design trash/restore, and the explicit warning when an
image recipe exceeds the library notes limit.

All fixture meshes, databases and application data were temporary. The check
stopped both local servers and removed that data after completion.

## Reproduce the checks

```sh
python3 -m unittest discover -s tests -p '*_test.py'
npm test
```

The JavaScript suites cover geometry, rendering and randomisation. They are
included in GitHub Actions and run without an npm dependency installation.

The optional test with the actual companion app is documented in
[Contributing](../CONTRIBUTING.md#optional-layer-library-integration-check).

## Deployment verification still needed

A Docker daemon and a live TrueNAS instance were unavailable for these release
checks. Container builds, Docker volume ownership and TrueNAS Apps deployment
were reviewed in source but were not executed in that environment. The included
GitHub Actions workflow builds, starts and health-checks the container after the
repository is uploaded.

No physical printer test was performed. Mesh checks and a successful STL export
do not establish a particular printer/material combination's printability.
