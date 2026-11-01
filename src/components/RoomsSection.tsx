import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Draft } from 'immer';
import { ABOVE, ACT, ADJ, ADJ_EDIT, BELOW, ORIENTS, PXDEF, SCHEDULES, TYPES, typeOf } from '../engine/data';
import { adjTemp, dcvNeeded, type Computed, type RoomLoad } from '../engine/calc';
import { MONTHS, stationOf } from '../engine/climate';
import { roomChecks } from '../engine/checks';
import { ROOMOPTS, RMETA, SHOWV, changeType, ezOf, newId, newRoom, partU, pxU, resolveRoom, type RoomPick } from '../engine/project';
import type { Adjacent, AppState, Floor, Mark, Num, Orient, PartType, Project, Room } from '../engine/types';
import { blank, evalArea, fmt, num } from '../engine/util';
import type { Store } from '../state/store';
import { ArmButton, Badge, ExprInput, Field, NumInput, PickField, SecHead, useToast } from './ui';
import { LoadPicture } from './LoadPlan';

type RoomFn = (r: Draft<Room>, s: Draft<AppState>) => void;

const FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor', 'Fifth floor', 'Sixth floor'];
type View = { k: 'room' } | { k: 'total' } | { k: 'floor'; id: string };

export function RoomsSection({ store, d }: { store: Store; d: Computed }) {
  const { state, update } = store, toast = useToast();
  const r = state.rooms.find(x => x.id === state.sel);
  const ez = ezOf(d.p), floors = state.project.floors ?? [];
  /* edit the selected room, then refresh its source-driven values (people from area, and so on) */
  const edit = (fn: RoomFn, group?: string) => update(s => {
    const x = s.rooms.find(y => y.id === s.sel); if (!x) return;
    fn(x, s); resolveRoom(x as Room, ezOf(s.project as AppState['project']));
  }, group);
  /* the list selects a room, a floor, or the Total load row (whole-plant summary) */
  const [view, setView] = useState<View>({ k: 'room' });
  const floor = view.k === 'floor' ? floors.find(f => f.id === view.id) : undefined;
  const shown: View['k'] = !state.rooms.length && !floor ? 'room' : view.k === 'floor' && !floor ? 'room' : view.k;
  const open = (id: string) => { setView({ k: 'room' }); update(s => { s.sel = id; }); };
  const add = (level?: string) => {
    setView({ k: 'room' });
    update(s => { const n = newRoom('Room ' + (s.rooms.length + 1), 'office', ezOf(s.project as AppState['project'])); if (level) n.level = level; s.rooms.push(n); s.sel = n.id; });
  };
  const addFloor = () => {
    /* the next floor name after the highest one in use, never a duplicate */
    const id = newId(), first = !floors.length, names = new Set(floors.map(x => x.name));
    let i = Math.max(-1, ...floors.map(x => FLOOR_NAMES.indexOf(x.name))) + 1, name = FLOOR_NAMES[i] ?? `Floor ${i}`;
    while (names.has(name)) name = FLOOR_NAMES[++i] ?? `Floor ${i}`;
    update(s => {
      const fl = (s.project.floors ??= []); fl.push({ id, name, n: 1 });
      /* the first floor takes the rooms already entered */
      if (first) s.rooms.forEach(x => { if (!x.level) x.level = id; });
    });
    setView({ k: 'floor', id });
    toast(first && state.rooms.length ? `Added ${name} with the existing rooms` : `Added ${name}`);
  };
  /* drag a space onto a floor to move it there, or onto a space to place it just before that one ('' = not on a floor) */
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ floor: string; before?: string } | null>(null);
  const move = (id: string, level: string, before?: string) => {
    const r0 = state.rooms.find(x => x.id === id); if (!r0 || before === id) return;
    const to = level ? floors.find(f => f.id === level)?.name ?? 'the floor' : 'Not on a floor', changed = (r0.level ?? '') !== level;
    update(s => {
      const i = s.rooms.findIndex(x => x.id === id), [r] = s.rooms.splice(i, 1);
      if (level) r.level = level; else delete r.level;
      /* before a given space, otherwise after the last space already on that floor */
      let j = before ? s.rooms.findIndex(x => x.id === before) : -1;
      if (j < 0) { const last = s.rooms.map(x => x.level ?? '').lastIndexOf(level); j = last < 0 ? s.rooms.length : last + 1; }
      s.rooms.splice(j, 0, r);
    });
    if (changed) toast(`Moved ${r0.name || 'the space'} to ${to}`);
  };
  const drop = (floor: string, before?: string) => ({
    onDragOver: (e: DragEvent) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; if (over?.floor !== floor || over?.before !== before) setOver({ floor, before }); },
    onDrop: (e: DragEvent) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); move(drag, floor, before); setDrag(null); setOver(null); },
  });
  const item = (x: Room) => {
    const c = d.res[x.id], ch = roomChecks(x, c, ez), fails = Object.values(ch).filter(v => v && v[0] === 'bad').length, q = Math.max(1, Math.round(num(x.qty)) || 1);
    const lv = x.level && floors.some(f => f.id === x.level) ? x.level : '';
    return <button key={x.id} type="button" className={'ritem' + (drag === x.id ? ' dragging' : '') + (over?.before === x.id && drag !== x.id ? ' drop-before' : '')} aria-current={shown === 'room' && x.id === state.sel} onClick={() => open(x.id)}
      draggable title="Drag to another floor, or onto a space to place it before that space"
      onDragStart={e => { try { e.dataTransfer.setData('text/plain', x.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* no data transfer (tests) */ } setDrag(x.id); }}
      onDragEnd={() => { setDrag(null); setOver(null); }} {...drop(lv, x.id)}>
      <span className="nm">{x.name || 'Untitled'}{q > 1 ? ` ×${q}` : ''}</span><span className="tr">{fmt(c.unit / 3517, 2)} TR</span>
      <span className="ty">{typeOf(x.type).label} · {fmt(num(x.area), 0)} m²{fails ? <> · <b className="x">✗ {fails} fail{fails > 1 ? 's' : ''}</b></> : null}</span>
    </button>;
  };
  const sum = (rooms: Room[]) => rooms.reduce((a, x) => { const c = d.res[x.id]; return { u: a.u + c.unit * c.qty, a: a.a + c.A * c.qty }; }, { u: 0, a: 0 });
  const loose = state.rooms.filter(x => !x.level || !floors.some(f => f.id === x.level));

  return <section>
    <SecHead n={5} title="Spaces" sub="Each load item has a source list. Changing a value by hand switches it to Custom." />
    <div className={'workspace' + (shown === 'total' ? ' is-total' : '')}>
      <nav className="rlist" aria-label="Rooms">
        {floors.map(f => {
          const rooms = state.rooms.filter(x => x.level === f.id), t = sum(rooms), n = Math.max(1, Math.round(num(f.n)) || 1);
          return <div className={'rfloor' + (drag && over?.floor === f.id ? ' drop-over' : '')} key={f.id} role="group" aria-label={f.name} {...drop(f.id)}>
            <button type="button" className="rfloor-h" aria-current={shown === 'floor' && floor?.id === f.id} onClick={() => setView({ k: 'floor', id: f.id })}>
              <span className="nm">{f.name || 'Untitled floor'}{n > 1 ? ` ×${n}` : ''}</span><span className="tr">{fmt(t.u / 3517, 2)} TR</span>
              <span className="ty">{rooms.length} space{rooms.length === 1 ? '' : 's'} · {fmt(t.a, 0)} m²{n > 1 ? ` (${n} floors)` : ''}</span>
            </button>
            {rooms.map(item)}
            <button type="button" className="add sm" onClick={() => add(f.id)}>+ Add room to {f.name || 'this floor'}</button>
          </div>;
        })}
        {floors.length > 0 && (loose.length > 0 || drag) && <div className={'rfloor' + (drag && over?.floor === '' ? ' drop-over' : '')} role="group" aria-label="Not on a floor" {...drop('')}>
          <div className="rfloor-h static"><span className="nm">Not on a floor</span>{!loose.length && <span className="ty">Drop here to take a space off its floor</span>}</div>{loose.map(item)}</div>}
        {!floors.length && <div className="rflat" {...drop('')}>{state.rooms.map(item)}</div>}
        {drag && floors.length > 0 && <p className="drag-hint" role="status">Drop on a floor to move the space there.</p>}
        {state.rooms.length > 0 && <button type="button" className="rtotal" aria-current={shown === 'total'} onClick={() => setView({ k: 'total' })}>
          <span className="nm">Total load</span><span className="tr">{fmt(d.T.u / 3517, 2)} TR</span>
          <span className="ty">{fmt(d.T.u / 1000, 2)} kW · {d.T.q} space{d.T.q === 1 ? '' : 's'} · {fmt(d.T.a, 0)} m²</span>
        </button>}
        {!floors.length && <button type="button" className="add" onClick={() => add()}>+ Add room</button>}
        <button type="button" className="add" onClick={addFloor}>+ Add floor</button>
      </nav>
      {shown === 'total' ? <><div className="editor"><LoadPicture d={d} onOpen={open} /><PlantRooms d={d} onOpen={open} /></div>
        <aside className="result" aria-live="polite"><PlantResult d={d} /></aside></>
        : shown === 'floor' && floor ? <><div className="editor"><FloorEditor key={floor.id} store={store} d={d} id={floor.id} onOpen={open} onGone={() => setView({ k: 'room' })} /></div>
          <aside className="result" aria-live="polite"><FloorResult d={d} id={floor.id} /></aside></> : <>
      <div className="editor">
        {r ? <RoomEditor key={r.id} r={r} d={d} edit={edit}
          onDup={() => update(s => { const i = s.rooms.findIndex(y => y.id === s.sel); const c = JSON.parse(JSON.stringify(s.rooms[i])); c.id = newId(); c.name = s.rooms[i].name + ' (copy)'; s.rooms.splice(i + 1, 0, c); s.sel = c.id; })}
          onDel={() => { update(s => { const i = s.rooms.findIndex(y => y.id === s.sel); s.rooms.splice(i, 1); s.sel = (s.rooms[Math.max(0, i - 1)] || {}).id; }); toast('Room deleted'); }} />
          : <div className="empty">No rooms yet.<br /><br /><button className="btn primary" type="button" onClick={() => add(floors[0]?.id)}>Add the first room</button></div>}
      </div>
      <aside className="result" aria-live="polite">{r ? <RoomResult r={r} d={d} /> : <><div className="eyebrow">Selected room</div><p className="muted">Add a room to see its load.</p></>}</aside>
      </>}
    </div>
  </section>;
}

/* one floor: its name, how many identical floors it stands for, and its rooms */
function FloorEditor({ store, d, id, onOpen, onGone }: { store: Store; d: Computed; id: string; onOpen: (id: string) => void; onGone: () => void }) {
  const { update } = store, toast = useToast(), f = (d.p.floors ?? []).find(x => x.id === id)!, rooms = d.rooms.filter(x => x.level === id);
  const setF = (fn: (x: Floor) => void, g?: string) => update(s => { const x = s.project.floors?.find(y => y.id === id); if (x) fn(x as Floor); }, g);
  const dup = () => {
    const nid = newId();
    update(s => {
      const fl = s.project.floors!, i = fl.findIndex(y => y.id === id);
      fl.splice(i + 1, 0, { id: nid, name: `${f.name} (copy)`, n: f.n });
      s.rooms.filter(x => x.level === id).forEach(x => { const c = JSON.parse(JSON.stringify(x)); c.id = newId(); c.level = nid; s.rooms.push(c); });
    });
    toast(`Copied ${f.name} with ${rooms.length} room${rooms.length === 1 ? '' : 's'}`);
  };
  const del = () => {
    update(s => { s.rooms = s.rooms.filter(x => x.level !== id); s.project.floors = s.project.floors!.filter(y => y.id !== id); if (!s.project.floors.length) delete s.project.floors; });
    onGone(); toast(`Deleted ${f.name}${rooms.length ? ` and its ${rooms.length} room${rooms.length === 1 ? '' : 's'}` : ''}`);
  };
  return <>
    <h3>Edit floor</h3>
    <div className="fgrid3">
      <label className="fld" htmlFor="f-name" style={{ gridColumn: 'span 2' }}><span className="fl">Floor name</span><span className="in-u"><input id="f-name" type="text" value={f.name}
        onChange={e => { const v = e.target.value; setF(x => { x.name = v; }, 'f.name.' + id); }} /></span></label>
      <Field id="f-n" label="Identical floors" unit="qty" step={1} value={f.n} onChange={v => setF(x => { x.n = v; }, 'f.n.' + id)} />
    </div>
    <p className="hint">For typical floors, enter how many identical floors this one stands for: every room on it then counts that many times in the loads, fresh air and plant.</p>
    <div className="btns floor-btns">
      <button className="btn" type="button" onClick={dup}>Duplicate floor</button>
      <ArmButton className="btn danger" label="Delete floor" armedLabel={rooms.length ? `Delete floor and its ${rooms.length} room${rooms.length === 1 ? '' : 's'}?` : 'Click again to delete'} onConfirm={del} />
    </div>
    {rooms.length ? <><LoadPicture d={d} onOpen={onOpen} only={id} /><PlantRooms d={d} onOpen={onOpen} only={id} /></> : <p className="hint">No rooms on this floor yet. Use + Add room under the floor in the list.</p>}
  </>;
}

function FloorResult({ d, id }: { d: Computed; id: string }) {
  const f = (d.p.floors ?? []).find(x => x.id === id)!, rooms = d.rooms.filter(x => x.level === id), n = Math.max(1, Math.round(num(f.n)) || 1);
  const t = rooms.reduce((a, x) => { const c = d.res[x.id], q = c.qty; return { u: a.u + c.unit * q, s: a.s + c.roomS * q, l: a.l + c.roomL * q, oa: a.oa + c.oaQ * q, a: a.a + c.A * q, p: a.p + c.n * q, sa: a.sa + c.sa * q }; }, { u: 0, s: 0, l: 0, oa: 0, a: 0, p: 0, sa: 0 });
  return <>
    <div className="eyebrow">Floor{n > 1 ? ` · ${n} identical floors` : ''}</div>
    <h3>{f.name || 'Untitled floor'}</h3>
    <div className="big"><span className="big-num">{fmt(t.u / 3517, 2)}</span><span className="big-unit">TR</span></div>
    <div className="sub">{fmt(t.u / 1000, 2)} kW of room unit load{d.p.fahu ? ', fresh air in the FAHU' : ', including fresh air'}{n > 1 ? `; ${fmt(t.u / n / 3517, 2)} TR per floor` : ''}</div>
    <dl className="kv">
      <dt>Room load (excl. fresh air)</dt><dd>{fmt((t.s + t.l) / 3517, 2)} TR · {fmt((t.s + t.l) / 1000, 2)} kW</dd>
      <dt>Sensible / latent</dt><dd>{fmt(t.s / 1000, 2)} / {fmt(t.l / 1000, 2)} kW</dd>
      <dt>Fresh air</dt><dd>{fmt(t.oa, 0)} L/s · {fmt(t.oa * 2.119, 0)} CFM</dd>
      <dt>Supply air</dt><dd>{fmt(t.sa, 0)} L/s · {fmt(t.sa * 2.119, 0)} CFM</dd>
      <dt>Spaces / area</dt><dd>{rooms.length} · {fmt(t.a, 0)} m²</dd>
      <dt>People</dt><dd>{fmt(t.p, 0)}</dd>
      <dt>Share of the building</dt><dd>{fmt(d.T.u ? t.u / d.T.u * 100 : 0, 0)}%</dd>
    </dl>
  </>;
}

/* each room's share of the total, all rooms × quantity; click a row to edit that room */
function PlantRooms({ d, onOpen, only }: { d: Computed; onOpen: (id: string) => void; only?: string }) {
  const { res, T } = d, rooms = only ? d.rooms.filter(x => x.level === only) : d.rooms, max = Math.max(...rooms.map(x => res[x.id].unit * res[x.id].qty), 1);
  const floors = d.p.floors ?? [], fl = !only && floors.length > 0, fname = (x: Room) => floors.find(f => f.id === x.level)?.name ?? '–';
  return <>
    <h3>{only ? 'Load by space on this floor' : 'Total load by space'}</h3>
    <p className="hint" style={{ marginTop: 0 }}>Room unit loads including fresh air{d.p.fahu ? ' (treated in the FAHU, so excluded here)' : ''}, multiplied by quantity. Click a space to edit it.</p>
    <div className="tbl-wrap"><table className="plant-rooms">
      <thead><tr><th>Space</th>{fl && <th>Floor</th>}<th>Qty</th><th>Area m²</th><th>Unit TR</th><th>Total TR</th><th>Total kW</th><th>Share</th></tr></thead>
      <tbody>{rooms.map(x => { const c = res[x.id], t = c.unit * c.qty; return <tr key={x.id} onClick={() => onOpen(x.id)}>
        <td><button type="button" className="linkish">{x.name || 'Untitled'}</button></td>{fl && <td>{fname(x)}</td>}<td>{c.qty}</td><td>{fmt(c.A * c.qty, 0)}</td><td>{fmt(c.unit / 3517, 2)}</td><td><b>{fmt(t / 3517, 2)}</b></td><td>{fmt(t / 1000, 2)}</td>
        <td><span className="track"><span className="fill" style={{ width: (t / max * 100).toFixed(1) + '%' }} /></span> {fmt(T.u ? t / T.u * 100 : 0, 0)}%</td></tr>; })}</tbody>
      {!only && <tfoot><tr><td>Total</td>{fl && <td />}<td>{T.q}</td><td>{fmt(T.a, 0)}</td><td /><td><b>{fmt(T.u / 3517, 2)}</b></td><td>{fmt(T.u / 1000, 2)}</td><td>100%</td></tr></tfoot>}
    </table></div>
  </>;
}

/* building totals of the room panel: load components, compliance across spaces and the coincident hourly profile, all × quantity */
function buildingDetail(d: Computed) {
  const { p, res, rooms } = d, ez = ezOf(p), sum = (f: (c: RoomLoad) => number) => rooms.reduce((a, r) => a + f(res[r.id]) * res[r.id].qty, 0);
  const items: [string, number, boolean?][] = [['Walls', sum(c => c.walls)], ['Roof', sum(c => c.roof)], ['Glass, solar', sum(c => c.gSol)], ['Glass, conduction', sum(c => c.gCond)],
    ['Wall partitions', sum(c => c.partW)], ['Ceiling partitions', sum(c => c.partC)], ['Floor partitions / exposed floor', sum(c => c.partF)],
    ['People, sensible', sum(c => c.pS)], ['People, latent', sum(c => c.pL), true], ['Lighting', sum(c => c.light)], ['Equipment', sum(c => c.equip)],
    ['Infiltration, sensible', sum(c => c.infS)], ['Infiltration, latent', sum(c => c.infL), true], ['Safety margin, sensible', sum(c => c.mS)], ['Safety margin, latent', sum(c => c.mL), true]];
  const fails = (k: 'oa' | 'people' | 'light') => rooms.filter(r => { const m = roomChecks(r, res[r.id], ez)[k]; return m && m[0] !== 'ok'; }).map(r => r.name || 'Untitled');
  const mark = (bad: string[], what: string): Mark => bad.length ? ['bad', `${what} not met in: ${bad.join(', ')}`, `${bad.length} space${bad.length === 1 ? '' : 's'} below`] : ['ok', `${what} met in every space`];
  const lightAll = rooms.some(r => roomChecks(r, res[r.id], ez).light);
  /* light: area-weighted average W/m² across the spaces */
  const lpd = d.T.a ? rooms.reduce((a, r) => a + num(r.light) * res[r.id].A * res[r.id].qty, 0) / d.T.a : 0;
  let prof: RoomLoad | null = null;
  if (d.T.blk && rooms.every(r => res[r.id].profS && res[r.id].profL)) {
    const S = new Array(288).fill(0), L = new Array(288).fill(0);
    rooms.forEach(r => { const c = res[r.id]; for (let i = 0; i < 288; i++) { S[i] += c.profS![i] * c.qty; L[i] += c.profL![i] * c.qty; } });
    prof = { profS: S, profL: L, pkM: d.T.blk.m, pkH: d.T.blk.h } as unknown as RoomLoad;
  }
  return { items, oa: mark(fails('oa'), 'Minimum fresh air'), people: mark(fails('people'), 'Minimum occupancy'), light: lightAll ? mark(fails('light'), 'Lighting allowance') : null, lpd, prof };
}

function PlantResult({ d }: { d: Computed }) {
  const { p, e, T } = d, fa = p.fahu ? T.fahuW : T.oa, rm = T.s + T.l, div = num(p.diversity), b = buildingDetail(d);
  const max = Math.max(...b.items.map(i => i[1]), 1);
  /* full-width summary: the plant total across the top, then one tile per figure, wrapping so every value shows in full */
  const tile = (k: string, v: ReactNode, s?: string) => <div className="pt"><dt>{k}</dt><dd>{v}</dd>{s && <dd className="pt-s">{s}</dd>}</div>;
  return <div className="plant-band">
    <div className="pb-head">
      <div>
        <div className="eyebrow">Total plant · all spaces</div>
        <h3>{p.name || 'Project'}</h3>
      </div>
      <div className="big"><span className="big-num">{fmt(T.plant / 3517, 2)}</span><span className="big-unit">TR</span></div>
      <div className="pb-subs">
        <div className="sub">{fmt(T.plant / 1000, 2)} kW plant load{div !== 100 ? ` at ${fmt(div, 0)}% diversity` : ''}</div>
        {T.blk && <div className="sub">Block peak on {MONTHS[T.blk.m]} 21 at {String(T.blk.h).padStart(2, '0')}:00 · {fmt((T.blk.s + T.blk.l) / 3517, 2)} TR coincident</div>}
      </div>
    </div>
    <dl className="pb-tiles">
      {tile('Room load (excl. fresh air)', `${fmt(rm / 3517, 2)} TR`, `${fmt(rm / 1000, 2)} kW`)}
      {tile('Sensible / latent', `${fmt(T.s / 1000, 2)} / ${fmt(T.l / 1000, 2)} kW`)}
      {tile('Sensible heat ratio', fmt(T.s / (rm || 1), 2))}
      {tile('Room load density', `${fmt(T.a ? rm / T.a : 0, 0)} W/m²`, rm ? `${fmt(T.a / (rm / 3517), 1)} m²/TR` : '–')}
      {tile('Plant load density', `${fmt(T.a ? T.plant / T.a : 0, 0)} W/m²`, T.plant ? `${fmt(T.a / (T.plant / 3517), 1)} m²/TR` : '–')}
      {tile(`Supply air (ΔT ${fmt(num(p.tiDB) - num(p.tSupply), 1)} K)`, `${fmt(T.sa, 0)} L/s`, `${fmt(T.sa * 2.119, 0)} CFM`)}
      {tile('Fresh air', <>{fmt(T.oaq, 0)} L/s <Badge m={b.oa} /></>, `${fmt(T.oaq * 2.119, 0)} CFM · ${p.fahu ? 'FAHU' : 'room units'}`)}
      {tile('People', <>{fmt(T.n, 0)} <Badge m={b.people} /></>)}
      {b.light && tile('Lighting', <>{fmt(b.lpd, 1)} W/m² <Badge m={b.light} /></>, 'area-weighted average')}
      {tile('Spaces / area', `${T.q} · ${fmt(T.a, 0)} m²`)}
      {T.dcv.length > 0 && tile('Demand controlled ventilation', <span className="pill req">Required, H.4.8.3</span>, T.dcv.join(', '))}
    </dl>
    <div className="pb-lower">
      <div>
        <div className="oa-box" style={{ marginTop: 0 }}>
          <div className="oa-h"><span>Fresh air cooling load</span><span className={'pill ' + (p.fahu ? 'ok' : 'warn')}>{p.fahu ? 'Treated in FAHU' : 'Handled by room units'}</span></div>
          <div className="oa-v"><b>{fmt(fa / 3517, 2)}</b> TR · {fmt(fa / 1000, 2)} kW{p.fahu && T.rec ? ' net of energy recovery' : ''}</div>
          <dl className="kv">
            <dt>Fresh air</dt><dd>{fmt(T.oaq, 0)} L/s · {fmt(T.oaq * 2.119, 0)} CFM</dd>
            <dt>Sensible</dt><dd>{fmt(T.oaS / 1000, 2)} kW</dd>
            <dt style={{ color: 'var(--lat)' }}>Latent</dt><dd style={{ color: 'var(--lat)' }}>{fmt(T.oaL / 1000, 2)} kW</dd>
            {T.rec ? <><dt>Energy recovered</dt><dd>{fmt(T.rec / 1000, 2)} kW</dd></> : null}
            <dt>Design</dt><dd>{fmt(e.Tv, 1)}/{num(p.vWB)} °C → {num(p.tiDB)} °C, {num(p.tiRH)}%</dd>
            <dt>Per 100 L/s</dt><dd>{T.oaq ? fmt(T.oa / T.oaq * 100 / 1000, 2) : '–'} kW</dd>
          </dl>
        </div>
        {!p.fahu && <div className="sub" style={{ marginTop: 8 }}>Room unit selection: {fmt(T.u / 3517, 2)} TR ({fmt(T.u / 1000, 2)} kW) room plus fresh air, all spaces</div>}
        {b.prof && <HourlyChart c={b.prof} title="Building room load" />}
      </div>
      <div className="bars" style={{ marginTop: 0 }}>
        {b.items.map(([l, v, lat]) => <div key={l} className={'bar-row' + (lat ? ' lat' : '')}><span>{l}</span><span className="track"><span className={'fill' + (lat ? ' lat' : '')} style={{ width: Math.max(0, v / max * 100).toFixed(1) + '%' }} /></span><span className="v">{fmt(v / 1000, 2)} kW</span></div>)}
        <div className="bar-row tot-row"><span><b>Room total</b></span><span className="muted" style={{ fontSize: 11 }}>{fmt(T.s / 1000, 2)} sensible + {fmt(T.l / 1000, 2)} latent</span><span className="v"><b>{fmt(rm / 1000, 2)} kW</b></span></div>
        <div className="legend"><span><i style={{ background: 'var(--bar)' }} />Sensible load</span><span><i style={{ background: 'var(--lat)' }} />Latent load</span></div>
      </div>
    </div>
  </div>;
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
      {(d.p.floors?.length ?? 0) > 0 && <label className="fld" htmlFor="r-level" style={{ gridColumn: 'span 3' }}><span className="fl">Floor</span><span className="in-u"><select id="r-level" value={r.level ?? ''}
        onChange={e => { const v = e.target.value; edit(x => { if (v) x.level = v; else delete x.level; }); }}>
        {d.p.floors!.map(f => <option key={f.id} value={f.id}>{f.name || 'Untitled floor'}{Math.round(num(f.n)) > 1 ? ` (×${Math.round(num(f.n))})` : ''}</option>)}<option value="">Not on a floor</option></select></span></label>}
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
function HourlyChart({ c, title = 'Room load' }: { c: RoomLoad; title?: string }) {
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
    <div className="eyebrow">{title} by hour · {MONTHS[c.pkM]} 21 · peak {fmt(day[c.pkH! - 1], 2)} kW at {String(c.pkH).padStart(2, '0')}:00</div>
    {bars(day, 10, c.pkH! - 1, i => String(i + 1), 6)}
    <div className="eyebrow">Peak {title.toLowerCase()} by month</div>
    {bars(mon, 20, c.pkM, i => MONTHS[i][0], 1)}
  </div>;
}
