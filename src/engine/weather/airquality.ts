/* Hourly outdoor air quality for one calendar year from the Open-Meteo Air Quality API (CAMS global atmospheric
   composition forecasts and reanalysis; free, no key). Records are placed in the same hour-ending local-standard-time
   slots as the weather year, so both line up hour for hour. */
import type { ContId } from '../iaq/data';
import { hoursIn, slotOf } from './dataset';
import { getJSON, tzOf, type FetchCtx } from './providers';

export interface AirYear {
  key: string; lat: number; lon: number; year: number; tz: number; n: number; label: string;
  /* hourly series in the contaminant's unit (ppm for CO₂, µg/m³ otherwise); absent = not provided */
  data: Partial<Record<ContId, number[]>>;
  filled: Partial<Record<ContId, number>>;
  source: string; attribution: string; retrieved: string;
}
const VARS: [string, ContId][] = [['pm2_5', 'pm25'], ['pm10', 'pm10'], ['carbon_monoxide', 'co'], ['nitrogen_dioxide', 'no2'], ['ozone', 'o3'], ['carbon_dioxide', 'co2']];
export const airKey = (lat: number, lon: number, year: number) => `aq:${lat.toFixed(3)},${lon.toFixed(3)}:${year}`;

export async function fetchAirYear(lat: number, lon: number, year: number, label: string, c: Pick<FetchCtx, 'signal' | 'onProgress'> = {}): Promise<AirYear> {
  const tz = tzOf(lat, lon), n = hoursIn(year);
  const a = new Date(Date.UTC(year, 0, 0)).toISOString().slice(0, 10), b = new Date(Date.UTC(year + 1, 0, 1)).toISOString().slice(0, 10);
  c.onProgress?.('Downloading outdoor air quality from Open-Meteo…');
  const j = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&start_date=${a}&end_date=${b}`
    + `&hourly=${VARS.map(v => v[0]).join(',')}&timezone=GMT&timeformat=unixtime`, c.signal);
  const data: AirYear['data'] = {}, filled: AirYear['filled'] = {};
  VARS.forEach(([v, id]) => {
    const vals: (number | null)[] | undefined = j.hourly?.[v]; if (!vals) return;
    const s = new Array(n).fill(NaN);
    (j.hourly.time as number[]).forEach((t, k) => { const i = slotOf(year, tz, t, 'end'); if (i >= 0 && i < n && vals[k] != null && Number.isFinite(vals[k])) s[i] = vals[k]; });
    const miss = s.filter(Number.isNaN).length;
    if (miss > n * 0.1) return;
    /* short gaps: linear interpolation */
    let last = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && Number.isNaN(s[i])) continue;
      for (let k = last + 1; k < i; k++) s[k] = last < 0 ? s[i] : i >= n ? s[last] : s[last] + (s[i] - s[last]) * (k - last) / (i - last);
      last = i;
    }
    data[id] = s; if (miss) filled[id] = miss;
  });
  if (!Object.keys(data).length) throw new Error(`No outdoor air-quality data for ${year} at this location; the global CAMS record covers recent years only, try a later year.`);
  return { key: airKey(lat, lon, year), lat, lon, year, tz, n, label, data, filled,
    source: 'Open-Meteo Air Quality API, CAMS global atmospheric composition', attribution: 'Air quality data by Open-Meteo.com (CC BY 4.0), Copernicus Atmosphere Monitoring Service', retrieved: new Date().toISOString() };
}
