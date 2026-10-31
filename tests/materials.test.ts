import { describe, expect, it } from 'vitest';
import { MATERIALS, PRESETS, assemblyU, matOf } from '../src/engine/materials';

describe('U-value calculator', () => {
  it('applies ISO 6946 surface resistances and layer resistances', () => {
    /* 200 mm hollow block, 20 + 15 mm plaster: 1 / (0.13 + 0.035/0.72 + 0.19 + 0.04) */
    expect(assemblyU('wall', [{ m: 'plaster', t: 20 }, { m: 'hb200', t: 200 }, { m: 'plaster', t: 15 }]).U).toBeCloseTo(1 / (0.13 + 0.035 / 0.72 + 0.19 + 0.04), 6);
    /* partitions take the inside surface resistance on both sides */
    expect(assemblyU('partition', []).R).toBeCloseTo(0.26, 6);
  });

  it('has valid materials and presets', () => {
    for (const m of MATERIALS) expect((m.k ?? 0) > 0 || (m.r ?? 0) > 0).toBe(true);
    for (const p of PRESETS) for (const l of p.layers) expect(matOf(l.m), `${p.id}: ${l.m}`).toBeDefined();
  });

  it('gives typical UAE assembly U-values in the expected ranges', () => {
    const u = (id: string) => { const p = PRESETS.find(x => x.id === id)!; return assemblyU(p.kind, p.layers).U; };
    expect(u('w-hb')).toBeGreaterThan(2); expect(u('w-hb')).toBeLessThan(2.6);
    expect(u('w-hb-eps')).toBeGreaterThan(0.5); expect(u('w-hb-eps')).toBeLessThan(0.65);
    expect(u('r-inv')).toBeLessThan(0.36);
  });
});
