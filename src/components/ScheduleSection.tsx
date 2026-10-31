import { ACT, ENVK, LIB, LOC, LPD_BAM, PMETA, SUBLOC, TYPES, VENT, INDOOR, SAFAT, bamWm2, typeOf } from '../engine/data';
import type { Computed } from '../engine/calc';
import { PILL, type Check } from '../engine/checks';
import { ROOMOPTS } from '../engine/project';
import { DBC_CLAUSES, basisRows, methodItems } from '../engine/report';
import { MONTHS } from '../engine/climate';
import { fmt, num } from '../engine/util';
import { SecHead, useCompliance } from './ui';
import { useState } from 'react';
import { ElectricalKpis, ElectricalSummary, type LoadBasis } from './HourlySection';
import type { Store } from '../state/store';

export function ScheduleSection({ d, checks, store }: { d: Computed; checks: Check[]; store: Store }) {
  const { p, res, T, rooms } = d, showC = useCompliance();
  const nBad = checks.filter(c => c[0] === 'bad').length, nOk = checks.filter(c => c[0] === 'ok').length;
  const scope = p.location === 'dubai' || p.location === 'custom' ? '' : ' DBC applies to Dubai; shown for reference.';
  const fa = p.fahu ? T.fahuW : T.oa;
  /* which load the efficiency and power cards below refer to */
  const [basis, setBasis] = useState<LoadBasis>('total');
  return <section>
    <SecHead n={6} title={showC ? 'Heat load summary & compliance' : 'Heat load summary'} sub={(p.name ? p.name + ' · ' : '') + (LOC[p.location]?.label || '')} />
    <div className="totals">
      <button type="button" className="tot pick" aria-pressed={basis === 'room'} onClick={() => setBasis('room')}><div className="k">Room load (excl. fresh air)</div><div className="v">{fmt((T.s + T.l) / 3517, 1)}<small>TR</small></div><div className="s">{fmt((T.s + T.l) / 1000, 1)} kW{p.fahu ? '' : ' · room units ' + fmt(T.u / 3517, 1) + ' TR incl. fresh air'}</div></button>
      <button type="button" className="tot pick" aria-pressed={basis === 'fa'} onClick={() => setBasis('fa')}><div className="k">Fresh air cooling load{p.fahu && T.rec ? ' (net of recovery)' : ''}</div><div className="v">{fmt(fa / 3517, 1)}<small>TR</small></div><div className="s">{fmt(fa / 1000, 1)} kW · {fmt(T.oaq, 0)} L/s · {p.fahu ? 'FAHU' : 'in room units'}{T.rec ? ' · ' + fmt(T.rec / 1000, 1) + ' kW recovered' : ''}</div></button>
      <button type="button" className="tot pick key" aria-pressed={basis === 'total'} onClick={() => setBasis('total')}><div className="k">Plant load{num(p.diversity) !== 100 ? ' at ' + fmt(num(p.diversity), 0) + '% diversity' : ''}</div><div className="v">{fmt(T.plant / 3517, 1)}<small>TR</small></div><div className="s">{fmt(T.plant / 1000, 1)} kW · room + fresh air</div></button>
      <div className="tot"><div className="k">Overall density</div><div className="v">{T.a && T.plant ? fmt(T.a / (T.plant / 3517), 1) : '–'}<small>m²/TR</small></div><div className="s">{fmt(T.a ? T.plant / T.a : 0, 0)} W/m² over {fmt(T.a, 0)} m²</div></div>
    </div>
    <ElectricalKpis d={d} basis={basis} />
    <fieldset className="power-summary-box"><legend>Cooling efficiency and power requirement</legend>
      <ElectricalSummary d={d} store={store} />
    </fieldset>
    <div className="tbl-wrap"><table>
      <thead><tr><th>Room</th><th>Qty</th><th>Area m²</th><th>People</th><th>Room sens. kW</th><th>Room lat. kW</th><th>Fresh air kW</th><th>Unit load kW</th><th>Unit TR</th><th>W/m²</th><th>Supply L/s</th><th>Fresh air L/s</th><th>Peak</th></tr></thead>
      <tbody>{rooms.length ? rooms.map(r => { const c = res[r.id]; return <tr key={r.id}><td>{r.name || 'Untitled'}</td><td>{c.qty}</td><td>{fmt(c.A, 1)}</td><td>{fmt(c.n, 0)}</td><td>{fmt(c.roomS / 1000, 2)}</td><td>{fmt(c.roomL / 1000, 2)}</td><td>{fmt(c.oa / 1000, 2)}</td><td>{fmt(c.unit / 1000, 2)}</td><td>{fmt(c.unit / 3517, 2)}</td><td>{fmt(c.A ? c.unit / c.A : 0, 0)}</td><td>{fmt(c.sa, 0)}</td><td>{fmt(c.oaQ, 0)}</td><td>{c.pkM != null ? `${MONTHS[c.pkM]} ${String(c.pkH).padStart(2, '0')}:00` : ''}</td></tr>; })
        : <tr><td colSpan={13} className="muted">No rooms yet.</td></tr>}</tbody>
      <tfoot><tr><td>Total (× qty)</td><td>{T.q}</td><td>{fmt(T.a, 1)}</td><td>{fmt(T.n, 0)}</td><td>{fmt(T.s / 1000, 2)}</td><td>{fmt(T.l / 1000, 2)}</td><td>{fmt(T.oa / 1000, 2)}</td><td>{fmt(T.u / 1000, 2)}</td><td>{fmt(T.u / 3517, 2)}</td><td>{fmt(T.a ? T.u / T.a : 0, 0)}</td><td>{fmt(T.sa, 0)}</td><td>{fmt(T.oaq, 0)}</td><td>{T.blk ? `${MONTHS[T.blk.m]} ${String(T.blk.h).padStart(2, '0')}:00` : ''}</td></tr></tfoot>
    </table></div>
    {T.blk && <p className="hint">Coincident block load of all rooms (heat balance): <b>{fmt((T.blk.s + T.blk.l) / 3517, 1)} TR</b> ({fmt((T.blk.s + T.blk.l) / 1000, 1)} kW) on {MONTHS[T.blk.m]} 21 at {String(T.blk.h).padStart(2, '0')}:00, against {fmt((T.s + T.l) / 3517, 1)} TR for the sum of room peaks. Size room units on their own peaks; the block load shows the diversity available to central plant.</p>}
    {showC && <><details><summary>Compliance checks: {nOk} complying · {nBad} failing</summary>
      <div className="chk-body">{scope && <p className="chk-sum">{scope.trim()}</p>}
        {checks.map(([s, c, t], i) => <div className="chk" key={i}><span className={'pill ' + s}>{s === 'ok' ? '✓ ' : s === 'bad' ? '✗ ' : ''}{PILL[s]}</span><span className="cl">{c}</span><span className="tx">{t}</span></div>)}
      </div></details>
    <details><summary>Design basis</summary>
      <div className="body"><div className="tbl-wrap basis"><table>
        <thead><tr><th>Design basis</th><th>Value</th><th>Source</th></tr></thead>
        <tbody>{basisRows(p, d).map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
      </table></div></div></details></>}
    <details><summary>Method and formulas</summary>
      <div className="body method"><ul>{methodItems.map((m, i) => <li key={i} dangerouslySetInnerHTML={{ __html: m }} />)}</ul></div></details>
    <details><summary>Standards library: every selectable value and its source</summary>
      <div className="body"><Library /></div></details>
  </section>;
}

function T_({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return <div><h4>{title}</h4><div className="tbl-wrap"><table className="lib">
    <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div></div>;
}

function Library() {
  const lpd: (string | number)[][] = Object.values(TYPES).filter(x => x.a901).map(x => [x.label, x.a901 + ' W/m²', 'ASHRAE 90.1-2022 Table 9.6.1 Space-by-Space'])
    .concat(LPD_BAM.map(([, l, w]) => [l, bamWm2(w) + ' W/m² (' + w + ' W/ft²)', 'ASHRAE 90.1-2022 Table 9.5.1 Building Area Method']))
    .concat([['General (energy model baseline)', '8.7 W/m²', 'Estidama baseline'], ['Residential (energy model baseline)', '6.8 W/m²', 'Estidama baseline']]);
  return <>
    <div className="lib-grid">
      <T_ title="Dubai Building Code" head={['Clause', 'Requirement']} rows={DBC_CLAUSES} />
      <T_ title="Sub-locations: elevation and daily range" head={['Location', 'Elevation m', 'Range K', 'Basis', 'Source']} rows={Object.values(SUBLOC).flat().map(s => [s.label, s.elev, s.dr, s.est ? 'Estimate' : 'Sourced', s.src])} />
      <T_ title="Indoor design basis" head={['Option', 'Design', 'Checks']} rows={INDOOR.map(i => [i.label, `${i.db} °C / ${i.rh}%`, i.src])} />
      <T_ title="DBC Table B.2 occupant load factors" head={['Use', 'Factor']} rows={Object.values(TYPES).filter(x => x.dbc).map(x => [x.dbc![1], x.dbc![0] + ' m²/person'])} />
      <T_ title="Envelope" head={['Item', 'Option', 'Value', 'Source']} rows={ENVK.flatMap(k => LIB[k].map(o => [PMETA[k][0], o.label, o.v, o.src]))} />
      <T_ title="Zone air distribution effectiveness, ASHRAE 62.1-2022 Table 6-4" head={['Configuration', 'Ez']} rows={LIB.ez.map(o => [o.label, o.v])} />
      <T_ title="Fresh air, ASHRAE 62.1-2022 Table 6-1" head={['Space', 'Rp L/s·p', 'Ra L/s·m²', 'Default /100 m²']} rows={VENT.map(v => [v.label, v.rp, v.ra, v.dens || '–'])} />
      <T_ title="People heat gain, ASHRAE Fundamentals Ch. 18" head={['Activity', 'Sensible W', 'Latent W']} rows={ACT.map(a => [a.label, a.s, a.l])} />
      <T_ title="Lighting power density" head={['Space', 'Value', 'Source']} rows={lpd} />
      <T_ title="Infiltration (summer design)" head={['Basis', 'ACH', 'Source']} rows={ROOMOPTS.ach(null, typeOf('office'), 1).map(o => [o.label, o.v, o.cat || '']).concat([['DBC H.4.9.1 airtightness 5 m³/h·m² at 50 Pa', 'envelope area × 5 ÷ 20 ÷ volume', 'DBC H.4.9.1; ÷20 rule for natural conditions']])} />
      <T_ title="Equipment power density" head={['Space', 'Value', 'Source']} rows={[['Office equipment', '15 W/m²', 'CIBSE TM37, as cited in DOE Cooling Load Manual'], ['General (energy model baseline)', '8.1 W/m²', 'Estidama baseline'], ['Residential (energy model baseline)', '2.7 W/m²', 'Estidama baseline']]} />
    </div>
    <p className="refs">Sources and notes. Dubai Building Code 2021, Part B Table B.2 and Part H Indoor Environment. {SAFAT}: Dubai Green Building Evaluation System, Articles 401.01, 402.01, 501.01, 501.03, 501.05. ASHRAE 62.1-2022 Tables 6-1 and 6-4. ASHRAE 62.2 governs whole-dwelling ventilation for residential units; the 62.1 bedroom/living row is used here per room.
      Estidama and Barjeel envelope values from <a href="https://www.witpress.com/Secure/elibrary/papers/SC20/SC20008FU1.pdf" target="_blank" rel="noopener">WIT Press, Sustainable City 2020</a>; Estidama lighting and equipment baselines from <a href="https://support.sefaira.com/hc/en-us/articles/204459785-UAE-Baseline-Estidama" target="_blank" rel="noopener">Sefaira's UAE Estidama baseline</a>.
      ASHRAE 90.1-2022 lighting values from <a href="https://www.ashrae.org/file%20library/technical%20resources/bookstore/part5_90.1-2022lightingchanges.pdf" target="_blank" rel="noopener">ASHRAE Journal, Sept 2023</a>.
      Abu Dhabi and Al Ain conditions from the DOE Cooling Load Manual. Confirm values against the editions that apply to your permit.</p>
  </>;
}
