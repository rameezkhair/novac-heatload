import { describe, expect, it } from 'vitest';
import { exampleState, setLocation, ROOMOPTS } from '../src/engine/project';
import { computeAll } from '../src/engine/calc';
import { allChecks, projectChecks } from '../src/engine/checks';
import { LOC, OUT_OPTS, VENT_OPTS, typeOf } from '../src/engine/data';

const run = (loc: string) => {
  const s = exampleState(), p = s.project;
  setLocation(p, loc);
  const d = computeAll(p, s.rooms);
  const { marks, limits } = projectChecks(p, d.T, s.rooms);
  return { s, p, rows: allChecks(d, marks, limits) };
};

describe('DoE Cooling Load Manual (May 2026), Abu Dhabi and Al Ain', () => {
  it('uses the Table 1 and Table 2 design conditions', () => {
    expect(OUT_OPTS.find(o => o.id === 'doe-ad')).toMatchObject({ db: 46.1, wb: 29.4, src: 'DoE CLM 2026 Table 1' });
    expect(OUT_OPTS.find(o => o.id === 'doe-aa')).toMatchObject({ db: 48.8, wb: 28.3 });
    expect(VENT_OPTS.find(o => o.id === 'doe-ad')).toMatchObject({ db: 35.3, wb: 30.6, src: 'DoE CLM 2026 Table 2' });
    expect(VENT_OPTS.find(o => o.id === 'doe-aa')).toMatchObject({ db: 35.8, wb: 28.8 });
    expect(LOC.abudhabi).toMatchObject({ toDB: 46.1, toWB: 29.4, elev: 27 });
    expect(LOC.alain).toMatchObject({ toDB: 48.8, toWB: 28.3, elev: 265 });
  });
  it('adds the manual checks for Abu Dhabi projects only', () => {
    const c = run('abudhabi').rows.map(r => r[1]);
    ['DoE CLM §7.1', 'DoE CLM §5.3', 'DoE CLM §7.2', 'DoE CLM §1'].forEach(x => expect(c).toContain(x));
    expect(run('dubai').rows.some(r => r[1].startsWith('DoE CLM §7'))).toBe(false);
  });
  it('offers the §5.3 untested-envelope infiltration rate', () => {
    const { s } = run('abudhabi'), r = s.rooms.find(x => Object.values(x.walls).some(w => Number(w?.w) > 0))!;
    const o = ROOMOPTS.ach(r, typeOf(r.type), 1).find(x => x.id === 'clm75');
    expect(o && o.v).toBeGreaterThan(0);
  });
});

describe('Emirate references', () => {
  it('keeps Sharjah on regional practice and RAK on Barjeel', () => {
    expect(LOC.sharjah.ref).toBe('DBC Table H.1 (regional practice)');
    expect(LOC.rak.ref).toBe('Barjeel V1.3 301.02 / 401.02');
  });
});
