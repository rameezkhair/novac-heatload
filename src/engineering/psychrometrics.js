import psychrolib from './psychrolib.js';

// PsychroLib is stateful for unit selection; configure the single shared
// instance once before exposing any calculations.
psychrolib.SetUnitSystem(psychrolib.SI);

const GetHumRatioFromRelHum = psychrolib.GetHumRatioFromRelHum.bind(psychrolib);
const GetTDewPointFromRelHum = psychrolib.GetTDewPointFromRelHum.bind(psychrolib);
const GetTWetBulbFromRelHum = psychrolib.GetTWetBulbFromRelHum.bind(psychrolib);
const GetMoistAirEnthalpy = psychrolib.GetMoistAirEnthalpy.bind(psychrolib);
const GetMoistAirVolume = psychrolib.GetMoistAirVolume.bind(psychrolib);
const GetVapPresFromRelHum = psychrolib.GetVapPresFromRelHum.bind(psychrolib);
const GetSatVapPres = psychrolib.GetSatVapPres.bind(psychrolib);
const GetRelHumFromHumRatio = psychrolib.GetRelHumFromHumRatio.bind(psychrolib);
const GetHumRatioFromTWetBulb = psychrolib.GetHumRatioFromTWetBulb.bind(psychrolib);
const GetTWetBulbFromHumRatio = psychrolib.GetTWetBulbFromHumRatio.bind(psychrolib);
const GetTDewPointFromHumRatio = psychrolib.GetTDewPointFromHumRatio.bind(psychrolib);

const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
  return value;
};
const temperature = (value, name = 'Temperature') => {
  finite(value, name);
  if (value < -100 || value > 200) throw new RangeError(`${name} must be between -100 and 200 °C`);
  return value;
};
const pressure = (value) => {
  finite(value, 'Atmospheric pressure');
  if (value <= 0 || value > 2_000_000) throw new RangeError('Atmospheric pressure must be greater than 0 and at most 2,000,000 Pa');
  return value;
};
const relativeHumidity = (value) => {
  finite(value, 'Relative humidity');
  if (value < 0 || value > 100) throw new RangeError('Relative humidity must be between 0 and 100%');
  return value;
};
const humidityRatio = (value) => {
  finite(value, 'Humidity ratio');
  if (value < 0) throw new RangeError('Humidity ratio must be non-negative');
  return value;
};
const ensureUnsaturated = (T, W, P) => {
  const rh = GetRelHumFromHumRatio(T, W, P);
  if (!Number.isFinite(rh) || rh > 1 + 1e-8) throw new RangeError('The supplied air state is supersaturated at this temperature and pressure');
};

/** Humidity ratio [kg/kg dry air] from dry-bulb temperature [°C], RH [%], and pressure [Pa]. */
export function humidityRatioFromDryBulbAndRelativeHumidity(dryBulbC, rhPercent, pressurePa) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), rh = relativeHumidity(rhPercent) / 100, P = pressure(pressurePa);
  const W = GetHumRatioFromRelHum(T, rh, P);
  if (!Number.isFinite(W) || W < 0) throw new RangeError('These conditions do not produce a valid humidity ratio');
  return W;
}

/** Humidity ratio [kg/kg dry air] from dry-bulb and wet-bulb temperatures [°C] and pressure [Pa]. */
export function humidityRatioFromDryAndWetBulb(dryBulbC, wetBulbC, pressurePa) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), Tw = temperature(wetBulbC, 'Wet-bulb temperature'), P = pressure(pressurePa);
  if (Tw > T) throw new RangeError('Wet-bulb temperature cannot exceed dry-bulb temperature');
  const W = GetHumRatioFromTWetBulb(T, Tw, P);
  if (!Number.isFinite(W) || W < 0) throw new RangeError('These conditions do not produce a valid humidity ratio');
  return W;
}

/** Dew point [°C] from dry-bulb temperature [°C] and RH [%]. */
export function dewPointTemperature(dryBulbC, rhPercent) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), rh = relativeHumidity(rhPercent) / 100;
  if (rh === 0) throw new RangeError('Dew point is undefined at 0% relative humidity');
  return GetTDewPointFromRelHum(T, rh);
}

/** Dew point [°C] from dry-bulb temperature [°C], humidity ratio [kg/kg], and pressure [Pa]. */
export function dewPointFromHumidityRatio(dryBulbC, humidityRatioKgKg, pressurePa) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), W = humidityRatio(humidityRatioKgKg), P = pressure(pressurePa);
  if (W === 0) throw new RangeError('Dew point is undefined for zero humidity ratio');
  ensureUnsaturated(T, W, P);
  return GetTDewPointFromHumRatio(T, W, P);
}

/** Wet-bulb temperature [°C] from dry-bulb temperature [°C], RH [%], and pressure [Pa]. */
export function wetBulbTemperature(dryBulbC, rhPercent, pressurePa) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), rh = relativeHumidity(rhPercent) / 100, P = pressure(pressurePa);
  if (rh === 0) throw new RangeError('Wet-bulb temperature is undefined at 0% relative humidity');
  return GetTWetBulbFromRelHum(T, rh, P);
}

/** Wet-bulb temperature [°C] from dry-bulb temperature [°C], humidity ratio [kg/kg], and pressure [Pa]. */
export function wetBulbFromHumidityRatio(dryBulbC, humidityRatioKgKg, pressurePa) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), W = humidityRatio(humidityRatioKgKg), P = pressure(pressurePa);
  ensureUnsaturated(T, W, P);
  return GetTWetBulbFromHumRatio(T, W, P);
}

/** Moist-air enthalpy [kJ/kg dry air] from dry-bulb temperature [°C] and humidity ratio [kg/kg]. */
export function moistAirEnthalpy(dryBulbC, humidityRatioKgKg) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), W = humidityRatio(humidityRatioKgKg);
  return GetMoistAirEnthalpy(T, W) / 1000;
}

/** Specific volume [m³/kg dry air] from temperature [°C], humidity ratio [kg/kg], and pressure [Pa]. */
export function specificVolume(dryBulbC, humidityRatioKgKg, pressurePa) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), W = humidityRatio(humidityRatioKgKg), P = pressure(pressurePa);
  ensureUnsaturated(T, W, P);
  return GetMoistAirVolume(T, W, P);
}

/** Moist-air density [kg moist air/m³] from temperature [°C], humidity ratio [kg/kg], and pressure [Pa]. */
export function moistAirDensity(dryBulbC, humidityRatioKgKg, pressurePa) {
  const W = humidityRatio(humidityRatioKgKg);
  return (1 + W) / specificVolume(dryBulbC, W, pressurePa);
}

/** Vapour partial pressure [Pa] from dry-bulb temperature [°C] and RH [%]. */
export function vapourPressure(dryBulbC, rhPercent) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), rh = relativeHumidity(rhPercent) / 100;
  return GetVapPresFromRelHum(T, rh);
}

/** Saturation vapour pressure [Pa] at temperature [°C]. */
export function saturationVapourPressure(dryBulbC) {
  return GetSatVapPres(temperature(dryBulbC));
}

/** Relative humidity [%] from dry-bulb temperature [°C], humidity ratio [kg/kg], and pressure [Pa]. */
export function relativeHumidityFromHumidityRatio(dryBulbC, humidityRatioKgKg, pressurePa) {
  const T = temperature(dryBulbC, 'Dry-bulb temperature'), W = humidityRatio(humidityRatioKgKg), P = pressure(pressurePa);
  ensureUnsaturated(T, W, P);
  return GetRelHumFromHumRatio(T, W, P) * 100;
}
