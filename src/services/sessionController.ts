/**
 * Session orchestration — the one place that knows the correct START and STOP
 * ordering across SQLite, the foreground service, the BLE adapter, and the stores.
 *
 * Ordering is not incidental. Getting it wrong produces exactly the bugs this
 * architecture exists to prevent, so each step below states why it is where it is.
 */

import Constants from 'expo-constants';
import type { LocationSubscription } from 'expo-location';
import { createSession, finalizeSession } from '@/database/sessionsRepo';
import { defaultSessionName, useSessionStore } from '@/store/useSessionStore';
import { useTelemetryStore } from '@/store/useTelemetryStore';
import type { SensorTelemetryPacket } from '@/types/telemetry';
import { newId } from '@/utils/id';
import {
  getConnectedDeviceName,
  registerCallbacks,
  startSensorLink,
} from './bleAdapter';
import { startSimulator, stopSimulator } from './bleSimulator';
import {
  startBackgroundLocation,
  startForegroundWatcher,
  stopBackgroundLocation,
} from './locationService';
import { beginWriting, endWriting, onPositionFix, onTelemetryPacket } from './trekWriter';

/** Telemetry source for this session. */
export type SensorMode = 'hardware' | 'simulator';

let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let foregroundWatcher: LocationSubscription | null = null;
let activeMode: SensorMode = 'simulator';

const appVersion = Constants.expoConfig?.version ?? null;

/**
 * Wire the adapter's callbacks into the store and the writer.
 *
 * Called once at app start, not per session, so a reconnect mid-trek does not
 * need to re-register and cannot end up with two subscriptions writing duplicate
 * rows.
 */
export function initializeTelemetryPipeline(): void {
  registerCallbacks({
    onPacket: (packet: SensorTelemetryPacket) => onTelemetryPacket(packet),
    onStateChange: (state, deviceName) =>
      useTelemetryStore.getState().setConnection(state, deviceName),
    onError: (message) => {
      if (__DEV__) console.warn('[ble] ', message);
    },
  });
}

/** Connect to real hardware. Surfaces failure so Screen 1.3 can show it. */
export async function connectSensor(): Promise<{ ok: boolean; message?: string }> {
  try {
    await startSensorLink();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'BLE link failed.' };
  }
}

export interface StartSessionOptions {
  mode: SensorMode;
  campaignToken: string | null;
}

/**
 * Begin recording.
 *
 * STEP ORDER — each step depends on the previous one:
 *  1. Reset accumulators FIRST, so a stale average from a previous trek cannot
 *     leak into this one's rollups.
 *  2. Write the sessions row BEFORE any point can arrive — trek_points has a
 *     foreign key to it, and a process kill mid-trek must leave the already-
 *     written points attached to a real, recoverable parent.
 *  3. Mark the store recording, so the writer's session lookup succeeds.
 *  4. beginWriting() — compiles the prepared statement.
 *  5. Start the foreground service. This keeps the JS context alive (R-02) and
 *     must be running before we rely on background delivery.
 *  6. Start the telemetry source LAST. Nothing before this point can produce a
 *     packet, so no packet can arrive with the pipeline half-built.
 */
export async function startSession(options: StartSessionOptions): Promise<string> {
  const telemetry = useTelemetryStore.getState();
  const session = useSessionStore.getState();

  // 1
  telemetry.resetSession();

  // 2
  const sessionId = newId();
  const startedAtUtc = Date.now();
  activeMode = options.mode;

  createSession({
    id: sessionId,
    // Same helper the store uses, so a session the user never renames still reads
    // sensibly in the Screen 3.2 feed.
    name: defaultSessionName(startedAtUtc),
    campaignToken: options.campaignToken,
    privacy: 'public_muni',
    startedAtUtc,
    deviceName:
      options.mode === 'hardware' ? getConnectedDeviceName() ?? 'PL GT M201' : 'SIMULATOR',
    appVersion,
  });

  // 3
  session.beginSession(sessionId, startedAtUtc, options.campaignToken);

  // 4
  beginWriting();

  // 5
  await startBackgroundLocation(options.campaignToken);

  // Foreground watcher for immediate map/HUD response while the screen is on.
  // Both paths funnel into the same trekWriter, so there is one write path.
  foregroundWatcher = await startForegroundWatcher((location) => {
    onPositionFix({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracyMeters: location.coords.accuracy ?? null,
      capturedAtUtcMs: location.timestamp,
    });
  });

  // Elapsed-time ticker. A single interval updating one integer — deliberately
  // NOT derived from the packet stream, so the HUD clock keeps running and
  // visibly reflects reality even if the sensor link drops.
  elapsedTimer = setInterval(() => {
    const store = useTelemetryStore.getState();
    store.setElapsedSeconds(Math.floor((Date.now() - startedAtUtc) / 1000));
  }, 1000);

  // 6
  if (options.mode === 'simulator') {
    startSimulator({ onPacket: (packet) => onTelemetryPacket(packet) });
  }
  // In hardware mode the adapter subscription is already live from
  // connectSensor(); packets begin flowing into onTelemetryPacket via the
  // callbacks registered in initializeTelemetryPipeline().

  return sessionId;
}

/**
 * End recording — Screen 2.1's slide-to-end gesture.
 *
 * REVERSE ORDER of start: stop producers first so no packet can arrive after the
 * prepared statement is finalized, then flush the rollups, then release resources.
 */
export async function endSession(): Promise<void> {
  const telemetry = useTelemetryStore.getState();
  const session = useSessionStore.getState();
  const sessionId = session.activeSessionId;

  // Stop producers FIRST.
  if (activeMode === 'simulator') stopSimulator();

  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  foregroundWatcher?.remove();
  foregroundWatcher = null;

  await stopBackgroundLocation();

  // Flush rollups from the O(1) accumulators before releasing the writer.
  if (sessionId !== null) {
    const avgTempC =
      telemetry.tempSampleCount === 0 ? null : telemetry.tempSumC / telemetry.tempSampleCount;

    finalizeSession({
      id: sessionId,
      endedAtUtc: Date.now(),
      distanceMeters: telemetry.distanceMeters,
      avgTempC,
      maxTempC: telemetry.maxTempC,
      pointCount: telemetry.pointCount,
      hotspotCount: telemetry.hotspotCount,
    });
  }

  endWriting();

  // Clears isRecording but KEEPS activeSessionId — Screen 3.1 still needs it to
  // rename, set privacy, and upload the trek that just finished.
  session.endSession();

  // NOTE: the BLE link is deliberately left connected. A volunteer commonly walks
  // several transects in one outing, and tearing down the radio would force a
  // rescan every time.
}

/** Called on app teardown. */
export async function shutdownSession(): Promise<void> {
  stopSimulator();
  if (elapsedTimer !== null) clearInterval(elapsedTimer);
  elapsedTimer = null;
  foregroundWatcher?.remove();
  foregroundWatcher = null;
  await stopBackgroundLocation();
  endWriting();
}
