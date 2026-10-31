import { efficiencyGuidance } from '../engine/efficiency';
import type { Computed } from '../engine/calc';
import type { Num, Project } from '../engine/types';
import type { Store } from '../state/store';
import { fmt, num } from '../engine/util';

export function EfficiencySection({ store, d }: { store: Store; d: Computed }) {
  const { p, T } = d, { update } = store;
  const capacity = T.plant / 1000, g = efficiencyGuidance(p, capacity);
  const set = (k: keyof Project, v: unknown) => update(s => { (s.project as Record<string, unknown>)[k] = v; }, 'p.' + k);
  const number = (k: 'ratedEer' | 'ratedSeer' | 'fanSfp', label: string, unit: string, step: number) => <label className="fld" key={k}>
    <span className="fl">{label}</span><span className="in-u"><input aria-label={label} type="number" min="0" step={step} value={p[k]} onChange={e => set(k, (e.target.value === '' ? '' : Number(e.target.value)) as Num)} />{unit && <span className="eff-unit">{unit}</span>}</span>
  </label>;
  const eer = num(p.ratedEer) || g.eer || 0, usingAuthorityTarget = !num(p.ratedEer) && !!g.eer, fanKw = Math.max(0, num(p.fanSfp) * T.sa / 1000);
  const totalKw = eer > 0 ? capacity * 3.41214 / eer : 0;
  const outdoorKw = eer > 0 ? Math.max(0, totalKw - fanKw) : 0;
  return <fieldset className="eff-box">
    <legend>Cooling efficiency &amp; electrical power estimate</legend>
    <div className="fgrid">
      <label className="fld"><span className="fl">Equipment type</span><span className="in-u"><select value={p.acType} onChange={e => set('acType', e.target.value)}>
        <option value="split">Non-ducted split AC</option><option value="ducted">Ducted split / packaged AC</option><option value="vrf">VRF / multi-split</option>
      </select></span></label>
      {number('ratedEer', 'Product EER at T3 (certified)', 'Btu/Wh', 0.1)}
      {number('ratedSeer', 'Product SEER / CSPF (if published)', '', 0.1)}
      {number('fanSfp', 'Indoor fan allowance', 'W/(L/s)', 0.1)}
    </div>
    <div className="eff-guidance"><b>{g.authority}</b><br /><a href={g.href} target="_blank" rel="noopener">{g.source}</a> · {g.target}<p>{g.note}</p></div>
    <div className="eff-results">
      <div><span>Indoor units · fan input</span><b>{fmt(fanKw, 2)} kW</b><small>{fmt(T.sa, 0)} L/s × {fmt(num(p.fanSfp), 1)} W/(L/s), planning allowance</small></div>
        <div><span>Outdoor unit · compressor + condenser</span><b>{eer > 0 ? fmt(outdoorKw, 2) + ' kW' : 'Enter certified T3 EER'}</b><small>{eer > 0 ? `Estimated whole-system input ${fmt(totalKw, 2)} kW at ${usingAuthorityTarget ? 'recommended ' : 'entered '}EER ${fmt(eer, 2)}` : 'Calculated from plant cooling capacity and certified T3 EER'}</small></div>
      <div><span>Cooling capacity used</span><b>{fmt(capacity, 2)} kW</b><small>{fmt(T.plant / 3517, 2)} TR plant load including diversity</small></div>
      <div><span>Seasonal rating</span><b>{num(p.ratedSeer) > 0 ? fmt(num(p.ratedSeer), 2) : g.seer ? `Target ${fmt(g.seer, 2)} CSPF` : 'Use product label'}</b><small>Seasonal ratio is separate from full-load EER</small></div>
    </div>
    <p className="hint">Power is a preliminary matched-system estimate. EER describes indoor and outdoor equipment together; this display allocates indoor fan power using the entered allowance and assigns the remainder to the outdoor unit. Confirm both nameplate powers, electrical demand, and efficiency at the actual design conditions from the manufacturer’s submittal. SEER/CSPF is not converted to full-load watts.</p>
  </fieldset>;
}
