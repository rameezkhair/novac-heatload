/* Compliance and plausibility checks: DBC, Al Sa'fat, Estidama, Barjeel, ASHRAE. */
import { ASH04, ENVK, LPD_BAM, OUT_OPTS, PMETA, SAFAT, VENT_BY, VENT_OPTS, bamWm2, limitsFor, typeOf, type DesignOpt, type Limits, type PickKey } from './data';
import { calc, envOf, type Computed, type Env, type RoomLoad, type Totals } from './calc';
import { W_wb, dpOf, pmvOf, rhOf } from './psychro';
import { ROOMOPTS, ezOf } from './project';
import type { Mark, Project, Room } from './types';
import { fmt, num } from './util';

export const MK = { ok: '✓', bad: '✗', warn: '!' } as const;
export type Status = 'ok' | 'bad' | 'warn' | 'req' | 'na';
export const PILL: Record<Status, string> = { ok: 'Complies', bad: 'Fails', req: 'Required', warn: 'Check', na: 'Not triggered' };

/* a design basis is acceptable when it is a recognised standard or matches one */
const stdMatch = (list: DesignOpt[], db: number, wb: number) => list.find(o => o.db != null && Math.abs(o.db - db) < 0.05 && Math.abs(o.wb! - wb) < 0.05);
export function outBasis(p: Project): { std: true; o: DesignOpt } | { std: false } {
  if (p.src.out && p.src.out !== 'custom') { const o = OUT_OPTS.find(o => o.id === p.src.out); if (o) return { std: true, o }; }
  const m = stdMatch(OUT_OPTS, num(p.toDB), num(p.toWB)); return m ? { std: true, o: m } : { std: false };
}
export function ventBasis(p: Project): { std: true; o: DesignOpt; same?: false } | { std: false; same: boolean } {
  if (p.src.vent === 'same') return { std: false, same: true };
  if (p.src.vent && p.src.vent !== 'custom') { const o = VENT_OPTS.find(o => o.id === p.src.vent); if (o) return { std: true, o }; }
  const m = stdMatch(VENT_OPTS, num(p.vDB), num(p.vWB)); return m ? { std: true, o: m } : { std: false, same: false };
}
export const outSrcLabel = (p: Project) => p.src.out === 'custom' ? 'Custom value' : (OUT_OPTS.find(o => o.id === p.src.out)?.src || '');
export const ventSrcLabel = (p: Project) => p.src.vent === 'custom' ? 'Custom value' : (VENT_OPTS.find(o => o.id === p.src.vent)?.src || '');

/* ---------- per room ---------- */
export function oaRequired(r: Room, ez: number) {
  const t = typeOf(r.type), id = r.src.oa !== 'custom' ? r.src.oa : (t.oaDef || t.vent);
  const opts = ROOMOPTS.oa(r, t, ez), o = opts.find(x => x.id === id) || opts.find(x => x.id === t.vent);
  const ref = id === 'a622' ? 'ASHRAE 62.2-2019' : String(id).startsWith('a170-') ? 'ASHRAE 170-2021' : 'ASHRAE 62.1-2022';
  return { q: o ? o.v : 0, ref };
}
export interface RoomChecks { people: Mark; oa: Mark; light: Mark }
export function roomChecks(r: Room, c: RoomLoad, ez: number): RoomChecks {
  const t = typeOf(r.type);
  let need: number | null = null, ref = '';
  if (t.dbc) { need = Math.ceil(c.A / t.dbc[0]); ref = 'DBC Table B.2'; }
  else { const vr = VENT_BY[t.vent]; if (vr && vr.dens > 0) { need = Math.ceil(c.A * vr.dens / 100); ref = 'ASHRAE 62.1 default (DBC H.4.10.2)'; } }
  const people: Mark = need == null ? null : (c.n >= need ? ['ok', `≥ ${need} people, ${ref}`] : ['warn', `below ${need} people from ${ref}; justify with the layout`]);
  const req = oaRequired(r, ez);
  const oa: Mark = c.oaQ >= req.q - 0.05 ? ['ok', `≥ ${fmt(req.q, 1)} L/s, ${req.ref} (DBC H.4.10.2)`] : ['bad', `below ${fmt(req.q, 1)} L/s required by ${req.ref} (DBC H.4.10.2)`];
  const bam = String(r.src.light || '').startsWith('bam-') ? LPD_BAM.find(x => 'bam-' + x[0] === r.src.light) : undefined;
  const lim = bam ? bamWm2(bam[2]) : t.a901, lref = bam ? `ASHRAE 90.1-2022 Building Area Method, ${bam[1]}` : 'ASHRAE 90.1-2022 Space-by-Space Method';
  const light: Mark = lim ? (num(r.light) <= lim + 1e-9 ? ['ok', `≤ ${lim} W/m², ${lref} (DBC H.4.6.7.2)`] : ['bad', `exceeds ${lim} W/m², ${lref} (DBC H.4.6.7.2)`]) : null;
  return { people, oa, light };
}

/* ---------- outdoor plausibility for the UAE ---------- */
export type Plaus = [string, 'bad' | 'warn', string];
export function outdoorPlaus(p: Project, e: Env): Plaus[] {
  const out: Plaus[] = [];
  const chk = (key: string, label: string, v: number, unit: string, badLo: number, warnLo: number, warnHi: number, badHi: number, why: string) => {
    if (!isFinite(v)) { out.push([key, 'bad', `${label} is missing.`]); return; }
    const s = `${label} ${fmt(v, 1)} ${unit}`;
    if (v < badLo) out.push([key, 'bad', `${s} is abnormally low for the UAE (expected ${warnLo}–${warnHi} ${unit}). ${why}`]);
    else if (v > badHi) out.push([key, 'bad', `${s} is abnormally high for the UAE (expected ${warnLo}–${warnHi} ${unit}). ${why}`]);
    else if (v < warnLo) out.push([key, 'warn', `${s} is below the usual UAE design range of ${warnLo}–${warnHi} ${unit}. Check the source.`]);
    else if (v > warnHi) out.push([key, 'warn', `${s} is above the usual UAE design range of ${warnLo}–${warnHi} ${unit}. Check for oversizing.`]);
  };
  chk('toDB', 'Outdoor dry bulb', num(p.toDB), '°C', 35, 42, 49, 52, 'Code values are 46 °C (Dubai), 46.1 °C (Abu Dhabi) and 48.8 °C (Al Ain).');
  chk('toWB', 'Outdoor wet bulb', num(p.toWB), '°C', 18, 22, 31, 32, 'Code values are 28.3–29.4 °C.');
  chk('vDB', 'Outdoor air (FAHU) dry bulb', num(p.vDB), '°C', 28, 32, 49, 52, 'DBC H.4.6.4 uses 34 °C; DOE Table 2 uses 35.3–35.8 °C.');
  chk('vWB', 'Outdoor air (FAHU) wet bulb', num(p.vWB), '°C', 20, 26, 32, 33, 'DBC H.4.6.4 uses 32 °C; DOE Table 2 uses 28.8–30.6 °C.');
  chk('dr', 'Daily range', num(p.dr), 'K', 3, 5, 18, 22, 'Published UAE July ranges are about 6–15 K.');
  chk('elev', 'Elevation', num(p.elev), 'm', -10, -5, 1950, 2000, 'UAE ground ranges from sea level to about 1,934 m.');
  if (num(p.toWB) >= num(p.toDB)) out.push(['toWB', 'bad', 'Outdoor wet bulb must be lower than dry bulb.']);
  if (num(p.vWB) >= num(p.vDB)) out.push(['vWB', 'bad', 'Fresh-air wet bulb must be lower than dry bulb.']);
  const dp = dpOf(e.Wo, e.P); if (dp > 30) out.push(['toWB', 'bad', `Outdoor dew point ${fmt(dp, 1)} °C is unrealistic; UAE peaks are about 28–30 °C.`]);
  if (e.To <= num(p.tiDB)) out.push(['toDB', 'bad', `Outdoor dry bulb ${fmt(e.To, 1)} °C is not above indoor ${num(p.tiDB)} °C, so envelope conduction would be negative.`]);
  return out;
}

/* rows: [standard, requirement, design value, [status, text]] */
export type CheckRow = [string, string, string, ['ok' | 'bad' | 'warn', string]];
const PLABEL: Record<string, string> = { toDB: 'Dry bulb', toWB: 'Wet bulb', dr: 'Daily range', elev: 'Elevation', vDB: 'Fresh-air dry bulb', vWB: 'Fresh-air wet bulb' };
export function outdoorChecks(p: Project, e: Env): CheckRow[] {
  const loc = p.location, rows: CheckRow[] = [], pl = outdoorPlaus(p, e);
  const tD = num(p.toDB), tW = num(p.toWB), vD = num(p.vDB), vW = num(p.vWB);
  const val = (d: number, w: number) => `${fmt(d, 1)} °C DB / ${fmt(w, 1)} °C WB`;
  if (pl.length) pl.forEach(([k, lvl, txt]) => rows.push(['Range check (UAE)', txt, PLABEL[k] || k, [lvl, lvl === 'bad' ? 'Out of range' : 'Verify']]));
  else rows.push(['Range check (UAE)', 'Outdoor design within typical UAE design range', val(tD, tW), ['ok', 'Within range']]);
  const ob = outBasis(p), vb = ventBasis(p);
  rows.push([ob.std ? ob.o.src : 'Custom value', 'Cooling design condition (envelope, infiltration)', val(tD, tW), ob.std ? ['ok', 'Complies'] : ['warn', 'Subject to Authority approval']]);
  rows.push([vb.std ? vb.o.src : vb.same ? 'Same as cooling' : 'Custom value', 'Outdoor air system design condition (peak humidity)', val(vD, vW), vb.std ? ['ok', 'Complies'] : vb.same ? ['warn', 'Deviates from standard practice'] : ['warn', 'Subject to Authority approval']]);
  const ad = loc === 'abudhabi' || loc === 'alain';
  rows.push([ad ? 'DOE CLM §5.2 / DBC H.4.6.4' : 'DBC H.4.6.4', 'Outdoor air system for fully air-conditioned buildings; treated outdoor air ≥ 95% of the year', p.fahu ? 'FAHU / DOAS' : 'Mixed at room units', p.fahu ? ['ok', 'Provided'] : ['warn', 'Verify outdoor air system']]);
  const a = ASH04[loc];
  if (a) rows.push(['ASHRAE Fundamentals 2021', `0.4% cooling design DB / MCWB, ${a.st}: ${a.db} / ${a.wb} °C`, `${fmt(tD, 1)} °C DB`,
    tD >= a.db - 0.05 ? ['ok', tD > a.db + 0.05 ? `Conservative, +${fmt(tD - a.db, 1)} K` : 'Complies'] : (ob.std ? ['ok', 'Recognised basis selected'] : ['warn', 'Below 0.4% DB, subject to Authority approval'])]);
  const rh = rhOf(e.To, e.Wo, e.P);
  rows.push(['Psychrometrics', 'Valid air state: WB < DB, RH ≤ 100%', `RH ${fmt(Math.min(rh, 100), 0)}%, DP ${fmt(dpOf(e.Wo, e.P), 1)} °C`, tW < tD && rh <= 100.5 ? ['ok', 'Valid'] : ['bad', 'Invalid state']]);
  const Wv = W_wb(vD, vW, e.P), Wc = W_wb(tD, tW, e.P);
  rows.push([ad ? 'DOE CLM §2.2 / ASHRAE 62.1' : 'ASHRAE 62.1-2022', 'Ventilation design humidity ratio ≥ cooling design humidity ratio', `${fmt(Wv * 1000, 1)} / ${fmt(Wc * 1000, 1)} g/kg`, (Wv >= Wc - 1e-5 || vb.std) ? ['ok', 'Complies'] : ['warn', 'Latent load may be understated']]);
  return rows;
}

/* indoor comfort and moisture, plus outdoor air quantity across all rooms */
export function indoorChecks(p: Project, e: Env, rooms: Room[]) {
  const ti = num(p.tiDB), rh = num(p.tiRH), dp = dpOf(e.Wi, e.P), W = e.Wi * 1000, ez = ezOf(p);
  const c = pmvOf(ti, ti, 0.2, rh, 1.1, 0.61);
  const ok = (b: boolean, good: string, badTxt: string, warn?: boolean): CheckRow[3] => b ? ['ok', good] : [warn ? 'warn' : 'bad', badTxt];
  let q = 0, short = 0;
  rooms.forEach(r => { const rc = calc(p, r, e), m = rc.qty; q += rc.oaQ * m; const k = roomChecks(r, rc, ez); if (k.oa && k.oa[0] !== 'ok') short++; });
  const rows: CheckRow[] = [
    ['DBC H.4.6.3 Table H.2', 'Indoor design condition: 24 ±1.5 °C DB, 50 ±5% RH', `${ti} °C / ${rh}% RH`, ok(Math.abs(ti - 24) <= 1.5 && Math.abs(rh - 50) <= 5, 'Complies', 'Does not comply')],
    ['DBC H.4.7 Table H.3 / ' + SAFAT + ' 402.01', 'Indoor operating range (95% of year): 22.5–25.5 °C, 30–60% RH', `${ti} °C / ${rh}% RH`, ok(ti >= 22.5 && ti <= 25.5 && rh >= 30 && rh <= 60, 'Complies', 'Does not comply')],
    [SAFAT + ' 501.03', 'Indoor design condition for heat load calculation: 24 °C DB, 50 ±5% RH', `${ti} °C / ${rh}% RH`, ok(ti === 24 && Math.abs(rh - 50) <= 5, 'Complies', 'Deviation, verify', true)],
    ['ASHRAE 55-2023', 'Thermal comfort: PMV −0.5 to +0.5 (1.1 met, 0.61 clo, 0.2 m/s air velocity, within DBC H.4.7 0.2–0.3 m/s)', `PMV ${c.pmv >= 0 ? '+' : ''}${fmt(c.pmv, 2)}, PPD ${fmt(c.ppd, 0)}%`,
      Math.abs(c.pmv) <= 0.5 ? ['ok', 'Complies'] : Math.abs(c.pmv) <= 0.7 ? ['warn', c.pmv < 0 ? 'Slightly cool, verify' : 'Slightly warm, verify'] : ['bad', 'Does not comply']],
    ['ASHRAE 55-2023', 'Indoor humidity ratio ≤ 12 g/kg', `${fmt(W, 2)} g/kg`, ok(W <= 12, 'Complies', 'Does not comply')],
    ['ASHRAE 62.1-2022 §5.12', 'Space dew point ≤ 15 °C (mould control)', `${fmt(dp, 1)} °C`, ok(dp <= 15, 'Complies', 'Does not comply')],
    ['DBC H.4.10.2 / ASHRAE 62.1, 62.2, 170', 'Outdoor air: 62.1 Table 6-1 (Rp, Ra, Ez), 62.2 for dwellings, 170 for healthcare; occupancy per DBC Table B.2',
      `${fmt(q, 0)} L/s, ${rooms.length} room type${rooms.length === 1 ? '' : 's'}`, short ? ['bad', `${short} room type${short > 1 ? 's' : ''} below minimum`] : ['ok', 'Complies']],
  ];
  return { pmv: c.pmv, ppd: c.ppd, dp, W, rows };
}

/* ---------- field-level marks for project inputs ---------- */
export function projectChecks(p: Project, T: Totals, rooms: Room[]): { marks: Record<string, Mark>; limits: Limits } {
  const out: Record<string, Mark> = {}, L = limitsFor(p.cbasis || 'safat-s', T.wwr, T.skyPct);
  const le = (k: PickKey, v: number, lim: number | null, ref: string) => { out[k] = lim == null ? null : v <= lim + 1e-9 ? ['ok', `≤ ${lim}, ${ref}`] : ['bad', `exceeds ${lim}, ${ref}`]; };
  ENVK.forEach(k => le(k, num(p[k]), L[k as keyof Limits] as number | null, L.name + (L.band && (k === 'uGlass' || k === 'shgc') ? ', ' + L.band : '')));
  const ee = envOf(p), lap = ee.lapse > 0 ? `; calculation uses ${fmt(ee.To, 1)} °C after −${fmt(ee.lapse, 1)} K elevation adjustment` : '';
  const ob = outBasis(p), vb = ventBasis(p);
  out.toDB = out.toWB = ob.std ? ['ok', `${ob.o.src}${lap}`] : ['warn', 'Non-standard design condition. Technical justification required for Authority approval'];
  out.vDB = out.vWB = vb.std ? ['ok', vb.o.src] : vb.same ? ['warn', 'Cooling condition used for outdoor air: not standard practice (DBC H.4.6.4, DOE CLM Table 2)'] : ['warn', 'Non-standard outdoor air condition. Technical justification required for Authority approval'];
  const ti = num(p.tiDB), rh = num(p.tiRH), ib = p.src.indoor === 'custom' ? 'dbc' : p.src.indoor;
  if (ib === 'ashrae') {
    const ic = indoorChecks(p, ee, rooms), pm = ic.rows[3][3];
    out.tiDB = [pm[0], `PMV ${fmt(ic.pmv, 2)}: ${pm[1]}, ASHRAE 55`];
    out.tiRH = ic.dp <= 15 && ic.W <= 12 ? ['ok', `dew point ${fmt(ic.dp, 1)} °C ≤ 15 °C (62.1 §5.12), W ≤ 12 g/kg (ASHRAE 55)`] : ['bad', `dew point ${fmt(ic.dp, 1)} °C or humidity ratio over the ASHRAE limits`];
  } else if (ib === 'safat') {
    out.tiDB = ti >= 22.5 && ti <= 25.5 ? ['ok', `${ti === 24 ? '24 °C, ' : 'in 22.5–25.5 °C band, '}${SAFAT} 501.03 / 402.01`] : ['bad', `outside 22.5–25.5 °C, ${SAFAT} 402.01`];
    out.tiRH = Math.abs(rh - 50) <= 5 ? ['ok', `50 ±5%, ${SAFAT} 501.03`] : ['bad', `outside 50 ±5%, ${SAFAT} 501.03`];
  } else {
    out.tiDB = Math.abs(ti - 24) <= 1.5 ? ['ok', '24 ±1.5 °C, DBC Table H.2'] : ['bad', 'outside 24 ±1.5 °C, DBC Table H.2'];
    out.tiRH = Math.abs(rh - 50) <= 5 ? ['ok', '50 ±5%, DBC Table H.2'] : ['bad', 'outside 50 ±5%, DBC Table H.2'];
  }
  out.sfS = num(p.sfS) <= 10 ? ['ok', '≤ 10%, DBC H.4.6.3'] : ['bad', 'exceeds 10%, DBC H.4.6.3'];
  out.sfL = num(p.sfL) <= 5 ? ['ok', '≤ 5%, DBC H.4.6.3'] : ['bad', 'exceeds 5%, DBC H.4.6.3'];
  if (num(p.dr) >= 5 && num(p.dr) <= 18) out.dr = ['ok', 'Within the typical UAE daily range of 5–18 K', 'In range'];
  if (num(p.elev) >= -5 && num(p.elev) <= 1950) out.elev = ['ok', 'Within the typical UAE site elevation range of −5–1,950 m', 'In range'];
  if (p.erv) { out.ervS = num(p.ervS) >= 70 ? ['ok', '≥ 70%, DBC H.4.8.2'] : ['bad', 'below 70%, DBC H.4.8.2']; out.ervShare = num(p.ervShare) >= 50 ? ['ok', '≥ 50%, DBC H.4.8.2'] : ['bad', 'below 50%, DBC H.4.8.2']; }
  /* plausibility marks override the basis marks on the same field when worse */
  const worst: Record<string, Mark> = {};
  outdoorPlaus(p, ee).forEach(([k, l, t]) => { if (!worst[k] || l === 'bad') worst[k] = [l, t]; });
  Object.assign(out, worst);
  return { marks: out, limits: L };
}

/* ---------- full compliance list: [status, criterion, detail, general?] ---------- */
export type Check = [Status, string, string, boolean?];
export function allChecks(d: Computed, marks: Record<string, Mark>, L: Limits): Check[] {
  const { p, e, res, T, rooms } = d, ez = ezOf(p);
  const rows: Check[] = [], add = (s: Status, c: string, t: string) => rows.push([s, c, t]), gen = (c: string, t: string) => rows.push(['req', c, t, true]);
  const envBad = ENVK.filter(k => marks[k] && marks[k]![0] === 'bad');
  add(envBad.length ? 'bad' : 'ok', 'Envelope', envBad.length ? `${envBad.map(k => PMETA[k][0]).join(', ')} exceed${envBad.length === 1 ? 's' : ''} the ${L.name} limits${L.band ? ' (' + L.band + ')' : ''}.` : `All U-values and SHGC meet ${L.name}${L.band ? ' (' + L.band + ')' : ''}.`);
  /* ASHRAE 90.1-2022 prescriptive envelope path (§5.5) conditions the heat-load model can check */
  if (p.cbasis === 'a901') {
    add(T.wwr <= 40 ? 'ok' : 'warn', 'ASHRAE 90.1-2022 §5.5.4.2.1', T.wwr <= 40 ? `Vertical fenestration ${fmt(T.wwr, 1)}% of gross wall area, within the 40% prescriptive maximum.`
      : `Vertical fenestration ${fmt(T.wwr, 1)}% of gross wall area exceeds the 40% prescriptive maximum. Use the envelope trade-off path (§5.6, Appendix C) or Appendix G.`);
    if (T.sky > 0) add(T.skyPct <= 3 ? 'ok' : 'warn', 'ASHRAE 90.1-2022 §5.5.4.2.2', T.skyPct <= 3 ? `Skylights ${fmt(T.skyPct, 1)}% of gross roof area, within the 3% maximum.`
      : `Skylights ${fmt(T.skyPct, 1)}% of gross roof area exceed 3%. Up to 6% is allowed with diffusing glazing (haze > 90%), VT > 0.40 and daylight controls (§5.5.4.2.2 exception).`);
    gen('ASHRAE 90.1-2022 §5.5.3.1.4', 'Zones 0–3 roofs: 3-year aged solar reflectance ≥ 0.55 and thermal emittance ≥ 0.75 (CRRC S100), or SRI ≥ 64; otherwise roof insulation to Table 5.5.3.1.4 (above deck U ≤ 0.153 W/m²K, R-6.3 ci, in zone 0).');
    gen('ASHRAE 90.1-2022 §5.5.3.2.2', 'Zone 0 east, south and west walls: at least 75% of opaque wall area with initial solar reflectance ≥ 0.30 and emittance ≥ 0.75, or at least 30% of the wall shaded.');
    gen('ASHRAE 90.1-2022 §5.5.4.5', 'Fenestration orientation: west and east glazing area each ≤ 25% of total vertical fenestration, or west/east area × SHGC each ≤ total area × SHGC limit ÷ 4.');
    gen('ASHRAE 90.1-2022 §5.4.3', 'Continuous air barrier. Whole-building air leakage ≤ 1.8 L/s·m² of envelope area at 75 Pa (0.35 cfm/ft², ASTM E3158), mandatory testing below 929 m² gross conditioned floor area; above that, testing or a third-party air barrier verification program (§5.9.1.2). Zone 1–2 entrances need no vestibule (§5.4.3.4).');
  }
  {
    const ob = outBasis(p), adj = e.lapse > 0 ? ` Elevation adjustment −${fmt(e.lapse, 1)} K applied (${fmt(e.To, 1)} °C).` : '';
    add(ob.std ? 'ok' : 'warn', 'Outdoor design basis', (ob.std ? `${num(p.toDB)} °C DB / ${num(p.toWB)} °C WB to ${ob.o.src}.` : `${num(p.toDB)} °C DB / ${num(p.toWB)} °C WB is not a recognised design basis. Technical justification required for Authority approval.`) + adj);
  }
  const ti = num(p.tiDB), rh = num(p.tiRH), okH2 = Math.abs(ti - 24) <= 1.5 && Math.abs(rh - 50) <= 5;
  add(okH2 ? 'ok' : 'bad', 'DBC Table H.2', okH2 ? `Indoor design ${ti} °C / ${rh}% RH is within 24 °C ±1.5 and 50% ±5.` : `Indoor design ${ti} °C / ${rh}% RH is outside 24 °C ±1.5 and 50% ±5. Justify it from the ASHRAE HVAC Applications handbook.`);
  const okH3 = ti >= 22.5 && ti <= 25.5 && rh >= 30 && rh <= 60;
  add(okH3 ? 'ok' : 'bad', 'DBC Table H.3', okH3 ? 'Indoor design is inside the 22.5–25.5 °C, 30–60% RH band.' : 'Indoor design is outside the 22.5–25.5 °C, 30–60% RH band.');
  {
    const vb = ventBasis(p);
    add(vb.std ? (p.fahu ? 'ok' : 'warn') : 'warn', 'Outdoor air system', `${p.fahu ? 'FAHU provides treated outdoor air' : 'Fresh air mixed at room units: DBC H.4.6.4 requires an outdoor air system'}; design ${num(p.vDB)} °C DB / ${num(p.vWB)} °C WB${vb.std ? ' to ' + vb.o.src : vb.same ? ' (cooling condition, not standard practice)' : ' (non-standard)'}.`);
  }
  const plz = outdoorPlaus(p, e);
  if (plz.length) add(plz.some(x => x[1] === 'bad') ? 'bad' : 'warn', 'Outdoor plausibility', plz.map(x => x[2]).join(' '));
  const ic = indoorChecks(p, e, rooms);
  [ic.rows[3], ic.rows[5]].forEach(r => add(r[3][0], r[0], `${r[1]}: ${r[2]}. ${r[3][1]}.`));
  const okSF = num(p.sfS) <= 10 && num(p.sfL) <= 5;
  add(okSF ? 'ok' : 'bad', 'DBC H.4.6.3', okSF ? `Safety factors ${num(p.sfS)}% / ${num(p.sfL)}% are within 10% sensible / 5% latent.` : `Safety factors ${num(p.sfS)}% / ${num(p.sfL)}% exceed 10% sensible / 5% latent.`);
  gen('DBC H.4.6.5', 'Heat load calculated for each air-conditioned space including its peak load incidence. Final calculations for submission shall be carried out using software registered with the Authority.');
  gen('DBC H.4.6.6 / H.4.6.7', 'External loads use orientation, construction U-values and shading factors (Part E, E.5.3). Occupancy per DBC B.5.1; lighting and equipment are project values, otherwise ASHRAE 90.1 recommendations.');
  const oaLow: string[] = [], pplLow: string[] = [], lpdHigh: string[] = [];
  rooms.forEach(r => { const ch = roomChecks(r, res[r.id], ez); if (ch.oa && ch.oa[0] === 'bad') oaLow.push(r.name); if (ch.people && ch.people[0] !== 'ok') pplLow.push(r.name); if (ch.light && ch.light[0] === 'bad') lpdHigh.push(r.name); });
  add(oaLow.length ? 'bad' : 'ok', 'DBC H.4.10.2', oaLow.length ? `Fresh air below the ASHRAE 62.1 / 62.2 / 170 minimum in: ${oaLow.join(', ')}.` : 'Fresh air in every room meets DBC H.4.10.2: ASHRAE 62.1-2022 Table 6-1 (with Ez), ASHRAE 62.2 for dwellings, ASHRAE 170 for healthcare.');
  add(pplLow.length ? 'warn' : 'ok', 'DBC B.5.1 / Table B.2', pplLow.length ? `Occupancy below the DBC Table B.2 or ASHRAE default density in: ${pplLow.join(', ')}. DBC H.4.10.2 asks for B.2 densities where possible.` : 'Occupancy meets DBC Table B.2 (or the ASHRAE default where B.2 has no entry).');
  if (lpdHigh.length) add('bad', 'ASHRAE 90.1-2022 LPD', `Lighting exceeds the space-by-space allowance in: ${lpdHigh.join(', ')}.`);
  if (T.oaq > 1000) {
    const modelled = p.fahu && p.erv && num(p.ervS) >= 70 && num(p.ervShare) >= 50;
    add(modelled ? 'ok' : 'req', 'DBC H.4.8.2', `Treated outdoor air is ${fmt(T.oaq, 0)} L/s, above 1,000 L/s. Energy recovery on at least 50% of exhaust air at 70% or higher sensible effectiveness is required.${modelled ? ' Modelled in the FAHU load.' : ' Turn it on in section 3.'}`);
  } else add('na', 'DBC H.4.8.2', `Treated outdoor air is ${fmt(T.oaq, 0)} L/s, not above 1,000 L/s.`);
  add(T.dcv.length ? 'req' : 'na', 'DBC H.4.8.3', T.dcv.length ? `CO₂ demand controlled ventilation required in: ${T.dcv.join(', ')}. Set-point below 800 ppm, alarm above 1,000 ppm, recalibrate every 12 months.` : 'No room is over 100 m² with 25 or more people per 100 m².');
  const kW = T.plant / 1000;
  add(kW >= 1000 ? 'req' : 'na', 'DBC H.4.9.1', kW >= 1000 ? `Plant load ${fmt(kW, 0)} kW is 1 MW or more: air leakage ≤5 m³/h·m² at 50 Pa (BS EN 13829 / ASTM E779), positive pressure.` : `Plant load ${fmt(kW, 0)} kW is below 1 MW.`);
  add(kW >= 1000 || T.a >= 5000 ? 'req' : 'na', 'DBC H.4.14.2', kW >= 1000 || T.a >= 5000 ? 'A BMS is required: cooling load 1,000 kW or more, or gross floor area 5,000 m² or more.' : 'Below 1,000 kW. A BMS is still required if gross floor area is 5,000 m² or more.');
  gen('DBC H.4.8.1', 'Equipment efficiency: split, packaged, cassette, water-source heat pump and multi-split units to UAE.S 5010-5 (ESMA) Tables 1, 2 and 4; chillers to ASHRAE 90.1-2019 Tables 6.8.1–6.8.3, including leaving fluid below 4.5 °C.');
  gen('DBC H.4.8.4', 'Insulate refrigerant, chilled and hot water pipes and conditioned-air supply ducts, including runs through conditioned spaces, to BS 5422 or ASHRAE 90.1.');
  gen('DBC H.4.10.3', 'Filters to ISO 16890-1. Indoor air limits (Table H.4): formaldehyde <0.08 ppm, TVOC <300 μg/m³, PM10 <150 μg/m³ (8 h TWA). Test before occupancy.');
  gen('DBC H.4.10.4', 'Outdoor air intakes upwind and exhausts downwind, separated per ASHRAE 62.1:2019 Table 5-1. Sand trap louvers sized for ≥1 m/s face velocity with ≥80% efficiency at 355–425 μm.');
  add(p.fahu ? 'req' : 'na', 'DBC H.4.12.1', p.fahu ? 'Supply air approximately equal to return plus exhaust air. AHUs and FAHUs AHRI or Eurovent certified; installation to ASHRAE Fundamentals Ch. 16.' : 'No air handling unit modelled.');
  gen('DBC H.4.12.2 / H.4.12.6', 'Duct sizing to ASHRAE Fundamentals Ch. 21; metal ducts to SMACNA. Pressure test ductwork with external static pressure above 250 Pa or exposed to ambient or unconditioned spaces.');
  const kit = rooms.filter(r => r.type === 'kitchen');
  add(kit.length ? 'req' : 'na', 'DBC H.4.12.15.3', kit.length ? `Commercial kitchen (${kit.map(r => r.name || 'Kitchen').join(', ')}): make-up air 75–95% of extract, kitchen about −0.25 Pa, building +1.25 to +5.0 Pa, make-up air within 6 °C of the space; ASHRAE 154:2016 and DW/172.` : 'No commercial kitchen in the room list.');
  add(kW > 350 ? 'req' : 'na', 'DBC H.5.2.4', kW > 350 ? `Plant load ${fmt(kW, 0)} kW is above 350 kW: recover and reuse AC condensate.` : `Plant load ${fmt(kW, 0)} kW is not above 350 kW.`);
  const key = (c: string) => { const m = /^DBC H\.([\d.]+)/.exec(c); return m ? m[1].split('.').map(Number) : null; };
  const cmp = (x: number[], y: number[]) => { for (let i = 0; i < Math.max(x.length, y.length); i++) { const dd = (x[i] || 0) - (y[i] || 0); if (dd) return dd; } return 0; };
  const head = rows.filter(r => !key(r[1])), dbc = rows.filter(r => key(r[1])).sort((a, b) => cmp(key(a[1])!, key(b[1])!));
  return head.concat(dbc);
}
/* show a check only when its calculation applies or the feature is turned on */
export const applicable = (c: Check) => c[0] !== 'na' && !c[3];
