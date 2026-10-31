/* Independent verification of the heat balance solver. NOVAC solves each room in the frequency domain (24-hour
   harmonics, transmission matrices, one adjoint solve). Here the same room equations are solved a second, unrelated way:
   a time-stepping finite-difference simulation (backward Euler, 1-minute steps, millimetre-scale layers) run day after day
   until it repeats. The two must give the same hourly load. */
import { describe, expect, it } from 'vitest';
import { fitU, glassSlabs, halfSlabs, slabR, toSlabs, type Slab } from '../src/engine/hbm/construction';
import { H, apply, dft, idft, respond, type Surface } from '../src/engine/hbm/heatBalance';

/* forcings as smooth daily waves, so both methods see exactly the same inputs */
const wave = (mean: number, amp: number, peakHour: number) => (t: number) => mean + amp * Math.cos(2 * Math.PI * (t - peakHour) / 24);
const hourly = (f: (t: number) => number) => Array.from({ length: 24 }, (_, i) => f(i + 1));

interface Case { S: Surface[]; ext: ((t: number) => number)[]; bnd: ((t: number) => number)[]; rad: (t: number) => number }

/* NOVAC: load = Σ responses × forcing harmonics */
function frequencyDomain(c: Case) {
  const R = respond(c.S), load = new Array(24).fill(0);
  c.S.forEach((s, j) => {
    if (s.ext) idft(apply(R.ext[j], dft(hourly(c.ext[j]))), load);
    else if (s.tb) idft(apply(R.bnd[j], dft(hourly(c.bnd[j]))), load);
  });
  idft(apply(R.rad, dft(hourly(c.rad))), load);
  return load;
}

/* reference: finite differences in time and space, temperatures relative to the room air */
function timeStepping(c: Case, dt = 60, days = 14) {
  const At = c.S.reduce((a, s) => a + s.A, 0);
  /* nodes through each construction, outside face first; each layer cut into slices of at most 5 mm */
  type Node = { C: number; links: [number, number][] };
  const nodes: Node[] = [], inside: number[] = [], outside: number[] = [];
  const add = (C: number) => { nodes.push({ C, links: [] }); return nodes.length - 1; };
  const link = (a: number, b: number, g: number) => { nodes[a].links.push([b, g]); nodes[b].links.push([a, g]); };
  c.S.forEach(s => {
    const cut: Slab[] = [];
    s.slabs.forEach(l => { const n = l.rc > 0 ? Math.max(2, Math.ceil(l.L / 0.005)) : 1; for (let k = 0; k < n; k++) cut.push({ ...l, L: l.L / n }); });
    let prev = add(0); outside.push(prev);
    cut.forEach(l => { const next = add(0); nodes[prev].C += l.rc * l.L / 2 * s.A; nodes[next].C += l.rc * l.L / 2 * s.A; link(prev, next, l.k / l.L * s.A); prev = next; });
    inside.push(prev);
  });
  const N = nodes.length;
  /* M T(t+dt) = C/dt T(t) + b(t+dt), with M = C/dt + conductances */
  const M = Array.from({ length: N }, () => new Float64Array(N));
  nodes.forEach((n, i) => { M[i][i] += n.C / dt; n.links.forEach(([j, g]) => { M[i][i] += g; M[i][j] -= g; }); });
  c.S.forEach((s, j) => {
    const i = inside[j];
    /* inside face: convection to the room air (at 0) and long-wave exchange with the area-weighted mean surface */
    M[i][i] += s.A * (s.hci + H.ri);
    c.S.forEach((t, k) => { M[i][inside[k]] -= s.A * H.ri * t.A / At; });
    if (s.ext) M[outside[j]][outside[j]] += s.A * (H.co + H.ro);
  });
  /* LU factorisation once */
  const P = Array.from({ length: N }, (_, i) => i);
  for (let k = 0; k < N; k++) {
    let p = k; for (let i = k + 1; i < N; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]]; [P[k], P[p]] = [P[p], P[k]];
    for (let i = k + 1; i < N; i++) { const f = M[i][k] /= M[k][k]; if (f) for (let j = k + 1; j < N; j++) M[i][j] -= f * M[k][j]; }
  }
  const solve = (b: Float64Array) => {
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) { let s = b[P[i]]; for (let j = 0; j < i; j++) s -= M[i][j] * x[j]; x[i] = s; }
    for (let i = N - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j < N; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  };
  let T = new Float64Array(N);
  const loadAt = (T: Float64Array) => c.S.reduce((a, s, j) => a + s.A * s.hci * T[inside[j]], 0);
  const out = new Array(24).fill(0), steps = 86400 / dt;
  for (let d = 0; d < days; d++) for (let n = 1; n <= steps; n++) {
    const t = n * dt / 3600, b = new Float64Array(N);
    nodes.forEach((x, i) => { b[i] = x.C / dt * T[i]; });
    c.S.forEach((s, j) => {
      if (s.ext) b[outside[j]] += s.A * c.ext[j](t);
      b[inside[j]] += s.A * c.rad(t) / At;
    });
    T = solve(b);
    if (d === days - 1 && n % (3600 / dt) === 0) out[n / (3600 / dt) - 1] = loadAt(T);
  }
  return out;
}

const plaster = (t: number) => toSlabs([{ m: 'plaster', t }]);
describe('heat balance solver verification', () => {
  it('matches an independent time-stepping simulation of a whole room hour by hour', () => {
    const S: Surface[] = [
      /* west wall: default UAE block wall fitted to U 0.57 */
      { group: 'walls', A: 12, az: 270, tilt: 90, slabs: fitU('wall', 0.57), hci: H.wall, ext: true, alpha: 0.7 },
      /* west glazing, no thermal mass */
      { group: 'gCond', A: 6, az: 270, tilt: 90, slabs: glassSlabs(2.1), hci: H.wall, ext: true, alpha: 0 },
      /* roof slab */
      { group: 'roof', A: 20, az: 0, tilt: 0, slabs: fitU('roof', 0.3), hci: H.ceil, ext: true, alpha: 0.7 },
      /* floor and internal walls next to rooms at the same set-point */
      { group: 'mass', A: 20, az: 0, tilt: 180, slabs: halfSlabs(fitU('floor', 0)), hci: H.floor, ext: false, alpha: 0, floor: true },
      { group: 'mass', A: 30, az: 0, tilt: 90, slabs: halfSlabs([...plaster(15), ...toSlabs([{ m: 'hb100', t: 100 }]), ...plaster(15)]), hci: H.wall, ext: false, alpha: 0 },
    ];
    /* forcings per m² (outside faces) and in K (rooms), relative to a 24 °C room */
    const solAirWall = wave(17 * 12, 17 * 14, 16), glass = wave(17 * 8, 17 * 6, 15), roof = wave(17 * 20, 17 * 25, 13);
    const c: Case = { S, ext: [solAirWall, glass, roof, () => 0, () => 0], bnd: [], rad: wave(600, 500, 14) };
    const fd = frequencyDomain(c), td = timeStepping(c);
    const peak = Math.max(...td);
    td.forEach((x, i) => expect(Math.abs(fd[i] - x) / peak, `hour ${i + 1}: frequency ${fd[i].toFixed(1)} W, time-stepping ${x.toFixed(1)} W`).toBeLessThan(0.01));
  }, 60000);

  it('matches the time-stepping simulation for a partition to a hot unconditioned space', () => {
    const film: Slab = { k: 1, rc: 0, L: 0.13 };
    const part: Surface = { group: 'partW', A: 15, az: 0, tilt: 90, slabs: [film, ...fitU('partition', 2.0)], hci: H.wall, ext: false, alpha: 0, tb: () => [] };
    const mass: Surface = { group: 'mass', A: 40, az: 0, tilt: 180, slabs: halfSlabs(fitU('floor', 0)), hci: H.floor, ext: false, alpha: 0, floor: true };
    /* a store room swinging 8–20 K above the room; the far face is held there through the stiff link */
    const hot = wave(14, 6, 17);
    const c: Case = { S: [part, mass], ext: [], bnd: [hot], rad: () => 0 };
    const fd = frequencyDomain(c);
    /* reference: the far face as an outside face with a near-infinite film coefficient, which imposes its temperature */
    const S2: Surface[] = [{ ...part, ext: true, tb: undefined }, mass];
    const big = 1e6, saved = { co: H.co, ro: H.ro };
    H.co = big; H.ro = 0;
    try {
      const td = timeStepping({ S: S2, ext: [t => big * hot(t), () => 0], bnd: [], rad: () => 0 });
      const peak = Math.max(...td.map(Math.abs));
      td.forEach((x, i) => expect(Math.abs(fd[i] - x) / peak, `hour ${i + 1}`).toBeLessThan(0.01));
      expect(Math.min(...fd)).toBeGreaterThan(0);
    } finally { H.co = saved.co; H.ro = saved.ro; }
  }, 60000);

  it('conserves energy: the daily mean load through a wall equals U × A × the mean temperature difference', () => {
    const slabs = fitU('wall', 0.57), A = 10;
    const S: Surface[] = [{ group: 'walls', A, az: 0, tilt: 90, slabs, hci: H.wall, ext: true, alpha: 0 }];
    const dT = wave(10, 8, 15), load = frequencyDomain({ S, ext: [t => (H.co + H.ro) * dT(t)], bnd: [], rad: () => 0 });
    const U = 1 / (1 / (H.co + H.ro) + slabR(slabs) + 1 / H.wall);
    expect(load.reduce((a, x) => a + x, 0) / 24).toBeCloseTo(U * A * 10, 6);
    /* and the heavy wall delays the 15:00 outdoor peak by several hours */
    const pk = load.indexOf(Math.max(...load)) + 1;
    expect(pk > 15 ? pk - 15 : pk + 9).toBeGreaterThanOrEqual(4);
  });
});
