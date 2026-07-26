/**
 * Wireframe 2.1 — Live Recording (the Strava model).
 *
 * The app's centrepiece: context map + colour-graded telemetry polyline + 2x2 HUD
 * + slide-to-end gesture.
 *
 * RENDER DISCIPLINE — the whole point of Task 1.2
 * ----------------------------------------------
 * This component subscribes to NOTHING that changes at 1 Hz. It renders once when
 * recording starts and then stays still. Its children subscribe independently:
 *   • <Hud/>       — four quadrants, each with its own atomic selector
 *   • <StatusPill/> — segments with their own selectors
 *   • the polyline — reads usePolylineStore, which updates at 0.2 Hz (decimated)
 *
 * If you add `useTelemetryStore(selectCurrentTempC)` to THIS component, the map
 * re-renders every second and the architecture is defeated. Push the subscription
 * down into a leaf instead.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Polyline } from 'react-native-maps';
import { Hud } from '@/components/HudQuadrant';
import { MapCanvas, isMapAvailable } from '@/components/MapCanvas';
import { SlideToEndTrek } from '@/components/SlideToEndTrek';
import { StatusPill } from '@/components/StatusPill';
import { COLORS } from '@/config/theme';
import { selectVertices, usePolylineStore } from '@/store/usePolylineStore';
import { bandForCelsius } from '@/utils/heatBand';

const FALLBACK_REGION = {
  latitude: 33.7676,
  longitude: -84.4507,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

/**
 * The heat-graded trail.
 *
 * react-native-maps cannot apply a gradient to a single Polyline, so the trail is
 * drawn as consecutive 2-vertex segments, each coloured by the band of its
 * starting temperature. This reproduces the wireframe's `heat_spectrum` gradient
 * effect while keeping every segment's colour scientifically meaningful rather
 * than interpolated — a segment's colour is a real reading, not a blend.
 */
function HeatTrail() {
  const vertices = usePolylineStore(selectVertices);

  const segments = useMemo(() => {
    if (vertices.length < 2) return [];
    const out: Array<{
      key: string;
      coordinates: Array<{ latitude: number; longitude: number }>;
      color: string;
    }> = [];
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i]!;
      const b = vertices[i + 1]!;
      out.push({
        key: `${i}-${a.latitude.toFixed(5)}-${a.longitude.toFixed(5)}`,
        coordinates: [
          { latitude: a.latitude, longitude: a.longitude },
          { latitude: b.latitude, longitude: b.longitude },
        ],
        color: bandForCelsius(a.tempC)?.color ?? COLORS.muted,
      });
    }
    return out;
  }, [vertices]);

  return (
    <>
      {segments.map((segment) => (
        <Polyline
          key={segment.key}
          coordinates={segment.coordinates}
          strokeColor={segment.color}
          strokeWidth={5}
          lineCap="round"
        />
      ))}
    </>
  );
}

export function LiveRecordingScreen({ onEnd }: { onEnd: () => void }) {
  // Vertex count for the no-map fallback caption, so the operator still sees the
  // trail accumulating without tiles. Reads the DECIMATED polyline store (0.2 Hz)
  // and returns a primitive — this does NOT subscribe the screen to the 1 Hz stream.
  const vertexCount = usePolylineStore((s) => s.vertices.length);

  return (
    <View style={styles.screen}>
      <View style={styles.mapWrap}>
        <MapCanvas
          initialRegion={FALLBACK_REGION}
          showsUserLocation
          followsUserLocation
          fallbackCaption={`Trail: ${vertexCount} vertices logged`}
        >
          {isMapAvailable() ? <HeatTrail /> : null}
        </MapCanvas>

        <StatusPill gpsLabel="High" />
      </View>

      <Hud />
      <SlideToEndTrek onComplete={onEnd} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  mapWrap: { flex: 1, position: 'relative', backgroundColor: COLORS.bg },
});
