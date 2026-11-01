import { useState } from 'react';
import { MATERIALS, PRESETS, SURF, assemblyU, layerR, libOf, matOf, type AssemblyKind, type Layer, type MatCat, type MatLib } from '../engine/materials';
import { newTypeId, resolveProject } from '../engine/project';
import type { Project } from '../engine/types';
import { fmt } from '../engine/util';
import type { Store } from '../state/store';
import { NumInput, useToast } from './ui';
import { AssemblyReferenceLibrary } from './AssemblyReferenceLibrary';
import type { AssemblySurface } from '../engine/assemblyReference';

const LABEL: Record<AssemblyKind, string> = { wall: 'External wall', roof: 'Roof', partition: 'Partition wall' };
const LIBS: MatLib[] = ['UAE common', 'ASHRAE'];
const CATS = [...new Set(MATERIALS.map(m => m.cat))] as MatCat[];
const listOf = (kind: AssemblyKind) => kind === 'partition' ? 'partTypes' : 'wallTypes';

/* an existing external wall or partition type being rebuilt from its layers */
export interface BuilderTarget { kind: 'wall' | 'partition'; id: string }

/* build an assembly from material layers (outside to inside), work out its U-value by ISO 6946, and save it to the
   project: as a new external wall or partition type, onto an existing type, or as the roof. Materials come from two
   libraries: generic values for materials common in UAE construction, and ASHRAE's table of thermal properties. */
export function UValueBuilder({ store, kinds, target, onDone }: { store: Store; kinds: AssemblyKind[]; target?: BuilderTarget; onDone?: () => void }) {
  const toast = useToast(), p = store.state.project;
  const editing = target ? p[listOf(target.kind)].find(t => t.id === target.id) : undefined;
  const first = PRESETS.find(x => x.kind === (target?.kind ?? kinds[0]))!;
  const [kind, setKind] = useState<AssemblyKind>(target?.kind ?? kinds[0]);
  const [layers, setLayers] = useState<Layer[]>(() => (editing?.layers?.length ? editing.layers : first.layers).map(l => ({ ...l })));
  const [name, setName] = useState(editing?.name || first.name);
  const [lib, setLib] = useState<MatLib | 'all'>('all');
  /* two ways to get a U-value: build it from layers, or take ASHRAE 90.1's prescriptive value for a climate zone */
  const [tab, setTab] = useState<'layers' | 'ashrae'>('layers');
  const partition = kinds.includes('partition');
  const surfaces: AssemblySurface[] = partition ? ['Floor', 'Below-grade wall', 'Slab-on-grade floor'] : ['Above-grade wall', 'Roof', 'Opaque door', 'Vertical fenestration', 'Skylight'];
  const { R, U } = assemblyU(kind, layers), s = SURF[kind];
  const setLayer = (i: number, l: Partial<Layer>) => setLayers(ls => ls.map((x, j) => j === i ? { ...x, ...l } : x));
  const u2 = Math.round(U * 100) / 100;
  const shown = (lb: MatLib) => lib === 'all' || lib === lb;

  const save = () => {
    const nm = name.trim() || 'Custom ' + LABEL[kind].toLowerCase();
    /* the layers go with the U-value: the heat balance method uses them for thermal mass */
    const ls = layers.map(l => ({ ...l }));
    store.update(st => {
      if (kind === 'roof') { st.project.uRoof = u2; st.project.src.uRoof = 'custom'; st.project.roofLayers = ls; resolveProject(st.project as Project); return; }
      const list = st.project[listOf(kind)];
      const t = target ? list.find(x => x.id === target.id) : undefined;
      if (t) { t.name = nm; t.u = u2; t.layers = ls; } else list.push({ id: newTypeId(), name: nm, u: u2, layers: ls });
    });
    toast(kind === 'roof' ? `Roof U-value set to ${fmt(u2, 2)} W/m²K` : `${target ? 'Updated' : 'Saved'} ${LABEL[kind].toLowerCase()} type: ${nm} (U ${fmt(u2, 2)})`);
    onDone?.();
  };

  const body = <div className="body">
    <p className="hint" style={{ marginTop: 0 }}>Layers from outside to inside. U = 1 / (Rsi + Σ thickness ÷ λ + Rse), ISO 6946.
      Materials come from two libraries: <b>UAE common</b> (generic design values from ISO 10456 and CIBSE Guide A for materials used in UAE construction) and <b>ASHRAE</b> (ASHRAE's table of thermal properties of building and insulating materials, converted to SI).
      For insulation, thermal blocks and other certified products, use the manufacturer's certified value; Dubai Municipality and Estidama submissions require it.</p>
    <div className="fgrid uvb-top">
      {!target && kinds.length > 1 && <label className="fld"><span className="fl">Element</span><span className="in-u"><select aria-label="Element" value={kind} onChange={e => setKind(e.target.value as AssemblyKind)}>
        {kinds.map(k => <option key={k} value={k}>{LABEL[k]}</option>)}</select></span></label>}
      <label className="fld"><span className="fl">Start from a typical UAE assembly</span><span className="in-u"><select aria-label="Typical assembly" value="" onChange={e => {
        const pr = PRESETS.find(x => x.id === e.target.value); if (!pr) return;
        if (!target) setKind(pr.kind);
        setLayers(pr.layers.map(l => ({ ...l }))); setName(pr.name);
      }}>
        <option value="">Choose…</option>
        {(target ? [target.kind] : kinds).map(k => <optgroup key={k} label={LABEL[k]}>{PRESETS.filter(x => x.kind === k).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
      </select></span></label>
      <div className="fld"><span className="fl">Material library</span>
        <span className="uvb-libs" role="group" aria-label="Material library">{(['all', ...LIBS] as const).map(l =>
          <button key={l} type="button" aria-pressed={lib === l} onClick={() => setLib(l)}>{l === 'all' ? 'All' : l}</button>)}</span></div>
    </div>

    <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="exp ptbl uvb-tbl">
      <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 76 }} /><col style={{ width: 76 }} /><col style={{ width: 40 }} /></colgroup>
      <thead><tr><th>Layer (outside to inside)</th><th>Thickness (mm)</th><th>λ (W/mK)</th><th>R (m²K/W)</th><th></th></tr></thead>
      <tbody>
        <tr className="dis"><td>{kind === 'partition' ? 'Surface, side 1 (Rsi)' : 'Outside surface (Rse)'}</td><td /><td /><td className="n">{fmt(s.rse, 2)}</td><td /></tr>
        {layers.map((l, i) => { const m = matOf(l.m); return <tr key={i}>
          <td><select aria-label={`Layer ${i + 1} material`} title={m?.src} value={l.m} onChange={e => { const n = matOf(e.target.value); setLayer(i, { m: e.target.value, t: n?.r != null ? n.t : l.t }); }}>
            {/* the layer's own material always stays listed, even when its library is filtered out */}
            {LIBS.flatMap(lb => CATS.map(c => {
              const opts = MATERIALS.filter(x => libOf(x) === lb && x.cat === c && (shown(lb) || x.id === l.m));
              return opts.length ? <optgroup key={lb + c} label={`${lb} · ${c}`}>{opts.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null;
            }))}
          </select>{m && <span className={'uvb-lib ' + (libOf(m) === 'ASHRAE' ? 'ash' : 'uae')}>{libOf(m)}</span>}</td>
          <td>{m?.r != null ? <span className="muted">{m.t} (fixed)</span> : <NumInput label={`Layer ${i + 1} thickness`} min={0} step={5} value={l.t} onChange={v => setLayer(i, { t: Number(v) || 0 })} />}</td>
          <td className="n">{m?.k != null ? fmt(m.k, 3) : '–'}</td>
          <td className="n">{fmt(layerR(l), 3)}</td>
          <td className="n"><button className="btn sm" type="button" aria-label={`Remove layer ${i + 1}`} title="Remove" onClick={() => setLayers(ls => ls.filter((_, j) => j !== i))}>×</button></td>
        </tr>; })}
        <tr className="dis"><td>{kind === 'partition' ? 'Surface, side 2 (Rsi)' : 'Inside surface (Rsi)'}</td><td /><td /><td className="n">{fmt(s.rsi, 2)}</td><td /></tr>
        <tr className="addrow"><td colSpan={5}><button className="btn sm" type="button" onClick={() => setLayers(ls => [...ls, { m: lib === 'ASHRAE' ? 'a-cplaster' : 'plaster', t: 15 }])}>+ Add layer</button></td></tr>
      </tbody></table></div>
    <p className="hint">{s.note}. Hover a material for its source.</p>

    <div className="uvb-res">
      <label className="fld"><span className="fl">Name</span><span className="in-u"><input aria-label="Assembly name" type="text" value={name} onChange={e => setName(e.target.value)} /></span></label>
      <div className="fld"><span className="fl">Total R</span><span className="uvb-val">{fmt(R, 2)} <small>m²K/W</small></span></div>
      <div className="fld uvb-u"><span className="fl">U-value</span><span className="uvb-val">{fmt(U, 2)} <small>W/m²K</small></span></div>
      <button className="btn primary" type="button" disabled={!layers.length} onClick={save}>
        {kind === 'roof' ? 'Use as roof U-value' : target ? `Update this ${LABEL[kind].toLowerCase()} type` : `Save as ${LABEL[kind].toLowerCase()} type`}</button>
      {target && <button className="btn" type="button" onClick={onDone}>Cancel</button>}
    </div>
  </div>;

  /* editing an existing type opens inline; otherwise a collapsible builder inside the wall or partition section,
     with a tab for ASHRAE 90.1 values by climate zone */
  if (target) return <div className="uvb uvb-inline">{body}</div>;
  return <details className="uvb"><summary>U-value builder · {kinds.map((k, i) => i ? LABEL[k].toLowerCase() : LABEL[k]).join(' / ')}</summary>
    <div className="uvb-tabs" role="tablist" aria-label="U-value source">
      <button type="button" role="tab" aria-selected={tab === 'layers'} onClick={() => setTab('layers')}>Layers</button>
      <button type="button" role="tab" aria-selected={tab === 'ashrae'} onClick={() => setTab('ashrae')}>ASHRAE 90.1 by zone</button>
    </div>
    {tab === 'layers' ? body : <div className="body">
      {partition && <p className="hint" style={{ marginTop: 0 }}>ASHRAE 90.1 has no requirement for internal partitions; these are its floor, below-grade wall and slab values, applied to the floor U-value above.</p>}
      <AssemblyReferenceLibrary store={store} surfaces={surfaces} idp={partition ? 'asm-part' : 'asm-wall'} />
    </div>}
  </details>;
}
