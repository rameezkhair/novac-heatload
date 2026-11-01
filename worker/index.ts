/* Cloudflare Worker: serves the static build from dist/ and takes newsletter sign-ups at POST /api/subscribe.
   Sign-ups are kept in the D1 database bound as DB (table created by migrations/0001_subscribers.sql). */

/* the parts of the Workers runtime used here, so the file needs no extra type package */
interface D1Statement { bind(...v: unknown[]): { run(): Promise<unknown> } }
export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  /* absent until the D1 database is created and bound in wrangler.jsonc; sign-ups are refused until then */
  DB?: { prepare(sql: string): D1Statement };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const validEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

export async function subscribe(req: Request, env: Env): Promise<Response> {
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
  if (!env.DB) return json({ error: 'Sign-ups are not available yet' }, 503);
  /* signing up again refreshes the consent record and re-subscribes an address that had unsubscribed */
  await env.DB.prepare(
    `INSERT INTO subscribers (email, consent_text, source, consented_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(email) DO UPDATE SET consent_text = ?2, source = ?3, consented_at = ?4, unsubscribed_at = NULL`,
  ).bind(email, text, source, new Date().toISOString()).run();
  return json({ ok: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/subscribe') return req.method === 'POST' ? subscribe(req, env) : json({ error: 'Method not allowed' }, 405);
    return env.ASSETS.fetch(req);
  },
};
