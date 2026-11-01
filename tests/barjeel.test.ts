import { describe, expect, it } from 'vitest';
import { exampleState, setLocation, applyCodeset } from '../src/engine/project';
import { computeAll } from '../src/engine/calc';
import { allChecks, projectChecks } from '../src/engine/checks';
import { BTU_W, recommended, requirements } from '../src/engine/equipment';

const run = (cbasis?: string) => {
  const s = exampleState(), p = s.project;
  setLocation(p, 'rak');
  if (cbasis) applyCodeset(p, cbasis);
  const d = computeAll(p, s.rooms);
  const { marks, limits } = projectChecks(p, d.T, s.rooms);
  return { p, rows: allChecks(d, marks, limits), limits };
};

describe('Barjeel V1.3 (Ras Al Khaimah)', () => {
  it('applies Barjeel envelope, indoor and outdoor conditions', () => {
    const { p, limits } = run();
    expect(p.cbasis).toBe('barjeel');
    expect(p.src.indoor).toBe('barjeel');
    expect(p.src.out).toBe('barjeel');
    expect(limits).toMatchObject({ uWall: 0.48, uRoof: 0.30, uGlass: 2.2, shgc: 0.30, uSky: 1.8, shgcSky: 0.30 });
  });
  it('uses the 1.8 centre-pane glazing limit for the Fundamental tier', () => {
    expect(run('barjeel-f').limits.uGlass).toBe(1.8);
  });
  it('replaces the DBC clauses Barjeel covers', () => {
    const c = run().rows.map(r => r[1]);
    expect(c).toContain('Barjeel 401.02');
    expect(c).toContain('Barjeel 401.06');
    expect(c).not.toContain('DBC H.4.9.1');
    expect(c).not.toContain('DBC Table H.2');
  });
});

describe('Barjeel V1.3 equipment efficiency (Ras Al Khaimah)', () => {
  const eer = (q: { cop: number }) => +(q.cop * BTU_W).toFixed(2);
  it('lists Barjeel minimums only for RAK projects', () => {
    expect(requirements('ducted', 30).some(r => r.src === 'Barjeel V1.3')).toBe(false);
    expect(eer(requirements('ducted', 30, 'rak').find(r => r.id === 'barjeel')!)).toBe(8.8);
    expect(eer(requirements('ducted', 300, 'rak').find(r => r.id === 'barjeel')!)).toBe(7.95);
    expect(eer(requirements('split', 5, 'rak').find(r => r.id === 'barjeel')!)).toBe(8.31);
    expect(requirements('vrf', 30, 'rak').find(r => r.id === 'barjeel-cspf')!.value).toBe('≥ 14.84 Btu/h·W');
    expect(requirements('wcchiller', 600, 'rak').find(r => r.id === 'barjeel-cf')!.cop).toBe(6.89);
  });
  it('recommends the stricter Barjeel value for ducted units, and keeps ESMA 5 stars for splits', () => {
    expect(recommended('ducted', 30, 'rak').id).toBe('barjeel');
    expect(recommended('split', 5, 'rak').label).toBe('ESMA 5 stars');
  });
});
