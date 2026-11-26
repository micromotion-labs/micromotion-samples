# Third-party notices and asset provenance

Vendored on 2026-11-26. These are unmodified upstream files. Original demo code is separately MIT-licensed. Copyright notices embedded in upstream bundles and source maps are preserved. The upstream repository license is included in `mediapipe/LICENSE`, including its supplemental notice for unrelated language-detector UTF utilities.

## Runtime

- Package: `@mediapipe/tasks-vision` **0.10.32**, MediaPipe / Google, **Apache-2.0**.
- Registry metadata: https://registry.npmjs.org/@mediapipe/tasks-vision/0.10.32
- Archive: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.32.tgz
- Archive integrity (verified before extraction): `sha512-3tiAZnmKloYnRXYoO3dKltTUGnqeCwzC4lV03uY0vCsE+aveJTyEVQyZHOlQGQNsjK+gRHzkf9q08C99Qm2K0Q==`
- Upstream license: https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.32/LICENSE
- Both SIMD and non-SIMD loaders/binaries are included. The ESM source map is included to preserve its local source-map reference. CJS and type declarations are not needed by this static runtime.

## Model

- Face Landmarker bundle **float16/1**, MediaPipe / Google, **Apache-2.0**.
- Downloaded from the versioned upstream URL: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Official task documentation links the following complete bundle model card: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- Bundle model card and explicit license: https://huggingface.co/litert-community/MediaPipe-FaceLandmarker
- Model card metadata declares `license: apache-2.0`; its published SHA-256 is `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`, identical to the downloaded file (3,758,596 bytes).
- The bundle contains BlazeFace short-range detection, FaceMesh V2 (478 landmarks), Blendshape V2, and canonical geometry metadata. Blendshape output is disabled in this demo.
- Supporting FaceMesh V2 model card, page 1, also identifies Apache-2.0: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf

No license/source URL in this notice is loaded by the application. No model card is loaded at runtime. See `asset-manifest.json` for exact byte sizes and hashes.

## Included files

| Path | Version | License | Bytes |
| --- | --- | --- | ---: |
| `mediapipe/LICENSE` | 0.10.32 | Apache-2.0 | 12,331 |
| `mediapipe/models/face_landmarker.task` | float16/1 | Apache-2.0 | 3,758,596 |
| `mediapipe/vision_bundle.mjs` | 0.10.32 | Apache-2.0 | 137,160 |
| `mediapipe/vision_bundle.mjs.map` | 0.10.32 | Apache-2.0 | 345,093 |
| `mediapipe/wasm/vision_wasm_internal.js` | 0.10.32 | Apache-2.0 | 204,816 |
| `mediapipe/wasm/vision_wasm_internal.wasm` | 0.10.32 | Apache-2.0 | 11,453,626 |
| `mediapipe/wasm/vision_wasm_nosimd_internal.js` | 0.10.32 | Apache-2.0 | 204,669 |
| `mediapipe/wasm/vision_wasm_nosimd_internal.wasm` | 0.10.32 | Apache-2.0 | 10,647,962 |

Total: **26,764,253 bytes**, including license and source map.

## PDF export

`pdf-lib/pdf-lib.esm.min.mjs` is the unmodified ES module distribution of pdf-lib 1.17.1 (renamed from `.js` to `.mjs`), obtained from the npm release archive. Its MIT license is retained in `pdf-lib/LICENSE.md`; both files are pinned by size and SHA-256 in `asset-manifest.json`. This is the only added PDF library. The self-contained distribution includes its bundled dependencies and upstream license comments. It is loaded locally during initialization; export does not fetch fonts, code or other resources.

Source archive: https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz
API reference: https://pdf-lib.js.org/docs/api/classes/pdfdocument
