import { CODESETS, LIB, ORIENTS, PMETA, SAFAT, type Limits, type PickKey } from '../engine/data';
import type { Computed } from '../engine/calc';
import { MONTHS, STATION_SRC, stationOf } from '../engine/climate';
import { applyCodeset, ezOf, newTypeId, resolveProject, resolveRoom } from '../engine/project';
import type { Mark, Num, Orient, Project } from '../engine/types';
import { fmt, num } from '../engine/util';
import type { Store } from '../state/store';
import { Badge, Field, NumInput, PickField, SecHead, useToast } from './ui';
import { AssemblyReferenceLibrary } from './AssemblyReferenceLibrary';
import { UValueBuilder } from './UValueBuilder';

export function EnvelopeSection({ store, d, marks, limits: L }: { store: Store; d: Computed; marks: Record<string, Mark>; limits: Limits }) {
  const { update } = store, p = d.p, T = d.T, toast = useToast();
  const setP = (k: keyof Project, v: unknown) => update(s => { (s.project as Record<string, unknown>)[k] = v; }, 'p.' + k);
  const pick = (k: PickKey) => <PickField key={k} id={'p-' + k} label={PMETA[k][0]} unit={PMETA[k][1]} step={PMETA[k][2]} opts={LIB[k]} showV src={p.src[k] || 'custom'} value={p[k]} mark={marks[k]}
    onSrc={v => update(s => { s.project.src[k] = v; resolveProject(s.project as Project); if (k === 'ez') { const ez = ezOf(s.project as Project); s.rooms.forEach(r => resolveRoom(r as never, ez)); } })}
    onValue={v => update(s => { s.project[k] = v; s.project.src[k] = 'custom'; if (k === 'ez') { const ez = ezOf(s.project as Project); s.rooms.forEach(r => resolveRoom(r as never, ez)); } }, 'p.' + k)} />;
  const f = (k: keyof Project, label: string, unit: string, step: number) => <Field key={k} id={'p-' + k} label={label} unit={unit} step={step} mark={marks[k]} value={p[k] as Num} onChange={v => setP(k, v)} />;
  const groups = [...new Set(CODESETS.map(c => c[4]))];
  const anySafat = (['uGlass', 'shgc', 'shgcSky'] as const).some(k => (p.src[k] || '').startsWith('safat'));
  const band = T.wwr <= 40 ? '≤40%' : T.wwr < 60 ? '40–60%' : '≥60%';
  const setCltd = (k: Orient | 'R' | 'G', v: Num) => update(s => { s.project.cltd[k] = num(v); }, 'cltd.' + k);
  const setSolar = (k: Orient | 'H', v: Num) => update(s => { s.project.solar[k] = num(v); }, 'solar.' + k);

  return <section>
    <SecHead n={4} title="Building envelope" sub="Pick a code value or choose Custom. Badges show whether each value meets the standard selected for compliance." />
    <div className="codebar">
      <label className="fld" htmlFor="p-codeset"><span className="fl">Envelope code · fills all values and sets the compliance basis</span>
        <span className="in-u"><select id="p-codeset" value={p.codeset} onChange={e => { const v = e.target.value; let lbl = ''; update(s => { lbl = applyCodeset(s.project as Project, v)?.[1] || ''; }); toast('Applied: ' + lbl); }}>
          {groups.map(g => <optgroup key={g} label={g}>{CODESETS.filter(c => c[4] === g).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup>)}
        </select></span></label>
      <p>Limits used: wall {L.uWall}, roof {L.uRoof}, glazing {L.uGlass} W/m²K, SHGC {L.shgc}{L.band ? ` (${L.band}, from the project glazing ratio)` : ''}, skylight {L.uSky} W/m²K{L.shgcSky != null ? ', skylight SHGC ' + L.shgcSky : ''}. Hover a badge to see the limit.</p>
    </div>
    <fieldset className="method-box"><legend>Calculation method</legend>
      <div className="fgrid4">
        <label className="fld" htmlFor="p-method" style={{ gridColumn: 'span 2' }}><span className="fl">Cooling load method</span>
          <span className="in-u"><select id="p-method" value={p.method} onChange={e => setP('method', e.target.value)}>
            <option value="hbm">ASHRAE heat balance method, hourly, every month</option>
            <option value="cltd">ASHRAE CLTD/CLF method, single peak (legacy)</option>
          </select></span></label>
        {p.method !== 'cltd' && <>
          <label className="fld" htmlFor="p-ceil"><span className="fl">Ceiling seen by the room</span>
            <span className="in-u"><select id="p-ceil" value={p.ceil} onChange={e => setP('ceil', e.target.value)}>
              <option value="susp">Suspended gypsum ceiling</option><option value="none">Exposed slab</option></select></span></label>
          <label className="fld" htmlFor="p-floorFin"><span className="fl">Floor finish</span>
            <span className="in-u"><select id="p-floorFin" value={p.floorFin} onChange={e => setP('floorFin', e.target.value)}>
              <option value="tile">Tiles or stone on screed</option><option value="carpet">Carpet</option></select></span></label>
          {f('aWall', 'Wall outside solar absorptance', '', 0.05)}{f('aRoof', 'Roof outside solar absorptance', '', 0.05)}{f('gRefl', 'Ground reflectance', '', 0.05)}
          {f('frP', 'People, radiant fraction', '', 0.05)}{f('frL', 'Lighting, radiant fraction', '', 0.05)}{f('frE', 'Equipment, radiant fraction', '', 0.05)}
        </>}
      </div>
      {p.method !== 'cltd' ? <p className="hint">Each room is solved hour by hour on the 21st of every month (ASHRAE Fundamentals Ch. 18 heat balance): sun on each wall, roof and window, conduction through
        the layers with their thermal mass, long-wave exchange with the sky, radiant and convective internal gains, and the room air balance. The peak is the highest hour of the year.
        Weather: {STATION_SRC}, {stationOf(p.location).name} (WMO {stationOf(p.location).wmo}); {MONTHS[stationOf(p.location).db.indexOf(Math.max(...stationOf(p.location).db))]} uses the project design dry bulb
        ({fmt(d.e.To, 1)} °C) and daily range ({fmt(num(p.dr), 1)} K), other months follow the ASHRAE monthly 0.4% values. Absorptance: about 0.45 light, 0.7 medium, 0.9 dark (ASHRAE Ch. 18).
        Radiant fractions are typical values; ASHRAE Ch. 18 gives ranges by fixture and equipment type.</p>
        : <p className="hint">Single-peak CLTD/CLF calculation with the orientation factors at the bottom of this step. Kept for comparison with earlier projects.</p>}
    </fieldset>
    {/* external and partition U-values side by side, glazing across the full width below */}
    <div className="env-pair">
      <fieldset><legend>External walls &amp; roof · U-values</legend>
        <div className="fgrid">{pick('uWall')}{pick('uRoof')}</div>
        <TypeList store={store} kind="wallTypes" noun="external wall type" def={p.uWall} limit={L.uWall} limitName={L.name} />
      </fieldset>
      <fieldset><legend>Partitions &amp; adjacent spaces · U-values</legend>
        <div className="fgrid">
          {f('uPart', 'Wall partition U-value', 'W/m²K', 0.01)}{f('uCeil', 'Ceiling partition U-value', 'W/m²K', 0.01)}{f('uFloor', 'Floor partition / exposed floor U-value', 'W/m²K', 0.01)}
          {f('tAdj', 'Unconditioned space', '°C', 0.5)}
        </div>
        <TypeList store={store} kind="partTypes" noun="partition type" def={p.uPart} />
        <p className="hint">Partition and exposed floor / ceiling U-values are project-specific. Typical starting values are filled in.</p>
      </fieldset>
    </div>
    <fieldset className="glz-box"><legend>Glazing &amp; skylights</legend><div className="fgrid glz">{(['uGlass', 'shgc', 'uSky', 'shgcSky'] as const).map(pick)}{f('shade', 'Glass shading factor', '×', 0.05)}</div>
        <p className="hint">{T.wallG ? <>
          Project glazing ratio: {fmt(T.wwr, 0)}% of external wall ({SAFAT} {band} band).{T.roof > 0 ? ` Roof glazing: ${fmt(T.skyPct, 0)}% of roof.` : ''}{p.autoBand !== false && anySafat ? ` ${SAFAT} glazing values follow this band automatically.` : ''}{' '}
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" checked={p.autoBand !== false} onChange={e => setP('autoBand', e.target.checked)} /> Auto-select band</label>
        </> : 'Enter wall and glass areas in the rooms to see the glazing ratio.'}</p>
        {['estidama', 'barjeel'].includes(p.cbasis) && <p className="hint">Estidama and Barjeel publish no skylight SHGC; the ASHRAE 90.1 value is used.</p>}
    </fieldset>
    {/* builds the U-values used by the external wall, partition and roof inputs above */}
    <UValueBuilder store={store} />
    <AssemblyReferenceLibrary store={store} />
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
    {p.method === 'cltd' && <details>
      <summary>Orientation factors: wall, roof and glass CLTD, and solar gain through glass</summary>
      <div className="body">
        <p className="hint" style={{ marginTop: 0 }}>Base CLTD for a medium-weight wall (ASHRAE group D), insulated roof and glass. The correction for your design conditions ({d.e.corr >= 0 ? '+' : ''}{fmt(d.e.corr, 1)} K) is applied automatically. Solar values are peak gain per m² of glass per unit SHGC, including a storage factor, for about 25°N in July.</p>
        <div className="tbl-wrap" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Surface</th><th>Base CLTD (K)</th><th>Corrected (K)</th><th>Solar on glass (W/m²)</th></tr></thead>
          <tbody>
            {[...ORIENTS.map(o => [o, 'Wall ' + o, o] as const), ['R', 'Roof / skylight', 'H'] as const, ['G', 'Glass conduction (all orientations)', null] as const].map(([c, lab, sk]) =>
              <tr key={c}><td>{lab}</td>
                <td><NumInput label={'Base CLTD ' + lab} step={0.5} value={p.cltd[c]} onChange={v => setCltd(c, v)} /></td>
                <td>{fmt(Math.max(0, num(p.cltd[c]) + d.e.corr), 1)}</td>
                <td>{sk ? <NumInput label={'Solar gain ' + lab} step={5} value={p.solar[sk]} onChange={v => setSolar(sk, v)} /> : <span className="muted">–</span>}</td></tr>)}
          </tbody></table></div>
      </div>
    </details>}
  </section>;
}

/* extra named wall constructions, each with its own U-value; spaces pick one per wall or partition */
function TypeList({ store, kind, noun, def, limit, limitName }: {
  store: Store; kind: 'wallTypes' | 'partTypes'; noun: string; def: Num; limit?: number; limitName?: string;
}) {
  const types = store.state.project[kind], { update } = store;
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
      <colgroup><col /><col style={{ width: '34%' }} /><col style={{ width: 40 }} /></colgroup>
      <thead><tr><th>{noun[0].toUpperCase() + noun.slice(1)}</th><th>U-value (W/m²K)</th><th></th></tr></thead>
      <tbody>{types.map((t, i) => <tr key={t.id}>
        <td><input type="text" aria-label={`${noun} ${i + 1} name`} placeholder="e.g. 200 mm block" value={t.name} onChange={e => { const v = e.target.value; update(s => { s.project[kind][i].name = v; }, kind + '.n.' + t.id); }} /></td>
        <td><span className="ucell"><NumInput label={`${noun} ${i + 1} U-value`} min={0} step={0.01} value={t.u} onChange={v => update(s => { s.project[kind][i].u = v; }, kind + '.u.' + t.id)} /><Badge m={mark(t.u)} /></span></td>
        <td className="n"><button className="btn sm" type="button" aria-label={`Delete ${noun} ${i + 1}`} title="Delete" onClick={() => remove(t.id)}>×</button></td>
      </tr>)}</tbody></table></div>}
    <button className="btn sm" type="button" onClick={() => update(s => { s.project[kind].push({ id: newTypeId(), name: '', u: def }); })}>+ Add {noun}</button>
    <p className="hint">{types.length ? 'Pick the type for each wall in the Spaces step. Anything left on Default uses the value above.' : `Add a ${noun} when the building has more than one construction.`}</p>
  </div>;
}
