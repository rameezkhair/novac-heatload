/* Generic design thermal values for building materials common in UAE construction, for building up
   assembly U-values layer by layer (ISO 6946). These are typical published values, not product data:
   where a manufacturer's certified value exists (insulation, thermal blocks, glazing), use that instead. */

export type MatCat = 'Masonry & blocks' | 'Concrete & screeds' | 'Finishes & boards' | 'Insulation' | 'Roofing & membranes' | 'Cladding & stone' | 'Air spaces';

export interface Material {
  id: string; name: string; cat: MatCat;
  /* conductivity λ in W/mK; or, for a product of fixed thickness (hollow block, air gap), its thermal resistance R in m²K/W */
  k?: number; r?: number;
  t: number; // default thickness, mm (fixed when r is given)
  /* density kg/m³ and specific heat J/kgK, ISO 10456:2007 Table 3; hollow blocks use the apparent density of the whole block */
  rho?: number; c?: number;
  src: string;
}

const ISO = 'ISO 10456:2007 Table 3', CIBSE = 'CIBSE Guide A (2015) Table 3.47', ASH = 'ASHRAE Fundamentals 2021 Ch. 26 Table 1', I6946 = 'ISO 6946:2017 Table 8';

export const MATERIALS: Material[] = [
  /* hollow blocks have cores, so a single R for the block is used rather than a conductivity */
  { id: 'hb100', name: 'Hollow concrete block, 100 mm', cat: 'Masonry & blocks', r: 0.13, t: 100, rho: 1400, c: 1000, src: ASH + ', normal-weight 2-core block (approx.)' },
  { id: 'hb150', name: 'Hollow concrete block, 150 mm', cat: 'Masonry & blocks', r: 0.16, t: 150, rho: 1300, c: 1000, src: ASH + ', normal-weight 2-core block (approx.)' },
  { id: 'hb200', name: 'Hollow concrete block, 200 mm', cat: 'Masonry & blocks', r: 0.19, t: 200, rho: 1200, c: 1000, src: ASH + ', normal-weight 2-core block' },
  { id: 'hb250', name: 'Hollow concrete block, 250 mm', cat: 'Masonry & blocks', r: 0.21, t: 250, rho: 1150, c: 1000, src: ASH + ', normal-weight 2-core block (approx.)' },
  { id: 'sb', name: 'Solid concrete block, dense', cat: 'Masonry & blocks', k: 1.63, t: 200, rho: 2300, c: 1000, src: CIBSE + ', heavyweight block 2300 kg/m³' },
  { id: 'aac', name: 'AAC block (aerated concrete), 600 kg/m³', cat: 'Masonry & blocks', k: 0.16, t: 200, rho: 600, c: 1000, src: ISO + ' / CIBSE, autoclaved aerated concrete' },
  { id: 'aac5', name: 'AAC block (aerated concrete), 500 kg/m³', cat: 'Masonry & blocks', k: 0.14, t: 200, rho: 500, c: 1000, src: ISO + ' / CIBSE, autoclaved aerated concrete' },
  { id: 'brick', name: 'Clay brick, solid', cat: 'Masonry & blocks', k: 0.77, t: 100, rho: 1800, c: 1000, src: CIBSE + ', brickwork outer leaf' },

  { id: 'rc', name: 'Reinforced concrete (slab, column, wall)', cat: 'Concrete & screeds', k: 2.5, t: 200, rho: 2400, c: 1000, src: ISO + ', 2% steel' },
  { id: 'conc', name: 'Plain concrete, dense', cat: 'Concrete & screeds', k: 2.0, t: 100, rho: 2400, c: 1000, src: ISO + ', 2400 kg/m³' },
  { id: 'screed', name: 'Cement–sand screed', cat: 'Concrete & screeds', k: 1.41, t: 50, rho: 2000, c: 1000, src: CIBSE },
  { id: 'fcon', name: 'Foam / lightweight concrete (roof slope fill)', cat: 'Concrete & screeds', k: 0.25, t: 75, rho: 800, c: 1000, src: ISO + ', lightweight concrete ≈ 800 kg/m³' },

  { id: 'plaster', name: 'Cement–sand plaster / render', cat: 'Finishes & boards', k: 0.72, t: 20, rho: 1800, c: 1000, src: CIBSE },
  { id: 'gplaster', name: 'Gypsum plaster', cat: 'Finishes & boards', k: 0.40, t: 13, rho: 1000, c: 1000, src: ISO + ', 1000 kg/m³' },
  { id: 'gboard', name: 'Gypsum plasterboard', cat: 'Finishes & boards', k: 0.25, t: 12.5, rho: 900, c: 1000, src: ISO + ', 900 kg/m³' },
  { id: 'tile', name: 'Ceramic / porcelain tile', cat: 'Finishes & boards', k: 1.3, t: 10, rho: 2300, c: 840, src: ISO },
  { id: 'carpet', name: 'Carpet / textile floor covering', cat: 'Finishes & boards', k: 0.06, t: 10, rho: 200, c: 1300, src: ISO + ', textile flooring' },
  { id: 'cboard', name: 'Cement board / fibre cement', cat: 'Finishes & boards', k: 0.35, t: 12, rho: 1400, c: 1000, src: ISO + ', fibre-cement sheet (typical)' },

  { id: 'eps', name: 'Expanded polystyrene (EPS)', cat: 'Insulation', k: 0.038, t: 50, rho: 20, c: 1450, src: ISO + ' / EN 13163 typical; use certified value' },
  { id: 'xps', name: 'Extruded polystyrene (XPS)', cat: 'Insulation', k: 0.034, t: 50, rho: 35, c: 1450, src: 'EN 13164 typical; use certified value' },
  { id: 'pu', name: 'Polyurethane / PIR board', cat: 'Insulation', k: 0.025, t: 50, rho: 30, c: 1400, src: 'EN 13165 typical; use certified value' },
  { id: 'spu', name: 'Sprayed polyurethane foam', cat: 'Insulation', k: 0.028, t: 50, rho: 35, c: 1400, src: 'EN 14315 typical; use certified value' },
  { id: 'rw', name: 'Rock wool (mineral wool) slab', cat: 'Insulation', k: 0.037, t: 50, rho: 100, c: 1030, src: 'EN 13162 typical; use certified value' },
  { id: 'gw', name: 'Glass wool', cat: 'Insulation', k: 0.040, t: 50, rho: 20, c: 1030, src: 'EN 13162 typical; use certified value' },

  { id: 'bit', name: 'Bitumen waterproofing membrane', cat: 'Roofing & membranes', k: 0.17, t: 4, rho: 1100, c: 1000, src: ISO + ', bitumen' },
  { id: 'gravel', name: 'Gravel / sand ballast', cat: 'Roofing & membranes', k: 2.0, t: 50, rho: 1950, c: 1045, src: ISO + ', sand and gravel' },
  { id: 'paver', name: 'Concrete roof tiles / pavers', cat: 'Roofing & membranes', k: 1.5, t: 40, rho: 2100, c: 1000, src: ISO + ', concrete tiles' },

  { id: 'marble', name: 'Marble cladding', cat: 'Cladding & stone', k: 2.8, t: 30, rho: 2800, c: 1000, src: ISO },
  { id: 'granite', name: 'Granite cladding', cat: 'Cladding & stone', k: 2.8, t: 30, rho: 2600, c: 1000, src: ISO },
  { id: 'lime', name: 'Limestone cladding', cat: 'Cladding & stone', k: 1.7, t: 30, rho: 2200, c: 1000, src: ISO + ', medium-density limestone' },
  { id: 'grc', name: 'GRC panel (glass-fibre reinforced concrete)', cat: 'Cladding & stone', k: 1.0, t: 15, rho: 2000, c: 1000, src: 'Typical manufacturer value; confirm per product' },
  { id: 'acp', name: 'Aluminium composite panel (ACP)', cat: 'Cladding & stone', k: 0.45, t: 4, rho: 2000, c: 900, src: 'Typical (PE/FR core); negligible resistance' },

  { id: 'air', name: 'Unventilated air gap, 25 mm or more (wall)', cat: 'Air spaces', r: 0.18, t: 25, rho: 1.2, c: 1006, src: I6946 + ', horizontal heat flow' },
  { id: 'airup', name: 'Unventilated air gap, 25 mm or more (roof / ceiling)', cat: 'Air spaces', r: 0.16, t: 25, rho: 1.2, c: 1006, src: I6946 + ', heat flow upward; 0.22 downward' },
];

export type AssemblyKind = 'wall' | 'roof' | 'partition';
/* surface resistances, ISO 6946 Table 7: walls horizontal flow; roofs taken with heat flowing down (cooling) */
export const SURF: Record<AssemblyKind, { rsi: number; rse: number; note: string }> = {
  wall: { rsi: 0.13, rse: 0.04, note: 'Rsi 0.13 / Rse 0.04 (ISO 6946, horizontal heat flow)' },
  roof: { rsi: 0.17, rse: 0.04, note: 'Rsi 0.17 / Rse 0.04 (ISO 6946, heat flow downward, as in cooling)' },
  partition: { rsi: 0.13, rse: 0.13, note: 'Rsi 0.13 on both sides (ISO 6946, internal partition)' },
};

export interface Layer { m: string; t: number }
export interface Preset { id: string; name: string; kind: AssemblyKind; layers: Layer[] }

/* common UAE constructions, outside to inside */
export const PRESETS: Preset[] = [
  { id: 'w-hb', name: '200 mm hollow block, plastered both sides (uninsulated)', kind: 'wall', layers: [{ m: 'plaster', t: 20 }, { m: 'hb200', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'w-hb-eps', name: '200 mm hollow block + 50 mm EPS, external render', kind: 'wall', layers: [{ m: 'plaster', t: 15 }, { m: 'eps', t: 50 }, { m: 'hb200', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'w-hb-xps-in', name: '200 mm hollow block + 50 mm XPS + gypsum board lining', kind: 'wall', layers: [{ m: 'plaster', t: 20 }, { m: 'hb200', t: 200 }, { m: 'xps', t: 50 }, { m: 'gboard', t: 12.5 }] },
  { id: 'w-aac', name: '200 mm AAC block, plastered both sides', kind: 'wall', layers: [{ m: 'plaster', t: 20 }, { m: 'aac', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'w-stone', name: 'Stone cladding on 200 mm block + 50 mm rock wool, air gap', kind: 'wall', layers: [{ m: 'granite', t: 30 }, { m: 'air', t: 25 }, { m: 'rw', t: 50 }, { m: 'hb200', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'w-rc', name: '200 mm RC wall + 50 mm PU, cladding', kind: 'wall', layers: [{ m: 'acp', t: 4 }, { m: 'air', t: 25 }, { m: 'pu', t: 50 }, { m: 'rc', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'r-inv', name: 'Inverted roof: pavers, XPS 75 mm, membrane, screed, 200 mm RC slab', kind: 'roof', layers: [{ m: 'paver', t: 40 }, { m: 'xps', t: 75 }, { m: 'bit', t: 4 }, { m: 'screed', t: 50 }, { m: 'fcon', t: 75 }, { m: 'rc', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'r-pu', name: 'Roof: tiles, screed, 50 mm sprayed PU, 200 mm RC slab', kind: 'roof', layers: [{ m: 'tile', t: 10 }, { m: 'screed', t: 50 }, { m: 'bit', t: 4 }, { m: 'spu', t: 50 }, { m: 'rc', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'r-bare', name: 'Uninsulated roof: screed, membrane, 200 mm RC slab', kind: 'roof', layers: [{ m: 'screed', t: 50 }, { m: 'bit', t: 4 }, { m: 'rc', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'p-hb', name: '100 mm hollow block partition, plastered both sides', kind: 'partition', layers: [{ m: 'plaster', t: 15 }, { m: 'hb100', t: 100 }, { m: 'plaster', t: 15 }] },
  { id: 'p-hb200', name: '200 mm hollow block partition, plastered both sides', kind: 'partition', layers: [{ m: 'plaster', t: 15 }, { m: 'hb200', t: 200 }, { m: 'plaster', t: 15 }] },
  { id: 'p-gyp', name: 'Gypsum stud partition: 2 × 12.5 mm board each side, 50 mm rock wool', kind: 'partition', layers: [{ m: 'gboard', t: 25 }, { m: 'rw', t: 50 }, { m: 'gboard', t: 25 }] },
  { id: 'p-gyp-air', name: 'Gypsum stud partition: 12.5 mm board each side, empty cavity', kind: 'partition', layers: [{ m: 'gboard', t: 12.5 }, { m: 'air', t: 50 }, { m: 'gboard', t: 12.5 }] },
];

export const matOf = (id: string) => MATERIALS.find(m => m.id === id);
/* thermal resistance of one layer, m²K/W */
export const layerR = (l: Layer) => { const m = matOf(l.m); if (!m) return 0; return m.r ?? (m.k ? (l.t / 1000) / m.k : 0); };
/* ISO 6946 U-value: 1 / (Rsi + ΣR + Rse) */
export function assemblyU(kind: AssemblyKind, layers: Layer[]) {
  const s = SURF[kind], R = s.rsi + s.rse + layers.reduce((a, l) => a + layerR(l), 0);
  return { R, U: R > 0 ? 1 / R : 0 };
}
