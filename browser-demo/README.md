# Browser output demo

Serve the repository with `python3 -m http.server 8000 --bind 127.0.0.1` and open `/browser-demo/` on that local server. There is no build or runtime package installation. Opening `index.html` as a file is unsupported because modules, WASM and camera permissions need an HTTP origin. Use HTTPS for remote hosting. Copy this entire directory, including `vendor/`, to a static host.

The primary action, **Try with sample data**, runs a 30-second synthetic landmark stream. Its values are measured from generated geometry, not people. A new source starts a new session. Stop freezes readings; generating a report stops capture and creates a frozen snapshot. Download exports that exact report, including synthetic-source labeling. Switching modes, hiding the page or leaving it stops the camera. No video or landmark arrays are saved to disk or browser storage.

## Scope and shared pipeline

| Capability | Choice | Implementation |
| --- | --- | --- |
| Real face inference | LIB | Locally vendored MediaPipe Face Landmarker 0.10.32; CPU delegate |
| Video capture | REUSE | Browser getUserMedia; video only |
| Standard identities | ADAPT | U01–U21 identity metadata from standard v1.0.0, issued 2026-11-12 |
| Demo measurements | BUILD | One `MetricSession` in `metrics.mjs`, used by both sources |
| Synthetic source | BUILD | Deterministic landmark geometry in `sample.mjs`; never a camera fallback |
| Report and export | BUILD | One `makeReport` / `renderReport` path in `report.mjs` |
| Interface | BUILD | Native HTML/CSS/canvas, no framework |

Build scope is limited to these four modules plus static presentation and verification. The source standard's formulas, norms, calibration and interpretation are deliberately absent. No core engine code is copied. None of the four proxies matches the 21 standard parameters: in particular, head stability is not emotional stability and iris offset is not concentration. All 21 report slots therefore contain null values plus `SDK-only — not computed in this demo`; the four measured proxies are under `demo_metrics`. The slot order, keys and required fields are preserved, but this demo report is not an SDK-compatible computation result. The official SDK runs on device and implements the full standard.

## Measurement definitions

Landmarks are converted to pixel-proportional coordinates (`x * width`, `y * height`, `z * width`) to account for input aspect ratio. Invalid coordinates, missing faces and degenerate geometry produce unavailable readings; no synthetic fallback or zero filling occurs. Statistics use finite observations only. Long gaps over 250 ms break continuity; they do not count toward tracked time or create a blink/motion jump. Duplicate timestamps are ignored. JSON uses null plus a reason for unavailable values, and never serializes NaN or Infinity.

| Demo metric | Computation | Limits |
| --- | --- | --- |
| Head pose stability | RMS of population standard deviations of three geometric angle proxies over the last 5 seconds. Yaw uses cheek depth difference / cheek distance; pitch uses forehead-to-chin depth difference / distance; roll uses the eye-center line. Angles are unwrapped. Unit: degrees of spread; lower means less variation. | Not calibrated 3D pose estimation, emotional stability or a 0–100 score. One frame is insufficient. |
| Blink frequency | Mean vertical eyelid gap / eye width over both eyes. Closure below 0.16, reopening above 0.22, closure duration 60–500 ms, refractory interval 250 ms; requires an observed open eye first. Completed closures × 60 / valid tracked seconds. | Uncalibrated heuristics. At least 5 seconds required; short sessions, frame loss, glasses, pose and lighting affect counts. |
| Gaze direction proxy | Mean signed horizontal projection of each iris center relative to the eye midpoint, divided by eye width. Positive is right in unmirrored image coordinates. | Hidden during closures. Not point-of-gaze, calibrated eye tracking, attention or concentration. |
| Landmark micro-jitter | RMS frame-to-frame displacement of points 1, 4, 10, 152, 234, 454 after eye-center translation, face-width scaling and eye-line roll removal; divide by elapsed time and multiply by 100. | Percent face width per second. Includes detector noise, expressions and residual pose; not physiological tremor. |

Live traces retain only 120 observations. Online session statistics use bounded memory: count, arithmetic mean, population standard deviation, min and max. Statistics are over observed metric values, not time-weighted; blink-rate statistics summarize the evolving rate estimate, while `value` is the final rate and `blink_count` is the actual event count. These are demo statistics, not the SDK's standard aggregation or acquisition gates.

## Privacy and initialization

Initialization loads the local JSON schema, model, JS and selected WASM variant, then warms the real inference graph on a blank canvas. Both SIMD and non-SIMD assets are included. Controls become ready only after initialization settles. If the model fails, camera mode is disabled with an explicit message; synthetic mode remains available. Local assets are served by the static server; no backend processing exists. After readiness, neither mode, report generation nor download makes a network request. No analytics, remote font, service worker, persistent storage, upload or video recording is present. A restrictive Content Security Policy blocks external connections.

For an embedded demo use a same-origin iframe pointing to `browser-demo/index.html`; allow `camera` only if needed. Cross-origin camera permission also depends on the host's Permissions Policy. An iframe sandbox must permit scripts and same-origin execution; JSON downloads need `allow-downloads`. Sample mode needs no camera grant. Host-page analytics and network activity are outside this child document's guarantees.

## Verification

Runtime has no dependencies beyond the vendored files. Optional development checks use Python 3 and Node, plus an existing Playwright installation and Chromium for browser acceptance:

```sh
node --test browser-demo/tests/metrics.test.mjs
python3 browser-demo/tests/static-audit.py
# With the local static server running:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROMIUM_PATH=/absolute/path/to/chromium \
node browser-demo/tests/acceptance.mjs
```

`DEMO_ORIGIN` optionally overrides the test origin (default loopback port 8765). Acceptance writes a structured log, a sample JSON export and desktop/mobile screenshots under `evidence/`. External requests are intercepted, and the main sample journey is exercised with browser networking offline after readiness. An additional injected blank video stream checks the real camera capture/inference/stop plumbing; it does not validate face detection quality or physical camera operation. A no-SIMD initialization check exercises the fallback assets.

Camera mode is implemented. Physical webcam operation, facial metric validity/accuracy, Safari/Firefox, mobile cameras, cross-origin embedding and production hosting are not validated by these checks. See `evidence/acceptance.json` for executed cases, coverage, exclusions and failure classification.
