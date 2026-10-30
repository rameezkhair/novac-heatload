/* Psychrometrics, pressure in kPa, humidity ratio in kg/kg dry air. */
export const pws = (T: number) => 0.61094 * Math.exp(17.625 * T / (T + 243.04));
export function W_rh(T: number, RH: number, P: number) { const pw = RH / 100 * pws(T); return 0.621945 * pw / (P - pw); }
export function W_wb(T: number, Twb: number, P: number) {
  const ps = pws(Twb), Ws = 0.621945 * ps / (P - ps);
  return ((2501 - 2.326 * Twb) * Ws - 1.006 * (T - Twb)) / (2501 + 1.86 * T - 4.186 * Twb);
}
export const hOf = (T: number, W: number) => 1.006 * T + W * (2501 + 1.86 * T);
export function rhOf(T: number, W: number, P: number) { const pw = W * P / (0.621945 + W); return pw / pws(T) * 100; }
export function wbOf(T: number, W: number, P: number) {
  let lo = -20, hi = T;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (W_wb(T, m, P) > W) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
export function dpOf(W: number, P: number) {
  const pw = Math.max(1e-6, W * P / (0.621945 + W)), a = Math.log(pw / 0.61094);
  return 243.04 * a / (17.625 - a);
}
/* ASHRAE Fundamentals standard atmosphere, elevation in m */
export const pressureAt = (z: number) => 101.325 * Math.pow(1 - 2.25577e-5 * z, 5.2559);

/* ASHRAE 55 PMV / PPD, ISO 7730 algorithm */
export function pmvOf(ta: number, tr: number, vel: number, rh: number, met: number, clo: number) {
  const pa = rh * 10 * Math.exp(16.6536 - 4030.183 / (ta + 235)), icl = 0.155 * clo, m = met * 58.15, mw = m;
  const fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl, hcf = 12.1 * Math.sqrt(Math.max(0, vel)), taa = ta + 273, tra = tr + 273;
  const tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1), p1 = icl * fcl, p2 = p1 * 3.96, p3 = p1 * 100, p4 = p1 * taa, p5 = 308.7 - 0.028 * mw + p2 * Math.pow(tra / 100, 4);
  let xn = tcla / 100, xf = tcla / 50, n = 0, hc = hcf;
  while (Math.abs(xn - xf) > 0.00015 && n < 150) {
    xf = (xf + xn) / 2; hc = Math.max(hcf, 2.38 * Math.pow(Math.abs(100 * xf - taa), 0.25));
    xn = (p5 + p4 * hc - p2 * Math.pow(xf, 4)) / (100 + p3 * hc); n++;
  }
  const tcl = 100 * xn - 273;
  const hl = 3.05e-3 * (5733 - 6.99 * mw - pa) + (mw > 58.15 ? 0.42 * (mw - 58.15) : 0) + 1.7e-5 * m * (5867 - pa) + 0.0014 * m * (34 - ta)
    + 3.96 * fcl * (Math.pow(xn, 4) - Math.pow(tra / 100, 4)) + fcl * hc * (tcl - ta);
  const pmv = (0.303 * Math.exp(-0.036 * m) + 0.028) * (mw - hl);
  return { pmv, ppd: 100 - 95 * Math.exp(-0.03353 * Math.pow(pmv, 4) - 0.2179 * pmv * pmv) };
}
