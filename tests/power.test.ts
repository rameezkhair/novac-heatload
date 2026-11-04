import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/engine/calc';
import { demand, dispatch, payback, settingsOf, suggestBattery, suggestGenset, suggestInverter, FUEL_A, FUEL_B } from '../src/engine/power';
import { exampleState } from '../src/engine/project';

const st = exampleState(), d = computeAll(st.project, st.rooms);
const sum = (a: Float64Array) => a.reduce((x, y) => x + y, 0);

describe('power supply', () => {
  it('builds a year of demand from the design days and from a custom profile', () => {
    const D = demand(d, settingsOf({ basis: 'design' }), null)!;
    expect(D.n).toBe(8760);
    expect(Math.max(...D.kW)).toBeGreaterThan(0);
    const withOther = demand(d, settingsOf({ basis: 'design', other: true }), null)!;
    expect(sum(withOther.kW)).toBeGreaterThan(sum(D.kW));
    /* 50 kW from 08 to 18, 5 days a week, 0 otherwise: 52 weeks and a day of 5 working days → 261 days × 10 h × 50 kW */
    const C = demand(d, settingsOf({ basis: 'custom', cKW: 50, opFrom: 8, opTo: 18, opDays: [true, true, true, true, true, false, false], cBase: 0 }), null)!;
    expect(sum(C.kW)).toBeCloseTo(261 * 10 * 50, 6);
    expect(demand(d, settingsOf({ basis: 'weather' }), null)).toBeNull();
  });

  it('balances every hour: supply plus unmet equals demand', () => {
    const s = settingsOf({ basis: 'custom', panels: 200, panelW: 550, gridKW: 20, bat: true, batKWh: 100 });
    const D = demand(d, s, null)!, R = dispatch(D, s);
    for (let i = 0; i < D.n; i++) expect(R.solar[i] + R.battery[i] + R.grid[i] + R.gen[i] + R.unmet[i]).toBeCloseTo(D.kW[i], 6);
    expect(R.gridPeakKW).toBeLessThanOrEqual(20 + 1e-9);
    expect(R.kWp).toBeCloseTo(110, 9);
    expect(R.batteryKWh).toBeGreaterThan(0);
    /* the battery never gives back more than it took in, after losses */
    expect(R.batteryKWh).toBeLessThanOrEqual(R.chargeKWh * 0.9 + 1e-6);
    expect(Math.max(...R.soc)).toBeLessThanOrEqual(100 * 0.9 + 1e-9);
  });

  it('sizes the inverter and genset to standard ratings and caps the genset', () => {
    expect(suggestInverter(110)).toBe(100);
    expect(suggestInverter(12)).toBe(12);
    /* 64 kW × 1.20 ÷ 0.8 = 96 kVA → 100 kVA; with no margin 80 kVA */
    expect(suggestGenset(64, 0.8)).toBe(100);
    expect(suggestGenset(64, 0.8, 0)).toBe(80);
    const s = settingsOf({ basis: 'custom', cKW: 50, gridKW: 0, genKVA: 50, pf: 0.8 });
    const D = demand(d, s, null)!, R = dispatch(D, s);
    expect(R.genKW).toBeCloseTo(40, 9);
    expect(R.unmetKWh).toBeGreaterThan(0);
    /* genset fuel follows the linear fuel curve for every running hour */
    let fuel = 0; for (let i = 0; i < D.n; i++) if (R.gen[i] > 0) fuel += FUEL_A * 40 + FUEL_B * R.gen[i];
    expect(R.fuelL).toBeCloseTo(fuel, 6);
  });

  it('splits by fixed shares and costs each source', () => {
    const s = settingsOf({ basis: 'custom', split: 'share', gridPct: 60, solarPct: 25, tGrid: 0.5, tSolar: 0.2 });
    const D = demand(d, s, null)!, R = dispatch(D, s), dem = sum(D.kW);
    expect(R.gridKWh).toBeCloseTo(dem * 0.6, 6);
    expect(R.solarKWh).toBeCloseTo(dem * 0.25, 6);
    expect(R.genKWh).toBeCloseTo(dem * 0.15, 6);
    expect(R.gridCost).toBeCloseTo(dem * 0.6 * 0.5, 4);
    expect(R.solarCost).toBeCloseTo(dem * 0.25 * 0.2, 4);
  });

  it('suggests a battery and shows a payback for solar', () => {
    const s = settingsOf({ basis: 'custom', cKW: 30, cBase: 10, panels: 150, panelW: 550, bat: true });
    const D = demand(d, s, null)!, kWh = suggestBattery(D, s);
    expect(kWh).toBeGreaterThan(0);
    expect(kWh % 5).toBe(0);
    const R = dispatch(D, s, { batKWh: kWh }), pb = payback(D, s, R)!;
    expect(pb.saving).toBeGreaterThan(0);
    expect(pb.years).toBeGreaterThan(0);
    /* the UAE clear sky × 0.95 × 0.78 gives a specific yield in the range seen for horizontal PV in the UAE */
    expect(R.specificYield).toBeGreaterThan(1400);
    expect(R.specificYield).toBeLessThan(2000);
  });
});

describe('DEWA Shams Dubai limit (Connection Conditions v4, 2.2)', () => {
  it('applies the TCL slabs and the 1,000 kW cap', async () => {
    const { dewaLimit } = await import('../src/engine/power');
    expect(dewaLimit(60).allowed).toBeCloseTo(60, 9);
    expect(dewaLimit(100).allowed).toBeCloseTo(100, 9);
    expect(dewaLimit(150).allowed).toBeCloseTo(137.5, 9);
    expect(dewaLimit(200).allowed).toBeCloseTo(175, 9);
    expect(dewaLimit(400).allowed).toBeCloseTo(275, 9);
    expect(dewaLimit(600).allowed).toBeCloseTo(325, 9);
    /* above 600 kW, 5%: 325 + 5% × (14,100 − 600) = 1,000 */
    expect(dewaLimit(14100).allowed).toBeCloseTo(1000, 9);
    expect(dewaLimit(20000).allowed).toBe(1000);
    expect(dewaLimit(20000).capped).toBe(true);
  });
  it('checks the inverter AC rating, not the DC array, and holds the suggestion within the limit once TCL is entered', () => {
    const s = settingsOf({ basis: 'custom', panels: 300, panelW: 550, dcac: 1.2, utility: 'dewa', tcl: 120 });
    const D = demand(d, s, null)!, R = dispatch(D, s);
    /* 165 kWp ÷ 1.2 = 137.5 → 150 kW standard, but the limit is 100 + 20 × 75% = 115 kW → largest standard size within it, 110 kW */
    expect(R.dewa!.allowed).toBeCloseTo(115, 9);
    expect(R.invKW).toBe(110);
    expect(R.dewa!.ok).toBe(true);
    expect(R.dewa!.maxPanels).toBe(Math.floor(115 * 1.2 * 1000 / 550));
    const over = dispatch(D, settingsOf({ ...s, invKW: 150 }));
    expect(over.dewa!.ok).toBe(false);
    /* with TCL blank the check is indicative and the suggestion is not capped */
    const est = dispatch(D, settingsOf({ ...s, tcl: '' }));
    expect(est.dewa!.tclEstimated).toBe(true);
    expect(est.invKW).toBe(150);
  });
});

describe('AC/DC conversion and the panel plane', () => {
  it('converts DC to AC at the inverter efficiency and clips at the AC rating', () => {
    const s = settingsOf({ basis: 'custom', panels: 100, panelW: 500, pr: 0.8, invEff: 96, invKW: 30, utility: 'none' });
    const D = demand(d, s, null)!, R = dispatch(D, s);
    for (let i = 0; i < D.n; i += 7) expect(R.pv[i]).toBeCloseTo(Math.min(50 * R.poa[i] / 1000 * 0.8 * 0.96, 30), 9);
    expect(R.dcKWh * 0.96 - R.clippedKWh).toBeCloseTo(R.pvKWh, 6);
    expect(R.dcac).toBeCloseTo(50 / 30, 9);
  });
  it('a south-facing tilt near the latitude collects more than a flat array in Dubai', () => {
    const flat = settingsOf({ basis: 'custom', panels: 20, panelW: 500, utility: 'none' });
    const D = demand(d, flat, null)!;
    const y0 = dispatch(D, flat).specificYield, y25 = dispatch(D, settingsOf({ ...flat, tilt: 25, az: 180 })).specificYield;
    const north = dispatch(D, settingsOf({ ...flat, tilt: 25, az: 0 })).specificYield;
    expect(y25).toBeGreaterThan(y0 * 1.03);
    expect(north).toBeLessThan(y0);
  });
});

describe('linked project, custom values and the sample example', () => {
  it('runs the demand from a loaded NOVAC project and applies customised values', async () => {
    const { samplePower } = await import('../src/engine/power');
    const s = settingsOf(samplePower().settings);
    const D = demand(d, s, null)!;
    expect(D.label).toContain(exampleState().project.name);
    const base = settingsOf({ ...s, scale: 100, addKW: 0 }), Db = demand(d, base, null)!;
    const scaled = demand(d, settingsOf({ ...s, extraOn: true, scale: 120, addKW: 5, addFrom: 8, addTo: 18 }), null)!;
    /* switched off, the additional power demand is not applied */
    const ignored = demand(d, settingsOf({ ...s, extraOn: false, scale: 120, addKW: 5, cop: 5 }), null)!;
    expect(sum(ignored.kW)).toBeCloseTo(sum(Db.kW), 6);
    for (const i of [3, 10, 5000]) expect(scaled.kW[i]).toBeCloseTo(Db.kW[i] * 1.2 + (i % 24 >= 8 && i % 24 < 18 ? 5 : 0), 9);
    /* a better COP lowers the cooling power */
    expect(sum(demand(d, settingsOf({ ...s, extraOn: true, cop: 5 }), null)!.kW)).toBeLessThan(sum(Db.kW));
  });
  it('uses a 24-hour custom profile on working days', () => {
    const prof = Array.from({ length: 24 }, (_, h) => h);
    const D = demand(d, settingsOf({ basis: 'custom', cMode: 'profile', cProfile: prof, opDays: [true, true, true, true, true, true, true], cBase: 0 }), null)!;
    expect(D.kW[30]).toBe(6);
    expect(sum(D.kW)).toBeCloseTo(365 * 276, 6);
  });
  it('the sample example is the application’s example office, its roof and every source in use', async () => {
    const { samplePower } = await import('../src/engine/power');
    const { layout, roofOf } = await import('../src/engine/roof');
    const ex = samplePower();
    /* the example's roof is the sum of its rooms' roof areas: 120 + 24 + 2 × 20 + 40 + 30 = 254 m² */
    expect(ex.roofM2).toBeCloseTo(254, 6);
    expect(ex.size[0] * ex.size[1]).toBeCloseTo(254, 6);
    expect(ex.size[0] / ex.size[1]).toBeCloseTo(2, 6);
    expect(ex.panels).toBeGreaterThan(30);
    expect(ex.settings.basis).toBe('project');
    /* with the example open, the sample uses this project, not a copy */
    expect(samplePower(exampleState()).settings.basis).toBe('design');
    const s = settingsOf(ex.settings), D = demand(d, s, null)!, b = suggestBattery(D, s), R = dispatch(D, s, { batKWh: b });
    expect(R.kWp).toBeCloseTo(ex.panels * 0.55, 9);
    expect(R.dewa!.allowed).toBeCloseTo(60, 9);
    expect(R.dewa!.ok).toBe(true);
    expect(R.solarKWh).toBeGreaterThan(0); expect(R.batteryKWh).toBeGreaterThan(0); expect(R.gridKWh).toBeGreaterThan(0); expect(R.genKWh).toBeGreaterThan(0);
    expect(R.unmetKWh).toBe(0);
    expect(payback(D, s, R)!.years).toBeGreaterThan(0);
    void layout; void roofOf;
  });
});

describe('operating schedule', () => {
  it('counts operating hours for standard days and hours, wrapping past midnight', async () => {
    const { operatingHours, DAY_PRESETS } = await import('../src/engine/power');
    /* 2025: 261 weekdays, 52 Saturdays, 52 Sundays */
    expect(operatingHours(settingsOf({ opDays: DAY_PRESETS[0].days, opFrom: 8, opTo: 18 }))).toBe(261 * 10);
    expect(operatingHours(settingsOf({ opDays: DAY_PRESETS[3].days, opFrom: 0, opTo: 24 }))).toBe(8760);
    expect(operatingHours(settingsOf({ opDays: DAY_PRESETS[3].days, opFrom: 16, opTo: 8 }))).toBe(365 * 16);
  });
  it('applies the schedule to a linked project with a standby share outside it', () => {
    const base = settingsOf({ basis: 'design' }), on = settingsOf({ basis: 'design', opApply: true, opStandby: 10, opFrom: 8, opTo: 18 });
    const A = demand(d, base, null)!, B = demand(d, on, null)!;
    /* 2 Jan 2025 is a Thursday: 03:00 is outside, 12:00 inside; 4 Jan is a Saturday */
    expect(B.kW[24 + 3]).toBeCloseTo(A.kW[24 + 3] * 0.1, 9);
    expect(B.kW[24 + 12]).toBeCloseTo(A.kW[24 + 12], 9);
    expect(B.kW[72 + 12]).toBeCloseTo(A.kW[72 + 12] * 0.1, 9);
  });
  it('reads older settings with a working-day count', () => {
    const s = settingsOf({ cDays: 6, cFrom: 9, cTo: 17 });
    expect(s.opDays).toEqual([true, true, true, true, true, true, false]);
    expect(s.opFrom).toBe(9);
  });
});

describe('several operating schedules', () => {
  const W5 = [true, true, true, true, true, false, false], WE = [false, false, false, false, false, true, true];
  it('runs weekdays and the weekend on their own hours and demand, without overlaps', async () => {
    const { coverage, operatingHours } = await import('../src/engine/power');
    const opScheds = [{ id: 'a', name: 'Weekdays', days: W5, from: 8, to: 12, kW: 20 }, { id: 'b', name: 'Weekend', days: WE, from: 8, to: 20, kW: 60 }];
    const s = settingsOf({ basis: 'custom', cBase: 2, opScheds });
    expect(operatingHours(s)).toBe(261 * 4 + 104 * 12);
    expect(coverage(opScheds)).toEqual({ overlap: [], uncovered: [] });
    const D = demand(d, s, null)!;
    /* 1 Jan 2025 is a Wednesday, 4 Jan a Saturday */
    expect(D.kW[10]).toBe(20); expect(D.kW[13]).toBe(2);
    expect(D.kW[72 + 10]).toBe(60); expect(D.kW[72 + 19]).toBe(60); expect(D.kW[72 + 20]).toBe(2);
    expect(sum(D.kW)).toBeCloseTo(261 * 4 * 20 + 104 * 12 * 60 + (8760 - 261 * 4 - 104 * 12) * 2, 6);
  });
  it('reports overlapping and uncovered days', async () => {
    const { coverage } = await import('../src/engine/power');
    expect(coverage([{ id: 'a', name: 'A', days: [true, true, false, false, false, false, false], from: 8, to: 18 }, { id: 'b', name: 'B', days: [false, true, true, false, false, false, false], from: 8, to: 18 }]))
      .toEqual({ overlap: [1], uncovered: [3, 4, 5, 6] });
  });
});

describe('schedule breakdown', () => {
  it('splits the energy and peaks by schedule, with daily, weekly and monthly requirements', async () => {
    const { scheduleBreakdown } = await import('../src/engine/power');
    const W5 = [true, true, true, true, true, false, false], WE = [false, false, false, false, false, true, true];
    const s = settingsOf({ basis: 'custom', cKW: 80, cBase: 5, opScheds: [{ id: 'a', name: 'Weekdays', days: W5, from: 8, to: 12 }, { id: 'b', name: 'Weekend', days: WE, from: 8, to: 20 }] });
    const D = demand(d, s, null)!, B = scheduleBreakdown(D, s);
    expect(B.rows[0].kWh).toBeCloseTo(261 * 4 * 80, 6);
    expect(B.rows[0].opDays).toBe(261);
    expect(B.rows[0].perDay).toBeCloseTo(4 * 80, 6);
    expect(B.rows[1].kWh).toBeCloseTo(104 * 12 * 80, 6);
    expect(B.rows[1].perDay).toBeCloseTo(12 * 80, 6);
    expect(B.out.hours).toBe(8760 - 261 * 4 - 104 * 12);
    expect(B.out.kWh).toBeCloseTo(B.out.hours * 5, 6);
    expect(B.total).toBeCloseTo(sum(D.kW), 6);
    /* a weekend day: 12 h × 80 + 12 h × 5 = 1,020 kWh; a whole week: 5 × (320 + 100) + 2 × 1,020 = 4,140 kWh */
    expect(B.day.peak).toBeCloseTo(1020, 6);
    expect(B.week.peak).toBeCloseTo(4140, 6);
    expect(B.month.monthly.reduce((a, b) => a + b, 0)).toBeCloseTo(B.total, 6);
  });
});

describe('fixed shares in kW of TCL', () => {
  it('converts kW of the TCL to shares, the genset taking the rest, and matches the % split', () => {
    const kw = settingsOf({ basis: 'custom', split: 'share', shareUnit: 'kw', tcl: 100, gridKWs: 60, solarKWs: 25 });
    const pct = settingsOf({ basis: 'custom', split: 'share', shareUnit: 'pct', gridPct: 60, solarPct: 25 });
    const D = demand(d, kw, null)!, A = dispatch(D, kw), B = dispatch(D, pct);
    expect(A.shares!.gen.kW).toBeCloseTo(15, 9);
    expect(A.shares!.grid.pct).toBeCloseTo(60, 9);
    expect(A.gridKWh).toBeCloseTo(B.gridKWh, 6);
    expect(A.genKWh).toBeCloseTo(B.genKWh, 6);
    /* % entered: kW shown against the TCL */
    const C = dispatch(D, settingsOf({ ...pct, tcl: 200 }));
    expect(C.shares!.grid.kW).toBeCloseTo(120, 9);
    /* more than the TCL: solar kept, grid cut to the rest */
    const O = dispatch(D, settingsOf({ ...kw, gridKWs: 90 }));
    expect(O.shares!.over).toBe(true);
    expect(O.shares!.grid.kW).toBeCloseTo(75, 9);
    expect(O.shares!.gen.kW).toBeCloseTo(0, 9);
  });
});

describe('load by source', () => {
  it('gives each source its yearly, daily, weekly and monthly load and peak', async () => {
    const { supplyStats } = await import('../src/engine/power');
    const s = settingsOf({ basis: 'custom', cKW: 40, cBase: 10, panels: 40, panelW: 550, gridKW: 20, bat: true, batKWh: 40, utility: 'none' });
    const D = demand(d, s, null)!, R = dispatch(D, s), st = supplyStats(R);
    const g = st.find(x => x.key === 'grid')!, pv = st.find(x => x.key === 'solar')!, gen = st.find(x => x.key === 'gen')!;
    expect(g.kWh).toBeCloseTo(R.gridKWh, 6);
    expect(pv.kWh).toBeCloseTo(R.solarKWh, 6);
    expect(gen.kWh).toBeCloseTo(R.genKWh, 6);
    expect(g.peakKW).toBeLessThanOrEqual(20 + 1e-9);
    expect(g.month.kWh.reduce((a, b) => a + b, 0)).toBeCloseTo(g.kWh, 6);
    expect(g.day.avg).toBeCloseTo(g.kWh / 365, 6);
    expect(g.month.avg).toBeCloseTo(g.kWh / 12, 6);
    expect(g.week.peak).toBeGreaterThanOrEqual(g.week.avg);
    expect(g.day.peak).toBeLessThanOrEqual(g.week.peak + 1e-9);
    /* every source together is the demand */
    expect(st.reduce((a, x) => a + x.kWh, 0)).toBeCloseTo(R.demandKWh, 6);
  });
});

describe('off-grid', () => {
  it('has no grid, sizes the battery from the design day and autonomy, and runs the year', async () => {
    const { offGridSizing } = await import('../src/engine/power');
    const s0 = settingsOf({ basis: 'custom', cKW: 30, cBase: 5, conn: 'off', autonomy: 1, offDay: 'peak', dod: 90, rte: 90 });
    const D = demand(d, s0, null)!, og = offGridSizing(D, s0);
    /* a working day: 10 h × 30 + 14 h × 5 = 370 kWh; battery 370 ÷ (0.9 × √0.9) → next 5 kWh */
    expect(og.eDay).toBeCloseTo(370, 6);
    expect(og.batKWh).toBe(Math.ceil(370 / (0.9 * Math.sqrt(0.9)) / 5) * 5);
    expect(og.batKW).toBe(Math.ceil(30 * 1.25));
    const n = Math.ceil(og.kWp * 1000 / 550), s = settingsOf({ ...s0, panels: n, panelW: 550 });
    const R = dispatch(D, s, { batKWh: og.batKWh, batKW: og.batKW });
    expect(R.gridKWh).toBe(0);
    expect(R.dewa).toBeNull();
    expect(R.batteryKWh).toBeGreaterThan(0);
    expect(R.invKW).toBeGreaterThanOrEqual(30 * 1.25);
    /* without a backup genset, what is not met is loss of load; with it, nothing is unmet */
    const bare = dispatch(D, settingsOf({ ...s, offGen: false }), { batKWh: og.batKWh, batKW: og.batKW });
    expect(bare.genKWh).toBe(0);
    expect(R.unmetKWh).toBe(0);
    for (let i = 0; i < D.n; i += 11) expect(bare.solar[i] + bare.battery[i] + bare.unmet[i]).toBeCloseTo(D.kW[i], 6);
  });
});

describe('on-grid and off-grid scenarios', () => {
  it('keeps the off-grid supply apart from the on-grid supply and calculates both', async () => {
    const { scenarioOf, seedOffGrid, runScenario } = await import('../src/engine/power');
    const power = { basis: 'custom' as const, cKW: 30, cBase: 5, panels: 40, panelW: 550, gridKW: '' as const };
    const withOff = { ...power, conn: 'off' as const, offSup: { ...seedOffGrid(power), panels: 120 } };
    const on = scenarioOf(withOff, 'on'), off = scenarioOf(withOff, 'off');
    expect(on.conn).toBe('on'); expect(off.conn).toBe('off');
    expect(on.panels).toBe(40); expect(off.panels).toBe(120);
    const D = demand(d, on, null)!, A = runScenario(D, { ...on, utility: 'dewa' }), B = runScenario(D, { ...off, utility: 'none' });
    expect(A.R.kWp).toBeCloseTo(22, 9); expect(B.R.kWp).toBeCloseTo(66, 9);
    expect(A.R.gridKWh).toBeGreaterThan(0); expect(B.R.gridKWh).toBe(0);
    expect(B.og).not.toBeNull(); expect(A.og).toBeNull();
  });
});

describe('additional power demand switch', () => {
  it('keeps older settings with values switched on', () => {
    expect(settingsOf({ addKW: 4 }).extraOn).toBe(true);
    expect(settingsOf({ scale: 100, addKW: 0 }).extraOn).toBe(false);
    expect(settingsOf({}).extraOn).toBe(false);
  });
});

describe('remaining power requirement', () => {
  it('shares what solar and the battery leave between the grid and the genset', async () => {
    const { remainingOf } = await import('../src/engine/power');
    const base = settingsOf({ basis: 'custom', cKW: 40, cBase: 10, panels: 30, panelW: 550, utility: 'none' });
    const D = demand(d, base, null)!;
    const all = dispatch(D, base), half = dispatch(D, settingsOf({ ...base, remGrid: 50 })), none = dispatch(D, settingsOf({ ...base, remGrid: 0 }));
    const rem = remainingOf(all).kWh;
    /* the remainder is the same however it is shared */
    expect(remainingOf(half).kWh).toBeCloseTo(rem, 6);
    expect(all.genKWh).toBeCloseTo(0, 6);
    expect(half.gridKWh).toBeCloseTo(rem / 2, 6);
    expect(half.genKWh).toBeCloseTo(rem / 2, 6);
    expect(none.gridKWh).toBe(0);
    expect(none.genKWh).toBeCloseTo(rem, 6);
    /* less solar: the remainder grows and is shared the same way */
    const less = dispatch(D, settingsOf({ ...base, panels: 10, remGrid: 50 }));
    expect(remainingOf(less).kWh).toBeGreaterThan(rem);
    expect(less.gridKWh).toBeCloseTo(less.genKWh, 6);
  });
  it('lets an off-grid scenario take a share from a grid backup, none by default', () => {
    const off = settingsOf({ basis: 'custom', cKW: 30, cBase: 5, conn: 'off', panels: 20, panelW: 550, batKWh: 50 });
    const D = demand(d, off, null)!;
    expect(dispatch(D, off).gridKWh).toBe(0);
    const backup = dispatch(D, settingsOf({ ...off, remGrid: 40 }));
    expect(backup.gridKWh).toBeGreaterThan(0);
    expect(backup.gridKWh).toBeCloseTo((backup.gridKWh + backup.genKWh + backup.unmetKWh) * 0.4, 6);
  });
});

describe('recommended genset', () => {
  it('sizes on the peak load day with a 20% safety margin, or on what the genset supplies', () => {
    const s = settingsOf({ basis: 'custom', cKW: 100, cBase: 10, gridKW: 60, pf: 0.8 });
    const D = demand(d, s, null)!, R = dispatch(D, s);
    /* peak load day 100 kW × 1.2 ÷ 0.8 = 150 kVA */
    expect(R.genBasisKW).toBeCloseTo(100, 9);
    expect(R.genMargin).toBe(20);
    expect(R.genSuggested).toBe(150);
    expect(R.unmetKWh).toBe(0);
    /* the genset only supplies 40 kW above the 60 kW grid: 40 × 1.2 ÷ 0.8 = 60 kVA */
    const S = dispatch(D, settingsOf({ ...s, genBasis: 'supplied' }));
    expect(S.genBasisKW).toBeCloseTo(40, 9);
    expect(S.genSuggested).toBe(60);
    /* a 30% margin: 100 × 1.3 ÷ 0.8 = 162.5 → 200 kVA */
    expect(dispatch(D, settingsOf({ ...s, genMargin: 30 })).genSuggested).toBe(200);
  });
});
