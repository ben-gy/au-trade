// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { rankBy } from '../analysis';
import {
  escapeHtml, formatBalance, formatChange, formatMoney, formatPercent, shortCountry, shortName,
} from '../format';
import { gloss } from '../glossary';
import { FLOW_COLOURS } from '../palette';
import type { Dataset } from '../types';
import { sparkline } from '../utils/svg';
import type { ViewContext } from './types';

type SortKey = 'exp' | 'imp' | 'bal';

const SORTS: Array<{ key: SortKey; label: string; blurb: string }> = [
  { key: 'exp', label: 'Exports', blurb: 'What Australia sells them.' },
  { key: 'imp', label: 'Imports', blurb: 'What Australia buys from them.' },
  { key: 'bal', label: 'Trade balance', blurb: 'Exports minus imports — surplus first, deficit last.' },
];

/**
 * The leaderboard. Default view: it answers the question most visitors arrive
 * with ("who do we actually trade with?") and every row is a door into the
 * partner drill-down.
 */
export function renderPartners(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const sortKey = (ctx.getState('partnerSort', 'exp') as SortKey) ?? 'exp';
  const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
  const ranked = rankBy(data.partners, sort.key, 'desc');
  const totalExp = data.meta.totals.exp;
  const totalImp = data.meta.totals.imp;
  const maxAbs = Math.max(...ranked.map((c) => Math.abs(c[sort.key])), 1);

  root.innerHTML = `
    <div class="view-head">
      <h2>Australia's trading partners</h2>
      <p>
        Every country Australia traded goods with in the ${gloss('rollingYear', '12 months')} to
        ${escapeHtml(data.meta.window.end)}, ranked by ${escapeHtml(sort.label.toLowerCase())}.
        ${escapeHtml(sort.blurb)} Click any partner for its full basket and 30-year history.
      </p>
    </div>
    <div class="view-controls">
      <label class="control">Rank by
        <select id="partner-sort">
          ${SORTS.map((s) => `<option value="${s.key}" ${s.key === sort.key ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </label>
      <label class="control search-inline">Filter
        <input type="search" id="partner-filter" placeholder="Country name…" autocomplete="off" />
      </label>
      <span class="control-note">
        Country groups such as OECD and ASEAN overlap each other and are excluded from this ranking.
      </span>
    </div>

    <div class="stat-strip">
      <div class="stat" data-tip="Total goods exported in the rolling 12-month window">
        <span class="stat-label">Exports</span>
        <span class="stat-value" style="color:${FLOW_COLOURS.exp}">${escapeHtml(formatMoney(totalExp))}</span>
      </div>
      <div class="stat" data-tip="Total goods imported in the rolling 12-month window">
        <span class="stat-label">Imports</span>
        <span class="stat-value" style="color:${FLOW_COLOURS.imp}">${escapeHtml(formatMoney(totalImp))}</span>
      </div>
      <div class="stat" data-tip="Exports minus imports">
        <span class="stat-label">Balance</span>
        <span class="stat-value">${escapeHtml(formatBalance(data.meta.totals.bal))}</span>
      </div>
      <div class="stat" data-tip="Countries and territories Australia traded goods with">
        <span class="stat-label">Partners</span>
        <span class="stat-value">${data.meta.counts.countries}</span>
      </div>
    </div>

    <div class="table-scroll">
      <table class="data-table" id="partner-table">
        <thead>
          <tr>
            <th class="col-rank">#</th>
            <th>Partner</th>
            <th class="num">Exports</th>
            <th class="num">Imports</th>
            <th class="num">Balance</th>
            <th class="num col-hide-sm">Share of exports</th>
            <th class="num col-hide-sm">Change</th>
            <th class="col-hide-md">Exports, ${data.meta.counts.months} months</th>
            <th class="col-hide-md">Top export</th>
          </tr>
        </thead>
        <tbody id="partner-body"></tbody>
      </table>
    </div>
    <p class="view-foot" id="partner-foot"></p>
  `;

  const body = root.querySelector('#partner-body') as HTMLElement;
  const foot = root.querySelector('#partner-foot') as HTMLElement;

  const draw = (filter: string): void => {
    const needle = filter.trim().toLowerCase();
    const rows = needle
      ? ranked.filter((c) => c.n.toLowerCase().includes(needle))
      : ranked;

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="9" class="empty-cell">No partner matches “${escapeHtml(filter)}”.</td></tr>`;
      foot.textContent = '';
      return;
    }

    body.innerHTML = rows
      .map((c) => {
        const barPct = Math.min(100, (Math.abs(c[sort.key]) / maxAbs) * 100);
        const barColour =
          sort.key === 'bal'
            ? c.bal >= 0 ? FLOW_COLOURS.exp : FLOW_COLOURS.imp
            : sort.key === 'imp' ? FLOW_COLOURS.imp : FLOW_COLOURS.exp;
        const top = c.topExp[0];
        return `
        <tr class="clickable" data-country="${escapeHtml(c.c)}" tabindex="0"
            aria-label="Open ${escapeHtml(shortCountry(c.n))}">
          <td class="col-rank mono">${c.rank}</td>
          <td class="col-name">
            <span class="row-bar" style="width:${barPct.toFixed(1)}%;background:${barColour}"></span>
            <span class="row-name">${escapeHtml(shortCountry(c.n))}</span>
          </td>
          <td class="num mono">${escapeHtml(formatMoney(c.exp))}</td>
          <td class="num mono">${escapeHtml(formatMoney(c.imp))}</td>
          <td class="num mono ${c.bal >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatBalance(c.bal))}</td>
          <td class="num mono col-hide-sm">${escapeHtml(formatPercent(c.exp / totalExp, 2))}</td>
          <td class="num mono col-hide-sm ${(c.expYoy ?? 0) >= 0 ? 'pos' : 'neg'}"
              data-tip="Exports vs the preceding 12 months">${escapeHtml(formatChange(c.expYoy))}</td>
          <td class="col-hide-md spark-cell"
              data-tip="Monthly exports to ${escapeHtml(shortCountry(c.n))}">${sparkline(c.expS, { colour: FLOW_COLOURS.exp })}</td>
          <td class="col-hide-md muted">${top ? escapeHtml(shortName(top.n, 28)) : '—'}</td>
        </tr>`;
      })
      .join('');

    foot.textContent =
      `Showing ${rows.length} of ${ranked.length} partners. ` +
      `${formatMoney(data.meta.unattributedExp)} of exports (${formatPercent(data.meta.unattributedShare)}) ` +
      `is not attributed to any country — ship and aircraft stores, and destinations withheld for confidentiality.`;

    body.querySelectorAll<HTMLElement>('tr.clickable').forEach((tr) => {
      const open = () => ctx.openCountry(tr.dataset.country as string);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  };

  draw('');

  root.querySelector('#partner-sort')?.addEventListener('change', (e) => {
    ctx.setState('partnerSort', (e.target as HTMLSelectElement).value);
    renderPartners(root, data, ctx);
  });

  const filterInput = root.querySelector('#partner-filter') as HTMLInputElement;
  let timer: ReturnType<typeof setTimeout>;
  filterInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => draw(filterInput.value), 300);
  });
  ctx.onTeardown(() => clearTimeout(timer));
}
