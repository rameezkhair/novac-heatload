/* Hourly weather year. Records are hour-ending in local standard time, the EPW convention used by the heat balance:
   index 0 is 00:00–01:00 on 1 January, index n − 1 is 23:00–24:00 on 31 December.
   Temperatures and humidity are the value at the end of the hour; radiation is the mean over the hour. */

export type ProviderId = 'open-meteo' | 'nasa-power';
/* measured fields; a missing field is absent, never substituted */
export type Field = 'db' | 'rh' | 'dp' | 'p' | 'ws' | 'wd' | 'wg' | 'ghi' | 'dni' | 'dhi' | 'cloud' | 'precip';
export const FIELDS: Record<Field, { label: string; unit: string }> = {
  db: { label: 'Dry bulb', unit: '°C' }, rh: { label: 'Relative humidity', unit: '%' }, dp: { label: 'Dew point', unit: '°C' },
  p: { label: 'Station pressure', unit: 'Pa' }, ws: { label: 'Wind speed', unit: 'm/s' }, wd: { label: 'Wind direction', unit: '°' },
  wg: { label: 'Wind gust', unit: 'm/s' }, ghi: { label: 'Global horizontal irradiance', unit: 'W/m²' },
  dni: { label: 'Direct normal irradiance', unit: 'W/m²' }, dhi: { label: 'Diffuse horizontal irradiance', unit: 'W/m²' },
  cloud: { label: 'Cloud cover', unit: '%' }, precip: { label: 'Precipitation', unit: 'mm' },
};

/* a weather request: where, which calendar year, from which provider */
export interface WeatherRef { provider: ProviderId; lat: number; lon: number; year: number; label?: string }

export interface WeatherYear {
  key: string; provider: ProviderId; source: string; attribution: string;
  lat: number; lon: number; elev: number; tz: number; year: number; label: string;
  n: number;
  /* hourly series, NaN where the source had no value */
  data: Partial<Record<Field, number[]>>;
  /* fields derived rather than measured, with how */
  derived: Partial<Record<Field, string>>;
  /* hours that were missing in the source and filled by interpolation, per field */
  filled: Partial<Record<Field, number>>;
  retrieved: string;
}
