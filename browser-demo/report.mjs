export const SDK_ONLY = 'SDK-only — not computed in this demo';
export function makeReport(session, standard) {
  const snapshot = session.snapshot();
  return {
    report_type: 'micromotion-browser-output-demo', schema_version: '1.0.0', generated_at: new Date().toISOString(),
    standard_schema_version: standard.schema_version, standard_issued_at: standard.issued_at,
    status: 'partial', source: session.source, synthetic: session.source === 'synthetic_sample',
    boundary: 'Output experience demo only. Four uncalibrated geometric proxies are not SDK parameters or SDK accuracy. The separate on-device SDK implements the complete 21-item standard. No emotion, health, diagnosis, or accuracy claims are produced here.',
    session: { ...snapshot, metrics: undefined }, demo_metrics: snapshot.metrics,
    items: standard.items.map(item => ({
      ...item, raw: null, display: null, mean: null, std: null, vi: null, vi_reason: 'not_computed_in_demo',
      detect_min: null, detect_max: null, ref_min: null, ref_max: null, ref_status: 'not_applicable',
      gray_min: null, gray_max: null, level: 'unavailable', calibration_status: 'uncalibrated',
      retest_suggested: false, evidence: [], status: 'not_computed_in_demo', reason: SDK_ONLY,
    })),
    privacy: { video_uploaded: false, landmarks_uploaded: false, persistent_browser_storage: false },
  };
}

function cell(row, text, tag = 'td') {
  const element = document.createElement(tag); element.textContent = text; row.append(element); return element;
}
// Both on-page and downloaded reports use this renderer and the frozen snapshot.
export function renderReport(report, target) {
  target.replaceChildren();
  const meta = document.createElement('dl'); meta.className = 'report-meta';
  for (const [key, label, value] of [
    ['source', 'Source', report.synthetic ? 'Synthetic sample (artificial landmarks)' : 'Camera session'],
    ['elapsed_seconds', 'Session duration', `${report.session.elapsed_seconds} s`],
    ['valid_tracking_seconds', 'Valid tracking', `${report.session.valid_tracking_seconds} s`],
    ['valid_frames', 'Valid frames', String(report.session.valid_frames)],
    ['generated_at', 'Generated (UTC)', report.generated_at],
  ]) {
    const group = document.createElement('div');
    cell(group, label, 'dt'); cell(group, value, 'dd').dataset.field = key; meta.append(group);
  }
  target.append(meta);
  const boundary = document.createElement('p'); boundary.className = 'report-boundary';
  boundary.textContent = report.boundary; target.append(boundary);
  const list = document.createElement('dl'); list.className = 'report-metrics';
  for (const [key, m] of Object.entries(report.demo_metrics)) {
    const card = document.createElement('div'); card.className = 'report-metric'; card.dataset.metric = key;
    cell(card, m.label, 'dt');
    const value = cell(card, '', 'dd');
    cell(value, m.value === null ? 'Unavailable — ' + m.reason : `${m.value} ${m.unit}`, 'span').className = 'report-value';
    value.dataset.value = JSON.stringify(m.value);
    const range = document.createElement('p'); range.className = 'report-range';
    const available = Number.isFinite(m.value) && Number.isFinite(m.min) && Number.isFinite(m.max);
    const spread = available && m.max > m.min;
    range.textContent = available
      ? (spread ? `Session range: ${m.min} to ${m.max} ${m.unit}` : `Single observed value: ${m.min} ${m.unit}`)
      : 'Range unavailable for the current reading.';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 8'); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'report-bar'); svg.setAttribute('aria-hidden', 'true');
    const rect = (width, className) => {
      const node = document.createElementNS(svg.namespaceURI, 'rect');
      node.setAttribute('width', String(width)); node.setAttribute('height', '8');
      node.setAttribute('rx', '2'); node.setAttribute('class', className); svg.append(node); return node;
    };
    rect(100, 'bar-track');
    if (spread) rect(100 * Math.max(0, Math.min(1, (m.value - m.min) / (m.max - m.min))), 'bar-value');
    else if (available) rect(1, 'bar-value').setAttribute('x', '49.5');
    // Keep all content in the definition so the definition list stays semantic.
    value.append(svg, range); list.append(card);
  }
  const note = document.createElement('p'); note.className = 'report-note';
  note.textContent = 'Values above are the last valid current readings. JSON also includes session statistics. No demo proxy is equivalent to a U01–U21 parameter.';
  const scale = document.createElement('p'); scale.className = 'report-note';
  scale.textContent = 'Bars show each value within its own observed session range, not a reference range, target, grade or assessment. A single observed value is marked at the center. Bar lengths cannot be compared across metrics.';
  target.append(list, note, scale);
  const table = document.createElement('table');
  const caption = document.createElement('caption'); caption.textContent = 'Complete 21-item report structure'; table.append(caption);
  const head = table.createTHead().insertRow(); ['ID', 'Parameter', 'Result'].forEach(x => cell(head, x, 'th').scope = 'col');
  const body = table.createTBody();
  report.items.forEach(item => { const row = body.insertRow(); cell(row, item.u); cell(row, item.name_en); cell(row, item.reason); });
  target.append(table);
}

export function reportHTML(report, cssText) {
  const doc = document.implementation.createHTMLDocument('MicroMotion · Session report');
  doc.documentElement.lang = 'en';
  const charset = doc.createElement('meta'); charset.setAttribute('charset', 'utf-8'); doc.head.prepend(charset);
  for (const [name, content] of [
    ['viewport', 'width=device-width, initial-scale=1'],
    ['Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"],
    ['referrer', 'no-referrer'],
  ]) {
    const meta = doc.createElement('meta'); meta.setAttribute(name === 'Content-Security-Policy' ? 'http-equiv' : 'name', name);
    meta.content = content; doc.head.append(meta);
  }
  const main = doc.createElement('main'); main.className = 'downloaded-report';
  const title = doc.createElement('h1'); title.textContent = 'MicroMotion · Session report'; main.append(title);
  const target = doc.createElement('section'); target.id = 'report'; target.className = 'report-panel';
  renderReport(report, target); main.append(target); doc.body.append(main);
  // Inert data preserves full precision and all JSON fields without executable code.
  const data = doc.createElement('script'); data.type = 'application/json'; data.id = 'report-data';
  data.textContent = JSON.stringify(report).replaceAll('<', '\\u003c'); doc.body.append(data);
  // Serialize CSS without attaching an inline style to a document inheriting the demo CSP.
  const html = doc.documentElement.outerHTML.replace('</head>', () => `<style>${cssText.replaceAll('<', '\\3c ')}</style></head>`);
  return '<!doctype html>\n' + html + '\n';
}
