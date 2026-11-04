/* Energy modelling: hourly electrical demand (this project, a linked NOVAC project, or values entered independently)
   supplied by solar PV (laid out on the roof from the building address) with an optional battery, the grid and a genset,
   with the DEWA Shams Dubai limit, equipment sizing, running and capital costs, payback and CO₂. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Computed } from '../engine/calc';
import { MONTHS, stationOf } from '../engine/climate';
import { BATTERIES, COST_KEYS, DEWA_TARIFF, DEWA_TARIFF_REF, tclSizing, CLEARNESS, INVERTERS, SUPPLY_KEYS, remainingOf, remGridShare, offGridSizing, runScenario, scenarioOf, seedOffGrid, DAY_NAMES, HOUR_PRESETS, coverage, operatingAt, operatingHours, scheduleBreakdown, schedulesOf, spanOf, supplyStats, type OpSchedule, type SourceKey, DEWA_CAP, DEWA_REF, FUEL_A, FUEL_B, demand, dispatch, payback, powerCsv, pvKWp, samplePower, settingsOf, utilityOf, type PowerSettings } from '../engine/power';
import { layout, roofOf, type GoogleRoof, type RoofSettings } from '../engine/roof';
import type { LinkMode, Num, ProjectSnap } from '../engine/types';
import { blank, fmt, num } from '../engine/util';
import { getCached } from '../engine/weather/cache';
import { weatherKey, when } from '../engine/weather/dataset';
import type { WeatherYear } from '../engine/weather/types';
import { downloadFile } from '../files';
import type { Store } from '../state/store';
import { hh } from './HourlySection';
import { PRICE_ITEMS, bookCosts, liveDiesel, loadBook, parseBook, saveBook, today, type LiveDiesel, type PriceBook } from '../pricebook';
import { pickFile } from '../files';
import { ProjectLinkBar } from './ProjectLink';
import { EnergyWeather } from './EnergyWeather';
import { RoofLayout } from './RoofLayout';
import { NumInput, SecHead, useToast } from './ui';

type S = Required<PowerSettings>;
type NumKey = { [K in keyof S]: S[K] extends Num ? K : never }[keyof S];
/* sources in stacking order, bottom up */
const SRC = [
  { k: 'solar', label: 'Solar, direct', c: 'var(--s4)' },
  { k: 'battery', label: 'Battery', c: 'var(--s7)' },
  { k: 'grid', label: 'Grid', c: 'var(--s1)' },
  { k: 'gen', label: 'Genset', c: 'var(--s8)' },
  { k: 'unmet', label: 'Unmet', c: 'var(--s5)' },
] as const;
const aed = (x: number) => 'AED ' + fmt(x, 0);

export function EnergyModellingSection({ d, store }: { d: Computed; store: Store }) {
  const p = d.p, toast = useToast();
  /* the price book (selling prices, in this browser) gives every cost the project has not set itself */
  const [book, setBook] = useState<PriceBook | null>(loadBook);
  const pw = useMemo<PowerSettings>(() => ({ ...bookCosts(book), ...(p.power || {}) }), [p.power, book]);
  const root = settingsOf(pw);
  /* on-grid and off-grid are separate scenarios: the selected one is edited, both are calculated */
  /* each scenario's calculation can be switched on or off; the one shown is the selected one if it is on, else the other */
  const calcOn = root.onCalc !== false, calcOff = !!root.offCalc, none = !calcOn && !calcOff;
  const picked: 'on' | 'off' = root.conn === 'off' ? 'off' : 'on';
  const active: 'on' | 'off' = (picked === 'off' ? calcOff : calcOn) ? picked : calcOn ? 'on' : calcOff ? 'off' : picked;
  const s0 = scenarioOf(pw, active);
  /* the utility rules in force: DEWA on-grid, none off-grid */
  const s: S = { ...s0, utility: utilityOf(s0, p.location) };
  /* a supply setting goes to the selected scenario (off-grid: its own copy); the rest is shared */
  const route = (st: { project: { power?: PowerSettings } }, patch: Partial<PowerSettings>) => {
    const pw = { ...(st.project.power || {}) }, isOff = (patch.conn ?? pw.conn) === 'off' && patch.conn === undefined;
    const sup: Partial<PowerSettings> = {}, rest: Partial<PowerSettings> = {};
    for (const [k, v] of Object.entries(patch)) ((isOff && SUPPLY_KEYS.includes(k as keyof PowerSettings) ? sup : rest) as Record<string, unknown>)[k] = v;
    st.project.power = { ...pw, ...rest, ...(Object.keys(sup).length ? { offSup: { ...(pw.offSup || {}), ...sup } } : {}) };
  };
  const set = (k: keyof PowerSettings, v: unknown) => store.update(st => route(st, { [k]: v }), 'power.' + k);
  const setMany = (patch: Partial<PowerSettings>, group?: string) => store.update(st => route(st, patch), group);
  /* switching to off-grid the first time starts its scenario from a copy of the on-grid supply */
  const setConn = (c: 'on' | 'off') => store.update(st => {
    const pw = { ...(st.project.power || {}) };
    /* choosing a scenario switches its calculation on */
    st.project.power = { ...pw, conn: c, ...(c === 'off' ? { offCalc: true } : { onCalc: true }), ...(c === 'off' && !(pw.offSup && Object.keys(pw.offSup).length) ? { offSup: seedOffGrid(pw) } : {}) };
  }, 'power.conn');
  /* switch one scenario's calculation on or off; switching one off shows the other */
  const setCalc = (c: 'on' | 'off', v: boolean) => store.update(st => {
    const pw = { ...(st.project.power || {}) };
    const next: Partial<PowerSettings> = { ...pw, [c === 'on' ? 'onCalc' : 'offCalc']: v };
    if (v) next.conn = c;
    else if ((pw.conn === 'off' ? 'off' : 'on') === c) next.conn = c === 'on' ? 'off' : 'on';
    if (c === 'off' && v && !(pw.offSup && Object.keys(pw.offSup).length)) next.offSup = seedOffGrid(pw);
    st.project.power = next;
  }, 'power.calc');

  /* project link: this project (its design days or weather year), a linked NOVAC project, or independent values */
  const mode: LinkMode = s.basis === 'custom' ? 'independent' : s.basis === 'project' && s.proj ? 'project' : 'this';
  const hourly = s.basis === 'project' ? s.projBasis : s.basis === 'weather' ? 'weather' : 'design';
  const setMode = (m: LinkMode, snap?: ProjectSnap | null) => setMany(m === 'independent' ? { basis: 'custom' } : m === 'project' ? { basis: 'project', proj: snap ?? s.proj, projBasis: hourly } : { basis: hourly, projBasis: hourly }, 'power.link');
  const setHourly = (h: 'design' | 'weather') => setMany(mode === 'project' ? { projBasis: h } : { basis: h, projBasis: h }, 'power.link');

  /* the weather year: the linked project's, else this project's, from this browser's cache */
  const ref = s.wxRef ?? (mode === 'project' ? s.proj?.state.project.weather : undefined) ?? p.weather;
  const [wx, setWx] = useState<WeatherYear | null>(null);
  const [wxState, setWxState] = useState<'none' | 'loading' | 'ready' | 'missing'>('none');
  const needWx = mode !== 'independent' ? hourly === 'weather' : s.indWx;
  useEffect(() => {
    let live = true;
    if (!ref) { setWx(null); setWxState('none'); return; }
    setWxState('loading');
    getCached(weatherKey(ref)).then(w => { if (!live) return; setWx(w); setWxState(w ? 'ready' : 'missing'); });
    return () => { live = false; };
  }, [ref?.provider, ref?.lat, ref?.lon, ref?.year]);

  const key = JSON.stringify(pw) + p.location;
  const D = useMemo(() => demand(d, s, needWx ? wx : null), [d, wx, needWx, key]);
  const off = s.conn === 'off';
  /* both scenarios, each with its own sizing: the selected one drives the inputs, both feed the comparison */
  /* only the scenarios switched on are calculated */
  const both = useMemo(() => {
    if (!D) return null;
    const on = scenarioOf(pw, 'on'), of = scenarioOf(pw, 'off');
    return {
      on: calcOn ? runScenario(D, { ...on, utility: utilityOf(on) }) : null,
      off: calcOff ? runScenario(D, { ...of, utility: 'none' }) : null,
    };
  }, [D, key]);
  const cur = both && !none ? both[active] : null;
  const R = cur?.R ?? null, og = cur?.og ?? null, batSug = cur?.batSug ?? 0, pb = cur?.pb ?? null;
  /* on-grid sized from the TCL: the panels and inverter shown are the DEWA maximum */
  const tclMode = !off && s.ogMode === 'tcl' && s.utility === 'dewa';
  /* on-grid under DEWA starts with the TCL: the rest of the supply waits for it */
  const needTcl = !off && !none && s.utility === 'dewa' && blank(s.tcl);
  const effPanels = tclMode && cur ? cur.s.panels : s.panels, effInv = tclMode && cur ? cur.s.invKW : s.invKW;

  /* roof layout: with auto on, the panel count, rating, tilt and facing follow the layout */
  const roof = roofOf(s.roof), L = useMemo(() => layout(roof), [JSON.stringify(s.roof)]);
  const fromRoof = roof.auto && !!L;
  const setRoof = (r: RoofSettings) => {
    const lr = roofOf(r), Ln = layout(lr);
    setMany(lr.auto && Ln ? { roof: r, panels: Ln.count, panelW: Ln.panel.wp, tilt: num(lr.tilt), az: Math.round(Ln.azimuth) } : { roof: r }, 'power.roof');
  };
  const useGoogle = (g: GoogleRoof) => {
    const seg = [...g.segments].sort((a, b) => b.areaM2 - a.areaM2)[0];
    setMany({ panels: g.maxPanels, panelW: g.panelWp, ...(seg ? { tilt: Math.round(seg.pitch), az: Math.round(seg.azimuth) } : {}) }, 'power.google');
    toast(`Using Google’s ${g.maxPanels} panels of ${fmt(g.panelWp, 0)} Wp`);
  };
  const st = stationOf(p.location), site: [number, number] = [ref?.lat ?? st.lat, ref?.lon ?? st.lon];

  const nf = (k: NumKey, label: ReactNode, unit: string, step = 1, aria?: string, ro = false) => <label className="fld" htmlFor={'pw-' + k}><span className="fl">{label}</span><span className="in-u">
    <NumInput id={'pw-' + k} label={aria ?? (typeof label === 'string' ? label : String(k))} min={0} step={step} value={s[k] as Num} readOnly={ro} onChange={v => set(k, v)} /><span className="u">{unit}</span></span></label>;
  const chk = (k: 'other' | 'bat' | 'export', label: ReactNode) => <label className="pw-chk"><input type="checkbox" checked={!!s[k]} onChange={e => set(k, e.target.checked)} /> {label}</label>;
  const seg = <T extends string>(value: T, opts: [T, string, string][], aria: string, on: (v: T) => void) =>
    <div className="seg" role="group" aria-label={aria} style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
      {opts.map(([v, t, sub]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => on(v)}>{t} <span>{sub}</span></button>)}
    </div>;

  const sample = useMemo(() => samplePower(store.state), [store.state.example, store.state.example ? store.state.rooms : null]);
  const sampleNote = `Based on the application’s sample example, ${store.state.example ? 'open now' : 'linked as a copy'}: its hourly analysis is the demand, and ${sample.panels} panels of 550 Wp fit its ${fmt(sample.roofM2, 0)} m² roof (${fmt(sample.size[0], 1)} × ${fmt(sample.size[1], 1)} m, 1 m setback, 10° tilt). Sample values: 60 kW TCL, battery, 10 kW grid limit, genset. Undo restores your inputs.`;
  const share = s.split === 'share' && !off, kWp = pvKWp(s);
  /* whether a cost is this project's own or from the price book */
  const own = (k: keyof PowerSettings) => (p.power as Record<string, unknown> | undefined)?.[k] != null
    ? <span className="muted"> · this project</span> : book?.items[k as keyof PriceBook['items']] ? <span className="muted"> · price book</span> : <span className="muted"> · default</span>;
  const src = mode === 'project' ? s.proj?.state : null;
  const noRooms = mode === 'this' ? !d.rooms.length || !d.T.blk : mode === 'project' ? !src?.rooms.length : false;
  const profile = s.cMode === 'profile';
  const prof = Array.from({ length: 24 }, (_, h) => (s.cProfile?.[h] ?? (h >= num(s.opFrom) && h < num(s.opTo) ? num(s.cKW) : num(s.cBase))) as Num);
  /* operating schedules: one or more, each with its own days (no day in two schedules) and hours */
  const scheds = schedulesOf(s), cov = coverage(scheds), opH = operatingHours(s);
  /* editing the schedules of a linked project applies them to its demand (the checkbox can turn it off again) */
  const putScheds = (list: OpSchedule[]) => setMany(mode !== 'independent' ? { opScheds: list, opApply: true } : { opScheds: list }, 'power.op');
  const upd = (id: string, patch: Partial<OpSchedule>) => putScheds(scheds.map(x => x.id === id ? { ...x, ...patch } : x));
  const owner = (di: number, id: string) => scheds.find(x => x.id !== id && x.days?.[di]);
  const newId = () => 'op' + Math.random().toString(36).slice(2, 8);
  const W5 = [true, true, true, true, true, false, false], WE = [false, false, false, false, false, true, true];
  const SPLITS: { label: string; list: () => OpSchedule[] }[] = [
    { label: 'One schedule for the week', list: () => [{ id: newId(), name: 'Weekdays', days: W5, from: 8, to: 18 }] },
    { label: 'Weekdays + weekend', list: () => [{ id: newId(), name: 'Weekdays', days: W5, from: 8, to: 12 }, { id: newId(), name: 'Weekend', days: WE, from: 8, to: 20 }] },
    { label: 'Mon–Thu + Friday + weekend', list: () => [{ id: newId(), name: 'Monday to Thursday', days: [true, true, true, true, false, false, false], from: 8, to: 18 }, { id: newId(), name: 'Friday', days: [false, false, false, false, true, false, false], from: 8, to: 12 }, { id: newId(), name: 'Weekend', days: WE, from: 10, to: 22 }] },
  ];

  /* steps, as in the heat load calculation; or every step on one page */
  const [step, setStep] = useState(0), [all, setAll] = useState(false);
  /* the on-grid scenario's own TCL decides, whichever scenario is shown at the moment */
  const focusTcl = () => { const on = scenarioOf(pw, 'on'); if (!blank(on.tcl) || utilityOf(on) === 'none') return; setStep(4); setAll(false); setTimeout(() => (document.getElementById('pw-tcl') as HTMLInputElement | null)?.focus(), 0); };
  const goStep = (i: number) => { setStep(Math.max(0, Math.min(EM_STEPS.length - 1, i))); setAll(false); document.querySelector('.power')?.scrollIntoView?.({ block: 'start' }); };
  const show = (i: number) => all || step === i;
  const status: string[] = [
    mode === 'project' ? `Linked: ${s.proj?.name ?? ''}` : mode === 'independent' ? 'Independent' : 'This project',
    cov.overlap.length ? 'Overlapping days' : cov.uncovered.length ? `${cov.uncovered.length} day${cov.uncovered.length > 1 ? 's' : ''} not covered` : `${fmt(opH, 0)} h a year`,
    wx ? `${wx.year} loaded` : needWx ? 'Needs a weather year' : 'Optional',
    D ? `${fmt(R?.demandKWh ?? 0, 0)} kWh a year` : 'Needs input',
    needTcl ? 'On-grid · enter the TCL' : R ? `${off ? 'Off-grid' : 'On-grid'} · ${share ? 'fixed shares' : R.kWp > 0 ? `${fmt(R.kWp, 1)} kWp` : 'no solar yet'}` : 'Needs demand',
    R ? aed(R.totalCost) + ' a year' : 'Needs demand',
    '',
  ];
  return <section className="hourly power">
    <SecHead title="Energy modelling" sub="Yearly power demand supplied by solar, battery, grid and genset, with sizing, energy, cost and CO₂" />
    <EmStepper steps={EM_STEPS} step={step} all={all} status={status} onStep={goStep} onAll={setAll} />
    <div className="em-conn">
      {(['on', 'off'] as const).map(c => { const v = c === 'on' ? calcOn : calcOff, x = both?.[c];
        return <label key={c} className={'pw-switch em-calc' + (v ? ' on' : '')}>
          <input id={`pw-calc-${c}`} type="checkbox" role="switch" checked={v} onChange={e => { setCalc(c, e.target.checked); if (c === 'on' && e.target.checked) focusTcl(); }} /><span className="pw-knob" aria-hidden="true" />
          <span><b>{c === 'on' ? 'On-grid' : 'Off-grid'} calculation</b> <span className="muted">· {v ? (x ? `${aed(x.R.totalCost)} a year` : 'on') : 'off'}</span></span>
        </label>; })}
      {calcOn && calcOff && <div className="em-toggle" role="radiogroup" aria-label="Scenario shown and edited">
        <span className="muted em-show">Show</span>
        {(['on', 'off'] as const).map(c => <button key={c} type="button" role="radio" aria-checked={active === c} className={active === c ? 'on' : undefined} onClick={() => { setConn(c); if (c === 'on') focusTcl(); }}>{c === 'on' ? 'On-grid' : 'Off-grid'}</button>)}
      </div>}
      <span className="hint">{none ? 'Both calculations are off: switch on-grid or off-grid on to size the supply and see the cost.'
        : calcOn && calcOff ? 'Both are calculated and compared in Results; Show picks the one you edit.'
        : `Only the ${active === 'on' ? 'on-grid' : 'off-grid'} scenario is calculated${active === 'on' ? ' (connected to the grid, DEWA Shams Dubai rules)' : ' (no grid: solar, battery and a backup genset)'}.`}</span>
    </div>
    <p className="em-summary hint" aria-live="polite">{D ? <>Demand <b>{fmt(R ? R.demandKWh : 0, 0)} kWh</b> a year · peak <b>{fmt(R ? R.peakKW : 0, 1)} kW</b>{R ? <> · solar {fmt(R.demandKWh > 0 ? (R.solarKWh + R.batteryKWh) / R.demandKWh * 100 : 0, 0)}% · grid {fmt(R.demandKWh > 0 ? R.gridKWh / R.demandKWh * 100 : 0, 0)}% · genset {fmt(R.demandKWh > 0 ? R.genKWh / R.demandKWh * 100 : 0, 0)}% · running cost <b>{aed(R.totalCost)}</b> a year</> : null}</> : 'No power demand yet: choose the project link and inputs.'}</p>
    {show(0) && <>
    <div className="btns pw-sample">
      <button className="btn sm" type="button" onClick={() => { const x = samplePower(store.state); setMany(x.settings, 'power.sample'); toast(`Loaded the sample example: ${x.panels} panels on the example’s ${fmt(x.roofM2, 0)} m² roof`); }}>Load sample example</button>
      <span className="hint">{sampleNote}</span>
    </div>

    <ProjectLinkBar mode={mode} snap={s.proj} onChange={setMode}
      here="the hourly analysis of the open project" independent="enter your own power demand"
      extra={mode !== 'independent' ? <>
        {seg(hourly, [['design', 'Design days', 'each month’s design day, with margins'], ['weather', 'Real weather year', 'the weather year loaded in Hourly analysis']], 'Hourly basis', setHourly)}
        {chk('other', 'Add lighting and equipment power from the rooms, on each room’s schedule')}
        {noRooms && <p className="hint">{mode === 'this' ? 'This project has no rooms yet: add rooms, link another project, or work independently.' : 'The linked project has no rooms.'}</p>}
      </> : null} />

    </>}
    {show(1) && <>
    <div className="hr-card pw-sched">
      <h3>Operating schedule <span className="muted">· split the week into schedules, each with its own days and working hours</span></h3>
      <div className="btns pw-splits"><span className="hint">Quick split:</span>{SPLITS.map(x => <button key={x.label} className="btn sm" type="button" onClick={() => putScheds(x.list())}>{x.label}</button>)}</div>
      {scheds.map((x, idx) => { const hp = HOUR_PRESETS.find(y => y.from === num(x.from) && y.to === num(x.to))?.id ?? 'custom', nd = (x.days || []).filter(Boolean).length;
        return <fieldset key={x.id} className="pw-op">
          <legend><span className="pw-op-n" style={{ background: `var(--s${(idx % 8) + 1})` }}>{idx + 1}</span>
            <input className="pw-op-name" aria-label={`Name of schedule ${idx + 1}`} value={x.name} onChange={e => upd(x.id, { name: e.target.value })} /></legend>
          <div className="pw-days" role="group" aria-label={`Days of ${x.name}`}>{DAY_NAMES.map((n, i) => { const o = owner(i, x.id);
            return <button key={n} type="button" className="btn sm" aria-pressed={!!x.days?.[i]} disabled={!!o} title={o ? `In ${o.name}` : undefined}
              onClick={() => { const dd = [...(x.days || [false, false, false, false, false, false, false])]; dd[i] = !dd[i]; upd(x.id, { days: dd }); }}>{n}</button>; })}</div>
          <div className="hr-filters">
            <label className="fld" htmlFor={`pw-op-h-${x.id}`}><span className="fl">Working hours</span><span className="in-u"><select id={`pw-op-h-${x.id}`} value={hp}
              onChange={e => { const y = HOUR_PRESETS.find(z => z.id === e.target.value); if (y) upd(x.id, { from: y.from, to: y.to }); }}>
              {HOUR_PRESETS.map(y => <option key={y.id} value={y.id}>{y.label}</option>)}<option value="custom">Custom hours</option></select></span></label>
            <label className="fld" htmlFor={`pw-op-f-${x.id}`}><span className="fl">From</span><span className="in-u"><NumInput id={`pw-op-f-${x.id}`} label={`${x.name} from hour`} min={0} step={1} value={x.from} onChange={v => upd(x.id, { from: v })} /><span className="u">h</span></span></label>
            <label className="fld" htmlFor={`pw-op-t-${x.id}`}><span className="fl">To</span><span className="in-u"><NumInput id={`pw-op-t-${x.id}`} label={`${x.name} to hour`} min={0} step={1} value={x.to} onChange={v => upd(x.id, { to: v })} /><span className="u">h</span></span></label>
            {mode === 'independent' && s.cMode !== 'profile' && <label className="fld" htmlFor={`pw-op-k-${x.id}`}><span className="fl">Demand while operating <span className="muted">· blank = {fmt(num(s.cKW), 0)} kW</span></span><span className="in-u"><NumInput id={`pw-op-k-${x.id}`} label={`${x.name} demand, kW`} min={0} step={1} value={x.kW ?? ''} onChange={v => upd(x.id, { kW: v })} /><span className="u">kW</span></span></label>}
          </div>
          <p className="hint">{nd} day{nd === 1 ? '' : 's'} × {fmt(spanOf(x.from, x.to), 0)} h = {fmt(nd * spanOf(x.from, x.to), 0)} h a week
            {scheds.length > 1 && <> <button className="btn sm" type="button" onClick={() => putScheds(scheds.filter(y => y.id !== x.id))}>Remove</button></>}</p>
        </fieldset>; })}
      <div className="btns">
        <button className="btn sm" type="button" disabled={scheds.length >= 7 || !cov.uncovered.length}
          onClick={() => putScheds([...scheds, { id: newId(), name: `Schedule ${scheds.length + 1}`, days: DAY_NAMES.map((_, i) => cov.uncovered.includes(i)), from: 8, to: 18 }])}>+ Add schedule{cov.uncovered.length ? ` (for ${cov.uncovered.map(i => DAY_NAMES[i]).join(', ')})` : ''}</button>
      </div>
      <div className="pw-week" aria-label="The week by schedule">{DAY_NAMES.map((n, i) => { const k = scheds.findIndex(x => x.days?.[i]), x = scheds[k];
        return <div key={n} className={'pw-wd' + (x ? '' : ' off')}><b>{n}</b><span style={x ? { borderColor: `var(--s${(k % 8) + 1})` } : undefined}>{x ? `${x.name} · ${hh(num(x.from))}:00–${hh(num(x.to) % 24)}:00` : 'Not operating'}</span></div>; })}</div>
      <p className="hint"><b>{fmt(opH, 0)} operating hours a year</b> ({fmt(opH / 8760 * 100, 0)}% of the year).
        {cov.uncovered.length ? <> <span className="pill req">{cov.uncovered.map(i => DAY_NAMES[i]).join(', ')} not in any schedule</span> {mode === 'independent' ? 'those days run at the base load' : 'those days count as outside operating hours'}.</> : <> <span className="pill ok">✓ Every day of the week is covered, no overlaps</span></>}
        {' '}Hours run from the start to the end hour; 16 to 8 runs overnight, the same start and end means 24 hours.</p>
      {mode !== 'independent' ? <div className="hr-filters">
        <label className="pw-chk"><input type="checkbox" checked={s.opApply} onChange={e => set('opApply', e.target.checked)} /> Apply these schedules to the project’s power demand</label>
        {s.opApply && nf('opStandby', 'Outside operating hours, plant runs at', '% of demand', 5, 'Standby share')}
      </div> : <p className="hint">Your demand runs during each schedule’s hours and drops to the base load outside them.</p>}
    </div>

    </>}
    {show(2) && <>
    <EnergyWeather wref={ref} wx={wx} state={wxState} own={!!s.wxRef} elev={num(p.elev)}
      site={{ lat: site[0], lon: site[1], label: ref?.label || 'Project site' }}
      onLoaded={r => { setMany(mode === 'independent' ? { wxRef: r, indWx: true } : mode === 'project' ? { wxRef: r, projBasis: 'weather' } : { wxRef: r, basis: 'weather', projBasis: 'weather' }, 'power.wx'); }}
      onClear={p.weather || (mode === 'project' && s.proj?.state.project.weather) ? () => set('wxRef', null) : undefined}
      extra={mode === 'independent'
        ? <label className="pw-chk"><input type="checkbox" checked={s.indWx} onChange={e => set('indWx', e.target.checked)} /> Use the real weather year for the solar and the calendar (otherwise a typical clear-sky year)</label>
        : hourly !== 'weather' && wx ? <p className="hint">The demand uses the design days. <button className="btn sm" type="button" onClick={() => setHourly('weather')}>Run the hourly analysis on this weather year</button></p> : null} />

    </>}
    {show(3) && <>
    <div className="hr-card">
      <h3>Power demand {mode === 'independent' ? <span className="muted">· your own values</span> : <span className="muted">· from the {mode === 'project' ? 'linked project' : 'hourly analysis'}, with your customised values</span>}</h3>
      {mode === 'independent' && <>
        {seg(s.cMode, [['hours', 'By the operating schedule', 'one kW during operating hours, a base load otherwise'], ['profile', '24-hour profile', 'a kW value for every hour of operating days']], 'Custom demand', v => set('cMode', v))}
        <div className="hr-filters">
          {!profile && nf('cKW', 'Demand during operating hours', 'kW', 1)}
          {nf('cBase', profile ? 'Demand on non-operating days' : 'Demand outside operating hours (base load)', 'kW', 1)}
        </div>
        {profile && <div className="tbl-wrap"><table className="hr-tbl pw-prof"><thead><tr><th>Hour</th>{prof.map((_, h) => <th key={h}>{h + 1}</th>)}</tr></thead>
          <tbody><tr><td>kW</td>{prof.map((v, h) => <td key={h}><NumInput id={`pw-prof-${h}`} label={`Demand hour ${h + 1}, kW`} min={0} step={1} value={v} onChange={x => { const a = [...prof]; a[h] = x; set('cProfile', a); }} /></td>)}</tr></tbody></table></div>}
      </>}
      {(() => {
        /* additional power requirement: hidden until opened; the summary shows what is applied */
        const parts = !s.extraOn ? [] : [
          !blank(s.cop) && num(s.cop) > 0 ? `COP ${fmt(num(s.cop), 2)}` : '', !blank(s.aux) ? `fans and pumps ${fmt(num(s.aux), 2)} kW/TR` : '',
          !blank(s.scale) && num(s.scale) !== 100 ? `× ${fmt(num(s.scale), 0)}%` : '',
          num(s.addKW) ? `+ ${fmt(num(s.addKW), 1)} kW ${hh(num(s.addFrom))}–${hh(num(s.addTo) % 24)}` : '',
        ].filter(Boolean);
        return <div className={'pw-extra' + (s.extraOn ? ' on' : '')}>
          <label className="pw-switch"><input id="pw-extraOn" type="checkbox" role="switch" checked={s.extraOn} onChange={e => set('extraOn', e.target.checked)} /><span className="pw-knob" aria-hidden="true" />
            <span><b>Additional power demand</b> <span className="muted">· {s.extraOn ? (parts.length ? parts.join(' · ') : 'on: enter the extra load, a multiplier or your own cooling efficiency') : 'off: lifts, pumps, EV chargers, process loads, a demand multiplier or your own cooling efficiency'}</span></span></label>
          {s.extraOn && <div className="body">
            <div className="hr-filters">
        {mode !== 'independent' && <>{nf('cop', <>Cooling COP at 35 °C<span className="muted"> · blank = project’s</span></>, 'W/W', 0.1, 'Custom COP')}{nf('aux', <>Fans and pumps<span className="muted"> · blank = project’s</span></>, 'kW/TR', 0.05, 'Custom auxiliary allowance')}</>}
        {nf('scale', 'Demand multiplier', '%', 5)}
        {nf('addKW', 'Additional load', 'kW', 1, 'Extra load')}{nf('addFrom', 'From', 'h', 1, 'Extra load from')}{nf('addTo', 'To', 'h', 1, 'Extra load to')}
      </div>
            <p className="hint">{mode === 'independent' ? 'Days and hours come from the operating schedule above.' : 'Demand is the cooling plant’s electrical input from the efficiency and auxiliary allowance in Heat load summary, unless you enter your own above.'} The multiplier and extra load (lifts, pumps, EV chargers, process loads) apply to every hour.</p>
          </div>}
        </div>;
      })()}
      {D ? <DemandPreview D={D} s={s} linked={mode !== 'independent'} /> : <p className="wx-status error" role="status">{
        mode === 'independent' ? 'Enter the demand above to see it.'
        : needWx && !ref ? 'No power demand yet: load a weather year in Real weather below, or choose Design days.'
        : needWx && wxState === 'loading' ? 'Loading the weather year…'
        : needWx && wxState === 'missing' ? 'No power demand yet: the weather year is not stored in this browser; download it again in Real weather.'
        : noRooms ? 'No power demand yet: the project has no rooms. Load the sample example, link another project, or work independently.'
        : 'No power demand yet: complete the rooms and design conditions, or load the sample example.'}</p>}
    </div>

    </>}
    {show(4) && <>
    <div className="hr-card">
      <h3>Power supply split</h3>
      {none && <p className="wx-status error" role="status">The on-grid and off-grid calculations are both off. Switch one on at the top to size the supply.</p>}
      {seg(active, [['on', 'On-grid', 'connected to the grid, DEWA Shams Dubai rules'], ['off', 'Off-grid', 'no grid: solar, battery and a backup genset']], 'Connection', v => { setConn(v); if (v === 'on') setTimeout(() => (document.getElementById('pw-tcl') as HTMLInputElement | null)?.focus(), 0); })}
      {!off && <OnGridStart s={s} R={R} eff={{ panels: num(effPanels), invKW: num(effInv) }} nf={nf} set={set} setMany={setMany} />}
      {needTcl ? <p className="wx-status error pw-tclgate" role="status">Enter the plot’s TCL above first: DEWA caps the solar you can connect on it, and the panels, inverter, battery, grid and genset follow from that. <button className="btn sm" type="button" onClick={() => set('utility', 'none')}>Not on DEWA: continue without the limit</button></p> : <>
      <p className="hint">On-grid and off-grid are calculated separately, each with its own solar, battery and genset: you are editing the <b>{active === 'off' ? 'off-grid' : 'on-grid'}</b> scenario.{both?.[active === 'off' ? 'on' : 'off'] ? <> Other scenario: {active === 'off' ? 'on-grid' : 'off-grid'} {fmt(both[active === 'off' ? 'on' : 'off']!.R.kWp, 1)} kWp, {aed(both[active === 'off' ? 'on' : 'off']!.R.totalCost)} a year. Compare them in Results.</> : <> The {active === 'off' ? 'on-grid' : 'off-grid'} calculation is off; switch it on at the top to compare.</>}</p>
      {!off && seg(s.split, [['capacity', 'Hour by hour, by equipment', 'solar → battery → grid → genset'], ['share', 'Fixed shares', 'a % of every hour to each source']], 'How the supply is split', v => set('split', v))}
      {off && og && <OffGrid og={og} R={R} s={s} panelW={num(s.panelW)} nf={nf} set={set}
        onUsePV={() => { const n = Math.ceil(og.kWp * 1000 / Math.max(1, num(s.panelW))); setMany({ panels: n, roof: { ...(s.roof || {}), auto: false } }, 'power.og'); toast(`Solar set to ${n} panels (${fmt(n * num(s.panelW) / 1000, 1)} kWp)`); }} />}
      {share ? <>
        {seg(s.shareUnit, [['pct', '% of demand', 'a share of every hour'], ['kw', 'kW of TCL', 'kW of the Total Connected Load']], 'Split by', v => set('shareUnit', v))}
        <div className="hr-filters">

          {s.shareUnit === 'kw' ? <>{nf('gridKWs', 'Grid', 'kW', 1, 'Grid kW of TCL')}{nf('solarKWs', 'Solar', 'kW', 1, 'Solar kW of TCL')}</>
            : <>{nf('gridPct', 'Grid share', '%')}{nf('solarPct', 'Solar share', '%')}</>}
          <label className="fld"><span className="fl">Genset (the rest)</span><span className="in-u"><input readOnly aria-label="Genset share" value={R?.shares ? (s.shareUnit === 'kw' ? fmt(R.shares.gen.kW, 1) : fmt(R.shares.gen.pct, 0)) : ''} /><span className="u">{s.shareUnit === 'kw' ? 'kW' : '%'}</span></span></label>
        </div>
        {R?.shares && <>
          <table className="hr-tbl pw-shares"><thead><tr><th>Source</th><th>kW of TCL</th><th>Share</th></tr></thead>
            <tbody>{(['grid', 'solar', 'gen'] as const).map(k => <tr key={k}><td>{k === 'grid' ? 'Grid' : k === 'solar' ? 'Solar' : 'Genset'}</td><td>{fmt(R.shares![k].kW, 1)}</td><td>{fmt(R.shares![k].pct, 1)}%</td></tr>)}
              <tr className="pw-total"><td>TCL{R.shares.tclEstimated ? ' (peak demand)' : ''}</td><td>{fmt(R.shares.tcl, 1)}</td><td>100%</td></tr></tbody></table>
          {R.shares.over && <p className="wx-status error" role="status">Grid and solar add up to more than {s.shareUnit === 'kw' ? `the TCL of ${fmt(R.shares.tcl, 1)} kW` : '100%'}: solar is kept, the grid is cut to the rest.</p>}
        </>}
        <p className="hint">Each hour’s demand is divided in these shares. To size real equipment hour by hour, with a battery, choose Hour by hour, by equipment.</p>
      </> : <>
        <h4 className="hr-sub">Solar PV</h4>
        <details className="hr-req-box" open={!!roof.poly.length || undefined}><summary>Roof layout from the building address <span className="muted">· {L ? `${L.count} panels, ${fmt(L.kWp, 2)} kWp on ${fmt(L.roofM2, 0)} m²` : 'find the building, outline the roof, panels are counted'}</span></summary>
          <div className="body"><RoofLayout roof={s.roof} site={site} onChange={setRoof} onGoogle={useGoogle} /></div></details>
        <div className="hr-filters">
          {tclMode ? <label className="fld" htmlFor="pw-panels"><span className="fl">Number of panels <span className="muted">· DEWA maximum for the TCL</span></span><span className="in-u"><input id="pw-panels" readOnly aria-label="Number of panels" value={String(num(effPanels))} /><span className="u">nos</span></span></label>
            : nf('panels', <>Number of panels{fromRoof ? <span className="muted"> · from the roof layout</span> : null}</>, 'nos', 1, 'Number of panels', fromRoof)}
          {off && nf('panelW', 'Panel rating (DC)', 'Wp', 5, 'Panel rating', fromRoof)}
          {nf('tilt', 'Tilt', '°', 1, 'Panel tilt', fromRoof)}
          {nf('az', <>Facing<span className="muted"> · 180 = south</span></>, '° from N', 5, 'Panel azimuth', fromRoof)}
        </div>
        <h4 className="hr-sub">DC to AC conversion</h4>
        <div className="hr-filters">
          {nf('pr', <>DC performance ratio<span className="muted"> · heat, dust, mismatch, DC cables</span></>, '–', 0.01, 'DC performance ratio')}
          {off && nf('dcac', <>DC/AC ratio<span className="muted"> · for the suggested inverter</span></>, '–', 0.05, 'DC/AC ratio')}
          {nf('invEff', 'Inverter efficiency (DC → AC)', '%', 0.5)}
          <label className="fld" htmlFor="pw-invsel"><span className="fl">Inverter</span><span className="in-u"><select id="pw-invsel"
            value={blank(s.invKW) ? 'auto' : INVERTERS.includes(num(s.invKW)) ? String(num(s.invKW)) : 'custom'}
            onChange={e => { const v = e.target.value; if (v === 'auto') set('invKW', ''); else if (v !== 'custom') set('invKW', Number(v)); }}>
            <option value="auto">Suggested{R && R.kWp > 0 ? `: ${fmt(R.invSuggested, 0)} kW` : ''}</option>
            {INVERTERS.map(x => <option key={x} value={x}>{x} kW AC{R && x === R.invSuggested ? ' (suggested)' : ''}</option>)}
            <option value="custom">Custom rating</option></select></span></label>
          {nf('invKW', <>Inverter AC rating{R && R.kWp > 0 ? <span className="muted"> · blank = suggested {fmt(R.invSuggested, 0)} kW</span> : null}</>, 'kW AC', 1, 'Inverter rating')}
          {(() => {
            /* battery selection: suggested, a standard capacity, or custom; on-grid can have none */
            const batOn = off || s.bat, sug = off ? (og?.batKWh ?? 0) : batSug;
            const v = !batOn ? 'none' : blank(s.batKWh) ? 'auto' : BATTERIES.includes(num(s.batKWh)) ? String(num(s.batKWh)) : 'custom';
            return <label className="fld" htmlFor="pw-batsel"><span className="fl">Battery</span><span className="in-u"><select id="pw-batsel" value={v}
              onChange={e => { const x = e.target.value; if (x === 'none') setMany({ bat: false }, 'power.batsel'); else if (x === 'auto') setMany({ bat: true, batKWh: '' }, 'power.batsel'); else if (x !== 'custom') setMany({ bat: true, batKWh: Number(x) }, 'power.batsel'); else setMany({ bat: true, batKWh: R?.batKWh || sug || 10 }, 'power.batsel'); }}>
              {!off && <option value="none">No battery</option>}
              <option value="auto">Suggested{sug > 0 ? `: ${fmt(sug, 0)} kWh` : ''}</option>
              {BATTERIES.map(b => <option key={b} value={b}>{fmt(b, b % 1 ? 1 : 0)} kWh{Math.abs(b - sug) < 1e-9 ? ' (suggested)' : ''}</option>)}
              <option value="custom">Custom capacity</option></select></span></label>;
          })()}
        </div>
        <p className="hint">Array <b>{fmt(kWp, 2)} kWp DC</b> ({fmt(num(s.panels), 0)} × {fmt(num(s.panelW), 0)} Wp){R && kWp > 0 ? <> → inverter <b>{fmt(R.invKW, 0)} kW AC</b>, DC/AC as built <b>{fmt(R.dcac, 2)}</b>. AC output = DC × {fmt(num(s.invEff), 1)}%, capped at {fmt(R.invKW, 0)} kW.</> : null}
          {' '}DC/AC 1.1–1.3 is usual: panels seldom reach their rating in UAE heat, so a smaller inverter loses little to clipping.
          {R && (off || s.bat) ? <> Battery <b>{fmt(R.batKWh, 0)} kWh</b> ({fmt(R.batKWh * num(s.dod) / 100, 1)} kWh usable at {fmt(num(s.dod), 0)}% depth of discharge), <b>{fmt(R.batKW, 0)} kW</b>{blank(s.batKWh) ? ', suggested' : ''}; capacity, power and efficiency are under {off ? 'Off-grid sizing' : 'Battery'} below.</> : !off ? ' No battery.' : null}</p>

        {!off && <><h4 className="hr-sub">Utility limit on PV size</h4>
        <div className="hr-filters">
          <label className="fld" htmlFor="pw-utility"><span className="fl">Connection rules</span><span className="in-u"><select id="pw-utility" value={s0.utility} onChange={e => set('utility', e.target.value)}>
            <option value="">On-grid: DEWA Shams Dubai (default)</option><option value="dewa">DEWA Shams Dubai</option><option value="none">None (another utility, checked separately)</option></select></span></label>

        </div>
        {s.utility === 'dewa' && R?.dewa && <DewaCheck R={R} s={s} onFit={() => setMany({ invKW: '', ...(num(s.panels) > R.dewa!.maxPanels ? { panels: R.dewa!.maxPanels, roof: { ...(s.roof || {}), auto: false } } : {}) }, 'power.dewa')} />}
        </>}

        {!off && <><h4 className="hr-sub">Battery</h4>
        {chk('bat', 'Add battery storage (charged from surplus solar)')}</>}
        {s.bat && !off && <>
          <div className="hr-filters">
            {nf('batKWh', <>Capacity<span className="muted"> · blank = suggested {fmt(batSug, 0)} kWh</span></>, 'kWh', 5, 'Battery capacity')}
            {nf('batKW', <>Power<span className="muted"> · blank = 0.5 C</span></>, 'kW', 1, 'Battery power')}
            {nf('dod', 'Depth of discharge', '%')}
            {nf('rte', 'Round-trip efficiency (AC to AC)', '%')}
            <label className="fld" htmlFor="pw-batUse"><span className="fl">Battery replaces first</span><span className="in-u"><select id="pw-batUse" value={s.batUse} onChange={e => set('batUse', e.target.value)}>
              <option value="self">Grid (self-consumption)</option><option value="backup">Genset (backup when grid is short)</option></select></span></label>
          </div>
          <p className="hint">{kWp <= 0 ? 'Add solar panels: the battery charges only from surplus solar.' : <>Suggested capacity stores the average day’s surplus solar, capped at the average day’s demand after sunset that it can replace.{R && R.batKWh > 0 ? <> Using <b>{fmt(R.batKWh, 0)} kWh / {fmt(R.batKW, 0)} kW</b>, {fmt(R.batCycles, 0)} full cycles a year.</> : null}</>}</p>
        </>}

        {R && <RemainingLoad R={R} s={s} off={off} nf={nf} chk={chk} set={set} />}
      </>}

      <h4 className="hr-sub">{off ? 'Backup genset' : 'Genset'}</h4>
      {off && <label className="pw-chk"><input type="checkbox" checked={s.offGen} onChange={e => set('offGen', e.target.checked)} /> Fit a backup genset for what solar and the battery cannot meet</label>}
      {(!off || s.offGen) && <div className="hr-filters">
        <label className="fld" htmlFor="pw-genBasis"><span className="fl">Recommended size based on</span><span className="in-u"><select id="pw-genBasis" value={s.genBasis} onChange={e => set('genBasis', e.target.value)}>
          <option value="peakday">Peak load day of the building (full backup)</option><option value="supplied">What the genset supplies</option></select></span></label>
        {nf('genMargin', 'Safety margin', '%', 5)}
        {nf('pf', 'Power factor', '–', 0.05)}
        {nf('genKVA', <>Rating<span className="muted">{R && R.genSuggested > 0 ? ` · blank = recommended ${fmt(R.genSuggested, 0)} kVA` : ' · blank = recommended'}</span></>, 'kVA', 5, 'Genset rating')}
      </div>}
      {R && (!off || s.offGen) && R.genBasisKW > 0 && (() => { const w = when(R.year, R.genBasisAt), pf = Math.max(0.1, Math.min(1, num(s.pf) || 0.8)), raw = R.genBasisKW * (1 + R.genMargin / 100) / pf;
        return <div className="pw-genrec"><span className="pill ok">Recommended genset</span> <b>{fmt(R.genSuggested, 0)} kVA</b> ({fmt(R.genSuggested * pf, 0)} kW at PF {fmt(pf, 2)}):
          {' '}{s.genBasis === 'supplied' ? 'largest hour the genset supplies' : 'peak load on the peak load day'} {fmt(R.genBasisKW, 2)} kW on {w.d} {MONTHS[w.m]} at {hh(w.h)}
          {' '}× (1 + {fmt(R.genMargin, 0)}% safety margin) ÷ {fmt(pf, 2)} = {fmt(raw, 1)} kVA → next standard size {fmt(R.genSuggested, 0)} kVA.
          {!blank(s.genKVA) && Math.abs(num(s.genKVA) - R.genSuggested) > 1e-9 ? <> Your rating: {fmt(num(s.genKVA), 0)} kVA{num(s.genKVA) < R.genSuggested ? ' (below the recommendation)' : ''}. <button className="btn sm" type="button" onClick={() => set('genKVA', '')}>Use the recommendation</button></> : null}</div>; })()}
      {R && (!off || s.offGen) && <p className="hint">{R.genKVA > 0 ? <>Genset <b>{fmt(R.genKVA, 0)} kVA × {fmt(num(s.pf), 2)} = {fmt(R.genKW, 0)} kW</b>; it supplies up to {fmt(R.genPeakKW, 1)} kW ({fmt(R.genKW > 0 ? R.genPeakKW / R.genKW * 100 : 0, 0)}% loading). </> : 'No genset runs: solar, battery and grid meet every hour.'}
        {' '}Fuel: {FUEL_A} L/h per kW rated + {FUEL_B} L/h per kW output while running.</p>}
      </>}
    </div>

    </>}
    {show(5) && <>
    <div className="hr-card">
      <h3>Costs and emissions <span className="muted">· selling prices, from your price book unless this project sets its own</span></h3>
      <h4 className="hr-sub">Running costs</h4>
      <div className="hr-filters">
        {!off && <label className="fld" htmlFor="pw-tariff"><span className="fl">Grid tariff</span><span className="in-u"><select id="pw-tariff" value={s.tariff} onChange={e => set('tariff', e.target.value)}>
          <option value="dewa">DEWA slab tariff with net metering</option><option value="flat">Flat rate per kWh</option></select></span></label>}
        {!off && s.tariff !== 'flat' && <><label className="fld" htmlFor="pw-dewaCat"><span className="fl">DEWA account</span><span className="in-u"><select id="pw-dewaCat" value={s.dewaCat} onChange={e => set('dewaCat', e.target.value)}>
            <option value="res">Residential</option><option value="com">Commercial</option><option value="ind">Industrial</option></select></span></label>
          {nf('fuelSur', 'Fuel surcharge', 'AED/kWh', 0.005)}
          <label className="pw-chk" style={{ alignSelf: 'end' }}><input type="checkbox" checked={s.vat} onChange={e => set('vat', e.target.checked)} /> 5% VAT</label></>}
        {(off || s.tariff === 'flat') && nf('tGrid', <>Grid tariff{own('tGrid')}</>, 'AED/kWh', 0.01, 'Grid tariff')}
        {nf('tSolar', <>Solar<span className="muted"> · PPA rate or O&M, 0 if owned</span></>, 'AED/kWh', 0.01, 'Solar cost per kWh')}
        {s.export && !share && nf('tExport', 'Export credit', 'AED/kWh', 0.01)}
        {nf('diesel', <>Diesel price{own('diesel')}</>, 'AED/L', 0.05, 'Diesel price')}
        {nf('genOM', 'Genset maintenance', 'AED/kWh', 0.01)}
        {nf('efGrid', 'Grid emission factor', 'kg CO₂/kWh', 0.01)}
      </div>
      <h4 className="hr-sub">Capital costs <span className="muted">· selling prices</span></h4>
      <div className="hr-filters">
        {nf('cPV', <>Solar PV, installed{own('cPV')}</>, 'AED/Wp', 0.1, 'Solar PV, installed')}
        {nf('cInv', <>Inverter{own('cInv')}</>, 'AED/kW', 10, 'Inverter')}
        {nf('cBat', <>Battery{own('cBat')}</>, 'AED/kWh', 50, 'Battery')}
        {nf('cGen', <>Genset{own('cGen')}</>, 'AED/kVA', 10, 'Genset')}
      </div>
      <PriceBookCard book={book} setBook={setBook} s={s} projectCosts={p.power || {}}
        onUseBook={() => store.update(st => { const o = { ...(st.project.power || {}) } as Record<string, unknown>; for (const k of COST_KEYS) delete o[k]; st.project.power = o as PowerSettings; }, 'power.book')}
        onDiesel={v => set('diesel', v)} />
    </div>

    </>}
    {show(6) && <>
    {none && D && <p className="wx-status error" role="status">The on-grid and off-grid calculations are both off. Switch one on at the top of Energy modelling to size the supply and see the results.</p>}
    {D && R && both ? <>{both.on && both.off && <ScenarioCompare both={{ on: both.on, off: both.off }} active={active} onPick={setConn} />}{R.dewaBill && <DewaBillCard B={R.dewaBill} s={s} R={R} pb={pb} />}<WorkedExample D={D} R={R} s={s} pb={pb} /><PowerResults D={D} R={R} s={s} pb={pb} name={p.name} /></> : null}
    </>}
    {!all && <div className="em-nav btns">
      {step > 0 && <button className="btn" type="button" onClick={() => goStep(step - 1)}>Previous</button>}
      {step < EM_STEPS.length - 1 && <button className="btn primary" type="button" onClick={() => goStep(step + 1)}>Continue: {EM_STEPS[step + 1].title}</button>}
    </div>}
  </section>;
}

const EM_STEPS = [
  { title: 'Project link', description: 'Work on this project, a linked NOVAC project or independently; or load the sample example.' },
  { title: 'Operating schedule', description: 'Split the week into schedules with their days and working hours.' },
  { title: 'Real weather', description: 'Load an hourly weather year for the solar and the heat balance.' },
  { title: 'Power demand', description: 'The hourly electrical demand, with your customised values.' },
  { title: 'Power supply', description: 'Split the supply between solar with battery, the grid and a genset; size them and check the DEWA limit.' },
  { title: 'Costs', description: 'Tariffs, fuel and capital costs, and the grid emission factor.' },
  { title: 'Results', description: 'Energy, load on each source, cost, payback and CO₂, with the worked example.' },
];
/* the energy modelling step bar, styled like the heat load calculation's */
function EmStepper({ steps, step, all, status, onStep, onAll }: { steps: typeof EM_STEPS; step: number; all: boolean; status: string[]; onStep: (i: number) => void; onAll: (v: boolean) => void }) {
  return <nav className="em-steps" aria-label="Energy modelling steps">
    <div className="em-stepper">{steps.map((x, i) => <button key={x.title} type="button" className={'em-step' + (i < step && !all ? ' is-done' : '')} data-em={i}
      aria-current={!all && i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${x.title}${status[i] ? '. ' + status[i] : ''}`} onClick={() => onStep(i)}>
      <span className="em-marker" aria-hidden="true">{i + 1}</span>
      <span className="em-label"><span className="em-title">{x.title}</span>{status[i] && <span className="em-status">{status[i]}</span>}</span>
    </button>)}</div>
    <p className="workflow-caption"><b>{all ? 'All steps' : `Step ${step + 1} of ${steps.length}`}</b><span aria-hidden="true">·</span>{all ? 'Every step of the energy model on one page.' : steps[step].description}
      <button className="btn sm em-all" type="button" aria-pressed={all} onClick={() => onAll(!all)}>{all ? 'Show one step at a time' : 'Show all steps on one page'}</button></p>
  </nav>;
}

/* the power demand as entered or calculated: totals, an interactive chart (a day, a week or the year) and each month */
type DView = 'day' | 'week' | 'year';
function DemandPreview({ D, s, linked }: { D: NonNullable<ReturnType<typeof demand>>; s: S; linked: boolean }) {
  const days = D.n / 24;
  const B = useMemo(() => scheduleBreakdown(D, s), [D, s.opScheds, s.opDays, s.opFrom, s.opTo]);
  const scs = schedulesOf(s), applies = !linked || s.opApply;
  /* each hour's colour: its schedule's while operating, muted outside */
  const colorAt = (i: number) => { const x = operatingAt(s, D.year, i, scs); return x ? `var(--s${(scs.indexOf(x) % 8) + 1})` : 'var(--bar-2)'; };
  let tot = 0, pk = 0; for (let i = 0; i < D.n; i++) { tot += D.kW[i]; if (D.kW[i] > D.kW[pk]) pk = i; }
  const avg = tot / D.n, pw = when(D.year, pk);
  /* each month: energy, hours, peak and when, lowest hour, working-day and weekend energy */
  const months = MONTHS.map(() => ({ kWh: 0, hours: 0, peak: 0, at: 0, min: Infinity, minAt: 0, maxDay: 0 }));
  for (let i = 0; i < D.n; i++) {
    const m = months[when(D.year, i).m], v = D.kW[i];
    m.kWh += v; m.hours++;
    if (v > m.peak) { m.peak = v; m.at = i; }
    if (v < m.min) { m.min = v; m.minAt = i; }
  }
  const daily = Array.from({ length: days }, (_, k) => { let e = 0, p = 0; for (let h = 0; h < 24; h++) { const v = D.kW[k * 24 + h]; e += v; p = Math.max(p, v); } return { e, p }; });
  daily.forEach((x, kk) => { const m = months[when(D.year, kk * 24).m]; m.maxDay = Math.max(m.maxDay, x.e); });

  const [view, setView] = useState<DView>('day');
  const [day, setDay] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const k = Math.max(0, Math.min(days - 1, day ?? Math.floor(pk / 24)));
  const go = (x: number) => { setDay(Math.max(0, Math.min(days - 1, x))); setHover(null); };
  const dateOf = (kk: number) => { const w = when(D.year, kk * 24); return `${w.d} ${MONTHS[w.m]}`; };
  const iso = (kk: number) => { const w = when(D.year, kk * 24); return `${D.year}-${String(w.m + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`; };
  const selM = when(D.year, k * 24).m;

  /* the series drawn: 24 hours, 7 × 24 hours from the selected day, or every day of the year (daily kWh) */
  const wk0 = Math.min(k, days - 7);
  const series = view === 'day' ? Array.from({ length: 24 }, (_, h) => D.kW[k * 24 + h])
    : view === 'week' ? Array.from({ length: 168 }, (_, h) => D.kW[wk0 * 24 + h]) : daily.map(x => x.e);
  const unit = view === 'year' ? 'kWh' : 'kW';
  const label = (i: number) => view === 'day' ? `${dateOf(k)}, ${hh(i + 1)}` : view === 'week' ? `${dateOf(wk0 + Math.floor(i / 24))}, ${hh(i % 24 + 1)}` : dateOf(i);
  const W = 760, Ht = 190, ml = 48, mr = 8, mt = 14, mb = 24, ph = Ht - mt - mb, bw = (W - ml - mr) / series.length;
  const top = Math.max(0.001, ...series), step = (() => { const raw = top / 3, p = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
  const yMax = Math.ceil(top / step) * step || step, y = (v: number) => mt + ph - v / yMax * ph;
  const ticks: number[] = []; for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  let sp = 0; series.forEach((v, i) => { if (v > series[sp]) sp = i; });
  const sel = view === 'year' ? k : null;
  const hv = hover ?? (view === 'year' ? k : sp);
  const sum = view === 'day' ? series.reduce((a, x) => a + x, 0) : view === 'week' ? series.reduce((a, x) => a + x, 0) : tot;
  const mMax = Math.max(0.001, ...months.map(m => m.kWh));
  const pickAt = (e: React.MouseEvent<SVGRectElement> | React.PointerEvent<SVGRectElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(series.length - 1, Math.floor((e.clientX - r.left) / r.width * series.length))); };

  return <div className="pw-demand" aria-live="polite">
    <div className="totals hr-kpis">
      <div className="tot key"><div className="k">Annual power demand</div><div className="v">{fmt(tot, 0)}<small>kWh</small></div><div className="s">{D.label}</div></div>
      <div className="tot"><div className="k">Peak demand</div><div className="v">{fmt(D.kW[pk], 2)}<small>kW</small></div><div className="s">{pw.d} {MONTHS[pw.m]} at {hh(pw.h)} <button className="btn sm pw-link" type="button" onClick={() => { setView('day'); go(Math.floor(pk / 24)); }}>Show</button></div></div>
      <div className="tot"><div className="k">Average demand</div><div className="v">{fmt(avg, 2)}<small>kW</small></div><div className="s">{fmt(tot / days, 0)} kWh a day</div></div>
      <div className="tot"><div className="k">Load factor</div><div className="v">{fmt(D.kW[pk] > 0 ? avg / D.kW[pk] * 100 : 0, 0)}<small>%</small></div><div className="s">average ÷ peak</div></div>
    </div>

    <div className="pw-chart-bar">
      <div className="seg pw-view" role="group" aria-label="Chart period" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {([['day', 'Day'], ['week', 'Week'], ['year', 'Year']] as [DView, string][]).map(([v, t]) => <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); setHover(null); }}>{t}</button>)}
      </div>
      <div className="btns pw-nav">
        <button className="btn sm" type="button" aria-label="Previous" disabled={k <= 0} onClick={() => go(k - (view === 'week' ? 7 : 1))}>◀</button>
        <input type="date" aria-label="Day shown" value={iso(k)} min={`${D.year}-01-01`} max={`${D.year}-12-31`}
          onChange={e => { const t = Date.parse(e.target.value + 'T00:00Z'); if (Number.isFinite(t)) go(Math.round((t - Date.UTC(D.year, 0, 1)) / 86400000)); }} />
        <button className="btn sm" type="button" aria-label="Next" disabled={k >= days - 1} onClick={() => go(k + (view === 'week' ? 7 : 1))}>▶</button>
        <button className="btn sm" type="button" onClick={() => go(Math.floor(pk / 24))}>Peak day</button>
      </div>
    </div>
    <p className="hint pw-read">{hover != null || view !== 'year'
      ? <><b>{label(hv)}</b>: {fmt(series[hv], 2)} {unit}{view === 'year' ? ` · peak ${fmt(daily[hv].p, 2)} kW` : ''}</>
      : <>Hover or tap a bar; click a day to open it.</>}
      <span className="muted"> · {view === 'day' ? `${dateOf(k)}: ${fmt(sum, 0)} kWh, peak ${fmt(series[sp], 2)} kW at ${hh(sp + 1)}` : view === 'week' ? `${dateOf(wk0)} to ${dateOf(wk0 + 6)}: ${fmt(sum, 0)} kWh` : `${D.year}: ${fmt(tot, 0)} kWh, highest day ${dateOf(sp)} ${fmt(series[sp], 0)} kWh`}</span></p>
    <div className="hr-plot">
      <svg className="pw-dchart" viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label={`Power demand, ${view}, ${unit}. Highest ${fmt(series[sp], 1)} ${unit}.`} onMouseLeave={() => setHover(null)}>
        {ticks.map(t => <g key={t}><line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className={t === 0 ? 'hr-zero' : 'hr-grid'} /><text x={ml - 6} y={y(t) + 3.5} textAnchor="end" className="hr-tick">{fmt(t, step < 1 ? 1 : 0)}</text></g>)}
        {view === 'week' && Array.from({ length: 6 }, (_, j) => <line key={'d' + j} x1={ml + (j + 1) * 24 * bw} x2={ml + (j + 1) * 24 * bw} y1={mt} y2={mt + ph} className="hr-grid" />)}
        {series.map((v, i) => <rect key={i} x={ml + i * bw + (bw > 6 ? 1.5 : 0)} width={Math.max(0.6, bw - (bw > 6 ? 3 : 0.3))} y={y(v)} height={Math.max(0, y(0) - y(v))} rx={bw > 6 ? 2 : 0}
          className={'pw-bar-r' + (i === hover ? ' hv' : '') + (i === sp && view === 'year' ? ' pk' : '') + (i === sel ? ' sel' : '')}
          style={view !== 'year' && applies ? { fill: i === hover ? undefined : colorAt(view === 'day' ? k * 24 + i : wk0 * 24 + i) } : undefined} />)}
        {view === 'day' && series.map((_, h) => (h + 1) % 3 === 0 ? <text key={'t' + h} x={ml + h * bw + bw / 2} y={Ht - 8} textAnchor="middle" className="hr-tick">{h + 1}</text> : null)}
        {view === 'week' && Array.from({ length: 7 }, (_, j) => <text key={'w' + j} x={ml + (j + 0.5) * 24 * bw} y={Ht - 8} textAnchor="middle" className="hr-tick">{dateOf(wk0 + j)}</text>)}
        {view === 'year' && MONTHS.map((m, i) => { const d0 = (Date.UTC(D.year, i, 1) - Date.UTC(D.year, 0, 1)) / 86400000; return <text key={m} x={ml + (d0 + 14) * bw} y={Ht - 8} textAnchor="middle" className="hr-tick">{m}</text>; })}
        <rect x={ml} y={mt} width={W - ml - mr} height={ph} fill="transparent" style={{ cursor: view === 'day' ? 'default' : 'pointer' }}
          onMouseMove={e => setHover(pickAt(e))} onPointerDown={e => setHover(pickAt(e))}
          onClick={e => { const i = pickAt(e); if (view === 'year') { setView('day'); go(i); } else if (view === 'week') { setView('day'); go(wk0 + Math.floor(i / 24)); } }} />
      </svg>
    </div>

    {view !== 'year' && applies && <ul className="hr-legend">{scs.map((x, j) => <li key={x.id}><i style={{ background: `var(--s${(j % 8) + 1})` }} />{x.name}, {hh(num(x.from))}:00–{hh(num(x.to) % 24)}:00</li>)}<li><i style={{ background: 'var(--bar-2)' }} />Outside the schedules</li></ul>}

    {(() => {
      /* the selected day, its week (Monday to Sunday, within the year) and its month: total and average load, with the year for comparison */
      const span = (d0: number, n: number) => { let e = 0, p = 0, at = d0 * 24; for (let i = d0 * 24; i < (d0 + n) * 24; i++) { const v = D.kW[i]; e += v; if (v > p) { p = v; at = i; } } return { e, avg: n > 0 ? e / (n * 24) : 0, p, at }; };
      /* the Monday-to-Sunday week of the selected day, cut to the days inside the year */
      const monday = k - ((new Date(Date.UTC(D.year, 0, 1 + k)).getUTCDay() + 6) % 7), mon = Math.max(0, monday), wkN = Math.min(days, monday + 7) - mon;
      const m0 = (Date.UTC(D.year, selM, 1) - Date.UTC(D.year, 0, 1)) / 86400000, mN = new Date(Date.UTC(D.year, selM + 1, 0)).getUTCDate();
      const sd = span(k, 1), sw = span(mon, wkN), sm = span(m0, mN), pAt = (i: number) => { const z = when(D.year, i); return `${z.d} ${MONTHS[z.m]} ${hh(z.h)}`; };
      const sch = applies ? operatingAt(s, D.year, sd.at, scs)?.name ?? 'outside the schedules' : '';
      return <>
        <h4 className="hr-sub">Daily, weekly and monthly requirements <span className="muted">· for the day selected in the chart ({dateOf(k)}), its week and its month · kWh{applies ? ', as per the operating schedule' : ''}</span></h4>
        <div className="totals hr-kpis pw-req">
          <div className="tot"><div className="k">Day · {dateOf(k)}</div><div className="v">{fmt(sd.e, 0)}<small>kWh total</small></div>
            <div className="s">average <b>{fmt(sd.avg, 2)} kW</b> · peak {fmt(sd.p, 2)} kW at {hh(sd.at % 24 + 1)}{sch ? `, ${sch}` : ''}</div>
            <div className="s muted">Year: average day {fmt(B.day.avg, 0)} kWh · peak day {fmt(B.day.peak, 0)} kWh on {dateOf(B.day.peakDay)} <button className="btn sm pw-link" type="button" onClick={() => { setView('day'); go(B.day.peakDay); }}>Show</button></div></div>
          <div className="tot"><div className="k">Week · {dateOf(mon)} to {dateOf(mon + wkN - 1)}</div><div className="v">{fmt(sw.e, 0)}<small>kWh total</small></div>
            <div className="s">average <b>{fmt(sw.avg, 2)} kW</b> · {fmt(sw.e / wkN, 0)} kWh a day · peak {fmt(sw.p, 2)} kW on {pAt(sw.at)}</div>
            <div className="s muted">Year: average week {fmt(B.week.avg, 0)} kWh · peak week {fmt(B.week.peak, 0)} kWh from {dateOf(B.week.peakFrom)} <button className="btn sm pw-link" type="button" onClick={() => { setView('week'); go(B.week.peakFrom); }}>Show</button></div></div>
          <div className="tot"><div className="k">Month · {MONTHS[selM]} {D.year}</div><div className="v">{fmt(sm.e, 0)}<small>kWh total</small></div>
            <div className="s">average <b>{fmt(sm.avg, 2)} kW</b> · {fmt(sm.e / mN, 0)} kWh a day · peak {fmt(sm.p, 2)} kW on {pAt(sm.at)}</div>
            <div className="s muted">Year: average month {fmt(B.month.avg, 0)} kWh · peak month {MONTHS[B.month.peakMonth]} {fmt(B.month.peak, 0)} kWh</div></div>
          <div className="tot"><div className="k">Year · {D.year}</div><div className="v">{fmt(tot, 0)}<small>kWh total</small></div>
            <div className="s">average <b>{fmt(avg, 2)} kW</b> · peak requirement <b>{fmt(D.kW[pk], 2)} kW</b> on {pw.d} {MONTHS[pw.m]} at {hh(pw.h)}{applies ? `, ${operatingAt(s, D.year, pk, scs)?.name ?? 'outside the schedules'}` : ''}</div>
            <div className="s muted">load factor {fmt(D.kW[pk] > 0 ? avg / D.kW[pk] * 100 : 0, 0)}% · {fmt(tot / days, 0)} kWh a day <button className="btn sm pw-link" type="button" onClick={() => { setView('day'); go(Math.floor(pk / 24)); }}>Show</button></div></div>
        </div>
      </>;
    })()}
    {linked && !s.opApply && <p className="hint">The operating schedule is not applied to this project’s demand: tick “Apply these schedules” in Operating schedule to see the demand per schedule.</p>}
    <div className="tbl-wrap"><table className="hr-tbl pw-stbl">
      <thead><tr><th>Schedule</th><th>Days a week</th><th>Hours a day</th><th>Operating hours a year</th><th>Energy, kWh a year</th><th>Share</th><th>Peak, kW</th><th>Peak at</th><th>Average while operating, kW</th><th>kWh per operating day</th><th>kWh per week</th><th>kWh per month</th></tr></thead>
      <tbody>{[...B.rows, B.out].map((r, j) => { const at = when(D.year, r.peakAt), isOut = r.id === 'out';
        return <tr key={r.id} className={isOut ? 'muted' : undefined}>
          <td>{!isOut && <i className="pw-sw" style={{ background: `var(--s${(j % 8) + 1})` }} />}{r.name}{isOut ? (linked ? ` (standby ${fmt(num(s.opStandby), 0)}%)` : ' (base load)') : ''}</td>
          <td>{isOut ? '–' : r.days}</td><td>{isOut ? '–' : fmt(r.hoursDay, 0)}</td><td>{fmt(r.hours, 0)}</td><td><b>{fmt(r.kWh, 0)}</b></td><td>{fmt(B.total > 0 ? r.kWh / B.total * 100 : 0, 1)}%</td>
          <td>{fmt(r.peak, 2)}</td><td>{r.hours ? `${at.d} ${MONTHS[at.m]} ${hh(at.h)}` : '–'}</td><td>{fmt(r.avg, 2)}</td><td>{isOut ? '–' : fmt(r.perDay, 0)}</td><td>{fmt(r.perWeek, 0)}</td><td>{fmt(r.perMonth, 0)}</td></tr>; })}
        <tr className="pw-total"><td>Total</td><td>7</td><td>–</td><td>{fmt(D.n, 0)}</td><td>{fmt(B.total, 0)}</td><td>100%</td><td>{fmt(D.kW[pk], 2)}</td><td>{pw.d} {MONTHS[pw.m]} {hh(pw.h)}</td><td>{fmt(avg, 2)}</td><td>{fmt(B.day.avg, 0)}</td><td>{fmt(B.week.avg, 0)}</td><td>{fmt(B.month.avg, 0)}</td></tr>
      </tbody>
    </table></div>

    <h4 className="hr-sub">By month <span className="muted">· kWh · click a month to show its peak day</span></h4>
    <div className="hr-months">{months.map((m, i) => <button key={i} type="button" className={'hr-mon' + (i === selM ? ' on' : '')} onClick={() => { setView('day'); go(Math.floor(m.at / 24)); }}
      aria-label={`${MONTHS[i]}: ${fmt(m.kWh, 0)} kWh, peak ${fmt(m.peak, 1)} kW`} title={`${MONTHS[i]}: ${fmt(m.kWh, 0)} kWh, peak ${fmt(m.peak, 1)} kW`}>
      <span className="hr-mon-v">{fmt(m.kWh, 0)}</span><span className="hr-mon-bar"><span style={{ height: (m.kWh / mMax * 100).toFixed(1) + '%' }} /></span><span className="hr-mon-l">{MONTHS[i]}</span><span className="hr-mon-h">{fmt(m.peak, 1)} kW</span>
    </button>)}</div>

    <h4 className="hr-sub">Month-wise power demand <span className="muted">· kWh · click a row to show the month’s peak day</span></h4>
    <div className="tbl-wrap"><table className="hr-tbl pw-mtbl">
      <thead><tr><th>Month</th><th>Days</th><th>Energy, kWh</th><th>Share of year</th><th>Average a day, kWh</th><th>Highest day, kWh</th><th>Average, kW</th><th>Peak, kW</th><th>Peak at</th><th>Lowest, kW</th><th>Load factor</th></tr></thead>
      <tbody>{months.map((m, i) => { const at = when(D.year, m.at), dd = m.hours / 24, a = m.hours ? m.kWh / m.hours : 0;
        return <tr key={i} className={i === selM ? 'pk' : undefined} onClick={() => { setView('day'); go(Math.floor(m.at / 24)); }} style={{ cursor: 'pointer' }}>
          <td>{MONTHS[i]}</td><td>{fmt(dd, 0)}</td><td><b>{fmt(m.kWh, 0)}</b></td><td>{fmt(tot > 0 ? m.kWh / tot * 100 : 0, 1)}%</td><td>{fmt(dd ? m.kWh / dd : 0, 0)}</td><td>{fmt(m.maxDay, 0)}</td>
          <td>{fmt(a, 2)}</td><td>{fmt(m.peak, 2)}</td><td>{at.d} {MONTHS[at.m]} {hh(at.h)}</td><td>{fmt(m.min === Infinity ? 0 : m.min, 2)}</td><td>{fmt(m.peak > 0 ? a / m.peak * 100 : 0, 0)}%</td></tr>; })}
        <tr className="pw-total"><td>Year</td><td>{fmt(days, 0)}</td><td><b>{fmt(tot, 0)}</b></td><td>100%</td><td>{fmt(tot / days, 0)}</td><td>{fmt(Math.max(...daily.map(x => x.e)), 0)}</td>
          <td>{fmt(avg, 2)}</td><td>{fmt(D.kW[pk], 2)}</td><td>{pw.d} {MONTHS[pw.m]} {hh(pw.h)}</td><td>{fmt(Math.min(...months.map(m => m.min)), 2)}</td><td>{fmt(D.kW[pk] > 0 ? avg / D.kW[pk] * 100 : 0, 0)}%</td></tr>
      </tbody>
    </table></div>
    <div className="btns"><button className="btn sm" type="button" onClick={() => {
      const rows = ['Month,Days,Energy kWh,Share of year %,Average a day kWh,Highest day kWh,Average kW,Peak kW,Peak at,Lowest kW,Load factor %'];
      months.forEach((m, i) => { const at = when(D.year, m.at), dd = m.hours / 24, a = m.hours ? m.kWh / m.hours : 0;
        rows.push([MONTHS[i], dd, m.kWh.toFixed(1), (tot > 0 ? m.kWh / tot * 100 : 0).toFixed(2), (m.kWh / dd).toFixed(1), m.maxDay.toFixed(1), a.toFixed(3), m.peak.toFixed(3), `${at.d} ${MONTHS[at.m]} ${hh(at.h)}`, m.min.toFixed(3), (m.peak > 0 ? a / m.peak * 100 : 0).toFixed(1)].join(',')); });
      rows.push(['Year', days, tot.toFixed(1), '100', (tot / days).toFixed(1), Math.max(...daily.map(x => x.e)).toFixed(1), avg.toFixed(3), D.kW[pk].toFixed(3), `${pw.d} ${MONTHS[pw.m]} ${hh(pw.h)}`, Math.min(...months.map(m => m.min)).toFixed(3), (D.kW[pk] > 0 ? avg / D.kW[pk] * 100 : 0).toFixed(1)].join(','));
      downloadFile('power-demand-monthly.csv', '\ufeff' + rows.join('\r\n'), 'text/csv');
    }}>Export month-wise CSV</button></div>
  </div>;
}

/* what solar and the battery leave: the remaining power requirement, shared between the grid and the genset */
function RemainingLoad({ R, s, off, nf, chk, set }: { R: ReturnType<typeof dispatch>; s: S; off: boolean;
  nf: (k: NumKey, label: ReactNode, unit: string, step?: number, aria?: string) => ReactNode; chk: (k: 'other' | 'bat' | 'export', label: ReactNode) => ReactNode; set: (k: keyof PowerSettings, v: unknown) => void }) {
  const x = remainingOf(R), at = when(R.year, x.peakAt), share = remGridShare(s) * 100;
  const pct = (v: number) => R.demandKWh > 0 ? fmt(v / R.demandKWh * 100, 1) + '%' : '–';
  /* the power supplied over the year, in the order it is used: the solar system (direct and through the battery), the grid, the genset */
  let sPk = 0, gPk = 0, nPk = 0, sAt = 0;
  for (let i = 0; i < R.n; i++) { const v = R.solar[i] + R.battery[i]; if (v > sPk) { sPk = v; sAt = i; } gPk = Math.max(gPk, R.grid[i]); nPk = Math.max(nPk, R.gen[i]); }
  const solarUsed = R.solarKWh + R.batteryKWh, supplied = solarUsed + R.gridKWh + R.genKWh;
  const order = [
    { k: 'solar', label: off ? 'Off-grid solar system' : 'Solar system', c: 'var(--s4)', kWh: solarUsed, peak: sPk,
      note: `PV ${fmt(R.solarKWh, 0)} direct + ${fmt(R.batteryKWh, 0)} via battery · panels made ${fmt(R.pvKWh, 0)} kWh${R.surplusKWh > 0 ? `, ${fmt(R.surplusKWh, 0)} surplus` : ''}` },
    { k: 'grid', label: off ? 'Grid backup' : 'On-grid', c: 'var(--s1)', kWh: R.gridKWh, peak: gPk, note: remGridShare(s) > 0 ? `${fmt(remGridShare(s) * 100, 0)}% of the remaining load` : 'not used' },
    { k: 'gen', label: 'Genset', c: 'var(--s8)', kWh: R.genKWh, peak: nPk, note: R.genKWh > 0 ? `${fmt(R.genHours, 0)} h running · ${fmt(R.fuelL, 0)} L diesel` : 'not used' },
  ];
  const sAtW = when(R.year, sAt);
  return <div className="pw-rem">
    <h4 className="hr-sub">Power supplied <span className="muted">· a year, in the order it is used: solar system, then grid, then genset</span></h4>
    <div className="totals hr-kpis pw-order">
      {order.map((x, i) => <div key={x.k} className="tot"><div className="k"><i className="pw-sw" style={{ background: x.c }} />{i + 1} · {x.label}</div>
        <div className="v">{fmt(x.kWh, 0)}<small>kWh</small></div>
        <div className="s">{pct(x.kWh)} of the demand · peak {fmt(x.peak, 2)} kW{x.k === 'solar' && x.kWh > 0 ? ` on ${sAtW.d} ${MONTHS[sAtW.m]} ${hh(sAtW.h)}` : ''}</div>
        <div className="s muted">{x.note}</div></div>)}
      <div className="tot key"><div className="k">Total supplied</div><div className="v">{fmt(supplied, 0)}<small>kWh</small></div>
        <div className="s">demand {fmt(R.demandKWh, 0)} kWh · peak {fmt(R.peakKW, 2)} kW</div>
        <div className="s muted">{R.unmetKWh > 0 ? `${fmt(R.unmetKWh, 0)} kWh unmet in ${R.unmetHours} h` : 'every hour met'}</div></div>
    </div>
    <div className="pw-bar" role="img" aria-label={order.map(x => `${x.label} ${pct(x.kWh)}`).join(', ')}>
      {order.map(x => x.kWh > 0 ? <span key={x.k} style={{ width: (x.kWh / (R.demandKWh || 1) * 100) + '%', background: x.c }} title={`${x.label}: ${fmt(x.kWh, 0)} kWh`} /> : null)}
      {R.unmetKWh > 0 && <span style={{ width: (R.unmetKWh / (R.demandKWh || 1) * 100) + '%', background: 'var(--s5)' }} title={`Unmet: ${fmt(R.unmetKWh, 0)} kWh`} />}
    </div>
    <ul className="hr-legend">{order.map((x, i) => <li key={x.k}><i style={{ background: x.c }} />{i + 1}. {x.label} {pct(x.kWh)}</li>)}{R.unmetKWh > 0 && <li><i style={{ background: 'var(--s5)' }} />Unmet {pct(R.unmetKWh)}</li>}</ul>

    <h4 className="hr-sub">Remaining power requirement <span className="muted">· after solar and the battery</span></h4>
    <div className="totals hr-kpis">
      <div className="tot key"><div className="k">Remaining load</div><div className="v">{fmt(x.kWh, 0)}<small>kWh a year</small></div><div className="s">{pct(x.kWh)} of the demand · {fmt(x.hours, 0)} h</div></div>
      <div className="tot"><div className="k">Remaining peak</div><div className="v">{fmt(x.peak, 2)}<small>kW</small></div><div className="s">{x.kWh > 0 ? `${at.d} ${MONTHS[at.m]} at ${hh(at.h)} · average ${fmt(x.avg, 2)} kW when needed` : 'solar and the battery meet every hour'}</div></div>
      <div className="tot"><div className="k">From the grid</div><div className="v">{fmt(x.grid.kWh, 0)}<small>kWh</small></div><div className="s">{pct(x.grid.kWh)} · peak {fmt(x.grid.peak, 2)} kW</div></div>
      <div className="tot"><div className="k">From the genset</div><div className="v">{fmt(x.gen.kWh, 0)}<small>kWh</small></div><div className="s">{pct(x.gen.kWh)} · peak {fmt(x.gen.peak, 2)} kW{x.unmet.kWh > 0 ? ` · unmet ${fmt(x.unmet.kWh, 0)} kWh in ${x.unmet.hours} h` : ''}</div></div>
    </div>
    <div className="pw-bar" role="img" aria-label={`Remaining load: grid ${fmt(share, 0)}%, genset the rest`}>
      {x.kWh > 0 && <><span style={{ width: (x.grid.kWh / x.kWh * 100) + '%', background: 'var(--s1)' }} title={`Grid ${fmt(x.grid.kWh, 0)} kWh`} />
        <span style={{ width: (x.gen.kWh / x.kWh * 100) + '%', background: 'var(--s8)' }} title={`Genset ${fmt(x.gen.kWh, 0)} kWh`} />
        <span style={{ width: (x.unmet.kWh / x.kWh * 100) + '%', background: 'var(--s5)' }} title={`Unmet ${fmt(x.unmet.kWh, 0)} kWh`} /></>}
    </div>
    <div className="hr-filters">
      {nf('remGrid', <>Share of the remaining load from the grid<span className="muted"> · genset the rest; blank = {off ? '0% off-grid' : '100% on-grid'}</span></>, '%', 5, 'Share of the remaining load from the grid')}
      {share > 0 && <>{nf('gridKW', <>Grid supply limit<span className="muted"> · blank = no limit</span></>, 'kW', 1, 'Grid supply limit')}
        {nf('gridFrom', 'Grid available from', 'h', 1, 'Grid available from hour')}{nf('gridTo', 'Grid available to', 'h', 1, 'Grid available to hour')}</>}
    </div>
    <div className="btns pw-remq"><span className="hint">Quick split:</span>{[[100, 'All grid'], [75, '75% grid'], [50, '50 / 50'], [25, '25% grid'], [0, 'All genset']].map(([v, l]) =>
      <button key={l} className="btn sm" type="button" aria-pressed={Math.round(share) === v} onClick={() => set('remGrid', v)}>{l}</button>)}</div>
    <p className="hint">Each hour, solar is used first, then the battery; what is left is shared {fmt(share, 0)}% grid{share > 0 && !blank(s.gridKW) ? ` (up to ${fmt(num(s.gridKW), 1)} kW)` : ''} and the genset the rest. Reduce the solar and the remaining load grows; it is shared the same way.{off && share > 0 ? ' Off-grid with a grid share means the grid is a backup connection.' : ''}</p>
    {!off && chk('export', 'Export surplus solar to the grid (net metering)')}
  </div>;
}

/* the price book: the user's selling prices with supplier and date, the live UAE diesel price, export and import */
function PriceBookCard({ book, setBook, s, projectCosts, onUseBook, onDiesel }: { book: PriceBook | null; setBook: (b: PriceBook | null) => void; s: S; projectCosts: PowerSettings; onUseBook: () => void; onDiesel: (v: number) => void }) {
  const toast = useToast();
  const [live, setLive] = useState<LiveDiesel | null>(null), [lErr, setLErr] = useState(''), [busy, setBusy] = useState(false);
  const getLive = async () => { setBusy(true); setLErr(''); try { setLive(await liveDiesel()); } catch (e) { setLErr((e as Error).message); } finally { setBusy(false); } };
  useEffect(() => { getLive(); }, []);
  const put = (b: PriceBook) => { saveBook(b); setBook(b); };
  const cur = book ?? { version: 1 as const, updated: today(), items: {} };
  const upd = (k: keyof PriceBook['items'], patch: Partial<NonNullable<PriceBook['items'][typeof k]>>) =>
    put({ ...cur, updated: today(), items: { ...cur.items, [k]: { price: cur.items[k]?.price ?? Number((s as Record<string, unknown>)[k]) ?? 0, date: today(), ...cur.items[k], ...patch } } });
  const fromProject = () => { const items: PriceBook['items'] = { ...cur.items }; for (const it of PRICE_ITEMS) items[it.key] = { ...items[it.key], price: Number((s as Record<string, unknown>)[it.key]) || 0, date: today() }; put({ version: 1, updated: today(), items }); toast('Saved this project’s prices to the price book'); };
  const hasOwn = COST_KEYS.some(k => (projectCosts as Record<string, unknown>)[k] != null);
  return <details className="hr-req-box pw-book" open={!book || undefined}>
    <summary>Price book <span className="muted">· your selling prices, kept in this browser{book ? `, updated ${book.updated}` : ': not set up yet'}</span></summary>
    <div className="body">
      <div className={'wx-status ' + (lErr ? 'error' : live ? 'ready' : 'loading')} role="status">
        {live ? <>Live UAE diesel retail price: <b>{fmt(live.price, 2)} AED/L</b>{live.date ? ` (${live.date})` : ''} · <a href={live.url} target="_blank" rel="noopener noreferrer">{live.source}</a>
          {' '}<button className="btn sm" type="button" onClick={() => { onDiesel(live.price); toast(`Diesel set to ${fmt(live.price, 2)} AED/L in this project`); }}>Use in this project</button>
          {' '}<button className="btn sm" type="button" onClick={() => { upd('diesel', { price: live.price, supplier: 'UAE retail (live)', date: today() }); toast('Diesel updated in the price book'); }}>Update the price book</button></>
          : lErr ? <>Live diesel price not available: {lErr}. The price book value is used. <button className="btn sm" type="button" onClick={getLive}>Try again</button></> : busy ? 'Getting the live UAE diesel price…' : null}
      </div>
      <div className="tbl-wrap"><table className="hr-tbl pw-booktbl">
        <thead><tr><th>Item</th><th>Selling price</th><th>Unit</th><th>Supplier or note</th><th>Date</th><th>In this project</th></tr></thead>
        <tbody>{PRICE_ITEMS.map(it => { const e = cur.items[it.key];
          return <tr key={it.key}><td>{it.label}</td>
            <td><NumInput id={`pb-${it.key}`} label={`${it.label} selling price`} min={0} step={0.01} value={e ? e.price : ''} onChange={v => upd(it.key, { price: v === '' ? 0 : Number(v), date: today() })} /></td>
            <td>{it.unit}</td>
            <td><input aria-label={`${it.label} supplier`} value={e?.supplier ?? ''} onChange={ev => upd(it.key, { supplier: ev.target.value })} placeholder="supplier, quote no." /></td>
            <td>{e?.date ?? '–'}</td>
            <td>{fmt(Number((s as Record<string, unknown>)[it.key]), it.unit === 'AED/Wp' || it.unit.endsWith('kWh') || it.unit === 'AED/L' ? 2 : 0)}{(projectCosts as Record<string, unknown>)[it.key] != null ? <span className="muted"> (own)</span> : null}</td></tr>; })}</tbody>
      </table></div>
      <div className="btns">
        <button className="btn sm" type="button" onClick={fromProject}>Save this project’s prices to the price book</button>
        <button className="btn sm" type="button" disabled={!book || !hasOwn} onClick={() => { onUseBook(); toast('This project now uses the price book'); }}>Use the price book in this project</button>
        <button className="btn sm" type="button" disabled={!book} onClick={() => downloadFile(`novac-price-book-${today()}.json`, JSON.stringify(cur, null, 1), 'application/json')}>Export price book</button>
        <button className="btn sm" type="button" onClick={async () => { const t = await pickFile('.json,application/json'); if (t == null) return; const b = parseBook(t); if (!b) { toast('That file is not a NOVAC price book'); return; } put(b); toast('Price book imported'); }}>Import price book</button>
      </div>
      <p className="hint">These are your selling prices to the client. A project uses them for every cost it has not set itself; typing a cost above sets it for this project only. The price book stays in this browser: export it to share or move it. Equipment prices have no live market feed in the UAE, so keep them up to date from your supplier quotes; the diesel price is read from a public aggregator of the UAE Fuel Price Committee’s monthly retail prices.</p>
    </div>
  </details>;
}

/* on-grid and off-grid side by side; the toggle shows either scenario's full results below */
type Both = { on: ReturnType<typeof runScenario> & { s: S }; off: ReturnType<typeof runScenario> & { s: S } };
function ScenarioCompare({ both, active, onPick }: { both: Both; active: 'on' | 'off'; onPick: (c: 'on' | 'off') => void }) {
  const a = both.on.R, b = both.off.R, pct = (x: number, R: typeof a) => R.demandKWh > 0 ? fmt(x / R.demandKWh * 100, 0) + '%' : '–';
  const rows: [string, (R: typeof a, o: Both['on']) => string, boolean?][] = [
    ['Solar PV', R => `${fmt(R.kWp, 1)} kWp`], ['Inverter', R => `${fmt(R.invKW, 0)} kW AC`], ['Battery', R => R.batKWh > 0 ? `${fmt(R.batKWh, 0)} kWh / ${fmt(R.batKW, 0)} kW` : '–'],
    ['Genset', R => R.genKVA > 0 ? `${fmt(R.genKVA, 0)} kVA` : '–'],
    ['Solar used (direct + battery)', R => `${fmt(R.solarKWh + R.batteryKWh, 0)} kWh · ${pct(R.solarKWh + R.batteryKWh, R)}`],
    ['Grid', R => `${fmt(R.gridKWh, 0)} kWh · ${pct(R.gridKWh, R)}`], ['Genset energy', R => `${fmt(R.genKWh, 0)} kWh · ${pct(R.genKWh, R)}`],
    ['Diesel', R => `${fmt(R.fuelL, 0)} L`], ['Unmet demand', R => R.unmetKWh > 0 ? `${fmt(R.unmetKWh, 0)} kWh in ${R.unmetHours} h` : 'none'],
    ['Running cost a year', R => aed(R.totalCost), true], ['Capital cost', R => aed(R.capex.total), true],
    ['Solar and battery payback', (_R, o) => o.pb?.years != null ? `${fmt(o.pb.years, 1)} years` : '–'], ['CO₂ a year', R => `${fmt((R.gridCO2 + R.genCO2) / 1000, 1)} t`],
    ['DEWA limit', R => R.dewa ? (R.dewa.tclEstimated ? 'enter the TCL' : R.dewa.ok ? '✓ within' : '✗ above') : 'not applicable'],
  ];
  const cheaper = a.totalCost <= b.totalCost ? 'on' : 'off';
  return <div className="hr-card pw-cmp">
    <h3>On-grid and off-grid <span className="muted">· calculated separately on the same demand</span></h3>
    <div className="seg" role="group" aria-label="Scenario shown in the results" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
      <button type="button" aria-pressed={active === 'on'} onClick={() => onPick('on')}>On-grid results <span>{aed(a.totalCost)} a year</span></button>
      <button type="button" aria-pressed={active === 'off'} onClick={() => onPick('off')}>Off-grid results <span>{aed(b.totalCost)} a year</span></button>
    </div>
    <div className="tbl-wrap"><table className="hr-tbl pw-cmptbl">
      <thead><tr><th></th><th className={active === 'on' ? 'on' : undefined}>On-grid</th><th className={active === 'off' ? 'on' : undefined}>Off-grid</th></tr></thead>
      <tbody>{rows.map(([l, f, key]) => <tr key={l} className={key ? 'pk' : undefined}><td>{l}</td><td>{f(a, both.on)}</td><td>{f(b, both.off)}</td></tr>)}</tbody>
    </table></div>
    <p className="hint">The {cheaper === 'on' ? 'on-grid' : 'off-grid'} scenario costs less to run by <b>{aed(Math.abs(a.totalCost - b.totalCost))}</b> a year; capital cost differs by {aed(Math.abs(a.capex.total - b.capex.total))}. The results below are for the <b>{active === 'off' ? 'off-grid' : 'on-grid'}</b> scenario; switch with the toggle above.</p>
  </div>;
}

/* on-grid start: the TCL and what DEWA allows to connect, then size from the TCL or enter your own system */
function OnGridStart({ s, R, eff, nf, set, setMany }: { s: S; R: ReturnType<typeof dispatch> | null; eff: { panels: number; invKW: number };
  nf: (k: NumKey, label: ReactNode, unit: string, step?: number, aria?: string) => ReactNode; set: (k: keyof PowerSettings, v: unknown) => void; setMany: (p: Partial<PowerSettings>, g?: string) => void }) {
  const dewa = s.utility === 'dewa', tclSet = !blank(s.tcl), t = tclSet ? tclSizing(num(s.tcl), num(s.panelW), num(s.dcac)) : null;
  const B = R?.dewaBill;
  return <div className="pw-ongrid">
    <h4 className="hr-sub">Step 1 · Total Connected Load (TCL) <span className="muted">· DEWA caps the solar you can connect on it</span></h4>
    <div className="hr-filters">
      {nf('tcl', <>Total Connected Load (TCL)<span className="muted"> · Approved Load on the plot’s DEWA account(s)</span></>, 'kW', 1, 'Total Connected Load')}
      {nf('panelW', 'Panel rating (DC)', 'Wp', 5, 'Panel rating')}
      {nf('dcac', 'DC/AC ratio', '–', 0.05, 'DC/AC ratio')}
    </div>
    {dewa && t ? <div className="totals hr-kpis pw-allow">
      <div className="tot key"><div className="k">Maximum PV allowed to connect</div><div className="v">{fmt(t.allowed, 1)}<small>kW AC</small></div><div className="s">{t.parts.map(b => `${fmt(b.kW, 0)} × ${fmt(b.share * 100, 0)}%`).join(' + ')}{t.capped ? ', capped at 1,000 kW' : ''}</div></div>
      <div className="tot"><div className="k">Largest inverter</div><div className="v">{fmt(t.invKW, 0)}<small>kW AC</small></div><div className="s">standard size within {fmt(t.allowed, 1)} kW</div></div>
      <div className="tot"><div className="k">Largest array</div><div className="v">{fmt(t.kWp, 1)}<small>kWp</small></div><div className="s">at DC/AC {fmt(num(s.dcac), 2)} ({fmt(t.maxKWp, 1)} kWp on the full allowance)</div></div>
      <div className="tot"><div className="k">Maximum panels</div><div className="v">{t.panels}<small>× {fmt(num(s.panelW), 0)} Wp</small></div><div className="s">on the largest inverter</div></div>
    </div> : <p className="hint">{dewa ? 'Enter the TCL to see the maximum PV DEWA allows to connect on this plot.' : 'Connection rules are set to None: no DEWA limit is applied.'}</p>}
    <div className="seg" role="group" aria-label="On-grid design" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
      <button type="button" aria-pressed={s.ogMode === 'tcl'} disabled={!dewa || !tclSet} onClick={() => set('ogMode', 'tcl')}>A · Size from the TCL <span>panels and inverter at the DEWA maximum</span></button>
      <button type="button" aria-pressed={s.ogMode !== 'tcl'} onClick={() => setMany({ ogMode: 'own', ...(s.ogMode === 'tcl' ? { panels: eff.panels, invKW: eff.invKW } : {}) }, 'power.og')}>B · My own system <span>enter panel quantity, Wp and the inverter below</span></button>
    </div>
    {R && <p className="hint">System: <b>{fmt(eff.panels, 0)} × {fmt(num(s.panelW), 0)} Wp = {fmt(R.kWp, 2)} kWp</b>, inverter <b>{fmt(R.invKW, 0)} kW AC</b>{R.dewa && !R.dewa.tclEstimated ? <> · {R.dewa.ok ? '✓ within' : '✗ above'} the DEWA limit of {fmt(R.dewa.allowed, 1)} kW</> : null}
      {B ? <> · DEWA bill <b>{aed(B.baseBill)}</b> → <b>{aed(B.bill)}</b> a year, saving <b>{aed(B.saving)}</b>{B.creditEnd > 0 ? <>, {fmt(B.creditEnd, 0)} kWh credit carried forward</> : null}. Full bill in Results.</> : null}</p>}
  </div>;
}

/* DEWA bills without and with solar under net metering, month by month */
function DewaBillCard({ B, s, R, pb }: { B: NonNullable<ReturnType<typeof dispatch>['dewaBill']>; s: S; R: ReturnType<typeof dispatch>; pb: ReturnType<typeof payback> }) {
  const sl = DEWA_TARIFF[s.dewaCat] || DEWA_TARIFF.com;
  return <div className="hr-card pw-dbill">
    <h3>DEWA bill and savings <span className="muted">· Shams Dubai net metering, {s.dewaCat === 'res' ? 'residential' : s.dewaCat === 'ind' ? 'industrial' : 'commercial'} slab tariff</span></h3>
    <div className="totals hr-kpis">
      <div className="tot"><div className="k">Bill without solar</div><div className="v">{fmt(B.baseBill, 0)}<small>AED a year</small></div><div className="s">{fmt(R.demandKWh, 0)} kWh · average {fmt(B.avgRate, 3)} AED/kWh</div></div>
      <div className="tot"><div className="k">Bill with solar</div><div className="v">{fmt(B.bill, 0)}<small>AED a year</small></div><div className="s">{fmt(B.imported, 0)} kWh imported − {fmt(B.exported, 0)} kWh exported</div></div>
      <div className="tot key"><div className="k">DEWA saving</div><div className="v">{fmt(B.saving, 0)}<small>AED a year</small></div><div className="s">{B.baseBill > 0 ? fmt(B.saving / B.baseBill * 100, 0) : 0}% of the bill{pb?.years != null ? ` · payback ${fmt(pb.years, 1)} years` : ''}</div></div>
      <div className="tot"><div className="k">Credit (refund) carried forward</div><div className="v">{fmt(B.creditEnd, 0)}<small>kWh</small></div><div className="s">≈ {aed(B.creditValue)} on future bills · DEWA pays no cash for surplus</div></div>
    </div>
    <div className="tbl-wrap"><table className="hr-tbl pw-dbtbl">
      <thead><tr><th>Month</th><th>Demand kWh</th><th>Bill without solar</th><th>Imported kWh</th><th>Exported kWh</th><th>Credit in kWh</th><th>Billed kWh</th><th>Bill with solar</th><th>Saving</th><th>Credit out kWh</th></tr></thead>
      <tbody>{B.months.map((m, i) => <tr key={i}><td>{MONTHS[i]}</td><td>{fmt(m.baseKWh, 0)}</td><td>{fmt(m.baseBill, 0)}</td><td>{fmt(m.importKWh, 0)}</td><td>{fmt(m.exportKWh, 0)}</td><td>{fmt(m.creditIn, 0)}</td><td>{fmt(m.billed, 0)}</td><td>{fmt(m.bill, 0)}</td><td><b>{fmt(m.baseBill - m.bill, 0)}</b></td><td>{fmt(m.creditOut, 0)}</td></tr>)}
        <tr className="pw-total"><td>Year</td><td>{fmt(B.months.reduce((a, m) => a + m.baseKWh, 0), 0)}</td><td>{fmt(B.baseBill, 0)}</td><td>{fmt(B.imported, 0)}</td><td>{fmt(B.exported, 0)}</td><td>–</td><td>{fmt(B.months.reduce((a, m) => a + m.billed, 0), 0)}</td><td>{fmt(B.bill, 0)}</td><td><b>{fmt(B.saving, 0)}</b></td><td>{fmt(B.creditEnd, 0)}</td></tr></tbody>
    </table></div>
    <p className="hint">Each month the solar exported and any credit carried forward are taken off the kWh imported from DEWA; only the rest is billed, slab by slab ({sl.map((b, i) => `${i ? fmt(sl[i - 1].to + 1, 0) : 0}${b.to === Infinity ? '+' : '–' + fmt(b.to, 0)} kWh ${fmt(b.rate, 2)}`).join(', ')} AED/kWh), plus the fuel surcharge {fmt(num(s.fuelSur), 3)} AED/kWh{s.vat ? ' and 5% VAT' : ''}. A surplus rolls over to the next bills with no time limit; DEWA pays no money for it. Meter service charges and water are not included. {DEWA_TARIFF_REF}.</p>
  </div>;
}

/* off-grid: battery and solar sized from the power consumption projection, and the year's loss of load */
function OffGrid({ og, R, s, panelW, nf, set, onUsePV }: { og: ReturnType<typeof offGridSizing>; R: ReturnType<typeof dispatch> | null; s: S; panelW: number;
  nf: (k: NumKey, label: ReactNode, unit: string, step?: number, aria?: string) => ReactNode; set: (k: keyof PowerSettings, v: unknown) => void; onUsePV: () => void }) {
  const panels = Math.ceil(og.kWp * 1000 / Math.max(1, panelW)), kWp = pvKWp(s);
  const lol = R ? R.unmetHours : 0, served = R && R.demandKWh > 0 ? (1 - R.unmetKWh / R.demandKWh) * 100 : 100;
  return <div className="pw-off">
    <h4 className="hr-sub">Off-grid sizing <span className="muted">· from the power consumption projection</span></h4>
    <div className="hr-filters">
      {nf('autonomy', <>Days of autonomy<span className="muted"> · days the battery carries the load without sun</span></>, 'days', 0.5, 'Days of autonomy')}
      <label className="fld" htmlFor="pw-offDay"><span className="fl">Design day</span><span className="in-u"><select id="pw-offDay" value={s.offDay} onChange={e => set('offDay', e.target.value)}>
        <option value="peak">Peak day of the year</option><option value="avg">Average day</option></select></span></label>
      {nf('dod', 'Depth of discharge', '%')}
      {nf('rte', 'Round-trip efficiency (AC to AC)', '%')}
      {nf('batKWh', <>Battery capacity<span className="muted"> · blank = sized {fmt(og.batKWh, 0)} kWh</span></>, 'kWh', 5, 'Battery capacity')}
      {nf('batKW', <>Battery power<span className="muted"> · blank = sized {fmt(og.batKW, 0)} kW</span></>, 'kW', 1, 'Battery power')}
    </div>
    <table className="hr-tbl pw-ogtbl"><tbody>
      <tr><td>Design-day energy</td><td>{s.offDay === 'avg' ? 'average day' : `peak day`}: <b>{fmt(og.eDay, 1)} kWh</b> <span className="muted">(average day {fmt(og.avgDay, 1)} kWh, peak day {fmt(og.peakDayKWh, 1)} kWh)</span></td></tr>
      <tr><td>Battery, usable</td><td>{fmt(og.eDay, 1)} kWh × {fmt(og.aut, 1)} day{og.aut === 1 ? '' : 's'} = <b>{fmt(og.usable, 1)} kWh</b></td></tr>
      <tr><td>Battery, nominal</td><td>{fmt(og.usable, 1)} ÷ ({fmt(og.dod * 100, 0)}% DoD × {fmt(og.eta * 100, 1)}% discharge) = {fmt(og.usable / (og.dod * og.eta), 1)} → <b>{fmt(og.batKWh, 0)} kWh</b></td></tr>
      <tr><td>Battery power</td><td>peak demand {fmt(og.peakKW, 2)} kW × 1.25 = <b>{fmt(og.batKW, 0)} kW</b></td></tr>
      <tr><td>Solar PV</td><td>{fmt(og.eDay, 1)} kWh × ({fmt((1 - og.nightShare) * 100, 0)}% direct + {fmt(og.nightShare * 100, 0)}% through the battery ÷ {fmt(og.eta * og.eta * 100, 0)}%) ÷ {fmt(og.yDay, 2)} kWh per kWp a day = <b>{fmt(og.kWp, 1)} kWp</b> ≈ {panels} × {fmt(panelW, 0)} Wp
        {' '}<button className="btn sm" type="button" onClick={onUsePV}>Use {panels} panels</button>{kWp > 0 ? <span className="muted"> · now {fmt(kWp, 1)} kWp</span> : null}</td></tr>
      <tr><td>Inverter</td><td>carries the whole load: at least peak {fmt(og.peakKW, 2)} kW × 1.25 = {fmt(og.invKW, 0)} kW{R ? <> · using <b>{fmt(R.invKW, 0)} kW</b></> : null}</td></tr>
    </tbody></table>
    {R && <p className={'wx-status ' + (lol ? (s.offGen ? 'loading' : 'error') : 'ready')} role="status">
      {lol === 0 ? <>✓ Over the year solar and the battery{R.genKWh > 0 || R.gridKWh > 0 ? `, with ${[R.gridKWh > 0 ? 'the grid backup' : '', R.genKWh > 0 ? 'the backup genset' : ''].filter(Boolean).join(' and ')},` : ''} meet every hour. {R.gridKWh > 0 ? `The grid supplies ${fmt(R.gridKWh, 0)} kWh (${fmt(R.gridKWh / R.demandKWh * 100, 1)}%). ` : ''}{R.genKWh > 0 ? `The genset runs ${fmt(R.genHours, 0)} h for ${fmt(R.genKWh, 0)} kWh (${fmt(R.genKWh / R.demandKWh * 100, 1)}%).` : ''}</>
        : <>✗ Loss of load: {fmt(R.unmetKWh, 0)} kWh unmet in {lol} h ({fmt(served, 2)}% of the demand served). Add panels, battery or autonomy{s.offGen ? '' : ', or fit the backup genset'}.</>}</p>}
  </div>;
}

/* DEWA Shams Dubai: the inverters' AC capacity against the TCL share, slab by slab */
function DewaCheck({ R, s, onFit }: { R: ReturnType<typeof dispatch>; s: S; onFit: () => void }) {
  const x = R.dewa!, panelW = num(s.panelW);
  return <div className={'pw-dewa ' + (x.tclEstimated ? 'req' : x.ok ? 'ok' : 'bad')} role="status">
    <p><span className={'pill ' + (x.tclEstimated ? 'req' : x.ok ? 'ok' : 'bad')}>{x.tclEstimated ? 'Enter the TCL' : x.ok ? '✓ Within DEWA limit' : '✗ Above DEWA limit'}</span>{' '}
      Inverter <b>{fmt(R.invKW, 0)} kW AC</b> {x.ok ? '≤' : '>'} allowed <b>{fmt(x.allowed, 1)} kW AC</b> for a TCL of {fmt(x.tcl, 1)} kW
      {x.tclEstimated ? ' — indicative only: the TCL shown is the peak demand. Enter the Approved Load from the DEWA account(s) on the plot to check.' : '.'}</p>
    <table className="hr-tbl pw-slabs"><thead><tr><th>TCL slab, kW</th><th>TCL in slab, kW</th><th>Share allowed</th><th>PV allowed, kW AC</th></tr></thead>
      <tbody>{x.parts.map(b => <tr key={b.from}><td>{b.to === Infinity ? `> ${b.from}` : `${b.from}–${b.to}`}</td><td>{fmt(b.kW, 1)}</td><td>{fmt(b.share * 100, 0)}%</td><td>{fmt(b.allowed, 1)}</td></tr>)}
        <tr className="pk"><td>Total</td><td>{fmt(x.tcl, 1)}</td><td>{x.tcl > 0 ? fmt(x.allowed / x.tcl * 100, 1) + '%' : '–'}</td><td>{fmt(x.allowed, 1)}{x.capped ? ` (capped at ${DEWA_CAP})` : ''}</td></tr></tbody></table>
    <p className="hint">At DC/AC {fmt(num(s.dcac), 2)} that allows up to <b>{fmt(x.maxKWp, 1)} kWp DC</b>{panelW > 0 ? <>, <b>{x.maxPanels}</b> panels of {fmt(panelW, 0)} Wp</> : null}. The limit is on the inverters’ maximum AC output, not the panels’ DC rating, and never above {fmt(DEWA_CAP, 0)} kW per plot; DEWA can set a lower technical limit at the connection point. {DEWA_REF}.
      {!x.ok && !x.tclEstimated && <> <button className="btn sm" type="button" onClick={onFit}>Fit to the DEWA limit</button></>}</p>
  </div>;
}

/* the calculation chain with this case's own numbers */
function WorkedExample({ D, R, s, pb }: { D: NonNullable<ReturnType<typeof demand>>; R: ReturnType<typeof dispatch>; s: S; pb: ReturnType<typeof payback> }) {
  let pk = 0; for (let i = 0; i < D.n; i++) if (R.poa[i] > R.poa[pk]) pk = i;
  const G = R.poa[pk], pr = num(s.pr), eta = num(s.invEff) / 100, dc = R.kWp * G / 1000 * pr, ac = dc * eta;
  let gi = -1; for (let i = 0; i < D.n; i++) if (R.gen[i] > 0 && (gi < 0 || R.gen[i] > R.gen[gi])) gi = i;
  const share = s.split === 'share', usable = R.batKWh * num(s.dod) / 100, ow = Math.sqrt(num(s.rte) / 100);
  const w = when(D.year, pk), at = `${w.d} ${MONTHS[w.m]} ${hh(w.h)}`;
  return <details className="hr-card pw-work"><summary><h3 style={{ display: 'inline' }}>Worked example <span className="muted">· every step with this case’s numbers</span></h3></summary>
    <ol className="pw-steps">
      <li><b>Demand.</b> {D.label}: {fmt(R.demandKWh, 0)} kWh a year, peak {fmt(R.peakKW, 2)} kW. Customised values: × {fmt(blank(s.scale) ? 100 : num(s.scale), 0)}%{num(s.addKW) ? `, + ${fmt(num(s.addKW), 1)} kW from ${num(s.addFrom)}:00 to ${num(s.addTo)}:00` : ''}.</li>
      {share ? <li><b>Fixed shares.</b> Grid {fmt(R.gridKWh, 0)} kWh + solar {fmt(R.solarKWh, 0)} kWh + genset {fmt(R.genKWh, 0)} kWh = {fmt(R.gridKWh + R.solarKWh + R.genKWh, 0)} kWh.</li> : <>
        <li><b>Array (DC).</b> {fmt(num(s.panels), 0)} panels × {fmt(num(s.panelW), 0)} Wp ÷ 1,000 = <b>{fmt(R.kWp, 2)} kWp</b>.</li>
        <li><b>Inverter (AC).</b> {fmt(R.kWp, 2)} kWp ÷ DC/AC {fmt(num(s.dcac), 2)} = {fmt(R.kWp / (num(s.dcac) || 1), 2)} kW → {blank(s.invKW) ? 'next standard size' : 'entered'} <b>{fmt(R.invKW, 0)} kW AC</b>{R.dewa && R.invSuggested < R.kWp / (num(s.dcac) || 1) && blank(s.invKW) ? ' (held within the DEWA limit)' : ''}; as built DC/AC = {fmt(R.kWp, 2)} ÷ {fmt(R.invKW, 0)} = {fmt(R.dcac, 2)}.</li>
        {R.dewa && <li><b>DEWA limit.</b> TCL {fmt(R.dewa.tcl, 1)} kW: {R.dewa.parts.map(b => `${fmt(b.kW, 1)} × ${fmt(b.share * 100, 0)}%`).join(' + ')} = <b>{fmt(R.dewa.allowed, 1)} kW AC</b> allowed; inverter {fmt(R.invKW, 0)} kW {R.dewa.ok ? '≤' : '>'} {fmt(R.dewa.allowed, 1)} kW {R.dewa.ok ? '✓' : '✗'}. Largest array at DC/AC {fmt(num(s.dcac), 2)}: {fmt(R.dewa.allowed, 1)} × {fmt(num(s.dcac), 2)} = {fmt(R.dewa.maxKWp, 1)} kWp.</li>}
        {R.kWp > 0 && <li><b>Sunniest hour</b> ({at}). Irradiance on the panels {fmt(G, 0)} W/m² (tilt {fmt(num(s.tilt), 0)}°, facing {fmt(num(s.az), 0)}°). DC = {fmt(R.kWp, 2)} × {fmt(G, 0)} ÷ 1,000 × {fmt(pr, 2)} = {fmt(dc, 2)} kW; AC = {fmt(dc, 2)} × {fmt(eta * 100, 1)}% = {fmt(ac, 2)} kW{ac > R.invKW ? `, clipped to ${fmt(R.invKW, 0)} kW` : ` (≤ ${fmt(R.invKW, 0)} kW inverter, no clipping)`}.</li>}
        {R.kWp > 0 && <li><b>Year of solar.</b> DC {fmt(R.dcKWh, 0)} kWh × {fmt(eta * 100, 1)}% = {fmt(R.dcKWh * eta, 0)} kWh AC − {fmt(R.clippedKWh, 0)} kWh clipped = <b>{fmt(R.pvKWh, 0)} kWh</b> ({fmt(R.pvKWh / R.kWp, 0)} kWh/kWp). Used directly {fmt(R.solarKWh, 0)} kWh, into the battery {fmt(R.chargeKWh, 0)} kWh, surplus {fmt(R.surplusKWh, 0)} kWh.</li>}
        {R.batKWh > 0 && <li><b>Battery.</b> Usable {fmt(R.batKWh, 0)} kWh × {fmt(num(s.dod), 0)}% = {fmt(usable, 1)} kWh; each way √{fmt(num(s.rte), 0)}% = {fmt(ow * 100, 1)}%. Charged {fmt(R.chargeKWh, 0)} kWh → stored {fmt(R.chargeKWh * ow, 0)} kWh → delivered {fmt(R.batteryKWh, 0)} kWh; {fmt(R.batCycles, 0)} full cycles.</li>}
        <li><b>Remaining load.</b> Demand − solar − battery = {fmt(R.gridKWh + R.genKWh + R.unmetKWh, 0)} kWh, shared {fmt(remGridShare(s) * 100, 0)}% grid and the rest genset{R.unmetKWh > 0 ? `, ${fmt(R.unmetKWh, 0)} kWh unmet` : ''}.</li>
        <li><b>Grid.</b> {s.conn === 'off' && remGridShare(s) === 0 ? 'Off-grid: no grid connection.' : <>Up to {blank(s.gridKW) ? 'no limit' : `${fmt(num(s.gridKW), 1)} kW`} from {num(s.gridFrom)}:00 to {num(s.gridTo)}:00: {fmt(R.gridKWh, 0)} kWh, peak {fmt(R.gridPeakKW, 2)} kW.</>}</li>
      </>}
      <li><b>Genset.</b> {R.genKVA > 0 ? <>{fmt(R.genKVA, 0)} kVA × PF {fmt(num(s.pf), 2)} = {fmt(R.genKW, 1)} kW. {gi >= 0 ? <>Largest hour {fmt(R.gen[gi], 2)} kW: fuel = {FUEL_A} × {fmt(R.genKW, 1)} + {FUEL_B} × {fmt(R.gen[gi], 2)} = {fmt(FUEL_A * R.genKW + FUEL_B * R.gen[gi], 2)} L/h → {fmt((FUEL_A * R.genKW + FUEL_B * R.gen[gi]) * num(s.diesel) / R.gen[gi] + num(s.genOM), 3)} AED/kWh. </> : null}Year: {fmt(R.genKWh, 0)} kWh, {fmt(R.fuelL, 0)} L in {R.genHours} h.</> : 'not needed.'}</li>
      <li><b>Running cost.</b> Grid {fmt(R.gridKWh, 0)} × {fmt(num(s.tGrid), 3)} = {aed(R.gridCost)}; solar {aed(R.solarCost)}; diesel {fmt(R.fuelL, 0)} L × {fmt(num(s.diesel), 2)} = {aed(R.genFuelCost)}; genset O&M {aed(R.genOMCost)}{R.exportCredit ? `; export credit −${aed(R.exportCredit)}` : ''} → <b>{aed(R.totalCost)} a year</b>.</li>
      {pb && <li><b>Payback.</b> Without solar or battery: {aed(pb.baseCost)} a year; saving {aed(pb.saving)}. Capital PV {aed(R.capex.pv)} + inverter {aed(R.capex.inv)} + battery {aed(R.capex.bat)} = {aed(pb.capex)} ÷ {aed(pb.saving)} = <b>{pb.years != null ? fmt(pb.years, 1) + ' years' : '–'}</b>.</li>}
      <li><b>CO₂.</b> Grid {fmt(R.gridKWh, 0)} kWh × {fmt(num(s.efGrid), 2)} = {fmt(R.gridCO2 / 1000, 2)} t; diesel {fmt(R.fuelL, 0)} L × 2.68 = {fmt(R.genCO2 / 1000, 2)} t.</li>
    </ol>
  </details>;
}

function PowerResults({ D, R, s, pb, name }: { D: NonNullable<ReturnType<typeof demand>>; R: ReturnType<typeof dispatch>; s: S; pb: ReturnType<typeof payback>; name: string }) {
  const [day, setDay] = useState(() => Math.floor(R.peakAt / 24));
  const days = D.n / 24, k = Math.min(day, days - 1);
  const pct = (x: number) => R.demandKWh > 0 ? fmt(x / R.demandKWh * 100, 0) + '%' : '–';
  const solarUsed = R.solarKWh + R.batteryKWh, co2 = (R.gridCO2 + R.genCO2) / 1000;
  const blended = R.demandKWh > 0 ? R.totalCost / (R.demandKWh - R.unmetKWh || 1) : 0;
  const tot = { solar: R.solarKWh, battery: R.batteryKWh, grid: R.gridKWh, gen: R.genKWh, unmet: R.unmetKWh };
  const dateOf = (kk: number) => { const w = when(D.year, kk * 24); return `${w.d} ${MONTHS[w.m]}`; };

  return <>
    <div className="hr-card">
      <h3>Results <span className="muted">· {D.label}, {D.n.toLocaleString('en-US')} hours</span></h3>
      <div className="pw-bar" role="img" aria-label={SRC.map(x => `${x.label} ${pct(tot[x.k])}`).join(', ')}>
        {SRC.map(x => tot[x.k] > 0 ? <span key={x.k} style={{ width: (tot[x.k] / (R.demandKWh || 1) * 100) + '%', background: x.c }} title={`${x.label}: ${fmt(tot[x.k], 0)} kWh`} /> : null)}
      </div>
      <ul className="hr-legend">{SRC.map(x => tot[x.k] > 0 ? <li key={x.k}><i style={{ background: x.c }} />{x.label} {pct(tot[x.k])}</li> : null)}</ul>
      <div className="totals hr-kpis">
        <div className="tot"><div className="k">Annual demand</div><div className="v">{fmt(R.demandKWh / 1000, 1)}<small>MWh</small></div><div className="s">peak {fmt(R.peakKW, 1)} kW on {dateOf(Math.floor(R.peakAt / 24))} at {hh(R.peakAt % 24 + 1)}</div></div>
        <div className="tot"><div className="k">Solar used</div><div className="v">{fmt(solarUsed / 1000, 1)}<small>MWh</small></div><div className="s">{pct(solarUsed)} of demand{R.batteryKWh > 0 ? `, ${fmt(R.batteryKWh / 1000, 1)} MWh through the battery` : ''} · PV made {fmt(R.pvKWh / 1000, 1)} MWh ({fmt(R.kWp > 0 ? R.pvKWh / R.kWp : 0, 0)} kWh/kWp)</div></div>
        <div className="tot"><div className="k">Grid</div><div className="v">{fmt(R.gridKWh / 1000, 1)}<small>MWh</small></div><div className="s">{pct(R.gridKWh)} · peak draw {fmt(R.gridPeakKW, 1)} kW · {aed(R.gridCost)}</div></div>
        <div className="tot"><div className="k">Genset</div><div className="v">{fmt(R.genKWh / 1000, 1)}<small>MWh</small></div><div className="s">{pct(R.genKWh)} · {fmt(R.genHours, 0)} h running · {fmt(R.fuelL, 0)} L diesel · {aed(R.genFuelCost + R.genOMCost)}</div></div>
      </div>
      <div className="totals hr-kpis">
        <div className="tot key"><div className="k">Running cost a year</div><div className="v">{fmt(R.totalCost, 0)}<small>AED</small></div><div className="s">{fmt(blended, 3)} AED per kWh supplied{R.exportCredit > 0 ? ` · after ${aed(R.exportCredit)} export credit` : ''}</div></div>
        <div className="tot"><div className="k">Capital cost</div><div className="v">{fmt(R.capex.total, 0)}<small>AED</small></div><div className="s">PV {aed(R.capex.pv)} · inverter {aed(R.capex.inv)} · battery {aed(R.capex.bat)} · genset {aed(R.capex.gen)}</div></div>
        <div className="tot"><div className="k">Solar and battery payback</div><div className="v">{pb?.years != null ? fmt(pb.years, 1) : '–'}<small>{pb?.years != null ? 'years' : ''}</small></div><div className="s">{pb ? pb.saving > 0 ? `saves ${aed(pb.saving)} a year against ${aed(pb.baseCost)} without solar or battery` : R.kWp > 0 ? 'no saving against the same supply without solar' : 'add solar panels to see a payback' : 'hour-by-hour split only'}</div></div>
        <div className="tot"><div className="k">CO₂ a year</div><div className="v">{fmt(co2, 1)}<small>t</small></div><div className="s">grid {fmt(R.gridCO2 / 1000, 1)} t · genset {fmt(R.genCO2 / 1000, 1)} t{pb ? ` · ${fmt(pb.baseCO2 / 1000 - co2, 1)} t saved by solar` : ''}</div></div>
      </div>
      {(R.unmetKWh > 0 || R.surplusKWh > 0 || R.clippedKWh > 1) && <div className="derived wx-ext">
        {R.unmetKWh > 0 && <span>Unmet demand <b className="bad">{fmt(R.unmetKWh, 0)} kWh in {R.unmetHours} h</b>: raise the genset rating or the grid limit</span>}
        {R.surplusKWh > 0 && <span>Surplus solar {s.export ? 'exported' : 'not used'} <b>{fmt(R.surplusKWh / 1000, 1)} MWh</b></span>}
        {R.clippedKWh > 1 && <span>Lost to inverter clipping <b>{fmt(R.clippedKWh, 0)} kWh</b></span>}
      </div>}
    </div>

    <SupplyLoad D={D} R={R} k={k} setDay={setDay} days={days} />

    <div className="tbl-wrap wx-months"><table className="hr-tbl">
      <thead><tr><th>Month</th><th>Demand kWh</th><th>Solar kWh</th><th>Battery kWh</th><th>Grid kWh</th><th>Genset kWh</th><th>Diesel L</th>{R.surplusKWh > 0 && <th>Surplus kWh</th>}{R.unmetKWh > 0 && <th>Unmet kWh</th>}<th>Cost AED</th></tr></thead>
      <tbody>{R.months.map((m, i) => <tr key={i}><td>{MONTHS[i]}</td><td>{fmt(m.demand, 0)}</td><td>{fmt(m.solar, 0)}</td><td>{fmt(m.battery, 0)}</td><td>{fmt(m.grid, 0)}</td><td>{fmt(m.gen, 0)}</td><td>{fmt(m.fuel, 0)}</td>{R.surplusKWh > 0 && <td>{fmt(m.surplus, 0)}</td>}{R.unmetKWh > 0 && <td>{fmt(m.unmet, 0)}</td>}<td>{fmt(m.cost, 0)}</td></tr>)}
        <tr className="pk"><td>Year</td><td>{fmt(R.demandKWh, 0)}</td><td>{fmt(R.solarKWh, 0)}</td><td>{fmt(R.batteryKWh, 0)}</td><td>{fmt(R.gridKWh, 0)}</td><td>{fmt(R.genKWh, 0)}</td><td>{fmt(R.fuelL, 0)}</td>{R.surplusKWh > 0 && <td>{fmt(R.surplusKWh, 0)}</td>}{R.unmetKWh > 0 && <td>{fmt(R.unmetKWh, 0)}</td>}<td>{fmt(R.totalCost, 0)}</td></tr>
      </tbody>
    </table></div>
    <div className="btns"><button className="btn sm" type="button" onClick={() => downloadFile(`${(name || 'novac').replace(/[^\w-]+/g, '-')}-power-${D.year}-hourly.csv`, '﻿' + powerCsv(D, R), 'text/csv')}>Export hourly CSV</button></div>
    <p className="hint">Solar AC output = kWp × panel-plane irradiance ÷ 1,000 × DC performance ratio × inverter efficiency, capped at the inverter AC rating. Panel-plane irradiance is beam × cos(incidence) + sky diffuse × (1 + cos tilt)/2 + ground-reflected × albedo × (1 − cos tilt)/2, {D.label.includes('Real weather') ? 'from the weather year’s measured irradiance.' : `from the ASHRAE clear sky for the location × ${CLEARNESS}.`}
      {' '}Design-day demand includes safety margins and repeats each month’s design day, so it overstates annual energy. Use the real weather year for energy and cost.</p>
  </>;
}

/* the load on each source (solar, battery, grid, genset) by day, week, month and year: a stacked chart and a summary table */
type SView = 'day' | 'week' | 'month' | 'year';
const SRC_LABEL: Record<SourceKey, string> = { solar: 'Solar PV, direct', battery: 'Battery (stored PV)', grid: 'Grid', gen: 'Genset', unmet: 'Unmet' };
function SupplyLoad({ D, R, k, setDay, days }: { D: NonNullable<ReturnType<typeof demand>>; R: ReturnType<typeof dispatch>; k: number; setDay: (k: number) => void; days: number }) {
  const [view, setView] = useState<SView>('day');
  const [hover, setHover] = useState<number | null>(null);
  const st = useMemo(() => supplyStats(R), [R]);
  const used = SRC.filter(x => R[x.k].some(v => v > 1e-9));
  const go = (x: number) => { setDay(Math.max(0, Math.min(days - 1, x))); setHover(null); };
  const w = when(D.year, k * 24), dateOf = (kk: number) => { const z = when(D.year, kk * 24); return `${z.d} ${MONTHS[z.m]}`; };
  const iso = `${D.year}-${String(w.m + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
  const wk0 = Math.max(0, Math.min(k - dayOf(D.year, k), days - 7));
  /* columns: hours (day, week) in kW, days of the month or months of the year in kWh; each column has a value per source and the demand */
  const m0 = (Date.UTC(D.year, w.m, 1) - Date.UTC(D.year, 0, 1)) / 86400000, mLen = new Date(Date.UTC(D.year, w.m + 1, 0)).getUTCDate();
  const cols: { label: string; v: Record<SourceKey, number>; dem: number; go?: number }[] = [];
  const sumOver = (i0: number, n: number) => { const v = { solar: 0, battery: 0, grid: 0, gen: 0, unmet: 0 } as Record<SourceKey, number>; let dem = 0; for (let i = i0; i < i0 + n; i++) { SRC.forEach(x => { v[x.k] += R[x.k][i]; }); dem += D.kW[i]; } return { v, dem }; };
  if (view === 'day' || view === 'week') { const i0 = (view === 'day' ? k : wk0) * 24, n = view === 'day' ? 24 : 168; for (let h = 0; h < n; h++) { const c = sumOver(i0 + h, 1), z = when(D.year, i0 + h); cols.push({ label: view === 'day' ? hh(h + 1) : `${z.d} ${MONTHS[z.m]} ${hh(z.h)}`, ...c, go: view === 'week' ? Math.floor((i0 + h) / 24) : undefined }); } }
  else if (view === 'month') for (let j = 0; j < mLen; j++) cols.push({ label: dateOf(m0 + j), ...sumOver((m0 + j) * 24, 24), go: m0 + j });
  else for (let m = 0; m < 12; m++) { const a = (Date.UTC(D.year, m, 1) - Date.UTC(D.year, 0, 1)) / 86400000, b = (Date.UTC(D.year, m + 1, 1) - Date.UTC(D.year, 0, 1)) / 86400000; cols.push({ label: MONTHS[m], ...sumOver(a * 24, (b - a) * 24), go: a }); }
  const unit = view === 'day' || view === 'week' ? 'kW' : 'kWh';
  const W = 760, Ht = 240, ml = 52, mr = 8, mt = 14, mb = 26, ph = Ht - mt - mb, bw = (W - ml - mr) / cols.length;
  const top = Math.max(0.001, ...cols.map(c => Math.max(c.dem, SRC.reduce((a, x) => a + c.v[x.k], 0))));
  const step = (() => { const raw = top / 4, p = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
  const yMax = Math.ceil(top / step) * step || step, y = (v: number) => mt + ph - v / yMax * ph;
  const ticks: number[] = []; for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  const hc = hover != null ? cols[hover] : null;
  const tot = (c: typeof cols[number]) => SRC.reduce((a, x) => a + c.v[x.k], 0);
  const range = view === 'day' ? dateOf(k) : view === 'week' ? `${dateOf(wk0)} to ${dateOf(wk0 + 6)}` : view === 'month' ? `${MONTHS[w.m]} ${D.year}` : String(D.year);
  const sumAll = cols.reduce((a, c) => a + tot(c), 0) * (view === 'day' || view === 'week' ? 1 : 1);
  const pickAt = (e: React.MouseEvent<SVGRectElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(cols.length - 1, Math.floor((e.clientX - r.left) / r.width * cols.length))); };
  const stepBy = view === 'day' ? 1 : view === 'week' ? 7 : view === 'month' ? mLen : 0;

  return <div className="hr-card pw-load">
    <h3>Load by source <span className="muted">· solar PV, battery, grid and genset by day, week, month and year</span></h3>
    <div className="pw-chart-bar">
      <div className="seg pw-view" role="group" aria-label="Load period" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {([['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']] as [SView, string][]).map(([v, t]) => <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); setHover(null); }}>{t}</button>)}
      </div>
      {view !== 'year' && <div className="btns pw-nav">
        <button className="btn sm" type="button" aria-label="Previous" disabled={k <= 0} onClick={() => go(view === 'month' ? m0 - 1 : k - stepBy)}>◀</button>
        <input type="date" aria-label="Day shown" value={iso} min={`${D.year}-01-01`} max={`${D.year}-12-31`}
          onChange={e => { const t = Date.parse(e.target.value + 'T00:00Z'); if (Number.isFinite(t)) go(Math.round((t - Date.UTC(D.year, 0, 1)) / 86400000)); }} />
        <button className="btn sm" type="button" aria-label="Next" disabled={k >= days - 1} onClick={() => go(view === 'month' ? m0 + mLen : k + stepBy)}>▶</button>
        <button className="btn sm" type="button" onClick={() => go(Math.floor(R.peakAt / 24))}>Peak day</button>
      </div>}
    </div>
    <ul className="hr-legend">{used.map(x => <li key={x.k}><i style={{ background: x.c }} />{SRC_LABEL[x.k]}</li>)}<li><i style={{ background: 'var(--fg)', height: 2 }} />Demand</li></ul>
    <p className="hint pw-read">{hc ? <><b>{hc.label}</b>: {used.map(x => `${SRC_LABEL[x.k]} ${fmt(hc.v[x.k], view === 'day' || view === 'week' ? 2 : 0)}`).join(' · ')} · demand {fmt(hc.dem, view === 'day' || view === 'week' ? 2 : 0)} {unit}</>
      : <><b>{range}</b>: {used.map(x => `${SRC_LABEL[x.k]} ${fmt(cols.reduce((a, c) => a + c.v[x.k], 0), 0)}`).join(' · ')} kWh · total {fmt(sumAll, 0)} kWh. Hover a bar{view !== 'day' ? ', click to open it' : ''}.</>}</p>
    <div className="hr-plot">
      <svg className="pw-dchart" viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label={`Load by source, ${view} view, ${unit}`} onMouseLeave={() => setHover(null)}>
        {ticks.map(t => <g key={t}><line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className={t === 0 ? 'hr-zero' : 'hr-grid'} /><text x={ml - 6} y={y(t) + 3.5} textAnchor="end" className="hr-tick">{fmt(t, step < 1 ? 1 : 0)}</text></g>)}
        {cols.map((c, i) => { let up = 0; const gap = bw > 6 ? 1.5 : 0; return <g key={i} opacity={hover != null && hover !== i ? 0.55 : 1}>{SRC.map(x => { const v = c.v[x.k]; if (v <= 1e-9) return null;
          const r = <rect key={x.k} x={ml + i * bw + gap} width={Math.max(0.6, bw - 2 * gap)} y={y(up + v)} height={Math.max(0, y(up) - y(up + v))} fill={x.c} className="pw-stack" />; up += v; return r; })}</g>; })}
        <path d={cols.map((c, i) => (i ? 'L' : 'M') + (ml + (i + 0.5) * bw).toFixed(1) + ' ' + y(c.dem).toFixed(1)).join('')} fill="none" stroke="var(--fg)" strokeWidth={1.4} />
        {(view === 'day' || view === 'month') && cols.map((c, i) => (view === 'day' ? (i + 1) % 3 === 0 : (i + 1) % 5 === 0 || i === 0) ? <text key={'t' + i} x={ml + i * bw + bw / 2} y={Ht - 9} textAnchor="middle" className="hr-tick">{view === 'day' ? i + 1 : i + 1}</text> : null)}
        {view === 'week' && Array.from({ length: 7 }, (_, j) => <text key={'w' + j} x={ml + (j + 0.5) * 24 * bw} y={Ht - 9} textAnchor="middle" className="hr-tick">{dateOf(wk0 + j)}</text>)}
        {view === 'year' && cols.map((c, i) => <text key={'m' + i} x={ml + i * bw + bw / 2} y={Ht - 9} textAnchor="middle" className="hr-tick">{c.label}</text>)}
        <rect x={ml} y={mt} width={W - ml - mr} height={ph} fill="transparent" style={{ cursor: view === 'day' ? 'default' : 'pointer' }}
          onMouseMove={e => setHover(pickAt(e))}
          onClick={e => { const c = cols[pickAt(e)]; if (c.go == null) return; if (view === 'year') { setView('month'); go(c.go); } else if (view === 'month' || view === 'week') { setView('day'); go(c.go); } }} />
      </svg>
    </div>

    <h4 className="hr-sub">Load on each source <span className="muted">· kWh, and the peak load in kW</span></h4>
    <div className="tbl-wrap"><table className="hr-tbl pw-src">
      <thead><tr><th>Source</th><th>Year, kWh</th><th>Share</th><th>Peak load, kW</th><th>Peak at</th><th>Hours in use</th><th>Average day, kWh</th><th>Peak day, kWh</th><th>Average week, kWh</th><th>Peak week, kWh</th><th>Average month, kWh</th><th>Peak month, kWh</th></tr></thead>
      <tbody>{st.filter(x => x.kWh > 1e-6).map(x => { const at = when(D.year, x.peakAt);
        return <tr key={x.key}><td><i className="pw-sw" style={{ background: SRC.find(y => y.k === x.key)!.c }} />{SRC_LABEL[x.key]}</td><td><b>{fmt(x.kWh, 0)}</b></td><td>{fmt(R.demandKWh > 0 ? x.kWh / R.demandKWh * 100 : 0, 1)}%</td>
          <td>{fmt(x.peakKW, 2)}</td><td>{at.d} {MONTHS[at.m]} {hh(at.h)}</td><td>{fmt(x.hours, 0)}</td>
          <td>{fmt(x.day.avg, 0)}</td><td><button className="btn sm pw-link" type="button" onClick={() => { setView('day'); go(x.day.peakDay); }}>{fmt(x.day.peak, 0)}</button> <span className="muted">{dateOf(x.day.peakDay)}</span></td>
          <td>{fmt(x.week.avg, 0)}</td><td><button className="btn sm pw-link" type="button" onClick={() => { setView('week'); go(x.week.peakFrom); }}>{fmt(x.week.peak, 0)}</button> <span className="muted">from {dateOf(x.week.peakFrom)}</span></td>
          <td>{fmt(x.month.avg, 0)}</td><td>{fmt(x.month.peak, 0)} <span className="muted">{MONTHS[x.month.peakMonth]}</span></td></tr>; })}
        <tr className="pw-total"><td>Demand</td><td>{fmt(R.demandKWh, 0)}</td><td>100%</td><td>{fmt(R.peakKW, 2)}</td><td>{dateOf(Math.floor(R.peakAt / 24))} {hh(R.peakAt % 24 + 1)}</td><td>{fmt(D.n, 0)}</td>
          <td>{fmt(R.demandKWh / days, 0)}</td><td>–</td><td>{fmt(R.demandKWh / (days / 7), 0)}</td><td>–</td><td>{fmt(R.demandKWh / 12, 0)}</td><td>–</td></tr>
      </tbody>
    </table></div>
    <h4 className="hr-sub">Load on each source by month <span className="muted">· kWh</span></h4>
    <div className="tbl-wrap"><table className="hr-tbl pw-srcm">
      <thead><tr><th>Source</th>{MONTHS.map(m => <th key={m}>{m}</th>)}<th>Year</th></tr></thead>
      <tbody>{st.filter(x => x.kWh > 1e-6).map(x => <tr key={x.key}><td><i className="pw-sw" style={{ background: SRC.find(y => y.k === x.key)!.c }} />{SRC_LABEL[x.key]}</td>{x.month.kWh.map((v, i) => <td key={i}>{fmt(v, 0)}</td>)}<td><b>{fmt(x.kWh, 0)}</b></td></tr>)}
        <tr className="pw-total"><td>Demand</td>{R.months.map((m, i) => <td key={i}>{fmt(m.demand, 0)}</td>)}<td>{fmt(R.demandKWh, 0)}</td></tr></tbody>
    </table></div>
  </div>;
}
/* days since the Monday of the week containing day k */
const dayOf = (year: number, k: number) => (new Date(Date.UTC(year, 0, 1 + k)).getUTCDay() + 6) % 7;
