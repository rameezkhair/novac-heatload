/* EnergyPlus weather (EPW) export of a weather year, for simulation in EnergyPlus.
   Columns per the EnergyPlus Auxiliary Programs guide, "Weather Converter Program, EnergyPlus Weather File (EPW) Data Dictionary". */
import { hoursIn, when } from './dataset';
import type { WeatherYear } from './types';

/* write an EPW for EnergyPlus; values the source lacks get the EPW missing codes, which EnergyPlus fills itself */
export function toEpw(wx: WeatherYear): string {
  const D = wx.data, f = (v: number | undefined, miss: number, d = 1) => v == null || !Number.isFinite(v) ? String(miss) : v.toFixed(d);
  const head = [
    `LOCATION,${wx.label.replace(/,/g, ' ')},-,UAE,${wx.provider},999999,${wx.lat.toFixed(3)},${wx.lon.toFixed(3)},${wx.tz.toFixed(1)},${wx.elev.toFixed(1)}`,
    'DESIGN CONDITIONS,0', 'TYPICAL/EXTREME PERIODS,0', 'GROUND TEMPERATURES,0',
    `HOLIDAYS/DAYLIGHT SAVINGS,${hoursIn(wx.year) === 8784 ? 'Yes' : 'No'},0,0,0`,
    `COMMENTS 1,Exported by NOVAC from ${wx.source.replace(/,/g, ' ')}. ${wx.attribution.replace(/,/g, ' ')}`,
    `COMMENTS 2,Hour-ending local standard time UTC${wx.tz >= 0 ? '+' : ''}${wx.tz}. Missing values use EPW missing codes`,
    `DATA PERIODS,1,1,Data,${new Date(Date.UTC(wx.year, 0, 1)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })},1/1,12/31`,
  ];
  const out = head.slice();
  for (let i = 0; i < wx.n; i++) {
    const w = when(wx.year, i);
    out.push([wx.year, w.m + 1, w.d, w.h, 60, '?9?9?9?9E0?9?9?9?9?9?9?9?9?9?9?9?9?9?9?9*9*9?9?9?9',
      f(D.db?.[i], 99.9), f(D.dp?.[i], 99.9), f(D.rh?.[i], 999, 0), f(D.p?.[i], 999999, 0), 9999, 9999, 9999,
      f(D.ghi?.[i], 9999, 0), f(D.dni?.[i], 9999, 0), f(D.dhi?.[i], 9999, 0), 999999, 999999, 999999, 9999,
      f(D.wd?.[i], 999, 0), f(D.ws?.[i], 999), D.cloud ? Math.round(D.cloud[i] / 10) : 99, D.cloud ? Math.round(D.cloud[i] / 10) : 99,
      9999, 99999, 9, 999999999, 999, 0.999, 999, 99, 999, f(D.precip?.[i], 999), 99].join(','));
  }
  return out.join('\r\n') + '\r\n';
}
