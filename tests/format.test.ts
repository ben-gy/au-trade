import { describe, expect, it } from 'vitest';
import {
  escapeHtml, formatBalance, formatChange, formatMoney, formatNumber, formatPercent,
  formatPeriod, formatPeriodLong, shortCountry, shortName, slug,
} from '../src/format';

describe('formatMoney', () => {
  it('renders billions above $1,000m', () => {
    expect(formatMoney(159600)).toBe('$160bn');
    expect(formatMoney(2500)).toBe('$2.50bn');
  });

  it('renders millions below a billion', () => {
    expect(formatMoney(530)).toBe('$530m');
    expect(formatMoney(4.2)).toBe('$4.2m');
  });

  it('drops to thousands for sub-million values', () => {
    expect(formatMoney(0.4)).toBe('$400k');
  });

  it('handles zero', () => {
    expect(formatMoney(0)).toBe('$0');
  });

  it('keeps the sign on negatives', () => {
    expect(formatMoney(-2500)).toBe('-$2.50bn');
  });

  it('returns an em dash for null, undefined and NaN', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
  });
});

describe('formatBalance', () => {
  it('marks a surplus with a plus', () => {
    expect(formatBalance(40200)).toBe('+$40.2bn');
  });

  it('marks a deficit with a minus sign', () => {
    expect(formatBalance(-20800)).toBe('−$20.8bn');
  });

  it('drops to whole billions only above $100bn, where a decimal is noise', () => {
    expect(formatBalance(530167)).toBe('+$530bn');
  });

  it('leaves zero unsigned', () => {
    expect(formatBalance(0)).toBe('$0');
  });

  it('returns an em dash for missing values', () => {
    expect(formatBalance(null)).toBe('—');
  });
});

describe('formatPercent and formatChange', () => {
  it('formats a fraction as a percentage', () => {
    expect(formatPercent(0.348)).toBe('34.8%');
    expect(formatPercent(0.348, 0)).toBe('35%');
  });

  it('signs a change and uses fewer decimals when large', () => {
    expect(formatChange(0.155)).toBe('+15.5%');
    expect(formatChange(-0.155)).toBe('−15.5%');
    expect(formatChange(4.35)).toBe('+435%');
  });

  it('returns an em dash when there is no comparison', () => {
    expect(formatChange(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
  });

  it('handles zero without a sign', () => {
    expect(formatChange(0)).toBe('0.0%');
  });
});

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('handles zero and negatives', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-1234)).toBe('-1,234');
  });

  it('respects a decimal count', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
  });

  it('returns an em dash for missing values', () => {
    expect(formatNumber(null)).toBe('—');
  });
});

describe('formatPeriod', () => {
  it('renders a short month and year', () => {
    expect(formatPeriod('2026-05')).toBe('May 2026');
  });

  it('renders a long month for prose', () => {
    expect(formatPeriodLong('2026-01')).toBe('January 2026');
  });

  it('passes through anything that is not a period', () => {
    expect(formatPeriod('nonsense')).toBe('nonsense');
  });
});

describe('shortName', () => {
  it('strips ABS parenthetical exclusions', () => {
    const input = 'Live animals (excl. fish (not marine mammals) crustaceans)';
    expect(shortName(input)).not.toContain('excl.');
  });

  it('drops the trailing "nes" qualifier', () => {
    expect(shortName('Chemicals and related products, nes')).toBe('Chemicals and related products');
  });

  it('does NOT strip "nes" from inside a word', () => {
    // Regression: this once rendered "Office machi and automatic data processing".
    expect(shortName('Office machines and automatic data processing machines', 80)).toBe(
      'Office machines and automatic data processing machines',
    );
    expect(shortName('Engines and motors, non-electric', 80)).toBe('Engines and motors, non-electric');
    expect(shortName('Pipelines and tubes', 80)).toBe('Pipelines and tubes');
  });

  it('strips a trailing "nes" with no comma', () => {
    expect(shortName('Miscellaneous manufactured articles nes', 80)).toBe(
      'Miscellaneous manufactured articles',
    );
  });

  it('truncates on a word boundary with an ellipsis', () => {
    const out = shortName('Metalliferous ores and metal scrap of every possible description', 30);
    expect(out.length).toBeLessThanOrEqual(31);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('  ');
  });

  it('leaves a short name untouched', () => {
    expect(shortName('Coal, coke and briquettes')).toBe('Coal, coke and briquettes');
  });
});

describe('shortCountry', () => {
  it('trims the ABS China qualifier', () => {
    expect(shortCountry('China (excludes SARs and Taiwan)')).toBe('China');
  });

  it('shortens the Koreas', () => {
    expect(shortCountry('Korea, Republic of (South)')).toBe('South Korea');
  });

  it('shortens the long UK label', () => {
    expect(shortCountry('United Kingdom, Channel Islands and Isle of Man, nfd')).toBe('United Kingdom');
  });

  it('abbreviates Hong Kong SAR', () => {
    expect(shortCountry('Hong Kong (SAR of China)')).toBe('Hong Kong SAR');
  });

  it('leaves an ordinary name alone', () => {
    expect(shortCountry('Japan')).toBe('Japan');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that break markup', () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Coal and coke')).toBe('Coal and coke');
  });
});

describe('slug', () => {
  it('lowercases and hyphenates', () => {
    expect(slug('Metalliferous ores & scrap')).toBe('metalliferous-ores-scrap');
  });

  it('trims leading and trailing separators', () => {
    expect(slug('  (China)  ')).toBe('china');
  });
});
