/* Self-contained project files. Save writes a small .novac.html page that carries the project and, when opened,
   sends the browser to NOVAC with the project in the URL fragment (after #), which browsers never send to a server.
   The same page opens through Open file, as do the older .novac.json files. */
import type { AppState } from './engine/types';
import { esc } from './engine/util';

const FRAG = 'open=';
const DATA_ID = 'novac-project';

const toB64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const pipe = async (bytes: Uint8Array, stream: GenericTransformStream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/* project → URL-safe text: deflate-compressed where the browser can ('z.'), plain otherwise ('j.') */
export async function encodeProject(s: AppState): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(s));
  try { return 'z.' + toB64url(await pipe(raw, new CompressionStream('deflate-raw'))); }
  catch { return 'j.' + toB64url(raw); }
}
export async function decodeProject(text: string): Promise<unknown> {
  const [kind, body] = [text.slice(0, 2), text.slice(2)];
  let bytes = fromB64url(body);
  if (kind === 'z.') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'j.') throw new Error('Not a NOVAC project link');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* the encoded project in a #open= fragment, if the page was opened from a project file */
export const projectInHash = (hash: string) => hash.startsWith('#' + FRAG) ? hash.slice(FRAG.length + 1) : null;

/* the contents of a saved file: a .novac.html page (project in its data block) or a .novac.json file */
export function projectFromFile(text: string): unknown {
  const m = text.match(new RegExp(`<script type="application/json" id="${DATA_ID}">([\\s\\S]*?)</script>`));
  return JSON.parse(m ? m[1] : text);
}

/* the .novac.html page; appUrl is the NOVAC calculator page it opens */
export async function projectHtml(s: AppState, appUrl: string, savedAt = new Date()): Promise<string> {
  const name = s.project.name || 'Untitled project';
  const href = `${appUrl.split('#')[0]}#${FRAG}${await encodeProject(s)}`;
  const date = savedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  /* JSON in a script block: escape every "<" so no "</script" or "<!--" in user text can change the parsing */
  const data = JSON.stringify(s).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="NOVAC">
<title>${esc(name)} · NOVAC project</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#0F1216;color:#E6E8EB;font:15px/1.55 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
main{max-width:460px;width:100%;padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#181C21}
.brand{display:flex;align-items:center;gap:8px;color:#C9A24A;font-weight:800;letter-spacing:.08em;font-size:13px}
.brand i{width:10px;height:10px;border-radius:2px;background:#C9A24A}
h1{margin:14px 0 4px;font-size:20px;line-height:1.3}
p{margin:0 0 12px;color:#9AA3AF;font-size:14px}
a.btn{display:inline-block;margin:6px 0 14px;padding:10px 18px;border-radius:8px;background:#C9A24A;color:#16130B;font-weight:700;text-decoration:none}
small{display:block;color:#9AA3AF;font-size:12px}
</style>
</head>
<body>
<main>
<div class="brand"><i></i>NOVAC · HEAT LOAD CALCULATOR</div>
<h1>${esc(name)}</h1>
<p>Saved ${esc(date)} · ${s.rooms.length} room${s.rooms.length === 1 ? '' : 's'}</p>
<p id="status">Opening the project in NOVAC…</p>
<a class="btn" id="open" href="${esc(href)}">Open in NOVAC</a>
<small>Opening needs an internet connection. The project stays in this file and in the link; it is not uploaded to a server.</small>
</main>
<script type="application/json" id="${DATA_ID}">${data}</script>
<script>setTimeout(function(){location.replace(document.getElementById('open').href)},300)</script>
</body>
</html>
`;
}
