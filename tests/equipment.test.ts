import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/engine/calc';
import { BTU_W, T3_BINS, annual, copToKwTr, eerRatio, electric, kwTrToCop, plf, recommended, requirements } from '../src/engine/equipment';
import { designPeak, electrical } from '../src/engine/hourly';
import { exampleState } from '../src/engine/project';

describe('equipment efficiency requirements', () => {
  it('has the ESMA star bands for split and window ACs at T3', () => {
    const split = requirements('split', 5);
    expect(split.map(r => +(r.cop * BTU_W).toFixed(2)).slice(0, 5)).toEqual([10.31, 9.71, 9.01, 8.31, 7.70]);
    expect(requirements('window', 5).slice(0, 5).map(r => +(r.cop * BTU_W).toFixed(2))).toEqual([9.01, 8.51, 8.01, 7.51, 6.80]);
    expect(recommended('split', 5).label).toBe('ESMA 5 stars');
  });
  it('picks the size band for ducted units, VRF and chillers', () => {
    expect(requirements('ducted', 30).find(r => r.id === 'esma')!.value).toBe('≥ 8.5 Btu/h·W');
    expect(requirements('ducted', 50).find(r => r.id === 'a901')!.value).toBe('≥ 11.0');
    expect(requirements('vrf', 300).find(r => r.id === 'esma-cspf')!.cop).toBe(4.1);
    expect(requirements('acchiller', 700).find(r => r.id === 'esma')!.cop).toBe(3.1);
    expect(requirements('wcchiller', 1200).find(r => r.id === 'esma')!.cop).toBe(5.3);
    expect(copToKwTr(requirements('wcchiller', 1200).find(r => r.id === 'a901-cf')!.cop)).toBeCloseTo(0.560, 6);
    /* centrifugal 0.560 kW/ton (COP 6.28) is stricter than ESMA COP 5.3 */
    expect(recommended('wcchiller', 1200).id).toBe('a901-cf');
    expect(kwTrToCop(0.56)).toBeCloseTo(6.28, 2);
  });
});

describe('electrical input', () => {
  it('follows the ISO 16358 temperature curve and cycling loss', () => {
    expect(eerRatio(35)).toBeCloseTo(1, 9);
    expect(eerRatio(46)).toBeCloseTo(0.859 / 1.25, 9);
    expect(eerRatio(29)).toBeCloseTo(1.077 / 0.914, 9);
    expect(plf(1)).toBe(1); expect(plf(0.5)).toBeCloseTo(1 - 0.27 * 0.5, 9);
    const q = requirements('split', 5)[0];
    /* at the T3 rating point and full load the input is load ÷ rated COP */
    expect(electric(q, 'split', 5000, 46, 5000 / 0.859)).toBeCloseTo(5000 / q.cop, 6);
  });
  it('uses the T3 reference bins and gives a seasonal COP above the T3 rating', () => {
    /* rows as printed in Table F.2 sum to 6493 h */
    expect(T3_BINS.reduce((a, b) => a + b[1], 0)).toBe(6493);
    const q = requirements('vrf', 30).find(r => r.id === 'esma-cspf')!, y = annual(q, 'vrf', 30000);
    expect(y.cspf).toBeCloseTo(4.2, 6);
    const s = requirements('split', 5)[0], ys = annual(s, 'split', 5000);
    expect(ys.cspf).toBeGreaterThan(s.cop);
  });
  it('estimates the example building on the recommended efficiency', () => {
    const st = exampleState(), d = computeAll(st.project, st.rooms), pk = designPeak(d, 'all');
    const el = electrical(d, 'all', pk.m);
    expect(el.peakKW).toBeCloseTo(pk.W / 1000, 6);
    expect(el.kWe).toHaveLength(24);
    expect(Math.max(...el.kWe)).toBeLessThanOrEqual(el.designKWe * 1.05);
    expect(el.annualKWh).toBeGreaterThan(0);
    st.project.aux = 0.3; const d2 = computeAll(st.project, st.rooms);
    expect(electrical(d2, 'all', pk.m).designKWe).toBeCloseTo(el.designKWe + pk.W / 1000 * 0.3 / 3.51685, 6);
  });
});
