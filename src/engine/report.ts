/* Printable calculation report (HTML string), schedule exports, and reference text. */
import {
  ABOVE, ACT_BY, ADJ, BELOW, DBC_DR, INDOOR, LIB, LOC, ORIENTS, PMETA, PPICKS, SAFAT, authLine, typeOf, type PickKey,
} from './data';
import { adjTemp, computeAll, dcvNeeded, designDay, stateTable, uEff, type Computed } from './calc';
import { MONTHS, STATION_SRC, stationOf } from './climate';
import { SCHEDULES } from './data';
import { allChecks, applicable, indoorChecks, MK, outdoorChecks, outSrcLabel, PILL, projectChecks, roomChecks, ventSrcLabel, type Check } from './checks';
import { dayChartSVG, psychroSVG, stateRows } from './charts';
import { ROOMOPTS, ezOf, partName, partU, pxU, subOf, wallName, wallU, type RoomPick } from './project';
import type { Adjacent, AppState, Mark, Project, Room } from './types';
import { esc, fmt, num } from './util';
import { efficiencyGuidance } from './efficiency';

export const ABBR: [string, string][] = ([
  ['ACH', 'Air changes per hour'], ['ASHRAE', 'American Society of Heating, Refrigerating and Air-Conditioning Engineers'], ['BMS', 'Building management system'],
  ['CFM', 'Cubic feet per minute (1 L/s = 2.119 CFM)'], ['CIBSE', 'Chartered Institution of Building Services Engineers'],
  ['CLM', 'Cooling Load Manual for the Emirate of Abu Dhabi (DoE, May 2026)'], ['HBM', 'Heat balance method (ASHRAE Fundamentals Ch. 18)'], ['clo', 'Clothing insulation unit (1 clo = 0.155 m²K/W)'],
  ['CO₂', 'Carbon dioxide'], ['CSV', 'Comma-separated values file'], ['CZ', 'Climate zone (ASHRAE 169:2013)'], ['ESMA', 'Emirates Authority for Standardization and Metrology'], ['ESP', 'External static pressure'], ['IAQ', 'Indoor air quality'], ['MERV', 'Minimum efficiency reporting value (ASHRAE 52.2)'], ['SMACNA', "Sheet Metal and Air Conditioning Contractors' National Association"], ['TVOC', 'Total volatile organic compounds'], ['TWA', 'Time-weighted average'], ['DB', 'Dry bulb temperature'], ['DBC', 'Dubai Building Code'],
  ['ADIBC', 'Abu Dhabi International Building Codes'], ['AMPD', 'Ajman Municipality and Planning Department'], ['DCV', 'Demand controlled ventilation'], ['DDA', 'Dubai Development Authority'], ['DEWA', 'Dubai Electricity and Water Authority'], ['DM', 'Dubai Municipality'], ['DMT', 'Department of Municipalities and Transport, Abu Dhabi'], ['DOE', 'Department of Energy, Abu Dhabi'], ['DP', 'Dew point temperature'],
  ['DR', 'Daily range: mean daily max minus mean daily min'], ['EPD', 'Equipment power density (W/m²)'], ['ERV', 'Energy recovery ventilation'],
  ['EtihadWE', 'Etihad Water and Electricity (northern emirates utility)'], ['Ez', 'Zone air distribution effectiveness (ASHRAE 62.1)'], ['FAHU', 'Fresh air handling unit'], ['GBC', "Green Building Code (Al Sa'fat, Dubai)"], ['GFA', 'Gross floor area'], ['GLA', 'Gross leasable area'],
  ['h', 'Specific enthalpy (kJ/kg dry air)'], ['k', 'Air density factor, site pressure ÷ 101.325 kPa'], ['kW', 'Kilowatt'], ['L/s', 'Litres per second'],
  ['LPD', 'Lighting power density (W/m²)'], ['met', 'Metabolic rate unit (1 met = 58.2 W/m²)'], ['MOEI', 'Ministry of Energy and Infrastructure'], ['MRT', 'Mean radiant temperature'], ['TAQA', 'Abu Dhabi National Energy Company (ADDC, AADC distribution)'], ['OA', 'Outdoor (fresh) air'],
  ['P', 'Atmospheric pressure at site elevation (kPa)'], ['PBRS', 'Pearl Building Rating System (Estidama)'], ['PMV', 'Predicted mean vote, ASHRAE 55 comfort index (−3 cold to +3 hot)'],
  ['PPD', 'Predicted percentage dissatisfied'], ['RAK', 'Ras Al Khaimah'], ['RAKEZ', 'Ras Al Khaimah Economic Zone'], ['Ra', 'Area outdoor air rate (L/s·m²)'], ['RH', 'Relative humidity'],
  ['Rp', 'People outdoor air rate (L/s·person)'], ['SA', 'Supply air'], ['SC', 'Shading coefficient (SHGC ≈ SC × 0.87)'], ['SEWA', 'Sharjah Electricity, Water and Gas Authority'], ['SHGC', 'Solar heat gain coefficient'],
  ['SHR', 'Sensible heat ratio: sensible ÷ total load'], ['Ti', 'Indoor design dry bulb'], ['To', 'Outdoor design dry bulb (envelope)'], ['TR', 'Ton of refrigeration (3.517 kW)'],
  ['Ts', 'Supply air temperature'], ['Tv', 'Outdoor design dry bulb (fresh air)'], ['U', 'Thermal transmittance, U-value (W/m²K)'], ['UAQ', 'Umm Al Quwain'],
  ['W', 'Humidity ratio (g water / kg dry air)'], ['WB', 'Wet bulb temperature'], ['WWR', 'Window-to-wall ratio (glazing ratio)'],
] as [string, string][]).sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));

export const DBC_CLAUSES: [string, string][] = [['H.4.6.2, Table H.1', 'Dubai outdoor design 46 °C DB / 29 °C WB, 13.8 K daily range, 25° N, climate zone 0B (ASHRAE 169:2013 Table A-6)'], ['H.4.6.3, Table H.2', 'Indoor design 24 °C ±1.5 DB, 50% ±5 RH; other occupancies per ASHRAE HVAC Applications; safety factors sensible ≤10%, latent ≤5%; diversity per ASHRAE Fundamentals Ch. 18 when unknown'], ['H.4.6.4', 'Outdoor air system in fully air-conditioned buildings; treated outdoor air ≥95% of the year; design 34 °C DB / 32 °C WB (maximum)'], ['H.4.6.5', 'Heat load for each air-conditioned space including peak load incidence; software registered with the Authority'], ['H.4.6.6', 'External loads: orientation, construction, plans, elevations, shading factors (Part E, E.5.3)'], ['H.4.6.7', 'Occupancy per B.5.1, else ASHRAE 62.1/62.2/170 defaults; lighting and equipment project-specific, else ASHRAE 90.1'], ['H.4.7, Table H.3', 'Hold 22.5–25.5 °C, 30–60% RH for 95% of the year; 0.2–0.3 m/s air velocity'], ['H.4.8.1', 'Equipment efficiency to UAE.S 5010-5 (ESMA) Tables 1, 2, 4; chillers to ASHRAE 90.1-2019 Tables 6.8.1–6.8.3'], ['H.4.8.2', 'Treated OA above 1,000 L/s: energy recovery on ≥50% of exhaust, ≥70% sensible effectiveness'], ['H.4.8.3', 'DCV in spaces over 100 m² with ≥25 people/100 m²; CO₂ below 800 ppm, alarm above 1,000 ppm'], ['H.4.8.4', 'Insulate refrigerant, chilled and hot water pipes and supply ducts to BS 5422 or ASHRAE 90.1'], ['H.4.9.1', 'Buildings of 1 MW or more: air leakage ≤5 m³/h·m² at 50 Pa (BS EN 13829 / ASTM E779); positive pressure always'], ['H.4.9.2', 'Lobby or door barrier at main entrance'], ['H.4.10.2', 'Ventilation to ASHRAE 62.1, 62.2 and 170; occupancy from DBC B.5.1 (Table B.2), else ASHRAE defaults'], ['H.4.10.3, Table H.4', 'Filters ISO 16890-1; formaldehyde <0.08 ppm, TVOC <300 μg/m³, PM10 <150 μg/m³ (8 h TWA); IAQ test before occupancy'], ['H.4.10.4', 'Intake/exhaust separation ASHRAE 62.1:2019 Table 5-1; sand trap louvers ≥1 m/s face, ≥80% at 355–425 μm'], ['H.4.11', 'Natural ventilation permitted but not relied on for ventilation or comfort'], ['H.4.12.1', 'Supply ≈ return + exhaust; AHUs AHRI or Eurovent certified; ASHRAE Fundamentals Ch. 16'], ['H.4.12.2', 'Duct sizing ASHRAE Fundamentals Ch. 21; SMACNA construction; flexible ducts UL 181, ≤250 °C'], ['H.4.12.5', 'Filters per ASHRAE 52.2:2017 Table E-1 MERV; UL 900 / UL 586 / UL 867'], ['H.4.12.6', 'Duct leakage test: ESP above 250 Pa or ducts exposed to ambient / unconditioned spaces'], ['H.4.12.11', 'Car parks: CO below 50 ppm, ≥6 ACH or CO-controlled VAV, 1 sensor per 400 m², alarm at 75 ppm, 10 ACH smoke clearance'], ['H.4.12.15.3', 'Kitchens: make-up air 75–95% of extract, −0.25 Pa kitchen, +1.25 to +5.0 Pa building, make-up ΔT ≤6 °C'], ['H.4.14.2', 'BMS at 1,000 kW cooling load or 5,000 m² gross floor area'], ['H.5.2.4', 'Recover AC condensate above 350 kW cooling load']];

export const HBM_ITEMS: string[] = [
  'ASHRAE heat balance method (Fundamentals Ch. 18), room by room, on a steady-periodic design day for the 21st of every month. The room peak is the highest hour of the year; the block load is the highest hour of the sum of all rooms.',
  'Outside face of each wall, roof and window: <code>α × I + h<sub>co</sub> × (To − Ts) + h<sub>ro</sub> × (Tenv − Ts) = q conducted</code>, with h<sub>co</sub> 11 and h<sub>ro</sub> 6 W/m²K (17 W/m²K in total, ASHRAE summer sol-air value). Tenv is the sky temperature for the upward-facing part of a surface (Berdahl–Martin clear-sky emissivity) and the outdoor air otherwise.',
  'Conduction: exact one-dimensional transient conduction through every layer (thickness, λ, density, specific heat; ISO 10456 values), solved for the 24-hour periodic response. Each construction keeps the U-value from the envelope step; where only a U-value is known, a typical UAE build-up is used with its insulation thickness adjusted to match.',
  'Inside face of each surface: conduction + absorbed solar + radiant gains + long-wave exchange with the other surfaces (h<sub>r</sub> 5.4 W/m²K to the area-weighted mean radiant temperature) = convection to the room air (ASHRAE simple natural convection: 3.08 walls, 4.04 floor, 0.95 ceiling W/m²K).',
  'Room air: <code>cooling load = Σ h<sub>c</sub> × A × (Ts − Ti) + convective gains + infiltration</code>, with the room held at the indoor design temperature. Load components are separated exactly by superposition.',
  'Sun: ASHRAE Ch. 14 solar position and clear-sky model with the 2013 monthly optical depths (taub, taud) of the nearest station; beam, diffuse (with the ASHRAE vertical-surface factor Y) and ground-reflected radiation on each surface.',
  'Glass: solar gain = SHGC × shading factor × (beam × angle factor + diffuse × hemispherical factor); angle factors from Fresnel optics for double glazing. Beam lands on the floor; diffuse and shaded gains spread over all surfaces by area. Conduction uses the glazing U-value.',
  'Outdoor temperature: hourly profile from the ASHRAE Ch. 14 daily-range fractions. The hottest month uses the project design dry bulb and daily range (code values); other months follow the station\'s ASHRAE 0.4% monthly design dry bulb and coincident daily range.',
  'Internal gains follow the room operating schedule. Radiant parts (people, lighting and equipment radiant fractions in the envelope step) are absorbed by the room surfaces and released over the following hours; convective parts are load at once. Latent gains are load at once.',
  'Surfaces shared with conditioned space at the room temperature are modelled as the room\'s half of the construction with no heat crossing the mid-plane. Unconditioned spaces defined from the outdoor temperature follow the hourly outdoor profile. A slab on grade sits on 2 m of soil (ISO 13370, λ 1.5 W/mK) at the station annual mean temperature.',
  'People: count × sensible and latent gain for the selected activity (ASHRAE Fundamentals). Lighting and equipment: W/m² × area. Occupancy: DBC Table B.2 where listed, otherwise ASHRAE 62.1-2025 Table 6-1 default densities.',
  'Fresh air: ASHRAE 62.1-2022, <code>L/s = (Rp × people + Ra × area) / Ez</code>, at the fresh-air design condition. Infiltration: <code>L/s = ACH × volume / 3.6</code>, sensible at the hourly outdoor temperature, latent at the design humidity ratio.',
  'Air loads: sensible <code>1.23 × k × L/s × ΔT</code>, latent <code>3010 × k × L/s × ΔW</code>, with density factor <code>k = P / 101.325</code> from the site elevation. Above the emirate reference elevation the design dry bulb is lowered by 6.5 K per 1,000 m.',
  'With a FAHU, fresh air is a separate load from outdoor to room condition, less any energy recovery. Supply air is sized on room sensible load: <code>L/s = Qs / (1.23 × (Ti − Ts))</code>.',
  'Plant load sums room peaks without time diversity (conservative); the coincident block load is reported alongside. Margins are applied to every hour.',
];

export const methodItems = HBM_ITEMS;
export const methodName = () => 'ASHRAE heat balance method';
const hr = (h: number) => String(h).padStart(2, '0') + ':00';
const schedLabel = (id?: string) => (SCHEDULES.find(s => s.id === (id || '24h')) || SCHEDULES[0]).label;

export function srcLabel(p: Project, k: PickKey) { const s = p.src[k]; if (s === 'custom') return 'Custom value'; const o = LIB[k].find(o => o.id === s); return o ? o.label : 'Custom value'; }
export function roomSrcText(r: Room, k: RoomPick, ez: number) {
  if (r.src[k] === 'custom') return 'Custom value';
  const o = ROOMOPTS[k](r, typeOf(r.type), ez).find(o => o.id === r.src[k]);
  return o ? (o.cat ? o.cat + ': ' : '') + o.label : '';
}
export function basisRows(p: Project, d: Computed): [string, string, string][] {
  const e = d.e, sub = subOf(p);
  return [
    ['Outdoor design (envelope)', `${fmt(e.To, 1)} °C DB / ${num(p.toWB)} °C WB${e.lapse > 0 ? ` (code ${num(p.toDB)} °C, elevation-adjusted)` : ''}`, outSrcLabel(p)],
    ['Sub-location: elevation, daily range', `${sub ? sub.label : 'Custom'}: ${num(p.elev)} m, ${num(p.dr)} K`, sub ? sub.src : 'Custom values'],
    ['Outdoor air (FAHU) design', `${fmt(e.Tv, 1)} °C DB / ${num(p.vWB)} °C WB${e.lapse > 0 ? ` (code ${num(p.vDB)} °C, elevation-adjusted)` : ''}`, ventSrcLabel(p)],
    ['Indoor design', `${num(p.tiDB)} °C / ${num(p.tiRH)}% RH`, p.src.indoor === 'custom' ? 'Custom value' : (INDOOR.find(i => i.id === p.src.indoor) || INDOOR[0]).src],
    ...PPICKS.map(k => [PMETA[k][0], `${num(p[k])}${PMETA[k][1] ? ' ' + PMETA[k][1] : ''}`, srcLabel(p, k)] as [string, string, string]),
    ...([['Calculation method', 'Heat balance, hourly, every month', 'ASHRAE Fundamentals Ch. 18'], ['Solar and monthly weather', `${stationOf(p.location).name} (WMO ${stationOf(p.location).wmo})`, STATION_SRC],
        ['Surfaces', `Wall α ${num(p.aWall)}, roof α ${num(p.aRoof)}, ground reflectance ${num(p.gRefl)}; ${p.ceil === 'none' ? 'exposed slab' : 'suspended ceiling'}, ${p.floorFin === 'carpet' ? 'carpet' : 'tiled'} floor`, 'Project values'],
        ['Radiant fraction: people / lighting / equipment', `${num(p.frP)} / ${num(p.frL)} / ${num(p.frE)}`, 'Typical values, ASHRAE Fundamentals Ch. 18']] as [string, string, string][]),
    ['Wall / ceiling / floor partition U-value', `${num(p.uPart)} / ${num(p.uCeil)} / ${num(p.uFloor)} W/m²K, default adjacent space ${num(p.tAdj)} °C`, 'Project values'],
    ...p.wallTypes.map(t => [`External wall type: ${esc(t.name || 'Unnamed')}`, `${num(t.u)} W/m²K`, 'Project value'] as [string, string, string]),
    ...p.partTypes.map(t => [`Wall partition type: ${esc(t.name || 'Unnamed')}`, `${num(t.u)} W/m²K`, 'Project value'] as [string, string, string]),
    ['Margins', `${num(p.sfS)}% sensible / ${num(p.sfL)}% latent`, 'DBC H.4.6.3 maximum 10% / 5%'],
    ['Fresh air', p.fahu ? 'Treated by FAHU' : 'Mixed at room units', 'ASHRAE 62.1-2025 Table 6-1 per room, DBC H.4.10.2'],
    ['Energy recovery', p.fahu && p.erv ? `${num(p.ervS)}% sensible, ${num(p.ervL)}% latent, on ${num(p.ervShare)}% of OA` : 'Not modelled', 'DBC H.4.8.2'],
    ['Supply air temperature', `${num(p.tSupply)} °C`, 'Project value'],
    ['Plant diversity', `${num(p.diversity)}%`, 'Project value'],
  ];
}

const ck = (v: Mark) => v ? `<span class="ck ${v[0]}">${MK[v[0]]}</span> ${esc(v[1])}` : '<span class="ck na">–</span>';
const st = (s: 'ok' | 'bad' | 'warn', t: string) => `<span class="ck ${s}">${MK[s]}</span> ${esc(t)}`;
type Head = [string, boolean?][];
function tbl(head: Head, rows: (string | number)[][], foot?: (string | number)[]) {
  const cls = (i: number) => head[i] && head[i][1] ? ' class="n"' : '';
  return `<table><thead><tr>${head.map(h => `<th${h[1] ? ' class="n"' : ''}>${h[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${cls(i)}>${c}</td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot><tr>${foot.map((c, i) => `<td${cls(i)}>${c}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}
const adjLabel = (id: string) => (ADJ.find(a => a[0] === id) || ADJ.find(a => a[0] === 'project')!)[1];

/* the surfaces of a room that touch other spaces, with the values used in the calculation */
function surfaceRows(p: Project, d: Computed, r: Room) {
  const e = d.e, rows: (string | number)[][] = [];
  /* heat balance: tb is the design-hour value and the gain is in the component table, not per surface */
  const row = (el: string, x: Adjacent, U: number, T: number, space: string) =>
    rows.push([el, fmt(num(x.a), 1), esc(space), fmt(T, 1), fmt(U, 2), 'see components']);
  if (r.above === 'roof') rows.push(['Roof, sun-exposed', fmt(num(r.roof), 1), 'Outdoor', 'Hourly', fmt(num(p.uRoof), 2), fmt(d.res[r.id].roof, 0)]);
  if (r.above === 'uncond') row('Ceiling', r.ce, uEff(r.ce.u, pxU(p, 'ceiling')), adjTemp(p, e, r.ce.adj, r.ce.t), adjLabel(r.ce.adj));
  if (r.below === 'uncond') row('Floor', r.fl, uEff(r.fl.u, p.uFloor), adjTemp(p, e, r.fl.adj, r.fl.t), adjLabel(r.fl.adj));
  if (r.below === 'outdoor') rows.push(['Floor', fmt(num(r.fl.a), 1), 'Outdoor air', fmt(e.To, 1), fmt(uEff(r.fl.u, p.uFloor), 2), fmt(d.res[r.id].partF, 0)]);
  r.px.forEach((x, i) => row(`Wall partition ${i + 1}` + (p.partTypes.length ? ` (${esc(partName(p, x))})` : ''), x, uEff(x.u, partU(p, x)), adjTemp(p, e, x.adj, x.t), adjLabel(x.adj)));
  return rows;
}

/* compliance: include the compliance checks, Check columns and design basis checks */
export function reportBody(s: AppState, compliance = false, today = new Date()) {
  const c_ = compliance, tblC = (head: Head, rows: (string | number)[][]) => c_ ? tbl(head, rows) : tbl(head.slice(0, -1), rows.map(r => r.slice(0, -1)));
  const { project: p, rooms } = s, d = computeAll(p, rooms), { e, res, T } = d, ez = ezOf(p);
  const { marks: pc, limits: L } = projectChecks(p, T, rooms);
  const allC = allChecks(d, pc, L), checks = allC.filter(applicable), genC = allC.filter(c => c[3]);
  const date = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const loc = LOC[p.location] || { label: '' }, sub = subOf(p);
  let h = `<h1>Heat Load Calculation Report</h1><p class="rsub">NOVAC Simplified Heat Load Calculator · ${esc(p.name || 'Untitled project')} · ${esc(loc.label)} · ${date}</p><p class="small">Calculated using the ${methodName()}${c_ ? ", with checks against DBC, Al Sa'fat, Estidama and ASHRAE standards" : ''}</p>`;
  h += `<h2>1. Summary</h2>` + tbl([['Item'], ['Value']], [
    ['Project', esc(p.name || 'Untitled project')],
    ...([['Client', p.client], ['Consultant', p.consultant], ['Contractor', p.contractor]] as const).filter(([, v]) => v?.trim()).map(([k, v]) => [k, esc(v)]),
    ['Location', esc(loc.label) + (sub ? ', ' + esc(sub.label) : '')], ['Authority basis', esc(authLine(p.location))], ['Date', date],
    ['Method', `Heat balance method (hourly), room by room on the 21st of every month; ventilation per DBC H.4.10.2 (ASHRAE 62.1-2022, 62.2-2019, 170-2021)`],
    ['Rooms', `${rooms.length} room types, ${T.q} rooms in total`], ['Conditioned floor area', `${fmt(T.a, 1)} m²`]]);
  h += `<div class="kpis"><div class="kpi"><div class="k">Room units</div><div class="v">${fmt(T.u / 3517, 1)} TR</div><div class="s">${fmt(T.u / 1000, 1)} kW</div></div><div class="kpi"><div class="k">Fresh air (FAHU)</div><div class="v">${p.fahu ? fmt(T.fahuW / 3517, 1) + ' TR' : 'In units'}</div><div class="s">${fmt(T.oaq, 0)} L/s</div></div><div class="kpi"><div class="k">Plant load</div><div class="v">${fmt(T.plant / 3517, 1)} TR</div><div class="s">${fmt(T.plant / 1000, 1)} kW at ${fmt(num(p.diversity), 0)}% diversity</div></div><div class="kpi"><div class="k">Overall density</div><div class="v">${T.plant ? fmt(T.a / (T.plant / 3517), 1) : '–'} m²/TR</div><div class="s">${fmt(T.a ? T.plant / T.a : 0, 0)} W/m²</div></div></div>`;
  const eg = efficiencyGuidance(p, T.plant / 1000), eer = num(p.ratedEer) || eg.eer || 0, fanKw = Math.max(0, num(p.fanSfp) * T.sa / 1000), inputKw = eer > 0 ? T.plant / 1000 * 3.41214 / eer : 0;
  h += `<h3>Cooling efficiency and estimated equipment input power</h3>` + tbl([['Item'], ['Value']], [
    ['Authority recommendation', `${esc(eg.authority)} — ${esc(eg.target)} (${esc(eg.source)})`],
    ['Product EER entered at T3', num(p.ratedEer) > 0 ? `${fmt(num(p.ratedEer), 2)} Btu/Wh` : 'Not entered'],
    ['EER used in power estimate', eer > 0 ? `${fmt(eer, 2)} Btu/Wh${num(p.ratedEer) > 0 ? ' (product rating)' : ' (authority minimum)'}` : 'Not available for this authority basis; enter a certified T3 rating'],
    ['Product SEER / CSPF', num(p.ratedSeer) > 0 ? fmt(num(p.ratedSeer), 2) : (eg.seer ? `Recommendation: CSPF ${fmt(eg.seer, 2)}` : 'Not entered / use current product label')],
    ['Indoor units — fan power estimate', `${fmt(fanKw, 2)} kW at ${fmt(T.sa, 0)} L/s, using ${fmt(num(p.fanSfp), 1)} W/(L/s)`],
    ['Outdoor unit — compressor and condenser estimate', eer > 0 ? `${fmt(Math.max(0, inputKw - fanKw), 2)} kW; whole-system EER input ${fmt(inputKw, 2)} kW` : 'Enter the certified T3 EER to calculate'],
    ['Method note', 'EER is a matched-system rating. Indoor fan allocation is an estimate; confirm indoor and outdoor nameplate power and design-condition performance from the approved equipment submittal. SEER/CSPF is not converted to full-load watts.'],
  ]);
  h += `<p class="small">${esc(eg.note)} <a href="${esc(eg.href)}">Official source</a></p>`;
  const nBad = checks.filter(c => c[0] === 'bad').length;
  if (c_) h += `<p>${nBad ? `<span class="ck bad">✗</span> ${nBad} compliance item${nBad > 1 ? 's' : ''} failing. See section 6.` : '<span class="ck ok">✓</span> All checked design inputs comply with the selected standards. See section 6.'}</p>`;
  const outMark: Mark = pc.toDB && pc.toWB ? (pc.toDB[0] !== 'ok' ? pc.toDB : pc.toWB) : null;
  h += `<h2>2. Design conditions and psychrometrics</h2>` + tblC([['Parameter'], ['Value'], ['Source'], ['Check']], [
    ['Outdoor design, envelope', `${fmt(e.To, 1)} °C DB / ${num(p.toWB)} °C WB${e.lapse > 0 ? ` (code ${num(p.toDB)} °C, elevation-adjusted)` : ''}`, esc(outSrcLabel(p)), ck(outMark)],
    ['Outdoor air (FAHU) design', `${fmt(e.Tv, 1)} °C DB / ${num(p.vWB)} °C WB${e.lapse > 0 ? ` (code ${num(p.vDB)} °C, elevation-adjusted)` : ''}`, esc(ventSrcLabel(p)), ck(pc.vWB)],
    ['Sub-location, elevation, daily range', `${esc(sub ? sub.label : 'Custom')}: ${num(p.elev)} m (${fmt(e.P, 2)} kPa), ${num(p.dr)} K`, esc(sub ? sub.src : 'Custom values'), ck(null)],
    ['Indoor design', `${num(p.tiDB)} °C / ${num(p.tiRH)}% RH`, esc(p.src.indoor === 'custom' ? 'Custom value' : (INDOOR.find(i => i.id === p.src.indoor) || INDOOR[0]).src), ck(pc.tiDB && pc.tiDB[0] === 'ok' ? pc.tiRH : pc.tiDB)],
    ['Humidity ratio: outdoor / fresh air / indoor', `${fmt(e.Wo * 1000, 2)} / ${fmt(e.Wv * 1000, 2)} / ${fmt(e.Wi * 1000, 2)} g/kg`, 'Calculated', ck(null)],
    ['Solar and monthly weather', `${stationOf(p.location).name} (WMO ${stationOf(p.location).wmo}), ${fmt(stationOf(p.location).lat, 2)}° N`, esc(STATION_SRC), ck(null)]]);
  if (c_) h += `<h3>Outdoor design basis checks</h3>` + tbl([['Standard / clause'], ['Requirement'], ['Design value'], ['Status']], outdoorChecks(p, e).map(r => [esc(r[0]), esc(r[1]), esc(r[2]), st(r[3][0], r[3][1])]));
  const dd = designDay(p, e);
  h += `<h3>Outdoor design day temperature profile</h3><p class="small">Design dry bulb ${fmt(e.To, 1)} °C, daily range ${fmt(num(p.dr), 1)} K (DBC Table H.1 typical ${DBC_DR} K), hourly fractions per ASHRAE Fundamentals Ch. 14.</p><div class="chart">${dayChartSVG(p, e, true)}</div>`;
  h += tbl([['Hour'], ['DB °C', true], ['WB °C', true], ['RH %', true], ['Hour'], ['DB °C', true], ['WB °C', true], ['RH %', true]], dd.slice(0, 12).map((x, i) => { const y = dd[i + 12]; return [String(x.h).padStart(2, '0') + ':00', fmt(x.db, 1), fmt(x.wb, 1), fmt(x.rh, 0), String(y.h).padStart(2, '0') + ':00', fmt(y.db, 1), fmt(y.wb, 1), fmt(y.rh, 0)]; }));
  if (c_) h += `<h3>Indoor design basis checks</h3>` + tbl([['Standard / clause'], ['Requirement'], ['Design value'], ['Status']], indoorChecks(p, e, rooms).rows.map(r => [esc(r[0]), esc(r[1]), esc(r[2]), st(r[3][0], r[3][1])]));
  h += `<div class="chart">${psychroSVG(d, true, 'all')}</div>`;
  h += tbl([['Point'], ['DB °C', true], ['WB °C', true], ['RH %', true], ['DP °C', true], ['W g/kg', true], ['h kJ/kg', true]], stateRows(d).map(r => [`<b>${r.k}</b> ${esc(r.name)}`, r.db, r.wb, r.rh, r.dp, r.w, r.h]));
  if (stateTable(d).supersat) h += `<p><span class="ck bad">✗</span> The supply point is above saturation at ${num(p.tSupply)} °C: room latent load needs a lower supply temperature, more airflow or latent treatment in the FAHU.</p>`;
  h += `<h2>3. Envelope and system inputs</h2>${c_ ? `<p class="small">Compliance checked against ${esc(L.name)}${L.band ? ' (' + esc(L.band) + ', project glazing ratio ' + fmt(T.wwr, 0) + '%)' : ''}.</p>` : ''}`;
  h += tblC([['Input'], ['Value', true], ['Source'], ['Check']], [
    ...PPICKS.map(k => [PMETA[k][0], `${num(p[k])} ${PMETA[k][1]}`, esc(srcLabel(p, k)), ck(pc[k] ?? null)]),
    ...([
      ['Wall / roof outside solar absorptance', `${num(p.aWall)} / ${num(p.aRoof)}`, 'Project value (ASHRAE Ch. 18: light 0.45, dark 0.9)', ck(null)],
      ['Ground reflectance', `${num(p.gRefl)}`, 'Project value', ck(null)],
      ['Ceiling and floor seen by the room', `${p.ceil === 'none' ? 'Exposed slab' : 'Suspended gypsum ceiling'}, ${p.floorFin === 'carpet' ? 'carpet' : 'tiles on screed'}`, 'Project choice', ck(null)],
      ['Radiant fraction: people / lighting / equipment', `${num(p.frP)} / ${num(p.frL)} / ${num(p.frE)}`, 'Typical values, ASHRAE Ch. 18', ck(null)]]),
    ...p.wallTypes.map(t => [`External wall type: ${esc(t.name || 'Unnamed')}`, `${num(t.u)} W/m²K`, 'Project value', ck(null)]),
    ['Wall partition U-value', `${num(p.uPart)} W/m²K`, 'Project value', ck(null)],
    ...p.partTypes.map(t => [`Wall partition type: ${esc(t.name || 'Unnamed')}`, `${num(t.u)} W/m²K`, 'Project value', ck(null)]), ['Ceiling partition U-value', `${num(p.uCeil)} W/m²K`, 'Project value', ck(null)], ['Floor partition / exposed floor U-value', `${num(p.uFloor)} W/m²K`, 'Project value', ck(null)],
    ['Unconditioned space temperature', `${num(p.tAdj)} °C`, 'Project value', ck(null)], ['Glass shading factor', `${num(p.shade)}`, 'Project value', ck(null)],
    ['Supply air temperature', `${num(p.tSupply)} °C`, 'Project value', ck(null)],
    ['Safety margin, sensible', `${num(p.sfS)}%`, 'DBC H.4.6.3', ck(pc.sfS)], ['Safety margin, latent', `${num(p.sfL)}%`, 'DBC H.4.6.3', ck(pc.sfL)],
    ['Plant diversity', `${num(p.diversity)}%`, 'Project value', ck(null)],
    ['Fresh air treatment', p.fahu ? 'FAHU' : 'Mixed at room units', 'Project choice', ck(null)],
    ['Energy recovery', p.fahu && p.erv ? `${num(p.ervS)}% sens. / ${num(p.ervL)}% lat. on ${num(p.ervShare)}% of OA` : 'Not modelled', 'DBC H.4.8.2', ck(p.erv ? (pc.ervS && pc.ervS[0] === 'ok' ? pc.ervShare : pc.ervS) : null)],
    ['Project glazing ratio', `${fmt(T.wwr, 0)}% of wall, ${fmt(T.skyPct, 0)}% of roof`, 'Calculated', ck(null)]]);
  {
    const st = stationOf(p.location), hot = st.db.indexOf(Math.max(...st.db));
    h += `<h3>Monthly design days</h3><p class="small">${esc(st.name)} (WMO ${st.wmo}), ${esc(STATION_SRC)}. ${MONTHS[hot]} uses the project design dry bulb and daily range; other months are offset by the station's monthly 0.4% design dry bulb and scaled by its coincident daily range.</p>`
      + tbl([['Month'], ['Design DB °C', true], ['Daily range K', true], ['taub', true], ['taud', true], ...(T.blk ? [['Block load kW', true]] as Head : [])], MONTHS.map((m, i) => [m,
        fmt(e.To - (st.db[hot] - st.db[i]), 1), fmt(num(p.dr) * st.dbr[i] / st.dbr[hot], 1), fmt(st.taub[i], 3), fmt(st.taud[i], 3),
        ...(T.blk ? [fmt(Math.max(...Array.from({ length: 24 }, (_, k) => rooms.reduce((a, r) => a + (res[r.id].profS![i * 24 + k] + res[r.id].profL![i * 24 + k]) * res[r.id].qty, 0))) / 1000, 1)] : [])]));
  }
  h += `<h2>4. Rooms: inputs and loads</h2>`;
  rooms.forEach((r, i) => {
    const c = res[r.id], t = typeOf(r.type), ch = roomChecks(r, c, ez);
    h += `<div class="room"><h3>4.${i + 1} ${esc(r.name || 'Untitled')}${c.qty > 1 ? ` (× ${c.qty} identical rooms)` : ''}</h3>`;
    h += tblC([['Input'], ['Value', true], ['Source'], ['Check']], [
      ['Room type', esc(t.label), '', ck(null)], ['Floor area / ceiling height', `${fmt(c.A, 1)} m² / ${num(r.height)} m`, 'Project value', ck(null)],
      ['People', fmt(c.n, 0), esc(roomSrcText(r, 'people', ez)), ck(ch.people)],
      ['Heat gain per person', `${num(r.ps)} W sens. / ${num(r.pl)} W lat.`, esc(r.src.act === 'custom' ? 'Custom value' : 'ASHRAE Fundamentals: ' + (ACT_BY[r.src.act]?.label || '')), ck(null)],
      ['Lighting', `${num(r.light)} W/m²`, esc(roomSrcText(r, 'light', ez)), ck(ch.light)],
      ['Equipment', `${num(r.equip)} W/m²`, esc(roomSrcText(r, 'equip', ez)), ck(null)],
      ['Fresh air', `${fmt(c.oaQ, 1)} L/s`, esc(roomSrcText(r, 'oa', ez)) + (ez !== 1 ? `, Ez ${ez}` : ''), ck(ch.oa)],
      ['Infiltration', `${num(r.ach)} ACH (${fmt(c.infQ, 1)} L/s)`, esc(roomSrcText(r, 'ach', ez)), ck(null)],
      ['Above / below', `${(ABOVE.find(x => x[0] === r.above) || [])[1]} · ${(BELOW.find(x => x[0] === r.below) || [])[1]}`, 'Project value', ck(null)],
      ...(c.pkM != null ? [['Operating hours', esc(schedLabel(r.sched)), 'Project choice', ck(null)], ['Design hour (room peak)', `${MONTHS[c.pkM]} 21, ${hr(c.pkH!)}`, 'Heat balance, highest hour of the year', ck(null)]] : [])]);
    const wr = ORIENTS.filter(o => num(r.walls[o].w) || num(r.walls[o].g)).map(o => { const w = num(r.walls[o].w), g = num(r.walls[o].g), gross = Math.max(w, g); return [o, fmt(gross, 1), fmt(g, 1), fmt(Math.max(0, w - g), 1), fmt(gross ? g / gross * 100 : 0, 0) + '%', ...(p.wallTypes.length ? [esc(wallName(p, r.walls[o].t)), fmt(num(wallU(p, r.walls[o].t)), 2)] : [])]; });
    if (wr.length) h += tbl([['Facing'], ['Wall gross m²', true], ['Glass m²', true], ['Net wall m²', true], ['Glazing', true], ...(p.wallTypes.length ? [['Wall type'], ['U W/m²K', true]] as Head : [])], wr);
    const sr = surfaceRows(p, d, r);
    if (sr.length) h += tbl([['Roof, ceiling, floor, partitions'], ['Area m²', true], ['Adjacent space'], ['tb °C', true], ['U W/m²K', true], ['Gain W', true]], sr);
    h += tbl([['Load component'], ['Sensible W', true], ['Latent W', true]], [
      ['Walls', fmt(c.walls, 0), ''], ['Roof', fmt(c.roof, 0), ''], ['Glass, solar', fmt(c.gSol, 0), ''], ['Glass, conduction', fmt(c.gCond, 0), ''], ['Wall partitions', fmt(c.partW, 0), ''], ['Ceiling partitions', fmt(c.partC, 0), ''], ['Floor partitions / exposed floor', fmt(c.partF, 0), ''],
      ['People', fmt(c.pS, 0), fmt(c.pL, 0)], ['Lighting', fmt(c.light, 0), ''], ['Equipment', fmt(c.equip, 0), ''], ['Infiltration', fmt(c.infS, 0), fmt(c.infL, 0)],
      ['Safety margin', fmt(c.mS, 0), fmt(c.mL, 0)], ['<b>Room load</b>', `<b>${fmt(c.roomS, 0)}</b>`, `<b>${fmt(c.roomL, 0)}</b>`],
      [p.fahu ? 'Fresh air (to FAHU, not in unit)' : 'Fresh air (in unit)', fmt(c.oaS, 0), fmt(c.oaL, 0)]],
      ['Unit load', fmt(c.unitS, 0), fmt(c.unitL, 0)]);
    h += `<p class="small">Unit load ${fmt(c.unit / 1000, 2)} kW = ${fmt(c.unit / 3517, 2)} TR · SHR ${fmt(c.unitS / (c.unit || 1), 2)} · ${fmt(c.A ? c.unit / c.A : 0, 0)} W/m² · ${c.unit ? fmt(c.A / (c.unit / 3517), 1) : '–'} m²/TR · supply air ${fmt(c.sa, 0)} L/s (${fmt(c.sa * 2.119, 0)} CFM)${dcvNeeded(c) ? ' · DCV required (DBC H.4.8.3)' : ''}</p></div>`;
  });
  const pk = (m?: number, h?: number) => m != null ? [`${MONTHS[m]} ${hr(h!)}`] : [];
  h += `<h2>5. Load schedule</h2>` + tbl([['Room'], ['Qty', true], ['Area m²', true], ['People', true], ['Room sens. kW', true], ['Room lat. kW', true], ['Fresh air kW', true], ['Unit kW', true], ['Unit TR', true], ['Supply L/s', true], ['Fresh air L/s', true], ...(T.blk ? [['Peak']] as Head : [])],
    rooms.map(r => { const c = res[r.id]; return [esc(r.name || 'Untitled'), c.qty, fmt(c.A, 1), fmt(c.n, 0), fmt(c.roomS / 1000, 2), fmt(c.roomL / 1000, 2), fmt(c.oa / 1000, 2), fmt(c.unit / 1000, 2), fmt(c.unit / 3517, 2), fmt(c.sa, 0), fmt(c.oaQ, 0), ...(T.blk ? pk(c.pkM, c.pkH) : [])]; }),
    ['Total (× qty)', T.q, fmt(T.a, 1), fmt(T.n, 0), fmt(T.s / 1000, 2), fmt(T.l / 1000, 2), fmt(T.oa / 1000, 2), fmt(T.u / 1000, 2), fmt(T.u / 3517, 2), fmt(T.sa, 0), fmt(T.oaq, 0), ...(T.blk ? pk(T.blk.m, T.blk.h) : [])]);
  h += tbl([['Plant summary'], ['kW', true], ['TR', true]], [['Room units', fmt(T.u / 1000, 1), fmt(T.u / 3517, 1)], ['Fresh air (FAHU)' + (T.rec ? ', net of energy recovery' : ''), fmt(T.fahuW / 1000, 1), fmt(T.fahuW / 3517, 1)], ...(T.rec ? [['Energy recovered', fmt(T.rec / 1000, 1), fmt(T.rec / 3517, 1)]] : []), [`Plant load at ${fmt(num(p.diversity), 0)}% diversity`, `<b>${fmt(T.plant / 1000, 1)}</b>`, `<b>${fmt(T.plant / 3517, 1)}</b>`], ...(T.blk ? [[`Coincident block load of all rooms (${MONTHS[T.blk.m]} 21, ${hr(T.blk.h)}), for information`, fmt((T.blk.s + T.blk.l) / 1000, 1), fmt((T.blk.s + T.blk.l) / 3517, 1)]] : [])]);
  const icon = (s: Check[0]) => s === 'ok' ? '✓' : s === 'bad' ? '✗' : '!';
  if (c_) h += `<h2>6. Compliance checks</h2><p class="small">Checks shown where the calculation applies or the feature is turned on.</p>` + tbl([['Result'], ['Criterion'], ['Detail']], checks.map(([s, c, t]) => [`<span class="ck ${s === 'req' ? 'warn' : s}">${icon(s)}</span> ${PILL[s]}`, esc(c), esc(t)]));
  if (c_) h += `<h3>General DBC design requirements</h3>` + tbl([['Clause'], ['Requirement']], genC.map(([, c, t]) => [esc(c), esc(t)]));
  h += `<h2>${c_ ? 7 : 6}. Method and formulas</h2><ul>${methodItems.map(m => `<li>${m.replace(/<code>/g, '<b>').replace(/<\/code>/g, '</b>')}</li>`).join('')}</ul>`;
  h += `<h2>${c_ ? 8 : 7}. References and limitations</h2><ul><li>Dubai Building Code 2021: Part B Table B.2 (occupant loads); Part H Indoor Environment, Tables H.1–H.4, H.4.6.2–H.4.6.7, H.4.7, H.4.8.1–H.4.8.4, H.4.9.1, H.4.10.2–H.4.10.4, H.4.12.1, H.4.12.2, H.4.12.6, H.4.12.15.3, H.4.14.2, H.5.2.4; ASHRAE 169:2013 Table A-6 (climate zone 0B).</li><li>${SAFAT} Dubai Green Building Evaluation System: 401.01, 402.01, 501.01, 501.03, 501.05.</li><li>ASHRAE 62.1-2022 Tables 6-1 and 6-4; ASHRAE 90.1-2022 Table 5.5-0 and space-by-space lighting allowances; ASHRAE Handbook Fundamentals (heat-balance method, people heat gain).</li><li>DoE Cooling Load Manual (DoE_PR_P04_001, May 2026) for Abu Dhabi and Al Ain design conditions, infiltration, safety margins and plant diversity. Barjeel V1.3 (RAK Municipality) for Ras Al Khaimah envelope, design conditions and equipment efficiency. Estidama envelope values from a 2020 comparative study; confirm against the current edition.</li><li>This is a simplified peak-load method for concept design and checking. DBC H.4.6.5 requires final calculations in software registered with the Authority.</li></ul>`;
  h += `<div class="sign"><div>Prepared by</div><div>Reviewed by</div><div>Date</div></div>`;
  return h;
}

export function reportDoc(s: AppState, css: string, compliance = false) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Heat Load Report - ${esc(s.project.name || 'Project')}</title><style>@page{size:letter;margin:.5in}body{margin:0;background:#fff}${css}@media print{.rpt{padding:0}.rpt .room,.rpt table,.rpt .chart{break-inside:avoid}.rpt h2,.rpt h3{break-after:avoid}}</style></head><body><div class="rpt">${reportBody(s, compliance)}</div></body></html>`;
}

const SCHED_HEAD = ['Room', 'Type', 'Qty', 'Area m2', 'People', 'Room sensible kW', 'Room latent kW', 'Fresh air kW', 'Unit load kW', 'Unit TR', 'W/m2', 'Supply air L/s', 'Fresh air L/s', 'Peak'];
function scheduleRows(s: AppState) {
  const { res } = computeAll(s.project, s.rooms);
  return s.rooms.map(r => {
    const c = res[r.id];
    return [r.name, typeOf(r.type).label, c.qty, c.A, c.n, (c.roomS / 1000).toFixed(2), (c.roomL / 1000).toFixed(2), (c.oa / 1000).toFixed(2), (c.unit / 1000).toFixed(2), (c.unit / 3517).toFixed(2), Math.round(c.A ? c.unit / c.A : 0), Math.round(c.sa), Math.round(c.oaQ), c.pkM != null ? `${MONTHS[c.pkM]} ${hr(c.pkH!)}` : ''];
  });
}
export function scheduleCSV(s: AppState) {
  const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  return [SCHED_HEAD, ...scheduleRows(s)].map(r => r.map(q).join(',')).join('\r\n');
}
/* tab-separated block for pasting into Excel: schedule, with basis and checks when compliance is shown */
export function scheduleTSV(s: AppState, compliance = false) {
  const d = computeAll(s.project, s.rooms), { marks, limits } = projectChecks(s.project, d.T, s.rooms);
  const checks = allChecks(d, marks, limits).filter(applicable);
  const lines: (string | number)[][] = [['NOVAC Simplified Heat Load Calculator: load schedule'], [`Project: ${s.project.name || '-'}`],
    ...([['Client', s.project.client], ['Consultant', s.project.consultant], ['Contractor', s.project.contractor]] as const).filter(([, v]) => v?.trim()).map(([k, v]) => [`${k}: ${v}`]), [],
    ...(compliance ? [['Design basis', 'Value', 'Source'], ...basisRows(s.project, d), [], ['Compliance check', 'Criterion', 'Detail'], ...checks.map(([st, c, t]) => [PILL[st], c, t]), []] : []), SCHED_HEAD, ...scheduleRows(s)];
  return lines.map(l => l.join('\t')).join('\n');
}
export const fileBase = (name: string) => 'NOVAC_' + ((name || 'project').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'project') + '_' + new Date().toISOString().slice(0, 10);
