import { useState } from 'react';
import { MATERIALS, PRESETS, SURF, assemblyU, layerR, matOf, type AssemblyKind, type Layer, type MatCat } from '../engine/materials';
import { newTypeId, resolveProject } from '../engine/project';
import type { Project } from '../engine/types';
import { fmt } from '../engine/util';
import type { Store } from '../state/store';
import { NumInput, useToast } from './ui';

const KINDS: [AssemblyKind, string][] = [['wall', 'External wall'], ['roof', 'Roof'], ['partition', 'Partition']];
const CATS = [...new Set(MATERIALS.map(m => m.cat))] as MatCat[];

/* build an assembly from material layers, work out its U-value, and save it to the project */
export function UValueBuilder({ store }: { store: Store }) {
  const toast = useToast();
  const [kind, setKind] = useState<AssemblyKind>('wall');
  const [layers, setLayers] = useState<Layer[]>(PRESETS[0].layers);
  const [name, setName] = useState(PRESETS[0].name);
  const { R, U } = assemblyU(kind, layers), s = SURF[kind];
  const setLayer = (i: number, l: Partial<Layer>) => setLayers(ls => ls.map((x, j) => j === i ? { ...x, ...l } : x));
  const u2 = Math.round(U * 100) / 100;

  const save = () => {
    const nm = name.trim() || 'Custom ' + KINDS.find(k => k[0] === kind)![1].toLowerCase();
    store.update(st => {
      /* the layers go with the U-value: the heat balance method uses them for thermal mass */
      const ls = layers.map(l => ({ ...l }));
      if (kind === 'roof') { st.project.uRoof = u2; st.project.src.uRoof = 'custom'; st.project.roofLayers = ls; resolveProject(st.project as Project); }
      else st.project[kind === 'wall' ? 'wallTypes' : 'partTypes'].push({ id: newTypeId(), name: nm, u: u2, layers: ls });
    });
    toast(kind === 'roof' ? `Roof U-value set to ${fmt(u2, 2)} W/m²K` : `Saved ${kind === 'wall' ? 'external wall' : 'partition'} type: ${nm} (U ${fmt(u2, 2)})`);
  };

  return <details className="uvb">
    <summary>U-value calculator · common UAE materials and assemblies</summary>
    <div className="body">
      <p className="hint" style={{ marginTop: 0 }}>Build a wall, roof or partition layer by layer (outside to inside). U = 1 / (Rsi + Σ thickness ÷ λ + Rse), ISO 6946.
        Material values are generic design values from ISO 10456, CIBSE Guide A and ASHRAE Fundamentals. For insulation, thermal blocks and other
        certified products, use the manufacturer's certified value; Dubai Municipality and Estidama submissions require it.</p>
      <div className="fgrid uvb-top">
        <label className="fld" htmlFor="uvb-kind"><span className="fl">Element</span><span className="in-u"><select id="uvb-kind" value={kind} onChange={e => setKind(e.target.value as AssemblyKind)}>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></span></label>
        <label className="fld" htmlFor="uvb-preset"><span className="fl">Start from a typical UAE assembly</span><span className="in-u"><select id="uvb-preset" value="" onChange={e => {
          const p = PRESETS.find(x => x.id === e.target.value); if (!p) return;
          setKind(p.kind); setLayers(p.layers.map(l => ({ ...l }))); setName(p.name);
        }}>
          <option value="">Choose…</option>
          {KINDS.map(([k, l]) => <optgroup key={k} label={l}>{PRESETS.filter(p => p.kind === k).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
        </select></span></label>
      </div>

      <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="exp ptbl uvb-tbl">
        <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 76 }} /><col style={{ width: 76 }} /><col style={{ width: 40 }} /></colgroup>
        <thead><tr><th>Layer (outside to inside)</th><th>Thickness (mm)</th><th>λ (W/mK)</th><th>R (m²K/W)</th><th></th></tr></thead>
        <tbody>
          <tr className="dis"><td>Outside surface (Rse)</td><td /><td /><td className="n">{fmt(s.rse, 2)}</td><td /></tr>
          {layers.map((l, i) => { const m = matOf(l.m); return <tr key={i}>
            <td><select aria-label={`Layer ${i + 1} material`} title={m?.src} value={l.m} onChange={e => { const n = matOf(e.target.value); setLayer(i, { m: e.target.value, t: n?.r != null ? n.t : l.t }); }}>
              {CATS.map(c => <optgroup key={c} label={c}>{MATERIALS.filter(x => x.cat === c).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
            </select></td>
            <td>{m?.r != null ? <span className="muted">{m.t} (fixed)</span> : <NumInput label={`Layer ${i + 1} thickness`} min={0} step={5} value={l.t} onChange={v => setLayer(i, { t: Number(v) || 0 })} />}</td>
            <td className="n">{m?.k != null ? fmt(m.k, 3) : '–'}</td>
            <td className="n">{fmt(layerR(l), 3)}</td>
            <td className="n"><button className="btn sm" type="button" aria-label={`Remove layer ${i + 1}`} title="Remove" onClick={() => setLayers(ls => ls.filter((_, j) => j !== i))}>×</button></td>
          </tr>; })}
          <tr className="dis"><td>Inside surface (Rsi)</td><td /><td /><td className="n">{fmt(s.rsi, 2)}</td><td /></tr>
          <tr className="addrow"><td colSpan={5}><button className="btn sm" type="button" onClick={() => setLayers(ls => [...ls, { m: 'plaster', t: 15 }])}>+ Add layer</button></td></tr>
        </tbody></table></div>
      <p className="hint">{s.note}. Hover a material for its source.</p>

      {/* one row: name, total R, U-value, save */}
      <div className="uvb-res">
        <label className="fld" htmlFor="uvb-name"><span className="fl">Name</span><span className="in-u"><input id="uvb-name" type="text" value={name} onChange={e => setName(e.target.value)} /></span></label>
        <div className="fld"><span className="fl">Total R</span><span className="uvb-val">{fmt(R, 2)} <small>m²K/W</small></span></div>
        <div className="fld uvb-u"><span className="fl">U-value</span><span className="uvb-val">{fmt(U, 2)} <small>W/m²K</small></span></div>
        <button className="btn primary" type="button" disabled={!layers.length} onClick={save}>
          {kind === 'roof' ? 'Use as roof U-value' : kind === 'wall' ? 'Save as external wall type' : 'Save as partition type'}</button>
      </div>
    </div>
  </details>;
}
