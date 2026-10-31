/* Heat balance loads for one room: builds the room's surfaces from the Spaces inputs, then runs the
   design day of every month and returns hourly load components. */
import { ADJ, DRF, ORIENTS, SCHEDULES } from '../data';
import { stationOf, type Station } from '../climate';
import { dpOf } from '../psychro';
import { partU, pxU, wallU } from '../project';
import type { Num, Orient, Project, Room } from '../types';
import { num } from '../util';
import { DEFAULT_LAYERS, fitU, glassSlabs, groundSlabs, halfSlabs, withCarpet, withCeiling, type Slab } from './construction';
import { H, apply, dft, extForcing, glassGain, idft, respond, skyTemp, sunDay, type DayClimate, type Surface } from './heatBalance';

export const AZ: Record<Orient, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
/* far-side air film of a construction next to another space, ISO 6946 */
const FILM: Slab = { k: 1, rc: 0, L: 0.13 };
const uOf = (v: Num | undefined, def: Num) => v !== '' && v != null && isFinite(Number(v)) ? num(v) : num(def);

export interface Climate { st: Station; hot: number; days: DayClimate[] }
interface EnvLike { To: number; Wo: number; P: number }
const cache = new WeakMap<Project, Climate>();
/* Monthly design days. The hottest month keeps the project's design dry bulb and daily range (code values);
   other months follow the station's ASHRAE 0.4% monthly design dry bulb and coincident daily range. */
export function climateOf(p: Project, e: EnvLike): Climate {
  const hit = cache.get(p); if (hit) return hit;
  const st = stationOf(p.location), hot = st.db.indexOf(Math.max(...st.db));
  const Tdp = dpOf(e.Wo, e.P);
  const days = st.db.map((db, m) => {
    const peak = e.To - (st.db[hot] - db), dr = num(p.dr) * st.dbr[m] / st.dbr[hot];
    const To = DRF.map(f => peak - f * dr);
    return { To, Tsky: To.map(t => skyTemp(t, Tdp)), sun: sunDay(st, m) };
  });
  const c = { st, hot, days }; cache.set(p, c); return c;
}

/* adjacent space temperature by hour; spaces that follow the outdoor temperature use the hourly profile */
function adjSeries(p: Project, id: string, custom: Num, To: number[]): number[] {
  const a = ADJ.find(x => x[0] === id) || ADJ.find(x => x[0] === 'project')!, Ti = num(p.tiDB);
  if (a[0] === 'custom') return To.map(() => num(custom));
  if (a[0] === 'cond2') return To.map(() => custom !== '' && custom != null ? num(custom) : Ti + 2);
  const fn = a[2];
  if (!fn) return To.map(() => num(p.tAdj));
  return To.map(t => fn(t, Ti));
}

export function roomSurfaces(p: Project, r: Room, cl: Climate): Surface[] {
  const S: Surface[] = [], A = num(r.area), shade = num(p.shade);
  const push = (s: Surface) => { if (s.A > 1e-6) S.push(s); };
  const typeLayers = (list: Project['wallTypes'], id?: string) => id ? list.find(t => t.id === id)?.layers : undefined;
  const bound = (adj: string, t: Num) => (m: number) => adjSeries(p, adj, t, cl.days[m].To);
  const ceil = (kind: 'roof' | 'ceiling', layers?: Project['roofLayers']) => p.ceil === 'none' ? layers : withCeiling(kind, layers);
  const flr = p.floorFin === 'carpet' ? withCarpet(DEFAULT_LAYERS.floor.layers) : undefined;
  let extGross = 0;
  for (const o of ORIENTS) {
    const w = num(r.walls[o]?.w), g = num(r.walls[o]?.g), t = r.walls[o]?.t; extGross += Math.max(w, g);
    push({ group: 'walls', A: Math.max(0, w - g), az: AZ[o], tilt: 90, slabs: fitU('wall', num(wallU(p, t)), typeLayers(p.wallTypes, t)), hci: H.wall, ext: true, alpha: num(p.aWall) });
    push({ group: 'gCond', A: g, az: AZ[o], tilt: 90, slabs: glassSlabs(num(p.uGlass)), hci: H.wall, ext: true, alpha: 0, shgc: num(p.shgc) * shade });
  }
  /* ceiling: roof, a partition to an unconditioned space, and the rest next to conditioned space */
  let ceilRest = A;
  if (r.above === 'roof') {
    const roof = num(r.roof), sky = Math.min(num(r.sky), roof);
    push({ group: 'roof', A: roof - sky, az: 0, tilt: 0, slabs: fitU('roof', num(p.uRoof), ceil('roof', p.roofLayers)), hci: H.ceil, ext: true, alpha: num(p.aRoof) });
    push({ group: 'gCond', A: sky, az: 0, tilt: 0, slabs: glassSlabs(num(p.uSky)), hci: H.ceil, ext: true, alpha: 0, shgc: num(p.shgcSky) * shade });
    ceilRest = Math.max(0, A - roof);
  } else if (r.above === 'uncond') {
    const a = num(r.ce.a);
    push({ group: 'partC', A: a, az: 0, tilt: 0, slabs: [FILM, ...fitU('ceiling', uOf(r.ce.u, pxU(p, 'ceiling')), ceil('ceiling'))], hci: H.ceil, ext: false, alpha: 0, tb: bound(r.ce.adj, r.ce.t) });
    ceilRest = Math.max(0, A - a);
  }
  push({ group: 'mass', A: ceilRest, az: 0, tilt: 0, slabs: halfSlabs(fitU('ceiling', 0, ceil('ceiling'))), hci: H.ceil, ext: false, alpha: 0 });
  /* floor */
  let floorRest = A;
  if (r.below === 'uncond' || r.below === 'outdoor') {
    const a = num(r.fl.a), U = uOf(r.fl.u, p.uFloor);
    if (r.below === 'outdoor') push({ group: 'partF', A: a, az: 0, tilt: 180, slabs: fitU('floor', U, flr), hci: H.floor, ext: true, alpha: 0, floor: true });
    else push({ group: 'partF', A: a, az: 0, tilt: 180, slabs: [FILM, ...fitU('floor', U, flr)], hci: H.floor, ext: false, alpha: 0, floor: true, tb: bound(r.fl.adj, r.fl.t) });
    floorRest = Math.max(0, A - a);
  } else if (r.below === 'ground') {
    push({ group: 'partF', A, az: 0, tilt: 180, slabs: groundSlabs(p.floorFin === 'carpet'), hci: H.floor, ext: false, alpha: 0, floor: true, tb: () => DRF.map(() => cl.st.tavg) });
    floorRest = 0;
  }
  push({ group: 'mass', A: floorRest, az: 0, tilt: 180, slabs: halfSlabs(fitU('floor', 0, flr)), hci: H.floor, ext: false, alpha: 0, floor: true });
  /* wall partitions, then the remaining walls of a square room are partitions to conditioned neighbours.
     Surfaces next to conditioned space at the room set-point are adiabatic halves (no far-side temperature). */
  let pxA = 0;
  r.px.forEach(x => {
    const a = num(x.a); pxA += a;
    const cons = fitU('partition', uOf(x.u, partU(p, x)), typeLayers(p.partTypes, x.pt));
    /* a conditioned neighbour at the same set-point is symmetric: adiabatic half partition */
    push(x.adj === 'cond' ? { group: 'partW', A: a, az: 0, tilt: 90, slabs: halfSlabs(cons), hci: H.wall, ext: false, alpha: 0 }
      : { group: 'partW', A: a, az: 0, tilt: 90, slabs: [FILM, ...cons], hci: H.wall, ext: false, alpha: 0, tb: bound(x.adj, x.t) });
  });
  push({ group: 'mass', A: Math.max(0, 4 * Math.sqrt(A) * num(r.height) - extGross - pxA), az: 0, tilt: 90, slabs: halfSlabs(fitU('partition', 0)), hci: H.wall, ext: false, alpha: 0 });
  return S;
}

export const COMPONENTS = ['walls', 'roof', 'gSol', 'gCond', 'partW', 'partC', 'partF', 'pS', 'light', 'equip', 'infS'] as const;
export type Component = typeof COMPONENTS[number];
/* infK: infiltration sensible coefficient, W/K */
export interface Gains { n: number; ps: number; pl: number; light: number; equip: number; infK: number; infL: number; sched: string }
export interface MonthLoads { c: Record<Component, number[]>; lat: number[] }

/* hourly sensible load components and latent load (W, one unit, no margins) for each month */
export function roomLoads(p: Project, r: Room, cl: Climate, g: Gains): MonthLoads[] {
  const S = roomSurfaces(p, r, cl), R = respond(S), Ti = num(p.tiDB), rho = num(p.gRefl);
  const sch = SCHEDULES.find(s => s.id === g.sched) || SCHEDULES[0];
  const zero = () => DRF.map(() => 0);
  /* internal gains: convective part is load at once, radiant part through the surfaces */
  const internal = { pS: zero(), light: zero(), equip: zero() };
  const gain = (k: 'pS' | 'light' | 'equip', total: number, f: number[], fr: number) => {
    const G = f.map(x => x * total);
    G.forEach((v, i) => { internal[k][i] += (1 - fr) * v; });
    idft(apply(R.rad, dft(G.map(v => v * fr))), internal[k]);
  };
  gain('pS', g.n * g.ps, sch.people, num(p.frP));
  gain('light', g.light, sch.light, num(p.frL));
  gain('equip', g.equip, sch.equip, num(p.frE));
  const lat = sch.people.map(f => f * g.n * g.pl + g.infL);
  return cl.days.map((d, m) => {
    const c: Record<Component, number[]> = {
      walls: zero(), roof: zero(), gSol: zero(), gCond: zero(), partW: zero(), partC: zero(), partF: zero(),
      pS: [...internal.pS], light: [...internal.light], equip: [...internal.equip], infS: d.To.map(t => g.infK * (t - Ti)),
    };
    const beam = zero(), diff = zero();
    S.forEach((s, j) => {
      if (s.ext) idft(apply(R.ext[j], dft(extForcing(s, d, Ti, rho))), c[s.group as Component]);
      else if (s.tb) idft(apply(R.bnd[j], dft(s.tb(m).map(t => t - Ti))), c[s.group as Component]);
      if (s.shgc) {
        const gg = glassGain(s, d, rho);
        /* interior shading diffuses the beam over the room */
        gg.beam.forEach((v, i) => { if (num(p.shade) < 0.999) diff[i] += v; else beam[i] += v; diff[i] += gg.diff[i]; });
      }
    });
    idft(apply(R.beam, dft(beam)), c.gSol); idft(apply(R.rad, dft(diff)), c.gSol);
    return { c, lat };
  });
}
