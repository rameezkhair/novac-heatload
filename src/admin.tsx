/* NOVAC admin: log in, then set what each Pro tool, add-on and app page shows (live, locked, coming soon or hidden)
   and edit the site texts. Saved to the Worker (PUT /api/admin/config); every visitor's calculator and landing page read it. */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FEATURES, STATUS_LABEL, cleanConfig, defaultStatus, emphasis, emptyConfig, statusOf, type FeatureGroup, type FeatureStatus, type SiteConfig, type SiteTexts } from './siteConfig';
import './styles.css';

const GROUPS: [FeatureGroup, string, string][] = [
  ['pro', 'Pro tools', 'The Pro row of the calculator'],
  ['addon', 'Pro add-ons', 'The add-ons row'],
  ['update', 'Calculator updates', 'New options inside the calculator’s own steps'],
  ['page', 'App pages', 'The links under the calculator header'],
];
const STATUS_HINT: Record<FeatureStatus, string> = {
  live: 'Open to everyone', draft: 'Only you see it, as a preview; visitors see it as before', locked: 'Shown with a Pro lock, cannot be opened', soon: 'Shown as coming soon, cannot be opened', hidden: 'Not shown at all',
};
const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, ...j } as { ok: boolean; status: number; error?: string; [k: string]: unknown };
};

export function Admin() {
  const [who, setWho] = useState<string | null>(null), [storage, setStorage] = useState(true), [checking, setChecking] = useState(true), [setupErr, setSetupErr] = useState('');
  useEffect(() => {
    api('/api/admin/session').then(r => { if (r.ok) { setWho(String(r.email)); setStorage(!!r.storage); } else if (r.status === 503) setSetupErr(String(r.error)); setChecking(false); });
  }, []);
  return <main className="wrap admin">
    <header className="admin-head">
      <a className="app-brand" href="/" aria-label="NOVAC home"><img className="logo" src="/novac-thermal-mark.svg" alt="" aria-hidden="true" /><span>NOVAC</span></a>
      <h1>Admin</h1>
      {who && <span className="admin-who">{who} <button className="btn sm" type="button" onClick={async () => { await api('/api/admin/logout', { method: 'POST' }); setWho(null); }}>Log out</button></span>}
    </header>
    {checking ? <p className="hint">Checking your session…</p>
      : setupErr ? <div className="hr-card"><h3>Admin login not set up</h3><p className="wx-status error" role="status">{setupErr}</p>
        <p className="hint">Run <code>npm run admin:hash</code>, then set ADMIN_EMAIL, ADMIN_PASSWORD_HASH and SESSION_SECRET as Worker secrets (or in .dev.vars for local testing).</p></div>
      : who ? <Editor who={who} storage={storage} /> : <Login onIn={(e, s) => { setWho(e); setStorage(s); }} />}
  </main>;
}

function Login({ onIn }: { onIn: (email: string, storage: boolean) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (!r.ok) { setErr(String(r.error || 'Login failed')); return; }
    const s = await api('/api/admin/session'); onIn(String(r.email), !!s.storage);
  };
  return <form className="hr-card admin-login" onSubmit={go}>
    <h3>Log in</h3>
    <label className="fld" htmlFor="ad-email"><span className="fl">Email</span><span className="in-u"><input id="ad-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></span></label>
    <label className="fld" htmlFor="ad-pass"><span className="fl">Password</span><span className="in-u"><input id="ad-pass" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></span></label>
    {err && <p className="wx-status error" role="status">{err}</p>}
    <div className="btns"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button></div>
  </form>;
}

function Editor({ who, storage }: { who: string; storage: boolean }) {
  const [cfg, setCfg] = useState<SiteConfig>(emptyConfig), [saved, setSaved] = useState<SiteConfig | null>(null), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/config').then(r => r.json()).then(j => { const c = cleanConfig(j.config) ?? emptyConfig(); setCfg(c); setSaved(c); }).catch(() => setSaved(emptyConfig())); }, []);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const setStatus = (id: string, v: FeatureStatus | 'default') => setCfg(c => { const f = { ...c.features }; if (v === 'default') delete f[id]; else f[id] = v; return { ...c, features: f }; });
  const setText = (k: keyof SiteTexts, v: unknown) => setCfg(c => ({ ...c, texts: { ...c.texts, [k]: v } }));
  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    const r = await api('/api/admin/config', { method: 'PUT', body: JSON.stringify({ config: cfg }) });
    setBusy(false);
    if (!r.ok) { setErr(String(r.error || 'Could not save')); return; }
    const c = cleanConfig(r.config)!; setCfg(c); setSaved(c); setMsg(`Saved. Visitors see the changes on their next page load.`);
  };
  /* updates waiting: built features still in draft; Activate makes them live and publishes straight away */
  const waiting = FEATURES.filter(f => statusOf(cfg, f.id) === 'draft');
  const publish = async (next: SiteConfig, note: string) => {
    setBusy(true); setErr(''); setMsg('');
    const r = await api('/api/admin/config', { method: 'PUT', body: JSON.stringify({ config: next }) });
    setBusy(false);
    if (!r.ok) { setErr(String(r.error || 'Could not save')); return; }
    const c = cleanConfig(r.config)!; setCfg(c); setSaved(c); setMsg(note);
  };
  const activate = (ids: string[]) => publish({ ...cfg, features: { ...cfg.features, ...Object.fromEntries(ids.map(id => [id, 'live' as FeatureStatus])) } },
    `${ids.map(id => FEATURES.find(f => f.id === id)?.label).join(', ')} ${ids.length > 1 ? 'are' : 'is'} live. Visitors see ${ids.length > 1 ? 'them' : 'it'} on their next page load.`);
  const t = cfg.texts;
  const text = (k: keyof SiteTexts, label: string, ph: string, long = false) => <label className="fld wide" htmlFor={`ad-${k}`}><span className="fl">{label}</span><span className="in-u">
    {long ? <textarea id={`ad-${k}`} rows={3} value={String(t[k] ?? '')} placeholder={ph} onChange={e => setText(k, e.target.value)} />
      : <input id={`ad-${k}`} value={String(t[k] ?? '')} placeholder={ph} onChange={e => setText(k, e.target.value)} />}</span></label>;

  return <>
    {!storage && <p className="wx-status error" role="status">Storage is not set up: changes cannot be saved until a KV namespace is bound as SITE (see wrangler.jsonc).</p>}
    <div className="admin-bar">
      <span className="hint">{saved?.updated ? `Last saved ${new Date(saved.updated).toLocaleString('en-GB')}${saved.by ? ` by ${saved.by}` : ''}` : 'Nothing saved yet: the site uses its built-in settings.'}</span>
      <div className="btns">
        <a className="btn sm" href="/app.html" target="_blank" rel="noopener">Open the calculator</a>
        <button className="btn sm" type="button" disabled={!dirty || busy} onClick={() => saved && setCfg(saved)}>Undo changes</button>
        <button className="btn primary" type="button" disabled={!dirty || busy || !storage} onClick={save}>{busy ? 'Saving…' : 'Save and publish'}</button>
      </div>
    </div>
    {msg && <p className="wx-status ready" role="status">{msg}</p>}
    {err && <p className="wx-status error" role="status">{err}</p>}

    <div className={'hr-card admin-waiting' + (waiting.length ? ' on' : '')}>
      <h3>Updates waiting to go live <span className="muted">· deployed, seen only by you as a preview</span></h3>
      {waiting.length ? <>
        <ul className="admin-list">{waiting.map(f => <li key={f.id}><span><b>{f.label}</b> <span className="muted">· {f.group === 'pro' ? 'Pro tool' : f.group === 'addon' ? 'Add-on' : f.group === 'update' ? 'Calculator update' : 'Page'}</span></span>
          <span className="btns"><a className="btn sm" href="/app.html" target="_blank" rel="noopener">Preview</a>
            <button className="btn sm primary" type="button" disabled={busy || !storage} onClick={() => activate([f.id])}>Activate</button></span></li>)}</ul>
        {waiting.length > 1 && <div className="btns"><button className="btn primary" type="button" disabled={busy || !storage} onClick={() => activate(waiting.map(f => f.id))}>Activate all {waiting.length}</button></div>}
        <p className="hint">Open the calculator while logged in here to try them: they show as Preview for you and stay hidden for visitors until you activate them.</p>
      </> : <p className="hint">Nothing waiting: every built feature has a status you chose.</p>}
    </div>

    <Users />

    {GROUPS.map(([g, title, sub]) => <div key={g} className="hr-card">
      <h3>{title} <span className="muted">· {sub}</span></h3>
      <div className="tbl-wrap"><table className="hr-tbl admin-tbl">
        <thead><tr><th>Feature</th><th>Status</th><th>Shows as</th></tr></thead>
        <tbody>{FEATURES.filter(f => f.group === g).map(f => { const set = cfg.features[f.id], now = statusOf(cfg, f.id);
          return <tr key={f.id}><td><b>{f.label}</b>{!f.built && <span className="muted"> · not built yet</span>}</td>
            <td><select aria-label={`${f.label} status`} value={set ?? 'default'} onChange={e => setStatus(f.id, e.target.value as FeatureStatus | 'default')}>
              <option value="default">Default ({STATUS_LABEL[defaultStatus(f)]})</option>
              {(['live', 'draft', 'locked', 'soon', 'hidden'] as FeatureStatus[]).map(s => <option key={s} value={s} disabled={(s === 'live' || s === 'draft') && !f.built}>{STATUS_LABEL[s]}{(s === 'live' || s === 'draft') && !f.built ? ' (not built)' : ''}</option>)}
            </select></td>
            <td><span className={'pill ' + (now === 'live' ? 'ok' : now === 'hidden' ? '' : now === 'draft' ? 'warn' : 'req')}>{STATUS_LABEL[now]}</span> <span className="muted">{STATUS_HINT[now]}</span></td></tr>; })}</tbody>
      </table></div>
    </div>)}

    <div className="hr-card">
      <h3>Announcement banner <span className="muted">· across the top of the calculator and the landing page</span></h3>
      <label className="pw-chk"><input type="checkbox" checked={!!t.bannerOn} onChange={e => setText('bannerOn', e.target.checked)} /> Show the banner</label>
      <div className="hr-filters">
        {text('bannerText', 'Banner text', 'e.g. New: energy modelling with DEWA net metering is live')}
        <label className="fld" htmlFor="ad-tone"><span className="fl">Style</span><span className="in-u"><select id="ad-tone" value={t.bannerTone ?? 'info'} onChange={e => setText('bannerTone', e.target.value)}>
          <option value="info">Information</option><option value="ok">Good news</option><option value="warn">Warning</option></select></span></label>
      </div>
      {t.bannerOn && t.bannerText && <div className={`site-banner ${t.bannerTone ?? 'info'}`} role="note">{t.bannerText}</div>}
    </div>

    <div className="hr-card">
      <h3>Site texts <span className="muted">· leave a field blank to keep the built-in text</span></h3>
      <div className="hr-filters">
        {text('heroTitle', 'Landing page headline (wrap a word in *stars* to emphasise it)', 'UAE heat load calculations in *minutes*, not hours')}
        {text('heroLead', 'Landing page subheading', 'Pick the emirate, add your rooms, and get room-by-room cooling loads…', true)}
        {text('appTitle', 'Calculator title', 'Simplified Heat Load Calculator')}
        {text('appTag', 'Calculator tagline', 'Room-by-room cooling demand · Made in UAE')}
        {text('supportEmail', 'Support email', 'support@novac.ae')}
      </div>
      {t.heroTitle && <p className="hint">Headline preview: <span className="admin-hero" dangerouslySetInnerHTML={{ __html: emphasis(t.heroTitle) }} /></p>}
    </div>
    <p className="hint">Logged in as {who}. The session lasts 12 hours.</p>
  </>;
}

/* the user accounts (worker/users.ts): every address here was verified with an emailed code. Pro opens the locked tools. */
interface AdminUser { email: string; created_at: string; last_login_at: string; logins: number; pro: boolean; pro_since: string | null; blocked: boolean }
type UserFilter = 'all' | 'pending' | 'pro' | 'blocked';
const when = (s: string | null) => s ? new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function usersCsv(users: AdminUser[]) {
  const head = ['Email', 'Signed up', 'Last login', 'Logins', 'Pro', 'Pro since', 'Blocked'];
  return [head, ...users.map(u => [u.email, u.created_at, u.last_login_at, u.logins, u.pro ? 'yes' : 'no', u.pro_since ?? '', u.blocked ? 'yes' : 'no'])]
    .map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function Users() {
  const [users, setUsers] = useState<AdminUser[] | null>(null), [err, setErr] = useState(''), [q, setQ] = useState(''), [filter, setFilter] = useState<UserFilter>('all'), [busy, setBusy] = useState('');
  const load = async () => { const r = await api('/api/admin/users'); if (r.ok) { setUsers(r.users as AdminUser[]); setErr(''); } else setErr(String(r.error || 'Could not load the users')); };
  useEffect(() => { void load(); }, []);
  const change = async (email: string, patch: Partial<Pick<AdminUser, 'pro' | 'blocked'>>) => {
    setBusy(email);
    const r = await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ email, ...patch }) });
    setBusy('');
    if (!r.ok) { setErr(String(r.error || 'Could not save')); return; }
    setUsers(us => us && us.map(u => u.email === email ? r.user as AdminUser : u));
  };
  const remove = async (email: string) => {
    if (!confirm(`Delete the account ${email}? They can sign up again with a new code.`)) return;
    setBusy(email);
    const r = await api('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ email }) });
    setBusy('');
    if (!r.ok) { setErr(String(r.error || 'Could not delete')); return; }
    setUsers(us => us && us.filter(u => u.email !== email));
  };
  const all = users ?? [], count = { all: all.length, pending: all.filter(u => !u.pro && !u.blocked).length, pro: all.filter(u => u.pro && !u.blocked).length, blocked: all.filter(u => u.blocked).length };
  const shown = all.filter(u => (filter === 'all' || (filter === 'blocked' ? u.blocked : !u.blocked && (filter === 'pro') === u.pro)) && u.email.includes(q.trim().toLowerCase()));
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([usersCsv(shown)], { type: 'text/csv;charset=utf-8' }));
    a.download = `novac-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const LABEL: Record<UserFilter, string> = { all: 'All', pending: 'Waiting for Pro', pro: 'Pro', blocked: 'Blocked' };
  return <div className="hr-card admin-users">
    <h3>Users <span className="muted">· accounts with a verified email; give Pro to open the tools set to Locked (Pro)</span></h3>
    {err && <p className="wx-status error" role="status">{err}</p>}
    {users === null ? !err && <p className="hint">Loading users…</p> : <>
      <div className="admin-bar">
        <div className="btns" role="group" aria-label="Show users">
          {(Object.keys(LABEL) as UserFilter[]).map(f => <button key={f} className={'btn sm' + (filter === f ? ' primary' : '')} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{LABEL[f]} ({count[f]})</button>)}
        </div>
        <div className="btns">
          <input className="admin-search" type="search" aria-label="Search by email" placeholder="Search email" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn sm" type="button" onClick={() => void load()}>Refresh</button>
          <button className="btn sm" type="button" disabled={!shown.length} onClick={download}>Export CSV</button>
        </div>
      </div>
      {shown.length ? <div className="tbl-wrap"><table className="hr-tbl admin-tbl">
        <thead><tr><th>Email</th><th>Signed up</th><th>Last login</th><th>Logins</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{shown.map(u => <tr key={u.email}>
          <td><b>{u.email}</b></td><td>{when(u.created_at)}</td><td>{when(u.last_login_at)}</td><td>{u.logins}</td>
          <td>{u.blocked ? <span className="pill bad">Blocked</span> : u.pro ? <span className="pill ok" title={u.pro_since ? `Since ${when(u.pro_since)}` : undefined}>Pro</span> : <span className="pill warn">Waiting for Pro</span>}</td>
          <td><span className="btns">
            <button className={'btn sm' + (u.pro ? '' : ' primary')} type="button" disabled={busy === u.email || u.blocked} onClick={() => void change(u.email, { pro: !u.pro })}>{u.pro ? 'Remove Pro' : 'Give Pro'}</button>
            <button className="btn sm" type="button" disabled={busy === u.email} onClick={() => void change(u.email, { blocked: !u.blocked })}>{u.blocked ? 'Unblock' : 'Block'}</button>
            <button className="btn sm danger" type="button" disabled={busy === u.email} onClick={() => void remove(u.email)}>Delete</button>
          </span></td></tr>)}</tbody>
      </table></div> : <p className="hint">{all.length ? 'No users match.' : 'No one has signed up yet. Visitors sign up from Log in in the calculator header, or by clicking a locked Pro tool.'}</p>}
    </>}
  </div>;
}

if (typeof document !== 'undefined' && document.getElementById('root') && !(globalThis as { __NOVAC_TEST__?: boolean }).__NOVAC_TEST__) {
  createRoot(document.getElementById('root')!).render(<StrictMode><Admin /></StrictMode>);
}
