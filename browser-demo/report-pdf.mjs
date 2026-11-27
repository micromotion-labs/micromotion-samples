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
  pdf.setTitle('Session report'); pdf.setAuthor(''); pdf.setSubject('Demonstration signal observations');
  pdf.setCreator('Local report export'); pdf.setProducer('Local report export'); pdf.setLanguage('en');
  const generated = new Date(report.generated_at);
  pdf.setCreationDate(generated); pdf.setModificationDate(generated);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ============================================================
  // Page geometry and visual system
  // ============================================================

  const W = 595.28;
  const H = 841.89;
  const margin = 32;
  const width = W - margin * 2;

  const CONTENT_TOP = 92;
  const CONTENT_BOTTOM = 766;
  const FOOTER_TOP = 786;

  const ink = rgb(.075, .145, .225);
  const navy = rgb(.035, .115, .215);
  const navyDeep = rgb(.025, .065, .135);
  const navyLight = rgb(.065, .235, .390);

  const blue = rgb(.125, .355, .585);
  const accent = rgb(.290, .690, .825);

  const muted = rgb(.330, .400, .475);
  const secondary = rgb(.440, .500, .565);

  const pale = rgb(.950, .965, .980);
  const paleBlue = rgb(.910, .945, .980);
  const line = rgb(.815, .860, .905);
  const white = rgb(1, 1, 1);

  const coverMuted = rgb(.750, .835, .910);
  const coverLabel = rgb(.570, .750, .865);

  const greenInk = rgb(.105, .385, .290);
  const greenPale = rgb(.890, .950, .925);

  const amberInk = rgb(.490, .325, .115);
  const amberPale = rgb(.990, .950, .865);

  const neutralInk = rgb(.350, .420, .490);
  const neutralPale = rgb(.915, .935, .950);

  let page;
  let cursor = CONTENT_TOP;
  let activeSection = null;

  const metrics = Object.values(report.demo_metrics);
  const session = report.session;

  const source = report.synthetic
    ? 'Synthetic sample (artificial landmarks)'
    : 'Camera session';

  const method = 'Local facial landmark geometry';

  // The supplied schema has no dedicated session identifier.
  // Use the existing session start timestamp as the report identifier.
  // Do not generate a random identifier or modify the session object.
  const reportId = session.started_at;

  // Preserve the original exported numeric representations.
  const reading = m => Number.isFinite(m.value)
    ? `${m.value} ${m.unit}`
    : 'Unavailable';

  const n = value => Number.isFinite(value)
    ? String(value)
    : 'Unavailable';

  const dash = '—';

  const available = value => Number.isFinite(value);

  const dateText = value =>
    typeof value === 'string' && value.length > 0
      ? value
      : 'n/a';

  const qualityValue = (value, suffix = '') =>
    available(value) ? `${value}${suffix}` : 'n/a';

  // ============================================================
  // Drawing primitives
  // All coordinates below use a top-left origin.
  // ============================================================

  function box(x, top, w, h, color, opacity = 1) {
    page.drawRectangle({
      x,
      y: H - top - h,
      width: w,
      height: h,
      color,
      opacity,
    });
  }

  function strokeLine(x1, top1, x2, top2, color = line, thickness = .6) {
    page.drawLine({
      start: { x: x1, y: H - top1 },
      end: { x: x2, y: H - top2 },
      thickness,
      color,
    });
  }

  function outline(x, top, w, h, color = line, thickness = .6) {
    page.drawRectangle({
      x,
      y: H - top - h,
      width: w,
      height: h,
      borderColor: color,
      borderWidth: thickness,
    });
  }

  function text(value, x, top, size = 10, font = regular, color = ink) {
    const s = String(value);

    if (!s.length) return;

    page.drawText(s, {
      x,
      y: H - top - size,
      size,
      font,
      color,
    });
  }

  function measure(value, size = 10, font = regular) {
    return font.widthOfTextAtSize(String(value), size);
  }

  function rightText(value, right, top, size = 10, font = regular, color = ink) {
    const s = String(value);
    text(s, right - measure(s, size, font), top, size, font, color);
  }

  function centerText(value, x, top, w, size = 10, font = regular, color = ink) {
    const s = String(value);
    text(s, x + (w - measure(s, size, font)) / 2, top, size, font, color);
  }

  function rule(top, color = line) {
    box(margin, top, width, .65, color);
  }

  // Fit a single textual value without changing its representation.
  // Used for numeric readings and reference constants so that PDF
  // extraction retains the complete original value as one text run.
  function fittedText(
    value,
    x,
    top,
    maxWidth,
    size = 9,
    font = regular,
    color = ink,
    align = 'left'
  ) {
    const s = String(value);
    const measured = measure(s, size, font);

    const fittedSize = measured > maxWidth && measured > 0
      ? size * maxWidth / measured
      : size;

    const actualWidth = measure(s, fittedSize, font);

    let actualX = x;

    if (align === 'center') {
      actualX += (maxWidth - actualWidth) / 2;
    } else if (align === 'right') {
      actualX += maxWidth - actualWidth;
    }

    text(
      s,
      actualX,
      top + (size - fittedSize) / 2,
      fittedSize,
      font,
      color
    );
  }

  // Explicit wrapping keeps row height calculations and rendered
  // content consistent across pages.
  function wrapText(value, maxWidth, size = 9, font = regular) {
    const paragraphs = String(value).split(/\r?\n/);
    const result = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);

      if (!words.length) {
        result.push('');
        continue;
      }

      let current = '';

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;

        if (measure(candidate, size, font) <= maxWidth) {
          current = candidate;
          continue;
        }

        if (current) {
          result.push(current);
          current = '';
        }

        if (measure(word, size, font) <= maxWidth) {
          current = word;
          continue;
        }

        // Handle unusually long tokens without clipping.
        let fragment = '';

        for (const character of word) {
          const next = fragment + character;

          if (fragment && measure(next, size, font) > maxWidth) {
            result.push(fragment);
            fragment = character;
          } else {
            fragment = next;
          }
        }

        current = fragment;
      }

      if (current) result.push(current);
    }

    return result.length ? result : [''];
  }

  function drawLines(
    lines,
    x,
    top,
    size = 9,
    font = regular,
    color = ink,
    leading = size * 1.35
  ) {
    lines.forEach((value, i) => {
      text(value, x, top + i * leading, size, font, color);
    });

    return lines.length * leading;
  }

  function paragraph(
    value,
    x,
    top,
    maxWidth,
    size = 9.5,
    font = regular,
    color = muted,
    leading = size * 1.4
  ) {
    const lines = wrapText(value, maxWidth, size, font);
    return drawLines(lines, x, top, size, font, color, leading);
  }

  // ============================================================
  // Interior page management
  // ============================================================

  function newPage(number, title, subtitle, continuation = false) {
    page = pdf.addPage([W, H]);

    box(0, 0, W, H, white);
    box(0, 0, W, 74, navy);
    box(0, 74, W, 3, accent);

    outline(margin, 17, 33, 33, coverLabel, .8);

    centerText(
      number,
      margin,
      23,
      33,
      16,
      bold,
      white
    );

    fittedText(
      title,
      margin + 45,
      16,
      width - 155,
      17,
      bold,
      white
    );

    fittedText(
      continuation ? `${subtitle} / continued` : subtitle,
      margin + 45,
      42,
      width - 53,
      8.5,
      regular,
      coverMuted
    );

    rightText(
      'SESSION REPORT',
      W - margin,
      17,
      7.5,
      bold,
      coverMuted
    );

    activeSection = { number, title, subtitle };
    cursor = CONTENT_TOP;
  }

  function continuePage() {
    if (!activeSection) return;

    const { number, title, subtitle } = activeSection;

    newPage(number, title, subtitle, true);
  }

  function ensureSpace(height) {
    if (cursor + height <= CONTENT_BOTTOM) return false;

    continuePage();
    return true;
  }

  function sectionHeading(number, title, keepWithNext = 0) {
    ensureSpace(27 + keepWithNext);

    text(number, margin, cursor + 1, 10, bold, blue);
    text(title, margin + 28, cursor, 12, bold, ink);

    box(margin, cursor + 19, width, .65, line);
    box(margin, cursor + 19, 24, 1.8, blue);

    cursor += 28;
  }

  function bodyParagraph(value, options = {}) {
    const {
      size = 9.5,
      font = regular,
      color = muted,
      leading = size * 1.4,
      gap = 9,
    } = options;

    const lines = wrapText(value, width, size, font);

    ensureSpace(lines.length * leading + gap);

    cursor += drawLines(
      lines,
      margin,
      cursor,
      size,
      font,
      color,
      leading
    ) + gap;
  }

  // ============================================================
  // Badges and directional markers
  // ============================================================

  function badgePalette(tone) {
    switch (tone) {
      case 'positive':
        return { background: greenPale, foreground: greenInk };

      case 'notice':
        return { background: amberPale, foreground: amberInk };

      case 'information':
        return { background: paleBlue, foreground: blue };

      default:
        return { background: neutralPale, foreground: neutralInk };
    }
  }

  function drawBadge(label, tone, x, top, maxWidth) {
    const size = 8;
    const colors = badgePalette(tone);

    const badgeWidth = Math.min(
      maxWidth,
      Math.max(25, measure(label, size, bold) + 12)
    );

    const badgeHeight = 15;

    box(
      x,
      top,
      badgeWidth,
      badgeHeight,
      colors.background
    );

    fittedText(
      label,
      x + 4,
      top + 3,
      badgeWidth - 8,
      size,
      bold,
      colors.foreground,
      'center'
    );
  }

  function directionOf(m) {
    if (!available(m.value) || !available(m.mean)) {
      return null;
    }

    if (m.value > m.mean) return 'up';
    if (m.value < m.mean) return 'down';

    return 'equal';
  }

  // Direction symbols are vector graphics, not text glyphs.
  // Helvetica / WinAnsi never receives unsupported arrow characters.
  function drawDirectionMark(direction, cx, cy, color = blue, size = 7) {
    const half = size / 2;

    if (direction === 'up') {
      page.drawSvgPath(
        `M 0 ${size} L ${half} 0 L ${size} ${size} Z`,
        {
          x: cx - half,
          y: H - cy + half,
          color,
        }
      );
      return;
    }

    if (direction === 'down') {
      page.drawSvgPath(
        `M 0 0 L ${size} 0 L ${half} ${size} Z`,
        {
          x: cx - half,
          y: H - cy + half,
          color,
        }
      );
      return;
    }

    if (direction === 'equal') {
      box(cx - half, cy - .8, size, 1.6, color);
    }
  }

  function drawDirectionCell(m, x, top, w, h) {
    const direction = directionOf(m);

    if (direction === null) {
      centerText('n/a', x, top + (h - 8.5) / 2, w, 8.5, regular, muted);
      return;
    }

    const label = direction === 'up'
      ? 'Above'
      : direction === 'down'
        ? 'Below'
        : 'Equal';

    const size = 8;
    const groupWidth = 10 + measure(label, size, regular);
    const left = x + (w - groupWidth) / 2;

    // The same color is used for every direction:
    // direction does not imply a favorable or unfavorable result.
    drawDirectionMark(direction, left + 3.5, top + h / 2, blue, 6);

    text(
      label,
      left + 10,
      top + (h - size) / 2 - .5,
      size,
      regular,
      ink
    );
  }

  function directionLegend() {
    const h = 33;

    ensureSpace(h + 8);

    box(margin, cursor, width, h, pale);
    outline(margin, cursor, width, h, line);

    const entries = [
      ['up', 'Above mean'],
      ['down', 'Below mean'],
      ['equal', 'Equal to mean'],
    ];

    const cellWidth = width / entries.length;

    entries.forEach(([direction, label], i) => {
      const x = margin + i * cellWidth;

      if (i > 0) {
        strokeLine(x, cursor + 7, x, cursor + h - 7, line);
      }

      drawDirectionMark(direction, x + 15, cursor + 15.5, blue, 7);

      text(
        label,
        x + 26,
        cursor + 11,
        8.5,
        regular,
        ink
      );
    });

    cursor += h + 9;
  }

  // ============================================================
  // Observed range bars
  // ============================================================

  function drawRangeBar(m, x, top, w, h) {
    const validBounds = available(m.min)
      && available(m.max)
      && m.min <= m.max;

    if (!validBounds) {
      centerText(
        'n/a',
        x,
        top + (h - 8) / 2,
        w,
        8,
        regular,
        muted
      );

      return;
    }

    const barX = x + 9;
    const barWidth = w - 18;
    const barY = top + h / 2 - 5;

    box(barX, barY, barWidth, 4, line);

    strokeLine(
      barX,
      barY - 2,
      barX,
      barY + 6,
      secondary,
      .6
    );

    strokeLine(
      barX + barWidth,
      barY - 2,
      barX + barWidth,
      barY + 6,
      secondary,
      .6
    );

    if (available(m.value)) {
      const fraction = m.max === m.min
        ? .5
        : Math.max(
          0,
          Math.min(1, (m.value - m.min) / (m.max - m.min))
        );

      const markerX = barX + fraction * barWidth;

      box(markerX - 1.4, barY - 3, 2.8, 10, blue);
    }

    if (m.min === m.max) {
      centerText(
        'Constant',
        x,
        barY + 11,
        w,
        7,
        regular,
        muted
      );
    } else {
      text('Min', barX, barY + 11, 7, regular, muted);

      rightText(
        'Max',
        barX + barWidth,
        barY + 11,
        7,
        regular,
        muted
      );
    }
  }

  // ============================================================
  // Reusable compact table renderer
  // ============================================================

  function tableColumns(definitions) {
    let x = margin;

    return definitions.map(definition => {
      const column = {
        ...definition,
        x,
      };

      x += definition.w;

      return column;
    });
  }

  function normalizeCell(value) {
    if (value !== null && typeof value === 'object') {
      return value;
    }

    return { text: String(value ?? dash) };
  }

  function layoutCell(cell, column, defaults) {
    const size = cell.size ?? column.size ?? defaults.size;
    const font = cell.font ?? column.font ?? regular;
    const leading = cell.leading ?? size * 1.3;
    const color = cell.color ?? column.color ?? ink;
    const align = cell.align ?? column.align ?? 'left';
    const pad = column.pad ?? defaults.pad;

    const innerWidth = column.w - pad * 2;

    if (cell.kind === 'badge') {
      return {
        ...cell,
        size,
        font,
        leading,
        color,
        align,
        pad,
        innerWidth,
        contentHeight: 15,
      };
    }

    if (cell.kind === 'direction') {
      return {
        ...cell,
        size,
        font,
        leading,
        color,
        align,
        pad,
        innerWidth,
        contentHeight: 16,
      };
    }

    if (cell.kind === 'range') {
      return {
        ...cell,
        size,
        font,
        leading,
        color,
        align,
        pad,
        innerWidth,
        contentHeight: 28,
      };
    }

    const value = String(cell.text ?? dash);
    const noWrap = cell.noWrap ?? column.noWrap ?? false;

    const lines = noWrap
      ? [value]
      : wrapText(value, innerWidth, size, font);

    return {
      ...cell,
      value,
      size,
      font,
      leading,
      color,
      align,
      pad,
      innerWidth,
      noWrap,
      lines,
      contentHeight: lines.length * leading,
    };
  }

  function drawTableHeader(columns, top, headerHeight) {
    box(margin, top, width, headerHeight, navy);

    columns.forEach((column, i) => {
      if (i > 0) {
        strokeLine(
          column.x,
          top + 5,
          column.x,
          top + headerHeight - 5,
          navyLight,
          .5
        );
      }

      const size = column.headerSize ?? 8.2;
      const pad = column.pad ?? 6;
      const label = String(column.label);

      fittedText(
        label,
        column.x + pad,
        top + (headerHeight - size) / 2 - .5,
        column.w - pad * 2,
        size,
        bold,
        white,
        column.headerAlign ?? column.align ?? 'left'
      );
    });

    return top + headerHeight;
  }

  function drawTableRow(columns, cells, top, h, rowIndex) {
    box(
      margin,
      top,
      width,
      h,
      rowIndex % 2 === 0 ? white : pale
    );

    columns.forEach((column, i) => {
      const cell = cells[i];

      if (i > 0) {
        strokeLine(
          column.x,
          top,
          column.x,
          top + h,
          line,
          .35
        );
      }

      if (cell.kind === 'badge') {
        drawBadge(
          cell.label,
          cell.tone,
          column.x + cell.pad,
          top + (h - 15) / 2,
          cell.innerWidth
        );

        return;
      }

      if (cell.kind === 'direction') {
        drawDirectionCell(
          cell.metric,
          column.x,
          top,
          column.w,
          h
        );

        return;
      }

      if (cell.kind === 'range') {
        drawRangeBar(
          cell.metric,
          column.x,
          top,
          column.w,
          h
        );

        return;
      }

      const textTop = top + (h - cell.contentHeight) / 2;

      if (cell.noWrap) {
        fittedText(
          cell.value,
          column.x + cell.pad,
          textTop,
          cell.innerWidth,
          cell.size,
          cell.font,
          cell.color,
          cell.align
        );

        return;
      }

      cell.lines.forEach((value, lineIndex) => {
        const lineTop = textTop + lineIndex * cell.leading;

        if (cell.align === 'center') {
          centerText(
            value,
            column.x + cell.pad,
            lineTop,
            cell.innerWidth,
            cell.size,
            cell.font,
            cell.color
          );
        } else if (cell.align === 'right') {
          rightText(
            value,
            column.x + column.w - cell.pad,
            lineTop,
            cell.size,
            cell.font,
            cell.color
          );
        } else {
          text(
            value,
            column.x + cell.pad,
            lineTop,
            cell.size,
            cell.font,
            cell.color
          );
        }
      });
    });

    strokeLine(margin, top + h, W - margin, top + h, line, .45);
    strokeLine(margin, top, margin, top + h, line, .45);
    strokeLine(W - margin, top, W - margin, top + h, line, .45);
  }

  function drawTable(definitions, rows, options = {}) {
    const defaults = {
      size: options.size ?? 9,
      pad: options.pad ?? 6,
    };

    const columns = tableColumns(definitions);

    const headerHeight = options.headerHeight ?? 25;
    const minRowHeight = options.minRowHeight ?? 24;
    const verticalPad = options.verticalPad ?? 5;
    const afterGap = options.afterGap ?? 12;

    const preparedRows = rows.map(row => {
      const cells = columns.map((column, i) =>
        layoutCell(
          normalizeCell(row[i]),
          column,
          defaults
        )
      );

      const height = Math.max(
        minRowHeight,
        ...cells.map(cell => cell.contentHeight + verticalPad * 2)
      );

      return { cells, height };
    });

    const firstRowHeight = preparedRows[0]?.height ?? 0;

    ensureSpace(headerHeight + firstRowHeight);

    cursor = drawTableHeader(columns, cursor, headerHeight);

    preparedRows.forEach((row, rowIndex) => {
      if (cursor + row.height > CONTENT_BOTTOM) {
        continuePage();
        cursor = drawTableHeader(columns, cursor, headerHeight);
      }

      drawTableRow(
        columns,
        row.cells,
        cursor,
        row.height,
        rowIndex
      );

      cursor += row.height;
    });

    cursor += afterGap;
  }

  // ============================================================
  // Numbered clinical-style callouts
  // ============================================================

  function callout(number, title, body, options = {}) {
    const {
      tone = 'information',
      background = pale,
      titleSize = 10,
      bodySize = 9,
      leading = bodySize * 1.35,
      gap = 7,
    } = options;

    const badgeX = margin + 9;
    const textX = margin + 43;
    const innerWidth = width - 55;

    const titleLines = wrapText(title, innerWidth, titleSize, bold);
    const bodyLines = wrapText(body, innerWidth, bodySize, regular);

    const titleHeight = titleLines.length * titleSize * 1.25;
    const bodyHeight = bodyLines.length * leading;

    const h = Math.max(42, 9 + titleHeight + 4 + bodyHeight + 9);

    ensureSpace(h);

    const colors = badgePalette(tone);

    box(margin, cursor, width, h, background);
    outline(margin, cursor, width, h, line, .5);
    box(margin, cursor, 2.5, h, colors.foreground);

    box(badgeX, cursor + 10, 24, 21, colors.background);

    centerText(
      String(number).padStart(2, '0'),
      badgeX,
      cursor + 14,
      24,
      9,
      bold,
      colors.foreground
    );

    drawLines(
      titleLines,
      textX,
      cursor + 9,
      titleSize,
      bold,
      ink,
      titleSize * 1.25
    );

    drawLines(
      bodyLines,
      textX,
      cursor + 9 + titleHeight + 4,
      bodySize,
      regular,
      muted,
      leading
    );

    cursor += h + gap;
  }

  // ============================================================
  // COVER
  // ============================================================

  page = pdf.addPage([W, H]);

  // Vector-only gradient: no image assets, external fonts or requests.
  const gradientSteps = 120;
  const gradientHeight = H / gradientSteps;

  for (let i = 0; i < gradientSteps; i++) {
    const fraction = i / (gradientSteps - 1);

    const color = rgb(
      .025 + .035 * fraction,
      .065 + .115 * fraction,
      .135 + .170 * fraction
    );

    box(
      0,
      i * gradientHeight,
      W,
      gradientHeight + .25,
      color
    );
  }

  // Fine architectural grid.
  for (let x = 0; x < W; x += 24) {
    box(x, 0, .35, H, coverLabel, .085);
  }

  for (let y = 0; y < H; y += 24) {
    box(0, y, W, .35, coverLabel, .085);
  }

  box(margin, 40, 44, 3, accent);

  fittedText(
    'MULTIMODAL FACIAL SENSING · SESSION REPORT',
    margin,
    58,
    width,
    10,
    bold,
    coverLabel
  );

  text(
    'Session report',
    margin,
    145,
    43,
    bold,
    white
  );

  fittedText(
    'Local facial micro-motion observations',
    margin,
    207,
    width,
    19,
    regular,
    coverMuted
  );

  box(margin, 249, width, .7, coverLabel, .55);

  // Session facts only. No interpretations or conclusions.
  const coverFacts = [
    {
      label: 'SIGNAL SOURCE',
      value: source,
      fontSize: 13,
      wrap: true,
    },
    {
      label: 'SESSION DURATION',
      value: available(session.elapsed_seconds)
        ? `${session.elapsed_seconds} s`
        : 'n/a',
      fontSize: 25,
      wrap: false,
    },
    {
      label: 'VALID FRAMES',
      value: qualityValue(session.valid_frames),
      fontSize: 25,
      wrap: false,
    },
  ];

  const factsTop = 294;
  const factsHeight = 108;
  const factGap = 8;
  const factWidth = (width - factGap * 2) / 3;

  coverFacts.forEach((fact, i) => {
    const x = margin + i * (factWidth + factGap);

    box(x, factsTop, factWidth, factsHeight, navyDeep, .76);
    outline(x, factsTop, factWidth, factsHeight, coverLabel, .5);
    box(x, factsTop, factWidth, 2, accent);

    fittedText(
      fact.label,
      x + 12,
      factsTop + 14,
      factWidth - 24,
      8,
      bold,
      coverLabel
    );

    if (fact.wrap) {
      const lines = wrapText(
        fact.value,
        factWidth - 24,
        fact.fontSize,
        bold
      );

      drawLines(
        lines,
        x + 12,
        factsTop + 38,
        fact.fontSize,
        bold,
        white,
        fact.fontSize * 1.25
      );
    } else {
      fittedText(
        fact.value,
        x + 12,
        factsTop + 39,
        factWidth - 24,
        fact.fontSize,
        bold,
        white
      );
    }
  });

  // Session metadata, arranged in two columns.
  const metaTop = 515;

  text(
    'SESSION INFORMATION',
    margin,
    metaTop,
    10,
    bold,
    coverLabel
  );

  box(margin, metaTop + 20, width, .7, coverLabel, .55);

  const meta = [
    {
      label: 'Report ID',
      value: dateText(reportId),
      note: 'Session start timestamp',
    },
    {
      label: 'Session time (UTC)',
      value: dateText(session.started_at),
    },
    {
      label: 'Method',
      value: method,
    },
    {
      label: 'Generated (UTC)',
      value: dateText(report.generated_at),
    },
  ];

  const metaGap = 22;
  const metaWidth = (width - metaGap) / 2;

  meta.forEach((item, i) => {
    const x = margin + (i % 2) * (metaWidth + metaGap);
    const top = metaTop + 38 + Math.floor(i / 2) * 78;

    text(
      item.label,
      x,
      top,
      9,
      bold,
      coverLabel
    );

    fittedText(
      item.value,
      x,
      top + 18,
      metaWidth,
      11,
      regular,
      white
    );

    if (item.note) {
      text(
        item.note,
        x,
        top + 35,
        8,
        regular,
        coverMuted
      );
    }

    box(x, top + 55, metaWidth, .5, coverLabel, .35);
  });

  // ============================================================
  // 01 / Session & Data Quality
  // ============================================================

  newPage(
    '01',
    'Session & Data Quality',
    'Session information and recorded data availability'
  );

  sectionHeading('1.1', 'Session information', 50);

  const sessionRows = [
    ['Report ID', dateText(reportId)],
    ['Signal source', source],
    ['Session started (UTC)', dateText(session.started_at)],
    ['Report generated (UTC)', dateText(report.generated_at)],
    ['Session duration', qualityValue(session.elapsed_seconds, ' s')],
    ['Valid tracking duration', qualityValue(session.valid_tracking_seconds, ' s')],
    ['Valid frames', qualityValue(session.valid_frames)],
    ['Missing frames', qualityValue(session.missing_frames)],
    ['Completed blinks', qualityValue(session.blink_count)],
    ['Method', method],
  ];

  drawTable(
    [
      {
        label: 'Field',
        w: 171,
        font: bold,
        color: muted,
      },
      {
        label: 'Recorded value',
        w: width - 171,
      },
    ],
    sessionRows,
    {
      size: 9,
      headerHeight: 21,
      minRowHeight: 19,
      verticalPad: 3,
      afterGap: 12,
    }
  );

  sectionHeading('1.2', 'Data quality checks', 72);

  bodyParagraph(
    'Verdicts describe recorded data availability and missing observations. ' +
    'No validated quality thresholds or overall quality grade are applied.',
    {
      size: 8.5,
      gap: 4,
    }
  );

  function qualityRow(
    label,
    value,
    suffix,
    presentVerdict,
    presentTone,
    presentNote,
    unavailableNote
  ) {
    if (!available(value)) {
      return [
        { text: label, font: bold },
        'n/a',
        {
          kind: 'badge',
          label: 'n/a',
          tone: 'neutral',
        },
        unavailableNote,
      ];
    }

    return [
      { text: label, font: bold },
      qualityValue(value, suffix),
      {
        kind: 'badge',
        label: presentVerdict,
        tone: presentTone,
      },
      presentNote,
    ];
  }

  const qualityRows = [
    qualityRow(
      'Valid frames',
      session.valid_frames,
      '',
      session.valid_frames > 0 ? 'Available' : 'None',
      session.valid_frames > 0 ? 'positive' : 'notice',
      session.valid_frames > 0
        ? 'Valid tracking frames are recorded in this session.'
        : 'No valid tracking frames are recorded.',
      'A valid-frame count is unavailable.'
    ),

    qualityRow(
      'Missing frames',
      session.missing_frames,
      '',
      session.missing_frames === 0 ? 'None recorded' : 'Present',
      session.missing_frames === 0 ? 'positive' : 'notice',
      session.missing_frames === 0
        ? 'No missing frames are recorded.'
        : 'Missing frames are recorded. Tracking is not continuous across all recorded frames.',
      'A missing-frame count is unavailable.'
    ),

    qualityRow(
      'Valid tracking time',
      session.valid_tracking_seconds,
      ' s',
      session.valid_tracking_seconds > 0 ? 'Available' : 'None',
      session.valid_tracking_seconds > 0 ? 'positive' : 'notice',
      session.valid_tracking_seconds > 0
        ? 'Time with valid tracking is recorded.'
        : 'No valid tracking time is recorded.',
      'Valid tracking duration is unavailable.'
    ),

    qualityRow(
      'Session duration',
      session.elapsed_seconds,
      ' s',
      session.elapsed_seconds > 0 ? 'Recorded' : 'No duration',
      session.elapsed_seconds > 0 ? 'information' : 'notice',
      session.elapsed_seconds > 0
        ? 'The recorded observation window is shown without a minimum-duration grade.'
        : 'No positive observation duration is recorded.',
      'Session duration is unavailable.'
    ),

    qualityRow(
      'Completed blinks',
      session.blink_count,
      '',
      'Recorded',
      'information',
      'Observed completed-blink count. No adequacy or normality threshold is applied.',
      'A completed-blink count is unavailable.'
    ),

    [
      { text: 'Tracking accuracy', font: bold },
      'n/a',
      {
        kind: 'badge',
        label: 'n/a',
        tone: 'neutral',
      },
      'Not measured or independently validated in the report.',
    ],

    [
      { text: 'Capture conditions', font: bold },
      'n/a',
      {
        kind: 'badge',
        label: 'n/a',
        tone: 'neutral',
      },
      'Lighting and image-quality measurements are not supplied.',
    ],
  ];

  drawTable(
    [
      {
        label: 'Check',
        w: 115,
      },
      {
        label: 'Value',
        w: 69,
        align: 'center',
        noWrap: true,
      },
      {
        label: 'Verdict',
        w: 96,
      },
      {
        label: 'Note',
        w: width - 280,
        size: 8.5,
        color: muted,
      },
    ],
    qualityRows,
    {
      size: 9,
      headerHeight: 22,
      minRowHeight: 29,
      verticalPad: 4,
      afterGap: 10,
    }
  );

  // Only report actual session conditions.
  // No invented quality scores, duration thresholds or diagnoses.
  const qualityNotes = [];

  if (report.synthetic) {
    qualityNotes.push({
      title: 'Synthetic sample',
      body:
        'This session uses artificial landmarks. ' +
        'The recorded signals describe the sample, not a person.',
      tone: 'information',
    });
  }

  if (available(session.elapsed_seconds)) {
    qualityNotes.push({
      title: 'Recorded observation window',
      body:
        `The session duration is ${session.elapsed_seconds} s. ` +
        'All observations and statistics are limited to this recorded window. ' +
        'No minimum-duration requirement or adequacy grade is applied.',
      tone: session.elapsed_seconds === 0 ? 'notice' : 'information',
    });
  }

  if (
    available(session.missing_frames)
    && session.missing_frames > 0
  ) {
    qualityNotes.push({
      title: 'Missing tracking observations',
      body:
        `${session.missing_frames} missing frames are recorded. ` +
        'Missing observations should be considered when reading the session statistics.',
      tone: 'notice',
    });
  }

  if (
    available(session.valid_frames)
    && session.valid_frames === 0
  ) {
    qualityNotes.push({
      title: 'No valid tracking frames',
      body:
        'The report records no valid tracking frames. ' +
        'Unavailable signal readings must not be interpreted as measured values.',
      tone: 'notice',
    });
  }

  if (
    available(session.valid_tracking_seconds)
    && available(session.elapsed_seconds)
    && session.valid_tracking_seconds < session.elapsed_seconds
  ) {
    qualityNotes.push({
      title: 'Valid tracking duration',
      body:
        `Valid tracking is recorded for ${session.valid_tracking_seconds} s ` +
        `within a session duration of ${session.elapsed_seconds} s.`,
      tone: 'information',
    });
  }

  const unavailableMetrics = metrics.filter(
    m => !available(m.value)
  );

  if (unavailableMetrics.length > 0) {
    qualityNotes.push({
      title: 'Unavailable current readings',
      body:
        unavailableMetrics.map(m => {
          const reason = typeof m.reason === 'string' && m.reason.length
            ? ` (${m.reason})`
            : '';

          return `${m.label}${reason}`;
        }).join('; ') +
        '. No substitute current values are assigned.',
      tone: 'notice',
    });
  }

  const constantMetrics = metrics.filter(
    m =>
      available(m.min)
      && available(m.max)
      && m.min === m.max
  );

  if (constantMetrics.length > 0) {
    qualityNotes.push({
      title: 'Constant observed ranges',
      body:
        constantMetrics.map(m => m.label).join('; ') +
        '. The recorded minimum and maximum are equal. ' +
        'A center marker represents the constant observed value.',
      tone: 'information',
    });
  }

  if (qualityNotes.length === 0) {
    qualityNotes.push({
      title: 'Session-specific record',
      body:
        'The quality checks above reproduce the available session fields. ' +
        'Unavailable measurements remain unavailable.',
      tone: 'information',
    });
  }

  sectionHeading('1.3', 'Data quality notes', 65);

  qualityNotes.forEach((note, i) => {
    callout(
      i + 1,
      note.title,
      note.body,
      {
        tone: note.tone,
        bodySize: 8.8,
        gap: 6,
      }
    );
  });

  // ============================================================
  // 02 / Demonstration Signals
  // ============================================================

  newPage(
    '02',
    'Demonstration Signals',
    'Current readings and within-session statistics'
  );

  sectionHeading('2.1', 'Signal observations', 100);

  bodyParagraph(
    'Demonstration proxies, not SDK parameters.',
    {
      font: bold,
      color: blue,
      size: 10,
      gap: 5,
    }
  );

  bodyParagraph(
    'Status indicates the position within this session only: ' +
    'the direction of the current reading relative to its session mean. ' +
    'It does not represent improvement, deterioration, normality or risk.',
    {
      size: 9.5,
      gap: 7,
    }
  );

  bodyParagraph(
    'Values are the last valid current readings in the frozen report. ' +
    'All ranges are observed within this session. ' +
    'They are not reference ranges or targets.',
    {
      size: 9.5,
      gap: 10,
    }
  );

  directionLegend();

  const metricRows = metrics.map(m => [
    {
      text: m.label,
      font: bold,
    },
    {
      text: reading(m),
      font: bold,
      color: available(m.value) ? blue : muted,
      noWrap: true,
    },
    {
      text: n(m.mean),
      noWrap: true,
    },
    {
      kind: 'direction',
      metric: m,
    },
    {
      text: n(m.min),
      noWrap: true,
    },
    {
      text: n(m.max),
      noWrap: true,
    },
    {
      kind: 'range',
      metric: m,
    },
  ]);

  drawTable(
    [
      {
        label: 'Signal',
        w: 111,
      },
      {
        label: 'Current',
        w: 86,
        align: 'center',
      },
      {
        label: 'Mean',
        w: 62,
        align: 'center',
      },
      {
        label: 'Status',
        w: 56,
        align: 'center',
      },
      {
        label: 'Min',
        w: 60,
        align: 'center',
      },
      {
        label: 'Max',
        w: 60,
        align: 'center',
      },
      {
        label: 'Observed range',
        w: width - 435,
        headerAlign: 'center',
      },
    ],
    metricRows,
    {
      size: 8.8,
      headerHeight: 27,
      minRowHeight: 43,
      verticalPad: 7,
      afterGap: 17,
    }
  );

  sectionHeading('2.2', 'Reading the observed range', 70);

  callout(
    1,
    'Range position',
    'The marker shows the current reading between the minimum and maximum ' +
    'recorded for that signal during this session. The range is not a reference interval.',
    {
      bodySize: 9,
    }
  );

  callout(
    2,
    'Constant ranges and unavailable readings',
    'When minimum and maximum are equal, a valid current reading is marked ' +
    'at the center. When the current reading is unavailable, no position marker is drawn. ' +
    'An unavailable observed range is marked n/a.',
    {
      bodySize: 9,
    }
  );

  callout(
    3,
    'Independent signal scales',
    'Each signal has its own observed range and unit. ' +
    'Marker positions cannot be compared across different signals. ' +
    'Direction and range position are descriptive observations only.',
    {
      bodySize: 9,
    }
  );

  // ============================================================
  // 03 / SDK Parameter Register
  // ============================================================

  newPage(
    '03',
    'SDK Parameter Register',
    `Standard v${report.standard_schema_version} / issued ${report.standard_issued_at}`
  );

  sectionHeading('3.1', 'Complete parameter register', 80);

  // One shared declaration for all SDK parameters.
  const declarationLines = wrapText(
    PDF_SDK_ONLY,
    width - 24,
    10.5,
    bold
  );

  const declarationHeight = declarationLines.length * 14 + 18;

  ensureSpace(declarationHeight + 8);

  box(margin, cursor, width, declarationHeight, paleBlue);
  outline(margin, cursor, width, declarationHeight, line);
  box(margin, cursor, 3, declarationHeight, blue);

  drawLines(
    declarationLines,
    margin + 12,
    cursor + 8,
    10.5,
    bold,
    blue,
    14
  );

  cursor += declarationHeight + 9;

  bodyParagraph(
    'Reference constants only. No SDK result, mean, status, minimum, ' +
    'maximum or interpretation is computed here. An em dash denotes ' +
    'a result that is not computed, not a measured zero.',
    {
      size: 9,
      gap: 9,
    }
  );

  const sdkRows = report.items.map(item => [
    {
      text: item.u,
      font: bold,
      color: ink,
      noWrap: true,
    },
    {
      text: item.name_en,
      size: 8.8,
    },
    {
      text: dash,
      color: secondary,
    },
    {
      text: dash,
      color: secondary,
    },
    {
      text: dash,
      color: secondary,
    },
    {
      text: dash,
      color: secondary,
    },
    {
      text: dash,
      color: secondary,
    },
    {
      text: referenceText(item),
      noWrap: true,
      size: 8.3,
      color: muted,
    },
  ]);

  drawTable(
    [
      {
        label: '#',
        w: 31,
        align: 'center',
        pad: 4,
      },
      {
        label: 'Parameter',
        w: 145,
        pad: 6,
      },
      {
        label: 'Result',
        w: 42,
        align: 'center',
        pad: 4,
      },
      {
        label: 'Mean',
        w: 38,
        align: 'center',
        pad: 4,
      },
      {
        label: 'Status',
        w: 42,
        align: 'center',
        pad: 4,
      },
      {
        label: 'Min',
        w: 33,
        align: 'center',
        pad: 4,
      },
      {
        label: 'Max',
        w: 33,
        align: 'center',
        pad: 4,
      },
      {
        label: 'Reference range (v1.0)',
        w: width - 364,
        pad: 6,
      },
    ],
    sdkRows,
    {
      size: 8.5,
      headerHeight: 25,
      minRowHeight: 20,
      verticalPad: 3,
      afterGap: 10,
    }
  );

  // Reference notes are derived from the supplied register rather
  // than duplicating parameter IDs or reference constants in code.
  const referenceNotes = [];

  const provisionalItems = report.items.filter(
    item => item.standard_reference?.status === 'provisional'
  );

  if (provisionalItems.length > 0) {
    referenceNotes.push(
      `${provisionalItems.map(item => item.u).join(', ')}: ` +
      'the supplied reference is provisional.'
    );
  }

  const empiricalItems = report.items.filter(item => {
    const r = item.standard_reference;
    return r?.empirical_max != null;
  });

  if (empiricalItems.length > 0) {
    referenceNotes.push(
      `${empiricalItems.map(item => item.u).join(', ')}: ` +
      'empirical upper limits are identified in the register.'
    );
  }

  const absentReferenceItems = report.items.filter(item => {
    const r = item.standard_reference;
    return !r || r.min === null || r.max === null;
  });

  if (absentReferenceItems.length > 0) {
    referenceNotes.push(
      `${absentReferenceItems.map(item => item.u).join(', ')}: ` +
      'no complete reference interval is established.'
    );
  }

  referenceNotes.push(
    'These constants are not applied to the demonstration signals ' +
    'or to any measured result here.'
  );

  const referenceNoteText = referenceNotes.join(' ');

  const referenceNoteLines = wrapText(
    referenceNoteText,
    width - 55,
    8.5,
    regular
  );

  const referenceNoteHeight = Math.max(
    42,
    9 + 10 * 1.25 + 4 +
      referenceNoteLines.length * 8.5 * 1.35 + 9
  );

  ensureSpace(28 + referenceNoteHeight);

  sectionHeading('3.2', 'Reference notes');

  callout(
    1,
    'Reference scope',
    referenceNoteText,
    {
      bodySize: 8.5,
      gap: 0,
    }
  );

  // ============================================================
  // 04 / Signal Interpretation & Reading Notes
  // ============================================================

  newPage(
    '04',
    'Signal Interpretation & Reading Notes',
    'Within-session observations, scope and limitations'
  );

  sectionHeading('4.1', 'Signal interpretation', 70);

  bodyParagraph(
    'The following observations describe only the demonstration signals ' +
    'and their positions within the recorded session. ' +
    'No emotional, physiological or clinical state is inferred.',
    {
      size: 9,
      gap: 9,
    }
  );

  function interpretationBlock(m, index) {
    const number = String(index + 1).padStart(2, '0');

    const bodyX = margin + 44;
    const bodyWidth = width - 56;

    const titleSize = 11;
    const currentSize = 9.5;
    const descriptionSize = 9;
    const positionSize = 8.8;

    const titleLeading = 14;
    const descriptionLeading = 12;
    const positionLeading = 12;

    const titleLines = wrapText(
      m.label,
      bodyWidth,
      titleSize,
      bold
    );

    const descriptionLines = wrapText(
      m.description,
      bodyWidth,
      descriptionSize,
      regular
    );

    // Retain positionText wording without reinterpretation.
    const positionLines = wrapText(
      positionText(m),
      bodyWidth - 16,
      positionSize,
      regular
    );

    const titleHeight = titleLines.length * titleLeading;
    const descriptionHeight =
      descriptionLines.length * descriptionLeading;

    const positionHeight =
      positionLines.length * positionLeading + 12;

    const h =
      9 +
      titleHeight +
      4 +
      13 +
      5 +
      descriptionHeight +
      7 +
      positionHeight +
      9;

    ensureSpace(h);

    box(margin, cursor, width, h, white);
    outline(margin, cursor, width, h, line, .6);
    box(margin, cursor, 2.5, h, blue);

    box(margin + 10, cursor + 10, 24, 22, navy);

    centerText(
      number,
      margin + 10,
      cursor + 14,
      24,
      10,
      bold,
      white
    );

    let top = cursor + 9;

    top += drawLines(
      titleLines,
      bodyX,
      top,
      titleSize,
      bold,
      ink,
      titleLeading
    );

    top += 4;

    fittedText(
      `Current reading: ${reading(m)}`,
      bodyX,
      top,
      bodyWidth,
      currentSize,
      bold,
      blue
    );

    top += 18;

    top += drawLines(
      descriptionLines,
      bodyX,
      top,
      descriptionSize,
      regular,
      ink,
      descriptionLeading
    );

    top += 7;

    box(
      bodyX,
      top,
      bodyWidth,
      positionHeight,
      pale
    );

    drawLines(
      positionLines,
      bodyX + 8,
      top + 6,
      positionSize,
      regular,
      muted,
      positionLeading
    );

    cursor += h + 8;
  }

  metrics.forEach((m, i) => {
    interpretationBlock(m, i);
  });

  // Preserve all five original Reading notes verbatim.
  const notes = [
    ['A frozen session', 'The report, on-page display and JSON export use the same session snapshot. Current readings and session statistics retain their exported precision. No new measurement is made while creating this PDF.'],
    ['Observed ranges', 'Each marker uses its own session minimum and maximum. A constant range is marked at the center. Unavailable readings have no marker. Marker positions cannot be compared across signals. No population percentile, target, grade or risk level is assigned.'],
    ['Data availability', 'Only the four demonstration signals are measured. The 21-item register lists names and standard v1.0 reference constants for context. Every SDK result is unavailable in this demo. An absent reference interval is not replaced with a default range.'],
    ['Local data handling', 'The PDF is generated locally when downloaded. This demo does not upload video or landmarks and does not use persistent browser storage. No personal profile, photograph or identity record is included in this report.'],
    ['Limitations', 'These uncalibrated geometry proxies describe observations, including tracking noise and movement. They do not establish emotion, health, attention, identity or a clinical or psychological conclusion. Synthetic samples describe artificial landmarks, not a person.'],
  ];

  cursor += 4;

  sectionHeading('4.2', 'Reading notes', 80);

  notes.forEach(([title, body], i) => {
    callout(
      i + 1,
      title,
      body,
      {
        titleSize: 10.5,
        bodySize: 9.2,
        leading: 12.5,
        gap: 7,
        tone: 'information',
        background: i % 2 === 0 ? pale : white,
      }
    );
  });

  // Closing limitation statement, visually separated from observations.
  const limitationsTitle = 'Scope of this report';

  const limitationsBody =
    'This document is a demonstration record of locally measured geometry. ' +
    'It is not a clinical report, diagnostic instrument or validated assessment. ' +
    'The SDK reference register is provided for context only.';

  const limitationLines = wrapText(
    limitationsBody,
    width - 24,
    9,
    regular
  );

  const limitationHeight = 36 + limitationLines.length * 12.5;

  ensureSpace(limitationHeight + 6);

  box(
    margin,
    cursor,
    width,
    limitationHeight,
    paleBlue
  );

  outline(
    margin,
    cursor,
    width,
    limitationHeight,
    line,
    .6
  );

  box(
    margin,
    cursor,
    width,
    2,
    navy
  );

  text(
    limitationsTitle,
    margin + 12,
    cursor + 10,
    10.5,
    bold,
    navy
  );

  drawLines(
    limitationLines,
    margin + 12,
    cursor + 28,
    9,
    regular,
    muted,
    12.5
  );

  cursor += limitationHeight;

  // ============================================================
  // Footer / final pagination
  // ============================================================

  const pages = pdf.getPages();
  const totalPages = pdf.getPageCount();

  pages.forEach((p, i) => {
    page = p;

    const isCover = i === 0;
    const footerColor = isCover ? coverMuted : muted;
    const footerRule = isCover ? coverLabel : line;

    box(
      margin,
      FOOTER_TOP,
      width,
      .6,
      footerRule,
      isCover ? .5 : 1
    );

    text(
      'Demonstration only. No emotion or health assessment.',
      margin,
      FOOTER_TOP + 10,
      8,
      regular,
      footerColor
    );

    rightText(
      `${i + 1} / ${totalPages}`,
      W - margin,
      FOOTER_TOP + 10,
      8,
      bold,
      footerColor
    );
  });

  return pdf.save();
}
