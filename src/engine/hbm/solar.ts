/* Sun position and clear-sky irradiance, ASHRAE Handbook Fundamentals 2013 Ch. 14 (eqs. 5–35),
   with the 2013 air-mass exponent coefficients that match the 2013 taub/taud data. */
import type { Station } from '../climate';

const RAD = Math.PI / 180;
/* design day: the 21st of each month */
export const DAY_OF_YEAR = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355];

export interface Sun { beta: number; az: number; Eb: number; Ed: number }

/* sun and clear-sky irradiance at local standard time `lst` (hours) on the 21st of month m (0–11).
   az is measured clockwise from north, beta is the altitude, both in degrees */
export function sunAt(st: Station, m: number, lst: number): Sun {
  return clearSky(st, m, sunGeom(st.lat, st.lon, st.tz, DAY_OF_YEAR[m], lst));
}

/* sun altitude and azimuth (degrees) and extraterrestrial normal irradiance (W/m²) on day of year n at local standard time lst */
export function sunGeom(lat: number, lon: number, tz: number, n: number, lst: number) {
  const E0 = 1367 * (1 + 0.033 * Math.cos(360 * RAD * (n - 3) / 365));
  const G = 360 * RAD * (n - 1) / 365;
  const ET = 2.2918 * (0.0075 + 0.1868 * Math.cos(G) - 3.2077 * Math.sin(G) - 1.4615 * Math.cos(2 * G) - 4.089 * Math.sin(2 * G));
  const dec = 23.45 * Math.sin(360 * RAD * (n + 284) / 365) * RAD;
  const ast = lst + ET / 60 + (lon - 15 * tz) / 15;
  const H = 15 * (ast - 12) * RAD, L = lat * RAD;
  const sinB = Math.cos(L) * Math.cos(dec) * Math.cos(H) + Math.sin(L) * Math.sin(dec);
  const beta = Math.asin(Math.max(-1, Math.min(1, sinB)));
  let az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.sin(dec) * Math.cos(L) - Math.cos(dec) * Math.sin(L) * Math.cos(H)) / RAD;
  if (az < 0) az += 360;
  return { beta: beta / RAD, az, E0 };
}

/* ASHRAE clear-sky beam and diffuse irradiance for month m's optical depths */
export function clearSky(st: Station, m: number, g: { beta: number; az: number; E0: number }): Sun {
  const { beta: bd, az, E0 } = g;
  if (bd <= 0) return { beta: bd, az, Eb: 0, Ed: 0 };
  const sinB = Math.sin(bd * RAD), m_ = 1 / (sinB + 0.50572 * Math.pow(6.07995 + bd, -1.6364));
  const tb = st.taub[m], td = st.taud[m];
  const ab = 1.454 - 0.406 * tb - 0.268 * td + 0.021 * tb * td, ad = 0.507 + 0.205 * tb - 0.080 * td - 0.190 * tb * td;
  return { beta: bd, az, Eb: E0 * Math.exp(-tb * Math.pow(m_, ab)), Ed: E0 * Math.exp(-td * Math.pow(m_, ad)) };
}

/* cosine of the incidence angle on a surface of azimuth `az` (from north) and tilt `tilt` (0 = facing up) */
export function cosInc(s: Sun, az: number, tilt: number) {
  const b = s.beta * RAD, t = tilt * RAD;
  return Math.cos(b) * Math.cos((s.az - az) * RAD) * Math.sin(t) + Math.sin(b) * Math.cos(t);
}

/* beam, sky-diffuse and ground-reflected irradiance on a surface, W/m² (ASHRAE Ch. 14 eqs. 26–31) */
export function onSurface(s: Sun, az: number, tilt: number, rho: number) {
  if (s.Eb <= 0 && s.Ed <= 0) return { b: 0, d: 0, r: 0, cos: 0 };
  const c = cosInc(s, az, tilt), t = tilt * RAD;
  const Y = Math.max(0.45, 0.55 + 0.437 * c + 0.313 * c * c);
  const d = tilt <= 90 ? s.Ed * (Y * Math.sin(t) + Math.cos(t)) : s.Ed * Y * Math.sin(t);
  const r = (s.Eb * Math.sin(s.beta * RAD) + s.Ed) * rho * (1 - Math.cos(t)) / 2;
  return { b: s.Eb * Math.max(0, c), d: Math.max(0, d), r: Math.max(0, r), cos: c };
}

/* Angular response of glazing, from Fresnel reflection and Bouguer absorption for two clear panes
   (Duffie & Beckman, Solar Engineering of Thermal Processes, eqs. 5.1.1–5.3.1; n = 1.526, KL = 0.037 per pane),
   normalised to 1 at normal incidence and applied to the rated SHGC */
const N_GLASS = 1.526, KL = 0.037, PANES = 2;
function tauGlass(theta: number) {
  if (theta < 1e-6) {
    const r = ((N_GLASS - 1) / (N_GLASS + 1)) ** 2;
    return (1 - r) / (1 + (2 * PANES - 1) * r) * Math.exp(-PANES * KL);
  }
  const t2 = Math.asin(Math.sin(theta) / N_GLASS);
  const rs = Math.sin(t2 - theta) ** 2 / Math.sin(t2 + theta) ** 2, rp = Math.tan(t2 - theta) ** 2 / Math.tan(t2 + theta) ** 2;
  const tr = ((1 - rs) / (1 + (2 * PANES - 1) * rs) + (1 - rp) / (1 + (2 * PANES - 1) * rp)) / 2;
  return tr * Math.exp(-PANES * KL / Math.cos(t2));
}
const TAU0 = tauGlass(0);
/* SHGC(θ) / SHGC(normal) */
export const angleFactor = (cos: number) => cos <= 0.01 ? 0 : tauGlass(Math.acos(Math.min(1, cos))) / TAU0;
/* diffuse factors: equivalent incidence angles for sky and ground radiation (Brandemuehl and Beckman, D&B eqs. 5.4.1–5.4.2) */
export function diffuseFactors(tilt: number) {
  const sky = 59.7 - 0.1388 * tilt + 0.001497 * tilt * tilt, gnd = 90 - 0.5788 * tilt + 0.002693 * tilt * tilt;
  return { sky: angleFactor(Math.cos(sky * RAD)), gnd: angleFactor(Math.cos(gnd * RAD)) };
}
