import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAll } from '../src/engine/calc';
import { W_wb } from '../src/engine/psychro';
import { exampleState } from '../src/engine/project';
import { Builder, finish, hoursIn, psychro, slotOf, when } from '../src/engine/weather/dataset';
import { toEpw } from '../src/engine/weather/epw';
import { NET, providerOf } from '../src/engine/weather/providers';
import { simulateYear, yearSummary } from '../src/engine/weather/simulate';
import { fakeOpenMeteo } from './weatherFixture';

const mockFetch = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
NET.spacing = 0; NET.backoff = 1;
afterEach(() => { vi.unstubAllGlobals(); });

describe('weather year', () => {
  it('has 8,760 or 8,784 hours and places records in local standard time, hour ending', () => {
    expect(hoursIn(2025)).toBe(8760); expect(hoursIn(2024)).toBe(8784); expect(hoursIn(2100)).toBe(8760); expect(hoursIn(2000)).toBe(8784);
    /* 01:00 Gulf Standard Time on 1 January is 21:00 UTC on 31 December: the first hour ends then */
    expect(slotOf(2025, 4, Date.UTC(2024, 11, 31, 21) / 1000, 'end')).toBe(0);
    expect(slotOf(2025, 4, Date.UTC(2024, 11, 31, 20) / 1000, 'end')).toBe(-1);
    expect(slotOf(2025, 4, Date.UTC(2024, 11, 31, 20) / 1000, 'start')).toBe(0);
    expect(slotOf(2025, 4, Date.UTC(2025, 11, 31, 20) / 1000, 'end')).toBe(8759);
    expect(when(2024, 59 * 24)).toMatchObject({ m: 1, d: 29, h: 1 });
    expect(when(2025, 8759)).toMatchObject({ m: 11, d: 31, h: 24 });
  });

  it('fills short gaps, rejects out-of-range values and records what it derived', () => {
    const b = new Builder({ provider: 'open-meteo', source: 's', attribution: 'a', lat: 25, lon: 55, elev: 0, tz: 4, year: 2025, label: 'x' });
    for (let i = 0; i < b.n; i++) { if (i >= 10 && i < 14) continue; b.put('db', i, i === 20 ? 99 : 30); b.put('dp', i, 20); }
    const wx = finish(b);
    expect(wx.n).toBe(8760);
    expect(wx.data.db!.every(Number.isFinite)).toBe(true);
    expect(wx.filled.db).toBe(5);
    expect(wx.derived.rh).toMatch(/dew point/);
    expect(wx.derived.p).toMatch(/standard atmosphere/);
    expect(wx.data.rh![0]).toBeCloseTo(55.0, 0);
    expect(wx.data.ghi).toBeUndefined();
    expect(() => finish(new Builder({ ...b.meta }))).toThrow(/dry bulb/);
  });

  it('computes psychrometrics from dry bulb, humidity and station pressure', () => {
    const b = new Builder({ provider: 'open-meteo', source: 's', attribution: 'a', lat: 25, lon: 55, elev: 0, tz: 4, year: 2025, label: 'x' });
    for (let i = 0; i < b.n; i++) { b.put('db', i, 46); b.put('rh', i, 20); b.put('p', i, 101325); }
    const s = psychro(finish(b));
    /* 46 °C, 20% RH at 101.325 kPa: pws 10.09 kPa, W = 0.621945 × 2.018 / (101.325 − 2.018) = 12.64 g/kg, h = 1.006 × 46 + W (2501 + 1.86 × 46) = 79.0 kJ/kg */
    expect(s.W[0] * 1000).toBeCloseTo(12.64, 1);
    expect(s.h[0]).toBeCloseTo(79.0, 0);
    /* the wet bulb gives back the same humidity ratio */
    expect(W_wb(46, s.wb[0], 101.325) * 1000).toBeCloseTo(12.64, 1);
  });

  it('downloads a leap year from Open-Meteo through the adapter', async () => {
    vi.stubGlobal('fetch', mockFetch(fakeOpenMeteo(2024)));
    const wx = await providerOf('open-meteo').fetch!({ provider: 'open-meteo', lat: 25.2048, lon: 55.2708, year: 2024 }, { elev: 5 });
    expect(wx.n).toBe(8784);
    expect(Object.keys(wx.filled)).toHaveLength(0);
    expect(wx.data.p![0]).toBe(101200);
    /* hour ending 13:00 holds the 12:00–13:00 radiation */
    expect(wx.data.ghi![12]).toBeGreaterThan(wx.data.ghi![8]);
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain('start_date=2023-12-31'); expect(url).toContain('end_date=2025-01-01'); expect(url).toContain('timeformat=unixtime');
  });

  it('retries server errors and reports the failure', async () => {
    const f = mockFetch({ reason: 'down' }, 503); vi.stubGlobal('fetch', f);
    const p = providerOf('open-meteo').fetch!({ provider: 'open-meteo', lat: 25, lon: 55, year: 2025 }, { elev: 5 });
    await expect(p).rejects.toThrow(/503/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('writes an EPW file for EnergyPlus', async () => {
    vi.stubGlobal('fetch', mockFetch(fakeOpenMeteo(2025)));
    const wx = await providerOf('open-meteo').fetch!({ provider: 'open-meteo', lat: 25.2048, lon: 55.2708, year: 2025, label: 'Dubai' }, { elev: 5 });
    const text = toEpw(wx), lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(8 + 8760);
    expect(lines[8].split(',')).toHaveLength(35);
    expect(lines[0]).toMatch(/^LOCATION,Dubai,-,UAE,open-meteo,999999,25.205,55.271,4.0,/);
    expect(Number(lines[8 + 4000].split(',')[6])).toBeCloseTo(wx.data.db![4000], 1);
    expect(Number(lines[8 + 4000].split(',')[14])).toBeCloseTo(wx.data.dni![4000], 0);
  });

  it('runs the heat balance on every hour of the year', async () => {
    const s = exampleState(), d = computeAll(s.project, s.rooms);
    const run = async (t: number) => {
      vi.stubGlobal('fetch', mockFetch(fakeOpenMeteo(2025, t)));
      const wx = await providerOf('open-meteo').fetch!({ provider: 'open-meteo', lat: 25.2048, lon: 55.2708, year: 2025 }, { elev: 5 });
      const Y = simulateYear(d, wx); return { Y, S: yearSummary(Y, wx) };
    };
    const hot = await run(46), mild = await run(36);
    expect(hot.Y.plant).toHaveLength(8760);
    expect(hot.Y.plant.every(x => x >= 0 && Number.isFinite(x))).toBe(true);
    expect(hot.S.peakW).toBeGreaterThan(mild.S.peakW);
    expect(hot.S.elecKWh).toBeGreaterThan(mild.S.elecKWh);
    /* at design-like weather the actual peak is of the order of the design plant load, which adds margins */
    expect(hot.S.peakW / d.T.plant).toBeGreaterThan(0.5);
    expect(hot.S.peakW / d.T.plant).toBeLessThan(1.2);
    expect(hot.S.months.reduce((a, m) => a + m.hours, 0)).toBe(8760);
  });
});

describe('climate charts', () => {
  it('draws the heatmap, psychrometric chart, sun path and wind rose from every hour', async () => {
    const { heatmapSVG, psychroCloudSVG, sunPathSVG, windRoseSVG } = await import('../src/components/ClimateCharts');
    vi.stubGlobal('fetch', mockFetch(fakeOpenMeteo(2025)));
    const wx = await providerOf('open-meteo').fetch({ provider: 'open-meteo', lat: 25.2048, lon: 55.2708, year: 2025 }, { elev: 5 });
    /* one cell per hour plus 40 legend steps */
    expect(heatmapSVG(wx, 'db').match(/<rect /g)).toHaveLength(8760 + 40);
    const psy = psychroCloudSVG(wx, [{ t: 46, w: 0.025, label: 'O design' }]);
    const hours = [...psy.matchAll(/: (\d+) h<\/title>/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(hours).toBe(8760);
    expect(psy).toContain('O design');
    /* roughly half the hours are in daylight at 25° N */
    const dots = (sunPathSVG(wx).match(/r="1.6"/g) || []).length;
    expect(dots).toBeGreaterThan(4000); expect(dots).toBeLessThan(4800);
    /* the synthetic wind is 3 m/s from 300°: one wedge, west-north-west */
    expect(windRoseSVG(wx).match(/class="cl-wedge"/g)).toHaveLength(1);
    expect(sunPathSVG(wx) + psy + windRoseSVG(wx)).not.toMatch(/NaN|undefined/);
  });
});
