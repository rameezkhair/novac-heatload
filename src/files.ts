export function downloadFile(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* render an element to a Letter-size PDF and download it; the library is loaded only when first used */
/* the html2pdf worker is itself a promise, so it is finished inside the callback rather than returned */
async function makePdf<T>(filename: string, el: HTMLElement, avoid: string[], finish: (w: Html2PdfWorker) => Promise<T>): Promise<T> {
  const { default: html2pdf } = await import('html2pdf.js');
  return finish(html2pdf().set({
    filename,
    margin: [0.3, 0, 0.3, 0],
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#FFFFFF', windowWidth: 816 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid },
  }).from(el));
}
type Html2PdfWorker = ReturnType<typeof import('html2pdf.js').default>;
const PDF_AVOID = ['.room', 'table', '.chart', '.kpis'];
export function downloadPdf(filename: string, el: HTMLElement, avoid = PDF_AVOID) {
  return makePdf(filename, el, avoid, w => w.save());
}

/* email a PDF: where the browser can share files (Windows, macOS, phones) the system share sheet offers the
   mail app with the PDF attached; elsewhere the PDF is downloaded and a new email opens to attach it to */
export async function emailPdf(filename: string, el: HTMLElement, subject: string, body: string): Promise<'shared' | 'mailto' | 'cancelled'> {
  const blob = await makePdf(filename, el, PDF_AVOID, w => w.outputPdf('blob'));
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: subject, text: body }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + `\n\nAttached: ${filename}`)}`;
  return 'mailto';
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
/* projects save as .novac.html pages; older .novac.json files still open */
const SAVE_TYPES = [{ description: 'NOVAC project', accept: { 'text/html': ['.html'] } }];
const OPEN_TYPES = [{ description: 'NOVAC project', accept: { 'text/html': ['.html'], 'application/json': ['.json'] } }];
const cancelled = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/* resolves to the handle written to, 'download' for the fallback, or null if cancelled */
export async function saveProjectFile(handle: FileHandle | null, suggestedName: string, data: string): Promise<FileHandle | 'download' | null> {
  const p = pickers();
  if (!p.showSaveFilePicker) { downloadFile(suggestedName, data, 'text/html'); return 'download'; }
  try {
    const h = handle ?? await p.showSaveFilePicker({ suggestedName, types: SAVE_TYPES });
    const w = await h.createWritable(); await w.write(data); await w.close();
    return h;
  } catch (e) { if (cancelled(e)) return null; throw e; }
}

/* resolves to the file's text and its handle (null without the picker API), or null if cancelled */
export async function openProjectFile(): Promise<{ text: string; handle: FileHandle | null } | null> {
  const p = pickers();
  if (!p.showOpenFilePicker) { const text = await pickFile('.html,.json,text/html,application/json'); return text == null ? null : { text, handle: null }; }
  try {
    const [h] = await p.showOpenFilePicker({ types: OPEN_TYPES });
    return { text: await (await h.getFile()).text(), handle: h };
  } catch (e) { if (cancelled(e)) return null; throw e; }
}
