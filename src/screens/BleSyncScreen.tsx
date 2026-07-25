/**
 * Wireframe 1.3 — BLE Sensor Sync ("Telemetry Array Link").
 *
 * PERMISSION ORDER: this screen requests BLUETOOTH_SCAN + BLUETOOTH_CONNECT and
 * comes BEFORE the location gate (1.4), matching the wireframe's screen order.
 * See permissionsService.ts for why that order is deliberate.
 *
 * The screen also exposes a SIMULATOR path. That is not a convenience — R-01
 * (ble-plx 3.5.1 has no New Architecture support, and RN 0.86 no longer permits
 * disabling it) and G-01 (undocumented frame layout) mean real-hardware telemetry
 * is unverified. The simulator keeps the rest of Sprint 1 demonstrable and
 * testable while those are resolved.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Card,
  HeaderTitle,
  LabelXS,
  PillDot,
  PrimaryButton,
  Prompt,
  SecondaryButton,
  Spacer,
} from '@/components/atoms';
import { COLORS, HEAT, SPACE } from '@/config/theme';
import { POCKETLAB_DEVICE_NAME } from '@/config/bleConstants';
import { connectSensor } from '@/services/sessionController';
import { requestBlePermissions } from '@/services/permissionsService';
import { useNavigationStore } from '@/store/useNavigationStore';
import { selectConnection, useTelemetryStore } from '@/store/useTelemetryStore';

export function BleSyncScreen({
  onModeSelected,
}: {
  onModeSelected: (mode: 'hardware' | 'simulator') => void;
}) {
  const navigate = useNavigationStore((s) => s.navigate);
  const connection = useTelemetryStore(selectConnection);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onConnectHardware = async () => {
    setBusy(true);
    setStatus('Requesting Bluetooth permissions…');

    const permission = await requestBlePermissions();
    if (permission.outcome === 'blocked') {
      setBusy(false);
      setStatus(
        'Bluetooth permission is permanently denied. Enable it in System Settings → Apps → Urban Heat → Permissions.'
      );
      return;
    }
    if (permission.outcome === 'denied') {
      setBusy(false);
      setStatus('Bluetooth permission denied. Scanning cannot proceed without it.');
      return;
    }

    setStatus(`Scanning for "${POCKETLAB_DEVICE_NAME}"…`);
    const result = await connectSensor();
    setBusy(false);

    if (result.ok) {
      setStatus('Linked. Telemetry subscription active.');
      onModeSelected('hardware');
      navigate('locationGate');
    } else {
      setStatus(result.message ?? 'Link failed.');
    }
  };

  const onUseSimulator = () => {
    onModeSelected('simulator');
    navigate('locationGate');
  };

  const linked = connection === 'subscribed' || connection === 'connected';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <HeaderTitle>URBAN HEAT</HeaderTitle>
        <LabelXS>Telemetry Array Link</LabelXS>
      </View>

      <View style={styles.body}>
        {/* .radar — concentric rings with a cool-blue core */}
        <View style={styles.radar}>
          <View style={[styles.ring, styles.ring1]} />
          <View style={[styles.ring, styles.ring2]} />
          <View style={[styles.ring, styles.ring3]} />
          <View style={styles.core} />
        </View>

        <View style={styles.deviceList}>
          <Card style={styles.deviceRow}>
            <View style={styles.deviceMeta}>
              <Text style={styles.deviceName}>UH-Proxy-Sensor (PL Voyager)</Text>
              <Text style={styles.deviceStatus}>
                {linked ? 'Exposed bead probe · Linked' : `Awaiting link · ${POCKETLAB_DEVICE_NAME}`}
              </Text>
            </View>
            <PillDot color={linked ? HEAT.normal : COLORS.muted} />
          </Card>

          <Card style={[styles.deviceRow, styles.scanRow]}>
            <View style={styles.deviceMeta}>
              <Text style={styles.deviceName}>Scanning for backup arrays…</Text>
              <Text style={styles.deviceStatus}>Searching BLE profile broadcast</Text>
            </View>
            <Text style={styles.deviceStatus}>···</Text>
          </Card>
        </View>

        {status !== null ? <Prompt>{status}</Prompt> : null}

        <Spacer />

        <PrimaryButton
          label={busy ? 'Linking…' : 'Link Hardware Sensor'}
          onPress={onConnectHardware}
          disabled={busy}
        />
        <SecondaryButton label="Use 1 Hz simulator (dev)" onPress={onUseSimulator} />
      </View>
    </View>
  );
}

const RADAR_SIZE = 150;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: SPACE.s3, paddingBottom: SPACE.s2, gap: 4 },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: SPACE.s3, gap: SPACE.s3 },
  radar: { width: RADAR_SIZE, height: RADAR_SIZE, marginTop: SPACE.s2 },
  ring: { position: 'absolute', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADAR_SIZE },
  ring1: { top: 0, left: 0, right: 0, bottom: 0 },
  ring2: { top: 28, left: 28, right: 28, bottom: 28 },
  ring3: { top: 56, left: 56, right: 56, bottom: 56 },
  core: {
    position: 'absolute',
    top: RADAR_SIZE / 2 - 6,
    left: RADAR_SIZE / 2 - 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: HEAT.cool,
  },
  deviceList: { width: '100%', gap: SPACE.s1 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scanRow: { opacity: 0.55 },
  deviceMeta: { gap: 3, flexShrink: 1 },
  deviceName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  deviceStatus: { fontSize: 10, color: COLORS.muted },
});
