import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker/index';

/* a stand-in for the D1 binding that records each statement run */
function fakeEnv() {
  const runs: { sql: string; args: unknown[] }[] = [];
  const env: Env = {
    ASSETS: { fetch: async () => new Response('page') },
    DB: { prepare: sql => ({ bind: (...args) => ({ run: async () => { runs.push({ sql, args }); return {}; } }) }) },
  };
  return { env, runs };
}
const post = (body: unknown, origin = 'https://novac.ae') => new Request('https://novac.ae/api/subscribe', {
  method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body),
});

describe('newsletter sign-up endpoint', () => {
  it('stores a consented address, lower-cased, with the consent wording and time', async () => {
    const { env, runs } = fakeEnv();
    const r = await worker.fetch(post({ email: ' Eng@Example.COM ', consent: true, consentText: 'Send me news', source: 'email-report' }), env);
    expect(r.status).toBe(200);
    expect(runs).toHaveLength(1);
    expect(runs[0].sql).toContain('INSERT INTO subscribers');
    expect(runs[0].args.slice(0, 3)).toEqual(['eng@example.com', 'Send me news', 'email-report']);
    expect(String(runs[0].args[3])).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('refuses addresses without consent, invalid addresses and other sites', async () => {
    const { env, runs } = fakeEnv();
    expect((await worker.fetch(post({ email: 'a@b.com' }), env)).status).toBe(400);
    expect((await worker.fetch(post({ email: 'not-an-email', consent: true }), env)).status).toBe(400);
    expect((await worker.fetch(post({ email: 'a@b.com', consent: true }, 'https://evil.example'), env)).status).toBe(403);
    expect((await worker.fetch(new Request('https://novac.ae/api/subscribe'), env)).status).toBe(405);
    expect(runs).toHaveLength(0);
  });

  it('refuses sign-ups while no database is bound', async () => {
    const { env } = fakeEnv();
    delete env.DB;
    expect((await worker.fetch(post({ email: 'a@b.com', consent: true }), env)).status).toBe(503);
  });

  it('serves the site for every other path', async () => {
    const { env } = fakeEnv();
    expect(await (await worker.fetch(new Request('https://novac.ae/app.html'), env)).text()).toBe('page');
  });
});

describe('Brevo sign-ups', () => {
  const brevoEnv = (extra: Partial<Env> = {}) => { const { env, runs } = fakeEnv(); return { env: { ...env, BREVO_API_KEY: 'k-test', BREVO_LIST_ID: '7', ...extra } as Env, runs }; };
  it('adds the contact to the Brevo list with the API key, and keeps the D1 record', async () => {
    const { env, runs } = brevoEnv();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status: 201 }); }) as unknown as typeof fetch;
    const { subscribe } = await import('../worker/index');
    const r = await subscribe(post({ email: 'Eng@Example.com', consent: true, consentText: 'Send me news', source: 'email-report' }), env, fetcher);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, brevo: true, confirm: false });
    expect(runs).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.brevo.com/v3/contacts');
    expect((calls[0].init.headers as Record<string, string>)['api-key']).toBe('k-test');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'eng@example.com', listIds: [7], updateEnabled: true });
  });
  it('uses double opt-in when a template and redirect are set', async () => {
    const { env } = brevoEnv({ BREVO_DOI_TEMPLATE_ID: '12', BREVO_DOI_REDIRECT_URL: 'https://novac.ae/thanks' });
    delete env.DB;
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    const { subscribe } = await import('../worker/index');
    const r = await subscribe(post({ email: 'a@b.com', consent: true }), env, fetcher);
    expect(r.status).toBe(200);
    expect(calls[0].url).toBe('https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'a@b.com', includeListIds: [7], templateId: 12, redirectionUrl: 'https://novac.ae/thanks' });
  });
  it('reports a Brevo failure when Brevo is the only store, but not when D1 kept it', async () => {
    const fail = (async () => new Response('{"message":"Key not found"}', { status: 401 })) as unknown as typeof fetch;
    const { subscribe } = await import('../worker/index');
    const only = brevoEnv(); delete only.env.DB;
    expect((await subscribe(post({ email: 'a@b.com', consent: true }), only.env, fail)).status).toBe(502);
    const both = brevoEnv();
    const r = await subscribe(post({ email: 'a@b.com', consent: true }), both.env, fail);
    expect(r.status).toBe(200);
    expect((await r.json()).brevo).toBe(false);
    expect(both.runs).toHaveLength(1);
  });
});

describe('admin page address', () => {
  it('serves the admin page at /admin, uncached and not indexed, and redirects the old address', async () => {
    const { env } = fakeEnv();
    const seen: string[] = [];
    env.ASSETS = { fetch: async (r: Request) => { seen.push(new URL(r.url).pathname); return new Response('<html>admin</html>', { headers: { 'content-type': 'text/html' } }); } };
    const r = await worker.fetch(new Request('https://novac.ae/admin'), env);
    expect(r.status).toBe(200);
    expect(seen).toEqual(['/admin']);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-robots-tag')).toContain('noindex');
    const old = await worker.fetch(new Request('https://novac.ae/admin.html'), env);
    expect(old.status).toBe(301);
    expect(old.headers.get('location')).toBe('https://novac.ae/admin');
  });
});
