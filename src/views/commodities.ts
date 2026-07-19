import {
  escapeHtml, formatChange, formatMoney, formatPercent, shortCountry, shortName,
} from '../format';
import { gloss } from '../glossary';
import { FLOW_COLOURS, sectionColour } from '../palette';
import type { Commodity, Dataset, Flow } from '../types';
import { squarify } from '../utils/squarify';
import { sparkline } from '../utils/svg';
import type { ViewContext } from './types';

const TREEMAP_W = 1000;
const TREEMAP_H = 480;

/**
 * The "largest buyer" cell.
 *
 * Naming a buyer for a commodity whose destinations are mostly confidentialised
 * is the exact misleading claim this site exists to avoid: gas would read
 * "China 53%" when 95% of gas destinations are withheld and that 53% describes
 * a sliver. Say so instead.
 */
function renderPartnerCell(name: string | null, share: number | null, suppressed: number): string {
  if (!name) return '—';
  if (suppressed > 0.5) {
    return `<span class="chip chip-warn" data-tip="${escapeHtml(
      `${formatPercent(suppressed)} of this commodity's destinations are withheld for confidentiality. ` +
        `Of the small published remainder, the largest buyer is ${shortCountry(name)}.`,
    )}">mostly withheld</span>`;
  }
  return (
    `${escapeHtml(shortCountry(name))} ` +
    `<span class="mono muted">${escapeHtml(formatPercent(share ?? 0, 0))}</span>` +
    (suppressed > 0.05
      ? ` <span class="mono muted" data-tip="${escapeHtml(
          `${formatPercent(suppressed)} of destinations withheld; the share is of what is published.`,
        )}">*</span>`
      : '')
  );
}

/**
 * The commodity explorer: a searchable, hierarchical table plus a treemap of
 * composition. Table answers "find my product"; treemap answers "what is the
 * export basket made of" in one glance.
 */
export function renderCommodities(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const flow = (ctx.getState('comFlow', 'exp') as Flow) ?? 'exp';
  const level = Number(ctx.getState('comLevel', '2')) || 2;
  const isExport = flow === 'exp';
  const total = isExport ? data.meta.totals.exp : data.meta.totals.imp;

  const items = data.commodities
    .filter((c) => c.lvl === level && (isExport ? c.exp : c.imp) > 0)
    .sort((a, b) => (isExport ? b.exp - a.exp : b.imp - a.imp));

  root.innerHTML = `
    <div class="view-head">
      <h2>What Australia ${isExport ? 'sells' : 'buys'}</h2>
      <p>
        Every ${gloss('sitc', 'SITC')} category, ${
          level === 1 ? 'at the broadest level' : level === 2 ? 'by division' : 'in full detail'
        }. The treemap sizes each category by value; the table below is searchable across all
        ${data.meta.counts.sitcCodes} codes. Click anything to open it.
      </p>
    </div>

    <div class="view-controls">
      <div class="segmented" role="tablist" aria-label="Direction">
        <button class="seg ${isExport ? 'active' : ''}" data-flow="exp" role="tab" aria-selected="${isExport}">Exports</button>
        <button class="seg ${!isExport ? 'active' : ''}" data-flow="imp" role="tab" aria-selected="${!isExport}">Imports</button>
      </div>
      <label class="control">Detail
        <select id="com-level">
          <option value="1" ${level === 1 ? 'selected' : ''}>Sections (10)</option>
          <option value="2" ${level === 2 ? 'selected' : ''}>Divisions (~70)</option>
          <option value="3" ${level === 3 ? 'selected' : ''}>Groups (~260)</option>
        </select>
      </label>
      <label class="control search-inline">Search
        <input type="search" id="com-search" placeholder="wine, iron ore, cars…" autocomplete="off" />
      </label>
    </div>

    <div class="chart-scroll">
      <svg id="com-treemap" viewBox="0 0 ${TREEMAP_W} ${TREEMAP_H}" class="treemap" role="img"
        aria-label="Treemap of ${isExport ? 'export' : 'import'} composition"></svg>
    </div>

    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-rank">#</th>
            <th>Commodity</th>
            <th class="num">${isExport ? 'Exports' : 'Imports'}</th>
            <th class="num col-hide-sm">Share</th>
            <th class="num col-hide-sm">Change</th>
            <th class="col-hide-md">Trend</th>
            <th class="col-hide-md">${isExport ? 'Largest buyer' : 'Largest supplier'}</th>
          </tr>
        </thead>
        <tbody id="com-body"></tbody>
      </table>
    </div>
    <p class="view-foot" id="com-foot"></p>
  `;

  // ── treemap ───────────────────────────────────────────────────────────────
  const drawTreemap = (rows: Commodity[]): void => {
    const svg = root.querySelector('#com-treemap') as SVGSVGElement;
    const top = rows.slice(0, 40);
    const values = top.map((c) => (isExport ? c.exp : c.imp));
    if (!values.length || values[0] <= 0) {
      svg.innerHTML = '<text x="20" y="30" class="axis-label">Nothing to show.</text>';
      return;
    }
    const rects = squarify(values, TREEMAP_W, TREEMAP_H);
    svg.innerHTML = rects
      .map((r, i) => {
        const c = top[i];
        if (!c) return '';
        const v = values[i];
        const colour = sectionColour(c.c);
        const showLabel = r.w > 62 && r.h > 26;
        const tip =
          `${shortName(c.n, 60)}\n` +
          `${formatMoney(v)} · ${formatPercent(v / total, 2)} of ${isExport ? 'exports' : 'imports'}` +
          (c.conf ? '\nA confidentiality bucket, not a product' : '');
        return `<g class="tm-cell clickable" data-commodity="${escapeHtml(c.c)}" tabindex="0" role="button"
            aria-label="${escapeHtml(shortName(c.n, 50))}, ${escapeHtml(formatMoney(v))}" data-tip="${escapeHtml(tip)}">
            <rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${Math.max(0, r.w).toFixed(1)}"
              height="${Math.max(0, r.h).toFixed(1)}" fill="${colour}" fill-opacity="${c.conf ? 0.45 : 0.85}"
              stroke="#fff" stroke-width="1.2" ${c.conf ? 'stroke-dasharray="3 2"' : ''} />
            ${
              showLabel
                ? `<text x="${(r.x + 7).toFixed(1)}" y="${(r.y + 17).toFixed(1)}" class="tm-label">
                     ${escapeHtml(shortName(c.n, Math.max(6, Math.floor(r.w / 7))))}
                   </text>
                   <text x="${(r.x + 7).toFixed(1)}" y="${(r.y + 33).toFixed(1)}" class="tm-value">
                     ${escapeHtml(formatMoney(v))}
                   </text>`
                : ''
            }
          </g>`;
      })
      .join('');

    svg.querySelectorAll<SVGGElement>('.tm-cell').forEach((cell) => {
      const open = () => ctx.openCommodity(cell.dataset.commodity as string);
      cell.addEventListener('click', open);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  };

  // ── table ─────────────────────────────────────────────────────────────────
  const body = root.querySelector('#com-body') as HTMLElement;
  const foot = root.querySelector('#com-foot') as HTMLElement;

  const drawTable = (rows: Commodity[], searching: boolean): void => {
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-cell">No commodity matches that search.</td></tr>';
      foot.textContent = '';
      return;
    }
    body.innerHTML = rows
      .slice(0, 400)
      .map((c, i) => {
        const v = isExport ? c.exp : c.imp;
        const partner = isExport ? c.top : c.itop;
        const partnerName = partner && 'name' in partner ? partner.name : null;
        const partnerShare = partner ? partner.share : null;
        return `
        <tr class="clickable" data-commodity="${escapeHtml(c.c)}" tabindex="0">
          <td class="col-rank mono">${i + 1}</td>
          <td class="col-name">
            <span class="rank-swatch" style="background:${sectionColour(c.c)}"></span>
            <span class="row-name">${escapeHtml(shortName(c.n, 58))}</span>
            ${c.conf ? '<span class="chip chip-warn" data-tip="A confidentiality bucket, not a real product">confidential</span>' : ''}
            <span class="code-chip mono">${escapeHtml(c.c)}</span>
          </td>
          <td class="num mono">${escapeHtml(formatMoney(v))}</td>
          <td class="num mono col-hide-sm">${escapeHtml(formatPercent(v / total, 2))}</td>
          <td class="num mono col-hide-sm ${(c.expYoy ?? 0) >= 0 ? 'pos' : 'neg'}">${
            isExport ? escapeHtml(formatChange(c.expYoy)) : '—'
          }</td>
          <td class="col-hide-md spark-cell">${sparkline(isExport ? c.expS : c.impS, {
            colour: isExport ? FLOW_COLOURS.exp : FLOW_COLOURS.imp,
          })}</td>
          <td class="col-hide-md muted">${renderPartnerCell(partnerName, partnerShare, isExport ? c.top?.supp ?? 0 : 0)}</td>
        </tr>`;
      })
      .join('');

    foot.textContent = searching
      ? `${rows.length} matching categories.`
      : `${rows.length} categories at this level. Values are the rolling 12 months to ${data.meta.window.end}.`;

    body.querySelectorAll<HTMLElement>('tr.clickable').forEach((tr) => {
      const open = () => ctx.openCommodity(tr.dataset.commodity as string);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  };

  drawTreemap(items);
  drawTable(items, false);

  root.querySelectorAll<HTMLElement>('[data-flow]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ctx.setState('comFlow', btn.dataset.flow as string);
      renderCommodities(root, data, ctx);
    }),
  );
  root.querySelector('#com-level')?.addEventListener('change', (e) => {
    ctx.setState('comLevel', (e.target as HTMLSelectElement).value);
    renderCommodities(root, data, ctx);
  });

  // Search spans every level, because people search for "wine", not "division 11".
  const search = root.querySelector('#com-search') as HTMLInputElement;
  let timer: ReturnType<typeof setTimeout>;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const needle = search.value.trim().toLowerCase();
      if (!needle) {
        drawTable(items, false);
        return;
      }
      const matches = data.commodities
        .filter((c) => (isExport ? c.exp : c.imp) > 0 && c.n.toLowerCase().includes(needle))
        .sort((a, b) => (isExport ? b.exp - a.exp : b.imp - a.imp));
      drawTable(matches, true);
    }, 300);
  });
  ctx.onTeardown(() => clearTimeout(timer));
}
