# Third-party notices

Form Studio's original application code and included project assets are licensed
under the [MIT License](LICENSE). Third-party components retain their own
copyright notices and licenses.

## Bundled browser components

| Component | Version | Included files | License |
| --- | --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js/tree/r180) | 0.180.0 (r180) | `static/vendor/three.core.js`, `static/vendor/three.module.js`, `static/vendor/OrbitControls.js` | [MIT; full upstream notice](licenses/three-LICENSE.txt) |

`OrbitControls.js` is part of Three.js. Its module import points to the local
Three.js distribution so the application can run without a public CDN. Keep the
upstream license file and the copyright headers when redistributing these files.

## Included artwork and presets

The application icon is a project SVG. The 24 images in `static/presets/` were
rendered from the application's parametric preset meshes. The built-in grayscale
surface masks are calculated procedurally in the application; they are not
imported photographs. These project assets are covered by the root MIT License.

The repository does not include the social-media reference material used during
design, personal uploads, or an existing user's saved models. Images or designs
that someone later imports into their installation keep their own ownership and
license terms; the application's license does not change those terms.

## Runtime and development tools

The application server uses Python's standard library. Python, the container
base image, and any development tools are separately distributed software with
their own licenses; they are not relicensed by Form Studio's MIT License.
