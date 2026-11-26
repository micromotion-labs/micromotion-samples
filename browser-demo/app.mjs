import { FaceLandmarker, FilesetResolver } from './vendor/mediapipe/vision_bundle.mjs';
import { MetricSession, METRICS, POINTS } from './metrics.mjs';
import { sampleLandmarks, SAMPLE_SECONDS } from './sample.mjs';
import { makeReport, renderReport } from './report.mjs';

const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('face'), ctx = canvas.getContext('2d');
const readings = {}, traces = {};
let landmarker, standard, session, stream, animation, active = false, generation = 0, report;
let startTime = 0, lastFrame = -Infinity, lastVideoTime = -1;
for (const [key, metric] of Object.entries(METRICS)) {
  const card = document.createElement('article'); card.className = 'metric';
  const heading = document.createElement('h3'); heading.textContent = metric.label;
  const reading = document.createElement('div'); reading.className = 'reading';
  const value = document.createElement('span'); value.id = key; value.textContent = '—'; readings[key] = value;
  const unit = document.createElement('span'); unit.className = 'unit'; unit.textContent = metric.unit;
  reading.append(value, unit);
  const trace = document.createElement('canvas'); trace.className = 'trace'; trace.width = 240; trace.height = 112;
  trace.setAttribute('aria-label', `${metric.label} recent observations`); traces[key] = trace;
  const description = document.createElement('p'); description.textContent = metric.description;
  card.append(heading, reading, trace, description); $('metrics').append(card);
}
const status = text => { $('status').textContent = text; };
function showMetrics() {
  for (const key of Object.keys(METRICS)) {
    const n = session?.latest?.[key]; readings[key].textContent = Number.isFinite(n) ? n.toFixed(key === 'blink_rate' ? 1 : 3) : '—';
    const c = traces[key], g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    const history = session?.history ?? [], values = history.map(v => v?.[key]).filter(Number.isFinite);
    if (!values.length) continue;
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, .0001);
    g.strokeStyle = '#d6e2e7'; g.beginPath(); g.moveTo(0, 100); g.lineTo(240, 100); g.stroke();
    g.strokeStyle = '#08766d'; g.lineWidth = 3; g.beginPath(); let connected = false;
    history.forEach((v, i) => {
      const n = v?.[key]; if (!Number.isFinite(n)) { connected = false; return; }
      const x = i * 240 / 119, y = 94 - (n - min) / span * 76;
      if (connected) g.lineTo(x, y); else g.moveTo(x, y); connected = true;
    }); g.stroke();
  }
  $('session-time').textContent = `${(session?.validSeconds ?? 0).toFixed(1)} s tracked`;
  $('frame-count').textContent = `${session?.frames ?? 0} frames`;
  $('generate').disabled = !session?.frames;
}
function draw(landmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  ctx.strokeStyle = '#70d8ba80'; ctx.lineWidth = 1.5;
  for (const line of [[10, 234, 152, 454, 10], [33, 159, 133, 145, 33], [362, 386, 263, 374, 362], [168, 1, 4]]) {
    ctx.beginPath(); line.forEach((id, i) => { const p = landmarks[id]; ctx[i ? 'lineTo' : 'moveTo'](p.x * canvas.width, p.y * canvas.height); }); ctx.stroke();
  }
  ctx.fillStyle = '#a3f5d4';
  for (const id of POINTS) { const p = landmarks[id]; ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, id >= 468 ? 4 : 2.5, 0, Math.PI * 2); ctx.fill(); }
}
function stop(message) {
  active = false; generation++; cancelAnimationFrame(animation);
  stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; video.hidden = true;
  $('stop').disabled = true; $('camera').disabled = !landmarker;
  if (message) status(message);
}
function begin(source) {
  stop(); session = new MetricSession(source); report = null;
  $('download').disabled = true; $('report').hidden = true; $('report').replaceChildren();
  $('report-hint').hidden = false; $('placeholder').hidden = true; $('stop').disabled = false;
  $('source-label').textContent = source === 'synthetic_sample' ? 'SYNTHETIC SAMPLE' : 'CAMERA';
  $('viewer-caption').textContent = source === 'synthetic_sample' ? 'SYNTHETIC LANDMARKS · NO VIDEO' : 'LOCAL CAMERA · UNMIRRORED';
  canvas.width = 640; canvas.height = 480; draw(null); showMetrics();
  canvas.parentElement.style.aspectRatio = '4 / 3';
  startTime = performance.now(); lastFrame = -Infinity; lastVideoTime = -1;
  return generation;
}
function accept(landmarks, now, width, height) {
  session.add(landmarks, now, width, height); draw(landmarks); showMetrics();
}
function tick(now) {
  if (!active) return;
  if (now - lastFrame >= 32) {
    lastFrame = now;
    try {
      if (session.source === 'synthetic_sample') {
        const t = (now - startTime) / 1000;
        if (t >= SAMPLE_SECONDS) { stop('30-second synthetic sample complete. Generate your session report.'); return; }
        accept(sampleLandmarks(t), now, 640, 480);
      } else if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = landmarker.detectForVideo(video, now);
        const face = result.faceLandmarks[0];
        accept(face, now, video.videoWidth, video.videoHeight);
        status(face ? 'Camera active. Geometry proxies are computed locally; no video is recorded.' : 'No face detected. Face the camera in good light; unavailable values are shown as dashes.');
      }
    } catch {
      session.add(null, now + .001); showMetrics(); draw(null);
      stop('Camera processing failed. Start a new camera session or choose the synthetic sample.'); return;
    }
  }
  animation = requestAnimationFrame(tick);
}
$('sample').addEventListener('click', () => {
  begin('synthetic_sample'); active = true;
  status('Synthetic sample running for 30 seconds. Artificial landmarks feed the same metrics and report pipeline as the camera.');
  animation = requestAnimationFrame(tick);
});
$('camera').addEventListener('click', async () => {
  if (!landmarker) return;
  const token = begin('camera'); $('camera').disabled = true;
  status('Waiting for camera permission. You can stop or switch to the sample at any time.');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (token !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
      if (token !== generation) return;
      session.add(null, performance.now()); showMetrics(); draw(null); stop('Camera disconnected. Start a new session to continue.');
    });
    video.srcObject = stream; await video.play();
    if (token !== generation) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; video.hidden = false;
    canvas.parentElement.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    active = true; $('camera').disabled = false; animation = requestAnimationFrame(tick);
  } catch {
    if (token !== generation) return;
    stop('Camera unavailable or permission denied. Use localhost or HTTPS, allow camera access, or try the synthetic sample.');
  }
});
$('stop').addEventListener('click', () => stop('Session stopped. Your current readings are frozen; generate a report or start a new session.'));
$('generate').addEventListener('click', () => {
  if (!session?.frames) return;
  stop('Report generated. Capture stopped; the report and JSON describe the same frozen session.');
  report = makeReport(session, standard); renderReport(report, $('report'));
  $('report').hidden = false; $('report-hint').hidden = true; $('download').disabled = false;
  $('report').focus({ preventScroll: true });
});
$('download').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'micromotion-demo-report.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && (active || stream || !$('stop').disabled)) stop('Session stopped because the page was hidden. Start a new session to continue.'); });
window.addEventListener('pagehide', () => stop());

async function load() {
  const schema = await fetch('./standard-21.json');
  if (!schema.ok) throw new Error('schema'); standard = await schema.json();
  try {
    const [fileset, modelResponse] = await Promise.all([
      FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm'),
      fetch('./vendor/mediapipe/models/face_landmarker.task'),
    ]);
    if (!modelResponse.ok) throw new Error('model');
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(await modelResponse.arrayBuffer()), delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
    });
    // Warm the real inference graph before signaling readiness. No subsequent asset loads.
    const blank = document.createElement('canvas'); blank.width = 64; blank.height = 64;
    landmarker.detectForVideo(blank, performance.now());
    $('camera').disabled = false;
    status('Ready. All local assets are loaded. Try the synthetic sample or enable your camera.');
    document.body.dataset.cameraReady = 'true';
  } catch {
    landmarker?.close(); landmarker = null;
    status('Camera model could not initialize. Synthetic sample mode is available. Serve the complete folder on localhost or HTTPS.');
    document.body.dataset.cameraReady = 'false';
  }
  $('sample').disabled = false; document.body.dataset.ready = 'true';
}
load().catch(() => status('Required local files could not load. Serve the complete browser-demo folder with a static HTTP server.'));
