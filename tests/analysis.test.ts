import { describe, expect, it } from 'vitest';
import {
  buildInsights, divergingBreaks, exposureSet, logBins, logBreaks, median, quantileBreaks, rankBy, topShare,
} from '../src/analysis';
import type { Commodity, Country, Dataset } from '../src/types';

function country(over: Partial<Country> & { c: string; exp: number }): Country {
  return {
    n: over.c,
    iso3: null,
    imp: 0,
    bal: over.exp - (over.imp ?? 0),
    expYoy: null,
    impYoy: null,
    expS: [],
    impS: [],
    topExp: [],
    topImp: [],
    ...over,
  } as Country;
}

function commodity(over: Partial<Commodity> & { c: string; exp: number }): Commodity {
  return {
    n: over.c,
    lvl: 2,
    p: over.c[0],
    imp: 0,
    bal: over.exp,
    expYoy: null,
    expS: [],
    impS: [],
    top: null,
    itop: null,
    dests: [],
    srcs: [],
    ...over,
  } as Commodity;
}

describe('quantileBreaks', () => {
  it('returns one fewer break than buckets', () => {
    expect(quantileBreaks([1, 2, 3, 4, 5], 5)).toHaveLength(4);
  });

  it('splits an even distribution at the midpoint', () => {
    const breaks = quantileBreaks([0, 10, 20, 30, 40], 2);
    expect(breaks[0]).toBeCloseTo(20, 6);
  });

  it('handles a single value', () => {
    expect(quantileBreaks([7], 3)).toEqual([7, 7]);
  });

  it('returns nothing for an empty input', () => {
    expect(quantileBreaks([], 5)).toEqual([]);
  });

  it('ignores non-finite values', () => {
    expect(quantileBreaks([1, Number.NaN, 3], 2)[0]).toBeCloseTo(2, 6);
  });
});

describe('logBreaks', () => {
  it('returns one fewer break than buckets', () => {
    expect(logBreaks([1, 1000], 5)).toHaveLength(4);
  });

  it('separates a dominant value from a mid-sized one', () => {
    // The failure this exists to prevent: with quantiles, China ($185bn) and
    // Canada ($2bn) land in the same bucket and the map hides the concentration.
    const values = [185000, 2000, ...Array.from({ length: 200 }, (_, i) => (i + 1) * 5)];
    const breaks = logBreaks(values, 7);
    const bucketOf = (v: number) => breaks.filter((b) => v > b).length;
    expect(bucketOf(185000)).toBeGreaterThan(bucketOf(2000));
  });

  it('spaces breaks geometrically, not linearly', () => {
    const breaks = logBreaks([1, 10000], 4);
    const r1 = breaks[1] / breaks[0];
    const r2 = breaks[2] / breaks[1];
    expect(r1).toBeCloseTo(r2, 4);
  });

  it('ignores zero and negative values', () => {
    expect(logBreaks([0, -5, 10, 100], 3).every((b) => b > 0)).toBe(true);
  });

  it('returns nothing when no value is positive', () => {
    expect(logBreaks([0, -1], 5)).toEqual([]);
  });
});

describe('divergingBreaks', () => {
  it('produces breaks either side of zero', () => {
    const breaks = divergingBreaks([-50000, -100, 100, 50000], 7);
    expect(breaks.some((b) => b < 0)).toBe(true);
    expect(breaks.some((b) => b > 0)).toBe(true);
  });

  it('returns ramp.length - 1 breaks so every colour is reachable', () => {
    expect(divergingBreaks([-1000, 1000], 7)).toHaveLength(6);
  });

  it('stays sorted ascending, as rampColour requires', () => {
    const breaks = divergingBreaks([-90000, -20, 5, 70000], 7);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
  });

  it('puts a surplus above a deficit on the scale', () => {
    const breaks = divergingBreaks([-50000, 50000], 7);
    const bucketOf = (v: number) => breaks.filter((b) => v > b).length;
    expect(bucketOf(50000)).toBeGreaterThan(bucketOf(-50000));
  });

  it('returns nothing when every value is zero', () => {
    expect(divergingBreaks([0, 0], 7)).toEqual([]);
  });
});

describe('median', () => {
  it('averages the middle pair for an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('takes the middle for an odd count', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('returns zero for an empty list', () => {
    expect(median([])).toBe(0);
  });
});

describe('logBins', () => {
  it('spreads values across the requested bins', () => {
    const bins = logBins([1, 10, 100, 1000, 10000], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(5);
  });

  it('puts the largest value in the last bin', () => {
    const bins = logBins([1, 10, 100], 3);
    expect(bins[bins.length - 1].n).toBeGreaterThan(0);
  });

  it('excludes zero and negative values that a log scale cannot place', () => {
    const bins = logBins([0, -5, 10, 100], 4);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(2);
  });

  it('returns nothing when there is no positive value', () => {
    expect(logBins([0, -1])).toEqual([]);
  });

  it('handles every value being identical', () => {
    const bins = logBins([100, 100, 100], 4);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(3);
    for (const b of bins) expect(Number.isFinite(b.lo)).toBe(true);
  });
});

describe('topShare', () => {
  it('measures the concentration of the leading entries', () => {
    expect(topShare([50, 30, 15, 5], 2)).toBeCloseTo(0.8, 6);
  });

  it('returns 1 when n covers everything', () => {
    expect(topShare([1, 2, 3], 3)).toBeCloseTo(1, 6);
  });

  it('returns 0 for an empty list', () => {
    expect(topShare([], 3)).toBe(0);
  });
});

describe('rankBy', () => {
  const partners = [country({ c: 'A', exp: 10 }), country({ c: 'B', exp: 30 }), country({ c: 'C', exp: 20 })];

  it('ranks descending by default', () => {
    const ranked = rankBy(partners, 'exp');
    expect(ranked.map((r) => r.c)).toEqual(['B', 'C', 'A']);
    expect(ranked[0].rank).toBe(1);
  });

  it('ranks ascending when asked', () => {
    expect(rankBy(partners, 'exp', 'asc')[0].c).toBe('A');
  });

  it('does not mutate the input array', () => {
    const before = partners.map((p) => p.c);
    rankBy(partners, 'exp');
    expect(partners.map((p) => p.c)).toEqual(before);
  });
});

describe('exposureSet', () => {
  it('keeps divisions with a published destination split', () => {
    const items = exposureSet([
      commodity({ c: '28', exp: 5000, top: { code: 'CHIN', name: 'China', share: 0.7, hhi: 0.5, partners: 12, supp: 0.03, pub: 4800 } }),
    ]);
    expect(items).toHaveLength(1);
  });

  it('excludes confidentiality buckets', () => {
    const items = exposureSet([
      commodity({ c: '98', exp: 60000, conf: true, top: { code: 'JAP', name: 'Japan', share: 0.3, hhi: 0.2, partners: 5, supp: 0.1, pub: 50000 } }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('excludes sections and groups — divisions only', () => {
    const items = exposureSet([
      commodity({ c: '2', exp: 9000, lvl: 1, top: { code: 'CHIN', name: 'China', share: 0.6, hhi: 0.4, partners: 8, supp: 0, pub: 9000 } }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('excludes rows with no concentration data', () => {
    expect(exposureSet([commodity({ c: '11', exp: 5000, top: null })])).toHaveLength(0);
  });
});

describe('buildInsights', () => {
  const data: Dataset = {
    meta: {
      updated: '2026-07-19',
      window: { start: '2025-06', end: '2026-05' },
      periods: ['2025-06', '2026-05'],
      fyStart: '2025-26',
      fyEnd: '2025-26',
      totals: { exp: 530000, imp: 490000, bal: 40000 },
      counts: { countries: 220, commodities: 260, sitcCodes: 342, months: 359, mappedPartners: 211 },
      unattributedExp: 8300,
      unattributedShare: 0.0157,
      source: 'ABS',
    },
    national: { periods: [], exp: [], imp: [] },
    countries: [],
    commodities: [
      commodity({
        c: '28', n: 'Metalliferous ores', exp: 159600,
        top: { code: 'CHIN', name: 'China', share: 0.717, hhi: 0.53, partners: 30, supp: 0.033, pub: 154000 },
      }),
      commodity({ c: '32', n: 'Coal', exp: 66100 }),
      commodity({ c: '34', n: 'Gas', exp: 57400 }),
      commodity({ c: '97', n: 'Gold', exp: 68200 }),
      commodity({ c: '98', n: 'Confidential items', exp: 67500, conf: true }),
    ],
    matrix: { rows: [], cols: [], cells: [] },
    states: [],
    suppression: [{ c: '34', n: 'Gas', exp: 57400, supp: 0.948, hidden: 54415 }],
    partners: [
      country({ c: 'CHIN', n: 'China', exp: 184700, imp: 130900 }),
      country({ c: 'JAP', n: 'Japan', exp: 59000, imp: 24600 }),
      country({ c: 'RKOR', n: 'South Korea', exp: 42500, imp: 27200 }),
      country({ c: 'USA', n: 'United States', exp: 29700, imp: 50500 }),
      country({ c: 'HONG', n: 'Hong Kong', exp: 22500, imp: 2000 }),
      country({ c: 'INIA', n: 'India', exp: 21200, imp: 5000 }),
      country({ c: 'SING', n: 'Singapore', exp: 15500, imp: 22300 }),
    ],
    byCountry: new Map(),
    byCommodity: new Map(),
  } as unknown as Dataset;
  data.byCountry = new Map(data.partners.map((c) => [c.c, c]));
  data.byCommodity = new Map(data.commodities.map((c) => [c.c, c]));

  const insights = buildInsights(data);

  it('produces several findings', () => {
    expect(insights.length).toBeGreaterThanOrEqual(5);
  });

  it('detects that the top partner outweighs the next five', () => {
    // China 184,700 vs Japan+Korea+US+HK+India = 174,900.
    const hit = insights.find((i) => i.title.includes('next five'));
    expect(hit).toBeDefined();
    expect(hit?.country).toBe('CHIN');
    expect(hit?.severity).toBe('alert');
  });

  it('detects the narrow commodity base', () => {
    expect(insights.some((i) => /Four commodity groups/.test(i.title))).toBe(true);
  });

  it('surfaces the suppression blind spot', () => {
    const hit = insights.find((i) => i.view === 'blindspots' && i.title.includes('no published destination'));
    expect(hit).toBeDefined();
    expect(hit?.commodity).toBe('34');
  });

  it('names the largest deficit partner', () => {
    const hit = insights.find((i) => i.title.includes('largest trade deficit'));
    expect(hit?.country).toBe('USA');
  });

  it('flags the confidential-items bucket when it is large', () => {
    expect(insights.some((i) => i.title.includes('Confidential items'))).toBe(true);
  });

  it('reports the surplus direction correctly', () => {
    expect(insights.some((i) => i.title.includes('surplus'))).toBe(true);
  });

  it('gives every insight a title, body and severity', () => {
    for (const i of insights) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.body.length).toBeGreaterThan(0);
      expect(['info', 'warn', 'alert']).toContain(i.severity);
    }
  });

  it('never reports a NaN or undefined inside a rendered string', () => {
    for (const i of insights) {
      expect(i.title).not.toMatch(/NaN|undefined/);
      expect(i.body).not.toMatch(/NaN|undefined/);
    }
  });
});
