// ---------------------------------------------------------------------------
// Fælles meteorologi og formatering for GEO Dugpunkt.
// Magnus-formlen med Sonntag90-konstanter, gyldig -45..60 °C over vand.
// Under 0 °C gælder kurven (underafkølet) vand, ikke is — standard i meteorologi.
// ---------------------------------------------------------------------------
const ALPHA = 6.112; // hPa
const BETA = 17.62;
const LAMBDA = 243.12; // °C

export const T_MIN = -45;
export const T_MAX = 60;

export function saturationVaporPressure(T) {
  // Ew = α · exp((β·T)/(λ+T))
  return ALPHA * Math.exp((BETA * T) / (LAMBDA + T));
}

export function absoluteHumidity(T) {
  // Idealgas: ρ = e·Mw / (R·Tk), e i Pa, Mw = 18.015 g/mol, R = 8.314 J/(mol·K)
  const e = saturationVaporPressure(T) * 100;
  return (e * 18.015) / (8.314 * (T + 273.15));
}

// Adiabatisk afkøling
export function dryAdiabaticLapseRate() {
  return 9.8; // °C/km
}

export function moistAdiabaticLapseRate(T) {
  // Våd adiabatisk lapse rate afhænger af temperatur (forenklet trinmodel)
  if (T >= 20) return 6.5;
  if (T >= 0) return 7.5;
  if (T >= -20) return 8.5;
  return 9.0; // °C/km
}

export function generateTemperatureArray() {
  const arr = [];
  for (let t = T_MIN; t <= T_MAX + 1e-9; t += 0.25) arr.push(parseFloat(t.toFixed(6)));
  return arr;
}

// ---------------------------------------------------------------------------
// Formatering — én decimal med dansk komma, og alle viste beregninger laves af
// de viste (afrundede) tal, så eleven altid kan reproducere regnestykket.
// ---------------------------------------------------------------------------
export const round1 = (x) => Math.round(x * 10) / 10;
export const fmt1 = (x) => round1(x).toFixed(1).replace(".", ",");
export const parseDa = (s) => parseFloat(String(s).replace(",", "."));
export const INPUT_RE = /^-?\d*[.,]?\d*$/; // tillader at skrive værdien færdig, komma eller punktum

export const DEFAULT_ZOOM = { x: [-10, 40], y: [0, 50] };

// Fagligt farvesystem: rød = lufttemperatur/maksimalt indhold, grøn = dugpunkt/
// faktisk indhold, mørkeblå = mætningskurve, lilla = RH, orange = tør adiabat.
// Tekstfarverne er mørkere varianter af hensyn til kontrast (WCAG).
export const COL = {
  curve: "#1e40af",
  fill: "rgba(59, 130, 246, 0.08)",
  red: "#ef4444",
  redText: "#b91c1c",
  green: "#10b981",
  greenText: "#047857",
  dark: "#1f2937",
  purple: "#7c3aed",
  orange: "#f59e0b",
  orangeText: "#b45309",
};
