/* Downloaded weather and air-quality years are kept in this browser (IndexedDB), so a project reopens without
   downloading again. Where IndexedDB is unavailable (private windows, tests) an in-memory cache is used. */
import type { WeatherYear } from './types';

const DB = 'novac-weather', STORE = 'years';
const mem = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function getCached<T = WeatherYear>(key: string): Promise<T | null> {
  const hit = mem.get(key) as T | undefined; if (hit) return hit;
  const db = await open(); if (!db) return null;
  return new Promise(resolve => {
    try {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => { const v = q.result as T | undefined; if (v) mem.set(key, v); resolve(v ?? null); };
      q.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function putCached(wx: { key: string }): Promise<void> {
  mem.set(wx.key, wx);
  const db = await open(); if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(wx, wx.key);
      t.oncomplete = () => resolve(); t.onerror = () => resolve();
    } catch { resolve(); }
  });
}
