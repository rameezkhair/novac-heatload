/* A numeric input may be blank while the user is typing; the engine reads blanks as 0 via num(). */
export type Num = number | '';
export type Orient = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
/* a check result: [status, explanation, optional badge label] */
export type Mark = ['ok' | 'bad' | 'warn', string, string?] | null;

export interface WallEntry { w: Num; g: Num }
/* a surface next to another space: area, adjacent space type, its temperature (custom only) and a U-value override */
export interface Adjacent { a: Num; adj: string; t: Num; u: Num }
export interface Partition extends Adjacent { type: 'wall' }

export interface RoomSrc {
  people: string; light: string; equip: string; oa: string; ach: string; act: string;
}
export interface Room {
  id: string; name: string; type: string; qty: Num; area: Num; height: Num;
  walls: Record<Orient, WallEntry>;
  above: 'roof' | 'cond' | 'uncond'; below: 'cond' | 'uncond' | 'outdoor' | 'ground';
  roof: Num; sky: Num;
  ce: Adjacent; fl: Adjacent; px: Partition[];
  people: Num; light: Num; equip: Num; oa: Num; ach: Num; ps: Num; pl: Num;
  src: RoomSrc;
}

export interface ProjectSrc {
  indoor: string; ez: string; out: string; vent: string;
  uWall?: string; uRoof?: string; uGlass?: string; shgc?: string; uSky?: string; shgcSky?: string;
  [k: string]: string | undefined;
}
export interface Project {
  name: string; location: string; subloc: string; cbasis: string; codeset?: string;
  toDB: Num; toWB: Num; dr: Num; elev: Num; vDB: Num; vWB: Num;
  autoBand: boolean;
  tiDB: Num; tiRH: Num; met: Num; clo: Num; vel: Num;
  uPart: Num; uCeil: Num; uFloor: Num; shade: Num; tAdj: Num;
  tSupply: Num; sfS: Num; sfL: Num; fahu: boolean; diversity: Num;
  erv: boolean; ervS: Num; ervL: Num; ervShare: Num;
  uWall: Num; uRoof: Num; uGlass: Num; shgc: Num; uSky: Num; shgcSky: Num; ez: Num;
  cltd: Record<Orient | 'R' | 'G', Num>;
  solar: Record<Orient | 'H', Num>;
  src: ProjectSrc;
}
export interface AppState { version: 2; project: Project; rooms: Room[]; sel: string | undefined; example: boolean }
