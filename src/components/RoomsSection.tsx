import { useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import { ABOVE, ACT, ADJ, ADJ_EDIT, BELOW, ORIENTS, PXDEF, TYPES, typeOf } from '../engine/data';
import { adjTemp, dcvNeeded, type Computed } from '../engine/calc';
import { roomChecks } from '../engine/checks';
import { ROOMOPTS, RMETA, SHOWV, changeType, ezOf, newId, newRoom, pxU, resolveRoom, type RoomPick } from '../engine/project';
import type { Adjacent, AppState, Mark, Num, Orient, Room } from '../engine/types';
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
  const add = () => update(s => { const n = newRoom('Room ' + (s.rooms.length + 1), 'office', ezOf(s.project as AppState['project'])); s.rooms.push(n); s.sel = n.id; });

  return <section>
    <SecHead n={5} title="Spaces" sub="Each load item has a source list. Changing a value by hand switches it to Custom." />
    <div className="workspace">
      <nav className="rlist" aria-label="Rooms">
        {state.rooms.map(x => {
          const c = d.res[x.id], ch = roomChecks(x, c, ez), fails = Object.values(ch).filter(v => v && v[0] === 'bad').length;
          return <button key={x.id} type="button" className="ritem" aria-current={x.id === state.sel} onClick={() => update(s => { s.sel = x.id; })}>
            <span className="nm">{x.name || 'Untitled'}{c.qty > 1 ? ` ×${c.qty}` : ''}</span><span className="tr">{fmt(c.unit / 3517, 2)} TR</span>
            <span className="ty">{typeOf(x.type).label} · {fmt(num(x.area), 0)} m²{fails ? <> · <b className="x">✗ {fails} fail{fails > 1 ? 's' : ''}</b></> : null}</span>
          </button>;
        })}
        <button type="button" className="add" onClick={add}>+ Add room</button>
      </nav>
      <div className="editor">
        {r ? <RoomEditor key={r.id} r={r} d={d} edit={edit}
          onDup={() => update(s => { const i = s.rooms.findIndex(y => y.id === s.sel); const c = JSON.parse(JSON.stringify(s.rooms[i])); c.id = newId(); c.name = s.rooms[i].name + ' (copy)'; s.rooms.splice(i + 1, 0, c); s.sel = c.id; })}
          onDel={() => { update(s => { const i = s.rooms.findIndex(y => y.id === s.sel); s.rooms.splice(i, 1); s.sel = (s.rooms[Math.max(0, i - 1)] || {}).id; }); toast('Room deleted'); }} />
          : <div className="empty">No rooms yet.<br /><br /><button className="btn primary" type="button" onClick={add}>Add the first room</button></div>}
      </div>
      <aside className="result" aria-live="polite">{r ? <RoomResult r={r} d={d} /> : <><div className="eyebrow">Selected room</div><p className="muted">Add a room to see its load.</p></>}</aside>
    </div>
  </section>;
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
      <Field id="r-area" label="Floor area" unit="m²" step={0.5} value={r.area} onChange={set('area')} />
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
      </div>
    </div>
    <div className="ed-sec"><h4>Air</h4><div className="fgrid">{pick('oa')}{pick('ach')}</div></div>
    <div className="ed-sec"><h4>External walls and glazing</h4>
      <div className="tbl-wrap"><table className="exp"><thead><tr><th>Facing</th><th>Wall, gross (m²)</th><th>Glass (m²)</th><th></th></tr></thead>
        <tbody>{ORIENTS.map(o => <WallRow key={o} o={o} r={r} edit={edit} />)}</tbody></table></div>
      <p className="hint">Type a number or a sum such as 6*3.2 + 2.5*3.2, or use L × H to work out wall and window areas.</p>
    </div>
    <div className="ed-sec"><h4>Roof, ceiling and floor</h4>
      <div className="tbl-wrap"><table className="exp ptbl">
        <colgroup><col style={{ width: '27%' }} /><col style={{ width: '11%' }} /><col style={{ width: '29%' }} /><col style={{ width: '13%' }} /><col style={{ width: '20%' }} /></colgroup>
        <thead><tr><th>Element</th><th>Area (m²)</th><th>Adjacent space (tb)</th><th>tb / CLTD</th><th>U-value (W/m²K)</th></tr></thead>
        <tbody>
          <SurfaceRow r={r} d={d} w="a" edit={edit} />
          {r.above === 'roof' && <tr><td className="sub">Skylight in roof</td><td><NumInput label="Skylight area" min={0} step={0.5} value={r.sky} onChange={set('sky')} /></td><td className="muted" colSpan={3}>Solar and conduction, skylight SHGC and U from section 3</td></tr>}
          <SurfaceRow r={r} d={d} w="b" edit={edit} />
        </tbody></table></div>
      <h4 style={{ marginTop: 16 }}>Wall partitions</h4>
      <div className="tbl-wrap"><table className="exp ptbl">
        <colgroup><col style={{ width: '27%' }} /><col style={{ width: '11%' }} /><col style={{ width: '29%' }} /><col style={{ width: '13%' }} /><col style={{ width: '14%' }} /><col style={{ width: '6%' }} /></colgroup>
        <thead><tr><th>Partition</th><th>Area (m²)</th><th>Adjacent space (tb)</th><th>tb (°C)</th><th>U-value (W/m²K)</th><th></th></tr></thead>
        <tbody>
          {r.px.length ? r.px.map((x, i) => <AdjRow key={i} label={`Wall partition ${i + 1}`} x={x} U={num(pxU(d.p, 'wall'))} d={d}
            change={fn => edit(y => fn(y.px[i]), 'px.' + i)}
            extra={<td className="n"><button className="btn sm" type="button" aria-label={`Delete partition ${i + 1}`} title="Delete" onClick={() => edit(y => { y.px.splice(i, 1); })}>×</button></td>} />)
            : <tr className="dis"><td colSpan={6}>No wall partitions.</td></tr>}
          <tr className="addrow"><td colSpan={6}><button className="btn sm" type="button" onClick={() => edit(y => { y.px.push({ type: 'wall', a: '', adj: PXDEF.wall, t: '', u: '' }); })}>+ Add wall partition</button></td></tr>
        </tbody></table></div>
      <p className="hint">ASHRAE CLTD/CLF method: roof q = U × A × CLTD (corrected); ceilings, floors and partitions q = U × A × (tb − ti); tb for an unconditioned space, when unknown, = outdoor − 2.8 K; conditioned space at the same temperature and slab on grade: no cooling gain.</p>
    </div>
    <div className="ed-actions">
      <button className="btn" type="button" onClick={onDup}>Duplicate room</button>
      <ArmButton className="btn danger" label="Delete room" armedLabel="Click again to delete" onConfirm={onDel} />
    </div>
  </>;
}

/* one orientation, with an optional length × height calculator */
function WallRow({ o, r, edit }: { o: Orient; r: Room; edit: (fn: RoomFn, group?: string) => void }) {
  const [open, setOpen] = useState(false), toast = useToast();
  const [f, setF] = useState({ L: '', H: String(num(r.height) || 3), ww: '', wh: '', wn: '1', dd: '0' });
  const g = (k: keyof typeof f) => { const v = evalArea(f[k]); return typeof v === 'number' ? v : 0; };
  const wall = Math.round(g('L') * g('H') * 100) / 100, glass = Math.round(g('ww') * g('wh') * g('wn') * 100) / 100, dd = g('dd');
  const inp = (k: keyof typeof f, lab: string, ph: string) => <label className="wcf"><span>{lab}</span><input type="text" inputMode="decimal" placeholder={ph} value={f[k]} aria-label={`${o} ${lab}`} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>;
  return <>
    <tr><td>{o}</td>
      <td><ExprInput label={`${o} wall gross area`} value={r.walls[o].w} onChange={v => edit(x => { x.walls[o].w = v; }, 'w.' + o)} /></td>
      <td><ExprInput label={`${o} glass area`} value={r.walls[o].g} onChange={v => edit(x => { x.walls[o].g = v; }, 'g.' + o)} /></td>
      <td className="wcb"><button className="btn sm" type="button" aria-expanded={open} title="Area calculator" onClick={() => setOpen(!open)}>L × H</button></td></tr>
    {open && <tr className="wcalc"><td colSpan={4}>
      <div className="wcgrid">{inp('L', 'Wall length', 'm')}{inp('H', 'Wall height', 'm')}{inp('ww', 'Window width', 'm')}{inp('wh', 'Window height', 'm')}{inp('wn', 'No. of windows', 'qty')}{inp('dd', 'Doors / other openings', 'm²')}</div>
      <div className="wcres"><span>{wall > 0 ? `Wall ${fmt(wall, 2)} m² gross · glass ${fmt(glass, 2)} m² · opaque ${fmt(Math.max(0, wall - glass - dd), 2)} m²${glass + dd > wall ? ' · openings exceed the wall' : ''}` : 'Enter wall length and height.'}</span>
        <button className="btn sm primary" type="button" onClick={() => {
          if (!(wall > 0)) { toast('Enter wall length and height'); return; }
          edit(x => { x.walls[o] = { w: wall, g: glass || '' }; }); setOpen(false); toast(`${o}: wall ${fmt(wall, 2)} m², glass ${fmt(glass, 2)} m²`);
        }}>Apply to {o}</button></div>
    </td></tr>}
  </>;
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
function AdjRow({ label, x, U, d, change, outdoor, extra }: {
  label: ReactNode; x: Adjacent; U: number; d: Computed; change: (fn: (x: Draft<Adjacent>) => void) => void; outdoor?: boolean; extra?: ReactNode;
}) {
  const p = d.p, id = x.adj || 'project', T = outdoor ? d.e.To : adjTemp(p, d.e, id, x.t), cust = !blank(x.u), editable = !outdoor && ADJ_EDIT(id);
  return <tr><td>{label}</td>
    <td><ExprInput label="Area" title="Number or sum, e.g. 4*3.2" value={x.a} onChange={v => change(y => { y.a = v; })} /></td>
    <td>{outdoor ? <span className="muted">Outdoor air</span> : <select aria-label="Adjacent space" value={id} onChange={e => {
      const v = e.target.value;
      change(y => { y.adj = v; if (v === 'custom' && blank(y.t)) y.t = adjTemp(p, d.e, 'project'); if (v === 'cond2' && blank(y.t)) y.t = num(p.tiDB) + 2; });
    }}>{adjOptions()}</select>}</td>
    <td><NumInput label="Adjacent temperature" step={0.5} value={Math.round(T * 10) / 10} readOnly={!editable}
      title={editable ? 'Edit the adjacent space temperature' : 'Set by the space type; choose Custom or a different set-point to edit'}
      onChange={editable ? v => change(y => { y.t = v; }) : undefined} /></td>
    <td><span className={'ucell' + (cust ? ' cust' : '')}><NumInput label="U-value" min={0} step={0.01} value={cust ? x.u : U} onChange={v => change(y => { y.u = v; })} />
      {cust && <button className="btn sm" type="button" title="Back to section 3 value" onClick={() => change(y => { y.u = ''; })}>↺</button>}</span>
      <span className="usrc">{cust ? 'Custom' : 'Section 3'}</span></td>
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
    <td><NumInput label="Roof area" min={0} step={0.5} value={r.roof} onChange={v => edit(x => { x.roof = v; }, 'r.roof')} /></td>
    <td className="muted">Outdoor, sun on roof</td><td className="n">{fmt(num(p.cltd.R) + d.e.corr, 1)} K</td><td className="n">{num(p.uRoof)} <span className="usrc">Section 3 roof</span></td></tr>;
  if (sel === 'cond') return <tr><td>{pickEl}</td><td className="muted">–</td><td className="muted">Conditioned at room temperature</td><td className="n">{num(p.tiDB)} °C</td><td className="muted">No transfer</td></tr>;
  if (sel === 'ground') return <tr><td>{pickEl}</td><td className="muted">–</td><td className="muted">Ground</td><td className="muted">–</td><td className="muted">Neglected for cooling</td></tr>;
  const k = w === 'a' ? 'ce' : 'fl';
  return <AdjRow label={pickEl} x={r[k]} U={num(pxU(p, w === 'a' ? 'ceiling' : 'floor'))} d={d} outdoor={sel === 'outdoor'} change={fn => edit(x => fn(x[k]), k)} />;
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
  </>;
}
