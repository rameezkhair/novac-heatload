/* App state: one immutable AppState, changed through update(draft => ...) (immer).
   Every change is normalised (Al Sa'fat glazing band, code set consistency), autosaved to the
   browser and recorded for undo/redo. Consecutive edits to the same field within a short window
   are grouped into one undo step, so typing "24.5" undoes in one go. */
import { produce, type Draft } from 'immer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CODESETS } from '../engine/data';
import { computeAll } from '../engine/calc';
import { autoBand, exampleState, migrate, resolveProject } from '../engine/project';
import type { AppState } from '../engine/types';

const STORE = 'novac-heatload-v2';
const LEGACY = 'uae-heat-load-v1';
const LIBRARY = 'novac-heatload-projects';
const GROUP_MS = 600, MAX_HISTORY = 150;

function normalise(s: Draft<AppState>) {
  const p = s.project as AppState['project'];
  const T = computeAll(p, s.rooms as AppState['rooms']).T;
  if (autoBand(p, T)) resolveProject(p);
  if (!p.codeset || !CODESETS.find(c => c[0] === p.codeset && c[3] === p.cbasis)) {
    const c = CODESETS.find(c => c[3] === p.cbasis); p.codeset = c ? c[0] : 'safat-s-40';
  }
  if (!s.rooms.find(r => r.id === s.sel)) s.sel = s.rooms[0]?.id;
}

function load(): AppState {
  for (const key of [STORE, LEGACY]) {
    try { const raw = localStorage.getItem(key); if (raw) return migrate(JSON.parse(raw)); } catch { /* fall through */ }
  }
  return exampleState();
}

export interface Store {
  state: AppState;
  /* group: edits with the same key close together form one undo step */
  update: (fn: (s: Draft<AppState>) => void, group?: string) => void;
  replace: (s: AppState) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
}

export function useStore(): Store {
  /* the ref is the source of truth so updates chain correctly within one event; setState renders */
  const cur = useRef<AppState>(null as unknown as AppState);
  if (cur.current === null) cur.current = produce(load(), normalise);
  const [state, setState] = useState<AppState>(cur.current);
  const hist = useRef({ past: [] as AppState[], future: [] as AppState[], lastKey: '', lastAt: 0 });

  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage full or blocked */ } }, 300);
    return () => clearTimeout(t);
  }, [state]);

  const commit = useCallback((next: AppState, group?: string) => {
    const prev = cur.current; if (next === prev) return;
    const h = hist.current, now = Date.now();
    const grouped = group && group === h.lastKey && now - h.lastAt < GROUP_MS;
    if (!grouped) { h.past.push(prev); if (h.past.length > MAX_HISTORY) h.past.shift(); }
    h.future = []; h.lastKey = group || ''; h.lastAt = now;
    cur.current = next; setState(next);
  }, []);
  const update = useCallback((fn: (s: Draft<AppState>) => void, group?: string) => {
    commit(produce(cur.current, d => { fn(d); normalise(d); }), group);
  }, [commit]);
  const replace = useCallback((s: AppState) => commit(produce(s, normalise)), [commit]);
  const step = useCallback((from: 'past' | 'future') => {
    const h = hist.current, to = from === 'past' ? 'future' : 'past', s = h[from].pop(); if (!s) return;
    h[to].push(cur.current); h.lastKey = ''; cur.current = s; setState(s);
  }, []);
  const undo = useCallback(() => step('past'), [step]);
  const redo = useCallback(() => step('future'), [step]);
  return { state, update, replace, undo, redo, canUndo: hist.current.past.length > 0, canRedo: hist.current.future.length > 0 };
}

/* ---------- saved projects in this browser ---------- */
export interface SavedProject { id: string; name: string; savedAt: string; data: AppState }
export function listSaved(): SavedProject[] {
  try { const raw = localStorage.getItem(LIBRARY); const l = raw ? JSON.parse(raw) : []; return Array.isArray(l) ? l : []; } catch { return []; }
}
function writeSaved(l: SavedProject[]) { localStorage.setItem(LIBRARY, JSON.stringify(l)); }
export function saveToLibrary(s: AppState, id?: string): SavedProject {
  const l = listSaved(), name = s.project.name || 'Untitled project';
  const item: SavedProject = { id: id || 'p' + Date.now().toString(36), name, savedAt: new Date().toISOString(), data: s };
  const i = l.findIndex(x => x.id === item.id);
  if (i >= 0) l[i] = item; else l.unshift(item);
  writeSaved(l); return item;
}
export function deleteSaved(id: string) { writeSaved(listSaved().filter(x => x.id !== id)); }
