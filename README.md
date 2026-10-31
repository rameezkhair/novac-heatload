# NOVAC Simplified Heat Load Calculator

A simple room-by-room heat load calculator for building cooling demand in the UAE. Set project conditions, add room details, and review hourly results using the ASHRAE heat-balance method, with checks against the Dubai Building Code (DBC), Al Sa'fat, Estidama, Barjeel and ASHRAE standards.

## Run it

Requires Node.js 20 or later.

```
npm install
npm run dev        # development server at http://localhost:5173
npm test           # engine, parity and UI tests
npm run build      # static site in dist/, deployable to any static host
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/engine/data.ts` | Standards library: design conditions, sub-locations, envelope code sets, ASHRAE 62.1 rates, room types, people gains, lighting allowances |
| `src/engine/psychro.ts` | Psychrometrics, site pressure, PMV/PPD |
| `src/engine/calc.ts`, `src/engine/hbm/` | Hourly room-by-room heat-balance calculation and project totals |
| `src/engine/checks.ts` | Compliance and plausibility checks |
| `src/engine/project.ts` | Defaults, source-option lists, resolving options into values, loading saved files |
| `src/engine/charts.ts`, `report.ts` | Psychrometric and design-day SVGs, printable report, CSV and Excel exports |
| `src/state/store.ts` | App state: undo/redo, autosave, projects saved in the browser |
| `src/components/` | React UI, one component per worksheet section |

The engine has no React or DOM dependencies, so it can be reused on a server or in another front end.

## Tests

- `tests/hbm.test.ts` covers hourly heat-balance calculations, surface response and coincident block loads.
- `tests/ui.test.tsx` renders the app and clicks through its main flows.

## Saving work

Work is saved automatically in the browser. From **Projects**, you can save named projects in the browser, export a `.novac.json` file to share, or open one.
