import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeAll } from './engine/calc';
import { allChecks, applicable, projectChecks } from './engine/checks';
import { exampleState, migrate, newProjectState } from './engine/project';
import { fileBase } from './engine/report';
import { canSaveInPlace, openProjectFile, saveProjectFile, type FileHandle } from './files';
import { decodeProject, projectFromFile, projectHtml, projectInHash } from './projectFile';
import { deleteSaved, listSaved, savedWhen, saveToLibrary, useStore, type SavedProject, type Store } from './state/store';
import { EnvelopeSection } from './components/EnvelopeSection';
import { HourlySection } from './components/HourlySection';
import { DesignConditionsSection, ProjectDetailsSection } from './components/ProjectSection';
import { PsychroSection } from './components/PsychroSection';
import { ReportView } from './components/ReportView';
import { RoomsSection } from './components/RoomsSection';
import { ScheduleSection } from './components/ScheduleSection';
import { ArmButton, ComplianceProvider, useToast } from './components/ui';
import { PRO } from './pro';
import { DuctSection } from './components/DuctSection';
import { Library } from './components/Library';
import { CommunityChat, Forum, Support } from './components/Community';

/* pages opened from the small links under the header buttons; the calculator is the default */
const VIEWS = [['library', 'Library'], ['forum', 'Forum'], ['chat', 'Community chat'], ['support', 'Support']] as const;
type View = 'calc' | typeof VIEWS[number][0];
/* the indoor air quality step and its engines load when the step is first opened */
const IaqSection = lazy(() => import('./components/IaqSection').then(m => ({ default: m.IaqSection })));

/* step-bar markers for the Pro tools: hourly analysis, indoor air quality, energy audit, energy modelling */
const icon = (d: string) => <svg viewBox="0 0 24 24" focusable="false"><path d={d} /></svg>;
const PRO_ICONS = [
  icon('M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2'),
  icon('M3 8h12a3 3 0 10-3-3M3 12h16a3 3 0 11-3 3M3 16h8'),
  icon('M6 3h9l4 4v14H6zM9 12l2 2 4-4M9 17h7'),
  icon('M4 21V9l8-6 8 6v12M4 13h16M4 17h16'),
];
const LOCK = icon('M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z');
/* Pro add-ons, not built yet */
const ADDONS: [string, ReactNode][] = [
  ['Duct sizing', icon('M3 9h12v6H3zM15 10l6-3v10l-6-3')],
  ['Equipment schedules', icon('M4 4h16v16H4zM4 9h16M9 9v11')],
  ['Kitchen ventilation', icon('M4 20h16M6 20v-6h12v6M9 14V8l3-4 3 4v6')],
  ['Car park ventilation', icon('M5 17h14M6 17l1.5-5h9L18 17M8 17v2M16 17v2')],
  ['Staircase pressurisation', icon('M4 20h4v-4h4v-4h4V8h4M14 4h6v6')],
  ['Chiller selection', icon('M3 6h18v12H3zM7 10h10M7 14h6')],
  ['Pipes and pumps', icon('M3 12h6M15 12h6M12 9a3 3 0 100 6 3 3 0 000-6z')],
  ['District cooling', icon('M3 7h6v10h6V7h6')],
  ['Thermal storage', icon('M6 4h12v16H6zM6 12h12')],
  ['Green building', icon('M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l7-7')],
  ['Condensate recovery', icon('M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z')],
  ['Life-cycle cost', icon('M3 20h18M6 16v-4M11 16V8M16 16v-6')],
];

export default function App() {
  const store = useStore(), { state, undo, redo } = store, toast = useToast();
  const [report, setReport] = useState(() => location.hash === '#report');
  const [activeStep, setActiveStep] = useState(0);
  const [view, setView] = useState<View>('calc');
  /* compliance checks and design basis stay hidden; per-input badges always show */
  const showC = false;
  const d = useMemo(() => computeAll(state.project, state.rooms), [state]);
  const { marks, limits } = useMemo(() => projectChecks(d.p, d.T, d.rooms), [d]);
  const checks = useMemo(() => allChecks(d, marks, limits).filter(applicable), [d, marks, limits]);
  /* a step is ticked once its data is valid and the user has worked on it: edited a value there or continued past it */
  const valid = workflowCompletion(state);
  const [touched, setTouched] = useState<ReadonlySet<number>>(() => new Set());
  const touch = (step: number) => setTouched(t => t.has(step) ? t : new Set(t).add(step));
  const completed = valid.map((ok, i) => ok && touched.has(i));
  const steps = [
    { title: 'Project details', description: 'Name the project and record the client, consultant and contractor.' },
    { title: 'Design conditions', description: 'Set indoor and outdoor design conditions, then review the air states on the psychrometric chart.' },
    { title: 'Building envelope', description: 'Review envelope properties and cooling-system assumptions.' },
    { title: 'Spaces', description: 'Enter space areas, loads and surface details.' },
    { title: 'Heat load summary', description: 'Review the load schedule and generate a report.' },
    { title: 'Hourly analysis', description: 'See the heat balance loads hour by hour and month by month.', pro: true },
    { title: 'Indoor air quality', description: 'Design ventilation to ASHRAE 62.1, check indoor contaminants and select filters.', pro: true },
  ];
  /* Pro tools sit in their own row after the core steps; the ones without a step are not built yet */
  const CORE = steps.filter(s => !s.pro).length;
  const proSoon = ['Energy audit', 'Energy modelling'];
  const last = PRO.unlocked ? steps.length - 1 : CORE - 1;
  /* built add-ons open from the add-ons row: duct sizing is the step after the Pro tools */
  const DUCT = steps.length;
  const addonStep = { title: 'Duct sizing', description: 'Size supply ducts from the room airflows by equal friction or velocity, with fittings, the worst branch and fan pressure.' };
  const stepInfo = (i: number) => i === DUCT ? addonStep : steps[i];

  /* the project file on disk that Save writes back to, if any */
  const [file, setFile] = useState<FileHandle | null>(null);
  /* the browser-saved entry the open project came from, if any; Save in browser updates it */
  const [savedId, setSavedId] = useState<string>();
  const replace = (s: typeof state, f: FileHandle | null = null, saved?: string) => { store.replace(s); setFile(f); setSavedId(saved); setNameErr(false); setTouched(new Set()); };
  /* the project name is mandatory: leaving step 1 without one keeps the user there */
  const [nameErr, setNameErr] = useState(false);
  const navigateStep = (step: number) => {
    if (step === DUCT ? !PRO.ducts : step > last) return;
    /* the duct sizer can be used on its own, so it does not need a project name */
    if (step !== 0 && step !== DUCT && !state.project.name.trim()) {
      setNameErr(true); setActiveStep(0); scrollTo(0, 0);
      setTimeout(() => document.getElementById('p-name')?.focus());
      return;
    }
    if (step === activeStep + 1) touch(activeStep);
    setActiveStep(step); scrollTo(0, 0);
  };
  const save = async (as: boolean) => {
    try {
      /* a project opened from an older .json file keeps saving as .json; everything else saves as a .novac.html page */
      const json = !as && !!file?.name.toLowerCase().endsWith('.json');
      const data = json ? JSON.stringify(state, null, 1) : await projectHtml(state, location.href);
      const r = await saveProjectFile(as ? null : file, fileBase(state.project.name) + (json ? '.novac.json' : '.novac.html'), data);
      if (r === 'download') toast('Project file downloaded');
      else if (r) { setFile(r); toast('Saved to ' + r.name); }
    } catch { toast('Could not save the file'); }
  };
  const saveRef = useRef(save); saveRef.current = save;

  /* a project file opened in the browser arrives as #open=…: keep the work already here in this browser's saved
     projects, load the file's project, then clear the link so a reload does not load it again */
  /* a project loaded from the duct sizer: keep the work already open in this browser's saved projects, then load it */
  const loadKeeping = (incoming: typeof state, f: FileHandle | null) => {
    const current = store.state, kept = JSON.stringify(current) !== JSON.stringify(incoming);
    if (kept) { try { saveToLibrary(current, savedId); } catch { /* storage full: the project still loads */ } }
    replace(incoming, f);
    toast(`Loaded ${incoming.project.name || 'project'}${kept ? '. Your previous project is in Projects, saved in this browser' : ''}`);
  };
  const openFromHash = () => {
    /* #ducts opens the duct sizer directly */
    if (location.hash === '#ducts') { history.replaceState(null, '', location.pathname + location.search); if (PRO.ducts) { setView('calc'); setActiveStep(DUCT); } return; }
    const enc = projectInHash(location.hash);
    if (!enc) return;
    history.replaceState(null, '', location.pathname + location.search);
    decodeProject(enc).then(d => {
      const incoming = migrate(d), current = store.state;
      const kept = JSON.stringify(current) !== JSON.stringify(incoming);
      if (kept) { try { saveToLibrary(current, savedId); } catch { /* storage full: the incoming project still opens */ } }
      replace(incoming); setView('calc'); setActiveStep(0);
      toast(`Opened ${incoming.project.name || 'project'}${kept ? '. Your previous project is in Projects, saved in this browser' : ''}`);
    }, () => toast('Could not open that project file'));
  };
  const openFromHashRef = useRef(openFromHash); openFromHashRef.current = openFromHash;
  useEffect(() => {
    openFromHashRef.current();
    const onHash = () => { setReport(location.hash === '#report'); openFromHashRef.current(); };
    addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash);
  }, []);
  const showReport = (on: boolean) => {
    if (on) { location.hash = 'report'; setView('calc'); } else history.replaceState(null, '', location.pathname + location.search);
    setReport(on); scrollTo(0, 0);
  };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const k = ev.key.toLowerCase(), blur = () => (document.activeElement as HTMLElement | null)?.blur?.();
      /* save after the blur so a field being typed in is committed first */
      if (k === 's') { ev.preventDefault(); blur(); const as = ev.shiftKey; setTimeout(() => saveRef.current(as)); return; }
      if (report) return;
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); blur(); undo(); }
      else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); blur(); redo(); }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [undo, redo, report]);

  const stepButton = (title: string, index: number, marker: ReactNode) => {
    /* the heat load summary is the result of the steps before it, so it shows no progress or tick */
    const final = index === CORE - 1;
    const isComplete = !final && completed[index];
    const status = final ? '' : index === DUCT ? (index === activeStep ? 'Open' : 'Available')
      : isComplete ? 'Complete' : index === activeStep ? 'In progress' : valid[index] ? 'Not started' : 'Needs input';
    return <button
      key={title}
      className={'workflow-step' + (isComplete ? ' is-complete' : '')}
      type="button"
      data-step={index}
      aria-current={index === activeStep ? 'step' : undefined}
      aria-label={`${index < CORE ? `Step ${index + 1}` : 'Pro'}: ${title}${status ? '. ' + status : ''}`}
      onClick={() => navigateStep(index)}
    >
      <span className="workflow-marker" aria-hidden="true">
        {isComplete ? <svg viewBox="0 0 16 16" focusable="false"><path d="m3 8 3.2 3.2L13 4.5" /></svg> : marker}
      </span>
      <span className="workflow-label">
        <span className="workflow-title">{title}</span>
        {status && <span className="workflow-status">{status}</span>}
      </span>
    </button>;
  };

  /* a Pro tool that is locked or not built yet: shown in the Pro row but cannot be opened */
  const proUnavailable = (title: string, marker: ReactNode, status: string) =>
    <button key={title} className="workflow-soon" type="button" disabled aria-label={`${title}. ${status}`}>
      <span className="workflow-marker" aria-hidden="true">{marker}</span>
      <span className="workflow-label">
        <span className="workflow-title">{title}</span>
        <span className="workflow-status">{status}</span>
      </span>
    </button>;

  return <ComplianceProvider value={showC}>
    <header className="top app-top">
      <div className="wrap">
        <div className="app-identity">
          <a className="app-brand" href="/" aria-label="NOVAC home">
            <img className="logo" src="/novac-thermal-mark.svg" alt="" aria-hidden="true" />
            <span>NOVAC</span>
          </a>
          <div className="app-heading">
            <h1>Simplified Heat Load Calculator</h1>
            <p className="tag">Room-by-room cooling demand · Made in UAE</p>
          </div>
        </div>
        <div className="app-side">
          <div className="actions app-actions">
            <ProjectsMenu store={store} file={file} save={save} replace={replace} savedId={savedId} setSavedId={setSavedId} />
            <button className="btn" type="button" onClick={() => { replace(exampleState()); toast('Example loaded'); }}>Load example</button>
            <ArmButton className="btn danger" label="New project" armedLabel="Click again to clear all" onConfirm={() => { replace(newProjectState()); toast('New project started'); }} />
            <button className="btn primary" type="button" onClick={() => showReport(true)}>Generate report</button>
          </div>
          <div className="app-links">
            {VIEWS.map(([id, label]) => <button key={id} type="button" aria-pressed={view === id && !report}
              onClick={() => { setView(id); if (report) showReport(false); else scrollTo(0, 0); }}>{label}</button>)}
          </div>
        </div>
      </div>
    </header>
    {report ? <ReportView state={state} onBack={() => showReport(false)} /> :
      view !== 'calc' ? <main className="wrap">
        <div className="rbar"><button className="btn" type="button" onClick={() => { setView('calc'); scrollTo(0, 0); }}>Back to calculator</button></div>
        {view === 'library' ? <Library /> : view === 'forum' ? <Forum /> : view === 'chat' ? <CommunityChat /> : <Support onLibrary={() => { setView('library'); scrollTo(0, 0); }} />}
      </main> :
      <main className="wrap" id="calc" onChangeCapture={() => touch(activeStep)}>
        <nav className="workflow" aria-label="Calculator steps">
          <div className="workflow-stepper workflow-core" id="workflow-stepper">
            {steps.slice(0, CORE).map((step, index) => stepButton(step.title, index, index + 1))}
          </div>
          <div className="workflow-pro" role="group" aria-label="Pro tools">
            <span className="pro-badge">Pro</span>
            <div className="workflow-stepper">
              {steps.slice(CORE).map((step, i) => PRO.unlocked ? stepButton(step.title, CORE + i, PRO_ICONS[i]) : proUnavailable(step.title, LOCK, 'Locked · coming soon'))}
              {proSoon.map((title, i) => proUnavailable(title, PRO_ICONS[steps.length - CORE + i], 'Coming soon'))}
            </div>
          </div>
          <div className="workflow-pro" role="group" aria-label="Pro add-ons">
            <span className="pro-badge">Add-ons</span>
            <div className="workflow-stepper">
              {ADDONS.map(([title, marker]) => title === addonStep.title && PRO.ducts ? stepButton(title, DUCT, marker) : proUnavailable(title, marker, 'Coming soon'))}
            </div>
          </div>
          <p className="workflow-caption"><b>{activeStep < CORE ? `Step ${activeStep + 1} of ${CORE}` : `${activeStep === DUCT ? 'Add-on' : 'Pro'} · ${stepInfo(activeStep).title}`}</b><span aria-hidden="true">·</span>{stepInfo(activeStep).description}</p>
        </nav>
        <div className="step-panel" key={activeStep}>
          {activeStep === 0 && <ProjectDetailsSection store={store} showErr={nameErr} />}
          {activeStep === 1 && <>
            <DesignConditionsSection store={store} d={d} marks={marks} />
            <PsychroSection d={d} />
          </>}
          {activeStep === 2 && <EnvelopeSection store={store} d={d} marks={marks} limits={limits} />}
          {activeStep === 3 && <RoomsSection store={store} d={d} />}
          {activeStep === 4 && <ScheduleSection d={d} checks={checks} store={store} />}
          {activeStep === 5 && <HourlySection d={d} store={store} />}
          {activeStep === 6 && <Suspense fallback={<p className="hint">Loading the indoor air quality tools…</p>}><IaqSection d={d} store={store} /></Suspense>}
          {activeStep === DUCT && <DuctSection d={d} store={store} onLoad={loadKeeping} />}
        </div>
        <div className="workflow-controls" aria-label="Step navigation">
          {activeStep > 0
            ? <button className="btn" type="button" onClick={() => navigateStep(activeStep - 1)}>Previous</button>
            : <span />}
          {activeStep < last
            ? <button className="btn primary" type="button" onClick={() => navigateStep(activeStep + 1)}>Continue</button>
            : <span />}
        </div>
      </main>}
  </ComplianceProvider>;
}

function workflowCompletion(state: Store['state']): boolean[] {
  const p = state.project;
  const details = p.name.trim() !== '';
  const hasNumber = (value: unknown) => typeof value === 'number'
    ? Number.isFinite(value)
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
  const positive = (value: unknown) => hasNumber(value) && Number(value) > 0;
  const climate = !!p.location && !!p.subloc
    && [p.toDB, p.toWB, p.dr, p.elev, p.vDB, p.vWB, p.tiDB, p.tiRH].every(hasNumber)
    && Number(p.dr) >= 0 && Number(p.tiRH) >= 0 && Number(p.tiRH) <= 100;
  const envelope = !!p.codeset && [
    p.uPart, p.uCeil, p.uFloor, p.shade, p.tAdj, p.tSupply, p.sfS, p.sfL, p.diversity,
    p.uWall, p.uRoof, p.uGlass, p.shgc, p.uSky, p.shgcSky, p.ez, p.ervS, p.ervL, p.ervShare,
    p.aWall, p.aRoof, p.gRefl, p.frP, p.frL, p.frE,
  ].every(hasNumber) && positive(p.ez);
  const rooms = state.rooms.length > 0 && state.rooms.every(room =>
    room.name.trim() !== '' && !!room.type
    && positive(room.qty) && positive(room.area) && positive(room.height)
    && [room.people, room.light, room.equip, room.oa, room.ach, room.ps, room.pl].every(value => hasNumber(value) && Number(value) >= 0));
  const all = details && climate && envelope && rooms;
  return [details, climate, envelope, rooms, all, all, all];
}

/* save and open projects: in this browser, or as .json files to share */
function ProjectsMenu({ store, file, save, replace, savedId, setSavedId }: {
  store: Store; file: FileHandle | null; save: (as: boolean) => Promise<void>; replace: (s: Store['state'], f?: FileHandle | null, saved?: string) => void;
  savedId: string | undefined; setSavedId: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false), [list, setList] = useState<SavedProject[]>([]);
  const toast = useToast(), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setList(listSaved());
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', close); return () => removeEventListener('mousedown', close);
  }, [open]);
  const s = store.state;
  /* the open project's saved entry, if it still exists */
  const current = savedId && list.some(x => x.id === savedId) ? savedId : undefined;
  const saveBrowser = (id: string | undefined) => {
    try {
      const it = saveToLibrary(s, id); setSavedId(it.id); setList(listSaved());
      toast(`${id ? 'Updated' : 'Saved'} in this browser: ${it.name}, ${savedWhen(it.savedAt)}`);
    } catch { toast('Browser storage is full. Delete saved projects you no longer need, or save the project as a file.'); }
  };
  return <div className="menu" ref={ref}>
    <button className="btn" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Projects ▾</button>
    {open && <div className="menu-pop" id="projects-menu">
      <h4>Project file</h4>
      {file && <div className="empty-note" title={file.name}>Saving to {file.name}</div>}
      <div className="btns">
        <button className="btn sm primary" type="button" title="Save (Ctrl+S)" onClick={() => { setOpen(false); save(false); }}>{canSaveInPlace() ? 'Save' : 'Save file'}</button>
        {canSaveInPlace() && <button className="btn sm" type="button" title="Save as (Ctrl+Shift+S)" onClick={() => { setOpen(false); save(true); }}>Save as…</button>}
        <button className="btn sm" type="button" onClick={async () => {
          let r; try { r = await openProjectFile(); } catch { toast('Could not open the file'); return; }
          if (!r) return;
          try { replace(migrate(projectFromFile(r.text)), r.handle); setOpen(false); toast('Project opened'); }
          catch { toast('That file is not a NOVAC project'); }
        }}>Open file…</button>
      </div>
      <div className="btns">
        <button className="btn sm" type="button" onClick={() => saveBrowser(current)}>{current ? 'Save in browser (update)' : 'Save in browser'}</button>
        {current && <button className="btn sm" type="button" onClick={() => saveBrowser(undefined)}>Save as new copy in browser</button>}
      </div>
      <h4>Saved in this browser{list.length ? ` (${list.length})` : ''}</h4>
      {list.length ? <div className="saved-list">{list.map(it => <div className={'row' + (it.id === savedId ? ' cur' : '')} key={it.id}>
        <span className="nm" title={it.name}>
          <b>{it.name}</b>
          <span className="dt">Saved {savedWhen(it.savedAt)} · {it.data.rooms.length} room{it.data.rooms.length === 1 ? '' : 's'}{it.id === savedId ? ' · open now' : ''}</span>
        </span>
        <button className="btn sm" type="button" onClick={() => { try { replace(migrate(it.data), null, it.id); setOpen(false); toast('Opened ' + it.name); } catch { toast('Could not open ' + it.name); } }}>Open</button>
        <ArmButton className="btn sm danger" label="×" armedLabel="Delete?" onConfirm={() => { deleteSaved(it.id); setList(listSaved()); if (savedId === it.id) setSavedId(undefined); }} />
      </div>)}</div> : <div className="empty-note">No saved projects yet. Your current work is also kept automatically.</div>}
    </div>}
  </div>;
}
