import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/engine/calc';
import { demand, dewaBilling, dewaCharge, dispatch, runScenario, settingsOf, tclSizing } from '../src/engine/power';
import { exampleState } from '../src/engine/project';
import { parseDiesel } from '../worker/diesel';
import { bookCosts, parseBook } from '../src/pricebook';

const st = exampleState(), d = computeAll(st.project, st.rooms);

describe('DEWA slab tariff', () => {
  it('bills slab by slab with the fuel surcharge and VAT', () => {
    const s = { dewaCat: 'com' as const, fuelSur: 0.06, vat: true };
    /* 5,000 kWh: 2,000 × 0.23 + 2,000 × 0.28 + 1,000 × 0.32 = 1,340 AED, fuel 300, VAT 5% */
    const c = dewaCharge(5000, s);
    expect(c.energy).toBeCloseTo(1340, 9);
    expect(c.fuel).toBeCloseTo(300, 9);
    expect(c.total).toBeCloseTo(1640 * 1.05, 9);
    expect(dewaCharge(7000, { ...s, vat: false }).energy).toBeCloseTo(460 + 560 + 640 + 1000 * 0.38, 9);
    /* industrial: 23 fils to 10,000 kWh, 38 above */
    expect(dewaCharge(12000, { dewaCat: 'ind', fuelSur: 0, vat: false }).energy).toBeCloseTo(10000 * 0.23 + 2000 * 0.38, 9);
  });
  it('nets the exports and carries surplus credit to the next months', () => {
    const n = 8760, grid = new Float64Array(n), surplus = new Float64Array(n), dem = new Float64Array(n);
    /* January: 1,000 kWh imported, 1,500 exported; February: 2,000 imported, nothing exported */
    grid[10] = 1000; surplus[11] = 1500; grid[31 * 24 + 10] = 2000;
    const s = settingsOf({ dewaCat: 'com', fuelSur: 0.06, vat: false });
    const B = dewaBilling({ year: 2025, n, grid, surplus }, dem, s);
    expect(B.months[0].billed).toBe(0);
    expect(B.months[0].creditOut).toBe(500);
    expect(B.months[1].creditIn).toBe(500);
    expect(B.months[1].billed).toBe(1500);
    expect(B.months[1].bill).toBeCloseTo(1500 * 0.23 + 1500 * 0.06, 9);
    expect(B.creditEnd).toBe(0);
  });
  it('replaces the flat tariff on-grid and gives the saving against no solar', () => {
    const s = settingsOf({ basis: 'custom', cKW: 40, cBase: 10, panels: 60, panelW: 550, utility: 'dewa', tcl: 100, tariff: 'dewa', dewaCat: 'com' });
    const D = demand(d, s, null)!, R = dispatch(D, s);
    expect(R.dewaBill).not.toBeNull();
    expect(R.gridCost).toBeCloseTo(R.dewaBill!.bill, 6);
    expect(R.dewaBill!.saving).toBeGreaterThan(0);
    expect(R.dewaBill!.baseBill).toBeCloseTo(R.dewaBill!.months.reduce((a, m) => a + m.baseBill, 0), 6);
    expect(dispatch(D, settingsOf({ ...s, tariff: 'flat' })).dewaBill).toBeNull();
  });
});

describe('on-grid sized from the TCL', () => {
  it('gives the DEWA maximum, the largest standard inverter and the panels it carries', () => {
    /* TCL 150 kW: 100 + 50 × 75% = 137.5 kW AC → 125 kW inverter; × 1.2 = 150 kWp → 272 panels of 550 Wp */
    const t = tclSizing(150, 550, 1.2);
    expect(t.allowed).toBeCloseTo(137.5, 9);
    expect(t.invKW).toBe(125);
    expect(t.panels).toBe(Math.floor(125 * 1.2 * 1000 / 550));
    const s = settingsOf({ basis: 'custom', cKW: 80, utility: 'dewa', tcl: 150, ogMode: 'tcl', panelW: 550, dcac: 1.2 });
    const D = demand(d, s, null)!, x = runScenario(D, s);
    expect(x.s.panels).toBe(t.panels);
    expect(x.R.invKW).toBe(125);
    expect(x.R.dewa!.ok).toBe(true);
  });
});

describe('live diesel price and price book', () => {
  it('reads the diesel price from the page title, and refuses a changed page', () => {
    expect(parseDiesel('<title>UAE Fuel Prices, 31 Oct 2026 — Diesel 4.80 AED/L (€1.17/$1.31) · Petrol 4.28 AED/L</title>')).toEqual({ price: 4.8, date: '31 Oct 2026' });
    expect(parseDiesel('<title>Something else</title>')).toBeNull();
    expect(parseDiesel('<title>UAE Fuel Prices, 1 Jan — Diesel 480 AED/L</title>')).toBeNull();
  });
  it('turns the price book into cost defaults and reads it back from a file', () => {
    const b = parseBook(JSON.stringify({ items: { cPV: { price: 2.1, supplier: 'Quote 12' }, diesel: { price: '3.05' }, bogus: { price: 1 } } }))!;
    expect(b.items.cPV!.price).toBe(2.1);
    expect(b.items.diesel!.price).toBe(3.05);
    expect((b.items as Record<string, unknown>).bogus).toBeUndefined();
    expect(bookCosts(b)).toEqual({ cPV: 2.1, diesel: 3.05 });
    expect(parseBook('not json')).toBeNull();
  });
});
