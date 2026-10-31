import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/engine/calc';
import { STATIONS } from '../src/engine/climate';
import { angleFactor, sunAt } from '../src/engine/hbm/solar';
import { fitU, halfSlabs, slabR, toSlabs } from '../src/engine/hbm/construction';
import { H, respond, type Surface } from '../src/engine/hbm/heatBalance';
import { exampleState } from '../src/engine/project';

/* ASHRAE 2013 climatic design conditions: clear-sky noon beam normal and diffuse horizontal irradiance on the 21st */
const NOON: Record<string, [number[], number[]]> = {
  dxb: [[779, 771, 763, 765, 734, 673, 598, 664, 722, 767, 772, 773], [131, 164, 195, 214, 241, 280, 317, 263, 209, 158, 130, 121]],
  aan: [[813, 795, 794, 783, 757, 693, 610, 689, 753, 812, 824, 806], [129, 167, 194, 221, 243, 283, 327, 265, 210, 152, 123, 122]],
};

describe('clear-sky solar model', () => {
  it('reproduces the ASHRAE noon irradiance for Dubai and Al Ain in every month', () => {
    for (const [k, [Eb, Ed]] of Object.entries(NOON)) {
      for (let m = 0; m < 12; m++) {
        let best = sunAt(STATIONS[k], m, 12);
        for (let t = 11; t <= 13.5; t += 0.01) { const s = sunAt(STATIONS[k], m, t); if (s.beta > best.beta) best = s; }
        expect(Math.abs(best.Eb - Eb[m]) / Eb[m], `${k} month ${m + 1} beam`).toBeLessThan(0.015);
        expect(Math.abs(best.Ed - Ed[m]) / Ed[m], `${k} month ${m + 1} diffuse`).toBeLessThan(0.02);
      }
    }
  });
  it('puts the sun in the south at solar noon and in the east in the morning', () => {
    const noon = sunAt(STATIONS.dxb, 0, 12.32), am = sunAt(STATIONS.dxb, 5, 8);
    expect(noon.az).toBeGreaterThan(175); expect(noon.az).toBeLessThan(185);
    expect(am.az).toBeGreaterThan(60); expect(am.az).toBeLessThan(110);
  });
  it('reduces glass gain at oblique angles', () => {
    expect(angleFactor(1)).toBeCloseTo(1, 6);
    expect(angleFactor(Math.cos(Math.PI / 3))).toBeGreaterThan(0.8);
    expect(angleFactor(Math.cos(80 * Math.PI / 180))).toBeLessThan(0.5);
  });
});

const wall = (slabs: ReturnType<typeof toSlabs>): Surface => ({ group: 'walls', A: 10, az: 270, tilt: 90, slabs, hci: H.wall, ext: true, alpha: 0.7 });
describe('heat balance', () => {
  it('gives the steady-state U × A × ΔT through a wall', () => {
    const s = wall(fitU('wall', 0.57)), R = respond([s]);
    /* forcing h_out × ΔT for a 10 K outdoor rise; the inside face sees only itself */
    const load = R.ext[0][0][0] * (H.co + H.ro) * 10;
    const U = 1 / (1 / (H.co + H.ro) + slabR(s.slabs) + 1 / H.wall);
    expect(load).toBeCloseTo(U * 10 * 10, 6);
    expect(U).toBeGreaterThan(0.5); expect(U).toBeLessThan(0.62);
  });
  it('keeps the envelope U-value when it adds insulation or mass', () => {
    for (const U of [0.32, 0.57, 3.29]) expect(1 / (slabR(fitU('wall', U)) + 0.17)).toBeCloseTo(U, 6);
    expect(1 / (slabR(fitU('roof', 0.3)) + 0.21)).toBeCloseTo(0.3, 6);
  });
  it('damps and delays the daily swing through a heavy wall', () => {
    const heavy = respond([wall(fitU('wall', 0.57))]).ext[0][1];
    const light = respond([wall([{ k: 0.035, rc: 0, L: slabR(fitU('wall', 0.57)) * 0.035 }])]).ext[0][1];
    expect(Math.hypot(...heavy)).toBeLessThan(0.5 * Math.hypot(...light));
  });
  it('returns all of a steady internal gain as load in a room of adiabatic surfaces', () => {
    const half = halfSlabs(toSlabs([{ m: 'plaster', t: 15 }, { m: 'hb100', t: 100 }, { m: 'plaster', t: 15 }]));
    const S: Surface[] = [{ group: 'mass', A: 40, az: 0, tilt: 90, slabs: half, hci: H.wall, ext: false, alpha: 0 }, { group: 'mass', A: 20, az: 0, tilt: 180, slabs: half, hci: H.floor, ext: false, alpha: 0, floor: true }];
    const R = respond(S);
    expect(R.rad[0][0]).toBeCloseTo(1, 9); expect(R.beam[0][0]).toBeCloseTo(1, 9);
    expect(Math.hypot(...R.rad[1])).toBeLessThan(1);
  });
});

describe('heat balance on the example project', () => {
  const s = exampleState(), d = computeAll(s.project, s.rooms);
  const c = exampleState(); c.project.method = 'cltd';
  const dc = computeAll(c.project, c.rooms);
  it('peaks in summer and stays below the CLTD estimate', () => {
    const office = d.res[s.rooms[0].id];
    expect(office.method).toBe('hbm');
    expect(office.pkM).toBeGreaterThanOrEqual(4); expect(office.pkM).toBeLessThanOrEqual(9);
    expect(d.T.u / dc.T.u).toBeGreaterThan(0.6); expect(d.T.u / dc.T.u).toBeLessThan(1.05);
  });
  it('splits each room peak into components that add up to the room load', () => {
    for (const r of s.rooms) {
      const x = d.res[r.id], parts = x.walls + x.roof + x.gSol + x.gCond + x.part + x.pS + x.light + x.equip + x.infS;
      expect(parts + x.mS).toBeCloseTo(x.roomS, 6);
      expect(x.profS![x.pkM! * 24 + x.pkH! - 1] + x.profL![x.pkM! * 24 + x.pkH! - 1]).toBeCloseTo(x.roomS + x.roomL, 6);
    }
  });
  it('finds a coincident block load no larger than the sum of room peaks', () => {
    const sum = s.rooms.reduce((a, r) => a + (d.res[r.id].roomS + d.res[r.id].roomL) * d.res[r.id].qty, 0);
    expect(d.T.blk).toBeDefined();
    expect(d.T.blk!.s + d.T.blk!.l).toBeLessThanOrEqual(sum + 1e-6);
    expect(d.T.blk!.s + d.T.blk!.l).toBeGreaterThan(0.85 * sum);
  });
  it('moves the peak of an east-facing room to the morning when gains follow an office day', () => {
    const e = exampleState(), r = e.rooms[2];
    r.walls.E = { w: 12, g: 8 }; r.sched = 'day'; r.people = 0; r.light = 0; r.equip = 0; r.ach = 0; r.above = 'cond';
    const x = computeAll(e.project, e.rooms).res[r.id];
    expect(x.pkH).toBeLessThanOrEqual(13);
  });
});
