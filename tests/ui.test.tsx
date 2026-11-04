// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../src/App';
import { ToastProvider } from '../src/components/ui';
import { num } from '../src/engine/util';
import { NET } from '../src/engine/weather/providers';
import { PRO } from '../src/pro';
import { exampleState } from '../src/engine/project';
import { listSaved } from '../src/state/store';
import { projectFromFile } from '../src/projectFile';
import { fakeOpenMeteo } from './weatherFixture';
/* the PDF writer needs a real canvas; the tests only need the PDF it hands back */
vi.mock('html2pdf.js', () => {
  const w: any = { set: () => w, from: () => w, save: async () => {}, outputPdf: async () => new Blob(['%PDF'], { type: 'application/pdf' }) };
  return { default: () => w };
});

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
  localStorage.clear(); location.hash = ''; PRO.unlocked = true; PRO.ducts = true;
  host = document.createElement('div'); document.body.appendChild(host);
  await act(async () => { root = createRoot(host); root.render(<ToastProvider><App /></ToastProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe('app', () => {
  it('shows visitors the site as before: drafts look coming soon and the new in-step options are not shown', async () => {
    PRO.unlocked = false; PRO.ducts = false;
    await act(async () => root.render(<ToastProvider><App key="locked" /></ToastProvider>));
    /* only the five core steps open; every Pro tool and add-on shows as coming soon, as before these updates */
    expect($$('.workflow-step')).toHaveLength(5);
    const pro = $$('.workflow-pro .workflow-soon');
    expect(pro).toHaveLength(16);
    expect(pro.every(e => e.querySelector('.workflow-status')!.textContent === 'Coming soon')).toBe(true);
    expect(pro.every(e => (e as HTMLButtonElement).disabled)).toBe(true);
    expect($('.admin-preview')).toBeNull();
    /* the Pro row in its earlier order */
    expect(pro.slice(0, 4).map(e => e.querySelector('.workflow-title')!.textContent)).toEqual(['Hourly analysis', 'Indoor air quality', 'Energy audit', 'Energy modelling']);
    /* the fresh air switches and packaged unit fresh air are drafts: not in Spaces or the summary */
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect($('#r-faLoad')).toBeNull();
    await act(async () => $<HTMLButtonElement>('.rtotal').click());
    expect($('#pb-faOff')).toBeNull();
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect($('#p-faOff')).toBeNull();
    await act(async () => setValue($('#summary-el-sys'), 'ducted'));
    expect($('#summary-el-pkg')).toBeNull();
    expect($('#summary-el-fahu')).toBeTruthy();
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect($('.tot.key')).not.toBeNull();
    expect(byText('button', 'Continue')).toBeUndefined();
    expect($('.room-load-table')).not.toBeNull();
  });

  it('renders the example project', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect($$('.ritem').map(e => e.querySelector('.nm')!.textContent)).toEqual(['Open plan office', 'Boardroom', 'Manager office ×2', 'Reception and waiting', 'Corridor']);
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(plantTR()).toMatch(/^\d+\.\dTR$/);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });

  it('navigates through the calculator steps and ticks a step once it has been filled in', async () => {
    expect($$('.workflow-step')).toHaveLength(9);
    expect($('.workflow-step[data-step="0"]').getAttribute('aria-current')).toBe('step');
    expect($$('.workflow-step.is-complete')).toHaveLength(0);
    expect($$('.workflow-step .workflow-status').map(e => e.textContent)).toEqual(['In progress', 'Not started', 'Not started', 'Not started', 'Not started', 'Not started', 'Not started', 'Available']);
    /* the heat load summary is the final, results step: no progress status and no tick */
    expect($('.workflow-step[data-step="4"] .workflow-status')).toBeNull();
    expect($('#p-name')).not.toBeNull();
    expect($('#p-toDB')).toBeNull();
    await act(async () => setValue($('#p-client'), 'Acme Holdings'));
    expect($('.workflow-step[data-step="0"] .workflow-status').textContent).toBe('Complete');
    await act(async () => byText('button', 'Continue').click());
    expect($('#p-toDB')).not.toBeNull();
    expect($('.psy-wrap')).not.toBeNull();
    expect($('.workflow-step[data-step="1"] .workflow-title').textContent).toBe('Design conditions');
    expect($('.psy-wrap').closest('section')!.querySelector('.sec-head .n')).toBeNull();
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect($('.workflow-step[data-step="1"] .workflow-status').textContent).toBe('Not started');
    await act(async () => $('.workflow-step[data-step="1"]').click());
    await act(async () => byText('button', 'Continue').click());
    expect($('.workflow-step[data-step="1"] .workflow-status').textContent).toBe('Complete');
    expect($('.psy-wrap')).toBeNull();
    expect($('#p-codeset')).not.toBeNull();

    await act(async () => $('.workflow-step[data-step="2"]').click());
    expect($('#p-codeset')).not.toBeNull();
    expect($('.psy-wrap')).toBeNull();
    await act(async () => byText('button', 'Continue').click());
    expect($('#r-area')).not.toBeNull();
    await act(async () => byText('button', 'Continue').click());
    expect($('.tot.key')).not.toBeNull();
    expect($('.room-load-table')).not.toBeNull();
    expect($$('.room-load-table tbody tr')).toHaveLength(5);
    expect([...$('.sec-head').parentElement!.querySelectorAll('.room-load-table, .totals')][0].classList.contains('room-load-table')).toBe(true);
    await act(async () => byText('button', 'Continue').click());
    expect($('.workflow-step[aria-current="step"] .workflow-title').textContent).toBe('Hourly analysis');
    await act(async () => byText('button', 'Previous').click());
    expect($('.tot.key')).not.toBeNull();
    expect($('.room-load-table')).not.toBeNull();
  });

  it('removes completion when a required design value is cleared without locking navigation', async () => {
    await act(async () => $('.workflow-step[data-step="1"]').click());
    await act(async () => setValue($('#p-toDB'), ''));
    expect($('.workflow-step[data-step="1"] .workflow-status').textContent).toBe('In progress');
    expect($('.workflow-step[data-step="1"]').classList.contains('is-complete')).toBe(false);
    await act(async () => byText('button', 'Continue').click());
    expect($('.workflow-step[data-step="1"] .workflow-status').textContent).toBe('Needs input');
    expect($('#p-codeset')).not.toBeNull();
    expect($('.psy-wrap')).toBeNull();
  });

  it('requires a project name before leaving project details', async () => {
    await act(async () => setValue($('#p-name'), ''));
    expect($('.workflow-step[data-step="0"] .workflow-status').textContent).toBe('In progress');
    await act(async () => byText('button', 'Continue').click());
    expect($('#p-name')).not.toBeNull();
    expect($('#p-name-err')!.textContent).toContain('Enter a project name');
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect($('#r-area')).toBeNull();
    await act(async () => setValue($('#p-name'), 'Villa A'));
    await act(async () => setValue($('#p-client'), 'Acme Holdings'));
    await act(async () => setValue($('#p-consultant'), 'Design Co'));
    await act(async () => setValue($('#p-contractor'), 'Build Co'));
    await act(async () => byText('button', 'Continue').click());
    expect($('#p-toDB')).not.toBeNull();
    await act(async () => $('.workflow-step[data-step="4"]').click());
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).toContain('ClientAcme Holdings');
    expect($('.rpt').textContent).toContain('ConsultantDesign Co');
    expect($('.rpt').textContent).toContain('ContractorBuild Co');
  });

  it('filters the ASHRAE assembly reference without changing project U-values', async () => {
    await act(async () => $('.workflow-step[data-step="2"]').click());
    /* the ASHRAE 90.1 values are a tab of the external wall / roof U-value builder */
    await act(async () => (Array.from($$('details.uvb')[0].querySelectorAll('.uvb-tabs button')).find(b => b.textContent === 'ASHRAE 90.1 by zone') as HTMLButtonElement).click());
    const projectUWall = $<HTMLInputElement>('#p-uWall').value;
    await act(async () => setValue($('#asm-wall-zone'), '3'));
    await act(async () => setValue($('#asm-wall-surface'), 'Above-grade wall'));

    expect($$('.assembly-library tbody tr')).toHaveLength(4);
    expect(host.textContent).toContain('Above-grade wall · MassR-1.3 ci45 mm ci0.698 W/m²K');
    expect(host.textContent).not.toContain('Not specified');
    expect($<HTMLInputElement>('#p-uWall').value).toBe(projectUWall);
    expect(host.textContent).toContain('converted from the I-P edition');

    await act(async () => setValue($('#asm-wall-use'), 'residential'));
    expect(host.textContent).toContain('Above-grade wall · MassR-1.7 ci60 mm ci0.591 W/m²K');
    expect($<HTMLInputElement>('#p-uWall').value).toBe(projectUWall);
  });

  it('adds ASHRAE assemblies as a wall type and applies roof and floor values', async () => {
    await act(async () => $('.workflow-step[data-step="2"]').click());
    const ashraeTab = async (i: number) => act(async () => (Array.from($$('details.uvb')[i].querySelectorAll('.uvb-tabs button')).find(b => b.textContent === 'ASHRAE 90.1 by zone') as HTMLButtonElement).click());
    await ashraeTab(0);
    expect($<HTMLSelectElement>('#asm-wall-zone').value).toBe('0');
    await act(async () => $('button[aria-label="Add as wall type: Above-grade wall Steel-framed"]').click());
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 name"]').value).toBe('ASHRAE 90.1-2022 CZ0 steel-framed (nonresidential), 80 mm Extruded polystyrene');
    /* thickness follows the chosen insulation: R-2.3 with EPS (λ 0.038) needs 90 mm */
    await act(async () => setValue($('#asm-wall-ins'), 'eps'));
    expect(host.textContent).toContain('Above-grade wall · Steel-framedR-2.390 mm0.704 W/m²K');
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 U-value"]').value).toBe('0.704');
    await act(async () => $('button[aria-label="Use as roof U: Roof Attic and other"]').click());
    expect($<HTMLInputElement>('#p-uRoof').value).toBe('0.153');
    /* floors are in the partition builder's ASHRAE tab */
    await ashraeTab(1);
    await act(async () => $('button[aria-label="Use as floor U: Floor Mass"]').click());
    expect($<HTMLInputElement>('#p-uFloor').value).toBe('1.828');
    /* glazing rows set both U and SHGC; an opaque door is added as a wall type */
    await act(async () => $('button[aria-label="Use for glazing: Vertical fenestration Fixed"]').click());
    expect($<HTMLInputElement>('#p-uGlass').value).toBe('2.839');
    expect($<HTMLInputElement>('#p-shgc').value).toBe('0.22');
    await act(async () => $('button[aria-label="Add as wall type: Opaque door Swinging"]').click());
    expect($<HTMLInputElement>('input[aria-label="external wall type 2 U-value"]').value).toBe('2.101');
    expect(host.textContent).toContain('Slab-on-grade floor · HeatedR-1.3 for 300 mm');
  });

  it('has no Dubai Municipality material directory on the envelope step', async () => {
    await act(async () => $('.workflow-step[data-step="2"]').click());
    expect($('#p-codeset')).not.toBeNull();
    expect(host.textContent).not.toContain('Dubai Municipality materials');
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

  it('shows the total plant summary from the Total load row', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => $('.rtotal').click());
    expect($('.rtotal').getAttribute('aria-current')).toBe('true');
    expect($('.result').textContent).toContain('Total plant');
    /* the total shows the same detail as a room, without a duplicate hourly chart */
    ['Sensible heat ratio', 'Supply air (ΔT', 'People', 'Fresh air cooling load', 'Per 100 L/s', 'Glass, solar', 'Room total']
      .forEach(t => expect($('.result').textContent).toContain(t));
    expect($('.result').textContent).not.toContain('Building room load by hour');
    expect($('.result .hb-chart')).toBeNull();
    expect($('.plant-rooms')).toBeNull();
  });

  it('recalculates when a room changes, and undo restores it', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    const before = plantTR();
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => setValue($('#r-area'), '240'));
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(plantTR()).not.toBe(before);
    await act(async () => { dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })); });
    expect(plantTR()).toBe(before);
  });

  it('applies the emirate code set', async () => {
    await act(async () => $('.workflow-step[data-step="1"]').click());
    await act(async () => setValue($('#p-location'), 'abudhabi'));
    await act(async () => $('.workflow-step[data-step="2"]').click());
    /* outside Dubai no primary-source authority limits are catalogued, so the envelope becomes project inputs */
    expect($<HTMLSelectElement>('#p-codeset').value).toBe('custom');
    expect(host.textContent).toContain('No authority limits apply');
    expect(host.textContent).not.toMatch(/null|NaN|undefined/);
    /* a reference-only code can still be chosen to compare against */
    await act(async () => setValue($('#p-codeset'), 'estidama'));
    expect(host.textContent).toContain('Estidama publishes no skylight SHGC');
  });

  it('adds a wall partition and uses its gain', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => byText('button', '+ Add wall partition').click());
    const area = $$('input.expr').find(i => i.getAttribute('aria-label') === 'Area') as HTMLInputElement;
    await act(async () => setValue(area, '4*3'));
    expect($$('.bar-row').find(r => r.textContent!.startsWith('Wall partitions'))!.querySelector('.v')!.textContent).not.toBe('0.00 kW');
  });

  it('adds external wall and partition types and uses them in a space', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    const before = plantTR();
    await act(async () => $('.workflow-step[data-step="2"]').click());
    await act(async () => byText('button', '+ Add external wall type').click());
    await act(async () => setValue($('input[aria-label="external wall type 1 name"]'), 'Curtain wall spandrel'));
    await act(async () => setValue($('input[aria-label="external wall type 1 U-value"]'), '2.5'));
    expect($('input[aria-label="external wall type 1 U-value"]').closest('td')!.querySelector('.cmark')!.textContent).toContain('Fails');
    await act(async () => byText('button', '+ Add partition type').click());
    await act(async () => setValue($('input[aria-label="partition type 1 name"]'), 'Glass partition'));
    await act(async () => setValue($('input[aria-label="partition type 1 U-value"]'), '5.7'));

    await act(async () => $('.workflow-step[data-step="3"]').click());
    const walls = $$('select').filter(s => / wall type$/.test(s.getAttribute('aria-label') || ''));
    expect(walls).toHaveLength(8);
    /* the first facing with wall area in the example room */
    const wt = walls.find(s => num(s.closest('tr')!.querySelector('input')!.value) > 0) as HTMLSelectElement;
    await act(async () => setValue(wt, wt.querySelectorAll('option')[1].getAttribute('value')!));
    await act(async () => byText('button', '+ Add wall partition').click());
    const area = $$('input.expr').find(i => i.getAttribute('aria-label') === 'Area') as HTMLInputElement;
    await act(async () => setValue(area, '10'));
    const pt = $<HTMLSelectElement>('select[aria-label="Partition 1 type"]');
    await act(async () => setValue(pt, pt.querySelectorAll('option')[1].getAttribute('value')!));
    expect(pt.closest('tr')!.querySelector<HTMLInputElement>('input[aria-label="U-value"]')!.value).toBe('5.7');

    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(plantTR()).not.toBe(before);
    await act(async () => $('.workflow-step[data-step="4"]').click());
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).toContain('External wall type: Curtain wall spandrel');
    expect($('.rpt').textContent).toContain('Wall partition 1 (Glass partition)');
  });

  it('works out wall and glass areas in the pop-up calculator', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => $$('button').filter(b => b.textContent === 'L × H')[0].click());
    const dlg = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dlg.getAttribute('aria-label')).toBe('Area calculator · N wall');
    const field = (l: string) => dlg.querySelector(`input[aria-label="N ${l}"]`) as HTMLInputElement;
    await act(async () => setValue(field('Wall length'), '5'));
    await act(async () => setValue(field('Wall height'), '3'));
    await act(async () => setValue(field('Window width'), '2'));
    await act(async () => setValue(field('Window height'), '1.5'));
    expect(dlg.textContent).toContain('Wall 15.00 m² gross · glass 3.00 m²');
    await act(async () => (Array.from(dlg.querySelectorAll('button')).find(b => b.textContent === 'Apply to N') as HTMLElement).click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect($<HTMLInputElement>('input[aria-label="N wall gross area"]').value).toBe('15');
    expect($<HTMLInputElement>('input[aria-label="N glass area"]').value).toBe('3');
  });

  it('has an area calculator on floor area and partitions', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
    const fill = async (what: string, vals: Record<string, string>) => {
      for (const [k, v] of Object.entries(vals)) await act(async () => setValue(dialog().querySelector(`input[aria-label="${what} ${k}"]`) as HTMLInputElement, v));
      await act(async () => (Array.from(dialog().querySelectorAll('button')).find(b => b.textContent === 'Apply') as HTMLElement).click());
    };
    await act(async () => $('button[title="Floor area area calculator"]').click());
    await fill('Floor area', { Length: '12', Width: '10', 'Shafts / voids': '4' });
    expect(dialog()).toBeNull();
    expect($<HTMLInputElement>('#r-area').value).toBe('116');

    await act(async () => byText('button', '+ Add wall partition').click());
    await act(async () => $('button[title="Partition 1 area calculator"]').click());
    expect(dialog().textContent).toContain('Height');
    await fill('Partition 1', { Length: '4', Height: '3', 'Doors / openings': '2' });
    expect(($$('input.expr').find(i => i.getAttribute('aria-label') === 'Area' && i.closest('tr')!.querySelector('select[aria-label="Partition 1 type"]')) as HTMLInputElement).value).toBe('10');
  });

  it('converts feet to metres in the area calculators', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
    const btn = (t: string) => Array.from(dialog().querySelectorAll('button')).find(b => b.textContent === t) as HTMLElement;
    const inp = (l: string) => dialog().querySelector(`input[aria-label="${l}"]`) as HTMLInputElement;
    await act(async () => $('button[title="Floor area area calculator"]').click());
    await act(async () => btn('Feet (ft)').click());
    await act(async () => setValue(inp('Floor area Length'), '20'));
    await act(async () => setValue(inp('Floor area Width'), '10'));
    expect(dialog().textContent).toContain('= 18.58 m² (200.0 ft²)');
    await act(async () => btn('Metres (m)').click());
    expect(inp('Floor area Length').value).toBe('6.096');
    await act(async () => btn('Feet (ft)').click());
    await act(async () => btn('Apply').click());
    expect($<HTMLInputElement>('#r-area').value).toBe('18.58');

    /* the wall calculator opens in the unit chosen last */
    await act(async () => $$('button').filter(b => b.textContent === 'L × H')[0].click());
    expect(btn('Feet (ft)').getAttribute('aria-pressed')).toBe('true');
  });

  it('builds an assembly from UAE materials and saves it as a wall type', async () => {
    await act(async () => $('.workflow-step[data-step="2"]').click());
    /* one builder in the external wall section, one in the partition section */
    const [wallB, partB] = $$('details.uvb');
    expect(wallB.querySelector('summary')!.textContent).toBe('U-value builder · External wall / roof');
    expect(partB.querySelector('summary')!.textContent).toBe('U-value builder · Partition wall');
    const inWall = <T extends Element>(s: string) => wallB.querySelector(s) as unknown as T;
    await act(async () => setValue(inWall<HTMLSelectElement>('select[aria-label="Typical assembly"]'), 'w-aac'));
    expect(inWall('.uvb-u').textContent).toContain('0.68 W/m²K');
    await act(async () => (Array.from(wallB.querySelectorAll('button')).find(b => b.textContent === '+ Add layer') as HTMLButtonElement).click());
    await act(async () => setValue(inWall<HTMLSelectElement>('select[aria-label="Layer 4 material"]'), 'eps'));
    await act(async () => setValue(inWall<HTMLInputElement>('input[aria-label="Layer 4 thickness"]'), '25'));
    const u = inWall('.uvb-u').textContent!.match(/\d+\.\d+/)![0];
    await act(async () => (Array.from(wallB.querySelectorAll('button')).find(b => b.textContent === 'Save as external wall type') as HTMLButtonElement).click());
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 name"]').value).toBe('200 mm AAC block, plastered both sides');
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 U-value"]').value).toBe(u);
  });

  it('builds a partition from ASHRAE materials and rebuilds a saved type from its layers', async () => {
    await act(async () => $('.workflow-step[data-step="2"]').click());
    const partB = $$('details.uvb')[1];
    const inPart = <T extends Element>(s: string) => partB.querySelector(s) as unknown as T;
    /* the ASHRAE library filter lists only ASHRAE materials (plus the layer's current one) */
    await act(async () => (Array.from(partB.querySelectorAll('.uvb-libs button')).find(b => b.textContent === 'ASHRAE') as HTMLButtonElement).click());
    const groups = Array.from(inPart<HTMLSelectElement>('select[aria-label="Layer 2 material"]').querySelectorAll('optgroup')).map(g => g.label);
    expect(groups.some(g => g.startsWith('ASHRAE · '))).toBe(true);
    await act(async () => setValue(inPart<HTMLSelectElement>('select[aria-label="Layer 2 material"]'), 'a-cmu200'));
    expect(partB.textContent).toContain('ASHRAE');
    await act(async () => (Array.from(partB.querySelectorAll('button')).find(b => b.textContent === 'Save as partition wall type') as HTMLButtonElement).click());
    const pu = $<HTMLInputElement>('input[aria-label="partition type 1 U-value"]').value;
    expect(+pu).toBeGreaterThan(0);
    /* Layers opens the saved type's layers inline; a thicker layer lowers its U-value */
    await act(async () => byText('.type-act button', 'Layers').click());
    const inline = $('.uvb-inline');
    expect((inline.querySelector('select[aria-label="Layer 2 material"]') as HTMLSelectElement).value).toBe('a-cmu200');
    await act(async () => setValue(inline.querySelector('select[aria-label="Layer 2 material"]') as HTMLSelectElement, 'a-cmu200-lp'));
    await act(async () => (Array.from(inline.querySelectorAll('button')).find(b => b.textContent === 'Update this partition wall type') as HTMLButtonElement).click());
    expect($('.uvb-inline')).toBeNull();
    expect(+$<HTMLInputElement>('input[aria-label="partition type 1 U-value"]').value).toBeLessThan(+pu);
  });

  it('uses the heat balance method throughout the calculator', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect(host.textContent).toMatch(/Peak on [A-Z][a-z]{2} 21 at \d\d:00/);
    expect($('.hb-chart')).toBeNull();
    await act(async () => setValue($('#r-sched'), 'day'));
    expect($<HTMLSelectElement>('#r-sched').value).toBe('day');
    await act(async () => $('.workflow-step[data-step="4"]').click());
    const hb = plantTR();
    expect(host.textContent).toContain('Coincident block load');
    await act(async () => $('.workflow-step[data-step="2"]').click());
    expect(host.textContent).not.toContain('Orientation factors');
    expect($('#p-aWall')).not.toBeNull();
    expect($('#p-method')).toBeNull();
    expect(host.textContent).toContain('Heat balance method');
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect($('#r-sched')).not.toBeNull();
    expect($('.hb-chart')).toBeNull();
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(plantTR()).toBe(hb);
    expect($('.workflow-step[data-step="3"] .workflow-status').textContent).toBe('Complete');
    expect($('.workflow-step[data-step="4"]').classList.contains('is-complete')).toBe(false);
  });

  it('shows hourly loads by component for the building, a room and any month', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect($('.hr-req .pill.ok').textContent).toBe('Recommended');
    /* the FAHU selector here and the checkbox in the envelope step are the same setting */
    const fahu = $<HTMLSelectElement>('#summary-el-fahu');
    const was = fahu.value;
    await act(async () => setValue(fahu, was === 'fahu' ? 'room' : 'fahu'));
    expect($('.totals').textContent).toContain(was === 'fahu' ? 'in room units' : 'FAHU');
    await act(async () => $('.workflow-step[data-step="2"]').click());
    expect($<HTMLInputElement>('#p-fahu').checked).toBe(was !== 'fahu');
    await act(async () => $<HTMLInputElement>('#p-fahu').click());
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect($<HTMLSelectElement>('#summary-el-fahu').value).toBe(was);
    await act(async () => setValue($('#summary-el-sys'), 'split'));
    expect($<HTMLSelectElement>('#summary-el-eff').selectedOptions[0].textContent).toContain('ESMA 5 stars');
    /* ESMA T3 EER 10.31 at 46 °C is 10.31 × (1.25 / 0.859) = 15.00 at the 35 °C nominal condition */
    expect($$('.hr-kpis')[1].textContent).toContain('EER 10.31 at T3 46 °C → 15.00 at 35 °C');
    await act(async () => setValue($('#summary-el-eff'), 'custom'));
    await act(async () => setValue($('#summary-el-cop'), '3.5'));
    /* actual then nominal efficiency, cooling and power, directly below the TR totals */
    const kpis = $$('.totals + .kpi-basis + .hr-kpis, .hr-kpis + .hr-kpis');
    expect(kpis).toHaveLength(2);
    expect(kpis[0].textContent).toMatch(/Efficiency · actual.*Cooling load · actual.*Power required · actual/);
    expect(kpis[1].textContent).toMatch(/Efficiency · nominal.*Cooling capacity · nominal.*Power required · nominal/);
    expect(kpis[1].textContent).toContain('COP 3.50');
    expect(host.textContent).not.toContain('Peak power');
    /* clicking a load above switches the cards to that load: actual cooling equals the clicked card's kW */
    const picks = $$('button.tot.pick'), kw = (el: Element) => el.querySelector('.s')!.textContent!.match(/[\d,.]+ kW/)![0];
    expect(picks).toHaveLength(3);
    expect(picks[2].getAttribute('aria-pressed')).toBe('true');
    for (const [i, name] of [[0, 'room load'], [1, 'fresh air load'], [2, 'plant load']] as const) {
      await act(async () => $$('button.tot.pick')[i].click());
      expect($$('button.tot.pick')[i].getAttribute('aria-pressed')).toBe('true');
      expect($('.kpi-basis').textContent).toContain(name);
      const actual = $$('.hr-kpis')[0].querySelectorAll('.tot')[1].querySelector('.v')!.textContent!;
      expect(Number(actual.replace(/[^\d.]/g, '')).toFixed(1)).toBe(Number(kw($$('button.tot.pick')[i]).replace(/[^\d.]/g, '')).toFixed(1));
    }
    await act(async () => $('.workflow-step[data-step="5"]').click());
    expect($$('.hr-hours tbody tr')).toHaveLength(24);
    expect($$('.hr-hours tr.pk')).toHaveLength(1);
    expect($$('.hr-legend li')).toHaveLength(8);
    expect($<HTMLSelectElement>('#hr-month').selectedOptions[0].textContent).toContain('(peak month)');
    await act(async () => setValue($('#hr-scope'), $$('#hr-scope option')[2].getAttribute('value')!));
    await act(async () => setValue($('#hr-month'), '0'));
    expect($('.hr-card h3').textContent).toContain('Jan 21');
    await act(async () => byText('.hr-mon-l', 'Oct').closest('button')!.click());
    expect($<HTMLSelectElement>('#hr-month').value).toBe('9');
    expect(host.textContent).not.toMatch(/NaN|undefined/);
    await act(async () => $('.workflow-step[data-step="2"]').click());
    expect($('#p-method')).toBeNull();
  });

  it('ends the heat load summary with a conclusion and the report', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    const c = $('.conclusion');
    expect(c.textContent).toMatch(/Design cooling capacity: [\d.,]+ TR/);
    expect(c.textContent).toContain('ASHRAE heat balance method');
    expect(c.textContent).not.toMatch(/NaN|undefined/);
    await act(async () => $('.workflow-controls').querySelector<HTMLButtonElement>('.btn.primary')!.click());
    expect($('.rpt').textContent).toContain('Heat Load Calculation Report');
  });

  it('renders the report', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    await act(async () => byText('button', 'Generate report').click());
    const rpt = $('.rpt');
    expect(rpt.textContent).toContain('Heat Load Calculation Report');
    expect(rpt.textContent).toContain('4.5 Corridor');
    expect(rpt.textContent).toContain('Calculated using the ASHRAE heat balance method');
    expect(rpt.textContent).toContain('Heat balance method (hourly)');
    expect(rpt.textContent).toContain('Monthly design days');
    expect(rpt.textContent).toMatch(/Design hour \(room peak\)[A-Z][a-z]{2} 21, \d\d:00/);
    expect(rpt.textContent).not.toContain('Abbreviations and symbols');
    expect(rpt.textContent).not.toMatch(/NaN|undefined/);
    expect(byText('button', 'Email report (PDF)')).toBeDefined();
    await act(async () => byText('button', 'Back to application').click());
    expect($('#calc')).not.toBeNull();
  });

  it('asks for an email before emailing the report and saves it only when the newsletter box is ticked', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}'));
    const share = vi.fn(async () => {});
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      await act(async () => $('.workflow-step[data-step="4"]').click());
      await act(async () => byText('button', 'Generate report').click());
      const open = async () => act(async () => byText('button', 'Email report (PDF)').click());
      const dialog = () => document.querySelector<HTMLElement>('.email-ask');
      const submit = async () => act(async () => { dialog()!.querySelector<HTMLButtonElement>('button[type=submit]')!.click(); });
      const email = () => dialog()!.querySelector<HTMLInputElement>('#ea-email')!;
      /* an email is required */
      await open();
      await submit();
      expect(dialog()!.textContent).toContain('Enter a valid email address.');
      /* without the tick the report is emailed but the address is not stored */
      await act(async () => setValue(email(), 'eng@example.com'));
      await submit();
      expect(dialog()).toBeNull();
      await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(fetchMock).not.toHaveBeenCalled();
      /* with the tick the address is sent to the site's sign-up endpoint */
      await open();
      expect(dialog()!.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
      await act(async () => setValue(email(), 'eng@example.com'));
      await act(async () => dialog()!.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
      await submit();
      await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(2));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/subscribe');
      expect(JSON.parse(init.body as string)).toMatchObject({ email: 'eng@example.com', consent: true, source: 'email-report' });
    } finally {
      vi.unstubAllGlobals();
      delete (navigator as any).canShare; delete (navigator as any).share;
    }
  });

  it('shows compliance badges at inputs but hides checks and design basis', async () => {
    await act(async () => $('.workflow-step[data-step="1"]').click());
    expect(host.textContent).not.toMatch(/Compliance checks|Design basis/);
    expect($$('.cmark').length).toBeGreaterThan(0);
    expect(host.textContent).not.toContain('Show compliance');
    await act(async () => $('.workflow-step[data-step="4"]').click());
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).not.toMatch(/Compliance checks|design basis checks|Check/);
  });

  it('saves several projects in the browser with the date and time of saving', async () => {
    const saved = () => JSON.parse(localStorage.getItem('novac-heatload-projects')!) as { name: string }[];
    const menu = async () => { if (!$('#projects-menu')) await act(async () => byText('button', 'Open / Save ▾').click()); };
    await act(async () => setValue($('#p-name'), 'Villa A'));
    await menu(); await act(async () => byText('button', 'Save in browser').click());
    expect(saved().map(p => p.name)).toEqual(['Villa A']);
    /* saving again updates the same entry */
    await act(async () => setValue($('#p-name'), 'Villa A rev 1'));
    await menu(); await act(async () => byText('button', 'Save in browser (update)').click());
    expect(saved().map(p => p.name)).toEqual(['Villa A rev 1']);
    /* a copy adds a second entry */
    await menu(); await act(async () => byText('button', 'Save as new copy in browser').click());
    expect(saved()).toHaveLength(2);
    /* a new project does not overwrite the previous one */
    await act(async () => byText('button', 'New project').click());
    await act(async () => byText('button', 'Click again to clear all').click());
    await act(async () => setValue($('#p-name'), 'Office B'));
    await menu(); await act(async () => byText('button', 'Save in browser').click());
    expect(saved().map(p => p.name)).toEqual(['Office B', 'Villa A rev 1', 'Villa A rev 1']);
    await menu();
    const rows = $$('#projects-menu .saved-list .row');
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('.dt')!.textContent).toMatch(/^Saved \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} · 1 room · open now$/);
    expect(byText('#projects-menu h4', 'Saved in this browser (3)')).toBeTruthy();
  });

  it('saves back to the same file, and Save as picks a new one', async () => {
    const written: Record<string, string> = {}, picked: string[] = [];
    const handle = (name: string) => ({ name, getFile: async () => new File([written[name] ?? ''], name),
      createWritable: async () => ({ write: async (d: string) => { written[name] = d; }, close: async () => {} }) });
    const names = ['a.novac.html', 'b.novac.html'];
    (window as any).showSaveFilePicker = async () => { const n = names[picked.length]; picked.push(n); return handle(n); };
    try {
      const save = async (as = false) => {
        await act(async () => byText('button', 'Open / Save ▾').click());
        await act(async () => byText('button', as ? 'Save as…' : 'Save').click());
      };
      await act(async () => setValue($('#p-name'), 'Villa A'));
      await save(); await save();
      expect(picked).toEqual(['a.novac.html']);
      expect((projectFromFile(written['a.novac.html']) as any).project.name).toBe('Villa A');
      await act(async () => setValue($('#p-name'), 'Villa B'));
      await save(true);
      expect(picked).toEqual(['a.novac.html', 'b.novac.html']);
      expect((projectFromFile(written['b.novac.html']) as any).project.name).toBe('Villa B');
      expect((projectFromFile(written['a.novac.html']) as any).project.name).toBe('Villa A');
    } finally { delete (window as any).showSaveFilePicker; }
  });
});

describe('real weather year', () => {
  it('downloads a weather year and runs the hourly analysis on it', async () => {
    NET.spacing = 0; NET.backoff = 1;
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify(fakeOpenMeteo(2025)), { status: 200 }));
    vi.stubGlobal('fetch', f);
    try {
      await act(async () => $('.workflow-step[data-step="5"]').click());
      await act(async () => $$('.seg button')[1].click());
      for (let i = 0; i < 50 && !$('#wx-year'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect($('.wx-status').textContent).toContain('No weather year loaded yet');
      await act(async () => setValue($('#wx-year'), '2025'));
      await act(async () => $<HTMLButtonElement>('.wx-btns .btn.primary').click());
      for (let i = 0; i < 20 && !$('.wx-quality'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect(String(f.mock.calls[0][0])).toContain('archive-api.open-meteo.com');
      expect($('.wx-quality h3').textContent).toContain('8,760 hourly records');
      expect($('.tot.key').textContent).toMatch(/Peak plant load, real weather\d+\.\d\dTR/);
      expect($$('.hr-hours tbody tr')).toHaveLength(24);
      /* climate charts: heatmap first, then the other views */
      expect($('.cl-plot.heat svg')).toBeTruthy();
      for (const tab of ['Psychrometric chart', 'Sun path', 'Wind rose']) {
        await act(async () => byText('.cl-tabs button', tab).click());
        expect($('.cl-plot svg')).toBeTruthy();
      }
      expect(host.textContent).not.toMatch(/NaN|undefined/);
      /* the weather choice is saved with the project, and the design days are still there */
      await act(async () => { await new Promise(r => setTimeout(r, 350)); });
      expect(JSON.parse(localStorage.getItem('novac-heatload-v2') || '{}').project.weather).toMatchObject({ provider: 'open-meteo', year: 2025 });
      await act(async () => $$('.seg button')[0].click());
      expect($<HTMLSelectElement>('#hr-month')).toBeTruthy();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('indoor air quality', () => {
  it('calculates ventilation, writes it to the rooms and the loads follow', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    const before = num(plantTR());
    await act(async () => $('.workflow-step[data-step="7"]').click());
    for (let i = 0; i < 50 && !$('.iaq-zones'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect($$('.iaq-zones tbody tr')).toHaveLength(5);
    expect($('.iaq-kpis').textContent).toContain('System outdoor air intake, Vot');
    /* 30% above the minimum, applied to every room's fresh air */
    await act(async () => setValue($('#iaq-enh'), '30'));
    const apply = byText('.iaq-apply button', 'Apply required fresh air to the rooms') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    await act(async () => apply.click());
    expect(apply.disabled).toBe(true);
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(num(plantTR())).toBeGreaterThan(before);
    /* contaminants and filtration on the same rooms */
    await act(async () => $('.workflow-step[data-step="7"]').click());
    await act(async () => byText('.iaq-tabs button', 'Contaminants').click());
    expect($$('.iaq-cont tbody tr')).toHaveLength(9);
    expect($('.iaq-cont').textContent).toContain('Ventilation indicator');
    await act(async () => byText('.iaq-tabs button', 'Filtration').click());
    expect($$('.iaq-filt tbody tr')).toHaveLength(3);
    expect(host.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe('floors in spaces', () => {
  it('adds floors, puts rooms on them, repeats typical floors and deletes a floor', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    /* the example sits on its first floor */
    expect($$('.rfloor-h .nm').map(e => e.textContent)).toEqual(['First floor']);
    const total = () => num($('.rtotal .tr').textContent);
    const base = total();
    /* a second floor, with one room added to it */
    await act(async () => byText('.rlist .add', '+ Add floor').click());
    expect($$('.rfloor-h .nm').map(e => e.textContent)).toEqual(['First floor', 'Second floor']);
    await act(async () => byText('.rlist .add', '+ Add room to Second floor').click());
    expect($$('.rfloor')[1].querySelectorAll('.ritem')).toHaveLength(1);
    const withRoom = total();
    expect(withRoom).toBeGreaterThan(base);
    /* the first floor stands for three identical floors */
    await act(async () => $$('.rfloor-h')[0].click());
    await act(async () => setValue($('#f-n'), '3'));
    expect($$('.rfloor-h .nm')[0].textContent).toBe('First floor ×3');
    expect(total()).toBeCloseTo(base * 3 + (withRoom - base), 1);
    /* the room editor only offers existing floors */
    await act(async () => ($$('.rfloor')[1].querySelector('.ritem') as HTMLElement).click());
    expect([...$<HTMLSelectElement>('#r-level').options].map(option => option.textContent)).toEqual(['First floor (×3)', 'Second floor', '+ Add floor…']);
    expect($<HTMLSelectElement>('#r-level').selectedOptions[0].textContent).toBe('Second floor');
    /* delete the second floor and its room, then the first with its rooms */
    await act(async () => $$('.rfloor-h')[1].click());
    const del = () => byText('.floor-btns .btn.danger', 'Delete floor') ?? byText('.floor-btns .btn.danger', 'Click again to delete');
    await act(async () => del().click()); await act(async () => $('.floor-btns .btn.danger').click());
    expect($$('.rfloor-h .nm').map(e => e.textContent)).toEqual(['First floor ×3']);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });

  it('adds and assigns a floor from the room floor menu', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => $$('.ritem')[0].click());
    expect($('#r-qty')).toBeNull();
    expect(host.textContent).not.toContain('Identical rooms');
    const floorSelect = $<HTMLSelectElement>('#r-level');
    expect([...floorSelect.options].map(option => option.textContent)).toEqual(['First floor', '+ Add floor…']);
    await act(async () => setValue(floorSelect, '__add_floor__'));
    expect($$('.rfloor-h .nm').map(e => e.textContent)).toEqual(['First floor', 'Second floor']);
    expect($<HTMLSelectElement>('#r-level').selectedOptions[0].textContent).toBe('Second floor');
    expect($$('.rfloor')[1].querySelector('.ritem .nm')?.textContent).toBe('Open plan office');
  });
});

describe('cooling load picture', () => {
  it('draws the building and floor plans, live, and opens a room from the plan', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => $('.rtotal').click());
    expect($$('.bld-slab')).toHaveLength(1);
    expect($$('.plan-room')).toHaveLength(5);
    /* a new floor adds a slab; three identical floors add three */
    await act(async () => byText('.rlist .add', '+ Add floor').click());
    await act(async () => byText('.rlist .add', '+ Add room to Second floor').click());
    await act(async () => $$('.rfloor-h')[1].click());
    await act(async () => setValue($('#f-n'), '3'));
    expect($$('.plan-room')).toHaveLength(1);
    await act(async () => $('.rtotal').click());
    expect($$('.bld-slab')).toHaveLength(4);
    /* pick the first floor in the building, then open a room from its plan */
    await act(async () => $$('.bld-label')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect($('.plan-head').textContent).toContain('First floor');
    await act(async () => $$('.plan-room')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect($<HTMLInputElement>('#r-name').value).toBe('Open plan office');
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('dragging spaces between floors', () => {
  const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  const names = (i: number) => [...$$('.rfloor')[i].querySelectorAll('.ritem .nm')].map(e => e.textContent);
  it('moves a space to another floor, places it before a space, and takes it off its floor', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => byText('.rlist .add', '+ Add floor').click());
    const item = (name: string) => $$('.ritem').find(e => e.querySelector('.nm')!.textContent === name)!;
    const total = $('.rtotal .tr').textContent;
    /* Boardroom onto the Second floor */
    await act(async () => fire(item('Boardroom'), 'dragstart'));
    expect($('.drag-hint')).toBeTruthy();
    await act(async () => fire($$('.rfloor')[1], 'dragover'));
    expect($$('.rfloor')[1].classList.contains('drop-over')).toBe(true);
    await act(async () => fire($$('.rfloor')[1], 'drop'));
    expect(names(1)).toEqual(['Boardroom']);
    expect(names(0)).toEqual(['Open plan office', 'Manager office ×2', 'Reception and waiting', 'Corridor']);
    /* back onto the First floor, before the Open plan office */
    await act(async () => fire(item('Boardroom'), 'dragstart'));
    await act(async () => fire(item('Open plan office'), 'dragover'));
    expect(item('Open plan office').classList.contains('drop-before')).toBe(true);
    await act(async () => fire(item('Open plan office'), 'drop'));
    expect(names(0)).toEqual(['Boardroom', 'Open plan office', 'Manager office ×2', 'Reception and waiting', 'Corridor']);
    /* the Not on a floor zone appears while dragging */
    await act(async () => fire(item('Corridor'), 'dragstart'));
    const zone = $$('.rfloor').find(e => e.getAttribute('aria-label') === 'Not on a floor')!;
    await act(async () => fire(zone, 'dragover')); await act(async () => fire(zone, 'drop'));
    expect(names(2)).toEqual(['Corridor']);
    /* moving spaces between floors that are not repeated leaves the building total unchanged */
    expect($('.rtotal .tr').textContent).toBe(total);
  });
});

describe('library, forum, community chat and support', () => {
  it('opens from the header links, shows each category and returns to the calculator', async () => {
    const link = (t: string) => byText('.app-links button', t);
    await act(async () => link('Library').click());
    expect($('#workflow-stepper')).toBeNull();
    expect(link('Library').getAttribute('aria-pressed')).toBe('true');
    expect($$('.lib-cat h4').map(e => e.textContent)).toEqual(['Methods', 'Regulations', 'ASHRAE standards', 'General']);
    expect(host.textContent).toContain('ASHRAE heat balance method (Fundamentals Ch. 18)');
    await act(async () => byText('.lib-nav button', 'Authorities by emirate').click());
    expect(host.textContent).toContain('Dubai Municipality (DM)');
    await act(async () => byText('.lib-nav button', 'Abu Dhabi Cooling Load Manual (2026)').click());
    expect(host.textContent).toContain('46.1 °C / 29.4 °C');
    expect($$('.dg-kind.shall').length).toBeGreaterThan(5);
    expect($<HTMLAnchorElement>('.digest-meta a').href).toContain('doe.gov.ae');
    await act(async () => byText('.lib-nav button', 'Dubai Building Code, Part H.4 HVAC').click());
    expect(host.textContent).toContain('22.5–25.5 °C');
    expect(host.textContent).toContain('H.4.13');
    await act(async () => byText('.lib-nav button', 'ASHRAE 62.1-2022 Ventilation Rate Procedure').click());
    expect(host.textContent).toContain('Vbz = Rp × Pz + Ra × Az');
    await act(async () => byText('.lib-nav button', 'ASHRAE 90.1-2022 climate zone 0 requirements').click());
    expect(host.textContent).toContain('1.78 L/s·m²');
    await act(async () => byText('.lib-nav button', "Al Sa'fat – Dubai Green Building System").click());
    expect(host.textContent).toContain('1.5 / 0.25 / 0.25');
    await act(async () => byText('.lib-nav button', 'Envelope limits').click());
    expect(host.textContent).toContain('Barjeel V1.3 301.01 / 401.01');
    expect(host.textContent).not.toContain('ASHRAE 90.1-2022 Table 5.5-0');
    await act(async () => byText('.lib-nav button', 'ASHRAE 62.1-2025 ventilation rates (Table 6-1)').click());
    expect(host.textContent).toContain('Office space');
    expect(byText('button', 'Download PDF')).toBeTruthy();
    expect($$('button').some(b => /Download (all|full library)/.test(b.textContent || ''))).toBe(false);
    await act(async () => $$('.lib-nav button').filter(b => b.textContent === 'Official documents')[0].click());
    expect($$('.lib-docs a').map(a => new URL((a as HTMLAnchorElement).href).hostname)).toEqual(['www.dm.gov.ae', 'www.dm.gov.ae', 'www.doe.gov.ae', 'www.dmt.gov.ae', 'reem.rak.ae']);
    await act(async () => $$('.lib-nav button').filter(b => b.textContent === 'Official documents')[1].click());
    expect($$('.lib-docs a').every(a => (a as HTMLAnchorElement).href.startsWith('https://www.ashrae.org/'))).toBe(true);
    await act(async () => link('Forum').click());
    expect($$('.app-links button').map(e => e.textContent)).toEqual(['Library', 'Forum', 'Community chat', 'Support']);
    expect(host.textContent).toContain('The forum is coming soon');
    await act(async () => link('Community chat').click());
    expect(host.textContent).toContain('Community chat is coming soon');
    await act(async () => link('Support').click());
    expect($<HTMLAnchorElement>('.support a[href^="mailto:"]').href).toContain('support@novac.ae');
    await act(async () => byText('button', 'Open the Library').click());
    expect(link('Library').getAttribute('aria-pressed')).toBe('true');
    await act(async () => byText('button', 'Back to application').click());
    expect($('#workflow-stepper')).not.toBeNull();
  });
});

describe('project file links', () => {
  it('opens a project from a #open= link and keeps the previous work in the browser', async () => {
    await act(async () => setValue($('#p-name'), 'Villa Kite Beach'));
    const incoming = { ...JSON.parse(JSON.stringify(exampleState())), example: false };
    incoming.project.name = 'Shared project';
    const bytes = new TextEncoder().encode(JSON.stringify(incoming));
    const enc = 'j.' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await act(async () => { location.hash = '#open=' + enc; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect($<HTMLInputElement>('#p-name').value).toBe('Shared project');
    expect(location.hash).toBe('');
    expect(listSaved().map(p => p.name)).toContain('Villa Kite Beach');
  });
});

describe('duct sizing add-on', () => {
  it('builds a duct system from the rooms and sizes it', async () => {
    const step = () => $$('.workflow-step').find(e => e.textContent?.includes('Duct sizing'))!;
    expect(step()).toBeTruthy();
    await act(async () => step().click());
    expect(host.textContent).toContain('Add-on · Duct sizing');
    await act(async () => byText('button', 'Create from the rooms').click());
    const rooms = $$('.ritem').length || 5;
    const rows = $$('.duct-res:not(.duct-comp) tbody tr');
    expect(rows.length).toBe(rooms + 1);
    expect(rows.every(r => /\d+ × \d+|Ø\d+/.test(r.textContent || ''))).toBe(true);
    expect(num($('.duct-kpis .tot.key .v').textContent)).toBeGreaterThan(0);
    expect($$('.duct-res tr.crit').length).toBe(2);
    /* round ducts */
    await act(async () => setValue($<HTMLSelectElement>('.duct-settings select'), 'round'));
    expect($$('.duct-res:not(.duct-comp) tbody tr').every(r => /Ø\d+/.test(r.textContent || ''))).toBe(true);
    /* a fitting adds pressure to its section */
    const before = num($('.duct-kpis .tot.key .v').textContent);
    const add = $$('.duct-fits select').at(-1) as unknown as HTMLSelectElement;
    await act(async () => setValue(add, 'elbow-mitre'));
    expect(num($('.duct-kpis .tot.key .v').textContent)).toBeGreaterThanOrEqual(before);
  });
});

describe('duct sizing ASHRAE compliance', () => {
  it('shows each space against its ASHRAE criterion and duct velocity limit', async () => {
    await act(async () => $$('.workflow-step').find(e => e.textContent?.includes('Duct sizing'))!.click());
    await act(async () => byText('button', 'Create from the rooms').click());
    const rows = $$('.duct-comp tbody tr');
    expect(rows.length).toBe($$('.duct-res:not(.duct-comp) tbody tr').length - 1);
    expect(host.textContent).toContain('Open-plan offices');
    expect(host.textContent).toContain('HVAC Applications (2023), Ch. 49');
    /* sized to ASHRAE limits, so every space complies */
    expect(rows.every(r => r.textContent?.includes('Complies'))).toBe(true);
    /* custom limits far above ASHRAE: sizes shrink and spaces exceed */
    const limits = $$('.duct-settings label').find(l => l.textContent?.startsWith('Velocity limits'))!.querySelector('select')!;
    await act(async () => setValue(limits, 'custom'));
    for (const name of ['Main', 'Branch', 'Run-out']) {
      const input = $$('.duct-settings label').find(l => l.textContent?.startsWith(name + ' velocity limit'))!.querySelector('input')!;
      await act(async () => setValue(input, '15'));
    }
    expect($$('.duct-comp tbody tr').some(r => r.textContent?.includes('Exceeds ASHRAE limit'))).toBe(true);
  });
});

describe('duct sizing with or without a heat load', () => {
  it('sizes ducts independently, with hand-entered spaces and no project name', async () => {
    await act(async () => setValue($('#p-name'), ''));
    await act(async () => $$('.workflow-step').find(e => e.textContent?.includes('Duct sizing'))!.click());
    expect(host.textContent).toContain('Add-on · Duct sizing');
    await act(async () => byText('button', 'Start independent sizing').click());
    expect($$('.duct-res:not(.duct-comp) tbody tr')).toHaveLength(4);
    /* each hand-entered space has its airflow and room type, and is checked against ASHRAE */
    expect($$('.duct-comp tbody tr')).toHaveLength(3);
    expect(host.textContent).toContain('(entered by hand)');
    expect(host.textContent).toContain('Executive and private offices');
    const flow = $('input[aria-label="Airflow, L/s"]') as HTMLInputElement;
    await act(async () => setValue(flow, '400'));
    expect(num($$('.duct-res:not(.duct-comp) tbody tr')[0].querySelectorAll('td')[1].textContent)).toBe(700);
  });

  it('loads a heat load project saved in the browser, and its rooms feed the ducts', async () => {
    const saved = { ...JSON.parse(JSON.stringify(exampleState())), example: false };
    saved.project.name = 'Tower A heat load';
    localStorage.setItem('novac-heatload-projects', JSON.stringify([{ id: 'p1', name: 'Tower A heat load', savedAt: new Date().toISOString(), data: saved }]));
    await act(async () => $$('.workflow-step').find(e => e.textContent?.includes('Duct sizing'))!.click());
    await act(async () => byText('button', 'Load from this browser').click());
    expect(host.textContent).toContain('Tower A heat load');
    await act(async () => byText('.duct-saved button', 'Load').click());
    expect($('.duct-source b').textContent).toBe('Tower A heat load');
    await act(async () => byText('button', 'Create from the rooms').click());
    expect($$('.duct-comp tbody tr').length).toBe(saved.rooms.length);
    /* the work open before was kept in the browser */
    expect(listSaved().length).toBe(2);
  });
});

describe('energy modelling', () => {
  it('splits the hourly demand between solar, battery, grid and genset and costs it', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    /* energy modelling runs in steps like the heat load calculation: step 1 is the project link */
    expect($$('.em-step')).toHaveLength(7);
    expect($('.em-step[aria-current="step"] .em-title').textContent).toBe('Project link');
    expect($('.plink')).toBeTruthy();
    expect($('.pw-sched')).toBeNull();
    await act(async () => byText('.em-nav button', 'Continue: Operating schedule').click());
    expect($('.em-step[aria-current="step"] .em-title').textContent).toBe('Operating schedule');
    expect($('.pw-sched')).toBeTruthy();
    expect($('.plink')).toBeNull();
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="6"]').click());
    expect($('.pw-load')).toBeTruthy();
    await act(async () => byText('.em-nav button', 'Previous').click());
    expect($('.em-step[aria-current="step"] .em-title').textContent).toBe('Costs');
    expect($('.em-summary').textContent).toMatch(/Demand [\d,]+ kWh a year/);
    /* the rest of this test reviews every step on one page */
    await act(async () => byText('.em-all', 'Show all steps on one page').click());
    expect($('.power').textContent).toContain('Annual demand');
    /* 200 panels of 550 Wp: 110 kWp, inverter suggested at DC/AC 1.15 */
    /* on-grid starts with the TCL; the supply inputs follow it */
    await act(async () => setValue($('#pw-tcl'), '150'));
    await act(async () => setValue($('#pw-panels'), '200'));
    expect($('.power').textContent).toContain('110.00 kWp');
    expect($('.power').textContent).toContain('suggested 100 kW');
    await act(async () => $$('.pw-chk').find(e => e.textContent?.includes('Add battery storage'))!.querySelector('input')!.click());
    expect($('.power').textContent).toMatch(/blank = suggested \d+ kWh/);
    /* fewer panels and no grid leave the rest to the genset */
    await act(async () => setValue($('#pw-panels'), '10'));
    await act(async () => setValue($('#pw-gridKW'), '0'));
    expect($(".power").textContent).toMatch(/Genset \d+ kVA × [\d.]+ = \d+ kW/);
    expect($('.power').textContent).toContain('Solar and battery payback');
    /* fixed shares in kW of TCL: 100 kW TCL, grid 60 kW, solar 25 kW, genset the remaining 15 kW */
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('Fixed shares')) as HTMLButtonElement).click());
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('kW of TCL')) as HTMLButtonElement).click());
    await act(async () => setValue($('#pw-tcl'), '100'));
    await act(async () => setValue($('#pw-gridKWs'), '60'));
    await act(async () => setValue($('#pw-solarKWs'), '25'));
    expect($<HTMLInputElement>('input[aria-label="Genset share"]').value).toBe('15.0');
    expect($('.pw-shares').textContent).toContain('60.0%');
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('% of demand')) as HTMLButtonElement).click());
    expect($('.pw-shares').textContent).toContain('TCL');
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('Hour by hour')) as HTMLButtonElement).click());
    await act(async () => setValue($('#pw-tcl'), ''));
    /* the DEWA check: an entered TCL of 150 kW allows 100 + 50 × 75% = 137.5 kW AC */
    await act(async () => setValue($('#pw-tcl'), '150'));
    expect($('.pw-dewa').textContent).toContain('Within DEWA limit');
    expect($('.pw-dewa').textContent).toContain('137.5 kW AC');
    /* work independently: the user's own power demand, without the hourly analysis */
    await act(async () => ($$('.power .plink .seg button').find(e => e.textContent?.startsWith('Work independently')) as HTMLButtonElement).click());
    await act(async () => setValue($('#pw-cKW'), '80'));
    expect($('.power').textContent).toContain('Custom profile');
    /* additional power demand: off and hidden until switched on */
    expect($('#pw-addKW')).toBeNull();
    await act(async () => $<HTMLInputElement>('#pw-extraOn').click());
    await act(async () => setValue($('#pw-addKW'), '10'));
    expect($('.pw-extra').textContent).toContain('+ 10.0 kW');
    await act(async () => $<HTMLInputElement>('#pw-extraOn').click());
    expect($('#pw-addKW')).toBeNull();
    /* the power demand shows in its own card as soon as it is entered */
    expect($('.pw-demand').textContent).toContain('Annual power demand');
    expect($('.pw-demand').textContent).toContain('80.00kW');
    /* operating schedule: Monday to Friday, 08:00 to 18:00 is 261 × 10 = 2,610 hours in 2025; adding Saturday adds 52 × 10 */
    expect($('.pw-sched').textContent).toContain('2,610 operating hours a year');
    await act(async () => byText('.pw-days button', 'Sat').click());
    expect($('.pw-sched').textContent).toContain('3,130 operating hours a year');
    await act(async () => setValue($('#pw-op-h-main'), 'retail'));
    expect($('.pw-sched').textContent).toContain('6 days × 12 h = 72 h a week');
    /* split the week: weekdays 08:00–12:00 (4 h) and the weekend 08:00–20:00 (12 h); a day cannot be in both */
    await act(async () => byText('.pw-splits button', 'Weekdays + weekend').click());
    expect($$('.pw-op')).toHaveLength(2);
    expect($$('.pw-op')[0].textContent).toContain('5 days × 4 h = 20 h a week');
    expect($$('.pw-op')[1].textContent).toContain('2 days × 12 h = 24 h a week');
    expect(($$('.pw-op')[0].querySelectorAll('.pw-days button')[5] as HTMLButtonElement).disabled).toBe(true);
    expect($('.pw-sched').textContent).toContain('Every day of the week is covered');
    /* 261 weekdays × 4 h + 104 weekend days × 12 h */
    expect($('.pw-sched').textContent).toContain(`${(261 * 4 + 104 * 12).toLocaleString('en-US')} operating hours a year`);
    /* the power profile follows the schedules: 80 kW for 4 h on 261 weekdays and 12 h on 104 weekend days */
    const rows = $$('.pw-stbl tbody tr');
    expect(rows[0].textContent).toContain('Weekdays');
    expect(rows[0].textContent).toContain((261 * 4 * 80).toLocaleString('en-US'));
    expect(rows[1].textContent).toContain('Weekend');
    expect(rows[1].textContent).toContain((104 * 12 * 80).toLocaleString('en-US'));
    expect($('.pw-demand').textContent).toContain('Daily, weekly and monthly requirements');
    /* the requirement cards follow the day selected in the chart: total kWh and average kW of the day, its week and its month */
    await act(async () => setValue($('.pw-demand .pw-nav input[type="date"]'), '2025-01-04'));
    const req = $$('.pw-req .tot');
    expect(req[0].textContent).toContain('Day · 4 Jan');
    /* Saturday 4 January, weekend schedule: 12 h × 80 kW + 12 h × 5 kW base = 1,020 kWh, 42.50 kW average */
    expect(req[0].textContent).toContain('1,020kWh total');
    expect(req[0].textContent).toContain('average 42.50 kW');
    expect(req[1].textContent).toContain('Week · 1 Jan to 5 Jan');
    expect(req[2].textContent).toContain('Month · Jan 2025');
    expect(req[3].textContent).toContain('Year · 2025');
    await act(async () => setValue($('.pw-demand .pw-nav input[type="date"]'), '2025-01-06'));
    /* Monday: 4 h × 80 + 20 h × 5 = 420 kWh */
    expect($$('.pw-req .tot')[0].textContent).toContain('420kWh total');
    /* a third schedule takes a day freed from the weekend */
    await act(async () => ($$('.pw-op')[1].querySelectorAll('.pw-days button')[6] as HTMLButtonElement).click());
    expect($('.pw-sched').textContent).toContain('Sun not in any schedule');
    await act(async () => byText('.pw-sched .btns button', '+ Add schedule (for Sun)').click());
    expect($$('.pw-op')).toHaveLength(3);
    expect($('.pw-sched').textContent).toContain('Every day of the week is covered');
    /* the chart switches between a day, a week and the year; the month table lists 12 months and the year in kWh */
    await act(async () => byText('.pw-view button', 'Year').click());
    expect($$('.pw-dchart .pw-bar-r')).toHaveLength(365);
    await act(async () => byText('.pw-view button', 'Week').click());
    expect($$('.pw-dchart .pw-bar-r')).toHaveLength(168);
    expect($$('.pw-mtbl tbody tr')).toHaveLength(13);
    expect($('.pw-mtbl thead').textContent).toContain('Energy, kWh');
    /* the sample example is the application's example office */
    await act(async () => byText('.pw-sample button', 'Load sample example').click());
    /* load on grid, PV and genset by day, week, month and year */
    expect($('.pw-load').textContent).toContain('Load on each source');
    expect($('.pw-src').textContent).toContain('Grid');
    for (const v of ['Week', 'Month', 'Year', 'Day']) {
      await act(async () => byText('.pw-load .pw-view button', v).click());
      expect($('.pw-load .pw-read').textContent).toMatch(/kWh/);
    }
    expect($$('.pw-srcm thead th')).toHaveLength(14);
    /* the test app has the example open, so the sample runs on this project, with panels on its 254 m² roof */
    expect($('.pw-sample').textContent).toContain('254 m² roof');
    expect($('.pw-demand').textContent).toMatch(/Annual power demand[\d,]+kWh/);
    expect($('.power').textContent).toContain('Worked example');
    expect($('.pw-dewa').textContent).toContain('Within DEWA limit');
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('indoor air quality on its own', () => {
  it('works independently on its own rooms without a project name', async () => {
    await act(async () => $('.workflow-step[data-step="0"]').click());
    await act(async () => setValue($('#p-name'), ''));
    await act(async () => $('.workflow-step[data-step="7"]').click());
    for (let i = 0; i < 50 && !$('.plink'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect($('.workflow-step[aria-current="step"] .workflow-title').textContent).toBe('Indoor air quality');
    await act(async () => ($$('.plink .seg button').find(e => e.textContent?.startsWith('Work independently')) as HTMLButtonElement).click());
    for (let i = 0; i < 50 && !$('.iaq-zones'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    /* the independent study has its own single room, not the open project's five */
    expect($$('.iaq-zones tbody tr')).toHaveLength(1);
    expect($('.plink-inputs').textContent).toContain('Inputs for this study');
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('energy modelling real weather', () => {
  it('loads a weather year inside energy modelling and runs the demand and solar on it', async () => {
    NET.spacing = 0; NET.backoff = 1;
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify(fakeOpenMeteo(2025)), { status: 200 }));
    vi.stubGlobal('fetch', f);
    try {
      await act(async () => $('.workflow-step[data-step="6"]').click());
      for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      await act(async () => byText('.em-all', 'Show all steps on one page').click());
      await act(async () => setValue($('#pw-wx-year'), '2025'));
      await act(async () => ($('.pw-wx .wx-btns .btn.primary') as HTMLButtonElement).click());
      for (let i = 0; i < 40 && !($('.pw-wx').textContent || '').includes('8,760 hours'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect(f.mock.calls.some(c => String(c[0]).includes('archive-api.open-meteo.com'))).toBe(true);
      expect($('.pw-wx').textContent).toContain('energy modelling’s own');
      /* loading real weather switches this project's demand to the real weather year */
      for (let i = 0; i < 40 && !($('.pw-demand')?.textContent || '').includes('Real weather'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect($('.pw-demand').textContent).toContain('Real weather');
      /* an independent study takes its solar and calendar from the same weather year */
      await act(async () => ($$('.power .plink .seg button').find(e => e.textContent?.startsWith('Work independently')) as HTMLButtonElement).click());
      expect($('.pw-demand').textContent).toContain('real weather');
      expect(host.textContent).not.toMatch(/NaN|undefined/);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('energy modelling off-grid', () => {
  it('sizes the battery and solar from the consumption and drops the grid and DEWA', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('Off-grid')) as HTMLButtonElement).click());
    expect($('.pw-off').textContent).toContain('Battery, nominal');
    expect($('.pw-dewa')).toBeNull();
    expect($('#pw-gridKW')).toBeNull();
    const use = $$('.pw-off button').find(e => e.textContent?.startsWith('Use ')) as HTMLButtonElement;
    await act(async () => use.click());
    /* the off-grid scenario has its own panels; the on-grid scenario keeps its own */
    const offPanels = $<HTMLInputElement>('#pw-panels').value;
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('On-grid')) as HTMLButtonElement).click());
    /* on-grid starts with the TCL; the supply inputs follow it */
    await act(async () => setValue($('#pw-tcl'), '150'));
    await act(async () => setValue($('#pw-panels'), '7'));
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('Off-grid')) as HTMLButtonElement).click());
    expect($<HTMLInputElement>('#pw-panels').value).toBe(offPanels);
    /* results compare both and the toggle switches between them */
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="6"]').click());
    expect($('.pw-cmptbl').textContent).toContain('On-grid');
    expect($('.pw-cmptbl').textContent).toContain('Off-grid');
    expect($('.pw-cmp').textContent).toContain('results below are for the off-grid scenario');
    await act(async () => byText('.pw-cmp .seg button', 'On-grid results ' + ($$('.pw-cmp .seg button')[0].querySelector('span')!.textContent)).click());
    expect($('.pw-cmp').textContent).toContain('results below are for the on-grid scenario');
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    expect($<HTMLInputElement>('#pw-panels').value).toBe('7');
    await act(async () => ($$('.power .seg button').find(e => e.textContent?.startsWith('Off-grid')) as HTMLButtonElement).click());
    expect($('.pw-off .wx-status')).toBeTruthy();
    expect($('.em-step[data-em="4"]').textContent).toContain('Off-grid');
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('fresh air load options', () => {
  it('turns a space\'s fresh air load off and on, and offers % of supply air only for packaged units', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    const before = num(plantTR());
    await act(async () => $('.workflow-step[data-step="3"]').click());
    const fa = $<HTMLInputElement>('#r-faLoad');
    expect(fa.checked).toBe(true);
    await act(async () => fa.click());
    expect($<HTMLInputElement>('#r-faLoad').checked).toBe(false);
    expect($('.oa-box').textContent).toContain('Excluded from the calculation');
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(num(plantTR())).toBeLessThan(before);
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => $<HTMLInputElement>('#r-faLoad').click());
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(num(plantTR())).toBeCloseTo(before, 2);
    /* packaged units: fresh air as 0–12% of supply air */
    await act(async () => setValue($('#summary-el-sys'), 'ducted'));
    await act(async () => setValue($('#summary-el-pkg'), 'pct'));
    expect($<HTMLInputElement>('#summary-el-pkgpct').value).toBe('10');
    expect($('#summary-el-fahu')).toBeNull();
    expect($('.hr-card').textContent).toContain('Packaged units: each room takes 10% of its supply air');
    await act(async () => setValue($('#summary-el-pkgpct'), '20'));
    expect($<HTMLInputElement>('#summary-el-pkgpct').value).toBe('12');
    await act(async () => setValue($('#summary-el-sys'), 'vrf'));
    expect($('#summary-el-pkg')).toBeNull();
    expect($('#summary-el-fahu')).toBeTruthy();
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('fresh air system load switch', () => {
  it('turns the whole fresh air load off from the plant load card and back on', async () => {
    await act(async () => $('.workflow-step[data-step="4"]').click());
    const before = num(plantTR());
    expect($<HTMLInputElement>('#p-faOff').checked).toBe(true);
    await act(async () => $<HTMLInputElement>('#p-faOff').click());
    expect($('.fa-sys').textContent).toContain('Fresh air system load off');
    expect($$('.totals .tot.pick')[1].textContent).toContain('turned off');
    expect(num(plantTR())).toBeLessThan(before);
    await act(async () => $<HTMLInputElement>('#p-faOff').click());
    expect(num(plantTR())).toBeCloseTo(before, 2);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('fresh air system load switch in Spaces', () => {
  it('turns the fresh air load off from the building total summary, shared with the heat load summary', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => $<HTMLButtonElement>('.rtotal').click());
    const big = () => $('.plant-band .pb-head .big-num').textContent!;
    const before = num(big());
    expect($<HTMLInputElement>('#pb-faOff').checked).toBe(true);
    await act(async () => $<HTMLInputElement>('#pb-faOff').click());
    expect($('.plant-band .oa-box').textContent).toContain('Turned off');
    expect(num(big())).toBeLessThan(before);
    /* the same setting in the heat load summary */
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect($<HTMLInputElement>('#p-faOff').checked).toBe(false);
    await act(async () => $<HTMLInputElement>('#p-faOff').click());
    await act(async () => $('.workflow-step[data-step="3"]').click());
    await act(async () => $<HTMLButtonElement>('.rtotal').click());
    expect(num(big())).toBeCloseTo(before, 2);
  });
});

describe('Pro step order', () => {
  it('puts energy modelling right after the hourly analysis', async () => {
    const titles = $$('.workflow-pro .workflow-title').map(e => e.textContent);
    expect(titles.slice(0, 3)).toEqual(['Hourly analysis', 'Energy modelling', 'Indoor air quality']);
    await act(async () => $('.workflow-step[data-step="5"]').click());
    await act(async () => byText('.btn', 'Continue').click());
    expect($('.workflow-step[aria-current="step"] .workflow-title').textContent).toBe('Energy modelling');
  });
});

describe('on-grid and off-grid calculation switches', () => {
  it('turns each scenario\'s calculation on and off', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    const on = () => $<HTMLInputElement>('#pw-calc-on'), off = () => $<HTMLInputElement>('#pw-calc-off');
    /* on-grid is calculated, off-grid is not, until switched on */
    expect(on().checked).toBe(true);
    expect(off().checked).toBe(false);
    expect($('.em-toggle')).toBeNull();
    await act(async () => off().click());
    expect(off().checked).toBe(true);
    expect($('.em-conn').textContent).toMatch(/Off-grid calculation · AED [\d,]+ a year/);
    /* both on: Show picks the scenario, Results compares them */
    expect($$('.em-toggle button')).toHaveLength(2);
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="6"]').click());
    expect($('.pw-cmp')).toBeTruthy();
    /* on-grid off: only off-grid is calculated and shown, no comparison */
    await act(async () => on().click());
    expect($('.pw-cmp')).toBeNull();
    expect($('.em-conn').textContent).toContain('Only the off-grid scenario is calculated');
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    expect($('.pw-off')).toBeTruthy();
    /* both off: no supply calculation */
    await act(async () => off().click());
    expect($('.power').textContent).toContain('calculations are both off');
    await act(async () => on().click());
    expect($('.pw-off')).toBeNull();
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('remaining power requirement', () => {
  it('shows what solar and the battery leave and shares it between grid and genset', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    /* on-grid starts with the TCL; the supply inputs follow it */
    await act(async () => setValue($('#pw-tcl'), '150'));
    await act(async () => setValue($('#pw-panels'), '10'));
    expect($('.pw-rem').textContent).toContain('Remaining load');
    /* power supplied in order: solar system, grid, genset, adding up to the demand */
    const ord = $$('.pw-order .tot');
    expect(ord).toHaveLength(4);
    expect(ord[0].textContent).toContain('1 · Solar system');
    expect(ord[1].textContent).toContain('2 · On-grid');
    expect(ord[2].textContent).toContain('3 · Genset');
    const v = (i: number) => num(ord[i].querySelector('.v')!.textContent!);
    expect(Math.abs(v(0) + v(1) + v(2) - v(3))).toBeLessThanOrEqual(2);
    await act(async () => byText('.pw-remq button', '50 / 50').click());
    const grid = num($$('.pw-rem .hr-kpis:not(.pw-order) .tot')[2].querySelector('.v')!.textContent!), gen = num($$('.pw-rem .hr-kpis:not(.pw-order) .tot')[3].querySelector('.v')!.textContent!);
    expect(grid).toBeGreaterThan(0);
    expect(Math.abs(grid - gen)).toBeLessThanOrEqual(1);
    await act(async () => byText('.pw-remq button', 'All genset').click());
    expect(num($$('.pw-rem .hr-kpis:not(.pw-order) .tot')[2].querySelector('.v')!.textContent!)).toBe(0);
    /* inverter selection from standard sizes */
    await act(async () => setValue($('#pw-invsel'), '10'));
    expect($<HTMLInputElement>('#pw-invKW').value).toBe('10');
    await act(async () => setValue($('#pw-invsel'), 'auto'));
    expect($<HTMLInputElement>('#pw-invKW').value).toBe('');
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('battery selection', () => {
  it('picks a standard battery capacity, the suggested one or none', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    /* on-grid starts with the TCL; the supply inputs follow it */
    await act(async () => setValue($('#pw-tcl'), '150'));
    await act(async () => setValue($('#pw-panels'), '40'));
    expect($<HTMLSelectElement>('#pw-batsel').value).toBe('none');
    await act(async () => setValue($('#pw-batsel'), '50'));
    expect($<HTMLInputElement>('#pw-batKWh').value).toBe('50');
    expect($('.power').textContent).toContain('Battery 50 kWh (45.0 kWh usable');
    await act(async () => setValue($('#pw-batsel'), 'auto'));
    expect($<HTMLInputElement>('#pw-batKWh').value).toBe('');
    await act(async () => setValue($('#pw-batsel'), 'none'));
    expect($('#pw-batKWh')).toBeNull();
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('on-grid with DEWA', () => {
  it('starts with the TCL, sizes from it or takes my own system, and shows the DEWA bill and saving', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    expect($('.pw-ongrid')).toBeTruthy();
    await act(async () => setValue($('#pw-tcl'), '150'));
    expect($('.pw-allow').textContent).toContain('137.5kW AC');
    /* A: size from the TCL */
    await act(async () => byText('.pw-ongrid .seg button', 'A · Size from the TCL panels and inverter at the DEWA maximum').click());
    const maxPanels = num($$('.pw-allow .tot')[3].querySelector('.v')!.textContent!);
    expect(num($<HTMLInputElement>('#pw-panels').value)).toBe(maxPanels);
    expect($<HTMLInputElement>('#pw-panels').readOnly).toBe(true);
    /* B: my own system keeps those values to edit */
    await act(async () => byText('.pw-ongrid .seg button', 'B · My own system enter panel quantity, Wp and the inverter below').click());
    await act(async () => setValue($('#pw-panels'), '40'));
    expect($('.pw-ongrid').textContent).toMatch(/DEWA bill AED [\d,]+ → AED [\d,]+ a year, saving AED [\d,]+/);
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="6"]').click());
    expect($('.pw-dbill').textContent).toContain('DEWA saving');
    expect($$('.pw-dbtbl tbody tr')).toHaveLength(13);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('on-grid starts with the TCL', () => {
  it('asks for the TCL before the rest of the on-grid supply', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    /* first thing after choosing on-grid: the TCL; the rest waits for it */
    expect($('.pw-ongrid h4').textContent).toContain('Step 1 · Total Connected Load (TCL)');
    expect($('#pw-tcl')).toBeTruthy();
    expect($('#pw-panels')).toBeNull();
    expect($('.pw-tclgate').textContent).toContain('Enter the plot’s TCL above first');
    expect($('.em-step[data-em="4"]').textContent).toContain('enter the TCL');
    await act(async () => setValue($('#pw-tcl'), '80'));
    expect($('#pw-panels')).toBeTruthy();
    expect($('.pw-tclgate')).toBeNull();
    /* not on DEWA: continue without the limit */
    await act(async () => setValue($('#pw-tcl'), ''));
    expect($('#pw-panels')).toBeNull();
    await act(async () => byText('.pw-tclgate button', 'Not on DEWA: continue without the limit').click());
    expect($('#pw-panels')).toBeTruthy();
    expect($('.pw-tclgate')).toBeNull();
  });
  it('takes you to the TCL when the on-grid calculation is switched on', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    await act(async () => $<HTMLInputElement>('#pw-calc-on').click());
    await act(async () => $<HTMLInputElement>('#pw-calc-on').click());
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect($('.em-step[aria-current="step"] .em-title').textContent).toBe('Power supply');
    expect(document.activeElement?.id).toBe('pw-tcl');
  });
});

describe('recommended genset size', () => {
  it('shows the recommended kVA from the peak load day with the safety margin', async () => {
    await act(async () => $('.workflow-step[data-step="6"]').click());
    for (let i = 0; i < 50 && !$('.power'); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    await act(async () => $<HTMLButtonElement>('.em-step[data-em="4"]').click());
    await act(async () => setValue($('#pw-tcl'), '150'));
    await act(async () => byText('.pw-remq button', 'All genset').click());
    expect($('.pw-genrec').textContent).toContain('peak load on the peak load day');
    expect($('.pw-genrec').textContent).toContain('× (1 + 20% safety margin)');
    const kva = (t: string) => num(t.match(/Recommended genset ([\d,]+) kVA/)![1].replace(/,/g, ''));
    const at20 = kva($('.pw-genrec').textContent!);
    await act(async () => setValue($('#pw-genMargin'), '50'));
    expect(kva($('.pw-genrec').textContent!)).toBeGreaterThanOrEqual(at20);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('site configuration from the admin', () => {
  it('shows each feature live, locked, coming soon or hidden, with the banner and titles', async () => {
    const { setSiteConfig } = await import('../src/siteConfig');
    try {
      await act(async () => setSiteConfig({ version: 1, features: { hourly: 'hidden', energy: 'locked', iaq: 'soon', ducts: 'live', forum: 'hidden', chat: 'soon' },
        texts: { bannerOn: true, bannerText: 'Maintenance tonight', bannerTone: 'warn', appTitle: 'NOVAC Pro', appTag: 'Testing tag' } }));
      const pro = $$('.workflow-pro .workflow-title').map(e => e.textContent);
      expect(pro).not.toContain('Hourly analysis');
      const energy = $$('.workflow-pro .workflow-soon').find(e => e.textContent?.includes('Energy modelling'))!;
      expect(energy.textContent).toContain('Locked · Log in for Pro');
      expect(($$('.workflow-pro .workflow-soon').find(e => e.textContent?.includes('Indoor air quality'))!).textContent).toContain('Coming soon');
      /* duct sizing set live opens */
      expect($$('.workflow-pro .workflow-step').some(e => e.textContent?.includes('Duct sizing'))).toBe(true);
      /* pages: forum hidden, chat coming soon */
      expect($$('.app-links button').map(b => b.textContent)).not.toContain('Forum');
      expect(($$('.app-links button').find(b => b.textContent?.startsWith('Community chat')) as HTMLButtonElement).disabled).toBe(true);
      expect($('.site-banner.warn').textContent).toBe('Maintenance tonight');
      expect($('.app-heading h1').textContent).toBe('NOVAC Pro');
      /* Continue from the heat load summary skips the steps that cannot be opened */
      await act(async () => $('.workflow-step[data-step="4"]').click());
      expect($$('.workflow-end button').some(b => b.textContent === 'Continue')).toBe(false);
    } finally { await act(async () => setSiteConfig(null)); }
  });

  it('a locked Pro tool asks to log in, and opens for a user with Pro', async () => {
    const { setSiteConfig, setUser } = await import('../src/siteConfig');
    try {
      await act(async () => setSiteConfig({ version: 1, features: { energy: 'locked' }, texts: {} }));
      expect($('.account-btn').textContent).toBe('Log in');
      const locked = () => $$('.workflow-pro .workflow-locked').find(e => e.textContent?.includes('Energy modelling'));
      await act(async () => locked()!.click());
      expect(document.querySelector('.modal')!.textContent).toContain('Energy modelling is a Pro tool. Log in or sign up');
      expect(document.querySelector('#acc-email')).not.toBeNull();
      await act(async () => (document.querySelector('.modal-head button') as HTMLButtonElement).click());
      expect(document.querySelector('.modal')).toBeNull();
      /* logged in, waiting for approval: still locked */
      await act(async () => setUser({ email: 'eng@example.com', pro: false }));
      expect($('.account-btn').textContent).toContain('Pending');
      expect(locked()!.textContent).toContain('Pro pending');
      /* given Pro: the tool is a step that opens */
      await act(async () => setUser({ email: 'eng@example.com', pro: true }));
      expect(locked()).toBeUndefined();
      expect($$('.workflow-pro .workflow-step').some(e => e.textContent?.includes('Energy modelling'))).toBe(true);
      expect($('.account-btn').textContent).toContain('Pro');
    } finally { await act(async () => { setSiteConfig(null); setUser(null); }); }
  });
});

describe('admin page', () => {
  it('logs in, changes a status and saves', async () => {
    (globalThis as { __NOVAC_TEST__?: boolean }).__NOVAC_TEST__ = true;
    const { Admin } = await import('../src/admin');
    let saved: unknown = null, logged = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/admin/session') return logged ? j({ ok: true, email: 'admin@novac.ae', storage: true }) : j({ error: 'Not logged in' }, 401);
      if (url === '/api/admin/login') { const b = JSON.parse(String(init!.body)); if (b.password === 'right password') { logged = true; return j({ ok: true, email: b.email }); } return j({ error: 'Wrong email or password' }, 401); }
      if (url === '/api/config') return j({ config: saved });
      if (url === '/api/admin/config') { saved = { ...JSON.parse(String(init!.body)).config, updated: '2026-11-04T10:00:00Z', by: 'admin@novac.ae' }; return j({ ok: true, config: saved }); }
      return j({}, 404);
    }));
    try {
      act(() => root.unmount());
      root = createRoot(host);
      await act(async () => root.render(<Admin />));
      for (let i = 0; i < 20 && !$('#ad-email'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      await act(async () => setValue($('#ad-email'), 'admin@novac.ae'));
      await act(async () => setValue($('#ad-pass'), 'wrong'));
      await act(async () => ($('.admin-login button[type="submit"]') as HTMLButtonElement).click());
      for (let i = 0; i < 20 && !$('.admin-login .wx-status'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect($('.admin-login .wx-status').textContent).toContain('Wrong email or password');
      await act(async () => setValue($('#ad-pass'), 'right password'));
      await act(async () => ($('.admin-login button[type="submit"]') as HTMLButtonElement).click());
      for (let i = 0; i < 20 && !$('.admin-tbl'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect($$('.admin-tbl')).toHaveLength(4);
      /* a feature that is not built cannot be set live */
      const audit = $<HTMLSelectElement>('select[aria-label="Energy audit status"]');
      expect((audit.querySelector('option[value="live"]') as HTMLOptionElement).disabled).toBe(true);
      await act(async () => setValue($('select[aria-label="Hourly analysis status"]'), 'hidden'));
      await act(async () => $<HTMLInputElement>('.admin .pw-chk input').click());
      await act(async () => setValue($('#ad-bannerText'), 'Hello'));
      await act(async () => byText('.admin-bar button', 'Save and publish').click());
      for (let i = 0; i < 20 && !$('.wx-status.ready'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect((saved as { features: Record<string, string> }).features.hourly).toBe('hidden');
      expect((saved as { texts: { bannerText: string } }).texts.bannerText).toBe('Hello');
      expect($('.admin-bar').textContent).toContain('by admin@novac.ae');
    } finally { vi.unstubAllGlobals(); }
  });

  it('lists the users, gives Pro, filters and exports them as CSV', async () => {
    (globalThis as { __NOVAC_TEST__?: boolean }).__NOVAC_TEST__ = true;
    const { Admin, usersCsv } = await import('../src/admin');
    const u = (email: string, pro = false, blocked = false) => ({ email, created_at: '2026-11-01T09:00:00Z', last_login_at: '2026-11-03T09:00:00Z', logins: 2, pro, pro_since: pro ? '2026-11-02T09:00:00Z' : null, blocked });
    let users = [u('a@x.com'), u('b@x.com', true), u('c@x.com', false, true)];
    const patches: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/admin/session') return j({ ok: true, email: 'admin@novac.ae', storage: true });
      if (url === '/api/config') return j({ config: null });
      if (url === '/api/admin/users' && init?.method === 'PATCH') {
        const b = JSON.parse(String(init.body)); patches.push(b);
        users = users.map(x => x.email === b.email ? { ...x, ...b, pro_since: '2026-11-04T09:00:00Z' } : x);
        return j({ ok: true, user: users.find(x => x.email === b.email) });
      }
      if (url === '/api/admin/users') return j({ ok: true, users });
      return j({}, 404);
    }));
    try {
      act(() => root.unmount());
      root = createRoot(host);
      await act(async () => root.render(<Admin />));
      for (let i = 0; i < 30 && !$('.admin-users tbody'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      const rows = () => $$('.admin-users tbody tr').map(r => r.textContent);
      expect(rows()).toHaveLength(3);
      expect($('.admin-users').textContent).toContain('Waiting for Pro (1)');
      await act(async () => byText('.admin-users .btns button', 'Waiting for Pro (1)').click());
      expect(rows()).toEqual([expect.stringContaining('a@x.com')]);
      await act(async () => byText('.admin-users tbody button', 'Give Pro').click());
      for (let i = 0; i < 20 && !patches.length; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect(patches).toEqual([{ email: 'a@x.com', pro: true }]);
      expect(rows()).toHaveLength(0);
      expect($('.admin-users').textContent).toContain('Pro (2)');
    } finally { vi.unstubAllGlobals(); }
    expect(usersCsv([u('q"x@y.com', true)])).toBe('Email,Signed up,Last login,Logins,Pro,Pro since,Blocked\r\n"q""x@y.com",2026-11-01T09:00:00Z,2026-11-03T09:00:00Z,2,yes,2026-11-02T09:00:00Z,no\r\n');
  });
});

describe('drafts and the admin preview', () => {
  it('shows drafts to the logged-in admin as previews, and activating makes them live for everyone', async () => {
    const { setAdminPreview, setSiteConfig } = await import('../src/siteConfig');
    PRO.unlocked = false; PRO.ducts = false;
    try {
      await act(async () => root.render(<ToastProvider><App key="drafts" /></ToastProvider>));
      await act(async () => setAdminPreview(true));
      expect($('.admin-preview').textContent).toContain('6 updates not live yet');
      const prev = $$('.workflow-step.is-preview');
      expect(prev.map(e => e.querySelector('.workflow-title')!.textContent)).toEqual(['Hourly analysis', 'Energy modelling', 'Indoor air quality', 'Duct sizing']);
      expect(prev[0].querySelector('.workflow-status')!.textContent).toMatch(/^Preview · /);
      /* the admin can open a preview */
      await act(async () => prev[1].click());
      expect($('.workflow-step[aria-current="step"] .workflow-title').textContent).toBe('Energy modelling');
      /* activated: live for visitors too */
      await act(async () => { setAdminPreview(false); setSiteConfig({ version: 1, features: { energy: 'live' }, texts: {} }); });
      const titles = $$('.workflow-pro .workflow-step .workflow-title').map(e => e.textContent);
      expect(titles).toContain('Energy modelling');
      expect(titles).not.toContain('Hourly analysis');
      expect($$('.workflow-step.is-preview')).toHaveLength(0);
    } finally { await act(async () => { setAdminPreview(false); setSiteConfig(null); }); }
  });
  it('lists the updates waiting in the admin panel and activates them at once', async () => {
    (globalThis as { __NOVAC_TEST__?: boolean }).__NOVAC_TEST__ = true;
    PRO.unlocked = false; PRO.ducts = false;
    const { Admin } = await import('../src/admin');
    let saved: unknown = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/admin/session') return j({ ok: true, email: 'admin@novac.ae', storage: true });
      if (url === '/api/config') return j({ config: saved });
      if (url === '/api/admin/config') { saved = { ...JSON.parse(String(init!.body)).config, updated: '2026-11-04T10:00:00Z', by: 'admin@novac.ae' }; return j({ ok: true, config: saved }); }
      return j({}, 404);
    }));
    try {
      act(() => root.unmount());
      root = createRoot(host);
      await act(async () => root.render(<Admin />));
      for (let i = 0; i < 20 && !$('.admin-waiting li'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect($$('.admin-waiting li').map(li => li.querySelector('b')!.textContent)).toEqual(['Hourly analysis', 'Energy modelling', 'Indoor air quality', 'Duct sizing', 'Fresh air load switches (per space and whole system)', 'Packaged unit fresh air, % of supply air']);
      const energy = $$('.admin-waiting li').find(li => li.textContent?.includes('Energy modelling'))!;
      await act(async () => (energy.querySelector('button') as HTMLButtonElement).click());
      for (let i = 0; i < 20 && !$('.wx-status.ready'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect((saved as { features: Record<string, string> }).features.energy).toBe('live');
      expect($('.wx-status.ready').textContent).toContain('Energy modelling is live');
      expect($$('.admin-waiting li')).toHaveLength(5);
      await act(async () => byText('.admin-waiting button', 'Activate all 5').click());
      for (let i = 0; i < 20 && $$('.admin-waiting li').length; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect((saved as { features: Record<string, string> }).features).toEqual({ hourly: 'live', energy: 'live', iaq: 'live', ducts: 'live', freshair: 'live', pkgoa: 'live' });
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('calculator updates as admin previews', () => {
  it('shows the fresh air switches to the admin before they are activated', async () => {
    const { setAdminPreview } = await import('../src/siteConfig');
    PRO.unlocked = false; PRO.ducts = false;
    try {
      await act(async () => root.render(<ToastProvider><App key="upd" /></ToastProvider>));
      await act(async () => $('.workflow-step[data-step="3"]').click());
      expect($('#r-faLoad')).toBeNull();
      await act(async () => setAdminPreview(true));
      expect($('#r-faLoad')).toBeTruthy();
    } finally { await act(async () => setAdminPreview(false)); }
  });
});
