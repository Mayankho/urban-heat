/**
 * Wireframe 1.4 — Location Hard Gate.
 *
 * THIS IS A HARD BLOCK BY DESIGN. The wireframe shows "Proceed to App Launchpad"
 * disabled with a padlock at opacity .3, and that is the correct product
 * behaviour: Urban Heat would rather not run than produce a truncated transect.
 *
 * The two-step Android 11+ permission dance is implemented literally as the
 * wireframe's schematic describes it, because the wireframe is already describing
 * correct platform behaviour — on API 30+ the OS shows no inline "Always Allow"
 * option and routes the user to app settings.
 *
 * We add one thing the wireframe omits: an actual deep-link button. The wireframe
 * gives three manual navigation steps but no control, and manual-navigation-only
 * is a needless drop-off for a volunteer standing in 100 °F heat.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  PrimaryButton,
  Prompt,
  SecondaryButton,
  Spacer,
} from '@/components/atoms';
import { COLORS, HEAT, SPACE } from '@/config/theme';
import { IN_APP_LOCATION_RATIONALE } from '@/config/complianceCopy';
import {
  checkBackgroundLocationGranted,
  openAppSettings,
  requestBackgroundLocation,
  requestForegroundLocation,
} from '@/services/permissionsService';
import { useNavigationStore } from '@/store/useNavigationStore';

export function LocationGateScreen() {
  const navigate = useNavigationStore((s) => s.navigate);
  const [granted, setGranted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recheck = useCallback(async () => {
    const ok = await checkBackgroundLocationGranted();
    setGranted(ok);
    if (ok) setMessage(null);
    return ok;
  }, []);

  // Re-check on every return to foreground. We must NEVER trust that the user
  // actually made the change while they were away in system settings.
  useEffect(() => {
    void recheck();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void recheck();
    });
    return () => subscription.remove();
  }, [recheck]);

  const onRequest = async () => {
    setBusy(true);

    // STEP 2 — foreground first. Android 11+ refuses background otherwise.
    const foreground = await requestForegroundLocation();
    if (foreground !== 'granted') {
      setBusy(false);
      setMessage(
        foreground === 'blocked'
          ? 'Location permission is permanently denied. Grant it in System Settings, then return here.'
          : 'Foreground location is required before background access can be requested.'
      );
      return;
    }

    // STEP 3 — background, as a SEPARATE request.
    const background = await requestBackgroundLocation();
    setBusy(false);

    if (background === 'granted') {
      setGranted(true);
      setMessage(null);
      return;
    }

    // Expected on API 30+: no dialog is shown and the user must use settings.
    setMessage(
      "Android requires 'Always Allow' to be set in system settings. Use the button below, then return to this screen."
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.gate}>
        <View style={styles.warnIcon}>
          <Text style={styles.warnText}>!</Text>
        </View>

        <Text style={styles.heading}>{IN_APP_LOCATION_RATIONALE.heading}</Text>

        <Prompt>{IN_APP_LOCATION_RATIONALE.body}</Prompt>

        {/* .schematic — dashed-border numbered steps */}
        <View style={styles.schematic}>
          {IN_APP_LOCATION_RATIONALE.steps.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {message !== null ? <Text style={styles.message}>{message}</Text> : null}

        {granted ? (
          <Text style={styles.grantedText}>
            ● Always Allow granted — continuous background thread available.
          </Text>
        ) : null}

        <Spacer />

        {!granted ? (
          <>
            <PrimaryButton
              label={busy ? 'Requesting…' : 'Grant Background Location'}
              onPress={onRequest}
              disabled={busy}
            />
            <SecondaryButton label="Open System Settings" onPress={openAppSettings} />
          </>
        ) : null}

        {/* The hard gate: locked until ACCESS_BACKGROUND_LOCATION reads granted. */}
        <PrimaryButton
          label="Proceed to App Launchpad"
          locked={!granted}
          onPress={() => navigate('launchpad')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  gate: { flex: 1, padding: SPACE.s3, gap: SPACE.s3 },
  warnIcon: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderColor: HEAT.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnText: { color: HEAT.danger, fontSize: 26, fontWeight: '800' },
  heading: { fontSize: 15, fontWeight: '800', letterSpacing: 1, lineHeight: 20, color: COLORS.text },
  schematic: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: SPACE.s2,
    gap: SPACE.s1,
    backgroundColor: COLORS.surface,
  },
  step: { flexDirection: 'row', gap: SPACE.s1, alignItems: 'center' },
  stepNum: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 9, color: COLORS.text },
  stepText: { fontSize: 10, color: COLORS.muted, flexShrink: 1 },
  message: { fontSize: 11, color: HEAT.crit, lineHeight: 16 },
  grantedText: { fontSize: 11, color: HEAT.normal, fontWeight: '600' },
});
