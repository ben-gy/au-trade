import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { divergingBreaks, logBreaks } from '../analysis';
import { loadStateGeo, loadWorldGeo } from '../data';
import { escapeHtml, formatBalance, formatMoney, formatPercent, shortCountry, shortName } from '../format';
import { gloss } from '../glossary';
import { NO_DATA_COLOUR, RAMP_BALANCE, RAMP_EXPORT, RAMP_IMPORT, rampColour } from '../palette';
import type { Dataset } from '../types';
import type { ViewContext } from './types';

type Mode = 'exp' | 'imp' | 'bal';
type Scope = 'world' | 'states';

const MODES: Array<{ key: Mode; label: string; ramp: string[]; blurb: string }> = [
  { key: 'exp', label: 'Exports to', ramp: RAMP_EXPORT, blurb: 'What Australia sells each country.' },
  { key: 'imp', label: 'Imports from', ramp: RAMP_IMPORT, blurb: 'What Australia buys from each country.' },
  {
    key: 'bal',
    label: 'Trade balance',
    ramp: RAMP_BALANCE,
    blurb: 'Surplus in teal, deficit in amber — who Australia sells more to than it buys from.',
  },
];

let worldCache: GeoJSON.FeatureCollection | null = null;
let stateCache: GeoJSON.FeatureCollection | null = null;

/**
 * Leaflet choropleth. Adapted from patterns/leafletMap.ts — CARTO basemap, real
 * GeoJSON, hover tooltips on every polygon, attribution, zero-size defence.
 *
 * Two scopes: the world (where trade goes) and Australian states (where it comes
 * from). Both are real boundary data — Natural Earth and ABS respectively.
 */
export async function renderMap(root: HTMLElement, data: Dataset, ctx: ViewContext): Promise<void> {
  const scope = (ctx.getState('mapScope', 'world') as Scope) ?? 'world';
  const modeKey = (ctx.getState('mapMode', 'exp') as Mode) ?? 'exp';
  const mode = MODES.find((m) => m.key === modeKey) ?? MODES[0];

  root.innerHTML = `
    <div class="view-head">
      <h2>${scope === 'world' ? 'Where Australia’s trade goes' : 'Which state it comes from'}</h2>
      <p>
        ${
          scope === 'world'
            ? `Every country shaded by ${escapeHtml(mode.label.toLowerCase())} Australia over the
               ${gloss('rollingYear', '12 months')} to ${escapeHtml(data.meta.window.end)}.
               ${escapeHtml(mode.blurb)} Hover a country for its figures; click to open it.`
            : `Goods leaving Australia by ${gloss('stateOrigin', 'state of origin')} — the state the goods
               came from, not the port they left through. Hover for each state's largest exports.`
        }
      </p>
    </div>

    <div class="view-controls">
      <div class="segmented" role="tablist" aria-label="Map scope">
        <button class="seg ${scope === 'world' ? 'active' : ''}" data-scope="world" role="tab"
          aria-selected="${scope === 'world'}">World</button>
        <button class="seg ${scope === 'states' ? 'active' : ''}" data-scope="states" role="tab"
          aria-selected="${scope === 'states'}">Australian states</button>
      </div>
      ${
        scope === 'world'
          ? `<label class="control">Shade by
              <select id="map-mode">
                ${MODES.map((m) => `<option value="${m.key}" ${m.key === mode.key ? 'selected' : ''}>${m.label}</option>`).join('')}
              </select>
            </label>`
          : ''
      }
      <span class="control-note">
        ${
          scope === 'world'
            ? `${
                mode.key === 'bal'
                  ? 'Colour diverges around zero on a logarithmic scale — teal is surplus, amber deficit.'
                  : 'Colour uses a logarithmic scale — each shade is roughly ten times the one before it. Trade is far too concentrated for even bands: one partner takes a third of everything.'
              }
               ${data.meta.counts.mappedPartners} of ${data.meta.counts.countries} partners have a boundary at this scale.`
            : `State figures exclude trade with no state attribution, so they do not sum to the national total.`
        }
      </span>
    </div>

    <div class="map-canvas-wrap">
      <div class="map-canvas" id="map-canvas"></div>
    </div>
    <div class="legend" id="map-legend"></div>
  `;

  root.querySelectorAll<HTMLElement>('.seg').forEach((btn) =>
    btn.addEventListener('click', () => {
      ctx.setState('mapScope', btn.dataset.scope as string);
      void renderMap(root, data, ctx);
    }),
  );
  root.querySelector('#map-mode')?.addEventListener('change', (e) => {
    ctx.setState('mapMode', (e.target as HTMLSelectElement).value);
    void renderMap(root, data, ctx);
  });

  const canvas = root.querySelector('#map-canvas') as HTMLElement;
  const legend = root.querySelector('#map-legend') as HTMLElement;

  let geo: GeoJSON.FeatureCollection;
  try {
    if (scope === 'world') {
      worldCache ??= await loadWorldGeo(ctx.signal);
      geo = worldCache;
    } else {
      stateCache ??= await loadStateGeo(ctx.signal);
      geo = stateCache;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    canvas.innerHTML = `<div class="error-state">
      <p>Could not load map boundaries.</p>
      <button class="btn" id="map-retry">Retry</button></div>`;
    canvas.querySelector('#map-retry')?.addEventListener('click', () => void renderMap(root, data, ctx));
    return;
  }

  const map = L.map(canvas, {
    minZoom: 1,
    maxZoom: 8,
    zoomControl: true,
    scrollWheelZoom: false, // don't hijack page scroll
    worldCopyJump: true,
  });
  map.attributionControl.setPrefix(false);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 1,
    maxZoom: 8,
  }).addTo(map);

  let layer: L.GeoJSON;

  if (scope === 'world') {
    const values = data.partners
      .map((c) => (mode.key === 'bal' ? c.bal : c[mode.key]))
      .filter((v) => Number.isFinite(v) && (mode.key === 'bal' || v > 0));
    const breaks =
      mode.key === 'bal'
        ? divergingBreaks(values, mode.ramp.length)
        : logBreaks(values, mode.ramp.length);

    layer = L.geoJSON(geo, {
      attribution: 'Boundaries: Natural Earth · Data: ABS',
      style: (f) => {
        const abs = (f?.properties as { abs: string | null })?.abs;
        const country = abs ? data.byCountry.get(abs) : null;
        const value = country ? (mode.key === 'bal' ? country.bal : country[mode.key]) : null;
        return {
          fillColor:
            country && value !== null && (mode.key === 'bal' || value > 0)
              ? rampColour(value, breaks, mode.ramp)
              : NO_DATA_COLOUR,
          fillOpacity: 0.88,
          color: '#ffffff',
          weight: 0.5,
        };
      },
      onEachFeature: (f, lyr) => {
        const props = f.properties as { abs: string | null; name: string };
        const country = props.abs ? data.byCountry.get(props.abs) : null;
        if (!country) {
          lyr.bindTooltip(
            `<strong>${escapeHtml(props.name ?? 'Unknown')}</strong><br>
             <span style="color:var(--text-tertiary)">No recorded merchandise trade</span>`,
            { sticky: true, className: 'map-tip' },
          );
          return;
        }
        const top = country.topExp[0];
        lyr.bindTooltip(
          `<strong>${escapeHtml(shortCountry(country.n))}</strong><br>
           <span class="tip-metric">Exports ${escapeHtml(formatMoney(country.exp))}</span><br>
           <span class="tip-metric">Imports ${escapeHtml(formatMoney(country.imp))}</span><br>
           <span style="color:var(--text-tertiary)">Balance ${escapeHtml(formatBalance(country.bal))} ·
           ${escapeHtml(formatPercent(country.exp / data.meta.totals.exp, 1))} of exports</span>
           ${top ? `<br><span style="color:var(--text-tertiary)">Top: ${escapeHtml(shortName(top.n, 34))}</span>` : ''}`,
          { sticky: true, className: 'map-tip' },
        );
        lyr.on({
          mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#12263f' }),
          mouseout: () => layer.resetStyle(lyr as L.Path),
          click: () => ctx.openCountry(country.c),
        });
      },
    }).addTo(map);

    const shown = values.filter((v) => mode.key === 'bal' || v > 0);
    legend.innerHTML = `
      <span>${escapeHtml(mode.label)}:</span>
      <span class="legend-ramp">
        ${mode.ramp
          .map((c, i) => {
            const lo = i === 0 ? Math.min(...shown) : breaks[i - 1];
            const hi = i === mode.ramp.length - 1 ? Math.max(...shown) : breaks[i];
            return `<span class="legend-swatch" style="background:${c}"
              data-tip="${escapeHtml(formatMoney(lo))} – ${escapeHtml(formatMoney(hi))}"></span>`;
          })
          .join('')}
      </span>
      <span class="mono">${escapeHtml(formatMoney(Math.min(...shown)))}</span>
      <span style="color:var(--text-muted)">→</span>
      <span class="mono">${escapeHtml(formatMoney(Math.max(...shown)))}</span>
      <span class="legend-item" style="margin-left:auto">
        <span class="legend-swatch" style="background:${NO_DATA_COLOUR}"></span>No recorded trade
      </span>`;
  } else {
    const byAbbr = new Map(data.states.map((s) => [s.abbr, s]));
    const values = data.states.map((s) => s.exp);
    const breaks = logBreaks(values, RAMP_EXPORT.length);

    layer = L.geoJSON(geo, {
      attribution: 'Boundaries: ABS ASGS (CC BY 4.0) · Data: ABS',
      style: (f) => {
        const st = resolveState(f?.properties as Record<string, unknown>, byAbbr);
        return {
          fillColor: st ? rampColour(st.exp, breaks, RAMP_EXPORT) : NO_DATA_COLOUR,
          fillOpacity: 0.88,
          color: '#ffffff',
          weight: 0.8,
        };
      },
      onEachFeature: (f, lyr) => {
        const st = resolveState(f.properties as Record<string, unknown>, byAbbr);
        if (!st) return;
        lyr.bindTooltip(
          `<strong>${escapeHtml(st.n)}</strong><br>
           <span class="tip-metric">Exports ${escapeHtml(formatMoney(st.exp))}</span><br>
           <span style="color:var(--text-tertiary)">
             ${escapeHtml(formatPercent(st.exp / data.meta.totals.exp, 1))} of national exports<br>
             ${st.top.slice(0, 3).map((t) => escapeHtml(shortName(t.n, 30))).join('<br>')}
           </span>`,
          { sticky: true, className: 'map-tip' },
        );
        lyr.on({
          mouseover: () => (lyr as L.Path).setStyle({ weight: 2.4, color: '#12263f' }),
          mouseout: () => layer.resetStyle(lyr as L.Path),
        });
      },
    }).addTo(map);

    legend.innerHTML = `
      <span>Exports by state of origin:</span>
      <span class="legend-ramp">
        ${RAMP_EXPORT.map((c, i) => {
          const lo = i === 0 ? Math.min(...values) : breaks[i - 1];
          const hi = i === RAMP_EXPORT.length - 1 ? Math.max(...values) : breaks[i];
          return `<span class="legend-swatch" style="background:${c}"
            data-tip="${escapeHtml(formatMoney(lo))} – ${escapeHtml(formatMoney(hi))}"></span>`;
        }).join('')}
      </span>
      <span class="mono">${escapeHtml(formatMoney(Math.min(...values)))}</span>
      <span style="color:var(--text-muted)">→</span>
      <span class="mono">${escapeHtml(formatMoney(Math.max(...values)))}</span>`;
  }

  // Zero-size defence: Leaflet mis-renders in a container that hasn't laid out.
  const bounds = layer.getBounds();
  const fit = () => {
    map.invalidateSize();
    if (bounds.isValid() && canvas.clientHeight > 50) {
      map.fitBounds(bounds, { padding: [8, 8] });
    }
  };
  const ro = new ResizeObserver(() => {
    if (canvas.clientHeight > 50) {
      fit();
      ro.disconnect();
    }
  });
  ro.observe(canvas);
  const timer = setTimeout(fit, 400);
  ctx.onTeardown(() => {
    ro.disconnect();
    clearTimeout(timer);
    map.remove();
  });
}

/** ABS state GeoJSON labels states by name or code depending on vintage. */
function resolveState<T>(props: Record<string, unknown>, byAbbr: Map<string, T>): T | null {
  const candidates = [props.code, props.STATE_CODE, props.abbr, props.name, props.STATE_NAME]
    .filter((v): v is string => typeof v === 'string');
  const ABBR: Record<string, string> = {
    'new south wales': 'NSW',
    victoria: 'VIC',
    queensland: 'QLD',
    'south australia': 'SA',
    'western australia': 'WA',
    tasmania: 'TAS',
    'northern territory': 'NT',
    'australian capital territory': 'ACT',
  };
  for (const c of candidates) {
    const direct = byAbbr.get(c.toUpperCase());
    if (direct) return direct;
    const mapped = ABBR[c.toLowerCase()];
    if (mapped && byAbbr.has(mapped)) return byAbbr.get(mapped) as T;
  }
  return null;
}
