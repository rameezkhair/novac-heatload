import { INDOOR, LOC, OUT_OPTS, SUBLOC, VENT_OPTS } from '../engine/data';
import { hOf, oaPer100, type Computed } from '../engine/calc';
import { W_wb, wbOf } from '../engine/psychro';
import { indoorChecks, outdoorChecks, outdoorPlaus, ventBasis } from '../engine/checks';
import { ezOf, resolveProject, resolveRoom, setLocation, subOf } from '../engine/project';
import type { Mark, Num, Project } from '../engine/types';
import { fmt, fmtIn, num } from '../engine/util';
import type { Store } from '../state/store';
import { CheckTable, CountPill, Field, SecHead, SelectField, useCompliance, useToast } from './ui';

export function ProjectSection({ store, d, marks }: { store: Store; d: Computed; marks: Record<string, Mark> }) {
  const { update } = store, p = d.p, e = d.e, toast = useToast(), showC = useCompliance();
  const setP = (k: keyof Project, v: unknown, after?: (p: Project) => void) => update(s => {
    (s.project as Record<string, unknown>)[k] = v; after?.(s.project as Project);
  }, 'p.' + k);
  const sub = subOf(p);
  /* while the elevation adjustment is active, the outdoor fields show the adjusted values and are read-only */
  const adj = e.lapse > 0, adjTitle = (code: Num) => adj ? `Elevation-adjusted from the code value ${code}.` : undefined;
  const outVal = (k: 'toDB' | 'toWB' | 'vDB' | 'vWB') => !adj ? p[k] : num(fmtIn(k === 'toDB' ? e.To : k === 'vDB' ? e.Tv : k === 'toWB' ? wbOf(e.To, e.Wo, e.P) : wbOf(e.Tv, e.Wv, e.P), 1));
  const outEdit = (k: 'toDB' | 'toWB') => (v: Num) => setP(k, v, p => { p.src.out = 'custom'; if (p.src.vent === 'same') { p.vDB = num(p.toDB); p.vWB = num(p.toWB); } });
  const ventEdit = (k: 'vDB' | 'vWB') => (v: Num) => setP(k, v, p => { p.src.vent = 'custom'; });
  const pickSrc = (k: 'out' | 'vent' | 'indoor', v: string) => update(s => { s.project.src[k] = v; resolveProject(s.project as Project); });
  const vb = ventBasis(p);
  const pl = outdoorPlaus(p, e), plBad = pl.some(x => x[1] === 'bad');
  const oRows = outdoorChecks(p, e), ic = indoorChecks(p, e, d.rooms);
  const cnt = (rows: typeof oRows) => ({ nb: rows.filter(r => r[3][0] === 'bad').length, nw: rows.filter(r => r[3][0] === 'warn').length });

  return <section>
    <SecHead n={1} title="Project & design conditions" />
    <div className="groups">
      <fieldset><legend>Project</legend>
        <div className="fgrid one">
          <label className="fld" htmlFor="p-name"><span className="fl">Project name</span><span className="in-u"><input id="p-name" type="text" placeholder="e.g. G+1 office, Al Quoz" value={p.name} onChange={ev => setP('name', ev.target.value)} /></span></label>
          <SelectField id="p-location" label="Emirate / design-condition basis" value={p.location} onChange={v => {
            let why: string | null = null;
            update(s => { why = setLocation(s.project as Project, v); const ez = ezOf(s.project as Project); s.rooms.forEach(r => resolveRoom(r as never, ez)); });
            if (why) toast('Applied ' + why);
          }}>{Object.entries(LOC).map(([k, l]) => <option key={k} value={k}>{l.label}</option>)}</SelectField>
          <SelectField id="p-subloc" label="Sub-location (sets daily range)" value={p.subloc} onChange={v => update(s => { s.project.subloc = v; const x = subOf(s.project as Project); if (x) { s.project.elev = x.elev; s.project.dr = x.dr; } })}>
            {(SUBLOC[p.location] || []).map(s => <option key={s.id} value={s.id}>{s.label}: daily range {s.est ? '≈' : ''}{s.dr} K</option>)}
            <option value="custom">Custom daily range</option>
          </SelectField>
        </div>
        <p className="hint">{sub ? (sub.est ? 'Estimate, confirm for your site. ' : 'Sourced. ') + sub.src + '.' : 'Custom daily range. Record your data source.'}</p>
      </fieldset>
      <fieldset><legend>Outdoor · envelope &amp; infiltration</legend><div className="fgrid">
        <SelectField wide id="ps-out" label="Basis" value={p.src.out} onChange={v => pickSrc('out', v)}>{OUT_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}<option value="custom">Custom value</option></SelectField>
        <Field id="p-toDB" label="Dry bulb" unit="°C" mark={marks.toDB} value={outVal('toDB')} onChange={outEdit('toDB')} disabled={adj} title={adjTitle(p.toDB)} />
        <Field id="p-toWB" label="Wet bulb" unit="°C" mark={marks.toWB} value={outVal('toWB')} onChange={outEdit('toWB')} disabled={adj} title={adjTitle(p.toWB)} />
        <Field id="p-dr" label="Daily range" unit="K" mark={marks.dr} value={p.dr} onChange={v => setP('dr', v, p => { p.subloc = 'custom'; })} />
        <Field id="p-elev" label="Elevation" unit="m" step={1} mark={marks.elev} value={p.elev} onChange={v => setP('elev', v, p => { p.subloc = 'custom'; })} />
      </div></fieldset>
      <fieldset><legend>Outdoor · fresh air</legend><div className="fgrid">
        <SelectField wide id="ps-vent" label="Basis" value={p.src.vent} onChange={v => pickSrc('vent', v)}>{VENT_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}<option value="custom">Custom value</option></SelectField>
        <Field id="p-vDB" label="Dry bulb" unit="°C" mark={marks.vDB} value={outVal('vDB')} onChange={ventEdit('vDB')} disabled={adj} title={adjTitle(p.vDB)} />
        <Field id="p-vWB" label="Wet bulb" unit="°C" mark={marks.vWB} value={outVal('vWB')} onChange={ventEdit('vWB')} disabled={adj} title={adjTitle(p.vWB)} />
      </div>
        <p className="hint">{vb.std ? `Outdoor air (FAHU) design to ${vb.o.src}.` : 'Outdoor air (FAHU) design: ' + (vb.same ? 'cooling condition.' : 'custom values.')}</p>
        <VentRemark store={store} d={d} />
      </fieldset>
      <fieldset><legend>Indoor design &amp; comfort</legend><div className="fgrid">
        <SelectField wide id="ps-indoor" label="Basis" value={p.src.indoor} onChange={v => pickSrc('indoor', v)}>{INDOOR.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}<option value="custom">Custom value</option></SelectField>
        <Field id="p-tiDB" label="Dry bulb" unit="°C" step={0.5} mark={marks.tiDB} value={p.tiDB} onChange={v => setP('tiDB', v, p => { p.src.indoor = 'custom'; })} />
        <Field id="p-tiRH" label="Relative humidity" unit="%" step={1} mark={marks.tiRH} value={p.tiRH} onChange={v => setP('tiRH', v, p => { p.src.indoor = 'custom'; })} />
      </div></fieldset>
    </div>
    {pl.length > 0 && <div className={'remark' + (plBad ? '' : ' warn')} role="alert">
      <b>{plBad ? '✗ Remark: abnormal outdoor design condition' : '! Remark: unusual outdoor design condition'}</b>
      <ul>{pl.map((x, i) => <li key={i}>{x[2]}</li>)}</ul></div>}
    {showC && <div className="chk2">
      <div className="checks"><h3><span>Outdoor design basis checks</span><CountPill {...cnt(oRows)} /></h3>
        <p className="chk-sum">Design {fmt(e.To, 1)} °C DB / {fmt(wbOf(e.To, e.Wo, e.P), 1)} °C WB · W {fmt(e.Wo * 1000, 1)} g/kg · h {fmt(hOf(e.To, e.Wo), 1)} kJ/kg</p>
        <div className="tbl-wrap" style={{ border: 0 }}><CheckTable rows={oRows} /></div></div>
      <div className="checks"><h3><span>Indoor design basis checks</span><CountPill {...cnt(ic.rows)} /></h3>
        <p className="chk-sum">PMV {ic.pmv >= 0 ? '+' : ''}{fmt(ic.pmv, 2)} · PPD {fmt(ic.ppd, 0)}% · dew point {fmt(ic.dp, 1)} °C</p>
        <div className="tbl-wrap" style={{ border: 0 }}><CheckTable rows={ic.rows} /></div></div>
    </div>}
    <div className="derived">
      <span>Outdoor W <b>{fmt(e.Wo * 1000, 1)}</b> g/kg</span><span>Fresh-air W <b>{fmt(e.Wv * 1000, 1)}</b> g/kg</span><span>Indoor W <b>{fmt(e.Wi * 1000, 1)}</b> g/kg</span>
      <span>CLTD correction <b>{e.corr >= 0 ? '+' : ''}{fmt(e.corr, 1)}</b> K</span><span>Pressure <b>{fmt(e.P, 1)}</b> kPa</span>
    </div>
  </section>;
}

/* why the fresh-air design differs from the envelope design, or a warning when it is non-standard */
function VentRemark({ store, d }: { store: Store; d: Computed }) {
  const p = d.p, e = d.e, Ti = num(p.tiDB), toast = useToast();
  const ad = p.location === 'abudhabi' || p.location === 'alain';
  if (!ventBasis(p).std) {
    const Wd = W_wb(34, 32, e.P), qd = oaPer100(e, Ti, 34, Wd), hd = hOf(34, Wd), qc = oaPer100(e, Ti, e.Tv, e.Wv), short = qd > qc ? (1 - qc / qd) * 100 : 0;
    return <div className="remark warn">
      <b>Outdoor air design {fmt(num(p.vDB), 1)} °C DB / {num(p.vWB)} °C WB is {p.src.vent === 'same' ? 'the cooling condition, not standard practice for outdoor air systems' : 'not a recognised design basis'}</b>
      Adopt a recognised basis ({ad ? 'DoE CLM Table 2' : 'DBC H.4.6.4'}) or submit technical justification for Authority approval. DBC H.4.6.4 designs the outdoor air system at 34 °C DB / 32 °C WB (W {fmt(Wd * 1000, 1)} g/kg, h {fmt(hd, 1)} kJ/kg, {fmt(qd, 2)} kW per 100 L/s).
      The current values give {fmt(qc, 2)} kW per 100 L/s{short > 0 ? `, so the FAHU would be undersized by about ${fmt(short, 0)}%, mostly in dehumidification` : ''}.
      <br /><button className="btn" type="button" style={{ marginTop: 8 }} onClick={() => { store.update(s => { s.project.src.vent = 'dbc'; resolveProject(s.project as Project); }); toast('Applied DBC H.4.6.4: 34 °C DB / 32 °C WB'); }}>Apply 34 °C DB / 32 °C WB</button>
    </div>;
  }
  if (Math.abs(e.Tv - e.To) < 0.05 && Math.abs(e.Wv - e.Wo) < 1e-6) return null;
  const qo = oaPer100(e, Ti, e.To, e.Wo), qv = oaPer100(e, Ti, e.Tv, e.Wv), under = qv > qo ? (1 - qo / qv) * 100 : 0;
  return <div className="vent-why"><details><summary>Why not {fmt(e.To, 1)} °C DB / {num(p.toWB)} °C WB?</summary>
    <p>FAHU coils are sized for peak enthalpy (humid days), not peak temperature. {fmt(e.Tv, 1)}/{num(p.vWB)} °C: {fmt(hOf(e.Tv, e.Wv), 1)} kJ/kg, {fmt(qv, 2)} kW per 100 L/s. {fmt(e.To, 1)}/{num(p.toWB)} °C: {fmt(hOf(e.To, e.Wo), 1)} kJ/kg, {fmt(qo, 2)} kW per 100 L/s{under > 0 ? `, about ${fmt(under, 0)}% undersized` : ''}. {fmt(e.To, 1)} °C is used for the envelope.</p>
  </details></div>;
}
