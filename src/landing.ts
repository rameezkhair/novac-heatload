/* Landing page motion: sections fade up as they scroll into view, the key figures count up once, and the nav
   marks the section being read. Everything is static content without this script, and reduced motion skips it. */
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* fade-up on entry, staggered within a group */
const seen = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target as HTMLElement, sibs = [...(el.parentElement?.children ?? [])].filter(x => x.classList.contains('reveal'));
  el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 6) * 70}ms`;
  el.classList.add('in'); seen.unobserve(el);
  /* the stagger applies to the entrance only, not to later hover effects */
  el.addEventListener('transitionend', () => { el.style.transitionDelay = ''; }, { once: true });
}), { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach(el => still ? el.classList.add('in') : seen.observe(el));

/* count the key figures up from zero */
const fmt = (v: number, d: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const count = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target as HTMLElement, to = Number(el.dataset.count), d = Number(el.dataset.dec || 0), t0 = performance.now(), ms = 1200;
  count.unobserve(el);
  const tick = (t: number) => {
    const f = Math.min(1, (t - t0) / ms), ease = 1 - (1 - f) ** 3;
    el.textContent = fmt(to * ease, d);
    if (f < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), { threshold: 0.6 });
if (!still) document.querySelectorAll<HTMLElement>('[data-count]').forEach(el => count.observe(el));

/* nav: mark the section in view, and lift the bar once the page scrolls */
const links = new Map([...document.querySelectorAll<HTMLAnchorElement>('.links a')].map(a => [a.hash.slice(1), a]));
const spy = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  links.forEach(a => a.removeAttribute('aria-current'));
  links.get(e.target.id)?.setAttribute('aria-current', 'true');
}), { rootMargin: '-45% 0px -50% 0px' });
links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
const nav = document.querySelector('.nav');
const lift = () => nav?.classList.toggle('lifted', scrollY > 8);
addEventListener('scroll', lift, { passive: true }); lift();

/* site texts set in the admin panel (admin.html): headline, subheading, support email and the announcement banner.
   The page keeps its built-in text when nothing is set or the configuration cannot be loaded. */
import('./siteConfig').then(async ({ loadSiteConfig, emphasis }) => {
  const c = await loadSiteConfig(); if (!c) return;
  const t = c.texts;
  const h = document.querySelector<HTMLElement>('.hero-h'); if (h && t.heroTitle) h.innerHTML = emphasis(t.heroTitle);
  const lead = document.querySelector<HTMLElement>('.hero .lead, .lead'); if (lead && t.heroLead) lead.textContent = t.heroLead;
  if (t.supportEmail) document.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]').forEach(a => { a.href = `mailto:${t.supportEmail}`; if (a.textContent?.includes('@')) a.textContent = t.supportEmail!; });
  if (t.bannerOn && t.bannerText) {
    const b = document.createElement('div'); b.className = `site-banner ${t.bannerTone ?? 'info'}`; b.setAttribute('role', 'note'); b.textContent = t.bannerText;
    document.body.prepend(b);
  }
});
