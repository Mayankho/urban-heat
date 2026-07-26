/**
 * Wireframe 2.0 — Pre-Trek Launchpad.
 *
 * The circular "INITIALIZE EXPEDITION" control over a context map, plus the
 * hardware diagnosis card and the tab bar.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, LabelXS } from '@/components/atoms';
import { MapCanvas } from '@/components/MapCanvas';
import { StatusPill } from '@/components/StatusPill';
import { TabBar } from '@/components/TabBar';
import { COLORS, SPACE } from '@/config/theme';
import { getCurrentPositionOnce } from '@/services/locationService';
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

export function LaunchpadScreen({ onStart }: { onStart: () => void }) {
  const connection = useTelemetryStore(selectConnection);
  const deviceName = useTelemetryStore(selectDeviceName);
  const campaignToken = useSessionStore(selectCampaignToken);
  const [region, setRegion] = useState(PROCTOR_CREEK_REGION);
  const [hasFix, setHasFix] = useState(false);

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
            onPress={onStart}
            style={({ pressed }) => [styles.launchBtn, pressed && styles.launchBtnPressed]}
          >
            <Text style={styles.launchText}>INITIALIZE</Text>
            <Text style={styles.launchText}>EXPEDITION</Text>
            <Text style={styles.launchSub}>Ready at 1.0 Hz</Text>
          </Pressable>
        </View>
      </View>

      <Card style={styles.diagCard}>
        <LabelXS>Hardware Diagnosis</LabelXS>
        <Text style={styles.diagLine}>
          {'• Probe Node: '}
          <Text style={styles.diagValue}>
            {linked ? `Linked (${deviceName ?? 'PL GT M201'})` : 'Not linked'}
          </Text>
        </Text>
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
    backgroundColor: COLORS.text,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchBtnPressed: { transform: [{ scale: 0.96 }] },
  launchText: {
    color: COLORS.bg,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 11,
    textAlign: 'center',
  },
  launchSub: { fontSize: 9, color: COLORS.muted, marginTop: 4, letterSpacing: 0.5 },
  diagCard: { margin: SPACE.s1, padding: 12, gap: 4 },
  diagLine: { fontSize: 10, color: COLORS.muted, lineHeight: 14 },
  diagValue: { color: COLORS.text, fontWeight: '700' },
});
