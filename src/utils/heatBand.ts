/**
 * The Polyline Heat Array classifier — Brand Bible §2 Functional Data Tokens.
 *
 * RESOLVES G-07 (band boundary gaps)
 * ----------------------------------
 * The Brand Bible specifies bands as `< 75`, `75–84.9`, `85–94.9`, `95–104.9`,
 * `>= 105`. Read literally these leave undefined slivers — a reading of 84.95 °F
 * belongs to no band. We implement HALF-OPEN intervals so the classifier is
 * total and every possible reading maps to exactly one band.
 *
 * Classification always runs on FAHRENHEIT regardless of the user's display
 * toggle, so the polyline colour of a given transect is stable and comparable
 * across operators who have configured different display units.
 */

import { HEAT } from '@/config/theme';
import { celsiusToFahrenheit } from './units';

export type HeatBandKey = 'cool' | 'normal' | 'warn' | 'crit' | 'danger';

export interface HeatBand {
  readonly key: HeatBandKey;
  readonly label: string;
  readonly color: string;
  /** Inclusive lower bound in °F. -Infinity for the coolest band. */
  readonly minF: number;
  /** EXCLUSIVE upper bound in °F. +Infinity for the hottest band. */
  readonly maxF: number;
}

/** Ordered coolest → hottest. Intervals are [minF, maxF). */
export const HEAT_BANDS: readonly HeatBand[] = [
  { key: 'cool', label: 'Cool', color: HEAT.cool, minF: -Infinity, maxF: 75 },
  { key: 'normal', label: 'Baseline', color: HEAT.normal, minF: 75, maxF: 85 },
  { key: 'warn', label: 'Warning', color: HEAT.warn, minF: 85, maxF: 95 },
  { key: 'crit', label: 'Critical', color: HEAT.crit, minF: 95, maxF: 105 },
  { key: 'danger', label: 'Extreme Danger', color: HEAT.danger, minF: 105, maxF: Infinity },
] as const;

/**
 * UHI HOTSPOT THRESHOLD — resolves G-06 per approved product directive.
 *
 * "A 'UHI Hotspot' is defined by an absolute threshold counter. Any individual
 *  1Hz telemetry packet where the ambient temperature is >= 95°F (Critical Risk
 *  or Extreme Danger) increments the session hotspot counter by 1."
 *
 * 95 °F is exactly the `crit` band floor, so this captures both Critical Heat
 * and Extreme Danger, matching the directive's parenthetical. No spatial
 * clustering, no delta-above-mean — deliberately a live counter rather than a
 * post-processed statistic, so Screen 3.2's headline metric can update in-field.
 */
export const HOTSPOT_THRESHOLD_F = 95;

/** Classify a Fahrenheit reading into its band. Total over all finite inputs. */
export function bandForFahrenheit(tempF: number): HeatBand {
  for (const band of HEAT_BANDS) {
    if (tempF >= band.minF && tempF < band.maxF) return band;
  }
  // Unreachable for finite input: the first band's minF is -Infinity and the
  // last band's maxF is +Infinity, so the intervals cover the whole real line.
  // NaN falls through to here.
  return HEAT_BANDS[0]!;
}

/** Classify a stored Celsius reading. null input → null (render an em dash). */
export function bandForCelsius(tempC: number | null): HeatBand | null {
  if (tempC === null || !Number.isFinite(tempC)) return null;
  return bandForFahrenheit(celsiusToFahrenheit(tempC));
}

/** Convenience: colour for a stored Celsius reading, or the muted border colour. */
export function colorForCelsius(tempC: number | null, fallback: string): string {
  return bandForCelsius(tempC)?.color ?? fallback;
}

/**
 * Does this sample increment the session hotspot counter?
 * Operates on stored Celsius, compares in Fahrenheit — so the counter is
 * independent of the user's display-unit preference.
 */
export function isHotspotSample(ambientTempC: number | null): boolean {
  if (ambientTempC === null || !Number.isFinite(ambientTempC)) return false;
  return celsiusToFahrenheit(ambientTempC) >= HOTSPOT_THRESHOLD_F;
}
