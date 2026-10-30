import { CODESETS, LIB, ORIENTS, PMETA, SAFAT, type Limits, type PickKey } from '../engine/data';
import type { Computed } from '../engine/calc';
import { applyCodeset, ezOf, resolveProject, resolveRoom } from '../engine/project';
import type { Mark, Num, Orient, Project } from '../engine/types';
import { fmt, num } from '../engine/util';
import type { Store } from '../state/store';
import { Field, NumInput, PickField, SecHead, useToast } from './ui';

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
    <SecHead n={3} title="Envelope & system" sub="Pick a code value or choose Custom. Badges show whether each value meets the standard selected for compliance." />
    <div className="codebar">
      <label className="fld" htmlFor="p-codeset"><span className="fl">Envelope code · fills all values and sets the compliance basis</span>
        <span className="in-u"><select id="p-codeset" value={p.codeset} onChange={e => { const v = e.target.value; let lbl = ''; update(s => { lbl = applyCodeset(s.project as Project, v)?.[1] || ''; }); toast('Applied: ' + lbl); }}>
          {groups.map(g => <optgroup key={g} label={g}>{CODESETS.filter(c => c[4] === g).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup>)}
        </select></span></label>
      <p>Limits used: wall {L.uWall}, roof {L.uRoof}, glazing {L.uGlass} W/m²K, SHGC {L.shgc}{L.band ? ` (${L.band}, from the project glazing ratio)` : ''}, skylight {L.uSky} W/m²K{L.shgcSky != null ? ', skylight SHGC ' + L.shgcSky : ''}. Hover a badge to see the limit.</p>
    </div>
    <div className="groups">
      <fieldset><legend>Opaque envelope</legend><div className="fgrid one">{pick('uWall')}{pick('uRoof')}</div></fieldset>
      <fieldset><legend>Glazing &amp; skylights</legend><div className="fgrid one">{(['uGlass', 'shgc', 'uSky', 'shgcSky'] as const).map(pick)}</div>
        <p className="hint">{T.wallG ? <>
          Project glazing ratio: {fmt(T.wwr, 0)}% of external wall ({SAFAT} {band} band).{T.roof > 0 ? ` Roof glazing: ${fmt(T.skyPct, 0)}% of roof.` : ''}{p.autoBand !== false && anySafat ? ` ${SAFAT} glazing values follow this band automatically.` : ''}{' '}
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" checked={p.autoBand !== false} onChange={e => setP('autoBand', e.target.checked)} /> Auto-select band</label>
        </> : 'Enter wall and glass areas in the rooms to see the glazing ratio.'}</p>
        {['estidama', 'barjeel'].includes(p.cbasis) && <p className="hint">Estidama and Barjeel publish no skylight SHGC; the ASHRAE 90.1 value is used.</p>}
      </fieldset>
      <fieldset><legend>Adjacent spaces &amp; shading</legend><div className="fgrid">
        {f('uPart', 'Wall partition U-value', 'W/m²K', 0.01)}{f('uCeil', 'Ceiling partition U-value', 'W/m²K', 0.01)}{f('uFloor', 'Floor partition / exposed floor U-value', 'W/m²K', 0.01)}
        {f('tAdj', 'Unconditioned space', '°C', 0.5)}{f('shade', 'Glass shading factor', '×', 0.05)}
      </div><p className="hint">Partition and exposed floor / ceiling U-values are project-specific. Typical starting values are filled in.</p></fieldset>
      <fieldset><legend>System &amp; margins</legend><div className="fgrid">
        {f('tSupply', 'Supply air temp', '°C', 0.5)}{f('diversity', 'Plant diversity', '%', 1)}{f('sfS', 'Margin, sensible', '%', 1)}{f('sfL', 'Margin, latent', '%', 1)}
        <label className="check" htmlFor="p-fahu"><input type="checkbox" id="p-fahu" checked={p.fahu} onChange={e => setP('fahu', e.target.checked)} />
          <span>Fresh air treated by a FAHU<br /><span className="muted" style={{ fontSize: 12 }}>Fresh air load is listed separately, not added to room units.</span></span></label>
      </div><p className="hint">DBC H.4.6.3 caps safety factors at 10% sensible and 5% latent. Where diversity is not known, use ASHRAE Fundamentals Ch. 18 coefficients (DBC H.4.6.3).</p></fieldset>
      <fieldset><legend>Fresh air distribution</legend><div className="fgrid one">{pick('ez')}</div>
        <p className="hint">ASHRAE 62.1-2022 Table 6-4. Zone outdoor air = (Rp × people + Ra × area) / Ez.</p></fieldset>
      <fieldset><legend>Energy recovery · DBC H.4.8.2</legend><div className="fgrid">
        <label className="check" htmlFor="p-erv"><input type="checkbox" id="p-erv" checked={p.erv} onChange={e => setP('erv', e.target.checked)} />
          <span>FAHU has energy recovery<br /><span className="muted" style={{ fontSize: 12 }}>Plate or wheel. Set latent above 0 only for an enthalpy wheel.</span></span></label>
        {f('ervS', 'Sensible effectiveness', '%', 1)}{f('ervL', 'Latent effectiveness', '%', 1)}{f('ervShare', 'Exhaust air recovered', '% of OA', 1)}
      </div><p className="hint">Required above 1,000 L/s of treated outdoor air: recover at least 50% of exhaust air at 70% or higher sensible effectiveness. Applied to the FAHU load.</p></fieldset>
    </div>
    <details>
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
    </details>
  </section>;
}
