/**
 * THE single unit-conversion boundary for the entire application.
 *
 * ARCHITECTURAL RULE (IMPLEMENTATION_PLAN.md §4.2)
 * -----------------------------------------------
 * CELSIUS is the canonical storage and transport unit. Fahrenheit is a
 * presentation-layer transform.
 *
 * Rationale: the mandated column is `ambient_temp_c` (docs/05), scientific
 * interchange and PostGIS expect SI, and a display toggle must never mutate
 * stored data — otherwise a user flipping Screen 3.3's °F/°C switch would appear
 * to rewrite history.
 *
 * If you find yourself writing `* 9 / 5` anywhere else in this codebase, stop.
 */

import type { TemperatureUnit } from '@/store/useSettingsStore';

/** Metres per statute mile — Screen 2.1 HUD renders "1.12 mi". */
const METERS_PER_MILE = 1609.344;

export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE;
}

/**
 * Convert a stored Celsius value into the user's chosen display unit.
 * Returns null for null input so callers can render an em dash rather than a
 * fabricated zero.
 */
export function toDisplayTemp(
  celsius: number | null,
  unit: TemperatureUnit
): number | null {
  if (celsius === null) return null;
  return unit === 'F' ? celsiusToFahrenheit(celsius) : celsius;
}

/**
 * Format a temperature for the HUD.
 *
 * Wireframe Screen 2.1 shows one decimal place ("96.4", "84.2"), so we match
 * that exactly. Missing data renders as an em dash — never "0.0", which would
 * read as a real measurement.
 */
export function formatTemp(
  celsius: number | null,
  unit: TemperatureUnit,
  fractionDigits = 1
): string {
  const value = toDisplayTemp(celsius, unit);
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(fractionDigits);
}

/** Unit suffix for display, e.g. "°F". */
export function unitSuffix(unit: TemperatureUnit): string {
  return unit === 'F' ? '°F' : '°C';
}

/** Screen 2.1 "Mapped Distance 1.12 mi". */
export function formatDistanceMiles(meters: number, fractionDigits = 2): string {
  if (!Number.isFinite(meters)) return '—';
  return metersToMiles(meters).toFixed(fractionDigits);
}

/**
 * Elapsed time as the wireframe renders it: "00:24" with ":15" as a smaller
 * suffix. Returns the parts separately so the HUD can style them independently
 * rather than parsing a formatted string back apart.
 */
export function formatElapsed(totalSeconds: number): {
  primary: string;
  seconds: string;
} {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  // Under an hour the wireframe reads MM:SS ("00:24:15" = 24 min 15 s), so the
  // primary block is HH:MM once we pass an hour and MM:SS before that.
  const primary = hours > 0 ? `${pad(hours)}:${pad(minutes)}` : `${pad(minutes)}:${pad(seconds)}`;
  const suffix = hours > 0 ? pad(seconds) : '';
  return { primary, seconds: suffix };
}

/** Screen 3.2 feed rows render compact durations like "24:15" / "41:02". */
export function formatDurationCompact(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
