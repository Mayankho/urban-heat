/**
 * Background location + the typed foreground service.
 *
 * The persistent notification configured here IS Wireframe Screen 2.2
 * ("Background Screen Ledger" — "Continuous background thread secured"). On
 * Android it is not decoration: it is the legal and technical precondition for a
 * foreground service, and it is the user-visible proof of the un-killable stream
 * the product promises.
 *
 * The service's foregroundServiceType is patched to `location|connectedDevice` by
 * plugins/withUrbanHeatForegroundService.js — see IMPLEMENTATION_PLAN.md §6.3.
 */

import * as Location from 'expo-location';
import { FOREGROUND_SERVICE_NOTIFICATION } from '@/config/complianceCopy';
import { UH_SAMPLE_PERIOD_MS } from '@/config/bleConstants';
import { BACKGROUND_LOCATION_TASK } from './backgroundLocationTask';

/**
 * Distance filter in metres.
 *
 * 0 would deliver every fix the chipset produces and burn battery for no
 * scientific gain. 5 m is finer than the sidewalk-scale resolution a pedestrian
 * UHI transect can honestly claim, so it loses nothing, and combined with
 * timeInterval it keeps fixes flowing while a volunteer pauses at a hotspot.
 */
const DISTANCE_INTERVAL_METERS = 5;

/**
 * Foreground-service notification.
 *
 * Copy comes from Wireframe Screen 2.2. The temperature substitution is
 * deliberately NOT wired to the 1 Hz stream: updating an Android notification
 * every second is a battery and system-log disaster, and Android throttles rapid
 * notification updates anyway. The notification carries the static assurance; the
 * HUD carries the live number.
 */
function buildNotificationBody(campaignLabel: string | null): string {
  const campaign = campaignLabel ?? FOREGROUND_SERVICE_NOTIFICATION.fallbackCampaign;
  return FOREGROUND_SERVICE_NOTIFICATION.bodyTemplate
    .replace('{campaign}', campaign)
    .replace('{temp}', 'logging at 1 Hz');
}

export async function startBackgroundLocation(campaignLabel: string | null): Promise<void> {
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );
  if (alreadyRunning) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: UH_SAMPLE_PERIOD_MS,
    distanceInterval: DISTANCE_INTERVAL_METERS,

    // Android: this is what actually creates the foreground service and keeps the
    // JS context resident so BLE and GPS can be fused in one realm (R-02).
    foregroundService: {
      notificationTitle: FOREGROUND_SERVICE_NOTIFICATION.title,
      notificationBody: buildNotificationBody(campaignLabel),
      notificationColor: '#E74C3C', // --danger, the brand accent
      killServiceOnDestroy: false, // survive task-swipe; see stopWithTask=false
    },

    // Deliver fixes as they arrive rather than in deferred batches. Batching would
    // break the fusion policy: a temperature sample can only be decorated with a
    // fix the writer has already seen.
    deferredUpdatesInterval: 0,
    deferredUpdatesDistance: 0,

    // Android 12+ shows this in the location-access indicator.
    pausesUpdatesAutomatically: false,
  });
}

export async function stopBackgroundLocation(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (!running) return;
  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

/**
 * One-shot fix for centring the map on the Launchpad before recording starts.
 * Uses Balanced accuracy — we need a neighbourhood, not a sidewalk, and
 * BestForNavigation would spin up the GPS radio for a map preview.
 */
export async function getCurrentPositionOnce(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    return null;
  }
}

/**
 * Foreground-only watcher, used while the Live screen is visible.
 *
 * Rationale: the background task is the durable path, but on some OEM ROMs the
 * first background fix can lag by tens of seconds after the service starts. A
 * foreground watcher gives the HUD and map something immediate while the volunteer
 * is still looking at the screen, and both funnel into the same trekWriter, so
 * there is exactly one write path regardless of which source fires.
 */
export async function startForegroundWatcher(
  onFix: (location: Location.LocationObject) => void
): Promise<Location.LocationSubscription | null> {
  try {
    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: UH_SAMPLE_PERIOD_MS,
        distanceInterval: DISTANCE_INTERVAL_METERS,
      },
      onFix
    );
  } catch {
    return null;
  }
}
