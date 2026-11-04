/* Roof layout: a roof outline drawn on satellite imagery (latitude/longitude corners), packed with PV panels in rows.
   Rows are aligned with the roof's longest edge or run east–west; tilted rows are spaced so that the row in front does
   not shade the next at solar noon on the winter solstice. Panels must sit inside the roof by the edge setback. */
import type { Num } from './types';
import { num } from './util';

/* typical module sizes by cell format; ratings vary by maker and bin, so check the datasheet */
export interface Panel { id: string; label: string; w: number; l: number; wp: number }
export const PANELS: Panel[] = [
  { id: 'm10-108', label: '108 half-cell, M10 (182 mm), 430 Wp · 1,722 × 1,134 mm', l: 1.722, w: 1.134, wp: 430 },
  { id: 'm10-120', label: '120 half-cell, M10, 475 Wp · 1,903 × 1,134 mm', l: 1.903, w: 1.134, wp: 475 },
  { id: 'm10-144', label: '144 half-cell, M10, 550 Wp · 2,278 × 1,134 mm', l: 2.278, w: 1.134, wp: 550 },
  { id: 'g12-120', label: '120 half-cell, G12 (210 mm), 600 Wp · 2,172 × 1,303 mm', l: 2.172, w: 1.303, wp: 600 },
  { id: 'g12-132', label: '132 half-cell, G12, 670 Wp · 2,384 × 1,303 mm', l: 2.384, w: 1.303, wp: 670 },
  { id: 'g12r-132', label: '132 half-cell, G12R n-type, 710 Wp · 2,384 × 1,303 mm', l: 2.384, w: 1.303, wp: 710 },
];

export type LatLon = [number, number];
export interface RoofSettings {
  address?: string; lat?: number; lon?: number; zoom?: number;
  /* roof outline corners, [lat, lon] */
  poly?: LatLon[];
  /* panel: a standard size id, or 'custom' with its own size and rating */
  panel?: string; cW?: Num; cL?: Num; cWp?: Num;
  orient?: 'portrait' | 'landscape';
  /* tilt from horizontal, °; rows aligned with the roof's longest edge or east–west (facing south) */
  tilt?: Num; align?: 'edge' | 'ew';
  /* edge setback, m; extra gap between rows for maintenance access, m; gap between panels in a row, m */
  setback?: Num; rowGap?: Num; colGap?: Num;
  /* the panel count follows the layout */
  auto?: boolean;
}
export const ROOF_DEFAULTS: Required<Omit<RoofSettings, 'address' | 'lat' | 'lon'>> = {
  zoom: 19, poly: [], panel: 'm10-144', cW: 1.134, cL: 2.278, cWp: 550, orient: 'portrait', tilt: 10, align: 'edge',
  setback: 1, rowGap: 0.4, colGap: 0.02, auto: true,
};
export const roofOf = (r?: RoofSettings) => ({ ...ROOF_DEFAULTS, ...(r || {}) });

export function panelOf(r: ReturnType<typeof roofOf>): Panel {
  if (r.panel === 'custom') return { id: 'custom', label: 'Custom panel', w: Math.max(0.1, num(r.cW)), l: Math.max(0.1, num(r.cL)), wp: Math.max(0, num(r.cWp)) };
  return PANELS.find(p => p.id === r.panel) || PANELS[2];
}

/* local plane in metres around a reference point: x east, y north */
const R = 6378137, RAD = Math.PI / 180;
export function toLocal(poly: LatLon[], ref?: LatLon) {
  const [la0, lo0] = ref ?? [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
  const k = Math.cos(la0 * RAD);
  return { ref: [la0, lo0] as LatLon, pts: poly.map(([la, lo]) => [(lo - lo0) * RAD * R * k, (la - la0) * RAD * R] as [number, number]) };
}
export function toLatLon(ref: LatLon, x: number, y: number): LatLon {
  return [ref[0] + y / R / RAD, ref[1] + x / (R * Math.cos(ref[0] * RAD)) / RAD];
}

type P = [number, number];
export const area = (pts: P[]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
export const perimeter = (pts: P[]) => { let s = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; s += Math.hypot(x2 - x1, y2 - y1); } return s; };
function inside(pt: P, pts: P[]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToEdges(pt: P, pts: P[]) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length], dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(pt[0] - x1 - t * dx, pt[1] - y1 - t * dy));
  }
  return d;
}

/* winter-solstice solar-noon sun altitude at a latitude, °: the design angle for row spacing */
export const winterNoonAltitude = (lat: number) => 90 - Math.abs(lat) - 23.45;

export interface Layout {
  /* roof area and the area inside the setback, m², roof perimeter, m */
  roofM2: number; usableM2: number; perimM: number;
  /* panels: centre and corners in the local plane, and corners as latitude/longitude for drawing */
  count: number; kWp: number; panel: Panel;
  rects: LatLon[][];
  /* row direction, ° from east, counter-clockwise; panel azimuth, ° clockwise from north (the way the tilted face looks) */
  rowAngle: number; azimuth: number;
  /* along the slope: panel footprint depth, shading gap and row pitch, m; the sun altitude used */
  depth: number; shadeGap: number; pitch: number; sunAlt: number;
  /* ground coverage: panel area ÷ roof area */
  gcr: number;
}

export function layout(r: ReturnType<typeof roofOf>): Layout | null {
  const poly = r.poly || [];
  if (poly.length < 3) return null;
  const { ref, pts } = toLocal(poly), panel = panelOf(r);
  const roofM2 = area(pts), perimM = perimeter(pts);
  /* row direction: along the longest edge, or east–west */
  let ang = 0;
  if (r.align !== 'ew') {
    let best = -1;
    for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length], L = Math.hypot(x2 - x1, y2 - y1); if (L > best) { best = L; ang = Math.atan2(y2 - y1, x2 - x1); } }
    /* keep the row direction within ±90° of east, so the tilted face looks towards the equator side */
    if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
  }
  const c = Math.cos(-ang), s = Math.sin(-ang);
  /* rotate the roof so rows run along u */
  const uv: P[] = pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const tilt = Math.max(0, Math.min(60, num(r.tilt))) * RAD;
  const along = r.orient === 'landscape' ? panel.l : panel.w, slope = r.orient === 'landscape' ? panel.w : panel.l;
  const depth = slope * Math.cos(tilt), height = slope * Math.sin(tilt);
  const sunAlt = Math.max(5, winterNoonAltitude(ref[0]));
  const shadeGap = tilt > 0 ? height / Math.tan(sunAlt * RAD) : 0;
  const pitch = depth + Math.max(shadeGap, num(r.rowGap)), step = along + Math.max(0, num(r.colGap)), sb = Math.max(0, num(r.setback));
  const us = uv.map(p => p[0]), vs = uv.map(p => p[1]);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  /* a panel fits when its corners and edge midpoints are inside the roof and at least the setback from every edge */
  const fits = (u: number, v: number) => {
    /* probes sit 1 mm inside the panel's outline, so a panel exactly on the roof edge (zero setback) still counts */
    const e = 0.001, a0 = u + e, a1 = u + along - e, b0 = v + e, b1 = v + depth - e, am = u + along / 2, bm = v + depth / 2;
    const probes: P[] = [[a0, b0], [a1, b0], [a1, b1], [a0, b1], [am, b0], [am, b1], [a0, bm], [a1, bm]];
    return probes.every(p => inside(p, uv) && distToEdges(p, uv) >= sb - e - 1e-9);
  };
  /* try a few grid offsets and keep the one that fits most panels */
  let bestSet: P[] = [];
  for (const fu of [0, 0.25, 0.5, 0.75]) for (const fv of [0, 0.25, 0.5, 0.75]) {
    const set: P[] = [];
    for (let v = v0 + sb + fv * pitch; v + depth <= v1 - sb + 0.001; v += pitch)
      for (let u = u0 + sb + fu * step; u + along <= u1 - sb + 0.001; u += step) if (fits(u, v)) set.push([u, v]);
    if (set.length > bestSet.length) bestSet = set;
  }
  /* back to the local plane, then latitude/longitude */
  const ci = Math.cos(ang), si = Math.sin(ang), back = (u: number, v: number): P => [u * ci - v * si, u * si + v * ci];
  const rects = bestSet.map(([u, v]) => ([[u, v], [u + along, v], [u + along, v + depth], [u, v + depth]] as P[]).map(q => { const [x, y] = back(q[0], q[1]); return toLatLon(ref, x, y); }));
  /* usable area inside the setback, estimated from the outline: area − perimeter × setback + 4 × setback² (exact for a rectangle) */
  const usableM2 = Math.max(0, roofM2 - perimM * sb + 4 * sb * sb);
  /* the face tilts up away from the equator, so it looks towards it: rows along u, face normal on the −v side in the northern hemisphere */
  const rowDeg = ang / RAD, azimuth = ((180 - rowDeg) % 360 + 360) % 360;
  const count = bestSet.length;
  return {
    roofM2, usableM2, perimM, count, kWp: count * panel.wp / 1000, panel, rects, rowAngle: rowDeg, azimuth: tilt > 0 ? azimuth : 180,
    depth, shadeGap, pitch, sunAlt, gcr: roofM2 > 0 ? count * panel.w * panel.l / roofM2 : 0,
  };
}

/* Google Solar API (buildingInsights:findClosest): roof segments and the maximum panel count Google lays out.
   Needs the user's own API key with the Solar API enabled. */
export interface GoogleRoof {
  maxPanels: number; panelWp: number; panelW: number; panelL: number; maxAreaM2: number; quality: string; imagery: string;
  segments: { pitch: number; azimuth: number; areaM2: number }[];
}
export async function googleBuildingInsights(lat: number, lon: number, key: string, signal?: AbortSignal): Promise<GoogleRoof> {
  const u = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lon}&requiredQuality=MEDIUM&key=${encodeURIComponent(key)}`;
  const res = await fetch(u, { signal });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Google Solar API error ${res.status}`);
  const sp = j.solarPotential || {};
  const d = j.imageryDate;
  return {
    maxPanels: sp.maxArrayPanelsCount ?? 0, panelWp: sp.panelCapacityWatts ?? 0, panelW: sp.panelWidthMeters ?? 0, panelL: sp.panelHeightMeters ?? 0,
    maxAreaM2: sp.maxArrayAreaMeters2 ?? 0, quality: j.imageryQuality || '', imagery: d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : '',
    segments: (sp.roofSegmentStats || []).map((x: any) => ({ pitch: x.pitchDegrees ?? 0, azimuth: x.azimuthDegrees ?? 0, areaM2: x.stats?.areaMeters2 ?? 0 })),
  };
}

/* OpenStreetMap Nominatim address search (no key; light use only, one search at a time) */
export interface Place { label: string; lat: number; lon: number }
export async function searchAddress(q: string, signal?: AbortSignal): Promise<Place[]> {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ae&q=${encodeURIComponent(q)}`;
  const res = await fetch(u, { signal, headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const j = await res.json();
  return (Array.isArray(j) ? j : []).map((x: any) => ({ label: String(x.display_name), lat: Number(x.lat), lon: Number(x.lon) }));
}
