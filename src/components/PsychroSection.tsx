import { useMemo } from 'react';
import { stateTable, type Computed } from '../engine/calc';
import { psychroSVG, stateRows, type StateRow } from '../engine/charts';
import { fmt, num } from '../engine/util';
import { SecHead } from './ui';

const COL: Record<StateRow['c'], string> = { bad: 'var(--bad)', warn: 'var(--req)', ok: 'var(--ok)', acc: 'var(--accent)', mid: 'var(--bar)' };

/* key to the state-table columns, in table order */
const PSY_ABBR: [string, string][] = [
  ['DB', 'Dry-bulb temperature: air temperature read by an ordinary thermometer (°C)'],
  ['WB', 'Wet-bulb temperature: temperature of a wetted thermometer, lower as the air is drier (°C)'],
  ['RH', 'Relative humidity: moisture in the air as a share of the most it can hold at that temperature (%)'],
  ['DP', 'Dew point: temperature at which the air starts to condense on a surface (°C)'],
  ['W', 'Humidity ratio: grams of water vapour per kilogram of dry air (g/kg)'],
  ['h', 'Specific enthalpy: total heat content of the air, sensible plus latent (kJ/kg dry air)'],
];

export function PsychroSection({ d }: { d: Computed }) {
  /* the SVG is built from engine data only (numbers and fixed labels), so injecting it is safe */
  const svg = useMemo(() => psychroSVG(d, false, 'all'), [d]);
  const st = stateTable(d), T = d.T, shr = T.s + T.l > 0 ? T.s / (T.s + T.l) : 1;
  const row = (r: StateRow) => <tr key={r.k}><td><span className="dot" style={{ background: COL[r.c] }} /><b>{r.k}</b> {r.name}</td><td>{r.db}</td><td>{r.wb}</td><td>{r.rh}</td><td>{r.dp}</td><td>{r.w}</td><td>{r.h}</td></tr>;
  const grp = (t: string) => <tr className="grp"><td colSpan={7}>{t}</td></tr>;
  return <section>
    <SecHead n={3} title="Psychrometric overview" sub={`At ${fmt(d.e.P, 2)} kPa (${num(d.p.elev)} m). Room sensible heat ratio ${fmt(shr, 2)}.`} />
    <div className="psy-wrap">
      <div className="psy-box" dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <div className="tbl-wrap"><table className="states">
          <thead><tr><th>Point</th><th>DB °C</th><th>WB °C</th><th>RH %</th><th>DP °C</th><th>W g/kg</th><th>h kJ/kg</th></tr></thead>
          <tbody>{grp('Outdoor air')}{stateRows(d, 'out').filter(r => r.k !== 'M').map(row)}{grp('Indoor air')}{stateRows(d, 'in').map(row)}</tbody>
        </table></div>
        <dl className="abbr-grid psy-abbr" aria-label="Table abbreviations">{PSY_ABBR.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
        <p className="psy-note">
          {st.supersat && <><span className="warn">The supply point is above saturation: the room's latent load is too high for {num(d.p.tSupply)} °C supply air. Lower the supply temperature, raise the airflow, or treat latent load in the FAHU.</span>{' '}</>}
          Axes rescale automatically to the current design states. Supply humidity is set by the total room latent load over the total supply airflow. {d.p.fahu ? 'Fresh air is treated by the FAHU to room condition.' : 'Dashed lines: outdoor and return air mixing; solid: coil and room process.'} The green band is DBC Table H.3. Hover a point for its full state.
        </p>
      </div>
    </div>
  </section>;
}
