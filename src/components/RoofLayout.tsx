/* Roof layout on satellite imagery: find the building by address, click the roof corners, and the panels are laid out
   and counted. Imagery: Esri World Imagery tiles. Address search: OpenStreetMap Nominatim. Optional: Google Solar API
   (the user's own key, kept in this browser only) for Google's own roof segments and maximum panel count. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PANELS, googleBuildingInsights, layout, panelOf, roofOf, searchAddress, type GoogleRoof, type LatLon, type Place, type RoofSettings } from '../engine/roof';
import type { Num } from '../engine/types';
import { fmt, num } from '../engine/util';
import { NumInput } from './ui';

const TILE = 256, VW = 720, VH = 440;
const tileUrl = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
/* Web Mercator: world pixel of a latitude/longitude at zoom z, and back */
const worldPx = (lat: number, lon: number, z: number): [number, number] => {
  const s = TILE * 2 ** z, sin = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360 * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
};
const fromPx = (x: number, y: number, z: number): LatLon => {
  const s = TILE * 2 ** z, lon = x / s * 360 - 180, n = Math.PI - 2 * Math.PI * y / s;
  return [180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon];
};
const KEY = 'novac.googleSolarKey';
const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const putKey = (k: string) => { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

export function RoofLayout({ roof, site, onChange, onGoogle }: { roof?: RoofSettings; site: LatLon; onChange: (r: RoofSettings) => void; onGoogle: (g: GoogleRoof) => void }) {
  const r = roofOf(roof), L = useMemo(() => layout(r), [JSON.stringify(roof)]);
  const set = (patch: Partial<RoofSettings>) => onChange({ ...(roof || {}), ...patch });
  const center: LatLon = [r.lat ?? site[0], r.lon ?? site[1]], z = Math.max(15, Math.min(20, r.zoom));

  /* address search */
  const [q, setQ] = useState(r.address || '');
  const [found, setFound] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr('');
    try { const res = await searchAddress(q.trim()); setFound(res); if (!res.length) setErr('No match. Try the building name, street and area, or move the map by dragging.'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  /* map: drag to pan, click to add a roof corner */
  const [pan, setPan] = useState<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number; c: [number, number]; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [cx, cy] = pan ?? worldPx(center[0], center[1], z);
  useEffect(() => setPan(null), [r.lat, r.lon, z]);
  const toView = ([la, lo]: LatLon) => { const [x, y] = worldPx(la, lo, z); return [x - cx + VW / 2, y - cy + VH / 2]; };
  const evPt = (e: React.PointerEvent) => { const b = svg.current!.getBoundingClientRect(); return [(e.clientX - b.left) / b.width * VW, (e.clientY - b.top) / b.height * VH]; };
  const tiles: { x: number; y: number; px: number; py: number }[] = [];
  const n = 2 ** z, tx0 = Math.floor((cx - VW / 2) / TILE), tx1 = Math.floor((cx + VW / 2) / TILE), ty0 = Math.floor((cy - VH / 2) / TILE), ty1 = Math.floor((cy + VH / 2) / TILE);
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) if (y >= 0 && y < n) tiles.push({ x: ((x % n) + n) % n, y, px: x * TILE - cx + VW / 2, py: y * TILE - cy + VH / 2 });
  const mpp = Math.cos(center[0] * Math.PI / 180) * 2 * Math.PI * 6378137 / (TILE * n);
  const bar = [5, 10, 20, 50, 100].find(m => m / mpp > 70) ?? 100;

  /* Google Solar API */
  const [key, setKey] = useState(getKey);
  const [g, setG] = useState<GoogleRoof | null>(null), [gErr, setGErr] = useState(''), [gBusy, setGBusy] = useState(false);
  const google = async () => {
    setGBusy(true); setGErr(''); putKey(key.trim());
    try { setG(await googleBuildingInsights(center[0], center[1], key.trim())); } catch (e) { setG(null); setGErr((e as Error).message); } finally { setGBusy(false); }
  };

  const p = panelOf(r), poly = r.poly || [];
  const nf = (k: 'cW' | 'cL' | 'cWp' | 'tilt' | 'setback' | 'rowGap' | 'colGap', label: string, unit: string, step: number) =>
    <label className="fld" htmlFor={'roof-' + k}><span className="fl">{label}</span><span className="in-u"><NumInput id={'roof-' + k} label={label} min={0} step={step} value={(r[k] ?? '') as Num} onChange={v => set({ [k]: v })} /><span className="u">{unit}</span></span></label>;

  return <div className="roof">
    <div className="hr-filters">
      <label className="fld" htmlFor="roof-q" style={{ flex: '2 1 320px' }}><span className="fl">Building address</span><span className="in-u">
        <input id="roof-q" type="search" value={q} placeholder="e.g. Bay Square Building 5, Business Bay, Dubai" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} /></span></label>
      <div className="btns wx-jump"><button className="btn sm" type="button" disabled={busy || !q.trim()} onClick={search}>{busy ? 'Searching…' : 'Find'}</button></div>
    </div>
    {err && <p className="wx-status error" role="status">{err}</p>}
    {found && found.length > 0 && <ul className="roof-found">{found.map((f, i) => <li key={i}><button type="button" className="btn sm" onClick={() => { set({ address: f.label, lat: f.lat, lon: f.lon, zoom: 19, poly: [] }); setFound(null); }}>{f.label}</button></li>)}</ul>}

    <div className="roof-map">
      <svg ref={svg} viewBox={`0 0 ${VW} ${VH}`} role="application" aria-label="Satellite map. Drag to move, click to add a roof corner."
        onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); const [x, y] = evPt(e); drag.current = { x, y, c: [cx, cy], moved: false }; }}
        onPointerMove={e => { const d = drag.current; if (!d) return; const [x, y] = evPt(e); if (Math.hypot(x - d.x, y - d.y) > 4) d.moved = true; if (d.moved) setPan([d.c[0] - (x - d.x), d.c[1] - (y - d.y)]); }}
        onPointerUp={e => {
          const d = drag.current; drag.current = null; if (!d) return;
          if (d.moved) { const [la, lo] = fromPx(cx, cy, z); set({ lat: la, lon: lo }); return; }
          const [x, y] = evPt(e); set({ poly: [...poly, fromPx(x - VW / 2 + cx, y - VH / 2 + cy, z)] });
        }}>
        {tiles.map(t => <image key={`${t.x}-${t.y}-${t.px}`} href={tileUrl(z, t.x, t.y)} x={t.px} y={t.py} width={TILE} height={TILE} />)}
        {L && L.rects.map((rc, i) => <polygon key={i} points={rc.map(toView).map(v => v.join(',')).join(' ')} className="roof-panel" />)}
        {poly.length > 0 && <polygon points={poly.map(toView).map(v => v.join(',')).join(' ')} className={poly.length > 2 ? 'roof-outline' : 'roof-outline open'} />}
        {poly.map((pt, i) => { const [x, y] = toView(pt); return <circle key={i} cx={x} cy={y} r={4.5} className="roof-pt" />; })}
        <g transform={`translate(12 ${VH - 18})`}><rect x={-4} y={-14} width={bar / mpp + 8} height={22} rx={3} className="roof-scale-bg" /><line x1={0} x2={bar / mpp} y1={0} y2={0} className="roof-scale" /><text x={bar / mpp / 2} y={-3} textAnchor="middle" className="roof-scale-t">{bar} m</text></g>
      </svg>
      <div className="roof-tools">
        <button className="btn sm" type="button" aria-label="Zoom in" onClick={() => set({ zoom: Math.min(20, z + 1), ...(pan ? (() => { const [la, lo] = fromPx(cx, cy, z); return { lat: la, lon: lo }; })() : {}) })}>+</button>
        <button className="btn sm" type="button" aria-label="Zoom out" onClick={() => set({ zoom: Math.max(15, z - 1), ...(pan ? (() => { const [la, lo] = fromPx(cx, cy, z); return { lat: la, lon: lo }; })() : {}) })}>−</button>
        <button className="btn sm" type="button" disabled={!poly.length} onClick={() => set({ poly: poly.slice(0, -1) })}>Undo corner</button>
        <button className="btn sm" type="button" disabled={!poly.length} onClick={() => set({ poly: [] })}>Clear roof</button>
      </div>
    </div>
    <p className="hint">Drag to move the map, click each corner of the usable roof in turn (leave out plant, tanks and stair cores, or draw several parts one at a time). Imagery © Esri, Maxar, Earthstar Geographics; address search © OpenStreetMap contributors.</p>

    <div className="hr-filters">
      <label className="fld" htmlFor="roof-panel" style={{ flex: '2 1 320px' }}><span className="fl">Panel</span><span className="in-u"><select id="roof-panel" value={r.panel} onChange={e => set({ panel: e.target.value })}>
        {PANELS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}<option value="custom">Custom panel (enter size and rating)</option></select></span></label>
      {r.panel === 'custom' && <>{nf('cWp', 'Panel rating', 'Wp', 5)}{nf('cL', 'Length', 'm', 0.001)}{nf('cW', 'Width', 'm', 0.001)}</>}
      <label className="fld" htmlFor="roof-orient"><span className="fl">Orientation</span><span className="in-u"><select id="roof-orient" value={r.orient} onChange={e => set({ orient: e.target.value as 'portrait' })}>
        <option value="portrait">Portrait (long side up the slope)</option><option value="landscape">Landscape</option></select></span></label>
      <label className="fld" htmlFor="roof-align"><span className="fl">Rows</span><span className="in-u"><select id="roof-align" value={r.align} onChange={e => set({ align: e.target.value as 'edge' })}>
        <option value="edge">Along the roof’s longest edge</option><option value="ew">East–west, facing south</option></select></span></label>
      {nf('tilt', 'Tilt', '°', 1)}{nf('setback', 'Edge setback', 'm', 0.1)}{nf('rowGap', 'Min. row gap (access)', 'm', 0.1)}{nf('colGap', 'Gap between panels', 'm', 0.01)}
    </div>
    {L ? <div className="totals hr-kpis">
      <div className="tot key"><div className="k">Panels on this roof</div><div className="v">{L.count}<small>nos</small></div><div className="s">{fmt(L.kWp, 2)} kWp of {fmt(p.wp, 0)} Wp {p.id === 'custom' ? 'custom' : ''} panels ({fmt(p.l, 3)} × {fmt(p.w, 3)} m)</div></div>
      <div className="tot"><div className="k">Roof drawn</div><div className="v">{fmt(L.roofM2, 0)}<small>m²</small></div><div className="s">perimeter {fmt(L.perimM, 1)} m · about {fmt(L.usableM2, 0)} m² inside the {fmt(num(r.setback), 1)} m setback</div></div>
      <div className="tot"><div className="k">Rows</div><div className="v">{fmt(L.pitch, 2)}<small>m pitch</small></div><div className="s">{fmt(L.depth, 2)} m panel depth + {fmt(Math.max(L.shadeGap, num(r.rowGap)), 2)} m gap{num(r.tilt) > 0 ? ` (no shading above ${fmt(L.sunAlt, 1)}° sun, winter-solstice noon)` : ''}</div></div>
      <div className="tot"><div className="k">Facing</div><div className="v">{fmt(L.azimuth, 0)}<small>° from N</small></div><div className="s">ground coverage {fmt(L.gcr * 100, 0)}% of the roof</div></div>
    </div> : <p className="hint">{poly.length ? `${poly.length} corner${poly.length > 1 ? 's' : ''}: click at least 3 to outline the roof.` : 'Find the building, then click the roof corners.'}</p>}
    <label className="pw-chk"><input type="checkbox" checked={r.auto} onChange={e => set({ auto: e.target.checked })} /> Use this layout for the solar PV (panel count, rating, tilt and facing)</label>

    <details className="hr-req-box"><summary>Google Solar API <span className="muted">· optional: Google’s roof segments and maximum panel count, with your own API key</span></summary>
      <div className="body">
        <div className="hr-filters">
          <label className="fld" htmlFor="roof-key" style={{ flex: '2 1 320px' }}><span className="fl">Google Maps Platform API key (Solar API enabled; stored in this browser only)</span><span className="in-u"><input id="roof-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></span></label>
          <div className="btns wx-jump"><button className="btn sm" type="button" disabled={!key.trim() || gBusy} onClick={google}>{gBusy ? 'Asking Google…' : 'Get building insights'}</button></div>
        </div>
        {gErr && <p className="wx-status error" role="status">{gErr}</p>}
        {g && <><p className="hint">Imagery {g.imagery || 'date not given'}, quality {g.quality || '–'}. Google fits up to <b>{g.maxPanels}</b> panels of {fmt(g.panelWp, 0)} Wp ({fmt(g.panelL, 3)} × {fmt(g.panelW, 3)} m) on {fmt(g.maxAreaM2, 0)} m².</p>
          {g.segments.length > 0 && <div className="tbl-wrap"><table className="hr-tbl"><thead><tr><th>Roof segment</th><th>Pitch °</th><th>Azimuth °</th><th>Area m²</th></tr></thead>
            <tbody>{g.segments.map((x, i) => <tr key={i}><td>{i + 1}</td><td>{fmt(x.pitch, 1)}</td><td>{fmt(x.azimuth, 0)}</td><td>{fmt(x.areaM2, 0)}</td></tr>)}</tbody></table></div>}
          <div className="btns">
            <button className="btn sm" type="button" onClick={() => set({ panel: 'custom', cWp: g.panelWp, cL: g.panelL, cW: g.panelW })}>Use Google’s panel size in my layout</button>
            {g.maxPanels > 0 && <button className="btn sm" type="button" onClick={() => { set({ auto: false }); onGoogle(g); }}>Use Google’s {g.maxPanels} panels</button>}
          </div></>}
        <p className="hint">The Solar API is a paid Google Maps Platform service and its coverage outside the US and Europe is limited; where it has no data for a building it returns an error.</p>
      </div>
    </details>
  </div>;
}
