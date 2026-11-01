import { describe, expect, it } from 'vitest';
import {
  airDensity, airViscosity, calcDuctSystem, usesAshrae, equivDiameter, frictionFactor, frictionPerMetre, newDuctSystem, selectSize, type DuctSystem,
} from '../src/engine/duct/duct';
import { ashraeVelocity, noiseFor, table8Row } from '../src/engine/duct/acoustics';

/* Altshul–Tsal friction factor, an independent explicit form used to check the Colebrook solution */
const altshulTsal = (re: number, rel: number) => { const f = 0.11 * Math.pow(rel + 68 / re, 0.25); return f >= 0.018 ? f : 0.85 * f + 0.0028; };

describe('duct sizing engine', () => {
  it('gives standard air properties', () => {
    expect(airDensity(0, 20)).toBeCloseTo(1.204, 3);
    expect(airDensity(1000, 20)).toBeCloseTo(1.204 * 0.8870, 2);
    expect(airViscosity(20)).toBeCloseTo(1.81e-5, 7);
  });

  it('solves the Colebrook friction factor', () => {
    /* smooth duct at Re 100,000: 0.0180 (Moody diagram) */
    expect(frictionFactor(1e5, 0)).toBeCloseTo(0.0180, 3);
    /* rough duct agrees with the independent Altshul–Tsal form within 3% */
    for (const [re, rel] of [[5e4, 1e-4], [2e5, 3e-4], [1e6, 1e-3]]) expect(Math.abs(frictionFactor(re, rel) / altshulTsal(re, rel) - 1)).toBeLessThan(0.03);
    /* laminar */
    expect(frictionFactor(1000, 0.001)).toBeCloseTo(0.064, 6);
  });

  it('matches the ASHRAE friction chart for galvanised round duct', () => {
    /* 500 L/s in Ø400 mm, standard air: about 0.47 Pa/m */
    const d = 0.4, a = Math.PI * d * d / 4;
    expect(frictionPerMetre(0.5, d, a, 1.204, 1.81e-5, 0.00009)).toBeCloseTo(0.47, 1);
  });

  it('converts rectangular ducts to the equivalent round size both ways', () => {
    expect(equivDiameter(400, 200)).toBeCloseTo(305, 0);
    expect(equivDiameter(300, 300)).toBeCloseTo(328, 0);
    expect(equivDiameter(600, 250)).toBeCloseTo(equivDiameter(250, 600), 9);
    /* a rectangular duct and its equivalent round duct lose the same per metre at the same flow (within 1.5%) */
    const de = equivDiameter(0.6, 0.3), round = frictionPerMetre(0.8, de, Math.PI * de * de / 4, 1.2, 1.81e-5, 0.00009);
    const rect = frictionPerMetre(0.8, 2 * 0.6 * 0.3 / 0.9, 0.18, 1.2, 1.81e-5, 0.00009);
    expect(Math.abs(rect / round - 1)).toBeLessThan(0.015);
  });

  it('picks the smallest size within the friction target and the velocity limit', () => {
    const sys = { ...newDuctSystem('s', 'AHU-1'), shape: 'round' as const };
    const s = selectSize(0.5, sys, 7.5, 1.2, 1.81e-5);
    expect(s.d).toBe(400);
    const vSys: DuctSystem = { ...sys, method: 'velocity' };
    const v = selectSize(0.5, vSys, 7.5, 1.2, 1.81e-5);
    expect(0.5 / v.area).toBeLessThanOrEqual(7.5);
    const rect = selectSize(0.5, { ...sys, shape: 'rect', fixedDepth: 250 }, 7.5, 1.2, 1.81e-5);
    expect(rect.h).toBe(250);
    expect(rect.w! / rect.h!).toBeLessThanOrEqual(4);
  });

  it('adds airflow downstream and finds the worst path', () => {
    const sys: DuctSystem = { ...newDuctSystem('s', 'FCU-1'), limits: 'custom', allowancePa: 50, sections: [
      { id: 'm', name: 'Main', parent: null, kind: 'main', length: 10, fittings: [{ type: 'elbow-vanes', qty: 1 }] },
      { id: 'a', name: 'To office', parent: 'm', kind: 'runout', length: 4, room: 'r1', units: 2, terminalPa: 20, fittings: [{ type: 'tee-branch', qty: 1 }] },
      { id: 'b', name: 'To meeting', parent: 'm', kind: 'runout', length: 12, room: 'r2', terminalPa: 20, fittings: [{ type: 'tee-branch', qty: 1 }, { type: 'elbow-vanes', qty: 2 }] },
    ] };
    const r = calcDuctSystem(sys, 5, id => ({ r1: 150, r2: 200 } as Record<string, number>)[id]);
    const row = (id: string) => r.rows.find(x => x.id === id)!;
    expect(row('a').flow).toBe(300);
    expect(row('m').flow).toBe(500);
    expect(r.totalFlow).toBe(500);
    expect(r.criticalPath).toEqual(['m', 'b']);
    expect(r.criticalPa).toBeCloseTo(row('m').sectionPa + row('b').sectionPa, 9);
    expect(r.esp).toBeCloseTo(r.criticalPa + 50, 9);
    expect(r.errors).toEqual([]);
  });

  it('reports loops and missing rooms instead of failing', () => {
    const sys: DuctSystem = { ...newDuctSystem('s', 'X'), sections: [
      { id: 'a', name: 'A', parent: 'b', kind: 'main', length: 1, fittings: [] },
      { id: 'b', name: 'B', parent: 'a', kind: 'main', length: 1, fittings: [] },
      { id: 'c', name: 'C', parent: null, kind: 'runout', length: 1, room: 'gone', fittings: [] },
    ] };
    const r = calcDuctSystem(sys, 0, () => undefined);
    expect(r.errors.some(e => e.includes('loop'))).toBe(true);
    expect(r.errors.some(e => e.includes('no longer exists'))).toBe(true);
  });
});

describe('ASHRAE acoustic duct limits (HVAC Applications Ch. 49)', () => {
  it('takes Table 8 velocities by location, criterion and shape, with 80% for branches and 50% for runouts', () => {
    const fpm = 0.00508;
    expect(ashraeVelocity(35, 'ceiling', 'rect', 'main')).toBeCloseTo(1750 * fpm, 6);
    expect(ashraeVelocity(35, 'ceiling', 'round', 'main')).toBeCloseTo(3000 * fpm, 6);
    expect(ashraeVelocity(45, 'shaft', 'rect', 'branch')).toBeCloseTo(3500 * fpm * 0.8, 6);
    expect(ashraeVelocity(25, 'occupied', 'round', 'runout')).toBeCloseTo(1700 * fpm * 0.5, 6);
    /* a criterion between rows uses the next stricter row */
    expect([20, 25, 30, 35, 40, 45, 50].map(table8Row)).toEqual([25, 25, 25, 35, 35, 45, 45]);
  });

  it('maps room types to Table 1 criteria, flagging types Table 1 does not list', () => {
    expect(noiseFor('privoffice')).toMatchObject({ nc: 30, space: 'Executive and private offices' });
    expect(noiseFor('office')).toMatchObject({ nc: 40, space: 'Open-plan offices' });
    expect(noiseFor('prayer').nc).toBe(25);
    expect(noiseFor('retail').nearest).toBe(true);
    expect(noiseFor('privoffice').nearest).toBeUndefined();
  });

  it('sizes each section to the strictest room it serves and checks every room', () => {
    const sys: DuctSystem = { ...newDuctSystem('s', 'AHU'), sections: [
      { id: 'm', name: 'Main', parent: null, kind: 'main', length: 10, fittings: [] },
      { id: 'o', name: 'Open office', parent: 'm', kind: 'runout', length: 5, room: 'open', fittings: [] },
      { id: 'p', name: 'Private office', parent: 'm', kind: 'runout', length: 5, room: 'priv', fittings: [] },
    ] };
    expect(usesAshrae(sys)).toBe(true);
    const nc = (id: string) => ({ open: 40, priv: 30 } as Record<string, number>)[id];
    const r = calcDuctSystem(sys, 0, id => ({ open: 600, priv: 120 } as Record<string, number>)[id], nc);
    const row = (id: string) => r.rows.find(x => x.id === id)!;
    /* the main serves both rooms, so it takes the private office's NC 30 (Table 8 row 25, above acoustic ceiling, rectangular) */
    expect(row('m').nc).toBe(30);
    expect(row('m').vLimit).toBeCloseTo(1200 * 0.00508, 6);
    expect(row('o').vLimit).toBeCloseTo(1750 * 0.00508 * 0.5, 6);
    expect(r.rows.every(x => x.velocity <= x.vLimit + 1e-9)).toBe(true);
    expect(r.spaces.map(s => [s.room, s.nc, s.complies])).toEqual([['open', 40, true], ['priv', 30, true]]);
    /* custom limits looser than ASHRAE: the private office no longer complies */
    const loose = calcDuctSystem({ ...sys, limits: 'custom', vMax: { main: 12, branch: 10, runout: 8 } }, 0, id => ({ open: 600, priv: 120 } as Record<string, number>)[id], nc);
    expect(loose.spaces.find(s => s.room === 'priv')!.complies).toBe(false);
  });
});
