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
      // FOREGROUND_SERVICE_CONNECTED_DEVICE intentionally omitted — declaring the
      // `connectedDevice` FGS type crashed the app on Android 16 with a
      // SecurityException whenever Bluetooth runtime permissions were absent.
      // See plugins/withUrbanHeatForegroundService.js for the full analysis.
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
      'WAKE_LOCK',
    ],

    // ALWAYS emit the googleMaps meta-data, even with an empty key.
    //
    // VERIFIED ON DEVICE: react-native-maps throws a FATAL JS error — "API key
    // not found. Check that <meta-data android:name="com.google.android.geo.
    // API_KEY" ... is in the <application> element" — when the meta-data element
    // is absent entirely. Emitting it with an empty value means the SDK finds the
    // element and reports an auth failure instead of taking down the screen.
    //
    // src/components/MapCanvas.tsx is the primary defence (it skips MapView
    // entirely without a key); this is the second layer.
    config: { googleMaps: { apiKey: googleMapsApiKey } },
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
