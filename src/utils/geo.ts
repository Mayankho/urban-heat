/**
 * Geodesic helpers for incremental distance accumulation.
 *
 * Distance is accumulated INCREMENTALLY as fixes arrive (one running float),
 * never by retaining the point array and summing later — that would violate the
 * Zero-RAM guardrail on a long transect.
 */

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean radius

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two WGS84 coordinates. */
export function haversineMeters(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number
): number {
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Minimum movement in metres before a segment counts toward total distance.
 *
 * Consumer GPS jitters by several metres while stationary. Without a floor, a
 * volunteer standing still logging a hotspot for two minutes would accrue
 * phantom distance and inflate the Screen 3.2 "Total Mapped" figure — which is a
 * number WAWA may cite publicly. 3 m is below a walking pace at 1 Hz sampling
 * but above typical stationary jitter.
 */
export const MIN_SEGMENT_METERS = 3;

/**
 * Upper bound on a plausible single segment, metres.
 *
 * A GPS glitch can teleport a fix across the city and add kilometres in one
 * step. At walking pace with fixes at most ~10 s apart (the staleness limit),
 * 250 m implies 25 m/s — impossible on foot, so we reject the segment as a
 * spike rather than corrupt the total.
 */
export const MAX_SEGMENT_METERS = 250;

/** True when a segment should be added to the running distance total. */
export function isPlausibleSegment(meters: number): boolean {
  return (
    Number.isFinite(meters) &&
    meters >= MIN_SEGMENT_METERS &&
    meters <= MAX_SEGMENT_METERS
  );
}
