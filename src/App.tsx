import { useEffect, useMemo, useRef, useState } from 'react';
import { computeAll } from './engine/calc';
import { allChecks, applicable, projectChecks } from './engine/checks';
import { exampleState, migrate, newProjectState } from './engine/project';
import { ABBR, fileBase, scheduleTSV } from './engine/report';
import { copyText, downloadFile, pickFile } from './files';
import { deleteSaved, listSaved, saveToLibrary, useStore, type SavedProject, type Store } from './state/store';
import { EnvelopeSection } from './components/EnvelopeSection';
import { ProjectSection } from './components/ProjectSection';
import { PsychroSection } from './components/PsychroSection';
import { ReportView } from './components/ReportView';
import { RoomsSection } from './components/RoomsSection';
import { ScheduleSection } from './components/ScheduleSection';
import { ArmButton, ComplianceProvider, useToast } from './components/ui';

const SHOW_KEY = 'novac-show-compliance';

export default function App() {
  const store = useStore(), { state, undo, redo } = store, toast = useToast();
  const [report, setReport] = useState(() => location.hash === '#report');
  const [showC, setShowC] = useState(() => { try { return localStorage.getItem(SHOW_KEY) === '1'; } catch { return false; } });
  const toggleC = () => { const v = !showC; setShowC(v); try { localStorage.setItem(SHOW_KEY, v ? '1' : '0'); } catch { /* not saved */ } };
  const d = useMemo(() => computeAll(state.project, state.rooms), [state]);
  const { marks, limits } = useMemo(() => projectChecks(d.p, d.T, d.rooms), [d]);
  const checks = useMemo(() => allChecks(d, marks, limits).filter(applicable), [d, marks, limits]);

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
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || report) return;
      const k = ev.key.toLowerCase(), blur = () => (document.activeElement as HTMLElement | null)?.blur?.();
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); blur(); undo(); }
      else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); blur(); redo(); }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [undo, redo, report]);

  return <ComplianceProvider value={showC}>
    <header className="top">
      <div className="wrap">
        <div>
          <h1>NOVAC <span>Simplified Thermal Load Calculator</span></h1>
          <p className="tag">Developed on ASHRAE's CLTD/CLF method, with checks against DBC, Al Sa'fat, Estidama and ASHRAE standards</p>
        </div>
        <div className="actions">
          <span className="undo-grp">
            <button className="btn" type="button" title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={undo}>↶ Undo</button>
            <button className="btn" type="button" title="Redo (Ctrl+Y or Ctrl+Shift+Z)" disabled={!store.canRedo} onClick={redo}>↷ Redo</button>
          </span>
          <ProjectsMenu store={store} />
          <button className="btn" type="button" aria-pressed={showC} title="Show or hide compliance checks and design basis, on screen and in the report" onClick={toggleC}>{showC ? 'Hide compliance' : 'Show compliance'}</button>
          <button className="btn" type="button" onClick={() => { store.replace(exampleState()); toast('Example loaded'); }}>Load example</button>
          <ArmButton className="btn danger" label="New project" armedLabel="Click again to clear all" onConfirm={() => { store.replace(newProjectState()); toast('New project started'); }} />
          <button className="btn" type="button" onClick={() => copyText(scheduleTSV(state, showC)).then(toast)}>Copy schedule for Excel</button>
          <button className="btn primary" type="button" onClick={() => showReport(true)}>Generate report</button>
        </div>
      </div>
    </header>
    {report ? <ReportView state={state} onBack={() => showReport(false)} /> :
      <main className="wrap" id="calc">
        <details className="abbr"><summary>Abbreviations and symbols</summary>
          <div className="body"><dl className="abbr-grid">{ABBR.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl></div></details>
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
function ProjectsMenu({ store }: { store: Store }) {
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
      <div className="btns">
        <button className="btn sm primary" type="button" onClick={() => { const it = saveToLibrary(s, savedId); setSavedId(it.id); setList(listSaved()); toast('Saved in this browser: ' + it.name); }}>Save in browser</button>
        <button className="btn sm" type="button" onClick={() => { downloadFile(fileBase(s.project.name) + '.novac.json', JSON.stringify(s, null, 1), 'application/json'); toast('Project file downloaded'); }}>Export file</button>
        <button className="btn sm" type="button" onClick={async () => {
          const text = await pickFile('.json,application/json'); if (text == null) return;
          try { store.replace(migrate(JSON.parse(text))); setSavedId(undefined); setOpen(false); toast('Project opened'); }
          catch { toast('That file is not a NOVAC project'); }
        }}>Open file</button>
      </div>
      <h4>Saved in this browser</h4>
      {list.length ? list.map(it => <div className="row" key={it.id}>
        <span className="nm" title={it.name}>{it.name}</span><span className="dt">{new Date(it.savedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
        <button className="btn sm" type="button" onClick={() => { try { store.replace(migrate(it.data)); setSavedId(it.id); setOpen(false); toast('Opened ' + it.name); } catch { toast('Could not open ' + it.name); } }}>Open</button>
        <ArmButton className="btn sm danger" label="×" armedLabel="Delete?" onConfirm={() => { deleteSaved(it.id); setList(listSaved()); if (savedId === it.id) setSavedId(undefined); }} />
      </div>) : <div className="empty-note">No saved projects yet. Your current work is also kept automatically.</div>}
    </div>}
  </div>;
}
