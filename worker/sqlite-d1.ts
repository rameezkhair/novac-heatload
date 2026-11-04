/* Local stand-in for the D1 binding, on Node's built-in SQLite: used by the dev server (vite.config.ts, file
   .novac-dev.sqlite) and the tests (in memory). Applies migrations/*.sql in order. Never bundled into the Worker. */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync as DB } from 'node:sqlite';
import type { D1 } from './users';

type SQLInputValue = null | number | bigint | string | Uint8Array;

export function sqliteD1(file = ':memory:', migrations = 'migrations'): D1 {
  /* loaded at run time: Vite 5 does not know node:sqlite as a Node built-in and cannot bundle it */
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DB };
  const db = new DatabaseSync(file);
  for (const f of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(`${migrations}/${f}`, 'utf8'));
  return {
    prepare: sql => ({
      bind: (...v: unknown[]) => {
        const args = v.map(x => (x === undefined ? null : x) as SQLInputValue), st = () => db.prepare(sql);
        return {
          run: async () => st().run(...args),
          first: async <T,>() => (st().get(...args) as T | undefined) ?? null,
          all: async <T,>() => ({ results: st().all(...args) as T[] }),
        };
      },
    }),
  };
}
