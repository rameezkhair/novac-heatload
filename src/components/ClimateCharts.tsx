/* Climate analysis of the loaded weather year, after the standard Ladybug Tools views: an hourly heatmap, a psychrometric
   chart of every hour, the sun path coloured by temperature and a wind rose. Charts are SVG strings built from numbers
   only, so injecting them is safe. */
import { useMemo, useState } from 'react';
import { MONTHS } from '../engine/climate';
import { sunGeom } from '../engine/hbm/solar';
import { W_rh } from '../engine/psychro';
import { fmt } from '../engine/util';
import { psychro, when } from '../engine/weather/dataset';
import type { WeatherYear } from '../engine/weather/types';

/* sequential blue → yellow → red scale for values from 0 to 1 */
const STOPS = [[44, 123, 182], [171, 217, 233], [255, 255, 191], [253, 174, 97], [215, 25, 28]];
export function ramp(t: number) {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const txt = (x: number, y: number, s: string, a = 'middle', cls = 'hr-tick') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${a}" class="${cls}">${s}</text>`;
function legend(x: number, y: number, w: number, lo: number, hi: number, unit: string, d = 0) {
  let s = '';
  for (let i = 0; i < 40; i++) s += `<rect x="${(x + i * w / 40).toFixed(1)}" y="${y}" width="${(w / 40 + 0.5).toFixed(1)}" height="8" fill="${ramp(i / 39)}"/>`;
  return s + txt(x, y + 20, fmt(lo, d), 'start') + txt(x + w, y + 20, fmt(hi, d) + ' ' + unit, 'end');
}

type HeatField = 'db' | 'rh' | 'h' | 'W' | 'ghi' | 'ws';
const HEAT: Record<HeatField, { label: string; unit: string; d: number }> = {
  db: { label: 'Dry bulb', unit: '°C', d: 0 }, rh: { label: 'Relative humidity', unit: '%', d: 0 }, h: { label: 'Enthalpy', unit: 'kJ/kg', d: 0 },
  W: { label: 'Humidity ratio', unit: 'g/kg', d: 0 }, ghi: { label: 'Global horizontal irradiance', unit: 'W/m²', d: 0 }, ws: { label: 'Wind speed', unit: 'm/s', d: 1 },
};
function series(wx: WeatherYear, f: HeatField): number[] | undefined {
  if (f === 'h') return psychro(wx).h;
  if (f === 'W') return psychro(wx).W.map(w => w * 1000);
  return wx.data[f];
}

/* day of year across, hour of day down */
export function heatmapSVG(wx: WeatherYear, f: HeatField) {
  const v = series(wx, f); if (!v) return '';
  const days = wx.n / 24, W = 760, H = 250, ml = 40, mr = 8, mt = 8, mb = 46, cw = (W - ml - mr) / days, ch = (H - mt - mb) / 24;
  let lo = Infinity, hi = -Infinity; v.forEach(x => { if (x < lo) lo = x; if (x > hi) hi = x; });
  const span = hi - lo || 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hourly ${HEAT[f].label.toLowerCase()} heatmap, ${fmt(lo, 1)} to ${fmt(hi, 1)} ${HEAT[f].unit}">`;
  for (let k = 0; k < days; k++) for (let h = 0; h < 24; h++)
    s += `<rect x="${(ml + k * cw).toFixed(2)}" y="${(mt + h * ch).toFixed(2)}" width="${(cw + 0.3).toFixed(2)}" height="${(ch + 0.3).toFixed(2)}" fill="${ramp((v[k * 24 + h] - lo) / span)}"/>`;
  for (const h of [0, 6, 12, 18, 24]) s += txt(ml - 6, mt + h * ch + 3.5, String(h).padStart(2, '0') + ':00', 'end');
  MONTHS.forEach((m, i) => { const k = (Date.UTC(wx.year, i, 1) - Date.UTC(wx.year, 0, 1)) / 86400000; s += txt(ml + (k + 15) * cw, H - mb + 14, m); });
  return s + legend(ml, H - 22, 220, lo, hi, HEAT[f].unit, HEAT[f].d) + '</svg>';
}

/* hours in each 1 K × 1 g/kg cell, over the saturation curve and relative humidity lines */
export function psychroCloudSVG(wx: WeatherYear, mark?: { t: number; w: number; label: string }[]) {
  const psy = psychro(wx), db = wx.data.db!, P = wx.data.p!.reduce((a, x) => a + x, 0) / wx.n / 1000;
  const x0 = Math.min(10, Math.floor(Math.min(...db) / 5) * 5), x1 = Math.max(50, Math.ceil(Math.max(...db) / 5) * 5), y1 = Math.max(30, Math.ceil(Math.max(...psy.W) * 1000 / 5) * 5);
  const W = 760, H = 420, ml = 40, mr = 52, mt = 10, mb = 60;
  const X = (t: number) => ml + (t - x0) / (x1 - x0) * (W - ml - mr), Y = (w: number) => H - mb - w / y1 * (H - mt - mb);
  const bins = new Map<string, number>(); let top = 0;
  db.forEach((t, i) => { const key = Math.floor(t) + ',' + Math.floor(psy.W[i] * 1000); const c = (bins.get(key) || 0) + 1; bins.set(key, c); if (c > top) top = c; });
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Psychrometric chart of all ${wx.n} hours">`;
  for (let t = x0; t <= x1; t += 5) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${Y(0)}" y2="${Y(y1)}" class="hr-grid"/>` + txt(X(t), Y(0) + 14, String(t));
  for (let w = 0; w <= y1; w += 5) s += `<line x1="${X(x0)}" x2="${X(x1)}" y1="${Y(w)}" y2="${Y(w)}" class="hr-grid"/>` + txt(X(x1) + 6, Y(w) + 3.5, String(w), 'start');
  bins.forEach((c, key) => { const [t, w] = key.split(',').map(Number); s += `<rect x="${X(t).toFixed(1)}" y="${Y(w + 1).toFixed(1)}" width="${(X(t + 1) - X(t)).toFixed(1)}" height="${(Y(w) - Y(w + 1)).toFixed(1)}" fill="${ramp(Math.log(c) / Math.log(top || 2))}"><title>${t}–${t + 1} °C, ${w}–${w + 1} g/kg: ${c} h</title></rect>`; });
  const curve = (rh: number) => { let d = ''; for (let t = x0; t <= x1; t += 0.5) { const w = W_rh(t, rh, P) * 1000; d += (d ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(Math.min(w, y1)).toFixed(1); if (w > y1) break; } return d; };
  s += `<defs><clipPath id="psyc"><rect x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}"/></clipPath></defs><g clip-path="url(#psyc)">`;
  for (let rh = 20; rh < 100; rh += 20) s += `<path d="${curve(rh)}" fill="none" class="cl-rh"/>`;
  s += `<path d="${curve(100)}" fill="none" class="cl-sat"/></g>`;
  (mark || []).forEach(m => { s += `<circle cx="${X(m.t)}" cy="${Y(m.w * 1000)}" r="5" class="cl-mark"/>` + txt(X(m.t) + 8, Y(m.w * 1000) - 6, m.label, 'start', 'cl-mlabel'); });
  s += txt((ml + W - mr) / 2, H - mb + 30, 'Dry bulb, °C') + `<text transform="translate(${W - 10},${(mt + H - mb) / 2}) rotate(90)" text-anchor="middle" class="hr-tick">Humidity ratio, g/kg</text>`;
  return s + legend(ml, H - 20, 220, 1, top, 'hours per cell (log scale)') + '</svg>';
}

/* equidistant sun path: altitude 90° at the centre, horizon at the rim; each daylight hour coloured by its dry bulb */
export function sunPathSVG(wx: WeatherYear) {
  const W = 420, c = W / 2, R = 170, db = wx.data.db!;
  let lo = Infinity, hi = -Infinity; db.forEach(x => { if (x < lo) lo = x; if (x > hi) hi = x; });
  const pt = (alt: number, az: number) => { const r = (90 - alt) / 90 * R, a = az * Math.PI / 180; return [c + r * Math.sin(a), c - r * Math.cos(a)]; };
  let s = `<svg viewBox="0 0 ${W} ${W + 30}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sun path at ${fmt(wx.lat, 2)}° N with hourly dry bulb">`;
  for (const alt of [0, 30, 60]) s += `<circle cx="${c}" cy="${c}" r="${(90 - alt) / 90 * R}" fill="none" class="hr-grid"/>` + (alt ? txt(c + 3, c - (90 - alt) / 90 * R - 3, alt + '°', 'start') : '');
  for (let az = 0; az < 360; az += 30) { const [x, y] = pt(0, az); s += `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" class="hr-grid"/>`; }
  ([['N', 0], ['E', 90], ['S', 180], ['W', 270]] as [string, number][]).forEach(([l, az]) => { const [x, y] = pt(-9, az); s += txt(x, y + 4, l, 'middle', 'cl-card'); });
  for (let i = 0; i < wx.n; i++) {
    const w = when(wx.year, i), g = sunGeom(wx.lat, wx.lon, wx.tz, w.doy, w.h - 0.5); if (g.beta <= 0) continue;
    const [x, y] = pt(g.beta, g.az); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${ramp((db[i] - lo) / (hi - lo || 1))}"/>`;
  }
  /* the 21st of June and December as reference arcs */
  for (const doy of [172, 355]) { let d = ''; for (let t = 4; t <= 20; t += 0.1) { const g = sunGeom(wx.lat, wx.lon, wx.tz, doy, t); if (g.beta < 0) continue; const [x, y] = pt(g.beta, g.az); d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); } s += `<path d="${d}" fill="none" class="cl-arc"/>`; }
  return s + legend(c - 110, W + 6, 220, lo, hi, '°C') + '</svg>';
}

/* frequency of wind from 16 directions, stacked by speed */
const SPEEDS = [0.5, 2, 4, 6, 8, Infinity];
export function windRoseSVG(wx: WeatherYear) {
  const ws = wx.data.ws, wd = wx.data.wd; if (!ws || !wd) return '';
  const counts = Array.from({ length: 16 }, () => new Array(SPEEDS.length - 1).fill(0)); let calm = 0;
  ws.forEach((v, i) => { if (v < SPEEDS[0]) { calm++; return; } const s = Math.round(((wd[i] % 360) + 360) % 360 / 22.5) % 16, b = SPEEDS.findIndex((x, k) => v >= x && v < SPEEDS[k + 1]); counts[s][b]++; });
  const tot = counts.map(r => r.reduce((a, x) => a + x, 0)), top = Math.max(...tot) / wx.n * 100 || 1;
  const W = 420, c = W / 2, R = 165, rOf = (pct: number) => pct / top * R;
  let s = `<svg viewBox="0 0 ${W} ${W + 30}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wind rose, calm ${fmt(calm / wx.n * 100, 0)}% of hours">`;
  const step = top > 10 ? 5 : top > 4 ? 2 : 1;
  for (let p = step; p <= top; p += step) s += `<circle cx="${c}" cy="${c}" r="${rOf(p)}" fill="none" class="hr-grid"/>` + txt(c + 3, c - rOf(p) - 2, p + '%', 'start');
  const wedge = (sec: number, r0: number, r1: number) => {
    const a0 = (sec * 22.5 - 10) * Math.PI / 180, a1 = (sec * 22.5 + 10) * Math.PI / 180, p = (r: number, a: number) => `${(c + r * Math.sin(a)).toFixed(1)} ${(c - r * Math.cos(a)).toFixed(1)}`;
    return `M${p(r0, a0)}L${p(r1, a0)}A${r1} ${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
  };
  counts.forEach((row, sec) => { let r = 0; row.forEach((n, b) => { const r1 = r + rOf(n / wx.n * 100); if (n) s += `<path d="${wedge(sec, r, r1)}" fill="${ramp(b / (row.length - 1))}" class="cl-wedge"/>`; r = r1; }); });
  ([['N', 0], ['E', 90], ['S', 180], ['W', 270]] as [string, number][]).forEach(([l, az]) => { const a = az * Math.PI / 180; s += txt(c + (R + 18) * Math.sin(a), c - (R + 18) * Math.cos(a) + 4, l, 'middle', 'cl-card'); });
  let lx = c - 170;
  SPEEDS.slice(0, -1).forEach((v, b) => { const l = b === SPEEDS.length - 2 ? `≥ ${v}` : `${v}–${SPEEDS[b + 1]}`; s += `<rect x="${lx}" y="${W + 6}" width="12" height="10" fill="${ramp(b / (SPEEDS.length - 2))}"/>` + txt(lx + 16, W + 15, l, 'start'); lx += 64; });
  return s + txt(lx + 4, W + 15, 'm/s', 'start') + '</svg>';
}

export function ClimateCharts({ wx, marks }: { wx: WeatherYear; marks: { t: number; w: number; label: string }[] }) {
  const [tab, setTab] = useState<'heat' | 'psy' | 'sun' | 'wind'>('heat');
  const [field, setField] = useState<HeatField>('db');
  const fields = (Object.keys(HEAT) as HeatField[]).filter(f => series(wx, f));
  const svg = useMemo(() => tab === 'heat' ? heatmapSVG(wx, field) : tab === 'psy' ? psychroCloudSVG(wx, marks) : tab === 'sun' ? sunPathSVG(wx) : windRoseSVG(wx),
    [wx, tab, field, marks]);
  const tabs: [typeof tab, string][] = [['heat', 'Hourly heatmap'], ['psy', 'Psychrometric chart'], ['sun', 'Sun path'], ['wind', 'Wind rose']];
  return <div className="hr-card climate">
    <h3>Climate analysis, {wx.label} {wx.year} <span className="muted">· every hour of the year</span></h3>
    <div className="cl-tabs" role="tablist">{tabs.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{l}</button>)}</div>
    {tab === 'heat' && <label className="fld cl-field" htmlFor="cl-field"><span className="fl">Show</span><span className="in-u"><select id="cl-field" value={field} onChange={e => setField(e.target.value as HeatField)}>
      {fields.map(f => <option key={f} value={f}>{HEAT[f].label}, {HEAT[f].unit}</option>)}</select></span></label>}
    {svg ? <div className={'cl-plot ' + tab} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="hint">This source has no wind direction data.</p>}
    <p className="hint">{tab === 'heat' ? 'Each column is a day, each row an hour (local standard time).'
      : tab === 'psy' ? 'Each cell counts the hours with that dry bulb and humidity ratio; the marked points are the project design conditions. Hover a cell for its hours.'
        : tab === 'sun' ? 'Sun positions at every daylight hour, coloured by that hour’s dry bulb; arcs are 21 June (outer, high) and 21 December. Centre is overhead, the rim is the horizon.'
          : `Share of hours the wind blows from each direction, by speed. Calm (below 0.5 m/s): ${fmt((wx.data.ws?.filter(v => v < 0.5).length ?? 0) / wx.n * 100, 1)}% of hours.`}</p>
  </div>;
}
