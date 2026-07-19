/**
 * One colour definition for the whole app. A SITC section is the same colour in
 * the treemap, the Sankey, the matrix and the scatter — colour carries identity,
 * not decoration.
 */

/** SITC section (1-digit) → colour. Ordered to stay distinguishable adjacent. */
export const SECTION_COLOURS: Record<string, string> = {
  '0': '#2a9d8f', // Food and live animals
  '1': '#8ab17d', // Beverages and tobacco
  '2': '#b07d3a', // Crude materials (ores, wool)
  '3': '#264653', // Mineral fuels (coal, gas)
  '4': '#c9a227', // Animal/vegetable oils
  '5': '#7b6bb0', // Chemicals
  '6': '#4a7fb5', // Manufactured goods by material
  '7': '#e07a5f', // Machinery and transport
  '8': '#d4899a', // Misc manufactured articles
  '9': '#8d99ae', // Not classified elsewhere (incl. gold, confidential)
};

export const SECTION_FALLBACK = '#94a3b8';

export function sectionColour(sitcCode: string): string {
  return SECTION_COLOURS[sitcCode[0]] ?? SECTION_FALLBACK;
}

/** Exports vs imports — teal/amber, distinguishable without colour vision. */
export const FLOW_COLOURS = {
  exp: '#0f766e',
  imp: '#b45309',
} as const;

/** Sequential ramp for choropleths and heatmaps (light → dark teal). */
export const RAMP_EXPORT = ['#e6f2f0', '#bfdfda', '#93cabf', '#5faea1', '#2f8d7e', '#0f766e', '#0a5048'];
export const RAMP_IMPORT = ['#fdf1e0', '#f8ddb8', '#f0c286', '#e2a055', '#c97f2e', '#b45309', '#8a3d06'];

/** Diverging ramp for trade balance: deficit (amber) ↔ surplus (teal). */
export const RAMP_BALANCE = ['#8a3d06', '#c97f2e', '#f0c286', '#f4f2ee', '#93cabf', '#2f8d7e', '#0a5048'];

/** Withheld / not-attributed data is never a colour on the scale. */
export const NO_DATA_COLOUR = '#e2e0dc';
export const SUPPRESSED_COLOUR = '#9c8f80';

/**
 * Pick a colour from a ramp by quantile break. `breaks` has length
 * `ramp.length - 1`; a value below the first break gets the first colour.
 */
export function rampColour(value: number, breaks: number[], ramp: string[]): string {
  if (!Number.isFinite(value)) return NO_DATA_COLOUR;
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i++;
  return ramp[Math.min(i, ramp.length - 1)];
}
