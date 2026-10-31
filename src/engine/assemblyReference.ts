/* ANSI/ASHRAE/IES Standard 90.1-2022 (I-P), Tables 5.5-0 to 5.5-8: building envelope requirements for
   climate zones 0 to 8, plus Table 5.5.3.1.4 (increased roof insulation where no cool roof is used, zones 0 to 3).
   Values are stored as printed in the I-P edition and converted to SI on read:
   U- and C-factors × 5.678263 → W/m²K, F-factors × 1.730735 → W/m·K, R-values × 0.176110 → m²K/W.
   The UAE (Abu Dhabi, Al Ain, Dubai, Sharjah, Fujairah, Ras Al Khaimah) is climate zone 0B (Standard 169, Table A-6). */

export type AssemblySurface =
  | 'Roof' | 'Above-grade wall' | 'Below-grade wall' | 'Floor' | 'Slab-on-grade floor' | 'Opaque door'
  | 'Vertical fenestration' | 'Skylight';
export type BuildingUse = 'nonresidential' | 'residential' | 'semiheated';
/* opaque: [I-P max U/C/F, I-P min insulation R]; fenestration: [I-P max U, max SHGC, min VT/SHGC] (null = no requirement) */
type OpaqueReq = readonly [number, string];
type FenReq = readonly [number, number | null, number | null];
type Req = OpaqueReq | FenReq;
export type AssemblyReference = readonly [zone: number, surface: AssemblySurface, assembly: string, nonresidential: Req, residential: Req, semiheated: Req];

/* which factor each surface is limited by */
export const METRIC: Record<AssemblySurface, 'U' | 'C' | 'F'> = {
  Roof: 'U', 'Above-grade wall': 'U', 'Below-grade wall': 'C', Floor: 'U', 'Slab-on-grade floor': 'F', 'Opaque door': 'U',
  'Vertical fenestration': 'U', Skylight: 'U',
};
export const isFenestration = (s: AssemblySurface) => s === 'Vertical fenestration' || s === 'Skylight';
const U_SI = 5.678263, F_SI = 1.730735, R_SI = 0.17611;

type Row = readonly [AssemblySurface, string, Req, Req, Req];
const zone = (z: number, rows: Row[]): AssemblyReference[] => rows.map(r => [z, ...r] as const);
/* rows that only differ by zone are written once */
const NR = 'NR';
const DOORS = (semiSw: number, semiNs: number): Row[] => [
  ['Opaque door', 'Swinging', [0.37, NR], [0.37, NR], [semiSw, NR]],
  ['Opaque door', 'Nonswinging', [0.31, NR], [0.31, NR], [semiNs, NR]],
];
const FEN = (nonres: [number, number, number, number, number, number], res: typeof nonres, semi: [number, number, number], sky: [number, number | null, number, number | null, number]): Row[] => [
  ['Vertical fenestration', 'Fixed', [nonres[0], nonres[1], 1.1], [res[0], res[1], 1.1], [semi[0], null, null]],
  ['Vertical fenestration', 'Operable', [nonres[2], nonres[3], 1.1], [res[2], res[3], 1.1], [semi[1], null, null]],
  ['Vertical fenestration', 'Entrance door', [nonres[4], nonres[5], 1.1], [res[4], res[5], 1.1], [semi[2], null, null]],
  ['Skylight', 'All types, 0–3% of roof', [sky[0], sky[1], null], [sky[2], sky[3], null], [sky[4], null, null]],
];
const LOW_FLOORS: Row[] = [
  ['Below-grade wall', 'Below-grade wall', [1.14, NR], [1.14, NR], [1.14, NR]],
];

export const ASSEMBLY_REFERENCES: readonly AssemblyReference[] = [
  ...zone(0, [
    ['Roof', 'Insulation entirely above deck', [0.039, 'R-25 ci'], [0.032, 'R-30 ci'], [0.218, 'R-3.8 ci']],
    ['Roof', 'Insulation above deck, no cool roof', [0.027, 'R-36 ci'], [0.027, 'R-36 ci'], [0.218, 'R-3.8 ci']],
    ['Roof', 'Metal building', [0.041, 'R-10 + R-19 FC'], [0.041, 'R-10 + R-19 FC'], [0.115, 'R-10']],
    ['Roof', 'Metal building, no cool roof', [0.028, 'R-35'], [0.028, 'R-35'], [0.115, 'R-10']],
    ['Roof', 'Attic and other', [0.027, 'R-38'], [0.027, 'R-38'], [0.081, 'R-13']],
    ['Above-grade wall', 'Mass', [0.58, NR], [0.151, 'R-5.7 ci'], [0.58, NR]],
    ['Above-grade wall', 'Metal building', [0.094, 'R-0 + R-9.8 ci'], [0.094, 'R-0 + R-9.8 ci'], [0.352, NR]],
    ['Above-grade wall', 'Steel-framed', [0.124, 'R-13'], [0.124, 'R-13'], [0.352, NR]],
    ['Above-grade wall', 'Wood-framed and other', [0.089, 'R-13'], [0.089, 'R-13'], [0.292, NR]],
    ...LOW_FLOORS,
    ['Floor', 'Mass', [0.322, NR], [0.322, NR], [0.322, NR]],
    ['Floor', 'Steel joist', [0.35, NR], [0.35, NR], [0.35, NR]],
    ['Floor', 'Wood-framed and other', [0.282, NR], [0.282, NR], [0.282, NR]],
    ['Slab-on-grade floor', 'Unheated', [0.73, NR], [0.73, NR], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [1.02, 'R-7.5 for 12 in.'], [1.02, 'R-7.5 for 12 in.'], [1.02, 'R-7.5 for 12 in.']],
    ...DOORS(0.7, 1.45),
    ...FEN([0.5, 0.22, 0.62, 0.2, 0.83, 0.2], [0.5, 0.22, 0.62, 0.2, 0.83, 0.2], [1.2, 1.2, 1.1], [0.7, 0.3, 0.7, 0.3, 1.8]),
  ]),
  ...zone(1, [
    ['Roof', 'Insulation entirely above deck', [0.048, 'R-20 ci'], [0.039, 'R-25 ci'], [0.218, 'R-3.8 ci']],
    ['Roof', 'Insulation above deck, no cool roof', [0.03, 'R-33 ci'], [0.029, 'R-34 ci'], [0.218, 'R-3.8 ci']],
    ['Roof', 'Metal building', [0.041, 'R-10 + R-19 FC'], [0.041, 'R-10 + R-19 FC'], [0.115, 'R-10']],
    ['Roof', 'Metal building, no cool roof', [0.028, 'R-35'], [0.028, 'R-35'], [0.115, 'R-10']],
    ['Roof', 'Attic and other', [0.027, 'R-38'], [0.027, 'R-38'], [0.081, 'R-13']],
    ['Above-grade wall', 'Mass', [0.58, NR], [0.151, 'R-5.7 ci'], [0.58, NR]],
    ['Above-grade wall', 'Metal building', [0.094, 'R-0 + R-9.8 ci'], [0.094, 'R-0 + R-9.8 ci'], [0.352, NR]],
    ['Above-grade wall', 'Steel-framed', [0.124, 'R-13'], [0.124, 'R-13'], [0.352, NR]],
    ['Above-grade wall', 'Wood-framed and other', [0.089, 'R-13'], [0.089, 'R-13'], [0.292, NR]],
    ...LOW_FLOORS,
    ['Floor', 'Mass', [0.322, NR], [0.322, NR], [0.322, NR]],
    ['Floor', 'Steel joist', [0.35, NR], [0.35, NR], [0.35, NR]],
    ['Floor', 'Wood-framed and other', [0.282, NR], [0.282, NR], [0.282, NR]],
    ['Slab-on-grade floor', 'Unheated', [0.73, NR], [0.73, NR], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [1.02, 'R-7.5 for 12 in.'], [1.02, 'R-7.5 for 12 in.'], [1.02, 'R-7.5 for 12 in.']],
    ...DOORS(0.7, 1.45),
    ...FEN([0.5, 0.23, 0.62, 0.21, 0.83, 0.21], [0.5, 0.23, 0.62, 0.21, 0.83, 0.21], [1.2, 1.2, 1.1], [0.7, 0.3, 0.7, 0.3, 1.8]),
  ]),
  ...zone(2, [
    ['Roof', 'Insulation entirely above deck', [0.039, 'R-25 ci'], [0.039, 'R-25 ci'], [0.173, 'R-5 ci']],
    ['Roof', 'Insulation above deck, no cool roof', [0.03, 'R-33 ci'], [0.029, 'R-34 ci'], [0.173, 'R-5 ci']],
    ['Roof', 'Metal building', [0.041, 'R-10 + R-19 FC'], [0.041, 'R-10 + R-19 FC'], [0.096, 'R-16']],
    ['Roof', 'Metal building, no cool roof', [0.028, 'R-35'], [0.028, 'R-35'], [0.096, 'R-16']],
    ['Roof', 'Attic and other', [0.027, 'R-38'], [0.027, 'R-38'], [0.053, 'R-19']],
    ['Above-grade wall', 'Mass', [0.151, 'R-5.7 ci'], [0.123, 'R-7.6 ci'], [0.58, NR]],
    ['Above-grade wall', 'Metal building', [0.094, 'R-0 + R-9.8 ci'], [0.094, 'R-0 + R-9.8 ci'], [0.162, 'R-13']],
    ['Above-grade wall', 'Steel-framed', [0.084, 'R-13 + R-3.8 ci'], [0.064, 'R-13 + R-7.5 ci'], [0.124, 'R-13']],
    ['Above-grade wall', 'Wood-framed and other', [0.089, 'R-13'], [0.089, 'R-13'], [0.089, 'R-13']],
    ...LOW_FLOORS,
    ['Floor', 'Mass', [0.107, 'R-6.3 ci'], [0.087, 'R-8.3 ci'], [0.322, NR]],
    ['Floor', 'Steel joist', [0.038, 'R-30'], [0.038, 'R-30'], [0.069, 'R-13']],
    ['Floor', 'Wood-framed and other', [0.033, 'R-30'], [0.033, 'R-30'], [0.066, 'R-13']],
    ['Slab-on-grade floor', 'Unheated', [0.73, NR], [0.73, NR], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [0.9, 'R-10 for 24 in.'], [0.86, 'R-15 for 24 in.'], [1.02, 'R-7.5 for 12 in.']],
    ...DOORS(0.7, 1.45),
    ...FEN([0.45, 0.25, 0.6, 0.23, 0.77, 0.23], [0.45, 0.25, 0.6, 0.23, 0.77, 0.23], [0.5, 0.65, 0.77], [0.65, 0.3, 0.65, 0.3, 0.9]),
  ]),
  ...zone(3, [
    ['Roof', 'Insulation entirely above deck', [0.039, 'R-25 ci'], [0.039, 'R-25 ci'], [0.119, 'R-7.6 ci']],
    ['Roof', 'Insulation above deck, no cool roof', [0.03, 'R-33 ci'], [0.029, 'R-34 ci'], [0.119, 'R-7.6 ci']],
    ['Roof', 'Metal building', [0.041, 'R-10 + R-19 FC'], [0.041, 'R-10 + R-19 FC'], [0.096, 'R-16']],
    ['Roof', 'Metal building, no cool roof', [0.028, 'R-35'], [0.028, 'R-35'], [0.096, 'R-16']],
    ['Roof', 'Attic and other', [0.027, 'R-38'], [0.027, 'R-38'], [0.053, 'R-19']],
    ['Above-grade wall', 'Mass', [0.123, 'R-7.6 ci'], [0.104, 'R-9.5 ci'], [0.58, NR]],
    ['Above-grade wall', 'Metal building', [0.094, 'R-0 + R-9.8 ci'], [0.072, 'R-0 + R-13 ci'], [0.162, 'R-13']],
    ['Above-grade wall', 'Steel-framed', [0.077, 'R-13 + R-5 ci'], [0.064, 'R-13 + R-7.5 ci'], [0.124, 'R-13']],
    ['Above-grade wall', 'Wood-framed and other', [0.089, 'R-13'], [0.064, 'R-13 + R-3.8 ci or R-20'], [0.089, 'R-13']],
    ...LOW_FLOORS,
    ['Floor', 'Mass', [0.074, 'R-10 ci'], [0.074, 'R-10 ci'], [0.137, 'R-4.2 ci']],
    ['Floor', 'Steel joist', [0.038, 'R-30'], [0.038, 'R-30'], [0.052, 'R-19']],
    ['Floor', 'Wood-framed and other', [0.033, 'R-30'], [0.033, 'R-30'], [0.051, 'R-19']],
    ['Slab-on-grade floor', 'Unheated', [0.73, NR], [0.54, 'R-10 for 24 in.'], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [0.86, 'R-15 for 24 in.'], [0.86, 'R-15 for 24 in.'], [1.02, 'R-7.5 for 12 in.']],
    ...DOORS(0.37, 0.36),
    ...FEN([0.42, 0.25, 0.54, 0.23, 0.68, 0.23], [0.42, 0.25, 0.54, 0.23, 0.68, 0.23], [0.5, 0.65, 0.77], [0.55, 0.3, 0.55, 0.3, 0.9]),
  ]),
  ...zone(4, [
    ['Roof', 'Insulation entirely above deck', [0.032, 'R-30 ci'], [0.032, 'R-30 ci'], [0.093, 'R-10 ci']],
    ['Roof', 'Metal building', [0.037, 'R-19 + R-11 Ls or R-25 + R-8 Ls'], [0.037, 'R-19 + R-11 Ls or R-25 + R-8 Ls'], [0.082, 'R-19']],
    ['Roof', 'Attic and other', [0.021, 'R-49'], [0.021, 'R-49'], [0.034, 'R-30']],
    ['Above-grade wall', 'Mass', [0.104, 'R-9.5 ci'], [0.09, 'R-11.4 ci'], [0.58, NR]],
    ['Above-grade wall', 'Metal building', [0.06, 'R-0 + R-15.8 ci'], [0.05, 'R-0 + R-19 ci'], [0.162, 'R-13']],
    ['Above-grade wall', 'Steel-framed', [0.064, 'R-13 + R-7.5 ci'], [0.064, 'R-13 + R-7.5 ci'], [0.124, 'R-13']],
    ['Above-grade wall', 'Wood-framed and other', [0.064, 'R-13 + R-3.8 ci or R-20'], [0.064, 'R-13 + R-3.8 ci or R-20'], [0.089, 'R-13']],
    ['Below-grade wall', 'Below-grade wall', [0.119, 'R-7.5 ci'], [0.092, 'R-10 ci'], [1.14, NR]],
    ['Floor', 'Mass', [0.057, 'R-14.6 ci'], [0.051, 'R-16.7 ci'], [0.107, 'R-6.3 ci']],
    ['Floor', 'Steel joist', [0.038, 'R-30'], [0.038, 'R-30'], [0.052, 'R-19']],
    ['Floor', 'Wood-framed and other', [0.033, 'R-30'], [0.033, 'R-30'], [0.051, 'R-19']],
    ['Slab-on-grade floor', 'Unheated', [0.52, 'R-15 for 24 in.'], [0.52, 'R-15 for 24 in.'], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [0.843, 'R-20 for 24 in.'], [0.688, 'R-20 for 48 in.'], [0.9, 'R-10 for 24 in.']],
    ...DOORS(0.37, 0.36),
    ...FEN([0.36, 0.36, 0.45, 0.33, 0.63, 0.33], [0.36, 0.36, 0.45, 0.33, 0.63, 0.33], [0.5, 0.65, 0.77], [0.5, 0.4, 0.5, 0.4, 0.75]),
  ]),
  ...zone(5, [
    ['Roof', 'Insulation entirely above deck', [0.032, 'R-30 ci'], [0.032, 'R-30 ci'], [0.063, 'R-15 ci']],
    ['Roof', 'Metal building', [0.037, 'R-19 + R-11 Ls or R-25 + R-8 Ls'], [0.037, 'R-19 + R-11 Ls or R-25 + R-8 Ls'], [0.082, 'R-19']],
    ['Roof', 'Attic and other', [0.021, 'R-49'], [0.021, 'R-49'], [0.034, 'R-30']],
    ['Above-grade wall', 'Mass', [0.09, 'R-11.4 ci'], [0.08, 'R-13.3 ci'], [0.151, 'R-5.7 ci']],
    ['Above-grade wall', 'Metal building', [0.05, 'R-0 + R-19 ci'], [0.05, 'R-0 + R-19 ci'], [0.094, 'R-0 + R-9.8 ci']],
    ['Above-grade wall', 'Steel-framed', [0.055, 'R-13 + R-10 ci'], [0.055, 'R-13 + R-10 ci'], [0.084, 'R-13 + R-3.8 ci']],
    ['Above-grade wall', 'Wood-framed and other', [0.051, 'R-13 + R-7.5 ci or R-19 + R-5 ci'], [0.051, 'R-13 + R-7.5 ci or R-19 + R-5 ci'], [0.089, 'R-13']],
    ['Below-grade wall', 'Below-grade wall', [0.119, 'R-7.5 ci'], [0.092, 'R-10 ci'], [1.14, NR]],
    ['Floor', 'Mass', [0.057, 'R-14.6 ci'], [0.051, 'R-16.7 ci'], [0.107, 'R-6.3 ci']],
    ['Floor', 'Steel joist', [0.038, 'R-30'], [0.038, 'R-30'], [0.052, 'R-19']],
    ['Floor', 'Wood-framed and other', [0.033, 'R-30'], [0.033, 'R-30'], [0.051, 'R-19']],
    ['Slab-on-grade floor', 'Unheated', [0.52, 'R-15 for 24 in.'], [0.51, 'R-20 for 24 in.'], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [0.688, 'R-20 for 48 in.'], [0.688, 'R-20 for 48 in.'], [0.9, 'R-10 for 24 in.']],
    ...DOORS(0.37, 0.36),
    ...FEN([0.36, 0.38, 0.45, 0.33, 0.63, 0.33], [0.36, 0.38, 0.45, 0.33, 0.63, 0.33], [0.5, 0.65, 0.77], [0.5, 0.4, 0.5, 0.4, 0.75]),
  ]),
  ...zone(6, [
    ['Roof', 'Insulation entirely above deck', [0.032, 'R-30 ci'], [0.032, 'R-30 ci'], [0.063, 'R-15 ci']],
    ['Roof', 'Metal building', [0.031, 'R-25 + R-11 Ls'], [0.029, 'R-30 + R-11 Ls'], [0.06, 'R-19 + R-19']],
    ['Roof', 'Attic and other', [0.021, 'R-49'], [0.021, 'R-49'], [0.034, 'R-30']],
    ['Above-grade wall', 'Mass', [0.08, 'R-13.3 ci'], [0.071, 'R-15.2 ci'], [0.151, 'R-5.7 ci']],
    ['Above-grade wall', 'Metal building', [0.05, 'R-0 + R-19 ci'], [0.05, 'R-0 + R-19 ci'], [0.094, 'R-0 + R-9.8 ci']],
    ['Above-grade wall', 'Steel-framed', [0.049, 'R-13 + R-12.5 ci'], [0.049, 'R-13 + R-12.5 ci'], [0.084, 'R-13 + R-3.8 ci']],
    ['Above-grade wall', 'Wood-framed and other', [0.051, 'R-13 + R-7.5 ci or R-19 + R-5 ci'], [0.051, 'R-13 + R-7.5 ci or R-19 + R-5 ci'], [0.089, 'R-13']],
    ['Below-grade wall', 'Below-grade wall', [0.092, 'R-10 ci'], [0.063, 'R-15 ci'], [0.119, 'R-7.5 ci']],
    ['Floor', 'Mass', [0.051, 'R-16.7 ci'], [0.051, 'R-16.7 ci'], [0.087, 'R-8.3 ci']],
    ['Floor', 'Steel joist', [0.032, 'R-38'], [0.032, 'R-38'], [0.052, 'R-19']],
    ['Floor', 'Wood-framed and other', [0.027, 'R-38'], [0.027, 'R-38'], [0.051, 'R-19']],
    ['Slab-on-grade floor', 'Unheated', [0.51, 'R-20 for 24 in.'], [0.434, 'R-20 for 48 in.'], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [0.688, 'R-20 for 48 in.'], [0.671, 'R-25 for 48 in.'], [0.86, 'R-15 for 24 in.']],
    ...DOORS(0.37, 0.36),
    ...FEN([0.34, 0.38, 0.42, 0.34, 0.63, 0.34], [0.34, 0.38, 0.42, 0.34, 0.63, 0.34], [0.39, 0.48, 0.68], [0.47, 0.4, 0.5, 0.4, 0.75]),
  ]),
  ...zone(7, [
    ['Roof', 'Insulation entirely above deck', [0.028, 'R-35 ci'], [0.028, 'R-35 ci'], [0.039, 'R-25 ci']],
    ['Roof', 'Metal building', [0.029, 'R-30 + R-11 Ls'], [0.029, 'R-30 + R-11 Ls'], [0.037, 'R-19 + R-11 Ls or R-25 + R-8 Ls']],
    ['Roof', 'Attic and other', [0.017, 'R-60'], [0.017, 'R-60'], [0.027, 'R-38']],
    ['Above-grade wall', 'Mass', [0.071, 'R-15.2 ci'], [0.071, 'R-15.2 ci'], [0.123, 'R-7.6 ci']],
    ['Above-grade wall', 'Metal building', [0.044, 'R-0 + R-22.1 ci'], [0.044, 'R-0 + R-22.1 ci'], [0.072, 'R-0 + R-13 ci']],
    ['Above-grade wall', 'Steel-framed', [0.049, 'R-13 + R-12.5 ci'], [0.042, 'R-13 + R-15.6 ci'], [0.064, 'R-13 + R-7.5 ci']],
    ['Above-grade wall', 'Wood-framed and other', [0.051, 'R-13 + R-7.5 ci or R-19 + R-5 ci'], [0.051, 'R-13 + R-7.5 ci or R-19 + R-5 ci'], [0.064, 'R-13 + R-3.8 ci']],
    ['Below-grade wall', 'Below-grade wall', [0.063, 'R-15 ci'], [0.063, 'R-15 ci'], [0.119, 'R-7.5 ci']],
    ['Floor', 'Mass', [0.042, 'R-20.9 ci'], [0.042, 'R-20.9 ci'], [0.074, 'R-10.4 ci']],
    ['Floor', 'Steel joist', [0.032, 'R-38'], [0.032, 'R-38'], [0.052, 'R-19']],
    ['Floor', 'Wood-framed and other', [0.027, 'R-38'], [0.027, 'R-38'], [0.051, 'R-19']],
    ['Slab-on-grade floor', 'Unheated', [0.51, 'R-20 for 24 in.'], [0.434, 'R-20 for 48 in.'], [0.73, NR]],
    ['Slab-on-grade floor', 'Heated', [0.671, 'R-25 for 48 in.'], [0.671, 'R-25 for 48 in.'], [0.86, 'R-15 for 24 in.']],
    ...DOORS(0.37, 0.31),
    ['Vertical fenestration', 'Fixed', [0.29, 0.4, 1.1], [0.29, 0.4, 1.1], [0.36, null, null]],
    ['Vertical fenestration', 'Operable', [0.36, 0.36, 1.1], [0.36, 0.36, 1.1], [0.44, null, null]],
    ['Vertical fenestration', 'Entrance door', [0.63, 0.36, 1.1], [0.63, 0.36, 1.1], [0.63, null, null]],
    ['Skylight', 'All types, 0–3% of roof', [0.44, null, null], [0.44, null, null], [0.75, null, null]],
  ]),
  ...zone(8, [
    ['Roof', 'Insulation entirely above deck', [0.028, 'R-35 ci'], [0.028, 'R-35 ci'], [0.039, 'R-25 ci']],
    ['Roof', 'Metal building', [0.026, 'R-25 + R-11 + R-11 Ls'], [0.026, 'R-25 + R-11 + R-11 Ls'], [0.037, 'R-19 + R-11 Ls or R-25 + R-8 Ls']],
    ['Roof', 'Attic and other', [0.017, 'R-60'], [0.017, 'R-60'], [0.027, 'R-38']],
    ['Above-grade wall', 'Mass', [0.048, 'R-19 ci'], [0.048, 'R-19 ci'], [0.104, 'R-9.5 ci']],
    ['Above-grade wall', 'Metal building', [0.039, 'R-0 + R-25 ci'], [0.039, 'R-0 + R-25 ci'], [0.06, 'R-0 + R-15.8 ci']],
    ['Above-grade wall', 'Steel-framed', [0.037, 'R-13 + R-18.8 ci'], [0.037, 'R-13 + R-18.8 ci'], [0.064, 'R-13 + R-7.5 ci']],
    ['Above-grade wall', 'Wood-framed and other', [0.032, 'R-13 + R-18.8 ci'], [0.032, 'R-13 + R-18.8 ci'], [0.051, 'R-13 + R-7.5 ci']],
    ['Below-grade wall', 'Below-grade wall', [0.063, 'R-15 ci'], [0.063, 'R-15 ci'], [0.119, 'R-7.5 ci']],
    ['Floor', 'Mass', [0.038, 'R-23 ci'], [0.038, 'R-23 ci'], [0.064, 'R-12.5 ci']],
    ['Floor', 'Steel joist', [0.032, 'R-38'], [0.032, 'R-38'], [0.052, 'R-19']],
    ['Floor', 'Wood-framed and other', [0.027, 'R-38'], [0.027, 'R-38'], [0.033, 'R-30']],
    ['Slab-on-grade floor', 'Unheated', [0.434, 'R-20 for 48 in.'], [0.424, 'R-25 for 48 in.'], [0.54, 'R-10 for 24 in.']],
    ['Slab-on-grade floor', 'Heated', [0.671, 'R-25 for 48 in.'], [0.373, 'R-20 full slab'], [0.86, 'R-15 for 24 in.']],
    ...DOORS(0.37, 0.31),
    ['Vertical fenestration', 'Fixed', [0.26, 0.4, 1.1], [0.26, 0.4, 1.1], [0.36, null, null]],
    ['Vertical fenestration', 'Operable', [0.32, 0.36, 1.1], [0.32, 0.36, 1.1], [0.44, null, null]],
    ['Vertical fenestration', 'Entrance door', [0.63, 0.36, 1.1], [0.63, 0.36, 1.1], [0.63, null, null]],
    ['Skylight', 'All types, 0–3% of roof', [0.41, null, null], [0.41, null, null], [0.75, null, null]],
  ]),
];

/* SI view of one requirement */
export interface Requirement { max: number; unit: string; minimumR: string; shgc: number | null; vtShgc: number | null }
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/* "R-10 + R-19 FC" → "R-1.8 + R-3.3 FC"; "for 24 in." → "for 610 mm" */
export function rToSI(ip: string) {
  return ip.replace(/R-([\d.]+)/g, (_, r) => Number(r) === 0 ? 'R-0' : `R-${(Number(r) * R_SI).toFixed(1)}`)
    .replace(/(\d+) in\./g, (_, n) => `${Math.round(Number(n) * 25.4 / 10) * 10} mm`);
}
export function getRequirement(reference: AssemblyReference, use: BuildingUse): Requirement {
  const req = use === 'nonresidential' ? reference[3] : use === 'residential' ? reference[4] : reference[5];
  const m = METRIC[reference[1]];
  const max = r3(req[0] * (m === 'F' ? F_SI : U_SI)), unit = m === 'F' ? 'W/m·K' : 'W/m²K';
  if (isFenestration(reference[1])) {
    const [, shgc, vt] = req as FenReq;
    return { max, unit, minimumR: '–', shgc, vtShgc: vt };
  }
  return { max, unit, minimumR: rToSI((req as OpaqueReq)[1]), shgc: null, vtShgc: null };
}

/* insulation thickness for a minimum R: "R-2.3 + R-0.7 ci" -> "80 mm + 25 mm ci", thickness = R × λ rounded up to 5 mm;
   alternatives ("… or …") are kept, R-0 layers dropped */
export function insulationThickness(minimumR: string, k: number) {
  const alts = minimumR.split(' or ').map(alt => [...alt.matchAll(/R-([\d.]+)( ci| FC| Ls)?/g)]
    .filter(([, r]) => Number(r) > 0)
    .map(([, r, tag]) => `${Math.ceil(Number(r) * k * 1000 / 5) * 5} mm${tag || ''}`).join(' + ')).filter(Boolean);
  return alts.length ? alts.join(' or ') : '–';
}

/* UAE weather stations in ASHRAE 169 Table A-6 (reproduced in 90.1-2022 Annex 1): all climate zone 0B */
export const UAE_STATIONS: readonly [station: string, wmo: string, zone: string][] = [
  ['Abu Dhabi Bateen Airport', '412160', '0B'], ['Abu Dhabi International', '412170', '0B'], ['Al Ain International', '412180', '0B'],
  ['Dubai International', '411940', '0B'], ['Fujairah', '411980', '0B'], ['Ras Al Khaimah International', '411840', '0B'],
  ['Sharjah International', '411960', '0B'],
];
