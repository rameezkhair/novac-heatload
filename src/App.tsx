import { useEffect, useMemo, useRef, useState } from 'react';
import { computeAll } from './engine/calc';
import { allChecks, applicable, projectChecks } from './engine/checks';
import { exampleState, migrate, newProjectState } from './engine/project';
import { ABBR, fileBase, scheduleTSV } from './engine/report';
import { canSaveInPlace, copyText, openProjectFile, saveProjectFile, type FileHandle } from './files';
import { deleteSaved, listSaved, saveToLibrary, useStore, type SavedProject, type Store } from './state/store';
import { EnvelopeSection } from './components/EnvelopeSection';
import { ProjectSection } from './components/ProjectSection';
import { PsychroSection } from './components/PsychroSection';
import { ReportView } from './components/ReportView';
import { RoomsSection } from './components/RoomsSection';
import { ScheduleSection } from './components/ScheduleSection';
import { ArmButton, ComplianceProvider, useToast } from './components/ui';

export default function App() {
  const store = useStore(), { state, undo, redo } = store, toast = useToast();
  const [report, setReport] = useState(() => location.hash === '#report');
  /* compliance checks and design basis stay hidden; per-input badges always show */
  const showC = false;
  const d = useMemo(() => computeAll(state.project, state.rooms), [state]);
  const { marks, limits } = useMemo(() => projectChecks(d.p, d.T, d.rooms), [d]);
  const checks = useMemo(() => allChecks(d, marks, limits).filter(applicable), [d, marks, limits]);

  /* the project file on disk that Save writes back to, if any */
  const [file, setFile] = useState<FileHandle | null>(null);
  const replace = (s: typeof state, f: FileHandle | null = null) => { store.replace(s); setFile(f); };
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
            <h1>Cooling load calculator</h1>
            <p className="tag">Made in UAE · designed around local climate and codes</p>
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
        {state.example && <div className="notice">Example data loaded: a small Dubai office. Replace the rooms and envelope values with your project's figures, or start a new project.</div>}
        <ProjectSection store={store} d={d} marks={marks} />
        <PsychroSection d={d} />
        <EnvelopeSection store={store} d={d} marks={marks} limits={limits} />
        <RoomsSection store={store} d={d} />
        <ScheduleSection d={d} checks={checks} />
      </main>}
  </ComplianceProvider>;
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
