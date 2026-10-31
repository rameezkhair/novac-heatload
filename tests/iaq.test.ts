/* Indoor air quality engines checked against hand calculations: ASHRAE 62.1 Ventilation Rate Procedure,
   the analytical steady state and decay of the well-mixed mass balance, and filter sizing. */
import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/engine/calc';
import { CONTAMINANTS, FILTERS, evSimplified, filterEff } from '../src/engine/iaq/data';
import { designDay, roomAir, series, simulate } from '../src/engine/iaq/contaminants';
import { filtration } from '../src/engine/iaq/filtration';
import { vrp } from '../src/engine/iaq/ventilation';
import { exampleState } from '../src/engine/project';
import type { AppState } from '../src/engine/types';

/* the example project trimmed to the rooms given, each an office or conference room, 24 h, no infiltration */
function project(rooms: { type: 'office' | 'conference'; people: number; area: number; oa?: number }[], fahu: boolean, iaq: AppState['project']['iaq'] = {}) {
  const s = exampleState(), base = s.rooms[0];
  s.project.fahu = fahu; s.project.ez = 1; s.project.iaq = iaq;
  s.rooms = rooms.map((x, i) => ({ ...structuredClone(base), id: 'r' + i, name: 'Room ' + (i + 1), qty: 1, people: x.people, area: x.area, height: 3, ach: 0,
    oa: x.oa ?? 0, src: { ...base.src, oa: x.type }, sched: '24h' }));
  return computeAll(s.project, s.rooms);
}
const C = (id: string) => CONTAMINANTS.find(c => c.id === id)!;

describe('ASHRAE 62.1 Ventilation Rate Procedure', () => {
  it('gives the breathing-zone and zone outdoor air of each room, and a 100% outdoor air intake as their sum', () => {
    /* office: Rp 2.5 L/s·person, Ra 0.3 L/s·m² (Table 6-1); 10 people, 100 m²: Vbz = 25 + 30 = 55 L/s */
    const d = project([{ type: 'office', people: 10, area: 100 }, { type: 'conference', people: 20, area: 40 }], true);
    const v = vrp(d);
    expect(v.sys).toBe('doas');
    expect(v.zones[0].Vbz).toBeCloseTo(55, 9); expect(v.zones[0].Voz).toBeCloseTo(55, 9);
    /* conference: 2.5 × 20 + 0.3 × 40 = 62 L/s */
    expect(v.zones[1].Voz).toBeCloseTo(62, 9);
    expect(v.Vot).toBeCloseTo(117, 9);
    /* Ez 0.8 (makeup supply) raises every Voz by 1 / 0.8 */
    const d2 = project([{ type: 'office', people: 10, area: 100 }], true); d2.p.ez = 0.8;
    expect(vrp(d2).zones[0].Voz).toBeCloseTo(55 / 0.8, 9);
  });

  it('applies the simplified system ventilation efficiency to a multiple-zone recirculating system', () => {
    expect(evSimplified(0.5)).toBeCloseTo(0.88 * 0.5 + 0.22, 12);
    expect(evSimplified(0.6)).toBe(0.75); expect(evSimplified(1)).toBe(0.75);
    const d = project([{ type: 'office', people: 10, area: 100 }, { type: 'conference', people: 20, area: 40 }], false);
    const v = vrp(d);
    expect(v.sys).toBe('multi');
    /* both rooms occupied all day: D = 1, Vou = 1 × (25 + 50) + (30 + 12) = 117, Ev = 0.75, Vot = 156 */
    expect(v.D).toBe(1); expect(v.Vou).toBeCloseTo(117, 9); expect(v.Ev).toBe(0.75); expect(v.Vot).toBeCloseTo(156, 9);
    /* the rooms' required fresh air adds up to the intake */
    expect(v.zones.reduce((a, z) => a + z.required, 0)).toBeCloseTo(156, 9);
  });

  it('takes the lowest zone efficiency with Normative Appendix A', () => {
    const d = project([{ type: 'office', people: 10, area: 100 }, { type: 'conference', people: 20, area: 40 }], false, { ev: 'appendix' });
    const v = vrp(d), Xs = v.Vou / v.Vps;
    v.zones.forEach(z => expect(z.Evz).toBeCloseTo(1 + Xs - z.Voz / z.Vpz, 9));
    expect(v.Ev).toBeCloseTo(Math.min(...v.zones.map(z => z.Evz!)), 12);
    expect(v.Vot).toBeCloseTo(v.Vou / v.Ev, 9);
  });

  it('adds enhanced ventilation and balances exhaust against the intake', () => {
    const d = project([{ type: 'office', people: 10, area: 100 }], true, { enh: 30 });
    d.rooms[0].exh = 100;
    const v = vrp(d);
    expect(v.Vot).toBeCloseTo(55 * 1.3, 9);
    expect(v.makeup).toBeCloseTo(100 - 71.5, 9); expect(v.net).toBeCloseTo(71.5 - 100, 9);
  });
});

describe('contaminant mass balance', () => {
  it('reaches the analytical steady state for CO₂ with constant occupancy', () => {
    const d = project([{ type: 'office', people: 10, area: 100, oa: 100 }], true), r = d.rooms[0], c = C('co2');
    const a = roomAir(d, r, c), day = designDay(c, a);
    /* ΔC = G / Q: 10 people × generation (L/s) / 100 L/s, in ppm */
    const rise = 10 * a.co2pp / 100 * 1e6;
    day.forEach(x => expect(x).toBeCloseTo(420 + rise, 6));
    /* about 0.0052 L/s per person at office activity: roughly 520 ppm above outdoors at 10 L/s per person */
    expect(rise).toBeGreaterThan(450); expect(rise).toBeLessThan(600);
  });

  it('reaches the steady state with filtration and deposition for PM2.5', () => {
    const d = project([{ type: 'office', people: 10, area: 100, oa: 100 }], true, { fPre: 'merv8', fFinal: 'merv13', fRec: 'merv8' });
    const r = d.rooms[0], c = C('pm25'), a = roomAir(d, r, c);
    const day = designDay(c, a, 35);
    const etaOa = series(filterEff(FILTERS.find(f => f.id === 'merv8')!, c), filterEff(FILTERS.find(f => f.id === 'merv13')!, c));
    expect(a.etaOa).toBeCloseTo(etaOa, 12);
    /* C = Qoa (1 − ηoa) Cout / (Qoa + Qrec ηrec + k V) */
    const Css = a.Qoa * (1 - a.etaOa) * 35 / (a.Qoa + a.Qrec * a.etaRec + c.dep * a.V);
    day.forEach(x => expect(x).toBeCloseTo(Css, 6));
    expect(Css).toBeLessThan(35);
  });

  it('decays exponentially with no sources, matching e^(−λt)', () => {
    const d = project([{ type: 'office', people: 0, area: 100, oa: 100 }], true), c = C('co2');
    const a = { ...roomAir(d, d.rooms[0], c), people: new Array(24).fill(0) };
    const lam = a.Qoa / a.V;
    /* hourly mean of an exponential decay from 1000 ppm towards 0 outdoors */
    const x = simulate(c, a, [0, 0], 0, 1000);
    expect(x[0]).toBeCloseTo(1000 * (1 - Math.exp(-lam)) / lam, 9);
    expect(x[1]).toBeCloseTo(1000 * Math.exp(-lam) * (1 - Math.exp(-lam)) / lam, 9);
  });
});

describe('filtration', () => {
  it('uses the 52.2 composite efficiencies and the assumed size split', () => {
    const m13 = FILTERS.find(f => f.id === 'merv13')!;
    expect(filterEff(m13, C('pm1'))).toBeCloseTo(0.50, 12);
    expect(filterEff(m13, C('pm25'))).toBeCloseTo(0.65 * 0.50 + 0.35 * 0.85, 12);
    expect(filterEff(m13, C('pm10'))).toBeCloseTo(0.35 * 0.50 + 0.25 * 0.85 + 0.40 * 0.90, 12);
    expect(filterEff(FILTERS.find(f => f.id === 'hepa')!, C('pm25'))).toBeCloseTo(0.9997, 6);
    expect(filterEff(FILTERS.find(f => f.id === 'uvgi')!, C('pm25'))).toBe(0);
  });

  it('sizes filter cells, face velocity, pressure drop and fan power', () => {
    const d = project([{ type: 'office', people: 10, area: 100 }], true, { fPre: 'merv8', fFinal: 'merv13', fRec: 'merv8', fanEff: 60, hours: 4000 });
    const f = filtration(d), s = f.stages.find(x => x.key === 'fFinal')!;
    const m3 = s.Q / 1000, cells = Math.ceil(m3 / 2.5 / (0.61 * 0.61)), v = m3 / (cells * 0.61 * 0.61);
    expect(s.Q).toBeCloseTo(55, 9);
    expect(s.cells).toBe(cells); expect(s.vFace).toBeCloseTo(v, 9);
    const dp0 = 100 * v / 2.5, avg = (dp0 + 250) / 2;
    expect(s.dpAvg).toBeCloseTo(avg, 9);
    expect(s.kW).toBeCloseTo(m3 * avg / 0.6 / 1000, 12);
    expect(s.kWh).toBeCloseTo(s.kW * 4000, 9);
  });

  it('lets manufacturer data override the library values', () => {
    const d = project([{ type: 'office', people: 10, area: 100 }], true, { fFinal: 'merv13', filt: { merv13: { e1: 70, dp0: 80 } } });
    const s = filtration(d).stages.find(x => x.key === 'fFinal')!;
    expect(s.f.e1).toBe(70); expect(s.eff.pm1).toBeCloseTo(0.7, 12);
  });
});

describe('applying the ventilation result', () => {
  it('keeps the room category, so applying again changes nothing', () => {
    const d = project([{ type: 'office', people: 10, area: 100 }], true, { enh: 30 }), r = d.rooms[0];
    const z = vrp(d).zones[0];
    /* what the Apply button writes */
    r.src.oaBasis = r.src.oa; r.oa = Math.round(z.required * 10) / 10; r.src.oa = 'custom';
    const again = vrp(computeAll(d.p, d.rooms)).zones[0];
    expect(again.basis).toContain('Table 6-1');
    expect(again.required).toBeCloseTo(z.required, 9);
    expect(again.current).toBeCloseTo(71.5, 9);
  });
});
