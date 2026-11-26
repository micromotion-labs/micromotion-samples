import { PDFDocument, StandardFonts, rgb } from './vendor/pdf-lib/pdf-lib.esm.min.mjs';

// Presentation only. Every measurement and reference constant comes from makeReport.
export const PDF_SDK_ONLY = 'Not computed in this demo — available in the SDK';
export function referenceText(item) {
  const r = item.standard_reference;
  if (!r || r.min === null || r.max === null) {
    return r?.empirical_max == null ? 'Not established' : `Not established; empirical upper limit ${r.empirical_max}`;
  }
  return `${r.min} to ${r.max}${r.status === 'provisional' ? ' (provisional)' : ''}${r.empirical_max != null ? ' (empirical upper limit)' : ''}`;
}

function positionText(m) {
  if (!Number.isFinite(m.value)) return `Current reading unavailable. ${m.reason}. No position can be reported.`;
  if (!Number.isFinite(m.min) || !Number.isFinite(m.max)) return 'An observed range is unavailable; no position can be reported.';
  if (m.min === m.max) return `The observed range is constant at ${m.min} ${m.unit}. The center mark represents a single observed value.`;
  const position = 100 * (m.value - m.min) / (m.max - m.min);
  return `Within this session's observed range of ${m.min} to ${m.max} ${m.unit}, the current reading is ${position.toFixed(1)}% of the way from minimum to maximum. This is a range position, not a percentile or score.`;
}

export async function reportPDF(report) {
  const pdf = await PDFDocument.create();
  // Override library defaults: the document and its properties carry no branding.
  pdf.setTitle('Session report'); pdf.setAuthor(''); pdf.setSubject('Demonstration signal observations');
  pdf.setCreator('Local report export'); pdf.setProducer('Local report export'); pdf.setLanguage('en');
  const generated = new Date(report.generated_at);
  pdf.setCreationDate(generated); pdf.setModificationDate(generated);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, margin = 44, width = W - margin * 2;
  const ink = rgb(.09, .17, .25), muted = rgb(.32, .40, .47), blue = rgb(.12, .36, .59);
  const pale = rgb(.94, .96, .98), line = rgb(.82, .87, .91), white = rgb(1, 1, 1);
  let page;
  const text = (value, x, top, size = 11, font = regular, color = ink, maxWidth = width) =>
    page.drawText(String(value), { x, y: H - top - size, size, font, color, maxWidth, lineHeight: size * 1.4 });
  const box = (x, top, w, h, color) => page.drawRectangle({ x, y: H - top - h, width: w, height: h, color });
  const rule = top => box(margin, top, width, .7, line);
  const newPage = (number, title, subtitle) => {
    page = pdf.addPage([W, H]);
    text(`SESSION REPORT / ${number}`, margin, 30, 9, bold, blue);
    text(title, margin, 65, 25, bold);
    if (subtitle) text(subtitle, margin, 108, 10, regular, muted);
  };
  const metrics = Object.values(report.demo_metrics);
  const source = report.synthetic ? 'Synthetic sample (artificial landmarks)' : 'Camera session';
  const reading = m => Number.isFinite(m.value) ? `${m.value} ${m.unit}` : 'Unavailable';
  const n = value => Number.isFinite(value) ? String(value) : 'Unavailable';

  // 1. Cover: title, summary cards and session information.
  page = pdf.addPage([W, H]); box(0, 0, W, H, ink);
  for (let x = 0; x < W; x += 60) box(x, 0, .4, H, rgb(.14, .23, .32));
  for (let y = 0; y < H; y += 60) box(0, y, W, .4, rgb(.14, .23, .32));
  text('LOCAL OBSERVATIONS / ENGLISH EDITION', margin, 81, 10, bold, rgb(.58, .76, .89));
  box(margin, 134, 70, 3, rgb(.36, .71, .82));
  text('Session report', margin, 169, 40, bold, white);
  text('Geometry, measured locally.', margin, 231, 20, regular, white);
  text('A frozen record of demonstration signals and\nthe complete 21-item parameter register.', margin, 274, 12, regular, rgb(.72, .81, .88));
  [['04', 'Demonstration proxies'], ['21', 'SDK parameters listed'], ['00', 'SDK results computed']].forEach(([value, label], i) => {
    const x = margin + i * 175; box(x, 370, 2, 78, rgb(.36, .71, .82));
    text(value, x + 12, 369, 31, bold, white); text(label, x + 12, 418, 9, regular, white);
  });
  text('Session information', margin, 528, 16, bold, white);
  const meta = [
    ['SOURCE', source], ['STARTED (UTC)', report.session.started_at], ['GENERATED (UTC)', report.generated_at],
    ['SESSION DURATION', `${report.session.elapsed_seconds} s`], ['VALID TRACKING', `${report.session.valid_tracking_seconds} s`],
    ['VALID FRAMES', report.session.valid_frames],
  ];
  meta.forEach(([label, value], i) => {
    const x = margin + (i % 2) * 267, top = 574 + Math.floor(i / 2) * 60;
    text(label, x, top, 8, bold, rgb(.58, .76, .89)); text(value, x, top + 18, 10, regular, white, 249);
  });

  // 2. Observed statistics, separate from the SDK register.
  newPage('01', 'Results overview', 'Demonstration signals');
  text('demonstration proxies, not SDK parameters', margin, 137, 12, bold, blue);
  text('Values are the last valid current readings in the frozen report. All ranges below\nare observed within this session. They are not reference ranges or targets.', margin, 164, 10, regular, muted);
  metrics.forEach((m, i) => {
    const top = 219 + i * 125;
    box(margin, top, width, 111, pale);
    text(m.label, margin + 14, top + 11, 12, bold);
    text(reading(m), margin + 14, top + 33, 19, bold, blue);
    text(`Min ${n(m.min)}   /   Max ${n(m.max)}   /   Mean ${n(m.mean)}   /   SD ${n(m.std)}`, margin + 14, top + 65, 9, regular, muted);
    const x = margin + 14, barWidth = width - 28;
    box(x, top + 91, barWidth, 4, line);
    if ([m.value, m.min, m.max].every(Number.isFinite)) {
      const fraction = m.max === m.min ? .5 : Math.max(0, Math.min(1, (m.value - m.min) / (m.max - m.min)));
      box(x + fraction * (barWidth - 3), top + 88, 3, 10, blue);
    }
  });
  text(`Valid frames: ${report.session.valid_frames}  /  Missing frames: ${report.session.missing_frames}  /  Completed blinks: ${report.session.blink_count}`, margin, 739, 9, regular, muted);

  // 3–4. Stable identity order; no invented measurement or grading columns.
  for (const [part, start, end] of [[1, 0, 12], [2, 12, 21]]) {
    newPage(part === 1 ? '02' : '02 / CONTINUED', 'SDK parameter register', `21-item standard v${report.standard_schema_version} / issued ${report.standard_issued_at} / part ${part} of 2`);
    text('Reference constants only. No result, level or interpretation is computed here.', margin, 137, 10, regular, muted);
    box(margin, 169, width, 28, ink);
    const cols = [margin + 8, margin + 42, margin + 181, margin + 313];
    ['ID', 'Parameter', 'v1.0 reference', 'Result'].forEach((label, i) => text(label, cols[i], 177, 9, bold, white));
    report.items.slice(start, end).forEach((item, i) => {
      const top = 197 + i * 44;
      if (i % 2 === 0) box(margin, top, width, 44, pale);
      text(item.u, cols[0], top + 9, 9, bold);
      text(item.name_en, cols[1], top + 9, 9, regular, ink, 130);
      text(referenceText(item), cols[2], top + 9, 9, regular, muted, 123);
      text(PDF_SDK_ONLY, cols[3], top + 9, 9, regular, ink, 181);
    });
    if (part === 2) {
      text('Reference notes', margin, 621, 14, bold);
      text('U12: the reference is provisional. U15: 6.5 is an empirical upper limit.\nU17–U18: no reference interval is established. U19–U21: only empirical\nupper limits are specified; no normal interval is established. These constants\nare not applied to the demonstration signals or to any measured result here.', margin, 655, 10, regular, muted);
    }
  }

  // 5. Explain only what was measured and its position in the observed range.
  newPage('03', 'Signal interpretation', 'Reading the four demonstration signals');
  metrics.forEach((m, i) => {
    const top = 153 + i * 148;
    rule(top); text(`${String(i + 1).padStart(2, '0')}  ${m.label}`, margin, top + 12, 13, bold);
    text(`Current reading: ${reading(m)}`, margin, top + 37, 11, bold, blue);
    text(m.description, margin, top + 61, 10, regular, ink);
    text(positionText(m), margin, top + 98, 9, regular, muted);
  });

  // 6. Standalone notes and explicit limits, with no assessment prose.
  newPage('04', 'Reading notes', 'Scope, data handling and limitations');
  const notes = [
    ['A frozen session', 'The report, on-page display and JSON export use the same session snapshot. Current readings and session statistics retain their exported precision. No new measurement is made while creating this PDF.'],
    ['Observed ranges', 'Each marker uses its own session minimum and maximum. A constant range is marked at the center. Unavailable readings have no marker. Marker positions cannot be compared across signals. No population percentile, target, grade or risk level is assigned.'],
    ['Data availability', 'Only the four demonstration signals are measured. The 21-item register lists names and standard v1.0 reference constants for context. Every SDK result is unavailable in this demo. An absent reference interval is not replaced with a default range.'],
    ['Local data handling', 'The PDF is generated locally when downloaded. This demo does not upload video or landmarks and does not use persistent browser storage. No personal profile, photograph or identity record is included in this report.'],
    ['Limitations', 'These uncalibrated geometry proxies describe observations, including tracking noise and movement. They do not establish emotion, health, attention, identity or a clinical or psychological conclusion. Synthetic samples describe artificial landmarks, not a person.'],
  ];
  notes.forEach(([title, body], i) => {
    const top = 156 + i * 113;
    text(title, margin, top, 13, bold); text(body, margin, top + 28, 11, regular, muted);
  });
  rule(739);

  // Consistent page numbering and explanatory footer on every page.
  pdf.getPages().forEach((p, i) => {
    page = p;
    const color = i === 0 ? rgb(.72, .81, .88) : muted;
    text('Demonstration only. No emotion or health assessment.', margin, 791, 8, regular, color);
    text(`${i + 1} / ${pdf.getPageCount()}`, W - 74, 791, 8, regular, color);
  });
  return pdf.save();
}
