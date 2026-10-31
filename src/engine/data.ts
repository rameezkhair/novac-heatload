/* Standards library and reference data. Values are carried over unchanged from the original
   single-file calculator; every value keeps its source string so the report can cite it. */
import type { Orient } from './types';

export const ORIENTS: Orient[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const SAFAT = "Al Sa'fat";
const A901 = 'ASHRAE 90.1-2022 Table 5.5-0';

export interface Loc {
  label: string; toDB?: number; toWB?: number; dr?: number; elev?: number; vDB?: number; vWB?: number;
  ref: string; vref?: string; note?: string;
}
export const LOC: Record<string, Loc> = {
  dubai: { label: 'Dubai', toDB: 46, toWB: 29, dr: 13.8, elev: 5, vDB: 34, vWB: 32, ref: 'DBC Table H.1', vref: 'DBC H.4.6.4', note: 'Dubai: DBC Table H.1, 46 °C DB / 29 °C WB, 13.8 K daily range, 25° N, climate zone 0B; outdoor air system DBC H.4.6.4, 34 °C DB / 32 °C WB.' },
  abudhabi: { label: 'Abu Dhabi (coastal)', toDB: 46.1, toWB: 29.4, dr: 13, elev: 27, vDB: 35.3, vWB: 30.6, ref: 'DOE Cooling Load Manual Tables 1–2', note: 'Abu Dhabi: DOE Cooling Load Manual, Tables 1 and 2.' },
  alain: { label: 'Al Ain (inland)', toDB: 48.8, toWB: 28.3, dr: 15, elev: 265, vDB: 35.8, vWB: 28.8, ref: 'DOE Cooling Load Manual Tables 1–2', note: 'Al Ain: DOE Cooling Load Manual, Tables 1 and 2.' },
  sharjah: { label: 'Sharjah', toDB: 46, toWB: 29, dr: 13.8, elev: 5, vDB: 34, vWB: 32, ref: 'DBC Table H.1 (regional practice)', vref: 'DBC H.4.6.4 (regional practice)' },
  ajman: { label: 'Ajman', toDB: 46, toWB: 29, dr: 13.8, elev: 5, vDB: 34, vWB: 32, ref: 'DBC Table H.1 (regional practice)', vref: 'DBC H.4.6.4 (regional practice)' },
  uaq: { label: 'Umm Al Quwain', toDB: 46, toWB: 29, dr: 13.8, elev: 5, vDB: 34, vWB: 32, ref: 'DBC Table H.1 (regional practice)', vref: 'DBC H.4.6.4 (regional practice)' },
  rak: { label: 'Ras Al Khaimah', toDB: 46, toWB: 29, dr: 13.8, elev: 5, vDB: 34, vWB: 32, ref: 'DBC Table H.1 (regional practice)', vref: 'DBC H.4.6.4 (regional practice)' },
  fujairah: { label: 'Fujairah', toDB: 46, toWB: 29, dr: 13.8, elev: 5, vDB: 34, vWB: 32, ref: 'DBC Table H.1 (regional practice)', vref: 'DBC H.4.6.4 (regional practice)' },
  custom: { label: 'Custom', ref: 'Custom values', note: 'Custom conditions. Record your data source.' },
};

/* Sub-locations: elevation sets site pressure for all psychrometrics; daily range shapes heat-balance weather profiles.
   Design DB/WB stay at the emirate's code values. July ranges = mean daily max − mean daily min (Climates to Travel). */
export interface SubLoc { id: string; label: string; elev: number; dr: number; src: string; est: boolean }
const CTT = 'July mean max − min (Climates to Travel)';
const ZC = {
  gulf: 'Gulf coast proxy: Dubai ' + CTT + ' 41.5 − 31.2 °C', adc: 'Abu Dhabi ' + CTT + ' 42.5 − 29.7 °C',
  inland: 'Inland desert proxy: Al Ain ' + CTT + ' 44.9 − 30.2 °C', east: 'East coast proxy: Fujairah ' + CTT + ' 37.6 − 31.6 °C',
  mid: 'Midpoint of coastal and inland ranges',
};
const S = (id: string, label: string, elev: number, dr: number, src: string, est?: boolean): SubLoc => ({ id, label, elev, dr, src, est: !!est });
export const SUBLOC: Record<string, SubLoc[]> = {
  dubai: [
    S('dbc', 'Dubai, DBC Table H.1 reference', 5, 13.8, 'DBC Table H.1'),
    S('coast', 'Dubai coastal (Deira, Bur Dubai, Jumeirah, Marina, Palm)', 5, 10.3, 'Dubai ' + CTT + ': 41.5 − 31.2 °C'),
    S('mid', 'Dubai mid-city (Al Quoz, Al Barsha, Business Bay, Mirdif)', 15, 12.5, ZC.mid + '; elevation approximate', true),
    S('inland', 'Dubai inland desert (Al Qudra, Dubai South, Lisaili, Al Faqa)', 50, 14.7, ZC.inland + '; elevation approximate', true),
    S('hatta', 'Hatta (mountain enclave)', 330, 14.7, 'Elevation 330 m (Hatta); range: ' + ZC.inland, true)],
  abudhabi: [
    S('city', 'Abu Dhabi City and islands (coastal)', 27, 12.8, 'DOE CLM Table 1 elevation; ' + ZC.adc),
    S('mainland', 'Abu Dhabi mainland (Khalifa City, MBZ City, KIZAD)', 15, 13.8, ZC.mid + '; elevation approximate', true),
    S('west', 'Al Dhafra coast (Ruwais, Mirfa, Sila)', 5, 12.8, 'Range: ' + ZC.adc + '; elevation approximate', true),
    S('mzayed', 'Al Dhafra inland (Madinat Zayed, Ghayathi)', 120, 14.7, ZC.inland + '; elevation approximate. DOE CLM §2.2 requires local adjustment', true),
    S('liwa', 'Liwa Oasis', 150, 14.7, ZC.inland + '; elevation approximate. DOE CLM §2.2 requires local adjustment', true),
    S('sweihan', 'Sweihan / Al Khatim (inland)', 100, 14.7, ZC.inland + '; elevation approximate', true)],
  alain: [
    S('city', 'Al Ain City', 265, 14.7, 'DOE CLM Table 1 elevation; Al Ain ' + CTT + ': 44.9 − 30.2 °C'),
    S('hafeet', 'Jebel Hafeet upper slopes', 1000, 10, 'Peak 1,108 m (UAE mountains list); range estimated for a summit site', true)],
  sharjah: [
    S('coast', 'Sharjah City (coastal)', 5, 10.3, ZC.gulf),
    S('inland', 'Sharjah inland (Al Dhaid, Mleiha, Al Madam)', 100, 14.7, ZC.inland + '; elevation approximate', true),
    S('east', 'Sharjah east coast (Khor Fakkan, Kalba, Dibba Al Hisn)', 10, 6.0, ZC.east, true)],
  ajman: [
    S('coast', 'Ajman City (coastal)', 5, 10.3, ZC.gulf),
    S('manama', 'Ajman Al Manama (inland enclave)', 150, 14.7, ZC.inland + '; elevation approximate', true),
    S('masfout', 'Ajman Masfout (mountain enclave)', 400, 14.7, ZC.inland + '; elevation approximate', true)],
  uaq: [
    S('coast', 'Umm Al Quwain City (coastal)', 5, 10.3, ZC.gulf),
    S('falaj', 'Umm Al Quwain inland (Falaj Al Mualla)', 40, 14.7, ZC.inland + '; elevation approximate', true)],
  rak: [
    S('coast', 'Ras Al Khaimah coastal (city, Al Hamra, Al Marjan)', 10, 13.6, 'Ras Al Khaimah ' + CTT + ': 43.3 − 29.7 °C'),
    S('inland', 'RAK inland plain (Digdaga, Al Ghail)', 40, 14.7, ZC.inland + '; elevation approximate', true),
    S('jais', 'Jebel Jais (upper developments)', 1500, 6, 'Summit above 1,900 m; summer highs about 30 °C, lows mid-20s (Middle East Traveller); elevation of developments approximate', true)],
  fujairah: [
    S('coast', 'Fujairah City (coastal)', 10, 6.0, 'Fujairah ' + CTT + ': 37.6 − 31.6 °C'),
    S('dibba', 'Dibba Al-Fujairah', 10, 6.0, 'Dibba ' + CTT + ': 37.6 − 31.6 °C'),
    S('masafi', 'Masafi (mountain pass)', 400, 14.7, ZC.inland + '; elevation approximate', true)],
  custom: [],
};

/* authority basis per emirate. UAE Fire and Life Safety Code applies in every emirate */
const FLSC = 'UAE Fire and Life Safety Code (Civil Defence)';
const AUTH: Record<string, { auth: string; code: string; green: string; util: string; design: string }> = {
  dubai: { auth: 'Dubai Municipality (DM); free zones: DDA, Trakhees, DSO, DIFC', code: 'Dubai Building Code 2021 (DBC)', green: "Al Sa'fat (DM)", util: 'DEWA', design: 'DBC Table H.1 and H.4.6.4' },
  abudhabi: { auth: 'Department of Municipalities and Transport (DMT); Abu Dhabi City / Al Dhafra Municipality', code: 'Abu Dhabi International Building Codes (ADIBC)', green: 'Estidama Pearl Rating System (DMT)', util: 'TAQA Distribution (ADDC)', design: 'DOE Cooling Load Manual Tables 1–2' },
  alain: { auth: 'Department of Municipalities and Transport (DMT); Al Ain City Municipality', code: 'Abu Dhabi International Building Codes (ADIBC)', green: 'Estidama Pearl Rating System (DMT)', util: 'TAQA Distribution (AADC)', design: 'DOE Cooling Load Manual Tables 1–2' },
  sharjah: { auth: 'Sharjah Municipality; Sharjah Planning and Survey Department', code: 'Sharjah Municipality building regulations', green: 'SEWA thermal insulation and efficiency requirements; ASHRAE 90.1 envelope', util: 'SEWA', design: 'DBC / ASHRAE values (no emirate design-day table)' },
  ajman: { auth: 'Ajman Municipality and Planning Department (AMPD)', code: 'AMPD building regulations', green: 'MOEI UAE Green Building Codes; ASHRAE 90.1 envelope', util: 'Etihad Water and Electricity (EtihadWE)', design: 'DBC / ASHRAE values (no emirate design-day table)' },
  uaq: { auth: 'Umm Al Quwain Municipality', code: 'UAQ Municipality building regulations', green: 'MOEI UAE Green Building Codes; ASHRAE 90.1 envelope', util: 'Etihad Water and Electricity (EtihadWE)', design: 'DBC / ASHRAE values (no emirate design-day table)' },
  rak: { auth: 'Ras Al Khaimah Municipality; RAKEZ in its free zone', code: 'RAK Building Regulations and Construction Specifications', green: 'Barjeel Green Building Regulations (RAK Municipality)', util: 'Etihad Water and Electricity (EtihadWE)', design: 'DBC / ASHRAE values (no emirate design-day table)' },
  fujairah: { auth: 'Fujairah Municipality', code: 'Fujairah Municipality building regulations', green: 'MOEI UAE Green Building Codes; ASHRAE 90.1 envelope', util: 'Etihad Water and Electricity (EtihadWE)', design: 'DBC / ASHRAE values (no emirate design-day table)' },
};
export const authLine = (k: string) => {
  const a = AUTH[k];
  return a ? `Authority: ${a.auth}. Building code: ${a.code}. Green code: ${a.green}. Utility: ${a.util}. Design conditions: ${a.design}. ${FLSC}.` : 'Custom conditions. Record your data source and the approving authority.';
};
/* codes applied automatically when the emirate changes */
export const AUTO: Record<string, { codeset: string; indoor: string; why: string }> = {
  dubai: { codeset: 'safat-s-40', indoor: 'dbc', why: "Dubai: Al Sa'fat envelope, DBC indoor basis" },
  abudhabi: { codeset: 'estidama', indoor: 'ashrae', why: 'Abu Dhabi: Estidama envelope, ASHRAE indoor basis (DOE CLM)' },
  alain: { codeset: 'estidama-aa', indoor: 'ashrae', why: 'Al Ain: Estidama envelope, ASHRAE indoor basis (DOE CLM)' },
  sharjah: { codeset: 'shj', indoor: 'ashrae', why: 'Sharjah: ASHRAE 90.1 envelope, ASHRAE indoor basis' },
  ajman: { codeset: 'ajm', indoor: 'ashrae', why: 'Ajman: ASHRAE 90.1 envelope, ASHRAE indoor basis' },
  uaq: { codeset: 'uaq', indoor: 'ashrae', why: 'Umm Al Quwain: ASHRAE 90.1 envelope, ASHRAE indoor basis' },
  rak: { codeset: 'barjeel', indoor: 'ashrae', why: 'Ras Al Khaimah: Barjeel envelope, ASHRAE indoor basis' },
  fujairah: { codeset: 'fuj', indoor: 'ashrae', why: 'Fujairah: ASHRAE 90.1 envelope, ASHRAE indoor basis' },
};

/* ---------- envelope and distribution library ---------- */
export interface LibOpt { id: string; label: string; v: number; src: string }
const mk = (a: [string, string, number, string][]): LibOpt[] => a.map(([id, label, v, src]) => ({ id, label, v, src }));
export type PickKey = 'uWall' | 'uRoof' | 'uGlass' | 'shgc' | 'uSky' | 'shgcSky' | 'ez';
export const LIB: Record<PickKey, LibOpt[]> = {
  uWall: mk([['safat-s', SAFAT + ' Bronze/Silver', 0.57, SAFAT + ' 501.01'], ['safat-g', SAFAT + ' Golden/Platinum', 0.42, SAFAT + ' 501.01'], ['estidama', 'Estidama Pearl (Abu Dhabi)', 0.32, 'Estidama PBRS'], ['barjeel', 'Barjeel (Ras Al Khaimah)', 0.48, 'Barjeel'], ['a901-steel', 'ASHRAE 90.1-2022 CZ0, steel-framed', 0.705, A901], ['a901-metal', 'ASHRAE 90.1-2022 CZ0, metal building', 0.533, A901], ['a901-mass', 'ASHRAE 90.1-2022 CZ0, mass wall (concrete / block), nonresidential', 3.293, A901], ['a901-mass-res', 'ASHRAE 90.1-2022 CZ0, mass wall, residential (R-1.0 ci)', 0.857, A901], ['a901-wood', 'ASHRAE 90.1-2022 CZ0, wood-framed and other', 0.505, A901]]),
  uRoof: mk([['safat', SAFAT + ', all levels', 0.30, SAFAT + ' 501.01'], ['estidama', 'Estidama Pearl', 0.14, 'Estidama PBRS'], ['barjeel', 'Barjeel (RAK)', 0.30, 'Barjeel'], ['a901-deck', 'ASHRAE 90.1-2022 CZ0, insulation above deck', 0.22, A901], ['a901-metal', 'ASHRAE 90.1-2022 CZ0, metal building', 0.233, A901], ['a901-attic', 'ASHRAE 90.1-2022 CZ0, attic and other', 0.153, A901], ['a901-deck-res', 'ASHRAE 90.1-2022 CZ0, insulation above deck, residential', 0.182, A901], ['a901-deck-nocool', 'ASHRAE 90.1-2022 CZ0, above deck without cool roof (Table 5.5.3.1.4)', 0.153, 'ASHRAE 90.1-2022 Table 5.5.3.1.4']]),
  uGlass: mk([['safat-40', SAFAT + ', glazing ≤40% of wall', 2.1, SAFAT + ' 501.01 B'], ['safat-60', SAFAT + ', glazing >40% or shopfront', 1.9, SAFAT + ' 501.01 B'], ['estidama', 'Estidama Pearl', 2.2, 'Estidama PBRS'], ['barjeel', 'Barjeel (RAK)', 2.2, 'Barjeel'], ['a901-fixed', 'ASHRAE 90.1-2022 CZ0, fixed', 2.84, A901], ['a901-oper', 'ASHRAE 90.1-2022 CZ0, operable', 3.52, A901], ['a901-door', 'ASHRAE 90.1-2022 CZ0, glazed entrance door', 4.713, A901]]),
  shgc: mk([['safat-40', SAFAT + ', glazing ≤40% (SC 0.40)', 0.35, SAFAT + ' 501.01 B'], ['safat-60', SAFAT + ', glazing 40–60% (SC 0.32)', 0.28, SAFAT + ' 501.01 B'], ['safat-100', SAFAT + ', glazing ≥60% (SC 0.25)', 0.22, SAFAT + ' 501.01 B'], ['safat-shop', SAFAT + ', shopfront above ground (SC 0.76)', 0.66, SAFAT + ' 501.01 B'], ['estidama', 'Estidama Pearl', 0.30, 'Estidama PBRS'], ['barjeel', 'Barjeel (RAK)', 0.30, 'Barjeel'], ['a901-fixed', 'ASHRAE 90.1-2022 CZ0, fixed', 0.22, A901], ['a901-oper', 'ASHRAE 90.1-2022 CZ0, operable', 0.20, A901], ['a901-door', 'ASHRAE 90.1-2022 CZ0, glazed entrance door', 0.20, A901]]),
  uSky: mk([['safat', SAFAT + ', roof glazing', 1.9, SAFAT + ' 501.01 B'], ['estidama', 'Estidama Pearl', 2.2, 'Estidama PBRS'], ['barjeel', 'Barjeel (RAK)', 1.8, 'Barjeel'], ['a901', 'ASHRAE 90.1-2022 CZ0, skylight', 3.97, A901]]),
  shgcSky: mk([['safat-10', SAFAT + ', roof glazing ≤10% of roof (SC 0.32)', 0.28, SAFAT + ' 501.01 B'], ['safat-11', SAFAT + ', roof glazing >10% of roof (SC 0.25)', 0.22, SAFAT + ' 501.01 B'], ['a901', 'ASHRAE 90.1-2022 CZ0, skylight', 0.30, A901]]),
  ez: mk([['ceil-cool', 'Ceiling supply of cool air', 1.0, 'ASHRAE 62.1-2022 Table 6-4'], ['floor-cool-a', 'Floor supply of cool air, throw ≥0.25 m/s at 1.4 m, return ≤5.5 m', 1.05, 'ASHRAE 62.1-2022 Table 6-4'], ['floor-cool-b', 'Floor supply of cool air (displacement), return ≤5.5 m', 1.2, 'ASHRAE 62.1-2022 Table 6-4'], ['floor-cool-c', 'Floor supply of cool air (displacement), return >5.5 m', 1.5, 'ASHRAE 62.1-2022 Table 6-4'], ['makeup-far', 'Makeup supply more than half the space length from exhaust/return', 0.8, 'ASHRAE 62.1-2022 Table 6-4'], ['makeup-near', 'Makeup supply less than half the space length from exhaust/return', 0.5, 'ASHRAE 62.1-2022 Table 6-4']]),
};
export const PMETA: Record<PickKey, [string, string, number]> = {
  uWall: ['External wall U-value', 'W/m²K', 0.01], uRoof: ['Roof U-value', 'W/m²K', 0.01], uGlass: ['Glazing U-value', 'W/m²K', 0.01], shgc: ['Glazing SHGC', '', 0.01],
  uSky: ['Skylight U-value', 'W/m²K', 0.01], shgcSky: ['Skylight SHGC', '', 0.01], ez: ['Zone air distribution effectiveness, Ez', '', 0.05],
};
export const ENVK: PickKey[] = ['uWall', 'uRoof', 'uGlass', 'shgc', 'uSky', 'shgcSky'];
export const PPICKS: PickKey[] = [...ENVK, 'ez'];
export const INDOOR = [
  { id: 'dbc', label: 'DBC H.2 · 24 °C/50%', db: 24, rh: 50, src: 'DBC H.4.6.3, Table H.2' },
  { id: 'safat', label: "Al Sa'fat · 24 °C/50%", db: 24, rh: 50, src: SAFAT + ' 501.03 / 402.01' },
  { id: 'ashrae', label: 'ASHRAE 55 · 24 °C/50%', db: 24, rh: 50, src: 'ASHRAE 55 (PMV ±0.5), ASHRAE 62.1 §5.12' },
];

/* envelope code sets: [id, label, option ids, compliance basis, group].
   Fix: Estidama and Barjeel publish no skylight SHGC, so they now set the ASHRAE 90.1 value explicitly
   instead of silently keeping whatever the previous code set had chosen. */
type CodeIds = Partial<Record<PickKey, string>>;
const SAF40: CodeIds = { uWall: 'safat-s', uRoof: 'safat', uGlass: 'safat-40', shgc: 'safat-40', uSky: 'safat', shgcSky: 'safat-10' };
const A901S: CodeIds = { uWall: 'a901-steel', uRoof: 'a901-deck', uGlass: 'a901-fixed', shgc: 'a901-fixed', uSky: 'a901', shgcSky: 'a901' };
export type CodeSet = [string, string, CodeIds, string, string];
export const CODESETS: CodeSet[] = [
  ['safat-s-40', SAFAT + ' Bronze/Silver, glazing ≤40%', SAF40, 'safat-s', 'Dubai · Dubai Municipality'],
  ['safat-s-60', SAFAT + ' Bronze/Silver, glazing 40–60%', { uWall: 'safat-s', uRoof: 'safat', uGlass: 'safat-60', shgc: 'safat-60', uSky: 'safat', shgcSky: 'safat-10' }, 'safat-s', 'Dubai · Dubai Municipality'],
  ['safat-s-100', SAFAT + ' Bronze/Silver, glazing ≥60%', { uWall: 'safat-s', uRoof: 'safat', uGlass: 'safat-60', shgc: 'safat-100', uSky: 'safat', shgcSky: 'safat-10' }, 'safat-s', 'Dubai · Dubai Municipality'],
  ['safat-g-40', SAFAT + ' Golden/Platinum, glazing ≤40%', { uWall: 'safat-g', uRoof: 'safat', uGlass: 'safat-40', shgc: 'safat-40', uSky: 'safat', shgcSky: 'safat-10' }, 'safat-g', 'Dubai · Dubai Municipality'],
  ['safat-g-60', SAFAT + ' Golden/Platinum, glazing 40–60%', { uWall: 'safat-g', uRoof: 'safat', uGlass: 'safat-60', shgc: 'safat-60', uSky: 'safat', shgcSky: 'safat-10' }, 'safat-g', 'Dubai · Dubai Municipality'],
  ['fz-trakhees', 'Trakhees (PCFC) free zones: ' + SAFAT + ' envelope, glazing ≤40%', SAF40, 'safat-s', 'Dubai · free zones'],
  ['fz-dda', 'DDA free zones: ' + SAFAT + ' envelope, glazing ≤40%', SAF40, 'safat-s', 'Dubai · free zones'],
  ['fz-dso', 'Dubai South / DSO / DIFC: ' + SAFAT + ' envelope, glazing ≤40%', SAF40, 'safat-s', 'Dubai · free zones'],
  ['estidama', 'Estidama Pearl (DMT), Abu Dhabi and Al Dhafra', { uWall: 'estidama', uRoof: 'estidama', uGlass: 'estidama', shgc: 'estidama', uSky: 'estidama', shgcSky: 'a901' }, 'estidama', 'Abu Dhabi · DMT'],
  ['estidama-aa', 'Estidama Pearl (DMT), Al Ain', { uWall: 'estidama', uRoof: 'estidama', uGlass: 'estidama', shgc: 'estidama', uSky: 'estidama', shgcSky: 'a901' }, 'estidama', 'Abu Dhabi · DMT'],
  ['barjeel', 'Barjeel Green Building Regulations (RAK Municipality)', { uWall: 'barjeel', uRoof: 'barjeel', uGlass: 'barjeel', shgc: 'barjeel', uSky: 'barjeel', shgcSky: 'a901' }, 'barjeel', 'Ras Al Khaimah · RAK Municipality'],
  ['shj', 'Sharjah (Sharjah Municipality, SEWA): ASHRAE 90.1-2022 CZ0 envelope', A901S, 'a901', 'Northern emirates'],
  ['ajm', 'Ajman (AMPD): ASHRAE 90.1-2022 CZ0 envelope', A901S, 'a901', 'Northern emirates'],
  ['uaq', 'Umm Al Quwain (UAQ Municipality): ASHRAE 90.1-2022 CZ0 envelope', A901S, 'a901', 'Northern emirates'],
  ['fuj', 'Fujairah (Fujairah Municipality): ASHRAE 90.1-2022 CZ0 envelope', A901S, 'a901', 'Northern emirates'],
  ['moei', 'MOEI UAE Green Building Codes (federal projects): ASHRAE 90.1-2022 CZ0 envelope', A901S, 'a901', 'Federal'],
  ['a901', 'ASHRAE 90.1-2022 CZ0: steel-framed wall, roof above deck, fixed glazing', A901S, 'a901', 'ASHRAE 90.1-2022, climate zone 0'],
  ['a901-mb', 'ASHRAE 90.1-2022 CZ0: metal building wall and roof (warehouse, industrial)', { uWall: 'a901-metal', uRoof: 'a901-metal', uGlass: 'a901-fixed', shgc: 'a901-fixed', uSky: 'a901', shgcSky: 'a901' }, 'a901', 'ASHRAE 90.1-2022, climate zone 0'],
  ['a901-op', 'ASHRAE 90.1-2022 CZ0: steel-framed wall, attic roof, operable glazing', { uWall: 'a901-steel', uRoof: 'a901-attic', uGlass: 'a901-oper', shgc: 'a901-oper', uSky: 'a901', shgcSky: 'a901' }, 'a901', 'ASHRAE 90.1-2022, climate zone 0'],
];
export const CBASIS = [
  { id: 'safat-s', label: SAFAT + ' Bronze/Silver (501.01)' }, { id: 'safat-g', label: SAFAT + ' Golden/Platinum (501.01)' },
  { id: 'estidama', label: 'Estidama Pearl (Abu Dhabi, Al Ain)' }, { id: 'barjeel', label: 'Barjeel (Ras Al Khaimah)' },
  { id: 'a901', label: 'ASHRAE 90.1-2022 climate zone 0 (Sharjah, Ajman, UAQ, Fujairah, MOEI)' },
];
export interface Limits { name: string; uWall: number; uRoof: number; uGlass: number; shgc: number; uSky: number; shgcSky: number | null; band?: string; ez?: undefined }
/* maximum permitted values for the compliance basis; glazing limits follow the project glazing ratio */
export function limitsFor(b: string, wwr: number, skyPct: number): Limits {
  if (b === 'safat-s' || b === 'safat-g') {
    const band = wwr <= 40 ? 0 : wwr < 60 ? 1 : 2;
    return { name: CBASIS.find(c => c.id === b)!.label, uWall: b === 'safat-g' ? 0.42 : 0.57, uRoof: 0.30, uGlass: band ? 1.9 : 2.1, shgc: [0.35, 0.28, 0.22][band], uSky: 1.9, shgcSky: skyPct > 10 ? 0.22 : 0.28, band: ['glazing ≤40%', 'glazing 40–60%', 'glazing ≥60%'][band] };
  }
  if (b === 'estidama') return { name: 'Estidama Pearl', uWall: 0.32, uRoof: 0.14, uGlass: 2.2, shgc: 0.30, uSky: 2.2, shgcSky: null };
  if (b === 'barjeel') return { name: 'Barjeel (RAK)', uWall: 0.48, uRoof: 0.30, uGlass: 2.2, shgc: 0.30, uSky: 1.8, shgcSky: null };
  return { name: 'ASHRAE 90.1-2022 CZ0', uWall: 0.705, uRoof: 0.22, uGlass: 2.84, shgc: 0.22, uSky: 3.97, shgcSky: 0.30 };
}

/* ASHRAE Fundamentals Ch.18 Table 1, adjusted heat gain W per person */
export interface Activity { id: string; label: string; s: number; l: number }
export const ACT: Activity[] = [
  { id: 'theater', label: 'Seated at rest (theatre)', s: 65, l: 30 },
  { id: 'vlight', label: 'Seated, very light work (office, hotel, apartment)', s: 70, l: 45 },
  { id: 'office', label: 'Moderately active office work', s: 75, l: 55 },
  { id: 'retail', label: 'Standing, light work; walking (retail)', s: 75, l: 55 },
  { id: 'bank', label: 'Walking, standing (bank, pharmacy)', s: 75, l: 70 },
  { id: 'restaurant', label: 'Sedentary work (restaurant)', s: 80, l: 80 },
  { id: 'bench', label: 'Light bench work (workshop)', s: 80, l: 140 },
  { id: 'dance', label: 'Moderate dancing', s: 90, l: 160 },
  { id: 'walk', label: 'Walking 4.8 km/h; light machine work', s: 110, l: 185 },
  { id: 'heavy', label: 'Heavy work', s: 170, l: 255 },
  { id: 'athletics', label: 'Athletics (gymnasium)', s: 210, l: 315 },
];
export const ACT_BY: Record<string, Activity> = Object.fromEntries(ACT.map(a => [a.id, a]));

/* ASHRAE 62.1-2022 Table 6-1: Rp L/s·person, Ra L/s·m², default occupant density per 100 m² */
export interface VentRow { cat: string; id: string; label: string; rp: number; ra: number; dens: number }
const V = (cat: string, id: string, label: string, rp: number, ra: number, dens: number): VentRow => ({ cat, id, label, rp, ra, dens });
export const VENT: VentRow[] = [
  V('Office buildings', 'office', 'Office space', 2.5, 0.3, 5), V('Office buildings', 'reception', 'Reception areas', 2.5, 0.3, 30), V('Office buildings', 'mainlobby', 'Main entry lobbies', 2.5, 0.3, 10), V('Office buildings', 'teldata', 'Telephone / data entry', 2.5, 0.3, 60), V('Office buildings', 'breakroom-o', 'Breakrooms (office)', 2.5, 0.6, 50), V('Office buildings', 'storage-dry', 'Occupiable storage, dry materials', 2.5, 0.3, 2),
  V('General', 'conference', 'Conference / meeting', 2.5, 0.3, 50), V('General', 'breakroom', 'Break rooms', 2.5, 0.3, 25), V('General', 'corridor', 'Corridors', 0, 0.3, 0),
  V('Educational', 'classroom58', 'Classrooms (ages 5 to 8)', 5, 0.6, 25), V('Educational', 'classroom9', 'Classrooms (age 9 plus)', 5, 0.6, 35), V('Educational', 'lecture', 'Lecture classroom', 3.8, 0.3, 65), V('Educational', 'computerlab', 'Computer lab', 5, 0.6, 25), V('Educational', 'science', 'Science laboratories', 5, 0.9, 25), V('Educational', 'art', 'Art classroom', 5, 0.9, 20), V('Educational', 'daycare', 'Daycare (through age 4)', 5, 0.9, 25), V('Educational', 'media', 'Media center', 5, 0.6, 25), V('Educational', 'multiuse', 'Multiuse assembly', 3.8, 0.3, 100),
  V('Food and beverage', 'dining', 'Restaurant dining rooms', 3.8, 0.9, 70), V('Food and beverage', 'cafeteria', 'Cafeteria / fast-food dining', 3.8, 0.9, 100), V('Food and beverage', 'bar', 'Bars, cocktail lounges', 3.8, 0.9, 100), V('Food and beverage', 'kitchen', 'Kitchen (cooking)', 3.8, 0.6, 20),
  V('Hotels and dormitories', 'hotelbed', 'Bedroom / living room', 2.5, 0.3, 10), V('Hotels and dormitories', 'barracks', 'Barracks sleeping areas', 2.5, 0.3, 20), V('Hotels and dormitories', 'hotellobby', 'Lobbies / prefunction', 3.8, 0.3, 30), V('Hotels and dormitories', 'multipurpose', 'Multipurpose assembly', 2.5, 0.3, 120), V('Hotels and dormitories', 'laundry', 'Laundry rooms, central', 2.5, 0.6, 10),
  V('Public assembly', 'auditorium', 'Auditorium seating area', 2.5, 0.3, 150), V('Public assembly', 'libraries', 'Libraries', 2.5, 0.6, 10), V('Public assembly', 'publobby', 'Lobbies', 2.5, 0.3, 150), V('Public assembly', 'museums', 'Museums / galleries', 3.8, 0.3, 40), V('Public assembly', 'worship', 'Places of religious worship', 2.5, 0.3, 120), V('Public assembly', 'courtroom', 'Courtrooms', 2.5, 0.3, 70),
  V('Retail', 'sales', 'Sales', 3.8, 0.6, 15), V('Retail', 'mall', 'Mall common areas', 3.8, 0.3, 40), V('Retail', 'supermarket', 'Supermarket', 3.8, 0.3, 8), V('Retail', 'barber', 'Barbershop', 3.8, 0.3, 25), V('Retail', 'beauty', 'Beauty and nail salons', 10, 0.6, 25),
  V('Sports and entertainment', 'aerobics', 'Health club / aerobics room', 10, 0.3, 40), V('Sports and entertainment', 'healthweight', 'Health club / weight rooms', 10, 0.3, 10), V('Sports and entertainment', 'arena', 'Gym, sports arena (play area)', 10, 0.9, 7), V('Sports and entertainment', 'spectator', 'Spectator areas', 3.8, 0.3, 150), V('Sports and entertainment', 'disco', 'Disco / dance floors', 10, 0.3, 100), V('Sports and entertainment', 'stage', 'Stages, studios', 5, 0.3, 70),
  V('Miscellaneous', 'bank', 'Banks or bank lobbies', 3.8, 0.3, 15), V('Miscellaneous', 'computer', 'Computer (not printing)', 2.5, 0.3, 4), V('Miscellaneous', 'pharmacy', 'Pharmacy (prep. area)', 2.5, 0.9, 10), V('Miscellaneous', 'manufacturing', 'Manufacturing, no hazardous materials', 5, 0.9, 7), V('Miscellaneous', 'shipping', 'Shipping / receiving', 5, 0.6, 2), V('Miscellaneous', 'sorting', 'Sorting, packing, light assembly', 3.8, 0.6, 7), V('Miscellaneous', 'transport', 'Transportation waiting', 3.8, 0.3, 100), V('Miscellaneous', 'warehouse', 'Warehouses', 5, 0.3, 0),
];
export const VENT_BY: Record<string, VentRow> = Object.fromEntries(VENT.map(v => [v.id, v]));
export const VENT_ALIAS: Record<string, string> = { health: 'healthweight' };

/* Room types. dbc = DBC Table B.2 occupant load factor [m²/person, use]; a901 = ASHRAE 90.1-2022 space-by-space LPD, W/m² (Tables 9.5.2.1-1/-2);
   lightDef 'typ' keeps the typical design value as the default lighting load, the 90.1 allowance is then the compliance limit and a selectable option */
export interface RoomType { label: string; vent: string; act: string; dens: number; light: number; equip: number; a901?: number; lightDef?: 'typ'; dbc?: [number, string]; oaDef?: string }
export const TYPES: Record<string, RoomType> = {
  office: { label: 'Office, open plan', vent: 'office', act: 'office', dens: 10, light: 9, equip: 15, a901: 6.0, dbc: [4.6, 'Office, open, high concentration'] },
  privoffice: { label: 'Office, enclosed', vent: 'office', act: 'office', dens: 10, light: 9, equip: 15, a901: 7.9, dbc: [9.3, 'Office, enclosed, low concentration'] },
  meeting: { label: 'Meeting / conference', vent: 'conference', act: 'office', dens: 2, light: 10, equip: 5, a901: 9.5, dbc: [1.4, 'Conference, meeting rooms'] },
  lobby: { label: 'Reception / seated waiting', vent: 'reception', act: 'office', dens: 10, light: 10, equip: 5, a901: 8.6, lightDef: 'typ', dbc: [1.4, 'Seated waiting areas'] },
  waiting: { label: 'Standing waiting area', vent: 'transport', act: 'bank', dens: 2, light: 10, equip: 2, a901: 8.6, lightDef: 'typ', dbc: [0.65, 'Waiting areas, standing'] },
  retail: { label: 'Retail shop / showroom', vent: 'sales', act: 'retail', dens: 6.7, light: 15, equip: 5, a901: 9.1, lightDef: 'typ', dbc: [5.6, 'Retail shops'] },
  deptstore: { label: 'Department store', vent: 'sales', act: 'retail', dens: 5, light: 15, equip: 5, a901: 9.1, lightDef: 'typ', dbc: [3.7, 'Department stores, multi-level retail'] },
  mall: { label: 'Mall common area', vent: 'mall', act: 'bank', dens: 4, light: 12, equip: 3, a901: 6.1, lightDef: 'typ', dbc: [2.8, 'Mall under 14,000 m² GLA'] },
  restaurant: { label: 'Restaurant dining', vent: 'dining', act: 'restaurant', dens: 3, light: 10, equip: 10, a901: 5.6, lightDef: 'typ', dbc: [1.4, 'Restaurants, dining areas'] },
  foodcourt: { label: 'Food court / cafeteria seating', vent: 'cafeteria', act: 'restaurant', dens: 2, light: 10, equip: 10, a901: 3.9, lightDef: 'typ', dbc: [1.4, 'Food courts, seating areas'] },
  kitchen: { label: 'Commercial kitchen', vent: 'kitchen', act: 'walk', dens: 10, light: 12, equip: 40, a901: 12.8, lightDef: 'typ', dbc: [9.3, 'Kitchens (not private residential)'] },
  classroom: { label: 'Classroom', vent: 'classroom9', act: 'office', dens: 2.86, light: 10, equip: 10, a901: 7.8, dbc: [1.9, 'Classrooms'] },
  lab: { label: 'Laboratory, vocational / science', vent: 'science', act: 'bench', dens: 6, light: 12, equip: 20, a901: 13, lightDef: 'typ', dbc: [4.6, 'Laboratories, vocational'] },
  library: { label: 'Library reading area', vent: 'libraries', act: 'vlight', dens: 5, light: 10, equip: 5, a901: 9.3, lightDef: 'typ', dbc: [4.6, 'Library, reading areas'] },
  assembly: { label: 'Ballroom / multipurpose hall', vent: 'multipurpose', act: 'restaurant', dens: 1.5, light: 12, equip: 5, a901: 9.5, lightDef: 'typ', dbc: [0.65, 'Concentrated assembly: ballrooms, multipurpose halls'] },
  exhibition: { label: 'Exhibition hall / gallery', vent: 'museums', act: 'retail', dens: 4, light: 12, equip: 10, a901: 5.4, lightDef: 'typ', dbc: [1.4, 'Exhibition halls'] },
  prayer: { label: 'Prayer room / mosque', vent: 'worship', act: 'theater', dens: 1.2, light: 8, equip: 0, a901: 7.8, lightDef: 'typ', dbc: [0.9, 'Mosques, prayer areas'] },
  gym: { label: 'Gym with equipment', vent: 'healthweight', act: 'athletics', dens: 10, light: 10, equip: 15, a901: 8.8, lightDef: 'typ', dbc: [4.6, 'Exercise room with equipment'] },
  aerobics: { label: 'Exercise room, no equipment', vent: 'aerobics', act: 'athletics', dens: 4, light: 10, equip: 5, a901: 8.8, lightDef: 'typ', dbc: [1.4, 'Exercise room without equipment'] },
  living: { label: 'Living / majlis (residential)', vent: 'hotelbed', act: 'vlight', dens: 5, light: 6, equip: 8 },
  bedroom: { label: 'Bedroom (residential / hotel)', vent: 'hotelbed', act: 'theater', dens: 8, light: 5, equip: 5, a901: 4.4, lightDef: 'typ' },
  dorm: { label: 'Shared sleeping accommodation', vent: 'barracks', act: 'theater', dens: 6, light: 5, equip: 3, a901: 5.2, lightDef: 'typ', dbc: [5.0, 'Accommodation, shared sleeping spaces'] },
  labour: { label: 'Labour accommodation sleeping', vent: 'barracks', act: 'theater', dens: 4, light: 5, equip: 3, a901: 5.2, lightDef: 'typ', dbc: [3.7, 'Labour accommodation, sleeping spaces'] },
  corridor: { label: 'Corridor', vent: 'corridor', act: 'retail', dens: 0, light: 5, equip: 0, a901: 4.7 },
  factory: { label: 'Factory / light assembly', vent: 'manufacturing', act: 'walk', dens: 15, light: 10, equip: 20, a901: 9.1, lightDef: 'typ', dbc: [9.3, 'Factories'] },
  warehouse: { label: 'Warehouse / storage', vent: 'warehouse', act: 'bench', dens: 100, light: 6, equip: 3, a901: 3.6, dbc: [27.9, 'Warehouse'] },
  dwelling: { label: 'Apartment / villa, whole dwelling unit', vent: 'hotelbed', oaDef: 'a622', act: 'vlight', dens: 20, light: 5, equip: 5 },
  patient: { label: 'Patient room (healthcare, DHA)', vent: 'hotelbed', oaDef: 'a170-patient', act: 'theater', dens: 10, light: 8, equip: 10, a901: 8.4, lightDef: 'typ' },
  exam: { label: 'Examination / treatment room (healthcare)', vent: 'office', oaDef: 'a170-exam', act: 'office', dens: 5, light: 12, equip: 15, a901: 14.3, lightDef: 'typ' },
  icu: { label: 'Critical / intensive care (healthcare)', vent: 'hotelbed', oaDef: 'a170-icu', act: 'office', dens: 8, light: 12, equip: 25 },
  theatre: { label: 'Operating room (healthcare)', vent: 'office', oaDef: 'a170-or', act: 'walk', dens: 5, light: 25, equip: 60, a901: 24.9, lightDef: 'typ' },
  hwait: { label: 'Waiting room (healthcare, emergency / radiology)', vent: 'reception', oaDef: 'a170-wait', act: 'theater', dens: 2, light: 9, equip: 3, a901: 8.6, lightDef: 'typ' },
};
export const typeOf = (id: string) => TYPES[id] || TYPES.office;

/* ASHRAE 170-2021 Table 7-1 (via DBC H.4.10.2 and DHA): minimum outdoor and total air changes per hour */
export const A170: [string, string, number, number][] = [['patient', 'Patient room', 2, 4], ['exam', 'Examination room', 2, 4], ['treat', 'Treatment room', 2, 6], ['icu', 'Critical and intensive care', 2, 6], ['or', 'Operating room', 4, 20], ['wait', 'Emergency / radiology waiting', 2, 12]];
/* ASHRAE 90.1-2022 Table 9.5.1 Building Area Method lighting power allowances, W/ft² */
export const LPD_BAM: [string, string, number][] = [['auto', 'Automotive facility', 0.73], ['convention', 'Convention center', 0.64], ['court', 'Courthouse', 0.75], ['dining-bar', 'Dining: bar lounge / leisure', 0.74], ['dining-caf', 'Dining: cafeteria / fast food', 0.70], ['dining-fam', 'Dining: family', 0.65], ['dorm', 'Dormitory', 0.52], ['exercise', 'Exercise center', 0.72], ['fire', 'Fire station', 0.56], ['gymnasium', 'Gymnasium', 0.75], ['clinic', 'Health care clinic', 0.77], ['hospital', 'Hospital', 0.92], ['hotel', 'Hotel / motel', 0.53], ['library', 'Library', 0.83], ['mfg', 'Manufacturing facility', 0.82], ['cinema', 'Motion picture theater', 0.43], ['multifamily', 'Multifamily', 0.46], ['museum', 'Museum', 0.56], ['office', 'Office', 0.62], ['parking', 'Parking garage', 0.17], ['penitentiary', 'Penitentiary', 0.65], ['theater', 'Performing arts theater', 0.82], ['police', 'Police station', 0.62], ['post', 'Post office', 0.64], ['religious', 'Religious facility', 0.66], ['retail', 'Retail', 0.78], ['school', 'School / university', 0.70], ['sports', 'Sports arena', 0.73], ['townhall', 'Town hall', 0.67], ['transport', 'Transportation', 0.56], ['warehouse', 'Warehouse', 0.45], ['workshop', 'Workshop', 0.86]];
export const bamWm2 = (wft2: number) => Math.round(wft2 * 10.764 * 10) / 10;

/* what is above and below each room */
export const ABOVE: [string, string][] = [['roof', 'Roof, sun-exposed'], ['cond', 'Ceiling, conditioned above'], ['uncond', 'Ceiling, unconditioned above']];
export const BELOW: [string, string][] = [['cond', 'Floor, conditioned below'], ['uncond', 'Floor, unconditioned below'], ['outdoor', 'Floor, outdoor air below'], ['ground', 'Slab on grade']];
/* unconditioned adjacent spaces: ASHRAE: unknown unconditioned space ≈ outdoor − 2.8 K (5 °F) */
export type AdjFn = ((To: number, Ti: number) => number) | null;
export const ADJ: [string, string, AdjFn, string][] = [
  ['cond', 'Conditioned space, same set-point (no gain)', (_To, Ti) => Ti, 'room temp.'],
  ['cond2', 'Conditioned space, different set-point', null, 'edit temp.'],
  ['mezz', 'Unconditioned mezzanine floor', (To) => To - 2.8, 'To − 2.8 K'],
  ['store', 'Unconditioned store or service room', (To) => To - 2.8, 'To − 2.8 K'],
  ['corridor', 'Unconditioned corridor, lobby or stair', (To) => To - 2.8, 'To − 2.8 K'],
  ['plant', 'Plant or electrical room (ventilated)', (To) => To, 'To'],
  ['carpark', 'Car park (ventilated, DBC H.4.12.11)', (To) => To, 'To'],
  ['attic', 'Roof void or attic (ventilated)', (To) => To, 'To'],
  ['plenum', 'Return-air ceiling plenum', (_To, Ti) => Ti + 2, 'Ti + 2 K'],
  ['project', 'Project value (section 3)', null, 'section 3'],
  ['custom', 'Custom temperature', null, 'custom'],
];
export const ADJ_EDIT = (id: string) => id === 'custom' || id === 'cond2';
export const PXDEF: Record<string, string> = { wall: 'corridor', ceiling: 'plenum', floor: 'mezz' };

/* basis options for outdoor design conditions */
export interface DesignOpt { id: string; label: string; db?: number; wb?: number; src: string }
export const OUT_OPTS: DesignOpt[] = [
  { id: 'dbc', label: 'DBC H.1 · 46/29', db: 46, wb: 29, src: 'DBC Table H.1' },
  { id: 'safat', label: "Al Sa'fat · 46/29", db: 46, wb: 29, src: SAFAT + ' 501.03' },
  { id: 'doe-ad', label: 'DOE Abu Dhabi · 46.1/29.4', db: 46.1, wb: 29.4, src: 'DOE CLM Table 1' },
  { id: 'doe-aa', label: 'DOE Al Ain · 48.8/28.3', db: 48.8, wb: 28.3, src: 'DOE CLM Table 1' },
  { id: 'ash-dxb', label: 'ASHRAE Dubai · 43.3/23.6', db: 43.3, wb: 23.6, src: 'ASHRAE Fundamentals 2021' },
  { id: 'ash-auh', label: 'ASHRAE Abu Dhabi · 45.1/23.0', db: 45.1, wb: 23.0, src: 'ASHRAE Fundamentals 2021' },
  { id: 'ash-shj', label: 'ASHRAE Sharjah · 44.3/23.5', db: 44.3, wb: 23.5, src: 'ASHRAE Fundamentals 2021' },
  { id: 'ash-rak', label: 'ASHRAE RAK · 44.7/24.4', db: 44.7, wb: 24.4, src: 'ASHRAE Fundamentals 2021' },
  { id: 'ash-fuj', label: 'ASHRAE Fujairah · 42.9/21.9', db: 42.9, wb: 21.9, src: 'ASHRAE Fundamentals 2021' },
  { id: 'ash-aan', label: 'ASHRAE Al Ain · 46.0/22.5', db: 46.0, wb: 22.5, src: 'ASHRAE Fundamentals 2021' },
];
export const VENT_OPTS: DesignOpt[] = [
  { id: 'dbc', label: 'DBC H.4.6.4 · 34/32', db: 34, wb: 32, src: 'DBC H.4.6.4' },
  { id: 'doe-ad', label: 'DOE Abu Dhabi · 35.3/30.6', db: 35.3, wb: 30.6, src: 'DOE CLM Table 2' },
  { id: 'doe-aa', label: 'DOE Al Ain · 35.8/28.8', db: 35.8, wb: 28.8, src: 'DOE CLM Table 2' },
  { id: 'same', label: 'Same as cooling', src: 'Cooling design condition' },
];
export const LOC_SRC: Record<string, [string, string]> = { dubai: ['dbc', 'dbc'], abudhabi: ['doe-ad', 'doe-ad'], alain: ['doe-aa', 'doe-aa'], sharjah: ['dbc', 'dbc'], ajman: ['dbc', 'dbc'], uaq: ['dbc', 'dbc'], rak: ['dbc', 'dbc'], fujairah: ['dbc', 'dbc'] };

/* ASHRAE 2021 climatic design data, 0.4% cooling DB and mean coincident WB (station, WMO) */
export const ASH04: Record<string, { db: number; wb: number; st: string }> = {
  dubai: { db: 43.3, wb: 23.6, st: 'Dubai Intl (411940)' }, abudhabi: { db: 45.1, wb: 23.0, st: 'Abu Dhabi Intl (412170)' }, alain: { db: 46.0, wb: 22.5, st: 'Al Ain Intl (412180)' },
  sharjah: { db: 44.3, wb: 23.5, st: 'Sharjah Intl (411960)' }, ajman: { db: 44.3, wb: 23.5, st: 'Sharjah Intl (411960), nearest station' }, uaq: { db: 44.3, wb: 23.5, st: 'Sharjah Intl (411960), nearest station' },
  rak: { db: 44.7, wb: 24.4, st: 'Ras Al Khaimah Intl (411840)' }, fujairah: { db: 42.9, wb: 21.9, st: 'Fujairah Intl (411980)' },
};

/* Operating schedules for the heat balance method: fraction of the design gain in each hour (index 0 = 00:00–01:00).
   Outside operating hours lighting is taken at 10% and equipment at 20% (standby); these are assumptions, edit the room gains to suit. */
export interface Schedule { id: string; label: string; people: number[]; light: number[]; equip: number[] }
const on = (from: number, to: number) => Array.from({ length: 24 }, (_, i) => { const h = i; return from < to ? h >= from && h < to : h >= from || h < to; });
const sched = (id: string, label: string, from: number, to: number): Schedule => {
  const o = on(from, to);
  return { id, label, people: o.map(x => x ? 1 : 0), light: o.map(x => x ? 1 : 0.1), equip: o.map(x => x ? 1 : 0.2) };
};
const ALL = Array(24).fill(1);
export const SCHEDULES: Schedule[] = [
  { id: '24h', label: '24 hours at full design gains', people: ALL, light: ALL, equip: ALL },
  sched('day', '08:00 to 18:00 (office, school, clinic)', 8, 18),
  sched('ext', '10:00 to 22:00 (retail, mall, restaurant)', 10, 22),
  sched('eve', '16:00 to 08:00 (homes, hotel rooms)', 16, 8),
];

/* Design-day profile: ASHRAE Fundamentals Ch. 14 fraction of daily range by hour (1–24, solar time) */
export const DRF = [0.88, 0.92, 0.95, 0.98, 1.00, 0.98, 0.91, 0.74, 0.55, 0.38, 0.23, 0.13, 0.05, 0.00, 0.00, 0.06, 0.14, 0.24, 0.39, 0.50, 0.59, 0.68, 0.75, 0.82];
export const DBC_DR = 13.8;
