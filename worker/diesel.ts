/* Live UAE diesel retail price. The UAE Fuel Price Committee sets it monthly; there is no official API, so this reads
   the price from openvan.camp's UAE fuel price page (a third-party aggregator), whose page title carries it, e.g.
   "UAE Fuel Prices, 31 Oct 2026 — Diesel 4.80 AED/L (…) · Petrol 4.28 AED/L …". Used by the Worker (/api/diesel)
   and by the Vite dev server. */
export const DIESEL_SOURCE = 'https://openvan.camp/en/tools/fuel-prices/uae';

export interface DieselPrice { price: number; unit: 'AED/L'; date: string; source: string; url: string; retrieved: string }

/* the price and its date from the page's <title> */
export function parseDiesel(html: string): { price: number; date: string } | null {
  const t = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
  const p = t.match(/Diesel\s+([\d.]+)\s*AED\s*\/\s*L/i), d = t.match(/UAE Fuel Prices,\s*([^—–-]+?)\s*[—–-]/i);
  const price = p ? Number(p[1]) : NaN;
  /* a UAE retail diesel price is a few dirhams a litre; anything else means the page changed */
  if (!Number.isFinite(price) || price < 0.5 || price > 20) return null;
  return { price, date: d ? d[1].trim() : '' };
}

export async function fetchDiesel(fetcher: typeof fetch = fetch): Promise<DieselPrice> {
  const res = await fetcher(DIESEL_SOURCE, { headers: { 'User-Agent': 'NOVAC heat load calculator (diesel price check)', Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Price page answered ${res.status}`);
  const x = parseDiesel(await res.text());
  if (!x) throw new Error('Could not read the diesel price from the page');
  return { ...x, unit: 'AED/L', source: 'openvan.camp (aggregated from UAE Fuel Price Committee retail prices)', url: DIESEL_SOURCE, retrieved: new Date().toISOString() };
}
