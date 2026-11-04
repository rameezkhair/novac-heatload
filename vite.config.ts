import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchDiesel } from './worker/diesel';
import { adminApi } from './worker/admin';
import { userApi, type UsersEnv } from './worker/users';
import { sqliteD1 } from './worker/sqlite-d1';

/* the Worker's API, served by the dev server too: the live diesel price, the site configuration, the admin login and the
   user accounts. Admin secrets come from .dev.vars (KEY=value lines, as wrangler uses), the configuration is kept in
   .novac-site.json and the user database in .novac-dev.sqlite; all are ignored by git. Without BREVO_API_KEY in .dev.vars
   the login code is shown on the page instead of emailed. */
const devVars = () => existsSync('.dev.vars')
  ? Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  : {};
const fileKV = { get: async (k: string) => { try { return JSON.parse(readFileSync('.novac-site.json', 'utf8'))[k] ?? null; } catch { return null; } },
  put: async (k: string, v: string) => { let o: Record<string, string> = {}; try { o = JSON.parse(readFileSync('.novac-site.json', 'utf8')); } catch { /* new file */ } o[k] = v; writeFileSync('.novac-site.json', JSON.stringify(o, null, 1)); } };

async function toRequest(req: IncomingMessage) {
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost', proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  return new Request(`${proto.split(',')[0]}://${host.split(',')[0]}${req.url}`, { method: req.method, headers, body: chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined });
}
async function send(res: ServerResponse, r: Response) {
  res.statusCode = r.status; r.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await r.arrayBuffer()));
}

const workerApi = (): Plugin => ({
  name: 'novac-worker-api',
  configureServer(server) {
    let cache: { at: number; body: string } | null = null, db: UsersEnv['DB'];
    server.middlewares.use('/api/diesel', async (_req, res) => {
      try {
        if (!cache || Date.now() - cache.at > 12 * 3600 * 1000) cache = { at: Date.now(), body: JSON.stringify(await fetchDiesel()) };
        res.setHeader('content-type', 'application/json'); res.end(cache.body);
      } catch (e) {
        res.statusCode = 502; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    /* /admin is the admin page, as on the live site */
    server.middlewares.use((req, _res, next) => { if (req.url === '/admin' || req.url === '/admin/' || req.url?.startsWith('/admin?')) req.url = '/admin.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''); next(); });
    server.middlewares.use(async (req, res, next) => {
      if (!req.url || !(req.url.startsWith('/api/config') || req.url.startsWith('/api/admin/') || req.url.startsWith('/api/user/'))) return next();
      try {
        db ??= sqliteD1('.novac-dev.sqlite');
        const env: UsersEnv = { DEV_SHOW_LOGIN_CODE: '1', ...devVars(), SITE: fileKV, DB: db }, request = await toRequest(req);
        const r = await userApi(request, env) ?? await adminApi(request, env);
        if (!r) return next();
        await send(res, r);
      } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: (e as Error).message })); }
    });
  },
});

export default defineConfig({
  plugins: [react(), workerApi()],
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', app: 'app.html', admin: 'admin.html', heatloadCalculator: 'heatload-calculator/index.html' } } },
  test: { environment: 'node' },
} as any);
