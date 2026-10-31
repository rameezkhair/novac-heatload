/* Real weather year for the hourly analysis: pick a provider, place and year, then the heat balance
   runs on every day of that year. The choice is saved with the project; the hourly data is cached in this browser. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Computed } from '../engine/calc';
import { MONTHS } from '../engine/climate';
import { LABELS, type Hour } from '../engine/hourly';
import { wbOf } from '../engine/psychro';
import { fmt, num } from '../engine/util';
import { getCached, putCached } from '../engine/weather/cache';
import { psychro, weatherKey, when } from '../engine/weather/dataset';
import { toEpw } from '../engine/weather/epw';
import { PROVIDERS, lastFullYear, providerOf } from '../engine/weather/providers';
import { simulateYear, yearSummary } from '../engine/weather/simulate';
import { UAE_PLACES } from '../engine/weather/places';
import { FIELDS, type Field, type ProviderId, type WeatherRef, type WeatherYear } from '../engine/weather/types';
import { downloadFile } from '../files';
import type { Store } from '../state/store';
import { ClimateCharts } from './ClimateCharts';
import { DayChart, hh } from './HourlySection';
import { useToast } from './ui';


type Status = { s: 'idle' | 'loading' | 'ready' | 'missing' | 'error'; msg?: string };

export function WeatherYearPanel({ d, store, sc, scopeSel }: { d: Computed; store: Store; sc: string; scopeSel: ReactNode }) {
  const p = d.p, toast = useToast();
  const place = UAE_PLACES.find(x => x.id === p.location) || UAE_PLACES[0];
  const ref = p.weather;
  const [form, setForm] = useState<WeatherRef>(() => ref ?? { provider: 'open-meteo', lat: place.lat, lon: place.lon, year: lastFullYear(), label: place.label });
  const [wx, setWx] = useState<WeatherYear | null>(null);
  const [st, setSt] = useState<Status>({ s: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const prov = providerOf(form.provider);

  /* the project's weather year, from this browser's cache */
  useEffect(() => {
    let live = true;
    if (!ref) { setWx(null); setSt({ s: 'idle' }); return; }
    getCached(weatherKey(ref)).then(w => { if (!live) return; setWx(w); setSt(w ? { s: 'ready' } : { s: 'missing' }); });
    return () => { live = false; };
  }, [ref?.provider, ref?.lat, ref?.lon, ref?.year]);

  const use = async (w: WeatherYear, r: WeatherRef) => {
    await putCached(w); setWx(w); setSt({ s: 'ready' });
    store.update(s => { s.project.weather = r; });
  };
  const load = async (r: WeatherRef) => {
    const pr = providerOf(r.provider);
    abort.current?.abort(); const ac = new AbortController(); abort.current = ac;
    setSt({ s: 'loading', msg: 'Connecting…' });
    try {
      const w = await pr.fetch(r, { elev: num(p.elev), signal: ac.signal, onProgress: msg => setSt({ s: 'loading', msg }) });
      await use(w, r); toast(`Loaded ${w.n.toLocaleString('en-US')} hours from ${pr.label}`);
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setSt({ s: wx ? 'ready' : 'idle' }); return; }
      setSt({ s: 'error', msg: (e as Error).message || 'The download failed.' });
    }
  };
  const set = (k: keyof WeatherRef, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const years: number[] = []; for (let y = lastFullYear(); y >= Math.max(prov.from, 1940); y--) years.push(y);

  return <>
    <div className="hr-card wx-src">
      <h3>Weather source</h3>
      <div className="wx-form">
        <label className="fld" htmlFor="wx-prov"><span className="fl">Provider</span><span className="in-u"><select id="wx-prov" value={form.provider} onChange={e => set('provider', e.target.value as ProviderId)}>
          {PROVIDERS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select></span></label>
          <label className="fld" htmlFor="wx-place"><span className="fl">Place</span><span className="in-u"><select id="wx-place" value={UAE_PLACES.find(x => x.lat === form.lat && x.lon === form.lon)?.id ?? 'custom'}
            onChange={e => { const x = UAE_PLACES.find(y => y.id === e.target.value); if (x) setForm(f => ({ ...f, lat: x.lat, lon: x.lon, label: x.label })); }}>
            {UAE_PLACES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}<option value="custom">Project coordinates</option>
          </select></span></label>
          <label className="fld" htmlFor="wx-lat"><span className="fl">Latitude, ° N</span><span className="in-u"><input id="wx-lat" type="number" step={0.0001} value={form.lat} onChange={e => setForm(f => ({ ...f, lat: Number(e.target.value), label: 'Project site' }))} /></span></label>
          <label className="fld" htmlFor="wx-lon"><span className="fl">Longitude, ° E</span><span className="in-u"><input id="wx-lon" type="number" step={0.0001} value={form.lon} onChange={e => setForm(f => ({ ...f, lon: Number(e.target.value), label: 'Project site' }))} /></span></label>
          <label className="fld" htmlFor="wx-year"><span className="fl">Year</span><span className="in-u"><select id="wx-year" value={form.year} onChange={e => set('year', Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select></span></label>
      </div>
      <p className="hint">{prov.note}</p>
      <div className="btns wx-btns">
        <button className="btn primary" type="button" disabled={st.s === 'loading' || !Number.isFinite(form.lat) || !Number.isFinite(form.lon)} onClick={() => load(form)}>Load {form.year} weather</button>
        {st.s === 'loading' && <button className="btn" type="button" onClick={() => abort.current?.abort()}>Cancel</button>}
        {st.s === 'missing' && ref && <button className="btn" type="button" onClick={() => load(ref)}>Download the project's saved weather again</button>}
      </div>
      <p className={'wx-status ' + st.s} role="status">
        {st.s === 'loading' && (st.msg || 'Loading…')}
        {st.s === 'error' && <>✗ {st.msg}</>}
        {st.s === 'missing' && ref && <>This project uses {providerOf(ref.provider).label}, {ref.label || `${ref.lat}, ${ref.lon}`}, {ref.year}, which is not stored in this browser. Download it again.</>}
        {st.s === 'idle' && 'No weather year loaded yet. The design days remain the basis for sizing either way.'}
      </p>
    </div>
    {wx && st.s !== 'missing' && <WeatherYearResults d={d} wx={wx} sc={sc} scopeSel={scopeSel} />}
  </>;
}

const dayName = (wx: WeatherYear, k: number) => { const w = when(wx.year, k * 24); return `${w.d} ${MONTHS[w.m]} ${wx.year}`; };

function WeatherYearResults({ d, wx, sc, scopeSel }: { d: Computed; wx: WeatherYear; sc: string; scopeSel: ReactNode }) {
  const p = d.p;
  const Y = useMemo(() => simulateYear(d, wx), [d, wx]);
  const S = useMemo(() => yearSummary(Y, wx), [Y, wx]);
  const means = useMemo(() => {
    const a = MONTHS.map(() => ({ db: 0, rh: 0, c: 0 }));
    for (let i = 0; i < wx.n; i++) { const x = a[when(wx.year, i).m]; x.db += wx.data.db![i]; x.rh += wx.data.rh![i]; x.c++; }
    return a.map(x => ({ db: x.db / x.c, rh: x.rh / x.c }));
  }, [wx]);
  const psy = psychro(wx), P = wx.data.p!;
  const e = d.e, marks = useMemo(() => [{ t: e.To, w: e.Wo, label: 'O design' }, { t: e.Tv, w: e.Wv, label: 'V fresh air' }, { t: num(p.tiDB), w: e.Wi, label: 'R room' }], [e, p.tiDB]);
  const days = wx.n / 24;
  const [day, setDay] = useState(() => Math.floor(S.pk / 24));
  const k = Math.min(day, days - 1);
  const series = sc === 'all' ? Y.v : Y.rooms[sc]?.v ?? Y.v;
  const H: Hour[] = Array.from({ length: 24 }, (_, h) => {
    const i = k * 24 + h, v = series.map(a => a[i]);
    return { v, margin: 0, total: v.reduce((a, x) => a + x, 0), To: Y.To[i] };
  });
  const designDB = num(p.toDB), tMax = Math.max(...wx.data.db!);
  let above = 0, over46 = 0, over52 = 0; wx.data.db!.forEach(t => { if (t > designDB) above++; if (t > 46) over46++; if (t > 52) over52++; });
  const pk = S.pk, pkW = when(wx.year, pk);
  const designPlant = d.T.plant;

  const csv = () => {
    const D = wx.data, cell = (v: number | undefined, dd: number) => v == null || !Number.isFinite(v) ? '' : v.toFixed(dd);
    const head = ['Date', 'Hour ending', 'Dry bulb °C', 'Wet bulb °C', 'RH %', 'Dew point °C', 'Humidity ratio g/kg', 'Enthalpy kJ/kg', 'Pressure Pa', 'GHI W/m²', 'DNI W/m²', 'DHI W/m²', 'Wind m/s', 'Wind dir °',
      'Room sensible kW', 'Room latent kW', 'Fresh air kW', 'Room units kW', 'FAHU kW', 'Plant kW', 'Plant capacity kW', 'Electrical kW'];
    const rows = [head.join(',')];
    for (let i = 0; i < wx.n; i++) {
      const w = when(wx.year, i); let sens = 0; for (let s = 0; s < 7; s++) sens += Y.v[s][i];
      rows.push([`${wx.year}-${String(w.m + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`, w.h, cell(D.db?.[i], 1), cell(psy.wb[i], 1), cell(D.rh?.[i], 0), cell(D.dp?.[i], 1), cell(psy.W[i] * 1000, 2), cell(psy.h[i], 1), cell(D.p?.[i], 0),
        cell(D.ghi?.[i], 0), cell(D.dni?.[i], 0), cell(D.dhi?.[i], 0), cell(D.ws?.[i], 1), cell(D.wd?.[i], 0),
        (sens / 1000).toFixed(3), (Y.v[7][i] / 1000).toFixed(3), (Y.oa[i] / 1000).toFixed(3), (Y.unit[i] / 1000).toFixed(3), (Y.fahu[i] / 1000).toFixed(3), (Y.plant[i] / 1000).toFixed(3), (Y.cap[i] / 1000).toFixed(3), Y.kWe[i].toFixed(3)].join(','));
    }
    downloadFile(`${(p.name || 'novac').replace(/[^\w-]+/g, '-')}-weather-${wx.year}-hourly.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
  };

  return <>
    <WeatherQuality wx={wx} solar={Y.solar} onCsv={csv} onEpw={() => downloadFile(`${wx.label.replace(/[^\w-]+/g, '-')}-${wx.year}.epw`, toEpw(wx), 'text/plain')} />
    <ClimateCharts wx={wx} marks={marks} />
    <div className="totals hr-kpis">
      <div className="tot key"><div className="k">Peak plant load, real weather</div><div className="v">{fmt(S.peakW / 3517, 2)}<small>TR</small></div><div className="s">{fmt(S.peakW / 1000, 1)} kW on {pkW.d} {MONTHS[pkW.m]} at {hh(pkW.h)}, {fmt(Y.To[pk], 1)} °C / {fmt(psy.wb[pk], 1)} °C WB</div></div>
      <div className="tot"><div className="k">Design plant load (sizing)</div><div className="v">{fmt(designPlant / 3517, 2)}<small>TR</small></div><div className="s">{designPlant > 0 ? `real-weather peak is ${fmt(S.peakW / designPlant * 100, 0)}% of design (design adds margins and code conditions)` : '–'}</div></div>
      <div className="tot"><div className="k">Annual cooling</div><div className="v">{fmt(S.coolKWh / 3.517, 0)}<small>TR·h</small></div><div className="s">{fmt(S.coolKWh / 1000, 1)} MWh of cooling delivered</div></div>
      <div className="tot"><div className="k">Annual electricity</div><div className="v">{fmt(S.elecKWh, 0)}<small>kWh</small></div><div className="s">seasonal COP {fmt(S.seasonalCop, 2)} (EER {fmt(S.seasonalCop * 3.412, 1)}), with auxiliaries</div></div>
    </div>
    <div className="derived wx-ext">
      <span>Hottest hour <b>{fmt(tMax, 1)} °C</b></span>
      <span>Hours above design {fmt(designDB, 1)} °C <b>{above}</b></span>
      <span>Hours above 46 °C (ESMA T3 rating) <b>{over46}</b></span>
      <span>Hours above 52 °C (T3 operating limit) <b className={over52 ? 'bad' : undefined}>{over52}</b></span>
      <span>Hours load exceeds plant capacity <b className={S.over ? 'bad' : undefined}>{S.over}</b></span>
    </div>

    <YearChart Y={Y} wx={wx} day={k} setDay={setDay} />

    <div className="hr-filters">{scopeSel}
      <label className="fld" htmlFor="wx-day"><span className="fl">Day</span><span className="in-u"><input id="wx-day" type="date"
        value={`${wx.year}-${String(when(wx.year, k * 24).m + 1).padStart(2, '0')}-${String(when(wx.year, k * 24).d).padStart(2, '0')}`}
        min={`${wx.year}-01-01`} max={`${wx.year}-12-31`}
        onChange={e => { const t = Date.parse(e.target.value + 'T00:00Z'); if (Number.isFinite(t)) setDay(Math.round((t - Date.UTC(wx.year, 0, 1)) / 86400000)); }} /></span></label>
      <div className="btns wx-jump"><button className="btn sm" type="button" onClick={() => setDay(Math.floor(S.pk / 24))}>Peak day</button></div>
    </div>
    <DayChart H={H} day={dayName(wx, k)} title={<>Room load by hour, {dayName(wx, k)}{sc === 'all' ? ', whole building' : ''} <span className="muted">· kW, actual weather, no margins</span></>}
      note={`Hour 1 is 00:00 to 01:00 local standard time (UTC+${wx.tz}). Fresh air is shown separately in the table: it runs while the room is occupied.`} />

    <div className="tbl-wrap"><table className="hr-tbl hr-hours">
      <thead><tr><th>Hour</th><th>DB °C</th><th>WB °C</th><th>RH %</th><th>W g/kg</th><th>GHI W/m²</th>{LABELS.map(l => <th key={l}>{l}</th>)}<th>Fresh air kW</th>{sc === 'all' && <><th>Plant kW</th><th>Capacity kW</th><th>Electrical kW</th></>}</tr></thead>
      <tbody>{H.map((x, h) => { const i = k * 24 + h, fa = sc === 'all' ? Y.oa[i] : (Y.rooms[sc]?.oa[i] ?? 0); return <tr key={h} className={i === S.pk ? 'pk' : undefined}>
        <td>{hh(h + 1)}</td><td>{fmt(x.To, 1)}</td><td>{fmt(wbOf(x.To, psy.W[i], P[i] / 1000), 1)}</td><td>{fmt(wx.data.rh![i], 0)}</td><td>{fmt(psy.W[i] * 1000, 1)}</td><td>{fmt(wx.data.ghi?.[i] ?? NaN, 0)}</td>
        {x.v.map((v, s) => <td key={s}>{fmt(v / 1000, 2)}</td>)}<td>{fmt(fa / 1000, 2)}</td>
        {sc === 'all' && <><td><b>{fmt(Y.plant[i] / 1000, 2)}</b></td><td>{fmt(Y.cap[i] / 1000, 1)}</td><td>{fmt(Y.kWe[i], 2)}</td></>}
      </tr>; })}</tbody>
    </table></div>

    <div className="tbl-wrap wx-months"><table className="hr-tbl">
      <thead><tr><th>Month</th><th>Max DB °C</th><th>Mean DB °C</th><th>Mean RH %</th><th>Peak plant kW</th><th>Peak at</th><th>Cooling MWh</th><th>Electricity kWh</th></tr></thead>
      <tbody>{S.months.map((m, i) => { const at = when(wx.year, m.peakAt);
        return <tr key={i}><td>{MONTHS[i]}</td><td>{fmt(m.tMax, 1)}</td><td>{fmt(means[i].db, 1)}</td><td>{fmt(means[i].rh, 0)}</td><td>{fmt(m.peak / 1000, 1)}</td><td>{m.peak > 0 ? `${at.d} ${MONTHS[at.m]} ${hh(at.h)}` : '–'}</td><td>{fmt(m.cool / 1000, 2)}</td><td>{fmt(m.elec, 0)}</td></tr>; })}
        <tr className="pk"><td>Year</td><td>{fmt(tMax, 1)}</td><td>{fmt(wx.data.db!.reduce((a, x) => a + x, 0) / wx.n, 1)}</td><td>{fmt(wx.data.rh!.reduce((a, x) => a + x, 0) / wx.n, 0)}</td><td>{fmt(S.peakW / 1000, 1)}</td><td>{pkW.d} {MONTHS[pkW.m]} {hh(pkW.h)}</td><td>{fmt(S.coolKWh / 1000, 2)}</td><td>{fmt(S.elecKWh, 0)}</td></tr>
      </tbody>
    </table></div>
    <p className="hint">Each day of the weather year runs through the same heat balance as the design days, as a repeating day, so heat stored in heavy walls does not carry over between days.
      Loads are actual: no safety margins and no diversity. Electricity uses the efficiency selected in step 6 with the ISO 16358-1 temperature and part-load curves, plant capacity is the design plant load rated at {fmt(designDB, 1)} °C.
      Size equipment on the design days; use the weather year to check operation, extremes and annual energy.</p>
  </>;
}

/* where the data came from and how complete it is */
function WeatherQuality({ wx, solar, onCsv, onEpw }: { wx: WeatherYear; solar: string; onCsv: () => void; onEpw: () => void }) {
  const all = Object.keys(FIELDS) as Field[], missing = all.filter(f => !wx.data[f]);
  return <div className="hr-card wx-quality">
    <h3>{wx.label} · {wx.year} <span className="muted">· {wx.n.toLocaleString('en-US')} hourly records{wx.n === 8784 ? ' (leap year)' : ''}</span></h3>
    <p className="wx-meta">{wx.source}. {fmt(wx.lat, 3)}° N, {fmt(wx.lon, 3)}° E, {fmt(wx.elev, 0)} m, UTC+{wx.tz} standard time. <span className="muted">{wx.attribution}.</span></p>
    <ul className="wx-fields">
      {all.filter(f => wx.data[f]).map(f => <li key={f} className={wx.derived[f] ? 'der' : 'ok'} title={wx.derived[f] ? 'Derived: ' + wx.derived[f] : 'Measured by the source'}>
        {wx.derived[f] ? '◐' : '●'} {FIELDS[f].label}{wx.derived[f] ? <span className="muted"> (derived {wx.derived[f]})</span> : null}{wx.filled[f] ? <span className="muted"> · {wx.filled[f]} h interpolated</span> : null}
      </li>)}
      {missing.map(f => <li key={f} className="na">○ {FIELDS[f].label} <span className="muted">not provided by this source</span></li>)}
    </ul>
    {solar === 'clear-sky' && <p className="hint">This source has no solar radiation: solar gains use the ASHRAE clear-sky model for each month, which overstates solar on cloudy or dusty days.</p>}
    <div className="btns"><button className="btn sm" type="button" onClick={onCsv}>Export hourly CSV</button><button className="btn sm" type="button" onClick={onEpw}>Export EPW (EnergyPlus)</button></div>
  </div>;
}

/* daily peak plant load across the year, with the daily maximum dry bulb; click a day to show it */
function YearChart({ Y, wx, day, setDay }: { Y: ReturnType<typeof simulateYear>; wx: WeatherYear; day: number; setDay: (k: number) => void }) {
  const days = wx.n / 24;
  const peak: number[] = [], tmax: number[] = [];
  for (let k = 0; k < days; k++) { let a = 0, t = -Infinity; for (let h = 0; h < 24; h++) { a = Math.max(a, Y.plant[k * 24 + h]); t = Math.max(t, Y.To[k * 24 + h]); } peak.push(a / 1000); tmax.push(t); }
  const W = 760, Ht = 220, ml = 44, mr = 40, mt = 14, mb = 24, pw = W - ml - mr, ph = Ht - mt - mb, bw = pw / days;
  const top = Math.max(1, ...peak), t0 = Math.floor(Math.min(...tmax) / 5) * 5, t1 = Math.ceil(Math.max(...tmax) / 5) * 5 || t0 + 5;
  const y = (v: number) => mt + ph - v / top * ph, yt = (t: number) => mt + ph - (t - t0) / (t1 - t0) * ph;
  const line = tmax.map((t, k) => (k ? 'L' : 'M') + (ml + (k + 0.5) * bw).toFixed(1) + ' ' + yt(t).toFixed(1)).join('');
  return <div className="hr-card">
    <h3>Daily peak plant load across the year <span className="muted">· kW bars, daily maximum dry bulb line (°C, right axis) · click a day</span></h3>
    <div className="hr-plot">
      <svg viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label={`Daily peak plant load for ${wx.year}, highest ${fmt(top, 1)} kW.`}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => <g key={f}><line x1={ml} x2={W - mr} y1={y(top * f)} y2={y(top * f)} className={f === 0 ? 'hr-zero' : 'hr-grid'} /><text x={ml - 6} y={y(top * f) + 3.5} textAnchor="end" className="hr-tick">{fmt(top * f, top < 10 ? 1 : 0)}</text></g>)}
        {[t0, (t0 + t1) / 2, t1].map(t => <text key={t} x={W - mr + 6} y={yt(t) + 3.5} className="hr-tick">{fmt(t, 0)}</text>)}
        {peak.map((v, k) => <rect key={k} x={ml + k * bw} width={Math.max(0.6, bw - 0.4)} y={y(v)} height={Math.max(0, mt + ph - y(v))} className={k === day ? 'wx-bar on' : 'wx-bar'} />)}
        <path d={line} className="wx-tline" fill="none" />
        {MONTHS.map((m, i) => { const k = (Date.UTC(wx.year, i, 1) - Date.UTC(wx.year, 0, 1)) / 86400000; return <text key={m} x={ml + (k + 14) * bw} y={Ht - 8} textAnchor="middle" className="hr-tick">{m}</text>; })}
        <rect x={ml} y={mt} width={pw} height={ph} fill="transparent" style={{ cursor: 'pointer' }}
          onClick={e => { const r = (e.currentTarget as SVGRectElement).getBoundingClientRect(); setDay(Math.max(0, Math.min(days - 1, Math.floor((e.clientX - r.left) / r.width * days)))); }} />
      </svg>
    </div>
  </div>;
}
