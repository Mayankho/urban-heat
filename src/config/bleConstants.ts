/**
 * Verified hardware coordinates — docs/04_Hardware_Emulation_Strategy.md.
 *
 * These four values are the ONLY hardware-specific strings in the codebase.
 * Swapping the PocketLab proxy for proprietary hardware means editing this file
 * and decodeFrame() in services/bleAdapter.ts. Nothing else moves.
 */

/** Advertised BLE device name. Scan filtering matches on this exactly.
 *  Note the wireframes display friendlier copy ("UH-Proxy-Sensor (PL Voyager)",
 *  "DS18B20") — those are presentation strings, this is the authoritative name. */
export const POCKETLAB_DEVICE_NAME = 'PL GT M201' as const;

/** Service UUID (docs/04, verified by field test). */
export const UH_SERVICE_UUID = 'F000AA11-0452-4000-B000-000000000000' as const;

/** Target Notification Characteristic (CCCD) — the 1 Hz telemetry stream. */
export const UH_NOTIFY_CHARACTERISTIC_UUID =
  'F000AA13-0452-4000-B000-000000000000' as const;

/** Fixed sampling rate. Screen 3.3 reports "Sampling Engine: 1.0 Hz Fixed". */
export const UH_SAMPLE_RATE_HZ = 1.0 as const;

/** Derived sample period in milliseconds (1000 ms at 1 Hz). */
export const UH_SAMPLE_PERIOD_MS = Math.round(1000 / UH_SAMPLE_RATE_HZ);

/**
 * Plausibility gate for decoded temperatures, degrees Celsius.
 *
 * The DS18B20-class probe the wireframes reference operates roughly -55..125 °C,
 * but for an urban pedestrian transect anything outside -40..85 °C is far more
 * likely to be a misparsed frame than real weather. Readings outside this window
 * are tagged 'out_of_range' and DROPPED rather than persisted, because a
 * plausible-looking but misparsed value is worse than a missing one.
 *
 * This gate is the main defence against G-01 (unknown byte layout) silently
 * producing garbage that looks like science.
 */
export const TEMP_PLAUSIBLE_MIN_C = -40 as const;
export const TEMP_PLAUSIBLE_MAX_C = 85 as const;

/** Relative humidity plausibility gate, percent. */
export const HUMIDITY_PLAUSIBLE_MIN_PCT = 0 as const;
export const HUMIDITY_PLAUSIBLE_MAX_PCT = 100 as const;

/**
 * How stale a GPS fix may be before trekWriter attaches NULL coordinates
 * instead of a misleading position. See IMPLEMENTATION_PLAN.md §5.3 R-03.
 *
 * 10 s ≈ one walking-pace GPS cycle: long enough to ride out a brief canopy
 * dropout along Proctor Creek, short enough that a pedestrian at ~1.4 m/s has
 * not moved more than ~14 m — inside the spatial resolution a sidewalk-scale UHI
 * transect can honestly claim.
 */
export const GPS_FIX_STALENESS_LIMIT_MS = 10_000 as const;

/** Scan timeout before we surface a "sensor not found" state on Screen 1.3. */
export const BLE_SCAN_TIMEOUT_MS = 15_000 as const;

/**
 * UUID normalisation.
 *
 * react-native-ble-plx lowercases UUIDs internally on Android, so comparing a
 * library-returned characteristic UUID against the uppercase constants above
 * fails silently — notifications appear to simply never arrive, which is a
 * miserable thing to debug in the field. Every comparison goes through here.
 */
export function normalizeUuid(uuid: string): string {
  return uuid.trim().toLowerCase();
}

/** True when two UUIDs refer to the same attribute, regardless of casing. */
export function uuidEquals(a: string, b: string): boolean {
  return normalizeUuid(a) === normalizeUuid(b);
}
