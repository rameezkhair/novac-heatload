import { useState } from 'react';
import { ASSEMBLY_REFERENCES, getRequirement, type AssemblySurface, type BuildingUse } from '../engine/assemblyReference';

const USE_OPTIONS: { value: BuildingUse; label: string }[] = [
  { value: 'nonresidential', label: 'Nonresidential' },
  { value: 'residential', label: 'Residential' },
  { value: 'semiheated', label: 'Semiheated' },
];
const SURFACES: { value: AssemblySurface | 'All'; label: string }[] = [
  { value: 'All', label: 'All surfaces' },
  { value: 'Roof', label: 'Roof' },
  { value: 'Above-grade wall', label: 'Above-grade wall' },
  { value: 'Floor', label: 'Floor' },
];

export function AssemblyReferenceLibrary() {
  const [zone, setZone] = useState('');
  const [use, setUse] = useState<BuildingUse>('nonresidential');
  const [surface, setSurface] = useState<AssemblySurface | 'All'>('All');
  const references = ASSEMBLY_REFERENCES.filter(reference =>
    reference[0] === Number(zone) && (surface === 'All' || reference[1] === surface),
  );

  return <details className="assembly-library">
    <summary>ASHRAE 90.1-2004 envelope assembly reference</summary>
    <div className="body">
      <p className="hint" style={{ marginTop: 0 }}>
        Historical US reference only—not a UAE code limit. These are maximum assembly U-factors and minimum insulation R-values;
        the source does not provide material conductivity or insulation thickness. Use your project’s actual U-values in the calculator.
      </p>
      <div className="fgrid3">
        <label className="fld" htmlFor="assembly-zone"><span className="fl">Climate zone</span>
          <span className="in-u"><select id="assembly-zone" value={zone} onChange={event => setZone(event.target.value)}>
            <option value="">Choose a zone</option>
            {Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>Zone {index + 1}</option>)}
          </select></span>
        </label>
        <label className="fld" htmlFor="assembly-use"><span className="fl">Building use</span>
          <span className="in-u"><select id="assembly-use" value={use} onChange={event => setUse(event.target.value as BuildingUse)}>
            {USE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></span>
        </label>
        <label className="fld" htmlFor="assembly-surface"><span className="fl">Surface</span>
          <span className="in-u"><select id="assembly-surface" value={surface} onChange={event => setSurface(event.target.value as AssemblySurface | 'All')}>
            {SURFACES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></span>
        </label>
      </div>
      {zone ? <div className="tbl-wrap" style={{ marginTop: 12 }}>
        <table className="tl">
          <thead><tr><th>Assembly type</th><th>Maximum U (W/m²K)</th><th>Minimum insulation R (m²K/W)</th><th>Thickness</th></tr></thead>
          <tbody>{references.map((reference, index) => {
            const [uMax, minimumR] = getRequirement(reference, use);
            return <tr key={`${reference[0]}-${reference[1]}-${reference[2]}-${index}`}>
              <td>{reference[1]} · {reference[2]}</td><td>{uMax}</td><td>{minimumR}</td><td>Not specified</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <p className="hint">Choose a climate zone to view its assembly references.</p>}
      <p className="hint">Source: ASHRAE 90.1-2004, SI Tables 5.5-1 to 5.5-8. “ci” means continuous insulation; NR means no insulation R-value requirement.</p>
    </div>
  </details>;
}
