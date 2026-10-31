import { useState } from 'react';
import { ASSEMBLY_REFERENCES, METRIC, UAE_STATIONS, getRequirement, insulationThickness, isFenestration, type AssemblySurface, type BuildingUse } from '../engine/assemblyReference';
import { matOf } from '../engine/materials';
import { newTypeId, resolveProject } from '../engine/project';
import type { Project } from '../engine/types';
import type { Store } from '../state/store';
import { useToast } from './ui';

const USE_OPTIONS: { value: BuildingUse; label: string }[] = [
  { value: 'nonresidential', label: 'Nonresidential' },
  { value: 'residential', label: 'Residential' },
  { value: 'semiheated', label: 'Semiheated' },
];
const SURFACE_LIST: AssemblySurface[] = ['Roof', 'Above-grade wall', 'Below-grade wall', 'Floor', 'Slab-on-grade floor', 'Opaque door', 'Vertical fenestration', 'Skylight'];
/* insulation used to turn a minimum R into a thickness; conductivities from the UAE materials library */
const INSULATIONS = ['xps', 'eps', 'pu', 'rw'];
/* what each element's value can be applied to in the project; C- and F-factors are reference only */
const ACTION: Partial<Record<AssemblySurface, string>> = {
  'Above-grade wall': 'Add as wall type', 'Opaque door': 'Add as wall type', Roof: 'Use as roof U', Floor: 'Use as floor U',
  'Vertical fenestration': 'Use for glazing', Skylight: 'Use for skylights',
};
const ZONES = ['0', '1', '2', '3', '4', '5', '6', '7', '8'];

export function AssemblyReferenceLibrary({ store }: { store: Store }) {
  const toast = useToast();
  /* the UAE is climate zone 0B (ASHRAE 169 Table A-6) */
  const [zone, setZone] = useState('0');
  const [use, setUse] = useState<BuildingUse>('nonresidential');
  const [surface, setSurface] = useState<AssemblySurface | 'All'>('All');
  const [ins, setIns] = useState('xps');
  const insMat = matOf(ins)!;
  const references = ASSEMBLY_REFERENCES.filter(reference =>
    reference[0] === Number(zone) && (surface === 'All' || reference[1] === surface),
  );
  const useLabel = USE_OPTIONS.find(o => o.value === use)!.label.toLowerCase();

  const apply = (surf: AssemblySurface, assembly: string, u: number, minimumR: string, shgc: number | null) => {
    const t = insulationThickness(minimumR, insMat.k!);
    const base = `ASHRAE 90.1-2022 CZ${zone} ${surf === 'Opaque door' ? assembly.toLowerCase() + ' door' : assembly.toLowerCase()} (${useLabel})`;
    const name = base + (t === '–' ? '' : `, ${t} ${insMat.name.replace(/ \(.*\)$/, '')}`);
    store.update(s => {
      const p = s.project;
      if (surf === 'Above-grade wall' || surf === 'Opaque door') p.wallTypes.push({ id: newTypeId(), name, u });
      else if (surf === 'Roof') { p.uRoof = u; p.src.uRoof = 'custom'; }
      else if (surf === 'Floor') p.uFloor = u;
      else if (surf === 'Vertical fenestration') { p.uGlass = u; p.src.uGlass = 'custom'; if (shgc != null) { p.shgc = shgc; p.src.shgc = 'custom'; } }
      else if (surf === 'Skylight') { p.uSky = u; p.src.uSky = 'custom'; if (shgc != null) { p.shgcSky = shgc; p.src.shgcSky = 'custom'; } }
      resolveProject(p as Project);
    });
    toast(surf === 'Above-grade wall' || surf === 'Opaque door' ? `Added wall type: ${name} (U ${u})`
      : isFenestration(surf) ? `${surf === 'Skylight' ? 'Skylight' : 'Glazing'} set to U ${u} W/m²K${shgc != null ? `, SHGC ${shgc}` : ''}`
      : `${surf} U-value set to ${u} W/m²K`);
  };

  return <details className="assembly-library">
    <summary>ASHRAE 90.1-2022 envelope requirements · zones 0 to 8, all elements</summary>
    <div className="body">
      <p className="hint" style={{ marginTop: 0 }}>
        ASHRAE 90.1-2022 prescriptive envelope tables (5.5-0 to 5.5-8) for every climate zone: roofs, walls, floors, slabs, opaque doors, glazing and skylights.
        Sharjah, Ajman, Umm Al Quwain, Fujairah and MOEI projects use climate zone 0. Apply a value to the project, or add a wall or door as an external wall type.
      </p>
      <div className="fgrid4 uvb-top">
        <label className="fld" htmlFor="assembly-zone"><span className="fl">Climate zone</span>
          <span className="in-u"><select id="assembly-zone" value={zone} onChange={event => setZone(event.target.value)}>
            {ZONES.map(z => <option key={z} value={z}>Zone {z}{z === '0' ? ' (UAE, 0B)' : ''}</option>)}
          </select></span>
        </label>
        <label className="fld" htmlFor="assembly-use"><span className="fl">Building use</span>
          <span className="in-u"><select id="assembly-use" value={use} onChange={event => setUse(event.target.value as BuildingUse)}>
            {USE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></span>
        </label>
        <label className="fld" htmlFor="assembly-surface"><span className="fl">Element</span>
          <span className="in-u"><select id="assembly-surface" value={surface} onChange={event => setSurface(event.target.value as AssemblySurface | 'All')}>
            <option value="All">All elements</option>
            {SURFACE_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select></span>
        </label>
        <label className="fld" htmlFor="assembly-ins"><span className="fl">Insulation for thickness</span>
          <span className="in-u"><select id="assembly-ins" value={ins} onChange={event => setIns(event.target.value)}>
            {INSULATIONS.map(id => { const m = matOf(id)!; return <option key={id} value={id}>{m.name}, λ {m.k}</option>; })}
          </select></span>
        </label>
      </div>
      <div className="tbl-wrap" style={{ marginTop: 12 }}>
        <table className="exp ptbl">
          <colgroup><col /><col style={{ width: 210 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} /></colgroup>
          <thead><tr><th>Element</th><th>Min. insulation R (m²K/W) or SHGC</th><th>Insulation thickness</th><th>Max. U / C / F</th><th></th></tr></thead>
          <tbody>{references.map((reference, index) => {
            const req = getRequirement(reference, use), fen = isFenestration(reference[1]), action = ACTION[reference[1]];
            const metric = METRIC[reference[1]];
            return <tr key={`${reference[0]}-${reference[1]}-${reference[2]}-${index}`}>
              <td>{reference[1]} · {reference[2]}</td>
              <td className="n">{fen ? (req.shgc == null ? 'SHGC NR' : `SHGC ≤ ${req.shgc}${req.vtShgc ? `, VT/SHGC ≥ ${req.vtShgc}` : ''}`) : req.minimumR}</td>
              <td className="n">{fen ? '–' : insulationThickness(req.minimumR, insMat.k!)}</td>
              <td className="n"><b>{metric === 'U' ? '' : metric + ' '}{req.max}</b> <span className="u">{req.unit}</span></td>
              <td className="n">{action
                ? <button className="btn sm" type="button" aria-label={`${action}: ${reference[1]} ${reference[2]}`}
                  onClick={() => apply(reference[1], reference[2], req.max, req.minimumR, req.shgc)}>{action}</button>
                : <span className="u" title="C-factor (below-grade wall) and F-factor (slab edge, per metre of perimeter) exclude air films and soil">Reference</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className="hint">Source: ANSI/ASHRAE/IES 90.1-2022 Tables 5.5-0 to 5.5-8, converted from the I-P edition (U and C × 5.678, F × 1.731, R × 0.1761).
        “ci” continuous insulation, “FC” filled cavity, “Ls” liner system, NR no requirement. Vertical fenestration limits apply up to 40% of gross wall area
        and skylights up to 3% of roof area (§5.5.4.2). “No cool roof” rows (Table 5.5.3.1.4) apply in zones 0 to 3 when the roof does not have a 3-year aged
        solar reflectance ≥ 0.55 with emittance ≥ 0.75, or SRI ≥ 64 (§5.5.3.1.4). Insulation thickness = R × λ of the chosen insulation, rounded up to 5 mm;
        use the certified λ of the actual product. UAE stations in ASHRAE 169 Table A-6, all zone 0B: {UAE_STATIONS.map(s => s[0]).join(', ')}.</p>
    </div>
  </details>;
}
