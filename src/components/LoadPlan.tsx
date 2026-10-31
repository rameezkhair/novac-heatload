/* Live pictures of the cooling load: the building as stacked floors and each floor as a schematic plan.
   NOVAC has room areas, not a layout, so the plan is a squarified treemap: every room's block has its true share of
   the floor area and is coloured by its cooling load density; positions are arranged automatically. */
import { useState } from 'react';
import type { Computed } from '../engine/calc';
import type { Room } from '../engine/types';
import { fmt, num } from '../engine/util';

/* load density colour, W/m²: blue (light) through yellow to red (heavy) */
const LO = 50, HI = 300;
const STOPS = [[44, 123, 182], [171, 217, 233], [255, 255, 191], [253, 174, 97], [215, 25, 28]];
function ramp(wm2: number) {
  const x = Math.max(0, Math.min(1, (wm2 - LO) / (HI - LO))) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  return STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f));
}
const rgb = (c: number[], k = 1) => `rgb(${c.map(v => Math.round(v * k)).join(',')})`;
/* dark text on light fills, white on dark */
const ink = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 150 ? '#1F2937' : '#FFFFFF';

export interface Level { id: string | null; name: string; n: number; rooms: Room[]; W: number; A: number }
/* floors bottom to top; rooms not on a floor form their own level */
export function levelsOf(d: Computed): Level[] {
  const floors = d.p.floors ?? [], tot = (rooms: Room[]) => rooms.reduce((a, r) => { const c = d.res[r.id]; return { W: a.W + c.unit * c.qty, A: a.A + c.A * c.qty }; }, { W: 0, A: 0 });
  const out: Level[] = floors.map(f => { const rooms = d.rooms.filter(r => r.level === f.id); return { id: f.id, name: f.name || 'Untitled floor', n: Math.max(1, Math.round(num(f.n)) || 1), rooms, ...tot(rooms) }; });
  const loose = d.rooms.filter(r => !r.level || !floors.some(f => f.id === r.level));
  if (loose.length) out.push({ id: null, name: floors.length ? 'Not on a floor' : 'All spaces', n: 1, rooms: loose, ...tot(loose) });
  return out;
}

/* ---------- squarified treemap (Bruls, Huizing and van Wijk 2000) ---------- */
interface Box { x: number; y: number; w: number; h: number }
export function squarify<T>(items: { v: number; t: T }[], b: Box): (Box & { t: T })[] {
  const total = items.reduce((a, i) => a + i.v, 0); if (!(total > 0)) return [];
  const k = b.w * b.h / total, rest = items.filter(i => i.v > 0).map(i => ({ a: i.v * k, t: i.t })).sort((p, q) => q.a - p.a);
  const out: (Box & { t: T })[] = []; let { x, y, w, h } = b;
  const worst = (row: { a: number }[], s: number) => { const sum = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max(s * s * mx / (sum * sum), sum * sum / (s * s * mn)); };
  while (rest.length) {
    const s = Math.min(w, h), row = [rest[0]];
    while (row.length < rest.length && worst([...row, rest[row.length]], s) <= worst(row, s)) row.push(rest[row.length]);
    const sum = row.reduce((a, r) => a + r.a, 0);
    if (w >= h) { const cw = sum / h; let yy = y; row.forEach(r => { const rh = r.a / cw; out.push({ x, y: yy, w: cw, h: rh, t: r.t }); yy += rh; }); x += cw; w -= cw; }
    else { const rh = sum / w; let xx = x; row.forEach(r => { const rw = r.a / rh; out.push({ x: xx, y, w: rw, h: rh, t: r.t }); xx += rw; }); y += rh; h -= rh; }
    rest.splice(0, row.length);
  }
  return out;
}

/* ---------- building: isometric stack of floors ---------- */
export function BuildingStack({ d, levels, sel, onPick }: { d: Computed; levels: Level[]; sel: number; onPick: (i: number) => void }) {
  const slabs: { li: number; k: number }[] = [];
  levels.forEach((l, li) => { for (let k = 0; k < Math.min(l.n, 12); k++) slabs.push({ li, k }); });
  const W = 420, maxA = Math.max(...levels.map(l => l.A / l.n), 1), t = Math.max(8, Math.min(22, 260 / Math.max(1, slabs.length)));
  const cx = 150, base = 300;
  const iso = (x: number, y: number, z: number) => [cx + (x - y) * 0.866, base + (x + y) * 0.5 - z];
  const pts = (p: number[][]) => p.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ');
  let z = 0;
  const shapes = slabs.map(({ li, k }) => {
    const l = levels[li], s = 70 + 60 * Math.sqrt(l.A / l.n / maxA), wD = l.A > 0 ? l.W / l.A : 0, c = ramp(wD), on = li === sel;
    const x0 = -s / 2, y0 = -s / 2, x1 = s / 2, y1 = s / 2, z0 = z, z1 = z + t; z = z1 + 2;
    const top = [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)];
    const left = [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)];
    const right = [iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)];
    /* the right-hand corner of the slab, halfway up, anchors its label */
    return { li, k, l, c, on, top, left, right, edge: iso(x1, y0, (z0 + z1) / 2), wD };
  });
  /* label each level once, at its top slab; labels keep at least 34 units apart going up */
  const labels: (typeof shapes[number] & { ly: number })[] = [];
  const lastOf = new Map<number, typeof shapes[number]>(); shapes.forEach(s => lastOf.set(s.li, s));
  [...lastOf.values()].forEach(s => { const prev = labels[labels.length - 1]; labels.push({ ...s, ly: prev ? Math.min(s.edge[1], prev.ly - 34) : s.edge[1] }); });
  /* frame: from above the top slab and the top label down to below the ground */
  const sMax = 130, gy = base + sMax / 2 + 6, lx = W - 146;
  const y0 = Math.min(base - z - sMax / 2, ...labels.map(l => l.ly - 16)) - 10, y1 = gy + 24;
  return <svg className="bld" viewBox={`0 ${y0.toFixed(0)} ${W} ${(y1 - y0).toFixed(0)}`} role="img" aria-label={`Building of ${levels.length} level${levels.length === 1 ? '' : 's'}, ${fmt(d.T.u / 3517, 1)} TR in total`}>
    <ellipse cx={cx} cy={gy} rx={150} ry={22} className="bld-ground" />
    {shapes.map(s => <g key={`${s.li}-${s.k}`} className={'bld-slab' + (s.on ? ' on' : '')} onClick={() => onPick(s.li)}>
      <title>{s.l.name}{s.l.n > 1 ? ` (×${s.l.n})` : ''}: {fmt(s.l.W / 3517, 2)} TR, {fmt(s.wD, 0)} W/m²</title>
      <polygon points={pts(s.left)} fill={rgb(s.c, 0.78)} /><polygon points={pts(s.right)} fill={rgb(s.c, 0.62)} /><polygon points={pts(s.top)} fill={rgb(s.c)} />
    </g>)}
    {labels.map(s => <g key={'l' + s.li} className={'bld-label' + (s.on ? ' on' : '')} onClick={() => onPick(s.li)}>
      <polyline points={`${(s.edge[0] + 4).toFixed(1)},${s.edge[1].toFixed(1)} ${(lx - 14).toFixed(1)},${s.ly.toFixed(1)} ${(lx - 4).toFixed(1)},${s.ly.toFixed(1)}`} />
      <text x={lx} y={s.ly - 2}>{s.l.name}{s.l.n > 1 ? ` ×${s.l.n}` : ''}</text>
      <text x={lx} y={s.ly + 12} className="sub">{fmt(s.l.W / 3517, 2)} TR · {fmt(s.wD, 0)} W/m²</text>
    </g>)}
  </svg>;
}

/* ---------- plan: one level as a treemap of its rooms ---------- */
export function FloorPlan({ d, level, onOpen }: { d: Computed; level: Level; onOpen?: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 640, Hh = 380, pad = 4;
  const cells = squarify(level.rooms.map(r => ({ v: d.res[r.id].A * (d.res[r.id].qty / level.n), t: r })), { x: pad, y: pad, w: W - 2 * pad, h: Hh - 2 * pad });
  const hv = hover ? level.rooms.find(r => r.id === hover) : undefined, hc = hv ? d.res[hv.id] : undefined;
  return <div className="plan">
    <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`Schematic plan of ${level.name}: ${level.rooms.length} spaces coloured by cooling load density`} onMouseLeave={() => setHover(null)}>
      <rect x={1} y={1} width={W - 2} height={Hh - 2} className="plan-outline" />
      {cells.map(({ x, y, w, h, t: r }) => {
        const c = d.res[r.id], wD = c.A > 0 ? c.unit / c.A : 0, col = ramp(wD), q = c.qty / level.n, big = w > 90 && h > 46, mid = w > 56 && h > 30;
        return <g key={r.id} className={'plan-room' + (hover === r.id ? ' on' : '')} onMouseEnter={() => setHover(r.id)} onClick={() => onOpen?.(r.id)}>
          <rect x={x + 1.5} y={y + 1.5} width={Math.max(0, w - 3)} height={Math.max(0, h - 3)} rx={4} fill={rgb(col)} />
          {mid && <text x={x + 8} y={y + 18} fill={ink(col)} className="nm">{(r.name || 'Untitled').slice(0, Math.max(4, Math.floor(w / 7.5)))}{q > 1 ? ` ×${q}` : ''}</text>}
          {big && <text x={x + 8} y={y + 35} fill={ink(col)} className="v">{fmt(c.unit * q / 3517, 2)} TR · {fmt(wD, 0)} W/m²</text>}
        </g>;
      })}
    </svg>
    <div className="plan-info" aria-live="polite">{hv && hc ? <><b>{hv.name || 'Untitled'}</b>{hc.qty / level.n > 1 ? ` ×${hc.qty / level.n}` : ''} · {fmt(hc.A, 0)} m² · {fmt(hc.unit / 3517, 2)} TR each · {fmt(hc.unit / Math.max(1, hc.A), 0)} W/m² · peak {hc.pkH ? `${String(hc.pkH).padStart(2, '0')}:00` : '–'}{onOpen ? ' · click to edit' : ''}</>
      : <span className="muted">Hover a space for its load{onOpen ? '; click to edit it' : ''}.</span>}</div>
  </div>;
}

export function Legend() {
  const n = 5;
  return <div className="plan-legend" aria-label={`Cooling load density from ${LO} to ${HI} W/m² or more`}>
    <span>{LO}</span>
    <span className="bar" style={{ background: `linear-gradient(90deg, ${Array.from({ length: n }, (_, i) => rgb(ramp(LO + (HI - LO) * i / (n - 1)))).join(', ')})` }} />
    <span>{HI}+ W/m²</span>
  </div>;
}

/* the building and the selected level's plan side by side */
export function LoadPicture({ d, onOpen, only }: { d: Computed; onOpen?: (id: string) => void; only?: string }) {
  const levels = levelsOf(d), fixed = only != null ? levels.findIndex(l => l.id === only) : -1;
  const [sel, setSel] = useState(0), i = fixed >= 0 ? fixed : Math.min(sel, levels.length - 1);
  if (!levels.length || i < 0) return null;
  const l = levels[i];
  return <div className={'hr-card load-pic' + (fixed >= 0 ? ' single' : '')}>
    <h3>{fixed >= 0 ? `${l.name}: cooling load plan` : 'Cooling load in the building'} <span className="muted">· room unit load per m²{d.p.fahu ? ', fresh air in the FAHU' : ', with fresh air'} · live</span></h3>
    <div className="load-pic-grid">
      {fixed < 0 && <div className="load-pic-bld"><BuildingStack d={d} levels={levels} sel={i} onPick={setSel} /><p className="hint">Click a floor to show its plan. Typical floors show one slab per repeat.</p></div>}
      <div className="load-pic-plan">
        {fixed < 0 && <div className="plan-head"><b>{l.name}</b>{l.n > 1 ? ` ×${l.n}` : ''} · {fmt(l.W / l.n / 3517, 2)} TR per floor · {fmt(l.A / l.n, 0)} m²</div>}
        <FloorPlan d={d} level={l} onOpen={onOpen} />
      </div>
    </div>
    <div className="load-pic-foot"><Legend /><span className="hint">Schematic plan: each block's size is the space's true share of the floor area; positions are arranged automatically, not the real layout.</span></div>
  </div>;
}
