/* Power supply: the building's hourly electrical demand over a year, supplied by solar PV, the grid and a genset,
   with the energy, cost, fuel and CO₂ of each source.
   Demand comes from the hourly analysis (the cooling plant's electrical input, optionally with lighting and equipment)
   or from a custom profile. The supply is split hour by hour by capacity (solar first, then the grid up to its limit
   and hours, then the genset for the rest) or by fixed shares of each hour's demand.
   Genset fuel follows the linear fuel curve used by HOMER: L/h = 0.08145 × rated kW + 0.246 × output kW, while running. */
import { computeAll, type Computed } from './calc';
import { stationOf } from './climate';
import { SCHEDULES } from './data';
import { electrical } from './hourly';
import { clearSky, sunGeom } from './hbm/solar';
import { exampleState, migrate } from './project';
import { layout, roofOf, toLatLon, type LatLon, type RoofSettings } from './roof';
import type { AppState, Num, ProjectSnap } from './types';
export type { ProjectSnap } from './types';
import { blank, num } from './util';
import { simulateYear } from './weather/simulate';
import { when } from './weather/dataset';
import type { WeatherRef, WeatherYear } from './weather/types';

export interface OpSchedule { id: string; name: string; days: boolean[]; from: Num; to: Num; kW?: Num }
export type PowerBasis = 'design' | 'weather' | 'custom' | 'project';
export interface PowerSettings {
  /* demand: this project's design days (each month's design day repeated) or real weather year, a custom profile,
     or another NOVAC project (its design days or this project's weather year) */
  basis?: PowerBasis;
  proj?: ProjectSnap | null; projBasis?: 'design' | 'weather';
  /* add the rooms' lighting and equipment power, on each room's schedule, to the cooling plant */
  other?: boolean;
  /* operating schedule: the days of operation (Monday first) and hours of operation (from, to, 0–24, wrapping past midnight);
     for a linked project, whether the schedule applies to its demand and the plant's standby share outside it, % */
  opDays?: boolean[]; opFrom?: Num; opTo?: Num; opApply?: boolean; opStandby?: Num;
  /* several operating schedules splitting the week, e.g. weekdays 4 h and the weekend 12 h: each day belongs to at most one;
     each has its own hours and, for an independent study, its own demand while operating (blank: the common demand) */
  opScheds?: OpSchedule[];
  /* custom demand: kW while operating and kW outside the operating schedule (older files: cFrom, cTo, cDays) */
  cKW?: Num; cBase?: Num; cFrom?: Num; cTo?: Num; cDays?: Num;
  /* real weather for energy modelling: its own weather year (blank: the project's), and whether an independent study
     takes its solar and calendar from it rather than the typical clear-sky year */
  wxRef?: WeatherRef | null; indWx?: boolean;
  /* custom demand entered as operating hours, or as a 24-hour profile of kW (hour 1 = 00:00–01:00) */
  cMode?: 'hours' | 'profile'; cProfile?: Num[];
  /* customised values applied to any demand: cooling COP at 35 °C and auxiliary kW/TR in place of the project's
     (blank: the project's own), a demand multiplier %, and an extra load in kW between two hours */
  cop?: Num; aux?: Num; scale?: Num; addKW?: Num; addFrom?: Num; addTo?: Num;
  /* the additional power demand above is applied only when switched on */
  extraOn?: boolean;
  /* connection: on-grid (the utility's rules, DEWA in Dubai) or off-grid (no grid: solar, battery and an optional backup genset);
     off-grid sizing: days of autonomy, the design day (the peak day's or the average day's energy) and whether a backup genset is fitted */
  conn?: 'on' | 'off'; autonomy?: Num;
  /* which scenarios are calculated: on-grid (on unless switched off) and off-grid (off unless switched on) */
  onCalc?: boolean; offCalc?: boolean; offDay?: 'peak' | 'avg'; offGen?: boolean;
  /* the off-grid scenario's own supply settings (panels, battery, genset…), kept apart from the on-grid ones */
  offSup?: Partial<PowerSettings>;
  /* supply split: hour by hour by capacity, or fixed shares of demand */
  split?: 'capacity' | 'share';
  /* fixed shares entered as % of demand, or as kW of the Total Connected Load (the genset takes the rest of the TCL) */
  shareUnit?: 'pct' | 'kw'; gridPct?: Num; solarPct?: Num; gridKWs?: Num; solarKWs?: Num;
  /* solar PV: number of panels, panel rating (Wp, DC), DC performance ratio (temperature, soiling, mismatch and DC wiring
     losses, before the inverter), DC/AC ratio for the suggested inverter, inverter DC-to-AC efficiency %, and the
     inverter AC rating, kW (blank: the suggested size) */
  panels?: Num; panelW?: Num; pr?: Num; dcac?: Num; invEff?: Num; invKW?: Num;
  /* utility connection rules for the PV size: DEWA Shams Dubai, none, or '' for automatic (DEWA for Dubai projects),
     and the plot's Total Connected Load, kW (blank: estimated from the peak demand) */
  utility?: '' | 'dewa' | 'none'; tcl?: Num;
  /* on-grid design: size the PV to the DEWA maximum for the TCL, or the user's own panels and inverter */
  ogMode?: 'tcl' | 'own';
  /* grid tariff: DEWA's slab tariff with net metering (monthly bills), or a flat rate per kWh (tGrid);
     DEWA account category, fuel surcharge AED/kWh and VAT */
  tariff?: 'dewa' | 'flat'; dewaCat?: 'res' | 'com' | 'ind'; fuelSur?: Num; vat?: boolean;
  /* panel tilt from horizontal, ° and azimuth, ° clockwise from north (180 = facing south); ground reflectance */
  tilt?: Num; az?: Num; albedo?: Num;
  /* the roof layout drawn on satellite imagery; with auto on it sets the panel count and rating */
  roof?: RoofSettings;
  /* battery: on/off, nominal capacity kWh (blank: suggested), power kW (blank: 0.5 C), depth of discharge %, round-trip efficiency %,
     and what it displaces first: grid ('self', self-consumption) or genset ('backup') */
  bat?: boolean; batKWh?: Num; batKW?: Num; dod?: Num; rte?: Num; batUse?: 'self' | 'backup';
  /* the remaining load after solar and the battery: the share taken from the grid, %, the genset taking the rest
     (blank: all from the grid on-grid, none off-grid) */
  remGrid?: Num;
  /* grid supply limit, kW (blank: no limit, 0: no grid), and the hours the grid is available (from, to) */
  gridKW?: Num; gridFrom?: Num; gridTo?: Num;
  /* export solar the building cannot use or store, for a credit */
  export?: boolean;
  /* genset: rating in kVA (blank: suggested) and power factor */
  genKVA?: Num; pf?: Num;
  /* recommended genset: sized on the building's peak load day (full backup) or on what the genset supplies,
     with a safety margin, % */
  genBasis?: 'peakday' | 'supplied'; genMargin?: Num;
  /* running costs, AED: grid tariff per kWh, solar per kWh used (PPA or O&M), export credit per kWh, genset maintenance per kWh, diesel per litre */
  tGrid?: Num; tSolar?: Num; tExport?: Num; genOM?: Num; diesel?: Num;
  /* capital costs, AED: PV installed per Wp, inverter per kW, battery per kWh, genset per kVA */
  cPV?: Num; cInv?: Num; cBat?: Num; cGen?: Num;
  /* grid emission factor, kg CO₂ per kWh */
  efGrid?: Num;
}

export const POWER_DEFAULTS: Required<PowerSettings> = {
  basis: 'design', proj: null, projBasis: 'design', other: false,
  wxRef: null, indWx: true,
  opDays: [true, true, true, true, true, false, false], opFrom: 8, opTo: 18, opApply: false, opStandby: 10, opScheds: [],
  cKW: 50, cBase: 5, cFrom: '', cTo: '', cDays: '', cMode: 'hours', cProfile: [],
  cop: '', aux: '', scale: 100, addKW: 0, addFrom: 0, addTo: 24, extraOn: false,
  conn: 'on', autonomy: 1, offDay: 'peak', offGen: true, offSup: {}, onCalc: true, offCalc: false,
  split: 'capacity', shareUnit: 'pct', gridPct: 70, solarPct: 20, gridKWs: '', solarKWs: '',
  panels: 0, panelW: 550, pr: 0.82, dcac: 1.15, invEff: 97, invKW: '',
  utility: '', tcl: '', ogMode: 'own', tariff: 'dewa', dewaCat: 'com', fuelSur: 0.06, vat: true, tilt: 0, az: 180, albedo: 0.2, roof: {},
  bat: false, batKWh: '', batKW: '', dod: 90, rte: 90, batUse: 'self',
  gridKW: '', gridFrom: 0, gridTo: 24, export: false, remGrid: '',
  genKVA: '', pf: 0.8, genBasis: 'peakday', genMargin: 20,
  tGrid: 0.44, tSolar: 0, tExport: 0, genOM: 0.05, diesel: 3,
  cPV: 2.5, cInv: 400, cBat: 1500, cGen: 600,
  efGrid: 0.4,
};
export const settingsOf = (s?: PowerSettings): Required<PowerSettings> => {
  const r = { ...POWER_DEFAULTS, ...(s || {}) };
  /* older settings: operating hours and a count of working days (Monday to Friday, then Saturday, then Sunday) */
  if (s && !s.opDays && !blank(s.cDays)) { const n = Math.max(0, Math.min(7, Math.round(num(s.cDays)))); r.opDays = [0, 1, 2, 3, 4, 5, 6].map(i => i < n); }
  if (s && s.opFrom == null && !blank(s.cFrom)) r.opFrom = s.cFrom!;
  if (s && s.opTo == null && !blank(s.cTo)) r.opTo = s.cTo!;
  /* older settings had no switch: values already entered stay applied */
  /* older settings already set to off-grid: keep that scenario calculated */
  if (s && s.offCalc == null && s.conn === 'off') r.offCalc = true;
  if (s && s.extraOn == null) r.extraOn = !blank(s.cop) || !blank(s.aux) || (!blank(s.scale) && num(s.scale) !== 100) || !!num(s.addKW);
  return r;
};

/* on-grid and off-grid are separate scenarios: these supply settings belong to each scenario; everything else
   (project link, schedule, weather, demand, cost rates) is shared */
export const SUPPLY_KEYS: (keyof PowerSettings)[] = [
  'split', 'shareUnit', 'gridPct', 'solarPct', 'gridKWs', 'solarKWs', 'panels', 'panelW', 'pr', 'dcac', 'invEff', 'invKW', 'tilt', 'az', 'roof',
  'bat', 'batKWh', 'batKW', 'dod', 'rte', 'batUse', 'gridKW', 'gridFrom', 'gridTo', 'export', 'remGrid', 'ogMode', 'genKVA', 'pf', 'genBasis', 'genMargin', 'autonomy', 'offDay', 'offGen',
];
/* the settings of one scenario: on-grid uses the settings as they are, off-grid lays its own supply settings over them */
export function scenarioOf(power: PowerSettings | undefined, conn: 'on' | 'off'): Required<PowerSettings> {
  const r = settingsOf(power);
  return conn === 'off' ? settingsOf({ ...(power || {}), ...(power?.offSup || {}), conn: 'off' }) : { ...r, conn: 'on' };
}
/* the supply settings to start the off-grid scenario from: a copy of the on-grid ones */
export function seedOffGrid(power: PowerSettings | undefined): Partial<PowerSettings> {
  const r = settingsOf(power), o: Partial<PowerSettings> = {};
  for (const k of SUPPLY_KEYS) (o as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(r[k] ?? null));
  return { ...o, split: 'capacity', bat: true, gridKW: '', remGrid: 0, export: false };
}
/* every result of one scenario: the dispatch with its sized battery, the off-grid sizing and the payback */
export function runScenario(D: Demand, s0: Required<PowerSettings>) {
  const off = s0.conn === 'off';
  /* on-grid sized from the TCL: the panels and inverter follow the DEWA maximum */
  const s = !off && s0.ogMode === 'tcl' && s0.utility === 'dewa' && !blank(s0.tcl)
    ? (() => { const t = tclSizing(num(s0.tcl), num(s0.panelW), num(s0.dcac)); return { ...s0, panels: t.panels, invKW: t.invKW as Num, roof: { ...(s0.roof || {}), auto: false } }; })() : s0;
  const batSug = s.bat && !off ? suggestBattery(D, s) : 0, og = off ? offGridSizing(D, s) : null;
  const R = dispatch(D, s, { batKWh: blank(s.batKWh) ? (og ? og.batKWh : s.bat ? batSug : undefined) : undefined, batKW: og && blank(s.batKW) ? og.batKW : undefined });
  return { R, og, batSug, pb: payback(D, s, R), s };
}

/* the share of the remaining load (after solar and the battery) taken from the grid, 0–1: blank means all on-grid, none off-grid */
export const remGridShare = (s: Required<PowerSettings>) => blank(s.remGrid) ? (s.conn === 'off' ? 0 : 1) : Math.max(0, Math.min(100, num(s.remGrid))) / 100;

/* the remaining power requirement after solar and the battery, and how the grid and the genset share it */
export function remainingOf(R: PowerResult) {
  let kWh = 0, peak = 0, peakAt = 0, hours = 0, gPk = 0, gnPk = 0;
  for (let i = 0; i < R.n; i++) {
    const v = R.grid[i] + R.gen[i] + R.unmet[i];
    kWh += v; if (v > peak) { peak = v; peakAt = i; } if (v > 1e-9) hours++;
    gPk = Math.max(gPk, R.grid[i]); gnPk = Math.max(gnPk, R.gen[i]);
  }
  return { kWh, peak, peakAt, hours, avg: hours ? kWh / hours : 0, share: R.demandKWh > 0 ? kWh / R.demandKWh : 0,
    grid: { kWh: R.gridKWh, peak: gPk }, gen: { kWh: R.genKWh, peak: gnPk }, unmet: { kWh: R.unmetKWh, hours: R.unmetHours } };
}

/* standard operating schedules: days (Monday first) and hours */
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_PRESETS: { id: string; label: string; days: boolean[] }[] = [
  { id: 'mon-fri', label: 'Monday to Friday (UAE working week)', days: [true, true, true, true, true, false, false] },
  { id: 'mon-sat', label: 'Monday to Saturday', days: [true, true, true, true, true, true, false] },
  { id: 'sun-thu', label: 'Sunday to Thursday', days: [true, true, true, true, false, false, true] },
  { id: 'all', label: 'Every day', days: [true, true, true, true, true, true, true] },
];
export const HOUR_PRESETS: { id: string; label: string; from: number; to: number }[] = [
  { id: '24h', label: '24 hours', from: 0, to: 24 },
  { id: 'office', label: '08:00 to 18:00 (office)', from: 8, to: 18 },
  { id: 'nine-five', label: '09:00 to 17:00', from: 9, to: 17 },
  { id: 'gov', label: '07:30 to 15:30 (government, school) · as 07:00 to 16:00', from: 7, to: 16 },
  { id: 'retail', label: '10:00 to 22:00 (retail, mall, restaurant)', from: 10, to: 22 },
  { id: 'clinic', label: '08:00 to 22:00 (clinic, gym)', from: 8, to: 22 },
  { id: 'night', label: '16:00 to 08:00 (homes, hotel rooms)', from: 16, to: 8 },
];
/* the operating schedules in force: the list, or one schedule from the single days and hours (older settings) */
export function schedulesOf(s: Required<PowerSettings>): OpSchedule[] {
  if (s.opScheds && s.opScheds.length) return s.opScheds;
  return [{ id: 'main', name: 'Operating', days: s.opDays && s.opDays.length === 7 ? s.opDays : POWER_DEFAULTS.opDays, from: s.opFrom, to: s.opTo }];
}
/* the day index (0 = Monday) of hour i of the year */
export const dayIndex = (year: number, i: number) => (new Date(Date.UTC(year, 0, 1 + Math.floor(i / 24))).getUTCDay() + 6) % 7;
/* the schedule a day belongs to (the first that lists it), or null when no schedule covers the day */
export function scheduleOfDay(scheds: OpSchedule[], di: number) { return scheds.find(x => x.days?.[di]) ?? null; }
/* the schedule whose operating hours include hour i of the year, or null outside every schedule */
export function operatingAt(s: Required<PowerSettings>, year: number, i: number, scheds = schedulesOf(s)) {
  const x = scheduleOfDay(scheds, dayIndex(year, i));
  return x && inWindow(i % 24, num(x.from), num(x.to)) ? x : null;
}
export const operating = (s: Required<PowerSettings>, year: number, i: number) => !!operatingAt(s, year, i);
/* hours a day a schedule runs: from–to, wrapping past midnight; equal start and end means 24 h */
export const spanOf = (from: Num, to: Num) => { const f = num(from), t = num(to); return f === t ? 24 : f < t ? t - f : 24 - f + t; };
/* operating hours in a year under the schedules */
export function operatingHours(s: Required<PowerSettings>, year = 2025, n = 8760) { const sc = schedulesOf(s); let c = 0; for (let i = 0; i < n; i++) if (operatingAt(s, year, i, sc)) c++; return c; }
/* days claimed by more than one schedule, and days no schedule covers (0 = Monday) */
export function coverage(scheds: OpSchedule[]) {
  const count = [0, 0, 0, 0, 0, 0, 0]; scheds.forEach(x => x.days?.forEach((v, i) => { if (v) count[i]++; }));
  return { overlap: count.map((c, i) => c > 1 ? i : -1).filter(i => i >= 0), uncovered: count.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0) };
}

/* standard sizes for suggestions: inverters (kW AC) and gensets (kVA prime) */
/* standard battery capacities, kWh: home modules, commercial cabinets and containers */
export const BATTERIES = [5, 10, 13.5, 15, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 215, 250, 300, 400, 500, 750, 1000];
export const INVERTERS = [3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 36, 40, 50, 60, 75, 100, 110, 125, 150];
const GENSETS = [10, 15, 20, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 350, 400, 500, 600, 750, 800, 1000, 1250, 1500, 2000, 2500];
/* the smallest standard size at or above x; above the list, multiples of the largest */
const roundUp = (x: number, list: number[]) => { if (x <= 0) return 0; const f = list.find(v => v >= x - 1e-9); if (f) return f; const top = list[list.length - 1]; return Math.ceil(x / top) * top; };
/* the largest standard size at or below x; above the list, multiples of the largest; below it, x itself */
const roundDown = (x: number, list: number[]) => { if (x <= 0) return 0; const top = list[list.length - 1]; if (x >= top) return Math.floor(x / top) * top; const f = [...list].reverse().find(v => v <= x + 1e-9); return f ?? x; };
/* the suggested inverter: DC kWp ÷ DC/AC ratio, up to the next standard size, but within the utility limit on AC capacity */
export const suggestInverter = (kWp: number, dcac = 1.15, capKW = Infinity) => {
  const x = roundUp(kWp / (dcac > 0 ? dcac : 1), INVERTERS);
  return x <= capKW ? x : roundDown(capKW, INVERTERS);
};

/* DEWA Shams Dubai: Connection Conditions for Generators of Electricity from Solar Energy, Version 4 (June 2022), 2.2.
   The sum of the Maximum Capacity of the Renewable Generators in a plot, which is the inverters' maximum AC active power,
   may not exceed a share of the plot's Total Connected Load (TCL, the sum of Approved Load of the Producer's accounts in the plot),
   applied slab by slab, nor 1,000 kW. DEWA may set a lower technical limit at the connection point. */
export const DEWA_SLABS: { from: number; to: number; share: number }[] = [
  { from: 0, to: 100, share: 1 }, { from: 100, to: 200, share: 0.75 }, { from: 200, to: 400, share: 0.5 },
  { from: 400, to: 600, share: 0.25 }, { from: 600, to: Infinity, share: 0.05 },
];
export const DEWA_CAP = 1000;
export const DEWA_REF = 'DEWA Shams Dubai Connection Conditions v4 (June 2022), 2.2';
/* each slab's contribution to the allowed AC capacity, and the total, kW */
export function dewaLimit(tcl: number) {
  const parts = DEWA_SLABS.map(b => { const kW = Math.max(0, Math.min(tcl, b.to) - b.from); return { ...b, kW, allowed: kW * b.share }; }).filter(x => x.kW > 0);
  const sum = parts.reduce((a, x) => a + x.allowed, 0);
  return { parts, sum, allowed: Math.min(DEWA_CAP, sum), capped: sum > DEWA_CAP };
}
/* DEWA electricity slab tariff, AED/kWh by monthly consumption (dewa.gov.ae, Slab Tariff; residential and commercial share
   the slabs, industrial has its own); the fuel surcharge (0.06 AED/kWh in November 2026) and 5% VAT come on top */
export const DEWA_TARIFF: Record<'res' | 'com' | 'ind', { to: number; rate: number }[]> = {
  res: [{ to: 2000, rate: 0.23 }, { to: 4000, rate: 0.28 }, { to: 6000, rate: 0.32 }, { to: Infinity, rate: 0.38 }],
  com: [{ to: 2000, rate: 0.23 }, { to: 4000, rate: 0.28 }, { to: 6000, rate: 0.32 }, { to: Infinity, rate: 0.38 }],
  ind: [{ to: 10000, rate: 0.23 }, { to: Infinity, rate: 0.38 }],
};
export const DEWA_TARIFF_REF = 'DEWA Slab Tariff and Fuel Surcharge (dewa.gov.ae); Shams Dubai net metering (DEWA Shams Dubai FAQ)';
/* one month's DEWA electricity charge for kWh billed: slabs, fuel surcharge, VAT */
export function dewaCharge(kWh: number, s: Pick<Required<PowerSettings>, 'dewaCat' | 'fuelSur' | 'vat'>) {
  let left = Math.max(0, kWh), from = 0, energy = 0;
  for (const b of DEWA_TARIFF[s.dewaCat] || DEWA_TARIFF.com) { const n = Math.min(left, b.to - from); if (n <= 0) break; energy += n * b.rate; left -= n; from = b.to; }
  const fuel = Math.max(0, kWh) * Math.max(0, num(s.fuelSur)), net = energy + fuel;
  return { energy, fuel, vat: s.vat ? net * 0.05 : 0, total: net * (s.vat ? 1.05 : 1) };
}
/* DEWA net metering, month by month: exports and credits carried forward are deducted from the imports before the slabs
   and the fuel surcharge apply; a surplus rolls over to the next bills (DEWA pays no money for it) */
export interface DewaMonth { importKWh: number; exportKWh: number; creditIn: number; billed: number; creditOut: number; bill: number; baseKWh: number; baseBill: number }
export function dewaBilling(R: { year: number; n: number; grid: Float64Array; surplus: Float64Array }, demandKW: Float64Array, s: Required<PowerSettings>) {
  const imp = new Array(12).fill(0), exp = new Array(12).fill(0), base = new Array(12).fill(0);
  for (let i = 0; i < R.n; i++) { const m = when(R.year, i).m; imp[m] += R.grid[i]; exp[m] += R.surplus[i]; base[m] += Math.max(0, demandKW[i]); }
  let credit = 0; const months: DewaMonth[] = [];
  for (let m = 0; m < 12; m++) {
    const creditIn = credit, net = imp[m] - exp[m] - credit, billed = Math.max(0, net);
    credit = Math.max(0, -net);
    months.push({ importKWh: imp[m], exportKWh: exp[m], creditIn, billed, creditOut: credit, bill: dewaCharge(billed, s).total, baseKWh: base[m], baseBill: dewaCharge(base[m], s).total });
  }
  const bill = months.reduce((a, x) => a + x.bill, 0), baseBill = months.reduce((a, x) => a + x.baseBill, 0);
  const exported = exp.reduce((a, b) => a + b, 0), imported = imp.reduce((a, b) => a + b, 0);
  /* the value of the credit left at the year end, at the average rate of the bills without solar */
  const avgRate = baseBill > 0 ? baseBill / base.reduce((a, b) => a + b, 0) : 0;
  return { months, bill, baseBill, saving: baseBill - bill, exported, imported, creditEnd: credit, creditValue: credit * avgRate, avgRate };
}

/* the largest standard inverter within the DEWA limit and the panels it carries at the DC/AC ratio, for a TCL */
export function tclSizing(tcl: number, panelW: number, dcac: number) {
  const lim = dewaLimit(tcl), inv = roundDown(lim.allowed, INVERTERS);
  const panels = panelW > 0 ? Math.floor(inv * (dcac > 0 ? dcac : 1.15) * 1000 / panelW + 1e-9) : 0;
  return { ...lim, invKW: inv, maxKWp: lim.allowed * (dcac > 0 ? dcac : 1.15), panels, kWp: panels * panelW / 1000 };
}

/* the utility rules in force: none off-grid; automatic on-grid means DEWA Shams Dubai */
export const utilityOf = (s: Required<PowerSettings>, _location?: string) => s.conn === 'off' ? 'none' : s.utility || 'dewa';
/* genset suggestion: the largest hour it supplies at 80% loading */
export const GEN_LOADING = 0.8;
/* the recommended genset: the design load × (1 + safety margin) ÷ power factor, up to the next standard kVA size */
export const GEN_MARGIN = 20;
export const suggestGenset = (kW: number, pf: number, marginPct = GEN_MARGIN) => roundUp(kW * (1 + Math.max(0, marginPct) / 100) / (pf || 0.8), GENSETS);
export const pvKWp = (s: Required<PowerSettings>) => Math.max(0, num(s.panels)) * Math.max(0, num(s.panelW)) / 1000;

/* diesel: 2.68 kg CO₂ per litre burnt (IPCC 2006 default for gas/diesel oil) */
export const DIESEL_CO2 = 2.68;
/* HOMER generator fuel curve: intercept per kW rated, slope per kW output, L/h */
export const FUEL_A = 0.08145, FUEL_B = 0.246;
/* typical-year solar: the ASHRAE clear sky (whose UAE optical depths already include the usual haze) reduced by 5% for dust events and cloud */
export const CLEARNESS = 0.95;

export interface Demand {
  n: number; year: number;
  /* electrical demand, kW, each hour */
  kW: Float64Array;
  /* each hour: global horizontal irradiance, W/m²; beam normal and diffuse horizontal (null when the source gives only GHI);
     sun altitude and azimuth at mid-hour, ° */
  ghi: Float64Array; dni: Float64Array | null; dhi: Float64Array | null; alt: Float64Array; saz: Float64Array;
  label: string;
}
type Sky = Pick<Demand, 'ghi' | 'dni' | 'dhi' | 'alt' | 'saz'>;

/* hour `h` (0–23, the hour starting at h:00) falls in the window from–to, wrapping past midnight; from = to means always */
const inWindow = (h: number, from: number, to: number) => from === to ? true : from < to ? h >= from && h < to : h >= from || h < to;
/* a calendar year for typical-year bases: not a leap year, so it has 8,760 hours */
const TYPICAL = 2025;

/* clear-sky irradiance at the middle of each hour of a year at the project's station (ASHRAE 2013 clear sky × CLEARNESS) */
function typicalSky(d: Computed, year: number, n: number, k = CLEARNESS): Sky {
  const st = stationOf(d.p.location), F = () => new Float64Array(n), ghi = F(), dni = F(), dhi = F(), alt = F(), saz = F();
  for (let i = 0; i < n; i++) {
    const w = when(year, i), s = clearSky(st, w.m, sunGeom(st.lat, st.lon, st.tz, w.doy, (i % 24) + 0.5));
    alt[i] = s.beta; saz[i] = s.az;
    if (s.beta > 0) { dni[i] = k * s.Eb; dhi[i] = k * s.Ed; ghi[i] = dni[i] * Math.sin(s.beta * Math.PI / 180) + dhi[i]; }
  }
  return { ghi, dni, dhi, alt, saz };
}

/* the weather year's irradiance: measured GHI, DNI and DHI where given (GHI from DNI and DHI if missing), else the clear sky */
function weatherSky(d: Computed, wx: WeatherYear): Sky {
  const D = wx.data, n = wx.n;
  if (!D.ghi && !(D.dni && D.dhi)) return typicalSky(d, wx.year, n);
  const F = () => new Float64Array(n), ghi = F(), alt = F(), saz = F(), both = !!(D.dni && D.dhi);
  const dni = both ? F() : null, dhi = both ? F() : null;
  for (let i = 0; i < n; i++) {
    const s = sunGeom(wx.lat, wx.lon, wx.tz, Math.floor(i / 24) + 1, (i % 24) + 0.5);
    alt[i] = s.beta; saz[i] = s.az;
    if (dni && dhi) { dni[i] = Math.max(0, D.dni![i] || 0); dhi[i] = Math.max(0, D.dhi![i] || 0); }
    ghi[i] = D.ghi ? Math.max(0, D.ghi[i] || 0) : dni![i] * Math.max(0, Math.sin(s.beta * Math.PI / 180)) + dhi![i];
  }
  return { ghi, dni, dhi, alt, saz };
}

/* irradiance on the tilted panel, W/m²: beam × cos(incidence) + isotropic sky diffuse + ground-reflected (Liu–Jordan);
   without beam and diffuse data the panel sees the horizontal value */
export function poaAt(D: Sky, i: number, tilt: number, az: number, albedo: number) {
  const g = D.ghi[i];
  if (g <= 0) return 0;
  if (!D.dni || !D.dhi || tilt <= 0) return g;
  const r = Math.PI / 180, b = D.alt[i] * r, t = tilt * r;
  const cosI = Math.cos(b) * Math.cos((D.saz[i] - az) * r) * Math.sin(t) + Math.sin(b) * Math.cos(t);
  return Math.max(0, D.dni[i] * Math.max(0, cosI) + D.dhi[i] * (1 + Math.cos(t)) / 2 + g * albedo * (1 - Math.cos(t)) / 2);
}

/* lighting and equipment power of all rooms × quantity at hour h (0–23), kW */
function otherAt(d: Computed) {
  const prof = new Float64Array(24);
  d.rooms.forEach(r => {
    const c = d.res[r.id]; if (!c) return;
    const A = num(r.area), sch = SCHEDULES.find(s => s.id === (r.sched || '24h')) || SCHEDULES[0];
    for (let h = 0; h < 24; h++) prof[h] += (A * num(r.light) * sch.light[h] + A * num(r.equip) * sch.equip[h]) * c.qty / 1000;
  });
  return prof;
}

/* the computed project the demand comes from: this one, or the loaded NOVAC project, with the customised COP and auxiliary allowance */
export function sourceProject(d: Computed, s: Required<PowerSettings>): Computed | null {
  let src = d;
  if (s.basis === 'project') {
    if (!s.proj) return null;
    try { const st = migrate(JSON.parse(JSON.stringify(s.proj.state))); src = computeAll(st.project, st.rooms); } catch { return null; }
  }
  if (!s.extraOn || (blank(s.cop) && blank(s.aux))) return src;
  const p = { ...src.p };
  if (!blank(s.cop) && num(s.cop) > 0) { p.effOpt = 'custom'; p.effCop = num(s.cop); }
  if (!blank(s.aux)) p.aux = num(s.aux);
  return computeAll(p, src.rooms);
}

/* the year of hourly demand for the chosen basis; null when there is nothing to model yet
   (no rooms, no weather year loaded for the weather basis, or no project loaded) */
export function demand(d: Computed, s: Required<PowerSettings>, wx: WeatherYear | null): Demand | null {
  const D = rawDemand(d, s, wx);
  if (!D) return null;
  /* a linked project's demand follows the operating schedule when asked: outside it the plant runs at the standby share */
  if (s.basis !== 'custom' && s.opApply) { const sb = Math.max(0, Math.min(100, num(s.opStandby))) / 100, sc = schedulesOf(s); for (let i = 0; i < D.n; i++) if (!operatingAt(s, D.year, i, sc)) D.kW[i] *= sb; }
  /* customised values: a multiplier on every hour, then an extra load between two hours */
  const k = !s.extraOn || blank(s.scale) ? 1 : Math.max(0, num(s.scale)) / 100, add = s.extraOn ? num(s.addKW) : 0, aF = num(s.addFrom), aT = num(s.addTo);
  if (k !== 1 || add) for (let i = 0; i < D.n; i++) D.kW[i] = Math.max(0, D.kW[i] * k + (add && inWindow(i % 24, aF, aT) ? add : 0));
  return D;
}

function rawDemand(d: Computed, s: Required<PowerSettings>, wx: WeatherYear | null): Demand | null {
  if (s.basis === 'custom') {
    /* an independent study runs on the real weather year when one is loaded and chosen, else the typical year */
    const real = s.indWx && wx ? wx : null;
    const year = real ? real.year : TYPICAL, n = real ? real.n : 8760, kW = new Float64Array(n), on = num(s.cKW), base = num(s.cBase);
    const prof = s.cMode === 'profile' ? Array.from({ length: 24 }, (_, h) => num(s.cProfile?.[h])) : null;
    /* operating hours run at the demand (or the profile hour); everything else at the base load */
    const sc = schedulesOf(s);
    for (let i = 0; i < n; i++) {
      if (prof) { kW[i] = scheduleOfDay(sc, dayIndex(year, i)) ? prof[i % 24] : base; continue; }
      /* each schedule's own demand while operating, or the common demand */
      const x = operatingAt(s, year, i, sc);
      kW[i] = x ? (x.kW == null || blank(x.kW) ? on : num(x.kW)) : base;
    }
    const lab = prof ? 'Custom 24-hour profile' : 'Custom profile';
    return { n, year, kW, ...(real ? weatherSky(d, real) : typicalSky(d, year, n)), label: real ? `${lab}, real weather ${real.label} ${real.year}` : lab };
  }
  const src = sourceProject(d, s);
  if (!src || !src.rooms.length || !src.T.blk) return null;
  const mode = s.basis === 'project' ? s.projBasis : s.basis;
  const name = s.basis === 'project' ? `${s.proj?.name || 'Loaded project'} · ` : '';
  const other = s.other ? otherAt(src) : null;
  if (mode === 'weather') {
    if (!wx) return null;
    const Y = simulateYear(src, wx), kW = new Float64Array(wx.n);
    for (let i = 0; i < wx.n; i++) kW[i] = Y.kWe[i] + (other ? other[i % 24] : 0);
    return { n: wx.n, year: wx.year, kW, ...weatherSky(src, wx), label: `${name}Real weather, ${wx.label} ${wx.year}` };
  }
  /* design days: each month's design day (with safety margins) repeated for every day of the month */
  const year = TYPICAL, n = 8760, kW = new Float64Array(n);
  const days = Array.from({ length: 12 }, (_, m) => electrical(src, 'all', m).kWe);
  for (let i = 0; i < n; i++) { const w = when(year, i); kW[i] = days[w.m][i % 24] + (other ? other[i % 24] : 0); }
  return { n, year, kW, ...typicalSky(src, year, n), label: `${name}Design days, each repeated for its month` };
}

export interface MonthPower { demand: number; grid: number; solar: number; battery: number; gen: number; surplus: number; unmet: number; fuel: number; cost: number }
export interface PowerResult {
  n: number; year: number;
  /* hourly, kW (kWh per hour): PV AC output, solar used directly, battery discharge, battery charge, grid, genset, surplus, unmet; battery state of charge, kWh */
  poa: Float64Array; pv: Float64Array; solar: Float64Array; battery: Float64Array; charge: Float64Array; grid: Float64Array; gen: Float64Array; surplus: Float64Array; unmet: Float64Array; soc: Float64Array;
  /* annual totals, kWh */
  demandKWh: number; pvKWh: number; solarKWh: number; batteryKWh: number; chargeKWh: number; gridKWh: number; genKWh: number; surplusKWh: number; unmetKWh: number; clippedKWh: number;
  peakKW: number; peakAt: number; gridPeakKW: number; genPeakKW: number; genHours: number; unmetHours: number; fuelL: number;
  /* equipment as used: PV kWp, inverter kW, battery kWh and kW, genset kVA and kW */
  kWp: number; invKW: number; invSuggested: number; batKWh: number; batKW: number; genKVA: number; genKW: number; genSuggested: number;
  /* the recommended genset's design load, kW, the hour it occurs, and the safety margin used, % */
  genBasisKW: number; genBasisAt: number; genMargin: number;
  /* battery: cycles a year (charge ÷ usable capacity) */
  batCycles: number;
  /* PV DC output before the inverter, kWh a year, and the DC/AC ratio as built */
  dcKWh: number; dcac: number;
  /* DEWA bills with net metering, on-grid under DEWA's tariff */
  dewaBill: ReturnType<typeof dewaBilling> | null;
  /* fixed shares as used: the TCL they are taken of, kW and % for each source */
  shares: null | { tcl: number; tclEstimated: boolean; unit: 'pct' | 'kw'; grid: { kW: number; pct: number }; solar: { kW: number; pct: number }; gen: { kW: number; pct: number }; over: boolean };
  /* the DEWA Shams Dubai check on the inverter AC capacity, when DEWA rules apply */
  dewa: null | { tcl: number; tclEstimated: boolean; allowed: number; parts: ReturnType<typeof dewaLimit>['parts']; capped: boolean; ok: boolean; maxKWp: number; maxPanels: number };
  /* annual running costs, AED; exportCredit is subtracted */
  gridCost: number; solarCost: number; genFuelCost: number; genOMCost: number; exportCredit: number; totalCost: number;
  /* capital costs, AED */
  capex: { pv: number; inv: number; bat: number; gen: number; total: number };
  /* kg CO₂ */
  gridCO2: number; genCO2: number;
  months: MonthPower[];
  /* PV AC output per kWp installed, kWh/kWp a year, on the panel plane, before inverter clipping, for this basis's solar data */
  specificYield: number;
}

/* hour-by-hour supply. opts.noStorage and opts.noSolar run the same case without battery or PV, for the battery suggestion and the payback */
export function dispatch(D: Demand, s: Required<PowerSettings>, opts: { noStorage?: boolean; noSolar?: boolean; batKWh?: number; batKW?: number } = {}): PowerResult {
  const n = D.n, F = () => new Float64Array(n);
  const poa = F(), tilt = Math.max(0, Math.min(90, num(s.tilt))), az = blank(s.az) ? 180 : num(s.az), albedo = Math.max(0, Math.min(1, num(s.albedo)));
  const pv = F(), solar = F(), battery = F(), charge = F(), grid = F(), gen = F(), surplus = F(), unmet = F(), soc = F();
  const off = s.conn === 'off', share = !off && s.split === 'share';
  const kWp = opts.noSolar ? 0 : pvKWp(s), pr = Math.max(0, num(s.pr)), etaInv = Math.max(0, Math.min(100, num(s.invEff))) / 100;
  const dcacSet = num(s.dcac) > 0 ? num(s.dcac) : 1.15;
  /* DEWA: the inverters' AC capacity within the TCL share; TCL blank is estimated as the peak demand */
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, D.kW[i]);
  const tclEstimated = blank(s.tcl), tcl = tclEstimated ? peak : Math.max(0, num(s.tcl)), lim = s.utility === 'dewa' ? dewaLimit(tcl) : null;
  /* the suggestion is held within the DEWA limit only once the real TCL is entered; an estimated TCL just flags the check */
  /* off-grid the inverter also carries the whole load: at least the peak demand × 1.25 */
  const invSuggested = Math.max(suggestInverter(kWp, dcacSet, lim && !tclEstimated ? lim.allowed : Infinity), s.conn === 'off' && kWp > 0 ? suggestInverter(peak * 1.25 * dcacSet, dcacSet) : 0);
  const invKW = kWp > 0 ? (blank(s.invKW) ? invSuggested : Math.max(0, num(s.invKW))) : 0;
  const useBat = !share && (s.bat || off) && !opts.noStorage;
  const batKWh = useBat ? Math.max(0, opts.batKWh ?? (blank(s.batKWh) ? 0 : num(s.batKWh))) : 0;
  const batKW = batKWh > 0 ? (blank(s.batKW) ? opts.batKW ?? batKWh / 2 : Math.max(0, num(s.batKW))) : 0;
  const usable = batKWh * Math.max(0, Math.min(100, num(s.dod))) / 100, eta = Math.sqrt(Math.max(0.01, Math.min(100, num(s.rte)) / 100));
  /* fixed shares: % of demand, or kW of the TCL converted to % (TCL blank: the peak demand) */
  let pkD = 0; for (let i = 0; i < n; i++) pkD = Math.max(pkD, D.kW[i]);
  const shTclEst = blank(s.tcl), shTcl = shTclEst ? pkD : Math.max(0, num(s.tcl)), byKW = s.shareUnit === 'kw';
  const rawS = byKW ? (shTcl > 0 ? Math.max(0, num(s.solarKWs)) / shTcl : 0) : Math.max(0, num(s.solarPct)) / 100;
  const rawG = byKW ? (shTcl > 0 ? Math.max(0, num(s.gridKWs)) / shTcl : 0) : Math.max(0, num(s.gridPct)) / 100;
  const sP = Math.min(1, rawS), gP = Math.min(1 - sP, rawG), over = rawS + rawG > 1 + 1e-9;
  const shares = share ? { tcl: shTcl, tclEstimated: shTclEst, unit: (byKW ? 'kw' : 'pct') as 'pct' | 'kw', over,
    grid: { kW: gP * shTcl, pct: gP * 100 }, solar: { kW: sP * shTcl, pct: sP * 100 }, gen: { kW: (1 - sP - gP) * shTcl, pct: (1 - sP - gP) * 100 } } : null;
  /* the remaining load after solar and the battery: this share from the grid (within its limit and hours), the genset the rest */
  const remG = remGridShare(s);
  const gLim = remG <= 0 ? 0 : blank(s.gridKW) || (off && num(s.gridKW) === 0) ? Infinity : Math.max(0, num(s.gridKW)), gFrom = num(s.gridFrom), gTo = num(s.gridTo);
  /* the battery starts the year empty, so it never supplies energy it was not charged with */
  let ghiSum = 0, clipped = 0, dcSum = 0, q = 0;
  for (let i = 0; i < n; i++) {
    const dem = Math.max(0, D.kW[i]), g = poaAt(D, i, tilt, az, albedo); poa[i] = g; ghiSum += g;
    if (share) { solar[i] = dem * sP; grid[i] = dem * gP; gen[i] = dem - solar[i] - grid[i]; continue; }
    /* DC from the array, AC after the inverter's conversion efficiency, capped at the inverter's AC rating */
    const dc = kWp * g / 1000 * pr, ac = dc * etaInv;
    dcSum += dc; pv[i] = Math.min(ac, invKW); clipped += ac - pv[i];
    solar[i] = Math.min(pv[i], dem);
    let rest = dem - solar[i], extra = pv[i] - solar[i];
    /* surplus solar charges the battery first */
    if (usable > 0 && extra > 0) { const c = Math.min(extra, batKW, (usable - q) / eta); charge[i] = c; q += c * eta; extra -= c; }
    surplus[i] = extra;
    const fromBat = (need: number) => { if (usable <= 0 || need <= 0) return 0; const out = Math.min(need, batKW - charge[i], q * eta); q -= out / eta; battery[i] += out; return out; };
    if (s.batUse !== 'backup') rest -= fromBat(rest);
    grid[i] = inWindow(i % 24, gFrom, gTo) ? Math.min(rest * remG, gLim) : 0; rest -= grid[i];
    if (s.batUse === 'backup') rest -= fromBat(rest);
    gen[i] = rest; soc[i] = q;
  }
  /* genset rating: as entered in kVA × power factor, or the suggested size; above the rating the demand is unmet */
  const pf = Math.max(0.1, Math.min(1, num(s.pf) || 0.8));
  let genPeak = 0, genPeakAt = 0; for (let i = 0; i < n; i++) if (gen[i] > genPeak) { genPeak = gen[i]; genPeakAt = i; }
  /* off-grid without a backup genset: what solar and battery cannot meet is unmet (loss of load) */
  const noGen = off && !s.offGen;
  /* the design load for the recommended size: the peak of the building's peak load day, or the largest hour the genset supplies */
  let dPk = 0, dAt = 0; for (let i = 0; i < n; i++) if (D.kW[i] > dPk) { dPk = D.kW[i]; dAt = i; }
  const genBasisKW = s.genBasis === 'supplied' ? genPeak : dPk, genMargin = blank(s.genMargin) ? GEN_MARGIN : Math.max(0, num(s.genMargin));
  const genSuggested = noGen ? 0 : suggestGenset(genBasisKW, pf, genMargin), genKVA = noGen ? 0 : genPeak > 0 || !blank(s.genKVA) ? (blank(s.genKVA) ? genSuggested : Math.max(0, num(s.genKVA))) : 0, genKW = genKVA * pf;
  for (let i = 0; i < n; i++) if (gen[i] > genKW + 1e-9) { unmet[i] = gen[i] - genKW; gen[i] = genKW; }

  const tG = num(s.tGrid), tS = num(s.tSolar), tE = s.export && !off ? num(s.tExport) : 0, om = num(s.genOM), dsl = num(s.diesel);
  const months: MonthPower[] = Array.from({ length: 12 }, () => ({ demand: 0, grid: 0, solar: 0, battery: 0, gen: 0, surplus: 0, unmet: 0, fuel: 0, cost: 0 }));
  const r = { demandKWh: 0, pvKWh: 0, solarKWh: 0, batteryKWh: 0, chargeKWh: 0, gridKWh: 0, genKWh: 0, surplusKWh: 0, unmetKWh: 0, peakKW: 0, peakAt: 0, gridPeakKW: 0, genPeakKW: 0, genHours: 0, unmetHours: 0, fuelL: 0 };
  for (let i = 0; i < n; i++) {
    const dem = Math.max(0, D.kW[i]), fuel = gen[i] > 1e-9 ? FUEL_A * genKW + FUEL_B * gen[i] : 0, m = months[when(D.year, i).m];
    r.demandKWh += dem; r.pvKWh += pv[i]; r.solarKWh += solar[i]; r.batteryKWh += battery[i]; r.chargeKWh += charge[i]; r.gridKWh += grid[i]; r.genKWh += gen[i];
    r.surplusKWh += surplus[i]; r.unmetKWh += unmet[i]; r.fuelL += fuel;
    if (dem > r.peakKW) { r.peakKW = dem; r.peakAt = i; }
    r.gridPeakKW = Math.max(r.gridPeakKW, grid[i]); r.genPeakKW = Math.max(r.genPeakKW, gen[i]);
    if (gen[i] > 1e-9) r.genHours++;
    if (unmet[i] > 1e-9) r.unmetHours++;
    m.demand += dem; m.grid += grid[i]; m.solar += solar[i]; m.battery += battery[i]; m.gen += gen[i]; m.surplus += surplus[i]; m.unmet += unmet[i]; m.fuel += fuel;
    /* solar running cost applies to all PV energy the building uses, directly or through the battery */
    m.cost += grid[i] * tG + (solar[i] + charge[i]) * tS + fuel * dsl + gen[i] * om - surplus[i] * tE;
  }
  /* on-grid with DEWA: monthly bills on the slab tariff with net metering, in place of the flat rate; exports are credits on the bill */
  const dewaBill = !off && s.utility === 'dewa' && s.tariff !== 'flat' ? dewaBilling({ year: D.year, n, grid, surplus }, D.kW, s) : null;
  const gridCost = dewaBill ? dewaBill.bill : r.gridKWh * tG, solarCost = (r.solarKWh + r.chargeKWh) * tS, genFuelCost = r.fuelL * dsl, genOMCost = r.genKWh * om, exportCredit = dewaBill ? 0 : r.surplusKWh * tE;
  const capex = { pv: kWp * 1000 * num(s.cPV), inv: invKW * num(s.cInv), bat: batKWh * num(s.cBat), gen: genKVA * num(s.cGen), total: 0 };
  capex.total = capex.pv + capex.inv + capex.bat + capex.gen;
  return {
    n, year: D.year, poa, pv, solar, battery, charge, grid, gen, surplus, unmet, soc, ...r, clippedKWh: clipped,
    kWp, invKW, invSuggested, batKWh, batKW, genKVA, genKW, genSuggested, genBasisKW, genBasisAt: s.genBasis === 'supplied' ? genPeakAt : dAt, genMargin, batCycles: usable > 0 ? r.chargeKWh * eta / usable : 0,
    dcKWh: dcSum, dcac: invKW > 0 ? kWp / invKW : 0, shares, dewaBill,
    dewa: lim ? { tcl, tclEstimated, allowed: lim.allowed, parts: lim.parts, capped: lim.capped, ok: invKW <= lim.allowed + 1e-9,
      maxKWp: lim.allowed * dcacSet, maxPanels: num(s.panelW) > 0 ? Math.floor(lim.allowed * dcacSet * 1000 / num(s.panelW) + 1e-9) : 0 } : null,
    gridCost, solarCost, genFuelCost, genOMCost, exportCredit, totalCost: gridCost + solarCost + genFuelCost + genOMCost - exportCredit,
    capex, gridCO2: r.gridKWh * num(s.efGrid), genCO2: r.fuelL * DIESEL_CO2,
    months, specificYield: ghiSum / 1000 * pr * etaInv * (n === 8784 ? 8760 / 8784 : 1),
  };
}

/* suggested battery: enough usable capacity to store the average day's surplus solar, but no more than the average day's
   demand after sunset that it would displace (grid and genset for self-consumption, genset only for backup);
   nominal capacity is that ÷ depth of discharge, rounded up to 5 kWh */
export function suggestBattery(D: Demand, s: Required<PowerSettings>) {
  if (s.split === 'share' || pvKWp(s) <= 0) return 0;
  const R = dispatch(D, s, { noStorage: true }), days = D.n / 24;
  let displace = 0;
  for (let i = 0; i < D.n; i++) if (R.pv[i] <= 1e-9) displace += s.batUse === 'backup' ? R.gen[i] : R.grid[i] + R.gen[i];
  const eta = Math.sqrt(Math.max(0.01, num(s.rte) / 100)), dod = Math.max(0.01, num(s.dod) / 100);
  const usable = Math.min(R.surplusKWh / days * eta, displace / days / eta);
  return usable > 0.5 ? Math.ceil(usable / dod / 5) * 5 : 0;
}

/* off-grid sizing from the power consumption projection:
   battery usable energy = design-day energy × days of autonomy; nominal = usable ÷ (depth of discharge × discharge efficiency √RTE);
   battery power ≥ peak demand × 1.25; PV kWp = design-day energy ÷ (PV yield per kWp per day × √RTE share for what passes through the battery);
   the inverter carries the peak demand × 1.25 */
export function offGridSizing(D: Demand, s: Required<PowerSettings>) {
  const days = D.n / 24; let peak = 0, peakDay = 0, best = -1;
  const daily = Array.from({ length: days }, (_, k) => { let e = 0; for (let h = 0; h < 24; h++) { const v = D.kW[k * 24 + h]; e += v; peak = Math.max(peak, v); } return e; });
  daily.forEach((e, k) => { if (e > best) { best = e; peakDay = k; } });
  const avg = daily.reduce((a, b) => a + b, 0) / days, eDay = s.offDay === 'avg' ? avg : best;
  /* energy needed when the sun is down on the design day: the share that must pass through the battery */
  let night = 0, dayE = 0; const k0 = s.offDay === 'avg' ? -1 : peakDay;
  for (let i = 0; i < D.n; i++) if (k0 < 0 || Math.floor(i / 24) === k0) { if (D.alt[i] <= 0) night += D.kW[i]; dayE += D.kW[i]; }
  const nightShare = dayE > 0 ? night / dayE : 0.5;
  const dod = Math.max(0.05, num(s.dod) / 100), eta = Math.sqrt(Math.max(0.01, num(s.rte) / 100)), aut = Math.max(0, num(s.autonomy));
  const usable = eDay * aut, batKWh = usable > 0 ? Math.ceil(usable / (dod * eta) / 5) * 5 : 0;
  const batKW = Math.ceil(peak * 1.25);
  /* PV yield per kWp per day on the panel plane, after DC losses and the inverter */
  const R0 = dispatch(D, { ...s, panels: 1000, panelW: 1000, invKW: 1e9, conn: 'on', gridKW: '', split: 'capacity' }, { noStorage: true });
  const yDay = R0.pvKWh / 1000 / days;
  const need = eDay * ((1 - nightShare) + nightShare / (eta * eta));
  const kWp = yDay > 0 ? need / yDay : 0;
  return { eDay, avgDay: avg, peakDayKWh: best, peakDay, peakKW: peak, nightShare, usable, batKWh, batKW, kWp, yDay, invKW: Math.ceil(peak * 1.25), dod, eta, aut };
}

/* simple payback of the solar, inverter and battery: their capital cost ÷ the yearly saving against the same supply without them */
export function payback(D: Demand, s: Required<PowerSettings>, R: PowerResult) {
  if (s.split === 'share' && s.conn !== 'off') return null;
  /* the same supply without solar or battery, with its genset sized for it, so the comparison has no unmet demand */
  const base = dispatch(D, { ...s, genKVA: '', offGen: true }, { noSolar: true, noStorage: true });
  const capex = R.capex.pv + R.capex.inv + R.capex.bat, saving = base.totalCost - R.totalCost;
  return { baseCost: base.totalCost, saving, capex, years: saving > 0 && capex > 0 ? capex / saving : null, baseCO2: base.gridCO2 + base.genCO2 };
}

/* the cost and price settings, which come from the user's price book unless a project sets its own */
export const COST_KEYS: (keyof PowerSettings)[] = ['cPV', 'cInv', 'cBat', 'cGen', 'tGrid', 'tSolar', 'tExport', 'genOM', 'diesel'];
export const withoutCosts = (s: PowerSettings): PowerSettings => { const o = { ...s } as Record<string, unknown>; for (const k of COST_KEYS) delete o[k]; return o as PowerSettings; };

/* the sample example: the application's own example project (Zarvela Business Centre). Its demand is the example's hourly
   analysis (design days, with lighting and equipment): the open project when the example is open, otherwise a linked copy.
   The panels are laid out on the example's roof area (the sum of its rooms' roof areas) as a 2:1 rectangle with a 1 m setback
   at 10° tilt. The rest are stated sample values: a 60 kW TCL, a battery, a grid connection limited to 10 kW and a genset. */
export function samplePower(open?: AppState | null): { settings: PowerSettings; roofM2: number; size: [number, number]; panels: number } {
  const st = open?.example ? open : exampleState(), d = computeAll(st.project, st.rooms);
  const roofM2 = d.T.roof, w = Math.sqrt(roofM2 * 2), h = roofM2 / w;
  const ref: LatLon = [25.19, 55.27], poly = [toLatLon(ref, 0, 0), toLatLon(ref, w, 0), toLatLon(ref, w, h), toLatLon(ref, 0, h)];
  const L = layout(roofOf({ poly, panel: 'm10-144', tilt: 10, setback: 1, align: 'ew' }));
  const panels = L?.count ?? 0;
  const link: PowerSettings = open?.example ? { basis: 'design', projBasis: 'design', proj: null }
    : { basis: 'project', projBasis: 'design', proj: { name: st.project.name || 'Example project', from: 'NOVAC sample example', state: st } };
  return {
    roofM2, size: [w, h], panels,
    settings: {
      ...withoutCosts(POWER_DEFAULTS), ...link, other: true,
      split: 'capacity', panels, panelW: 550, tilt: 10, az: 180, pr: 0.82, dcac: 1.2, invEff: 97, invKW: '',
      utility: 'dewa', tcl: 60,
      bat: true, batKWh: '', batKW: '', dod: 90, rte: 90, batUse: 'self',
      gridKW: 10, gridFrom: 0, gridTo: 24, export: false, genKVA: '', pf: 0.8, roof: {},
    },
  };
}

/* the demand split by operating schedule, and its daily, weekly and monthly requirements */
export interface SchedRow {
  id: string; name: string; days: number; hoursDay: number;
  /* operating hours and days in the year, energy kWh, peak kW and when, average kW while operating */
  hours: number; opDays: number; kWh: number; peak: number; peakAt: number; avg: number;
  /* energy per operating day, per week and per month (averages), kWh */
  perDay: number; perWeek: number; perMonth: number;
}
export function scheduleBreakdown(D: Demand, s: Required<PowerSettings>) {
  const sc = schedulesOf(s), rows: SchedRow[] = sc.map(x => ({ id: x.id, name: x.name, days: (x.days || []).filter(Boolean).length, hoursDay: spanOf(x.from, x.to), hours: 0, opDays: 0, kWh: 0, peak: 0, peakAt: 0, avg: 0, perDay: 0, perWeek: 0, perMonth: 0 }));
  const out: SchedRow = { id: 'out', name: 'Outside the schedules', days: 0, hoursDay: 0, hours: 0, opDays: 0, kWh: 0, peak: 0, peakAt: 0, avg: 0, perDay: 0, perWeek: 0, perMonth: 0 };
  const days = D.n / 24, weeks = days / 7;
  for (let k = 0; k < days; k++) {
    const x = scheduleOfDay(sc, dayIndex(D.year, k * 24)), r = x ? rows[sc.indexOf(x)] : null;
    if (r) r.opDays++;
    for (let h = 0; h < 24; h++) {
      const i = k * 24 + h, v = D.kW[i], t = x && inWindow(h, num(x.from), num(x.to)) ? r! : out;
      t.hours++; t.kWh += v; if (v > t.peak) { t.peak = v; t.peakAt = i; }
    }
  }
  for (const r of [...rows, out]) { r.avg = r.hours ? r.kWh / r.hours : 0; r.perDay = r.opDays ? r.kWh / r.opDays : r.kWh / days; r.perWeek = r.kWh / weeks; r.perMonth = r.kWh / 12; }
  /* daily, weekly (Monday to Sunday, whole weeks inside the year) and monthly totals */
  const daily = Array.from({ length: days }, (_, k) => { let e = 0; for (let h = 0; h < 24; h++) e += D.kW[k * 24 + h]; return e; });
  const mon0 = (7 - dayIndex(D.year, 0)) % 7, weekly: { from: number; kWh: number }[] = [];
  for (let k = mon0; k + 7 <= days; k += 7) weekly.push({ from: k, kWh: daily.slice(k, k + 7).reduce((a, b) => a + b, 0) });
  const monthly = Array.from({ length: 12 }, () => 0); daily.forEach((e, k) => { monthly[when(D.year, k * 24).m] += e; });
  const maxI = (a: number[]) => a.reduce((b, x, i) => x > a[b] ? i : b, 0);
  const pd = maxI(daily), pw = weekly.length ? maxI(weekly.map(w => w.kWh)) : -1, pm = maxI(monthly);
  const total = daily.reduce((a, b) => a + b, 0);
  return {
    rows, out, total,
    day: { peak: daily[pd], peakDay: pd, avg: total / days },
    week: { peak: pw >= 0 ? weekly[pw].kWh : 0, peakFrom: pw >= 0 ? weekly[pw].from : 0, avg: weekly.length ? weekly.reduce((a, w) => a + w.kWh, 0) / weekly.length : 0, count: weekly.length },
    month: { peak: monthly[pm], peakMonth: pm, avg: total / 12, monthly },
  };
}

/* the load on each source by day, week (Monday to Sunday, whole weeks in the year) and month */
export type SourceKey = 'solar' | 'battery' | 'grid' | 'gen' | 'unmet';
export interface SourceStats {
  key: SourceKey; kWh: number; peakKW: number; peakAt: number; hours: number;
  day: { avg: number; peak: number; peakDay: number }; week: { avg: number; peak: number; peakFrom: number }; month: { avg: number; peak: number; peakMonth: number; kWh: number[] };
}
export function supplyStats(R: PowerResult): SourceStats[] {
  const days = R.n / 24, mon0 = (7 - dayIndex(R.year, 0)) % 7;
  return (['solar', 'battery', 'grid', 'gen', 'unmet'] as SourceKey[]).map(key => {
    const a = R[key]; let kWh = 0, peakKW = 0, peakAt = 0, hours = 0;
    const daily = new Array(days).fill(0), monthly = new Array(12).fill(0);
    for (let i = 0; i < R.n; i++) { const v = a[i]; kWh += v; if (v > peakKW) { peakKW = v; peakAt = i; } if (v > 1e-9) hours++; daily[Math.floor(i / 24)] += v; }
    daily.forEach((e, k) => { monthly[when(R.year, k * 24).m] += e; });
    const weekly: { from: number; e: number }[] = []; for (let k = mon0; k + 7 <= days; k += 7) weekly.push({ from: k, e: daily.slice(k, k + 7).reduce((x, y) => x + y, 0) });
    const iMax = (x: number[]) => x.reduce((b, v, i) => v > x[b] ? i : b, 0), pd = iMax(daily), pw = weekly.length ? iMax(weekly.map(w => w.e)) : -1, pm = iMax(monthly);
    return { key, kWh, peakKW, peakAt, hours,
      day: { avg: kWh / days, peak: daily[pd], peakDay: pd },
      week: { avg: weekly.length ? weekly.reduce((x, w) => x + w.e, 0) / weekly.length : 0, peak: pw >= 0 ? weekly[pw].e : 0, peakFrom: pw >= 0 ? weekly[pw].from : 0 },
      month: { avg: kWh / 12, peak: monthly[pm], peakMonth: pm, kWh: monthly } };
  });
}

/* one CSV row per hour of the dispatch */
export function powerCsv(D: Demand, R: PowerResult) {
  const rows = ['Date,Hour ending,Demand kW,Solar PV output kW,Solar used kW,Battery discharge kW,Battery charge kW,Battery stored kWh,Grid kW,Genset kW,Solar surplus kW,Unmet kW,GHI W/m²,Panel-plane irradiance W/m²'];
  for (let i = 0; i < D.n; i++) {
    const w = when(D.year, i), f = (x: number) => x.toFixed(3);
    rows.push([`${D.year}-${String(w.m + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`, w.h, f(D.kW[i]), f(R.pv[i]), f(R.solar[i]), f(R.battery[i]), f(R.charge[i]), f(R.soc[i]), f(R.grid[i]), f(R.gen[i]), f(R.surplus[i]), f(R.unmet[i]), D.ghi[i].toFixed(0), R.poa[i].toFixed(0)].join(','));
  }
  return rows.join('\r\n');
}
