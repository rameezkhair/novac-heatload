/* Price book: the user's selling prices for energy modelling (what the client pays), kept in this browser and
   exportable as a file. Every project's energy model takes its costs from here unless the project has its own. */
import type { PowerSettings } from './engine/power';

export type PriceKey = 'cPV' | 'cInv' | 'cBat' | 'cGen' | 'tGrid' | 'tSolar' | 'tExport' | 'genOM' | 'diesel';
export const PRICE_ITEMS: { key: PriceKey; label: string; unit: string; group: 'capital' | 'running' }[] = [
  { key: 'cPV', label: 'Solar PV, installed', unit: 'AED/Wp', group: 'capital' },
  { key: 'cInv', label: 'Inverter', unit: 'AED/kW', group: 'capital' },
  { key: 'cBat', label: 'Battery', unit: 'AED/kWh', group: 'capital' },
  { key: 'cGen', label: 'Genset', unit: 'AED/kVA', group: 'capital' },
  { key: 'tGrid', label: 'Grid tariff', unit: 'AED/kWh', group: 'running' },
  { key: 'tSolar', label: 'Solar PPA or O&M', unit: 'AED/kWh', group: 'running' },
  { key: 'tExport', label: 'Export credit', unit: 'AED/kWh', group: 'running' },
  { key: 'genOM', label: 'Genset maintenance', unit: 'AED/kWh', group: 'running' },
  { key: 'diesel', label: 'Diesel', unit: 'AED/L', group: 'running' },
];
export interface PriceEntry { price: number; supplier?: string; date?: string }
export interface PriceBook { version: 1; updated: string; items: Partial<Record<PriceKey, PriceEntry>> }

const KEY = 'novac.pricebook.v1';
export function loadBook(): PriceBook | null {
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j && j.version === 1 && j.items ? j : null; } catch { return null; }
}
export function saveBook(b: PriceBook) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* storage blocked or full */ } }
export const today = () => new Date().toISOString().slice(0, 10);

/* the price book as energy modelling settings: the defaults for any cost a project has not set itself */
export function bookCosts(b: PriceBook | null): Partial<PowerSettings> {
  const o: Partial<PowerSettings> = {};
  if (b) for (const it of PRICE_ITEMS) { const e = b.items[it.key]; if (e && Number.isFinite(e.price)) (o as Record<string, unknown>)[it.key] = e.price; }
  return o;
}
/* a price book file read back: only known items with numeric prices */
export function parseBook(text: string): PriceBook | null {
  try {
    const j = JSON.parse(text); if (!j || typeof j !== 'object' || !j.items) return null;
    const items: PriceBook['items'] = {};
    for (const it of PRICE_ITEMS) { const e = j.items[it.key]; if (e && Number.isFinite(Number(e.price))) items[it.key] = { price: Number(e.price), supplier: e.supplier ? String(e.supplier).slice(0, 80) : undefined, date: e.date ? String(e.date).slice(0, 10) : undefined }; }
    return { version: 1, updated: today(), items };
  } catch { return null; }
}

/* live UAE diesel price from the app's server (/api/diesel) */
export interface LiveDiesel { price: number; date: string; source: string; url: string; retrieved: string }
export async function liveDiesel(signal?: AbortSignal): Promise<LiveDiesel> {
  const res = await fetch('/api/diesel', { signal });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !Number.isFinite(j.price)) throw new Error(j.error || `Diesel price not available (${res.status})`);
  return j;
}
