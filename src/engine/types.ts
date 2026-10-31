import type { Layer } from './materials';
import type { WeatherRef } from './weather/types';

/* A numeric input may be blank while the user is typing; the engine reads blanks as 0 via num(). */
export type Num = number | '';
export type Orient = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
/* a check result: [status, explanation, optional badge label] */
export type Mark = ['ok' | 'bad' | 'warn', string, string?] | null;

/* t: the external wall type from the envelope step; none means the default wall U-value */
export interface WallEntry { w: Num; g: Num; t?: string }
/* a surface next to another space: area, adjacent space type, its temperature (custom only) and a U-value override */
export interface Adjacent { a: Num; adj: string; t: Num; u: Num }
/* pt: the wall partition type from the envelope step; none means the default partition U-value */
export interface Partition extends Adjacent { type: 'wall'; pt?: string }
/* a named wall construction (external or partition) with its own U-value; layers (from the U-value calculator) give the heat balance its thermal mass */
export interface PartType { id: string; name: string; u: Num; layers?: Layer[] }

export interface RoomSrc {
  people: string; light: string; equip: string; oa: string; ach: string; act: string;
  /* the outdoor air category the fresh air was calculated from, kept when the IAQ ventilation result is applied */
  oaBasis?: string;
}
export interface Room {
  id: string; name: string; type: string; qty: Num; area: Num; height: Num;
  walls: Record<Orient, WallEntry>;
  above: 'roof' | 'cond' | 'uncond'; below: 'cond' | 'uncond' | 'outdoor' | 'ground';
  roof: Num; sky: Num;
  ce: Adjacent; fl: Adjacent; px: Partition[];
  people: Num; light: Num; equip: Num; oa: Num; ach: Num; ps: Num; pl: Num;
  src: RoomSrc;
  /* operating schedule for people, lighting and equipment (heat balance method); none = 24 hours */
  sched?: string;
  /* exhaust airflow, L/s per unit (toilets, kitchens, process), for the IAQ air balance */
  exh?: Num;
}

export interface ProjectSrc {
  indoor: string; ez: string; out: string; vent: string;
  uWall?: string; uRoof?: string; uGlass?: string; shgc?: string; uSky?: string; shgcSky?: string;
  [k: string]: string | undefined;
}
export interface Project {
  name: string; client: string; consultant: string; contractor: string;
  location: string; subloc: string; cbasis: string; codeset?: string;
  toDB: Num; toWB: Num; dr: Num; elev: Num; vDB: Num; vWB: Num;
  autoBand: boolean;
  tiDB: Num; tiRH: Num; met: Num; clo: Num; vel: Num;
  uPart: Num; partTypes: PartType[]; uCeil: Num; uFloor: Num; shade: Num; tAdj: Num;
  tSupply: Num; sfS: Num; sfL: Num; fahu: boolean; diversity: Num;
  acType: 'split' | 'ducted' | 'vrf'; ratedEer: Num; ratedSeer: Num; fanSfp: Num;
  erv: boolean; ervS: Num; ervL: Num; ervShare: Num;
  uWall: Num; wallTypes: PartType[]; uRoof: Num; uGlass: Num; shgc: Num; uSky: Num; shgcSky: Num; ez: Num;
  /* ASHRAE heat-balance model inputs */
  /* heat balance: solar absorptance of wall and roof outer surfaces, ground reflectance, radiant fraction of people, lighting and equipment gains */
  aWall: Num; aRoof: Num; gRefl: Num; frP: Num; frL: Num; frE: Num;
  /* suspended ceiling below roofs and floor slabs: the room sees gypsum board, not the slab */
  ceil: 'susp' | 'none';
  /* floor finish seen by the room */
  floorFin: 'tile' | 'carpet';
  /* electrical estimate: cooling system type, efficiency option (requirement id, 'custom', or empty for the recommended one),
     custom full-load COP at 35 °C, and an allowance for fans, pumps and cooling towers in kW per TR */
  sys?: string; effOpt?: string; effCop?: Num; aux?: Num;
  /* roof layers from the U-value calculator */
  roofLayers?: Layer[];
  /* the weather year used by the hourly analysis (real weather mode); the hourly data itself is cached in the browser */
  weather?: WeatherRef;
  /* indoor air quality settings; rooms, outdoor air and the cooling system come from the rest of the project */
  iaq?: IaqSettings;
  src: ProjectSrc;
}
/* ASHRAE 62.1 system type: auto follows the project (FAHU = 100% outdoor air, one room = single zone, otherwise multiple-zone recirculating) */
export interface IaqSettings {
  sys?: 'auto' | 'doas' | 'single' | 'multi';
  ev?: 'simplified' | 'appendix';
  /* ventilation above the minimum, % (enhanced ventilation) */
  enh?: Num;
  /* filter at each stage: outdoor air pre and final (FAHU or AHU), and the room units' recirculation filter */
  fPre?: string; fFinal?: string; fRec?: string;
  /* fan total efficiency for the filter pressure drop, and fan operating hours per year */
  fanEff?: Num; hours?: Num;
  /* overrides of the reference data, by contaminant and by filter */
  cont?: Record<string, Partial<Record<'genP' | 'genA' | 'dep' | 'pen' | 'out' | 'limit', Num>>>;
  filt?: Record<string, Partial<Record<'e1' | 'e2' | 'e3' | 'dp0' | 'dpF' | 'v', Num>>>;
}
export interface AppState { version: 2; project: Project; rooms: Room[]; sel: string | undefined; example: boolean }
