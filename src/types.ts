// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** All money values arriving from the pipeline are in AUD millions. */
export type Millions = number;

export interface BasketItem {
  c: string;
  n: string;
  v: Millions;
  /** True when this SITC code is a confidentiality bucket, not a real product. */
  x?: true;
}

export interface Country {
  c: string;
  n: string;
  /** ISO3 for the map join; null when Natural Earth has no polygon at this scale. */
  iso3: string | null;
  /** A group of countries (APEC, OECD…) — never ranked alongside real ones. */
  agg?: true;
  /** Occupies the country dimension but isn't a country (NCD, ship stores…). */
  pseudo?: true;
  exp: Millions;
  imp: Millions;
  bal: Millions;
  expYoy: number | null;
  impYoy: number | null;
  expS: Millions[];
  impS: Millions[];
  topExp: BasketItem[];
  topImp: BasketItem[];
}

export interface TopDestination {
  code: string | null;
  name: string | null;
  share: number;
  hhi: number;
  partners: number;
  /** Share of this commodity's trade whose destination ABS withholds. */
  supp: number;
  pub: Millions;
}

export interface Commodity {
  c: string;
  n: string;
  /** SITC depth: 1 = section, 2 = division, 3 = group. */
  lvl: number;
  p: string | null;
  /** Confidentiality bucket (SITC 9x) rather than a product. */
  conf?: true;
  exp: Millions;
  imp: Millions;
  bal: Millions;
  expYoy: number | null;
  expS: Millions[];
  impS: Millions[];
  top: TopDestination | null;
  itop: { code: string; name: string; share: number } | null;
  dests: BasketItem[];
  srcs: BasketItem[];
}

export interface Matrix {
  rows: Array<{ c: string; n: string; conf?: true }>;
  cols: Array<{ c: string; n: string }>;
  cells: Millions[][];
}

export interface State {
  c: string;
  abbr: string;
  n: string;
  exp: Millions;
  imp: Millions;
  bal: Millions;
  expS: Millions[];
  top: BasketItem[];
  partners: BasketItem[];
}

export interface Suppression {
  c: string;
  n: string;
  exp: Millions;
  supp: number;
  hidden: Millions;
}

export interface Meta {
  updated: string;
  window: { start: string; end: string };
  periods: string[];
  fyStart: string;
  fyEnd: string;
  totals: { exp: Millions; imp: Millions; bal: Millions };
  counts: {
    countries: number;
    commodities: number;
    sitcCodes: number;
    months: number;
    mappedPartners: number;
  };
  unattributedExp: Millions;
  unattributedShare: number;
  source: string;
}

export interface National {
  periods: string[];
  /** null where ABS has not published that month — imports begin July 2000. */
  exp: Array<Millions | null>;
  imp: Array<Millions | null>;
}

export interface Dataset {
  meta: Meta;
  national: National;
  countries: Country[];
  commodities: Commodity[];
  matrix: Matrix;
  states: State[];
  suppression: Suppression[];
  /** Real, single countries only — the set everything ranks over. */
  partners: Country[];
  byCountry: Map<string, Country>;
  byCommodity: Map<string, Commodity>;
}

export type Flow = 'exp' | 'imp';
