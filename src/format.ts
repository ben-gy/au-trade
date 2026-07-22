// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Formatting helpers. Every money value in the app is AUD millions — the
 * pipeline converts once, so nothing downstream multiplies again.
 */

/** $1,234m → "$1.23bn"; small values stay in millions. */
export function formatMoney(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  const abs = Math.abs(m);
  const sign = m < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 100000 ? 0 : abs >= 10000 ? 1 : 2)}bn`;
  if (abs >= 1) return `${sign}$${abs.toFixed(abs >= 100 ? 0 : 1)}m`;
  if (abs === 0) return '$0';
  return `${sign}$${(abs * 1000).toFixed(0)}k`;
}

/** Signed variant, for trade balances where the direction is the point. */
export function formatBalance(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  const s = formatMoney(Math.abs(m));
  if (m === 0) return s;
  return `${m > 0 ? '+' : '−'}${s}`;
}

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(fraction: number | null | undefined, decimals = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/** Growth rates, where the sign carries the meaning. */
export function formatChange(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const abs = Math.abs(pct);
  return `${sign}${abs >= 100 ? abs.toFixed(0) : abs.toFixed(1)}%`;
}

/** '2026-05' → 'May 2026' */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${month} ${y}`;
}

/** Long month for prose. */
export function formatPeriodLong(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${month} ${y}`;
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * ABS commodity and country names are written for a statistical yearbook, not a
 * UI: "Metalliferous ores and metal scrap", "Meat and edible meat offal, salted,
 * in brine, dried or smoked and edible flours and meals of meat or meat offal".
 * Trim the parenthetical exclusions and the trailing qualifiers for display,
 * keeping the full string for tooltips and search.
 */
export function shortName(name: string, max = 46): string {
  // "nes" (not elsewhere specified) is only a qualifier at the very END of an
  // ABS name. Matching it anywhere turned "Office machines and automatic data
  // processing machines" into "Office machi and automatic data processing" —
  // the same trap waits in engines, turbines, lines and pipelines.
  let s = name
    .replace(/\s*\((?:excl?\.|excludes)[^)]*\)/gi, '')
    .replace(/,?\s+nes\s*$/i, '');
  s = s.replace(/\s*\(SAR of China\)/i, ' SAR').replace(/,\s*nfd$/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;]$/, '')}…`;
}

/** Country names shortened for axis labels and chips. */
export function shortCountry(name: string): string {
  return name
    .replace(/\s*\(excludes SARs and Taiwan\)/i, '')
    .replace(/\s*\(SAR of China\)/i, ' SAR')
    .replace(/United Kingdom.*/i, 'United Kingdom')
    .replace(/Korea, Republic of \(South\)/i, 'South Korea')
    .replace(/Korea, Democratic People's Republic of \(North\)/i, 'North Korea')
    .replace(/United States of America/i, 'United States')
    .replace(/,\s*nfd$/i, '')
    .trim();
}

/** Stable slug for hash links. */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
