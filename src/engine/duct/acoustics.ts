/* ASHRAE acoustic limits for duct design, from ASHRAE Handbook—HVAC Applications (2023), Ch. 49 Noise and Vibration
   Control: Table 1, design guidelines for HVAC-related background sound in rooms (NC/RC), and Table 8, maximum
   recommended duct airflow velocities to achieve specified acoustic design criteria (values from Schaffer 2005),
   with its notes: branch ducts about 80% of the listed values, final runouts to outlets 50% or less. */
import type { DuctShape, SectionKind } from './duct';

export const ASHRAE_NOISE_REF = 'ASHRAE Handbook—HVAC Applications (2023), Ch. 49';

/* Table 1 categories used for NOVAC room types: [ASHRAE room type, space, NC/RC] */
interface NoiseCat { group: string; space: string; nc: number }
const C = (group: string, space: string, nc: number): NoiseCat => ({ group, space, nc });
const OFFICE_OPEN = C('Office buildings', 'Open-plan offices', 40), OFFICE_PRIV = C('Office buildings', 'Executive and private offices', 30);
const CONFERENCE = C('Office buildings', 'Conference rooms', 30), OFFICE_CORR = C('Office buildings', 'Corridors and lobbies', 40);
const HOTEL_ROOM = C('Hotels/motels', 'Individual rooms or suites', 30), BANQUET = C('Hotels/motels', 'Meeting/banquet rooms', 30);
const SERVICE = C('Hotels/motels', 'Service/support areas', 40), LIVING = C('Residences, apartments, condominiums', 'Living areas', 30);
const LAB_MIN = C('Laboratories', 'Testing/research with minimal speech communication', 45);

/* NOVAC room type → Table 1 category; nearest: the type is not listed in Table 1, so the nearest category is used */
export const NOISE_BY_TYPE: Record<string, NoiseCat & { nearest?: boolean }> = {
  office: OFFICE_OPEN, privoffice: OFFICE_PRIV, meeting: CONFERENCE, lobby: OFFICE_CORR, waiting: OFFICE_CORR, corridor: OFFICE_CORR,
  retail: { ...OFFICE_CORR, nearest: true }, deptstore: { ...OFFICE_CORR, nearest: true }, mall: { ...OFFICE_CORR, nearest: true },
  restaurant: { ...OFFICE_CORR, nearest: true }, foodcourt: { ...OFFICE_CORR, nearest: true }, kitchen: { ...SERVICE, nearest: true },
  exhibition: { ...OFFICE_CORR, nearest: true },
  classroom: C('Schools', 'Classrooms', 30), lab: C('Laboratories', 'Group teaching', 35), library: C('Libraries', 'Libraries', 30),
  assembly: BANQUET, prayer: C('Churches, mosques, synagogues', 'General assembly with critical music programs', 25),
  gym: C('Indoor stadiums, gymnasiums', 'Gymnasiums and natatoriums', 45), aerobics: C('Indoor stadiums, gymnasiums', 'Phys. Ed. areas', 35),
  living: LIVING, dwelling: LIVING, bedroom: HOTEL_ROOM, dorm: { ...HOTEL_ROOM, nearest: true }, labour: { ...HOTEL_ROOM, nearest: true },
  factory: { ...LAB_MIN, nearest: true }, warehouse: { ...LAB_MIN, nearest: true },
  patient: C('Hospitals and clinics', 'Patient rooms', 30), exam: C('Hospitals and clinics', 'Operating and procedure rooms', 35),
  icu: C('Hospitals and clinics', 'Wards', 35), theatre: C('Hospitals and clinics', 'Operating and procedure rooms', 35),
  hwait: C('Hospitals and clinics', 'Corridors and lobbies', 40),
};
export const noiseFor = (type: string) => NOISE_BY_TYPE[type] ?? { ...OFFICE_OPEN, nearest: true };

/* Table 8: main duct location × design RC(N) → maximum velocity, fpm [rectangular, circular] */
export type DuctLocation = 'shaft' | 'ceiling' | 'occupied';
export const LOCATIONS: [DuctLocation, string][] = [
  ['shaft', 'In shaft or above drywall ceiling'], ['ceiling', 'Above suspended acoustic ceiling'], ['occupied', 'Duct located within occupied space'],
];
const TABLE8: Record<DuctLocation, Record<45 | 35 | 25, [number, number]>> = {
  shaft: { 45: [3500, 5000], 35: [2500, 3500], 25: [1700, 2500] },
  ceiling: { 45: [2500, 4500], 35: [1750, 3000], 25: [1200, 2000] },
  occupied: { 45: [2000, 3900], 35: [1450, 2600], 25: [950, 1700] },
};
/* Table 8 lists RC(N) 45, 35 and 25; a criterion between them uses the next stricter row */
export const table8Row = (nc: number): 45 | 35 | 25 => nc >= 45 ? 45 : nc >= 35 ? 35 : 25;
const FPM = 0.00508;
/* share of the Table 8 value by section kind: mains 100%, branches about 80%, final runouts 50% or less */
export const KIND_SHARE: Record<SectionKind, number> = { main: 1, branch: 0.8, runout: 0.5 };

/* the ASHRAE maximum velocity for a section, m/s */
export function ashraeVelocity(nc: number, location: DuctLocation, shape: DuctShape, kind: SectionKind) {
  const [rect, circ] = TABLE8[location][table8Row(nc)];
  return (shape === 'round' ? circ : rect) * FPM * KIND_SHARE[kind];
}
