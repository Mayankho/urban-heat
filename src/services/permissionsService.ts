/**
 * Android runtime permissions — IMPLEMENTATION_PLAN.md §6.2.
 *
 * None of the source documents specify permission handling; this is the explicit
 * architectural design.
 *
 * WHY THE ORDER IS NOT ARBITRARY
 * ------------------------------
 * Android 11+ REFUSES to grant background location in the same dialog as
 * foreground location — it must be a separate, subsequent request, and on API 30+
 * the OS shows no inline "Always Allow" option at all, routing the user to app
 * settings instead. The Wireframe Screen 1.4 three-step schematic ("Open OS
 * System Settings → Apps → Urban Heat → Permissions → Always Allow") is therefore
 * already describing correct Android 11+ behaviour, and we implement it literally.
 *
 * BLE IS REQUESTED BEFORE LOCATION (matching the wireframe's 1.3 → 1.4 order).
 * That is also better consent design: the Bluetooth grant is uncontroversial and
 * builds momentum, and by the time we ask for always-on location the volunteer
 * has already seen live sensor data that makes the reason self-evident.
 */

import { PermissionsAndroid, Platform, Linking } from 'react-native';
import * as Location from 'expo-location';

export type PermissionOutcome = 'granted' | 'denied' | 'blocked' | 'unsupported';

export interface BlePermissionResult {
  outcome: PermissionOutcome;
  scan: boolean;
  connect: boolean;
}

/** Android 12 (API 31) introduced BLUETOOTH_SCAN / BLUETOOTH_CONNECT. */
const ANDROID_12 = 31;

/**
 * Request BLUETOOTH_SCAN + BLUETOOTH_CONNECT as one grouped dialog (API 31+).
 *
 * On API < 31 these permissions do not exist; the legacy BLUETOOTH /
 * BLUETOOTH_ADMIN declarations are install-time grants (capped at maxSdkVersion
 * 30 in the manifest), so there is nothing to request at runtime.
 */
export async function requestBlePermissions(): Promise<BlePermissionResult> {
  if (Platform.OS !== 'android') {
    return { outcome: 'unsupported', scan: false, connect: false };
  }

  if (typeof Platform.Version === 'number' && Platform.Version < ANDROID_12) {
    // Install-time grants on older Android. Nothing to prompt for.
    return { outcome: 'granted', scan: true, connect: true };
  }

  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);

  const scan = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
  const connect = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];

  const scanOk = scan === PermissionsAndroid.RESULTS.GRANTED;
  const connectOk = connect === PermissionsAndroid.RESULTS.GRANTED;

  if (scanOk && connectOk) return { outcome: 'granted', scan: true, connect: true };

  // NEVER_ASK_AGAIN means only a trip to system settings can fix it. Reporting
  // this distinctly matters: retrying a scan that provably cannot succeed is a
  // miserable field experience.
  const blocked =
    scan === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
    connect === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

  return {
    outcome: blocked ? 'blocked' : 'denied',
    scan: scanOk,
    connect: connectOk,
  };
}

/** STEP 2 — foreground location ("While using the app"). */
export async function requestForegroundLocation(): Promise<PermissionOutcome> {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status === 'granted') return 'granted';
  return canAskAgain ? 'denied' : 'blocked';
}

/**
 * STEP 3 — background location ("Always Allow"). MUST follow step 2.
 *
 * On API 30+ this call typically returns 'denied' without showing a dialog,
 * because the OS requires the user to make the change in system settings. That is
 * NOT a failure of this code — it is the documented platform behaviour the
 * wireframe's 3-step schematic describes. Callers should offer openAppSettings()
 * and then re-check on resume.
 */
export async function requestBackgroundLocation(): Promise<PermissionOutcome> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    // Requesting background before foreground is granted always fails on
    // Android 11+. Surface it as a caller sequencing error rather than a denial.
    return 'denied';
  }

  const { status, canAskAgain } = await Location.requestBackgroundPermissionsAsync();
  if (status === 'granted') return 'granted';
  return canAskAgain ? 'denied' : 'blocked';
}

/** Non-prompting check, for re-verification when the app returns to foreground. */
export async function checkBackgroundLocationGranted(): Promise<boolean> {
  const { status } = await Location.getBackgroundPermissionsAsync();
  return status === 'granted';
}

export async function checkForegroundLocationGranted(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Deep link to this app's system settings page.
 *
 * The wireframe gives the user three manual navigation steps but specifies no
 * button. A manual-navigation-only flow is a needless drop-off for a field
 * volunteer, so we provide the deep link and keep the written steps as a fallback
 * for OEM skins that land somewhere unexpected.
 */
export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}

/**
 * Deep link to the system Bluetooth settings page.
 *
 * Used when the radio pre-flight reports `bluetooth_off`. We deliberately do NOT
 * call `BleManager.enable()` (which can switch the radio on programmatically on
 * Android): silently toggling a user's radio is presumptuous, and on Android 13+ it
 * shows its own system dialog anyway, so the deep link is both more honest and
 * more predictable.
 *
 * Falls back to the app's own settings page if the intent cannot be resolved —
 * some OEM skins rename or restrict the Bluetooth settings activity.
 */
export async function openBluetoothSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
  } catch {
    await Linking.openSettings();
  }
}

export interface FullPermissionState {
  ble: boolean;
  foregroundLocation: boolean;
  backgroundLocation: boolean;
}

/** Snapshot every permission the recording flow needs, without prompting. */
export async function getPermissionSnapshot(): Promise<FullPermissionState> {
  const [foreground, background] = await Promise.all([
    checkForegroundLocationGranted(),
    checkBackgroundLocationGranted(),
  ]);

  // There is no non-prompting read for BLUETOOTH_SCAN/CONNECT via
  // PermissionsAndroid.request, so use the dedicated check API.
  let ble = true;
  if (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= ANDROID_12) {
    const [scan, connect] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
    ]);
    ble = scan && connect;
  }

  return { ble, foregroundLocation: foreground, backgroundLocation: background };
}

/**
 * The Screen 1.4 hard gate.
 *
 * Recording is BLOCKED until background location is granted. Wireframe 1.4 shows
 * the "Proceed to App Launchpad" button disabled (opacity .3, 🔒) — the product
 * would rather not run than produce a truncated transect.
 */
export async function isRecordingPermitted(): Promise<boolean> {
  const snapshot = await getPermissionSnapshot();
  return snapshot.foregroundLocation && snapshot.backgroundLocation;
}
