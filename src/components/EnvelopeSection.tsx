import { CODESETS, LIB, PMETA, SAFAT, type Limits, type PickKey } from '../engine/data';
import type { Computed } from '../engine/calc';
import { MONTHS, stationOf } from '../engine/climate';
import { applyCodeset, ezOf, newTypeId, resolveProject, resolveRoom } from '../engine/project';
import type { Mark, Num, Project } from '../engine/types';
import { fmt, num } from '../engine/util';
import type { Store } from '../state/store';
import { Badge, Field, NumInput, PickField, SecHead, useToast } from './ui';
import { UValueBuilder } from './UValueBuilder';
import { useState } from 'react';

export function EnvelopeSection({ store, d, marks, limits: L }: { store: Store; d: Computed; marks: Record<string, Mark>; limits: Limits }) {
  const { update } = store, p = d.p, T = d.T, toast = useToast();
  const setP = (k: keyof Project, v: unknown) => update(s => { (s.project as Record<string, unknown>)[k] = v; }, 'p.' + k);
  const pick = (k: PickKey) => <PickField key={k} id={'p-' + k} label={PMETA[k][0]} unit={PMETA[k][1]} step={PMETA[k][2]} opts={LIB[k]} showV src={p.src[k] || 'custom'} value={p[k]} mark={marks[k]}
    onSrc={v => update(s => { s.project.src[k] = v; resolveProject(s.project as Project); if (k === 'ez') { const ez = ezOf(s.project as Project); s.rooms.forEach(r => resolveRoom(r as never, ez)); } })}
    onValue={v => update(s => { s.project[k] = v; s.project.src[k] = 'custom'; if (k === 'ez') { const ez = ezOf(s.project as Project); s.rooms.forEach(r => resolveRoom(r as never, ez)); } }, 'p.' + k)} />;
  const f = (k: keyof Project, label: string, unit: string, step: number) => <Field key={k} id={'p-' + k} label={label} unit={unit} step={step} mark={marks[k]} value={p[k] as Num} onChange={v => setP(k, v)} />;
  const hbm = (k: 'aWall' | 'aRoof' | 'gRefl' | 'frP' | 'frL' | 'frE', label: string, step: number) => {
    const options: Record<typeof k, { id: string; label: string; v: number }[]> = {
      aWall: [{ id: 'ashrae-light', label: 'ASHRAE · light surface', v: 0.45 }, { id: 'ashrae-medium', label: 'ASHRAE · medium surface', v: 0.7 }, { id: 'ashrae-dark', label: 'ASHRAE · dark surface', v: 0.9 }],
      aRoof: [{ id: 'ashrae-light', label: 'ASHRAE · light surface', v: 0.45 }, { id: 'ashrae-medium', label: 'ASHRAE · medium surface', v: 0.7 }, { id: 'ashrae-dark', label: 'ASHRAE · dark surface', v: 0.9 }],
      gRefl: [{ id: 'ashrae-typical', label: 'ASHRAE · typical ground', v: 0.2 }],
      frP: [{ id: 'ashrae-office', label: 'ASHRAE · office occupants', v: 0.6 }],
      frL: [{ id: 'ashrae-typical', label: 'ASHRAE · typical lighting*', v: 0.5 }],
      frE: [{ id: 'ashrae-fan', label: 'ASHRAE · office equipment with fan', v: 0.1 }, { id: 'ashrae-no-fan', label: 'ASHRAE · office equipment without fan', v: 0.3 }],
    };
    const opts = options[k], source = p.src[k] || (k === 'aWall' || k === 'aRoof' ? 'ashrae-medium' : k === 'frP' ? 'ashrae-office' : k === 'frL' ? 'ashrae-typical' : k === 'frE' ? 'ashrae-no-fan' : 'ashrae-typical');
    return <PickField key={k} id={'p-' + k} label={label} step={step} opts={opts} src={source} value={p[k]} showV
      onSrc={v => update(s => { s.project.src[k] = v; const option = opts.find(o => o.id === v); if (option) (s.project as Record<string, unknown>)[k] = option.v; })}
      onValue={v => update(s => { (s.project as Record<string, unknown>)[k] = v; s.project.src[k] = 'custom'; }, 'p.' + k)} />;
  };
  const groups = [...new Set(CODESETS.map(c => c[4]))];
  const anySafat = (['uGlass', 'shgc', 'shgcSky'] as const).some(k => (p.src[k] || '').startsWith('safat'));
  const band = T.wwr <= 40 ? '≤40%' : T.wwr < 60 ? '40–60%' : '≥60%';

  return <section>
    <SecHead n={3} title="Building envelope" sub="Pick a code value or choose Custom. Badges show whether each value meets the standard selected for compliance." />
    <div className="codebar">
      <label className="fld" htmlFor="p-codeset"><span className="fl">Envelope code · fills all values and sets the compliance basis</span>
        <span className="in-u"><select id="p-codeset" value={p.codeset} onChange={e => { const v = e.target.value; let lbl = ''; update(s => { lbl = applyCodeset(s.project as Project, v)?.[1] || ''; }); toast('Applied: ' + lbl); }}>
          {groups.map(g => <optgroup key={g} label={g}>{CODESETS.filter(c => c[4] === g).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup>)}
        </select></span></label>
      <p>{L.uWall == null ? <>No authority limits apply; the envelope values are project inputs. Pick a reference-only code above to compare against one.</> : <>Limits used: wall {L.uWall}, roof {L.uRoof}, glazing {L.uGlass} W/m²K, SHGC {L.shgc}{L.band ? ` (${L.band}, from the project glazing ratio)` : ''}, skylight {L.uSky} W/m²K{L.shgcSky != null ? ', skylight SHGC ' + L.shgcSky : ''}. Hover a badge to see the limit.</>}</p>
    </div>
    <fieldset className="method-box"><legend>Heat balance method</legend>
      <div className="fgrid4">
          <label className="fld" htmlFor="p-ceil"><span className="fl">Ceiling seen by the room</span>
            <span className="in-u"><select id="p-ceil" value={p.ceil} onChange={e => setP('ceil', e.target.value)}>
              <option value="susp">Suspended gypsum ceiling</option><option value="none">Exposed slab</option></select></span></label>
          <label className="fld" htmlFor="p-floorFin"><span className="fl">Floor finish</span>
            <span className="in-u"><select id="p-floorFin" value={p.floorFin} onChange={e => setP('floorFin', e.target.value)}>
              <option value="tile">Tiles or stone on screed</option><option value="carpet">Carpet</option></select></span></label>
          {hbm('aWall', 'Wall outside solar absorptance', 0.05)}{hbm('aRoof', 'Roof outside solar absorptance', 0.05)}{hbm('gRefl', 'Ground reflectance', 0.05)}
          {hbm('frP', 'People, radiant fraction', 0.05)}{hbm('frL', 'Lighting, radiant fraction', 0.05)}{hbm('frE', 'Equipment, radiant fraction', 0.05)}
      </div>
      <p className="hint">Each room is calculated hour by hour on the 21st of every month (ASHRAE Fundamentals Ch. 18): sun and outdoor air heat each wall, roof and window, the heat passes in through the layers, and the room air takes it up with the internal gains. The highest hour is the peak.
        Weather: {stationOf(p.location).name} (ASHRAE), design day in {MONTHS[stationOf(p.location).db.indexOf(Math.max(...stationOf(p.location).db))]} at {fmt(d.e.To, 1)} °C, {fmt(num(p.dr), 1)} K range. *Check the lighting radiant fraction against the luminaire.</p>
    </fieldset>
    {/* external and partition U-values side by side, glazing across the full width below */}
    <div className="env-pair">
      <fieldset><legend>External walls &amp; roof · U-values</legend>
        <div className="fgrid">{pick('uWall')}{pick('uRoof')}</div>
        <TypeList store={store} kind="wallTypes" noun="external wall type" def={p.uWall} limit={L.uWall ?? undefined} limitName={L.name} />
        <UValueBuilder store={store} kinds={['wall', 'roof']} />
      </fieldset>
      <fieldset><legend>Partitions &amp; adjacent spaces · U-values</legend>
        <div className="fgrid">
          {f('uPart', 'Wall partition U-value', 'W/m²K', 0.01)}{f('uCeil', 'Ceiling partition U-value', 'W/m²K', 0.01)}{f('uFloor', 'Floor partition / exposed floor U-value', 'W/m²K', 0.01)}
          {f('tAdj', 'Unconditioned space', '°C', 0.5)}
        </div>
        <TypeList store={store} kind="partTypes" noun="partition type" def={p.uPart} />
        <UValueBuilder store={store} kinds={['partition']} />
        <p className="hint">Partition and exposed floor / ceiling U-values are project-specific. Typical starting values are filled in.</p>
      </fieldset>
    </div>
    <fieldset className="glz-box"><legend>Glazing &amp; skylights</legend><div className="fgrid glz">{(['uGlass', 'shgc', 'uSky', 'shgcSky'] as const).map(pick)}{f('shade', 'Glass shading factor', '×', 0.05)}</div>
        <p className="hint">{T.wallG ? <>
          Project glazing ratio: {fmt(T.wwr, 0)}% of external wall ({SAFAT} {band} band).{T.roof > 0 ? ` Roof glazing: ${fmt(T.skyPct, 0)}% of roof.` : ''}{p.autoBand !== false && anySafat ? ` ${SAFAT} glazing values follow this band automatically.` : ''}{' '}
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" checked={p.autoBand !== false} onChange={e => setP('autoBand', e.target.checked)} /> Auto-select band</label>
        </> : 'Enter wall and glass areas in the rooms to see the glazing ratio.'}</p>
        {p.cbasis === 'estidama' && <p className="hint">Estidama publishes no skylight SHGC; the ASHRAE 90.1 value is used.</p>}
    </fieldset>
    <div className="groups">
      <fieldset><legend>System &amp; margins</legend><div className="fgrid">
        {f('tSupply', 'Supply air temp', '°C', 0.5)}{f('diversity', 'Plant diversity', '%', 1)}{f('sfS', 'Margin, sensible', '%', 1)}{f('sfL', 'Margin, latent', '%', 1)}
        <label className="check" htmlFor="p-fahu"><input type="checkbox" id="p-fahu" checked={p.fahu} onChange={e => setP('fahu', e.target.checked)} />
          <span>Fresh air treated by a FAHU<br /><span className="muted" style={{ fontSize: 12 }}>Fresh air load is listed separately, not added to room units.</span></span></label>
      </div><p className="hint">DBC H.4.6.3 caps safety factors at 10% sensible and 5% latent. Where diversity is not known, use ASHRAE Fundamentals Ch. 18 coefficients (DBC H.4.6.3).</p></fieldset>
      <fieldset className="ez-box"><legend>Fresh air distribution</legend><div className="fgrid one">{pick('ez')}</div>
        <p className="hint">ASHRAE 62.1-2022 Table 6-4. Zone outdoor air = (Rp × people + Ra × area) / Ez.</p></fieldset>
      <fieldset><legend>Energy recovery · DBC H.4.8.2</legend><div className="fgrid">
        <label className="check" htmlFor="p-erv"><input type="checkbox" id="p-erv" checked={p.erv} onChange={e => setP('erv', e.target.checked)} />
          <span>FAHU has energy recovery<br /><span className="muted" style={{ fontSize: 12 }}>Plate or wheel. Set latent above 0 only for an enthalpy wheel.</span></span></label>
        {f('ervS', 'Sensible effectiveness', '%', 1)}{f('ervL', 'Latent effectiveness', '%', 1)}{f('ervShare', 'Exhaust air recovered', '% of OA', 1)}
      </div><p className="hint">Required above 1,000 L/s of treated outdoor air: recover at least 50% of exhaust air at 70% or higher sensible effectiveness. Applied to the FAHU load.</p></fieldset>
    </div>
  </section>;
}

/* extra named wall constructions, each with its own U-value; spaces pick one per wall or partition */
function TypeList({ store, kind, noun, def, limit, limitName }: {
  store: Store; kind: 'wallTypes' | 'partTypes'; noun: string; def: Num; limit?: number; limitName?: string;
}) {
  const types = store.state.project[kind], { update } = store;
  /* the type being rebuilt from its layers, if any */
  const [layersOf, setLayersOf] = useState<string | null>(null);
  const asm = kind === 'wallTypes' ? 'wall' : 'partition';
  const mark = (u: Num): Mark => limit == null || u === '' ? null : num(u) <= limit
    ? ['ok', `Within the ${limitName} limit of ${limit} W/m²K`, 'Complies'] : ['bad', `Above the ${limitName} limit of ${limit} W/m²K`, 'Fails'];
  const remove = (id: string) => update(s => {
    s.project[kind] = s.project[kind].filter(t => t.id !== id);
    /* walls and partitions that used it go back to the default */
    s.rooms.forEach(r => {
      if (kind === 'wallTypes') Object.values(r.walls).forEach(w => { if (w.t === id) delete w.t; });
      else r.px.forEach(x => { if (x.pt === id) delete x.pt; });
    });
  });
  return <div className="types">
    {types.length > 0 && <div className="tbl-wrap"><table className="exp ptbl">
      <colgroup><col /><col style={{ width: '34%' }} /><col style={{ width: 118 }} /></colgroup>
      <thead><tr><th>{noun[0].toUpperCase() + noun.slice(1)}</th><th>U-value (W/m²K)</th><th></th></tr></thead>
      <tbody>{types.map((t, i) => <tr key={t.id}>
        <td><input type="text" aria-label={`${noun} ${i + 1} name`} placeholder="e.g. 200 mm block" value={t.name} onChange={e => { const v = e.target.value; update(s => { s.project[kind][i].name = v; }, kind + '.n.' + t.id); }} /></td>
        <td><span className="ucell"><NumInput label={`${noun} ${i + 1} U-value`} min={0} step={0.01} value={t.u} onChange={v => update(s => { s.project[kind][i].u = v; }, kind + '.u.' + t.id)} /><Badge m={mark(t.u)} /></span></td>
        <td className="n"><span className="type-act">
          <button className="btn sm" type="button" aria-pressed={layersOf === t.id} title="Build or edit this type's U-value from material layers" onClick={() => setLayersOf(layersOf === t.id ? null : t.id)}>{t.layers?.length ? 'Layers' : 'Build'}</button>
          <button className="btn sm" type="button" aria-label={`Delete ${noun} ${i + 1}`} title="Delete" onClick={() => { if (layersOf === t.id) setLayersOf(null); remove(t.id); }}>×</button></span></td>
      </tr>)}</tbody></table></div>}
    {layersOf && types.some(t => t.id === layersOf) && <UValueBuilder key={layersOf} store={store} kinds={[asm]} target={{ kind: asm, id: layersOf }} onDone={() => setLayersOf(null)} />}
    <button className="btn sm" type="button" onClick={() => update(s => { s.project[kind].push({ id: newTypeId(), name: '', u: def }); })}>+ Add {noun}</button>
    <p className="hint">{types.length ? 'Pick the type for each wall in the Spaces step. Anything left on Default uses the value above.' : `Add a ${noun} when the building has more than one construction.`}</p>
  </div>;
}
