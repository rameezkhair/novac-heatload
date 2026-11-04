/* Account login for the Pro tools (worker/users.ts): the user enters their email, gets a 6-digit code by email and enters it.
   The first correct code creates the account, so the address is verified; the admin then grants Pro (/admin → Users). */
import { useState } from 'react';
import { setUser, type SiteUser } from '../siteConfig';
import { useUser } from '../useSiteConfig';
import { Modal } from './ui';

const post = async (path: string, body?: unknown) => {
  try {
    const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { ok: r.ok, ...await r.json().catch(() => ({})) } as { ok: boolean; error?: string; devCode?: string } & Partial<SiteUser>;
  } catch { return { ok: false, error: 'No connection. Check your internet and try again.' }; }
};

/* the header button: Log in, or the user's email with their Pro status */
export function AccountButton({ onOpen }: { onOpen: () => void }) {
  const user = useUser();
  return <button className="btn account-btn" type="button" onClick={onOpen} aria-label={user ? `Account: ${user.email}${user.pro ? ', Pro' : ''}` : 'Log in'}>
    {user ? <><span className="account-email">{user.email}</span> <span className={'pill ' + (user.pro ? 'ok' : 'warn')}>{user.pro ? 'Pro' : 'Pending'}</span></> : 'Log in'}
  </button>;
}

/* reason: why the dialog opened, e.g. a locked Pro tool was clicked */
export function AccountDialog({ reason, onClose }: { reason?: string; onClose: () => void }) {
  const user = useUser();
  return <Modal title={user ? 'Your account' : 'Log in or sign up'} onClose={onClose}>
    {reason && <p className="account-reason">{reason}</p>}
    {user ? <Signed user={user} onClose={onClose} /> : <CodeLogin />}
  </Modal>;
}

function Signed({ user, onClose }: { user: SiteUser; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return <>
    <p>Logged in as <b>{user.email}</b>.</p>
    {user.pro
      ? <p className="wx-status ready" role="status">Pro is active: the Pro tools are open to you.</p>
      : <p className="wx-status loading" role="status">Your account is waiting for Pro approval. Once it is approved, the Pro tools open the next time you load the calculator. Questions: <a href="mailto:support@novac.ae">support@novac.ae</a></p>}
    <div className="modal-actions">
      <button className="btn" type="button" disabled={busy} onClick={async () => { setBusy(true); await post('/api/user/logout'); setUser(null); onClose(); }}>Log out</button>
      <button className="btn primary" type="button" onClick={onClose}>Done</button>
    </div>
  </>;
}

function CodeLogin() {
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [dev, setDev] = useState('');
  const [err, setErr] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true); setErr(''); setNote('');
    const r = await post('/api/user/code', { email });
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'The code could not be sent.'); return; }
    setSent(true); setCode(''); setDev(r.devCode || ''); setNote(`We sent a 6-digit code to ${email.trim().toLowerCase()}. It expires in 10 minutes; check your spam folder if it has not arrived.`);
  };
  const verify = async () => {
    setBusy(true); setErr('');
    const r = await post('/api/user/verify', { email, code });
    setBusy(false);
    if (!r.ok || !r.email) { setErr(r.error || 'The code could not be checked.'); return; }
    setUser({ email: r.email, pro: !!r.pro });
  };
  if (!sent) return <form onSubmit={e => { e.preventDefault(); void ask(); }}>
    <p className="hint">Enter your email and we will send you a 6-digit code. No password needed: the code verifies your email and logs you in. New here? This creates your account.</p>
    <label className="fld wide" htmlFor="acc-email"><span className="fl">Email</span><span className="in-u">
      <input id="acc-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></span></label>
    {err && <p className="wx-status error" role="alert">{err}</p>}
    <div className="modal-actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button></div>
  </form>;
  return <form onSubmit={e => { e.preventDefault(); void verify(); }}>
    <p className="wx-status ready" role="status">{note}</p>
    {dev && <p className="hint">Local development, no mail service set: your code is <b>{dev}</b>.</p>}
    <label className="fld wide" htmlFor="acc-code"><span className="fl">6-digit code</span><span className="in-u">
      <input id="acc-code" className="account-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={e => setCode(e.target.value)} /></span></label>
    {err && <p className="wx-status error" role="alert">{err}</p>}
    <div className="modal-actions">
      <button className="btn" type="button" disabled={busy} onClick={() => { setSent(false); setErr(''); setDev(''); }}>Use a different email</button>
      <button className="btn" type="button" disabled={busy} onClick={() => void ask()}>Send a new code</button>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
    </div>
  </form>;
}
