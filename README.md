# MicroMotion Samples

For device makers and integrators exploring MicroMotion output experiences: browser micro-motion demonstrations and inspectable session reports. Demo geometry proxies are not SDK parameters or evidence of SDK accuracy.

**Solution:** [Emotion perception hub](https://site-ai-gateway.com/en/solutions/emotion/)

## Browser demo

The first sample is in `browser-demo/`: plain HTML, CSS and JavaScript, with no build step, framework, or application server. MediaPipe Face Landmarker, its model, and both WASM variants are vendored locally. No CDN, remote font, telemetry, or runtime external request is used.

From this repository:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the local server's `/browser-demo/` path. Wait for initialization, then choose **Try with sample data** for a 30-second synthetic landmark session. The camera option uses real local MediaPipe inference and requires localhost or HTTPS plus camera permission. Both inputs share one metrics implementation and one report pipeline.

- Four uncalibrated demo signals: head pose stability, blink frequency, gaze direction proxy, and landmark micro-jitter, each with a live trace.
- Generate a frozen session report and download JSON. All U01–U21 slots are present; unsupported parameters are explicitly labeled **SDK-only — not computed in this demo**. Demo measurements live in a separate `demo_metrics` object because none is equivalent to the standard's 21 parameters.
- Video and landmarks stay on device. After initialization, the page makes no network requests. No capture is stored; JSON export is an explicit user action.

The separate, on-device MicroMotion SDK implements the complete 21-item standard. Its core engine, calibration, norms and interpretation logic are not included here. This sample makes no accuracy claims and performs no emotion or health assessment.

Implementation notes, formulas, embedding instructions, and verification commands are in `browser-demo/README.md`. Asset provenance, licenses, sizes and SHA-256 hashes are in `browser-demo/vendor/NOTICE.md` and `browser-demo/vendor/asset-manifest.json`. Browser acceptance evidence is in `browser-demo/evidence/`.

Original sample code is MIT-licensed; vendored MediaPipe runtime and models are Apache-2.0 with upstream notices retained.

## Evaluation

A 30-day evaluation license is available: [Evaluation](https://site-ai-gateway.com/en/solutions/evaluation/)
