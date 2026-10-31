import { describe, expect, it } from 'vitest';
import { levelsOf, squarify } from '../src/components/LoadPlan';
import { computeAll } from '../src/engine/calc';
import { exampleState } from '../src/engine/project';

describe('load plan', () => {
  it('gives every block its exact share of the floor, inside the plan, with no overlaps', () => {
    const v = [120, 24, 40, 30, 20, 20, 7.5];
    const cells = squarify(v.map((x, i) => ({ v: x, t: i })), { x: 0, y: 0, w: 640, h: 380 });
    const total = v.reduce((a, x) => a + x, 0);
    cells.forEach(c => {
      expect(c.w * c.h).toBeCloseTo(v[c.t] / total * 640 * 380, 6);
      expect(c.x).toBeGreaterThanOrEqual(-1e-9); expect(c.y).toBeGreaterThanOrEqual(-1e-9);
      expect(c.x + c.w).toBeLessThanOrEqual(640 + 1e-6); expect(c.y + c.h).toBeLessThanOrEqual(380 + 1e-6);
    });
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(ox > 1e-6 && oy > 1e-6).toBe(false);
    }
    /* squarified: no sliver thinner than 1 : 5 for these areas */
    cells.forEach(c => expect(Math.max(c.w / c.h, c.h / c.w)).toBeLessThan(5));
  });

  it('groups rooms by floor with totals that add up to the building', () => {
    const s = exampleState(); s.project.floors!.push({ id: 'f2', name: 'Second floor', n: 3 }); s.rooms[0].level = 'f2';
    const d = computeAll(s.project, s.rooms), L = levelsOf(d);
    expect(L.map(l => [l.name, l.n, l.rooms.length])).toEqual([['First floor', 1, 4], ['Second floor', 3, 1]]);
    expect(L.reduce((a, l) => a + l.W, 0)).toBeCloseTo(d.T.u, 6);
    expect(L.reduce((a, l) => a + l.A, 0)).toBeCloseTo(d.T.a, 6);
  });
});
