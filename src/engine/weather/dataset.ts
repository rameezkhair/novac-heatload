/* Builds a complete hourly weather year from provider records: places each record in its local-standard-time hour,
   fills short gaps, derives what the source lacks (each derivation is recorded), and adds psychrometrics. */
import { sunGeom } from '../hbm/solar';
import { W_rh, dpOf, hOf, pressureAt, rhOf, wbOf } from '../psychro';
import type { Field, ProviderId, WeatherYear } from './types';

export const hoursIn = (year: number) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365) * 24;
/* day of year (1-based), month (0–11), day of month and hour ending (1–24) of record i */
export function when(year: number, i: number) {
  const t = new Date(Date.UTC(year, 0, 1) + Math.floor(i / 24) * 86400000);
  return { doy: Math.floor(i / 24) + 1, m: t.getUTCMonth(), d: t.getUTCDate(), h: i % 24 + 1 };
}

/* record index of an observation at unix time `sec`, tz hours ahead of UTC.
   'end': the value belongs to the hour ending at that instant (temperatures at hh:00, hour-mean radiation stamped at the hour end);
   'start': the value is the mean of the hour starting at that instant */
export function slotOf(year: number, tz: number, sec: number, stamp: 'end' | 'start') {
  const h = (sec * 1000 + tz * 3600000 - Date.UTC(year, 0, 1)) / 3600000;
  if (Math.abs(h - Math.round(h)) > 1e-6) return -1;
  return Math.round(h) - (stamp === 'end' ? 1 : 0);
}

export interface Meta { provider: ProviderId; source: string; attribution: string; lat: number; lon: number; elev: number; tz: number; year: number; label: string }
export class Builder {
  n: number; data: Partial<Record<Field, number[]>> = {};
  constructor(public meta: Meta) { this.n = hoursIn(meta.year); }
  put(f: Field, i: number, v: unknown) {
    if (i < 0 || i >= this.n || v == null || v === '' || !Number.isFinite(Number(v))) return;
    (this.data[f] ??= new Array(this.n).fill(NaN))[i] = Number(v);
  }
}

/* a field with more than this share of hours missing is dropped rather than interpolated */
const MAX_GAP_SHARE = 0.1;
const BOUNDS: Partial<Record<Field, [number, number]>> = {
  db: [-60, 65], dp: [-70, 40], rh: [0, 100], p: [50000, 110000], ws: [0, 80], wd: [0, 360], wg: [0, 120],
  ghi: [0, 1400], dni: [0, 1400], dhi: [0, 900], cloud: [0, 100], precip: [0, 500],
};

/* linear interpolation over NaN runs; returns the number of filled hours */
function fill(a: number[]) {
  let filled = 0, last = -1;
  for (let i = 0; i <= a.length; i++) {
    if (i < a.length && Number.isNaN(a[i])) continue;
    const gap = i - last - 1;
    if (gap > 0) {
      const v0 = last >= 0 ? a[last] : a[i], v1 = i < a.length ? a[i] : a[last];
      for (let k = last + 1; k < i; k++) a[k] = v0 + (v1 - v0) * (k - last) / (i - last);
      filled += gap;
    }
    last = i;
  }
  return filled;
}

export function finish(b: Builder): WeatherYear {
  const { meta, n } = b, data = b.data, derived: WeatherYear['derived'] = {}, filled: WeatherYear['filled'] = {};
  for (const f of Object.keys(data) as Field[]) {
    const a = data[f]!, lim = BOUNDS[f];
    if (lim) for (let i = 0; i < n; i++) if (a[i] < lim[0] || a[i] > lim[1]) a[i] = NaN;
    const miss = a.filter(Number.isNaN).length;
    if (miss === n || miss > n * MAX_GAP_SHARE) { delete data[f]; continue; }
    if (miss) filled[f] = fill(a);
  }
  if (!data.db) throw new Error('The source has no usable dry bulb temperature for this year.');
  const db = data.db, P = data.p ?? (derived.p = `standard atmosphere at ${Math.round(meta.elev)} m`, data.p = new Array(n).fill(pressureAt(meta.elev) * 1000));
  if (!data.rh && !data.dp) throw new Error('The source has no usable humidity (relative humidity or dew point) for this year.');
  if (!data.rh) { derived.rh = 'from dry bulb and dew point'; data.rh = db.map((t, i) => Math.min(100, rhOf(t, W_rh(Math.min(t, data.dp![i]), 100, P[i] / 1000), P[i] / 1000))); }
  if (!data.dp) { derived.dp = 'from dry bulb and relative humidity'; data.dp = db.map((t, i) => dpOf(W_rh(t, Math.max(0.5, data.rh![i]), P[i] / 1000), P[i] / 1000)); }
  /* split global into beam and diffuse with the Erbs correlation when only GHI is given */
  if (data.ghi && (!data.dni || !data.dhi)) {
    const dni: number[] = [], dhi: number[] = [];
    data.ghi.forEach((g, i) => {
      const w = when(meta.year, i), s = sunGeom(meta.lat, meta.lon, meta.tz, w.doy, w.h - 0.5), sinB = Math.sin(s.beta * Math.PI / 180);
      if (g <= 0 || sinB <= 0.01) { dni.push(0); dhi.push(Math.max(0, g)); return; }
      const kt = Math.min(1, g / (s.E0 * sinB)), fd = kt <= 0.22 ? 1 - 0.09 * kt : kt <= 0.8 ? 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4 : 0.165;
      dhi.push(g * fd); dni.push(Math.max(0, (g - g * fd) / sinB));
    });
    if (!data.dni) { data.dni = dni; derived.dni = 'from global horizontal (Erbs correlation)'; }
    if (!data.dhi) { data.dhi = dhi; derived.dhi = 'from global horizontal (Erbs correlation)'; }
  }
  return {
    key: weatherKey(meta), provider: meta.provider, source: meta.source, attribution: meta.attribution,
    lat: meta.lat, lon: meta.lon, elev: meta.elev, tz: meta.tz, year: meta.year, label: meta.label,
    n, data, derived, filled, retrieved: new Date().toISOString(),
  };
}

export const weatherKey = (r: { provider: string; lat: number; lon: number; year: number }) =>
  `${r.provider}:${r.lat.toFixed(3)},${r.lon.toFixed(3)}:${r.year}`;

/* psychrometric state of every hour at the measured station pressure */
export interface Psy { W: number[]; h: number[]; wb: number[] }
const psyCache = new WeakMap<WeatherYear, Psy>();
export function psychro(wx: WeatherYear): Psy {
  const hit = psyCache.get(wx); if (hit) return hit;
  const db = wx.data.db!, rh = wx.data.rh!, P = wx.data.p!;
  const W = db.map((t, i) => W_rh(t, Math.max(0, Math.min(100, rh[i])), P[i] / 1000));
  const r = { W, h: db.map((t, i) => hOf(t, W[i])), wb: db.map((t, i) => wbOf(t, W[i], P[i] / 1000)) };
  psyCache.set(wx, r); return r;
}

/* hours measured per field, as a share of the year */
export function completeness(wx: WeatherYear) {
  return (Object.keys(wx.data) as Field[]).map(f => ({ f, measured: !wx.derived[f], filled: wx.filled[f] ?? 0 }));
}
