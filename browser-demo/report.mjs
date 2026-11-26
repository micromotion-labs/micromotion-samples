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
export function renderReport(report, target) {
  target.replaceChildren();
  const title = document.createElement('p'); title.className = 'report-summary';
  title.textContent = `${report.synthetic ? 'Synthetic sample' : 'Camera session'} · ${report.session.valid_frames} valid frames · ${report.session.valid_tracking_seconds.toFixed(1)} seconds tracked`;
  target.append(title);
  const list = document.createElement('dl'); list.className = 'report-metrics';
  for (const m of Object.values(report.demo_metrics)) {
    const term = document.createElement('dt'); term.textContent = m.label;
    const value = document.createElement('dd');
    value.textContent = m.value === null ? 'Unavailable — ' + m.reason : `${m.value.toFixed(3)} ${m.unit}`;
    list.append(term, value);
  }
  const note = document.createElement('p'); note.textContent = 'Values above are the last valid current readings. JSON also includes session statistics. No demo proxy is equivalent to a U01–U21 parameter.';
  target.append(list, note);
  const table = document.createElement('table');
  const caption = document.createElement('caption'); caption.textContent = 'Complete 21-item report structure'; table.append(caption);
  const head = table.createTHead().insertRow(); ['ID', 'Parameter', 'Result'].forEach(x => cell(head, x, 'th'));
  const body = table.createTBody();
  report.items.forEach(item => { const row = body.insertRow(); cell(row, item.u); cell(row, item.name_en); cell(row, item.reason); });
  target.append(table);
}
