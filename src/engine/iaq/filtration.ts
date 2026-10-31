/* Filter stages of the project's air systems: airflow from the ventilation calculation (outdoor air intake) and the
   room loads (supply air), filter data from the IAQ library with any manufacturer overrides. */
import type { Computed } from '../calc';
import { num } from '../util';
import { CELL_M2, CONTAMINANTS, filterEff, type Filter } from './data';
import { filters } from './contaminants';
import { vrp } from './ventilation';

export interface Stage {
  key: 'fPre' | 'fFinal' | 'fRec'; label: string; f: Filter;
  /* airflow L/s, face area m², number of 610 × 610 mm cells, actual face velocity m/s */
  Q: number; area: number; cells: number; vFace: number;
  /* clean, final and average pressure drop, Pa; fan input power at the average, kW; annual kWh */
  dp0: number; dpF: number; dpAvg: number; kW: number; kWh: number;
  /* removal efficiency by contaminant, 0–1 */
  eff: Record<string, number>;
}

export function filtration(d: Computed): { stages: Stage[]; fanEff: number; hours: number; kW: number; kWh: number } {
  const p = d.p, set = p.iaq || {}, v = vrp(d), [pre, fin, rec] = filters(p);
  const fanEff = num(set.fanEff) > 0 ? num(set.fanEff) / 100 : 0.6, hours = num(set.hours) > 0 ? num(set.hours) : 8760;
  const supply = d.rooms.reduce((a, r) => a + (d.res[r.id]?.sa ?? 0) * (d.res[r.id]?.qty ?? 1), 0);
  /* with a FAHU the outdoor air passes the FAHU filters and the room units filter recirculated air;
     without one the unit filters the mixed outdoor and return air */
  const list: [Stage['key'], string, Filter, number][] = p.fahu
    ? [['fPre', 'FAHU pre-filter (outdoor air)', pre, v.Vot], ['fFinal', 'FAHU final filter (outdoor air)', fin, v.Vot], ['fRec', 'Room units (recirculated air)', rec, supply]]
    : [['fPre', 'Unit pre-filter (mixed air)', pre, Math.max(supply, v.Vot)], ['fFinal', 'Unit final filter (mixed air)', fin, Math.max(supply, v.Vot)]];
  const stages = list.map(([key, label, f, Q]): Stage => {
    const m3 = Q / 1000, area = f.v > 0 ? m3 / f.v : 0, cells = f.id === 'none' ? 0 : Math.max(1, Math.ceil(area / CELL_M2));
    /* the clean pressure drop is rated at the design face velocity and falls about linearly below it (laminar flow
       through the media); the final pressure drop is the change-out set-point */
    const vFace = cells ? m3 / (cells * CELL_M2) : 0, dp0 = f.v > 0 ? f.dp0 * Math.min(1, vFace / f.v) : f.dp0;
    const dpAvg = (dp0 + f.dpF) / 2, kW = m3 * dpAvg / fanEff / 1000;
    return { key, label, f, Q, area, cells, vFace, dp0, dpF: f.dpF, dpAvg, kW, kWh: kW * hours,
      eff: Object.fromEntries(CONTAMINANTS.map(c => [c.id, filterEff(f, c)])) };
  });
  return { stages, fanEff, hours, kW: stages.reduce((a, s) => a + s.kW, 0), kWh: stages.reduce((a, s) => a + s.kWh, 0) };
}
