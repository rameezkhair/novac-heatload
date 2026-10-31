/* Weather-year heat balance: the same room model as the design days, driven by every day of a real weather year.
   Each day is solved as a steady-periodic day (as the design days are), so heat stored in heavy constructions does
   not carry over from one day to the next. Loads are actual: no safety margins and no diversity factor. */
import type { Computed } from '../calc';
import { stationOf } from '../climate';
import { SCHEDULES } from '../data';
import { SYSTEMS, capRatio, electric, type SysId } from '../equipment';
import { skyTemp } from '../hbm/heatBalance';
import { roomLoads, type Climate } from '../hbm/room';
import { clearSky, sunGeom } from '../hbm/solar';
import { designPeak, designReq, SERIES } from '../hourly';
import { num } from '../util';
import { psychro, when } from './dataset';
import type { WeatherYear } from './types';

/* one day of outdoor conditions per day of the weather year */
export function weatherClimate(p: Computed['p'], wx: WeatherYear): Climate {
  const st0 = stationOf(p.location), D = wx.data, db = D.db!, dp = D.dp!, days = wx.n / 24;
  const st = { ...st0, lat: wx.lat, lon: wx.lon, tz: wx.tz, tavg: db.reduce((a, x) => a + x, 0) / wx.n };
  const rad = !!(D.dni && D.dhi);
  const out: Climate['days'] = [];
  for (let k = 0; k < days; k++) {
    const To = db.slice(k * 24, k * 24 + 24), m = when(wx.year, k * 24).m;
    /* clear-sky emissivity (Berdahl and Martin) raised for cloud cover in tenths (EnergyPlus sky model) */
    const Tsky = To.map((t, i) => {
      const N = D.cloud ? D.cloud[k * 24 + i] / 10 : 0, f = 1 + 0.0224 * N - 0.0035 * N * N + 0.00028 * N ** 3;
      return D.cloud ? Math.pow(f, 0.25) * (skyTemp(t, dp[k * 24 + i]) + 273.15) - 273.15 : skyTemp(t, dp[k * 24 + i]);
    });
    /* radiation is the mean over the hour: the sun is placed at mid-hour */
    const sun = To.map((_, i) => {
      const g = sunGeom(wx.lat, wx.lon, wx.tz, k + 1, i + 0.5);
      if (!rad) return clearSky(st0, m, g);
      return { beta: g.beta, az: g.az, Eb: g.beta > 0 ? D.dni![k * 24 + i] : 0, Ed: D.dhi![k * 24 + i] };
    });
    out.push({ To, Tsky, sun });
  }
  return { st, hot: 0, days: out };
}

export interface RoomYear { v: Float32Array[]; oa: Float32Array }
export interface YearLoads {
  n: number; To: Float32Array;
  /* room load series in SERIES order plus latent (index 7), W, all rooms × quantity */
  v: Float32Array[];
  /* fresh air load, W; the cooling unit load, the FAHU load (after heat recovery), and the plant total, all ≥ 0 */
  oa: Float32Array; unit: Float32Array; fahu: Float32Array; plant: Float32Array;
  /* electrical input, kW, and the plant's available capacity at that hour's outdoor temperature, W */
  kWe: Float32Array; cap: Float32Array;
  rooms: Record<string, RoomYear>;
  solar: 'measured' | 'clear-sky';
}

const cache = new WeakMap<WeatherYear, WeakMap<Computed, YearLoads>>();
export function simulateYear(d: Computed, wx: WeatherYear): YearLoads {
  const hit = cache.get(wx)?.get(d); if (hit) return hit;
  const { p, e } = d, n = wx.n, cl = weatherClimate(p, wx), psy = psychro(wx), db = wx.data.db!;
  const Ti = num(p.tiDB), ks = 1.23 * e.k, kl = 3010 * e.k;
  const F = () => new Float32Array(n);
  const Y: YearLoads = { n, To: Float32Array.from(db), v: SERIES.map(F).concat([F()]), oa: F(), unit: F(), fahu: F(), plant: F(), kWe: F(), cap: F(), rooms: {}, solar: wx.data.dni && wx.data.dhi ? 'measured' : 'clear-sky' };
  const oaS = F(), oaL = F();
  d.rooms.forEach(r => {
    const c = d.res[r.id]; if (!c) return;
    const A = num(r.area), sched = r.sched || '24h', sch = SCHEDULES.find(s => s.id === sched) || SCHEDULES[0];
    const infQ = num(r.ach) * A * num(r.height) / 3.6, q = c.qty;
    const days = roomLoads(p, r, cl, { n: num(r.people), ps: num(r.ps), pl: num(r.pl), light: A * num(r.light), equip: A * num(r.equip), infK: ks * infQ, infL: 0, sched });
    const R: RoomYear = { v: SERIES.map(F).concat([F()]), oa: F() };
    days.forEach((ml, k) => {
      for (let h = 0; h < 24; h++) {
        const i = k * 24 + h, dW = Math.max(0, psy.W[i] - e.Wi);
        SERIES.forEach(([, f], s) => { R.v[s][i] = f(ml.c, h); });
        R.v[7][i] = ml.lat[h] + kl * infQ * dW;
        /* fresh air runs while the room is occupied */
        const on = sch.people[h] > 0 ? 1 : 0, s = ks * c.oaQ * (db[i] - Ti) * on, l = kl * c.oaQ * dW * on;
        R.oa[i] = s + l; oaS[i] += s * q; oaL[i] += l * q;
        for (let s2 = 0; s2 < 8; s2++) Y.v[s2][i] += R.v[s2][i] * q;
      }
    });
    Y.rooms[r.id] = R;
  });
  /* plant: rooms plus fresh air, to the room units or through the FAHU with heat recovery */
  const sys = (p.sys || 'ducted') as SysId, air = SYSTEMS.find(x => x.id === sys)!.air;
  const pk = designPeak(d, 'all'), q = designReq(p, Math.max(0, pk.W) / 1000);
  const cap35 = Math.max(0, d.T.plant) / (air ? capRatio(num(p.toDB)) : 1), aux = num(p.aux) / 3.51685;
  const rS = num(p.ervS) / 100, rL = num(p.ervL) / 100, share = p.fahu && p.erv ? num(p.ervShare) / 100 : 0;
  for (let i = 0; i < n; i++) {
    let room = 0; for (let s = 0; s < 8; s++) room += Y.v[s][i];
    const fa = oaS[i] + oaL[i]; Y.oa[i] = fa;
    if (p.fahu) { Y.unit[i] = Math.max(0, room); Y.fahu[i] = Math.max(0, fa - (rS * Math.max(0, oaS[i]) + rL * Math.max(0, oaL[i])) * share); }
    else Y.unit[i] = Math.max(0, room + fa);
    Y.plant[i] = Y.unit[i] + Y.fahu[i];
    Y.cap[i] = cap35 * (air ? capRatio(db[i]) : 1);
    Y.kWe[i] = (electric(q, sys, Y.plant[i], db[i], cap35) + Y.plant[i] * aux) / 1000;
  }
  if (!cache.has(wx)) cache.set(wx, new WeakMap());
  cache.get(wx)!.set(d, Y);
  return Y;
}

/* totals for reporting */
export function yearSummary(Y: YearLoads, wx: WeatherYear) {
  let pk = 0, cool = 0, elec = 0, over = 0;
  for (let i = 0; i < Y.n; i++) { if (Y.plant[i] > Y.plant[pk]) pk = i; cool += Y.plant[i]; elec += Y.kWe[i]; if (Y.plant[i] > Y.cap[i] * 1.0001 && Y.plant[i] > 0) over++; }
  const months = Array.from({ length: 12 }, () => ({ cool: 0, elec: 0, peak: 0, peakAt: 0, tMax: -Infinity, hours: 0 }));
  for (let i = 0; i < Y.n; i++) {
    const m = months[when(wx.year, i).m];
    m.cool += Y.plant[i] / 1000; m.elec += Y.kWe[i]; m.hours++;
    if (Y.plant[i] > m.peak) { m.peak = Y.plant[i]; m.peakAt = i; }
    if (Y.To[i] > m.tMax) m.tMax = Y.To[i];
  }
  return { pk, peakW: Y.plant[pk], coolKWh: cool / 1000, elecKWh: elec, over, months, seasonalCop: elec > 0 ? cool / 1000 / elec : 0 };
}
