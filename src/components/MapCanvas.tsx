/**
 * Map surface with a graceful no-API-key fallback.
 *
 * WHY THIS EXISTS — VERIFIED ON DEVICE, NOT ASSUMED
 * -------------------------------------------------
 * react-native-maps with PROVIDER_GOOGLE does NOT quietly render a grey map when
 * the Google Maps API key is missing. It throws a fatal JS error:
 *
 *   "API key not found. Check that <meta-data
 *    android:name="com.google.android.geo.API_KEY" ... is in the <application>
 *    element of AndroidManifest.xml"
 *
 * That RedBox takes down Screens 2.0 and 2.1 completely — the Launchpad and the
 * Live Recording HUD, i.e. the heart of the product.
 *
 * Google Maps billing is a procurement decision with a credit-card requirement,
 * and it must NOT be a prerequisite for exercising the database layer, the 1 Hz
 * Zustand pipeline, the Zero-RAM write path, or the HUD. So when no key is
 * configured we render a wireframe-styled placeholder that looks deliberate
 * rather than broken, and the rest of the app runs untouched.
 *
 * Add GOOGLE_MAPS_API_KEY to .env and rebuild to get real tiles; this component
 * then renders the genuine MapView with no code change.
 */

import type { ReactNode } from 'react';
import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { COLORS, SPACE, TYPE } from '@/config/theme';
import { LabelXS } from './atoms';

/** Plumbed through app.config.ts `extra.urbanHeat.hasGoogleMapsKey`. */
const hasGoogleMapsKey =
  (Constants.expoConfig?.extra?.['urbanHeat'] as { hasGoogleMapsKey?: boolean } | undefined)
    ?.hasGoogleMapsKey === true;

export function isMapAvailable(): boolean {
  return hasGoogleMapsKey;
}

interface MapCanvasProps {
  region?: Region;
  initialRegion?: Region;
  showsUserLocation?: boolean;
  followsUserLocation?: boolean;
  /** Placeholder caption, e.g. a live vertex count on the recording screen. */
  fallbackCaption?: string;
  children?: ReactNode;
}

export function MapCanvas({
  region,
  initialRegion,
  showsUserLocation = false,
  followsUserLocation = false,
  fallbackCaption,
  children,
}: MapCanvasProps) {
  if (!hasGoogleMapsKey) {
    return (
      <View style={styles.fallback}>
        {/* Echoes the wireframe's 32px .map::before grid so the empty state
            reads as part of the design system, not as a failure. */}
        <View style={styles.gridOverlay} pointerEvents="none">
          {Array.from({ length: 24 }).map((_, i) => (
            <View key={`h${i}`} style={[styles.gridLineH, { top: i * 32 }]} />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <View key={`v${i}`} style={[styles.gridLineV, { left: i * 32 }]} />
          ))}
        </View>
        <View style={styles.fallbackCard}>
          <LabelXS>Map Layer Offline</LabelXS>
          <Text style={styles.fallbackBody}>
            No Google Maps API key configured. Telemetry, GPS logging, and the
            local SQLite cache are all fully active — only tile rendering is
            unavailable.
          </Text>
          <Text style={styles.fallbackHint}>
            Set GOOGLE_MAPS_API_KEY in .env and rebuild to enable tiles.
          </Text>
          {fallbackCaption !== undefined ? (
            <Text style={styles.fallbackCaption}>{fallbackCaption}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      {...(region !== undefined ? { region } : {})}
      {...(initialRegion !== undefined ? { initialRegion } : {})}
      showsUserLocation={showsUserLocation}
      followsUserLocation={followsUserLocation}
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {children}
    </MapView>
  );
}

const styles = StyleSheet.create({
  fallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.s3,
    overflow: 'hidden',
  },
  gridOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.border },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: COLORS.border },
  fallbackCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.s2,
    gap: 6,
    maxWidth: 320,
  },
  fallbackBody: { fontSize: 11, color: COLORS.muted, lineHeight: 17 },
  fallbackHint: {
    fontSize: 9.5,
    color: COLORS.muted,
    fontFamily: TYPE.monoFamily,
    lineHeight: 14,
  },
  fallbackCaption: { fontSize: 10, color: COLORS.text, fontWeight: '700', marginTop: 2 },
});
