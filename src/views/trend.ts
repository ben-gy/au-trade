// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { escapeHtml, formatBalance, formatMoney, formatPeriod, formatPeriodLong } from '../format';
import { gloss } from '../glossary';
import { FLOW_COLOURS } from '../palette';
import type { Dataset } from '../types';
import type { ViewContext } from './types';

const W = 1060;
const H = 460;
const PAD = { t: 20, r: 20, b: 44, l: 70 };

/**
 * Thirty years of monthly trade, annotated.
 *
 * Annotations are anchored to the month the event began, and every one of them
 * is a documented policy or macro event — not a reading of the line. If an
 * annotation ever falls outside the data window it is simply skipped.
 */
const EVENTS: Array<{ period: string; label: string; note: string }> = [
  { period: '2003-01', label: 'China boom begins', note: 'Chinese steel demand starts lifting iron ore and coal volumes.' },
  { period: '2008-09', label: 'Global financial crisis', note: 'Commodity prices and trade volumes fall sharply.' },
  { period: '2012-06', label: 'Iron ore price peak passes', note: 'The investment phase of the mining boom turns to the export phase.' },
  { period: '2015-01', label: 'LNG export ramp-up', note: 'Queensland and WA LNG trains come online, lifting gas exports.' },
  { period: '2020-03', label: 'COVID-19', note: 'Border closures and supply-chain disruption.' },
  { period: '2020-05', label: 'China trade restrictions', note: 'Tariffs and import suspensions applied to barley, wine, coal, timber and other goods.' },
  { period: '2022-03', label: 'Energy price shock', note: 'The invasion of Ukraine drives coal and gas prices to records.' },
  { period: '2023-08', label: 'Restrictions lifted', note: 'Chinese duties on Australian barley and later wine are removed.' },
];

export function renderTrend(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const smooth = ctx.getState('trendSmooth', '12') === '12';
  const { periods, exp, imp } = data.national;

  // Values may be null where ABS hasn't published that series yet — the import
  // series starts in July 2000, four years after exports. Nulls propagate:
  // a rolling window containing one is itself unknown, and the line breaks
  // rather than dropping to a fictitious zero.
  const series = (values: Array<number | null>): Array<number | null> => {
    if (!smooth) return values;
    return values.map((_, i) => {
      if (i < 11) return null;
      let total = 0;
      for (let k = i - 11; k <= i; k++) {
        const v = values[k];
        if (v === null || !Number.isFinite(v)) return null;
        total += v;
      }
      return total;
    });
  };

  const e = series(exp);
  const m = series(imp);
  const balance = e.map((v, i) => {
    const other = m[i];
    return v === null || other === null ? null : v - other;
  });

  const first = smooth ? 11 : 0;
  const visible = periods.slice(first);
  const eV = e.slice(first);
  const mV = m.slice(first);
  const bV = balance.slice(first);

  const finite = (arr: Array<number | null>): number[] =>
    arr.filter((v): v is number => v !== null && Number.isFinite(v));
  const maxV = Math.max(...finite(eV), ...finite(mV), 1);
  const minB = Math.min(...finite(bV), 0);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const balBand = 92;
  const lineH = ih - balBand - 14;

  const x = (i: number) => PAD.l + (i / Math.max(1, visible.length - 1)) * iw;
  const y = (v: number) => PAD.t + lineH - (v / (maxV || 1)) * lineH;
  const yBal = (v: number) => {
    const top = PAD.t + lineH + 14;
    const maxAbs = Math.max(Math.abs(minB), Math.max(...finite(bV), 1), 1);
    return top + balBand / 2 - (v / maxAbs) * (balBand / 2);
  };

  /** Break the path wherever the series is unknown, instead of drawing zero. */
  const path = (vals: Array<number | null>, fn: (v: number) => number) => {
    let out = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      out += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${fn(v).toFixed(1)} `;
      pen = true;
    });
    return out.trim();
  };

  const balStart = bV.findIndex((v) => v !== null);
  const balEnd = bV.length - 1 - [...bV].reverse().findIndex((v) => v !== null);
  const balArea =
    balStart < 0
      ? ''
      : `M${x(balStart).toFixed(1)},${yBal(0).toFixed(1)} ` +
        bV
          .map((v, i) => (v === null ? '' : `L${x(i).toFixed(1)},${yBal(v).toFixed(1)}`))
          .join('') +
        ` L${x(balEnd).toFixed(1)},${yBal(0).toFixed(1)} Z`;

  const yTicks = [0, maxV / 2, maxV].map(
    (v) => `<line x1="${PAD.l}" y1="${y(v).toFixed(1)}" x2="${W - PAD.r}" y2="${y(v).toFixed(1)}"
        stroke="var(--border-subtle)" />
      <text x="${PAD.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="axis-label">
        ${escapeHtml(formatMoney(v))}</text>`,
  ).join('');

  const idxOf = (p: string) => visible.indexOf(p);
  // Events cluster in 2020-2023, so a simple two-row alternation still collides
  // ("China trade restrictions" landed on top of "Restrictions lifted"). Track
  // the right edge of each occupied row and drop down until the label clears.
  const rowEnds: number[] = [];
  const annotations = EVENTS.filter((ev) => idxOf(ev.period) >= 0)
    .map((ev) => {
      const i = idxOf(ev.period);
      const cx = x(i);
      const anchor: 'start' | 'end' = cx > W - 190 ? 'end' : 'start';
      const width = ev.label.length * 5.3 + 10;
      const left = anchor === 'end' ? cx - width : cx;
      let row = 0;
      while (row < rowEnds.length && left < rowEnds[row]) row++;
      rowEnds[row] = left + width;
      const labelY = PAD.t + 12 + row * 13;
      return `<g class="annotation" data-tip="${escapeHtml(`${formatPeriodLong(ev.period)} — ${ev.note}`)}">
        <line x1="${cx.toFixed(1)}" y1="${PAD.t}" x2="${cx.toFixed(1)}" y2="${(PAD.t + lineH).toFixed(1)}"
          stroke="var(--annotation)" stroke-dasharray="3 3" stroke-width="1" />
        <text x="${(cx + (anchor === 'end' ? -5 : 5)).toFixed(1)}" y="${labelY}" text-anchor="${anchor}"
          class="annotation-label">${escapeHtml(ev.label)}</text>
      </g>`;
    })
    .join('');

  const hits = visible
    .map((p, i) => {
      const bw = iw / Math.max(1, visible.length - 1);
      // formatMoney/formatBalance already render null as an em dash, so a month
      // before the import series began reads "Imports —", not "Imports $0".
      const tip =
        `${formatPeriod(p)}\n` +
        `Exports ${formatMoney(eV[i])}\nImports ${formatMoney(mV[i])}\n` +
        `Balance ${formatBalance(bV[i])}` +
        (mV[i] === null ? '\nimports not published before July 2000' : '') +
        (smooth ? '\nrolling 12-month total' : '');
      return `<rect class="chart-hit" x="${(x(i) - bw / 2).toFixed(1)}" y="${PAD.t}" width="${Math.max(bw, 1).toFixed(2)}"
        height="${(lineH + 14 + balBand).toFixed(1)}" fill="transparent" data-tip="${escapeHtml(tip)}" />`;
    })
    .join('');

  const xLabels = [0, Math.floor(visible.length / 4), Math.floor(visible.length / 2),
    Math.floor((visible.length * 3) / 4), visible.length - 1]
    .filter((i, idx, arr) => arr.indexOf(i) === idx && i >= 0)
    .map(
      (i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="axis-label">
        ${escapeHtml(formatPeriod(visible[i]))}</text>`,
    )
    .join('');

  const latest = periods[periods.length - 1];

  root.innerHTML = `
    <div class="view-head">
      <h2>Thirty years of Australian goods trade</h2>
      <p>
        Monthly exports and imports since ${escapeHtml(formatPeriodLong(periods[0]))}, with the trade
        balance below. Shown as a ${gloss('rollingYear', 'rolling 12-month total')} by default because
        monthly trade is strongly seasonal — the raw line's sawtooth hides the trend. Hover anywhere for
        the figures at that month; hover a dashed line for the event.
      </p>
    </div>

    <div class="view-controls">
      <div class="segmented" role="tablist" aria-label="Smoothing">
        <button class="seg ${smooth ? 'active' : ''}" data-smooth="12" role="tab" aria-selected="${smooth}">Rolling 12 months</button>
        <button class="seg ${!smooth ? 'active' : ''}" data-smooth="1" role="tab" aria-selected="${!smooth}">Raw monthly</button>
      </div>
      <span class="legend-item"><span class="legend-line" style="background:${FLOW_COLOURS.exp}"></span>Exports</span>
      <span class="legend-item"><span class="legend-line" style="background:${FLOW_COLOURS.imp}"></span>Imports</span>
      <span class="control-note">Latest month: ${escapeHtml(formatPeriodLong(latest))}.</span>
    </div>

    <div class="chart-scroll">
      <svg viewBox="0 0 ${W} ${H}" class="trend-chart" role="img"
        aria-label="Australian goods exports and imports since ${escapeHtml(periods[0])}">
        ${yTicks}
        ${annotations}
        <path d="${path(eV, y)}" fill="none" stroke="${FLOW_COLOURS.exp}" stroke-width="1.9" />
        <path d="${path(mV, y)}" fill="none" stroke="${FLOW_COLOURS.imp}" stroke-width="1.9" />
        <line x1="${PAD.l}" y1="${yBal(0).toFixed(1)}" x2="${W - PAD.r}" y2="${yBal(0).toFixed(1)}"
          stroke="var(--border-strong)" stroke-width="1" />
        <path d="${balArea}" fill="var(--balance-fill)" stroke="none" />
        <path d="${path(bV, yBal)}" fill="none" stroke="var(--text-primary)" stroke-width="1.2" />
        <text x="${PAD.l - 8}" y="${(yBal(0) + 4).toFixed(1)}" text-anchor="end" class="axis-label">Balance</text>
        ${hits}
        ${xLabels}
      </svg>
    </div>

    <div class="panel-grid">
      <section class="panel">
        <h3>What the annotations mark</h3>
        <ul class="event-list">
          ${EVENTS.filter((ev) => idxOf(ev.period) >= 0)
            .map(
              (ev) => `<li><strong>${escapeHtml(formatPeriodLong(ev.period))} — ${escapeHtml(ev.label)}.</strong>
                ${escapeHtml(ev.note)}</li>`,
            )
            .join('')}
        </ul>
      </section>
      <section class="panel">
        <h3>Reading the balance</h3>
        <p class="prose">
          The band underneath is exports minus imports. Australia ran goods deficits through most of the
          1990s and 2000s, then moved into sustained surplus as the ${gloss('merchandise', 'resource export')}
          volumes built through the 2010s. The 2022 energy price shock produced the largest surpluses in
          the series.
        </p>
        <p class="prose small">
          Remember this is goods only. Services — international education above all — are excluded, and
          Australia runs a very different balance on those.
        </p>
      </section>
    </div>
  `;

  root.querySelectorAll<HTMLElement>('[data-smooth]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ctx.setState('trendSmooth', btn.dataset.smooth as string);
      renderTrend(root, data, ctx);
    }),
  );
}
