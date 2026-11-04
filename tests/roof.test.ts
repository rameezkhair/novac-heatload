import { describe, expect, it } from 'vitest';
import { PANELS, area, layout, roofOf, toLatLon, toLocal, winterNoonAltitude } from '../src/engine/roof';

/* a 40 m (east–west) × 20 m (north–south) roof in Dubai */
const ref: [number, number] = [25.2, 55.27];
const rect = (w: number, h: number) => [toLatLon(ref, 0, 0), toLatLon(ref, w, 0), toLatLon(ref, w, h), toLatLon(ref, 0, h)];

describe('roof layout', () => {
  it('measures the drawn roof', () => {
    const { pts } = toLocal(rect(40, 20));
    expect(area(pts)).toBeCloseTo(800, 0);
  });
  it('packs flat panels within the setback', () => {
    const L = layout(roofOf({ poly: rect(40, 20), panel: 'm10-144', tilt: 0, setback: 1, rowGap: 0, colGap: 0, orient: 'portrait' }))!;
    /* 38 m ÷ 1.134 m = 33 across, 18 m ÷ 2.278 m = 7 rows */
    expect(L.count).toBe(33 * 7);
    expect(L.kWp).toBeCloseTo(33 * 7 * 0.55, 9);
    expect(L.roofM2).toBeCloseTo(800, 0);
  });
  it('spaces tilted rows so they do not shade each other at winter-solstice noon', () => {
    const L = layout(roofOf({ poly: rect(40, 20), panel: 'm10-144', tilt: 20, setback: 1, rowGap: 0, colGap: 0 }))!;
    const t = 20 * Math.PI / 180, alt = winterNoonAltitude(25.2) * Math.PI / 180;
    expect(L.pitch).toBeCloseTo(2.278 * Math.cos(t) + 2.278 * Math.sin(t) / Math.tan(alt), 4);
    expect(L.azimuth).toBeCloseTo(180, 6);
    expect(L.count).toBeLessThan(33 * 7);
  });
  it('takes a custom panel size', () => {
    const L = layout(roofOf({ poly: rect(40, 20), panel: 'custom', cW: 1, cL: 2, cWp: 500, tilt: 0, setback: 0, rowGap: 0, colGap: 0 }))!;
    expect(L.count).toBe(40 * 10);
    expect(L.panel.wp).toBe(500);
    expect(PANELS.length).toBeGreaterThan(3);
  });
});
