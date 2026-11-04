/* Site configuration set by the admin (admin.html): the status of every Pro tool, add-on and app page, and the site texts.
   The Worker keeps it (GET /api/config, PUT /api/admin/config); the calculator and the landing page read it on load.
   Anything the admin has not set falls back to the built-in default, so the site works with no configuration at all. */
import { PRO } from './pro';

/* draft: deployed but not activated; visitors do not see it, the logged-in admin sees it as a preview */
export type FeatureStatus = 'live' | 'draft' | 'locked' | 'soon' | 'hidden';
export const STATUS_LABEL: Record<FeatureStatus, string> = { live: 'Live', draft: 'Draft (admin preview)', locked: 'Locked (Pro)', soon: 'Coming soon', hidden: 'Hidden' };
export type FeatureGroup = 'pro' | 'addon' | 'update' | 'page';
/* built: the feature exists, so it may be set live; the others can only be locked, coming soon or hidden */
export interface Feature { id: string; label: string; group: FeatureGroup; built: boolean }
export const FEATURES: Feature[] = [
  { id: 'hourly', label: 'Hourly analysis', group: 'pro', built: true },
  { id: 'energy', label: 'Energy modelling', group: 'pro', built: true },
  { id: 'iaq', label: 'Indoor air quality', group: 'pro', built: true },
  { id: 'audit', label: 'Energy audit', group: 'pro', built: false },
  { id: 'ducts', label: 'Duct sizing', group: 'addon', built: true },
  { id: 'equipment', label: 'Equipment schedules', group: 'addon', built: false },
  { id: 'kitchen', label: 'Kitchen ventilation', group: 'addon', built: false },
  { id: 'carpark', label: 'Car park ventilation', group: 'addon', built: false },
  { id: 'stair', label: 'Staircase pressurisation', group: 'addon', built: false },
  { id: 'chiller', label: 'Chiller selection', group: 'addon', built: false },
  { id: 'pipes', label: 'Pipes and pumps', group: 'addon', built: false },
  { id: 'district', label: 'District cooling', group: 'addon', built: false },
  { id: 'storage', label: 'Thermal storage', group: 'addon', built: false },
  { id: 'green', label: 'Green building', group: 'addon', built: false },
  { id: 'condensate', label: 'Condensate recovery', group: 'addon', built: false },
  { id: 'lcc', label: 'Life-cycle cost', group: 'addon', built: false },
  /* updates inside the calculator's own steps */
  { id: 'freshair', label: 'Fresh air load switches (per space and whole system)', group: 'update', built: true },
  { id: 'pkgoa', label: 'Packaged unit fresh air, % of supply air', group: 'update', built: true },
  { id: 'library', label: 'Library', group: 'page', built: true },
  { id: 'forum', label: 'Forum', group: 'page', built: true },
  { id: 'chat', label: 'Community chat', group: 'page', built: true },
  { id: 'support', label: 'Support', group: 'page', built: true },
];
export const featureByLabel = (label: string) => FEATURES.find(f => f.label === label);

export interface SiteTexts {
  /* announcement banner across the top of the calculator and the landing page */
  bannerOn?: boolean; bannerText?: string; bannerTone?: 'info' | 'warn' | 'ok';
  /* landing page hero; *word* is shown emphasised */
  heroTitle?: string; heroLead?: string;
  /* calculator header */
  appTitle?: string; appTag?: string;
  supportEmail?: string;
}
export interface SiteConfig { version: 1; updated?: string; by?: string; features: Partial<Record<string, FeatureStatus>>; texts: SiteTexts }
export const emptyConfig = (): SiteConfig => ({ version: 1, features: {}, texts: {} });

/* the built-in status of a feature: a built Pro tool or add-on is a draft until the admin activates it (the build's
   Pro switches, used in development and tests, make it live), a feature not built yet is coming soon, pages are live */
export function defaultStatus(f: Feature): FeatureStatus {
  if (f.group === 'page') return 'live';
  if (!f.built) return 'soon';
  if (f.id === 'ducts') return PRO.ducts ? 'live' : 'draft';
  return PRO.unlocked ? 'live' : 'draft';
}
/* what a visitor gets: for the admin a draft is a preview that opens like a live feature; for everyone else a draft
   looks as it did before it was built: a Pro tool or add-on shows as coming soon, an update inside a step is not shown */
export type Shown = Exclude<FeatureStatus, 'draft'> | 'preview';
export const shownStatus = (s: FeatureStatus, admin: boolean, group?: FeatureGroup): Shown =>
  s === 'draft' ? (admin ? 'preview' : group === 'update' ? 'hidden' : 'soon') : s;
/* what a visitor gets for one feature */
export const shownOf = (cfg: SiteConfig | null, id: string, admin: boolean): Shown => shownStatus(statusOf(cfg, id), admin, FEATURES.find(f => f.id === id)?.group);
/* the status in force: the admin's choice, else the default; a feature that is not built is never live */
export function statusOf(cfg: SiteConfig | null, id: string): FeatureStatus {
  const f = FEATURES.find(x => x.id === id); if (!f) return 'hidden';
  const s = cfg?.features[id] ?? defaultStatus(f);
  return (s === 'live' || s === 'draft') && !f.built ? 'soon' : s;
}

const STATUSES: FeatureStatus[] = ['live', 'draft', 'locked', 'soon', 'hidden'];
const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : undefined;
/* a configuration as received from the admin or from storage, reduced to known keys and safe values */
export function cleanConfig(x: unknown): SiteConfig | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>, c = emptyConfig();
  const fe = (o.features && typeof o.features === 'object' ? o.features : {}) as Record<string, unknown>;
  for (const f of FEATURES) { const v = fe[f.id]; if (typeof v === 'string' && STATUSES.includes(v as FeatureStatus)) c.features[f.id] = !f.built && (v === 'live' || v === 'draft') ? 'soon' : v as FeatureStatus; }
  const t = (o.texts && typeof o.texts === 'object' ? o.texts : {}) as Record<string, unknown>;
  c.texts = {
    bannerOn: t.bannerOn === true, bannerText: str(t.bannerText, 300), bannerTone: t.bannerTone === 'warn' || t.bannerTone === 'ok' ? t.bannerTone : 'info',
    heroTitle: str(t.heroTitle, 140), heroLead: str(t.heroLead, 500), appTitle: str(t.appTitle, 80), appTag: str(t.appTag, 120),
    supportEmail: (() => { const e = str(t.supportEmail, 120); return e && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(e) ? e : undefined; })(),
  };
  for (const k of Object.keys(c.texts) as (keyof SiteTexts)[]) if (c.texts[k] === undefined || c.texts[k] === '') delete c.texts[k];
  if (typeof o.updated === 'string') c.updated = o.updated.slice(0, 40);
  if (typeof o.by === 'string') c.by = o.by.slice(0, 120);
  return c;
}

/* plain text with *emphasis* as safe HTML */
export const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
export const emphasis = (s: string) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

/* the configuration in this page: loaded once from the Worker; null until then or when none is set */
let remote: SiteConfig | null = null;
const listeners = new Set<() => void>();
export function setSiteConfig(c: SiteConfig | null) { remote = c; listeners.forEach(l => l()); }
/* for the React hook in useSiteConfig.ts: subscribe to changes and read the current configuration */
export const subscribeSiteConfig = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const currentSiteConfig = () => remote;
/* whether this browser is logged in to the admin panel: drafts are then shown as previews */
let admin = false;
export const isAdmin = () => admin;
export function setAdminPreview(v: boolean) { admin = v; listeners.forEach(l => l()); }
export async function loadAdminSession() {
  try { const r = await fetch('/api/admin/session', { credentials: 'same-origin' }); setAdminPreview(r.ok); } catch { setAdminPreview(false); }
}
export async function loadSiteConfig(): Promise<SiteConfig | null> {
  try {
    const r = await fetch('/api/config', { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const c = cleanConfig((await r.json()).config);
    setSiteConfig(c); return c;
  } catch { return null; }
}
