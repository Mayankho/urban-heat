const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Urban Heat — Android foreground service + Bluetooth permission hardening.
 *
 * ============================================================================
 *  WHY THIS PLUGIN EXISTS
 * ============================================================================
 * Android 14 (API 34) requires every foreground service to declare a
 * `foregroundServiceType` matching the restricted work it actually performs, and
 * enforces it at runtime: using a capability outside the declared type raises
 * SecurityException / MissingForegroundServiceTypeException.
 *
 * Urban Heat's single background service genuinely performs TWO restricted
 * activities at once during a trek:
 *   1. `location`        — receives GPS fixes via expo-location
 *   2. `connectedDevice` — holds an active BLE GATT connection to PL GT M201
 *
 * expo-location declares ONLY `location`, and it does so in its LIBRARY manifest
 * (node_modules/expo-location/android/src/main/AndroidManifest.xml):
 *
 *     <service android:name=".services.LocationTaskService"
 *              android:exported="false"
 *              android:foregroundServiceType="location" />
 *
 * ============================================================================
 *  THE NON-OBVIOUS PART — VERIFIED EMPIRICALLY, NOT ASSUMED
 * ============================================================================
 * That service is merged into the final APK manifest by the Android Gradle
 * Plugin's MANIFEST MERGER at build time. It is NOT present in
 * android/app/src/main/AndroidManifest.xml after prebuild — confirmed by
 * inspecting the generated file.
 *
 * So a plugin that scans the app manifest for an existing <service> and edits it
 * finds nothing and silently no-ops. The correct mechanism is a manifest-merger
 * OVERRIDE: declare the same service in the app manifest by its FULLY-QUALIFIED
 * name with `tools:replace="android:foregroundServiceType"`, which instructs the
 * merger to prefer our value over the library's.
 *
 * The fully-qualified name comes from expo-location's Gradle namespace
 * (`expo.modules.location`) plus its relative class name, giving
 * `expo.modules.location.services.LocationTaskService`.
 *
 * ORDERING NOTE: user-plugin manifest mods run BEFORE Expo's internal mods have
 * populated the <application> element, so this plugin must NOT call
 * getMainApplicationOrThrow — that assertion fails at this stage. It creates or
 * reuses the application node defensively instead.
 *
 * Reference: IMPLEMENTATION_PLAN.md §6.3
 */

/** expo-location namespace + relative service class. */
const LOCATION_SERVICE_FQCN = 'expo.modules.location.services.LocationTaskService';

/** Both restricted capabilities this one service actually uses. */
const REQUIRED_TYPES = 'location|connectedDevice';

const TOOLS_NS = 'http://schemas.android.com/tools';

const REQUIRED_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
];

/**
 * Legacy Bluetooth permissions must be capped at API 30 so Android 12+ ignores
 * them in favour of BLUETOOTH_SCAN / BLUETOOTH_CONNECT. Verified necessary: the
 * generated manifest contains BLUETOOTH and BLUETOOTH_ADMIN with NO maxSdkVersion,
 * which Play Console flags and some OEM ROMs mis-handle.
 */
const LEGACY_CAPPED_PERMISSIONS = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
];

/** The tools namespace must be declared for tools:replace to be legal. */
function ensureToolsNamespace(manifest) {
  manifest.$ = manifest.$ ?? {};
  if (manifest.$['xmlns:tools'] !== TOOLS_NS) {
    manifest.$['xmlns:tools'] = TOOLS_NS;
  }
}

function ensurePermissions(manifest) {
  manifest['uses-permission'] = manifest['uses-permission'] ?? [];
  const list = manifest['uses-permission'];
  const find = (name) => list.find((p) => p?.$?.['android:name'] === name);

  for (const name of REQUIRED_PERMISSIONS) {
    if (!find(name)) list.push({ $: { 'android:name': name } });
  }

  // BLUETOOTH_SCAN carries neverForLocation: Urban Heat scans for exactly ONE
  // named device and derives position from GPS, never from BLE beacons. This is
  // a truthful capability declaration, and it decouples failure modes so a
  // location denial cannot masquerade as an empty BLE scan in the field.
  const scan = find('android.permission.BLUETOOTH_SCAN');
  if (scan) scan.$['android:usesPermissionFlags'] = 'neverForLocation';

  for (const name of LEGACY_CAPPED_PERMISSIONS) {
    const existing = find(name);
    if (existing) {
      existing.$['android:maxSdkVersion'] = '30';
    } else {
      list.push({ $: { 'android:name': name, 'android:maxSdkVersion': '30' } });
    }
  }
}

/**
 * Insert the manifest-merger override for expo-location's foreground service.
 *
 * `stopWithTask="false"` so a swipe-away of the task does not kill an in-progress
 * transect — the literal promise of Wireframe Screen 2.2 ("Continuous background
 * thread secured").
 */
function overrideForegroundService(manifest) {
  // Reuse the application node if a previous mod created it; otherwise create it.
  // Deliberately NOT getMainApplicationOrThrow — see ORDERING NOTE above.
  if (!Array.isArray(manifest.application) || manifest.application.length === 0) {
    manifest.application = [{ $: { 'android:name': '.MainApplication' } }];
  }

  const application =
    manifest.application.find((a) => a?.$?.['android:name'] === '.MainApplication') ??
    manifest.application[0];

  application.service = application.service ?? [];

  const existing = application.service.find(
    (s) => s?.$?.['android:name'] === LOCATION_SERVICE_FQCN
  );

  const attributes = {
    'android:name': LOCATION_SERVICE_FQCN,
    'android:exported': 'false',
    'android:foregroundServiceType': REQUIRED_TYPES,
    'android:stopWithTask': 'false',
    // Instructs the manifest merger to prefer OUR foregroundServiceType over the
    // `location`-only value in expo-location's library manifest. Without this the
    // merger reports a conflict and fails the build.
    'tools:replace': 'android:foregroundServiceType',
  };

  if (existing) {
    existing.$ = { ...existing.$, ...attributes };
  } else {
    application.service.push({ $: attributes });
  }

  console.log(
    `[withUrbanHeatForegroundService] Declared merger override for ` +
      `${LOCATION_SERVICE_FQCN} → foregroundServiceType="${REQUIRED_TYPES}", stopWithTask=false`
  );
}

module.exports = function withUrbanHeatForegroundService(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults?.manifest;
    if (!manifest) {
      console.warn(
        '[withUrbanHeatForegroundService] No manifest in modResults — skipping. ' +
          'Android 14+ background BLE may throw at runtime; inspect the generated ' +
          'AndroidManifest.xml before shipping.'
      );
      return cfg;
    }

    ensureToolsNamespace(manifest);
    ensurePermissions(manifest);
    overrideForegroundService(manifest);

    return cfg;
  });
};
