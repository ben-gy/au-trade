// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import './styles.css';
import { mountAbout } from './components/about';
import { mountDrilldown } from './components/drilldown';
import { initGlossary } from './components/glossaryPopover';
import { initTooltip } from './components/tooltip';
import { loadDataset } from './data';
import { escapeHtml, formatMoney, formatPeriodLong, shortCountry, shortName } from './format';
import type { Commodity, Country, Dataset } from './types';
import { renderBlindSpots } from './views/blindspots';
import { renderCommodities } from './views/commodities';
import { renderExposure } from './views/exposure';
import { renderFlows } from './views/flows';
import { renderInsights } from './views/insights';
import { renderMap } from './views/map';
import { renderMatrix } from './views/matrix';
import { renderPartners } from './views/partners';
import { renderTrend } from './views/trend';
import type { ViewContext } from './views/types';

interface ViewDef {
  id: string;
  label: string;
  render: (root: HTMLElement, data: Dataset, ctx: ViewContext) => void | Promise<void>;
}

// Nav labels are words only — never count badges.
const VIEWS: ViewDef[] = [
  { id: 'partners', label: 'Partners', render: renderPartners },
  { id: 'map', label: 'Map', render: renderMap },
  { id: 'exposure', label: 'Exposure', render: renderExposure },
  { id: 'flows', label: 'Flows', render: renderFlows },
  { id: 'commodities', label: 'Commodities', render: renderCommodities },
  { id: 'matrix', label: 'Matrix', render: renderMatrix },
  { id: 'trend', label: 'Trend', render: renderTrend },
  { id: 'blindspots', label: 'Blind Spots', render: renderBlindSpots },
  { id: 'insights', label: 'Insights', render: renderInsights },
];

const STATE_KEY = 'au-trade:state';

function loadState(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveState(state: Record<string, string>): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* private browsing — preferences just won't persist */
  }
}

async function boot(): Promise<void> {
  const app = document.getElementById('app') as HTMLElement;
  app.innerHTML = `
    <header class="site-header">
      <div class="brand">
        <h1>Trade Flows</h1>
        <span class="brand-sub">What Australia sells the world</span>
      </div>
      <div class="search-wrap">
        <input class="search-input" id="search" type="search" autocomplete="off"
          placeholder="Search a country or commodity…" aria-label="Search for a country or commodity" />
        <div class="search-results" id="search-results" role="listbox"></div>
      </div>
      <div class="header-spacer"></div>
      <div class="header-actions">
        <button class="icon-btn" id="about-btn" aria-label="About this site" title="About this site">?</button>
      </div>
    </header>
    <nav class="tabs" id="tabs" role="tablist" aria-label="Views"></nav>
    <main class="main-content" id="view" role="tabpanel">
      <div class="skeleton"></div>
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <span id="footer-source">Loading…</span>
        <span>
          Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> ·
          <a href="https://sites.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a>
        </span>
      </div>
    </footer>
  `;

  initTooltip();
  initGlossary();

  const viewRoot = document.getElementById('view') as HTMLElement;

  let data: Dataset;
  try {
    data = await loadDataset();
  } catch (err) {
    viewRoot.innerHTML = `
      <div class="error-state">
        <p>Could not load the trade data.</p>
        <p style="font-size:var(--font-size-sm);color:var(--text-tertiary)">${escapeHtml((err as Error).message)}</p>
        <button class="btn primary" id="retry" style="margin-top:1rem">Try again</button>
      </div>`;
    document.getElementById('retry')?.addEventListener('click', () => location.reload());
    return;
  }

  const about = mountAbout(data.meta);
  const drill = mountDrilldown(data);
  document.getElementById('about-btn')?.addEventListener('click', about.open);

  (document.getElementById('footer-source') as HTMLElement).innerHTML = `
    Source: ABS international merchandise trade · 12 months to
    ${escapeHtml(formatPeriodLong(data.meta.window.end))} ·
    exports ${escapeHtml(formatMoney(data.meta.totals.exp))}, imports ${escapeHtml(formatMoney(data.meta.totals.imp))}
  `;

  const state = loadState();
  let teardowns: Array<() => void> = [];
  let controller = new AbortController();

  const ctx: ViewContext = {
    openCountry: (code) => drill.openCountry(code),
    openCommodity: (code) => drill.openCommodity(code),
    goTo: (id) => show(id),
    getState: (k, fallback) => state[k] ?? fallback,
    setState: (k, v) => {
      state[k] = v;
      saveState(state);
    },
    onTeardown: (fn) => teardowns.push(fn),
    get signal() {
      return controller.signal;
    },
  };

  const tabs = document.getElementById('tabs') as HTMLElement;
  tabs.innerHTML = VIEWS.map(
    (v) => `<button class="tab" role="tab" data-view="${v.id}" aria-selected="false">${v.label}</button>`,
  ).join('');

  function show(id: string): void {
    const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
    // Tear down the outgoing view (Leaflet instances, zoom handlers, timers).
    for (const fn of teardowns) fn();
    teardowns = [];
    controller.abort();
    controller = new AbortController();

    tabs.querySelectorAll('.tab').forEach((t) =>
      t.setAttribute('aria-selected', String(t.getAttribute('data-view') === view.id)),
    );
    state.view = view.id;
    saveState(state);
    if (!location.hash.startsWith('#c=') && !location.hash.startsWith('#s=')) {
      history.replaceState(null, '', `#${view.id}`);
    }

    viewRoot.innerHTML = '';
    const result = view.render(viewRoot, data, ctx);
    if (result instanceof Promise) {
      result.catch(() => {
        viewRoot.innerHTML = '<div class="error-state">Something went wrong rendering this view.</div>';
      });
    }
  }

  tabs.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => show(t.getAttribute('data-view') as string)),
  );

  mountSearch(data, drill);

  // Deep links: #c=CHIN opens a partner, #s=28 a commodity, #flows a view.
  const hash = location.hash.slice(1);
  if (hash.startsWith('c=')) {
    show(state.view ?? 'partners');
    drill.openCountry(hash.slice(2));
  } else if (hash.startsWith('s=')) {
    show(state.view ?? 'partners');
    drill.openCommodity(hash.slice(2));
  } else if (VIEWS.some((v) => v.id === hash)) {
    show(hash);
  } else {
    show(state.view ?? 'partners');
  }

  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h.startsWith('c=')) drill.openCountry(h.slice(2));
    else if (h.startsWith('s=')) drill.openCommodity(h.slice(2));
    else if (VIEWS.some((v) => v.id === h)) show(h);
  });
}

type SearchHit =
  | { kind: 'country'; item: Country; score: number }
  | { kind: 'commodity'; item: Commodity; score: number };

/**
 * One search box for both entity types — people arrive with a noun ("wine",
 * "Japan") and shouldn't have to know which tab it belongs to.
 */
function mountSearch(
  data: Dataset,
  drill: { openCountry: (c: string) => void; openCommodity: (c: string) => void },
): void {
  const input = document.getElementById('search') as HTMLInputElement;
  const results = document.getElementById('search-results') as HTMLElement;
  let active = -1;
  let matches: SearchHit[] = [];

  const close = (): void => {
    results.classList.remove('open');
    active = -1;
  };

  const pick = (hit: SearchHit): void => {
    if (hit.kind === 'country') drill.openCountry(hit.item.c);
    else drill.openCommodity(hit.item.c);
    close();
    input.blur();
  };

  const draw = (): void => {
    if (!matches.length) {
      results.innerHTML = '<div class="search-empty">No country or commodity matches.</div>';
      results.classList.add('open');
      return;
    }
    results.innerHTML = matches
      .map((hit, i) => {
        const name = hit.kind === 'country' ? shortCountry(hit.item.n) : shortName(hit.item.n, 52);
        const value = formatMoney(hit.item.exp);
        return `<div class="search-item ${i === active ? 'active' : ''}" data-idx="${i}" role="option"
          aria-selected="${i === active}">
          <span class="sr-kind sr-${hit.kind}">${hit.kind === 'country' ? 'Partner' : 'Commodity'}</span>
          <span class="sr-name">${escapeHtml(name)}</span>
          <span class="sr-meta mono">${escapeHtml(value)}</span>
        </div>`;
      })
      .join('');
    results.classList.add('open');
    results.querySelectorAll<HTMLElement>('.search-item').forEach((el) =>
      el.addEventListener('click', () => pick(matches[Number(el.dataset.idx)])),
    );
  };

  const score = (name: string, needle: string): number => {
    const n = name.toLowerCase();
    if (n === needle) return 0;
    if (n.startsWith(needle)) return 1;
    const word = n.split(/[\s,(]+/).some((w) => w.startsWith(needle));
    if (word) return 2;
    if (n.includes(needle)) return 3;
    return -1;
  };

  const search = (q: string): void => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) {
      close();
      matches = [];
      return;
    }
    const hits: SearchHit[] = [];
    for (const item of data.partners) {
      const s = score(item.n, needle);
      if (s >= 0) hits.push({ kind: 'country', item, score: s });
    }
    for (const item of data.commodities) {
      if (item.exp <= 0 && item.imp <= 0) continue;
      const s = score(item.n, needle);
      if (s >= 0) hits.push({ kind: 'commodity', item, score: s });
    }
    matches = hits
      .sort((a, b) => a.score - b.score || b.item.exp - a.item.exp)
      .slice(0, 10);
    active = -1;
    draw();
  };

  let timer: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), 250);
  });
  input.addEventListener('focus', () => {
    if (matches.length) results.classList.add('open');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      active = e.key === 'ArrowDown'
        ? Math.min(matches.length - 1, active + 1)
        : Math.max(0, active - 1);
      draw();
    } else if (e.key === 'Enter') {
      const hit = matches[active >= 0 ? active : 0];
      if (hit) pick(hit);
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.search-wrap')) close();
  });
}

void boot();
