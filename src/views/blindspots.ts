import { escapeHtml, formatMoney, formatPercent, shortCountry, shortName } from '../format';
import { gloss } from '../glossary';
import { SUPPRESSED_COLOUR, sectionColour } from '../palette';
import type { Dataset } from '../types';
import type { ViewContext } from './types';

/**
 * The honest counterpart to the Exposure view.
 *
 * Australia's merchandise statistics are confidentialised at commodity level:
 * where naming the buyer would expose an individual company's dealings, the ABS
 * publishes the value and withholds the destination. Every other trade tool
 * either renders that bucket as a country called "No Country Details" or
 * silently drops it. Neither is honest, and both make the concentration figures
 * wrong. This view makes the gap itself the subject.
 */
export function renderBlindSpots(root: HTMLElement, data: Dataset, ctx: ViewContext): void {
  const rows = data.suppression.filter((s) => s.supp > 0.01).slice(0, 22);
  const maxHidden = Math.max(...rows.map((r) => r.hidden), 1);

  const totalHidden = data.suppression.reduce((a, s) => a + s.hidden, 0);
  const worst = rows[0];
  const conf98 = data.byCommodity.get('98');

  root.innerHTML = `
    <div class="view-head">
      <h2>Blind spots: the trade you can't see</h2>
      <p>
        Where too few businesses ship a good for the destination to be named without exposing an
        individual company, the ABS publishes the value but withholds the buyer. The totals stay right;
        the split disappears. This view ranks the commodities where that
        ${gloss('confidentialised', 'confidentialisation')} bites hardest — and it is the reason every
        concentration figure on this site is calculated over published destinations only.
      </p>
    </div>

    <div class="stat-strip">
      <div class="stat" data-tip="Export value whose destination country is withheld, summed across commodity groups">
        <span class="stat-label">Destinations withheld</span>
        <span class="stat-value">${escapeHtml(formatMoney(totalHidden))}</span>
      </div>
      <div class="stat" data-tip="The commodity group with the most value hidden">
        <span class="stat-label">Biggest blind spot</span>
        <span class="stat-value small">${worst ? escapeHtml(shortName(worst.n, 24)) : '—'}</span>
      </div>
      <div class="stat" data-tip="Share of that commodity's exports with no published destination">
        <span class="stat-label">Withheld share</span>
        <span class="stat-value">${worst ? escapeHtml(formatPercent(worst.supp, 0)) : '—'}</span>
      </div>
      <div class="stat" data-tip="Exports not attributed to any country at the national level">
        <span class="stat-label">Unattributed nationally</span>
        <span class="stat-value">${escapeHtml(formatPercent(data.meta.unattributedShare))}</span>
      </div>
    </div>

    ${
      worst
        ? `<div class="callout">
            <h3>${escapeHtml(formatPercent(worst.supp, 1))} of ${escapeHtml(shortName(worst.n, 44).toLowerCase())} has no published buyer</h3>
            <p>
              That is ${escapeHtml(formatMoney(worst.hidden))} of a ${escapeHtml(formatMoney(worst.exp))}
              export. For this commodity the question “who buys it?” simply cannot be answered from public
              data — not by this site, and not by any other. Where a commodity's destinations are mostly
              withheld, the Exposure view draws it hollow rather than pretending the visible sliver is
              representative.
            </p>
          </div>`
        : ''
    }

    <section class="panel">
      <h3>Where destinations are withheld</h3>
      <p class="panel-sub">
        Commodity groups ranked by the value whose destination is confidentialised. The bar shows how much
        is hidden; the figure on the right is what share of that commodity that represents.
        Click a row to open the commodity.
      </p>
      <div class="bar-list">
        ${rows
          .map(
            (r) => `
          <div class="bar-row clickable" data-commodity="${escapeHtml(r.c)}" tabindex="0" role="button"
            data-tip="${escapeHtml(shortName(r.n, 60))}: ${escapeHtml(formatMoney(r.hidden))} of ${escapeHtml(formatMoney(r.exp))} withheld">
            <span class="bar-label">
              <span class="rank-swatch" style="background:${sectionColour(r.c)}"></span>
              ${escapeHtml(shortName(r.n, 42))}
            </span>
            <span class="bar-track">
              <span class="bar-fill hatched" style="width:${((r.hidden / maxHidden) * 100).toFixed(2)}%;
                background:${SUPPRESSED_COLOUR}"></span>
            </span>
            <span class="bar-value">${escapeHtml(formatMoney(r.hidden))}</span>
            <span class="bar-sub mono">${escapeHtml(formatPercent(r.supp, 0))} of it</span>
          </div>`,
          )
          .join('')}
      </div>
    </section>

    <div class="panel-grid">
      <section class="panel">
        <h3>The other kind of blind spot</h3>
        <p class="panel-sub">Goods whose identity — not just their destination — is confidential.</p>
        ${
          conf98
            ? `<p class="prose">
                ${gloss('sitc98', 'SITC 98, “combined confidential items”')}, covers
                ${escapeHtml(formatMoney(conf98.exp))} of exports:
                ${escapeHtml(formatPercent(conf98.exp / data.meta.totals.exp))} of everything Australia
                sells. It is not a product. Ranked naively it sits among the largest export commodities in
                the country, which is why any “top exports” list that includes it is misleading. This site
                flags it wherever it appears and excludes it from commodity claims.
              </p>
              <p class="prose">
                Its counterpart, section 9 as a whole, also contains non-monetary gold — a genuine export
                of ${escapeHtml(formatMoney(data.byCommodity.get('97')?.exp ?? 0))} that surprises people
                who expect gold to sit with the other minerals.
              </p>`
            : '<p class="prose">No confidential-items bucket in this release.</p>'
        }
      </section>

      <section class="panel">
        <h3>What “not attributed” covers nationally</h3>
        <p class="panel-sub">At the national total, only a small slice has no country.</p>
        <div class="bar-list">
          ${data.countries
            .filter((c) => c.pseudo && c.exp > 0)
            .sort((a, b) => b.exp - a.exp)
            .map((c) => {
              const max = Math.max(
                ...data.countries.filter((x) => x.pseudo).map((x) => x.exp),
                1,
              );
              return `<div class="bar-row" data-tip="${escapeHtml(c.n)}: ${escapeHtml(formatMoney(c.exp))}">
                <span class="bar-label">${escapeHtml(shortCountry(c.n))}</span>
                <span class="bar-track">
                  <span class="bar-fill" style="width:${((c.exp / max) * 100).toFixed(2)}%;background:${SUPPRESSED_COLOUR}"></span>
                </span>
                <span class="bar-value">${escapeHtml(formatMoney(c.exp))}</span>
              </div>`;
            })
            .join('')}
        </div>
        <p class="prose small">
          Together these are ${escapeHtml(formatPercent(data.meta.unattributedShare))} of exports. The
          national country split is therefore near-complete — it is only when you ask
          <em>which commodity</em> went where that the gaps open up. That difference is the single most
          important thing to understand about this dataset.
        </p>
      </section>
    </div>
  `;

  root.querySelectorAll<HTMLElement>('[data-commodity]').forEach((el) => {
    const open = () => ctx.openCommodity(el.dataset.commodity as string);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}
