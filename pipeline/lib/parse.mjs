// Pure, dependency-free transforms shared by the pipeline and the test suite.
// Nothing in here may import a package — tests run this file directly on CI,
// where pipeline/node_modules is not installed.

/**
 * Country codes that are *aggregates of other countries*. They have no parent in
 * CL_MERCH_COUNTRY and overlap each other (a Japanese shipment is in APEC and
 * OECD both), so summing them alongside real countries double-counts.
 */
export const AGGREGATE_COUNTRIES = new Set([
  'APEC', 'ASEAN', 'JPDA', 'DC', 'LDC', 'EURO27', 'EURO', 'OECD',
]);

/**
 * Codes that occupy the country dimension but are not countries. `NCD` is the
 * big one: it is where ABS puts trade whose destination is confidentialised.
 * Ranking these as countries is how "No Country Details" ends up looking like
 * Australia's largest gas customer.
 */
export const PSEUDO_COUNTRIES = new Set([
  'NCD',  // No Country Details — suppressed destination
  'CNAV', // Country not available
  'UNKN', // Unknown
  'SHIP', // Ship and Aircraft Stores
  'AFZ',  // Australian Fishing Zone
  'ANCA', // Australian Antarctic Territory
  'ANTC', // Antarctica, nfd
  'AUST', // Australia (re-imports)
]);

/** SITC codes that are confidentiality buckets rather than products. */
export const CONFIDENTIAL_SITC = new Set(['9', '98', '988', '99', '999']);

export function isAggregateCountry(code) {
  return AGGREGATE_COUNTRIES.has(code);
}

export function isPseudoCountry(code) {
  return PSEUDO_COUNTRIES.has(code);
}

/** A code we can rank, map and attribute: a real, single country. */
export function isRealCountry(code) {
  return code !== 'TOT' && !isAggregateCountry(code) && !isPseudoCountry(code);
}

export function isConfidentialSitc(code) {
  return CONFIDENTIAL_SITC.has(code);
}

/** SITC hierarchy depth: 'TOT' → 0, '2' → 1, '28' → 2, '281' → 3. */
export function sitcLevel(code) {
  return code === 'TOT' ? 0 : code.length;
}

export function sitcParent(code) {
  if (code === 'TOT') return null;
  return code.length === 1 ? 'TOT' : code.slice(0, -1);
}

/**
 * Minimal RFC4180-ish CSV parser. The ABS commodity names contain commas *and*
 * quoted commas ("Meat, fresh, chilled or frozen"), so a naive split(',')
 * silently shifts every column after COMMODITY_SITC.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length < head.length) continue;
    const o = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = rows[i][j];
    out.push(o);
  }
  return out;
}

/**
 * ABS ships merchandise values in AUD thousands (UNIT_MULT=3). Convert once,
 * here, to whole dollars — doing it at render time is how a chart ends up
 * showing "$530,000 billion".
 */
export function obsToDollars(row) {
  const raw = row.OBS_VALUE;
  // Number('') is 0, not NaN — without this guard a blank observation silently
  // becomes a real $0 and drags averages and totals down.
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  const mult = Number(row.UNIT_MULT ?? 3);
  return v * Math.pow(10, Number.isFinite(mult) ? mult : 3);
}

/** 'YYYY-MM' → Australian financial year label ending that period ('2025-26'). */
export function financialYear(period) {
  const [y, m] = period.split('-').map(Number);
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** The last `n` periods of a sorted period list. */
export function trailingWindow(periods, n = 12) {
  const sorted = [...periods].sort();
  return sorted.slice(Math.max(0, sorted.length - n));
}

/**
 * Concentration of a commodity's trade across destinations.
 *
 * CRITICAL: shares are computed over *published* destinations only. ABS
 * confidentialises destinations at the commodity level — 94.8% of gas exports
 * carry no country — so including the suppressed bucket in the denominator
 * would report "gas is 96% concentrated on "No Country Details"", which is
 * meaningless. Instead we report the concentration of what IS published, plus
 * the suppressed share alongside it, so the caller can say "we can only see 5%
 * of this trade".
 *
 * @param {Record<string, number>} byCountry raw code → value (may include NCD etc.)
 * @returns {{total:number, published:number, suppressed:number, suppressedShare:number,
 *            topCode:string|null, topShare:number, hhi:number, partners:number}}
 */
export function concentration(byCountry) {
  let published = 0;
  let suppressed = 0;
  const real = [];
  for (const [code, value] of Object.entries(byCountry)) {
    if (code === 'TOT' || isAggregateCountry(code)) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    if (isPseudoCountry(code)) { suppressed += value; continue; }
    published += value;
    real.push([code, value]);
  }
  const total = published + suppressed;
  real.sort((a, b) => b[1] - a[1]);
  const hhi = published > 0
    ? real.reduce((acc, [, v]) => acc + (v / published) ** 2, 0)
    : 0;
  return {
    total,
    published,
    suppressed,
    suppressedShare: total > 0 ? suppressed / total : 0,
    topCode: real.length ? real[0][0] : null,
    topShare: published > 0 && real.length ? real[0][1] / published : 0,
    hhi,
    partners: real.length,
  };
}

/** Sum a monthly series over a set of periods. */
export function sumOver(series, periods) {
  const want = periods instanceof Set ? periods : new Set(periods);
  let total = 0;
  for (const [period, value] of Object.entries(series)) {
    if (want.has(period) && Number.isFinite(value)) total += value;
  }
  return total;
}

/**
 * Compact a period→value map to a dense array aligned to `periods`.
 *
 * Missing months become 0: for an individual partner or commodity an absent
 * observation means no recorded trade that month, which is a real zero.
 */
export function densify(series, periods, scale = 1e6) {
  return periods.map((p) => {
    const v = series[p];
    return Number.isFinite(v) ? Math.round((v / scale) * 10) / 10 : 0;
  });
}

/**
 * Same, but missing months become null rather than 0.
 *
 * Use this wherever a gap means "not published" rather than "no trade". The
 * ABS import series begins in July 2000 while exports go back to July 1996, so
 * zero-filling the national totals draws four years of Australia importing
 * exactly nothing — which is not what the data says, and looked entirely
 * plausible on the chart.
 */
export function densifyNullable(series, periods, scale = 1e6) {
  return periods.map((p) => {
    const v = series[p];
    return Number.isFinite(v) ? Math.round((v / scale) * 10) / 10 : null;
  });
}

/**
 * Year-on-year change between the trailing window and the window before it.
 * Returns null when the prior window is absent or zero (a new trade line has no
 * meaningful growth rate — reporting Infinity% is worse than reporting nothing).
 */
export function yoyChange(series, periods) {
  if (!periods.length) return null;
  const current = sumOver(series, periods);
  const priorPeriods = priorWindow(periods);
  const prior = sumOver(series, priorPeriods);
  if (!prior) return null;
  return (current - prior) / prior;
}

/** The equally-sized window immediately before `periods`. */
export function priorWindow(periods) {
  return periods.map((p) => {
    const [y, m] = p.split('-').map(Number);
    return `${y - 1}-${String(m).padStart(2, '0')}`;
  });
}
