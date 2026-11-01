/* Hourly heat balance loads for the whole building or one room, and the electrical input of the chosen cooling system. */
import type { Computed } from './calc';
import { annual, copAt, capRatio, electric, recommended, requirements, SYSTEMS, type Req, type SysId } from './equipment';
import { climateOf, type MonthLoads } from './hbm/room';
import type { Project } from './types';
import { num } from './util';

type C = MonthLoads['c'];
/* stacked series in fixed order; the last is latent */
export const SERIES: [string, (c: C, i: number) => number][] = [
  ['Walls and roof', (c, i) => c.walls[i] + c.roof[i]],
  ['Glass, solar', (c, i) => c.gSol[i]],
  ['Glass, conduction', (c, i) => c.gCond[i]],
  ['Partitions and floors', (c, i) => c.partW[i] + c.partC[i] + c.partF[i]],
  ['People, sensible', (c, i) => c.pS[i]],
  ['Lighting and equipment', (c, i) => c.light[i] + c.equip[i]],
  ['Infiltration, sensible', (c, i) => c.infS[i]],
];
export const LABELS = [...SERIES.map(s => s[0]), 'Latent (people, infiltration)'];

export interface Hour { v: number[]; margin: number; total: number; To: number }
/* hourly loads of one month for the whole building (rooms × quantity) or one room, W */
export function hours(d: Computed, scope: string, m: number): Hour[] {
  const p = d.p, fS = num(p.sfS) / 100, fL = num(p.sfL) / 100, To = climateOf(p, d.e).days[m].To;
  const rooms = scope === 'all' ? d.rooms : d.rooms.filter(r => r.id === scope);
  return To.map((t, i) => {
    const v = LABELS.map(() => 0);
    rooms.forEach(r => {
      const c = d.res[r.id], ml = c.hb?.[m], q = scope === 'all' ? c.qty : 1; if (!ml) return;
      SERIES.forEach(([, f], k) => { v[k] += f(ml.c, i) * q; });
      v[7] += ml.lat[i] * q;
    });
    const sens = v.slice(0, 7).reduce((a, x) => a + x, 0), margin = sens * fS + v[7] * fL;
    return { v, margin, total: sens + v[7] + margin, To: t };
  });
}
/* design peak of a scope: month, hour index and load (W) */
export function designPeak(d: Computed, scope: string) {
  let best = { m: 0, i: 0, W: -Infinity, To: 0 };
  for (let m = 0; m < 12; m++) hours(d, scope, m).forEach((h, i) => { if (h.total > best.W) best = { m, i, W: h.total, To: h.To }; });
  return best;
}

/* the efficiency used for the electrical estimate: a listed requirement, the recommended one, or a custom full-load COP at 35 °C */
export function designReq(p: Project, kW: number): Req {
  const sys = (p.sys || 'ducted') as SysId;
  if (p.effOpt === 'custom' && num(p.effCop) > 0) return { id: 'custom', src: 'ESMA', label: 'Custom (manufacturer data)', cop: num(p.effCop), kind: 'full', t: 35, metric: 'COP', value: `${num(p.effCop)} W/W`, cond: 'Full load at 35 °C outdoor', ref: 'Project value' };
  return requirements(sys, kW, p.location).find(r => r.id === p.effOpt) || recommended(sys, kW, p.location);
}

/* electrical input by hour (kW) for a scope and month, with the plant sized on the scope's design peak */
export function electrical(d: Computed, scope: string, m: number) {
  const p = d.p, sys = (p.sys || 'ducted') as SysId, s = SYSTEMS.find(x => x.id === sys)!;
  const pk = designPeak(d, scope), kW = Math.max(0, pk.W) / 1000, q = designReq(p, kW);
  /* installed capacity at 35 °C so that it meets the design peak at the design-hour outdoor temperature */
  const cap35 = Math.max(0, pk.W) / (s.air ? capRatio(pk.To) : 1);
  const aux = num(p.aux) / 3.51685; /* kW electrical per kW cooling */
  const H = hours(d, scope, m);
  const kWe = H.map(h => (electric(q, sys, Math.max(0, h.total), h.To, cap35) + Math.max(0, h.total) * aux) / 1000);
  const yr = annual(q, sys, Math.max(0, pk.W));
  return {
    q, sys, peakKW: kW, kWe, dayKWh: kWe.reduce((a, x) => a + x, 0),
    designKWe: (Math.max(0, pk.W) / copAt(q, pk.To, s.air) + Math.max(0, pk.W) * aux) / 1000, designTo: pk.To,
    annualKWh: yr.elec + yr.cool * aux, annualCool: yr.cool, binHours: yr.hours, cspf: yr.elec > 0 ? yr.cool / (yr.elec + yr.cool * aux) : 0,
    /* ESMA label: rated input power × 2000 h (UAE.S 5010-1 cl. 8), input at the rating condition */
    esmaKWh: kW / (q.kind === 'full' ? q.cop : copAt(q, 46, s.air)) * 2000,
  };
}
