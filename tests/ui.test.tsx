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
  it('renders the example project', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect($$('.ritem').map(e => e.querySelector('.nm')!.textContent)).toEqual(['Open office', 'Meeting room', 'Manager office ×2', 'Reception', 'Corridor']);
    await act(async () => $('.workflow-step[data-step="5"]').click());
    expect(plantTR()).toMatch(/^\d+\.\dTR$/);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });

  it('navigates through the calculator steps and counts valid defaults as complete', async () => {
    expect($$('.workflow-step')).toHaveLength(6);
    expect($('.workflow-step[data-step="0"]').getAttribute('aria-current')).toBe('step');
    expect($$('.workflow-step .workflow-status').map(e => e.textContent)).toEqual(['Complete', 'Complete', 'Complete', 'Complete', 'Complete', 'Complete']);
    expect($('#p-name')).not.toBeNull();
    expect($('#p-toDB')).toBeNull();
    await act(async () => byText('button', 'Continue').click());
    expect($('#p-toDB')).not.toBeNull();
    await act(async () => byText('button', 'Continue').click());
    expect($('.psy-wrap')).not.toBeNull();

    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect($('#p-codeset')).not.toBeNull();
    expect($('.psy-wrap')).toBeNull();
    await act(async () => byText('button', 'Continue').click());
    expect($('#r-area')).not.toBeNull();
    await act(async () => byText('button', 'Continue').click());
    expect($('.tot.key')).not.toBeNull();
    await act(async () => byText('button', 'Previous').click());
    expect($('#r-area')).not.toBeNull();
  });

  it('removes completion when a required design value is cleared without locking navigation', async () => {
    await act(async () => $('.workflow-step[data-step="1"]').click());
    await act(async () => setValue($('#p-toDB'), ''));
    expect($('.workflow-step[data-step="1"] .workflow-status').textContent).toBe('In progress');
    expect($('.workflow-step[data-step="1"]').classList.contains('is-complete')).toBe(false);
    expect($('.workflow-step[data-step="5"] .workflow-status').textContent).toBe('Needs input');
    await act(async () => byText('button', 'Continue').click());
    expect($('.workflow-step[data-step="1"] .workflow-status').textContent).toBe('Needs input');
    expect($('.psy-wrap')).not.toBeNull();
  });

  it('requires a project name before leaving project details', async () => {
    await act(async () => setValue($('#p-name'), ''));
    expect($('.workflow-step[data-step="0"] .workflow-status').textContent).toBe('In progress');
    await act(async () => byText('button', 'Continue').click());
    expect($('#p-name')).not.toBeNull();
    expect($('#p-name-err')!.textContent).toContain('Enter a project name');
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect($('#r-area')).toBeNull();
    await act(async () => setValue($('#p-name'), 'Villa A'));
    await act(async () => setValue($('#p-client'), 'Acme Holdings'));
    await act(async () => setValue($('#p-consultant'), 'Design Co'));
    await act(async () => setValue($('#p-contractor'), 'Build Co'));
    await act(async () => byText('button', 'Continue').click());
    expect($('#p-toDB')).not.toBeNull();
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).toContain('ClientAcme Holdings');
    expect($('.rpt').textContent).toContain('ConsultantDesign Co');
    expect($('.rpt').textContent).toContain('ContractorBuild Co');
  });

  it('shows abbreviations in a dropdown in the top bar', async () => {
    const dropdown = $<HTMLDetailsElement>('details.abbr-menu');
    expect(dropdown).not.toBeNull();
    expect(dropdown.open).toBe(false);
    await act(async () => dropdown.querySelector('summary')!.click());
    expect(dropdown.open).toBe(true);
    expect(dropdown.textContent).toContain('ASHRAE');
    expect(dropdown.textContent).toContain('American Society of Heating, Refrigerating and Air-Conditioning Engineers');
  });

  it('filters the ASHRAE assembly reference without changing project U-values', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    const projectUWall = $<HTMLInputElement>('#p-uWall').value;
    await act(async () => setValue($('#assembly-zone'), '3'));
    await act(async () => setValue($('#assembly-surface'), 'Above-grade wall'));

    expect($$('.assembly-library tbody tr')).toHaveLength(4);
    expect(host.textContent).toContain('Above-grade wall · Mass0.857R-1.0 ciNot specified');
    expect($<HTMLInputElement>('#p-uWall').value).toBe(projectUWall);
    expect(host.textContent).toContain('Historical US reference only—not a UAE code limit.');
    expect(host.textContent).toContain('the source does not provide material conductivity or insulation thickness.');

    await act(async () => setValue($('#assembly-use'), 'residential'));
    expect(host.textContent).toContain('Above-grade wall · Mass0.701R-1.3 ciNot specified');
    expect($<HTMLInputElement>('#p-uWall').value).toBe(projectUWall);
  });

  it('shows Dubai Municipality element limits and searches its certified material directory', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    const library = $<HTMLDetailsElement>('.dm-material-library');
    expect(library).not.toBeNull();
    await act(async () => library.querySelector('summary')!.click());

    expect(library.textContent).toContain('External wall and exposed floor0.57 W/m²K0.42 W/m²K');
    expect(library.textContent).toContain('Product U-value and conductivity are not published');
    expect(library.textContent).toContain('Showing 127 of 127 directory entries.');
    expect(library.textContent).toContain('National Polystyrene Packaging Factory');
    expect(library.textContent).toContain('CL05020001');
    expect(library.textContent).toContain('Not provided');

    await act(async () => setValue($('#dm-material-search'), 'CL05020001'));
    expect($$('.dm-material-directory tbody tr')).toHaveLength(1);
    expect(library.textContent).toContain('Showing 1 of 127 directory entries.');
    expect(library.querySelector('a[href^="https://www.dm.gov.ae"]')).not.toBeNull();
  });

  it('shows an in-range badge for plausible daily range and elevation values', async () => {
    await act(async () => $('.workflow-step[data-step="1"]').click());
    expect($('#p-dr').closest('.fld')!.querySelector('.cmark')!.textContent).toContain('In range');
    expect($('#p-elev').closest('.fld')!.querySelector('.cmark')!.textContent).toContain('In range');
    await act(async () => setValue($('#p-dr'), '2'));
    expect($('#p-dr').closest('.fld')!.querySelector('.cmark')!.textContent).toContain('Fails');
    await act(async () => setValue($('#p-elev'), '2100'));
    expect($('#p-elev').closest('.fld')!.querySelector('.cmark')!.textContent).toContain('Fails');
  });

  it('recalculates when a room changes, and undo restores it', async () => {
    await act(async () => $('.workflow-step[data-step="5"]').click());
    const before = plantTR();
    await act(async () => $('.workflow-step[data-step="4"]').click());
    await act(async () => setValue($('#r-area'), '240'));
    await act(async () => $('.workflow-step[data-step="5"]').click());
    expect(plantTR()).not.toBe(before);
    await act(async () => byText('button', '↶ Undo').click());
    expect(plantTR()).toBe(before);
  });

  it('applies the emirate code set', async () => {
    await act(async () => $('.workflow-step[data-step="1"]').click());
    await act(async () => setValue($('#p-location'), 'abudhabi'));
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect($<HTMLSelectElement>('#p-codeset').value).toBe('estidama');
    expect(host.textContent).toContain('Estidama and Barjeel publish no skylight SHGC');
  });

  it('adds a wall partition and uses its gain', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
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
    expect(rpt.textContent).not.toContain('Abbreviations and symbols');
    expect(rpt.textContent).not.toMatch(/NaN|undefined/);
    await act(async () => byText('button', 'Back to calculator').click());
    expect($('#calc')).not.toBeNull();
  });

  it('shows compliance badges at inputs but hides checks and design basis', async () => {
    await act(async () => $('.workflow-step[data-step="1"]').click());
    expect(host.textContent).not.toMatch(/Compliance checks|Design basis/);
    expect($$('.cmark').length).toBeGreaterThan(0);
    expect(host.textContent).not.toContain('Show compliance');
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).not.toMatch(/Compliance checks|design basis checks|Check/);
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
