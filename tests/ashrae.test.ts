import { describe, expect, it } from 'vitest';
import { ASSEMBLY_REFERENCES, getRequirement, insulationThickness, rToSI, type AssemblySurface } from '../src/engine/assemblyReference';
import { LIB, LPD_BAM, TYPES, limitsFor } from '../src/engine/data';

const SURFACES: AssemblySurface[] = ['Roof', 'Above-grade wall', 'Below-grade wall', 'Floor', 'Slab-on-grade floor', 'Opaque door', 'Vertical fenestration', 'Skylight'];
const find = (z: number, s: AssemblySurface, a: string) => ASSEMBLY_REFERENCES.find(r => r[0] === z && r[1] === s && r[2] === a)!;

describe('ASHRAE 90.1-2022 envelope tables', () => {
  it('covers every element in zones 0 to 8', () => {
    for (let z = 0; z <= 8; z++) for (const s of SURFACES) expect(ASSEMBLY_REFERENCES.some(r => r[0] === z && r[1] === s), `zone ${z} ${s}`).toBe(true);
  });

  it('never makes a semiheated limit stricter than the nonresidential one', () => {
    for (const r of ASSEMBLY_REFERENCES) expect(r[5][0], `${r[0]} ${r[1]} ${r[2]}`).toBeGreaterThanOrEqual(r[3][0]);
  });

  it('converts zone 0 to the SI limits used for compliance', () => {
    const L = limitsFor('a901', 30, 0);
    expect(getRequirement(find(0, 'Above-grade wall', 'Steel-framed'), 'nonresidential').max).toBeCloseTo(L.uWall, 2);
    expect(getRequirement(find(0, 'Roof', 'Insulation entirely above deck'), 'nonresidential').max).toBeCloseTo(L.uRoof, 2);
    expect(getRequirement(find(0, 'Vertical fenestration', 'Fixed'), 'nonresidential').max).toBeCloseTo(L.uGlass, 2);
    expect(getRequirement(find(0, 'Vertical fenestration', 'Fixed'), 'nonresidential').shgc).toBe(L.shgc);
    expect(getRequirement(find(0, 'Skylight', 'All types, 0–3% of roof'), 'nonresidential').max).toBeCloseTo(L.uSky, 2);
    expect(getRequirement(find(0, 'Above-grade wall', 'Mass'), 'nonresidential').max).toBeCloseTo(LIB.uWall.find(o => o.id === 'a901-mass')!.v, 3);
  });

  it('converts R-values, depths and F-factors to SI', () => {
    expect(rToSI('R-10 + R-19 FC')).toBe('R-1.8 + R-3.3 FC');
    expect(rToSI('R-7.5 for 12 in.')).toBe('R-1.3 for 300 mm');
    const slab = getRequirement(find(4, 'Slab-on-grade floor', 'Heated'), 'nonresidential');
    expect(slab.unit).toBe('W/m·K');
    expect(slab.max).toBeCloseTo(0.843 * 1.730735, 3);
    expect(insulationThickness('R-0 + R-1.7 ci', 0.034)).toBe('60 mm ci');
    expect(insulationThickness('R-2.3 + R-0.7 ci or R-3.5', 0.034)).toBe('80 mm + 25 mm ci or 120 mm');
  });
});

describe('ASHRAE 90.1-2022 lighting', () => {
  it('has the full Building Area Method table with 2022 values', () => {
    expect(LPD_BAM).toHaveLength(32);
    expect(LPD_BAM.find(b => b[0] === 'office')![2]).toBe(0.62);
    expect(LPD_BAM.find(b => b[0] === 'retail')![2]).toBe(0.78);
  });
  it('gives allowances to the common UAE room types', () => {
    expect(TYPES.retail.a901).toBe(9.1);
    expect(TYPES.kitchen.a901).toBe(12.8);
    expect(TYPES.retail.lightDef).toBe('typ');
  });
});
