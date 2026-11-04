/* Cloudflare Worker: serves the static build from dist/, takes newsletter sign-ups at POST /api/subscribe and gives the
   live UAE diesel price at GET /api/diesel. Sign-ups are kept in the D1 database bound as DB (table created by
   migrations/0001_subscribers.sql) and added to the Brevo contact list when BREVO_API_KEY and BREVO_LIST_ID are set
   (worker/brevo.ts). The admin login and the site configuration are at /api/admin/* and /api/config (worker/admin.ts);
   user accounts for the Pro tools (emailed login codes) at /api/user/* and the admin's user list at /api/admin/users
   (worker/users.ts). */
import { fetchDiesel, type DieselPrice } from './diesel';
import { brevoOn, brevoSubscribe, type BrevoEnv } from './brevo';
import { adminApi } from './admin';
import { userApi, type UsersEnv } from './users';

/* the parts of the Workers runtime used here, so the file needs no extra type package. DB, the D1 database (type in
   worker/users.ts), is absent until it is bound in wrangler.jsonc; without it and without Brevo, sign-ups are refused */
export interface Env extends BrevoEnv, UsersEnv {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const validEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

export async function subscribe(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  /* sign-ups only from pages on this site */
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return json({ error: 'Forbidden' }, 403);
  let b: { email?: unknown; consent?: unknown; consentText?: unknown; source?: unknown };
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!validEmail(email)) return json({ error: 'Invalid email' }, 400);
  /* only addresses whose owner ticked the newsletter box are kept */
  if (b.consent !== true) return json({ error: 'Consent required' }, 400);
  const text = typeof b.consentText === 'string' ? b.consentText.slice(0, 300) : '';
  const source = typeof b.source === 'string' ? b.source.slice(0, 40) : '';
  /* the sign-up goes to the D1 database (the consent record) and to the Brevo list, whichever are set up */
  if (!env.DB && !brevoOn(env)) return json({ error: 'Sign-ups are not available yet' }, 503);
  if (env.DB) {
    /* signing up again refreshes the consent record and re-subscribes an address that had unsubscribed */
    await env.DB.prepare(
      `INSERT INTO subscribers (email, consent_text, source, consented_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(email) DO UPDATE SET consent_text = ?2, source = ?3, consented_at = ?4, unsubscribed_at = NULL`,
    ).bind(email, text, source, new Date().toISOString()).run();
  }
  let brevo: Awaited<ReturnType<typeof brevoSubscribe>> | null = null;
  if (brevoOn(env)) { try { brevo = await brevoSubscribe(env, email, fetcher); } catch { brevo = { ok: false, status: 0, doi: false }; } }
  /* kept in D1 counts as signed up even if Brevo is down; with Brevo alone, Brevo has to accept it */
  if (!env.DB && brevo && !brevo.ok) return json({ error: 'The newsletter service did not accept the sign-up' }, 502);
  return json({ ok: true, ...(brevo ? { brevo: brevo.ok, confirm: brevo.doi } : {}) });
}

/* live UAE diesel price for energy modelling, kept for 12 hours in this isolate and in browser and edge caches */
let dieselCache: { at: number; body: DieselPrice } | null = null;
export async function diesel(fetcher: typeof fetch = fetch): Promise<Response> {
  const TTL = 12 * 3600 * 1000;
  try {
    if (!dieselCache || Date.now() - dieselCache.at > TTL) dieselCache = { at: Date.now(), body: await fetchDiesel(fetcher) };
    return new Response(JSON.stringify(dieselCache.body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=43200' } });
  } catch (e) {
    return json({ error: (e as Error).message || 'Diesel price not available' }, 502);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/subscribe') return req.method === 'POST' ? subscribe(req, env) : json({ error: 'Method not allowed' }, 405);
    if (pathname === '/api/diesel') return req.method === 'GET' ? diesel() : json({ error: 'Method not allowed' }, 405);
    /* the admin page lives at /admin; the static assets serve admin.html there, never cached by browsers or the edge */
    if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin.html') {
      if (pathname !== '/admin') return Response.redirect(new URL('/admin', req.url).toString(), 301);
      const r = await env.ASSETS.fetch(req), h = new Headers(r.headers);
      h.set('cache-control', 'no-store'); h.set('x-robots-tag', 'noindex, nofollow'); h.set('x-frame-options', 'DENY');
      return new Response(r.body, { status: r.status, headers: h });
    }
    /* user accounts, then the admin login and the site configuration */
    const u = await userApi(req, env);
    if (u) return u;
    const a = await adminApi(req, env);
    if (a) return a;
    return env.ASSETS.fetch(req);
  },
};
