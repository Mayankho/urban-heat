/**
 * Wireframe 3.3 — System Settings & Diagnostics.
 *
 * Every diagnostic here reads a REAL value. That is a deliberate choice: the
 * wireframe's sample figures do not reconcile with the actual schema (G-14 — its
 * "1,420 rows (1.2MB)" implies ~850 bytes/row against a ~60–90 byte/row schema),
 * so a panel computing size from a per-row constant would lie to the operator.
 * Cache size comes from SQLite's own page accounting instead.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import {
  DiagnosticsCard,
  DiagnosticsRow,
  LabelXS,
  PortalHeader,
  SegmentedToggle,
} from '@/components/atoms';
import { TabBar } from '@/components/TabBar';
import { COLORS, HEAT, SPACE } from '@/config/theme';
import { UH_SAMPLE_RATE_HZ } from '@/config/bleConstants';
import { flushLocalCache, getDatabaseSizeBytes, getTotalPointCount } from '@/database/db';
import { isUsingUnverifiedDecoder } from '@/services/bleAdapter';
import {
  selectFrames,
  selectTotalSeen,
  useFrameSpikeStore,
} from '@/store/useFrameSpikeStore';
import { usePolylineStore } from '@/store/usePolylineStore';
import {
  selectCurrentInternalTempC,
  selectCurrentTempC,
  selectRssi,
  selectTotalDecodeFailures,
  useTelemetryStore,
} from '@/store/useTelemetryStore';
import {
  selectTemperatureUnit,
  useSettingsStore,
  type TemperatureUnit,
} from '@/store/useSettingsStore';

const UNIT_OPTIONS: ReadonlyArray<{ value: TemperatureUnit; label: string }> = [
  { value: 'F', label: 'Fahrenheit (°F)' },
  { value: 'C', label: 'Celsius (°C)' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Signal-strength label matching the wireframe's "(Strong)" annotation. */
function rssiQuality(dbm: number | null): string {
  if (dbm === null) return 'No link';
  if (dbm >= -60) return 'Strong';
  if (dbm >= -75) return 'Good';
  if (dbm >= -85) return 'Weak';
  return 'Marginal';
}

export function SettingsDiagnosticsScreen() {
  const unit = useSettingsStore(selectTemperatureUnit);
  const setUnit = useSettingsStore((s) => s.setTemperatureUnit);
  const rssi = useTelemetryStore(selectRssi);
  const decodeFailures = useTelemetryStore(selectTotalDecodeFailures);
  const staleFixDrops = useTelemetryStore((s) => s.staleFixDrops);
  const resetPolyline = usePolylineStore((s) => s.reset);
  const frames = useFrameSpikeStore(selectFrames);
  const totalSeen = useFrameSpikeStore(selectTotalSeen);
  const externalC = useTelemetryStore(selectCurrentTempC);
  const internalC = useTelemetryStore(selectCurrentInternalTempC);

  const [rows, setRows] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);

  const refresh = useCallback(() => {
    setRows(getTotalPointCount());
    setSizeBytes(getDatabaseSizeBytes());
  }, []);

  useEffect(() => refresh(), [refresh]);

  const onFlush = () => {
    Alert.alert(
      'Flush Local SQLite Cache',
      'This permanently deletes every locally-cached session and trek point on this device. Sessions that have not been synced to Supabase CANNOT be recovered.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Flush Cache',
          style: 'destructive',
          onPress: () => {
            flushLocalCache();
            resetPolyline();
            refresh();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <PortalHeader title="SYSTEM PROPERTIES" subtitle="Hardware Engine Calibration Console" />

      <ScrollView contentContainerStyle={styles.list}>
        <LabelXS>Unit Scale Configuration</LabelXS>
        <SegmentedToggle options={UNIT_OPTIONS} value={unit} onChange={setUnit} />

        <LabelXS style={styles.sectionSpacing}>Hardware Core Diagnostics</LabelXS>
        <DiagnosticsCard>
          <DiagnosticsRow
            label="BLE Strength"
            value={rssi !== null ? `${rssi} dBm (${rssiQuality(rssi)})` : 'No link'}
          />
          <DiagnosticsRow label="Sampling Engine" value={`${UH_SAMPLE_RATE_HZ.toFixed(1)} Hz Fixed`} />
          <DiagnosticsRow
            label="Cache Ledger"
            value={`${rows.toLocaleString()} rows (${formatBytes(sizeBytes)})`}
          />
          <DiagnosticsRow
            label="App Version"
            value={`v${Constants.expoConfig?.version ?? '0.0.0'}-UH`}
          />
          <DiagnosticsRow label="Dropped Frames" value={`${decodeFailures}`} />
          <DiagnosticsRow label="Stale GPS Drops" value={`${staleFixDrops}`} />
          {/* Both thermal channels, so an operator can confirm they are being
              separated correctly: the internal PCB reading should sit near room
              temperature and barely move, while the external probe tracks the
              environment. Only the external one is ever recorded. */}
          <DiagnosticsRow
            label="External Probe (recorded)"
            value={externalC === null ? '—' : `${externalC.toFixed(2)} °C`}
          />
          <DiagnosticsRow
            label="Internal PCB (diagnostic)"
            value={internalC === null ? '—' : `${internalC.toFixed(2)} °C`}
          />
        </DiagnosticsCard>

        {/* Honest provenance warning — the operator must know readings are not
            yet layout-verified against real hardware (G-01). */}
        {isUsingUnverifiedDecoder() ? (
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>⚠ UNVERIFIED DECODER ACTIVE</Text>
            <Text style={styles.warningBody}>
              The PL GT M201 frame byte layout is not documented in the project
              specification. Temperatures are decoded by a plausibility-gated
              heuristic and must not be published as validated science until the
              layout is confirmed against hardware.
            </Text>
          </View>
        ) : null}

        {/* G-01 capture. On screen rather than logcat-only so the layout can be
            reverse-engineered with the phone untethered, standing at the sensor
            with a thermometer. Remove once a verified decoder is installed. */}
        <LabelXS style={styles.sectionSpacing}>Raw Frame Capture (G-01)</LabelXS>
        <DiagnosticsCard>
          {frames.length === 0 ? (
            <Text style={styles.diagEmpty}>
              No frames captured yet. Link the hardware sensor on the Telemetry
              Array Link screen; frames appear here as they arrive.
            </Text>
          ) : (
            <>
              <Text style={styles.frameHint}>
                {totalSeen} frame{totalSeen === 1 ? '' : 's'} seen · newest first ·
                note the true temperature alongside these bytes
              </Text>
              {frames.map((f) => (
                <Text key={`${f.atUtcMs}-${f.hex}`} style={styles.frameLine} selectable>
                  {`${f.byteLength}B `}
                  <Text style={styles.frameHex}>{f.hex}</Text>
                  {`  → ${f.decodedC === null ? '—' : `${f.decodedC.toFixed(2)}C`} (${f.decode})`}
                </Text>
              ))}
            </>
          )}
        </DiagnosticsCard>

        <LabelXS style={styles.sectionSpacing}>Local Cache Management</LabelXS>
        <Pressable accessibilityRole="button" onPress={onFlush} style={styles.flushBtn}>
          <Text style={styles.flushText}>⚠️ Flush Local SQLite Cache</Text>
        </Pressable>
      </ScrollView>

      <TabBar active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: SPACE.s2, gap: SPACE.s1 },
  sectionSpacing: { marginTop: 12 },
  flushBtn: {
    marginTop: SPACE.s2,
    padding: SPACE.s2,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: HEAT.danger,
  },
  flushText: {
    fontSize: 11,
    fontWeight: '700',
    color: HEAT.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  warning: {
    marginTop: SPACE.s2,
    padding: SPACE.s2,
    borderWidth: 1,
    borderColor: HEAT.crit,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  warningTitle: { fontSize: 10, fontWeight: '800', color: HEAT.crit, letterSpacing: 0.5 },
  warningBody: { fontSize: 10, color: COLORS.muted, lineHeight: 15 },
  diagEmpty: { fontSize: 10, color: COLORS.muted, lineHeight: 15 },
  frameHint: { fontSize: 9, color: COLORS.muted, lineHeight: 13, marginBottom: 6 },
  frameLine: {
    fontFamily: 'monospace',
    fontSize: 9.5,
    color: COLORS.muted,
    lineHeight: 15,
  },
  frameHex: { color: COLORS.text, fontWeight: '700' },
});
