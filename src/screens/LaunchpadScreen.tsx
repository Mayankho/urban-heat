/**
 * Wireframe 2.0 — Pre-Trek Launchpad.
 *
 * The circular "INITIALIZE EXPEDITION" control over a context map, plus the
 * hardware diagnosis card and the tab bar.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, LabelXS } from '@/components/atoms';
import { ConnectionStatus, LiveTemperatureReadout } from '@/components/ConnectionStatus';
import { MapCanvas } from '@/components/MapCanvas';
import { POCKETLAB_DEVICE_NAME } from '@/config/bleConstants';
import { StatusPill } from '@/components/StatusPill';
import { TabBar } from '@/components/TabBar';
import { COLORS, HEAT, SPACE } from '@/config/theme';
import { useNavigation } from '@react-navigation/native';
import { getCurrentPositionOnce } from '@/services/locationService';
import { startSession } from '@/services/sessionController';
import { selectConnection, selectDeviceName, useTelemetryStore } from '@/store/useTelemetryStore';
import { selectCampaignToken, useSessionStore } from '@/store/useSessionStore';

/** Proctor Creek / Bankhead corridor, West Atlanta — the WAWA field area.
 *  Used only as an initial camera position until a real fix arrives. */
const PROCTOR_CREEK_REGION = {
  latitude: 33.7676,
  longitude: -84.4507,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export function LaunchpadScreen() {
  const navigation = useNavigation();
  const connection = useTelemetryStore(selectConnection);
  const deviceName = useTelemetryStore(selectDeviceName);
  const campaignToken = useSessionStore(selectCampaignToken);
  const sensorMode = useSessionStore((s) => s.sensorMode);
  const [region, setRegion] = useState(PROCTOR_CREEK_REGION);
  const [hasFix, setHasFix] = useState(false);
  const [starting, setStarting] = useState(false);

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await startSession({ mode: sensorMode, campaignToken });
      navigation.navigate('Live');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const location = await getCurrentPositionOnce();
      if (cancelled || location === null) return;
      setHasFix(true);
      setRegion((prev) => ({
        ...prev,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const linked = connection === 'subscribed' || connection === 'connected';

  return (
    <View style={styles.screen}>
      <View style={styles.mapWrap}>
        <MapCanvas
          region={region}
          showsUserLocation={hasFix}
          fallbackCaption="Sector Target · Proctor Creek Core Area"
        />

        <StatusPill
          gpsLabel={hasFix ? 'Ready' : 'Acquiring'}
          campaignLabel={campaignToken !== null ? `${campaignToken} Active` : 'Public Muni Layer'}
          showTelemetry={false}
        />

        {/* .launch-btn — 130px circle, inverted fill */}
        <View style={styles.launchWrap} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start expedition"
            onPress={onStart}
            style={({ pressed }) => [styles.launchBtn, pressed && styles.launchBtnPressed]}
          >
            <Text style={styles.launchText}>START</Text>
            <Text style={styles.launchSub}>Ready at 1.0 Hz</Text>
          </Pressable>
        </View>
      </View>

      <Card style={styles.diagCard}>
        <View style={styles.diagHeader}>
          <LabelXS>Hardware Diagnosis</LabelXS>
          <ConnectionStatus showDevice={false} />
        </View>

        <Text style={styles.diagLine}>
          {'• Probe Node: '}
          <Text style={styles.diagValue}>
            {linked ? deviceName ?? POCKETLAB_DEVICE_NAME : 'Not linked'}
          </Text>
        </Text>

        {/* Live EXTERNAL probe reading. Its own leaf component, so the 1 Hz
            updates re-render this row and nothing else on the screen. */}
        <View style={styles.diagLiveRow}>
          <Text style={styles.diagLine}>{'• External Probe: '}</Text>
          <LiveTemperatureReadout compact />
        </View>

        <Text style={styles.diagLine}>
          {'• Sector Target: '}
          <Text style={styles.diagValue}>Proctor Creek Core Area</Text>
        </Text>
      </Card>

      <TabBar active="track" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  mapWrap: { flex: 1, position: 'relative', backgroundColor: COLORS.bg },
  launchWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchBtn: {
    width: 130,
    height: 130,
    borderRadius: 65,
    // Temperate Green token per the Brand Bible functional palette.
    backgroundColor: HEAT.normal,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchBtnPressed: { transform: [{ scale: 0.96 }] },
  launchText: {
    // DARK text on the green, not the inverted light used on the near-black
    // button. White on #2ECC71 is ~2.2:1 contrast, which fails WCAG AA even for
    // large text; #0D1117 on #2ECC71 is ~8.6:1. The Brand Bible mandates
    // "ultra-high-contrast", so the dark treatment is both accessible and on-brand.
    color: COLORS.text,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 20,
    textAlign: 'center',
  },
  launchSub: {
    fontSize: 9,
    // Muted grey would also fail against the green; use the primary text colour
    // at reduced opacity instead.
    color: COLORS.text,
    opacity: 0.7,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  diagCard: { margin: SPACE.s1, padding: 12, gap: 4 },
  diagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  diagLiveRow: { flexDirection: 'row', alignItems: 'center' },
  diagLine: { fontSize: 10, color: COLORS.muted, lineHeight: 14 },
  diagValue: { color: COLORS.text, fontWeight: '700' },
});
