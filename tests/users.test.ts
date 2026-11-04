import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, makeSession, resetThrottle } from '../worker/admin';
import { newCode, resetUserThrottle, userApi, type UsersEnv } from '../worker/users';
import { sqliteD1 } from '../worker/sqlite-d1';

const ORIGIN = 'https://novac.ae';
let env: UsersEnv, mails: { to: string; subject: string; text: string; from: string }[], mailStatus: number;
/* stands in for Brevo: records each email, answers with mailStatus */
const brevo: typeof fetch = async (_url, init) => {
  const b = JSON.parse(String(init!.body));
  mails.push({ to: b.to[0].email, subject: b.subject, text: b.textContent, from: b.sender.email });
  return new Response('{}', { status: mailStatus });
};
beforeEach(async () => {
  resetThrottle(); resetUserThrottle(); mails = []; mailStatus = 201;
  env = { SESSION_SECRET: 'test-secret-0123456789', BREVO_API_KEY: 'k', DB: sqliteD1(), ADMIN_EMAIL: 'admin@novac.ae', ADMIN_PASSWORD_HASH: await hashPassword('pw') };
});
const req = (path: string, init: RequestInit & { cookie?: string; ip?: string } = {}) => new Request(ORIGIN + path, {
  ...init, headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': init.ip ?? '1.2.3.4', ...(init.cookie ? { cookie: init.cookie } : {}) },
});
const call = async (path: string, init: Parameters<typeof req>[1] = {}, now = Date.now()) => (await userApi(req(path, init), env, brevo, now))!;
const ask = (email: string, now?: number) => call('/api/user/code', { method: 'POST', body: JSON.stringify({ email }) }, now);
const verify = (email: string, code: string, now?: number) => call('/api/user/verify', { method: 'POST', body: JSON.stringify({ email, code }) }, now);
const codeOf = (i = mails.length - 1) => mails[i].text.match(/\d{6}/)![0];
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const signUp = async (email: string) => { await ask(email); return cookieOf(await verify(email, codeOf())); };
const adminCookie = async () => `novac_admin=${await makeSession(env, 'admin@novac.ae')}`;

describe('login codes', () => {
  it('are 6 digits', () => { for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/); });

  it('emails a code from no-reply@novac.ae and creates the account only when the right code is entered', async () => {
    expect((await ask(' Eng@Example.com ')).status).toBe(200);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: 'eng@example.com', from: 'no-reply@novac.ae' });
    expect(mails[0].subject).toContain(codeOf());
    expect((await call('/api/admin/users', { cookie: await adminCookie() }).then(r => r.json())).users).toHaveLength(0);
    const r = await verify('eng@example.com', codeOf());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, email: 'eng@example.com', pro: false });
    expect(r.headers.get('set-cookie')).toMatch(/^novac_user=.+; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=2592000$/);
    const s = await call('/api/user/session', { cookie: cookieOf(r) });
    expect(await s.json()).toMatchObject({ ok: true, email: 'eng@example.com', pro: false });
  });

  it('refuses a wrong code, counts the tries and then drops the code', async () => {
    await ask('a@b.com');
    const right = codeOf(), wrong = right === '000000' ? '111111' : '000000';
    const r1 = await verify('a@b.com', wrong);
    expect(r1.status).toBe(401);
    expect((await r1.json()).error).toContain('4 tries left');
    for (let i = 0; i < 4; i++) await verify('a@b.com', wrong);
    expect((await verify('a@b.com', right)).status).toBe(429);
    expect((await verify('a@b.com', right)).status).toBe(400);
  });

  it('expires codes after 10 minutes and uses each code once', async () => {
    const t = Date.now();
    await ask('a@b.com', t);
    expect((await verify('a@b.com', codeOf(), t + 11 * 60e3)).status).toBe(400);
    await ask('c@d.com', t);
    expect((await verify('c@d.com', codeOf(), t + 60e3)).status).toBe(200);
    expect((await verify('c@d.com', codeOf(), t + 61e3)).status).toBe(400);
  });

  it('spaces out resends and limits requests per address', async () => {
    const t = Date.now();
    await ask('a@b.com', t);
    expect((await ask('a@b.com', t + 10e3)).status).toBe(429);
    expect((await ask('a@b.com', t + 61e3)).status).toBe(200);
    for (let i = 0; i < 8; i++) await ask(`u${i}@b.com`, t);
    expect((await ask('z@b.com', t)).status).toBe(429);
  });

  it('reports a failed email and keeps no code for it', async () => {
    mailStatus = 400;
    expect((await ask('a@b.com')).status).toBe(502);
    mailStatus = 201;
    expect((await ask('a@b.com')).status).toBe(200);
  });

  it('refuses bad input, other sites and missing set-up', async () => {
    expect((await ask('not-an-email')).status).toBe(400);
    expect((await call('/api/user/code', { method: 'POST', body: '{', })).status).toBe(400);
    expect((await userApi(new Request(ORIGIN + '/api/user/code', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }), env, brevo))!.status).toBe(403);
    expect((await call('/api/user/session')).status).toBe(401);
    delete env.BREVO_API_KEY;
    expect((await ask('a@b.com')).status).toBe(503);
    delete env.DB;
    expect((await call('/api/user/session')).status).toBe(503);
    expect(await userApi(req('/api/config'), env)).toBeNull();
  });

  it('shows the code on the page in local development when no mail service is set', async () => {
    delete env.BREVO_API_KEY; env.DEV_SHOW_LOGIN_CODE = '1';
    const j = await (await ask('a@b.com')).json();
    expect(j.devCode).toMatch(/^\d{6}$/);
    expect((await verify('a@b.com', j.devCode)).status).toBe(200);
  });
});

describe('sessions', () => {
  it('a user cookie is not an admin session, and a tampered cookie is refused', async () => {
    const c = await signUp('a@b.com');
    expect((await call('/api/admin/users', { cookie: c.replace('novac_user', 'novac_admin') })).status).toBe(401);
    expect((await call('/api/user/session', { cookie: c.slice(0, -2) + 'xx' })).status).toBe(401);
    const out = await call('/api/user/logout', { method: 'POST' });
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('admin user list', () => {
  it('lists verified users, grants and removes Pro, blocks and deletes', async () => {
    const c = await signUp('eng@example.com'), admin = await adminCookie();
    expect((await call('/api/admin/users')).status).toBe(401);
    const list = await (await call('/api/admin/users', { cookie: admin })).json();
    expect(list.users).toEqual([expect.objectContaining({ email: 'eng@example.com', pro: false, blocked: false, logins: 1 })]);

    const patch = (b: object) => call('/api/admin/users', { method: 'PATCH', cookie: admin, body: JSON.stringify(b) });
    const p = await (await patch({ email: 'eng@example.com', pro: true })).json();
    expect(p.user).toMatchObject({ pro: true });
    expect(p.user.pro_since).toMatch(/^\d{4}-/);
    expect(await (await call('/api/user/session', { cookie: c })).json()).toMatchObject({ pro: true });

    await patch({ email: 'eng@example.com', blocked: true });
    expect((await call('/api/user/session', { cookie: c })).status).toBe(401);
    expect((await ask('eng@example.com')).status).toBe(403);
    await patch({ email: 'eng@example.com', blocked: false, pro: false });
    expect(await (await call('/api/user/session', { cookie: c })).json()).toMatchObject({ pro: false });

    expect((await patch({ email: 'nobody@x.com', pro: true })).status).toBe(404);
    expect((await call('/api/admin/users', { method: 'DELETE', cookie: admin, body: JSON.stringify({ email: 'eng@example.com' }) })).status).toBe(200);
    expect((await call('/api/user/session', { cookie: c })).status).toBe(401);
    expect((await (await call('/api/admin/users', { cookie: admin })).json()).users).toHaveLength(0);
  });
});
