# NOVAC Heat Load Calculator

A web app for peak heat load calculations representing building cooling demand in the UAE, using the ASHRAE CLTD/CLF method. It checks the results against the Dubai Building Code (DBC), Al Sa'fat, Estidama, Barjeel and ASHRAE standards. It started as a single HTML file (kept in `tests/fixtures/original.html`).

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
| `src/engine/calc.ts` | Room-by-room CLTD/CLF load calculation and project totals |
| `src/engine/checks.ts` | Compliance and plausibility checks |
| `src/engine/project.ts` | Defaults, source-option lists, resolving options into values, loading saved files |
| `src/engine/charts.ts`, `report.ts` | Psychrometric and design-day SVGs, printable report, CSV and Excel exports |
| `src/state/store.ts` | App state: undo/redo, autosave, projects saved in the browser |
| `src/components/` | React UI, one component per worksheet section |

The engine has no React or DOM dependencies, so it can be reused on a server or in another front end.

## Tests

- `tests/parity.test.ts` loads the original HTML calculator in jsdom and checks that the new engine gives the same loads to 6 decimal places, apart from the intended fixes below.
- `tests/ui.test.tsx` renders the app and clicks through its main flows.

## Changes from the original calculator

1. **Glass conduction** uses the ASHRAE glass CLTD (8 K base, corrected like walls and roof; editable under Orientation factors) instead of the full outdoor–indoor difference. At Dubai DBC conditions this is 19.2 K instead of 22 K: 13% less glass conduction, about 0.5% less plant load on the example project.
2. **Report room tables** list the roof, ceiling, floor and every wall partition with area, adjacent space, temperature, U-value and gain. The original printed old fields that no longer held data.
3. **Report clause** for safety margins is DBC H.4.6.3 (it said H.4.6.5).
4. **Skylight SHGC** for Estidama and Barjeel code sets is set to the ASHRAE 90.1 value. Before, these sets silently kept the previous code's value.
5. Unused code was removed. Area fields accept arithmetic through a small parser instead of `Function()`. An elevation field is shown for custom sites.

## Saving work

Work is saved automatically in the browser. From **Projects**, you can save named projects in the browser, export a `.novac.json` file to share, or open one.
