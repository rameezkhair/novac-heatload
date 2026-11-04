/* Brevo (formerly Sendinblue): newsletter sign-ups are added as contacts to a Brevo list through the Brevo API.
   The API key is a Worker secret (BREVO_API_KEY); the list and the optional double opt-in are plain variables.
   API reference: https://developers.brevo.com/reference (POST /v3/contacts, POST /v3/contacts/doubleOptinConfirmation). */
export interface BrevoEnv {
  BREVO_API_KEY?: string;
  /* the id of the Brevo contact list sign-ups go to */
  BREVO_LIST_ID?: string;
  /* double opt-in: the id of a Brevo "double opt-in" template and the page people land on after confirming */
  BREVO_DOI_TEMPLATE_ID?: string;
  BREVO_DOI_REDIRECT_URL?: string;
}
const API = 'https://api.brevo.com/v3';

export const brevoOn = (env: BrevoEnv) => !!(env.BREVO_API_KEY && env.BREVO_LIST_ID && Number(env.BREVO_LIST_ID) > 0);

/* adds or updates the contact in the list, or with double opt-in sends Brevo's confirmation email first;
   resolves to whether Brevo accepted it */
export async function brevoSubscribe(env: BrevoEnv, email: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; status: number; doi: boolean }> {
  if (!brevoOn(env)) return { ok: false, status: 0, doi: false };
  const list = Number(env.BREVO_LIST_ID), doi = !!(env.BREVO_DOI_TEMPLATE_ID && env.BREVO_DOI_REDIRECT_URL);
  const body = doi
    ? { email, includeListIds: [list], templateId: Number(env.BREVO_DOI_TEMPLATE_ID), redirectionUrl: env.BREVO_DOI_REDIRECT_URL }
    : { email, listIds: [list], updateEnabled: true };
  const res = await fetcher(`${API}/contacts${doi ? '/doubleOptinConfirmation' : ''}`, {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  /* 201 created, 204 updated or confirmation sent; a contact that already exists is not an error */
  return { ok: res.ok || res.status === 400 && /duplicate/i.test(await res.text().catch(() => '')), status: res.status, doi };
}
