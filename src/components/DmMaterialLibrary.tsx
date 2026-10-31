import { useMemo, useState } from 'react';
import { DM_CERTIFIED_MATERIALS } from '../engine/dmMaterialReference';

const SAFAT_PAGE = 'https://www.dm.gov.ae/municipality-business/al-safat-dubai-green-building-system/';
const SAFAT_PDF = 'https://dmpmedia.dm.gov.ae/uploads/2023/01/Al-Safat-%E2%80%93-Dubai-Green-Building-System-2nd-editionJan2023.pdf';
const MATERIALS_PDF = 'https://dmpmedia.dm.gov.ae/uploads/2019/08/List-of-Manufacturers-of-Certified-Thermal-Insulation.pdf';

export function DmMaterialLibrary() {
  const [query, setQuery] = useState('');
  const materials = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return DM_CERTIFIED_MATERIALS;
    return DM_CERTIFIED_MATERIALS.filter(material =>
      [material.company, material.product, material.certificate, material.standard]
        .some(value => value.toLocaleLowerCase().includes(term)),
    );
  }, [query]);

  return <details className="dm-material-library">
    <summary>Dubai Municipality materials &amp; U-value reference</summary>
    <div className="body">
      <p className="hint" style={{ marginTop: 0 }}>
        Dubai Municipality publishes U-value limits for building elements, not U-values or conductivity for each insulation product.
        The certified-material list below does not include product thermal values, so none are inferred here.
      </p>
      <div className="tbl-wrap" style={{ marginTop: 12 }}>
        <table className="tl cmp">
          <thead><tr><th>Building element</th><th>Silver Sa’fa max U</th><th>Gold / Platinum max U</th><th>Basis</th></tr></thead>
          <tbody>
            <tr><td>Roof</td><td>0.30 W/m²K</td><td>0.30 W/m²K</td><td>Average element U-value</td></tr>
            <tr><td>External wall and exposed floor</td><td>0.57 W/m²K</td><td>0.42 W/m²K</td><td>Average element U-value</td></tr>
            <tr><td>Glazing, window-to-wall ratio below 40%</td><td>2.1 W/m²K</td><td>1.9 W/m²K</td><td>Summer U-value limit</td></tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        Al Sa’fat 2nd edition (January 2023), Tables 501.01(1)–(2), pages 50–51. These are element-level code limits;
        they must not be used as an individual material’s U-value or as a substitute for the project’s assembly U-value.
      </p>

      <h3 style={{ margin: '20px 0 8px' }}>DM certified thermal-insulation directory</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        This Dubai Municipality directory contains 127 manufacturer/product certification entries. Its PDF says “valid as of
        10 January 2021”; this historical snapshot is not confirmation of current certificate status. Product U-value and
        conductivity are not published in the directory. Some names or standard labels are clipped in the source and marked
        with ellipses here; check the linked PDF for the original record.
      </p>
      <div className="fgrid one" style={{ marginTop: 12 }}>
        <label className="fld" htmlFor="dm-material-search"><span className="fl">Search manufacturer, product, certificate, or standard</span>
          <span className="in-u"><input id="dm-material-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. polystyrene or CL05020001" /></span>
        </label>
      </div>
      <p className="hint" aria-live="polite">Showing {materials.length} of {DM_CERTIFIED_MATERIALS.length} directory entries.</p>
      {materials.length ? <div className="tbl-wrap" style={{ marginTop: 8 }}>
        <table className="tl dm-material-directory">
          <thead><tr><th>Manufacturer</th><th>Certified material / product</th><th>Certificate</th><th>Standard</th><th>U-value</th><th>PDF page</th></tr></thead>
          <tbody>{materials.map(material => <tr key={material.certificate}>
            <td>{material.company}</td><td>{material.product}</td><td>{material.certificate}</td><td>{material.standard}</td>
            <td>Not provided</td><td>{material.pdfPage}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="hint">No directory entries match “{query}”. Try a manufacturer, material, certificate number, or standard.</p>}

      <p className="hint dm-source-links">
        Official sources: <a href={SAFAT_PAGE} target="_blank" rel="noreferrer">Dubai Municipality Al Sa’fat page</a> ·{' '}
        <a href={SAFAT_PDF} target="_blank" rel="noreferrer">2023 Al Sa’fat system (PDF)</a> ·{' '}
        <a href={MATERIALS_PDF} target="_blank" rel="noreferrer">Certified thermal-insulation directory (PDF)</a>.
      </p>
    </div>
  </details>;
}
