/* Duct sizing add-on: supply duct systems drawn as a list of sections from the unit to each room's terminal.
   Airflows come from the Spaces step (each room's supply air per unit × units served); the engine in
   ../engine/duct sizes every section, adds fitting and terminal losses, and finds the worst path for the fan. */
import { useEffect, useMemo, useState } from 'react';
import type { Computed } from '../engine/calc';
import type { AppState } from '../engine/types';
import { TYPES } from '../engine/data';
import { migrate } from '../engine/project';
import { listSaved, savedWhen, type SavedProject } from '../state/store';
import { openProjectFile, type FileHandle } from '../files';
import { projectFromFile } from '../projectFile';
import { FITTINGS, calcDuctSystem, fittingC, locationOf, newDuctSystem, sizeLabel, usesAshrae, type DuctSection as Sec, type DuctSystem, type SectionKind } from '../engine/duct/duct';
import { newId } from '../engine/project';
import type { Store } from '../state/store';
import { fmt, num } from '../engine/util';
import { NumInput, SecHead } from './ui';
import { ASHRAE_NOISE_REF, KIND_SHARE, LOCATIONS, noiseFor, table8Row, type DuctLocation } from '../engine/duct/acoustics';

const NC_STEPS = [20, 25, 30, 35, 40, 45, 50];

const KINDS: [SectionKind, string][] = [['main', 'Main'], ['branch', 'Branch'], ['runout', 'Run-out']];
const val = (v: number | '') => num(v);

/* a run-out serves a heat load room, a space entered by hand, or nothing (a pass-through section) */
const MANUAL = '__manual';
const isManual = (s: Sec) => !s.room && (s.space != null || (s.flow ?? 0) > 0);
const sid = () => 's' + newId().slice(1);
const mainFromUnit = (): Sec => ({ id: sid(), name: 'Main from unit', parent: null, kind: 'main', length: 10, fittings: [{ type: 'elbow-vanes', qty: 1 }, { type: 'fire-damper', qty: 1 }] });
const runoutFor = (parent: string, extra: Partial<Sec> & { name: string }): Sec => ({
  id: sid(), parent, kind: 'runout', length: 5, terminalPa: 25, fittings: [{ type: 'tee-branch', qty: 1 }, { type: 'damper', qty: 1 }], ...extra,
});
const roomRunout = (parent: string, r: Computed['rooms'][number]) => runoutFor(parent, { name: `To ${r.name || 'room'}`, room: r.id, units: Math.max(1, Math.round(num(r.qty)) || 1) });

/* linked to the heat load: one main from the unit and a run-out to each room, carrying the room's supply airflow */
function fromRooms(d: Computed, name: string): DuctSystem {
  const sys = newDuctSystem('d' + newId().slice(1), name), main = mainFromUnit();
  sys.airTemp = num(d.p.tSupply) || 13;
  sys.sections = [main, ...d.rooms.map(r => roomRunout(main.id, r))];
  return sys;
}
/* independent duct sizing: spaces entered by hand, each with its own airflow and room type */
function independent(name: string): DuctSystem {
  const sys = newDuctSystem('d' + newId().slice(1), name), main = mainFromUnit();
  sys.sections = [main, ...[1, 2, 3].map(i => runoutFor(main.id, { name: `To Space ${i}`, flow: 150, space: 'privoffice' }))];
  return sys;
}

/* the heat load project the duct sizing uses: the open project, or one loaded from this browser or a project file */
function ProjectSource({ d, onLoad }: { d: Computed; onLoad: (s: AppState, file: FileHandle | null) => void }) {
  const [list, setList] = useState<SavedProject[] | null>(null), [err, setErr] = useState('');
  useEffect(() => { setErr(''); }, [d.p.name]);
  const supply = d.rooms.reduce((a, r) => a + (d.res[r.id]?.sa ?? 0) * (d.res[r.id]?.qty ?? 1), 0);
  const open = (s: unknown, file: FileHandle | null = null) => { try { onLoad(migrate(s), file); setList(null); } catch { setErr('That file is not a NOVAC project'); } };
  return <div className="duct-source">
    <div>
      <div className="k">Heat load project</div>
      <b>{d.p.name || 'Unnamed project'}</b>
      <span className="muted"> · {d.rooms.length} room{d.rooms.length === 1 ? '' : 's'} · {fmt(supply, 0)} L/s supply air</span>
      <div className="muted sm">Rooms and airflows update here as the heat load changes; duct systems are saved with the project.</div>
      {err && <div className="pill bad">{err}</div>}
    </div>
    <div className="btns-row">
      <button className="btn sm" type="button" aria-expanded={!!list} onClick={() => setList(list ? null : listSaved())}>Load from this browser</button>
      <button className="btn sm" type="button" onClick={async () => { try { const f = await openProjectFile(); if (f) open(projectFromFile(f.text), f.handle); } catch { setErr('Could not open the file'); } }}>Open project file…</button>
    </div>
    {list && <div className="duct-saved">{list.length ? list.map(it => <div className="row" key={it.id}>
      <span><b>{it.name}</b><span className="muted"> · saved {savedWhen(it.savedAt)} · {it.data.rooms.length} room{it.data.rooms.length === 1 ? '' : 's'}{it.data.project.ducts?.length ? ` · ${it.data.project.ducts.length} duct system${it.data.project.ducts.length === 1 ? '' : 's'}` : ''}</span></span>
      <button className="btn sm" type="button" onClick={() => open(it.data)}>Load</button>
    </div>) : <p className="hint">No projects saved in this browser yet. Use Projects → Save in browser in the heat load calculator.</p>}</div>}
  </div>;
}

export function DuctSection({ d, store, onLoad }: { d: Computed; store: Store; onLoad: (s: AppState, file: FileHandle | null) => void }) {
  const systems = d.p.ducts ?? [];
  const [sel, setSel] = useState<string>();
  const sys = systems.find(s => s.id === sel) ?? systems[0];
  const edit = (fn: (s: DuctSystem) => void, group?: string) => store.update(st => { const s = st.project.ducts?.find(x => x.id === sys?.id); if (s) fn(s as DuctSystem); }, group);
  const editSec = (id: string, fn: (s: Sec) => void, group?: string) => edit(s => { const x = s.sections.find(y => y.id === id); if (x) fn(x); }, group);
  const addSystem = (s: DuctSystem) => { store.update(st => { (st.project.ducts ??= []).push(s); }); setSel(s.id); };

  /* supply air per unit for each room, L/s */
  const roomFlow = (id: string) => { const c = d.res[id]; return c ? c.sa : undefined; };
  /* each room's acoustic criterion: the override for this system, else its room type's ASHRAE Table 1 value */
  const roomNC = (id: string) => { const rm = d.rooms.find(x => x.id === id); return rm ? sys?.nc?.[id] ?? noiseFor(rm.type).nc : undefined; };
  const r = useMemo(() => sys ? calcDuctSystem(sys, num(d.p.elev), roomFlow, roomNC) : null, [sys, d]);

  if (!sys) return <section>
    <SecHead title="Duct sizing" sub="Supply ducts sized by the ASHRAE Fundamentals Ch. 21 method (DBC H.4.12.2), checked against ASHRAE acoustic limits" />
    <ProjectSource d={d} onLoad={onLoad} />
    <div className="duct-start">
      <article>
        <h3>From the heat load</h3>
        <p>One main from the unit and a run-out to each of the project's {d.rooms.length} room{d.rooms.length === 1 ? '' : 's'}, carrying its supply airflow. Airflows follow the heat load as it changes.</p>
        <button className="btn primary" type="button" disabled={!d.rooms.length} onClick={() => addSystem(fromRooms(d, 'Supply system 1'))}>Create from the rooms</button>
      </article>
      <article>
        <h3>Independent duct sizing</h3>
        <p>No heat load needed: enter each space's airflow and room type yourself. The same sizing, fan pressure and ASHRAE checks apply.</p>
        <button className="btn" type="button" onClick={() => addSystem(independent('Duct system 1'))}>Start independent sizing</button>
      </article>
      <article>
        <h3>Empty system</h3>
        <p>Start with no sections and build the layout from scratch.</p>
        <button className="btn" type="button" onClick={() => addSystem(newDuctSystem('d' + newId().slice(1), 'Duct system 1'))}>Start an empty system</button>
      </article>
    </div>
  </section>;

  const res = new Map(r!.rows.map(x => [x.id, x])), crit = new Set(r!.criticalPath);
  /* sections in tree order, then any not reached from a unit (loops) */
  const ordered = [...r!.rows.map(x => sys.sections.find(s => s.id === x.id)!), ...sys.sections.filter(s => !res.has(s.id))];
  const name = (id: string | null) => sys.sections.find(s => s.id === id)?.name || '–';
  const descendants = (id: string): Set<string> => { const out = new Set<string>([id]); let grew = true; while (grew) { grew = false; sys.sections.forEach(s => { if (s.parent && out.has(s.parent) && !out.has(s.id)) { out.add(s.id); grew = true; } }); } return out; };
  const addSection = (parent: string | null) => edit(s => { s.sections.push({ id: 's' + newId().slice(1), name: parent ? 'New run-out' : 'New main', parent, kind: parent ? 'runout' : 'main', length: 5, fittings: [] }); });
  const delSection = (id: string) => edit(s => { const gone = descendants(id); s.sections = s.sections.filter(x => !gone.has(x.id)); });
  const setLimit = (k: SectionKind, v: number) => edit(s => { s.vMax[k] = v; }, 'vmax.' + k);
  /* heat load rooms this system does not serve yet, added as run-outs from its first main */
  const unlinked = d.rooms.filter(rm => !sys.sections.some(s => s.room === rm.id));
  const addUnlinked = () => edit(s => {
    let root = s.sections.find(x => !x.parent);
    if (!root) { root = mainFromUnit(); s.sections.push(root); }
    const parent = root.id;
    unlinked.forEach(rm => s.sections.push(roomRunout(parent, rm)));
  });

  return <section>
    <SecHead title="Duct sizing" sub="Supply ducts sized by the ASHRAE Fundamentals Ch. 21 method (DBC H.4.12.2), checked against ASHRAE acoustic limits" />
    <ProjectSource d={d} onLoad={onLoad} />
    <div className="duct-systems" role="tablist" aria-label="Duct systems">
      {systems.map(s => <button key={s.id} type="button" role="tab" aria-selected={s.id === sys.id} onClick={() => setSel(s.id)}>{s.name || 'Untitled system'}</button>)}
      {d.rooms.length > 0 && <button type="button" className="add" onClick={() => addSystem(fromRooms(d, `Supply system ${systems.length + 1}`))}>+ New system from rooms</button>}
      <button type="button" className="add" onClick={() => addSystem(independent(`Duct system ${systems.length + 1}`))}>+ New independent system</button>
    </div>

    <div className="duct-kpis">
      <div className="tot key"><div className="k">Fan external static pressure</div><div className="v">{fmt(r!.esp, 0)}<small>Pa</small></div><div className="s">worst path {fmt(r!.criticalPa, 0)} Pa{sys.allowancePa ? ` + ${fmt(sys.allowancePa, 0)} Pa allowance` : ''}</div></div>
      <div className="tot"><div className="k">Supply airflow</div><div className="v">{fmt(r!.totalFlow, 0)}<small>L/s</small></div><div className="s">{fmt(r!.totalFlow * 2.119, 0)} CFM</div></div>
      <div className="tot"><div className="k">Worst path</div><div className="v sm">{r!.criticalPath.map(name).join(' → ') || '–'}</div><div className="s">air density {fmt(r!.rho, 3)} kg/m³</div></div>
      <div className="tot"><div className="k">ASHRAE space compliance</div>
        <div className="v">{r!.spaces.filter(s => s.complies).length}<small>of {r!.spaces.length} spaces</small></div>
        <div className="s">{r!.spaces.every(s => s.complies) ? <span className="pill ok">All within Table 8 velocities</span> : <span className="pill bad">{r!.spaces.filter(s => !s.complies).length} exceed</span>}</div></div>
    </div>
    {r!.errors.length > 0 && <div className="duct-errors" role="alert">{r!.errors.map(e => <p key={e}>{e}</p>)}</div>}

    <fieldset className="duct-settings"><legend>Design settings</legend>
      <label>System name<input type="text" value={sys.name} onChange={e => edit(s => { s.name = e.target.value; }, 'name')} /></label>
      <label>Duct shape<select value={sys.shape} onChange={e => edit(s => { s.shape = e.target.value as DuctSystem['shape']; })}><option value="rect">Rectangular</option><option value="round">Round</option></select></label>
      <label>Sizing method<select value={sys.method} onChange={e => edit(s => { s.method = e.target.value as DuctSystem['method']; })}><option value="friction">Equal friction</option><option value="velocity">Maximum velocity</option></select></label>
      <label>Friction target, Pa/m<NumInput value={sys.frictionTarget} step={0.1} min={0.1} onChange={v => edit(s => { s.frictionTarget = val(v) || 0.8; }, 'ft')} /></label>
      <label>Friction warning above, Pa/m<NumInput value={sys.frictionMax} step={0.1} min={0.1} onChange={v => edit(s => { s.frictionMax = val(v) || 1.5; }, 'fm')} /></label>
      <label>Velocity limits<select value={usesAshrae(sys) ? 'ashrae' : 'custom'} onChange={e => edit(s => { s.limits = e.target.value as DuctSystem['limits']; })}>
        <option value="ashrae">ASHRAE acoustic limits by space</option><option value="custom">Custom limits</option></select></label>
      <label>Main duct location<select value={locationOf(sys)} onChange={e => edit(s => { s.location = e.target.value as DuctLocation; })}>
        {LOCATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {KINDS.map(([k, l]) => <label key={k}>{l} velocity limit, m/s{usesAshrae(sys) ? ' (rooms not linked)' : ''}<NumInput value={sys.vMax[k]} step={0.5} min={1} onChange={v => setLimit(k, val(v) || 5)} /></label>)}
      {sys.shape === 'rect' && <>
        <label>Maximum aspect ratio<NumInput value={sys.maxAspect} step={0.5} min={1} onChange={v => edit(s => { s.maxAspect = Math.max(1, val(v) || 4); }, 'ar')} /></label>
        <label>Fixed duct depth, mm (blank: any)<NumInput value={sys.fixedDepth ?? ''} step={50} min={100} onChange={v => edit(s => { const x = val(v); if (x >= 100) s.fixedDepth = Math.round(x / 50) * 50; else delete s.fixedDepth; }, 'depth')} /></label>
      </>}
      <label>Roughness, mm<NumInput value={sys.roughness} step={0.01} min={0} onChange={v => edit(s => { s.roughness = Math.max(0, val(v)); }, 'rough')} /></label>
      <label>Supply air temperature, °C<NumInput value={sys.airTemp} step={0.5} onChange={v => edit(s => { s.airTemp = val(v); }, 'temp')} /></label>
      <label>Extra allowance, Pa<NumInput value={sys.allowancePa} step={5} min={0} onChange={v => edit(s => { s.allowancePa = Math.max(0, val(v)); }, 'allow')} /></label>
      <p className="hint">{usesAshrae(sys)
        ? `ASHRAE limits: each section is sized within the ${ASHRAE_NOISE_REF} Table 8 velocity for the strictest room it serves (Table 1 NC/RC by room type), duct location and shape; branches use 80% and final runouts 50% of the listed value. The custom limits apply only to sections that serve no room.`
        : 'Custom limits replace the ASHRAE acoustic limits for sizing; the space compliance table still checks every room against ASHRAE.'} Galvanised steel is about 0.09 mm rough. The allowance covers items outside the duct network that the fan must overcome, such as external filters or sand-trap louvers.</p>
      <div className="btns-row"><button type="button" className="btn danger sm" onClick={() => { store.update(st => { st.project.ducts = (st.project.ducts ?? []).filter(x => x.id !== sys.id); }); setSel(undefined); }}>Delete this system</button></div>
    </fieldset>

    <h3 className="duct-h">Duct layout</h3>
    <div className="tbl-wrap"><table className="duct-tbl">
      <thead><tr><th>Section</th><th>Type</th><th>From</th><th>Serves</th><th>Length m</th><th>Fittings (quantity × C)</th><th>Terminal Pa</th><th /></tr></thead>
      <tbody>{ordered.map(s => {
        const x = res.get(s.id), own = descendants(s.id);
        return <tr key={s.id} className={crit.has(s.id) ? 'crit' : undefined}>
          <td style={{ paddingLeft: 8 + (x?.depth ?? 0) * 14 }}><input type="text" aria-label="Section name" value={s.name} onChange={e => editSec(s.id, y => { y.name = e.target.value; }, 'n.' + s.id)} /></td>
          <td><select aria-label="Section type" value={s.kind} onChange={e => editSec(s.id, y => { y.kind = e.target.value as SectionKind; })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
          <td><select aria-label="Connected from" value={s.parent ?? ''} onChange={e => editSec(s.id, y => { y.parent = e.target.value || null; })}>
            <option value="">Unit</option>{sys.sections.filter(o => !own.has(o.id)).map(o => <option key={o.id} value={o.id}>{o.name || 'Untitled'}</option>)}</select></td>
          <td className="duct-serves">
            <select aria-label="Room served" value={s.room ?? (isManual(s) ? MANUAL : '')} onChange={e => editSec(s.id, y => {
              const v = e.target.value;
              if (v === MANUAL) { delete y.room; y.space ??= 'office'; y.flow ??= 100; }
              else if (v) { y.room = v; y.units ??= 1; delete y.flow; delete y.space; }
              else { delete y.room; delete y.flow; delete y.space; }
            })}>
              <option value="">No room (pass-through)</option><option value={MANUAL}>Space entered by hand</option>
              {d.rooms.length > 0 && <optgroup label="Heat load rooms">{d.rooms.map(rm => <option key={rm.id} value={rm.id}>{rm.name || 'Untitled'}</option>)}</optgroup>}</select>
            {s.room ? <span className="duct-mini">× <NumInput value={s.units ?? 1} step={1} min={1} label="Units served" onChange={v => editSec(s.id, y => { y.units = Math.max(1, Math.round(val(v)) || 1); }, 'u.' + s.id)} /></span>
              : isManual(s) ? <>
                <span className="duct-mini"><NumInput value={s.flow ?? ''} step={10} min={0} label="Airflow, L/s" title="Supply airflow to this space, L/s" onChange={v => editSec(s.id, y => { const f = val(v); if (f > 0) y.flow = f; else delete y.flow; }, 'f.' + s.id)} /> L/s</span>
                <select aria-label="Space type" title="Room type, for the ASHRAE noise criterion" value={s.space ?? 'office'} onChange={e => editSec(s.id, y => { y.space = e.target.value; })}>
                  {Object.entries(TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}</select>
              </> : null}
          </td>
          <td><NumInput value={s.length} step={0.5} min={0} label="Length, m" onChange={v => editSec(s.id, y => { y.length = Math.max(0, val(v)); }, 'l.' + s.id)} /></td>
          <td className="duct-fits">
            {s.fittings.map((f, i) => <div key={i} className="duct-fit">
              <span className="nm" title={FITTINGS.find(t => t.id === f.type)?.label}>{FITTINGS.find(t => t.id === f.type)?.label ?? f.type}</span>
              <NumInput value={f.qty} step={1} min={0} label="Quantity" onChange={v => editSec(s.id, y => { y.fittings[i].qty = Math.max(0, Math.round(val(v))); }, `fq.${s.id}.${i}`)} />
              <span className="x">×</span>
              <NumInput value={fittingC(f)} step={0.05} min={0} label="Loss coefficient C" title="Loss coefficient C on the section velocity pressure; replace with the manufacturer's value" onChange={v => editSec(s.id, y => { y.fittings[i].c = Math.max(0, val(v)); }, `fc.${s.id}.${i}`)} />
              <button type="button" className="btn sm" aria-label="Remove fitting" onClick={() => editSec(s.id, y => { y.fittings.splice(i, 1); })}>×</button>
            </div>)}
            <select aria-label="Add a fitting" value="" onChange={e => { const t = e.target.value; if (t) editSec(s.id, y => { y.fittings.push({ type: t, qty: 1 }); }); }}>
              <option value="">+ Add fitting</option>{FITTINGS.map(t => <option key={t.id} value={t.id}>{t.label} (C {t.c})</option>)}</select>
          </td>
          <td><NumInput value={s.terminalPa ?? ''} step={5} min={0} label="Terminal pressure drop, Pa" title="Diffuser or grille pressure drop from the manufacturer's data" onChange={v => editSec(s.id, y => { const p = val(v); if (p > 0) y.terminalPa = p; else delete y.terminalPa; }, 't.' + s.id)} /></td>
          <td className="duct-act">
            <button type="button" className="btn sm" onClick={() => addSection(s.id)} title="Add a section fed from this one">+ Branch</button>
            <button type="button" className="btn sm danger" onClick={() => delSection(s.id)} title="Delete this section and everything fed from it">Delete</button>
          </td>
        </tr>;
      })}</tbody>
    </table></div>
    <div className="btns-row"><button type="button" className="btn sm" onClick={() => addSection(null)}>+ Section from the unit</button>
      {unlinked.length > 0 && <button type="button" className="btn sm" onClick={addUnlinked} title={unlinked.map(x => x.name).join(", ")}>+ Add run-outs for {unlinked.length} new room{unlinked.length === 1 ? "" : "s"}</button>}</div>

    <h3 className="duct-h">Duct schedule</h3>
    <div className="tbl-wrap"><table className="duct-tbl duct-res">
      <thead><tr><th>Section</th><th className="n">Airflow L/s</th><th className="n">Size mm</th><th className="n">Velocity m/s</th><th className="n">Limit m/s</th><th className="n">NC/RC</th><th className="n">Friction Pa/m</th><th className="n">Friction Pa</th><th className="n">Fittings Pa</th><th className="n">Terminal Pa</th><th className="n">Section Pa</th><th className="n">Total from unit Pa</th><th>Notes</th></tr></thead>
      <tbody>{r!.rows.map(x => { const s = sys.sections.find(y => y.id === x.id)!; return <tr key={x.id} className={crit.has(x.id) ? 'crit' : undefined}>
        <td style={{ paddingLeft: 8 + x.depth * 14 }}>{s.name || 'Untitled'}</td>
        <td className="n">{fmt(x.flow, 0)}</td><td className="n"><b>{sizeLabel(x.size)}</b>{x.size.shape === 'rect' ? <small className="muted"> (Ø{fmt(x.size.de, 0)})</small> : null}</td>
        <td className="n">{fmt(x.velocity, 2)}</td><td className="n">{fmt(x.vLimit, 2)}</td><td className="n">{x.nc ?? '–'}</td><td className="n">{fmt(x.frictionPaM, 2)}</td><td className="n">{fmt(x.frictionPa, 1)}</td><td className="n">{fmt(x.fittingsPa, 1)}</td>
        <td className="n">{fmt(x.terminalPa, 0)}</td><td className="n">{fmt(x.sectionPa, 1)}</td><td className="n"><b>{fmt(x.pathPa, 1)}</b></td>
        <td>{x.warnings.length ? x.warnings.map(w => <span key={w} className="pill bad">{w}</span>) : crit.has(x.id) ? <span className="pill warn">Worst path</span> : null}</td>
      </tr>; })}</tbody>
    </table></div>
    <p className="hint">Sizes are the smallest standard size within the friction target{sys.method === 'velocity' ? ' (maximum velocity method: velocity limit only)' : ''} and the velocity limit for the section type. Fitting losses are C × velocity pressure at the section velocity; the coefficients are typical values, so replace them with the manufacturer's or ASHRAE Duct Fitting Database values for the fittings you specify. Rectangular sizes show their equivalent round diameter (Huebscher).</p>

    <h3 className="duct-h">ASHRAE space compliance</h3>
    <p className="hint" style={{ marginTop: 0 }}>Each room's background-noise criterion (NC/RC) from {ASHRAE_NOISE_REF} Table 1 for its room type, and the Table 8 maximum duct velocity for that criterion, the duct location ({LOCATIONS.find(l => l[0] === locationOf(sys))?.[1].toLowerCase()}) and {sys.shape === 'round' ? 'round' : 'rectangular'} ducts. Every section on the room's path from the unit is checked; the one closest to its limit is shown.</p>
    {r!.spaces.length ? <div className="tbl-wrap"><table className="duct-tbl duct-res duct-comp">
      <thead><tr><th>Space</th><th>ASHRAE room type (Table 1)</th><th className="n">NC/RC</th><th className="n">Table 8 row</th><th>Governing section</th><th className="n">Velocity m/s</th><th className="n">ASHRAE limit m/s</th><th>Result</th></tr></thead>
      <tbody>{r!.spaces.map(c => {
        /* a heat load room, or a space entered by hand (named, typed and overridden by its section) */
        const t = sys.sections.find(s => s.id === c.section)!, rm = c.room ? d.rooms.find(x => x.id === c.room) : undefined;
        const key = c.room ?? c.section, cat = noiseFor(rm?.type ?? t.space ?? 'office'), own = sys.nc?.[key];
        const label = rm ? rm.name || 'Untitled' : (t.name || 'Untitled').replace(/^To /, '');
        const ws = sys.sections.find(s => s.id === c.worst.section);
        return <tr key={c.section}>
          <td><b>{label}</b>{!rm && <small className="muted"> (entered by hand)</small>}</td>
          <td>{cat.group}: {cat.space}{cat.nearest ? <small className="muted"> (not listed in Table 1, nearest category)</small> : null}</td>
          <td className="n"><select aria-label={`Noise criterion for ${label}`} value={own ?? ''} onChange={e => edit(s => { const v = e.target.value; s.nc ??= {}; if (v) s.nc[key] = +v; else delete s.nc[key]; })}>
            <option value="">{cat.nc} (Table 1)</option>{NC_STEPS.filter(n => n !== cat.nc).map(n => <option key={n} value={n}>{n} (project)</option>)}</select></td>
          <td className="n">RC {table8Row(c.nc)}</td>
          <td>{ws?.name || 'Untitled'} <small className="muted">({KINDS.find(k => k[0] === c.worst.kind)?.[1].toLowerCase()}, {Math.round(KIND_SHARE[c.worst.kind] * 100)}% of Table 8)</small></td>
          <td className="n">{fmt(c.worst.velocity, 2)}</td><td className="n">{fmt(c.worst.limit, 2)}</td>
          <td>{c.complies ? <span className="pill ok">Complies</span> : <span className="pill bad">Exceeds ASHRAE limit</span>}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="hint">Link run-outs to rooms in the duct layout to check each space.</p>}
    <p className="hint">Table 1 values are design targets for unoccupied, furnished rooms; ASHRAE notes projects may vary from them by about ±5 dB. Table 8 lists RC(N) 45, 35 and 25, so a criterion between rows uses the next stricter row. Velocity alone does not guarantee the criterion: elbows and other fittings add noise, and diffusers, grilles and the fan need their own acoustic selection.</p>
  </section>;
}
