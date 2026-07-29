/**
 * BLE connection indicator.
 *
 * Subscribes to `useTelemetryStore` with narrow atomic selectors, so it re-renders
 * only when the link state itself changes — not on every 1 Hz packet. The live
 * temperature variant is a separate leaf for the same reason.
 *
 * "Connected" here means STREAMING, not merely subscribed. A GATT subscription can
 * attach to a characteristic that never fires — showing a green "Connected" badge
 * over a dead stream would be the most misleading state the app could present, so
 * `selectIsStreaming` additionally requires a recent packet.
 */

import { StyleSheet, Text, View } from 'react-native';
import { COLORS, HEAT, SPACE, TABULAR_NUMS, TYPE } from '@/config/theme';
import {
  selectConnection,
  selectCurrentTempC,
  selectDeviceName,
  selectIsStreaming,
  useTelemetryStore,
} from '@/store/useTelemetryStore';
import { selectTemperatureUnit, useSettingsStore } from '@/store/useSettingsStore';
import type { BleConnectionState } from '@/types/telemetry';
import { formatTemp, unitSuffix } from '@/utils/units';
import { PillDot } from './atoms';

/** Human wording for each link state. */
function describe(state: BleConnectionState, streaming: boolean): string {
  if (streaming) return 'Connected';
  switch (state) {
    case 'subscribed':
      return 'Linked · awaiting data';
    case 'connected':
      return 'Connected · subscribing';
    case 'connecting':
      return 'Connecting…';
    case 'scanning':
      return 'Scanning…';
    case 'disconnected':
      return 'Disconnected';
    case 'bluetooth_off':
      return 'Bluetooth off';
    case 'unauthorized':
      return 'Permission required';
    case 'error':
      return 'Link error';
    default:
      return 'Not linked';
  }
}

function statusColor(state: BleConnectionState, streaming: boolean): string {
  if (streaming) return HEAT.normal;
  if (state === 'subscribed' || state === 'connected' || state === 'connecting') {
    return HEAT.warn;
  }
  if (state === 'error' || state === 'bluetooth_off' || state === 'unauthorized') {
    return HEAT.danger;
  }
  return COLORS.muted;
}

/** Compact badge: dot + wording + device name. */
export function ConnectionStatus({ showDevice = true }: { showDevice?: boolean }) {
  const connection = useTelemetryStore(selectConnection);
  const streaming = useTelemetryStore(selectIsStreaming);
  const deviceName = useTelemetryStore(selectDeviceName);

  return (
    <View style={styles.row}>
      <PillDot color={statusColor(connection, streaming)} />
      <Text style={[styles.label, streaming && styles.labelLive]}>
        {describe(connection, streaming)}
      </Text>
      {showDevice && deviceName !== null ? (
        <Text style={styles.device} numberOfLines={1}>
          {deviceName}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Live EXTERNAL-probe reading, isolated as its own leaf so the 1 Hz updates
 * re-render this text node and nothing around it.
 */
export function LiveTemperatureReadout({ compact = false }: { compact?: boolean }) {
  const tempC = useTelemetryStore(selectCurrentTempC);
  const streaming = useTelemetryStore(selectIsStreaming);
  const unit = useSettingsStore(selectTemperatureUnit);

  if (!streaming && tempC === null) {
    return <Text style={[styles.temp, compact && styles.tempCompact]}>—</Text>;
  }
  return (
    <Text style={[styles.temp, compact && styles.tempCompact]}>
      {formatTemp(tempC, unit)}
      <Text style={styles.tempUnit}>{unitSuffix(unit)}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  label: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  labelLive: { color: HEAT.normal },
  device: {
    fontSize: 9.5,
    color: COLORS.muted,
    fontFamily: TYPE.monoFamily,
    flexShrink: 1,
  },
  temp: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    fontVariant: TABULAR_NUMS,
    letterSpacing: -0.5,
  },
  tempCompact: { fontSize: 13 },
  tempUnit: { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
  spacer: { width: SPACE.s1 },
});
