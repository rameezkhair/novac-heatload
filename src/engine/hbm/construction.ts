/* Layered constructions for the heat balance. Each construction keeps the U-value set in the envelope
   step (code value, wall type or U-value calculator) and adds thermal mass from its layers. Where only a
   U-value is known, a typical UAE layer build-up is used and its insulation thickness adjusted to match. */
import { SURF, matOf, type Layer } from '../materials';

/* one homogeneous layer: conductivity W/mK, volumetric heat capacity J/m³K (0 = no mass), thickness m */
export interface Slab { k: number; rc: number; L: number }
export type ConsKind = 'wall' | 'roof' | 'partition' | 'floor' | 'ceiling';

export function toSlabs(layers: Layer[]): Slab[] {
  const out: Slab[] = [];
  for (const l of layers) {
    const m = matOf(l.m); if (!m) continue;
    const L = (m.r != null ? m.t : l.t) / 1000; if (!(L > 0)) continue;
    const k = m.r != null ? L / m.r : m.k ?? 0; if (!(k > 0)) continue;
    /* air gaps carry no useful heat capacity */
    out.push({ k, rc: m.r != null && m.cat === 'Air spaces' ? 0 : (m.rho ?? 0) * (m.c ?? 0), L });
  }
  return out;
}
export const slabR = (s: Slab[]) => s.reduce((a, l) => a + l.L / l.k, 0);
/* suspended ceiling under a roof or slab: plenum (unventilated air space, heat flow down) and 12.5 mm gypsum board */
export const CEILING: Layer[] = [{ m: 'airup', t: 25 }, { m: 'gboard', t: 12.5 }];
/* carpet replaces the tiles on top of a floor slab */
export const withCarpet = (layers: Layer[]) => [...layers.filter((l, i) => !(i === layers.length - 1 && l.m === 'tile')), { m: 'carpet', t: 10 }];
export const withCeiling = (kind: 'roof' | 'ceiling', layers?: Layer[]) => {
  const base = layers && layers.length ? layers : DEFAULT_LAYERS[kind].layers;
  return base[base.length - 1]?.m === 'gboard' ? base : [...base, ...CEILING];
};

/* typical UAE constructions, outside to inside, and where insulation goes when the U-value needs it */
export const DEFAULT_LAYERS: Record<ConsKind, { layers: Layer[]; ins: number; name: string }> = {
  wall: { layers: [{ m: 'plaster', t: 20 }, { m: 'hb200', t: 200 }, { m: 'plaster', t: 15 }], ins: 1, name: '20 mm render, 200 mm hollow block, 15 mm plaster' },
  roof: { layers: [{ m: 'paver', t: 40 }, { m: 'bit', t: 4 }, { m: 'screed', t: 50 }, { m: 'fcon', t: 75 }, { m: 'rc', t: 200 }, { m: 'plaster', t: 15 }], ins: 1, name: 'Inverted roof: pavers, insulation, membrane, screed, foam concrete, 200 mm RC slab' },
  partition: { layers: [{ m: 'plaster', t: 15 }, { m: 'hb100', t: 100 }, { m: 'plaster', t: 15 }], ins: 1, name: '100 mm hollow block, plastered both sides' },
  /* floor: below is outside, room is inside; ceiling: above is outside */
  floor: { layers: [{ m: 'plaster', t: 15 }, { m: 'rc', t: 200 }, { m: 'screed', t: 50 }, { m: 'tile', t: 10 }], ins: 1, name: '200 mm RC slab, screed and tiles' },
  ceiling: { layers: [{ m: 'tile', t: 10 }, { m: 'screed', t: 50 }, { m: 'rc', t: 200 }, { m: 'plaster', t: 15 }], ins: 1, name: '200 mm RC slab, plastered soffit' },
};
/* ISO 6946 surface resistances included in a U-value */
const FILMS: Record<ConsKind, number> = {
  wall: SURF.wall.rsi + SURF.wall.rse, roof: SURF.roof.rsi + SURF.roof.rse, partition: SURF.partition.rsi + SURF.partition.rse,
  floor: 0.17 + 0.17, ceiling: 0.10 + 0.10,
};
export const GLASS_FILMS = SURF.wall.rsi + SURF.wall.rse;
/* insulation added to reach a U-value: generic board, λ 0.035, 30 kg/m³, 1450 J/kgK (ISO 10456) */
const INS = { k: 0.035, rc: 30 * 1450 };

/* layers whose conduction resistance (films excluded) matches the U-value:
   add insulation when the layers are too conductive, or scale conductivities when they are too resistive */
export function fitU(kind: ConsKind, U: number, layers?: Layer[]): Slab[] {
  const def = DEFAULT_LAYERS[kind], base = toSlabs(layers && layers.length ? layers : def.layers);
  if (!(U > 0)) return base;
  const target = Math.max(0.005, 1 / U - FILMS[kind]), R = slabR(base);
  if (Math.abs(target - R) < 1e-4) return base;
  if (target > R) {
    const s = [...base], at = layers && layers.length ? Math.min(1, s.length) : def.ins;
    s.splice(at, 0, { k: INS.k, rc: INS.rc, L: (target - R) * INS.k });
    return s;
  }
  const f = R / target;
  return base.map(l => ({ ...l, k: l.k * f }));
}
/* the room's half of a construction shared with a conditioned neighbour at the same set-point: by symmetry no heat
   crosses the mid-plane, so the far face of the half is adiabatic */
export function halfSlabs(slabs: Slab[]): Slab[] {
  let left = slabR(slabs) > 0 ? slabs.reduce((a, l) => a + l.L, 0) / 2 : 0;
  const out: Slab[] = [];
  for (let i = slabs.length - 1; i >= 0 && left > 1e-9; i--) {
    const l = slabs[i], L = Math.min(l.L, left); out.unshift({ ...l, L }); left -= L;
  }
  return out;
}
/* glazing: no thermal mass */
export const glassSlabs = (U: number): Slab[] => [{ k: 1, rc: 0, L: Math.max(0.005, 1 / Math.max(U, 0.01) - GLASS_FILMS) }];
/* slab on grade: 2 m of soil to the deep-ground temperature (ISO 13370 clay/silt, λ 1.5 W/mK, ρc 3.0 MJ/m³K) under a 150 mm slab */
export const groundSlabs = (carpet = false): Slab[] => [{ k: 1.5, rc: 3.0e6, L: 2 }, ...toSlabs([{ m: 'rc', t: 150 }, { m: 'screed', t: 50 }, { m: carpet ? 'carpet' : 'tile', t: 10 }])];
