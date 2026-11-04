/* Real weather for energy modelling: load an hourly weather year from Open-Meteo (ERA5) or NASA POWER (no key needed)
   for any UAE place or coordinates. The year is cached in this browser and drives the solar and, for the weather basis,
   the hourly heat balance. */
import { useRef, useState } from 'react';
import { MONTHS } from '../engine/climate';
import { fmt } from '../engine/util';
import { putCached } from '../engine/weather/cache';
import { UAE_PLACES } from '../engine/weather/places';
import { PROVIDERS, lastFullYear, providerOf } from '../engine/weather/providers';
import type { ProviderId, WeatherRef, WeatherYear } from '../engine/weather/types';
import { useToast } from './ui';

export function EnergyWeather({ wref, wx, state, site, elev, own, onLoaded, onClear, extra }: {
  /* the weather year in force, the loaded data (null when not in this browser), and its cache state */
  wref?: WeatherRef | null; wx: WeatherYear | null; state: 'none' | 'loading' | 'ready' | 'missing';
  site: { lat: number; lon: number; label: string }; elev: number;
  /* whether the weather year is energy modelling's own (not the project's) */
  own: boolean; onLoaded: (r: WeatherRef) => void; onClear?: () => void; extra?: React.ReactNode;
}) {
  const toast = useToast();
  const [form, setForm] = useState<WeatherRef>(() => wref ?? { provider: 'open-meteo', lat: site.lat, lon: site.lon, year: lastFullYear(), label: site.label });
  const [st, setSt] = useState<{ s: 'idle' | 'loading' | 'error'; msg?: string }>({ s: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const prov = providerOf(form.provider);
  const years: number[] = []; for (let y = lastFullYear(); y >= Math.max(prov.from, 1940); y--) years.push(y);
  const load = async (r: WeatherRef) => {
    abort.current?.abort(); const ac = new AbortController(); abort.current = ac;
    setSt({ s: 'loading', msg: 'Connecting…' });
    try {
      const w = await providerOf(r.provider).fetch(r, { elev, signal: ac.signal, onProgress: msg => setSt({ s: 'loading', msg }) });
      await putCached(w); onLoaded(r); setSt({ s: 'idle' });
      toast(`Loaded ${w.n.toLocaleString('en-US')} hours of ${w.year} weather from ${providerOf(r.provider).label}`);
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setSt({ s: 'idle' }); return; }
      setSt({ s: 'error', msg: (e as Error).message || 'The download failed.' });
    }
  };
  /* summary of the loaded year */
  const sum = wx ? (() => {
    const g = wx.data.ghi, db = wx.data.db || [];
    let ghi = 0; if (g) for (const v of g) ghi += Math.max(0, v || 0);
    let tMax = -Infinity, tAt = 0; db.forEach((t, i) => { if (t > tMax) { tMax = t; tAt = i; } });
    const day = new Date(Date.UTC(wx.year, 0, 1) + Math.floor(tAt / 24) * 86400000);
    return { ghi: g ? ghi / 1000 : NaN, tMax, at: `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`, tMean: db.reduce((a, x) => a + x, 0) / (db.length || 1) };
  })() : null;

  return <div className="hr-card pw-wx">
    <h3>Real weather <span className="muted">· hourly weather year from Open-Meteo or NASA POWER, no key needed</span></h3>
    {wref && <p className={'wx-status ' + (state === 'missing' ? 'error' : 'ready')} role="status">
      {state === 'loading' ? 'Opening the weather year…'
        : state === 'missing' ? <>{providerOf(wref.provider).label}, {wref.label || `${wref.lat}, ${wref.lon}`}, {wref.year} is not stored in this browser. <button className="btn sm" type="button" onClick={() => load(wref)}>Download it again</button></>
        : wx && sum ? <>✓ <b>{wx.label} · {wx.year}</b> {own ? '(energy modelling’s own)' : '(the project’s, from Hourly analysis)'}: {wx.n.toLocaleString('en-US')} hours, mean {fmt(sum.tMean, 1)} °C, hottest {fmt(sum.tMax, 1)} °C on {sum.at}{Number.isFinite(sum.ghi) ? `, solar ${fmt(sum.ghi, 0)} kWh/m² a year on the horizontal` : ''}. <span className="muted">{wx.source}. {wx.attribution}.</span></> : null}
      {own && onClear && <> <button className="btn sm" type="button" onClick={onClear}>Use the project’s weather instead</button></>}
    </p>}
    <div className="wx-form">
      <label className="fld" htmlFor="pw-wx-prov"><span className="fl">Provider</span><span className="in-u"><select id="pw-wx-prov" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value as ProviderId }))}>
        {PROVIDERS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></span></label>
      <label className="fld" htmlFor="pw-wx-place"><span className="fl">Place</span><span className="in-u"><select id="pw-wx-place" value={UAE_PLACES.find(x => x.lat === form.lat && x.lon === form.lon)?.id ?? 'custom'}
        onChange={e => { const x = UAE_PLACES.find(y => y.id === e.target.value); if (x) setForm(f => ({ ...f, lat: x.lat, lon: x.lon, label: x.label })); }}>
        {UAE_PLACES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}<option value="custom">Coordinates</option></select></span></label>
      <label className="fld" htmlFor="pw-wx-lat"><span className="fl">Latitude, ° N</span><span className="in-u"><input id="pw-wx-lat" type="number" step={0.0001} value={form.lat} onChange={e => setForm(f => ({ ...f, lat: Number(e.target.value), label: 'Project site' }))} /></span></label>
      <label className="fld" htmlFor="pw-wx-lon"><span className="fl">Longitude, ° E</span><span className="in-u"><input id="pw-wx-lon" type="number" step={0.0001} value={form.lon} onChange={e => setForm(f => ({ ...f, lon: Number(e.target.value), label: 'Project site' }))} /></span></label>
      <label className="fld" htmlFor="pw-wx-year"><span className="fl">Year</span><span className="in-u"><select id="pw-wx-year" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}</select></span></label>
    </div>
    <p className="hint">{prov.note}</p>
    <div className="btns wx-btns">
      <button className="btn primary" type="button" disabled={st.s === 'loading' || !Number.isFinite(form.lat) || !Number.isFinite(form.lon)} onClick={() => load(form)}>Load {form.year} weather</button>
      {st.s === 'loading' && <button className="btn" type="button" onClick={() => abort.current?.abort()}>Cancel</button>}
    </div>
    {st.s !== 'idle' && <p className={'wx-status ' + (st.s === 'error' ? 'error' : 'loading')} role="status">{st.s === 'error' ? <>✗ {st.msg}</> : st.msg || 'Loading…'}</p>}
    {extra}
  </div>;
}
