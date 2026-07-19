# Trade Flows — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **Live:** https://au-trade.benrichardson.dev
- **GitHub Pages:** https://ben-gy.github.io/au-trade/ *(redirects to the custom domain)*

## What it is

An explorer for ABS international merchandise trade — 224 trading partners, 342 SITC commodity codes
and 359 months of history back to July 1996, across nine views.

## The thing worth knowing

ABS confidentialises trade destinations far more heavily at commodity level than at the national total.
Nationally only 1.6% of exports lack a country — but **96% of natural gas exports have no published
buyer**. Any tool that treats the "No Country Details" bucket as a country reports it as Australia's
largest gas customer.

So on this site: concentration is computed over *published* destinations only, always shown with the
withheld share; commodities whose destinations are mostly hidden are drawn hollow in the Exposure
scatter rather than plotted as if their position were known; and Blind Spots makes the gap its own view.

## Headline figures (12 months to May 2026)

| | |
|---|---|
| Exports | $530.2bn |
| Imports | $490.0bn |
| Goods surplus | +$40.2bn |
| China's share of exports | 34.8% — more than Japan, South Korea, the US, Hong Kong and India combined |
| Top four commodity groups | 66% of everything sold (ores, gold, coal, gas) |
| Iron ore & other metalliferous ores | 74% to China, only 3% of destinations withheld |
| Natural gas | 96% of destinations withheld |

## Verification

- 157 Vitest tests pass, including positional layout assertions (no-overlap, in-bounds, no-NaN) for the
  Sankey, treemap and scatter label placement
- `npm run build` clean; production bundle hash matches the locally verified build
- All nine views walked with real clicks; zero console errors
- No horizontal overflow at 375px on any view or the drill-down panel (asserted, not eyeballed)
- Drill-down and About modal verified rendering *above* the Leaflet map
