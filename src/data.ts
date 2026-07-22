// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type {
  Commodity, Country, Dataset, Matrix, Meta, National, State, Suppression,
} from './types';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Load every dataset the app needs up front — together they gzip to ~700 KB. */
export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  const [meta, national, countries, commodities, matrix, states, suppression] = await Promise.all([
    getJson<Meta>('/data/meta.json', signal),
    getJson<National>('/data/national.json', signal),
    getJson<Country[]>('/data/countries.json', signal),
    getJson<Commodity[]>('/data/commodities.json', signal),
    getJson<Matrix>('/data/matrix.json', signal),
    getJson<State[]>('/data/states.json', signal),
    getJson<Suppression[]>('/data/suppression.json', signal),
  ]);

  // Real, single countries — aggregates (OECD, ASEAN) overlap each other and
  // pseudo-destinations (No Country Details) are not places. Everything that
  // ranks, maps or charts partners uses this list, never the raw array.
  const partners = countries.filter((c) => !c.agg && !c.pseudo);

  return {
    meta,
    national,
    countries,
    commodities,
    matrix,
    states,
    suppression,
    partners,
    byCountry: new Map(countries.map((c) => [c.c, c])),
    byCommodity: new Map(commodities.map((c) => [c.c, c])),
  };
}

export function loadWorldGeo(signal?: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  return getJson<GeoJSON.FeatureCollection>('/data/world.geojson', signal);
}

export function loadStateGeo(signal?: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  return getJson<GeoJSON.FeatureCollection>('/data/au-states.geojson', signal);
}
