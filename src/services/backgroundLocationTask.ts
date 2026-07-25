/**
 * Background location TaskManager registration.
 *
 * ============================================================================
 *  R-02 — THE HEADLESS CONTEXT COLLISION (the subtle one)
 * ============================================================================
 * expo-location can deliver fixes into a HEADLESS JS context — a context where
 * the react-native-ble-plx Device object and its active notification
 * subscription DO NOT EXIST. If the location handler ran headless while the BLE
 * handler ran in the app context, the two streams would live in different JS
 * realms and could never be fused into a single trek_points row.
 *
 * OUR DESIGN: ONE PROCESS, ONE JS CONTEXT, KEPT ALIVE BY ONE FOREGROUND SERVICE.
 * The `location` foreground service (whose persistent notification is Wireframe
 * Screen 2.2) keeps the app process and its JS context resident, so BLE
 * notifications and GPS fixes are handled in the SAME context and can be fused.
 *
 * This task is therefore a THIN FORWARDER into trekWriter, and it is written to
 * be DEFENSIVE about running headless: if the writer is not active (because this
 * really is a fresh headless context), it does not crash and it does not
 * fabricate a row it cannot attach to a session — it returns quietly. Losing a
 * position decoration is recoverable; crashing the background task ends the trek.
 *
 * IMPORTANT: this module is imported for its SIDE EFFECT (defineTask) and must be
 * imported exactly once, at app entry, BEFORE any startLocationUpdatesAsync call.
 * TaskManager requires the task to be defined in the global scope at startup so
 * it can be re-registered when the OS revives the process.
 */

import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { isWritingActive, onPositionFix } from './trekWriter';

export const BACKGROUND_LOCATION_TASK = 'urban-heat-background-location';

interface LocationTaskData {
  locations: LocationObject[];
}

// TaskManager's executor signature requires a Promise return, so this is async
// even though every operation inside it is synchronous by design — the whole
// point of the Zero-RAM path is that the disk write completes before we return.
TaskManager.defineTask<LocationTaskData>(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      if (__DEV__) console.warn('[bgLocation] task error', error.message);
      return;
    }

    const locations = data?.locations;
    if (!locations || locations.length === 0) return;

    // Defensive: a genuinely headless revival has no active writer and no active
    // session. Dropping the fix is correct — there is nothing to attach it to.
    if (!isWritingActive()) {
      if (__DEV__) {
        console.log(
          `[bgLocation] ${locations.length} fix(es) with no active writer — ` +
            'likely a headless revival. Dropping.'
        );
      }
      return;
    }

    // The OS may batch several fixes. Forward each in order so distance
    // accumulates correctly; only the last one ends up as `lastFix`.
    for (const location of locations) {
      onPositionFix({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy ?? null,
        capturedAtUtcMs: location.timestamp,
      });
    }
  }
);
