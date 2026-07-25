/**
 * TASK 1.3 — Zero-RAM Background Disk Sync + the approved G-03 fusion policy.
 *
 * ============================================================================
 *  THE FUSION POLICY (G-03, APPROVED)
 * ============================================================================
 * BLE notifies at 1 Hz; expo-location emits on its own satellite-dependent
 * cadence. Nothing in /docs specified how a temperature and a coordinate become
 * one row, so this is the approved decision:
 *
 *   • The BLE PACKET IS THE CLOCK. Each decoded 'ok' packet writes exactly one
 *     trek_points row. This makes the "1 Hz writing rule" literally true in the
 *     data — ~3,600 evenly-spaced rows per hour, which is what a scientific
 *     transect requires and what a GPS-driven cadence could never guarantee.
 *
 *   • Each row attaches the MOST RECENT GPS fix, held as a single mutable
 *     reference (one object, not a growing array).
 *
 *   • A fix older than GPS_FIX_STALENESS_LIMIT_MS (10 s) attaches NULL position
 *     rather than a misleading coordinate. Rows with NULL coordinates are the
 *     scientifically honest representation of a canopy dropout.
 *
 * ============================================================================
 *  THE ZERO-RAM CONTRACT (Guardrail 2 — 15 MB background ceiling)
 * ============================================================================
 * This module holds exactly TWO retained values, both fixed-size:
 *   1. `lastFix`      — one PositionFix object, overwritten in place
 *   2. `lastFixForDistance` — one {lat, lon} pair for incremental distance
 *
 * There is NO array of packets, NO array of points, NO batch buffer, NO pending
 * write queue. A packet arrives, is written synchronously to disk, and the
 * reference is dropped before the function returns. Memory use is identical for
 * a 10-minute walk and a 10-hour one.
 *
 * DO NOT add buffering "for performance". At 1 Hz there is no throughput problem
 * to solve, and a buffer is precisely the unbounded JS array the ceiling exists
 * to prevent.
 */

import { GPS_FIX_STALENESS_LIMIT_MS } from '@/config/bleConstants';
import { insertPoint, prepareWriter, releaseWriter } from '@/database/trekPointsRepo';
import { usePolylineStore } from '@/store/usePolylineStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useTelemetryStore } from '@/store/useTelemetryStore';
import type { PositionFix, SensorTelemetryPacket } from '@/types/telemetry';
import { haversineMeters, isPlausibleSegment } from '@/utils/geo';
import { newId } from '@/utils/id';

/** THE ONLY retained position state — overwritten in place, never appended to. */
let lastFix: PositionFix | null = null;

/** Previous fix used for distance accumulation. Separate from lastFix because a
 *  rejected jitter segment must not advance the distance anchor. */
let lastFixForDistance: { latitude: number; longitude: number } | null = null;

/** Guard so a stray late packet after endWriting() cannot write a row. */
let isWriting = false;

/** Call when recording starts, AFTER the session row exists in SQLite. */
export function beginWriting(): void {
  lastFix = null;
  lastFixForDistance = null;
  isWriting = true;
  prepareWriter();
}

/** Call when recording stops. Releases the prepared statement. */
export function endWriting(): void {
  isWriting = false;
  lastFix = null;
  lastFixForDistance = null;
  releaseWriter();
}

export function isWritingActive(): boolean {
  return isWriting;
}

/**
 * Record a GPS fix.
 *
 * Does NOT write a row — position only decorates the next telemetry-driven row,
 * per the fusion policy. Distance is accumulated incrementally here as a single
 * running float in the Zustand store.
 */
export function onPositionFix(fix: PositionFix): void {
  if (!isWriting) return;

  if (lastFixForDistance !== null) {
    const segment = haversineMeters(
      lastFixForDistance.latitude,
      lastFixForDistance.longitude,
      fix.latitude,
      fix.longitude
    );
    if (isPlausibleSegment(segment)) {
      useTelemetryStore.getState().addDistance(segment);
      lastFixForDistance = { latitude: fix.latitude, longitude: fix.longitude };
    }
    // Segment below the jitter floor: keep the old anchor so slow real movement
    // still accumulates across several fixes instead of being discarded each time.
    // Segment above the spike ceiling: also keep the old anchor, so one bad fix
    // cannot silently relocate the anchor and corrupt the next segment too.
  } else {
    lastFixForDistance = { latitude: fix.latitude, longitude: fix.longitude };
  }

  // Feed the BOUNDED display polyline. Decimation and the hard vertex cap live
  // in usePolylineStore, so this call cannot grow memory without limit.
  usePolylineStore.getState().addVertex({
    latitude: fix.latitude,
    longitude: fix.longitude,
    tempC: useTelemetryStore.getState().currentTempC,
  });

  // Overwrite in place. One object, forever.
  lastFix = fix;
}

/**
 * THE HOT PATH — called once per second for the whole session.
 *
 * Order matters: update the store first so the HUD reflects the reading even if
 * the disk write throws, then persist. A volunteer watching a live temperature is
 * a better failure mode than a frozen HUD hiding a working database.
 */
export function onTelemetryPacket(packet: SensorTelemetryPacket): void {
  const telemetry = useTelemetryStore.getState();

  // Non-'ok' packets are counted for diagnostics and DROPPED. A misparsed frame
  // must never reach the database — a plausible-but-wrong value is unrecoverable
  // scientific corruption, whereas a counted gap is visible and honest.
  if (packet.decode !== 'ok') {
    telemetry.noteDecodeFailure(packet.decode);
    return;
  }

  telemetry.ingest(packet);

  if (!isWriting) return;

  const sessionId = useSessionStore.getState().activeSessionId;
  if (sessionId === null) return;

  // Attach position only if the fix is fresh enough to be honest about.
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (lastFix !== null) {
    const age = packet.receivedAtUtcMs - lastFix.capturedAtUtcMs;
    if (age <= GPS_FIX_STALENESS_LIMIT_MS) {
      latitude = lastFix.latitude;
      longitude = lastFix.longitude;
    } else {
      telemetry.noteStaleFixDrop();
    }
  }

  try {
    // SYNCHRONOUS write straight to disk. When this returns, the row is durable
    // (WAL + synchronous=FULL) and nothing in JS retains the payload.
    insertPoint(
      newId(),
      sessionId,
      packet.receivedAtUtcMs,
      latitude,
      longitude,
      packet.ambientTempC,
      packet.humidityPct,
      packet.heatIndexC
    );
    telemetry.notePointWritten();
  } catch (e) {
    // A failed write must not kill the stream. Count it and keep going — losing
    // one row is far better than terminating a transect the volunteer walked
    // several miles to collect.
    telemetry.noteDecodeFailure('parse_error');
    if (__DEV__) console.warn('[trekWriter] insert failed', e);
  }
  // `packet` goes out of scope here. Nothing retains it. This is the Zero-RAM
  // guarantee in one line.
}

/** Most recent fix, for centring the map. Returns a copy so callers cannot
 *  mutate the single retained object. */
export function getLastFix(): PositionFix | null {
  return lastFix === null ? null : { ...lastFix };
}
