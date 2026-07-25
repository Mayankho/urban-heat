/**
 * Wireframe `.pill` — the floating status bar over the map (Screens 2.0 / 2.1).
 *
 * Segments subscribe individually so a temperature tick does not re-render the
 * GPS segment, matching the HUD's approach.
 */

import { StyleSheet, Text, View } from 'react-native';
import { COLORS, HEAT, SPACE } from '@/config/theme';
import { selectTemperatureUnit, useSettingsStore } from '@/store/useSettingsStore';
import {
  selectConnection,
  selectCurrentTempC,
  useTelemetryStore,
} from '@/store/useTelemetryStore';
import { bandForCelsius } from '@/utils/heatBand';
import { formatTemp, unitSuffix } from '@/utils/units';
import { PillDot } from './atoms';

function Segment({
  children,
  first = false,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  return <View style={[styles.seg, !first && styles.segDivider]}>{children}</View>;
}

/** Link-state dot colour: cool blue when streaming, muted otherwise. */
function SensorSegment() {
  const connection = useTelemetryStore(selectConnection);
  const live = connection === 'subscribed';
  return (
    <Segment>
      <PillDot color={live ? HEAT.cool : COLORS.muted} />
      <Text style={styles.segText}>Sensor</Text>
    </Segment>
  );
}

/** Live temperature with its band colour as the dot. */
function TempSegment() {
  const tempC = useTelemetryStore(selectCurrentTempC);
  const unit = useSettingsStore(selectTemperatureUnit);
  const band = bandForCelsius(tempC);
  return (
    <Segment>
      <PillDot color={band?.color ?? COLORS.muted} />
      <Text style={styles.segText}>
        {formatTemp(tempC, unit)}
        {unitSuffix(unit)}
      </Text>
    </Segment>
  );
}

export function StatusPill({
  gpsLabel,
  campaignLabel,
  showTelemetry = true,
}: {
  gpsLabel: string;
  campaignLabel?: string;
  showTelemetry?: boolean;
}) {
  return (
    <View style={styles.pill}>
      <Segment first>
        <Text style={styles.mark}>UH</Text>
      </Segment>
      <Segment>
        <Text style={styles.segLabel}>GPS</Text>
        <Text style={styles.segText}>{gpsLabel}</Text>
      </Segment>
      {showTelemetry ? <SensorSegment /> : null}
      {showTelemetry ? <TempSegment /> : null}
      {campaignLabel ? (
        <Segment>
          <Text style={styles.segText}>{campaignLabel}</Text>
        </Segment>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: SPACE.s2,
    alignSelf: 'center',
    zIndex: 20,
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  seg: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  segDivider: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  segText: { fontSize: 9.5, fontWeight: '600', color: COLORS.text },
  segLabel: { fontSize: 9.5, fontWeight: '500', color: COLORS.muted },
  mark: { fontSize: 9.5, color: HEAT.danger, fontWeight: '800', letterSpacing: 1 },
});
