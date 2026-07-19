import { escapeHtml, formatMoney, formatPercent, shortCountry, shortName } from '../format';
import { gloss } from '../glossary';
import { sectionColour } from '../palette';
import type { Dataset, Flow } from '../types';
import { ribbonPath, sankeyLayout, type SankeyInput } from '../utils/sankey';
import type { ViewContext } from './types';

const W = 1080;
const H = 620;
const LABEL_PAD = 200;

/**
 * Sankey: commodity section ↔ trading partner.
 *
 * This is the view that answers "what actually moves where" — the leaderboard
 * knows the totals and the matrix knows the pairs, but only a flow diagram shows
 * a single sector's output fanning out to its buyers at readable proportions.
 */
export function renderFlows(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const flow = (ctx.getState('flowDir', 'exp') as Flow) ?? 'exp';
  const partnerCount = Number(ctx.getState('flowPartners', '12')) || 12;

  const { rows, cols, cells } = data.matrix;
  const isExport = flow === 'exp';

  // The matrix ships export values; imports reuse the partner baskets, which
  // carry the same section→partner structure from the other direction.
  const partnerTotals = new Map<string, number>();
  const sectionTotals = new Map<string, number>();
  const pairs: Array<{ section: string; partner: string; value: number }> = [];

  if (isExport) {
    rows.forEach((row, ri) => {
      cols.forEach((col, ci) => {
        const v = cells[ri]?.[ci] ?? 0;
        if (v <= 0) return;
        pairs.push({ section: row.c, partner: col.c, value: v });
        partnerTotals.set(col.c, (partnerTotals.get(col.c) ?? 0) + v);
        sectionTotals.set(row.c, (sectionTotals.get(row.c) ?? 0) + v);
      });
    });
  } else {
    for (const country of data.partners.slice(0, 40)) {
      for (const item of country.topImp) {
        const section = item.c[0];
        if (item.v <= 0) continue;
        pairs.push({ section, partner: country.c, value: item.v });
        partnerTotals.set(country.c, (partnerTotals.get(country.c) ?? 0) + item.v);
        sectionTotals.set(section, (sectionTotals.get(section) ?? 0) + item.v);
      }
    }
  }

  const topPartners = [...partnerTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, partnerCount)
    .map(([code]) => code);
  const topSet = new Set(topPartners);

  const sectionOrder = [...sectionTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  const sectionName = (code: string) =>
    data.byCommodity.get(code)?.n ?? rows.find((r) => r.c === code)?.n ?? code;

  const input: SankeyInput = {
    sources: sectionOrder.map((c) => ({ id: c, label: shortName(sectionName(c), 30) })),
    targets: topPartners.map((c) => ({
      id: c,
      label: shortCountry(data.byCountry.get(c)?.n ?? c),
    })),
    links: pairs
      .filter((p) => topSet.has(p.partner))
      .sort((a, b) => sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section) || b.value - a.value)
      .map((p) => ({ source: p.section, target: p.partner, value: p.value })),
  };

  const layout = sankeyLayout(input, {
    width: W - LABEL_PAD * 2,
    height: H - 40,
    nodeWidth: 13,
    padding: 7,
  });

  const shownTotal = layout.links.reduce((a, l) => a + l.value, 0);
  const grandTotal = isExport ? data.meta.totals.exp : data.meta.totals.imp;

  const nodeById = new Map(layout.nodes.map((n) => [`${n.side}:${n.id}`, n]));

  const ribbons = layout.links
    .map((l) => {
      const colour = sectionColour(l.source);
      const partner = data.byCountry.get(l.target);
      const tip =
        `${shortName(sectionName(l.source), 40)} → ${shortCountry(partner?.n ?? l.target)}\n` +
        `${formatMoney(l.value)}\n` +
        `${formatPercent(l.value / grandTotal, 2)} of all ${isExport ? 'exports' : 'imports'}`;
      return `<path class="ribbon" d="${ribbonPath({ ...l, x0: l.x0 + LABEL_PAD, x1: l.x1 + LABEL_PAD })}"
        stroke="${colour}" stroke-width="${Math.max(0.6, l.width).toFixed(2)}" fill="none"
        stroke-opacity="0.42" data-section="${escapeHtml(l.source)}" data-partner="${escapeHtml(l.target)}"
        data-tip="${escapeHtml(tip)}" />`;
    })
    .join('');

  const nodes = layout.nodes
    .map((n) => {
      const isSource = n.side === 'source';
      const colour = isSource ? sectionColour(n.id) : 'var(--text-secondary)';
      const label = escapeHtml(n.label);
      const x = n.x + LABEL_PAD;
      const tip = isSource
        ? `${shortName(sectionName(n.id), 50)}\n${formatMoney(n.value)} to the ${partnerCount} partners shown`
        : `${shortCountry(data.byCountry.get(n.id)?.n ?? n.id)}\n${formatMoney(n.value)} shown here`;
      return `
        <g class="sankey-node ${isSource ? 'is-section' : 'is-partner'}" tabindex="0" role="button"
           data-${isSource ? 'section' : 'partner'}="${escapeHtml(n.id)}"
           aria-label="${label}, ${escapeHtml(formatMoney(n.value))}">
          <rect x="${x.toFixed(1)}" y="${n.y.toFixed(1)}" width="${n.w}" height="${Math.max(1, n.h).toFixed(1)}"
            fill="${colour}" data-tip="${escapeHtml(tip)}" />
          <text x="${isSource ? (x - 8).toFixed(1) : (x + n.w + 8).toFixed(1)}"
            y="${(n.y + Math.max(1, n.h) / 2 + 4).toFixed(1)}"
            text-anchor="${isSource ? 'end' : 'start'}" class="sankey-label">${label}</text>
        </g>`;
    })
    .join('');

  root.innerHTML = `
    <div class="view-head">
      <h2>${isExport ? 'From sector to buyer' : 'From supplier to sector'}</h2>
      <p>
        ${
          isExport
            ? `Every ${gloss('sections', 'SITC section')} on the left, flowing to the countries that buy it.
               Ribbon thickness is value.`
            : `Australia's largest suppliers on the right, flowing back to the kinds of goods they send.`
        }
        Hover a ribbon for the exact figure; hover a block to isolate everything it touches; click to
        open it in full.
      </p>
    </div>

    <div class="view-controls">
      <div class="segmented" role="tablist" aria-label="Direction">
        <button class="seg ${isExport ? 'active' : ''}" data-flow="exp" role="tab" aria-selected="${isExport}">Exports</button>
        <button class="seg ${!isExport ? 'active' : ''}" data-flow="imp" role="tab" aria-selected="${!isExport}">Imports</button>
      </div>
      <label class="control">Partners shown
        <select id="flow-partners">
          ${[8, 12, 16, 20]
            .map((n) => `<option value="${n}" ${n === partnerCount ? 'selected' : ''}>Top ${n}</option>`)
            .join('')}
        </select>
      </label>
      <span class="control-note">
        The ${partnerCount} partners shown cover ${escapeHtml(formatMoney(shownTotal))} —
        ${escapeHtml(formatPercent(shownTotal / grandTotal))} of all ${isExport ? 'exports' : 'imports'}.
        ${
          isExport
            ? `Section 9 includes non-monetary gold and the ${gloss('sitc98', 'confidential items')} bucket.`
            : ''
        }
      </span>
    </div>

    <div class="chart-scroll">
      <svg id="sankey" viewBox="0 0 ${W} ${H}" class="sankey" role="img"
        aria-label="Flow diagram from commodity sections to trading partners">
        <g class="ribbons">${ribbons}</g>
        <g class="nodes">${nodes}</g>
      </svg>
    </div>
  `;

  root.querySelectorAll<HTMLElement>('[data-flow]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ctx.setState('flowDir', btn.dataset.flow as string);
      renderFlows(root, data, ctx);
    }),
  );
  root.querySelector('#flow-partners')?.addEventListener('change', (e) => {
    ctx.setState('flowPartners', (e.target as HTMLSelectElement).value);
    renderFlows(root, data, ctx);
  });

  // Hovering a node dims everything it doesn't touch — selection tells a story.
  const svg = root.querySelector('#sankey') as SVGSVGElement;
  const clearHighlight = () => svg.classList.remove('has-focus');
  svg.querySelectorAll<SVGGElement>('.sankey-node').forEach((node) => {
    const section = node.dataset.section;
    const partner = node.dataset.partner;
    const matches = (p: SVGPathElement) =>
      section ? p.dataset.section === section : p.dataset.partner === partner;

    const focus = () => {
      svg.classList.add('has-focus');
      svg.querySelectorAll<SVGPathElement>('.ribbon').forEach((p) => {
        p.classList.toggle('lit', matches(p));
      });
    };
    node.addEventListener('mouseenter', focus);
    node.addEventListener('focus', focus);
    node.addEventListener('mouseleave', clearHighlight);
    node.addEventListener('blur', clearHighlight);

    const open = () => {
      if (partner) ctx.openCountry(partner);
      else if (section) ctx.openCommodity(section);
    };
    node.addEventListener('click', open);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });

  // Clicking a ribbon opens the partner at its receiving end.
  svg.querySelectorAll<SVGPathElement>('.ribbon').forEach((p) => {
    p.addEventListener('click', () => {
      const partner = p.dataset.partner;
      if (partner) ctx.openCountry(partner);
    });
  });

  if (!nodeById.size) {
    (root.querySelector('.chart-scroll') as HTMLElement).innerHTML =
      '<div class="empty-state">No flows to display for this selection.</div>';
  }
}
