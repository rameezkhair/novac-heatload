#!/usr/bin/env node
/* Before a deploy (GitHub Action): finds the Cloudflare KV namespace for the admin settings, or creates it, and writes
   its id into wrangler.jsonc in place of __SITE_KV_ID__. Needs wrangler with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TITLE = 'novac-site';
const wr = (...args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

let id = null;
try {
  const list = JSON.parse(wr('kv', 'namespace', 'list'));
  id = list.find(n => n.title === TITLE)?.id ?? null;
} catch (e) { console.error('Could not list KV namespaces:', e.message); process.exit(1); }
if (!id) {
  const out = wr('kv', 'namespace', 'create', TITLE);
  id = out.match(/"?id"?\s*[:=]\s*"([0-9a-f]{32})"/i)?.[1] ?? out.match(/([0-9a-f]{32})/)?.[1] ?? null;
  if (!id) { console.error('Could not read the new namespace id from:\n' + out); process.exit(1); }
  console.log(`Created KV namespace ${TITLE}: ${id}`);
} else console.log(`Using KV namespace ${TITLE}: ${id}`);

const f = 'wrangler.jsonc', s = readFileSync(f, 'utf8');
if (!s.includes('__SITE_KV_ID__')) { console.log('wrangler.jsonc already has a KV id'); process.exit(0); }
writeFileSync(f, s.replace('__SITE_KV_ID__', id));
