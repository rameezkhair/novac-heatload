/* Indoor contaminant mass balance for one room, well mixed, hour by hour:
     V dC/dt = Qoa (1 − ηoa) Cout + Qinf P Cout + G − (Qoa + Qinf + Qrec ηrec + kdep V) C
   With the inputs constant over each hour the exact solution is used:
     C(t + 1 h) = Css + (C(t) − Css) e^(−λ),   λ = (Qoa + Qinf + Qrec ηrec) / V + kdep,   Css = S / λ
   and the hourly mean is Css + (C(t) − Css)(1 − e^(−λ)) / λ.
   Airflows come from the room (fresh air, infiltration, supply air), filters from the IAQ filtration stages. */
import type { Computed } from '../calc';
import { SCHEDULES } from '../data';
import type { Project, Room } from '../types';
import { num } from '../util';
import { CONTAMINANTS, filterEff, filterOf, type ContId, type Contaminant, type Filter } from './data';

/* reference data with the project's overrides */
export function contaminants(p: Project): Contaminant[] {
  const o = p.iaq?.cont || {};
  return CONTAMINANTS.map(c => {
    const x = o[c.id] || {}, pick = (k: 'genP' | 'genA' | 'dep' | 'pen' | 'out') => x[k] !== undefined && x[k] !== '' ? num(x[k]) : c[k];
    return { ...c, genP: pick('genP'), genA: pick('genA'), dep: pick('dep'), pen: pick('pen'), out: pick('out'),
      limit: x.limit !== undefined && x.limit !== '' ? num(x.limit) : c.limit };
  });
}
export function filters(p: Project): Filter[] {
  return (['fPre', 'fFinal', 'fRec'] as const).map(k => withOverrides(p, filterOf(p.iaq?.[k] ?? DEFAULT_FILTERS[k])));
}
export const DEFAULT_FILTERS = { fPre: 'merv8', fFinal: 'merv13', fRec: 'merv8' } as const;
export function withOverrides(p: Project, f: Filter): Filter {
  const x = p.iaq?.filt?.[f.id] || {}, pick = (k: 'e1' | 'e2' | 'e3' | 'dp0' | 'dpF' | 'v') => x[k] !== undefined && x[k] !== '' ? num(x[k]) : f[k];
  return { ...f, e1: pick('e1'), e2: pick('e2'), e3: pick('e3'), dp0: pick('dp0'), dpF: pick('dpF'), v: pick('v') };
}
/* combined efficiency of filters in series */
export const series = (...e: number[]) => 1 - e.reduce((a, x) => a * (1 - x), 1);

export interface RoomAir {
  V: number; Qoa: number; Qinf: number; Qrec: number; etaOa: number; etaRec: number;
  /* people present by hour of day (0–23), and CO₂ generation per person, L/s */
  people: number[]; co2pp: number; A: number;
}
/* airflows (m³/h) and filtration of one room; FAHU: outdoor air through the FAHU filters, recirculation through the
   room unit filter; otherwise outdoor and return air mix ahead of the unit's filters */
export function roomAir(d: Computed, r: Room, c: Contaminant): RoomAir {
  const p = d.p, res = d.res[r.id], A = num(r.area), V = A * (num(r.height) || 3);
  const [pre, fin, rec] = filters(p), sch = SCHEDULES.find(s => s.id === (r.sched || '24h')) || SCHEDULES[0];
  const Qoa = num(r.oa) * 3.6, Qinf = num(r.ach) * V, sa = (res?.sa ?? 0) * 3.6;
  const fOa = series(filterEff(pre, c), filterEff(fin, c));
  const Qrec = p.fahu ? sa : Math.max(0, sa - Qoa), etaRec = p.fahu ? filterEff(rec, c) : fOa;
  /* CO₂ generation scales with the activity heat gain (130 W per person at 1.2 met) */
  const act = num(r.ps) + num(r.pl), co2pp = c.genP * (act > 0 ? act / 130 : 1);
  return { V, Qoa, Qinf, Qrec, etaOa: fOa, etaRec, people: sch.people.map(f => f * num(r.people)), co2pp, A };
}

/* hourly indoor concentration for an hourly outdoor series; returns hourly means */
export function simulate(c: Contaminant, a: RoomAir, out: ArrayLike<number>, startHour = 0, C0?: number): Float64Array {
  const n = out.length, res = new Float64Array(n);
  const lam = a.V > 0 ? (a.Qoa + a.Qinf + a.Qrec * a.etaRec) / a.V + c.dep : 0;
  let C = C0 ?? out[0];
  for (let i = 0; i < n; i++) {
    const ppl = a.people[(startHour + i) % 24];
    /* generation per hour in concentration units × m³: CO₂ L/s × 3.6 = m³/h, × 10⁶ for ppm·m³/h; others µg/h */
    const G = c.id === 'co2' ? ppl * a.co2pp * 3.6 * 1e6 : ppl * c.genP + c.genA * a.A;
    const S = (a.Qoa * (1 - a.etaOa) * out[i] + a.Qinf * c.pen * out[i] + G) / a.V;
    if (lam <= 0) { res[i] = C; continue; }
    const Css = S / lam, e = Math.exp(-lam);
    res[i] = Css + (C - Css) * (1 - e) / lam;
    C = Css + (C - Css) * e;
  }
  return res;
}

/* a repeating design day with constant outdoor concentration: thirty identical days, the last one is periodic */
export function designDay(c: Contaminant, a: RoomAir, out = c.out) {
  const r = simulate(c, a, new Array(24 * 30).fill(out), 0, out);
  return r.slice(24 * 29);
}

/* compare a series with the contaminant's criterion over its averaging time */
export function assess(c: Contaminant, x: ArrayLike<number>) {
  const n = x.length, mean = Array.from(x).reduce((a, v) => a + v, 0) / n;
  const w = c.avg === '24h' ? 24 : c.avg === '8h' ? 8 : 1;
  let worst = -Infinity, over = 0;
  for (let i = 0; i + w <= n; i += c.avg === '24h' ? 24 : 1) {
    let s = 0; for (let k = 0; k < w; k++) s += x[i + k];
    const m = s / w; if (m > worst) worst = m;
    if (c.limit != null && m > c.limit) over++;
  }
  return { mean, max: Math.max(...Array.from(x)), worst, over, ok: c.limit == null ? null : worst <= c.limit };
}

export type { ContId };
