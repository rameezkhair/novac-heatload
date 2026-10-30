export function downloadFile(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files?.[0]; if (!f) return resolve(null); f.text().then(resolve, () => resolve(null)); };
    i.click();
  });
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
