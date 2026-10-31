/* ASHRAE heat balance method (Fundamentals 2013–2021 Ch. 18), room by room, for a steady-periodic design day
   in each month. Each room is solved with three linked balances:
     outside face:  absorbed solar + convection to outdoor air + long-wave exchange with sky and ground = conduction in
     conduction:    exact one-dimensional transient conduction through each layer
     inside face:   conduction + absorbed solar and radiant gains + long-wave exchange with the other surfaces = convection to room air
   and the room air balance gives the cooling load: Σ convection from surfaces + convective gains + infiltration.
   The design day repeats, so the balances are solved directly for the periodic response in 24-hour harmonics
   (the frequency-domain form of the same equations); with linear surface coefficients this equals running the
   hourly heat balance until the days stop changing. Linearity also lets the load be split exactly into its
   components (walls, roof, glass, people, ...) by superposition. */
import { type Station } from '../climate';
import { angleFactor, diffuseFactors, onSurface, sunAt, type Sun } from './solar';
import type { Slab } from './construction';

/* surface coefficients, W/m²K */
export const H = {
  /* outside: convection + linearised long-wave, total 17 W/m²K (ASHRAE Ch. 18 summer sol-air h_o) */
  co: 11.0, ro: 6.0,
  /* inside long-wave, 4εσT³ with ε 0.9 at 24 °C */
  ri: 5.4,
  /* inside natural convection, ASHRAE simple model (Walton): vertical, upward from a warm floor, downward from a warm ceiling */
  wall: 3.076, floor: 4.04, ceil: 0.948,
};

export type Group = 'walls' | 'roof' | 'gCond' | 'gSol' | 'partW' | 'partC' | 'partF' | 'mass';
export interface Surface {
  group: Group; A: number; az: number; tilt: number; slabs: Slab[]; hci: number;
  /* outside face in sun and outdoor air; otherwise the far side is held at a boundary temperature */
  ext: boolean; alpha: number;
  /* glazing: SHGC × interior shading factor */
  shgc?: number;
  /* far-side temperature by hour (index 0 = hour 1) and month; absent on an interior surface = adiabatic far face */
  tb?: (m: number) => number[];
  floor?: boolean;
}

/* ---------- complex arithmetic on [re, im] ---------- */
type C = [number, number];
const cm = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cd = (a: C, b: C): C => { const q = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]; };
const ca = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];

/* transmission matrix [A B; C D] of a construction at angular frequency w (rad/s):
   [T inside; q inside] = M [T outside; q outside], q positive inward */
function transmission(slabs: Slab[], w: number): [C, C, C, C] {
  let A: C = [1, 0], B: C = [0, 0], Cc: C = [0, 0], D: C = [1, 0];
  for (const s of slabs) {
    let a: C, b: C, c: C, d: C;
    if (w === 0 || s.rc <= 0) { a = [1, 0]; b = [-s.L / s.k, 0]; c = [0, 0]; d = [1, 0]; }
    else {
      const q = Math.sqrt(w * s.rc / (2 * s.k)), p = q * s.L;
      const ch: C = [Math.cosh(p) * Math.cos(p), Math.sinh(p) * Math.sin(p)], sh: C = [Math.sinh(p) * Math.cos(p), Math.cosh(p) * Math.sin(p)];
      const kg: C = [s.k * q, s.k * q];
      a = ch; d = ch; b = cd([-sh[0], -sh[1]], kg); const t = cm(kg, sh); c = [-t[0], -t[1]];
    }
    /* layer × running product */
    [A, B, Cc, D] = [ca(cm(a, A), cm(b, Cc)), ca(cm(a, B), cm(b, D)), ca(cm(c, A), cm(d, Cc)), ca(cm(c, B), cm(d, D))];
  }
  return [A, B, Cc, D];
}

/* solve the complex system M x = r in place (Gaussian elimination with partial pivoting) */
function solve(n: number, Mr: Float64Array, Mi: Float64Array, rr: Float64Array, ri: Float64Array) {
  for (let k = 0; k < n; k++) {
    let p = k, best = -1;
    for (let i = k; i < n; i++) { const m = Mr[i * n + k] ** 2 + Mi[i * n + k] ** 2; if (m > best) { best = m; p = i; } }
    if (p !== k) {
      for (let j = 0; j < n; j++) { let t = Mr[k * n + j]; Mr[k * n + j] = Mr[p * n + j]; Mr[p * n + j] = t; t = Mi[k * n + j]; Mi[k * n + j] = Mi[p * n + j]; Mi[p * n + j] = t; }
      let t = rr[k]; rr[k] = rr[p]; rr[p] = t; t = ri[k]; ri[k] = ri[p]; ri[p] = t;
    }
    const pr = Mr[k * n + k], pi = Mi[k * n + k], q = pr * pr + pi * pi;
    for (let i = k + 1; i < n; i++) {
      const ar = Mr[i * n + k], ai = Mi[i * n + k]; if (ar === 0 && ai === 0) continue;
      const fr = (ar * pr + ai * pi) / q, fi = (ai * pr - ar * pi) / q;
      for (let j = k; j < n; j++) { const br = Mr[k * n + j], bi = Mi[k * n + j]; Mr[i * n + j] -= fr * br - fi * bi; Mi[i * n + j] -= fr * bi + fi * br; }
      const br = rr[k], bi = ri[k]; rr[i] -= fr * br - fi * bi; ri[i] -= fr * bi + fi * br;
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let sr = rr[k], si = ri[k];
    for (let j = k + 1; j < n; j++) { const ar = Mr[k * n + j], ai = Mi[k * n + j]; sr -= ar * rr[j] - ai * ri[j]; si -= ar * ri[j] + ai * rr[j]; }
    const pr = Mr[k * n + k], pi = Mi[k * n + k], q = pr * pr + pi * pi;
    rr[k] = (sr * pr + si * pi) / q; ri[k] = (si * pr - sr * pi) / q;
  }
}

/* ---------- 24-hour harmonics: sample i is hour i + 1 ---------- */
export const NH = 12;
const COS: number[][] = [], SIN: number[][] = [];
for (let n = 0; n <= NH; n++) { COS.push([]); SIN.push([]); for (let i = 0; i < 24; i++) { const a = 2 * Math.PI * n * (i + 1) / 24; COS[n].push(Math.cos(a)); SIN[n].push(Math.sin(a)); } }
export function dft(x: ArrayLike<number>): C[] {
  const out: C[] = [];
  for (let n = 0; n <= NH; n++) { let re = 0, im = 0; for (let i = 0; i < 24; i++) { re += x[i] * COS[n][i]; im -= x[i] * SIN[n][i]; } out.push([re / 24, im / 24]); }
  return out;
}
/* hourly series from harmonics; add = true accumulates into `into` */
export function idft(X: C[], into: number[]) {
  for (let i = 0; i < 24; i++) {
    let v = X[0][0];
    for (let n = 1; n <= NH; n++) { const re = X[n][0] * COS[n][i] - X[n][1] * SIN[n][i]; v += n === NH ? re : 2 * re; }
    into[i] += v;
  }
}

/* load responses of one room at each harmonic: load W per unit forcing */
export interface Response {
  /* per W/m² of outside-face forcing on each exterior surface */
  ext: C[][];
  /* per K of far-side temperature on each bounded surface */
  bnd: C[][];
  /* per W of radiant heat spread over all surfaces by area; per W of beam solar on the floor */
  rad: C[]; beam: C[];
}

export function respond(S: Surface[]): Response {
  const N = S.length, ext = S.map((s, j) => s.ext ? j : -1), out: number[] = [];
  ext.forEach(j => { if (j >= 0) out[j] = N + out.filter(x => x != null).length; });
  const nu = N + out.filter(x => x != null).length, At = S.reduce((a, s) => a + s.A, 0);
  const Af = S.reduce((a, s) => a + (s.floor ? s.A : 0), 0);
  const R: Response = { ext: S.map(() => []), bnd: S.map(() => []), rad: [], beam: [] };
  for (let n = 0; n <= NH; n++) {
    const w = 2 * Math.PI * n / 86400;
    /* build Mᵀ directly: the adjoint solve gives every load response at once */
    const Mr = new Float64Array(nu * nu), Mi = new Float64Array(nu * nu);
    const add = (row: number, col: number, v: C) => { Mr[col * nu + row] += v[0]; Mi[col * nu + row] += v[1]; };
    /* d: inside-face conduction per K of inside temperature; adiabatic far face: q inside = (C/A) T inside */
    const coef = S.map(s => { const [A, B, Cc, D] = transmission(s.slabs, w); return !s.ext && !s.tb ? { a: [0, 0] as C, b: [0, 0] as C, d: cd(Cc, A) } : { a: cd(A, B), b: cd([1, 0], B), d: cd(D, B) }; });
    S.forEach((s, j) => {
      const c = coef[j];
      add(j, j, [c.d[0] - s.hci - H.ri, c.d[1]]);
      S.forEach((t, k) => add(j, k, [H.ri * t.A / At, 0]));
      if (s.ext) { const o = out[j]; add(j, o, [-c.b[0], -c.b[1]]); add(o, o, [c.a[0] - H.co - H.ro, c.a[1]]); add(o, j, [-c.b[0], -c.b[1]]); }
    });
    const yr = new Float64Array(nu), yi = new Float64Array(nu);
    S.forEach((s, j) => { yr[j] = s.A * s.hci; });
    solve(nu, Mr, Mi, yr, yi);
    let rad: C = [0, 0], beam: C = [0, 0];
    S.forEach((s, j) => {
      const yin: C = [yr[j], yi[j]];
      if (s.ext) R.ext[j].push([-yr[out[j]], -yi[out[j]]]);
      else R.bnd[j].push(cm(yin, coef[j].b));
      rad = ca(rad, [-yin[0] / At, -yin[1] / At]);
      if (s.floor && Af > 0) beam = ca(beam, [-yin[0] / Af, -yin[1] / Af]);
    });
    R.rad.push(rad); R.beam.push(Af > 0 ? beam : rad);
  }
  return R;
}
/* response × forcing harmonics */
export const apply = (H_: C[], X: C[]): C[] => X.map((x, n) => cm(H_[n], x));

/* ---------- design-day climate ---------- */
export interface DayClimate { To: number[]; Tsky: number[]; sun: Sun[] }
/* sky temperature from the clear-sky emissivity (Berdahl and Martin), dew point in °C */
export const skyTemp = (To: number, Tdp: number) => {
  const e = 0.711 + 0.56 * (Tdp / 100) + 0.73 * (Tdp / 100) ** 2;
  return Math.pow(e, 0.25) * (To + 273.15) - 273.15;
};
export function sunDay(st: Station, m: number) { return Array.from({ length: 24 }, (_, i) => sunAt(st, m, (i + 1) % 24)); }

/* hourly outside-face forcing on an exterior surface, W/m², relative to room temperature Ti:
   α·I + h_co (To − Ti) + h_ro (T_env − Ti), T_env = sky for the upward-facing part, outdoor air otherwise */
export function extForcing(s: Surface, d: DayClimate, Ti: number, rho: number) {
  const fsky = Math.max(0, Math.cos(s.tilt * Math.PI / 180));
  return d.To.map((To, i) => {
    let I = 0;
    if (s.alpha > 0 && s.tilt < 179) { const o = onSurface(d.sun[i], s.az, s.tilt, rho); I = o.b + o.d + o.r; }
    const Tenv = To - fsky * (To - d.Tsky[i]);
    return s.alpha * I + H.co * (To - Ti) + H.ro * (Tenv - Ti);
  });
}
/* solar heat gain through glazing, W, split into beam (lands on the floor) and diffuse (spread over all surfaces) */
export function glassGain(s: Surface, d: DayClimate, rho: number) {
  const df = diffuseFactors(s.tilt), k = s.A * (s.shgc ?? 0);
  const beam: number[] = [], diff: number[] = [];
  d.sun.forEach(sun => {
    const o = onSurface(sun, s.az, s.tilt, rho);
    beam.push(k * o.b * angleFactor(o.cos)); diff.push(k * (o.d * df.sky + o.r * df.gnd));
  });
  return { beam, diff };
}
