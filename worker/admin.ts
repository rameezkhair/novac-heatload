/* Admin login and site configuration.
   - One admin: ADMIN_EMAIL and ADMIN_PASSWORD_HASH (PBKDF2-SHA256, made with `npm run admin:hash`) are Worker secrets,
     with SESSION_SECRET signing the session cookie (HMAC-SHA256, 12 hours, HttpOnly, Secure, SameSite=Strict).
   - The configuration is kept in the KV namespace bound as SITE, under the key "config".
   Routes: GET /api/config (public), GET /api/admin/session, POST /api/admin/login, POST /api/admin/logout, PUT /api/admin/config. */
import { cleanConfig } from '../src/siteConfig';

export interface KV { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> }
export interface AdminEnv { ADMIN_EMAIL?: string; ADMIN_PASSWORD_HASH?: string; SESSION_SECRET?: string; SITE?: KV }

const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/* constant-time comparison of two strings */
function same(a: string, b: string) { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }

/* Workers allow PBKDF2 up to 100,000 iterations */
export const PBKDF2_ITERATIONS = 100000;
export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(bits)}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [alg, it, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2-sha256' || !it || !salt || !hash) return false;
  const again = await hashPassword(password, unb64(salt), Math.min(Number(it), PBKDF2_ITERATIONS));
  return same(again.split('$')[3], hash);
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(data))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const SESSION_HOURS = 12;
export async function makeSession(env: AdminEnv, email: string, now = Date.now()) {
  const body = b64url(JSON.stringify({ e: email, x: now + SESSION_HOURS * 3600e3 }));
  return `${body}.${await hmac(env.SESSION_SECRET!, body)}`;
}
export async function readSession(env: AdminEnv, req: Request, now = Date.now()): Promise<string | null> {
  if (!env.SESSION_SECRET) return null;
  const c = (req.headers.get('cookie') || '').split(/;\s*/).find(x => x.startsWith('novac_admin='));
  if (!c) return null;
  const [body, sig] = c.slice('novac_admin='.length).split('.');
  if (!body || !sig || !same(sig, await hmac(env.SESSION_SECRET, body))) return null;
  try { const p = JSON.parse(unb64url(body)); return typeof p.e === 'string' && typeof p.x === 'number' && p.x > now ? p.e : null; } catch { return null; }
}
const cookie = (v: string, maxAge: number) => `novac_admin=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

/* login attempts per address, per isolate: 5 tries in 10 minutes */
const tries = new Map<string, { n: number; t: number }>();
function throttled(ip: string, now = Date.now()) {
  const x = tries.get(ip);
  if (!x || now - x.t > 10 * 60e3) { tries.set(ip, { n: 1, t: now }); return false; }
  x.n++; return x.n > 5;
}
export const resetThrottle = () => tries.clear();

const configured = (env: AdminEnv) => !!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD_HASH && env.SESSION_SECRET);
const sameOrigin = (req: Request) => { const o = req.headers.get('origin'); return !o || o === new URL(req.url).origin; };

/* the admin and configuration routes; null when the path is not one of them */
export async function adminApi(req: Request, env: AdminEnv): Promise<Response | null> {
  const { pathname } = new URL(req.url), m = req.method;
  if (pathname === '/api/config') {
    if (m !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const raw = env.SITE ? await env.SITE.get('config') : null;
    let config = null; try { config = raw ? cleanConfig(JSON.parse(raw)) : null; } catch { config = null; }
    return new Response(JSON.stringify({ config }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' } });
  }
  if (!pathname.startsWith('/api/admin/')) return null;
  if (m !== 'GET' && !sameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  if (!configured(env)) return json({ error: 'The admin login is not set up yet: set ADMIN_EMAIL, ADMIN_PASSWORD_HASH and SESSION_SECRET.' }, 503);

  if (pathname === '/api/admin/login') {
    if (m !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'local';
    if (throttled(ip)) return json({ error: 'Too many attempts. Try again in 10 minutes.' }, 429);
    let b: { email?: unknown; password?: unknown };
    try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '', password = typeof b.password === 'string' ? b.password : '';
    const ok = same(email, env.ADMIN_EMAIL!.trim().toLowerCase()) && await verifyPassword(password, env.ADMIN_PASSWORD_HASH!);
    if (!ok) return json({ error: 'Wrong email or password' }, 401);
    tries.delete(ip);
    return json({ ok: true, email }, 200, { 'set-cookie': cookie(await makeSession(env, email), SESSION_HOURS * 3600) });
  }
  if (pathname === '/api/admin/logout') return m === 'POST' ? json({ ok: true }, 200, { 'set-cookie': cookie('', 0) }) : json({ error: 'Method not allowed' }, 405);

  const who = await readSession(env, req);
  if (!who) return json({ error: 'Not logged in' }, 401);
  if (pathname === '/api/admin/session') return json({ ok: true, email: who, storage: !!env.SITE });
  if (pathname === '/api/admin/config') {
    if (m !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    if (!env.SITE) return json({ error: 'Storage is not set up yet: bind a KV namespace as SITE.' }, 503);
    let body: unknown; try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    const c = cleanConfig((body as { config?: unknown })?.config);
    if (!c) return json({ error: 'Invalid configuration' }, 400);
    c.updated = new Date().toISOString(); c.by = who;
    await env.SITE.put('config', JSON.stringify(c));
    return json({ ok: true, config: c });
  }
  return json({ error: 'Not found' }, 404);
}
