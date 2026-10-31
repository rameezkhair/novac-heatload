import { hoursIn } from '../src/engine/weather/dataset';

/* a synthetic Open-Meteo archive answer for a UAE point: hourly unix times in UTC, sinusoidal daily weather */
export function fakeOpenMeteo(year: number, tMax = 44) {
  const t0 = Date.UTC(year, 0, 1) / 1000 - 4 * 3600 - 86400, n = hoursIn(year) + 72, time: number[] = [];
  for (let i = 0; i < n; i++) time.push(t0 + i * 3600);
  const local = (t: number) => ((t / 3600 + 4) % 24 + 24) % 24;
  const db = time.map(t => tMax - 6 - 6 * Math.cos((local(t) - 15) / 24 * 2 * Math.PI) * -1);
  const sun = time.map(t => Math.max(0, 900 * Math.sin((local(t) - 6) / 12 * Math.PI)));
  return {
    latitude: 25.2, longitude: 55.27, elevation: 6, utc_offset_seconds: 0,
    hourly: { time, temperature_2m: db, relative_humidity_2m: time.map(() => 50), dew_point_2m: time.map(() => 20), surface_pressure: time.map(() => 1012),
      wind_speed_10m: time.map(() => 3), wind_direction_10m: time.map(() => 300), wind_gusts_10m: time.map(() => 6),
      shortwave_radiation: sun, direct_normal_irradiance: sun.map(x => x * 0.7), diffuse_radiation: sun.map(x => x * 0.25),
      cloud_cover: time.map(() => 0), precipitation: time.map(() => 0) },
  };
}
