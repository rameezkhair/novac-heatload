/* ASHRAE 62.1-2022 Ventilation Rate Procedure for the project's rooms. Room people, area, height, quantity, schedule,
   outdoor air basis and supply airflow all come from the Spaces step; Ez from the envelope step; the system type
   from the FAHU setting. The result can be written back to each room's fresh air, which drives every load. */
import type { Computed } from '../calc';
import { A170, SCHEDULES, VENT } from '../data';
import { ezOf } from '../project';
import type { IaqSettings, Room } from '../types';
import { num } from '../util';
import { evSimplified, VRP_REF } from './data';

export type SysType = 'doas' | 'single' | 'multi';
export interface ZoneRow {
  id: string; name: string; qty: number;
  /* the room's outdoor air basis: a 62.1 Table 6-1 category, 62.2 dwelling, 170 healthcare, or custom */
  basis: string; method: '62.1' | '62.2' | '170' | 'custom';
  Rp: number; Ra: number; Pz: number; Az: number; Ez: number;
  /* L/s per unit: breathing zone, zone outdoor air, primary (supply) airflow, outdoor air fraction */
  Vbz: number; Voz: number; Vpz: number; Zpz: number; Evz?: number;
  /* the room's current fresh air, and what the system needs it to be (with Ev and enhancement), L/s per unit */
  current: number; required: number;
  exh: number;
}
export interface Vrp {
  sys: SysType; sysWhy: string; method: IaqSettings['ev'];
  zones: ZoneRow[];
  /* system: peak and summed population, occupant diversity, uncorrected outdoor air, ventilation efficiency, intake */
  Ps: number; sumPz: number; D: number; Vou: number; Vps: number; Xs: number; Ev: number; Vot: number;
  sumVoz: number; enh: number;
  /* air balance, L/s */
  exhaust: number; current: number; makeup: number; net: number;
  ref: string;
}

/* 62.1 Table 6-1 row behind a room's fresh-air basis, or the other standard it uses */
function basisOf(r: Room): Pick<ZoneRow, 'basis' | 'method' | 'Rp' | 'Ra'> {
  /* an applied IAQ result is custom fresh air that remembers its category */
  const id = r.src.oa === 'custom' && r.src.oaBasis ? r.src.oaBasis : r.src.oa;
  const v = VENT.find(x => x.id === id);
  if (v) return { basis: `${v.label} (Table 6-1)`, method: '62.1', Rp: v.rp, Ra: v.ra };
  if (id === 'a622') return { basis: 'Dwelling unit (62.2-2019)', method: '62.2', Rp: 3.5, Ra: 0.15 };
  if (id?.startsWith('a170-')) { const a = A170.find(x => 'a170-' + x[0] === id); return { basis: `${a?.[1] ?? 'Healthcare'} (170-2021)`, method: '170', Rp: 0, Ra: 0 }; }
  return { basis: 'Custom fresh air', method: 'custom', Rp: 0, Ra: 0 };
}

export function systemType(d: Computed): { sys: SysType; why: string } {
  const set = d.p.iaq?.sys || 'auto';
  if (set !== 'auto') return { sys: set, why: 'Selected in the IAQ setup' };
  if (d.p.fahu) return { sys: 'doas', why: 'FAHU supplies 100% outdoor air to the rooms (dedicated outdoor air system)' };
  const units = d.rooms.reduce((a, r) => a + (d.res[r.id]?.qty ?? 1), 0);
  if (units <= 1) return { sys: 'single', why: 'One zone served by one unit' };
  return { sys: 'multi', why: 'Several zones served by recirculating units without a FAHU' };
}

export function vrp(d: Computed): Vrp {
  const p = d.p, set = p.iaq || {}, Ez = ezOf(p), enh = Math.max(0, num(set.enh)) / 100;
  const { sys, why } = systemType(d), method = set.ev || 'simplified';
  const zones: ZoneRow[] = d.rooms.map(r => {
    const c = d.res[r.id], b = basisOf(r), Pz = num(r.people), Az = num(r.area), H = num(r.height) || 3;
    let Vbz: number, Voz: number;
    if (b.method === '62.1') { Vbz = b.Rp * Pz + b.Ra * Az; Voz = Vbz / Ez; }
    else if (b.method === '62.2') { Vbz = 0.15 * Az + 3.5 * Pz; Voz = Vbz; }
    else if (b.method === '170') { const a = A170.find(x => 'a170-' + x[0] === r.src.oa)!; Vbz = a[2] * Az * H / 3.6; Voz = Vbz; }
    else { Vbz = num(r.oa); Voz = Vbz; }
    const Vpz = Math.max(c?.sa ?? 0, Voz);
    return { id: r.id, name: r.name || 'Untitled', qty: c?.qty ?? 1, ...b, Pz, Az, Ez: b.method === '62.1' ? Ez : 1, Vbz, Voz, Vpz, Zpz: Vpz > 0 ? Voz / Vpz : 0,
      current: num(r.oa), required: 0, exh: Math.max(0, num(r.exh)) };
  });
  const sumPz = zones.reduce((a, z) => a + z.Pz * z.qty, 0), sumVoz = zones.reduce((a, z) => a + z.Voz * z.qty, 0);
  /* peak coincident population from the room schedules */
  let Ps = 0;
  for (let h = 0; h < 24; h++) Ps = Math.max(Ps, d.rooms.reduce((a, r, i) => a + zones[i].Pz * zones[i].qty * (SCHEDULES.find(s => s.id === (r.sched || '24h')) || SCHEDULES[0]).people[h], 0));
  const D = sumPz > 0 ? Math.min(1, Ps / sumPz) : 1;
  /* uncorrected outdoor air: people part with diversity, area part, and other-standard rooms at their full rate */
  const Vou = zones.reduce((a, z) => a + (z.method === '62.1' ? (D * z.Rp * z.Pz + z.Ra * z.Az) : z.Voz) * z.qty, 0);
  const Vps = zones.reduce((a, z) => a + z.Vpz * z.qty, 0), Xs = Vps > 0 ? Vou / Vps : 0;
  let Ev = 1, Vot: number;
  if (sys === 'multi') {
    if (method === 'appendix') { zones.forEach(z => { z.Evz = 1 + Xs - z.Zpz; }); Ev = Math.max(0.1, Math.min(...zones.map(z => z.Evz!))); }
    else Ev = evSimplified(D);
    Vot = Vou / Ev;
  } else Vot = sumVoz;
  Vot *= 1 + enh;
  /* each room's share of the system intake, per unit */
  const f = sumVoz > 0 ? Vot / sumVoz : 1;
  zones.forEach(z => { z.required = z.Voz * f; });
  const exhaust = zones.reduce((a, z) => a + z.exh * z.qty, 0), current = zones.reduce((a, z) => a + z.current * z.qty, 0);
  return { sys, sysWhy: why, method, zones, Ps, sumPz, D, Vou, Vps, Xs, Ev, Vot, sumVoz, enh: enh * 100,
    exhaust, current, makeup: Math.max(0, exhaust - Vot), net: Vot - exhaust, ref: VRP_REF };
}
