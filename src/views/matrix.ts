// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { escapeHtml, formatMoney, formatPercent, shortCountry, shortName } from '../format';
import { gloss } from '../glossary';
import { RAMP_EXPORT } from '../palette';
import type { Dataset } from '../types';
import type { ViewContext } from './types';

type Scale = 'abs' | 'row';

/**
 * Commodity section × partner heatmap.
 *
 * The ranking says who is biggest and the Sankey says what flows where, but
 * neither answers "does this partner buy broadly or one thing?". Reading across
 * a column here does: Japan and Korea light up in several sections, India in
 * essentially one.
 */
export function renderMatrix(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const scale = (ctx.getState('matrixScale', 'row') as Scale) ?? 'row';
  const { rows, cols, cells } = data.matrix;

  const colTotals = cols.map((_, ci) => rows.reduce((a, _r, ri) => a + (cells[ri]?.[ci] ?? 0), 0));
  const rowTotals = rows.map((_, ri) => (cells[ri] ?? []).reduce((a, b) => a + b, 0));
  const grandMax = Math.max(...cells.flat(), 1);

  const intensity = (ri: number, ci: number): number => {
    const v = cells[ri]?.[ci] ?? 0;
    if (v <= 0) return 0;
    if (scale === 'abs') return v / grandMax;
    // Row-relative: each commodity section normalised to its own biggest buyer,
    // so small sections are still readable next to iron ore.
    const rowMax = Math.max(...(cells[ri] ?? [0]));
    return rowMax > 0 ? v / rowMax : 0;
  };

  const colour = (t: number): string => {
    if (t <= 0) return 'var(--bg-surface)';
    const idx = Math.min(RAMP_EXPORT.length - 1, Math.max(0, Math.round(t * (RAMP_EXPORT.length - 1))));
    return RAMP_EXPORT[idx];
  };

  root.innerHTML = `
    <div class="view-head">
      <h2>Who buys broadly, who buys one thing</h2>
      <p>
        Each row is a ${gloss('sections', 'commodity section')}, each column a trading partner. A dense
        column means that partner buys across the board; a single bright cell means they buy essentially
        one thing. Hover any cell for the exact value; click a cell to open the partner.
      </p>
    </div>

    <div class="view-controls">
      <div class="segmented" role="tablist" aria-label="Colour scale">
        <button class="seg ${scale === 'row' ? 'active' : ''}" data-scale="row" role="tab"
          aria-selected="${scale === 'row'}">Shade within each row</button>
        <button class="seg ${scale === 'abs' ? 'active' : ''}" data-scale="abs" role="tab"
          aria-selected="${scale === 'abs'}">Shade across all</button>
      </div>
      <span class="control-note">
        ${
          scale === 'row'
            ? 'Each row is scaled to its own largest buyer — good for reading patterns in smaller sections.'
            : 'All cells share one scale — iron ore to China dominates, which is itself the finding.'
        }
      </span>
    </div>

    <div class="chart-scroll">
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="matrix-corner">Section \\ Partner</th>
            ${cols
              .map(
                (c, ci) => `<th class="matrix-col-head" data-tip="${escapeHtml(shortCountry(c.n))}: ${escapeHtml(
                  formatMoney(colTotals[ci]),
                )} across these sections">
                  <span>${escapeHtml(shortCountry(c.n))}</span></th>`,
              )
              .join('')}
            <th class="matrix-total-head">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, ri) => `
            <tr>
              <th class="matrix-row-head" data-tip="${escapeHtml(r.n)}">
                ${escapeHtml(shortName(r.n, 30))}
                ${r.conf ? '<span class="chip chip-warn">incl. confidential</span>' : ''}
              </th>
              ${cols
                .map((c, ci) => {
                  const v = cells[ri]?.[ci] ?? 0;
                  const t = intensity(ri, ci);
                  const tip =
                    `${shortName(r.n, 44)} → ${shortCountry(c.n)}\n` +
                    `${formatMoney(v)}\n` +
                    `${formatPercent(rowTotals[ri] > 0 ? v / rowTotals[ri] : 0, 1)} of this section's exports\n` +
                    `${formatPercent(colTotals[ci] > 0 ? v / colTotals[ci] : 0, 1)} of what they buy`;
                  return `<td class="matrix-cell ${v > 0 ? 'clickable' : ''}"
                    style="background:${colour(t)};color:${t > 0.55 ? '#fff' : 'var(--text-secondary)'}"
                    ${v > 0 ? `data-country="${escapeHtml(c.c)}" tabindex="0" role="button"` : ''}
                    data-tip="${escapeHtml(tip)}">${v > 0 ? escapeHtml(compact(v)) : ''}</td>`;
                })
                .join('')}
              <td class="matrix-total mono">${escapeHtml(formatMoney(rowTotals[ri]))}</td>
            </tr>`,
            )
            .join('')}
          <tr class="matrix-foot">
            <th class="matrix-row-head">Total</th>
            ${colTotals
              .map((t) => `<td class="matrix-total mono">${escapeHtml(compact(t))}</td>`)
              .join('')}
            <td class="matrix-total mono">${escapeHtml(formatMoney(colTotals.reduce((a, b) => a + b, 0)))}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="view-foot">
      Values are exports over the 12 months to ${escapeHtml(data.meta.window.end)}, at commodity-division
      detail rolled up to sections. Where destinations are withheld for confidentiality the value is
      missing from these cells — see Blind Spots.
    </p>
  `;

  root.querySelectorAll<HTMLElement>('[data-scale]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ctx.setState('matrixScale', btn.dataset.scale as string);
      renderMatrix(root, data, ctx);
    }),
  );

  root.querySelectorAll<HTMLElement>('.matrix-cell.clickable').forEach((cell) => {
    const open = () => ctx.openCountry(cell.dataset.country as string);
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

/** Compact money for dense cells: "$160bn", "$4.2bn", "$310m". */
function compact(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}bn`;
  if (m >= 1) return `${m.toFixed(0)}m`;
  return '';
}
