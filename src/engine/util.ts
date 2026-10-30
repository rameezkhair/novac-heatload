export const num = (v: unknown): number => { const x = parseFloat(v as string); return isFinite(x) ? x : 0; };
export const blank = (v: unknown) => v === '' || v == null;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const fmt = (x: number, d = 1) => isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
/* plain number for an input value: no thousands separators */
export const fmtIn = (x: number, d = 1) => isFinite(x) ? String(Math.round(x * 10 ** d) / 10 ** d) : '';
export const fmtM2 = (d: number) => d >= 10 ? d.toFixed(0) : String(+d.toFixed(2));
export const hh = (h: number) => String(h).padStart(2, '0');

/* Accepts numbers or simple arithmetic: 6*3.2 + 2.5*3.2, 4.5x3, (10-1.2)*3.
   Returns '' for empty input and null when the text is not a valid non-negative expression.
   A small recursive-descent parser, so no text is ever evaluated as code. */
export function evalArea(str: unknown): number | '' | null {
  const t = String(str ?? '').trim().replace(/[×xX]/g, '*').replace(/,/g, '.');
  if (t === '') return '';
  if (!/^[\d.+\-*/()\s]+$/.test(t)) return null;
  const toks = t.match(/\d*\.?\d+|[+\-*/()]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const expr = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const op = toks[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const term = (): number => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = toks[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const factor = (): number => {
    const k = toks[i++];
    if (k === '-') return -factor();
    if (k === '(') { const v = expr(); if (toks[i++] !== ')') throw new Error('paren'); return v; }
    const v = parseFloat(k ?? ''); if (!isFinite(v)) throw new Error('num'); return v;
  };
  try {
    const v = expr();
    if (i !== toks.length) return null;
    return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  } catch { return null; }
}
