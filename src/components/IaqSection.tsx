/* Step 8: indoor air quality. Ventilation (ASHRAE 62.1 Ventilation Rate Procedure), contaminant mass balance and
   filtration, all on the project's own rooms, outdoor air and air systems. Applying the ventilation result writes
   each room's fresh air, so the cooling loads, FAHU and plant follow. */
import { useEffect, useMemo, useState } from 'react';
import type { Computed } from '../engine/calc';
import { MONTHS } from '../engine/climate';
import { CONTAMINANTS, FILTERS, SIZE_SPLIT, type ContId, type Contaminant } from '../engine/iaq/data';
import { DEFAULT_FILTERS, assess, contaminants, designDay, roomAir, simulate } from '../engine/iaq/contaminants';
import { filtration } from '../engine/iaq/filtration';
import { vrp, type Vrp } from '../engine/iaq/ventilation';
import type { IaqSettings, Num } from '../engine/types';
import { fmt, num } from '../engine/util';
import { airKey, fetchAirYear, type AirYear } from '../engine/weather/airquality';
import { getCached, putCached } from '../engine/weather/cache';
import { lastFullYear } from '../engine/weather/providers';
import { placeOf } from '../engine/weather/places';
import type { Store } from '../state/store';
import { NumInput, Pill, SecHead, useToast } from './ui';

type Tab = 'vent' | 'cont' | 'filt';
const setIaq = (store: Store, k: keyof IaqSettings, v: unknown) => store.update(s => { ((s.project.iaq ??= {}) as Record<string, unknown>)[k] = v; }, 'iaq.' + k);

export function IaqSection({ d, store }: { d: Computed; store: Store }) {
  const [tab, setTab] = useState<Tab>('vent');
  const tabs: [Tab, string][] = [['vent', 'Ventilation'], ['cont', 'Contaminants'], ['filt', 'Filtration']];
  if (!d.rooms.length) return <section><SecHead title="Indoor air quality" /><p className="hint">Add a room in Spaces to design its ventilation and air quality.</p></section>;
  return <section className="iaq">
    <SecHead title="Indoor air quality" sub="Ventilation to ASHRAE 62.1, indoor contaminant levels and filtration, on the project's rooms and air systems" />
    <div className="cl-tabs iaq-tabs" role="tablist">{tabs.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{l}</button>)}</div>
    {tab === 'vent' && <Ventilation d={d} store={store} />}
    {tab === 'cont' && <Contaminants d={d} store={store} />}
    {tab === 'filt' && <Filtration d={d} store={store} />}
    <p className="hint iaq-disc">These are design calculations against the criteria shown, each with its source. They are not a certificate of compliance: confirm the applicable standard editions, authority requirements and manufacturer data for the project.</p>
  </section>;
}

/* ---------- ventilation ---------- */
const L = (v: number, dd = 1) => fmt(v, dd);
function Ventilation({ d, store }: { d: Computed; store: Store }) {
  const v = useMemo(() => vrp(d), [d]), set = d.p.iaq || {}, toast = useToast();
  /* fresh air is written to 0.1 L/s */
  const r1 = (x: number) => Math.round(x * 10) / 10, differs = v.zones.some(z => r1(z.current) !== r1(z.required));
  const apply = () => {
    store.update(s => { s.rooms.forEach(r => { const z = v.zones.find(x => x.id === r.id); if (z) { if (r.src.oa !== 'custom') r.src.oaBasis = r.src.oa; r.oa = r1(z.required); r.src.oa = 'custom'; } }); });
    toast(`Fresh air updated in ${v.zones.length} room${v.zones.length > 1 ? 's' : ''}: ${L(v.Vot)} L/s system intake`);
  };
  const people = v.sumPz, area = v.zones.reduce((a, z) => a + z.Az * z.qty, 0);
  return <>
    <div className="groups">
      <fieldset><legend>System</legend><div className="fgrid">
        <label className="fld wide" htmlFor="iaq-sys"><span className="fl">Ventilation system type</span><span className="in-u src-sel"><select id="iaq-sys" value={set.sys || 'auto'} onChange={e => setIaq(store, 'sys', e.target.value)}>
          <option value="auto">Automatic: {v.sys === 'doas' ? '100% outdoor air (FAHU)' : v.sys === 'single' ? 'single zone' : 'multiple-zone recirculating'}</option>
          <option value="doas">100% outdoor air system (FAHU / DOAS)</option>
          <option value="single">Single-zone system</option>
          <option value="multi">Multiple-zone recirculating system</option>
        </select></span></label>
        {v.sys === 'multi' && <label className="fld wide" htmlFor="iaq-ev"><span className="fl">System ventilation efficiency, Ev</span><span className="in-u src-sel"><select id="iaq-ev" value={set.ev || 'simplified'} onChange={e => setIaq(store, 'ev', e.target.value)}>
          <option value="simplified">Simplified procedure, §6.2.4.3.1</option><option value="appendix">Normative Appendix A, lowest zone Evz</option>
        </select></span></label>}
        <div className="fld"><label className="fl" htmlFor="iaq-enh">Enhanced ventilation above minimum</label><span className="in-u"><NumInput id="iaq-enh" value={set.enh ?? ''} step={5} min={0} onChange={x => setIaq(store, 'enh', x)} /><span className="u">%</span></span></div>
        <div className="fld"><span className="fl">Air distribution effectiveness, Ez</span><span className="in-u"><NumInput value={num(d.p.ez) || 1} readOnly label="Ez, from Building envelope" /></span></div>
      </div><p className="hint">{v.sysWhy}. Ez is set in Building envelope; people, areas and the outdoor air category of each room come from Spaces.</p></fieldset>
    </div>

    <div className="totals hr-kpis iaq-kpis">
      <div className="tot key"><div className="k">System outdoor air intake, Vot</div><div className="v">{L(v.Vot, 0)}<small>L/s</small></div><div className="s">{people > 0 ? `${L(v.Vot / people)} L/s per person` : ''}{area > 0 ? ` · ${fmt(v.Vot / area, 2)} L/s·m²` : ''}</div></div>
      <div className="tot"><div className="k">Rooms' fresh air now</div><div className="v">{L(v.current, 0)}<small>L/s</small></div><div className="s">{differs ? <span className="warn">differs from the calculation</span> : 'matches the calculation'}</div></div>
      <div className="tot"><div className="k">{v.sys === 'multi' ? 'Ventilation efficiency, Ev' : 'Occupant diversity, D'}</div><div className="v">{v.sys === 'multi' ? fmt(v.Ev, 2) : fmt(v.D, 2)}</div><div className="s">{v.sys === 'multi' ? `D = ${fmt(v.D, 2)}, ${set.ev === 'appendix' ? 'Appendix A' : 'simplified'}` : `peak ${L(v.Ps, 0)} of ${L(v.sumPz, 0)} people`}</div></div>
      <div className="tot"><div className="k">Exhaust and make-up air</div><div className="v">{L(v.exhaust, 0)}<small>L/s exhaust</small></div><div className="s">{v.makeup > 0 ? <span className="warn">make-up air {L(v.makeup, 0)} L/s needed</span> : `building ${v.net >= 0 ? 'pressurised' : 'depressurised'} by ${L(Math.abs(v.net), 0)} L/s`}</div></div>
    </div>

    <div className="tbl-wrap"><table className="hr-tbl iaq-zones">
      <thead><tr><th>Zone</th><th>Outdoor air basis</th><th>Pz people</th><th>Az m²</th><th>Rp L/s·p</th><th>Ra L/s·m²</th><th>Vbz L/s</th><th>Ez</th><th>Voz L/s</th>
        {v.sys === 'multi' && <><th>Vpz L/s</th><th>Zpz</th>{set.ev === 'appendix' && <th>Evz</th>}</>}<th>Required L/s</th><th>Fresh air now L/s</th><th>Exhaust L/s</th></tr></thead>
      <tbody>{v.zones.map(z => <tr key={z.id}>
        <td>{z.name}{z.qty > 1 ? ` ×${z.qty}` : ''}</td><td className="iaq-basis">{z.basis}</td><td>{L(z.Pz)}</td><td>{L(z.Az)}</td>
        <td>{z.method === '62.1' ? fmt(z.Rp, 1) : '–'}</td><td>{z.method === '62.1' ? fmt(z.Ra, 2) : '–'}</td><td>{L(z.Vbz)}</td><td>{fmt(z.Ez, 2)}</td><td>{L(z.Voz)}</td>
        {v.sys === 'multi' && <><td>{L(z.Vpz)}</td><td>{fmt(z.Zpz, 2)}</td>{set.ev === 'appendix' && <td>{fmt(z.Evz ?? 1, 2)}</td>}</>}
        <td><b>{L(z.required)}</b></td><td className={r1(z.current) < r1(z.required) ? 'bad' : undefined}>{L(z.current)}</td>
        <td><span className="in-u iaq-exh"><NumInput value={d.rooms.find(r => r.id === z.id)?.exh ?? ''} step={5} min={0} label={`Exhaust from ${z.name}, L/s`}
          onChange={x => store.update(s => { const r = s.rooms.find(r => r.id === z.id); if (r) r.exh = x; }, 'exh.' + z.id)} /></span></td>
      </tr>)}</tbody>
    </table></div>
    <div className="btns iaq-apply">
      <button className="btn primary" type="button" disabled={!differs} onClick={apply}>Apply required fresh air to the rooms</button>
      <span className="hint">{differs ? 'Writes each room\'s required outdoor air into Spaces; cooling loads, FAHU and plant recalculate.' : 'Each room already has its required fresh air.'}</span>
    </div>
    <VrpSteps v={v} />
  </>;
}

function VrpSteps({ v }: { v: Vrp }) {
  const ex = v.zones.find(z => z.method === '62.1');
  return <details className="iaq-steps" open>
    <summary>Calculation steps · {v.ref}</summary>
    <ol>
      {ex && <li>Breathing zone, each zone (Eq. 6-1): Vbz = Rp × Pz + Ra × Az. {ex.name}: {fmt(ex.Rp, 1)} × {L(ex.Pz)} + {fmt(ex.Ra, 2)} × {L(ex.Az)} = <b>{L(ex.Vbz)} L/s</b>.</li>}
      {ex && <li>Zone outdoor air (Eq. 6-2): Voz = Vbz / Ez = {L(ex.Vbz)} / {fmt(ex.Ez, 2)} = <b>{L(ex.Voz)} L/s</b>.</li>}
      <li>Rooms on other standards use their own rate: ASHRAE 62.2 dwellings 0.15 L/s·m² + 3.5 L/s per occupant; ASHRAE 170 healthcare outdoor air changes per hour.</li>
      {v.sys === 'doas' && <li>100% outdoor air system (§6.2.4.2): Vot = Σ Voz = <b>{L(v.sumVoz)} L/s</b>.</li>}
      {v.sys === 'single' && <li>Single-zone system (§6.2.4.1): Vot = Voz = <b>{L(v.sumVoz)} L/s</b>.</li>}
      {v.sys === 'multi' && <>
        <li>Occupant diversity: D = Ps / Σ Pz = {L(v.Ps)} / {L(v.sumPz)} = {fmt(v.D, 2)}, with Ps the peak coincident population from the room schedules.</li>
        <li>Uncorrected outdoor air (Eq. 6-6): Vou = D × Σ(Rp × Pz) + Σ(Ra × Az) = <b>{L(v.Vou)} L/s</b>.</li>
        {v.method === 'appendix'
          ? <li>Appendix A: Xs = Vou / Vps = {L(v.Vou)} / {L(v.Vps)} = {fmt(v.Xs, 2)}; each zone Evz = 1 + Xs − Zpz; Ev = lowest Evz = <b>{fmt(v.Ev, 2)}</b>. Vpz is the room's design supply air; use the minimum primary airflow for VAV.</li>
          : <li>Simplified procedure (§6.2.4.3.1): Ev = {v.D < 0.6 ? `0.88 × ${fmt(v.D, 2)} + 0.22` : '0.75 (D ≥ 0.60)'} = <b>{fmt(v.Ev, 2)}</b>.</li>}
        <li>Outdoor air intake: Vot = Vou / Ev = <b>{L(v.Vou / v.Ev)} L/s</b>.</li>
      </>}
      {v.enh > 0 && <li>Enhanced ventilation: Vot × (1 + {fmt(v.enh, 0)}%) = <b>{L(v.Vot)} L/s</b>.</li>}
      <li>Each room's required fresh air is its Voz scaled so that the rooms add up to Vot.</li>
      <li>Air balance: exhaust {L(v.exhaust)} L/s against intake {L(v.Vot)} L/s, {v.makeup > 0 ? `make-up air ${L(v.makeup)} L/s` : `net ${v.net >= 0 ? 'pressurisation' : 'depressurisation'} ${L(Math.abs(v.net))} L/s`}.</li>
    </ol>
  </details>;
}

/* ---------- contaminants ---------- */
function Contaminants({ d, store }: { d: Computed; store: Store }) {
  const p = d.p, cs = useMemo(() => contaminants(p), [p]), toast = useToast();
  const [roomId, setRoomId] = useState(d.rooms[0].id);
  const [sel, setSel] = useState<ContId>('pm25');
  const room = d.rooms.find(r => r.id === roomId) || d.rooms[0];
  /* outdoor: typical constants, or an hourly year at the project's weather location */
  const place = p.weather ? { lat: p.weather.lat, lon: p.weather.lon, label: p.weather.label || 'Project site' } : placeOf(p.location);
  const [year, setYear] = useState(() => p.weather?.year ?? lastFullYear());
  const [aq, setAq] = useState<AirYear | null>(null), [st, setSt] = useState('');
  useEffect(() => { let live = true; getCached<AirYear>(airKey(place.lat, place.lon, year)).then(a => { if (live) setAq(a); }); return () => { live = false; }; }, [place.lat, place.lon, year]);
  const load = async () => {
    setSt('Downloading…');
    try { const a = await fetchAirYear(place.lat, place.lon, year, place.label); await putCached(a); setAq(a); setSt(''); toast(`Loaded ${a.n.toLocaleString('en-US')} hours of outdoor air quality`); }
    catch (e) { setSt('✗ ' + (e as Error).message); }
  };
  const rows = useMemo(() => cs.map(c => {
    const a = roomAir(d, room, c), hourly = aq?.data[c.id];
    const x = hourly ? simulate(c, a, hourly, 0) : designDay(c, a), outMean = hourly ? hourly.reduce((s, v) => s + v, 0) / hourly.length : c.out;
    return { c, a, x, outMean, r: assess(c, x), hourly: !!hourly };
  }), [cs, d, room, aq]);
  const cur = rows.find(r => r.c.id === sel) || rows[0];
  const years: number[] = []; for (let y = lastFullYear(); y >= 2023; y--) years.push(y);
  return <>
    <div className="hr-filters">
      <label className="fld" htmlFor="iaq-room"><span className="fl">Room</span><span className="in-u"><select id="iaq-room" value={room.id} onChange={e => setRoomId(e.target.value)}>
        {d.rooms.map(r => <option key={r.id} value={r.id}>{r.name || 'Untitled'}</option>)}</select></span></label>
      <label className="fld" htmlFor="iaq-aqyear"><span className="fl">Outdoor air quality, {place.label}</span><span className="in-u"><select id="iaq-aqyear" value={year} onChange={e => setYear(Number(e.target.value))}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}</select></span></label>
      <div className="btns wx-jump"><button className="btn sm" type="button" onClick={load} disabled={st === 'Downloading…'}>{aq ? 'Reload' : 'Load'} hourly {year}</button></div>
    </div>
    <p className={'wx-status' + (st.startsWith('✗') ? ' error' : '')} role="status">{st || (aq ? `Hourly outdoor data: ${aq.source}, ${aq.n.toLocaleString('en-US')} hours. ${aq.attribution}.` : 'Outdoor levels: typical values from the table below (a repeating design day). Load an hourly year for the site to run all 8,760 hours.')}</p>
    <p className="hint">Airflows for {room.name || 'this room'}: fresh air {L(cur.a.Qoa / 3.6)} L/s, infiltration {L(cur.a.Qinf / cur.a.V, 2)} ACH, recirculated {L(cur.a.Qrec / 3.6)} L/s, volume {L(cur.a.V, 0)} m³, {L(Math.max(...cur.a.people))} people at peak.</p>

    <div className="tbl-wrap"><table className="hr-tbl iaq-cont">
      <thead><tr><th>Contaminant</th><th>Outdoor mean</th><th>Indoor mean</th><th>Indoor worst (averaging)</th><th>Criterion</th><th>Indoor / outdoor</th><th>Over criterion</th><th>Result</th></tr></thead>
      <tbody>{rows.map(({ c, x, outMean, r }) => <tr key={c.id} className={c.id === sel ? 'pk' : undefined} onClick={() => setSel(c.id)} style={{ cursor: 'pointer' }}>
        <td>{c.label}</td><td>{fmt(outMean, c.unit === 'ppm' ? 0 : 1)} {c.unit}</td><td>{fmt(r.mean, c.unit === 'ppm' ? 0 : 1)}</td><td>{fmt(r.worst, c.unit === 'ppm' ? 0 : 1)} ({c.avg})</td>
        <td>{c.limit == null ? '–' : `${fmt(c.limit, 0)} ${c.unit}`}</td><td>{outMean > 0 ? fmt(r.mean / outMean, 2) : '–'}</td><td>{c.limit == null ? '–' : `${r.over.toLocaleString('en-US')} ${c.avg === '24h' ? 'days' : 'h'}`}</td>
        <td>{c.indicator ? <Pill s="na">Ventilation indicator</Pill> : r.ok == null ? <Pill s="na">No criterion</Pill> : r.ok ? <Pill s="ok">Within criterion</Pill> : <Pill s="bad">Exceeds criterion</Pill>}</td>
      </tr>)}</tbody>
    </table></div>
    <ContChart row={cur} aq={aq} />
    <ContData d={d} store={store} cs={cs} />
  </>;
}

function ContChart({ row, aq }: { row: { c: Contaminant; x: Float64Array; hourly: boolean }; aq: AirYear | null }) {
  const { c, x } = row;
  /* a design day shows 24 hours; a year shows daily means */
  const series = row.hourly ? Array.from({ length: x.length / 24 }, (_, k) => { let s = 0; for (let h = 0; h < 24; h++) s += x[k * 24 + h]; return s / 24; }) : Array.from(x);
  const out = row.hourly && aq?.data[c.id] ? Array.from({ length: x.length / 24 }, (_, k) => { let s = 0; for (let h = 0; h < 24; h++) s += aq.data[c.id]![k * 24 + h]; return s / 24; }) : series.map(() => c.out);
  const W = 760, H = 220, ml = 50, mr = 10, mt = 14, mb = 26, n = series.length;
  const top = Math.max(1, ...series, ...out, c.limit ?? 0) * 1.1;
  const X = (i: number) => ml + (i + 0.5) / n * (W - ml - mr), Y = (v: number) => mt + (1 - v / top) * (H - mt - mb);
  const path = (a: number[]) => a.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
  return <div className="hr-card">
    <h3>{c.label}, {row.hourly ? `daily mean through ${aq?.year}` : 'design day'} <span className="muted">· {c.unit} · indoor solid, outdoor dashed{c.limit != null ? ', criterion red' : ''}</span></h3>
    <div className="hr-plot"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.label} indoor and outdoor ${row.hourly ? 'daily means' : 'hourly profile'}`}>
      {[0, 0.5, 1].map(f => <g key={f}><line x1={ml} x2={W - mr} y1={Y(top * f)} y2={Y(top * f)} className={f === 0 ? 'hr-zero' : 'hr-grid'} /><text x={ml - 6} y={Y(top * f) + 3.5} textAnchor="end" className="hr-tick">{fmt(top * f, top < 10 ? 1 : 0)}</text></g>)}
      {c.limit != null && <line x1={ml} x2={W - mr} y1={Y(c.limit)} y2={Y(c.limit)} className="iaq-limit" />}
      <path d={path(out)} fill="none" className="iaq-out" /><path d={path(series)} fill="none" className="iaq-in" />
      {row.hourly ? MONTHS.map((m, i) => { const k = (Date.UTC(aq!.year, i, 1) - Date.UTC(aq!.year, 0, 1)) / 86400000; return <text key={m} x={X(k + 14)} y={H - 8} textAnchor="middle" className="hr-tick">{m}</text>; })
        : series.map((_, i) => (i + 1) % 3 === 0 ? <text key={i} x={X(i)} y={H - 8} textAnchor="middle" className="hr-tick">{i + 1}</text> : null)}
    </svg></div>
    <p className="hint">Generation: {c.genSrc}. Indoor loss: {c.dep} /h ({c.depSrc}). Criterion: {c.limitSrc}.{c.kind.startsWith('pm') ? ' ' + SIZE_SPLIT + '.' : ''}{c.indicator ? ' CO₂ shows ventilation per person; it is not an air-quality compliance metric.' : ''}</p>
  </div>;
}

type ContKey = 'genP' | 'genA' | 'dep' | 'pen' | 'out' | 'limit';
function ContData({ d, store, cs }: { d: Computed; store: Store; cs: Contaminant[] }) {
  const o = d.p.iaq?.cont || {};
  const set = (id: string, k: ContKey, v: Num) => store.update(s => { const q = ((s.project.iaq ??= {}).cont ??= {}); (q[id] ??= {})[k] = v; }, `cont.${id}.${k}`);
  const cell = (c: Contaminant, k: ContKey, step: number) => {
    const base = CONTAMINANTS.find(x => x.id === c.id)![k];
    return <td><span className="in-u"><NumInput value={o[c.id]?.[k] ?? (base ?? '')} step={step} label={`${c.label} ${k}`} onChange={v => set(c.id, k, v)} /></span></td>;
  };
  return <details className="iaq-data"><summary>Reference data and project overrides</summary>
    <div className="tbl-wrap"><table className="hr-tbl">
      <thead><tr><th>Contaminant</th><th>Per person ({'CO₂ L/s, others µg/h'})</th><th>Per area µg/m²·h</th><th>Indoor loss /h</th><th>Infiltration penetration</th><th>Outdoor (typical)</th><th>Criterion</th></tr></thead>
      <tbody>{cs.map(c => <tr key={c.id}><td>{c.label} <span className="muted">{c.unit}</span></td>{cell(c, 'genP', c.id === 'co2' ? 0.0001 : 1)}{cell(c, 'genA', 1)}{cell(c, 'dep', 0.05)}{cell(c, 'pen', 0.05)}{cell(c, 'out', 1)}{cell(c, 'limit', 1)}</tr>)}</tbody>
    </table></div>
    <p className="hint">Replace defaults with licensed standard values, measured outdoor data, or material emission test results; each default's source is listed under the chart when the contaminant is selected.</p>
  </details>;
}

/* ---------- filtration ---------- */
function Filtration({ d, store }: { d: Computed; store: Store }) {
  const f = useMemo(() => filtration(d), [d]), set = d.p.iaq || {};
  const pm = ['pm1', 'pm25', 'pm10', 'o3', 'tvoc', 'hcho'] as const;
  const label = (id: string) => CONTAMINANTS.find(c => c.id === id)!.label.replace(/ \(.*\)/, '');
  return <>
    <div className="groups">
      <fieldset><legend>Filter stages</legend><div className="fgrid">
        {f.stages.map(s => <label key={s.key} className="fld wide" htmlFor={'iaq-' + s.key}><span className="fl">{s.label}</span><span className="in-u src-sel">
          <select id={'iaq-' + s.key} value={set[s.key] ?? DEFAULT_FILTERS[s.key]} onChange={e => setIaq(store, s.key, e.target.value)}>{FILTERS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></span></label>)}
        <div className="fld"><label className="fl" htmlFor="iaq-fan">Fan total efficiency</label><span className="in-u"><NumInput id="iaq-fan" value={set.fanEff ?? 60} step={5} onChange={x => setIaq(store, 'fanEff', x)} /><span className="u">%</span></span></div>
        <div className="fld"><label className="fl" htmlFor="iaq-hrs">Fan operating hours</label><span className="in-u"><NumInput id="iaq-hrs" value={set.hours ?? 8760} step={100} onChange={x => setIaq(store, 'hours', x)} /><span className="u">h/yr</span></span></div>
      </div><p className="hint">{d.p.fahu ? 'FAHU: outdoor air through the FAHU pre- and final filters; the room units filter recirculated air.' : 'No FAHU: outdoor and return air mix ahead of the unit filters.'} Airflows come from the ventilation calculation and the room supply air.</p></fieldset>
    </div>
    <div className="totals hr-kpis iaq-kpis">
      <div className="tot key"><div className="k">Filter fan power, average pressure drop</div><div className="v">{fmt(f.kW, 2)}<small>kW</small></div><div className="s">at {fmt(f.fanEff * 100, 0)}% fan efficiency</div></div>
      <div className="tot"><div className="k">Annual filter fan energy</div><div className="v">{fmt(f.kWh, 0)}<small>kWh</small></div><div className="s">{fmt(f.hours, 0)} h a year</div></div>
      <div className="tot"><div className="k">Outdoor air PM2.5 removal</div><div className="v">{fmt((1 - f.stages.filter(s => s.key !== 'fRec').reduce((a, s) => a * (1 - s.eff.pm25), 1)) * 100, 0)}<small>%</small></div><div className="s">pre and final in series</div></div>
      <div className="tot"><div className="k">Filter cells, 610 × 610 mm</div><div className="v">{f.stages.reduce((a, s) => a + s.cells, 0)}</div><div className="s">all stages</div></div>
    </div>
    <div className="tbl-wrap"><table className="hr-tbl iaq-filt">
      <thead><tr><th>Stage</th><th>Filter</th><th>Airflow L/s</th><th>Face area m²</th><th>Cells</th><th>Face velocity m/s</th><th>ΔP clean / final / avg Pa</th><th>Fan kW</th><th>kWh/yr</th>{pm.map(id => <th key={id}>{label(id)} %</th>)}<th>Change</th></tr></thead>
      <tbody>{f.stages.map(s => <tr key={s.key}><td>{s.label}</td><td>{s.f.label}</td><td>{fmt(s.Q, 0)}</td><td>{fmt(s.area, 2)}</td><td>{s.cells}</td><td>{fmt(s.vFace, 2)} <span className="muted">/ {fmt(s.f.v, 1)}</span></td>
        <td>{fmt(s.dp0, 0)} / {fmt(s.dpF, 0)} / {fmt(s.dpAvg, 0)}</td><td>{fmt(s.kW, 3)}</td><td>{fmt(s.kWh, 0)}</td>{pm.map(id => <td key={id}>{fmt(s.eff[id] * 100, 0)}</td>)}<td className="iaq-basis">{s.f.life}</td></tr>)}</tbody>
    </table></div>
    <FilterData d={d} store={store} />
    <p className="hint">Efficiencies: particle values are the ASHRAE 52.2 minimum composite efficiencies for each MERV (real filters often do better; enter tested values); {SIZE_SPLIT.toLowerCase()}. Pressure drops and gas-phase efficiencies are typical catalogue values: replace with manufacturer data. Fan power = airflow × average pressure drop / fan efficiency; the clean pressure drop is scaled to the actual face velocity.</p>
  </>;
}

type FiltKey = 'e1' | 'e2' | 'e3' | 'dp0' | 'dpF' | 'v';
function FilterData({ d, store }: { d: Computed; store: Store }) {
  const o = d.p.iaq?.filt || {};
  const set = (id: string, k: FiltKey, v: Num) => store.update(s => { const q = ((s.project.iaq ??= {}).filt ??= {}); (q[id] ??= {})[k] = v; }, `filt.${id}.${k}`);
  return <details className="iaq-data"><summary>Filter data and manufacturer overrides</summary>
    <div className="tbl-wrap"><table className="hr-tbl">
      <thead><tr><th>Filter</th><th>E1 0.3–1 µm %</th><th>E2 1–3 µm %</th><th>E3 3–10 µm %</th><th>ΔP clean Pa</th><th>ΔP final Pa</th><th>Design face velocity m/s</th><th>Source</th></tr></thead>
      <tbody>{FILTERS.filter(x => x.id !== 'none').map(x => <tr key={x.id}><td>{x.label}</td>
        {(['e1', 'e2', 'e3', 'dp0', 'dpF', 'v'] as FiltKey[]).map(k => <td key={k}><span className="in-u"><NumInput value={o[x.id]?.[k] ?? x[k]} step={k === 'v' ? 0.1 : 1} label={`${x.label} ${k}`} onChange={v => set(x.id, k, v)} /></span></td>)}
        <td className="iaq-basis">{x.eSrc}{x.gasSrc ? `; gases: ${x.gasSrc}` : ''}</td></tr>)}</tbody>
    </table></div>
  </details>;
}

