import { exposureSet } from '../analysis';
import { escapeHtml, formatMoney, formatPercent, shortCountry, shortName } from '../format';
import { gloss } from '../glossary';
import { sectionColour, SECTION_COLOURS } from '../palette';
import type { Commodity, Dataset } from '../types';
import { attachSvgZoom } from '../utils/svgZoom';
import type { ViewContext } from './types';

const W = 1000;
const H = 560;
const PAD = { t: 24, r: 28, b: 52, l: 62 };

const SECTION_NAMES: Record<string, string> = {
  '0': 'Food & live animals',
  '1': 'Beverages & tobacco',
  '2': 'Crude materials',
  '3': 'Mineral fuels',
  '4': 'Oils & fats',
  '5': 'Chemicals',
  '6': 'Manufactured goods',
  '7': 'Machinery & transport',
  '8': 'Misc manufactures',
  '9': 'Not classified elsewhere',
};

/**
 * The signature view: value against single-buyer concentration.
 *
 * Neither axis alone is interesting — the leaderboard already ranks by value,
 * and a concentration ranking on its own is dominated by $50m curiosities. The
 * product of the two is the country's actual trade exposure, and that only
 * shows up when you plot them together.
 *
 * Concentration is computed over PUBLISHED destinations. Commodities whose
 * destinations are mostly withheld are drawn hollow, because their position on
 * the y-axis is an artefact of what little is disclosed, not a real reading.
 */
export function renderExposure(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const items = exposureSet(data.commodities);

  const xMin = Math.log10(Math.max(50, Math.min(...items.map((c) => c.exp))));
  const xMax = Math.log10(Math.max(...items.map((c) => c.exp)) * 1.25);
  const xSpan = xMax - xMin || 1;

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const xOf = (v: number) => PAD.l + ((Math.log10(Math.max(v, 10 ** xMin)) - xMin) / xSpan) * iw;
  const yOf = (share: number) => PAD.t + ih - share * ih;
  const rOf = (v: number) => Math.max(3.2, Math.min(26, Math.sqrt(v) / 9));

  // Decade gridlines: $100m, $1bn, $10bn, $100bn.
  const decades: number[] = [];
  for (let d = Math.ceil(xMin); d <= Math.floor(xMax); d++) decades.push(d);

  const gridX = decades
    .map(
      (d) => `
      <line x1="${xOf(10 ** d).toFixed(1)}" y1="${PAD.t}" x2="${xOf(10 ** d).toFixed(1)}" y2="${PAD.t + ih}"
        stroke="var(--border-subtle)" />
      <text x="${xOf(10 ** d).toFixed(1)}" y="${PAD.t + ih + 16}" text-anchor="middle" class="axis-label">
        ${escapeHtml(formatMoney(10 ** d))}
      </text>`,
    )
    .join('');

  const gridY = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (s) => `
      <line x1="${PAD.l}" y1="${yOf(s).toFixed(1)}" x2="${W - PAD.r}" y2="${yOf(s).toFixed(1)}"
        stroke="var(--border-subtle)" ${s === 0.5 ? 'stroke-dasharray="4 3"' : ''} />
      <text x="${PAD.l - 8}" y="${(yOf(s) + 4).toFixed(1)}" text-anchor="end" class="axis-label">
        ${(s * 100).toFixed(0)}%
      </text>`,
    )
    .join('');

  // The exposure quadrant: large AND concentrated.
  const quadX = xOf(5000);
  const quadY = yOf(1);
  const quadW = W - PAD.r - quadX;
  const quadH = yOf(0.5) - quadY;

  const sorted = [...items].sort((a, b) => b.exp - a.exp);

  const dots = sorted
    .map((c) => {
      const share = c.top!.share;
      const supp = c.top!.supp;
      const mostlyHidden = supp > 0.5;
      const cx = xOf(c.exp);
      const cy = yOf(share);
      const r = rOf(c.exp);
      const colour = sectionColour(c.c);
      // Plain text with newlines — the shared tooltip util sets textContent,
      // so any markup here would be printed literally.
      const tip =
        `${shortName(c.n, 60)}\n` +
        `Exports ${formatMoney(c.exp)}\n` +
        (mostlyHidden
          ? `${formatPercent(supp)} of destinations withheld — position unreliable`
          : `${formatPercent(share)} to ${shortCountry(c.top!.name ?? '—')}\n` +
            `${c.top!.partners} buyers · HHI ${c.top!.hhi.toFixed(2)}` +
            (supp > 0.05 ? `\n${formatPercent(supp)} withheld` : ''));
      return `<circle class="dot ${mostlyHidden ? 'dot-hidden' : ''}" data-commodity="${escapeHtml(c.c)}"
        cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${mostlyHidden ? 'none' : colour}" stroke="${colour}"
        stroke-width="${mostlyHidden ? 1.6 : 0.8}" stroke-dasharray="${mostlyHidden ? '3 2' : ''}"
        fill-opacity="0.72" tabindex="0" role="button"
        aria-label="${escapeHtml(shortName(c.n, 60))}, ${escapeHtml(formatMoney(c.exp))}"
        data-tip="${escapeHtml(tip)}" />`;
    })
    .join('');

  // Label only the ones worth naming: the biggest, and the most exposed.
  const labelled = new Set<string>();
  for (const c of sorted.slice(0, 6)) labelled.add(c.c);
  for (const c of [...items]
    .filter((c) => c.top!.supp < 0.5 && c.exp > 3000)
    .sort((a, b) => b.exp * b.top!.share - a.exp * a.top!.share)
    .slice(0, 6)) labelled.add(c.c);

  const labels = placeLabels(
    sorted.filter((c) => labelled.has(c.c)).map((c) => ({
      text: shortName(c.n, 26),
      cx: xOf(c.exp),
      cy: yOf(c.top!.share),
      r: rOf(c.exp),
    })),
  );

  const usedSections = [...new Set(items.map((c) => c.c[0]))].sort();

  root.innerHTML = `
    <div class="view-head">
      <h2>Exposure: what rests on a single buyer</h2>
      <p>
        Every commodity group Australia exports, plotted by value (across, on a log scale) against the
        share going to its largest single buyer (up). Bubble size is also value.
        The top-right corner is where the money and the ${gloss('concentration')} meet — that is the
        country's real trade exposure, and it is invisible in any ranking that shows one axis at a time.
        Hover for exact figures; click a bubble to open the commodity.
      </p>
    </div>

    <div class="view-controls">
      <span class="control-note">
        Shares are calculated over destinations the ABS actually publishes. Where most destinations are
        ${gloss('confidentialised', 'withheld')}, the bubble is drawn <strong>hollow</strong> — its height
        is guesswork, not a reading. Natural gas is the extreme case.
      </span>
    </div>

    <div class="chart-wrap" id="exposure-wrap">
      <div class="chart-scroll" id="exposure-scroll">
      <svg id="exposure-svg" viewBox="0 0 ${W} ${H}" class="scatter" role="img"
        aria-label="Export value against share going to the largest buyer, ${items.length} commodity groups">
        <rect x="${quadX.toFixed(1)}" y="${quadY.toFixed(1)}" width="${quadW.toFixed(1)}" height="${quadH.toFixed(1)}"
          fill="var(--quadrant-fill)" stroke="var(--quadrant-stroke)" stroke-dasharray="4 3" />
        <text x="${(quadX + 10).toFixed(1)}" y="${(quadY + 18).toFixed(1)}" class="quadrant-label">
          Large and concentrated
        </text>
        ${gridX}${gridY}
        ${dots}${labels}
        <text x="${(PAD.l + iw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="axis-title">
          Export value, 12 months (log scale)
        </text>
        <text x="14" y="${(PAD.t + ih / 2).toFixed(1)}" text-anchor="middle" class="axis-title"
          transform="rotate(-90 14 ${(PAD.t + ih / 2).toFixed(1)})">
          Share to largest buyer
        </text>
      </svg>
      </div>
    </div>

    <div class="legend" id="exposure-legend">
      ${usedSections
        .map(
          (s) => `<span class="legend-item"><span class="legend-swatch" style="background:${SECTION_COLOURS[s]}"></span>${escapeHtml(SECTION_NAMES[s] ?? s)}</span>`,
        )
        .join('')}
      <span class="legend-item"><span class="legend-swatch legend-hollow"></span>Destinations mostly withheld</span>
    </div>

    <div class="panel-grid" id="exposure-lists"></div>
  `;

  const svg = root.querySelector('#exposure-svg') as SVGSVGElement;
  attachSvgZoom(svg);
  // attachSvgZoom appends its controls to the SVG's parent, which is now the
  // horizontal scroller — they'd scroll off-screen with the chart on a phone.
  // Reparent them to the positioned wrapper so they stay pinned.
  const zoomControls = root.querySelector('.svg-zoom-controls');
  if (zoomControls) (root.querySelector('#exposure-wrap') as HTMLElement).appendChild(zoomControls);

  const open = (code: string) => ctx.openCommodity(code);
  svg.querySelectorAll<SVGCircleElement>('.dot').forEach((dot) => {
    dot.addEventListener('click', () => open(dot.dataset.commodity as string));
    dot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(dot.dataset.commodity as string);
      }
    });
  });

  // Ranked side lists — the scatter shows the shape, these name the winners.
  const mostExposed = items
    .filter((c) => c.top!.supp < 0.5)
    .sort((a, b) => b.exp * b.top!.share - a.exp * a.top!.share)
    .slice(0, 8);
  const mostDiversified = items
    .filter((c) => c.top!.supp < 0.5 && c.exp > 1000)
    .sort((a, b) => a.top!.hhi - b.top!.hhi)
    .slice(0, 8);

  const listHtml = (title: string, sub: string, rows: Commodity[], showHhi: boolean) => `
    <section class="panel">
      <h3>${escapeHtml(title)}</h3>
      <p class="panel-sub">${sub}</p>
      <ol class="rank-list">
        ${rows
          .map(
            (c) => `
          <li class="rank-item clickable" data-commodity="${escapeHtml(c.c)}" tabindex="0" role="button">
            <span class="rank-swatch" style="background:${sectionColour(c.c)}"></span>
            <span class="rank-name">${escapeHtml(shortName(c.n, 40))}</span>
            <span class="rank-meta mono">${escapeHtml(formatMoney(c.exp))}</span>
            <span class="rank-value mono">${
              showHhi
                ? escapeHtml(`${formatPercent(c.top!.share, 0)} → ${shortCountry(c.top!.name ?? '')}`)
                : escapeHtml(`HHI ${c.top!.hhi.toFixed(2)} · ${c.top!.partners} buyers`)
            }</span>
          </li>`,
          )
          .join('')}
      </ol>
    </section>`;

  const lists = root.querySelector('#exposure-lists') as HTMLElement;
  lists.innerHTML =
    listHtml(
      'Most exposed',
      'Ranked by value multiplied by the share going to the biggest buyer — the combination that matters.',
      mostExposed,
      true,
    ) +
    listHtml(
      'Most diversified',
      `Lowest ${GLOSS_HHI} across buyers, among exports above $1bn — these absorb losing a customer.`,
      mostDiversified,
      false,
    );

  lists.querySelectorAll<HTMLElement>('.rank-item').forEach((li) => {
    const go = () => open(li.dataset.commodity as string);
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });
}

const GLOSS_HHI = gloss('hhi', 'concentration index');

/**
 * Greedy label placement with collision avoidance.
 *
 * The big exports cluster tightly around $10–100bn at 25–30% concentration, and
 * naive "label to the right of the dot" placement stacks four names on top of
 * each other into an unreadable smear. Try each candidate side in turn, take
 * the first that clears every label already placed, and drop the label entirely
 * if nothing fits — an unlabelled dot still has its hover tooltip, an
 * overlapping one helps nobody.
 */
export function placeLabels(
  items: Array<{ text: string; cx: number; cy: number; r: number }>,
): string {
  const CHAR_W = 5.15; // ~10px font in viewBox units
  const LINE_H = 11;
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

  const hits = (box: { x: number; y: number; w: number; h: number }): boolean =>
    placed.some(
      (p) =>
        box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y,
    );

  const out: string[] = [];
  for (const item of items) {
    const w = item.text.length * CHAR_W;
    // right, left, above, below, then further above/below
    const candidates: Array<{ x: number; y: number; anchor: 'start' | 'end' }> = [
      { x: item.cx + item.r + 5, y: item.cy + 3.5, anchor: 'start' },
      { x: item.cx - item.r - 5, y: item.cy + 3.5, anchor: 'end' },
      { x: item.cx, y: item.cy - item.r - 5, anchor: 'start' },
      { x: item.cx, y: item.cy + item.r + 12, anchor: 'start' },
      { x: item.cx, y: item.cy - item.r - 17, anchor: 'start' },
      { x: item.cx, y: item.cy + item.r + 24, anchor: 'start' },
    ];

    let chosen: { x: number; y: number; anchor: 'start' | 'end' } | null = null;
    for (const c of candidates) {
      const left = c.anchor === 'end' ? c.x - w : c.x;
      // Keep the whole label on canvas.
      if (left < PAD.l - 40 || left + w > W - 4) continue;
      const box = { x: left, y: c.y - LINE_H + 2, w, h: LINE_H };
      if (hits(box)) continue;
      chosen = c;
      placed.push(box);
      break;
    }
    if (!chosen) continue;

    out.push(
      `<text class="dot-label" x="${chosen.x.toFixed(1)}" y="${chosen.y.toFixed(1)}"
        text-anchor="${chosen.anchor}" pointer-events="none">${escapeHtml(item.text)}</text>`,
    );
  }
  return out.join('');
}
