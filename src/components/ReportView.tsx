import { useCallback, useMemo, useRef, useState } from 'react';
import type { AppState } from '../engine/types';
import { fileBase, reportBody, reportDoc } from '../engine/report';
import { downloadFile, emailPdf } from '../files';
import { CONSENT_TEXT, subscribe, validEmail } from '../newsletter';
import { Modal, useCompliance, useToast } from './ui';
import cssText from '../styles.css?raw';

/* report styles only, for the standalone file */
const reportCss = () => cssText.split('\n').filter(l => l.trim().startsWith('.rpt')).join('\n');

export function ReportView({ state, onBack }: { state: AppState; onBack: () => void }) {
  const toast = useToast(), paper = useRef<HTMLDivElement>(null), showC = useCompliance();
  const [busy, setBusy] = useState(false);
  /* report HTML is built by the engine, which escapes every user-entered string */
  const html = useMemo(() => reportBody(state, showC), [state, showC]);
  const base = fileBase(state.project.name);
  const [ask, setAsk] = useState(false), closeAsk = useCallback(() => setAsk(false), []);
  const send = async (email: string, news: boolean) => {
    setAsk(false);
    if (!paper.current) return;
    /* the sign-up runs alongside the PDF; it never holds up or blocks the email */
    if (news) void subscribe(email, 'email-report');
    setBusy(true);
    const name = state.project.name || 'Project';
    try {
      const r = await emailPdf(base + '_report.pdf', paper.current, `Heat load report: ${name}`, `Please find attached the heat load calculation report for ${name}.`);
      if (r === 'mailto') toast('PDF downloaded. Attach it to the email that opened.');
    }
    catch { toast('Could not create the PDF. Use Print report (PDF), choose "Save as PDF" and attach it to an email.'); }
    finally { setBusy(false); }
  };
  return <section className="wrap" aria-label="Calculation report">
    <div className="rbar">
      <button className="btn" type="button" onClick={onBack}>Back to application</button>
      <button className="btn primary" type="button" onClick={() => window.print()}>Print report (PDF)</button>
      <button className="btn" type="button" disabled={busy} onClick={() => setAsk(true)}>{busy ? 'Preparing email…' : 'Email report (PDF)'}</button>
      <button className="btn" type="button" onClick={() => { downloadFile(base + '_report.html', reportDoc(state, reportCss(), showC), 'text/html'); toast('Report downloaded'); }}>Download report (HTML)</button>
    </div>
    <div className="paper"><div className="rpt" ref={paper} dangerouslySetInnerHTML={{ __html: html }} /></div>
    <div style={{ height: 48 }} />
    {ask && <EmailAsk onClose={closeAsk} onSend={send} />}
  </section>;
}

/* asks for the sender's email before the report is emailed; it is kept for newsletters only when the box is ticked */
function EmailAsk({ onClose, onSend }: { onClose: () => void; onSend: (email: string, news: boolean) => void }) {
  const [email, setEmail] = useState(''), [news, setNews] = useState(false), [tried, setTried] = useState(false);
  const ok = validEmail(email.trim());
  return <Modal title="Email report" onClose={onClose}>
    <form className="email-ask" noValidate onSubmit={e => { e.preventDefault(); setTried(true); if (ok) onSend(email.trim(), news); }}>
      <label className="fld" htmlFor="ea-email"><span className="fl">Your email</span>
        <input id="ea-email" type="email" autoComplete="email" required value={email} aria-invalid={tried && !ok} aria-describedby={tried && !ok ? 'ea-err' : undefined} onChange={e => setEmail(e.target.value)} /></label>
      {tried && !ok && <p className="ea-err" id="ea-err">Enter a valid email address.</p>}
      <label className="ea-news"><input type="checkbox" checked={news} onChange={e => setNews(e.target.checked)} /> {CONSENT_TEXT}</label>
      <p className="muted ea-note">The report opens in your mail app as a PDF attachment. Your email is only stored if you tick the box above.</p>
      <div className="modal-actions">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="submit">Continue</button>
      </div>
    </form>
  </Modal>;
}
