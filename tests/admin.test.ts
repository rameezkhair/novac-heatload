import { beforeEach, describe, expect, it } from 'vitest';
import { adminApi, hashPassword, resetThrottle, verifyPassword, type AdminEnv, type KV } from '../worker/admin';
import { cleanConfig, emphasis, statusOf } from '../src/siteConfig';

const ORIGIN = 'https://novac.ae';
const memKV = (): KV & { data: Record<string, string> } => { const data: Record<string, string> = {}; return { data, get: async k => data[k] ?? null, put: async (k, v) => { data[k] = v; } }; };
let env: AdminEnv & { SITE: ReturnType<typeof memKV> };
beforeEach(async () => {
  resetThrottle();
  env = { ADMIN_EMAIL: 'Admin@Novac.ae', ADMIN_PASSWORD_HASH: await hashPassword('correct horse battery'), SESSION_SECRET: 'test-secret-0123456789', SITE: memKV() };
});
const req = (path: string, init: RequestInit & { cookie?: string } = {}) => new Request(ORIGIN + path, {
  ...init, headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4', ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers as Record<string, string> || {}) },
});
const login = async (password = 'correct horse battery', email = 'admin@novac.ae') => (await adminApi(req('/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }), env))!;
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];

describe('admin password', () => {
  it('hashes with a salt and verifies only the right password', async () => {
    const h = await hashPassword('s3cret password');
    expect(h).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await hashPassword('s3cret password')).not.toBe(h);
    expect(await verifyPassword('s3cret password', h)).toBe(true);
    expect(await verifyPassword('s3cret passwore', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('admin login and session', () => {
  it('logs in with the right email (any case) and password, and sets a secure session cookie', async () => {
    const r = await login();
    expect(r.status).toBe(200);
    const sc = r.headers.get('set-cookie')!;
    expect(sc).toMatch(/^novac_admin=/);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=43200']) expect(sc).toContain(flag);
    const s = await adminApi(req('/api/admin/session', { cookie: cookieOf(r) }), env);
    expect(s!.status).toBe(200);
    expect((await s!.json()).email).toBe('admin@novac.ae');
  });
  it('refuses a wrong password, a forged cookie and other sites', async () => {
    expect((await login('wrong password')).status).toBe(401);
    expect((await adminApi(req('/api/admin/session', { cookie: 'novac_admin=eyJlIjoieCIsIngiOjk5OTk5OTk5OTk5OTl9.forged' }), env))!.status).toBe(401);
    expect((await adminApi(req('/api/admin/session'), env))!.status).toBe(401);
    const evil = new Request(ORIGIN + '/api/admin/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
    expect((await adminApi(evil, env))!.status).toBe(403);
  });
  it('locks out after 5 failed attempts from one address', async () => {
    for (let i = 0; i < 5; i++) expect((await login('nope')).status).toBe(401);
    expect((await login()).status).toBe(429);
  });
  it('expires the session after 12 hours', async () => {
    const { makeSession, readSession } = await import('../worker/admin');
    const t = await makeSession(env, 'admin@novac.ae', 0);
    const r = req('/api/admin/session', { cookie: `novac_admin=${t}` });
    expect(await readSession(env, r, 11 * 3600e3)).toBe('admin@novac.ae');
    expect(await readSession(env, r, 13 * 3600e3)).toBeNull();
  });
  it('says the login is not set up when the secrets are missing', async () => {
    const r = await adminApi(req('/api/admin/session'), { SITE: memKV() });
    expect(r!.status).toBe(503);
  });
});

describe('site configuration', () => {
  it('saves only for a logged-in admin and serves it to everyone', async () => {
    const body = JSON.stringify({ config: { features: { hourly: 'hidden', energy: 'locked', audit: 'live', bogus: 'live' }, texts: { bannerOn: true, bannerText: 'New: DEWA billing', heroTitle: 'Fast *loads*', supportEmail: 'not-an-email' } } });
    expect((await adminApi(req('/api/admin/config', { method: 'PUT', body }), env))!.status).toBe(401);
    const c = cookieOf(await login());
    const r = await adminApi(req('/api/admin/config', { method: 'PUT', body, cookie: c }), env);
    expect(r!.status).toBe(200);
    const pub = await (await adminApi(new Request(ORIGIN + '/api/config'), env))!.json();
    expect(pub.config.features).toEqual({ hourly: 'hidden', energy: 'locked', audit: 'soon' });
    expect(pub.config.texts.bannerText).toBe('New: DEWA billing');
    expect(pub.config.texts.supportEmail).toBeUndefined();
    expect(pub.config.by).toBe('admin@novac.ae');
  });
  it('gives no configuration until one is saved, and refuses to save without storage', async () => {
    expect(await (await adminApi(new Request(ORIGIN + '/api/config'), env))!.json()).toEqual({ config: null });
    const c = cookieOf(await login());
    delete (env as AdminEnv).SITE;
    expect((await adminApi(req('/api/admin/config', { method: 'PUT', body: '{"config":{}}', cookie: c }), env))!.status).toBe(503);
  });
  it('cleans texts and resolves statuses with the defaults', () => {
    const c = cleanConfig({ features: { ducts: 'live', chiller: 'live' }, texts: { heroTitle: '<script>x</script> *now*' } })!;
    expect(statusOf(c, 'chiller')).toBe('soon');
    expect(statusOf(c, 'ducts')).toBe('live');
    expect(statusOf(null, 'library')).toBe('live');
    expect(emphasis(c.texts.heroTitle!)).toBe('&lt;script&gt;x&lt;/script&gt; <em>now</em>');
  });
});
