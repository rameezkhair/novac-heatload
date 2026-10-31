export function downloadFile(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* render an element to a Letter-size PDF and download it; the library is loaded only when first used */
export async function downloadPdf(filename: string, el: HTMLElement) {
  const { default: html2pdf } = await import('html2pdf.js');
  await html2pdf().set({
    filename,
    margin: [0.3, 0, 0.3, 0],
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#FFFFFF', windowWidth: 816 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.room', 'table', '.chart', '.kpis'] },
  }).from(el).save();
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files?.[0]; if (!f) return resolve(null); f.text().then(resolve, () => resolve(null)); };
    i.click();
  });
}

/* project files: where the browser allows it (Chrome, Edge), save writes back to the
   file that was opened or last saved; elsewhere it falls back to a download */
export interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
type Pickers = {
  showSaveFilePicker(o: object): Promise<FileHandle>;
  showOpenFilePicker(o: object): Promise<FileHandle[]>;
};
const pickers = () => window as unknown as Partial<Pickers>;
export const canSaveInPlace = () => typeof pickers().showSaveFilePicker === 'function';
const PROJECT_TYPES = [{ description: 'NOVAC project', accept: { 'application/json': ['.json'] } }];
const cancelled = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/* resolves to the handle written to, 'download' for the fallback, or null if cancelled */
export async function saveProjectFile(handle: FileHandle | null, suggestedName: string, data: string): Promise<FileHandle | 'download' | null> {
  const p = pickers();
  if (!p.showSaveFilePicker) { downloadFile(suggestedName, data, 'application/json'); return 'download'; }
  try {
    const h = handle ?? await p.showSaveFilePicker({ suggestedName, types: PROJECT_TYPES });
    const w = await h.createWritable(); await w.write(data); await w.close();
    return h;
  } catch (e) { if (cancelled(e)) return null; throw e; }
}

/* resolves to the file's text and its handle (null without the picker API), or null if cancelled */
export async function openProjectFile(): Promise<{ text: string; handle: FileHandle | null } | null> {
  const p = pickers();
  if (!p.showOpenFilePicker) { const text = await pickFile('.json,application/json'); return text == null ? null : { text, handle: null }; }
  try {
    const [h] = await p.showOpenFilePicker({ types: PROJECT_TYPES });
    return { text: await (await h.getFile()).text(), handle: h };
  } catch (e) { if (cancelled(e)) return null; throw e; }
}

/* resolves to a message for the toast */
export async function copyText(text: string, html?: string): Promise<string> {
  try {
    if (html && window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return 'Copied';
    }
    await navigator.clipboard.writeText(text);
    return html ? 'Copied as plain text' : 'Copied';
  } catch {
    return 'Copy failed: the browser blocked clipboard access';
  }
}
