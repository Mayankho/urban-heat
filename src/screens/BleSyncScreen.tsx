/**
 * Wireframe 1.3 — BLE Sensor Sync ("Telemetry Array Link").
 *
 * PERMISSION ORDER: this screen requests BLUETOOTH_SCAN + BLUETOOTH_CONNECT and
 * comes BEFORE the location gate (1.4), matching the wireframe's screen order.
 * See permissionsService.ts for why that order is deliberate.
 *
 * DEVICE PICKER (rather than the wireframe's static two-row list)
 * --------------------------------------------------------------
 * docs/04 records "PL GT M201" as a verified observation from ONE field-test unit,
 * and never says whether that is a model name shared by every PocketLab Voyager or
 * a per-device name. Auto-connecting on an exact match means every other sensor on
 * the bench is silently ignored and reported as "sensor not found" — which is
 * indistinguishable from a real hardware fault.
 *
 * So we scan and list everything, mark the documented unit, and let the operator
 * choose. That also preserves scientific provenance: the session records WHICH
 * sensor produced the transect instead of whichever answered the scan first.
 *
 * The simulator path remains, because R-01 (BLE under the New Architecture) and
 * G-01 (frame layout) are still open and must never block the rest of the app.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  HeaderTitle,
  LabelXS,
  PillDot,
  PrimaryButton,
  Prompt,
  SecondaryButton,
} from '@/components/atoms';
import { COLORS, HEAT, SPACE, TYPE } from '@/config/theme';
import { POCKETLAB_DEVICE_NAME } from '@/config/bleConstants';
import { startDiscovery, stopDiscovery, type DiscoveredDevice } from '@/services/bleAdapter';
import { connectSensorById } from '@/services/sessionController';
import { openBluetoothSettings, requestBlePermissions } from '@/services/permissionsService';
import { useNavigation } from '@react-navigation/native';
import { useSessionStore } from '@/store/useSessionStore';
import { selectConnection, useTelemetryStore } from '@/store/useTelemetryStore';

/** Signal-strength label so the operator can tell which sensor is nearest. */
function signalLabel(dbm: number | null): string {
  if (dbm === null) return '—';
  if (dbm >= -60) return `${dbm} dBm · strong`;
  if (dbm >= -75) return `${dbm} dBm · good`;
  if (dbm >= -85) return `${dbm} dBm · weak`;
  return `${dbm} dBm · marginal`;
}

export function BleSyncScreen() {
  const navigation = useNavigation();
  const connection = useTelemetryStore(selectConnection);
  // Sensor mode lives in the store rather than being prop-drilled: React
  // Navigation owns routing, Zustand owns state.
  const setSensorMode = useSessionStore((s) => s.setSensorMode);

  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [radioOff, setRadioOff] = useState(false);

  // NOTE ON THE GUARDRAIL: useState here is fine and does NOT breach the Task 1.2
  // mandate. That ban covers the 1 Hz TELEMETRY stream. Scan results are a handful
  // of low-frequency UI events that stop entirely once a device is chosen.
  const runScan = useCallback(async () => {
    setDevices([]);
    setRadioOff(false);
    setScanning(true);
    setStatus('Requesting Bluetooth permissions…');

    const permission = await requestBlePermissions();
    if (permission.outcome === 'blocked') {
      setScanning(false);
      setStatus(
        'Bluetooth permission is permanently denied. Enable it in System Settings → Apps → Urban Heat → Permissions.'
      );
      return;
    }
    if (permission.outcome === 'denied') {
      setScanning(false);
      setStatus('Bluetooth permission denied. Scanning cannot proceed without it.');
      return;
    }

    setStatus('Scanning for nearby BLE devices…');
    try {
      await startDiscovery(setDevices);
      setStatus(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Scan failed.';
      setStatus(message);
      setRadioOff(message.toLowerCase().includes('bluetooth is turned off'));
    } finally {
      setScanning(false);
    }
  }, []);

  // Stop the radio scanning if the operator navigates away mid-scan.
  useEffect(() => () => stopDiscovery(), []);

  const onPick = async (target: DiscoveredDevice) => {
    setConnectingId(target.id);
    setStatus(`Connecting to "${target.name}"…`);

    const result = await connectSensorById(target.id);
    setConnectingId(null);

    if (result.ok) {
      setStatus(`Linked to "${target.name}". Telemetry subscription active.`);
      setSensorMode('hardware');
      navigation.navigate('LocationGate');
      return;
    }
    setStatus(result.message ?? 'Link failed.');
    setRadioOff(result.connectionState === 'bluetooth_off');
  };

  const onUseSimulator = () => {
    stopDiscovery();
    setSensorMode('simulator');
    navigation.navigate('LocationGate');
  };

  const linked = connection === 'subscribed' || connection === 'connected';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <HeaderTitle>URBAN HEAT</HeaderTitle>
        <LabelXS>Telemetry Array Link</LabelXS>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* .radar — concentric rings with a cool-blue core */}
        <View style={styles.radar}>
          <View style={[styles.ring, styles.ring1]} />
          <View style={[styles.ring, styles.ring2]} />
          <View style={[styles.ring, styles.ring3]} />
          <View style={[styles.core, scanning && styles.coreActive]} />
        </View>

        <View style={styles.list}>
          <LabelXS>
            {scanning
              ? 'Scanning…'
              : devices.length > 0
                ? `${devices.length} device${devices.length === 1 ? '' : 's'} in range`
                : 'No devices found yet'}
          </LabelXS>

          {devices.map((d) => {
            const busy = connectingId === d.id;
            return (
              <Pressable key={d.id} onPress={() => onPick(d)} disabled={connectingId !== null}>
                <Card
                  style={[
                    styles.deviceRow,
                    d.isExpectedSensor && styles.deviceRowExpected,
                    connectingId !== null && !busy && styles.deviceRowDimmed,
                  ]}
                >
                  <View style={styles.deviceMeta}>
                    <Text style={styles.deviceName}>{d.name}</Text>
                    <Text style={styles.deviceStatus}>
                      {busy ? 'Connecting…' : signalLabel(d.rssiDbm)}
                    </Text>
                    {d.isExpectedSensor ? (
                      <Text style={styles.badgeExpected}>
                        ✓ Documented sensor ({POCKETLAB_DEVICE_NAME})
                      </Text>
                    ) : d.isProbablePocketLab ? (
                      <Text style={styles.badgeMaybe}>
                        Looks like a PocketLab — service UUIDs unverified
                      </Text>
                    ) : null}
                  </View>
                  <PillDot
                    color={
                      d.isExpectedSensor
                        ? HEAT.normal
                        : d.isProbablePocketLab
                          ? HEAT.warn
                          : COLORS.muted
                    }
                  />
                </Card>
              </Pressable>
            );
          })}

          {!scanning && devices.length === 0 ? (
            <Prompt>
              Nothing detected. Confirm the sensor is powered on and not already
              connected to another phone or the PocketLab app — BLE peripherals
              accept only one connection at a time.
            </Prompt>
          ) : null}
        </View>

        {status !== null ? <Prompt>{status}</Prompt> : null}

        {radioOff ? (
          <SecondaryButton label="Open Bluetooth Settings" onPress={openBluetoothSettings} />
        ) : null}

        {linked ? (
          <Text style={styles.linkedNote}>● Link established — telemetry flowing.</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={scanning ? 'Scanning…' : devices.length > 0 ? 'Scan Again' : 'Scan for Sensors'}
          onPress={runScan}
          disabled={scanning || connectingId !== null}
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
  body: { alignItems: 'center', paddingHorizontal: SPACE.s3, gap: SPACE.s2, paddingBottom: SPACE.s2 },
  radar: { width: RADAR_SIZE, height: RADAR_SIZE, marginTop: SPACE.s1 },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADAR_SIZE,
  },
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
    backgroundColor: COLORS.muted,
  },
  coreActive: { backgroundColor: HEAT.cool },
  list: { width: '100%', gap: SPACE.s1 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceRowExpected: { borderColor: HEAT.normal },
  deviceRowDimmed: { opacity: 0.45 },
  deviceMeta: { gap: 3, flexShrink: 1, paddingRight: SPACE.s1 },
  deviceName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  deviceStatus: { fontSize: 10, color: COLORS.muted, fontFamily: TYPE.monoFamily },
  badgeExpected: { fontSize: 9, color: HEAT.normal, fontWeight: '700' },
  badgeMaybe: { fontSize: 9, color: HEAT.crit, fontWeight: '600' },
  linkedNote: { fontSize: 11, color: HEAT.normal, fontWeight: '600' },
  footer: { padding: SPACE.s3, gap: SPACE.s1 },
});
