// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Aggregate: turn the cached ABS CSV slices into the JSON the browser reads.
//
// Everything here is deterministic — same cache in, same bytes out.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  parseCsv, obsToDollars, isRealCountry, isAggregateCountry, isPseudoCountry,
  isConfidentialSitc, sitcLevel, sitcParent, concentration, sumOver, densify,
  densifyNullable, financialYear, priorWindow,
} from './lib/parse.mjs';
import { resolveIso3, normaliseName } from './lib/countryMap.mjs';

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const OUT = join(HERE, '..', 'public', 'data');

const WINDOW = 12; // rolling months for every headline figure

const read = async (f) => parseCsv(await readFile(join(CACHE, f), 'utf8'));
const M = (v) => Math.round((v / 1e6) * 10) / 10; // dollars → $m, 1dp

/** Build code→name lookups from the SDMX structure. */
async function loadCodelists() {
  const st = JSON.parse(await readFile(join(CACHE, 'structure.json'), 'utf8'));
  const by = Object.fromEntries(st.data.codelists.map((c) => [c.id, c]));
  const names = (id) => Object.fromEntries(by[id].codes.map((c) => [c.id, c.name]));
  return {
    country: names('CL_MERCH_COUNTRY'),
    sitc: names('CL_MERCH_SITC'),
    state: names('CL_MERCH_STATE'),
  };
}

/**
 * Index a slice into nested maps keyed by whichever dimension we asked to vary.
 * ABS names the country/state dimensions differently between exports and
 * imports (COUNTRY_DEST/STATE_ORIGIN vs COUNTRY_ORIGIN/STATE_DEST), so resolve
 * the column names from the header rather than hard-coding either spelling.
 */
function dims(rows) {
  const keys = Object.keys(rows[0] ?? {});
  return {
    country: keys.find((k) => k.startsWith('COUNTRY')) ?? 'COUNTRY_DEST',
    state: keys.find((k) => k.startsWith('STATE')) ?? 'STATE_ORIGIN',
  };
}

/** rows → { [key]: { [period]: dollars } } */
function series(rows, keyCol) {
  const out = {};
  for (const r of rows) {
    const v = obsToDollars(r);
    if (v === null) continue;
    const k = r[keyCol];
    (out[k] ??= {})[r.TIME_PERIOD] = (out[k][r.TIME_PERIOD] ?? 0) + v;
  }
  return out;
}

/** rows → { [a]: { [b]: dollars } } summed over the given periods. */
function cross(rows, colA, colB, periods) {
  const want = new Set(periods);
  const out = {};
  for (const r of rows) {
    if (!want.has(r.TIME_PERIOD)) continue;
    const v = obsToDollars(r);
    if (v === null) continue;
    const a = (out[r[colA]] ??= {});
    a[r[colB]] = (a[r[colB]] ?? 0) + v;
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const cl = await loadCodelists();

  // ── national monthly ────────────────────────────────────────────────────
  const expNat = await read('exp-national.csv');
  const impNat = await read('imp-national.csv');
  const expNatS = series(expNat, 'COMMODITY_SITC').TOT ?? {};
  const impNatS = series(impNat, 'COMMODITY_SITC').TOT ?? {};
  const periods = [...new Set([...Object.keys(expNatS), ...Object.keys(impNatS)])].sort();
  const window = periods.slice(-WINDOW);
  const windowSet = new Set(window);
  const prior = priorWindow(window);

  const totalExp = sumOver(expNatS, windowSet);
  const totalImp = sumOver(impNatS, windowSet);

  // ── partners ────────────────────────────────────────────────────────────
  const expCountryRows = await read('exp-by-country.csv');
  const impCountryRows = await read('imp-by-country.csv');
  const expD = dims(expCountryRows);
  const impD = dims(impCountryRows);
  const expByCountry = series(expCountryRows, expD.country);
  const impByCountry = series(impCountryRows, impD.country);

  // Natural Earth index for the name fallback.
  const neRaw = JSON.parse(await readFile(join(CACHE, 'ne_50m_admin_0_map_units.geojson'), 'utf8'));
  const neIndex = new Map();
  for (const f of neRaw.features) {
    const p = f.properties;
    const iso = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ISO_A3;
    if (!iso || iso === '-99') continue;
    for (const k of ['ADMIN', 'NAME', 'NAME_LONG', 'NAME_SORT', 'GEOUNIT', 'BRK_NAME']) {
      if (p[k]) neIndex.set(normaliseName(p[k]), iso);
    }
  }

  // Commodity × country, trailing window — used for each partner's basket and
  // for every concentration figure.
  const expCC = await read('exp-commodity-country.csv');
  const impCC = await read('imp-commodity-country.csv');
  const expCCd = dims(expCC);
  const impCCd = dims(impCC);
  const expByCountryCommodity = cross(expCC, expCCd.country, 'COMMODITY_SITC', window);
  const impByCountryCommodity = cross(impCC, impCCd.country, 'COMMODITY_SITC', window);
  const expByCommodityCountry = cross(expCC, 'COMMODITY_SITC', expCCd.country, window);
  const impByCommodityCountry = cross(impCC, 'COMMODITY_SITC', impCCd.country, window);

  const allCountryCodes = [...new Set([...Object.keys(expByCountry), ...Object.keys(impByCountry)])];

  const topBasket = (map, code, n = 8) =>
    Object.entries(map[code] ?? {})
      .filter(([sitc, v]) => sitcLevel(sitc) === 2 && v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([sitc, v]) => ({ c: sitc, n: cl.sitc[sitc] ?? sitc, v: M(v), x: isConfidentialSitc(sitc) || undefined }));

  const countries = [];
  let unmappedValue = 0;
  const unmapped = [];
  for (const code of allCountryCodes) {
    if (code === 'TOT') continue;
    const agg = isAggregateCountry(code);
    const pseudo = isPseudoCountry(code);
    const exp = sumOver(expByCountry[code] ?? {}, windowSet);
    const imp = sumOver(impByCountry[code] ?? {}, windowSet);
    if (exp <= 0 && imp <= 0) continue;
    const expPrior = sumOver(expByCountry[code] ?? {}, new Set(prior));
    const impPrior = sumOver(impByCountry[code] ?? {}, new Set(prior));
    const iso3 = agg || pseudo ? null : resolveIso3(code, cl.country[code] ?? code, neIndex);
    if (!agg && !pseudo && !iso3) { unmappedValue += exp + imp; unmapped.push([code, cl.country[code], M(exp + imp)]); }
    countries.push({
      c: code,
      n: cl.country[code] ?? code,
      iso3,
      agg: agg || undefined,
      pseudo: pseudo || undefined,
      exp: M(exp),
      imp: M(imp),
      bal: M(exp - imp),
      expYoy: expPrior > 0 ? Math.round(((exp - expPrior) / expPrior) * 1000) / 1000 : null,
      impYoy: impPrior > 0 ? Math.round(((imp - impPrior) / impPrior) * 1000) / 1000 : null,
      expS: densify(expByCountry[code] ?? {}, periods),
      impS: densify(impByCountry[code] ?? {}, periods),
      topExp: topBasket(expByCountryCommodity, code),
      topImp: topBasket(impByCountryCommodity, code),
    });
  }
  countries.sort((a, b) => b.exp + b.imp - (a.exp + a.imp));

  // ── commodities ─────────────────────────────────────────────────────────
  const expCom = await read('exp-by-commodity.csv');
  const impCom = await read('imp-by-commodity.csv');
  const expByCom = series(expCom, 'COMMODITY_SITC');
  const impByCom = series(impCom, 'COMMODITY_SITC');
  const allSitc = [...new Set([...Object.keys(expByCom), ...Object.keys(impByCom)])];

  const topDests = (map, code, n = 10) => {
    const row = map[code] ?? {};
    return Object.entries(row)
      .filter(([c, v]) => isRealCountry(c) && v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([c, v]) => ({ c, n: cl.country[c] ?? c, v: M(v) }));
  };

  const commodities = [];
  for (const code of allSitc) {
    const exp = sumOver(expByCom[code] ?? {}, windowSet);
    const imp = sumOver(impByCom[code] ?? {}, windowSet);
    if (exp <= 0 && imp <= 0) continue;
    const expPrior = sumOver(expByCom[code] ?? {}, new Set(prior));
    // Concentration only exists where we pulled the country split (divisions).
    const conc = sitcLevel(code) === 2 ? concentration(expByCommodityCountry[code] ?? {}) : null;
    const iconc = sitcLevel(code) === 2 ? concentration(impByCommodityCountry[code] ?? {}) : null;
    commodities.push({
      c: code,
      n: cl.sitc[code] ?? code,
      lvl: sitcLevel(code),
      p: sitcParent(code),
      conf: isConfidentialSitc(code) || undefined,
      exp: M(exp),
      imp: M(imp),
      bal: M(exp - imp),
      expYoy: expPrior > 0 ? Math.round(((exp - expPrior) / expPrior) * 1000) / 1000 : null,
      expS: densify(expByCom[code] ?? {}, periods),
      impS: densify(impByCom[code] ?? {}, periods),
      top: conc
        ? {
            code: conc.topCode,
            name: conc.topCode ? cl.country[conc.topCode] : null,
            share: Math.round(conc.topShare * 1000) / 1000,
            hhi: Math.round(conc.hhi * 1000) / 1000,
            partners: conc.partners,
            supp: Math.round(conc.suppressedShare * 1000) / 1000,
            pub: M(conc.published),
          }
        : null,
      itop: iconc && iconc.topCode
        ? { code: iconc.topCode, name: cl.country[iconc.topCode], share: Math.round(iconc.topShare * 1000) / 1000 }
        : null,
      dests: sitcLevel(code) === 2 ? topDests(expByCommodityCountry, code) : [],
      srcs: sitcLevel(code) === 2 ? topDests(impByCommodityCountry, code) : [],
    });
  }
  commodities.sort((a, b) => b.exp - a.exp);

  // ── matrix: section × top partners ──────────────────────────────────────
  const sections = commodities.filter((c) => c.lvl === 1).sort((a, b) => b.exp - a.exp);
  const topPartners = countries.filter((c) => !c.agg && !c.pseudo).slice(0, 25);
  // Divisions roll up to their section; the pulled grid is division-level.
  const sectionCountry = {};
  for (const [div, row] of Object.entries(expByCommodityCountry)) {
    const sec = div[0];
    const target = (sectionCountry[sec] ??= {});
    for (const [ctry, v] of Object.entries(row)) target[ctry] = (target[ctry] ?? 0) + v;
  }
  const matrix = {
    rows: sections.map((s) => ({ c: s.c, n: s.n, conf: s.conf })),
    cols: topPartners.map((p) => ({ c: p.c, n: p.n })),
    cells: sections.map((s) => topPartners.map((p) => M(sectionCountry[s.c]?.[p.c] ?? 0))),
  };

  // ── states ──────────────────────────────────────────────────────────────
  const expStateRows = await read('exp-by-state.csv');
  const impStateRows = await read('imp-by-state.csv');
  const expStateS = series(expStateRows, dims(expStateRows).state);
  const impStateS = series(impStateRows, dims(impStateRows).state);
  const expCS = await read('exp-commodity-state.csv');
  const expCSd = dims(expCS);
  const stateCommodity = cross(expCS, expCSd.state, 'COMMODITY_SITC', window);
  const expSC = await read('exp-state-country.csv');
  const expSCd = dims(expSC);
  const scWindow = [...new Set(expSC.map((r) => r.TIME_PERIOD))].sort().slice(-WINDOW);
  const stateCountry = cross(expSC, expSCd.state, expSCd.country, scWindow);

  const STATE_ISO = { 1: 'NSW', 2: 'VIC', 3: 'QLD', 4: 'SA', 5: 'WA', 6: 'TAS', 7: 'NT', 8: 'ACT' };
  const states = Object.entries(STATE_ISO).map(([code, abbr]) => {
    const exp = sumOver(expStateS[code] ?? {}, windowSet);
    const imp = sumOver(impStateS[code] ?? {}, windowSet);
    return {
      c: code,
      abbr,
      n: cl.state[code] ?? abbr,
      exp: M(exp),
      imp: M(imp),
      bal: M(exp - imp),
      expS: densify(expStateS[code] ?? {}, periods),
      top: Object.entries(stateCommodity[code] ?? {})
        .filter(([s, v]) => sitcLevel(s) === 2 && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([s, v]) => ({ c: s, n: cl.sitc[s], v: M(v) })),
      partners: Object.entries(stateCountry[code] ?? {})
        .filter(([c, v]) => isRealCountry(c) && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([c, v]) => ({ c, n: cl.country[c], v: M(v) })),
    };
  }).filter((s) => s.exp > 0 || s.imp > 0);

  // ── unattributed / suppression summary ──────────────────────────────────
  const unattributedExp = countries.filter((c) => c.pseudo).reduce((a, c) => a + c.exp, 0);
  const suppressed = commodities
    .filter((c) => c.lvl === 2 && c.top && c.exp > 500 && !c.conf)
    .map((c) => ({ c: c.c, n: c.n, exp: c.exp, supp: c.top.supp, hidden: Math.round(c.exp * c.top.supp * 10) / 10 }))
    .sort((a, b) => b.hidden - a.hidden);

  // ── world geojson: simplify + tag with ABS codes ─────────────────────────
  const isoToAbs = new Map();
  for (const c of countries) if (c.iso3) isoToAbs.set(c.iso3, c.c);

  const simplifiedPath = join(CACHE, 'world-simplified.geojson');
  try {
    await execFileP('npx', [
      '--yes', 'mapshaper', join(CACHE, 'ne_50m_admin_0_map_units.geojson'),
      // 20% of ~100k source vertices → ~450 KB shipped: real coastlines, still
      // fast. `keep-shapes` stops small island states collapsing to nothing.
      '-simplify', '20%', 'keep-shapes',
      '-filter', 'ADMIN !== "Antarctica"',
      '-o', 'precision=0.001', 'format=geojson', simplifiedPath,
    ], { maxBuffer: 1024 * 1024 * 256 });
  } catch (err) {
    process.stderr.write(`mapshaper failed (${err.message}) — shipping unsimplified\n`);
    await writeFile(simplifiedPath, await readFile(join(CACHE, 'ne_50m_admin_0_map_units.geojson')));
  }
  const world = JSON.parse(await readFile(simplifiedPath, 'utf8'));
  world.features = world.features
    .map((f) => {
      const p = f.properties;
      const iso = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ISO_A3;
      const abs = isoToAbs.get(iso) ?? null;
      // Strip Natural Earth's 60+ properties down to what the map reads.
      return { type: 'Feature', properties: { iso3: iso, abs, name: p.ADMIN }, geometry: f.geometry };
    })
    .filter((f) => f.geometry);
  await writeFile(join(OUT, 'world.geojson'), JSON.stringify(world));

  const mappedPartners = countries.filter((c) => c.iso3 && isoToAbs.get(c.iso3) === c.c).length;

  // ── write ───────────────────────────────────────────────────────────────
  const meta = {
    updated: new Date().toISOString().slice(0, 10),
    window: { start: window[0], end: window[window.length - 1] },
    periods,
    fyStart: financialYear(window[0]),
    fyEnd: financialYear(window[window.length - 1]),
    totals: { exp: M(totalExp), imp: M(totalImp), bal: M(totalExp - totalImp) },
    counts: {
      countries: countries.filter((c) => !c.agg && !c.pseudo).length,
      commodities: commodities.filter((c) => c.lvl === 3).length,
      sitcCodes: commodities.length,
      months: periods.length,
      mappedPartners,
    },
    unattributedExp: Math.round(unattributedExp * 10) / 10,
    unattributedShare: Math.round((unattributedExp / M(totalExp)) * 10000) / 10000,
    source: 'ABS Merchandise Exports/Imports by Commodity (SITC), Country and State',
  };

  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta));
  // Nullable: the ABS import series starts four years after the export series,
  // and a zero there would be a fabricated fact rather than a missing one.
  await writeFile(join(OUT, 'national.json'), JSON.stringify({
    periods,
    exp: densifyNullable(expNatS, periods),
    imp: densifyNullable(impNatS, periods),
  }));
  await writeFile(join(OUT, 'countries.json'), JSON.stringify(countries));
  await writeFile(join(OUT, 'commodities.json'), JSON.stringify(commodities));
  await writeFile(join(OUT, 'matrix.json'), JSON.stringify(matrix));
  await writeFile(join(OUT, 'states.json'), JSON.stringify(states));
  await writeFile(join(OUT, 'suppression.json'), JSON.stringify(suppressed));

  process.stdout.write(
    `Wrote ${countries.length} partners, ${commodities.length} SITC codes, ` +
    `${states.length} states, window ${meta.window.start}→${meta.window.end}\n` +
    `  exports $${meta.totals.exp.toLocaleString()}m imports $${meta.totals.imp.toLocaleString()}m\n` +
    `  ${mappedPartners} partners joined to a polygon; ` +
    `${unmapped.length} unmapped ($${Math.round(unmappedValue / 1e6).toLocaleString()}m)\n`,
  );
  for (const [code, name, v] of unmapped.sort((a, b) => b[2] - a[2]).slice(0, 8)) {
    process.stdout.write(`    unmapped ${code} ${name} $${v}m\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`aggregate failed: ${err.stack}\n`);
  process.exit(1);
});
