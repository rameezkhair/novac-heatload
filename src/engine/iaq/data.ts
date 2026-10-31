/* Indoor air quality reference data. Every value carries its source; all are defaults the engineer can override
   in the project (licensed standard values, manufacturer data, material emission test results). Values marked
   "assumed" are engineering placeholders with no single authoritative source and should be replaced with project data. */

/* ---------- ASHRAE 62.1-2022 Ventilation Rate Procedure ---------- */
export const VRP_REF = 'ASHRAE 62.1-2022 §6.2';
/* simplified system ventilation efficiency, §6.2.4.3.1: Ev = 0.88 D + 0.22 for D < 0.60, otherwise 0.75 */
export const evSimplified = (D: number) => D < 0.6 ? 0.88 * D + 0.22 : 0.75;

/* ---------- contaminants ---------- */
export type ContId = 'co2' | 'pm1' | 'pm25' | 'pm10' | 'tvoc' | 'hcho' | 'o3' | 'no2' | 'co';
/* criterion averaging: daily mean, 8-hour running mean, or the highest hourly mean */
export type Avg = '24h' | '8h' | '1h' | 'annual';
export interface Contaminant {
  id: ContId; label: string; unit: 'ppm' | 'µg/m³';
  /* generation per person (CO₂ in L/s at 1.2 met; others µg/h) and per floor area (µg/m²·h), with source */
  genP: number; genA: number; genSrc: string;
  /* first-order loss indoors (deposition or surface reaction), 1/h */
  dep: number; depSrc: string;
  /* fraction of outdoor air that survives entry through the envelope with infiltration */
  pen: number;
  /* outdoor concentration used when no hourly data is loaded */
  out: number; outSrc: string;
  /* design criterion; null = no health-based criterion, report only */
  limit: number | null; avg: Avg; limitSrc: string;
  /* how filters act on it: particle size class, or gas */
  kind: 'pm1' | 'pm25' | 'pm10' | 'gas' | 'none';
  /* CO₂ is a ventilation indicator, not an air-quality compliance metric */
  indicator?: boolean;
}
const WHO21 = 'WHO global air quality guidelines 2021';
export const CONTAMINANTS: Contaminant[] = [
  { id: 'co2', label: 'Carbon dioxide (CO₂)', unit: 'ppm', genP: 0.0052, genA: 0, genSrc: 'ASTM D6245-18: 0.0052 L/s per adult at 1.2 met, scaled by the room activity heat gain',
    dep: 0, depSrc: 'Inert', pen: 1, out: 420, outSrc: 'Global background, 2024 (NOAA)', limit: 1000, avg: '1h', limitSrc: 'DBC H.4.8.3 demand-controlled ventilation alarm; indicator of ventilation per person only', kind: 'none', indicator: true },
  { id: 'pm1', label: 'PM1', unit: 'µg/m³', genP: 0, genA: 0, genSrc: 'No indoor source (no cooking or combustion); enter project sources',
    dep: 0.15, depSrc: 'Riley et al. 2002, Environ. Sci. Technol. 36: 0.1–1 µm deposition', pen: 0.8, out: 20, outSrc: 'Assumed typical Dubai; load hourly data for the site', limit: null, avg: '24h', limitSrc: 'No WHO guideline value', kind: 'pm1' },
  { id: 'pm25', label: 'PM2.5', unit: 'µg/m³', genP: 0, genA: 0, genSrc: 'No indoor source (no cooking or combustion); enter project sources',
    dep: 0.39, depSrc: 'Long et al. 2001, Environ. Sci. Technol. 35; Riley et al. 2002', pen: 0.8, out: 35, outSrc: 'Assumed typical Dubai; load hourly data for the site', limit: 15, avg: '24h', limitSrc: WHO21 + ', 24-hour', kind: 'pm25' },
  { id: 'pm10', label: 'PM10', unit: 'µg/m³', genP: 0, genA: 0, genSrc: 'No indoor source; enter project sources (resuspension, activity)',
    dep: 1.0, depSrc: 'Thatcher and Layton 1995, Atmos. Environ. 29: coarse particles', pen: 0.6, out: 90, outSrc: 'Assumed typical Dubai (desert dust); load hourly data for the site', limit: 45, avg: '24h', limitSrc: WHO21 + ', 24-hour', kind: 'pm10' },
  { id: 'tvoc', label: 'Total VOCs (TVOC)', unit: 'µg/m³', genP: 0, genA: 200, genSrc: 'Assumed: furnished new interior with low-emitting materials; replace with CDPH Standard Method v1.2 emission data',
    dep: 0, depSrc: 'Treated as non-reactive', pen: 1, out: 50, outSrc: 'Assumed urban background', limit: 500, avg: '8h', limitSrc: 'WELL v2 feature A05 threshold, project criterion (TVOC has no health-based limit)', kind: 'gas' },
  { id: 'hcho', label: 'Formaldehyde', unit: 'µg/m³', genP: 0, genA: 15, genSrc: 'Assumed: low-emitting composite wood and finishes; replace with CDPH Standard Method v1.2 emission data',
    dep: 0, depSrc: 'Treated as non-reactive', pen: 1, out: 5, outSrc: 'Assumed urban background', limit: 100, avg: '1h', limitSrc: 'WHO guidelines for indoor air quality 2010, 30-minute mean (hourly mean used)', kind: 'gas' },
  { id: 'o3', label: 'Ozone', unit: 'µg/m³', genP: 0, genA: 0, genSrc: 'No indoor source (no ozone generators or laser printers entered)',
    dep: 2.8, depSrc: 'Weschler 2000, Indoor Air 10: indoor surface removal rate', pen: 0.8, out: 80, outSrc: 'Assumed typical Dubai summer; load hourly data for the site', limit: 100, avg: '8h', limitSrc: WHO21 + ', 8-hour', kind: 'gas' },
  { id: 'no2', label: 'Nitrogen dioxide', unit: 'µg/m³', genP: 0, genA: 0, genSrc: 'No indoor combustion',
    dep: 0.8, depSrc: 'Spicer et al. 1993, Atmos. Environ. 27A: indoor NO₂ decay', pen: 1, out: 30, outSrc: 'Assumed urban Dubai; load hourly data for the site', limit: 25, avg: '24h', limitSrc: WHO21 + ', 24-hour', kind: 'gas' },
  { id: 'co', label: 'Carbon monoxide', unit: 'µg/m³', genP: 0, genA: 0, genSrc: 'No indoor combustion',
    dep: 0, depSrc: 'Inert', pen: 1, out: 300, outSrc: 'Assumed urban background; load hourly data for the site', limit: 4000, avg: '24h', limitSrc: WHO21 + ', 24-hour (4 mg/m³)', kind: 'none' },
];

/* ---------- filters and air cleaners ---------- */
export type FilterId = 'none' | 'merv8' | 'merv11' | 'merv13' | 'merv14' | 'merv15' | 'merv16' | 'hepa' | 'carbon' | 'gasphase' | 'uvgi';
export interface Filter {
  id: FilterId; label: string;
  /* minimum composite efficiency in ASHRAE 52.2 size ranges E1 0.3–1 µm, E2 1–3 µm, E3 3–10 µm, % */
  e1: number; e2: number; e3: number; eSrc: string;
  /* single-pass efficiency for gases, % */
  gas: Partial<Record<ContId, number>>; gasSrc?: string;
  /* clean and recommended final pressure drop, Pa; design face velocity, m/s */
  dp0: number; dpF: number; v: number; dpSrc: string;
  /* typical change interval, months, or note */
  life: string;
}
const A522 = 'ASHRAE 52.2-2017 Table 12-1 minimum composite efficiencies';
const TYP = 'Typical 2-inch / 4-inch pleated and rigid filter catalogue values (assumed); replace with manufacturer data';
export const FILTERS: Filter[] = [
  { id: 'none', label: 'No filter', e1: 0, e2: 0, e3: 0, eSrc: '–', gas: {}, dp0: 0, dpF: 0, v: 2.5, dpSrc: '–', life: '–' },
  { id: 'merv8', label: 'MERV 8', e1: 0, e2: 20, e3: 70, eSrc: A522, gas: {}, dp0: 60, dpF: 150, v: 2.5, dpSrc: TYP, life: '3 months or at final pressure drop' },
  { id: 'merv11', label: 'MERV 11', e1: 20, e2: 65, e3: 85, eSrc: A522, gas: {}, dp0: 75, dpF: 200, v: 2.5, dpSrc: TYP, life: '3–6 months or at final pressure drop' },
  { id: 'merv13', label: 'MERV 13', e1: 50, e2: 85, e3: 90, eSrc: A522, gas: {}, dp0: 100, dpF: 250, v: 2.5, dpSrc: TYP, life: '6 months or at final pressure drop' },
  { id: 'merv14', label: 'MERV 14', e1: 75, e2: 90, e3: 95, eSrc: A522, gas: {}, dp0: 120, dpF: 250, v: 2.5, dpSrc: TYP, life: '6–12 months or at final pressure drop' },
  { id: 'merv15', label: 'MERV 15', e1: 85, e2: 90, e3: 95, eSrc: A522, gas: {}, dp0: 130, dpF: 300, v: 2.5, dpSrc: TYP, life: '6–12 months or at final pressure drop' },
  { id: 'merv16', label: 'MERV 16', e1: 95, e2: 95, e3: 95, eSrc: A522, gas: {}, dp0: 150, dpF: 300, v: 2.5, dpSrc: TYP, life: '12 months or at final pressure drop' },
  { id: 'hepa', label: 'HEPA (99.97% at 0.3 µm)', e1: 99.97, e2: 99.97, e3: 99.97, eSrc: 'IEST-RP-CC001 / DOE-STD-3020 HEPA definition at the most penetrating size', gas: {}, dp0: 250, dpF: 500, v: 1.3, dpSrc: TYP, life: '12–24 months, with pre-filters' },
  { id: 'carbon', label: 'Activated carbon (gas phase)', e1: 0, e2: 0, e3: 0, eSrc: 'No particle rating', gas: { o3: 80, tvoc: 50, no2: 40, hcho: 20 },
    gasSrc: 'Assumed typical single-pass, new media; carbon removes formaldehyde poorly; replace with ASHRAE 145.2 test data', dp0: 60, dpF: 150, v: 2.0, dpSrc: TYP, life: 'Media life by breakthrough testing, typically 6–12 months' },
  { id: 'gasphase', label: 'Gas-phase, impregnated media (KMnO₄ alumina)', e1: 0, e2: 0, e3: 0, eSrc: 'No particle rating', gas: { o3: 70, tvoc: 50, no2: 60, hcho: 60 },
    gasSrc: 'Assumed typical single-pass, new media; replace with ASHRAE 145.2 test data', dp0: 90, dpF: 200, v: 2.0, dpSrc: TYP, life: 'Media life by sampling, typically 12 months' },
  { id: 'uvgi', label: 'UVGI (in-duct ultraviolet)', e1: 0, e2: 0, e3: 0, eSrc: 'Inactivates micro-organisms only; no effect on particles or gases listed here', gas: {}, dp0: 0, dpF: 0, v: 2.5,
    dpSrc: 'No pressure drop; lamp power instead', life: 'Lamps yearly (output falls about 20%)' },
];
export const filterOf = (id: string) => FILTERS.find(f => f.id === id) || FILTERS[0];
/* removal efficiency of a filter for a contaminant, 0–1. PM mass is split across the E-ranges by an assumed
   urban size distribution: PM1 all in E1; PM2.5 65% E1, 35% E2; PM10 35% E1, 25% E2, 40% E3 */
export const SIZE_SPLIT = 'Assumed mass split by size: PM1 100% 0.3–1 µm; PM2.5 65% 0.3–1 µm, 35% 1–3 µm; PM10 35% / 25% / 40%';
export function filterEff(f: Filter, c: Contaminant) {
  const e = c.kind === 'pm1' ? f.e1 : c.kind === 'pm25' ? 0.65 * f.e1 + 0.35 * f.e2 : c.kind === 'pm10' ? 0.35 * f.e1 + 0.25 * f.e2 + 0.4 * f.e3 : c.kind === 'gas' ? f.gas[c.id] ?? 0 : 0;
  return Math.max(0, Math.min(100, e)) / 100;
}
/* standard 610 × 610 mm (24 × 24 inch) filter face */
export const CELL_M2 = 0.61 * 0.61;
