/* Parity with the original single-file calculator (tests/fixtures/original.html), run in jsdom.
   The only intended difference is glass conduction, which now uses the ASHRAE glass CLTD.
   To compare everything else, the new engine's glass CLTD is set so that CLTD + correction equals
   the original's (To − Ti). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeAll, envOf } from '../src/engine/calc';
import { exampleState, migrate } from '../src/engine/project';
import type { AppState } from '../src/engine/types';
import { num } from '../src/engine/util';

const html = readFileSync(fileURLToPath(new URL('./fixtures/original.html', import.meta.url)), 'utf8');

async function runOriginal(saved?: unknown) {
  const { JSDOM } = (await import('jsdom')) as any;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/',
    beforeParse(w: any) {
      if (saved) w.localStorage.setItem('uae-heat-load-v1', JSON.stringify(saved));
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    },
  });
  const w = dom.window;
  const d = w.computeAll();
  const out = { T: { ...d.T }, rooms: Object.fromEntries(Object.entries(d.res).map(([k, v]: any) => [k, { ...v }])) as Record<string, any> };
  w.close();
  return out;
}
/* the original calculator used CLTD/CLF; make the new glass CLTD reproduce its glass ΔT */
function withOriginalGlass(s: AppState) {
  s.project.method = 'cltd';
  const e = envOf(s.project);
  s.project.cltd.G = e.To - num(s.project.tiDB) - e.corr;
  return s;
}
// PsychroLib uses the ASHRAE saturation-pressure and wet-bulb algorithms;
// replacing the legacy approximations introduces small, expected load drift.
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(0.01, Math.abs(b) * 0.01));

describe('compatibility with the original calculator', () => {
  it('matches the built-in example', async () => {
    const orig = await runOriginal();
    const s = withOriginalGlass(exampleState());
    const d = computeAll(s.project, s.rooms);
    for (const k of ['a', 'n', 's', 'l', 'oa', 'u', 'sa', 'oaq', 'fahuW', 'plant', 'wwr'] as const) close(d.T[k], orig.T[k]);
    /* room ids differ between runs; compare in order */
    const o = Object.values(orig.rooms), n = s.rooms.map(r => d.res[r.id]);
    n.forEach((c, i) => { for (const k of ['walls', 'roof', 'gSol', 'gCond', 'pS', 'pL', 'light', 'equip', 'infS', 'infL', 'oaS', 'oaL', 'roomS', 'roomL', 'unit'] as const) close(c[k], o[i][k]); });
  });

  it('matches a saved project with partitions, elevation, ERV and no FAHU', async () => {
    const saved = {
      project: {
        name: 'Parity', location: 'abudhabi', subloc: 'liwa', elev: 150, dr: 14.7, cbasis: 'estidama',
        toDB: 46.1, toWB: 29.4, vDB: 35.3, vWB: 30.6, tiDB: 23, tiRH: 50, fahu: false, erv: true, ervS: 75, ervL: 0, ervShare: 60,
        uPart: 1.6, uCeil: 0.5, uFloor: 0.7, shade: 0.8, tAdj: 38, tSupply: 12, sfS: 8, sfL: 4, diversity: 90, ez: 1.2, autoBand: true,
        uWall: 0.32, uRoof: 0.14, uGlass: 2.2, shgc: 0.3, uSky: 2.2, shgcSky: 0.28,
        cltd: { N: 10, NE: 13, E: 18, SE: 17, S: 14, SW: 21, W: 23, NW: 18, R: 28 }, solar: { N: 130, NE: 430, E: 570, SE: 300, S: 95, SW: 300, W: 570, NW: 430, H: 720 },
        src: { indoor: 'custom', ez: 'floor-cool-b', out: 'doe-ad', vent: 'doe-ad', uWall: 'estidama', uRoof: 'estidama', uGlass: 'estidama', shgc: 'estidama', uSky: 'estidama', shgcSky: 'safat-10' },
      },
      rooms: [
        {
          id: 'a1', name: 'Hall', type: 'assembly', qty: 1, area: 200, height: 4.5, roof: 200, sky: 12, part: 30, wAdj: 'store', floor: 200, below: 'uncond', bAdj: 'carpark',
          walls: { N: { w: 40, g: 10 }, NE: { w: '', g: '' }, E: { w: 30, g: 12 }, SE: { w: '', g: '' }, S: { w: 40, g: 8 }, SW: { w: '', g: '' }, W: { w: 30, g: 0 }, NW: { w: '', g: '' } },
          src: { people: 'dbc', light: 'typ', equip: 'typ', oa: 'multipurpose', ach: 'medium', act: 'restaurant' },
        },
        {
          id: 'a2', name: 'Kitchen', type: 'kitchen', qty: 2, area: 35, height: 3, roof: '', part: '', floor: '',
          walls: { N: { w: '', g: '' }, NE: { w: '', g: '' }, E: { w: '', g: '' }, SE: { w: '', g: '' }, S: { w: '', g: '' }, SW: { w: '', g: '' }, W: { w: 18, g: 2 }, NW: { w: '', g: '' } },
          px: [{ type: 'wall', a: 12, adj: 'plant', t: '', u: '' }, { type: 'wall', a: 6, adj: 'custom', t: 40, u: 2.1 }],
          src: { people: 'typ', light: 'typ', equip: 'typ', oa: 'kitchen', ach: 'tight', act: 'walk' },
        },
      ],
      sel: 'a1',
    };
    const orig = await runOriginal(saved);
    const s = withOriginalGlass(migrate(JSON.parse(JSON.stringify(saved))));
    /* the original kept the Al Sa'fat skylight SHGC on Estidama projects; the new engine replaces it (fix 4), so use the old value here */
    s.project.shgcSky = 0.28;
    const d = computeAll(s.project, s.rooms);
    for (const k of ['s', 'l', 'oa', 'u', 'sa', 'oaq', 'plant'] as const) close(d.T[k], orig.T[k]);
    s.rooms.forEach(r => { const c = d.res[r.id], o = orig.rooms[r.id]; for (const k of ['walls', 'roof', 'gSol', 'gCond', 'partW', 'partC', 'partF', 'infS', 'infL', 'oaS', 'oaL', 'unit'] as const) close(c[k], o[k]); });
  });
});

describe('fixes', () => {
  it('glass conduction uses the corrected glass CLTD, not To − Ti', () => {
    const s = exampleState(); s.project.method = 'cltd';
    const d = computeAll(s.project, s.rooms), e = d.e;
    const r = s.rooms[0], c = d.res[r.id];
    const glass = 20; /* 14 m² W + 6 m² S */
    expect(c.gCond).toBeCloseTo(num(s.project.uGlass) * glass * (8 + e.corr), 6);
    expect(8 + e.corr).toBeLessThan(e.To - 24);
  });
  it('Estidama and Barjeel set an explicit skylight SHGC', async () => {
    const { applyCodeset, defaultProject } = await import('../src/engine/project');
    for (const id of ['estidama', 'estidama-aa', 'barjeel']) { const p = defaultProject(); applyCodeset(p, id); expect(p.src.shgcSky).toBe('a901'); expect(p.shgcSky).toBe(0.30); }
  });
});
