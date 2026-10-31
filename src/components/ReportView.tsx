import { useMemo, useRef, useState } from 'react';
import type { AppState } from '../engine/types';
import { fileBase, reportBody, reportDoc, scheduleCSV } from '../engine/report';
import { copyText, downloadFile, downloadPdf } from '../files';
import { useCompliance, useToast } from './ui';
import cssText from '../styles.css?raw';

/* report styles only, for the standalone file */
const reportCss = () => cssText.split('\n').filter(l => l.trim().startsWith('.rpt')).join('\n');

export function ReportView({ state, onBack }: { state: AppState; onBack: () => void }) {
  const toast = useToast(), paper = useRef<HTMLDivElement>(null), showC = useCompliance();
  const [busy, setBusy] = useState(false);
  /* report HTML is built by the engine, which escapes every user-entered string */
  const html = useMemo(() => reportBody(state, showC), [state, showC]);
  const base = fileBase(state.project.name);
  return <section className="wrap" aria-label="Calculation report">
    <div className="rbar">
      <button className="btn" type="button" onClick={onBack}>Back to calculator</button>
      <button className="btn primary" type="button" disabled={busy} onClick={async () => {
        if (!paper.current) return;
        setBusy(true);
        try { await downloadPdf(base + '_report.pdf', paper.current); toast('PDF downloaded'); }
        catch { toast('Could not create the PDF. Use Print and choose "Save as PDF".'); }
        finally { setBusy(false); }
      }}>{busy ? 'Creating PDF…' : 'Download PDF'}</button>
      <button className="btn" type="button" onClick={() => window.print()}>Print</button>
      <button className="btn" type="button" onClick={() => { downloadFile(base + '_report.html', reportDoc(state, reportCss(), showC), 'text/html'); toast('Report downloaded'); }}>Download report (.html)</button>
      <button className="btn" type="button" onClick={() => { downloadFile(base + '_schedule.csv', scheduleCSV(state), 'text/csv'); toast('Schedule downloaded'); }}>Download schedule (.csv)</button>
      <button className="btn" type="button" onClick={() => copyText(paper.current?.innerText || '', reportDoc(state, reportCss(), showC)).then(m => toast(m))}>Copy report</button>
      <span className="muted">Download PDF saves a US Letter PDF directly. For selectable text, use Print and choose "Save as PDF". Copy report pastes the formatted report into Word or Outlook.</span>
    </div>
    <div className="paper"><div className="rpt" ref={paper} dangerouslySetInnerHTML={{ __html: html }} /></div>
    <div style={{ height: 48 }} />
  </section>;
}
