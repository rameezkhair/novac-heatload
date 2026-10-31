/* SVG charts as strings, used both on screen (theme colours through CSS variables)
   and in the report (fixed print colours). */
import { W_rh, W_wb, dpOf, hOf, rhOf, wbOf } from './psychro';
import { designDay, stateTable, type Computed, type Env, type StatePoint } from './calc';
import type { Project } from './types';
import { esc, fmt } from './util';

type Mode = 'all' | 'in' | 'out';
const colour = (print: boolean) => (n: string, f: string) => print ? f : `var(--${n},${f})`;

function psyRange(pts: StatePoint[], mode: Mode, P: number) {
  const ts = pts.map(q => q.t), ws = pts.map(q => q.w * 1000);
  if (mode === 'in') {
    const w15 = W_rh(15, 100, P) * 1000;
    const x0 = Math.min(10, Math.floor((Math.min(...ts) - 4) / 5) * 5), x1 = Math.max(35, Math.ceil((Math.max(...ts) + 5) / 5) * 5);
    return { x0, x1, y1: Math.max(20, Math.ceil((Math.max(...ws, w15, 12) + 3) / 2) * 2), xs: 5, ys: 2 };
  }
  const lo = mode === 'all' ? 10 : 15, pad = mode === 'all' ? 4 : 6;
  const x0 = Math.min(lo, Math.floor((Math.min(...ts) - pad) / 5) * 5), x1 = Math.max(45, Math.ceil((Math.max(...ts) + 4) / 5) * 5);
  return { x0, x1, y1: Math.max(25, Math.ceil((Math.max(...ws) + 4) / 5) * 5), xs: 5, ys: 5 };
}

export function psychroSVG(d: Computed, print: boolean, mode: Mode = 'all') {
  const { P } = d.e, all = stateTable(d).pts;
  const pts = mode === 'all' ? all : all.filter(q => mode === 'out' ? ['O', 'V', 'M'].includes(q.k) : ['R', 'S', 'M'].includes(q.k));
  const isIn = mode !== 'out', C = colour(print);
  const { x0, x1, y1, xs, ys } = psyRange(pts, mode, P);
  const W0 = mode === 'all' ? 760 : 640, H0 = mode === 'all' ? 470 : 430, ml = 42, mr = 56, mt = mode === 'all' ? 34 : 16, mb = 46;
  const X = (t: number) => ml + (t - x0) / (x1 - x0) * (W0 - ml - mr), Y = (w: number) => H0 - mb - (w / y1) * (H0 - mt - mb);
  const cid = 'psyclip' + mode + (print ? 'r' : 'p');
  const ttl = mode === 'out' ? 'Outdoor air' : mode === 'in' ? 'Indoor air' : 'Indoor and outdoor air';
  const txt = (x: number, y: number, s: string, fill: string, extra = '') => `<text x="${x}" y="${y}" font-size="11" font-family="Arial" fill="${fill}" ${extra}>${s}</text>`;
  let s = `<svg viewBox="0 0 ${W0} ${H0}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ttl} psychrometric chart at ${fmt(P, 1)} kPa"><defs><clipPath id="${cid}"><rect x="${ml}" y="${mt}" width="${W0 - ml - mr}" height="${H0 - mt - mb}"/></clipPath></defs>`;
  s += `<rect x="${ml}" y="${mt}" width="${W0 - ml - mr}" height="${H0 - mt - mb}" fill="${C('surface', '#FFFFFF')}" stroke="${C('line-strong', '#BCC0C7')}"/>`;
  for (let t = x0; t <= x1; t += xs) s += `<line x1="${X(t)}" y1="${Y(0)}" x2="${X(t)}" y2="${Y(y1)}" stroke="${C('line', '#E1E3E7')}"/>` + txt(X(t), Y(0) + 16, String(t), C('muted', '#5B6472'), 'text-anchor="middle"');
  for (let w = 0; w <= y1; w += ys) s += `<line x1="${X(x0)}" y1="${Y(w)}" x2="${X(x1)}" y2="${Y(w)}" stroke="${C('line', '#E1E3E7')}"/>` + txt(X(x1) + 6, Y(w) + 4, String(w), C('muted', '#5B6472'));
  s += `<text x="${(ml + W0 - mr) / 2}" y="${H0 - 10}" text-anchor="middle" font-size="12" font-family="Arial" fill="${C('fg', '#1F2937')}">Dry bulb temperature, °C</text>`;
  s += `<text transform="translate(${W0 - 12},${(mt + H0 - mb) / 2}) rotate(90)" text-anchor="middle" font-size="12" font-family="Arial" fill="${C('fg', '#1F2937')}">Humidity ratio, g/kg dry air</text>`;
  s += `<g clip-path="url(#${cid})">`;
  const curve = (rh: number) => { let dd = ''; for (let t = x0; t <= x1 + 0.01; t += 0.25) { const w = W_rh(t, rh, P) * 1000; dd += (dd ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(Math.min(w, y1 + 5)).toFixed(1); if (w > y1 + 5) break; } return dd; };
  if (isIn) {
    let cz = ''; for (let t = 22.5; t <= 25.51; t += 0.25) cz += (cz ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(W_rh(t, 30, P) * 1000).toFixed(1);
    for (let t = 25.5; t >= 22.49; t -= 0.25) cz += 'L' + X(t).toFixed(1) + ' ' + Y(W_rh(t, 60, P) * 1000).toFixed(1);
    s += `<path d="${cz}Z" fill="${C('ok-bg', '#E7F1E9')}" stroke="${C('ok', '#2F6B3B')}" stroke-width="1.2"/>`;
  }
  for (let rh = 10; rh < 100; rh += 10) s += `<path d="${curve(rh)}" fill="none" stroke="${C('bar-2', '#A3A9B3')}" stroke-width="0.9"/>`;
  for (let wb = Math.ceil(x0 / 5) * 5; wb <= x1; wb += 5) {
    const ws = W_rh(wb, 100, P), tEnd = Math.min(200, wb + (2501 - 2.326 * wb) * ws / 1.006); let dd = '';
    for (let i = 0; i <= 20; i++) { const t = wb + (tEnd - wb) * i / 20; dd += (dd ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(Math.max(0, W_wb(t, wb, P)) * 1000).toFixed(1); }
    s += `<path d="${dd}" fill="none" stroke="${C('bar-2', '#A3A9B3')}" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  }
  s += `<path d="${curve(100)}" fill="none" stroke="${C('fg', '#1F2937')}" stroke-width="1.8"/>`;
  const w15 = W_rh(15, 100, P) * 1000;
  if (isIn) {
    s += `<line x1="${X(15)}" y1="${Y(w15)}" x2="${X(x1)}" y2="${Y(w15)}" stroke="${C('bad', '#B42318')}" stroke-width="1" stroke-dasharray="2 3"/>`;
    s += `<line x1="${X(x0)}" y1="${Y(12)}" x2="${X(x1)}" y2="${Y(12)}" stroke="${C('req', '#7A4E00')}" stroke-width="1" stroke-dasharray="8 4"/>`;
  }
  s += `</g>`;
  if (isIn) {
    const lx = mode === 'all' ? X(x1) - 4 : X(x0) + 6, an = mode === 'all' ? 'end' : 'start';
    s += `<text x="${lx}" y="${Y(w15) + 12}" text-anchor="${an}" font-size="10" font-family="Arial" fill="${C('bad', '#B42318')}">Dew point 15 °C (62.1 §5.12)</text>`;
    s += `<text x="${lx}" y="${Y(12) - 4}" text-anchor="${an}" font-size="10" font-family="Arial" fill="${C('req', '#7A4E00')}">12 g/kg (ASHRAE 55)</text>`;
    s += `<text x="${X(24)}" y="${Y(W_rh(24, 30, P) * 1000) + 14}" text-anchor="middle" font-size="10" font-family="Arial" fill="${C('ok', '#2F6B3B')}">DBC H.3 band</text>`;
  }
  for (let rh = 20; rh < 100; rh += 20) {
    let t = x1, w = W_rh(t, rh, P) * 1000;
    if (w > y1) { let lo = x0, hi = x1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (W_rh(m, rh, P) * 1000 > y1) hi = m; else lo = m; } t = lo; w = y1; }
    s += `<text x="${X(t) - 3}" y="${Y(w) + (w >= y1 ? 12 : -4)}" text-anchor="end" font-size="10" font-family="Arial" fill="${C('muted', '#5B6472')}">${rh}%</text>`;
  }
  for (let wb = Math.ceil(x0 / 5) * 5; wb <= x1; wb += 5) { const w = W_rh(wb, 100, P) * 1000; if (w < y1 && wb > x0) s += `<text x="${X(wb) - 4}" y="${Y(w) - 4}" text-anchor="end" font-size="10" font-family="Arial" fill="${C('muted', '#5B6472')}">WB ${wb}</text>`; }
  const P_ = (k: string) => pts.find(q => q.k === k);
  const line = (a?: StatePoint, b?: StatePoint, dash?: boolean) => a && b ? `<line x1="${X(a.t)}" y1="${Y(Math.min(a.w * 1000, y1))}" x2="${X(b.t)}" y2="${Y(Math.min(b.w * 1000, y1))}" stroke="${C('accent', '#B08A2E')}" stroke-width="1.8"${dash ? ' stroke-dasharray="6 4"' : ''}/>` : '';
  if (mode === 'all') { const Vp = P_('V') || P_('O'); if (P_('M')) s += line(Vp, P_('M'), true) + line(P_('R'), P_('M'), true) + line(P_('M'), P_('S')); else s += line(Vp, P_('R'), true); s += line(P_('R'), P_('S')); }
  else if (mode === 'out') { const Vp = P_('V') || P_('O'); if (P_('M')) s += line(Vp, P_('M'), true); }
  else { if (P_('M')) s += line(P_('R'), P_('M'), true) + line(P_('M'), P_('S')); s += line(P_('R'), P_('S')); }
  const col = { bad: C('bad', '#B42318'), warn: C('req', '#7A4E00'), ok: C('ok', '#2F6B3B'), acc: C('accent', '#B08A2E'), mid: C('bar', '#374151') };
  if (mode === 'all') {
    const lg: [string, string][] = [[C('bad', '#B42318'), 'Outdoor air: O ambient, V fresh air'], [C('ok', '#2F6B3B'), 'Indoor air: R room, S supply' + (P_('M') ? ', M mixed' : '')]];
    let lx = ml;
    lg.forEach(([c, t]) => { s += `<circle cx="${lx + 6}" cy="${mt - 14}" r="5" fill="${c}"/><text x="${lx + 15}" y="${mt - 10}" font-size="11.5" font-family="Arial" fill="${C('fg', '#1F2937')}">${t}</text>`; lx += t.length * 6.2 + 40; });
    s += `<line x1="${lx}" y1="${mt - 14}" x2="${lx + 22}" y2="${mt - 14}" stroke="${C('accent', '#B08A2E')}" stroke-width="1.8" stroke-dasharray="6 4"/><text x="${lx + 28}" y="${mt - 10}" font-size="11.5" font-family="Arial" fill="${C('fg', '#1F2937')}">Fresh-air treatment</text>`;
  }
  pts.forEach((q, i) => {
    const cx = X(q.t), cy = Y(Math.min(q.w * 1000, y1)), rh = rhOf(q.t, q.w, P);
    const right = cx < W0 - mr - 120, tx = right ? cx + 10 : cx - 10, anc = right ? 'start' : 'end', dy = (i % 2 ? 16 : -8);
    s += `<g><title>${esc(q.name)}: ${fmt(q.t, 1)} °C DB, ${fmt(wbOf(q.t, q.w, P), 1)} °C WB, ${fmt(Math.min(100, rh), 0)}% RH, ${fmt(q.w * 1000, 1)} g/kg, ${fmt(hOf(q.t, q.w), 1)} kJ/kg</title>`
      + `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${col[q.c]}" stroke="${C('surface', '#FFFFFF')}" stroke-width="1.5"/>`
      + `<text x="${tx}" y="${cy + dy}" text-anchor="${anc}" font-size="11.5" font-family="Arial" fill="${C('fg', '#1F2937')}" stroke="${C('surface', '#FFFFFF')}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round"><tspan font-weight="bold">${q.k}</tspan> ${fmt(q.t, 1)} °C · ${fmt(Math.min(100, rh), 0)}% · ${fmt(q.w * 1000, 1)} g/kg</text></g>`;
  });
  return s + `</svg>`;
}

export interface StateRow { k: string; name: string; db: string; wb: string; rh: string; w: string; h: string; dp: string; c: StatePoint['c'] }
export function stateRows(d: Computed, mode?: 'in' | 'out'): StateRow[] {
  let { pts } = stateTable(d); const P = d.e.P;
  if (mode) pts = pts.filter(q => mode === 'out' ? ['O', 'V', 'M'].includes(q.k) : ['R', 'S', 'M'].includes(q.k));
  return pts.map(q => ({ k: q.k, name: q.name, db: fmt(q.t, 1), wb: fmt(wbOf(q.t, q.w, P), 1), rh: fmt(Math.min(100, rhOf(q.t, q.w, P)), 0), w: fmt(q.w * 1000, 2), h: fmt(hOf(q.t, q.w), 1), dp: fmt(dpOf(q.w, P), 1), c: q.c }));
}

export function dayChartSVG(p: Project, e: Env, print: boolean) {
  const C = colour(print), d = designDay(p, e);
  const W0 = print ? 760 : 1100, H0 = print ? 260 : 280, ml = 44, mr = 16, mt = 16, mb = 36;
  const lo = Math.floor(Math.min(...d.map(x => x.wb)) - 2), hi = Math.ceil(Math.max(...d.map(x => x.db)) + 1);
  const X = (h: number) => ml + (h - 1) / 23 * (W0 - ml - mr), Y = (t: number) => H0 - mb - (t - lo) / (hi - lo) * (H0 - mt - mb);
  let s = `<svg viewBox="0 0 ${W0} ${H0}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Outdoor design day temperature profile">`;
  for (let t = Math.ceil(lo / 5) * 5; t <= hi; t += 5) s += `<line x1="${ml}" x2="${W0 - mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="${C('line', '#E1E3E7')}"/><text x="${ml - 6}" y="${Y(t) + 4}" text-anchor="end" font-size="11" font-family="Arial" fill="${C('muted', '#5B6472')}">${t}</text>`;
  for (const h of [1, 3, 6, 9, 12, 15, 18, 21, 24]) s += `<text x="${X(h)}" y="${H0 - mb + 16}" text-anchor="middle" font-size="11" font-family="Arial" fill="${C('muted', '#5B6472')}">${String(h).padStart(2, '0')}:00</text>`;
  s += `<text x="${(ml + W0 - mr) / 2}" y="${H0 - 4}" text-anchor="middle" font-size="11" font-family="Arial" fill="${C('fg', '#1F2937')}">Hour (solar time) · °C</text>`;
  const path = (k: 'db' | 'wb') => d.map((x, i) => (i ? 'L' : 'M') + X(x.h).toFixed(1) + ' ' + Y(x[k]).toFixed(1)).join('');
  s += `<path d="${path('db')}" fill="none" stroke="${C('bad', '#B42318')}" stroke-width="2"/>`;
  s += `<path d="${path('wb')}" fill="none" stroke="${C('bar', '#374151')}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
  const mx = d.reduce((a, b) => b.db > a.db ? b : a), mn = d.reduce((a, b) => b.db < a.db ? b : a);
  s += `<circle cx="${X(mx.h)}" cy="${Y(mx.db)}" r="4" fill="${C('bad', '#B42318')}"/><text x="${X(mx.h)}" y="${Y(mx.db) - 8}" text-anchor="middle" font-size="11" font-weight="bold" font-family="Arial" fill="${C('fg', '#1F2937')}">${fmt(mx.db, 1)} °C</text>`;
  s += `<circle cx="${X(mn.h)}" cy="${Y(mn.db)}" r="4" fill="${C('bad', '#B42318')}"/><text x="${X(mn.h)}" y="${Y(mn.db) + 16}" text-anchor="middle" font-size="11" font-weight="bold" font-family="Arial" fill="${C('fg', '#1F2937')}">${fmt(mn.db, 1)} °C</text>`;
  s += `<text x="${W0 - mr}" y="${mt + 10}" text-anchor="end" font-size="11" font-family="Arial" fill="${C('bad', '#B42318')}">Dry bulb ━</text><text x="${W0 - mr}" y="${mt + 26}" text-anchor="end" font-size="11" font-family="Arial" fill="${C('bar', '#374151')}">Wet bulb ╌</text>`;
  return s + '</svg>';
}
