import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MetricSession } from '../metrics.mjs';
import { sampleLandmarks } from '../sample.mjs';
import { makeReport, SDK_ONLY } from '../report.mjs';
const standard = JSON.parse(readFileSync(new URL('../standard-21.json', import.meta.url)));
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);

test('stationary geometry yields zero motion without inventing initial values', () => {
  const s = new MetricSession('camera'), face = sampleLandmarks(0);
  s.add(face, 0); assert.equal(s.latest.head_stability, null); assert.equal(s.latest.landmark_jitter, null);
  for (let i = 1; i <= 180; i++) s.add(face, i * 1000 / 30);
  close(s.latest.head_stability, 0); close(s.latest.landmark_jitter, 0);
  assert.equal(s.latest.blink_rate, 0); assert.equal(s.blinks, 0);
});
test('30-second synthetic fixture measures ten completed blinks', () => {
  const s = new MetricSession('synthetic_sample');
  for (let i = 0; i <= 900; i++) s.add(sampleLandmarks(i / 30), i * 1000 / 30);
  assert.equal(s.blinks, 10); close(s.latest.blink_rate, 20);
  assert.ok(s.latest.head_stability > 0); assert.ok(s.latest.landmark_jitter > 0);
  assert.ok(s.history.length <= 120);
});
test('pixel-aspect handling gives equivalent values across normalized resolutions', () => {
  const a = new MetricSession('camera'), b = new MetricSession('camera');
  for (let i = 0; i < 60; i++) {
    const face = sampleLandmarks(i / 30); a.add(face, i * 1000 / 30, 640, 480);
    b.add(face.map(p => ({ x: p.x, y: p.y * .75, z: p.z })), i * 1000 / 30, 640, 640);
  }
  for (const k of ['head_stability','gaze_proxy','landmark_jitter']) close(a.latest[k], b.latest[k]);
});
test('jitter removes translation, uniform scale and in-plane roll', () => {
  const s = new MetricSession('camera'), f = sampleLandmarks(0);
  s.add(f, 0);
  const roll = .12;
  const moved = f.map(p => {
    const x = p.x - .5, y = (p.y - .5) * .75;
    return { x: .54 + 1.1 * (x * Math.cos(roll) - y * Math.sin(roll)), y: .53 + 1.1 * (x * Math.sin(roll) + y * Math.cos(roll)) / .75, z: p.z * 1.1 };
  });
  s.add(moved, 33); close(s.latest.landmark_jitter, 0);
  assert.ok(s.latest.head_stability > 0);
});
test('lost face clears current values and breaks blink/motion continuity', () => {
  const s = new MetricSession('camera');
  s.add(sampleLandmarks(1), 0); s.add(sampleLandmarks(1.4), 50);
  s.add(null, 100); assert.equal(s.latest, null);
  s.add(sampleLandmarks(1.7), 150);
  assert.equal(s.blinks, 0); assert.equal(s.latest.landmark_jitter, null);
  close(s.validSeconds, .05);
});
test('invalid, degenerate and duplicate frames cannot poison statistics', () => {
  const s = new MetricSession('camera'); s.add(sampleLandmarks(0), 0);
  assert.equal(s.add(sampleLandmarks(1), 0), null); assert.equal(s.frames, 1);
  const broken = sampleLandmarks(0); broken[1].x = NaN; s.add(broken, 33);
  s.add(Array.from({length:478},()=>({x:.5,y:.5,z:0})), 66);
  assert.equal(s.missingFrames, 2); assert.equal(s.latest, null);
  assert.equal(s.snapshot().metrics.head_stability.value, null);
  assert.ok(!JSON.stringify(s.snapshot()).includes('NaN'));
});
test('long gaps and prolonged eye closure do not create false blinks', () => {
  const s = new MetricSession('camera'); s.add(sampleLandmarks(1), 0);
  for (let i = 1; i <= 20; i++) s.add(sampleLandmarks(1.4), i * 50);
  s.add(sampleLandmarks(2), 1050); assert.equal(s.blinks, 0);
  const tracked = s.validSeconds; s.add(sampleLandmarks(2), 10000);
  assert.equal(s.validSeconds, tracked); assert.equal(s.latest.landmark_jitter, null);
});
test('report preserves all standard IDs and required fields without false equivalence', () => {
  const s = new MetricSession('synthetic_sample'); s.add(sampleLandmarks(0), 0);
  const r = makeReport(s, standard);
  assert.equal(r.synthetic, true); assert.equal(r.items.length, 21);
  assert.equal(Object.keys(r.demo_metrics).length, 4);
  r.items.forEach((item, i) => {
    assert.equal(item.u, `U${String(i + 1).padStart(2,'0')}`);
    for (const k of standard.required_keys) assert.ok(k in item, k);
    assert.equal(item.display, null); assert.equal(item.mean, null); assert.equal(item.reason, SDK_ONLY);
    assert.equal(item.level, 'unavailable');
  });
  assert.equal(makeReport(new MetricSession('camera'), standard).synthetic, false);
  assert.equal(JSON.parse(JSON.stringify(r)).demo_metrics.blink_rate.value, null);
});
