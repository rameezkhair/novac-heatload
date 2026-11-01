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
  localStorage.clear(); location.hash = ''; PRO.unlocked = true;
  host = document.createElement('div'); document.body.appendChild(host);
  await act(async () => { root = createRoot(host); root.render(<ToastProvider><App /></ToastProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe('app', () => {
  it('keeps the Pro tools locked until Pro is unlocked', async () => {
    PRO.unlocked = false;
    await act(async () => root.render(<ToastProvider><App key="locked" /></ToastProvider>));
    expect($$('.workflow-step')).toHaveLength(5);
    const pro = $$('.workflow-pro .workflow-soon');
    expect(pro).toHaveLength(15);
    expect(pro.slice(0, 4).map(e => e.querySelector('.workflow-status')!.textContent)).toEqual(['Locked · coming soon', 'Locked · coming soon', 'Coming soon', 'Coming soon']);
    expect(pro.every(e => (e as HTMLButtonElement).disabled)).toBe(true);
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
    expect($$('.workflow-step')).toHaveLength(7);
    expect($('.workflow-step[data-step="0"]').getAttribute('aria-current')).toBe('step');
    expect($$('.workflow-step.is-complete')).toHaveLength(0);
    expect($$('.workflow-step .workflow-status').map(e => e.textContent)).toEqual(['In progress', 'Not started', 'Not started', 'Not started', 'Not started', 'Not started', 'Not started']);
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
    expect($('.workflow-step[data-step="4"] .workflow-status').textContent).toBe('Needs input');
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
    await act(async () => byText('button', 'Generate report').click());
    expect($('.rpt').textContent).toContain('ClientAcme Holdings');
    expect($('.rpt').textContent).toContain('ConsultantDesign Co');
    expect($('.rpt').textContent).toContain('ContractorBuild Co');
  });

  it('filters the ASHRAE assembly reference without changing project U-values', async () => {
    await act(async () => $('.workflow-step[data-step="2"]').click());
    const projectUWall = $<HTMLInputElement>('#p-uWall').value;
    await act(async () => setValue($('#assembly-zone'), '3'));
    await act(async () => setValue($('#assembly-surface'), 'Above-grade wall'));

    expect($$('.assembly-library tbody tr')).toHaveLength(4);
    expect(host.textContent).toContain('Above-grade wall · MassR-1.3 ci45 mm ci0.698 W/m²K');
    expect(host.textContent).not.toContain('Not specified');
    expect($<HTMLInputElement>('#p-uWall').value).toBe(projectUWall);
    expect(host.textContent).toContain('converted from the I-P edition');

    await act(async () => setValue($('#assembly-use'), 'residential'));
    expect(host.textContent).toContain('Above-grade wall · MassR-1.7 ci60 mm ci0.591 W/m²K');
    expect($<HTMLInputElement>('#p-uWall').value).toBe(projectUWall);
  });

  it('adds ASHRAE assemblies as a wall type and applies roof and floor values', async () => {
    await act(async () => $('.workflow-step[data-step="2"]').click());
    expect($<HTMLSelectElement>('#assembly-zone').value).toBe('0');
    await act(async () => $('button[aria-label="Add as wall type: Above-grade wall Steel-framed"]').click());
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 name"]').value).toBe('ASHRAE 90.1-2022 CZ0 steel-framed (nonresidential), 80 mm Extruded polystyrene');
    /* thickness follows the chosen insulation: R-2.3 with EPS (λ 0.038) needs 90 mm */
    await act(async () => setValue($('#assembly-ins'), 'eps'));
    expect(host.textContent).toContain('Above-grade wall · Steel-framedR-2.390 mm0.704 W/m²K');
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 U-value"]').value).toBe('0.704');
    await act(async () => $('button[aria-label="Use as roof U: Roof Attic and other"]').click());
    expect($<HTMLInputElement>('#p-uRoof').value).toBe('0.153');
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
    /* the total shows the same detail as a room: compliance, fresh air breakdown, components and the hourly profile */
    ['Sensible heat ratio', 'Supply air (ΔT', 'People', 'Fresh air cooling load', 'Per 100 L/s', 'Glass, solar', 'Room total', 'Building room load by hour']
      .forEach(t => expect($('.result').textContent).toContain(t));
    expect($$('.plant-rooms tbody tr')).toHaveLength($$('.ritem').length);
    await act(async () => $('.plant-rooms .linkish').click());
    expect($('#r-area')).not.toBeNull();
    expect($('.rtotal').getAttribute('aria-current')).toBe('false');
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
    await act(async () => setValue($('#uvb-preset'), 'w-aac'));
    expect($('.uvb-u').textContent).toContain('0.68 W/m²K');
    await act(async () => byText('button', '+ Add layer').click());
    await act(async () => setValue($('select[aria-label="Layer 4 material"]'), 'eps'));
    await act(async () => setValue($('input[aria-label="Layer 4 thickness"]'), '25'));
    const u = $('.uvb-u').textContent!.match(/\d+\.\d+/)![0];
    await act(async () => byText('button', 'Save as external wall type').click());
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 name"]').value).toBe('200 mm AAC block, plastered both sides');
    expect($<HTMLInputElement>('input[aria-label="external wall type 1 U-value"]').value).toBe(u);
  });

  it('uses the heat balance method throughout the calculator', async () => {
    await act(async () => $('.workflow-step[data-step="3"]').click());
    expect(host.textContent).toMatch(/Peak on [A-Z][a-z]{2} 21 at \d\d:00/);
    expect($('.hb-chart svg')).not.toBeNull();
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
    expect($('.hb-chart svg')).not.toBeNull();
    await act(async () => $('.workflow-step[data-step="4"]').click());
    expect(plantTR()).toBe(hb);
    expect(['3', '4'].map(i => $('.workflow-step[data-step="' + i + '"] .workflow-status').textContent)).toEqual(['Complete', 'In progress']);
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

  it('renders the report', async () => {
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
    const names = ['a.novac.html', 'b.novac.html'];
    (window as any).showSaveFilePicker = async () => { const n = names[picked.length]; picked.push(n); return handle(n); };
    try {
      const save = async (as = false) => {
        await act(async () => byText('button', 'Projects ▾').click());
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
    await act(async () => $('.workflow-step[data-step="6"]').click());
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
    await act(async () => $('.workflow-step[data-step="6"]').click());
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
    /* move a room off the floor from its editor */
    await act(async () => ($$('.rfloor')[1].querySelector('.ritem') as HTMLElement).click());
    await act(async () => setValue($('#r-level'), ''));
    expect(byText('.rfloor-h .nm', 'Not on a floor')).toBeTruthy();
    /* delete the second floor (now empty), then the first with its rooms */
    await act(async () => $$('.rfloor-h')[1].click());
    const del = () => byText('.floor-btns .btn.danger', 'Delete floor') ?? byText('.floor-btns .btn.danger', 'Click again to delete');
    await act(async () => del().click()); await act(async () => $('.floor-btns .btn.danger').click());
    expect($$('.rfloor-h .nm').map(e => e.textContent)).toEqual(['First floor ×3', 'Not on a floor']);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
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
    expect($<HTMLAnchorElement>('.support a[href*="github.com"]').href).toContain('/issues');
    await act(async () => byText('button', 'Open the Library').click());
    expect(link('Library').getAttribute('aria-pressed')).toBe('true');
    await act(async () => byText('button', 'Back to calculator').click());
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
