// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import {
  escapeHtml, formatBalance, formatChange, formatMoney, formatPercent, shortCountry, shortName,
} from '../format';
import { gloss } from '../glossary';
import { FLOW_COLOURS, sectionColour } from '../palette';
import type { Dataset } from '../types';
import { barRow, lineChart } from '../utils/svg';

/**
 * Right-hand slide-in panel for a partner or a commodity. Hash-linkable
 * (`#c=CHIN`, `#s=28`) so a specific country or product can be shared.
 */
export function mountDrilldown(data: Dataset): {
  openCountry: (code: string) => void;
  openCommodity: (code: string) => void;
  close: () => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const panel = document.createElement('aside');
  panel.className = 'drilldown';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Details');
  document.body.append(overlay, panel);

  const close = (): void => {
    overlay.classList.remove('open');
    panel.classList.remove('open');
    if (location.hash.startsWith('#c=') || location.hash.startsWith('#s=')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  };

  const show = (html: string, hash: string): void => {
    panel.innerHTML = `<button class="modal-close" aria-label="Close">×</button>${html}`;
    panel.querySelector('.modal-close')?.addEventListener('click', close);
    overlay.classList.add('open');
    panel.classList.add('open');
    panel.scrollTop = 0;
    (panel.querySelector('.modal-close') as HTMLElement)?.focus();
    history.replaceState(null, '', `#${hash}`);

    // Cross-links inside the panel swap its contents rather than stacking panels.
    panel.querySelectorAll<HTMLElement>('[data-open-country]').forEach((el) =>
      el.addEventListener('click', () => openCountry(el.dataset.openCountry as string)),
    );
    panel.querySelectorAll<HTMLElement>('[data-open-commodity]').forEach((el) =>
      el.addEventListener('click', () => openCommodity(el.dataset.openCommodity as string)),
    );
  };

  function openCountry(code: string): void {
    const c = data.byCountry.get(code);
    if (!c) return;
    const rank = data.partners
      .slice()
      .sort((a, b) => b.exp - a.exp)
      .findIndex((p) => p.c === code) + 1;
    const periods = data.meta.periods;
    const maxExp = Math.max(...c.topExp.map((t) => t.v), 1);
    const maxImp = Math.max(...c.topImp.map((t) => t.v), 1);

    show(
      `
      <header class="dd-head">
        <span class="dd-kind">Trading partner</span>
        <h2>${escapeHtml(shortCountry(c.n))}</h2>
        ${
          c.pseudo
            ? `<p class="dd-warn">Not a country — this is where trade with no published destination is
               recorded. See Blind Spots.</p>`
            : c.agg
              ? '<p class="dd-warn">A group of countries. Its members are also listed individually.</p>'
              : `<p class="dd-sub">${rank > 0 ? `#${rank} export market` : 'Trading partner'} ·
                 ${escapeHtml(formatPercent(c.exp / data.meta.totals.exp, 2))} of Australian exports</p>`
        }
      </header>

      <div class="dd-stats">
        <div class="dd-stat"><span>Exports to</span>
          <strong style="color:${FLOW_COLOURS.exp}">${escapeHtml(formatMoney(c.exp))}</strong>
          <em class="${(c.expYoy ?? 0) >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatChange(c.expYoy))} yr</em></div>
        <div class="dd-stat"><span>Imports from</span>
          <strong style="color:${FLOW_COLOURS.imp}">${escapeHtml(formatMoney(c.imp))}</strong>
          <em class="${(c.impYoy ?? 0) >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatChange(c.impYoy))} yr</em></div>
        <div class="dd-stat"><span>${gloss('balance', 'Balance')}</span>
          <strong class="${c.bal >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatBalance(c.bal))}</strong></div>
      </div>

      <section class="dd-section">
        <h3>Trade over ${data.meta.counts.months} months</h3>
        ${lineChart(
          [
            { values: c.expS, colour: FLOW_COLOURS.exp, label: 'Exports' },
            { values: c.impS, colour: FLOW_COLOURS.imp, label: 'Imports' },
          ],
          periods,
          { width: 620, height: 170 },
        )}
        <p class="dd-note">Monthly values. Hover for the figures at any month.</p>
      </section>

      <section class="dd-section">
        <h3>What Australia sells ${escapeHtml(shortCountry(c.n))}</h3>
        ${
          c.topExp.length
            ? `<div class="bar-list">${c.topExp
                .map((t) =>
                  barRow(shortName(t.n, 34), t.v, maxExp, {
                    colour: sectionColour(t.c),
                    tip: `${shortName(t.n, 60)}: ${formatMoney(t.v)} (${formatPercent(t.v / c.exp, 1)} of exports to ${shortCountry(c.n)})`,
                    sub: formatPercent(t.v / c.exp, 0),
                  }),
                )
                .join('')}</div>
               <p class="dd-note">
                 Commodity detail is confidentialised more heavily than country totals, so these
                 categories may not sum to the export figure above.
               </p>`
            : '<p class="dd-note">No commodity detail published for this partner.</p>'
        }
      </section>

      <section class="dd-section">
        <h3>What Australia buys from ${escapeHtml(shortCountry(c.n))}</h3>
        ${
          c.topImp.length
            ? `<div class="bar-list">${c.topImp
                .map((t) =>
                  barRow(shortName(t.n, 34), t.v, maxImp, {
                    colour: FLOW_COLOURS.imp,
                    tip: `${shortName(t.n, 60)}: ${formatMoney(t.v)}`,
                    sub: formatPercent(c.imp > 0 ? t.v / c.imp : 0, 0),
                  }),
                )
                .join('')}</div>`
            : '<p class="dd-note">No commodity detail published for this partner.</p>'
        }
      </section>
    `,
      `c=${code}`,
    );
  }

  function openCommodity(code: string): void {
    const s = data.byCommodity.get(code);
    if (!s) return;
    const periods = data.meta.periods;
    const siblings = data.commodities
      .filter((x) => x.lvl === s.lvl && x.exp > 0)
      .sort((a, b) => b.exp - a.exp);
    const rank = siblings.findIndex((x) => x.c === code) + 1;
    const children = data.commodities
      .filter((x) => x.p === code && x.exp > 0)
      .sort((a, b) => b.exp - a.exp);
    const parent = s.p ? data.byCommodity.get(s.p) : null;
    const maxDest = Math.max(...s.dests.map((d) => d.v), 1);
    const maxSrc = Math.max(...s.srcs.map((d) => d.v), 1);
    const maxChild = Math.max(...children.map((c) => c.exp), 1);

    show(
      `
      <header class="dd-head">
        <span class="dd-kind">Commodity · ${gloss('sitc', 'SITC')} ${escapeHtml(s.c)}</span>
        <h2>${escapeHtml(shortName(s.n, 70))}</h2>
        ${
          s.conf
            ? `<p class="dd-warn">
                 This is a confidentiality bucket, not a product — goods whose identity the ABS withholds.
                 It should not be read as a commodity.
               </p>`
            : `<p class="dd-sub">
                 ${rank > 0 ? `#${rank} of ${siblings.length} at this level` : ''}
                 · ${escapeHtml(formatPercent(s.exp / data.meta.totals.exp, 2))} of exports
                 ${parent ? `· part of ${escapeHtml(shortName(parent.n, 40))}` : ''}
               </p>`
        }
      </header>

      <div class="dd-stats">
        <div class="dd-stat"><span>Exports</span>
          <strong style="color:${FLOW_COLOURS.exp}">${escapeHtml(formatMoney(s.exp))}</strong>
          <em class="${(s.expYoy ?? 0) >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatChange(s.expYoy))} yr</em></div>
        <div class="dd-stat"><span>Imports</span>
          <strong style="color:${FLOW_COLOURS.imp}">${escapeHtml(formatMoney(s.imp))}</strong></div>
        <div class="dd-stat"><span>${gloss('balance', 'Balance')}</span>
          <strong class="${s.bal >= 0 ? 'pos' : 'neg'}">${escapeHtml(formatBalance(s.bal))}</strong></div>
      </div>

      ${
        s.top
          ? `<section class="dd-section">
              <h3>Concentration</h3>
              ${
                s.top.supp > 0.5
                  ? `<p class="dd-warn">
                       ${escapeHtml(formatPercent(s.top.supp))} of this commodity's destinations are
                       ${gloss('confidentialised', 'withheld')}. The shares below describe only the
                       ${escapeHtml(formatMoney(s.top.pub))} that is published — they are not
                       representative of the whole.
                     </p>`
                  : ''
              }
              <div class="dd-stats">
                <div class="dd-stat"><span>Largest buyer</span>
                  <strong>${escapeHtml(shortCountry(s.top.name ?? '—'))}</strong>
                  <em>${escapeHtml(formatPercent(s.top.share, 1))}</em></div>
                <div class="dd-stat"><span>Buyers</span>
                  <strong>${s.top.partners}</strong></div>
                <div class="dd-stat"><span>${gloss('hhi', 'HHI')}</span>
                  <strong>${s.top.hhi.toFixed(2)}</strong>
                  <em>${s.top.hhi > 0.25 ? 'concentrated' : 'diversified'}</em></div>
              </div>
            </section>`
          : ''
      }

      <section class="dd-section">
        <h3>Trade over ${data.meta.counts.months} months</h3>
        ${lineChart(
          [
            { values: s.expS, colour: FLOW_COLOURS.exp, label: 'Exports' },
            { values: s.impS, colour: FLOW_COLOURS.imp, label: 'Imports' },
          ],
          periods,
          { width: 620, height: 170 },
        )}
      </section>

      ${
        s.dests.length
          ? `<section class="dd-section">
              <h3>Where it goes</h3>
              <div class="bar-list">${s.dests
                .map(
                  (d) => `<div class="bar-row clickable" data-open-country="${escapeHtml(d.c)}" tabindex="0"
                    role="button" data-tip="${escapeHtml(shortCountry(d.n))}: ${escapeHtml(formatMoney(d.v))}">
                    <span class="bar-label">${escapeHtml(shortCountry(d.n))}</span>
                    <span class="bar-track"><span class="bar-fill"
                      style="width:${((d.v / maxDest) * 100).toFixed(2)}%;background:${FLOW_COLOURS.exp}"></span></span>
                    <span class="bar-value">${escapeHtml(formatMoney(d.v))}</span>
                  </div>`,
                )
                .join('')}</div>
            </section>`
          : ''
      }

      ${
        s.srcs.length
          ? `<section class="dd-section">
              <h3>Where the imports come from</h3>
              <div class="bar-list">${s.srcs
                .map(
                  (d) => `<div class="bar-row clickable" data-open-country="${escapeHtml(d.c)}" tabindex="0"
                    role="button" data-tip="${escapeHtml(shortCountry(d.n))}: ${escapeHtml(formatMoney(d.v))}">
                    <span class="bar-label">${escapeHtml(shortCountry(d.n))}</span>
                    <span class="bar-track"><span class="bar-fill"
                      style="width:${((d.v / maxSrc) * 100).toFixed(2)}%;background:${FLOW_COLOURS.imp}"></span></span>
                    <span class="bar-value">${escapeHtml(formatMoney(d.v))}</span>
                  </div>`,
                )
                .join('')}</div>
            </section>`
          : ''
      }

      ${
        children.length
          ? `<section class="dd-section">
              <h3>What's inside</h3>
              <div class="bar-list">${children
                .slice(0, 14)
                .map(
                  (ch) => `<div class="bar-row clickable" data-open-commodity="${escapeHtml(ch.c)}" tabindex="0"
                    role="button" data-tip="${escapeHtml(shortName(ch.n, 60))}: ${escapeHtml(formatMoney(ch.exp))}">
                    <span class="bar-label">${escapeHtml(shortName(ch.n, 34))}</span>
                    <span class="bar-track"><span class="bar-fill"
                      style="width:${((ch.exp / maxChild) * 100).toFixed(2)}%;background:${sectionColour(ch.c)}"></span></span>
                    <span class="bar-value">${escapeHtml(formatMoney(ch.exp))}</span>
                  </div>`,
                )
                .join('')}</div>
            </section>`
          : ''
      }
    `,
      `s=${code}`,
    );
  }

  overlay.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });

  return { openCountry, openCommodity, close };
}
