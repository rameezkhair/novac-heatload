/* Indoor air quality as a feature of its own: on this project, on a linked copy of another NOVAC project,
   or independently, with its own design conditions and rooms. */
import { useMemo } from 'react';
import { computeAll } from '../engine/calc';
import { projectChecks } from '../engine/checks';
import { exampleState, newProjectState } from '../engine/project';
import type { AppState, LinkMode, ProjectSnap } from '../engine/types';
import type { Computed } from '../engine/calc';
import type { Store } from '../state/store';
import { IaqSection } from './IaqSection';
import { ProjectLinkBar, linkedStore, saveCopy } from './ProjectLink';
import { DesignConditionsSection } from './ProjectSection';
import { RoomsSection } from './RoomsSection';
import { useToast } from './ui';

export function IaqLinked({ d, store }: { d: Computed; store: Store }) {
  const toast = useToast(), link = store.state.project.iaqLink ?? { mode: 'this' as LinkMode };
  const mode: LinkMode = link.mode === 'project' && !link.proj ? 'this' : link.mode;
  const setLink = (m: LinkMode, snap?: ProjectSnap | null) => store.update(s => {
    const l = (s.project.iaqLink ??= { mode: 'this' });
    l.mode = m; if (snap !== undefined) l.proj = snap as never;
    if (m === 'independent' && !l.solo) { const n = newProjectState(); n.project.name = 'Independent indoor air quality study'; l.solo = n as never; }
  });
  const target = (s: AppState) => mode === 'project' ? s.project.iaqLink?.proj?.state : mode === 'independent' ? s.project.iaqLink?.solo : undefined;
  const sub = mode === 'this' ? store : linkedStore(store, target, s => target(s)!);
  const st = sub.state;
  const d2 = useMemo(() => mode === 'this' ? d : computeAll(st.project, st.rooms), [mode, d, st]);
  const marks = useMemo(() => projectChecks(d2.p, d2.T, d2.rooms).marks, [d2]);

  const loadSample = () => {
    if (store.state.example) setLink('this');
    else { const ex = exampleState(); setLink('project', { name: ex.project.name, from: 'NOVAC sample example', state: ex }); }
    toast('Indoor air quality on the application’s sample example');
  };
  return <>
    <div className="btns pw-sample"><button className="btn sm" type="button" onClick={loadSample}>Load sample example</button>
      <span className="hint">Runs indoor air quality on the application’s sample example (Zarvela Business Centre){store.state.example ? ', which is open now' : ', linked as a copy so your project is not changed'}.</span></div>
    <ProjectLinkBar mode={mode} snap={link.proj} onChange={setLink}
      here="the rooms and conditions of the open project" independent="enter the design conditions and rooms here" />
    {mode !== 'this' && <details className="hr-req-box plink-inputs" open={mode === 'independent' || undefined}>
      <summary>{mode === 'independent' ? 'Inputs for this study' : `Customise the linked copy of ${link.proj?.name}`} <span className="muted">· design conditions and rooms used by the indoor air quality calculation</span></summary>
      <div className="body">
        <DesignConditionsSection store={sub} d={d2} marks={marks} />
        <RoomsSection store={sub} d={d2} />
        <div className="btns"><button className="btn sm" type="button" onClick={() => { saveCopy(st); toast('Saved as a project in this browser, under Open / Save'); }}>Save these inputs as a project in this browser</button></div>
      </div>
    </details>}
    <IaqSection d={d2} store={sub} />
  </>;
}
