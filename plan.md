# Site Plan: Trade Flows

## Overview
- **Name:** Trade Flows
- **Repo name:** au-trade
- **Tagline:** What Australia sells the world, what it buys back, and how much of it rests on one customer.

### Naming Convention
Plain topic name, no country in the title. `country: "AU"` in the index entry renders the flag.

## Target Audience
Three overlapping groups, all desktop-first but phone-checked:

1. **Exporters, trade consultants and industry association staff** who need to answer "where does our
   commodity actually go, and is that market growing?" without an IHS/Wood Mackenzie subscription.
2. **Journalists and policy researchers** writing the recurring "China dependency" story, who currently
   re-derive the same figures from ABS spreadsheets every quarter.
3. **Engaged general readers** — people who have heard "iron ore props up the economy" and "we're too
   exposed to China" and want to see whether that is actually true, at what magnitude, and in what.

They arrive with a question shaped like a noun: *iron ore*, *China*, *wine*, *Japan*. The site must answer
that noun in one search.

## Value Proposition
The ABS publishes this data, but only as SDMX queries and giant spreadsheets — there is no public
interface where you can see, in one place: every trading partner ranked, every commodity ranked, the
flow between them, and how concentrated each export is. Existing free tools (OEC, Trading Economics)
are global-generic, a year or more stale, and don't model Australian confidentiality rules at all.

The differentiator is **honesty about what the data can't tell you**. Australia's merchandise export
statistics are confidentialised at the commodity level: 94.8% of the $57bn LNG export has *no published
destination*. Every other tool silently renders that as a country called "No Country Details" or drops
it. This site treats suppression as a first-class fact, with a dedicated view, and computes every
concentration share over *published* destinations only, always labelled with how much is withheld.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| ABS Merchandise Exports by Commodity (SITC), Country and State | `data.api.abs.gov.au/rest/data/ABS,MERCH_EXP,1.0.0/…` | Monthly export values, 349 SITC codes × 262 countries × 8 states, Jul 1996 → present | Monthly | No |
| ABS Merchandise Imports by Commodity (SITC), Country and State | `data.api.abs.gov.au/rest/data/ABS,MERCH_IMP,1.0.0/…` | Monthly import values, same dimensions | Monthly | No |
| ABS SDMX codelists (`CL_MERCH_SITC`, `CL_MERCH_COUNTRY`, `CL_MERCH_STATE`) | `data.api.abs.gov.au/rest/datastructure/ABS/MERCH_EXP` | Commodity hierarchy (section → division → group), country names, state names | With dataflow | No |
| Natural Earth 110m Admin 0 countries | `raw.githubusercontent.com/nvkelso/natural-earth-vector` | World boundary polygons for the choropleth (public domain) | Static | No |
| `patterns/geo/au-states.geojson` | repo | ABS-derived AU state boundaries for the state-origin map | Static | No |

## Key Features
1. **Partner leaderboard** — all trading partners ranked by exports, imports, balance or share, with
   30-year sparklines and one-click drill-down.
2. **World map** — Natural Earth choropleth by exports / imports / trade balance / dependency, plus a
   second mode showing which Australian state the exports leave from.
3. **Exposure scatter (signature)** — every commodity plotted by value against the share going to its
   single largest published destination. The top-right quadrant is the country's actual trade risk.
4. **Flows** — Sankey from commodity section to partner, switchable between exports and imports.
5. **Blind Spots** — the confidentiality view: which commodities have their destinations withheld, how
   much, and why the LNG figure makes "who buys our gas" unanswerable from public data.
6. **Commodity explorer** — searchable, hierarchical table of all 349 SITC codes, plus a treemap of
   export composition.
7. **Matrix** — commodity section × top partners heatmap.
8. **Thirty-year trend** — monthly exports, imports and balance with annotated events.
9. **Insights** — auto-detected concentration, swing and suppression findings.

## Target Audience (detailed)
Primarily desktop (an exporter with a spreadsheet open on the other monitor; a journalist on deadline),
with a meaningful phone minority arriving from search on a single question ("australia exports to
india"). Tech-savvy enough to read a scatter plot but not necessarily to know what SITC or
confidentialisation means — every piece of jargon needs an inline definition. The emotional context is
mild anxiety plus curiosity: people come to this data because they've been told the economy is fragile
and want to see the shape of it themselves. That argues for a calm, authoritative, non-alarmist
presentation — show the concentration, don't editorialise about it.

## Style Direction
**Tone:** professional / civic-analytical — closer to a central bank chart pack than a news graphic.
**Colour palette:** light theme. Deep navy (`#12263f`) as the primary text/structure colour with a
teal-to-amber diverging accent for the export/import duality — exports teal (`#0f766e`), imports amber
(`#b45309`). This suits an economics audience: it reads as a statistical publication rather than a
dashboard, and the teal/amber pair is colour-blind-safe where red/green would not be. Suppressed or
withheld data gets a distinct hatched grey so it is never mistaken for a real value.
**UI density:** balanced-to-dense — tables are compact, but charts get room to breathe.
**Dark/light theme:** light. The audience is civic/economic, often printing or screenshotting for
reports, and a light chart pack photographs better into a slide deck.
**Reference sites for tone:** RBA Chart Pack (rba.gov.au/chart-pack), OEC (oec.world) for the flow
visual language — aiming for the RBA's restraint with the OEC's interactivity.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (no routing needed, no deep component tree — the view switcher
  plus two drill-down panels is the whole app; React would add weight for nothing)
- **Data strategy:** pipeline. ABS publishes merchandise trade monthly, so the cron is **monthly**
  (day 9, staggered off-hour) — proportional to the source, and the fastest cadence the rules allow.
- **Key libraries:** Leaflet 1.9 (maps) only. Sankey, treemap, scatter, matrix, histogram and sparklines
  are hand-rolled SVG using `patterns/treemap.ts`, `patterns/svgZoom.ts`, `patterns/tooltip.ts`.

## Layout
Fixed 52px header: title, a global search (commodity *or* country in one box), and the `?` About
button. Below it a word-only tab bar. Content area is a max-width 1720px column so the matrix and
Sankey can use a wide monitor. Drill-downs are right-side slide-in panels (hash-linkable:
`#c=CHIN`, `#s=28`). Sticky footer with source line and attribution.

On mobile (<768px) the tab bar becomes horizontally scrollable, tables drop to the two most important
columns plus the value, the Sankey and matrix get their own `overflow-x: auto` scrollers, and the
drill-down panel becomes full-width.

## Pages/Views
Single page, nine views (see Key Features), two drill-down panels (country, commodity), one About modal.

## Visualization Strategy

Design research: the OEC's product-space and country-profile pages set the bar for trade flow
interaction (click a product, see its destinations; click a country, see its basket); the RBA Chart Pack
sets the bar for restraint and annotation. The failure mode both avoid — and that a naive build would
hit — is rendering a commodity×country matrix as if it were complete, when ABS suppression means it
is not.

- **Partner leaderboard (table + ranked bars)** — answers "who matters most, and is that changing?"
  Sparkline per partner carries the trend the rank alone hides. *Always include.*
- **Exposure scatter (log value × top-destination share)** — answers "which exports are hostage to a
  single buyer?" No other view can show magnitude and concentration together; the leaderboard hides
  concentration and the matrix hides magnitude. This is the view the site exists for.
- **Sankey flow** — answers "what actually moves from which sector to which partner?" Value visibly
  moves from category to category, which is exactly the flow case.
- **Matrix heatmap** — answers "which partners span many sectors versus buy one thing?" Reveals that
  Japan/Korea are broad while India is nearly single-commodity — invisible in both the ranking and the
  Sankey.
- **World choropleth** — the data is inherently geographic; answers "where on Earth is our trade?" and
  makes the Asian concentration spatially obvious. Second mode (AU states) answers "which state earns it?"
- **Treemap (SITC hierarchy)** — answers "what is the composition of the export basket?" Hierarchical
  data, sized rectangles, one glance.
- **Thirty-year trend line** — answers "how did we get here?" Annotated with the China boom, GFC, the
  2020–23 China trade restrictions and the LNG ramp.
- **Blind Spots (ranked suppression bars)** — answers "what is the data refusing to tell me?" A view no
  competing tool has, and the honest counterpart to the Exposure scatter.
- **Insights** — auto-computed findings so a first-time visitor gets the story without driving the UI.

Deliberately **not** built: a force-directed network graph. The data is a bipartite
commodity↔partner flow with ~350 × ~260 nodes; a dot-cloud would be less legible than the Sankey and
matrix that already encode those relationships. Form follows the data's shape, not the house default.

## Data Modelling Rules (the traps)
1. **Country aggregates** (`APEC`, `ASEAN`, `EURO27`, `EURO`, `OECD`, `DC`, `LDC`, `JPDA`) have no
   parent and overlap each other — excluded from every ranking, offered only as an optional comparison.
2. **Pseudo-destinations** (`NCD` No Country Details, `CNAV`, `UNKN`, `SHIP` ship/aircraft stores, `AFZ`,
   `ANCA`, `AUST` re-imports) are not countries — never ranked as one, always shown as "not attributed".
3. **Suppression is level-dependent.** At `COMMODITY_SITC=TOT` the country split is essentially complete
   (unattributed = 1.6%). At division level it is not: gas (34) is 94.8% `NCD`. Commodity×country shares
   are therefore computed over *published* destinations and every commodity carries `suppressedShare`.
4. **SITC 98** ("combined confidential items", $67.5bn — the third-largest "commodity") is a
   confidentiality bucket, not a product. Labelled as such everywhere and excluded from "top product"
   claims.
5. **Values are AUD thousands** (`UNIT_MULT=3`) — multiply by 1,000 once, at parse time.
6. Headline window is a **rolling 12 months** (currently Jun 2025 → May 2026) so a partial financial
   year never understates a partner; annual series use full financial years.

## Headline figures (verified against the API during planning)
- Exports $530.2bn, imports $490.0bn, surplus $40.2bn (12 months to May 2026)
- China 34.8% of exports — more than Japan, Korea, the US, Hong Kong and India **combined** (32.9%)
- Four commodity groups — ores, gold, coal, gas — are 66.3% of everything Australia sells
- Iron ore and other metalliferous ores: 71.7% to China, only 3.3% suppressed
- Gas: 94.8% of destinations withheld — the country's largest statistical blind spot
