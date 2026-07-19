import { formatChange, formatMoney, formatPercent, shortCountry, shortName } from './format';
import type { Commodity, Country, Dataset } from './types';

export type Severity = 'info' | 'warn' | 'alert';

/**
 * End a sentence that may already finish with a truncation ellipsis, so a
 * shortened commodity name doesn't produce "…data processing….".
 */
function endSentence(s: string): string {
  return /[.…!?]$/.test(s) ? s : `${s}.`;
}

export interface Insight {
  severity: Severity;
  title: string;
  body: string;
  /** Optional jump target: a view id, plus an entity to open. */
  view?: string;
  country?: string;
  commodity?: string;
}

/** Quantile breaks over a sorted copy of `values`. */
export function quantileBreaks(values: number[], buckets: number): number[] {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const breaks: number[] = [];
  for (let i = 1; i < buckets; i++) {
    const pos = (i / buckets) * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    breaks.push(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
  }
  return breaks;
}

/**
 * Log-spaced breaks for a sequential ramp.
 *
 * Quantiles are wrong for trade values. The distribution is brutally skewed —
 * China takes 35% of exports while most of the 224 partners take under 0.1% —
 * so quantile buckets put China and Canada in the same shade and the map stops
 * showing the one thing it exists to show. Log breaks keep magnitude visible:
 * each step up the ramp is roughly a ten-fold increase.
 */
export function logBreaks(values: number[], buckets: number): number[] {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!positive.length) return [];
  const min = Math.log10(Math.min(...positive));
  const max = Math.log10(Math.max(...positive));
  const span = max - min || 1;
  const breaks: number[] = [];
  for (let i = 1; i < buckets; i++) breaks.push(10 ** (min + (span * i) / buckets));
  return breaks;
}

/**
 * Symmetric log breaks around zero for a diverging ramp (trade balance).
 * Produces `ramp.length - 1` breaks: three negative bands, a near-zero band,
 * and three positive bands.
 */
export function divergingBreaks(values: number[], buckets: number): number[] {
  const magnitudes = values.filter((v) => Number.isFinite(v) && v !== 0).map(Math.abs);
  if (!magnitudes.length) return [];
  const side = Math.max(1, Math.floor((buckets - 1) / 2));
  const max = Math.log10(Math.max(...magnitudes));
  // Floor the range at four decades below the largest magnitude, so a single
  // tiny partner doesn't stretch the scale flat.
  let min = Math.log10(Math.max(Math.min(...magnitudes), 10 ** (max - 4)));
  if (!(max - min > 0)) min = max - 1; // all magnitudes equal — give it a decade
  const span = max - min;
  // Breaks sit strictly INSIDE (min, max): the outermost break must be below
  // the largest magnitude, or the biggest surplus and biggest deficit both land
  // in the middle bucket and the diverging ramp says nothing.
  const levels: number[] = [];
  for (let i = side; i >= 1; i--) levels.push(10 ** (min + (span * i) / (side + 1)));
  // [-large … -small, +small … +large], ascending as rampColour requires.
  return [...levels.map((v) => -v), ...levels.slice().reverse()];
}

export function median(values: number[]): number {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Histogram bins over log10 of the values. Trade values span six orders of
 * magnitude ($0.1m to $160,000m), so linear bins put 95% of commodities in the
 * first bar and tell you nothing.
 */
export function logBins(values: number[], binCount = 18): Array<{ lo: number; hi: number; n: number }> {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!positive.length) return [];
  const min = Math.log10(Math.min(...positive));
  const max = Math.log10(Math.max(...positive));
  const span = max - min || 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    lo: 10 ** (min + (span * i) / binCount),
    hi: 10 ** (min + (span * (i + 1)) / binCount),
    n: 0,
  }));
  for (const v of positive) {
    const idx = Math.min(binCount - 1, Math.floor(((Math.log10(v) - min) / span) * binCount));
    bins[idx].n++;
  }
  return bins;
}

/** Share of the total held by the top `n` entries of a descending list. */
export function topShare(sortedDesc: number[], n: number): number {
  const total = sortedDesc.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return sortedDesc.slice(0, n).reduce((a, b) => a + b, 0) / total;
}

/**
 * Auto-detected findings. Each one is a claim the data supports on its own —
 * no hand-written narrative that could drift out of date when ABS revises.
 */
export function buildInsights(data: Dataset): Insight[] {
  const out: Insight[] = [];
  const { partners, commodities, meta } = data;

  const byExport = [...partners].sort((a, b) => b.exp - a.exp);
  const totalExp = meta.totals.exp;

  // 1. Single-partner dominance: is the top partner bigger than the next five?
  if (byExport.length > 6) {
    const top = byExport[0];
    const nextFive = byExport.slice(1, 6);
    const nextFiveTotal = nextFive.reduce((a, c) => a + c.exp, 0);
    if (top.exp > nextFiveTotal) {
      out.push({
        severity: 'alert',
        title: `${shortCountry(top.n)} buys more than the next five partners combined`,
        body:
          `${shortCountry(top.n)} took ${formatMoney(top.exp)} of Australian goods in the 12 months to ` +
          `${meta.window.end.replace('-', '/')} — ${formatPercent(top.exp / totalExp)} of all exports. ` +
          `${nextFive.map((c) => shortCountry(c.n)).slice(0, -1).join(', ')} and ` +
          `${shortCountry(nextFive[nextFive.length - 1].n)} together account for ` +
          `${formatMoney(nextFiveTotal)}. One customer, more than the rest of the top six put together.`,
        view: 'partners',
        country: top.c,
      });
    }
  }

  // 2. Basket concentration: how few commodity divisions carry the exports?
  const divisions = commodities.filter((c) => c.lvl === 2 && c.exp > 0).sort((a, b) => b.exp - a.exp);
  if (divisions.length > 4) {
    const top4 = divisions.slice(0, 4);
    const share = top4.reduce((a, c) => a + c.exp, 0) / totalExp;
    if (share > 0.4) {
      out.push({
        severity: 'warn',
        title: `Four commodity groups are ${formatPercent(share, 0)} of everything Australia sells`,
        body:
          `${top4.map((c) => shortName(c.n, 34)).join(', ')} together came to ` +
          `${formatMoney(top4.reduce((a, c) => a + c.exp, 0))}. The remaining ` +
          `${divisions.length - 4} commodity groups share what's left. An export base this narrow moves ` +
          `with a handful of commodity prices.`,
        view: 'commodities',
        commodity: top4[0].c,
      });
    }
  }

  // 3. The most exposed large export — big, and hostage to one buyer.
  const exposed = divisions
    .filter((c) => !c.conf && c.exp > 5000 && c.top && c.top.supp < 0.5 && c.top.share > 0.5)
    .sort((a, b) => b.exp * (b.top?.share ?? 0) - a.exp * (a.top?.share ?? 0));
  if (exposed.length && exposed[0].top) {
    const c = exposed[0];
    const t = c.top!;
    out.push({
      severity: 'alert',
      title: `${formatPercent(t.share, 0)} of ${shortName(c.n, 40).toLowerCase()} goes to one country`,
      body:
        `${shortName(c.n, 60)} is a ${formatMoney(c.exp)} export, and ${formatPercent(t.share)} of the ` +
        `part with a published destination goes to ${shortCountry(t.name ?? '')}. Across ${t.partners} ` +
        `buyers the concentration index is ${t.hhi.toFixed(2)}. This is the single largest ` +
        `value-times-concentration exposure in the export book.`,
      view: 'exposure',
      commodity: c.c,
    });
  }

  // 4. The blind spot — the largest export whose destinations are withheld.
  const hidden = [...data.suppression].sort((a, b) => b.hidden - a.hidden)[0];
  if (hidden && hidden.supp > 0.3) {
    out.push({
      severity: 'warn',
      title: `${formatPercent(hidden.supp, 0)} of ${shortName(hidden.n, 36).toLowerCase()} has no published destination`,
      body:
        `${formatMoney(hidden.hidden)} of ${shortName(hidden.n, 50)} exports — out of ${formatMoney(hidden.exp)} ` +
        `— is confidentialised, meaning the ABS publishes the value but withholds the buyer to protect ` +
        `commercially sensitive dealings. For this commodity, "who buys it" cannot be answered from ` +
        `public data at all.`,
      view: 'blindspots',
      commodity: hidden.c,
    });
  }

  // 5. Biggest deficit partner.
  const deficits = [...partners].sort((a, b) => a.bal - b.bal);
  if (deficits.length && deficits[0].bal < 0) {
    const d = deficits[0];
    out.push({
      severity: 'info',
      title: `The largest trade deficit is with ${shortCountry(d.n)}`,
      body:
        `Australia bought ${formatMoney(d.imp)} from ${shortCountry(d.n)} and sold ${formatMoney(d.exp)} ` +
        `back — a deficit of ${formatMoney(Math.abs(d.bal))}. ` +
        (d.topImp.length
          ? endSentence(`The biggest inbound category is ${shortName(d.topImp[0].n, 44).toLowerCase()}`)
          : ''),
      view: 'partners',
      country: d.c,
    });
  }

  // 6. Fastest-growing sizeable partner.
  const risers = partners
    .filter((c) => c.exp > 2000 && c.expYoy !== null)
    .sort((a, b) => (b.expYoy ?? 0) - (a.expYoy ?? 0));
  if (risers.length && (risers[0].expYoy ?? 0) > 0.15) {
    const r = risers[0];
    out.push({
      severity: 'info',
      title: `Exports to ${shortCountry(r.n)} grew ${formatChange(r.expYoy)} in a year`,
      body:
        `${shortCountry(r.n)} now takes ${formatMoney(r.exp)}, up ${formatChange(r.expYoy)} on the ` +
        `preceding twelve months — the fastest growth of any partner buying more than $2bn. ` +
        (r.topExp.length ? endSentence(`Mostly ${shortName(r.topExp[0].n, 44).toLowerCase()}`) : ''),
      view: 'partners',
      country: r.c,
    });
  }

  // 7. Fastest-shrinking sizeable partner.
  const fallers = partners
    .filter((c) => c.exp > 2000 && c.expYoy !== null)
    .sort((a, b) => (a.expYoy ?? 0) - (b.expYoy ?? 0));
  if (fallers.length && (fallers[0].expYoy ?? 0) < -0.15) {
    const f = fallers[0];
    out.push({
      severity: 'warn',
      title: `Exports to ${shortCountry(f.n)} fell ${formatChange(f.expYoy)}`,
      body:
        `${shortCountry(f.n)} bought ${formatMoney(f.exp)} of Australian goods, down ` +
        `${formatChange(f.expYoy)} year on year — the sharpest fall among partners above $2bn.`,
      view: 'partners',
      country: f.c,
    });
  }

  // 8. The confidential-items bucket, if it is large enough to mislead.
  const conf = commodities.find((c) => c.c === '98');
  if (conf && conf.exp / totalExp > 0.02) {
    const rank = divisions.findIndex((c) => c.c === '98') + 1;
    out.push({
      severity: 'info',
      title: `"Confidential items" would rank #${rank} among export commodities`,
      body:
        `SITC 98 — goods whose very identity is commercially sensitive — accounts for ` +
        `${formatMoney(conf.exp)}, ${formatPercent(conf.exp / totalExp)} of exports. It is not a ` +
        `product, and this site excludes it from "top commodity" claims, but any ranking that treats it ` +
        `as one will put it near the top.`,
      view: 'blindspots',
    });
  }

  // 9. Trade balance direction.
  const bal = meta.totals.bal;
  out.push({
    severity: bal >= 0 ? 'info' : 'warn',
    title: bal >= 0
      ? `Australia ran a ${formatMoney(bal)} goods surplus`
      : `Australia ran a ${formatMoney(Math.abs(bal))} goods deficit`,
    body:
      `Over the 12 months to ${meta.window.end.replace('-', '/')}, exports of ${formatMoney(meta.totals.exp)} ` +
      `against imports of ${formatMoney(meta.totals.imp)}. This counts goods only — services such as ` +
      `international education and tourism are excluded, and they are among Australia's largest exports.`,
    view: 'trend',
  });

  return out;
}

/** Partners ranked with a rank number attached, for the leaderboard. */
export function rankBy(
  partners: Country[],
  key: 'exp' | 'imp' | 'bal',
  direction: 'desc' | 'asc' = 'desc',
): Array<Country & { rank: number }> {
  const sorted = [...partners].sort((a, b) => (direction === 'desc' ? b[key] - a[key] : a[key] - b[key]));
  return sorted.map((c, i) => ({ ...c, rank: i + 1 }));
}

/** Commodities eligible for the exposure scatter: real products with a published split. */
export function exposureSet(commodities: Commodity[]): Commodity[] {
  return commodities.filter((c) => c.lvl === 2 && !c.conf && c.exp > 100 && c.top && c.top.partners > 0);
}
