import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { MetricSession } from '../metrics.mjs';
import { sampleLandmarks } from '../sample.mjs';
import { makeReport } from '../report.mjs';
import { reportPDF } from '../report-pdf.mjs';
const standard = JSON.parse(await readFile(new URL('../standard-21.json', import.meta.url)));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
for (const variant of ['short-camera', 'lost-tracking', 'signed-and-constant']) {
  test(`PDF preserves frozen data and renders ${variant} without invented values`, async () => {
    const session = new MetricSession('camera');
    session.add(sampleLandmarks(0), 0);
    if (variant !== 'short-camera') for (let i = 1; i <= 200; i++) session.add(sampleLandmarks(i / 30), i * 1000 / 30);
    if (variant === 'lost-tracking') session.add(null, 7000);
    const report = makeReport(session, standard);
    if (variant === 'signed-and-constant') {
      Object.assign(report.demo_metrics.gaze_proxy, { value: -.1, min: -.2, max: .2 });
      Object.assign(report.demo_metrics.landmark_jitter, { value: 0, min: 0, max: 0 });
    }
    const frozen = JSON.stringify(report); freeze(report);
    const dir = await mkdtemp(join(tmpdir(), 'demo-pdf-test-'));
    try {
      await writeFile(join(dir, 'report.json'), frozen);
      await writeFile(join(dir, 'report.pdf'), await reportPDF(report));
      const checks = JSON.parse(execFileSync(process.env.PDF_PYTHON || 'python3', [fileURLToPath(new URL('pdf-verify.py', import.meta.url)), join(dir, 'report.pdf'), join(dir, 'report.json')], { encoding: 'utf8' }));
      assert.equal(checks.proxy_values_compared, 4); assert.equal(checks.sdk_ranges_compared, 21);
      assert.equal(JSON.stringify(report), frozen);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
