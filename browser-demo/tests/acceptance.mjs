// Development-only browser checks. No npm install or build is required to run the demo.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.DEMO_ORIGIN || 'http://127.0.0.1:8765';
const output = process.env.DEMO_EVIDENCE ? pathToFileURL(process.env.DEMO_EVIDENCE.replace(/\/$/, '') + '/') : new URL('../evidence/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const results = [], requests = [], afterReady = [], external = [], errors = [], violations = [], runtimeMessages = [];
let ready = false, frozenReport;
async function check(name, fn) {
  const started = Date.now();
  try { const detail = await fn(); results.push({ name, status: 'pass', milliseconds: Date.now() - started, detail: detail ?? null }); }
  catch (error) { results.push({ name, status: 'fail', milliseconds: Date.now() - started, failure_class: 'untriaged', error: error.message }); throw error; }
  console.log('PASS', name);
}
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('request', r => { requests.push(r.url().replace(origin, '')); if (ready) afterReady.push(r.url().replace(origin, '')); });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') runtimeMessages.push(m.text()); });
await page.exposeFunction('recordCspViolation', value => violations.push(value));
await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.recordCspViolation(e.violatedDirective)));
const widths = [360, 390, 400, 768, 1440];
async function layout(stage) {
  const details = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await page.evaluate(() => {
      const rect = node => node.getBoundingClientRect();
      const caption = rect(document.querySelector('#viewer-caption')), viewer = rect(document.querySelector('.viewer'));
      const placeholder = document.querySelector('#placeholder');
      const clipped = [...document.querySelectorAll('#status, .viewer-caption, .tag, button, .report-value, .report-meta dd, td, .reading, #placeholder>*:not(.face-symbol)')]
        .filter(n => n.getClientRects().length && n.clientWidth && (n.scrollWidth > n.clientWidth + 1 || (getComputedStyle(n).overflowY !== 'visible' && n.scrollHeight > n.clientHeight + 1))).map(n => n.textContent);
      const buttons = [...document.querySelectorAll('button')].map(n => ({ id: n.id, width: rect(n).width, height: rect(n).height }));
      return {
        width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
        separateCaption: caption.top >= viewer.bottom, clipped, buttons,
        placeholderContained: placeholder.hidden || [...placeholder.children].every(n => { const r = rect(n); return r.top >= viewer.top && r.bottom <= viewer.bottom && r.left >= viewer.left && r.right <= viewer.right; }),
      };
    });
    assert.equal(result.overflow, false, `${stage} ${width} overflow`);
    assert.equal(result.separateCaption, true); assert.equal(result.placeholderContained, true);
    assert.deepEqual(result.clipped, [], `${stage} ${width} clipping`);
    assert.ok(result.buttons.every(b => b.width >= 44 && b.height >= 44));
    details.push(result);
    if (stage === 'ready' || stage === 'report') await page.screenshot({ path: fileURLToPath(new URL(`${stage}-${width}.png`, output)), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  return { stage, viewports: details };
}
try {
  await check('Local model, SIMD WASM and real blank-frame inference initialize', async () => {
    await page.goto(`${origin}/browser-demo/`); await page.waitForSelector('body[data-ready="true"]'); await page.waitForLoadState('networkidle');
    assert.equal(await page.getAttribute('body', 'data-camera-ready'), 'true');
    assert.ok(requests.some(x => x.endsWith('vision_wasm_internal.wasm')));
    assert.ok(requests.some(x => x.endsWith('face_landmarker.task')));
    ready = true; await context.setOffline(true);
    return { initialization_requests: requests.slice(), networking_disabled_after_readiness: true };
  });
  await check('Empty session report and JSON actions are disabled', async () => {
    assert.equal(await page.isDisabled('#generate'), true); assert.equal(await page.isDisabled('#download'), true); assert.equal(await page.isDisabled('#download-html'), true);
  });
  await check('Ready overlays and touch targets fit all five viewports', () => layout('ready'));
  await check('Offline sample updates all four metrics and draws time-series traces', async () => {
    await page.click('#sample');
    await page.waitForFunction(() => Number.parseFloat(document.querySelector('#session-time').textContent) >= 6);
    const first = await page.locator('.reading').allTextContents();
    assert.equal(first.some(x => x.includes('—')), false);
    await page.waitForTimeout(700); const second = await page.locator('.reading').allTextContents(); assert.notDeepEqual(first, second);
    const tracePixels = await page.locator('.trace').evaluateAll(nodes => nodes.map(c => c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v => v !== 0)));
    assert.ok(tracePixels.every(Boolean));
    await page.screenshot({ path: fileURLToPath(new URL('sample-desktop.png', output)), fullPage: true });
    return { first, second, trace_pixels_present: tracePixels };
  });
  await check('Synthetic caption and running status fit all five viewports', () => layout('sample'));
  await check('Full 30-second sample stops automatically', async () => {
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('30-second synthetic sample complete'), { timeout: 40000 });
    assert.equal(await page.isDisabled('#stop'), true);
    const frames = await page.textContent('#frame-count'); assert.ok(Number.parseInt(frames) > 300);
    return { frames, time: await page.textContent('#session-time') };
  });
  await check('Report contains four measured proxies and all 21 unavailable SDK slots', async () => {
    await page.click('#generate'); assert.equal(await page.locator('#report tbody tr').count(), 21);
    assert.equal(await page.locator('#report .report-metrics dd').count(), 4);
    assert.equal(await page.locator('#report tbody tr').filter({ hasText: 'SDK-only — not computed in this demo' }).count(), 21);
    const frames = await page.textContent('#frame-count'); await page.waitForTimeout(150); assert.equal(await page.textContent('#frame-count'), frames);
    await page.screenshot({ path: fileURLToPath(new URL('report-desktop.png', output)), fullPage: true });
  });
  await check('JSON download matches the frozen synthetic report and standard contract', async () => {
    const downloadPromise = page.waitForEvent('download'); await page.click('#download'); const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'micromotion-demo-report.json');
    const path = fileURLToPath(new URL('sample-report.json', output)); await download.saveAs(path);
    const report = frozenReport = JSON.parse(await readFile(path, 'utf8'));
    const standard = JSON.parse(await readFile(new URL('../standard-21.json', import.meta.url), 'utf8'));
    assert.equal(report.synthetic, true); assert.equal(report.source, 'synthetic_sample'); assert.equal(report.items.length, 21);
    assert.equal(Object.keys(report.demo_metrics).length, 4);
    for (const metric of Object.values(report.demo_metrics)) assert.ok(Number.isFinite(metric.value));
    assert.ok(report.session.blink_count > 0);
    for (let i = 0; i < 21; i++) {
      const item = report.items[i]; assert.equal(item.key, standard.items[i].key);
      standard.required_keys.forEach(k => assert.ok(k in item)); assert.equal(item.display, null);
    }
    const uiValues = await page.locator('#report .report-value').allTextContents();
    Object.values(report.demo_metrics).forEach((m,i) => assert.equal(uiValues[i], `${m.value} ${m.unit}`));
    return { filename: download.suggestedFilename(), valid_frames: report.session.valid_frames, blink_count: report.session.blink_count, items: report.items.length };
  });
  await check('HTML is standalone and matches every JSON field and all 72 visible report fields', async () => {
    const promise = page.waitForEvent('download'); await page.click('#download-html'); const download = await promise;
    assert.equal(download.suggestedFilename(), 'micromotion-demo-report.html');
    const path = fileURLToPath(new URL('sample-report.html', output)); await download.saveAs(path);
    const c = await browser.newContext({ offline: true }), p = await c.newPage(); const requests = [], errors = [];
    p.on('request', r => { if (!r.url().startsWith('file:')) requests.push(r.url()); });
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(pathToFileURL(path).href);
    const data = JSON.parse(await p.locator('#report-data').textContent()); assert.deepEqual(data, frozenReport);
    const fields = '#report .report-meta dd, #report .report-value, #report tbody td';
    const onPage = await page.locator(fields).allTextContents(), exported = await p.locator(fields).allTextContents();
    assert.equal(onPage.length, 72); assert.deepEqual(exported, onPage);
    assert.deepEqual(onPage.slice(0,5), ['Synthetic sample (artificial landmarks)', `${data.session.elapsed_seconds} s`, `${data.session.valid_tracking_seconds} s`, String(data.session.valid_frames), data.generated_at]);
    assert.equal(await p.locator('#report').innerHTML(), await page.locator('#report').innerHTML());
    assert.equal(await p.locator('script:not([type="application/json"]), link, [src]').count(), 0);
    assert.equal(await p.locator('style').count(), 1);
    for (const width of widths) {
      await p.setViewportSize({width,height:1000});
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(requests, []); assert.deepEqual(errors, []);
    await p.screenshot({ path: fileURLToPath(new URL('html-report.png', output)), fullPage: true });
    const leaves = v => v && typeof v === 'object' ? Object.values(v).reduce((n,x) => n+leaves(x),0) : 1;
    await c.close(); return { visible_fields_compared: 72, json_leaf_values_compared: leaves(data), metric_values: 4, metadata: 5, table_cells: 63, external_requests: 0, widths };
  });
  await check('Rendered report layout and touch targets fit all five viewports', () => layout('report'));
  await check('Report renderer handles unavailable, signed, constant-range and escaped values', async () => {
    const result = await page.evaluate(async () => {
      const { makeReport, renderReport, reportHTML } = await import('./report.mjs');
      const { MetricSession } = await import('./metrics.mjs');
      const { sampleLandmarks } = await import('./sample.mjs');
      const s = new MetricSession('camera'); s.add(sampleLandmarks(0), 0);
      const r = makeReport(s, { items: [], schema_version: 'test', issued_at: 'test' });
      r.boundary = '</script><img src="https://invalid.example/"> & demo';
      r.demo_metrics.gaze_proxy.value = -.1; r.demo_metrics.gaze_proxy.min = -.2; r.demo_metrics.gaze_proxy.max = .2;
      r.demo_metrics.landmark_jitter.value = 0; r.demo_metrics.landmark_jitter.min = 0; r.demo_metrics.landmark_jitter.max = 0;
      const target = document.createElement('div'); renderReport(r, target);
      const parsed = new DOMParser().parseFromString(reportHTML(r, '').replace('<style></style>', ''), 'text/html');
      return { unavailable: target.querySelector('[data-metric="blink_rate"] .report-value').textContent,
        unavailableBars: target.querySelectorAll('[data-metric="blink_rate"] .bar-value').length,
        signedBar: target.querySelector('[data-metric="gaze_proxy"] .bar-value').getAttribute('width'),
        constantMarker: target.querySelector('[data-metric="landmark_jitter"] .bar-value').getAttribute('x'),
        source: target.querySelector('[data-field="source"]').textContent,
        injected: parsed.querySelectorAll('img').length,
        dataEqual: JSON.stringify(JSON.parse(parsed.querySelector('#report-data').textContent)) === JSON.stringify(r) };
    });
    assert.match(result.unavailable, /^Unavailable — /); assert.equal(result.unavailableBars, 0);
    assert.equal(result.signedBar, '25'); assert.equal(result.constantMarker, '49.5');
    assert.equal(result.source, 'Camera session'); assert.equal(result.injected, 0); assert.equal(result.dataEqual, true);
    return result;
  });
  await check('Restart resets readings, report and download availability', async () => {
    await page.click('#sample'); assert.equal(await page.isVisible('#report'), false); assert.equal(await page.isDisabled('#download'), true); assert.equal(await page.isDisabled('#download-html'), true);
    assert.equal(await page.textContent('#blink_rate'), '—');
    await page.click('#stop');
  });
  await check('Denied camera permission has an explicit error and no fabricated readings', async () => {
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
    await page.click('#camera'); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('permission denied'));
    assert.ok((await page.locator('.reading').allTextContents()).every(x => x.includes('—'))); assert.equal(await page.isDisabled('#generate'), true);
  });
  await check('Camera caption and denied status fit all five viewports', () => layout('denied'));
  await check('Blank video stream traverses real camera inference and stops its track', async () => {
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0,0,640,480);
        window.acceptanceStream = canvas.captureStream(15); window.acceptanceCanvas = canvas;
        return window.acceptanceStream;
      };
    });
    await page.click('#camera'); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('No face detected'));
    assert.equal(await page.textContent('#frame-count'), '0 frames'); assert.equal(await page.isDisabled('#generate'), true);
    await page.click('#stop'); assert.ok(await page.evaluate(() => window.acceptanceStream.getTracks().every(t => t.readyState === 'ended')));
    return 'Injected blank video only; real MediaPipe inference, no physical webcam or face accuracy claim.';
  });
  await check('Late camera permission resolution cannot override a newer sample session', async () => {
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.acceptanceResolve = resolve; }); });
    await page.click('#camera'); await page.click('#sample');
    await page.evaluate(() => { window.lateStream = window.acceptanceCanvas.captureStream(15); window.acceptanceResolve(window.lateStream); });
    await page.waitForFunction(() => window.lateStream.getTracks().every(t => t.readyState === 'ended'));
    assert.equal(await page.textContent('#source-label'), 'SYNTHETIC SAMPLE'); await page.click('#stop');
  });
  await check('Hiding a page stops an active camera stream', async () => {
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        // A new canvas supplies a fresh initial frame. Reusing an unpainted
        // stopped canvas stream can leave video.play() waiting indefinitely.
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        canvas.getContext('2d').fillRect(0, 0, 640, 480);
        window.hiddenCanvas = canvas; return (window.hiddenStream = canvas.captureStream(15));
      };
    });
    await page.click('#camera'); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('No face detected'));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
    assert.ok(await page.evaluate(() => window.hiddenStream.getTracks().every(t => t.readyState === 'ended')));
    assert.equal(await page.isDisabled('#stop'), true);
  });
  await check('No post-initialization requests, external requests, page errors or CSP violations', async () => {
    assert.deepEqual(afterReady, []); assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(violations, []);
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    return { post_initialization_requests: 0, external_requests: 0, page_errors: 0, csp_violations: 0 };
  });
  await check('Non-SIMD fallback initializes from vendored assets', async () => {
    const c = await browser.newContext(); const p = await c.newPage(); const paths = [];
    await p.addInitScript(() => {
      const instantiate = WebAssembly.instantiate.bind(WebAssembly);
      WebAssembly.instantiate = (source, ...args) => {
        // MediaPipe probes SIMD with a 31-byte module, using instantiate.
        if (source instanceof Uint8Array && source.byteLength === 31) return Promise.reject(new WebAssembly.CompileError('SIMD disabled by acceptance fixture'));
        return instantiate(source, ...args);
      };
    });
    p.on('request', r => paths.push(new URL(r.url()).pathname));
    await p.goto(`${origin}/browser-demo/`); await p.waitForSelector('body[data-ready="true"]');
    assert.equal(await p.getAttribute('body','data-camera-ready'), 'true'); assert.ok(paths.some(x => x.endsWith('vision_wasm_nosimd_internal.wasm')));
    await c.close(); return { selected_wasm: 'vision_wasm_nosimd_internal.wasm' };
  });
  await check('Model load failure disables camera while retaining explicit synthetic mode', async () => {
    const c = await browser.newContext(); const p = await c.newPage();
    await p.route('**/face_landmarker.task', route => route.abort());
    await p.goto(`${origin}/browser-demo/`); await p.waitForSelector('body[data-ready="true"]');
    assert.equal(await p.isDisabled('#camera'), true); assert.match(await p.textContent('#status'), /could not initialize/);
    await p.click('#sample'); await p.waitForFunction(() => parseInt(document.querySelector('#frame-count').textContent) > 5);
    assert.equal(await p.textContent('#source-label'), 'SYNTHETIC SAMPLE'); await c.close();
    return 'Deliberate model-request abort; expected degradation, not a product failure.';
  });
} catch (e) { console.error('ACCEPTANCE FAILED:', e.message); process.exitCode = 1; }
finally {
  const summary = {
    browser: await browser.version(), executed_count: results.length, passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length, cases: results,
    coverage: results.filter(r => r.status === 'pass').map(r => r.name),
    uncovered: ['Physical webcam and real-person landmark/metric validity', 'Accuracy, calibration, demographic or clinical validation', 'Safari, Firefox and physical mobile browsers', 'Cross-origin iframe permissions and production hosting'],
    failure_classification: { product_defects: 0, test_infrastructure_failures: 0, untriaged_failures: results.filter(r => r.status === 'fail').length,
      expected_negative_cases: ['Camera permission denial','No face in blank video','Late camera resolution','Model asset load failure'] },
    external_requests: external, post_readiness_requests: afterReady, page_errors: errors, csp_violations: violations,
    runtime_messages: [...new Set(runtimeMessages)],
  };
  await writeFile(new URL('acceptance.json', output), JSON.stringify(summary, null, 2) + '\n');
  await browser.close(); console.log(JSON.stringify({ executed: summary.executed_count, passed: summary.passed, failed: summary.failed }));
}
