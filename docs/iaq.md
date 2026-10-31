# NOVAC indoor air quality module

Step 8 of the calculator. It works on the project's own rooms, outdoor air and air systems; it has no separate inputs for people, areas, airflows or the system type.

## What feeds it, and what it feeds

| From | Used for |
|---|---|
| Spaces: people, area, height, quantity, schedule, outdoor air category, infiltration, activity | Ventilation zones, contaminant generation, room volume |
| Building envelope: Ez, FAHU on or off | Zone outdoor air, system type, filter arrangement |
| Room loads: design supply air | Primary airflow (Vpz) and recirculated air |
| Hourly analysis: weather location and year | Location and year of the outdoor air-quality download |

**Apply required fresh air to the rooms** writes each room's fresh air. The room keeps its 62.1 category (`src.oaBasis`), so applying again does not compound. Every load then recalculates from the new fresh air: fresh-air sensible and latent, FAHU, plant, power and the hourly analysis.

## 1. Ventilation: ASHRAE 62.1-2022 Ventilation Rate Procedure

Engine: `src/engine/iaq/ventilation.ts`.

| Quantity | Equation | Source |
|---|---|---|
| Breathing zone | Vbz = Rp·Pz + Ra·Az | 62.1 Eq. 6-1, Table 6-1 |
| Zone outdoor air | Voz = Vbz / Ez | Eq. 6-2, Table 6-4 |
| Single zone | Vot = Voz | §6.2.4.1 |
| 100% outdoor air (FAHU / DOAS) | Vot = Σ Voz | §6.2.4.2 |
| Occupant diversity | D = Ps / Σ Pz; Ps = peak coincident population from the room schedules | §6.2.4.3 |
| Uncorrected outdoor air | Vou = D·Σ(Rp·Pz) + Σ(Ra·Az) | Eq. 6-6 |
| Simplified Ev | Ev = 0.88·D + 0.22 (D < 0.60), else 0.75 | §6.2.4.3.1 |
| Appendix A Ev | Xs = Vou / Vps; Evz = 1 + Xs − Zpz; Ev = min Evz | Normative Appendix A |
| Intake | Vot = Vou / Ev | §6.2.4.3 |
| Enhanced ventilation | Vot × (1 + enhancement) | Project choice |

- Rooms on ASHRAE 62.2 (dwellings: 0.15 L/s·m² + 3.5 L/s per occupant) or ASHRAE 170 (healthcare outdoor air changes per hour) keep those rates.
- Each room's required fresh air is its Voz scaled so that the rooms add up to Vot.
- Vpz is the room's design supply air; for VAV systems the minimum primary airflow should be used.

**Air balance:**
- Exhaust is the sum of the room exhaust inputs.
- Make-up air = max(0, exhaust − Vot).
- Net pressurisation = Vot − exhaust.

## 2. Contaminants: well-mixed mass balance

Engine: `src/engine/iaq/contaminants.ts`.

V·dC/dt = Qoa(1 − ηoa)·Cout + Qinf·P·Cout + G − (Qoa + Qinf + Qrec·ηrec + k·V)·C

The inputs are held constant over each hour, and the exact solution is used:
- λ = (Qoa + Qinf + Qrec·ηrec)/V + k
- Css = S/λ
- End of the hour: C(t+1) = Css + (C − Css)·e^(−λ)
- Hourly mean: Css + (C − Css)(1 − e^(−λ))/λ

**Air paths:**
- **With a FAHU:** outdoor air passes the FAHU pre- and final filters in series; recirculated air (the room unit's supply) passes the room unit filter.
- **Without a FAHU:** outdoor and return air mix ahead of the unit's filters.

**Running periods:**
- **Without outdoor data:** the room runs as a repeating design day at the typical outdoor values. Thirty identical days are simulated and the last is reported.
- **With a downloaded year:** all 8,760 hours run with hourly outdoor data from the Open-Meteo Air Quality API (CAMS). The data covers PM2.5, PM10, CO, NO₂, O₃ and CO₂ and needs no key.

**CO₂ generation:** 0.0052 L/s per person at 1.2 met (ASTM D6245-18), scaled by the room's activity heat gain over 130 W. **CO₂ is reported as a ventilation indicator, not an air-quality compliance metric.**

**Criteria:**
- Averaging periods: 24 h, 8 h running, or hourly.
- Defaults are from the WHO global air quality guidelines 2021, the WHO indoor guidelines 2010 (formaldehyde) and WELL v2 A05 (TVOC, a project criterion).
- Every value is editable under **Reference data and project overrides**.

## 3. Filtration

Engine: `src/engine/iaq/filtration.ts`.

**Particle efficiency:**
- Particle efficiencies are the ASHRAE 52.2-2017 minimum composite values for each MERV, in three size ranges (E1, E2, E3). HEPA is 99.97 % at the most penetrating size.
- These are minimums; tested products usually do better, so enter manufacturer data.
- PM mass is split across the size ranges by an assumed urban size distribution:
  - PM1: all in 0.3–1 µm.
  - PM2.5: 65 % in 0.3–1 µm and 35 % in 1–3 µm.
  - PM10: 35 / 25 / 40 % across the three ranges.

**Gas-phase media:** single-pass efficiencies for activated carbon and impregnated media are typical assumed values; replace them with ASHRAE 145.2 test data. UVGI only inactivates micro-organisms, so it has no effect on the listed contaminants.

**Sizing:**
- Face area = airflow / design face velocity.
- Cells = number of 610 × 610 mm filters.
- Actual face velocity = airflow / (cells × 0.372 m²).
- Clean pressure drop = rated value × actual velocity / design velocity.
- Average pressure drop = (clean + final) / 2.
- Fan power = airflow × average pressure drop / fan efficiency.
- Annual energy = fan power × operating hours.

## Standards data and copyright

NOVAC holds short numeric values from the standards (62.1 Rp and Ra, 52.2 minimum efficiencies, WHO guideline values), each with its edition and clause, and all overridable. The standards' text and full tables are not reproduced. Values marked **assumed** have no single authoritative source; replace them with project data.

## Limits of the method

- **Well-mixed rooms:** no stratification or local exposure.
- **Steady-periodic design day,** or an hourly year, solved one room at a time with no transfer between rooms.
- **First-order indoor losses:** no indoor chemistry (for example, ozone and terpene reactions).
- **The results are design calculations, not a certificate of compliance.**

## Validation (automated, `tests/iaq.test.ts`, `tests/ui.test.tsx`)

- **VRP:** hand-calculated Vbz, Voz and Vot for 100% outdoor air, single-zone and multiple-zone systems (simplified and Appendix A), Ez, enhanced ventilation and the air balance.
- **Mass balance:**
  - CO₂ steady state equals G / Q.
  - PM2.5 steady state with filters and deposition equals the analytical value.
  - Pure decay matches the hourly mean of e^(−λt).
- **Filters:** size-split efficiencies, cell count, face velocity, pressure drop, fan power and energy, and manufacturer overrides.
- **Integration:** applying enhanced ventilation raises the plant load in the summary; applying twice does not compound.

Run the tests with `npm test`.

## Deployment

Stages 1–3 are built: ventilation, contaminants and filtration. Stages 4–6 are not built yet: the FAHU coil, demand-controlled ventilation scenarios and sensors.

The module ships with the rest of the site. A push to `main` runs the GitHub Actions workflow (`npm ci`, `npm test`, `npm run build`) and publishes `dist` to GitHub Pages (novac.ae). The IAQ step is a separate, lazily loaded file (about 36 kB) and needs no server or API key.
