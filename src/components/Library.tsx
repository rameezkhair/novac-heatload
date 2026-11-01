/* Library: the methods, authority regulations and ASHRAE standards the calculator uses, from the same engine data
   that sets its defaults and checks, so the library, the inputs and the report never disagree. Each topic
   downloads as a PDF. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { A170, ACT, AUTH, ENVK, INDOOR, LIB, LOC, LPD_BAM, OUT_OPTS, PMETA, VENT, VENT_OPTS, bamWm2 } from '../engine/data';
import { ABBR, HBM_ITEMS } from '../engine/report';
import { A621, A901, CLM, DBC_H4, SAFAT_DG, type Digest } from '../engine/digests';
import { downloadPdf } from '../files';
import { SecHead, useToast } from './ui';

type Cat = 'Methods' | 'Regulations' | 'ASHRAE standards' | 'General';
interface Topic { id: string; cat: Cat; title: string; body: () => ReactNode }
const CATS: Cat[] = ['Methods', 'Regulations', 'ASHRAE standards', 'General'];

const isAshrae = (src: string) => src.startsWith('ASHRAE');
const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) =>
  <div className="tbl-wrap"><table className="tl cmp">
    <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
/* method items are static engine HTML (equations with sub- and superscripts) */
const Items = ({ items }: { items: string[] }) => <ol className="lib-items">{items.map(h => <li key={h} dangerouslySetInnerHTML={{ __html: h }} />)}</ol>;
const envRows = (keep: (src: string) => boolean) => ENVK.flatMap(k => LIB[k].filter(o => keep(o.src)).map(o => [PMETA[k][0], o.label, `${o.v}${PMETA[k][1] ? ' ' + PMETA[k][1] : ''}`, o.src]));
const designRows = (keep: (src: string) => boolean) => [
  ...OUT_OPTS.filter(o => keep(o.src)).map(o => ['Outdoor cooling design', o.label.split(' · ')[0], `${o.db} °C DB / ${o.wb} °C WB`, o.src]),
  ...VENT_OPTS.filter(o => o.db != null && keep(o.src)).map(o => ['Fresh-air design', o.label.split(' · ')[0], `${o.db} °C DB / ${o.wb} °C WB`, o.src]),
  ...INDOOR.filter(o => keep(o.src)).map(o => ['Indoor design', o.label.split(' · ')[0], `${o.db} °C / ${o.rh}% RH`, o.src]),
];

/* official sources: links to each authority's or ASHRAE's own page or PDF; the documents stay with their publishers */
interface Doc { title: string; by: string; edition: string; uses: string; href: string }
const REG_DOCS: Doc[] = [
  { title: 'Dubai Building Code', by: 'Dubai Municipality', edition: '2021 edition', uses: 'Outdoor and fresh-air design conditions (Table H.1, H.4.6.4), indoor conditions and the HVAC clauses in this library', href: 'https://www.dm.gov.ae/municipality-business/planning-and-construction/dubai-building-code-2/' },
  { title: "Al Sa'fat – Dubai Green Building System", by: 'Dubai Municipality', edition: '2nd edition, January 2023', uses: 'Envelope limits (501.01), design conditions (501.03) and equipment efficiency (502.01)', href: 'https://www.dm.gov.ae/documents/al-safat-dubai-green-building-system-2nd-edition/' },
  { title: 'Abu Dhabi Cooling Load Manual', by: 'Department of Energy, Abu Dhabi', edition: '2026', uses: 'Abu Dhabi and Al Ain outdoor and fresh-air design conditions (Tables 1–2)', href: 'https://www.doe.gov.ae/-/media/Project/DOE/Department-Of-Energy/Media-Center-Publications/2026/July/CoolingLoadManual-eng.pdf' },
  { title: 'Abu Dhabi International Energy Conservation Code (ADIECC)', by: 'Department of Municipalities and Transport, Abu Dhabi', edition: '2013', uses: 'Equipment efficiency minimums (506.2)', href: 'https://www.dmt.gov.ae/-/media/Project/DMT/DMT/Codes/3-ADIECC-2013_1-12-2013.pdf' },
  { title: 'Barjeel Green Building Regulations', by: 'Ras Al Khaimah Municipality', edition: 'V1.3, 2025', uses: 'Envelope limits (301.01, 401.01), design conditions and equipment efficiency', href: 'https://reem.rak.ae/strategy/policies-regulations/green-building-regulations-barjeel/' },
];
const ASHRAE_DOCS: Doc[] = [
  { title: 'ASHRAE standards and guidelines', by: 'ASHRAE', edition: 'Current editions', uses: '90.1 envelope and lighting, 62.1 ventilation, 55 thermal comfort and 170 healthcare ventilation', href: 'https://www.ashrae.org/technical-resources/standards-and-guidelines' },
  { title: 'Read-only versions of ASHRAE standards', by: 'ASHRAE', edition: 'Free to read online', uses: 'Read many ASHRAE standards free of charge on ashrae.org', href: 'https://www.ashrae.org/technical-resources/standards-and-guidelines/read-only-versions-of-ashrae-standards' },
];
const Docs = ({ docs, note }: { docs: Doc[]; note: string }) => <>
  <p className="lib-intro">{note}</p>
  <ul className="lib-docs">{docs.map(d => <li key={d.href}>
    <div><b>{d.title}</b><span>{d.by} · {d.edition}</span><span>Used in NOVAC for: {d.uses}</span><span className="lib-url">{d.href}</span></div>
    <a className="btn" href={d.href} target="_blank" rel="noopener noreferrer">Open official source</a>
  </li>)}</ul>
</>;

/* a digest: NOVAC's summary of an authority document, section by section */
const KIND = { shall: 'Mandatory', should: 'Recommended', info: 'Note' } as const;
const DigestView = ({ d }: { d: Digest }) => <div className="digest">
  <div className="digest-meta">
    <p><b>{d.by}</b> · {d.edition}</p>
    <p>{d.summary}</p>
    <p className="lib-intro">NOVAC's summary in its own words. The full text belongs to the publisher: <a href={d.href} target="_blank" rel="noopener noreferrer">official document</a><span className="lib-url"> ({d.href})</span>.</p>
  </div>
  {d.sections.map(s => <section key={s.title} className="digest-sec">
    <h4>{s.title} <span>{s.ref}</span></h4>
    {s.table && <Table head={s.table.head} rows={s.table.rows} />}
    <ul>{s.items.map(i => <li key={i.text}><span className={'dg-kind ' + i.kind}>{KIND[i.kind]}</span><span>{i.text}</span></li>)}</ul>
    {s.novac && <p className="digest-novac"><b>In NOVAC:</b> {s.novac}</p>}
  </section>)}
</div>;

const TOPICS: Topic[] = [
  { id: 'hbm', cat: 'Methods', title: 'Heat balance method', body: () => <Items items={HBM_ITEMS.slice(0, 5)} /> },
  { id: 'sun', cat: 'Methods', title: 'Sun, glass and weather', body: () => <Items items={HBM_ITEMS.slice(5, 8)} /> },
  { id: 'gains', cat: 'Methods', title: 'Internal gains and adjacent spaces', body: () => <Items items={HBM_ITEMS.slice(8, 11)} /> },
  { id: 'air', cat: 'Methods', title: 'Ventilation and air loads', body: () => <Items items={HBM_ITEMS.slice(11, 14)} /> },
  { id: 'plant', cat: 'Methods', title: 'Plant load', body: () => <Items items={HBM_ITEMS.slice(14)} /> },

  { id: 'auth', cat: 'Regulations', title: 'Authorities by emirate', body: () => <Table
    head={['Emirate', 'Authority', 'Building code', 'Green code', 'Utility', 'Design conditions']}
    rows={Object.entries(AUTH).map(([k, a]) => [LOC[k]?.label ?? k, a.auth, a.code, a.green, a.util, a.design])} /> },
  { id: 'reg-design', cat: 'Regulations', title: 'Design conditions', body: () => <Table
    head={['Condition', 'Authority', 'Value', 'Source']} rows={designRows(s => !isAshrae(s))} /> },
  { id: 'reg-env', cat: 'Regulations', title: 'Envelope limits', body: () => <>
    <p className="lib-intro">Maximum permitted values. Al Sa'fat glazing limits depend on the glazing share of the wall and roof.</p>
    <Table head={['Property', 'Code and level', 'Limit', 'Source']} rows={envRows(s => !isAshrae(s))} />
  </> },
  { id: 'dbc-h4', cat: 'Regulations', title: 'Dubai Building Code, Part H.4 HVAC', body: () => <DigestView d={DBC_H4} /> },
  { id: 'safat', cat: 'Regulations', title: "Al Sa'fat – Dubai Green Building System", body: () => <DigestView d={SAFAT_DG} /> },
  { id: 'clm', cat: 'Regulations', title: 'Abu Dhabi Cooling Load Manual (2026)', body: () => <DigestView d={CLM} /> },
  { id: 'reg-docs', cat: 'Regulations', title: 'Official documents', body: () => <Docs docs={REG_DOCS} note="The full codes, published by each authority. Links open the authority's own website. Estidama is not listed because DMT's Pearl Rating System pages are currently unavailable." /> },

  { id: 'a901-cz0', cat: 'ASHRAE standards', title: 'ASHRAE 90.1-2022 climate zone 0 requirements', body: () => <DigestView d={A901} /> },
  { id: 'a901-env', cat: 'ASHRAE standards', title: 'ASHRAE 90.1-2022 envelope (climate zone 0)', body: () => <Table
    head={['Property', 'Construction', 'Limit', 'Source']} rows={envRows(isAshrae)} /> },
  { id: 'a901-lpd', cat: 'ASHRAE standards', title: 'ASHRAE 90.1-2022 lighting power (Building Area Method)', body: () => <Table
    head={['Building type', 'W/ft²', 'W/m²']} rows={LPD_BAM.map(([, l, w]) => [l, w, bamWm2(w)])} /> },
  { id: 'a621-vrp', cat: 'ASHRAE standards', title: 'ASHRAE 62.1-2022 Ventilation Rate Procedure', body: () => <DigestView d={A621} /> },
  { id: 'a621', cat: 'ASHRAE standards', title: 'ASHRAE 62.1-2025 ventilation rates (Table 6-1)', body: () => <Table
    head={['Category', 'Space', 'Rp, L/s·person', 'Ra, L/s·m²', 'Default people per 100 m²']}
    rows={VENT.map(v => [v.cat, v.label, v.rp, v.ra, v.dens])} /> },
  { id: 'a621-ez', cat: 'ASHRAE standards', title: 'ASHRAE 62.1 zone air distribution effectiveness (Table 6-4)', body: () => <Table
    head={['Air distribution', 'Ez']} rows={LIB.ez.map(o => [o.label, o.v])} /> },
  { id: 'a170', cat: 'ASHRAE standards', title: 'ASHRAE 170-2021 healthcare air changes (Table 7-1)', body: () => <Table
    head={['Space', 'Outdoor air, ACH', 'Total air, ACH']} rows={A170.map(([, l, oa, tot]) => [l, oa, tot])} /> },
  { id: 'fund-people', cat: 'ASHRAE standards', title: 'ASHRAE Fundamentals heat gain from people (Ch. 18 Table 1)', body: () => <Table
    head={['Activity', 'Sensible, W', 'Latent, W']} rows={ACT.map(a => [a.label, a.s, a.l])} /> },
  { id: 'fund-design', cat: 'ASHRAE standards', title: 'ASHRAE design conditions', body: () => <Table
    head={['Condition', 'Station', 'Value', 'Source']} rows={designRows(isAshrae)} /> },
  { id: 'ashrae-docs', cat: 'ASHRAE standards', title: 'Official documents', body: () => <Docs docs={ASHRAE_DOCS} note="ASHRAE standards are copyrighted and sold by ASHRAE. The tables in this library list only the values NOVAC uses; buy or read the full standards on ashrae.org." /> },

  { id: 'abbr', cat: 'General', title: 'Abbreviations', body: () => <dl className="lib-abbr">{ABBR.map(([a, d]) => <div key={a}><dt>{a}</dt><dd>{d}</dd></div>)}</dl> },
];

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function Library() {
  const toast = useToast();
  const [topic, setTopic] = useState(TOPICS[0].id);
  const t = TOPICS.find(x => x.id === topic)!;
  /* the topic being downloaded: rendered off-screen in print styling, then handed to the PDF writer */
  const [pdf, setPdf] = useState<Topic | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pdf || !paper.current) return;
    downloadPdf(`NOVAC_Library_${slug(pdf.title)}.pdf`, paper.current, ['tr', 'li', '.lib-abbr div', 'h3', '.digest-sec li', '.digest-sec h4'])
      .then(() => toast('PDF downloaded'), () => toast('Could not create the PDF'))
      .finally(() => setPdf(null));
  }, [pdf]);
  const download = (x: Topic) => { if (!pdf) setPdf(x); };

  return <section>
    <SecHead title="Library" sub="Calculation methods, UAE authority regulations and ASHRAE standards used by NOVAC" />
    <div className="lib">
      <nav className="lib-nav" aria-label="Library topics">
        {CATS.map(c => <div key={c} className="lib-cat">
          <h4>{c}</h4>
          {TOPICS.filter(x => x.cat === c).map(x => <button key={x.id} type="button" aria-current={x.id === topic ? 'true' : undefined} onClick={() => setTopic(x.id)}>{x.title}</button>)}
        </div>)}
      </nav>
      <article className="lib-body">
        <div className="lib-head">
          <div><p className="lib-kicker">{t.cat}</p><h3>{t.title}</h3></div>
          <div className="lib-dl">
            <button className="btn" type="button" disabled={!!pdf} onClick={() => download(t)}>{pdf ? 'Creating PDF…' : 'Download PDF'}</button>
          </div>
        </div>
        {t.body()}
        <p className="lib-note">A summary of the values NOVAC uses. Check the current edition from the authority or standard before submission.</p>
      </article>
    </div>
    {pdf && <div className="lib-offscreen" aria-hidden="true">
      <div className="lib-print" ref={paper}>
        <header><b>NOVAC Library</b><span>{pdf.cat} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></header>
        <h3>{pdf.title}</h3>
        {pdf.body()}
        <p className="lib-note">A summary of the values NOVAC uses. Check the current edition from the authority or standard before submission. Results are for design guidance.</p>
      </div>
    </div>}
  </section>;
}
