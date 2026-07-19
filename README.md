# Trade Flows

**What Australia sells the world, what it buys back, and how much of it rests on one customer.**

🔗 **Live:** [https://au-trade.benrichardson.dev](https://au-trade.benrichardson.dev)

## What is this?

Every month the Australian Bureau of Statistics publishes the value of every good crossing the border,
broken down by commodity, partner country and state of origin. It is one of the richest public datasets
in the country, and it ships as SDMX API queries and spreadsheets that almost nobody reads. This site
turns it into something you can explore: 224 trading partners, 342 commodity categories and 359 months
of history back to July 1996.

Over the twelve months to May 2026 Australia exported **$530bn** of goods and imported **$490bn** — a
goods surplus of **$40.2bn**. China alone took 34.8% of exports, more than Japan, South Korea, the
United States, Hong Kong and India combined. Four commodity groups — metalliferous ores, gold, coal and
gas — are 66% of everything the country sells.

The thing that makes this dataset genuinely tricky, and the reason the site is shaped the way it is, is
**confidentiality**. When only a few businesses ship a particular good, naming the destination would
expose an individual company's commercial dealings, so the ABS publishes the value and withholds the
buyer. Critically, this bites far harder at commodity level than at the national total: nationally only
1.6% of exports lack a country, but **96% of natural gas exports have no published destination**. Tools
that treat the "No Country Details" bucket as a country will tell you it is Australia's largest gas
customer, which is nonsense. Here, every concentration figure is computed over destinations that are
actually published, always labelled with how much is withheld, and a whole view is devoted to the gap.

## Who is this for?

- **Exporters, trade consultants and industry association staff** answering "where does our commodity
  actually go, and is that market growing?" without a paid data subscription.
- **Journalists and policy researchers** who re-derive the same China-dependency figures from ABS
  spreadsheets every quarter.
- **Engaged general readers** who have heard that iron ore props up the economy and want to see whether
  it's true, at what magnitude, and in what.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| [ABS Merchandise Exports by Commodity (SITC), Country and State](https://data.api.abs.gov.au/rest/data/ABS,MERCH_EXP,1.0.0) | Monthly export values across 349 SITC codes × 262 countries × 8 states, from July 1996 | Monthly |
| [ABS Merchandise Imports by Commodity (SITC), Country and State](https://data.api.abs.gov.au/rest/data/ABS,MERCH_IMP,1.0.0) | Monthly import values, same dimensions, from July 2000 | Monthly |
| ABS SDMX codelists (`CL_MERCH_SITC`, `CL_MERCH_COUNTRY`, `CL_MERCH_STATE`) | Commodity hierarchy, country and state names | With each release |
| [Natural Earth](https://www.naturalearthdata.com/) 50m admin-0 map units | World boundary polygons (public domain) | Static |
| ABS ASGS state boundaries (CC BY 4.0) | Australian state polygons | Static |

## Features

- **Partner leaderboard** — every trading partner ranked by exports, imports or trade balance, with
  30-year sparklines and year-on-year change.
- **World map** — Natural Earth choropleth on a logarithmic scale (trade is far too concentrated for
  quantiles), plus a second mode showing which Australian state the goods leave from.
- **Exposure scatter** — the signature view: every commodity plotted by value against the share going to
  its largest single buyer. The top-right quadrant is the country's real trade exposure. Commodities
  whose destinations are mostly withheld are drawn hollow rather than plotted as if their position were
  known.
- **Flows** — a Sankey from commodity section to trading partner, switchable between exports and imports,
  with hover-to-isolate.
- **Blind Spots** — which commodities have their destinations withheld and by how much; the honest
  counterpart to the Exposure view, and something no competing tool shows.
- **Commodity explorer** — searchable across all 342 SITC codes at three levels of detail, with a
  squarified treemap of export composition.
- **Matrix** — commodity section × partner heatmap, which reveals who buys broadly versus who buys one
  thing.
- **Thirty-year trend** — monthly exports, imports and balance, annotated with the China boom, the GFC,
  the LNG ramp-up, COVID, the 2020 China trade restrictions and the 2022 energy price shock.
- **Insights** — findings computed from each release rather than written by hand.
- **Drill-downs** — hash-linkable panels for any partner (`#c=CHIN`) or commodity (`#s=28`).

## Tech Stack

- **Runtime:** Vanilla TypeScript (no framework — one view switcher and two panels doesn't need one)
- **Build:** Vite 6
- **Testing:** Vitest — 157 tests, including positional layout assertions for the Sankey, treemap and
  label placement
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, monthly, matching the ABS publication cadence
- **Libraries:** Leaflet 1.9 for maps. Every other visualisation is hand-rolled SVG.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview

# Refresh the data (fetches ~34 MB from the ABS API, then reshapes it)
node pipeline/collect.mjs && node pipeline/aggregate.mjs
```

## How it works

`pipeline/collect.mjs` pulls fourteen slices from the ABS SDMX API — national totals, per-country and
per-commodity monthly series over the full history, and a commodity × country grid for the trailing two
years — plus Natural Earth boundaries, caching each to `pipeline/.cache/`.

`pipeline/aggregate.mjs` reshapes them into the JSON the browser reads (about 2 MB total, ~700 KB
gzipped): national monthly totals, per-partner and per-commodity records with series and baskets, a
section × partner matrix, state figures, and a suppression summary. It also simplifies the world
boundaries with mapshaper and tags each polygon with its ABS country code, joining 211 of 220 real
partners to a shape.

All the parsing rules that matter live in `pipeline/lib/parse.mjs`, which is dependency-free so the test
suite can import it directly on CI. That's where country aggregates (OECD, ASEAN) are separated from
real countries, pseudo-destinations like "No Country Details" are kept out of every ranking, and
concentration is computed over published destinations only.

The frontend loads the JSON once at boot and renders every view client-side. There is no backend and no
runtime API dependency.

## License

MIT
