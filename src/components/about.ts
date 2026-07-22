// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { escapeHtml, formatMoney, formatNumber, formatPercent, formatPeriodLong } from '../format';
import { gloss } from '../glossary';
import type { Meta } from '../types';

/**
 * About modal: what this is, where the data comes from, how it updates, and —
 * the part that matters most for this dataset — what it cannot tell you.
 */
export function mountAbout(meta: Meta): { open: () => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'About Trade Flows');

  modal.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    <h2>About Trade Flows</h2>
    <p>
      Every month the Australian Bureau of Statistics publishes the value of goods crossing the border,
      broken down by commodity, partner country and state. It is one of the richest public datasets in
      the country, and it is published as SDMX queries and spreadsheets that almost nobody reads. This
      site turns it into something you can explore: ${formatNumber(meta.counts.countries)} trading
      partners, ${formatNumber(meta.counts.sitcCodes)} commodity categories and
      ${formatNumber(meta.counts.months)} months of history, back to
      ${escapeHtml(formatPeriodLong(meta.periods[0]))}.
    </p>

    <h3>The headline numbers</h3>
    <p>
      Over the ${gloss('rollingYear', '12 months')} to ${escapeHtml(formatPeriodLong(meta.window.end))},
      Australia exported <strong>${escapeHtml(formatMoney(meta.totals.exp))}</strong> of goods and
      imported <strong>${escapeHtml(formatMoney(meta.totals.imp))}</strong> — a goods
      ${meta.totals.bal >= 0 ? 'surplus' : 'deficit'} of
      <strong>${escapeHtml(formatMoney(Math.abs(meta.totals.bal)))}</strong>.
    </p>

    <h3>What confidentiality hides — read this one</h3>
    <p>
      This is the thing that makes Australian trade data tricky, and the reason this site exists in the
      shape it does. When only a few businesses ship a particular good, naming the destination country
      would reveal an individual company's commercial dealings. So the ABS publishes the value and
      ${gloss('confidentialised', 'withholds the destination')}, filing it under
      ${gloss('ncd', '“No Country Details”')}.
    </p>
    <p>
      Crucially, <strong>this happens far more at detailed commodity level than at the national
      total</strong>. Nationally, only ${escapeHtml(formatPercent(meta.unattributedShare))} of exports
      lack a country. But ask "who buys our natural gas?" and roughly
      <strong>95% of the answer is withheld</strong>. Tools that treat "No Country Details" as a country
      will tell you it is Australia's biggest gas customer, which is nonsense.
    </p>
    <p>
      So: every concentration figure here is calculated over destinations that are actually published,
      always shown alongside how much is withheld, and any commodity whose destinations are mostly hidden
      is drawn hollow in the Exposure view rather than plotted as if its position were known. The
      Blind Spots view is devoted to the gap itself.
    </p>

    <h3>Where the data comes from</h3>
    <ul>
      <li>
        <a href="https://data.api.abs.gov.au/rest/data/ABS,MERCH_EXP,1.0.0" target="_blank" rel="noopener">
          ABS Merchandise Exports by Commodity (SITC), Country and State</a> — monthly export values.
      </li>
      <li>
        <a href="https://data.api.abs.gov.au/rest/data/ABS,MERCH_IMP,1.0.0" target="_blank" rel="noopener">
          ABS Merchandise Imports by Commodity (SITC), Country and State</a> — monthly import values.
      </li>
      <li>
        <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> —
        world country boundaries (public domain); Australian state boundaries are ABS ASGS (CC BY 4.0).
      </li>
    </ul>

    <h3>How it updates</h3>
    <p>
      The ABS publishes international merchandise trade monthly, roughly five weeks after the month ends.
      This site rebuilds on the same monthly cadence. The current data covers up to
      ${escapeHtml(formatPeriodLong(meta.window.end))} and was last rebuilt on
      ${escapeHtml(new Date(meta.updated).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))}.
      Earlier months are revised as more complete customs records arrive, so figures can shift slightly
      between releases.
    </p>

    <h3>What this data can't tell you</h3>
    <ul>
      <li>
        <strong>It's goods only.</strong> ${gloss('merchandise', 'Merchandise trade')} excludes services —
        international education, tourism, and professional services. Education alone is one of Australia's
        largest exports, so these totals are not the whole trade picture.
      </li>
      <li>
        <strong>Destination is not consumption.</strong> Goods recorded as going to Singapore or Hong Kong
        may be trans-shipped or traded onward. Where something is <em>sold</em> is not always where it is
        <em>used</em>.
      </li>
      <li>
        <strong>Values are ${gloss('fob', 'free on board')}.</strong> Freight and insurance to get goods
        overseas are excluded, so these are not landed prices.
      </li>
      <li>
        <strong>Commodity detail doesn't sum to country totals.</strong> Because suppression is heavier at
        commodity level, the two are internally consistent but not additive. This is a property of the
        source, not an error here.
      </li>
      <li>
        <strong>${gloss('sitc98', 'SITC 98')} is not a product.</strong> It is a bucket for goods whose
        identity is confidential, and it is large enough to top some naive rankings.
      </li>
      <li>
        <strong>${gloss('reExports', 'Re-exports')} are included</strong> in export totals — goods
        imported and sent out again largely unchanged are not Australian production.
      </li>
    </ul>

    <p style="font-size:0.75rem;color:var(--text-tertiary);margin-top:1rem">
      An independent project, not affiliated with or endorsed by the ABS. Figures are reproduced from
      published statistics — check the source before relying on them for anything that matters.
    </p>
  `;

  document.body.append(overlay, modal);

  const open = (): void => {
    overlay.classList.add('open');
    modal.classList.add('open');
    (modal.querySelector('.modal-close') as HTMLElement)?.focus();
  };
  const close = (): void => {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  };

  overlay.addEventListener('click', close);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close };
}
