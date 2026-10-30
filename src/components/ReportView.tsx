import { useMemo, useRef } from 'react';
import type { AppState } from '../engine/types';
import { fileBase, reportBody, reportDoc, scheduleCSV } from '../engine/report';
import { copyText, downloadFile } from '../files';
import { useCompliance, useToast } from './ui';
import cssText from '../styles.css?raw';

/* report styles only, for the standalone file */
const reportCss = () => cssText.split('\n').filter(l => l.trim().startsWith('.rpt')).join('\n');

export function ReportView({ state, onBack }: { state: AppState; onBack: () => void }) {
  const toast = useToast(), paper = useRef<HTMLDivElement>(null), showC = useCompliance();
  /* report HTML is built by the engine, which escapes every user-entered string */
  const html = useMemo(() => reportBody(state, showC), [state, showC]);
  const base = fileBase(state.project.name);
  return <section className="wrap" aria-label="Calculation report">
    <div className="rbar">
      <button className="btn" type="button" onClick={onBack}>Back to calculator</button>
      <button className="btn primary" type="button" onClick={() => window.print()}>Print / save as PDF</button>
      <button className="btn" type="button" onClick={() => { downloadFile(base + '_report.html', reportDoc(state, reportCss(), showC), 'text/html'); toast('Report downloaded'); }}>Download report (.html)</button>
      <button className="btn" type="button" onClick={() => { downloadFile(base + '_schedule.csv', scheduleCSV(state), 'text/csv'); toast('Schedule downloaded'); }}>Download schedule (.csv)</button>
      <button className="btn" type="button" onClick={() => copyText(paper.current?.innerText || '', reportDoc(state, reportCss(), showC)).then(m => toast(m))}>Copy report</button>
      <span className="muted">Print on US Letter, or choose "Save as PDF" in the print dialog. Copy report pastes the formatted report into Word or Outlook.</span>
    </div>
    <div className="paper"><div className="rpt" ref={paper} dangerouslySetInnerHTML={{ __html: html }} /></div>
    <div style={{ height: 48 }} />
  </section>;
}
