// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../src/App';
import { ToastProvider } from '../src/components/ui';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
/* Node 26 defines its own localStorage global, which hides jsdom's */
Object.defineProperty(globalThis, 'localStorage', { value: (globalThis as any).jsdom.window.localStorage, configurable: true });
window.scrollTo = () => {};
let root: Root, host: HTMLDivElement;
const $ = <T extends Element = HTMLElement>(s: string) => host.querySelector(s) as T;
const $$ = (s: string) => [...host.querySelectorAll(s)] as HTMLElement[];
const byText = (sel: string, t: string) => $$(sel).find(e => e.textContent?.trim() === t)!;
const setValue = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};
const plantTR = () => $('.tot.key .v').textContent!;

beforeEach(async () => {
  localStorage.clear(); location.hash = '';
  host = document.createElement('div'); document.body.appendChild(host);
  await act(async () => { root = createRoot(host); root.render(<ToastProvider><App /></ToastProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe('app', () => {
  it('renders the example project', () => {
    expect($$('.ritem').map(e => e.querySelector('.nm')!.textContent)).toEqual(['Open office', 'Meeting room', 'Manager office ×2', 'Reception', 'Corridor']);
    expect(plantTR()).toMatch(/^\d+\.\dTR$/);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });

  it('recalculates when a room changes, and undo restores it', async () => {
    const before = plantTR();
    await act(async () => setValue($('#r-area'), '240'));
    expect(plantTR()).not.toBe(before);
    await act(async () => byText('button', '↶ Undo').click());
    expect(plantTR()).toBe(before);
  });

  it('applies the emirate code set', async () => {
    await act(async () => setValue($('#p-location'), 'abudhabi'));
    expect($<HTMLSelectElement>('#p-codeset').value).toBe('estidama');
    expect(host.textContent).toContain('Estidama and Barjeel publish no skylight SHGC');
  });

  it('adds a wall partition and uses its gain', async () => {
    await act(async () => byText('button', '+ Add wall partition').click());
    const area = $$('input.expr').find(i => i.getAttribute('aria-label') === 'Area') as HTMLInputElement;
    await act(async () => setValue(area, '4*3'));
    expect($$('.bar-row').find(r => r.textContent!.startsWith('Wall partitions'))!.querySelector('.v')!.textContent).not.toBe('0.00 kW');
  });

  it('renders the report', async () => {
    await act(async () => byText('button', 'Generate report').click());
    const rpt = $('.rpt');
    expect(rpt.textContent).toContain('Heat Load Calculation Report');
    expect(rpt.textContent).toContain('4.5 Corridor');
    expect(rpt.textContent).not.toMatch(/NaN|undefined/);
    await act(async () => byText('button', 'Back to calculator').click());
    expect($('#calc')).not.toBeNull();
  });

  it('hides compliance and design basis until switched on', async () => {
    expect(host.textContent).not.toMatch(/Compliance checks|Design basis|Complies|Fails/);
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).not.toMatch(/Compliance checks|design basis checks|Check/);
    await act(async () => byText('button', 'Back to calculator').click());
    await act(async () => byText('button', 'Show compliance').click());
    expect(host.textContent).toContain('Outdoor design basis checks');
    expect(host.textContent).toMatch(/Compliance checks: \d+ complying/);
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).toContain('6. Compliance checks');
  });

  it('saves and reopens a project in the browser', async () => {
    await act(async () => setValue($('#p-name'), 'Villa A'));
    await act(async () => byText('button', 'Projects ▾').click());
    await act(async () => byText('button', 'Save in browser').click());
    expect(JSON.parse(localStorage.getItem('novac-heatload-projects')!)[0].name).toBe('Villa A');
  });

  it('saves back to the same file, and Save as picks a new one', async () => {
    const written: Record<string, string> = {}, picked: string[] = [];
    const handle = (name: string) => ({ name, getFile: async () => new File([written[name] ?? ''], name),
      createWritable: async () => ({ write: async (d: string) => { written[name] = d; }, close: async () => {} }) });
    const names = ['a.novac.json', 'b.novac.json'];
    (window as any).showSaveFilePicker = async () => { const n = names[picked.length]; picked.push(n); return handle(n); };
    try {
      const save = async (as = false) => {
        await act(async () => byText('button', 'Projects ▾').click());
        await act(async () => byText('button', as ? 'Save as…' : 'Save').click());
      };
      await act(async () => setValue($('#p-name'), 'Villa A'));
      await save(); await save();
      expect(picked).toEqual(['a.novac.json']);
      expect(JSON.parse(written['a.novac.json']).project.name).toBe('Villa A');
      await act(async () => setValue($('#p-name'), 'Villa B'));
      await save(true);
      expect(picked).toEqual(['a.novac.json', 'b.novac.json']);
      expect(JSON.parse(written['b.novac.json']).project.name).toBe('Villa B');
      expect(JSON.parse(written['a.novac.json']).project.name).toBe('Villa A');
    } finally { delete (window as any).showSaveFilePicker; }
  });
});
