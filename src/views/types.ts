export interface ViewContext {
  /** Open the partner drill-down panel. */
  openCountry: (code: string) => void;
  /** Open the commodity drill-down panel. */
  openCommodity: (code: string) => void;
  /** Switch to another view. */
  goTo: (viewId: string) => void;
  getState: (key: string, fallback: string) => string;
  setState: (key: string, value: string) => void;
  /** Register cleanup for Leaflet instances, observers and listeners. */
  onTeardown: (fn: () => void) => void;
  readonly signal: AbortSignal;
}
