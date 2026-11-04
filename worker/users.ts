/* User accounts for the Pro tools, kept in the D1 database bound as DB (migrations/0002_users.sql).
   - Sign-up and login are the same step: the person asks for a 6-digit code, it is emailed to them (Brevo, from
     no-reply@novac.ae) and entering it proves they own the address. The account is created on the first correct code,
     so every stored address is verified. There are no passwords.
   - A new account has no Pro; the admin grants it (/admin → Users). Pro is read from the database on every session
     check, so granting, removing or blocking takes effect on the user's next page load.
   - The session is a signed cookie (novac_user, 30 days, HttpOnly, Secure, SameSite=Strict), signed with SESSION_SECRET.
   Routes: POST /api/user/code, POST /api/user/verify, GET /api/user/session, POST /api/user/logout;
   for the admin: GET, PATCH and DELETE /api/admin/users. */
import { hmac, json, readSession, readSigned, same, sameOrigin, sessionCookie, signSession, type AdminEnv } from './admin';
import { brevoSend, mailOn, type MailEnv } from './brevo';

/* the parts of the D1 binding used here */
export interface D1Bound { run(): Promise<unknown>; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }> }
export interface D1 { prepare(sql: string): { bind(...v: unknown[]): D1Bound } }
export interface UsersEnv extends AdminEnv, MailEnv {
  DB?: D1;
  /* local development only (.dev.vars): with no Brevo key, the code is returned to the page instead of emailed */
  DEV_SHOW_LOGIN_CODE?: string;
}
export interface UserRow { email: string; created_at: string; last_login_at: string; logins: number; pro: number; pro_since: string | null; blocked: number }

export const USER_DAYS = 30;
const CODE_MINUTES = 10, CODE_TRIES = 5, RESEND_SECONDS = 60;
const validEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const cleanEmail = (v: unknown) => typeof v === 'string' ? v.trim().toLowerCase() : '';
const body = async (req: Request) => { try { return await req.json() as Record<string, unknown>; } catch { return null; } };

/* a uniformly random 6-digit code */
export function newCode() {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4294000000);
  return String(a[0] % 1e6).padStart(6, '0');
}
const codeHash = (secret: string, email: string, code: string) => hmac(secret, `login:${email}:${code}`);

/* code requests per address, per isolate: 10 an hour */
const asks = new Map<string, { n: number; t: number }>();
function throttled(ip: string, now = Date.now()) {
  const x = asks.get(ip);
  if (!x || now - x.t > 3600e3) { asks.set(ip, { n: 1, t: now }); return false; }
  x.n++; return x.n > 10;
}
export const resetUserThrottle = () => asks.clear();

function codeEmail(code: string) {
  const text = `Your NOVAC login code is ${code}\n\nEnter it on the page where you asked for it. It expires in ${CODE_MINUTES} minutes.\n\nIf you did not ask for this code, you can ignore this email.\n\nNOVAC · novac.ae`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1d2733;max-width:480px">
<p>Your NOVAC login code is</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:12px 0">${code}</p>
<p>Enter it on the page where you asked for it. It expires in ${CODE_MINUTES} minutes.</p>
<p style="color:#6b7785;font-size:13px">If you did not ask for this code, you can ignore this email.</p>
<p style="color:#6b7785;font-size:13px">NOVAC · <a href="https://novac.ae" style="color:#6b7785">novac.ae</a></p></div>`;
  return { subject: `${code} is your NOVAC login code`, text, html };
}

const publicUser = (u: UserRow) => ({ email: u.email, pro: u.pro === 1 });

/* the user and admin-user routes; null when the path is not one of them */
export async function userApi(req: Request, env: UsersEnv, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Response | null> {
  const { pathname } = new URL(req.url), m = req.method;
  if (pathname === '/api/admin/users') return adminUsers(req, env);
  if (!pathname.startsWith('/api/user/')) return null;
  if (m !== 'GET' && !sameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  if (!env.DB || !env.SESSION_SECRET) return json({ error: 'Accounts are not available yet.' }, 503);
  const db = env.DB, secret = env.SESSION_SECRET;

  if (pathname === '/api/user/code') {
    if (m !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const b = await body(req); if (!b) return json({ error: 'Invalid request' }, 400);
    const email = cleanEmail(b.email);
    if (!validEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);
    const dev = env.DEV_SHOW_LOGIN_CODE === '1' && !mailOn(env);
    if (!mailOn(env) && !dev) return json({ error: 'Login emails cannot be sent yet.' }, 503);
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'local';
    if (throttled(ip, now)) return json({ error: 'Too many codes asked for. Try again in an hour.' }, 429);
    const u = await db.prepare('SELECT blocked FROM users WHERE email = ?1').bind(email).first<{ blocked: number }>();
    if (u?.blocked) return json({ error: 'This account is blocked. Contact support@novac.ae.' }, 403);
    const prev = await db.prepare('SELECT sent_at FROM login_codes WHERE email = ?1').bind(email).first<{ sent_at: number }>();
    if (prev && now - prev.sent_at < RESEND_SECONDS * 1000) return json({ error: 'A code was just sent. Wait a minute before asking for another.' }, 429);
    const code = newCode();
    await db.prepare(`INSERT INTO login_codes (email, code_hash, expires_at, sent_at, tries) VALUES (?1, ?2, ?3, ?4, 0)
      ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires_at = ?3, sent_at = ?4, tries = 0`)
      .bind(email, await codeHash(secret, email, code), now + CODE_MINUTES * 60e3, now).run();
    if (dev) return json({ ok: true, devCode: code });
    let sent: Awaited<ReturnType<typeof brevoSend>>;
    try { sent = await brevoSend(env, { to: email, ...codeEmail(code) }, fetcher); } catch { sent = { ok: false, status: 0, detail: '' }; }
    if (!sent.ok) {
      await db.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
      console.error('Login code email failed', sent.status, sent.detail);
      return json({ error: 'The login email could not be sent. Try again later.' }, 502);
    }
    return json({ ok: true });
  }

  if (pathname === '/api/user/verify') {
    if (m !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const b = await body(req); if (!b) return json({ error: 'Invalid request' }, 400);
    const email = cleanEmail(b.email), code = typeof b.code === 'string' ? b.code.replace(/\D/g, '') : '';
    if (!validEmail(email) || code.length !== 6) return json({ error: 'Enter the 6-digit code from the email.' }, 400);
    const row = await db.prepare('SELECT code_hash, expires_at, tries FROM login_codes WHERE email = ?1').bind(email).first<{ code_hash: string; expires_at: number; tries: number }>();
    if (!row || row.expires_at < now) return json({ error: 'The code has expired. Ask for a new one.' }, 400);
    if (row.tries >= CODE_TRIES) {
      await db.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
      return json({ error: 'Too many wrong codes. Ask for a new one.' }, 429);
    }
    if (!same(row.code_hash, await codeHash(secret, email, code))) {
      await db.prepare('UPDATE login_codes SET tries = tries + 1 WHERE email = ?1').bind(email).run();
      const left = CODE_TRIES - row.tries - 1;
      return json({ error: left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong code. Ask for a new one.' }, 401);
    }
    await db.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
    const at = new Date(now).toISOString();
    await db.prepare(`INSERT INTO users (email, created_at, last_login_at) VALUES (?1, ?2, ?2)
      ON CONFLICT(email) DO UPDATE SET last_login_at = ?2, logins = logins + 1`).bind(email, at).run();
    const u = await db.prepare('SELECT * FROM users WHERE email = ?1').bind(email).first<UserRow>();
    if (!u || u.blocked) return json({ error: 'This account is blocked. Contact support@novac.ae.' }, 403);
    return json({ ok: true, ...publicUser(u) }, 200, { 'set-cookie': sessionCookie('u', await signSession(secret, 'u', email, USER_DAYS * 24, now), USER_DAYS * 86400) });
  }

  if (pathname === '/api/user/logout') return m === 'POST' ? json({ ok: true }, 200, { 'set-cookie': sessionCookie('u', '', 0) }) : json({ error: 'Method not allowed' }, 405);

  if (pathname === '/api/user/session') {
    if (m !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const email = await readSigned(secret, 'u', req, now);
    const u = email ? await db.prepare('SELECT * FROM users WHERE email = ?1').bind(email).first<UserRow>() : null;
    if (!u || u.blocked) return json({ error: 'Not logged in' }, 401, email ? { 'set-cookie': sessionCookie('u', '', 0) } : {});
    return json({ ok: true, ...publicUser(u) });
  }
  return json({ error: 'Not found' }, 404);
}

/* the admin's list of accounts: GET lists them all, PATCH { email, pro?, blocked? } changes one, DELETE { email } removes one */
async function adminUsers(req: Request, env: UsersEnv): Promise<Response> {
  const m = req.method;
  if (m !== 'GET' && !sameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  if (!await readSession(env, req)) return json({ error: 'Not logged in' }, 401);
  if (!env.DB) return json({ error: 'The user database is not set up yet: bind a D1 database as DB (see wrangler.jsonc).' }, 503);
  const db = env.DB;
  if (m === 'GET') {
    const { results } = await db.prepare('SELECT * FROM users ORDER BY created_at DESC').bind().all<UserRow>();
    return json({ ok: true, users: results.map(u => ({ ...u, pro: u.pro === 1, blocked: u.blocked === 1 })) });
  }
  const b = await body(req); if (!b) return json({ error: 'Invalid request' }, 400);
  const email = cleanEmail(b.email);
  const u = email ? await db.prepare('SELECT * FROM users WHERE email = ?1').bind(email).first<UserRow>() : null;
  if (!u) return json({ error: 'No such user' }, 404);
  if (m === 'PATCH') {
    if (typeof b.pro === 'boolean' && b.pro !== (u.pro === 1))
      await db.prepare('UPDATE users SET pro = ?2, pro_since = ?3 WHERE email = ?1').bind(email, b.pro ? 1 : 0, b.pro ? new Date().toISOString() : null).run();
    if (typeof b.blocked === 'boolean') await db.prepare('UPDATE users SET blocked = ?2 WHERE email = ?1').bind(email, b.blocked ? 1 : 0).run();
    const n = await db.prepare('SELECT * FROM users WHERE email = ?1').bind(email).first<UserRow>();
    return json({ ok: true, user: { ...n!, pro: n!.pro === 1, blocked: n!.blocked === 1 } });
  }
  if (m === 'DELETE') {
    await db.prepare('DELETE FROM users WHERE email = ?1').bind(email).run();
    await db.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
}
