import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Mark, Num } from '../engine/types';
import { evalArea } from '../engine/util';
import { MK } from '../engine/checks';

/* ---------- toast ---------- */
const ToastCtx = createContext<(m: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState(''), [show, setShow] = useState(false), t = useRef<number>();
  const toast = (m: string) => { setMsg(m); setShow(true); clearTimeout(t.current); t.current = window.setTimeout(() => setShow(false), 2400); };
  return <ToastCtx.Provider value={toast}>{children}<div className={'toast' + (show ? ' show' : '')} role="status">{msg}</div></ToastCtx.Provider>;
}

/* ---------- marks ---------- */
const MARK_TEXT = { ok: 'Complies', warn: 'Check', bad: 'Fails' } as const;
/* whether compliance checks and design basis are shown */
const ComplianceCtx = createContext(false);
export const ComplianceProvider = ComplianceCtx.Provider;
export const useCompliance = () => useContext(ComplianceCtx);
export function Badge({ m }: { m: Mark | undefined }) {
  if (!m) return null;
  return <span className={'cmark ' + m[0]} title={m[1]} aria-label={m[1]}>{MK[m[0]]} {m[2] || MARK_TEXT[m[0]]}</span>;
}
export function Pill({ s, children }: { s: string; children: ReactNode }) { return <span className={'pill ' + s}>{children}</span>; }

/* ---------- inputs ---------- */
const toNum = (v: string): Num => v === '' ? '' : (isFinite(parseFloat(v)) ? parseFloat(v) : '');

export function NumInput({ value, onChange, step, min, disabled, title, id, label, readOnly }: {
  value: Num | number; onChange?: (v: Num) => void; step?: number; min?: number; disabled?: boolean; title?: string; id?: string; label?: string; readOnly?: boolean;
}) {
  /* keep the typed text while focused so intermediate states like "0." are not rewritten */
  const [text, setText] = useState(String(value ?? '')), focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value ?? '')); }, [value]);
  return <input id={id} type="number" inputMode="decimal" step={step} min={min} disabled={disabled} readOnly={readOnly} title={title} aria-label={label}
    value={focused.current ? text : String(value ?? '')}
    onFocus={() => { focused.current = true; setText(String(value ?? '')); }}
    onBlur={() => { focused.current = false; setText(String(value ?? '')); }}
    onChange={e => { setText(e.target.value); onChange?.(toNum(e.target.value)); }} />;
}

/* area field accepting sums like 6*3.2 + 2.5*3.2 */
export function ExprInput({ value, onChange, label, title }: { value: Num; onChange: (v: Num) => void; label: string; title?: string }) {
  const [text, setText] = useState(String(value ?? '')), [bad, setBad] = useState(false), focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value ?? '')); }, [value]);
  return <input type="text" inputMode="decimal" className={'expr' + (bad ? ' bad-in' : '')} aria-label={label} title={title || 'Enter a number or a sum, e.g. 6*3.2 + 2.5*3.2'} value={text}
    onFocus={() => { focused.current = true; }}
    onBlur={() => { focused.current = false; const v = evalArea(text); if (v === null) { setBad(true); setTimeout(() => setBad(false), 1200); } setText(String(value ?? '')); }}
    onChange={e => { setText(e.target.value); const v = evalArea(e.target.value); if (v !== null) onChange(v); }} />;
}

export function Field({ id, label, unit, mark, value, onChange, step = 0.1, disabled, title, wide, after }: {
  id: string; label: string; unit?: string; mark?: Mark; value: Num | number; onChange?: (v: Num) => void; step?: number; disabled?: boolean; title?: string; wide?: boolean; after?: ReactNode;
}) {
  return <div className={'fld' + (wide ? ' wide' : '')}>
    <div className="flrow"><label className="fl" htmlFor={id}>{label}</label><Badge m={mark} /></div>
    {after ? <span className="calc-in"><span className="in-u"><NumInput id={id} value={value} onChange={onChange} step={step} disabled={disabled} title={title} />{unit ? <span className="u">{unit}</span> : null}</span>{after}</span>
      : <span className="in-u"><NumInput id={id} value={value} onChange={onChange} step={step} disabled={disabled} title={title} />{unit ? <span className="u">{unit}</span> : null}</span>}
  </div>;
}

export interface Opt { id: string; label: string; v?: number; cat?: string }
export function Options({ opts, showV }: { opts: Opt[]; showV?: boolean }) {
  const groups: { cat?: string; items: Opt[] }[] = [];
  opts.forEach(o => { const g = groups[groups.length - 1]; if (g && g.cat === o.cat) g.items.push(o); else groups.push({ cat: o.cat, items: [o] }); });
  const item = (o: Opt) => <option key={o.id} value={o.id}>{o.label}{showV && o.v != null ? `: ${o.v}` : ''}</option>;
  return <>{groups.map((g, i) => g.cat ? <optgroup key={i} label={g.cat}>{g.items.map(item)}</optgroup> : g.items.map(item))}<option value="custom">Custom value</option></>;
}

/* a value with a source list: picking a source fills the value; typing a value switches to Custom */
export function PickField({ id, label, unit, step, opts, src, value, onSrc, onValue, mark, showV }: {
  id: string; label: string; unit?: string; step: number; opts: Opt[]; src: string; value: Num; onSrc: (s: string) => void; onValue: (v: Num) => void; mark?: Mark; showV?: boolean;
}) {
  return <div className={'fld pick' + (src === 'custom' ? ' is-custom' : '')}>
    <div className="flrow"><label className="fl" htmlFor={id}>{label}</label><Badge m={mark} /></div>
    <span className="in-u src-sel"><select aria-label={label + ': source'} value={src} onChange={e => onSrc(e.target.value)}><Options opts={opts} showV={showV} /></select></span>
    <span className="in-u"><NumInput id={id} value={value} onChange={onValue} step={step} min={0} />{unit ? <span className="u">{unit}</span> : null}</span>
  </div>;
}

export function SelectField({ id, label, value, onChange, children, wide }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode; wide?: boolean }) {
  return <label className={'fld' + (wide ? ' wide' : '')} htmlFor={id}><span className="fl">{label}</span>
    <span className="in-u src-sel"><select id={id} value={value} onChange={e => onChange(e.target.value)}>{children}</select></span></label>;
}

export function SecHead({ n, title, sub }: { n?: number; title: string; sub?: ReactNode }) {
  return <div className="sec-head"><h2>{n != null && <span className="n">{n}</span>}{title}</h2>{sub ? <p>{sub}</p> : null}</div>;
}

/* a button that asks for a second click before acting */
export function ArmButton({ className, label, armedLabel, onConfirm }: { className?: string; label: string; armedLabel: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false), t = useRef<number>();
  useEffect(() => () => clearTimeout(t.current), []);
  return <button type="button" className={className} data-armed={armed ? '1' : '0'} onClick={() => {
    if (armed) { clearTimeout(t.current); setArmed(false); onConfirm(); return; }
    setArmed(true); t.current = window.setTimeout(() => setArmed(false), 4000);
  }}>{armed ? armedLabel : label}</button>;
}

export function CheckTable({ rows }: { rows: [string, string, string, ['ok' | 'bad' | 'warn', string]][] }) {
  return <table className="tl cmp"><colgroup><col style={{ width: '22%' }} /><col style={{ width: '36%' }} /><col style={{ width: '20%' }} /><col style={{ width: '22%' }} /></colgroup>
    <thead><tr><th>Standard / clause</th><th>Requirement</th><th className="n">Design value</th><th>Status</th></tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td className="n">{r[2]}</td><td><Pill s={r[3][0]}>{MK[r[3][0]]} {r[3][1]}</Pill></td></tr>)}</tbody></table>;
}
export function CountPill({ nb, nw }: { nb: number; nw: number }) {
  return <Pill s={nb ? 'bad' : nw ? 'warn' : 'ok'}>{nb ? MK.bad : nw ? MK.warn : MK.ok} {nb + nw} non-compliant</Pill>;
}
