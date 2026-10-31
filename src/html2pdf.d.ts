/* html2pdf.js ships without type definitions; only the chain used by the report is declared */
declare module 'html2pdf.js' {
  interface Html2PdfWorker {
    set(options: Record<string, unknown>): Html2PdfWorker;
    from(element: HTMLElement): Html2PdfWorker;
    save(): Promise<void>;
  }
  export default function html2pdf(): Html2PdfWorker;
}
