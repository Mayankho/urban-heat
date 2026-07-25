import type { ExpoConfig } from 'expo/config';

/**
 * Urban Heat — Expo configuration (Android-only MVP).
 *
 * Dynamic config (app.config.ts) rather than static app.json so the Google Maps
 * API key is read from the environment and never committed. See .env.example.
 *
 * ANDROID-ONLY: there is deliberately NO `ios` key. iOS is a later phase per the
 * roadmap constraint in CLAUDE.md. Do not add CocoaPods, Info.plist keys, or
 * Apple permissions here.
 */

// react-native-maps on Android renders a blank grey tile without a Google Maps
// key. Absent key is NOT a build failure — it degrades to a grey map so that
// database/BLE work is never blocked on cloud procurement. See G-11 follow-up.
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

const config: ExpoConfig = {
  name: 'Urban Heat',
  slug: 'urban-heat',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',

  // Brand Bible 03: "Color Palette (Light Mode Default)". Pinned to light until
  // the dark-mode scope question (G-08) is answered — the wireframe defines dark
  // tokens but no screen exposes a control to reach them.
  userInterfaceStyle: 'light',

  // Custom Development Client ONLY. Expo Go is BANNED (docs/01, Task 1.4) — it
  // cannot host react-native-ble-plx or a typed foreground service.
  developmentClient: { silentLaunch: false },

  android: {
    // G-16 — STILL UNCONFIRMED BY PRODUCT OWNER.
    // This string is IMMUTABLE once published to the Play Store. Confirm before
    // the first production build.
    package: 'org.urbanheat.field',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#F8F9FA', // --bg, Brand Bible primary canvas
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,

    // Declared here for visibility; the authoritative merge happens in the
    // config plugins below plus withUrbanHeatAndroidManifest.
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'FOREGROUND_SERVICE_CONNECTED_DEVICE',
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
      'WAKE_LOCK',
    ],

    // Spread conditionally rather than assigning `undefined`: an explicit
    // undefined would violate exactOptionalPropertyTypes and, more importantly,
    // would serialise an empty googleMaps block into the manifest.
    ...(googleMapsApiKey !== ''
      ? { config: { googleMaps: { apiKey: googleMapsApiKey } } }
      : {}),
  },

  plugins: [
    [
      'react-native-ble-plx',
      {
        // Android background BLE support. `modes` and the iOS permission strings
        // are intentionally omitted — they are iOS-only keys.
        isBackgroundEnabled: true,
      },
    ],
    [
      'expo-location',
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    'expo-sqlite',
    // Local plugin: patches the foreground service to declare BOTH
    // location AND connectedDevice types (Android 14+ requirement).
    // MUST run after expo-location, which declares only `location`.
    './plugins/withUrbanHeatForegroundService',
  ],

  extra: {
    // Surfaced to the app at runtime via expo-constants for the Screen 3.3
    // diagnostics panel, so the panel reports real values rather than literals.
    urbanHeat: {
      hasGoogleMapsKey: googleMapsApiKey.length > 0,
    },
  },

  experiments: {
    typedRoutes: false,
  },
};

export default config;
