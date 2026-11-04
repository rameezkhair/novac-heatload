/* Project link for the Pro features (indoor air quality, energy modelling): work on this project, on a copy of another
   NOVAC project (saved in this browser or a .novac file), or independently on the feature's own inputs. */
import { useState, type ReactNode } from 'react';
import { migrate } from '../engine/project';
import type { AppState, LinkMode, ProjectSnap } from '../engine/types';
import { openProjectFile } from '../files';
import { projectFromFile } from '../projectFile';
import { listSaved, savedWhen, saveToLibrary, type Store } from '../state/store';
import { useToast } from './ui';

export function ProjectLinkBar({ mode, snap, onChange, here, independent, extra }: {
  mode: LinkMode; snap?: ProjectSnap | null; onChange: (mode: LinkMode, snap?: ProjectSnap | null) => void;
  /* what each option means for this feature */
  here: string; independent: string; extra?: ReactNode;
}) {
  const toast = useToast(), [pick, setPick] = useState(false);
  const saved = pick ? listSaved() : [];
  const load = (state: AppState, from: string) => { onChange('project', { name: state.project.name || 'Untitled project', from, state }); setPick(false); toast(`Linked to ${state.project.name || 'project'}`); };
  const openFile = async () => {
    let r; try { r = await openProjectFile(); } catch { toast('Could not open the file'); return; }
    if (!r) return;
    try { load(migrate(projectFromFile(r.text)), `File ${r.handle?.name || ''}`.trim()); } catch { toast('That file is not a NOVAC project'); }
  };
  return <div className="hr-card plink">
    <h3>Project link</h3>
    <div className="seg" role="group" aria-label="Project link" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
      <button type="button" aria-pressed={mode === 'this'} onClick={() => onChange('this', snap)}>This project <span>{here}</span></button>
      <button type="button" aria-pressed={mode === 'project'} onClick={() => { if (snap) onChange('project', snap); else setPick(true); }}>Existing NOVAC project <span>a copy, saved in this browser or a file</span></button>
      <button type="button" aria-pressed={mode === 'independent'} onClick={() => onChange('independent', snap)}>Work independently <span>{independent}</span></button>
    </div>
    {mode === 'project' && snap && !pick && <p className="hint">Linked to <b>{snap.name}</b> <span className="muted">· {snap.from}</span>. Changes here go to this linked copy and are saved with the open project. <button className="btn sm" type="button" onClick={() => setPick(true)}>Change project</button></p>}
    {pick && <div className="plink-pick">
      <p className="hint">Pick a NOVAC project. A copy is linked, so the original is not changed.</p>
      {saved.length ? <ul className="roof-found">{saved.map(x => <li key={x.id}><button className="btn sm" type="button" onClick={() => load(migrate(JSON.parse(JSON.stringify(x.data))), `Saved in this browser, ${savedWhen(x.savedAt)}`)}>{x.name || 'Untitled'} <span className="muted">· {savedWhen(x.savedAt)}</span></button></li>)}</ul>
        : <p className="hint">No projects are saved in this browser yet.</p>}
      <div className="btns"><button className="btn sm" type="button" onClick={openFile}>Open a .novac file…</button><button className="btn sm" type="button" onClick={() => setPick(false)}>Cancel</button></div>
    </div>}
    {extra}
  </div>;
}

/* a store that reads and writes a linked copy kept inside the open project, so edits are saved and undoable with it */
export function linkedStore(store: Store, get: (s: AppState) => AppState | undefined, ensure: (s: AppState) => AppState): Store {
  const state = get(store.state)!;
  return {
    ...store, state,
    update: (fn, group) => store.update(s => { fn(ensure(s as AppState) as never); }, group && 'link.' + group),
    replace: next => store.update(s => { const t = ensure(s as AppState); Object.assign(t, JSON.parse(JSON.stringify(next))); }),
  };
}

/* save a linked copy as a project of its own in this browser */
export function saveCopy(st: AppState) { return saveToLibrary(JSON.parse(JSON.stringify(st))); }
