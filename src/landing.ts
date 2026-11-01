/* Landing page behaviour. Content never depends on this script: it only adds the phone menu, marks the section in
   view in the nav, and lifts the nav once the page scrolls. */
const nav = document.querySelector<HTMLElement>('.nav');
const btn = document.querySelector<HTMLButtonElement>('.menu-btn');

/* phone menu: open and close, and close after choosing a link */
const setOpen = (open: boolean) => { nav?.classList.toggle('open', open); btn?.setAttribute('aria-expanded', String(open)); };
btn?.addEventListener('click', () => setOpen(!nav?.classList.contains('open')));
document.querySelectorAll('.links a').forEach(a => a.addEventListener('click', () => setOpen(false)));
addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

/* nav: mark the section being read */
const links = new Map([...document.querySelectorAll<HTMLAnchorElement>('.links a[href^="#"]')].map(a => [a.hash.slice(1), a]));
if ('IntersectionObserver' in window) {
  const spy = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(a => a.removeAttribute('aria-current'));
    links.get(e.target.id)?.setAttribute('aria-current', 'true');
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
}

/* lift the nav once the page has scrolled */
const lift = () => nav?.classList.toggle('lifted', scrollY > 8);
addEventListener('scroll', lift, { passive: true }); lift();
