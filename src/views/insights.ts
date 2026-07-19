import { buildInsights, logBins } from '../analysis';
import { escapeHtml, formatMoney, formatNumber } from '../format';
import { FLOW_COLOURS } from '../palette';
import type { Dataset } from '../types';
import { niceTicks } from '../utils/svg';
import type { ViewContext } from './types';

const W = 900;
const H = 260;
const PAD = { t: 14, r: 16, b: 40, l: 46 };

/**
 * Auto-detected findings plus the distribution that explains why a handful of
 * commodities matter and the rest are rounding errors.
 */
export function renderInsights(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const insights = buildInsights(data);

  const divisions = data.commodities.filter((c) => c.lvl === 2 && c.exp > 0);
  const bins = logBins(divisions.map((c) => c.exp), 16);
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / Math.max(1, bins.length);

  const ticks = niceTicks(maxN, 3);
  const gridY = ticks
    .map((t) => {
      const y = PAD.t + ih - (t / maxN) * ih;
      return `<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${W - PAD.r}" y2="${y.toFixed(1)}"
          stroke="var(--border-subtle)" />
        <text x="${PAD.l - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="axis-label">${t}</text>`;
    })
    .join('');

  const bars = bins
    .map((b, i) => {
      const h = (b.n / maxN) * ih;
      const x = PAD.l + i * bw;
      const tip =
        `${formatMoney(b.lo)} – ${formatMoney(b.hi)}\n` +
        `${b.n} commodity group${b.n === 1 ? '' : 's'}`;
      return `<rect class="hist-bar clickable" x="${(x + 1).toFixed(1)}" y="${(PAD.t + ih - h).toFixed(1)}"
        width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}"
        fill="${FLOW_COLOURS.exp}" fill-opacity="0.82" tabindex="0" role="button"
        data-lo="${b.lo}" data-hi="${b.hi}"
        aria-label="${b.n} commodity groups between ${formatMoney(b.lo)} and ${formatMoney(b.hi)}"
        data-tip="${escapeHtml(tip)}" />`;
    })
    .join('');

  const xLabels = bins
    .filter((_, i) => i % 3 === 0)
    .map((b, k) => {
      const i = k * 3;
      return `<text x="${(PAD.l + i * bw + bw / 2).toFixed(1)}" y="${H - 20}" text-anchor="middle"
        class="axis-label">${escapeHtml(formatMoney(b.lo))}</text>`;
    })
    .join('');

  root.innerHTML = `
    <div class="view-head">
      <h2>What the data says</h2>
      <p>
        Findings computed from this release rather than written by hand — they change when the ABS
        numbers change. Each card links to the view that shows the working.
      </p>
    </div>

    <div class="insight-grid">
      ${insights
        .map(
          (i) => `
        <article class="insight insight-${i.severity} ${i.view ? 'clickable' : ''}"
          ${i.view ? `data-view="${escapeHtml(i.view)}"` : ''}
          ${i.country ? `data-country="${escapeHtml(i.country)}"` : ''}
          ${i.commodity ? `data-commodity="${escapeHtml(i.commodity)}"` : ''}
          ${i.view ? 'tabindex="0" role="button"' : ''}>
          <h3>${escapeHtml(i.title)}</h3>
          <p>${escapeHtml(i.body)}</p>
          ${i.view ? `<span class="insight-go">Open ${escapeHtml(i.view)} →</span>` : ''}
        </article>`,
        )
        .join('')}
    </div>

    <section class="panel">
      <h3>Why a few commodities are the whole story</h3>
      <p class="panel-sub">
        How many commodity groups fall in each value band. Bands are logarithmic — each step is roughly
        ten times the previous — because export values span six orders of magnitude and linear bands
        would put almost everything in the first bar. Click a bar to see those commodities.
      </p>
      <div class="chart-scroll">
        <svg viewBox="0 0 ${W} ${H}" class="histogram" role="img"
          aria-label="Distribution of export value across ${divisions.length} commodity groups">
          ${gridY}${bars}${xLabels}
          <text x="${(PAD.l + iw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="axis-title">
            Export value over 12 months (log scale)
          </text>
        </svg>
      </div>
      <p class="view-foot">
        ${formatNumber(divisions.length)} commodity groups. The largest is
        ${escapeHtml(formatMoney(Math.max(...divisions.map((c) => c.exp))))}; the median is
        ${escapeHtml(formatMoney(median(divisions.map((c) => c.exp))))}.
      </p>
    </section>
  `;

  root.querySelectorAll<HTMLElement>('.insight.clickable').forEach((card) => {
    const go = () => {
      const view = card.dataset.view as string;
      ctx.goTo(view);
      // Open the entity after the view has rendered, so the panel stacks above it.
      const country = card.dataset.country;
      const commodity = card.dataset.commodity;
      if (country) setTimeout(() => ctx.openCountry(country), 60);
      else if (commodity) setTimeout(() => ctx.openCommodity(commodity), 60);
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });

  // Clicking a histogram bar filters the commodity explorer to that band.
  root.querySelectorAll<HTMLElement>('.hist-bar').forEach((bar) => {
    const go = () => {
      const lo = Number(bar.dataset.lo);
      const hi = Number(bar.dataset.hi);
      const match = divisions
        .filter((c) => c.exp >= lo && c.exp <= hi)
        .sort((a, b) => b.exp - a.exp)[0];
      if (match) ctx.openCommodity(match.c);
    };
    bar.addEventListener('click', go);
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
