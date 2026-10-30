import { describe, expect, it } from 'vitest';
import { evalArea } from '../src/engine/util';
import { W_wb, dpOf, pressureAt, wbOf } from '../src/engine/psychro';

describe('evalArea', () => {
  it('evaluates sums and products', () => {
    expect(evalArea('6*3.2 + 2.5*3.2')).toBe(27.2);
    expect(evalArea('4.5x3')).toBe(13.5);
    expect(evalArea('(10-1.2)*3')).toBe(26.4);
    expect(evalArea('12')).toBe(12);
    expect(evalArea('')).toBe('');
  });
  it('rejects anything that is not arithmetic', () => {
    expect(evalArea('alert(1)')).toBeNull();
    expect(evalArea('2*')).toBeNull();
    expect(evalArea('(2')).toBeNull();
    expect(evalArea('1-5')).toBeNull();
  });
});

describe('psychrometrics', () => {
  it('sea-level pressure and wet-bulb round trip', () => {
    expect(pressureAt(0)).toBeCloseTo(101.325, 3);
    const P = pressureAt(5), W = W_wb(46, 29, P);
    expect(W * 1000).toBeCloseTo(18.5, 0);
    expect(wbOf(46, W, P)).toBeCloseTo(29, 2);
    expect(dpOf(W, P)).toBeGreaterThan(22);
  });
});
