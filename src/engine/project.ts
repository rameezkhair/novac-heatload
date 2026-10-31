/* Project and room defaults, option lists, and the "resolve" step that copies the value of each
   selected source option into the field the calculation reads. Functions that change data mutate
   their argument; the store calls them inside an immer draft. */
import {
  A170, ACT_BY, AUTO, CODESETS, INDOOR, LIB, LOC, LOC_SRC, LPD_BAM, ORIENTS, OUT_OPTS, PPICKS, SUBLOC, TYPES, VENT, VENT_ALIAS,
  VENT_BY, VENT_OPTS, bamWm2, typeOf, ENVK, PXDEF, type RoomType,
} from './data';
import type { AppState, Num, Orient, PartType, Partition, Project, Room, RoomSrc, WallEntry, Adjacent } from './types';
import { fmtM2, num } from './util';

export interface RoomOpt { id: string; label: string; v: number; cat?: string }
export type RoomPick = 'people' | 'light' | 'equip' | 'oa' | 'ach';
export const ROOMPICKS: RoomPick[] = ['people', 'light', 'equip', 'oa', 'ach'];
export const RMETA: Record<RoomPick, [string, string, number]> = { people: ['People', 'pers.', 1], light: ['Lighting', 'W/m²', 0.1], equip: ['Equipment', 'W/m²', 0.1], oa: ['Fresh air', 'L/s', 1], ach: ['Infiltration', 'ACH', 0.1] };
export const SHOWV: Record<RoomPick, boolean> = { people: false, oa: false, light: true, equip: true, ach: true };

let seq = 1;
export const newId = () => 'r' + Date.now().toString(36) + (seq++);
export function emptyWalls(): Record<Orient, WallEntry> { const o = {} as Record<Orient, WallEntry>; ORIENTS.forEach(k => { o[k] = { w: '', g: '' }; }); return o; }
const emptyAdj = (adj: string): Adjacent => ({ a: '', adj, t: '', u: '' });

/* exposed envelope area of a room: gross wall, or glass where glass exceeds the stated wall */
export const envelopeArea = (r: Room | null) => r ? ORIENTS.reduce((a, k) => a + Math.max(num(r.walls[k]?.w), num(r.walls[k]?.g)), 0) : 0;

export const ROOMOPTS: Record<RoomPick, (r: Room | null, t: RoomType, ez: number) => RoomOpt[]> = {
  people: (r, t) => {
    const A = num(r?.area), o: RoomOpt[] = [];
    if (t.dbc) o.push({ id: 'dbc', label: `DBC Table B.2, ${t.dbc[1]}: ${t.dbc[0]} m²/person`, v: Math.ceil(A / t.dbc[0]) });
    const vr = VENT_BY[t.vent]; if (vr && vr.dens > 0) o.push({ id: 'a621', label: `ASHRAE 62.1-2022 default, ${fmtM2(100 / vr.dens)} m²/person`, v: Math.ceil(A * vr.dens / 100) });
    o.push({ id: 'typ', label: t.dens > 0 ? `Typical layout, ${fmtM2(t.dens)} m²/person` : 'Typical: unoccupied', v: t.dens > 0 ? Math.ceil(A / t.dens) : 0 });
    return o;
  },
  light: (_r, t) => {
    const o: RoomOpt[] = [{ id: 'typ', cat: 'DBC H.4.6.7.2', label: 'Project-specific lighting design', v: t.light }];
    if (t.a901) o.push({ id: 'a901', cat: 'ASHRAE 90.1-2022 Tables 9.5.2.1-1/-2 · Space-by-Space Method (DBC H.4.6.7.2)', label: t.label, v: t.a901 });
    LPD_BAM.forEach(([id, l, w]) => o.push({ id: 'bam-' + id, cat: 'ASHRAE 90.1-2022 Table 9.5.1 · Building Area Method (DBC H.4.6.7.2)', label: `${l} (${w} W/ft²)`, v: bamWm2(w) }));
    o.push({ id: 'est-g', cat: 'Estidama PBRS baseline', label: 'General', v: 8.7 }, { id: 'est-r', cat: 'Estidama PBRS baseline', label: 'Residential', v: 6.8 });
    return o;
  },
  equip: (_r, t) => [
    { id: 'typ', cat: 'DBC H.4.6.7.3', label: 'Project-specific equipment load', v: t.equip },
    { id: 'cibse', cat: 'CIBSE TM37 (cited in DOE Cooling Load Manual)', label: 'Office allowance', v: 15 },
    { id: 'est-g', cat: 'Estidama PBRS baseline', label: 'General', v: 8.1 },
    { id: 'est-r', cat: 'Estidama PBRS baseline', label: 'Residential', v: 2.7 }],
  oa: (r, _t, ez) => {
    const n = num(r?.people), A = num(r?.area), H = num(r?.height) || 3;
    const o: RoomOpt[] = VENT.map(v => ({ id: v.id, cat: 'DBC H.4.10.2 · ASHRAE 62.1-2022 Table 6-1 · ' + v.cat, label: `${v.label} (${v.rp} L/s·p + ${v.ra} L/s·m², ÷ Ez ${ez})`, v: Math.round((v.rp * n + v.ra * A) / ez * 10) / 10 }));
    o.push({ id: 'a622', cat: 'DBC H.4.10.2 · ASHRAE 62.2-2019 · dwelling units', label: 'Whole-dwelling ventilation (0.15 L/s·m² + 3.5 L/s per occupant)', v: Math.round((0.15 * A + 3.5 * n) * 10) / 10 });
    A170.forEach(([id, l, oa, tot]) => o.push({ id: 'a170-' + id, cat: 'DBC H.4.10.2 · ASHRAE 170-2021 Table 7-1 · healthcare (DHA)', label: `${l} (${oa} ACH outdoor, ${tot} ACH total)`, v: Math.round(oa * A * H / 3.6 * 10) / 10 }));
    return o;
  },
  ach: (r) => {
    const o: RoomOpt[] = [
      { id: 'tight', cat: 'ASHRAE Fundamentals · construction class', label: 'New building, tight construction', v: 0.35 },
      { id: 'medium', cat: 'ASHRAE Fundamentals · construction class', label: 'Average construction (newer, or older well-sealed)', v: 0.5 },
      { id: 'loose', cat: 'ASHRAE Fundamentals · construction class', label: 'Old building, loose construction', v: 0.7 },
      { id: 'win1', cat: 'ASHRAE Fundamentals · exposure (old buildings)', label: 'Windows or doors on one side', v: 1.0 },
      { id: 'win2', cat: 'ASHRAE Fundamentals · exposure (old buildings)', label: 'Windows or doors on two sides', v: 1.5 },
      { id: 'win3', cat: 'ASHRAE Fundamentals · exposure (old buildings)', label: 'Windows or doors on three sides, or entrance hall', v: 2.0 }];
    if (r) {
      const env = envelopeArea(r), V = num(r.area) * num(r.height);
      if (env > 0 && V > 0) o.push({ id: 'dbc50', cat: 'DBC H.4.9.1 · airtightness', label: '5 m³/h·m² at 50 Pa, ÷20 for natural conditions', v: Math.round(5 * env / 20 / V * 100) / 100 });
    }
    o.push({ id: 'press', cat: 'DBC H.4.9.1 · airtightness', label: 'Pressurised building or interior room', v: 0 },
      { id: 'typ', cat: 'Typical estimate', label: 'Perimeter room, typical estimate', v: 0.3 }, { id: 'door', cat: 'Typical estimate', label: 'Entrance with frequent door use', v: 1 });
    return o;
  },
};

export function defaultSrc(t: RoomType): RoomSrc {
  const vr = VENT_BY[t.vent];
  return { people: t.dbc ? 'dbc' : (vr && vr.dens > 0 ? 'a621' : 'typ'), light: t.a901 && t.lightDef !== 'typ' ? 'a901' : 'typ', equip: 'typ', oa: t.oaDef || t.vent, ach: 'tight', act: t.act };
}
export const ezOf = (p: Project) => num(p.ez) || 1;

export function resolveRoom(r: Room, ez: number) {
  const t = typeOf(r.type);
  if (VENT_ALIAS[r.src.oa]) r.src.oa = VENT_ALIAS[r.src.oa];
  for (const k of ROOMPICKS) {
    if (r.src[k] === 'custom') continue;
    const opts = ROOMOPTS[k](r, t, ez);
    const o = opts.find(x => x.id === r.src[k]) || (k === 'oa' ? opts.find(x => x.id === (t.oaDef || t.vent)) : undefined) || opts[0];
    r.src[k] = o.id; r[k] = o.v;
  }
  if (r.src.act !== 'custom') { const a = ACT_BY[r.src.act] || ACT_BY[t.act]; r.src.act = a.id; r.ps = a.s; r.pl = a.l; }
}
export function changeType(r: Room, type: string, ez: number) {
  r.type = type; const t = typeOf(type), d = defaultSrc(t);
  (['people', 'oa', 'act'] as const).forEach(k => { if (r.src[k] !== 'custom') r.src[k] = d[k]; });
  (['light', 'equip', 'ach'] as const).forEach(k => { if (r.src[k] !== 'custom' && !ROOMOPTS[k](r, t, ez).some(o => o.id === r.src[k])) r.src[k] = d[k]; });
  resolveRoom(r, ez);
}
export function newRoom(name: string, type: string, ez: number): Room {
  const t = TYPES[type] || TYPES.office;
  const r: Room = {
    id: newId(), name, type, qty: 1, area: 20, height: 3, walls: emptyWalls(), above: 'cond', below: 'cond', roof: '', sky: '',
    ce: emptyAdj(PXDEF.ceiling), fl: emptyAdj(PXDEF.floor), px: [],
    people: 0, light: 0, equip: 0, oa: 0, ach: 0, ps: 0, pl: 0, src: defaultSrc(t),
  };
  resolveRoom(r, ez); return r;
}
/* named wall types: a wall or partition with no type, or a deleted one, uses the default U-value */
const consType = (list: PartType[] | undefined, id: string | undefined) => id ? list?.find(t => t.id === id) : undefined;
export const wallU = (p: Project, id?: string): Num => consType(p.wallTypes, id)?.u ?? p.uWall;
export const wallName = (p: Project, id?: string) => consType(p.wallTypes, id)?.name || 'Default';
export const partU = (p: Project, x: Partition): Num => consType(p.partTypes, x.pt)?.u ?? p.uPart;
export const partName = (p: Project, x: Partition) => consType(p.partTypes, x.pt)?.name || 'Default';
export const newTypeId = () => 't' + newId().slice(1);
export const pxU = (p: Project, t: string): Num => t === 'wall' ? p.uPart : t === 'ceiling' ? (p.uCeil !== '' && p.uCeil != null ? p.uCeil : p.uFloor) : p.uFloor;

/* ---------- project ---------- */
export const refElevOf = (p: Project) => { const s = (SUBLOC[p.location] || [])[0]; return s ? s.elev : num(p.elev); };
export const subOf = (p: Project) => (SUBLOC[p.location] || []).find(s => s.id === p.subloc);
export function presetVals(k: string) {
  const l = LOC[k], s = (SUBLOC[k] || [])[0];
  return { toDB: l.toDB ?? '', toWB: l.toWB ?? '', dr: s ? s.dr : l.dr ?? '', elev: s ? s.elev : l.elev ?? '', vDB: l.vDB ?? '', vWB: l.vWB ?? '', subloc: s ? s.id : 'custom' } as Pick<Project, 'toDB' | 'toWB' | 'dr' | 'elev' | 'vDB' | 'vWB' | 'subloc'>;
}
export function resolveProject(p: Project) {
  if (p.src.out && p.src.out !== 'custom') { const o = OUT_OPTS.find(o => o.id === p.src.out); if (o) { p.toDB = o.db!; p.toWB = o.wb!; } else p.src.out = 'custom'; }
  if (p.src.vent && p.src.vent !== 'custom') {
    if (p.src.vent === 'same') { p.vDB = num(p.toDB); p.vWB = num(p.toWB); }
    else { const o = VENT_OPTS.find(o => o.id === p.src.vent); if (o) { p.vDB = o.db!; p.vWB = o.wb!; } else p.src.vent = 'custom'; }
  }
  PPICKS.forEach(k => { const s = p.src[k]; if (s === 'custom') return; const o = LIB[k].find(o => o.id === s); if (o) p[k] = o.v; else p.src[k] = 'custom'; });
  if (p.src.indoor !== 'custom') { const i = INDOOR.find(i => i.id === p.src.indoor) || INDOOR[0]; p.src.indoor = i.id; p.tiDB = i.db; p.tiRH = i.rh; }
}
export function applyCodeset(p: Project, id: string) {
  const cs = CODESETS.find(c => c[0] === id); if (!cs) return null;
  Object.assign(p.src, cs[2]); p.cbasis = cs[3]; p.codeset = cs[0]; resolveProject(p); return cs;
}
/* emirate change: design conditions, sub-location, code set and indoor basis follow the emirate */
export function setLocation(p: Project, loc: string) {
  p.location = loc;
  if (loc !== 'custom') {
    Object.assign(p, presetVals(loc));
    const ls = LOC_SRC[loc]; if (ls) { p.src.out = ls[0]; p.src.vent = ls[1]; }
  } else p.subloc = 'custom';
  const a = AUTO[loc]; if (!a) { resolveProject(p); return null; }
  applyCodeset(p, a.codeset); p.src.indoor = a.indoor; resolveProject(p);
  return a.why;
}
/* Al Sa'fat glazing limits depend on the glazing ratio: keep the Al Sa'fat picks on the matching band */
export function autoBand(p: Project, T: { wallG: number; wwr: number; roof: number; skyPct: number }) {
  if (p.autoBand === false || !T.wallG) return false;
  const w = T.wwr, before = JSON.stringify(p.src);
  if ((p.src.uGlass || '').startsWith('safat')) p.src.uGlass = w <= 40 ? 'safat-40' : 'safat-60';
  if ((p.src.shgc || '').startsWith('safat') && p.src.shgc !== 'safat-shop') p.src.shgc = w <= 40 ? 'safat-40' : w < 60 ? 'safat-60' : 'safat-100';
  if ((p.src.shgcSky || '').startsWith('safat') && T.roof > 0) p.src.shgcSky = T.skyPct > 10 ? 'safat-11' : 'safat-10';
  return JSON.stringify(p.src) !== before;
}

export function defaultProject(): Project {
  const p: Project = Object.assign({
    name: '', client: '', consultant: '', contractor: '', location: 'dubai', cbasis: 'safat-s', codeset: 'safat-s-40',
  }, presetVals('dubai'), {
    autoBand: true, tiDB: 24, tiRH: 50, met: 1.1, clo: 0.61, vel: 0.2,
    uPart: 1.8, partTypes: [], uCeil: 0.6, uFloor: 0.6, shade: 1, tAdj: 35, tSupply: 13, sfS: 10, sfL: 5, fahu: true, diversity: 100,
    acType: 'split', ratedEer: '', ratedSeer: '', fanSfp: 1.8,
    erv: false, ervS: 70, ervL: 0, ervShare: 50,
    uWall: 0, wallTypes: [], uRoof: 0, uGlass: 0, shgc: 0, uSky: 0, shgcSky: 0, ez: 1,
    /* heat balance: medium-colour surfaces (ASHRAE Ch. 18), ASHRAE typical ground reflectance, typical radiant fractions */
    aWall: 0.7, aRoof: 0.7, gRefl: 0.2, frP: 0.6, frL: 0.5, frE: 0.3, ceil: 'susp', floorFin: 'tile', sys: 'ducted', effOpt: '', effCop: '', aux: 0,
    src: Object.assign({ indoor: 'dbc', ez: 'ceil-cool', out: 'dbc', vent: 'dbc' }, CODESETS[0][2]),
  }) as Project;
  resolveProject(p); return p;
}

function exampleRoom(name: string, type: string, area: number, walls: Partial<Record<Orient, [number, number]>>, extra: { roof?: number; qty?: number; ach?: string }, ez: number) {
  const r = newRoom(name, type, ez); r.area = area;
  Object.entries(walls).forEach(([o, [w, g]]) => { r.walls[o as Orient] = { w, g }; });
  if (extra.roof) { r.above = 'roof'; r.roof = extra.roof; }
  if (extra.qty) r.qty = extra.qty;
  if (extra.ach) r.src.ach = extra.ach;
  resolveRoom(r, ez); return r;
}
export function exampleState(): AppState {
  const p = defaultProject(); p.name = 'Example: G+1 office, Dubai (first floor)';
  const ez = ezOf(p);
  const rooms = [
    exampleRoom('Open office', 'office', 120, { W: [36, 14], S: [24, 6] }, { roof: 120 }, ez),
    exampleRoom('Meeting room', 'meeting', 24, { N: [15, 4] }, { roof: 24 }, ez),
    exampleRoom('Manager office', 'privoffice', 20, { E: [12, 4] }, { roof: 20, qty: 2 }, ez),
    exampleRoom('Reception', 'lobby', 40, { E: [18, 10] }, { roof: 40, ach: 'door' }, ez),
    exampleRoom('Corridor', 'corridor', 30, {}, { roof: 30, ach: 'press' }, ez),
  ];
  return { version: 2, project: p, rooms, sel: rooms[0].id, example: true };
}
export function newProjectState(): AppState {
  const p = defaultProject(), r = newRoom('Room 1', 'office', ezOf(p));
  return { version: 2, project: p, rooms: [r], sel: r.id, example: false };
}

/* ---------- loading saved data ----------
   Accepts files saved by this app and the browser state of the original single-file calculator,
   whose rooms kept partitions in loose fields (part, wAdj, wx, floor, aAdj, ...). */
/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateRoom(r: any, ez: number): Room {
  const t = typeOf(r.type);
  const above = r.above || (num(r.roof) > 0 ? 'roof' : 'cond'), below = r.below || (num(r.floor) > 0 ? 'uncond' : 'cond');
  let px: any[] = Array.isArray(r.px) ? r.px : [];
  if (!Array.isArray(r.px)) {
    if (num(r.part) > 0 || r.wAdj || (r.uW !== '' && r.uW != null)) px.push({ type: 'wall', a: r.part, adj: r.wAdj || 'project', t: r.tW, u: r.uW });
    (r.wx || []).forEach((x: any) => px.push({ type: 'wall', a: x.a, adj: x.adj || 'project', t: x.t, u: x.u }));
    if (r.above === 'uncond') px.push({ type: 'ceiling', a: r.roof, adj: r.aAdj || 'project', t: r.tA, u: r.uC });
    if (r.below === 'uncond') px.push({ type: 'floor', a: r.floor, adj: r.bAdj || 'project', t: r.tB, u: r.uF });
  }
  const adj = (x: any, def: string): Adjacent => ({ a: x?.a ?? '', adj: x?.adj || def, t: x?.t ?? '', u: x?.u ?? '' });
  const cf = (w: 'a' | 'b'): Adjacent => {
    const k = w === 'a' ? 'ce' : 'fl', ty = w === 'a' ? 'ceiling' : 'floor';
    if (r[k] && typeof r[k] === 'object') return adj(r[k], PXDEF[ty]);
    const old = px.find(x => x.type === ty);
    if (old) return adj(old, PXDEF[ty]);
    return w === 'a'
      ? { a: above === 'uncond' ? r.roof ?? '' : '', adj: r.aAdj || PXDEF.ceiling, t: r.tA ?? '', u: r.uC ?? '' }
      : { a: r.floor ?? '', adj: r.bAdj || PXDEF.floor, t: r.tB ?? '', u: r.uF ?? '' };
  };
  const ce = cf('a'), fl = cf('b');
  px = px.filter(x => x.type === 'wall').map(x => ({ type: 'wall', ...adj(x, PXDEF.wall), ...(x.pt ? { pt: x.pt } : {}) }));
  const walls = emptyWalls();
  ORIENTS.forEach(o => { if (r.walls?.[o]) walls[o] = { w: r.walls[o].w ?? '', g: r.walls[o].g ?? '', ...(r.walls[o].t ? { t: String(r.walls[o].t) } : {}) }; });
  const out: Room = {
    id: r.id || newId(), name: r.name ?? 'Room', type: TYPES[r.type] ? r.type : 'office', qty: r.qty ?? 1, area: r.area ?? 0, height: r.height ?? 3,
    walls, above, below, roof: above === 'roof' ? r.roof ?? '' : '', sky: above === 'roof' ? r.sky ?? '' : '', ce, fl, px,
    people: r.people ?? 0, light: r.light ?? 0, equip: r.equip ?? 0, oa: r.oa ?? 0, ach: r.ach ?? 0, ps: r.ps ?? 0, pl: r.pl ?? 0,
    src: Object.assign(defaultSrc(t), r.src || {}),
    ...(typeof r.sched === 'string' ? { sched: r.sched } : {}),
  };
  if (!r.src) {
    out.src.people = 'typ';
    ROOMPICKS.forEach(k => { if (r[k] !== '' && r[k] != null) { const o = ROOMOPTS[k](out, t, ez).find(o => o.v === num(r[k])); out.src[k] = o ? o.id : 'custom'; } });
  }
  resolveRoom(out, ez);
  return out;
}
export function migrate(s: any): AppState {
  if (!s || !s.project || !Array.isArray(s.rooms)) throw new Error('Not a heat load project file');
  const sp = { ...s.project, src: { ...(s.project.src || {}) } };
  /* Old project files may contain fields from the retired CLTD/CLF method. Drop them on import. */
  delete sp.method; delete sp.cltd; delete sp.solar;
  const coastal = ['dubai', 'sharjah', 'ajman', 'uaq', 'rak', 'fujairah'].includes(sp.location);
  if (!s.project.src) {
    ENVK.forEach(k => { const o = LIB[k].find(o => o.v === num(sp[k])); sp.src[k] = o ? o.id : 'custom'; });
    sp.src.indoor = (num(sp.tiDB) === 24 && num(sp.tiRH) === 50) ? 'dbc' : 'custom';
  }
  if (!sp.src.ez) sp.src.ez = 'ceil-cool';
  if (!sp.src.out) { const o = OUT_OPTS.find(o => o.db === num(sp.toDB) && o.wb === num(sp.toWB)); sp.src.out = o ? o.id : 'custom'; }
  if (!sp.src.vent) {
    const vd = (coastal && num(sp.vDB) === 46 && num(sp.vWB) === 29) ? [34, 32] : [num(sp.vDB), num(sp.vWB)];
    const o = VENT_OPTS.find(o => o.db === vd[0] && o.wb === vd[1]);
    sp.src.vent = o ? o.id : (vd[0] === num(sp.toDB) && vd[1] === num(sp.toWB) ? 'same' : 'custom');
  }
  if (coastal && num(sp.vDB) === 46 && num(sp.vWB) === 29) { sp.vDB = 34; sp.vWB = 32; }
  if (sp.location === 'sharjah' && sp.subloc === 'falaj') sp.location = 'uaq';
  if (sp.location === 'sharjah' && sp.subloc === 'masfout') sp.location = 'ajman';
  if (!sp.subloc) { const m = (SUBLOC[sp.location] || []).find(s => s.elev === num(sp.elev) && s.dr === num(sp.dr)); sp.subloc = m ? m.id : 'custom'; }
  const d = defaultProject();
  const p: Project = Object.assign(d, sp, { src: Object.assign({}, d.src, sp.src) });
  /* code sets with no skylight SHGC used to inherit the previous pick; give them the ASHRAE value */
  const types = (l: any): PartType[] => Array.isArray(l) ? l.map((t: any) => ({ id: String(t.id), name: String(t.name ?? ''), u: t.u ?? '', ...(Array.isArray(t.layers) ? { layers: t.layers } : {}) })) : [];
  p.partTypes = types(sp.partTypes); p.wallTypes = types(sp.wallTypes);
  if (['estidama', 'barjeel'].includes(p.cbasis) && (p.src.shgcSky || '').startsWith('safat')) p.src.shgcSky = 'a901';
  resolveProject(p);
  const ez = ezOf(p);
  const rooms = s.rooms.map((r: any) => migrateRoom(r, ez));
  const sel = rooms.find((r: Room) => r.id === s.sel) ? s.sel : rooms[0]?.id;
  return { version: 2, project: p, rooms, sel, example: !!s.example };
}
