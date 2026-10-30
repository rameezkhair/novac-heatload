/* ASHRAE CLTD/CLF peak cooling load, room by room. All loads in W. */
import { ADJ, DRF, ORIENTS } from './data';
import { W_rh, W_wb, hOf, pressureAt, wbOf, rhOf } from './psychro';
import { pxU, refElevOf } from './project';
import type { Adjacent, Project, Room } from './types';
import { num } from './util';

export interface Env { P: number; k: number; lapse: number; To: number; Tv: number; Wo: number; Wv: number; Wi: number; corr: number }

/* Site effects: pressure from elevation; air density factor k = P/101.325 on all air loads;
   6.5 K per 1,000 m lapse above the emirate reference, holding the code humidity ratio. */
export function envOf(p: Project): Env {
  const P = pressureAt(num(p.elev)), k = P / 101.325;
  const lapse = 0.0065 * Math.max(0, num(p.elev) - refElevOf(p));
  const To = num(p.toDB) - lapse, Tv = num(p.vDB) - lapse;
  const Wo = Math.min(W_wb(num(p.toDB), num(p.toWB), P), W_rh(To, 100, P)), Wv = Math.min(W_wb(num(p.vDB), num(p.vWB), P), W_rh(Tv, 100, P));
  return {
    P, k, lapse, To, Tv, Wo, Wv, Wi: W_rh(num(p.tiDB), num(p.tiRH), P),
    corr: (25.5 - num(p.tiDB)) + ((To - num(p.dr) / 2) - 29.4),
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
const adjGain = (p: Project, e: Env, x: Adjacent, U: unknown) => uEff(x.u, U) * num(x.a) * (adjTemp(p, e, x.adj || 'project', x.t) - num(p.tiDB));

export interface RoomLoad {
  n: number; oaQ: number; infQ: number; walls: number; roof: number; gSol: number; gCond: number;
  part: number; partW: number; partC: number; partF: number; pS: number; pL: number; light: number; equip: number;
  infS: number; infL: number; oaS: number; oaL: number; mS: number; mL: number; roomS: number; roomL: number;
  unitS: number; unitL: number; unit: number; oa: number; sa: number; A: number; wallG: number; glassA: number; sky: number; roofA: number; qty: number;
}

/* load for one unit of a room */
export function calc(p: Project, r: Room, e: Env): RoomLoad {
  const A = num(r.area), H = num(r.height), Ti = num(p.tiDB), dT = e.To - Ti, ks = 1.23 * e.k, kl = 3010 * e.k;
  /* Glass conduction uses the ASHRAE glass CLTD, corrected like walls and roof. The original tool used
     the full outdoor-indoor difference, which overstates glass conduction by about 2-3 K at UAE conditions. */
  const glassCltd = Math.max(0, num(p.cltd.G) + e.corr);
  let walls = 0, gSol = 0, gCond = 0, wallG = 0, glassA = 0;
  for (const o of ORIENTS) {
    const w = num(r.walls[o]?.w), g = num(r.walls[o]?.g); glassA += g; wallG += Math.max(w, g);
    walls += num(p.uWall) * Math.max(0, w - g) * Math.max(0, num(p.cltd[o]) + e.corr);
    gCond += num(p.uGlass) * g * glassCltd;
    gSol += g * num(p.solar[o]) * num(p.shgc) * num(p.shade);
  }
  const isRoof = r.above === 'roof', sky = isRoof ? num(r.sky) : 0;
  const roof = isRoof ? num(p.uRoof) * Math.max(0, num(r.roof) - sky) * Math.max(0, num(p.cltd.R) + e.corr) : 0;
  gCond += num(p.uSky) * sky * glassCltd;
  gSol += sky * num(p.solar.H) * num(p.shgcSky) * num(p.shade);
  const partW = r.px.reduce((a, x) => a + adjGain(p, e, x, pxU(p, 'wall')), 0);
  const partC = r.above === 'uncond' ? adjGain(p, e, r.ce, pxU(p, 'ceiling')) : 0;
  const partF = r.below === 'uncond' ? adjGain(p, e, r.fl, p.uFloor)
    : r.below === 'outdoor' ? uEff(r.fl.u, p.uFloor) * num(r.fl.a) * Math.max(0, dT) : 0;
  const part = partW + partC + partF;
  const n = num(r.people), pS = n * num(r.ps), pL = n * num(r.pl), light = A * num(r.light), equip = A * num(r.equip);
  const infQ = num(r.ach) * A * H / 3.6, infS = ks * infQ * dT, infL = kl * infQ * Math.max(0, e.Wo - e.Wi);
  const oaQ = num(r.oa), oaS = ks * oaQ * (e.Tv - Ti), oaL = kl * oaQ * Math.max(0, e.Wv - e.Wi);
  const s0 = walls + roof + gSol + gCond + part + pS + light + equip + infS, l0 = pL + infL;
  const mS = s0 * num(p.sfS) / 100, mL = l0 * num(p.sfL) / 100;
  const roomS = s0 + mS, roomL = l0 + mL, toUnit = !p.fahu;
  const unitS = roomS + (toUnit ? oaS : 0), unitL = roomL + (toUnit ? oaL : 0), unit = unitS + unitL;
  const sa = roomS / (ks * Math.max(1, Ti - num(p.tSupply)));
  return {
    n, oaQ, infQ, walls, roof, gSol, gCond, part, partW, partC, partF, pS, pL, light, equip, infS, infL, oaS, oaL, mS, mL,
    roomS, roomL, unitS, unitL, unit, oa: oaS + oaL, sa, A, wallG, glassA, sky, roofA: isRoof ? num(r.roof) : 0,
    qty: Math.max(1, Math.round(num(r.qty)) || 1),
  };
}

/* DBC H.4.8.3: DCV in spaces over 100 m² with design occupancy of 25 people per 100 m² or more */
export const dcvNeeded = (c: RoomLoad) => c.A > 100 && c.n / c.A * 100 >= 25;

export interface Totals {
  a: number; n: number; s: number; l: number; oa: number; oaS: number; oaL: number; u: number; sa: number; q: number; oaq: number;
  wallG: number; glass: number; roof: number; sky: number; dcv: string[]; rec: number; fahuW: number; plant: number; wwr: number; skyPct: number;
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
    { k: 'O', name: 'Outdoor (envelope)', t: e.To, w: e.Wo, c: 'bad' }, { k: 'V', name: 'Outdoor (fresh air)', t: e.Tv, w: e.Wv, c: 'warn' },
    { k: 'R', name: 'Room design', t: Ti, w: e.Wi, c: 'ok' }, { k: 'S', name: 'Supply air', t: Ts, w: Wsup, c: 'acc' }];
  if (!p.fahu && T.sa > 0) { const x = Math.min(1, T.oaq / T.sa); pts.push({ k: 'M', name: `Mixed air (${Math.round(x * 100)}% fresh air)`, t: x * e.Tv + (1 - x) * Ti, w: x * e.Wv + (1 - x) * e.Wi, c: 'mid' }); }
  if (Math.abs(e.Tv - e.To) < 0.05 && Math.abs(e.Wv - e.Wo) < 1e-5) pts.splice(1, 1);
  return { pts, Wsup, supersat: Wsup > W_rh(Ts, 100, P), P };
}

/* fresh-air load per 100 L/s at a given state, kW */
export const oaPer100 = (e: Env, Ti: number, T: number, W: number) => 100 * (1.23 * e.k * (T - Ti) + 3010 * e.k * Math.max(0, W - e.Wi)) / 1000;
export { hOf };
