import { describe, expect, it, vi } from 'vitest';
import { NET, providerOf } from '../src/engine/weather/providers';
import { computeAll, PKG_OA_MAX } from '../src/engine/calc';
import { exampleState } from '../src/engine/project';
import { simulateYear } from '../src/engine/weather/simulate';
import { fakeOpenMeteo } from './weatherFixture';

const base = () => exampleState();

describe('fresh air load switch per space', () => {
  it('leaves the fresh air load out of the room, FAHU and plant but keeps the airflow', () => {
    const st = base(), on = computeAll(st.project, st.rooms);
    const rooms = st.rooms.map((r, i) => i === 0 ? { ...r, faLoad: false } : r), off = computeAll(st.project, rooms);
    const r0 = st.rooms[0].id;
    expect(on.res[r0].oa).toBeGreaterThan(0);
    expect(off.res[r0].oa).toBe(0);
    expect(off.res[r0].oaS).toBe(0);
    expect(off.res[r0].oaQ).toBe(on.res[r0].oaQ);
    expect(off.T.oa).toBeCloseTo(on.T.oa - on.res[r0].oa * on.res[r0].qty, 6);
    expect(off.T.plant).toBeLessThan(on.T.plant);
    /* the airflow still counts for ventilation */
    expect(off.T.oaq).toBeCloseTo(on.T.oaq, 9);
  });
  it('leaves it out of the weather year too', async () => {
    NET.spacing = 0; NET.backoff = 1;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fakeOpenMeteo(2025)), { status: 200 })));
    const wx = await providerOf('open-meteo').fetch!({ provider: 'open-meteo', lat: 25.2048, lon: 55.2708, year: 2025 }, { elev: 5 });
    vi.unstubAllGlobals();
    const st = base();
    const all = computeAll(st.project, st.rooms.map(r => ({ ...r, faLoad: false })));
    const Y = simulateYear(all, wx);
    expect(Y.oa.every(v => v === 0)).toBe(true);
  });
});

describe('packaged unit fresh air as % of supply air', () => {
  it('takes each room\'s fresh air as the share of its supply air, cooled in the unit', () => {
    const st = base();
    const p = { ...st.project, sys: 'ducted', pkgOA: true, pkgOAPct: 10, fahu: true };
    const d = computeAll(p, st.rooms);
    for (const r of st.rooms) expect(d.res[r.id].oaQ).toBeCloseTo(0.1 * d.res[r.id].sa, 9);
    /* no FAHU: the fresh air load is in the units */
    expect(d.T.fahuW).toBe(0);
    for (const r of st.rooms) expect(d.res[r.id].unit).toBeCloseTo(d.res[r.id].roomS + d.res[r.id].roomL + d.res[r.id].oa, 6);
    /* capped at 12% */
    const hi = computeAll({ ...p, pkgOAPct: 30 }, st.rooms), r0 = st.rooms[0].id;
    expect(hi.res[r0].oaQ).toBeCloseTo(PKG_OA_MAX / 100 * hi.res[r0].sa, 9);
  });
  it('applies only to packaged units', () => {
    const st = base();
    const d = computeAll({ ...st.project, sys: 'vrf', pkgOA: true, pkgOAPct: 10 }, st.rooms), r0 = st.rooms[0];
    expect(d.res[r0.id].oaQ).toBeCloseTo(Number(r0.oa), 9);
  });
});


describe('fresh air system load switch for the project', () => {
  it('leaves every room\'s fresh air load out of the plant, keeping the airflow', () => {
    const st = base(), on = computeAll(st.project, st.rooms), off = computeAll({ ...st.project, faOff: true }, st.rooms);
    expect(off.T.oa).toBe(0);
    expect(off.T.fahuW).toBe(0);
    expect(off.T.oaq).toBeCloseTo(on.T.oaq, 9);
    expect(off.T.plant).toBeCloseTo((on.T.u - (st.project.fahu ? 0 : on.T.oa)) * Number(st.project.diversity) / 100, 6);
    for (const r of st.rooms) expect(off.res[r.id].faOn).toBe(false);
  });
});
