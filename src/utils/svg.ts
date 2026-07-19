import { escapeHtml, formatMoney, formatPeriod } from '../format';

/**
 * Sparkline over a monthly series. Values are already in $m. Returns an inline
 * SVG string — cheap enough to build hundreds for a table.
 */
export function sparkline(
  values: number[],
  opts: { width?: number; height?: number; colour?: string; periods?: string[] } = {},
): string {
  const w = opts.width ?? 96;
  const h = opts.height ?? 22;
  const colour = opts.colour ?? 'var(--accent-export)';
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;

  const max = Math.max(...clean);
  const min = Math.min(...clean, 0);
  const span = max - min || 1;
  const step = w / (clean.length - 1);
  const pts = clean.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`);

  const last = clean[clean.length - 1];
  const lastX = (clean.length - 1) * step;
  const lastY = h - ((last - min) / span) * h;

  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"
    role="img" aria-label="Trend, ending ${escapeHtml(formatMoney(last))} per month">
    <polyline points="${pts.join(' ')}" fill="none" stroke="${colour}" stroke-width="1.25"
      stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="1.8" fill="${colour}" />
  </svg>`;
}

/**
 * Larger, interactive line chart with hoverable points. Used in drill-downs
 * where the reader needs to read values off the line, not just see a shape.
 */
export function lineChart(
  seriesList: Array<{ values: number[]; colour: string; label: string }>,
  periods: string[],
  opts: { width?: number; height?: number; zeroLine?: boolean } = {},
): string {
  const w = opts.width ?? 640;
  const h = opts.height ?? 180;
  const pad = { t: 8, r: 8, b: 18, l: 52 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;

  const all = seriesList.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length) return '';
  const max = Math.max(...all, 0);
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const x = (i: number, n: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih;

  const gridValues = [min, min + span / 2, max].filter((v, i, a) => a.indexOf(v) === i);
  const grid = gridValues
    .map(
      (v) =>
        `<line x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${w - pad.r}" y2="${y(v).toFixed(1)}"
          stroke="var(--border-subtle)" stroke-width="1" />
         <text x="${pad.l - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end"
           class="axis-label">${escapeHtml(formatMoney(v))}</text>`,
    )
    .join('');

  const zero =
    opts.zeroLine && min < 0 && max > 0
      ? `<line x1="${pad.l}" y1="${y(0).toFixed(1)}" x2="${w - pad.r}" y2="${y(0).toFixed(1)}"
          stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="3 2" />`
      : '';

  const lines = seriesList
    .map((s) => {
      const pts = s.values
        .map((v, i) => `${x(i, s.values.length).toFixed(1)},${y(v).toFixed(1)}`)
        .join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${s.colour}" stroke-width="1.6"
        stroke-linejoin="round" />`;
    })
    .join('');

  // One hover target per period, spanning the full height — a thin line is
  // almost impossible to hit with a mouse.
  const n = periods.length;
  const hit = periods
    .map((p, i) => {
      const cx = x(i, n);
      const bw = iw / Math.max(1, n - 1);
      const tip = seriesList
        .map((s) => `${escapeHtml(s.label)}: ${escapeHtml(formatMoney(s.values[i] ?? 0))}`)
        .join(' · ');
      return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${pad.t}" width="${bw.toFixed(1)}" height="${ih}"
        fill="transparent" class="chart-hit"
        data-tip="${escapeHtml(formatPeriod(p))} — ${tip}" />`;
    })
    .join('');

  const firstLabel = periods.length ? formatPeriod(periods[0]) : '';
  const lastLabel = periods.length ? formatPeriod(periods[periods.length - 1]) : '';

  return `<svg viewBox="0 0 ${w} ${h}" class="line-chart" preserveAspectRatio="xMidYMid meet" role="img"
    aria-label="${escapeHtml(seriesList.map((s) => s.label).join(' and '))} over time">
    ${grid}${zero}${lines}${hit}
    <text x="${pad.l}" y="${h - 4}" class="axis-label">${escapeHtml(firstLabel)}</text>
    <text x="${w - pad.r}" y="${h - 4}" text-anchor="end" class="axis-label">${escapeHtml(lastLabel)}</text>
  </svg>`;
}

/** Horizontal ranked bars with hover tooltips. */
export function barRow(
  label: string,
  value: number,
  max: number,
  opts: { colour?: string; tip?: string; sub?: string } = {},
): string {
  const pct = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  return `<div class="bar-row" data-tip="${escapeHtml(opts.tip ?? `${label}: ${formatMoney(value)}`)}">
    <span class="bar-label">${escapeHtml(label)}</span>
    <span class="bar-track">
      <span class="bar-fill" style="width:${pct.toFixed(2)}%;background:${opts.colour ?? 'var(--accent-export)'}"></span>
    </span>
    <span class="bar-value">${escapeHtml(formatMoney(value))}</span>
    ${opts.sub ? `<span class="bar-sub">${escapeHtml(opts.sub)}</span>` : ''}
  </div>`;
}

/** Nice round axis ticks covering [0, max]. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max * 1.0001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}
