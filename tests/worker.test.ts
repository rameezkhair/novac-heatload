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
