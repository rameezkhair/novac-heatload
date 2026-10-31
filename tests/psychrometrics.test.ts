import { describe, expect, it } from 'vitest';
import {
  dewPointTemperature,
  humidityRatioFromDryBulbAndRelativeHumidity,
  moistAirDensity,
  moistAirEnthalpy,
  relativeHumidityFromHumidityRatio,
  specificVolume,
  vapourPressure,
  wetBulbTemperature,
} from '../src/engineering/psychrometrics.js';

describe('NOVAC PsychroLib SI interface', () => {
  it('matches PsychroLib published SI example and reference state values', () => {
    const P = 101325;
    const W = humidityRatioFromDryBulbAndRelativeHumidity(25, 80, P);
    // PsychroLib's published example: 25 °C DB, 80% RH -> 21.309397 °C dew point.
    expect(dewPointTemperature(25, 80)).toBeCloseTo(21.309397163661785, 5);
    expect(W).toBeCloseTo(0.01596182434, 9);
    expect(wetBulbTemperature(25, 80, P)).toBeCloseTo(22.38026666, 5);
    expect(moistAirEnthalpy(25, W)).toBeCloseTo(65.81274751, 5);
    expect(specificVolume(25, W, P)).toBeCloseTo(0.866301184, 6);
    expect(moistAirDensity(25, W, P)).toBeCloseTo(1.172758208, 6);
    expect(vapourPressure(25, 80)).toBeCloseTo(2535.373176, 3);
    expect(relativeHumidityFromHumidityRatio(25, W, P)).toBeCloseTo(80, 8);
  });

  it('uses caller supplied atmospheric pressure', () => {
    const seaLevel = humidityRatioFromDryBulbAndRelativeHumidity(25, 80, 101325);
    const highElevation = humidityRatioFromDryBulbAndRelativeHumidity(25, 80, 80000);
    expect(highElevation).toBeGreaterThan(seaLevel);
    expect(highElevation).toBeCloseTo(0.0203559061, 8);
  });

  it('rejects invalid and physically inconsistent states', () => {
    expect(() => humidityRatioFromDryBulbAndRelativeHumidity(25, 80, 0)).toThrow(/pressure/i);
    expect(() => humidityRatioFromDryBulbAndRelativeHumidity(25, 101, 101325)).toThrow(/humidity/i);
    expect(() => wetBulbTemperature(20, 80, 101325)).not.toThrow();
    expect(() => relativeHumidityFromHumidityRatio(20, 0.03, 101325)).toThrow(/supersaturated/i);
    expect(() => moistAirEnthalpy(Number.NaN, 0.01)).toThrow(/finite/i);
  });
});
