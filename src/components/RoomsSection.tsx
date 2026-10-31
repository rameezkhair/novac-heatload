import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Draft } from 'immer';
import { ABOVE, ACT, ADJ, ADJ_EDIT, BELOW, ORIENTS, PXDEF, SCHEDULES, TYPES, typeOf } from '../engine/data';
import { adjTemp, dcvNeeded, type Computed, type RoomLoad } from '../engine/calc';
import { MONTHS, stationOf } from '../engine/climate';
import { roomChecks } from '../engine/checks';
import { ROOMOPTS, RMETA, SHOWV, changeType, ezOf, newId, newRoom, partU, pxU, resolveRoom, type RoomPick } from '../engine/project';
import type { Adjacent, AppState, Mark, Num, Orient, PartType, Project, Room } from '../engine/types';
import { blank, evalArea, fmt, num } from '../engine/util';
import type { Store } from '../state/store';
import { ArmButton, Badge, ExprInput, Field, NumInput, PickField, SecHead, useToast } from './ui';

type RoomFn = (r: Draft<Room>, s: Draft<AppState>) => void;

export function RoomsSection({ store, d }: { store: Store; d: Computed }) {
  const { state, update } = store, toast = useToast();
  const r = state.rooms.find(x => x.id === state.sel);
  const ez = ezOf(d.p);
  /* edit the selected room, then refresh its source-driven values (people from area, and so on) */
  const edit = (fn: RoomFn, group?: string) => update(s => {
    const x = s.rooms.find(y => y.id === s.sel); if (!x) return;
    fn(x, s); resolveRoom(x as Room, ezOf(s.project as AppState['project']));
  }, group);
  /* the Total load row swaps the room editor for the whole-plant summary */
  const [total, setTotal] = useState(false);
  const showTotal = total && state.rooms.length > 0;
  const add = () => { setTotal(false); update(s => { const n = newRoom('Room ' + (s.rooms.length + 1), 'office', ezOf(s.project as AppState['project'])); s.rooms.push(n); s.sel = n.id; }); };

  return <section>
    <SecHead n={5} title="Spaces" sub="Each load item has a source list. Changing a value by hand switches it to Custom." />
    <div className="workspace">
      <nav className="rlist" aria-label="Rooms">
        {state.rooms.map(x => {
          const c = d.res[x.id], ch = roomChecks(x, c, ez), fails = Object.values(ch).filter(v => v && v[0] === 'bad').length;
          return <button key={x.id} type="button" className="ritem" aria-current={!showTotal && x.id === state.sel} onClick={() => { setTotal(false); update(s => { s.sel = x.id; }); }}>
            <span className="nm">{x.name || 'Untitled'}{c.qty > 1 ? ` ×${c.qty}` : ''}</span><span className="tr">{fmt(c.unit / 3517, 2)} TR</span>
            <span className="ty">{typeOf(x.type).label} · {fmt(num(x.area), 0)} m²{fails ? <> · <b className="x">✗ {fails} fail{fails > 1 ? 's' : ''}</b></> : null}</span>
          </button>;
        })}
        {state.rooms.length > 0 && <button type="button" className="rtotal" aria-current={showTotal} onClick={() => setTotal(true)}>
          <span className="nm">Total load</span><span className="tr">{fmt(d.T.u / 3517, 2)} TR</span>
          <span className="ty">{fmt(d.T.u / 1000, 2)} kW · {d.T.q} space{d.T.q === 1 ? '' : 's'} · {fmt(d.T.a, 0)} m²</span>
        </button>}
        <button type="button" className="add" onClick={add}>+ Add room</button>
      </nav>
      {showTotal ? <><div className="editor"><PlantRooms d={d} onOpen={id => { setTotal(false); update(s => { s.sel = id; }); }} /></div>
        <aside className="result" aria-live="polite"><PlantResult d={d} /></aside></> : <>
      <div className="editor">
        {r ? <RoomEditor key={r.id} r={r} d={d} edit={edit}
          onDup={() => update(s => { const i = s.rooms.findIndex(y => y.id === s.sel); const c = JSON.parse(JSON.stringify(s.rooms[i])); c.id = newId(); c.name = s.rooms[i].name + ' (copy)'; s.rooms.splice(i + 1, 0, c); s.sel = c.id; })}
          onDel={() => { update(s => { const i = s.rooms.findIndex(y => y.id === s.sel); s.rooms.splice(i, 1); s.sel = (s.rooms[Math.max(0, i - 1)] || {}).id; }); toast('Room deleted'); }} />
          : <div className="empty">No rooms yet.<br /><br /><button className="btn primary" type="button" onClick={add}>Add the first room</button></div>}
      </div>
      <aside className="result" aria-live="polite">{r ? <RoomResult r={r} d={d} /> : <><div className="eyebrow">Selected room</div><p className="muted">Add a room to see its load.</p></>}</aside>
      </>}
    </div>
  </section>;
}

/* each room's share of the total, all rooms × quantity; click a row to edit that room */
function PlantRooms({ d, onOpen }: { d: Computed; onOpen: (id: string) => void }) {
  const { rooms, res, T } = d, max = Math.max(...rooms.map(x => res[x.id].unit * res[x.id].qty), 1);
  return <>
    <h3>Total load by space</h3>
    <p className="hint" style={{ marginTop: 0 }}>Room unit loads including fresh air{d.p.fahu ? ' (treated in the FAHU, so excluded here)' : ''}, multiplied by quantity. Click a space to edit it.</p>
    <div className="tbl-wrap"><table className="plant-rooms">
      <thead><tr><th>Space</th><th>Qty</th><th>Area m²</th><th>Unit TR</th><th>Total TR</th><th>Total kW</th><th>Share</th></tr></thead>
      <tbody>{rooms.map(x => { const c = res[x.id], t = c.unit * c.qty; return <tr key={x.id} onClick={() => onOpen(x.id)}>
        <td><button type="button" className="linkish">{x.name || 'Untitled'}</button></td><td>{c.qty}</td><td>{fmt(c.A * c.qty, 0)}</td><td>{fmt(c.unit / 3517, 2)}</td><td><b>{fmt(t / 3517, 2)}</b></td><td>{fmt(t / 1000, 2)}</td>
        <td><span className="track"><span className="fill" style={{ width: (t / max * 100).toFixed(1) + '%' }} /></span> {fmt(T.u ? t / T.u * 100 : 0, 0)}%</td></tr>; })}</tbody>
      <tfoot><tr><td>Total</td><td>{T.q}</td><td>{fmt(T.a, 0)}</td><td /><td><b>{fmt(T.u / 3517, 2)}</b></td><td>{fmt(T.u / 1000, 2)}</td><td>100%</td></tr></tfoot>
    </table></div>
  </>;
}

function PlantResult({ d }: { d: Computed }) {
  const { p, T } = d, fa = p.fahu ? T.fahuW : T.oa, rm = T.s + T.l, div = num(p.diversity);
  return <>
    <div className="eyebrow">Total plant · all spaces</div>
    <h3>{p.name || 'Project'}</h3>
    <div className="big"><span className="big-num">{fmt(T.plant / 3517, 2)}</span><span className="big-unit">TR</span></div>
    <div className="sub">{fmt(T.plant / 1000, 2)} kW plant load{div !== 100 ? ` at ${fmt(div, 0)}% diversity` : ''}</div>
    {T.blk && <div className="sub">Block peak on {MONTHS[T.blk.m]} 21 at {String(T.blk.h).padStart(2, '0')}:00 · {fmt((T.blk.s + T.blk.l) / 3517, 2)} TR coincident</div>}
    <dl className="kv">
      <dt>Room load (excl. fresh air)</dt><dd>{fmt(rm / 3517, 2)} TR · {fmt(rm / 1000, 2)} kW</dd>
      <dt>Sensible / latent</dt><dd>{fmt(T.s / 1000, 2)} / {fmt(T.l / 1000, 2)} kW</dd>
      <dt>Sensible heat ratio</dt><dd>{fmt(T.s / (rm || 1), 2)}</dd>
      <dt>Fresh air load{p.fahu && T.rec ? ' (net)' : ''}</dt><dd>{fmt(fa / 3517, 2)} TR · {fmt(fa / 1000, 2)} kW</dd>
      <dt>Fresh air</dt><dd>{fmt(T.oaq, 0)} L/s · {fmt(T.oaq * 2.119, 0)} CFM · {p.fahu ? 'FAHU' : 'room units'}</dd>
      {T.rec ? <><dt>Energy recovered</dt><dd>{fmt(T.rec / 1000, 2)} kW</dd></> : null}
      <dt>Supply air</dt><dd>{fmt(T.sa, 0)} L/s · {fmt(T.sa * 2.119, 0)} CFM</dd>
      <dt>Spaces / area</dt><dd>{T.q} · {fmt(T.a, 0)} m²</dd>
      <dt>People</dt><dd>{fmt(T.n, 0)}</dd>
      <dt>Load density</dt><dd>{fmt(T.a ? T.plant / T.a : 0, 0)} W/m² · {T.plant ? fmt(T.a / (T.plant / 3517), 1) : '–'} m²/TR</dd>
    </dl>
  </>;
}

function RoomEditor({ r, d, edit, onDup, onDel }: { r: Room; d: Computed; edit: (fn: RoomFn, group?: string) => void; onDup: () => void; onDel: () => void }) {
  const t = typeOf(r.type), ez = ezOf(d.p), ch = roomChecks(r, d.res[r.id], ez);
  const marks: Partial<Record<RoomPick, Mark>> = { people: ch.people, oa: ch.oa, light: ch.light };
  const pick = (k: RoomPick) => <PickField id={'r-' + k} label={RMETA[k][0]} unit={RMETA[k][1]} step={RMETA[k][2]} opts={ROOMOPTS[k](r, t, ez)} showV={SHOWV[k]} src={r.src[k]} value={r[k]} mark={marks[k]}
    onSrc={v => edit(x => { x.src[k] = v; })} onValue={v => edit(x => { x[k] = v; x.src[k] = 'custom'; }, 'r.' + k)} />;
  const set = (k: 'qty' | 'height' | 'area' | 'sky', g = true) => (v: Num) => edit(x => { x[k] = v; }, g ? 'r.' + k : undefined);
  return <>
    <h3>Edit room</h3>
    <div className="fgrid3">
      <label className="fld" htmlFor="r-name" style={{ gridColumn: 'span 2' }}><span className="fl">Room name</span><span className="in-u"><input id="r-name" type="text" value={r.name} onChange={e => { const v = e.target.value; edit(x => { x.name = v; }, 'r.name'); }} /></span></label>
      <Field id="r-qty" label="Identical rooms" unit="qty" step={1} value={r.qty} onChange={set('qty')} />
      <label className="fld" htmlFor="r-type" style={{ gridColumn: 'span 2' }}><span className="fl">Room type</span><span className="in-u"><select id="r-type" value={r.type} onChange={e => { const v = e.target.value; edit(x => changeType(x as Room, v, ez)); }}>
        {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></span></label>
      <Field id="r-height" label="Ceiling height" unit="m" step={0.1} value={r.height} onChange={set('height')} />
      <Field id="r-area" label="Floor area" unit="m²" step={0.5} value={r.area} onChange={set('area')}
        after={<AreaCalc what="Floor area" dims={['Length', 'Width']} less="Shafts / voids" onApply={set('area')} />} />
    </div>
    <div className="ed-sec"><h4>Internal loads</h4>
      <div className="fgrid">
        {pick('people')}
        <div className={'fld pick' + (r.src.act === 'custom' ? ' is-custom' : '')}>
          <div className="flrow"><label className="fl" htmlFor="rs-act">Activity, heat gain per person</label></div>
          <span className="in-u src-sel"><select id="rs-act" value={r.src.act} onChange={e => { const v = e.target.value; edit(x => { x.src.act = v; }); }}>
            {ACT.map(a => <option key={a.id} value={a.id}>ASHRAE: {a.label}: {a.s}/{a.l} W</option>)}<option value="custom">Custom value</option></select></span>
          <span className="pair">
            <span className="in-u"><NumInput label="Sensible W per person" step={1} min={0} value={r.ps} onChange={v => edit(x => { x.ps = v; x.src.act = 'custom'; }, 'r.ps')} /><span className="u">W sens.</span></span>
            <span className="in-u"><NumInput label="Latent W per person" step={1} min={0} value={r.pl} onChange={v => edit(x => { x.pl = v; x.src.act = 'custom'; }, 'r.pl')} /><span className="u">W lat.</span></span>
          </span>
        </div>
        {pick('light')}{pick('equip')}
        <label className="fld" htmlFor="r-sched"><span className="fl">Operating hours · people, lighting, equipment</span>
          <span className="in-u"><select id="r-sched" value={r.sched || '24h'} onChange={e => { const v = e.target.value; edit(x => { if (v === '24h') delete x.sched; else x.sched = v; }); }}>
            {SCHEDULES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></span></label>
      </div>
    </div>
    <div className="ed-sec"><h4>Air</h4><div className="fgrid">{pick('oa')}{pick('ach')}</div></div>
    <div className="ed-sec"><h4>External walls and glazing</h4>
      <div className="tbl-wrap"><table className="exp wtbl"><colgroup><col style={{ width: 52 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col /><col style={{ width: 64 }} /></colgroup>
        <thead><tr><th>Facing</th><th>Gross (m²)</th><th>Glass (m²)</th><th>Wall type</th><th></th></tr></thead>
        <tbody>{ORIENTS.map(o => <WallRow key={o} o={o} r={r} p={d.p} edit={edit} />)}</tbody></table></div>
      <p className="hint">Type a number or a sum such as 6*3.2 + 2.5*3.2, or use L × H to work out wall and window areas. {d.p.wallTypes.length ? 'Wall type sets the U-value used for that facing.' : 'To use more than one wall construction, add external wall types in step 4, Building envelope.'}</p>
    </div>
    <div className="ed-sec"><h4>Roof, ceiling and floor</h4>
      <div className="tbl-wrap"><table className="exp ptbl">
        <colgroup><col style={{ width: '27%' }} /><col style={{ width: '11%' }} /><col style={{ width: '29%' }} /><col style={{ width: '13%' }} /><col style={{ width: '20%' }} /></colgroup>
        <thead><tr><th>Element</th><th>Area (m²)</th><th>Adjacent space (tb)</th><th>tb (°C)</th><th>U-value (W/m²K)</th></tr></thead>
        <tbody>
          <SurfaceRow r={r} d={d} w="a" edit={edit} />
          {r.above === 'roof' && <tr><td className="sub">Skylight in roof</td><td><span className="calc-in"><NumInput label="Skylight area" min={0} step={0.5} value={r.sky} onChange={set('sky')} /><AreaCalc what="Skylight" dims={['Length', 'Width']} qty="No. of skylights" onApply={set('sky')} /></span></td><td className="muted" colSpan={3}>Solar and conduction, skylight SHGC and U from the envelope step</td></tr>}
          <SurfaceRow r={r} d={d} w="b" edit={edit} />
        </tbody></table></div>
      <h4 style={{ marginTop: 16 }}>Wall partitions</h4>
      <div className="tbl-wrap"><table className="exp ptbl">
        <colgroup><col style={{ width: '27%' }} /><col style={{ width: '11%' }} /><col style={{ width: '29%' }} /><col style={{ width: '13%' }} /><col style={{ width: '14%' }} /><col style={{ width: '6%' }} /></colgroup>
        <thead><tr><th>Partition type</th><th>Area (m²)</th><th>Adjacent space (tb)</th><th>tb (°C)</th><th>U-value (W/m²K)</th><th></th></tr></thead>
        <tbody>
          {r.px.length ? r.px.map((x, i) => <AdjRow key={i} what={`Partition ${i + 1}`} wall x={x} U={num(partU(d.p, x))} d={d}
            label={<TypeSelect label={`Partition ${i + 1} type`} types={d.p.partTypes} def={d.p.uPart} value={x.pt} onChange={v => edit(y => { if (v) y.px[i].pt = v; else delete y.px[i].pt; })} />}
            change={fn => edit(y => fn(y.px[i]), 'px.' + i)}
            extra={<td className="n"><button className="btn sm" type="button" aria-label={`Delete partition ${i + 1}`} title="Delete" onClick={() => edit(y => { y.px.splice(i, 1); })}>×</button></td>} />)
            : <tr className="dis"><td colSpan={6}>No wall partitions.</td></tr>}
          <tr className="addrow"><td colSpan={6}><button className="btn sm" type="button" onClick={() => edit(y => { y.px.push({ type: 'wall', a: '', adj: PXDEF.wall, t: '', u: '' }); })}>+ Add wall partition</button></td></tr>
        </tbody></table></div>
      <p className="hint">{d.p.partTypes.length ? 'Partition type sets the U-value; type over it for a one-off value. ' : 'To use more than one partition construction, add partition types in step 4, Building envelope. '}Heat balance method: every surface is solved hour by hour with its thermal mass. An unconditioned space defined from the outdoor temperature (outdoor − 2.8 K, ventilated spaces) follows the hourly outdoor profile; walls and slabs shared with conditioned space at the room temperature pass no net heat but store it; a slab on grade sits on 2 m of soil at the annual mean temperature.</p>
    </div>
    <div className="ed-actions">
      <button className="btn" type="button" onClick={onDup}>Duplicate room</button>
      <ArmButton className="btn danger" label="Delete room" armedLabel="Click again to delete" onConfirm={onDel} />
    </div>
  </>;
}

/* one orientation, with an optional length × height calculator */
function WallRow({ o, r, p, edit }: { o: Orient; r: Room; p: Project; edit: (fn: RoomFn, group?: string) => void }) {
  const [open, setOpen] = useState(false), toast = useToast();
  const c = useCalcFields({ L: '', H: String(num(r.height) || 3), ww: '', wh: '', wn: '1', dd: '0' }, ['L', 'H', 'ww', 'wh'], ['dd']), { f, g, k } = c;
  /* areas in m², whatever unit the dimensions were typed in */
  const wall = Math.round(g('L') * g('H') * k * k * 100) / 100, glass = Math.round(g('ww') * g('wh') * g('wn') * k * k * 100) / 100, dd = g('dd') * k * k;
  const inp = (key: keyof typeof f, lab: string, area?: boolean) => <label className="wcf"><span>{lab}</span><input type="text" inputMode="decimal" placeholder={key === 'wn' ? 'qty' : c.unit + (area ? '²' : '')} value={f[key]} aria-label={`${o} ${lab}`} onChange={e => c.set(key, e.target.value)} /></label>;
  return <>
    <tr><td>{o}</td>
      <td><ExprInput label={`${o} wall gross area`} value={r.walls[o].w} onChange={v => edit(x => { x.walls[o].w = v; }, 'w.' + o)} /></td>
      <td><ExprInput label={`${o} glass area`} value={r.walls[o].g} onChange={v => edit(x => { x.walls[o].g = v; }, 'g.' + o)} /></td>
      <td><TypeSelect label={`${o} wall type`} types={p.wallTypes} def={p.uWall} value={r.walls[o].t} onChange={v => edit(x => { if (v) x.walls[o].t = v; else delete x.walls[o].t; })} /></td>
      <td className="wcb"><button className="btn sm" type="button" aria-haspopup="dialog" title="Area calculator" onClick={() => { c.sync(); setOpen(true); }}>L × H</button></td></tr>
    {open && <Modal title={`Area calculator · ${o} wall`} onClose={() => setOpen(false)}>
      <UnitSwitch unit={c.unit} onChange={c.switchTo} />
      <div className="wcgrid">{inp('L', 'Wall length')}{inp('H', 'Wall height')}{inp('ww', 'Window width')}{inp('wh', 'Window height')}{inp('wn', 'No. of windows')}{inp('dd', 'Doors / other openings', true)}</div>
      <p className="wcres">{wall > 0 ? `Wall ${m2(wall, c.unit)} gross · glass ${m2(glass, c.unit)} · opaque ${m2(Math.max(0, wall - glass - dd), c.unit)}${glass + dd > wall ? ' · openings exceed the wall' : ''}` : 'Enter wall length and height.'}</p>
      <div className="modal-actions">
        <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary" type="button" onClick={() => {
          if (!(wall > 0)) { toast('Enter wall length and height'); return; }
          edit(x => { x.walls[o].w = wall; x.walls[o].g = glass || ''; }); setOpen(false); toast(`${o}: wall ${fmt(wall, 2)} m², glass ${fmt(glass, 2)} m²`);
        }}>Apply to {o}</button>
      </div>
    </Modal>}
  </>;
}

/* pick a named wall type from the envelope step; blank is the default U-value. The list shows names only;
   the description with its U-value pops up on hover */
function TypeSelect({ label, types, def, value, onChange }: { label: string; types: PartType[]; def: Num; value?: string; onChange: (v: string) => void }) {
  const cur = types.find(t => t.id === value), desc = (name: string, u: Num) => `${name}: U-value ${num(u)} W/m²K`;
  return <select aria-label={label} title={cur ? desc(cur.name || 'Unnamed', cur.u) : desc('Default (from the envelope step)', def)}
    value={cur ? value : ''} onChange={e => onChange(e.target.value)}>
    <option value="" title={desc('Default (from the envelope step)', def)}>Default</option>
    {types.map(t => <option key={t.id} value={t.id} title={desc(t.name || 'Unnamed', t.u)}>{t.name || 'Unnamed'}</option>)}
  </select>;
}

/* ---------- length unit for the area calculators: metres or feet; results are always m² ---------- */
type LenUnit = 'm' | 'ft';
const FT = 0.3048, UNIT_KEY = 'novac-len-unit';
const readUnit = (): LenUnit => { try { return localStorage.getItem(UNIT_KEY) === 'ft' ? 'ft' : 'm'; } catch { return 'm'; } };
const saveUnit = (u: LenUnit) => { try { localStorage.setItem(UNIT_KEY, u); } catch { /* the choice is just not remembered */ } };
/* a plain number keeps full precision so unit round trips are exact; sums go through evalArea */
const calcNum = (s: string) => { const n = Number(s); return s.trim() !== '' && isFinite(n) && n >= 0 ? n : evalArea(s); };
/* an area in m², with the ft² equivalent when working in feet */
const m2 = (v: number, u: LenUnit) => `${fmt(v, 2)} m²` + (u === 'ft' ? ` (${fmt(v / FT / FT, 1)} ft²)` : '');

/* calculator fields typed in m or ft; switching unit converts the lengths and areas already entered */
function useCalcFields<T extends Record<string, string>>(init: T, lens: (keyof T)[], areas: (keyof T)[]) {
  const [s, setS] = useState(() => ({ f: init, unit: readUnit() }));
  const g = (key: keyof T) => { const v = calcNum(s.f[key]); return typeof v === 'number' ? v : 0; };
  const convert = (to: LenUnit) => setS(cur => {
    if (cur.unit === to) return cur;
    const r = to === 'ft' ? 1 / FT : FT, f = { ...cur.f };
    const conv = (key: keyof T, x: number) => { const v = calcNum(f[key]); if (typeof v === 'number' && v) f[key] = String(Math.round(v * x * 1000) / 1000) as T[keyof T]; };
    lens.forEach(key => conv(key, r)); areas.forEach(key => conv(key, r * r));
    return { f, unit: to };
  });
  return {
    f: s.f, unit: s.unit, g, k: s.unit === 'ft' ? FT : 1,
    set: (key: keyof T, v: string) => setS(cur => ({ ...cur, f: { ...cur.f, [key]: v } })),
    switchTo: (to: LenUnit) => { saveUnit(to); convert(to); },
    /* pick up a unit chosen in another calculator */
    sync: () => convert(readUnit()),
  };
}

function UnitSwitch({ unit, onChange }: { unit: LenUnit; onChange: (u: LenUnit) => void }) {
  return <div className="unit-sw" role="group" aria-label="Length unit">
    <span className="muted">Dimensions in</span>
    {(['m', 'ft'] as const).map(u => <button key={u} type="button" className={'btn sm' + (unit === u ? ' primary' : '')} aria-pressed={unit === u} onClick={() => onChange(u)}>{u === 'm' ? 'Metres (m)' : 'Feet (ft)'}</button>)}
  </div>;
}

/* pop-up area calculator for any area input: dimension × dimension × quantity, less any deduction */
function AreaCalc({ what, dims, qty = 'Quantity', less, onApply }: { what: string; dims: [string, string]; qty?: string; less?: string; onApply: (v: number) => void }) {
  const [open, setOpen] = useState(false), toast = useToast();
  const c = useCalcFields({ a: '', b: '', n: '1', x: '0' }, ['a', 'b'], ['x']), { f, g, k } = c, u = c.unit;
  /* typed in the chosen unit; net is always m² */
  const gross = g('a') * g('b') * (g('n') || 1), net = Math.round(Math.max(0, gross - g('x')) * k * k * 100) / 100;
  const sym = dims[1] === 'Height' ? 'L × H' : 'L × W';
  const inp = (key: keyof typeof f, lab: string, ph: string) => <label className="wcf"><span>{lab}</span><input type="text" inputMode="decimal" placeholder={ph} value={f[key]} aria-label={`${what} ${lab}`} onChange={e => c.set(key, e.target.value)} /></label>;
  return <>
    <button className="btn sm calc-btn" type="button" aria-haspopup="dialog" title={`${what} area calculator`} onClick={() => { c.sync(); setOpen(true); }}>{sym}</button>
    {open && <Modal title={`Area calculator · ${what}`} onClose={() => setOpen(false)}>
      <UnitSwitch unit={u} onChange={c.switchTo} />
      <div className="wcgrid">{inp('a', dims[0], u)}{inp('b', dims[1], u)}{inp('n', qty, 'qty')}{less && inp('x', less, u + '²')}</div>
      <p className="wcres">{gross > 0 ? `${fmt(g('a'), 2)} × ${fmt(g('b'), 2)} ${u}${g('n') > 1 ? ` × ${fmt(g('n'), 0)}` : ''}${less && g('x') ? ` − ${fmt(g('x'), 2)} ${u}²` : ''} = ${m2(net, u)}` : `Enter ${dims[0].toLowerCase()} and ${dims[1].toLowerCase()}.`}</p>
      <div className="modal-actions">
        <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary" type="button" onClick={() => {
          if (!(gross > 0)) { toast(`Enter ${dims[0].toLowerCase()} and ${dims[1].toLowerCase()}`); return; }
          onApply(net); setOpen(false); toast(`${what}: ${fmt(net, 2)} m²`);
        }}>Apply</button>
      </div>
    </Modal>}
  </>;
}

/* a centred dialog over the page; Escape or the backdrop closes it */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.querySelector('input')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);
  return createPortal(<div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={box}>
      <div className="modal-head"><h3>{title}</h3><button className="btn sm" type="button" aria-label="Close" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>, document.body);
}

function adjOptions() {
  const o = ([k, l, , f]: (typeof ADJ)[number]) => <option key={k} value={k}>{l}{['project', 'custom', 'cond', 'cond2'].includes(k) ? '' : ` (${f})`}</option>;
  return <>
    <optgroup label="Conditioned">{ADJ.filter(a => a[0].startsWith('cond')).map(o)}</optgroup>
    <optgroup label="Unconditioned">{ADJ.filter(a => !a[0].startsWith('cond') && !['project', 'custom'].includes(a[0])).map(o)}</optgroup>
    <optgroup label="Other">{ADJ.filter(a => ['project', 'custom'].includes(a[0])).map(o)}</optgroup>
  </>;
}

/* a surface next to another space: area, adjacent space, its temperature and U-value */
function AdjRow({ label, x, U, d, change, outdoor, extra, what = 'Surface', wall }: {
  label: ReactNode; x: Adjacent; U: number; d: Computed; change: (fn: (x: Draft<Adjacent>) => void) => void; outdoor?: boolean; extra?: ReactNode; what?: string; wall?: boolean;
}) {
  const p = d.p, id = x.adj || 'project', T = outdoor ? d.e.To : adjTemp(p, d.e, id, x.t), cust = !blank(x.u), editable = !outdoor && ADJ_EDIT(id);
  return <tr><td>{label}</td>
    <td><span className="calc-in"><ExprInput label="Area" title="Number or sum, e.g. 4*3.2" value={x.a} onChange={v => change(y => { y.a = v; })} />
      <AreaCalc what={what} dims={wall ? ['Length', 'Height'] : ['Length', 'Width']} less={wall ? 'Doors / openings' : undefined} onApply={v => change(y => { y.a = v; })} /></span></td>
    <td>{outdoor ? <span className="muted">Outdoor air</span> : <select aria-label="Adjacent space" value={id} onChange={e => {
      const v = e.target.value;
      change(y => { y.adj = v; if (v === 'custom' && blank(y.t)) y.t = adjTemp(p, d.e, 'project'); if (v === 'cond2' && blank(y.t)) y.t = num(p.tiDB) + 2; });
    }}>{adjOptions()}</select>}</td>
    <td><NumInput label="Adjacent temperature" step={0.5} value={Math.round(T * 10) / 10} readOnly={!editable}
      title={editable ? 'Edit the adjacent space temperature' : 'Set by the space type; choose Custom or a different set-point to edit'}
      onChange={editable ? v => change(y => { y.t = v; }) : undefined} /></td>
    <td><span className={'ucell' + (cust ? ' cust' : '')}><NumInput label="U-value" min={0} step={0.01} value={cust ? x.u : U} onChange={v => change(y => { y.u = v; })} />
      {cust && <button className="btn sm" type="button" title="Back to the envelope step value" onClick={() => change(y => { y.u = ''; })}>↺</button>}</span>
      <span className="usrc">{cust ? 'Custom' : 'Envelope'}</span></td>
    {extra}
  </tr>;
}

function SurfaceRow({ r, d, w, edit }: { r: Room; d: Computed; w: 'a' | 'b'; edit: (fn: RoomFn, group?: string) => void }) {
  const p = d.p, sel = w === 'a' ? r.above : r.below, L = w === 'a' ? ABOVE : BELOW;
  const pickEl = <select aria-label={w === 'a' ? 'Roof or ceiling' : 'Floor'} value={sel} onChange={e => {
    const v = e.target.value;
    edit(x => {
      if (w === 'a') { x.above = v as Room['above']; if (v === 'roof' && !num(x.roof)) x.roof = num(x.area); if (v !== 'roof') x.sky = ''; if (v === 'uncond' && !num(x.ce.a)) x.ce.a = num(x.area); }
      else { x.below = v as Room['below']; if (['uncond', 'outdoor'].includes(v) && !num(x.fl.a)) x.fl.a = num(x.area); }
    });
  }}>{L.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  if (w === 'a' && sel === 'roof') return <tr><td>{pickEl}</td>
    <td><span className="calc-in"><NumInput label="Roof area" min={0} step={0.5} value={r.roof} onChange={v => edit(x => { x.roof = v; }, 'r.roof')} /><AreaCalc what="Roof" dims={['Length', 'Width']} onApply={v => edit(x => { x.roof = v; })} /></span></td>
    <td className="muted">Outdoor, sun on roof</td><td className="n">Hourly</td><td className="n">{num(p.uRoof)} <span className="usrc">Envelope roof</span></td></tr>;
  if (sel === 'cond') return <tr><td>{pickEl}</td><td className="muted">–</td><td className="muted">Conditioned at room temperature</td><td className="n">{num(p.tiDB)} °C</td><td className="muted">No transfer</td></tr>;
  if (sel === 'ground') return <tr><td>{pickEl}</td><td className="muted">–</td><td className="muted">Ground</td><td className="muted">–</td><td className="muted">{`Soil at ${stationOf(p.location).tavg} °C`}</td></tr>;
  const k = w === 'a' ? 'ce' : 'fl';
  return <AdjRow label={pickEl} what={w === 'a' ? 'Ceiling' : 'Floor'} x={r[k]} U={num(pxU(p, w === 'a' ? 'ceiling' : 'floor'))} d={d} outdoor={sel === 'outdoor'} change={fn => edit(x => fn(x[k]), k)} />;
}

function RoomResult({ r, d }: { r: Room; d: Computed }) {
  const p = d.p, e = d.e, c = d.res[r.id], ch = roomChecks(r, c, ezOf(p)), rm = c.roomS + c.roomL, tr = rm / 3517;
  const items: [string, number, boolean?][] = [['Walls', c.walls], ['Roof', c.roof], ['Glass, solar', c.gSol], ['Glass, conduction', c.gCond], ['Wall partitions', c.partW], ['Ceiling partitions', c.partC], ['Floor partitions / exposed floor', c.partF],
    ['People, sensible', c.pS], ['People, latent', c.pL, true], ['Lighting', c.light], ['Equipment', c.equip], ['Infiltration, sensible', c.infS], ['Infiltration, latent', c.infL, true], ['Safety margin, sensible', c.mS], ['Safety margin, latent', c.mL, true]];
  const max = Math.max(...items.map(i => i[1]), 1);
  return <>
    <div className="eyebrow">Selected room · per unit</div>
    <h3>{r.name || 'Untitled'}</h3>
    <div className="big"><span className="big-num">{fmt(tr, 2)}</span><span className="big-unit">TR</span></div>
    <div className="sub">{fmt(rm / 1000, 2)} kW room load, excluding fresh air{c.qty > 1 ? ` · ${c.qty} rooms = ${fmt(tr * c.qty, 2)} TR` : ''}</div>
    {c.pkM != null && <div className="sub">Peak on {MONTHS[c.pkM]} 21 at {String(c.pkH).padStart(2, '0')}:00 · heat balance method</div>}
    <dl className="kv">
      <dt>Sensible / latent</dt><dd>{fmt(c.roomS / 1000, 2)} / {fmt(c.roomL / 1000, 2)} kW</dd>
      <dt>Sensible heat ratio</dt><dd>{fmt(c.roomS / (rm || 1), 2)}</dd>
      <dt>Load density</dt><dd>{fmt(c.A ? rm / c.A : 0, 0)} W/m² · {rm ? fmt(c.A / tr, 1) : '–'} m²/TR</dd>
      <dt>Supply air (ΔT {fmt(num(p.tiDB) - num(p.tSupply), 1)} K)</dt><dd>{fmt(c.sa, 0)} L/s · {fmt(c.sa * 2.119, 0)} CFM</dd>
      <dt>Fresh air</dt><dd>{fmt(c.oaQ, 0)} L/s <Badge m={ch.oa} /></dd>
      <dt>People</dt><dd>{fmt(c.n, 0)} × {num(r.ps)}/{num(r.pl)} W <Badge m={ch.people} /></dd>
      {ch.light && <><dt>Lighting</dt><dd>{num(r.light)} W/m² <Badge m={ch.light} /></dd></>}
      {dcvNeeded(c) && <><dt>Demand controlled ventilation</dt><dd><span className="pill req">Required, H.4.8.3</span></dd></>}
    </dl>
    <div className="oa-box">
      <div className="oa-h"><span>Fresh air cooling load</span><span className={'pill ' + (p.fahu ? 'ok' : 'warn')}>{p.fahu ? 'Treated in FAHU' : 'Handled by room unit'}</span></div>
      <div className="oa-v"><b>{fmt(c.oa / 3517, 2)}</b> TR · {fmt(c.oa / 1000, 2)} kW</div>
      <dl className="kv">
        <dt>Fresh air</dt><dd>{fmt(c.oaQ, 0)} L/s · {fmt(c.oaQ * 2.119, 0)} CFM</dd>
        <dt>Sensible</dt><dd>{fmt(c.oaS / 1000, 2)} kW</dd>
        <dt style={{ color: 'var(--lat)' }}>Latent</dt><dd style={{ color: 'var(--lat)' }}>{fmt(c.oaL / 1000, 2)} kW</dd>
        <dt>Design</dt><dd>{fmt(e.Tv, 1)}/{num(p.vWB)} °C → {num(p.tiDB)} °C, {num(p.tiRH)}%</dd>
        <dt>Per 100 L/s</dt><dd>{c.oaQ ? fmt(c.oa / c.oaQ * 100 / 1000, 2) : '–'} kW</dd>
      </dl>
    </div>
    {!p.fahu && <div className="sub" style={{ marginTop: 8 }}>Room unit selection: {fmt(c.unit / 3517, 2)} TR ({fmt(c.unit / 1000, 2)} kW) room plus fresh air</div>}
    <div className="bars">
      {items.map(([l, v, lat]) => <div key={l} className={'bar-row' + (lat ? ' lat' : '')}><span>{l}</span><span className="track"><span className={'fill' + (lat ? ' lat' : '')} style={{ width: Math.max(0, v / max * 100).toFixed(1) + '%' }} /></span><span className="v">{fmt(v / 1000, 2)} kW</span></div>)}
      <div className="bar-row tot-row"><span><b>Room total</b></span><span className="muted" style={{ fontSize: 11 }}>{fmt(c.roomS / 1000, 2)} sensible + {fmt(c.roomL / 1000, 2)} latent</span><span className="v"><b>{fmt(rm / 1000, 2)} kW</b></span></div>
      <div className="legend"><span><i style={{ background: 'var(--bar)' }} />Sensible load</span><span><i style={{ background: 'var(--lat)' }} />Latent load</span></div>
    </div>
    <HourlyChart c={c} />
  </>;
}

/* heat balance: room load in each hour of the peak month, and the peak of each month */
function HourlyChart({ c }: { c: RoomLoad }) {
  if (!c.profS || !c.profL || c.pkM == null) return null;
  const tot = (m: number, i: number) => (c.profS![m * 24 + i] + c.profL![m * 24 + i]) / 1000;
  const day = Array.from({ length: 24 }, (_, i) => tot(c.pkM!, i));
  const mon = MONTHS.map((_, m) => Math.max(...Array.from({ length: 24 }, (_, i) => tot(m, i))));
  const max = Math.max(...day, ...mon, 0.001), H = 56;
  const bars = (v: number[], w: number, hi: number, label: (i: number) => string, every: number) => <svg viewBox={`0 0 ${v.length * w} ${H + 13}`} className="hb-svg" role="img"
    aria-label={v.map((x, i) => `${label(i)} ${fmt(x, 2)} kW`).join(', ')}>
    {v.map((x, i) => { const h = Math.max(0, x / max * H); return <rect key={i} x={i * w + 1} y={H - h} width={w - 2} height={h} rx={1} fill={i === hi ? 'var(--accent)' : 'var(--bar)'} />; })}
    {v.map((_, i) => (i + 1) % every === 0 || every === 1 ? <text key={i} x={i * w + w / 2} y={H + 11} textAnchor="middle" fontSize={9} fill="var(--muted)">{label(i)}</text> : null)}
  </svg>;
  return <div className="hb-chart">
    <div className="eyebrow">Room load by hour · {MONTHS[c.pkM]} 21 · peak {fmt(day[c.pkH! - 1], 2)} kW at {String(c.pkH).padStart(2, '0')}:00</div>
    {bars(day, 10, c.pkH! - 1, i => String(i + 1), 6)}
    <div className="eyebrow">Peak room load by month</div>
    {bars(mon, 20, c.pkM, i => MONTHS[i][0], 1)}
  </div>;
}
