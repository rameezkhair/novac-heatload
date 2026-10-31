/* ASHRAE 2013 climatic design conditions for the UAE stations (ASHRAE Handbook, Fundamentals 2013, Ch. 14),
   as distributed with EnergyPlus (bin/WeatherConverter/ASHRAE_2013_*_DesignConditions.csv).
   Monthly arrays run January to December.
   taub, taud: clear-sky optical depths for beam and diffuse irradiance
   db, wb:     0.4% monthly design dry bulb and mean coincident wet bulb, °C
   dbr, wbr:   mean daily dry-bulb and wet-bulb range coincident with the 5% monthly design dry bulb, K
   tavg:       annual mean dry bulb, °C (deep ground temperature for slabs on grade) */
export interface Station {
  wmo: string; name: string; lat: number; lon: number; elev: number; tz: number; db04: number; wb04: number; tavg: number;
  taub: number[]; taud: number[]; db: number[]; wb: number[]; dbr: number[]; wbr: number[];
}
const S = (s: Omit<Station, 'tz'>): Station => ({ ...s, tz: 4 });
export const STATIONS: Record<string, Station> = {
  dxb: S({
    wmo: '411940', name: 'Dubai International', lat: 25.25, lon: 55.33, elev: 10, db04: 42.9, wb04: 23.6, tavg: 28.0,
    taub: [0.463, 0.508, 0.547, 0.558, 0.596, 0.675, 0.792, 0.684, 0.585, 0.499, 0.463, 0.451],
    taud: [2.185, 2.029, 1.902, 1.828, 1.708, 1.551, 1.427, 1.611, 1.82, 2.046, 2.186, 2.232],
    db: [28.2, 32.1, 35.9, 39.2, 42.5, 43.8, 44.6, 44.2, 41.8, 38.8, 34.1, 30],
    wb: [17.3, 17.8, 18.2, 19.8, 20.9, 21.8, 24, 23.8, 23, 20.7, 19.2, 18.5],
    dbr: [10.2, 11.1, 12.1, 13, 13.3, 12.6, 11.1, 11, 11.2, 11.2, 10.4, 10.1],
    wbr: [4.9, 5.1, 5.8, 6.3, 6.5, 6.9, 6.4, 6.3, 6.7, 6.5, 5.1, 4.9],
  }),
  auh: S({
    wmo: '412170', name: 'Abu Dhabi International', lat: 24.43, lon: 54.65, elev: 27, db04: 44.9, wb04: 23, tavg: 28.1,
    taub: [0.449, 0.5, 0.54, 0.562, 0.571, 0.65, 0.77, 0.673, 0.562, 0.478, 0.44, 0.442],
    taud: [2.164, 1.998, 1.863, 1.765, 1.69, 1.529, 1.408, 1.58, 1.808, 2.054, 2.192, 2.188],
    db: [29.2, 34, 38, 41.8, 44.2, 45.3, 46.1, 46.2, 43.2, 40, 35.1, 31.1],
    wb: [17.9, 17.8, 18.6, 20.2, 20.9, 21.8, 23.6, 23.3, 22.8, 21.6, 19.5, 18.7],
    dbr: [12.5, 14.2, 15.1, 16.7, 17, 16.2, 14.1, 14.1, 13.9, 13.9, 12.9, 12.4],
    wbr: [5.6, 5.8, 6, 6.5, 6.9, 6.9, 6.7, 6.8, 6.8, 6.5, 5.5, 5.6],
  }),
  bat: S({
    wmo: '412160', name: 'Abu Dhabi Bateen', lat: 24.43, lon: 54.47, elev: 5, db04: 43.8, wb04: 23.5, tavg: 28.1,
    taub: [0.45, 0.501, 0.539, 0.573, 0.582, 0.648, 0.768, 0.672, 0.561, 0.478, 0.441, 0.442],
    taud: [2.169, 2.002, 1.868, 1.743, 1.67, 1.537, 1.412, 1.583, 1.813, 2.06, 2.197, 2.192],
    db: [28.3, 32.9, 35.8, 40.8, 44, 44.6, 45.9, 45.2, 42.1, 38.6, 34.8, 30.1],
    wb: [17.3, 18.1, 17.6, 19.8, 21.8, 21.8, 24, 23.3, 22.7, 22.6, 19.4, 18.7],
    dbr: [10.3, 12.6, 12.9, 14.6, 15, 13.9, 12.9, 12.3, 11.9, 11.4, 10.7, 10.5],
    wbr: [4.8, 5.4, 5.5, 5.9, 6.2, 6.7, 6.8, 7.3, 6.8, 5.8, 4.8, 4.9],
  }),
  aan: S({
    wmo: '412180', name: 'Al Ain International', lat: 24.27, lon: 55.6, elev: 265, db04: 46, wb04: 23, tavg: 29.1,
    taub: [0.434, 0.484, 0.513, 0.538, 0.565, 0.646, 0.773, 0.65, 0.549, 0.454, 0.417, 0.424],
    taud: [2.205, 2.016, 1.909, 1.8, 1.703, 1.541, 1.397, 1.606, 1.816, 2.094, 2.248, 2.231],
    db: [28.2, 33.7, 37.9, 41.9, 45.9, 47, 47, 46.2, 44.6, 40.5, 35.2, 30.9],
    wb: [17.6, 18.6, 19.4, 20.4, 21.5, 22.6, 23.3, 23.1, 22.4, 20.6, 19.7, 16.1],
    dbr: [11.9, 13.2, 14.6, 14.7, 16.1, 15.8, 14.1, 13.7, 14.2, 13.8, 12.7, 12.3],
    wbr: [5.1, 5.5, 5.5, 5.9, 5.6, 5.6, 5.4, 5.2, 5.9, 6.3, 5.1, 4.9],
  }),
  shj: S({
    wmo: '411960', name: 'Sharjah International', lat: 25.33, lon: 55.52, elev: 34, db04: 44.1, wb04: 23.8, tavg: 27.5,
    taub: [0.449, 0.508, 0.547, 0.558, 0.584, 0.665, 0.792, 0.671, 0.585, 0.485, 0.448, 0.451],
    taud: [2.23, 2.029, 1.897, 1.829, 1.733, 1.573, 1.427, 1.633, 1.82, 2.09, 2.23, 2.226],
    db: [28.7, 32.8, 36.8, 40.8, 43.9, 45, 45.8, 45.5, 43, 39.8, 35.1, 30.8],
    wb: [17.4, 18, 18.4, 19.5, 21.2, 22.1, 23.4, 23.3, 22.7, 21, 19.3, 18.2],
    dbr: [13, 14.7, 16, 17.3, 17.6, 16.9, 14.8, 14.8, 15.1, 15.4, 14.1, 13.4],
    wbr: [5.9, 6.1, 6.4, 6.8, 6.9, 7, 6.2, 6.1, 6.3, 6.5, 6, 6.1],
  }),
  rak: S({
    wmo: '411840', name: 'Ras Al Khaimah International', lat: 25.62, lon: 55.93, elev: 31, db04: 44.2, wb04: 25.3, tavg: 28.0,
    taub: [0.45, 0.509, 0.548, 0.561, 0.588, 0.68, 0.795, 0.675, 0.586, 0.482, 0.447, 0.451],
    taud: [2.24, 2.04, 1.913, 1.845, 1.749, 1.569, 1.433, 1.649, 1.831, 2.132, 2.269, 2.233],
    db: [28.7, 32.1, 36.2, 41, 44.1, 45.2, 45.3, 45.1, 43, 40.1, 35.2, 31],
    wb: [19, 19.7, 20.1, 21.8, 23.5, 24.2, 25.7, 25.3, 24.8, 23.5, 21.4, 20.1],
    dbr: [13.4, 14, 15.9, 17.5, 17.6, 16.8, 14.1, 14.3, 14.7, 15.6, 14.7, 13.8],
    wbr: [6.9, 6.5, 6.6, 6.7, 6.8, 6.9, 6, 6, 6.1, 6.7, 7, 7.2],
  }),
  fuj: S({
    wmo: '411980', name: 'Fujairah International', lat: 25.1, lon: 56.33, elev: 46, db04: 42.8, wb04: 22.1, tavg: 28.9,
    taub: [0.448, 0.511, 0.55, 0.562, 0.602, 0.707, 0.809, 0.676, 0.579, 0.483, 0.448, 0.44],
    taud: [2.26, 2.043, 1.91, 1.847, 1.728, 1.528, 1.412, 1.641, 1.847, 2.127, 2.272, 2.28],
    db: [27.9, 29.9, 36, 40.1, 44.6, 45.6, 44.1, 42.8, 40.8, 38.2, 33.9, 29.7],
    wb: [18.8, 17.9, 19.5, 19.7, 21, 22.4, 23.2, 23.9, 23.4, 21.3, 21.3, 18.7],
    dbr: [7.4, 8.1, 9.3, 10.2, 10.6, 9.9, 8.3, 7.9, 8.1, 8.3, 7.6, 7.5],
    wbr: [4.5, 5.5, 7.1, 7.6, 8.3, 9.3, 8.1, 6.9, 7.2, 8.1, 5.8, 4.6],
  }),
};
export const STATION_SRC = 'ASHRAE Handbook Fundamentals 2013 Ch. 14 climatic design conditions';
/* nearest station for each emirate; Ajman and Umm Al Quwain use Sharjah */
const LOC_STATION: Record<string, string> = { dubai: 'dxb', abudhabi: 'auh', alain: 'aan', sharjah: 'shj', ajman: 'shj', uaq: 'shj', rak: 'rak', fujairah: 'fuj' };
export const stationOf = (location: string) => STATIONS[LOC_STATION[location] || 'dxb'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
