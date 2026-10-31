import { useEffect, useMemo, useRef, useState } from 'react';
import { computeAll } from './engine/calc';
import { allChecks, applicable, projectChecks } from './engine/checks';
import { exampleState, migrate, newProjectState } from './engine/project';
import { ABBR, fileBase, scheduleTSV } from './engine/report';
import { canSaveInPlace, copyText, openProjectFile, saveProjectFile, type FileHandle } from './files';
import { deleteSaved, listSaved, saveToLibrary, useStore, type SavedProject, type Store } from './state/store';
import { EnvelopeSection } from './components/EnvelopeSection';
import { DesignConditionsSection, ProjectDetailsSection } from './components/ProjectSection';
import { PsychroSection } from './components/PsychroSection';
import { ReportView } from './components/ReportView';
import { RoomsSection } from './components/RoomsSection';
import { ScheduleSection } from './components/ScheduleSection';
import { ArmButton, ComplianceProvider, useToast } from './components/ui';

export default function App() {
  const store = useStore(), { state, undo, redo } = store, toast = useToast();
  const [report, setReport] = useState(() => location.hash === '#report');
  const [activeStep, setActiveStep] = useState(0);
  /* compliance checks and design basis stay hidden; per-input badges always show */
  const showC = false;
  const d = useMemo(() => computeAll(state.project, state.rooms), [state]);
  const { marks, limits } = useMemo(() => projectChecks(d.p, d.T, d.rooms), [d]);
  const checks = useMemo(() => allChecks(d, marks, limits).filter(applicable), [d, marks, limits]);
  const completed = workflowCompletion(state);
  const steps = [
    { title: 'Project details', description: 'Name the project and record the client, consultant and contractor.' },
    { title: 'Design conditions', description: 'Set the location and indoor and outdoor design conditions.' },
    { title: 'Psychrometric overview', description: 'Check the air states on the psychrometric chart.' },
    { title: 'Building envelope', description: 'Review envelope properties and cooling-system assumptions.' },
    { title: 'Spaces', description: 'Enter space areas, loads and surface details.' },
    { title: 'Heat load summary', description: 'Review the load schedule and generate a report.' },
  ];

  /* the project file on disk that Save writes back to, if any */
  const [file, setFile] = useState<FileHandle | null>(null);
  const replace = (s: typeof state, f: FileHandle | null = null) => { store.replace(s); setFile(f); setNameErr(false); };
  /* the project name is mandatory: leaving step 1 without one keeps the user there */
  const [nameErr, setNameErr] = useState(false);
  const navigateStep = (step: number) => {
    if (step !== 0 && !state.project.name.trim()) {
      setNameErr(true); setActiveStep(0); scrollTo(0, 0);
      setTimeout(() => document.getElementById('p-name')?.focus());
      return;
    }
    setActiveStep(step); scrollTo(0, 0);
  };
  const save = async (as: boolean) => {
    try {
      const r = await saveProjectFile(as ? null : file, fileBase(state.project.name) + '.novac.json', JSON.stringify(state, null, 1));
      if (r === 'download') toast('Project file downloaded');
      else if (r) { setFile(r); toast('Saved to ' + r.name); }
    } catch { toast('Could not save the file'); }
  };
  const saveRef = useRef(save); saveRef.current = save;

  useEffect(() => {
    const onHash = () => setReport(location.hash === '#report');
    addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash);
  }, []);
  const showReport = (on: boolean) => {
    if (on) location.hash = 'report'; else history.replaceState(null, '', location.pathname + location.search);
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

  return <ComplianceProvider value={showC}>
    <header className="top app-top">
      <div className="wrap">
        <div className="app-identity">
          <a className="app-brand" href="./" aria-label="NOVAC home">
            <span className="logo" aria-hidden="true">N</span>
            <span>NOVAC</span>
          </a>
          <div className="app-heading">
            <h1>Simplified heat load calculator</h1>
            <p className="tag">Room-by-room cooling demand · Made in UAE</p>
          </div>
        </div>
        <div className="actions app-actions">
          <span className="undo-grp">
            <button className="btn" type="button" title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={undo}>↶ Undo</button>
            <button className="btn" type="button" title="Redo (Ctrl+Y or Ctrl+Shift+Z)" disabled={!store.canRedo} onClick={redo}>↷ Redo</button>
          </span>
          <ProjectsMenu store={store} file={file} save={save} replace={replace} />
          <button className="btn" type="button" onClick={() => { replace(exampleState()); toast('Example loaded'); }}>Load example</button>
          <ArmButton className="btn danger" label="New project" armedLabel="Click again to clear all" onConfirm={() => { replace(newProjectState()); toast('New project started'); }} />
          <button className="btn" type="button" onClick={() => copyText(scheduleTSV(state, showC)).then(toast)}>Copy schedule for Excel</button>
          <button className="btn primary" type="button" onClick={() => showReport(true)}>Generate report</button>
          <details className="menu abbr-menu">
            <summary className="btn abbr-trigger">Abbreviations</summary>
            <div className="menu-pop">
              <h4>Abbreviations and symbols</h4>
              <dl className="abbr-grid">{ABBR.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
            </div>
          </details>
        </div>
      </div>
    </header>
    {report ? <ReportView state={state} onBack={() => showReport(false)} /> :
      <main className="wrap" id="calc">
        <nav className="workflow" aria-label="Calculator steps">
          <div className="workflow-stepper" id="workflow-stepper">
            {steps.map((step, index) => {
              const isComplete = completed[index];
              const status = isComplete ? 'Complete' : index === activeStep ? 'In progress' : 'Needs input';
              return <button
                key={step.title}
                className={'workflow-step' + (isComplete ? ' is-complete' : '')}
                type="button"
                data-step={index}
                aria-current={index === activeStep ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${step.title}. ${status}`}
                onClick={() => navigateStep(index)}
              >
                <span className="workflow-marker" aria-hidden="true">
                  {isComplete ? <svg viewBox="0 0 16 16" focusable="false"><path d="m3 8 3.2 3.2L13 4.5" /></svg> : index + 1}
                </span>
                <span className="workflow-label">
                  <span className="workflow-title">{step.title}</span>
                  <span className="workflow-status">{status}</span>
                </span>
              </button>;
            })}
          </div>
          <p className="workflow-caption"><b>Step {activeStep + 1} of {steps.length}</b><span aria-hidden="true">·</span>{steps[activeStep].description}</p>
        </nav>
        {activeStep === 0 && <ProjectDetailsSection store={store} showErr={nameErr} />}
        {activeStep === 1 && <DesignConditionsSection store={store} d={d} marks={marks} />}
        {activeStep === 2 && <PsychroSection d={d} />}
        {activeStep === 3 && <EnvelopeSection store={store} d={d} marks={marks} limits={limits} />}
        {activeStep === 4 && <RoomsSection store={store} d={d} />}
        {activeStep === 5 && <ScheduleSection d={d} checks={checks} />}
        <div className="workflow-controls" aria-label="Step navigation">
          {activeStep > 0
            ? <button className="btn" type="button" onClick={() => navigateStep(activeStep - 1)}>Previous</button>
            : <span />}
          {activeStep < steps.length - 1
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
    ...Object.values(p.cltd), ...Object.values(p.solar),
  ].every(hasNumber) && positive(p.ez);
  const rooms = state.rooms.length > 0 && state.rooms.every(room =>
    room.name.trim() !== '' && !!room.type
    && positive(room.qty) && positive(room.area) && positive(room.height)
    && [room.people, room.light, room.equip, room.oa, room.ach, room.ps, room.pl].every(value => hasNumber(value) && Number(value) >= 0));
  return [details, climate, climate, envelope, rooms, details && climate && envelope && rooms];
}

/* save and open projects: in this browser, or as .json files to share */
function ProjectsMenu({ store, file, save, replace }: {
  store: Store; file: FileHandle | null; save: (as: boolean) => Promise<void>; replace: (s: Store['state'], f?: FileHandle | null) => void;
}) {
  const [open, setOpen] = useState(false), [list, setList] = useState<SavedProject[]>([]), [savedId, setSavedId] = useState<string>();
  const toast = useToast(), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setList(listSaved());
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', close); return () => removeEventListener('mousedown', close);
  }, [open]);
  const s = store.state;
  return <div className="menu" ref={ref}>
    <button className="btn" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Projects ▾</button>
    {open && <div className="menu-pop">
      <h4>Project file</h4>
      {file && <div className="empty-note" title={file.name}>Saving to {file.name}</div>}
      <div className="btns">
        <button className="btn sm primary" type="button" title="Save (Ctrl+S)" onClick={() => { setOpen(false); save(false); }}>{canSaveInPlace() ? 'Save' : 'Save file'}</button>
        {canSaveInPlace() && <button className="btn sm" type="button" title="Save as (Ctrl+Shift+S)" onClick={() => { setOpen(false); save(true); }}>Save as…</button>}
        <button className="btn sm" type="button" onClick={async () => {
          let r; try { r = await openProjectFile(); } catch { toast('Could not open the file'); return; }
          if (!r) return;
          try { replace(migrate(JSON.parse(r.text)), r.handle); setSavedId(undefined); setOpen(false); toast('Project opened'); }
          catch { toast('That file is not a NOVAC project'); }
        }}>Open file…</button>
      </div>
      <div className="btns">
        <button className="btn sm" type="button" onClick={() => { const it = saveToLibrary(s, savedId); setSavedId(it.id); setList(listSaved()); toast('Saved in this browser: ' + it.name); }}>Save in browser</button>
      </div>
      <h4>Saved in this browser</h4>
      {list.length ? list.map(it => <div className="row" key={it.id}>
        <span className="nm" title={it.name}>{it.name}</span><span className="dt">{new Date(it.savedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
        <button className="btn sm" type="button" onClick={() => { try { replace(migrate(it.data)); setSavedId(it.id); setOpen(false); toast('Opened ' + it.name); } catch { toast('Could not open ' + it.name); } }}>Open</button>
        <ArmButton className="btn sm danger" label="×" armedLabel="Delete?" onConfirm={() => { deleteSaved(it.id); setList(listSaved()); if (savedId === it.id) setSavedId(undefined); }} />
      </div>) : <div className="empty-note">No saved projects yet. Your current work is also kept automatically.</div>}
    </div>}
  </div>;
}
