/* Duct sizing (ASHRAE Fundamentals Ch. 21 method, as DBC H.4.12.2 requires): air properties at the site, friction
   from Darcy–Weisbach with the Colebrook equation, round sizes and equivalent rectangular sizes (Huebscher), sizing by
   equal friction or by maximum velocity, fitting losses as C × velocity pressure, and the total pressure along every
   path from the unit to a terminal. The worst path sets the fan's external static pressure.
   Fitting coefficients here are typical starting values; the user replaces them with the manufacturer's or the
   ASHRAE Duct Fitting Database coefficient for the actual fitting. */

import { ashraeVelocity, noiseFor, type DuctLocation } from './acoustics';

export type DuctShape = 'round' | 'rect';
export type DuctMethod = 'friction' | 'velocity';
export type SectionKind = 'main' | 'branch' | 'runout';

export interface DuctFitting { type: string; qty: number; c?: number }
export interface DuctSection {
  id: string; name: string; parent: string | null; kind: SectionKind; length: number;
  /* a terminal section serves one room: its airflow is the room's supply air per unit × units */
  room?: string; units?: number;
  /* a space entered by hand (independent duct sizing, or extra air): its airflow, L/s, and its room type for the
     ASHRAE noise criterion (HVAC Applications Table 1 by NOVAC room type id) */
  flow?: number; space?: string;
  /* pressure drop of the terminal device (diffuser or grille) at the end of this section, Pa */
  terminalPa?: number;
  fittings: DuctFitting[];
}
export interface DuctSystem {
  id: string; name: string; shape: DuctShape; method: DuctMethod;
  /* equal friction target, Pa/m; velocity limits by section kind, m/s */
  frictionTarget: number; frictionMax: number; vMax: Record<SectionKind, number>;
  /* rectangular ducts: maximum aspect ratio, and an optional fixed depth (mm) for ceiling voids */
  maxAspect: number; fixedDepth?: number;
  roughness: number; airTemp: number;
  /* unit-side items outside the duct network counted in the external static pressure, Pa */
  allowancePa: number;
  /* velocity limits: ASHRAE acoustic limits by the rooms served (HVAC Applications Ch. 49 Table 8), or the custom vMax */
  limits?: 'ashrae' | 'custom'; location?: DuctLocation;
  /* room NC/RC overrides by room id; otherwise the room type's ASHRAE Table 1 value */
  nc?: Record<string, number>;
  sections: DuctSection[];
}

/* ---------- air ---------- */
/* density from elevation (standard atmosphere) and air temperature, kg/m³ */
export function airDensity(elevation: number, tempC: number) {
  const p = 101325 * Math.pow(1 - 2.25577e-5 * elevation, 5.2559);
  return p / (287.055 * (tempC + 273.15));
}
/* dynamic viscosity of air, Pa·s (Sutherland) */
export const airViscosity = (tempC: number) => { const t = tempC + 273.15; return 1.458e-6 * Math.pow(t, 1.5) / (t + 110.4); };

/* ---------- friction ---------- */
/* Darcy friction factor: laminar below Re 2300, Colebrook equation otherwise (solved by iteration) */
export function frictionFactor(re: number, relRough: number) {
  if (re <= 0) return 0;
  if (re < 2300) return 64 / re;
  let x = 1 / Math.sqrt(0.02);
  for (let i = 0; i < 50; i++) {
    const nx = -2 * Math.log10(relRough / 3.7 + 2.51 * x / re);
    if (Math.abs(nx - x) < 1e-10) { x = nx; break; }
    x = nx;
  }
  return 1 / (x * x);
}
/* friction loss per metre, Pa/m, for a flow (m³/s) in a duct of hydraulic diameter dh (m) and area (m²) */
export function frictionPerMetre(q: number, dh: number, area: number, rho: number, mu: number, roughness: number) {
  if (q <= 0 || dh <= 0) return 0;
  const v = q / area, re = rho * v * dh / mu, f = frictionFactor(re, roughness / dh);
  return f / dh * rho * v * v / 2;
}

/* ---------- sizes ---------- */
/* equivalent round diameter of a rectangular duct for equal friction and flow (Huebscher), same units as a and b */
export const equivDiameter = (a: number, b: number) => 1.30 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25);
/* standard round sizes, mm */
export const ROUND_MM = [80, 100, 125, 150, 160, 180, 200, 224, 250, 280, 300, 315, 350, 355, 400, 450, 500, 560, 600, 630, 700, 710, 800, 900, 1000, 1120, 1250, 1400, 1600];
/* rectangular sides in 50 mm steps */
const RECT_MM = Array.from({ length: 60 }, (_, i) => 100 + i * 50);

export interface DuctSize { shape: DuctShape; d?: number; w?: number; h?: number; de: number; area: number; dh: number }
const roundSize = (d: number): DuctSize => ({ shape: 'round', d, de: d, area: Math.PI * (d / 1000) ** 2 / 4, dh: d / 1000 });
const rectSize = (w: number, h: number): DuctSize => ({ shape: 'rect', w, h, de: equivDiameter(w, h), area: (w / 1000) * (h / 1000), dh: 2 * (w / 1000) * (h / 1000) / ((w + h) / 1000) });
export const sizeLabel = (s: DuctSize) => s.shape === 'round' ? `Ø${s.d}` : `${s.w} × ${s.h}`;

/* the smallest standard size that meets both the friction target (equal friction method only) and the velocity limit */
export function selectSize(q: number, sys: DuctSystem, vMax: number, rho: number, mu: number): DuctSize {
  const ok = (s: DuctSize) => {
    if (q / s.area > vMax + 1e-9) return false;
    return sys.method === 'velocity' || frictionPerMetre(q, s.dh, s.area, rho, mu, sys.roughness / 1000) <= sys.frictionTarget + 1e-9;
  };
  if (sys.shape === 'round') return ROUND_MM.map(roundSize).find(ok) ?? roundSize(ROUND_MM[ROUND_MM.length - 1]);
  /* rectangular: within the aspect limit (and the fixed depth, if set), the passing size with the smallest area, then the squarer one */
  const depths = sys.fixedDepth ? [sys.fixedDepth] : RECT_MM;
  let best: DuctSize | null = null;
  for (const h of depths) for (const w of RECT_MM) {
    if (w < h || w / h > sys.maxAspect + 1e-9) continue;
    const s = rectSize(w, h);
    if (ok(s) && (!best || s.area < best.area - 1e-9 || (Math.abs(s.area - best.area) < 1e-9 && w / h < best.w! / best.h!))) best = s;
  }
  return best ?? rectSize(RECT_MM[RECT_MM.length - 1], sys.fixedDepth ?? RECT_MM[RECT_MM.length - 1]);
}

/* ---------- fittings ---------- */
/* typical loss coefficients C (on the section's velocity pressure); editable per fitting */
export const FITTINGS: { id: string; label: string; c: number }[] = [
  { id: 'elbow-r', label: '90° elbow, round, smooth (R/D 1.5)', c: 0.15 },
  { id: 'elbow-vanes', label: '90° elbow, rectangular, turning vanes', c: 0.25 },
  { id: 'elbow-mitre', label: '90° elbow, rectangular, mitred, no vanes', c: 1.2 },
  { id: 'elbow-45', label: '45° elbow', c: 0.1 },
  { id: 'tee-branch', label: 'Branch take-off (branch side)', c: 0.6 },
  { id: 'tee-main', label: 'Branch take-off (straight through)', c: 0.1 },
  { id: 'reducer', label: 'Reducer / transition', c: 0.05 },
  { id: 'damper', label: 'Volume control damper, open', c: 0.2 },
  { id: 'fire-damper', label: 'Fire damper, open', c: 0.2 },
  { id: 'flex', label: 'Flexible connection', c: 0.1 },
];
export const fittingC = (f: DuctFitting) => f.c ?? FITTINGS.find(x => x.id === f.type)?.c ?? 0;

/* ---------- network ---------- */
export interface SectionResult {
  id: string; flow: number; size: DuctSize; velocity: number; frictionPaM: number; frictionPa: number;
  fittingsPa: number; terminalPa: number; sectionPa: number; pathPa: number;
  warnings: string[]; depth: number; leaf: boolean;
  /* velocity limit used for sizing, m/s, and the NC/RC it was set from (the strictest room downstream; ASHRAE limits only) */
  vLimit: number; nc?: number;
}
/* ASHRAE compliance of one room: every section on its path from the unit within that room's Table 8 limit */
export interface SpaceCheck {
  /* the room linked from the heat load, or none for a space entered by hand (named by its section) */
  room?: string; section: string; nc: number; complies: boolean;
  /* the section on the path closest to (or furthest over) its limit */
  worst: { section: string; velocity: number; limit: number; kind: SectionKind };
}
export interface DuctResult {
  rho: number; rows: SectionResult[]; criticalPath: string[]; criticalPa: number; esp: number; totalFlow: number; errors: string[];
  spaces: SpaceCheck[];
}

/* airflow of each terminal: linked room's supply air per unit × units, or the fixed flow; L/s */
export type RoomFlow = (roomId: string) => number | undefined;
/* a room's acoustic design criterion, NC/RC */
export type RoomNC = (roomId: string) => number | undefined;

export const usesAshrae = (sys: DuctSystem) => (sys.limits ?? 'ashrae') === 'ashrae';
export const locationOf = (sys: DuctSystem): DuctLocation => sys.location ?? 'ceiling';

export function calcDuctSystem(sys: DuctSystem, elevation: number, roomFlow: RoomFlow, roomNC: RoomNC = () => undefined): DuctResult {
  const rho = airDensity(elevation, sys.airTemp), mu = airViscosity(sys.airTemp), errors: string[] = [];
  const byId = new Map(sys.sections.map(s => [s.id, s]));
  const kids = new Map<string, DuctSection[]>();
  sys.sections.forEach(s => { if (s.parent && byId.has(s.parent)) { const l = kids.get(s.parent) ?? []; l.push(s); kids.set(s.parent, l); } });
  const roots = sys.sections.filter(s => !s.parent || !byId.has(s.parent));

  /* airflow: a terminal's own flow plus everything downstream, L/s; a parent loop is reported, not followed */
  const flows = new Map<string, number>(), visiting = new Set<string>();
  const flowOf = (s: DuctSection): number => {
    if (flows.has(s.id)) return flows.get(s.id)!;
    if (visiting.has(s.id)) { errors.push(`${s.name || 'A section'} is connected in a loop`); return 0; }
    visiting.add(s.id);
    let own = 0;
    if (s.room) { const f = roomFlow(s.room); if (f == null) errors.push(`${s.name || 'A section'} serves a room that no longer exists`); else own = f * Math.max(1, s.units ?? 1); }
    else if (s.flow) own = s.flow;
    const q = own + (kids.get(s.id) ?? []).reduce((a, k) => a + flowOf(k), 0);
    visiting.delete(s.id); flows.set(s.id, q); return q;
  };
  sys.sections.forEach(flowOf);

  /* a terminal's own criterion: a linked room's, or a hand-entered space's (its override, else its room type's Table 1 value) */
  const terminalNC = (s: DuctSection) => s.room ? roomNC(s.room) : s.space && (s.flow ?? 0) > 0 ? sys.nc?.[s.id] ?? noiseFor(s.space).nc : undefined;
  /* acoustic criterion of each section: the strictest (lowest) NC/RC of the rooms it serves */
  const ashrae = usesAshrae(sys), loc = locationOf(sys), ncs = new Map<string, number | undefined>();
  const ncOf = (s: DuctSection, seen = new Set<string>()): number | undefined => {
    if (ncs.has(s.id)) return ncs.get(s.id);
    if (seen.has(s.id)) return undefined;
    seen.add(s.id);
    const own = terminalNC(s);
    const all = [own, ...(kids.get(s.id) ?? []).map(k => ncOf(k, seen))].filter((x): x is number => x != null);
    const nc = all.length ? Math.min(...all) : undefined;
    ncs.set(s.id, nc); return nc;
  };
  const limitOf = (s: DuctSection) => { const nc = ashrae ? ncOf(s) : undefined; return { nc, v: nc != null ? ashraeVelocity(nc, loc, sys.shape, s.kind) : sys.vMax[s.kind] }; };

  const rows: SectionResult[] = [], res = new Map<string, SectionResult>();
  const walk = (s: DuctSection, upPa: number, depth: number) => {
    if (res.has(s.id)) return;
    const qL = flows.get(s.id) ?? 0, q = qL / 1000, warnings: string[] = [], lim = limitOf(s);
    const size = selectSize(q, sys, lim.v, rho, mu), v = q > 0 ? q / size.area : 0;
    const fPaM = frictionPerMetre(q, size.dh, size.area, rho, mu, sys.roughness / 1000);
    const vp = rho * v * v / 2;
    const fittingsPa = s.fittings.reduce((a, f) => a + fittingC(f) * Math.max(0, f.qty) * vp, 0);
    const terminalPa = Math.max(0, s.terminalPa ?? 0), frictionPa = fPaM * Math.max(0, s.length);
    const sectionPa = frictionPa + fittingsPa + terminalPa, pathPa = upPa + sectionPa;
    if (qL <= 0) warnings.push('No airflow: link a room or set the airflow');
    if (v > lim.v + 1e-6) warnings.push(`Velocity above ${Math.round(lim.v * 100) / 100} m/s even at the largest size`);
    if (fPaM > sys.frictionMax + 1e-6) warnings.push(`Friction above ${sys.frictionMax} Pa/m`);
    const r: SectionResult = { id: s.id, flow: qL, size, velocity: v, frictionPaM: fPaM, frictionPa, fittingsPa, terminalPa, sectionPa, pathPa, warnings, depth, leaf: !(kids.get(s.id)?.length), vLimit: lim.v, nc: lim.nc };
    res.set(s.id, r); rows.push(r);
    (kids.get(s.id) ?? []).forEach(k => walk(k, pathPa, depth + 1));
  };
  roots.forEach(s => walk(s, 0, 0));

  /* the worst path ends at the leaf with the highest running total */
  const leaves = rows.filter(r => r.leaf);
  const worst = leaves.reduce<SectionResult | null>((a, r) => !a || r.pathPa > a.pathPa ? r : a, null);
  const criticalPath: string[] = [];
  for (let s = worst ? byId.get(worst.id) : undefined; s; s = s.parent ? byId.get(s.parent) : undefined) {
    if (criticalPath.includes(s.id)) break;
    criticalPath.unshift(s.id);
  }
  const criticalPa = worst?.pathPa ?? 0;

  /* each room served: check every section on its path against the Table 8 limit for that room's own criterion */
  const spaces: SpaceCheck[] = [];
  sys.sections.forEach(t => {
    const nc = terminalNC(t);
    if (nc == null || !res.has(t.id)) return;
    let worstS: SpaceCheck['worst'] | null = null, ratio = -1;
    const seen = new Set<string>();
    for (let s: DuctSection | undefined = t; s && !seen.has(s.id); s = s.parent ? byId.get(s.parent) : undefined) {
      seen.add(s.id);
      const r = res.get(s.id); if (!r) continue;
      const limit = ashraeVelocity(nc, loc, sys.shape, s.kind), x = r.velocity / limit;
      if (x > ratio) { ratio = x; worstS = { section: s.id, velocity: r.velocity, limit, kind: s.kind }; }
    }
    if (worstS) spaces.push({ room: t.room, section: t.id, nc, complies: ratio <= 1 + 1e-9, worst: worstS });
  });
  return { rho, rows, criticalPath, criticalPa, esp: criticalPa + Math.max(0, sys.allowancePa), totalFlow: roots.reduce((a, s) => a + (flows.get(s.id) ?? 0), 0), errors, spaces };
}

/* new systems size to the ASHRAE acoustic limits of the rooms served, with ducts above a suspended acoustic ceiling;
   the custom limits (typical low-velocity values) apply when the user switches to them or a section serves no room */
export function newDuctSystem(id: string, name: string): DuctSystem {
  return {
    id, name, shape: 'rect', method: 'friction', frictionTarget: 0.8, frictionMax: 1.5, limits: 'ashrae', location: 'ceiling',
    vMax: { main: 7.5, branch: 5, runout: 3.5 }, maxAspect: 4, roughness: 0.09, airTemp: 13, allowancePa: 0, sections: [],
  };
}
