/* Cooling equipment efficiency requirements and electrical consumption.
   Sources (values as printed):
   - UAE.S 5010-1:2019 (ESMA), household non-ducted ACs: star rating by EER at T3 (46 °C), Table 1; annual energy = input kW × 2000 h (cl. 8)
   - UAE.S 5010-5:2019 (ESMA), commercial and central ACs: MEPS for ducted/packaged (EER, T3), multi-split (IPLV), VRF (CSPF, T3)
     and chillers (full-load COP, T1); CSPF per ISO 16358-1 Annex F (Annex 2), T3 reference bin hours Table F.2
   - Barjeel V1.3 (RAK Municipality) 301.03 / 401.03, Tables 4–7 / 12–15, Ras Al Khaimah projects only: unitary and VRF at T3, chillers at T1
   - ANSI/ASHRAE/IES 90.1-2022 Tables 6.8.1-1 (unitary AC), 6.8.1-3 (chillers, Path A and B), 6.8.1-8 (VRF), AHRI rating conditions
   Both ESMA texts are the 2019 versions notified to the WTO (TBT notifications ARE 19_1430 / 19_1431). */

export type SysId = 'split' | 'window' | 'ducted' | 'vrf' | 'acchiller' | 'wcchiller';
export const SYSTEMS: { id: SysId; label: string; fixed: boolean; air: boolean }[] = [
  { id: 'split', label: 'Split AC, non-ducted (wall / ceiling cassette)', fixed: true, air: true },
  { id: 'window', label: 'Window AC', fixed: true, air: true },
  { id: 'ducted', label: 'Ducted split / packaged DX unit', fixed: true, air: true },
  { id: 'vrf', label: 'VRF / multi-split system', fixed: false, air: true },
  { id: 'acchiller', label: 'Air-cooled chiller', fixed: false, air: true },
  { id: 'wcchiller', label: 'Water-cooled chiller', fixed: false, air: false },
];

/* unit conversions: EER in Btu/h per W, COP in W/W, kW/TR of electrical input per ton of cooling */
export const BTU_W = 3.41214;
export const eerToCop = (eer: number) => eer / BTU_W;
export const copToEer = (cop: number) => cop * BTU_W;
export const copToKwTr = (cop: number) => 3.51685 / cop;
export const kwTrToCop = (kwtr: number) => 3.51685 / kwtr;

/* one requirement or rating level.
   kind 'full': full-load efficiency at outdoor temperature t (°C); 'seasonal': an annual-average metric (SEER, IEER, IPLV, CSPF) */
export interface Req {
  id: string; src: 'ESMA' | 'Barjeel V1.3' | 'ASHRAE 90.1-2022'; label: string; cop: number; kind: 'full' | 'seasonal'; t: number;
  metric: string; value: string; cond: string; ref: string;
}
const E1 = 'UAE.S 5010-1:2019 Table 1', E5 = 'UAE.S 5010-5:2019', A1 = 'ASHRAE 90.1-2022 Table 6.8.1-1', A3 = 'ASHRAE 90.1-2022 Table 6.8.1-3', A8 = 'ASHRAE 90.1-2022 Table 6.8.1-8';
const T3 = 'T3: 46 °C outdoor, 29/19 °C indoor', T1 = 'T1: 35 °C outdoor (AHRI 550/590 for chillers)', AHRI = 'AHRI: 35 °C (95 °F) outdoor';
const star = (sys: string, n: number, eer: number, ref: string): Req => ({
  id: `esma-${n}`, src: 'ESMA', label: `ESMA ${n} star${n > 1 ? 's' : ''}${n === 1 ? ' (minimum to be sold)' : ''}`, cop: eerToCop(eer), kind: 'full', t: 46,
  metric: 'EER', value: `≥ ${eer.toFixed(2)} Btu/h·W`, cond: T3, ref: `${ref}, ${sys}`,
});
const full = (id: string, src: Req['src'], label: string, cop: number, t: number, metric: string, value: string, cond: string, ref: string): Req => ({ id, src, label, cop, kind: 'full', t, metric, value, cond, ref });
const seas = (id: string, src: Req['src'], label: string, cop: number, metric: string, value: string, cond: string, ref: string): Req => ({ id, src, label, cop, kind: 'seasonal', t: 35, metric, value, cond, ref });

/* Barjeel V1.3 minimums for Ras Al Khaimah (RC = rated capacity, kW): Table 4 unitary EER and Table 5 VRF CSPF / multi-split IPLV at T3,
   Table 7 chillers COP and IPLV at T1. Non-ducted and window minimums equal ESMA 2 stars. */
const BJ = 'Barjeel V1.3 Tables 4–7 / 12–15';
function barjeel(sys: SysId, kW: number): Req[] {
  const bj = (id: string, label: string, cop: number, t: number, metric: string, value: string, cond: string, ref: string, kind: Req['kind'] = 'full'): Req => ({ id, src: 'Barjeel V1.3', label, cop, kind, t, metric, value, cond, ref: `${BJ}, ${ref}` });
  if (sys === 'split' || sys === 'window') { const e = sys === 'split' ? 8.31 : 7.51; return [bj('barjeel', 'Barjeel minimum (equals ESMA 2 stars)', eerToCop(e), 46, 'EER', `≥ ${e} Btu/h·W`, T3, sys === 'split' ? 'non-ducted AC' : 'window AC')]; }
  if (sys === 'ducted') { const e = kW < 40 ? 8.80 : kW < 70 ? 8.59 : kW < 223 ? 8.27 : 7.95; return [bj('barjeel', 'Barjeel minimum', eerToCop(e), 46, 'EER', `≥ ${e.toFixed(2)} Btu/h·W`, T3, 'ducted split and packaged')]; }
  if (sys === 'vrf') {
    const c = kW < 40 ? 14.84 : kW < 220 ? 13.78 : 13.25, i = kW < 40 ? 4.59 : kW < 220 ? 4.45 : 4.35;
    return [bj('barjeel-cspf', 'Barjeel minimum, VRF', c / BTU_W, 35, 'CSPF', `≥ ${c} Btu/h·W`, `${T3}, ISO 16358`, 'VRF', 'seasonal'),
      bj('barjeel-iplv', 'Barjeel minimum, multi-split', i, 35, 'IPLV', `≥ ${i}`, `${T3}, ISO 15042`, 'multi-split', 'seasonal')];
  }
  if (sys === 'acchiller') {
    const i = kW < 528 ? 4.05 : 4.14;
    return [bj('barjeel', 'Barjeel minimum, full load', 2.97, 35, 'COP', '≥ 2.97 W/W', T1, 'air-cooled chiller with condenser'),
      bj('barjeel-iplv', 'Barjeel minimum, part load', i, 35, 'IPLV', `≥ ${i}`, 'AHRI 550/590 integrated part load', 'air-cooled chiller with condenser', 'seasonal')];
  }
  const pd = kW < 264 ? [4.69, 5.87] : kW < 528 ? [4.99, 6.29] : kW < 1055 ? [5.33, 6.52] : kW < 2110 ? [5.77, 6.77] : [6.23, 7.04], cf = kW < 528 ? [6.36, 6.77] : [6.89, 7.04];
  return [bj('barjeel-pd', 'Barjeel minimum, screw / scroll, full load', pd[0], 35, 'COP', `≥ ${pd[0]} W/W`, T1, 'water-cooled rotary and scroll'),
    bj('barjeel-pd-iplv', 'Barjeel minimum, screw / scroll, part load', pd[1], 35, 'IPLV', `≥ ${pd[1]}`, 'AHRI 550/590 integrated part load', 'water-cooled rotary and scroll', 'seasonal'),
    bj('barjeel-cf', 'Barjeel minimum, centrifugal, full load', cf[0], 35, 'COP', `≥ ${cf[0]} W/W`, T1, 'water-cooled centrifugal'),
    bj('barjeel-cf-iplv', 'Barjeel minimum, centrifugal, part load', cf[1], 35, 'IPLV', `≥ ${cf[1]}`, 'AHRI 550/590 integrated part load', 'water-cooled centrifugal', 'seasonal')];
}

/* requirements for a system of a given capacity (kW of cooling), best first within each source; loc 'rak' adds Barjeel after ESMA */
export function requirements(sys: SysId, kW: number, loc = ''): Req[] {
  const r = esmaAshrae(sys, kW);
  if (loc !== 'rak') return r;
  /* split and window keep the five ESMA stars first, so the best label stays recommended */
  const at = sys === 'split' || sys === 'window' ? 5 : r.filter(x => x.src === 'ESMA').length;
  return [...r.slice(0, at), ...barjeel(sys, kW), ...r.slice(at)];
}
function esmaAshrae(sys: SysId, kW: number): Req[] {
  const btu = kW * 1000 * BTU_W, tons = kW / 3.51685, r: Req[] = [];
  if (sys === 'split' || sys === 'window') {
    const b = sys === 'split' ? [10.31, 9.71, 9.01, 8.31, 7.70] : [9.01, 8.51, 8.01, 7.51, 6.80];
    b.forEach((eer, i) => r.push(star(sys === 'split' ? 'non-ducted split' : 'window type', 5 - i, eer, E1)));
    if (btu < 65000) r.push(seas('a901-seer', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 minimum (three-phase, outside U.S.)', 13.4 / BTU_W, 'SEER2', '≥ 13.4', 'AHRI 210/240-2023 seasonal', A1));
    return r;
  }
  if (sys === 'ducted') {
    const e = btu < 135000 ? 8.5 : btu < 240000 ? 8.3 : btu < 760000 ? 7.8 : 7.5;
    r.push(full('esma', 'ESMA', 'ESMA minimum (MEPS)', eerToCop(e), 46, 'EER', `≥ ${e} Btu/h·W`, T3, `${E5}, ducted and packaged air-cooled`));
    if (btu < 65000) r.push(seas('a901-seer', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 minimum (three-phase, outside U.S.)', 13.4 / BTU_W, 'SEER2', '≥ 13.4 (split) / 13.4 (single package)', 'AHRI 210/240-2023 seasonal', A1));
    else {
      const [eer, ieer] = btu < 135000 ? [11.2, 14.8] : btu < 240000 ? [11.0, 14.2] : btu < 760000 ? [10.0, 13.2] : [9.7, 12.5];
      r.push(full('a901', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 minimum, full load', eerToCop(eer), 35, 'EER', `≥ ${eer.toFixed(1)}`, AHRI, `${A1}, air cooled, electric resistance or no heat`));
      r.push(seas('a901-ieer', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 minimum, part load', eerToCop(ieer), 'IEER', `≥ ${ieer.toFixed(1)} (after 1/1/2023)`, 'AHRI 340/360 integrated part load', A1));
    }
    return r;
  }
  if (sys === 'vrf') {
    /* UAE.S 5010-5 tables list < 135,000 and ≥ 240,000 Btu/h; the 135,000–240,000 band is not printed, the lower value is used */
    const cspf = btu < 760000 ? 4.2 : 4.1, iplv = btu < 760000 ? 15.0 : 14.5;
    r.push(seas('esma-cspf', 'ESMA', 'ESMA minimum, VRF', cspf, 'CSPF', `≥ ${cspf} W/W`, `${T3}, ISO 16358-1 Annex F bins`, `${E5}, VRF systems`));
    r.push(seas('esma-iplv', 'ESMA', 'ESMA minimum, multi-split', eerToCop(iplv), 'IPLV', `≥ ${iplv.toFixed(1)}`, `${T3}, ISO 15042`, `${E5}, multiple split systems`));
    if (btu < 65000) r.push(seas('a901-seer', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 minimum', 13.4 / BTU_W, 'SEER2', '≥ 13.4', 'AHRI 210/240-2023 seasonal', A8));
    else {
      const [eer, ieer] = btu < 135000 ? [10.5, 15.5] : btu < 240000 ? [10.3, 14.9] : [9.5, 13.9];
      r.push(full('a901', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 minimum, full load', eerToCop(eer), 35, 'EER', `≥ ${eer.toFixed(1)} (from 1/1/2024)`, AHRI, `${A8}, VRF multisplit`));
      r.push(seas('a901-ieer', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 minimum, part load', eerToCop(ieer), 'IEER', `≥ ${ieer.toFixed(1)}`, 'AHRI 1230 integrated part load', A8));
    }
    return r;
  }
  if (sys === 'acchiller') {
    const c = kW < 630 ? 2.8 : 3.1, iA = tons < 150 ? 13.7 : 14.0, iB = tons < 150 ? 15.8 : 16.1;
    r.push(full('esma', 'ESMA', 'ESMA minimum (MEPS)', c, 35, 'COP', `≥ ${c} W/W`, T1, `${E5} Table 3, air-cooled package chillers`));
    r.push(full('a901', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 Path A, full load', eerToCop(10.1), 35, 'EER', '≥ 10.100', AHRI, `${A3}, air-cooled`));
    r.push(seas('a901-iplv', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 Path A, part load', eerToCop(iA), 'IPLV.IP', `≥ ${iA.toFixed(3)}`, 'AHRI 550/590 integrated part load', `${A3}, air-cooled`));
    r.push(full('a901-b', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 Path B (variable speed), full load', eerToCop(9.7), 35, 'EER', '≥ 9.700', AHRI, `${A3}, air-cooled`));
    r.push(seas('a901-b-iplv', 'ASHRAE 90.1-2022', 'ASHRAE 90.1 Path B, part load', eerToCop(iB), 'IPLV.IP', `≥ ${iB.toFixed(3)}`, 'AHRI 550/590 integrated part load', `${A3}, air-cooled`));
    return r;
  }
  /* water-cooled: positive displacement (screw / scroll) and centrifugal, Path A and B kW/ton */
  const c = kW < 528 ? 4.3 : kW < 1055 ? 4.8 : 5.3;
  r.push(full('esma', 'ESMA', 'ESMA minimum (MEPS)', c, 35, 'COP', `≥ ${c} W/W`, T1, `${E5} Table 3, water-cooled chillers`));
  const pd = tons < 75 ? [0.750, 0.600, 0.780, 0.500] : tons < 150 ? [0.720, 0.560, 0.750, 0.490] : tons < 300 ? [0.660, 0.540, 0.680, 0.440] : tons < 600 ? [0.610, 0.520, 0.625, 0.410] : [0.560, 0.500, 0.585, 0.380];
  const cf = tons < 150 ? [0.610, 0.550, 0.695, 0.440] : tons < 300 ? [0.610, 0.550, 0.635, 0.400] : tons < 400 ? [0.560, 0.520, 0.595, 0.390] : [0.560, 0.500, 0.585, 0.380];
  const kt = (label: string, id: string, [fa, ia, fb, ib]: number[]) => {
    r.push(full(id, 'ASHRAE 90.1-2022', `ASHRAE 90.1 ${label} Path A, full load`, kwTrToCop(fa), 35, 'kW/ton', `≤ ${fa.toFixed(3)}`, 'AHRI 550/590 standard conditions', `${A3}, ${label.toLowerCase()}`));
    r.push(seas(id + '-iplv', 'ASHRAE 90.1-2022', `ASHRAE 90.1 ${label} Path A, part load`, kwTrToCop(ia), 'IPLV.IP kW/ton', `≤ ${ia.toFixed(3)}`, 'AHRI 550/590 integrated part load', `${A3}, ${label.toLowerCase()}`));
    r.push(full(id + '-b', 'ASHRAE 90.1-2022', `ASHRAE 90.1 ${label} Path B, full load`, kwTrToCop(fb), 35, 'kW/ton', `≤ ${fb.toFixed(3)}`, 'AHRI 550/590 standard conditions', `${A3}, ${label.toLowerCase()}`));
    r.push(seas(id + '-b-iplv', 'ASHRAE 90.1-2022', `ASHRAE 90.1 ${label} Path B, part load`, kwTrToCop(ib), 'IPLV.IP kW/ton', `≤ ${ib.toFixed(3)}`, 'AHRI 550/590 integrated part load', `${A3}, ${label.toLowerCase()}`));
  };
  kt('Screw / scroll', 'a901-pd', pd); kt('Centrifugal', 'a901-cf', cf);
  return r;
}

/* the efficiency recommended for design: the highest ESMA star for ACs, otherwise the stricter of the ESMA and ASHRAE 90.1 full-load values
   compared at 35 °C (ESMA T3 values converted with the ISO 16358 temperature curve) */
export function recommended(sys: SysId, kW: number, loc = ''): Req {
  const r = requirements(sys, kW, loc), s = SYSTEMS.find(x => x.id === sys)!;
  if (sys === 'split' || sys === 'window') return r[0];
  const fulls = r.filter(x => x.kind === 'full' && !x.id.includes('-b'));
  if (!fulls.length) return r[0];
  return fulls.reduce((a, b) => copAt(b, 35, s.air) > copAt(a, 35, s.air) ? b : a);
}

/* Efficiency against outdoor temperature for air-cooled equipment, from the ISO 16358-1 Annex F default ratios
   (UAE.S 5010 Annex 2, Table F.1): capacity(29) = 1.077 × capacity(35), power(29) = 0.914 × power(35),
   capacity(46) = 0.859 × capacity(35), power(46) = 1.25 × power(35); linear between and beyond. */
const lin = (t: number, a29: number, a46: number) => t <= 35 ? 1 + (a29 - 1) * (35 - t) / 6 : 1 + (a46 - 1) * (t - 35) / 11;
export const capRatio = (t: number) => lin(t, 1.077, 0.859);
export const powRatio = (t: number) => lin(t, 0.914, 1.25);
export const eerRatio = (t: number) => capRatio(t) / powRatio(t);
/* full-load COP of a rating at outdoor temperature t; water-cooled equipment is taken as independent of outdoor dry bulb */
export const copAt = (q: Req, t: number, air: boolean) => q.kind === 'seasonal' || !air ? q.cop : q.cop * eerRatio(t) / eerRatio(q.t);
/* cycling loss of fixed-speed units at part load, ISO 16358-1 with the default degradation coefficient CD = 0.27 */
export const CD = 0.27;
export const plf = (x: number) => 1 - CD * (1 - Math.max(0, Math.min(1, x)));

/* electrical input for a cooling load L (W) at outdoor temperature t, with installed capacity cap35 (W at 35 °C) */
export function electric(q: Req, sys: SysId, L: number, t: number, cap35: number) {
  const s = SYSTEMS.find(x => x.id === sys)!;
  if (L <= 0) return 0;
  if (q.kind === 'seasonal') return L / q.cop;
  const cap = cap35 * (s.air ? capRatio(t) : 1), x = cap > 0 ? L / cap : 1;
  return L / copAt(q, t, s.air) / (s.fixed ? plf(x) : 1);
}

/* T3 reference outdoor temperature bins (°C, hours), UAE.S 5010 Annex 2 / ISO 16358-1 Annex F Table F.2.
   The rows as printed add up to 6493 h (the table total line reads 6494). */
export const T3_BINS: [number, number][] = [[21, 307], [22, 311], [23, 317], [24, 325], [25, 334], [26, 342], [27, 349], [28, 354], [29, 356], [30, 355], [31, 351], [32, 344], [33, 332], [34, 317], [35, 299], [36, 277], [37, 252], [38, 225], [39, 195], [40, 165], [41, 133], [42, 103], [43, 73], [44, 47], [45, 24], [46, 6]];
/* Annual electricity by the ISO 16358 bin method: the defined cooling load rises linearly from 0 at 20 °C to the design load at 46 °C
   (Annex F, t0 = 20, t100 = 46). Returns cooling delivered and electricity, kWh, and the resulting seasonal COP (CSPF). */
export function annual(q: Req, sys: SysId, peakW: number) {
  const s = SYSTEMS.find(x => x.id === sys)!, cap35 = s.air ? peakW / capRatio(46) : peakW;
  let cool = 0, elec = 0;
  for (const [t, n] of T3_BINS) { const L = peakW * Math.max(0, (t - 20) / 26); cool += n * L; elec += n * electric(q, sys, L, t, cap35); }
  return { cool: cool / 1000, elec: elec / 1000, cspf: elec > 0 ? cool / elec : 0, hours: T3_BINS.reduce((a, b) => a + b[1], 0) };
}
