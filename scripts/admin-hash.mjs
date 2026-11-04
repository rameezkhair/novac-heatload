#!/usr/bin/env node
/* Makes the admin password hash for ADMIN_PASSWORD_HASH (the same PBKDF2-SHA256 format worker/admin.ts checks) and a
   random SESSION_SECRET. Usage: npm run admin:hash   (asks for the password, so it does not land in the shell history)
   Local dev server only: npm run admin:hash -- --local   (accepts 8 characters) */
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline';

const ITERATIONS = 100000;
const b64 = b => Buffer.from(b).toString('base64');

async function hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

const ask = q => new Promise(res => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a); }); });
/* --local: for the local dev server only (.dev.vars), a password of 8 characters is accepted; the live site needs 12 */
const local = process.argv.includes('--local'), args = process.argv.slice(2).filter(a => a !== '--local'), min = local ? 8 : 12;
const password = args[0] ?? await ask(`Admin password (at least ${min} characters): `);
if (!password || password.length < min) { console.error(`Use a password of at least ${min} characters.`); process.exit(1); }
if (local) console.log('Local use only: put these in .dev.vars, not in the live site\'s secrets.');
console.log(`\nADMIN_PASSWORD_HASH=${await hash(password)}`);
console.log(`SESSION_SECRET=${b64(crypto.getRandomValues(new Uint8Array(32)))}`);
console.log('\nProduction: npx wrangler secret put ADMIN_EMAIL, then ADMIN_PASSWORD_HASH and SESSION_SECRET, pasting each value.');
console.log('Local dev: put ADMIN_EMAIL=..., ADMIN_PASSWORD_HASH=... and SESSION_SECRET=... in .dev.vars (not committed).');
