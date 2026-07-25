/**
 * NOAA Rothfusz heat index — resolves IMPLEMENTATION_PLAN.md G-05.
 *
 * The `heat_index` column is mandated by docs/05 Task 1.1 but NO formula, unit,
 * or validity range is specified anywhere in the source documents. This module
 * is the explicit architectural decision:
 *
 *   • ALGORITHM — NOAA / US National Weather Service Rothfusz regression,
 *     including both the low-humidity and high-humidity adjustment terms. This
 *     is the defensible choice for a US environmental-justice dataset that a
 *     municipal Chief Heat Officer may audit.
 *
 *   • NATIVE UNITS — the regression is defined in °F and %RH. We convert stored
 *     °C to °F, evaluate, and convert the result back to °C for storage.
 *
 *   • VALIDITY FLOOR — Rothfusz is only valid at >= 80 °F. Below that the NWS
 *     uses a simple-average form. Rather than store a misleading number we
 *     return null, and the UI renders an em dash.
 *
 *   • MISSING HUMIDITY -> null. No substituted "typical Atlanta humidity"
 *     constant. A fabricated input produces a fabricated scientific claim, and
 *     this dataset exists to be trusted.
 *
 * Computed at WRITE time (not read time) so the CSV a partner receives contains
 * exactly the values the operator saw in the field.
 */

import { celsiusToFahrenheit, fahrenheitToCelsius } from './units';

/** Rothfusz validity floor in °F. Below this the regression is not applicable. */
export const HEAT_INDEX_VALID_FLOOR_F = 80;

/** Rothfusz regression coefficients (NWS Technical Attachment SR 90-23). */
const C1 = -42.379;
const C2 = 2.04901523;
const C3 = 10.14333127;
const C4 = -0.22475541;
const C5 = -6.83783e-3;
const C6 = -5.481717e-2;
const C7 = 1.22874e-3;
const C8 = 8.5282e-4;
const C9 = -1.99e-6;

/**
 * Full Rothfusz regression with NWS adjustments, in °F.
 * Exported for unit testing against published NWS reference values.
 */
export function heatIndexFahrenheit(tempF: number, rhPct: number): number {
  const T = tempF;
  const R = rhPct;

  let hi =
    C1 +
    C2 * T +
    C3 * R +
    C4 * T * R +
    C5 * T * T +
    C6 * R * R +
    C7 * T * T * R +
    C8 * T * R * R +
    C9 * T * T * R * R;

  // NWS low-humidity adjustment: applies for RH < 13% and 80 <= T <= 112 °F.
  if (R < 13 && T >= 80 && T <= 112) {
    hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  }

  // NWS high-humidity adjustment: applies for RH > 85% and 80 <= T <= 87 °F.
  if (R > 85 && T >= 80 && T <= 87) {
    hi += ((R - 85) / 10) * ((87 - T) / 5);
  }

  return hi;
}

/**
 * Compute heat index in CELSIUS from stored Celsius temperature and %RH.
 *
 * Returns null when:
 *   • humidity is unavailable (see G-04 — the PL GT M201 may not expose RH at all)
 *   • temperature is unavailable
 *   • either input is non-finite
 *   • humidity is outside 0–100
 *   • temperature is below the 80 °F Rothfusz validity floor
 *
 * Null is a first-class, meaningful result here. It means "not computable", which
 * is materially different from — and must never be rendered as — zero.
 */
export function computeHeatIndexC(
  ambientTempC: number | null,
  humidityPct: number | null
): number | null {
  if (ambientTempC === null || humidityPct === null) return null;
  if (!Number.isFinite(ambientTempC) || !Number.isFinite(humidityPct)) return null;
  if (humidityPct < 0 || humidityPct > 100) return null;

  const tempF = celsiusToFahrenheit(ambientTempC);
  if (tempF < HEAT_INDEX_VALID_FLOOR_F) return null;

  const hiF = heatIndexFahrenheit(tempF, humidityPct);
  if (!Number.isFinite(hiF)) return null;

  return fahrenheitToCelsius(hiF);
}
