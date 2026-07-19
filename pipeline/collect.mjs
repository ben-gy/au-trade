// Collect: pull every slice we need from the ABS SDMX API into pipeline/.cache/.
// Nothing is transformed here — aggregate.mjs owns all the shaping, so a failed
// aggregate never costs another 30 MB of ABS traffic.

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const API = 'https://data.api.abs.gov.au/rest';

// SDMX key order for both dataflows: COMMODITY_SITC . COUNTRY . STATE . FREQ
const SLICES = [
  // National monthly totals — the 30-year trend line.
  { name: 'national', key: 'TOT.TOT.TOT.M' },
  // Every country, all commodities, full history — partner rankings + sparklines.
  { name: 'by-country', key: 'TOT..TOT.M' },
  // Every SITC code at every level, full history — commodity rankings + series.
  { name: 'by-commodity', key: '.TOT.TOT.M' },
  // Every state, full history — state trend.
  { name: 'by-state', key: 'TOT.TOT..M' },
  // The matrix/Sankey/exposure grid. Division level (2-digit) × every country.
  // Restricted to a 24-month window: this is the one genuinely large slice, and
  // the views built on it only ever show the trailing year plus a YoY compare.
  { name: 'commodity-country', key: '{DIV}..TOT.M', start: '{START24}' },
  // Which state sends which commodity division out — the state map's detail.
  { name: 'commodity-state', key: '{DIV}.TOT..M', start: '{START24}' },
  // State × partner, trailing year.
  { name: 'state-country', key: 'TOT...M', start: '{START12}' },
];

const FLOWS = [
  { flow: 'MERCH_EXP', dir: 'exp' },
  { flow: 'MERCH_IMP', dir: 'imp' },
];

async function fetchText(url, { tries = 4, label = '' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/vnd.sdmx.data+csv, text/csv' },
        signal: AbortSignal.timeout(300_000),
      });
      if (res.status === 404) return ''; // genuinely empty slice, not an error
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('empty body');
      return text;
    } catch (err) {
      lastErr = err;
      const wait = attempt * 4000;
      process.stderr.write(`  retry ${attempt}/${tries} ${label}: ${err.message} (${wait}ms)\n`);
      if (attempt < tries) await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`failed ${label}: ${lastErr?.message}`);
}

async function cached(file, produce) {
  const path = join(CACHE, file);
  // A same-day cache keeps re-runs of aggregate.mjs cheap while developing;
  // CI always starts with an empty .cache so it always fetches fresh.
  try {
    const s = await stat(path);
    if (Date.now() - s.mtimeMs < 12 * 3600_000) {
      process.stdout.write(`  cached ${file}\n`);
      return readFile(path, 'utf8');
    }
  } catch { /* not cached */ }
  const text = await produce();
  await writeFile(path, text);
  return text;
}

/** Every 2-digit SITC division, from the codelist — never hard-coded. */
function divisionsFrom(structure) {
  const cl = structure.data.codelists.find((c) => c.id === 'CL_MERCH_SITC');
  return cl.codes.map((c) => c.id).filter((id) => id.length === 2 && id !== 'TOT');
}

function monthsAgo(n) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  await mkdir(CACHE, { recursive: true });

  process.stdout.write('Structure…\n');
  const structureText = await cached('structure.json', () =>
    fetchText(`${API}/datastructure/ABS/MERCH_EXP?references=children&format=json`, {
      label: 'structure',
    }),
  );
  const structure = JSON.parse(structureText);
  const divisions = divisionsFrom(structure);
  process.stdout.write(`  ${divisions.length} SITC divisions\n`);

  const subs = {
    '{DIV}': divisions.join('+'),
    '{START24}': monthsAgo(26),
    '{START12}': monthsAgo(14),
  };

  for (const { flow, dir } of FLOWS) {
    for (const slice of SLICES) {
      const key = slice.key.replace('{DIV}', subs['{DIV}']);
      const start = slice.start ? subs[slice.start] : null;
      const url =
        `${API}/data/ABS,${flow},1.0.0/${key}?format=csv` +
        (start ? `&startPeriod=${start}` : '');
      const file = `${dir}-${slice.name}.csv`;
      process.stdout.write(`${file}…\n`);
      const text = await cached(file, () => fetchText(url, { label: file }));
      process.stdout.write(`  ${(text.length / 1e6).toFixed(2)} MB\n`);
    }
  }

  // World boundaries: Natural Earth 50m admin-0 MAP UNITS (public domain).
  // Never hand-authored — see patterns/geo/README.md.
  //
  // Deliberately map_units at 50m, not countries at 110m: 110m drops Singapore
  // and Bahrain entirely, and `admin_0_countries` folds Hong Kong into China.
  // Hong Kong is Australia's 5th-largest export destination ($22.5bn), so it
  // needs its own polygon. 265 features vs 177.
  process.stdout.write('world boundaries…\n');
  await cached('ne_50m_admin_0_map_units.geojson', () =>
    fetchText(
      'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_map_units.geojson',
      { label: 'natural-earth' },
    ),
  );

  process.stdout.write('Collect complete.\n');
}

main().catch((err) => {
  process.stderr.write(`collect failed: ${err.stack}\n`);
  process.exit(1);
});
