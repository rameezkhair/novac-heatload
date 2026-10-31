import { useState } from 'react';
import type { Computed } from '../engine/calc';
import { MONTHS } from '../engine/climate';
import { efficiencyGuidance } from '../engine/efficiency';
import { BTU_W, SYSTEMS, capRatio, copAt, copToKwTr, requirements, recommended, type SysId } from '../engine/equipment';
import { LABELS, electrical, hours } from '../engine/hourly';
import type { Num, Project } from '../engine/types';
import { fmt, num } from '../engine/util';
import type { Store } from '../state/store';
import { NumInput, SecHead } from './ui';

const hh = (h: number) => String(h).padStart(2, '0') + ':00';
/* round axis step: 1, 2 or 5 × 10ⁿ */
const niceStep = (span: number) => { const raw = span / 4, p = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

export function HourlySection({ d, store }: { d: Computed; store: Store }) {
  const { T, res, rooms } = d;
  const [scope, setScope] = useState('all');
  const [month, setMonth] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (!rooms.length || !T.blk) return <section>
    <SecHead n={7} title="Hourly analysis" />
    <p className="hint">Add a room to see its hourly loads.</p>
  </section>;
  /* a deleted room falls back to the whole building */
  const sc = scope !== 'all' && !res[scope] ? 'all' : scope, room = sc === 'all' ? null : res[sc];
  const pkM = room ? room.pkM! : T.blk.m, m = month ?? pkM;
  const H = hours(d, sc, m);
  const monthly = MONTHS.map((_, k) => { const x = hours(d, sc, k); let b = 0; x.forEach((y, i) => { if (y.total > x[b].total) b = i; }); return { kW: x[b].total / 1000, h: b + 1 }; });
  let pk = 0; H.forEach((y, i) => { if (y.total > H[pk].total) pk = i; });
  const sum = H.reduce((a, y) => a + y.total, 0) / 1000;
  const el = electrical(d, sc, m);

  /* chart geometry (viewBox units) */
  const W = 760, Ht = 280, ml = 44, mr = 8, mt = 22, mb = 24, pw = W - ml - mr, ph = Ht - mt - mb, bw = pw / 24;
  const stacks = H.map(y => { let up = 0, dn = 0; return y.v.map(x => { const kw = x / 1000; if (kw >= 0) { const s = [up, up + kw]; up += kw; return s; } const s = [dn + kw, dn]; dn += kw; return s; }); });
  const top = Math.max(...stacks.map(s => Math.max(0, ...s.map(x => x[1])))), bot = Math.min(...stacks.map(s => Math.min(0, ...s.map(x => x[0]))));
  const step = niceStep(top - bot || 1), yMax = Math.ceil(top / step) * step || step, yMin = Math.floor(bot / step) * step;
  const y = (v: number) => mt + (yMax - v) / (yMax - yMin) * ph;
  const ticks: number[] = []; for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  const hv = hover != null ? H[hover] : null;

  return <section className="hourly">
    <SecHead n={7} title="Hourly analysis" sub="Heat balance loads hour by hour, by component" />
    <div className="hr-filters">
      <label className="fld" htmlFor="hr-scope"><span className="fl">Show</span><span className="in-u"><select id="hr-scope" value={sc} onChange={e => { setScope(e.target.value); setMonth(null); }}>
        <option value="all">Whole building (all rooms × quantity)</option>
        {rooms.map(r => <option key={r.id} value={r.id}>{r.name || 'Untitled'}{res[r.id].qty > 1 ? ' (one of ' + res[r.id].qty + ')' : ''}</option>)}
      </select></span></label>
      <label className="fld" htmlFor="hr-month"><span className="fl">Design day</span><span className="in-u"><select id="hr-month" value={m} onChange={e => setMonth(Number(e.target.value))}>
        {MONTHS.map((x, k) => <option key={x} value={k}>{x} 21{k === pkM ? ' (peak month)' : ''}</option>)}
      </select></span></label>
    </div>
    <div className="totals hr-kpis">
      <div className="tot key"><div className="k">Peak on {MONTHS[m]} 21</div><div className="v">{fmt(H[pk].total / 3517, 2)}<small>TR</small></div><div className="s">{fmt(H[pk].total / 1000, 2)} kW at {hh(pk + 1)}</div></div>
      <div className="tot"><div className="k">{room ? 'Room' : 'Building'} design peak</div><div className="v">{fmt(monthly[pkM].kW / 3.517, 2)}<small>TR</small></div><div className="s">{MONTHS[pkM]} 21 at {hh(monthly[pkM].h)}</div></div>
      <div className="tot"><div className="k">Daily cooling, {MONTHS[m]} 21</div><div className="v">{fmt(sum / 3.517, 1)}<small>TR·h</small></div><div className="s">{fmt(sum, 0)} kWh of room load</div></div>
      <div className="tot"><div className="k">Outdoor, {MONTHS[m]} 21</div><div className="v">{fmt(Math.max(...H.map(x => x.To)), 1)}<small>°C</small></div><div className="s">minimum {fmt(Math.min(...H.map(x => x.To)), 1)} °C</div></div>
    </div>

    <div className="hr-card">
      <h3>Room load by hour, {MONTHS[m]} 21{room ? '' : ', whole building'} <span className="muted">· kW, before safety margins</span></h3>
      <ul className="hr-legend">{LABELS.map((l, k) => <li key={l}><i style={{ background: `var(--s${k + 1})` }} />{l}</li>)}</ul>
      <div className="hr-plot" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label={`Stacked hourly room load for ${MONTHS[m]} 21. Peak ${fmt(H[pk].total / 1000, 2)} kW at ${hh(pk + 1)}. Full values in the table below.`}>
          {ticks.map(t => <g key={t}><line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className={t === 0 ? 'hr-zero' : 'hr-grid'} /><text x={ml - 6} y={y(t) + 3.5} textAnchor="end" className="hr-tick">{fmt(t, step < 1 ? 1 : 0)}</text></g>)}
          {stacks.map((s, i) => <g key={i} opacity={hover != null && hover !== i ? 0.45 : 1}>
            {s.map(([a, b], k) => b - a > 1e-6 ? <rect key={k} x={ml + i * bw + 2} width={bw - 4} y={y(b)} height={Math.max(0, y(a) - y(b))} fill={`var(--s${k + 1})`} className="hr-seg" /> : null)}
          </g>)}
          {H.map((_, i) => (i + 1) % 3 === 0 ? <text key={i} x={ml + i * bw + bw / 2} y={Ht - 8} textAnchor="middle" className="hr-tick">{i + 1}</text> : null)}
          <text x={ml + pk * bw + bw / 2} y={y(stacks[pk].reduce((a, x) => Math.max(a, x[1]), 0)) - 6} textAnchor="middle" className="hr-peak">Peak {fmt((H[pk].total - H[pk].margin) / 1000, 1)} kW</text>
          {H.map((_, i) => <rect key={'h' + i} x={ml + i * bw} y={mt} width={bw} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />)}
        </svg>
        {hv && hover != null && <div className="hr-tip" style={{ left: `${(ml + hover * bw + bw / 2) / W * 100}%`, transform: hover > 15 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
          <b>{MONTHS[m]} 21, {hh(hover + 1)}</b><span className="muted">Outdoor {fmt(hv.To, 1)} °C</span>
          {LABELS.map((l, k) => Math.abs(hv.v[k]) > 0.5 ? <div key={l} className="hr-tip-row"><i style={{ background: `var(--s${k + 1})` }} /><span>{l}</span><b>{fmt(hv.v[k] / 1000, 2)}</b></div> : null)}
          <div className="hr-tip-row tot"><span>Safety margins</span><b>{fmt(hv.margin / 1000, 2)}</b></div>
          <div className="hr-tip-row tot"><span>Total, kW</span><b>{fmt(hv.total / 1000, 2)}</b></div>
        </div>}
      </div>
      <p className="hint">Hour 1 is 00:00 to 01:00 local time. Negative parts (heat leaving to cooler spaces or the night sky) are drawn below zero.</p>
    </div>

    <div className="hr-card">
      <h3>Peak load by month <span className="muted">· kW, with margins · click a month to show its day</span></h3>
      <div className="hr-months">{monthly.map((x, k) => { const mx = Math.max(...monthly.map(z => z.kW)) || 1; return <button key={k} type="button" className={'hr-mon' + (k === m ? ' on' : '')} onClick={() => setMonth(k)}
        aria-label={`${MONTHS[k]}: ${fmt(x.kW, 2)} kW at ${hh(x.h)}`} title={`${MONTHS[k]} 21: ${fmt(x.kW, 2)} kW at ${hh(x.h)}`}>
        <span className="hr-mon-v">{fmt(x.kW, 1)}</span><span className="hr-mon-bar"><span style={{ height: (x.kW / mx * 100).toFixed(1) + '%' }} /></span><span className="hr-mon-l">{MONTHS[k]}</span><span className="hr-mon-h">{hh(x.h)}</span>
      </button>; })}</div>
    </div>

    <div className="tbl-wrap"><table className="hr-tbl hr-hours">
      <thead><tr><th>Hour</th><th>Outdoor °C</th>{LABELS.map(l => <th key={l}>{l}</th>)}<th>Margins</th><th>Total kW</th><th>Total TR</th><th>Electrical kW</th></tr></thead>
      <tbody>{H.map((x, i) => <tr key={i} className={i === pk ? 'pk' : undefined}><td>{hh(i + 1)}</td><td>{fmt(x.To, 1)}</td>{x.v.map((v, k) => <td key={k}>{fmt(v / 1000, 2)}</td>)}<td>{fmt(x.margin / 1000, 2)}</td><td><b>{fmt(x.total / 1000, 2)}</b></td><td>{fmt(x.total / 3517, 2)}</td><td>{fmt(el.kWe[i], 2)}</td></tr>)}</tbody>
    </table></div>
  </section>;
}

/* Whole-building power recommendation in summary, for the building peak month. */
export function ElectricalSummary({ d, store }: { d: Computed; store: Store }) {
  const month = d.T.blk?.m ?? 0;
  const [hover, setHover] = useState<number | null>(null);
  const loads = hours(d, 'all', month), el = electrical(d, 'all', month);
  return <ElectricalCard d={d} store={store} el={el} month={month} room={false} hover={hover} setHover={setHover} loads={loads} idPrefix="summary" />;
}

/* Whole-building efficiency and power figures in summary, for the building peak month. */
export type LoadBasis = 'room' | 'fa' | 'total';
export function ElectricalKpis({ d, basis: b }: { d: Computed; basis: LoadBasis }) {
  const month = d.T.blk?.m ?? 0, el = electrical(d, 'all', month);
  const { p, T, e } = d, sys = (p.sys || 'ducted') as SysId, q = el.q;
  const unit = SYSTEMS.find(x => x.id === sys)!, aux = num(p.aux) / 3.51685;
  /* the load picked in the totals above; every basis, fresh air included, is rated at the plant's
     outdoor design dry bulb so its efficiency matches the actual plant */
  const kW = (b === 'room' ? T.s + T.l : b === 'fa' ? (p.fahu ? T.fahuW : T.oa) : T.plant) / 1000;
  const tAct = e.To;
  const what = b === 'room' ? 'room load (excl. fresh air)' : b === 'fa' ? 'fresh air load' : 'plant load';
  /* nominal is always T1, 35 °C outdoor (ISO 5151 / AHRI). ESMA rates DX units at T3 (46 °C), so their EER is
     converted to 35 °C with the ISO 16358-1 Annex F capacity and power ratios (UAE.S 5010 Annex 2) */
  const ratedCapacityTemp = 35;
  const copA = copAt(q, tAct, unit.air), actualKWe = kW / copA + kW * aux;
  const nominalCapacity = unit.air ? kW / capRatio(tAct) : kW;
  const nominalAtRating = nominalCapacity, cop35 = copAt(q, 35, unit.air);
  const ratingInput = nominalAtRating / cop35 + aux * nominalAtRating;
  /* efficiency at each condition, from the cooling delivered per kW of input */
  const copActual = actualKWe > 0 ? kW / actualKWe : 0, copNominal = ratingInput > 0 ? nominalAtRating / ratingInput : 0;
  const auxNote = num(p.aux) > 0 ? ', including auxiliary allowance' : '';
  const rating = q.kind === 'seasonal' ? `${q.label}: ${q.metric} is seasonal, used as the 35 °C value; check the full-load rating on the product data`
    : q.t === 35 ? `${q.label}, rated at 35 °C`
    : `${q.label}: EER ${fmt(q.cop * BTU_W, 2)} at T3 ${q.t} °C → ${fmt(cop35 * BTU_W, 2)} at 35 °C (ISO 16358-1 Annex F)`;
  const eff = (cop: number) => <><div className="v">{fmt(cop * BTU_W, 2)}<small>EER</small></div><div className="s">COP {fmt(cop, 2)} · {fmt(copToKwTr(cop), 2)} kW/TR</div></>;
  return <>
    <p className="kpi-basis" aria-live="polite">Efficiency and power for the <b>{what}</b> · {fmt(kW / 3.51685, 2)} TR. Click a load above to change.</p>
    <div className="totals c3 hr-kpis">
      <div className="tot"><div className="k">Efficiency · actual, {fmt(tAct, 1)} °C outdoor</div>{eff(copActual)}</div>
      <div className="tot"><div className="k">Cooling load · actual</div><div className="v">{fmt(kW, 2)}<small>kW</small></div><div className="s">{fmt(kW / 3.51685, 2)} TR at {fmt(tAct, 1)} °C outdoor</div></div>
      <div className="tot key"><div className="k">Power required · actual</div><div className="v">{fmt(actualKWe, 2)}<small>kW</small></div><div className="s">{fmt(kW, 2)} kW cooling ÷ COP {fmt(copA, 2)}{auxNote}</div></div>
    </div>
    <div className="totals c3 hr-kpis">
      <div className="tot"><div className="k">Efficiency · nominal, T1 {ratedCapacityTemp} °C</div>{eff(copNominal)}<div className="s">{rating}</div></div>
      <div className="tot"><div className="k">Cooling capacity · nominal, {ratedCapacityTemp} °C</div><div className="v">{fmt(nominalCapacity, 2)}<small>kW</small></div><div className="s">{fmt(nominalCapacity / 3.51685, 2)} TR rated at 35 °C to deliver {fmt(kW, 2)} kW at {fmt(tAct, 1)} °C</div></div>
      <div className="tot key"><div className="k">Power required · nominal, {ratedCapacityTemp} °C</div><div className="v">{fmt(ratingInput, 2)}<small>kW</small></div><div className="s">{fmt(nominalAtRating, 2)} kW cooling ÷ COP {fmt(cop35, 2)}{auxNote}</div></div>
    </div>
  </>;
}

/* recommended efficiency, authority requirements and the electrical input of the cooling plant */
function ElectricalCard({ d, store, el, month, room, hover, setHover, loads, idPrefix }: { d: Computed; store: Store; el: ReturnType<typeof electrical>; month: number; room: boolean; hover: number | null; setHover: (hour: number | null) => void; loads: ReturnType<typeof hours>; idPrefix: string }) {
  const p = d.p, sys = (p.sys || 'ducted') as SysId, kW = el.peakKW, reqs = requirements(sys, kW), rec = recommended(sys, kW);
  const set = (k: 'sys' | 'effOpt' | 'effCop' | 'aux' | 'fahu', v: unknown) => store.update(s => { (s.project as Record<string, unknown>)[k] = v; }, 'p.' + k);
  const q = el.q, max = Math.max(...el.kWe, 0.001), W = 760, Ht = 150, ml = 44, mt = 14, mb = 22, ph = Ht - mt - mb, bw = (W - ml - 8) / 24;
  const step = (() => { const raw = max / 3, pw = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / pw; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pw; })();
  const yMax = Math.ceil(max / step) * step, y = (v: number) => mt + (yMax - v) / yMax * ph;
  const ticks: number[] = []; for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  let pk = 0; el.kWe.forEach((x, i) => { if (x > el.kWe[pk]) pk = i; });
  const fa = p.fahu ? d.T.fahuW / 1000 : 0;
  /* local authority guidance (Barjeel, ADIECC, Al Sa'fat) for DX equipment, from the efficiency step */
  const acType = sys === 'vrf' ? 'vrf' : sys === 'ducted' ? 'ducted' : sys === 'split' || sys === 'window' ? 'split' : null;
  const local = acType ? efficiencyGuidance({ ...p, acType } as Project, kW) : null;
  return <div className="hr-card">
    <h3>Electrical consumption and recommended efficiency <span className="muted">· {room ? 'this room' : 'whole building'}, room cooling load</span></h3>
    <div className="hr-filters">
      <label className="fld" htmlFor={`${idPrefix}-el-sys`}><span className="fl">Cooling system</span><span className="in-u"><select id={`${idPrefix}-el-sys`} value={sys} onChange={e => { set('sys', e.target.value); set('effOpt', ''); }}>
        {SYSTEMS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></span></label>
      <label className="fld" htmlFor={`${idPrefix}-el-fahu`}><span className="fl">Fresh air handling</span><span className="in-u"><select id={`${idPrefix}-el-fahu`} value={p.fahu ? 'fahu' : 'room'} onChange={e => set('fahu', e.target.value === 'fahu')}>
        <option value="fahu">Treated by a FAHU (separate load)</option>
        <option value="room">Handled by room units</option></select></span></label>
      <label className="fld" htmlFor={`${idPrefix}-el-eff`}><span className="fl">Efficiency used for the estimate</span><span className="in-u"><select id={`${idPrefix}-el-eff`} value={p.effOpt === 'custom' ? 'custom' : q.id} onChange={e => set('effOpt', e.target.value === rec.id ? '' : e.target.value)}>
        {reqs.map(r => <option key={r.id} value={r.id}>{r.label}: {r.metric} {r.value}{r.id === rec.id ? ' (recommended)' : ''}</option>)}
        <option value="custom">Custom: manufacturer's full-load COP at 35 °C</option></select></span></label>
      {p.effOpt === 'custom' && <label className="fld" htmlFor={`${idPrefix}-el-cop`} style={{ flex: '0 1 160px', minWidth: 140 }}><span className="fl">COP at 35 °C</span><span className="in-u"><NumInput id={`${idPrefix}-el-cop`} label="Custom COP" min={0} step={0.1} value={(p.effCop ?? '') as Num} onChange={v => set('effCop', v)} /><span className="u">W/W</span></span></label>}
      <label className="fld" htmlFor={`${idPrefix}-el-aux`} style={{ flex: '0 1 200px', minWidth: 160 }}><span className="fl">Fans, pumps, towers allowance</span><span className="in-u"><NumInput id={`${idPrefix}-el-aux`} label="Auxiliary allowance" min={0} step={0.05} value={(p.aux ?? 0) as Num} onChange={v => set('aux', v)} /><span className="u">kW/TR</span></span></label>
    </div>
    <p className="hint" style={{ marginTop: 0 }}><b>Recommended:</b> {rec.label} ({rec.metric} {rec.value}, {rec.cond}). {sys === 'split' || sys === 'window'
      ? 'ESMA star labels are mandatory for sale in the UAE; specify the highest star rating available.'
      : 'Equipment must meet the ESMA minimum (mandatory federally) and, where the project code adopts it, ASHRAE 90.1-2022; the stricter full-load value is recommended.'}</p>
    {local && <p className="hint"><b>Local authority:</b> {local.authority}: {local.target} ({local.source}). <a href={local.href} target="_blank" rel="noopener">Source</a></p>}
    <p className="hint"><b>Edition:</b> ESMA values are from UAE.S 5010-1:2019 and 5010-5:2019. Cabinet Resolution 157/2025 introduced the 2025 editions (in force November 2025, with a transition period);
      their thresholds were not publicly available to check, so confirm the current label class on the product certificate.</p>
    <h4 className="hr-sub">Electrical input by hour, {MONTHS[month]} 21 <span className="muted">· kW</span></h4>
    <p className="hint">{hover != null ? <><b>{hh(hover + 1)}:</b> {fmt(el.kWe[hover], 2)} kW electrical input for {fmt(loads[hover].total / 1000, 2)} kW cooling at {fmt(loads[hover].To, 1)} °C outdoor.</> : <>Peak at {hh(pk + 1)}: <b>{fmt(el.kWe[pk], 2)} kW</b>. Hover a bar to inspect the hour.</>}</p>
    <svg className="hr-el" onMouseLeave={() => setHover(null)} viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label={`Electrical input by hour, peak ${fmt(el.kWe[pk], 1)} kW at ${hh(pk + 1)}. Values in the table below.`}>
      {ticks.map(t => <g key={t}><line x1={ml} x2={W - 8} y1={y(t)} y2={y(t)} className={t === 0 ? 'hr-zero' : 'hr-grid'} /><text x={ml - 6} y={y(t) + 3.5} textAnchor="end" className="hr-tick">{fmt(t, step < 1 ? 1 : 0)}</text></g>)}
      {el.kWe.map((x, i) => <rect key={i} x={ml + i * bw + 2} width={bw - 4} y={y(x)} height={Math.max(0, y(0) - y(x))} rx={2} fill={i === pk || i === hover ? 'var(--accent)' : 'var(--s1)'} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} role="img" aria-label={`${hh(i + 1)} electrical input ${fmt(x, 2)} kW`}><title>{hh(i + 1)}: {fmt(x, 2)} kW</title></rect>)}
      {el.kWe.map((_, i) => (i + 1) % 3 === 0 ? <text key={'t' + i} x={ml + i * bw + bw / 2} y={Ht - 6} textAnchor="middle" className="hr-tick">{i + 1}</text> : null)}
    </svg>
    <h4 className="hr-sub">Minimum efficiency requirements for this system <span className="muted">· {fmt(kW, 1)} kW ({fmt(kW / 3.51685, 1)} TR, {fmt(kW * 1000 * BTU_W, 0)} Btu/h)</span></h4>
    <div className="tbl-wrap"><table className="hr-tbl hr-req">
      <thead><tr><th>Authority / standard</th><th>Requirement</th><th>Metric</th><th>EER Btu/h·W</th><th>COP W/W</th><th>kW/TR</th><th>Rating condition</th><th>Reference</th></tr></thead>
      <tbody>{reqs.map(r => <tr key={r.id} className={r.id === q.id ? 'pk' : undefined}>
        <td>{r.src}</td><td>{r.label}{r.id === rec.id ? <span className="pill ok" style={{ marginLeft: 6 }}>Recommended</span> : null}</td><td>{r.metric} {r.value}</td>
        <td>{fmt(r.cop * BTU_W, 2)}</td><td>{fmt(r.cop, 2)}</td><td>{fmt(copToKwTr(r.cop), 3)}</td><td>{r.cond}</td><td>{r.ref}</td></tr>)}</tbody>
    </table></div>
    <p className="hint">Electrical input = cooling load ÷ efficiency at the hour's outdoor temperature. Air-cooled equipment follows the ISO 16358-1 Annex F temperature curve
      (UAE.S 5010 Annex 2: capacity and power at 29, 35 and 46 °C); fixed-speed units (split, window, ducted DX) include cycling losses with CD = 0.27; seasonal ratings
      (SEER, IEER, IPLV, CSPF) are applied as a constant average. Annual estimate: ISO 16358 bin method on the UAE T3 reference bins ({fmt(el.binHours, 0)} h, load rising from 0 at 20 °C
      to the design load at 46 °C). ESMA label basis: rated input × 2000 h/year (UAE.S 5010-1 cl. 8). Room cooling load only{fa > 0 ? `; the FAHU fresh-air load (${fmt(fa, 1)} kW cooling) adds about ${fmt(fa / q.cop, 1)} kW electrical at the same efficiency` : ''}.
      Ratings exclude chilled-water pumps, AHU fans and cooling towers unless you add an allowance. Sources: UAE.S 5010-1:2019, UAE.S 5010-5:2019 (ESMA), ASHRAE 90.1-2022 Tables 6.8.1-1, -3, -8.</p>
  </div>;
}
