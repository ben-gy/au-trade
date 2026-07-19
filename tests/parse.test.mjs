// Pipeline parsing rules. Imports pipeline/lib/parse.mjs directly — that module
// is dependency-free on purpose, because CI runs these tests without ever
// installing pipeline/node_modules.
import { describe, expect, it } from 'vitest';
import {
  concentration, densify, financialYear, isAggregateCountry, isConfidentialSitc, isPseudoCountry,
  isRealCountry, obsToDollars, parseCsv, priorWindow, sitcLevel, sitcParent, sumOver, trailingWindow,
  yoyChange,
} from '../pipeline/lib/parse.mjs';

describe('parseCsv', () => {
  it('parses a plain header and row', () => {
    const rows = parseCsv('A,B\n1,2\n');
    expect(rows).toEqual([{ A: '1', B: '2' }]);
  });

  it('keeps commas inside quoted fields together', () => {
    // ABS commodity names are full of these: "Meat, fresh, chilled or frozen".
    const rows = parseCsv('CODE,NAME,VALUE\n01,"Meat, fresh, chilled or frozen",42\n');
    expect(rows[0].NAME).toBe('Meat, fresh, chilled or frozen');
    expect(rows[0].VALUE).toBe('42');
  });

  it('handles escaped double quotes', () => {
    const rows = parseCsv('A\n"say ""hi"""\n');
    expect(rows[0].A).toBe('say "hi"');
  });

  it('tolerates CRLF line endings', () => {
    const rows = parseCsv('A,B\r\n1,2\r\n');
    expect(rows).toEqual([{ A: '1', B: '2' }]);
  });

  it('skips short rows rather than shifting columns', () => {
    const rows = parseCsv('A,B,C\n1,2,3\n4,5\n');
    expect(rows).toHaveLength(1);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('obsToDollars', () => {
  it('scales AUD thousands to dollars', () => {
    expect(obsToDollars({ OBS_VALUE: '2752446', UNIT_MULT: '3' })).toBe(2_752_446_000);
  });

  it('honours a different multiplier', () => {
    expect(obsToDollars({ OBS_VALUE: '5', UNIT_MULT: '6' })).toBe(5_000_000);
  });

  it('defaults to thousands when the multiplier is missing', () => {
    expect(obsToDollars({ OBS_VALUE: '2' })).toBe(2000);
  });

  it('returns null for a non-numeric value', () => {
    expect(obsToDollars({ OBS_VALUE: '', UNIT_MULT: '3' })).toBeNull();
    expect(obsToDollars({ OBS_VALUE: 'n/a', UNIT_MULT: '3' })).toBeNull();
  });

  it('preserves negative values (revisions can go negative)', () => {
    expect(obsToDollars({ OBS_VALUE: '-10', UNIT_MULT: '3' })).toBe(-10_000);
  });
});

describe('country classification', () => {
  it('treats overlapping country groups as aggregates', () => {
    expect(isAggregateCountry('OECD')).toBe(true);
    expect(isAggregateCountry('ASEAN')).toBe(true);
    expect(isAggregateCountry('CHIN')).toBe(false);
  });

  it('treats No Country Details as a pseudo-destination, not a country', () => {
    // The whole point: NCD must never rank as a trading partner.
    expect(isPseudoCountry('NCD')).toBe(true);
    expect(isRealCountry('NCD')).toBe(false);
    expect(isPseudoCountry('SHIP')).toBe(true);
    expect(isPseudoCountry('JAP')).toBe(false);
  });

  it('excludes the TOT roll-up from real countries', () => {
    expect(isRealCountry('TOT')).toBe(false);
    expect(isRealCountry('JAP')).toBe(true);
  });

  it('flags confidentiality buckets in the commodity dimension', () => {
    expect(isConfidentialSitc('98')).toBe(true);
    expect(isConfidentialSitc('99')).toBe(true);
    expect(isConfidentialSitc('28')).toBe(false);
  });
});

describe('SITC hierarchy', () => {
  it('reads depth from code length', () => {
    expect(sitcLevel('TOT')).toBe(0);
    expect(sitcLevel('2')).toBe(1);
    expect(sitcLevel('28')).toBe(2);
    expect(sitcLevel('281')).toBe(3);
  });

  it('walks up to the parent', () => {
    expect(sitcParent('281')).toBe('28');
    expect(sitcParent('28')).toBe('2');
    expect(sitcParent('2')).toBe('TOT');
    expect(sitcParent('TOT')).toBeNull();
  });
});

describe('concentration', () => {
  it('computes shares over published destinations only', () => {
    // Gas-shaped input: most of the value has no published destination.
    const result = concentration({ NCD: 950, CHIN: 30, JAP: 20 });
    expect(result.total).toBe(1000);
    expect(result.published).toBe(50);
    expect(result.suppressed).toBe(950);
    expect(result.suppressedShare).toBeCloseTo(0.95, 6);
    // Top share is 30/50, NOT 950/1000 — NCD is never the "top buyer".
    expect(result.topCode).toBe('CHIN');
    expect(result.topShare).toBeCloseTo(0.6, 6);
  });

  it('ignores the TOT roll-up and country aggregates', () => {
    const result = concentration({ TOT: 1000, OECD: 700, CHIN: 600, JAP: 400 });
    expect(result.published).toBe(1000);
    expect(result.partners).toBe(2);
    expect(result.topShare).toBeCloseTo(0.6, 6);
  });

  it('reports HHI of 1 for a single buyer', () => {
    expect(concentration({ CHIN: 500 }).hhi).toBeCloseTo(1, 6);
  });

  it('reports a low HHI for many equal buyers', () => {
    const even = { CHIN: 100, JAP: 100, USA: 100, INIA: 100, NZ: 100 };
    expect(concentration(even).hhi).toBeCloseTo(0.2, 6);
  });

  it('handles an all-suppressed commodity without dividing by zero', () => {
    const result = concentration({ NCD: 500 });
    expect(result.published).toBe(0);
    expect(result.topShare).toBe(0);
    expect(result.hhi).toBe(0);
    expect(result.suppressedShare).toBe(1);
  });

  it('ignores zero and negative values', () => {
    const result = concentration({ CHIN: 100, JAP: 0, USA: -5 });
    expect(result.partners).toBe(1);
    expect(result.published).toBe(100);
  });

  it('returns zeroes for an empty input', () => {
    const result = concentration({});
    expect(result.total).toBe(0);
    expect(result.topCode).toBeNull();
    expect(result.suppressedShare).toBe(0);
  });
});

describe('financialYear', () => {
  it('puts July into the new financial year', () => {
    expect(financialYear('2025-07')).toBe('2025-26');
  });

  it('puts June into the closing financial year', () => {
    expect(financialYear('2026-06')).toBe('2025-26');
  });

  it('handles January', () => {
    expect(financialYear('2026-01')).toBe('2025-26');
  });

  it('pads the century rollover', () => {
    expect(financialYear('1999-08')).toBe('1999-00');
  });
});

describe('windows', () => {
  const periods = ['2025-01', '2025-02', '2025-03', '2025-04'];

  it('takes the trailing n periods in order', () => {
    expect(trailingWindow(periods, 2)).toEqual(['2025-03', '2025-04']);
  });

  it('returns everything when n exceeds the length', () => {
    expect(trailingWindow(periods, 99)).toHaveLength(4);
  });

  it('sorts before slicing', () => {
    expect(trailingWindow(['2025-03', '2025-01', '2025-02'], 1)).toEqual(['2025-03']);
  });

  it('shifts the prior window back exactly one year', () => {
    expect(priorWindow(['2026-01', '2026-02'])).toEqual(['2025-01', '2025-02']);
  });

  it('sums only the periods asked for', () => {
    const series = { '2025-01': 10, '2025-02': 20, '2025-03': 30 };
    expect(sumOver(series, ['2025-01', '2025-03'])).toBe(40);
  });

  it('ignores periods absent from the series', () => {
    expect(sumOver({ '2025-01': 10 }, ['2025-01', '2099-01'])).toBe(10);
  });
});

describe('yoyChange', () => {
  it('computes growth against the same months a year earlier', () => {
    const series = { '2025-01': 100, '2025-02': 100, '2026-01': 150, '2026-02': 150 };
    expect(yoyChange(series, ['2026-01', '2026-02'])).toBeCloseTo(0.5, 6);
  });

  it('returns null when there is no prior year to compare', () => {
    expect(yoyChange({ '2026-01': 100 }, ['2026-01'])).toBeNull();
  });

  it('returns null rather than Infinity for a brand-new trade line', () => {
    const series = { '2025-01': 0, '2026-01': 500 };
    expect(yoyChange(series, ['2026-01'])).toBeNull();
  });

  it('reports a negative change for a decline', () => {
    const series = { '2025-01': 200, '2026-01': 100 };
    expect(yoyChange(series, ['2026-01'])).toBeCloseTo(-0.5, 6);
  });
});

describe('densify', () => {
  it('aligns a sparse series to the period axis, filling gaps with zero', () => {
    const out = densify({ '2025-01': 5e6, '2025-03': 15e6 }, ['2025-01', '2025-02', '2025-03']);
    expect(out).toEqual([5, 0, 15]);
  });

  it('rounds to one decimal in millions', () => {
    expect(densify({ '2025-01': 1_234_567 }, ['2025-01'])).toEqual([1.2]);
  });

  it('returns an empty array for an empty axis', () => {
    expect(densify({ '2025-01': 1 }, [])).toEqual([]);
  });
});
