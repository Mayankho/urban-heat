/**
 * Wireframe Screen 2.1 HUD — the 2x2 metric grid.
 *
 * ============================================================================
 *  THIS FILE IS WHERE TASK 1.2's ARCHITECTURE IS PROVEN OR BROKEN.
 * ============================================================================
 *
 * Each quadrant is its OWN component with its OWN narrow subscription to
 * useTelemetryStore. A temperature tick re-renders ONLY the temperature quadrant's
 * text node — not the map, not the polyline, not the slider, not the parent screen.
 *
 * If these were props passed down from a parent that subscribed once, the parent
 * would re-render at 1 Hz and drag the entire screen tree with it, which is
 * exactly the failure mode the guardrail exists to prevent. The prop-drilled
 * version looks cleaner and is architecturally wrong.
 *
 * Note each selector returns a PRIMITIVE (number | null | string), so zustand's
 * default Object.is comparison actually short-circuits. A selector returning a
 * fresh object each call would re-render every tick regardless.
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, HEAT, SPACE, TABULAR_NUMS } from '@/config/theme';
import {
  selectAvgTempC,
  selectCurrentTempC,
  selectDistanceMeters,
  selectElapsedSeconds,
  useTelemetryStore,
} from '@/store/useTelemetryStore';
import { selectTemperatureUnit, useSettingsStore } from '@/store/useSettingsStore';
import { HOTSPOT_THRESHOLD_F } from '@/utils/heatBand';
import {
  celsiusToFahrenheit,
  formatDistanceMiles,
  formatElapsed,
  formatTemp,
  unitSuffix,
} from '@/utils/units';
import { LabelXS } from './atoms';

/** Presentational shell. `hot` mirrors the wireframe's `.hud .q.hot` rule. */
const Quadrant = memo(function Quadrant({
  label,
  value,
  unit,
  hot = false,
  borderRight = false,
  borderBottom = false,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  hot?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <View
      style={[
        styles.quadrant,
        borderRight && styles.borderRight,
        borderBottom && styles.borderBottom,
      ]}
    >
      <LabelXS>{label}</LabelXS>
      <Text style={[styles.value, hot && styles.valueHot]}>
        {value}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
    </View>
  );
});

/** "Elapsed Time 00:24:15" — subscribes to elapsedSeconds ONLY. */
function ElapsedQuadrant() {
  const seconds = useTelemetryStore(selectElapsedSeconds);
  const { primary, seconds: suffix } = formatElapsed(seconds);
  return (
    <Quadrant
      label="Elapsed Time"
      value={primary}
      unit={suffix ? `:${suffix}` : undefined}
      borderRight
      borderBottom
    />
  );
}

/** "Mapped Distance 1.12 mi" — subscribes to distanceMeters ONLY. */
function DistanceQuadrant() {
  const meters = useTelemetryStore(selectDistanceMeters);
  return (
    <Quadrant
      label="Mapped Distance"
      value={formatDistanceMiles(meters)}
      unit="mi"
      borderBottom
    />
  );
}

/**
 * "Current Temp 96.4°F" — subscribes to currentTempC ONLY.
 * This is the single most frequently updated node in the app.
 */
function CurrentTempQuadrant() {
  const tempC = useTelemetryStore(selectCurrentTempC);
  const unit = useSettingsStore(selectTemperatureUnit);

  // `.q.hot` styling threshold reuses the hotspot definition (>= 95 °F), so the
  // HUD turns red at exactly the point the hotspot counter increments.
  const isHot = tempC !== null && celsiusToFahrenheit(tempC) >= HOTSPOT_THRESHOLD_F;

  return (
    <Quadrant
      label="Current Temp"
      value={formatTemp(tempC, unit)}
      unit={unitSuffix(unit)}
      hot={isHot}
      borderRight
    />
  );
}

/** "Session Average 84.2°F" — derived O(1) from the (sum, count) pair. */
function AverageTempQuadrant() {
  const avgC = useTelemetryStore(selectAvgTempC);
  const unit = useSettingsStore(selectTemperatureUnit);
  return (
    <Quadrant
      label="Session Average"
      value={formatTemp(avgC, unit)}
      unit={unitSuffix(unit)}
    />
  );
}

/** The complete 2x2 HUD. Renders once; its children update independently. */
export function Hud() {
  return (
    <View style={styles.hud}>
      <ElapsedQuadrant />
      <DistanceQuadrant />
      <CurrentTempQuadrant />
      <AverageTempQuadrant />
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  quadrant: { width: '50%', padding: SPACE.s2 },
  borderRight: { borderRightWidth: 1, borderRightColor: COLORS.border },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  value: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
    color: COLORS.text,
    fontVariant: TABULAR_NUMS,
  },
  valueHot: { color: HEAT.danger },
  unit: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
});
