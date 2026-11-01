import { LOC } from '../engine/data';
import type { Computed } from '../engine/calc';
import { PILL, type Check } from '../engine/checks';
import { basisRows } from '../engine/report';
import { MONTHS } from '../engine/climate';
import { fmt, num } from '../engine/util';
import { SecHead, useCompliance } from './ui';
import { useState } from 'react';
import { ElectricalKpis, ElectricalSummary, type LoadBasis } from './HourlySection';
import type { Store } from '../state/store';

export function ScheduleSection({ d, checks, store }: { d: Computed; checks: Check[]; store: Store }) {
  const { p, T } = d, showC = useCompliance();
  const nBad = checks.filter(c => c[0] === 'bad').length, nOk = checks.filter(c => c[0] === 'ok').length;
  const scope = p.location === 'dubai' || p.location === 'custom' ? '' : ' DBC applies to Dubai; shown for reference.';
  const fa = p.fahu ? T.fahuW : T.oa;
  /* which load the efficiency and power cards below refer to */
  const [basis, setBasis] = useState<LoadBasis>('total');
  return <section>
    <SecHead n={5} title={showC ? 'Heat load summary & compliance' : 'Heat load summary'} sub={(p.name ? p.name + ' · ' : '') + (LOC[p.location]?.label || '')} />
    <RoomLoadSchedule d={d} />
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
    {showC && <><details><summary>Compliance checks: {nOk} complying · {nBad} failing</summary>
      <div className="chk-body">{scope && <p className="chk-sum">{scope.trim()}</p>}
        {checks.map(([s, c, t], i) => <div className="chk" key={i}><span className={'pill ' + s}>{s === 'ok' ? '✓ ' : s === 'bad' ? '✗ ' : ''}{PILL[s]}</span><span className="cl">{c}</span><span className="tx">{t}</span></div>)}
      </div></details>
    <details><summary>Design basis</summary>
      <div className="body"><div className="tbl-wrap basis"><table>
        <thead><tr><th>Design basis</th><th>Value</th><th>Source</th></tr></thead>
        <tbody>{basisRows(p, d).map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
      </table></div></div></details></>}
  </section>;
}

function RoomLoadSchedule({ d }: { d: Computed }) {
  const { res, T, rooms } = d;
  return <>
    <div className="tbl-wrap"><table className="room-load-table">
      <thead><tr><th>Room</th><th>Qty</th><th>Area m²</th><th>People</th><th>Room sens. kW</th><th>Room lat. kW</th><th>Fresh air kW</th><th>Unit load kW</th><th>Unit TR</th><th>W/m²</th><th>Supply L/s</th><th>Fresh air L/s</th><th>Peak</th></tr></thead>
      <tbody>{rooms.length ? rooms.map(r => { const c = res[r.id]; return <tr key={r.id}><td>{r.name || 'Untitled'}</td><td>{c.qty}</td><td>{fmt(c.A, 1)}</td><td>{fmt(c.n, 0)}</td><td>{fmt(c.roomS / 1000, 2)}</td><td>{fmt(c.roomL / 1000, 2)}</td><td>{fmt(c.oa / 1000, 2)}</td><td>{fmt(c.unit / 1000, 2)}</td><td>{fmt(c.unit / 3517, 2)}</td><td>{fmt(c.A ? c.unit / c.A : 0, 0)}</td><td>{fmt(c.sa, 0)}</td><td>{fmt(c.oaQ, 0)}</td><td>{c.pkM != null ? `${MONTHS[c.pkM]} ${String(c.pkH).padStart(2, '0')}:00` : ''}</td></tr>; })
        : <tr><td colSpan={13} className="muted">No rooms yet.</td></tr>}</tbody>
      <tfoot><tr><td>Total (× qty)</td><td>{T.q}</td><td>{fmt(T.a, 1)}</td><td>{fmt(T.n, 0)}</td><td>{fmt(T.s / 1000, 2)}</td><td>{fmt(T.l / 1000, 2)}</td><td>{fmt(T.oa / 1000, 2)}</td><td>{fmt(T.u / 1000, 2)}</td><td>{fmt(T.u / 3517, 2)}</td><td>{fmt(T.a ? T.u / T.a : 0, 0)}</td><td>{fmt(T.sa, 0)}</td><td>{fmt(T.oaq, 0)}</td><td>{T.blk ? `${MONTHS[T.blk.m]} ${String(T.blk.h).padStart(2, '0')}:00` : ''}</td></tr></tfoot>
    </table></div>
    {T.blk && <p className="hint">Coincident block load of all rooms (heat balance): <b>{fmt((T.blk.s + T.blk.l) / 3517, 1)} TR</b> ({fmt((T.blk.s + T.blk.l) / 1000, 1)} kW) on {MONTHS[T.blk.m]} 21 at {String(T.blk.h).padStart(2, '0')}:00, against {fmt((T.s + T.l) / 3517, 1)} TR for the sum of room peaks. Size room units on their own peaks; the block load shows the diversity available to central plant.</p>}
  </>;
}
