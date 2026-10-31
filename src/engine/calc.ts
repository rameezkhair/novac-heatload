/* Room-by-room cooling load. All loads in W, calculated with the hourly ASHRAE heat-balance engine in ./hbm. */
import { ADJ, DRF, ORIENTS, SCHEDULES } from './data';
import { climateOf, roomLoads, COMPONENTS, type MonthLoads } from './hbm/room';
import { W_rh, W_wb, hOf, pressureAt, wbOf, rhOf } from './psychro';
import { refElevOf } from './project';
import type { Project, Room } from './types';
import { num } from './util';

export interface Env { P: number; k: number; lapse: number; To: number; Tv: number; Wo: number; Wv: number; Wi: number }

/* Site effects: pressure from elevation; air density factor k = P/101.325 on all air loads;
   6.5 K per 1,000 m lapse above the emirate reference, holding the code humidity ratio. */
export function envOf(p: Project): Env {
  const P = pressureAt(num(p.elev)), k = P / 101.325;
  const lapse = 0.0065 * Math.max(0, num(p.elev) - refElevOf(p));
  const To = num(p.toDB) - lapse, Tv = num(p.vDB) - lapse;
  const Wo = Math.min(W_wb(num(p.toDB), num(p.toWB), P), W_rh(To, 100, P)), Wv = Math.min(W_wb(num(p.vDB), num(p.vWB), P), W_rh(Tv, 100, P));
  return {
    P, k, lapse, To, Tv, Wo, Wv, Wi: W_rh(num(p.tiDB), num(p.tiRH), P),
  };
}

export const uEff = (v: unknown, proj: unknown) => v !== '' && v != null && isFinite(parseFloat(v as string)) ? num(v) : num(proj);
/* temperature of an adjacent space */
export function adjTemp(p: Project, e: Env, id: string, custom?: unknown) {
  const a = ADJ.find(x => x[0] === id) || ADJ.find(x => x[0] === 'project')!;
  if (a[0] === 'custom') return num(custom);
  if (a[0] === 'cond2') return custom !== '' && custom != null ? num(custom) : num(p.tiDB) + 2;
  if (!a[2]) return num(p.tAdj);
  return Math.round(a[2](e.To, num(p.tiDB)) * 10) / 10;
}

/* load components of one unit at the design hour */
interface Parts {
  n: number; walls: number; roof: number; gSol: number; gCond: number; partW: number; partC: number; partF: number;
  pS: number; pL: number; light: number; equip: number; infQ: number; infS: number; infL: number; wallG: number; glassA: number; sky: number;
}
export interface RoomLoad extends Parts {
  oaQ: number; part: number; oaS: number; oaL: number; mS: number; mL: number; roomS: number; roomL: number;
  unitS: number; unitL: number; unit: number; oa: number; sa: number; A: number; roofA: number; qty: number;
  /* heat balance: design month (0–11) and hour (1–24) of the room peak, and room sensible / latent load
     (with margins, one unit) for every hour of every month, index month × 24 + hour − 1 */
  pkM?: number; pkH?: number; profS?: number[]; profL?: number[];
  /* hourly load components and latent load of every month, one unit, before margins */
  hb?: MonthLoads[];
}

/* fresh air, margins, unit totals and supply air from the room components */
function finish(p: Project, r: Room, e: Env, x: Parts, extra: Pick<RoomLoad, 'pkM' | 'pkH' | 'profS' | 'profL' | 'hb'>): RoomLoad {
  const A = num(r.area), Ti = num(p.tiDB), ks = 1.23 * e.k, kl = 3010 * e.k;
  const part = x.partW + x.partC + x.partF;
  const oaQ = num(r.oa), oaS = ks * oaQ * (e.Tv - Ti), oaL = kl * oaQ * Math.max(0, e.Wv - e.Wi);
  const s0 = x.walls + x.roof + x.gSol + x.gCond + part + x.pS + x.light + x.equip + x.infS, l0 = x.pL + x.infL;
  const mS = s0 * num(p.sfS) / 100, mL = l0 * num(p.sfL) / 100;
  const roomS = s0 + mS, roomL = l0 + mL, toUnit = !p.fahu;
  const unitS = roomS + (toUnit ? oaS : 0), unitL = roomL + (toUnit ? oaL : 0), unit = unitS + unitL;
  const sa = roomS / (ks * Math.max(1, Ti - num(p.tSupply)));
  return {
    ...x, oaQ, part, oaS, oaL, mS, mL, roomS, roomL, unitS, unitL, unit, oa: oaS + oaL, sa, A,
    roofA: r.above === 'roof' ? num(r.roof) : 0, qty: Math.max(1, Math.round(num(r.qty)) || 1), ...extra,
  };
}

/* heat balance: run every month, take the hour and month with the highest room load */
function calcHbm(p: Project, r: Room, e: Env): RoomLoad {
  const A = num(r.area), ks = 1.23 * e.k, kl = 3010 * e.k;
  const n = num(r.people), infQ = num(r.ach) * A * num(r.height) / 3.6, infL = kl * infQ * Math.max(0, e.Wo - e.Wi);
  const sched = r.sched || '24h', sch = SCHEDULES.find(s => s.id === sched) || SCHEDULES[0];
  const months = roomLoads(p, r, climateOf(p, e), { n, ps: num(r.ps), pl: num(r.pl), light: A * num(r.light), equip: A * num(r.equip), infK: ks * infQ, infL, sched });
  const fS = 1 + num(p.sfS) / 100, fL = 1 + num(p.sfL) / 100, profS: number[] = [], profL: number[] = [];
  let best = -Infinity, bm = 0, bh = 0;
  months.forEach((ml, m) => {
    for (let i = 0; i < 24; i++) {
      const s = COMPONENTS.reduce((a, k) => a + ml.c[k][i], 0) * fS, l = ml.lat[i] * fL;
      profS.push(s); profL.push(l);
      if (s + l > best + 1e-9) { best = s + l; bm = m; bh = i; }
    }
  });
  const c = months[bm].c, at = (k: typeof COMPONENTS[number]) => c[k][bh];
  let wallG = 0, glassA = 0;
  for (const o of ORIENTS) { const w = num(r.walls[o]?.w), g = num(r.walls[o]?.g); glassA += g; wallG += Math.max(w, g); }
  const sky = r.above === 'roof' ? num(r.sky) : 0;
  return finish(p, r, e, {
    n, walls: at('walls'), roof: at('roof'), gSol: at('gSol'), gCond: at('gCond'), partW: at('partW'), partC: at('partC'), partF: at('partF'),
    pS: at('pS'), pL: n * num(r.pl) * sch.people[bh], light: at('light'), equip: at('equip'), infQ, infS: at('infS'), infL, wallG, glassA, sky,
  }, { pkM: bm, pkH: bh + 1, profS, profL, hb: months });
}

/* results are kept per room and project, so editing one room recalculates only that room */
const memo = new WeakMap<Room, { p: Project; c: RoomLoad }>();
/* load for one unit of a room */
export function calc(p: Project, r: Room, e: Env): RoomLoad {
  const m = memo.get(r);
  if (m && m.p === p) return m.c;
  const c = calcHbm(p, r, e);
  memo.set(r, { p, c }); return c;
}

/* DBC H.4.8.3: DCV in spaces over 100 m² with design occupancy of 25 people per 100 m² or more */
export const dcvNeeded = (c: RoomLoad) => c.A > 100 && c.n / c.A * 100 >= 25;

export interface Totals {
  a: number; n: number; s: number; l: number; oa: number; oaS: number; oaL: number; u: number; sa: number; q: number; oaq: number;
  wallG: number; glass: number; roof: number; sky: number; dcv: string[]; rec: number; fahuW: number; plant: number; wwr: number; skyPct: number;
  /* heat balance: coincident peak of all room loads (× qty, with margins), its month (0–11) and hour (1–24) */
  blk?: { s: number; l: number; m: number; h: number };
}
export interface Computed { p: Project; rooms: Room[]; e: Env; res: Record<string, RoomLoad>; T: Totals }

export function computeAll(p: Project, rooms: Room[]): Computed {
  const e = envOf(p), res: Record<string, RoomLoad> = {};
  rooms.forEach(r => { res[r.id] = calc(p, r, e); });
  const T: Totals = { a: 0, n: 0, s: 0, l: 0, oa: 0, oaS: 0, oaL: 0, u: 0, sa: 0, q: 0, oaq: 0, wallG: 0, glass: 0, roof: 0, sky: 0, dcv: [], rec: 0, fahuW: 0, plant: 0, wwr: 0, skyPct: 0 };
  rooms.forEach(r => {
    const c = res[r.id], m = c.qty;
    T.a += c.A * m; T.n += c.n * m; T.s += c.roomS * m; T.l += c.roomL * m; T.oa += c.oa * m; T.oaS += c.oaS * m; T.oaL += c.oaL * m;
    T.u += c.unit * m; T.sa += c.sa * m; T.q += m; T.oaq += c.oaQ * m;
    T.wallG += c.wallG * m; T.glass += c.glassA * m; T.roof += c.roofA * m; T.sky += c.sky * m;
    if (dcvNeeded(c)) T.dcv.push(r.name || 'Untitled');
  });
  T.rec = p.fahu && p.erv ? (num(p.ervS) / 100 * T.oaS + num(p.ervL) / 100 * T.oaL) * num(p.ervShare) / 100 : 0;
  T.fahuW = p.fahu ? Math.max(0, T.oa - T.rec) : 0;
  T.plant = (T.u + T.fahuW) * num(p.diversity) / 100;
  T.wwr = T.wallG ? T.glass / T.wallG * 100 : 0; T.skyPct = T.roof ? T.sky / T.roof * 100 : 0;
  if (rooms.length && rooms.every(r => res[r.id].profS)) {
    const S = new Array(288).fill(0), L = new Array(288).fill(0);
    rooms.forEach(r => { const c = res[r.id]; for (let i = 0; i < 288; i++) { S[i] += c.profS![i] * c.qty; L[i] += c.profL![i] * c.qty; } });
    let k = 0; for (let i = 1; i < 288; i++) if (S[i] + L[i] > S[k] + L[k]) k = i;
    T.blk = { s: S[k], l: L[k], m: Math.floor(k / 24), h: k % 24 + 1 };
  }
  return { p, rooms, e, res, T };
}

/* hourly outdoor profile, humidity ratio held at the design value */
export function designDay(p: Project, e: Env) {
  const dr = num(p.dr);
  return DRF.map((f, i) => { const t = e.To - f * dr, w = Math.min(e.Wo, W_rh(t, 100, e.P)); return { h: i + 1, db: t, wb: wbOf(t, w, e.P), rh: Math.min(100, rhOf(t, w, e.P)), w }; });
}

export interface StatePoint { k: string; name: string; t: number; w: number; c: 'bad' | 'warn' | 'ok' | 'acc' | 'mid' }
export function stateTable(d: Computed) {
  const { p, e, T } = d, P = e.P, Ti = num(p.tiDB), Ts = num(p.tSupply);
  const Wsup = T.sa > 0 ? Math.max(0.0005, e.Wi - T.l / (3010 * e.k * T.sa)) : e.Wi;
  const pts: StatePoint[] = [
    { k: 'O', name: 'Outdoor (ambient)', t: e.To, w: e.Wo, c: 'bad' }, { k: 'V', name: 'Outdoor (fresh air)', t: e.Tv, w: e.Wv, c: 'warn' },
    { k: 'R', name: 'Room design', t: Ti, w: e.Wi, c: 'ok' }, { k: 'S', name: 'Supply air', t: Ts, w: Wsup, c: 'acc' }];
  if (!p.fahu && T.sa > 0) { const x = Math.min(1, T.oaq / T.sa); pts.push({ k: 'M', name: `Mixed air (${Math.round(x * 100)}% fresh air)`, t: x * e.Tv + (1 - x) * Ti, w: x * e.Wv + (1 - x) * e.Wi, c: 'mid' }); }
  if (Math.abs(e.Tv - e.To) < 0.05 && Math.abs(e.Wv - e.Wo) < 1e-5) pts.splice(1, 1);
  return { pts, Wsup, supersat: Wsup > W_rh(Ts, 100, P), P };
}

/* fresh-air load per 100 L/s at a given state, kW */
export const oaPer100 = (e: Env, Ti: number, T: number, W: number) => 100 * (1.23 * e.k * (T - Ti) + 3010 * e.k * Math.max(0, W - e.Wi)) / 1000;
export { hOf };
