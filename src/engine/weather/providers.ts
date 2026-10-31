/* Weather providers: free, open APIs that need no key and are called straight from the browser. Each adapter fetches
   one calendar year of hourly data for a point and hands the records to the Builder, which places them in
   local-standard-time hours. */
import { Builder, finish, hoursIn, slotOf } from './dataset';
import type { Field, ProviderId, WeatherRef, WeatherYear } from './types';

export interface FetchCtx { elev: number; signal?: AbortSignal; onProgress?: (msg: string) => void }
export interface Provider {
  id: ProviderId; label: string; from: number; radiation: boolean; note: string;
  fetch: (r: WeatherRef, c: FetchCtx) => Promise<WeatherYear>;
}

/* standard time offset: UAE Gulf Standard Time, elsewhere the nearest 15° meridian */
export const tzOf = (lat: number, lon: number) => lat > 22 && lat < 27 && lon > 51 && lon < 57 ? 4 : Math.round(lon / 15);
/* last calendar year with complete reanalysis data (ERA5 runs about a week behind) */
export const lastFullYear = (now = new Date()) => now.getUTCFullYear() - 1;

/* ---------- requests: one at a time, spaced, retried on rate limits and server errors ---------- */
let chain: Promise<unknown> = Promise.resolve();
/* spacing between requests and the first retry back-off, ms (tests shorten them) */
export const NET = { spacing: 250, backoff: 1000 };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
export function getJSON(url: string, signal?: AbortSignal): Promise<any> {
  const run = async () => {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      try {
        const res = await fetch(url, { signal });
        if (res.ok) return await res.json();
        const body = await res.text().catch(() => '');
        last = new Error(`${new URL(url).host} answered ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
        if (res.status !== 429 && res.status < 500) break;
      } catch (e) { if ((e as Error).name === 'AbortError') throw e; last = e; }
      await wait(NET.backoff * 2 ** attempt);
    }
    throw last instanceof Error ? last : new Error('Request failed');
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {}).then(() => wait(NET.spacing));
  return p;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const days = (year: number, from: number, to: number) => [new Date(Date.UTC(year, 0, 1 + from)), new Date(Date.UTC(year, 0, 1 + to))];

/* ---------- Open-Meteo historical (ERA5 / ERA5-Land reanalysis), no key ---------- */
const OM_VARS: [string, Field][] = [['temperature_2m', 'db'], ['relative_humidity_2m', 'rh'], ['dew_point_2m', 'dp'], ['surface_pressure', 'p'],
  ['wind_speed_10m', 'ws'], ['wind_direction_10m', 'wd'], ['wind_gusts_10m', 'wg'], ['shortwave_radiation', 'ghi'],
  ['direct_normal_irradiance', 'dni'], ['diffuse_radiation', 'dhi'], ['cloud_cover', 'cloud'], ['precipitation', 'precip']];
async function openMeteo(r: WeatherRef, c: FetchCtx): Promise<WeatherYear> {
  const tz = tzOf(r.lat, r.lon), [a, b] = days(r.year, -1, hoursIn(r.year) / 24);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${r.lat}&longitude=${r.lon}&start_date=${ymd(a)}&end_date=${ymd(b)}`
    + `&hourly=${OM_VARS.map(v => v[0]).join(',')}&timezone=GMT&timeformat=unixtime&wind_speed_unit=ms`;
  c.onProgress?.('Downloading the year from Open-Meteo…');
  const j = await getJSON(url, c.signal);
  const B = new Builder({ provider: 'open-meteo', source: 'Open-Meteo historical weather API, ERA5 / ERA5-Land reanalysis', attribution: 'Weather data by Open-Meteo.com (CC BY 4.0), Copernicus ERA5',
    lat: r.lat, lon: r.lon, elev: Number.isFinite(j.elevation) ? j.elevation : c.elev, tz, year: r.year, label: r.label || `${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}` });
  /* instantaneous values at hh:00 and radiation averaged over the preceding hour: both belong to the hour ending at hh:00 */
  (j.hourly?.time as number[] | undefined)?.forEach((t, k) => {
    const i = slotOf(r.year, tz, t, 'end');
    OM_VARS.forEach(([v, f]) => B.put(f, i, f === 'p' ? j.hourly[v]?.[k] * 100 : j.hourly[v]?.[k]));
  });
  return finish(B);
}

/* ---------- NASA POWER hourly (MERRA-2 meteorology, CERES / GEOS radiation), no key ---------- */
const NP_VARS: [string, Field, number][] = [['T2M', 'db', 1], ['RH2M', 'rh', 1], ['T2MDEW', 'dp', 1], ['PS', 'p', 1000], ['WS10M', 'ws', 1], ['WD10M', 'wd', 1],
  ['ALLSKY_SFC_SW_DWN', 'ghi', 1], ['ALLSKY_SFC_SW_DNI', 'dni', 1], ['ALLSKY_SFC_SW_DIFF', 'dhi', 1], ['PRECTOTCORR', 'precip', 1], ['CLOUD_AMT', 'cloud', 1]];
async function nasaPower(r: WeatherRef, c: FetchCtx): Promise<WeatherYear> {
  const tz = tzOf(r.lat, r.lon), [a, b] = days(r.year, -1, hoursIn(r.year) / 24), d8 = (d: Date) => ymd(d).replace(/-/g, '');
  const url = `https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=${NP_VARS.map(v => v[0]).join(',')}&community=RE`
    + `&longitude=${r.lon}&latitude=${r.lat}&start=${d8(a)}&end=${d8(b)}&format=JSON&time-standard=UTC`;
  c.onProgress?.('Downloading the year from NASA POWER…');
  const j = await getJSON(url, c.signal), par = j.properties?.parameter || {};
  const B = new Builder({ provider: 'nasa-power', source: 'NASA POWER hourly API (MERRA-2, CERES / GEOS-IT)', attribution: 'NASA Langley Research Center POWER Project',
    lat: r.lat, lon: r.lon, elev: Number.isFinite(j.geometry?.coordinates?.[2]) ? j.geometry.coordinates[2] : c.elev, tz, year: r.year, label: r.label || `${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}` });
  NP_VARS.forEach(([v, f, k]) => Object.entries(par[v] || {}).forEach(([stamp, val]) => {
    const s = String(stamp), sec = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10)) / 1000;
    /* hourly means labelled with the start of the hour; -999 is NASA's missing value */
    if (Number(val) > -998) B.put(f, slotOf(r.year, tz, sec, 'start'), Number(val) * k);
  }));
  return finish(B);
}

export const PROVIDERS: Provider[] = [
  { id: 'open-meteo', label: 'Open-Meteo historical (ERA5 reanalysis)', from: 1940, radiation: true, fetch: openMeteo,
    note: 'Hourly reanalysis on a 9–25 km grid, any year from 1940. Free, no key. Coastal and urban sites can read slightly cooler and more humid than airport stations.' },
  { id: 'nasa-power', label: 'NASA POWER (MERRA-2 / CERES)', from: 2001, radiation: true, fetch: nasaPower,
    note: 'Hourly reanalysis on a 0.5° grid with satellite solar radiation, from 2001. Free, no key. Coarser grid than Open-Meteo.' },
];
export const providerOf = (id: string) => PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
