/* newsletter sign-up: the address goes to the site's own Worker (worker/index.ts), which keeps it in the D1 database */
export const CONSENT_TEXT = 'Send me NOVAC newsletters and product updates. I can unsubscribe at any time.';

export const validEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/* resolves to whether the address was saved; a failure never stops the report being emailed */
export async function subscribe(email: string, source: string): Promise<boolean> {
  try {
    const r = await fetch('/api/subscribe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, consent: true, consentText: CONSENT_TEXT, source }),
    });
    return r.ok;
  } catch { return false; }
}
