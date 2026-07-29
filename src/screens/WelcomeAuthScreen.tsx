/**
 * Wireframe 1.1 — Welcome & Auth.
 *
 * OFFLINE-FIRST BEHAVIOUR (G-12): if a cached Supabase session already exists in
 * AsyncStorage, this screen is skipped entirely — a volunteer who signed in at
 * WAWA headquarters on WiFi lands straight in the flow with no connectivity.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  LabeledInput,
  PrimaryButton,
  Prompt,
  SecondaryButton,
  Spacer,
} from '@/components/atoms';
import { COLORS, HEAT, SPACE } from '@/config/theme';
import { signInWithPassword } from '@/services/supabaseClient';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigation } from '@react-navigation/native';

export function WelcomeAuthScreen() {
  const navigation = useNavigation();
  const setSession = useAuthStore((s) => s.setSession);
  const isLocalOnly = useAuthStore((s) => s.isLocalOnlyBuild);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    const result = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (result.ok) {
      setSession(email.trim());
      navigation.navigate('Enrollment');
    } else {
      setError(result.message);
    }
  };

  return (
    <View style={styles.screen}>
      {/* .s11-top — brand block, 40% height, bottom-bordered */}
      <View style={styles.top}>
        <Text style={styles.mark}>URBAN</Text>
        <Text style={[styles.mark, styles.markAccent]}>HEAT</Text>
        <Text style={styles.sub}>Pedestrian Microclimate Intelligence Network</Text>
        {/* .ticks — 5 rules, 2nd green, 4th critical-orange */}
        <View style={styles.ticks}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.tick,
                i === 1 && { backgroundColor: HEAT.normal },
                i === 3 && { backgroundColor: HEAT.crit },
              ]}
            />
          ))}
        </View>
      </View>

      {/* .s11-bottom — surface panel with the credential fields */}
      <ScrollView style={styles.bottom} contentContainerStyle={styles.bottomContent}>
        <LabeledInput
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="scientist@wawa-atl.org"
          keyboardType="email-address"
        />
        <LabeledInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••••••"
          secureTextEntry
        />

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}

        {isLocalOnly ? (
          <Prompt>
            This build has no Supabase project configured, so cloud sign-in is
            unavailable. Local recording to SQLite works fully — continue in
            local-only mode.
          </Prompt>
        ) : null}

        <Spacer />

        <PrimaryButton
          label={busy ? 'Signing In…' : 'Sign In'}
          onPress={onSignIn}
          disabled={busy || isLocalOnly}
        />
        {isLocalOnly ? (
          <SecondaryButton
            label="Continue in local-only mode"
            onPress={() => navigation.navigate('Enrollment')}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  top: {
    flex: 0.4,
    justifyContent: 'center',
    padding: SPACE.s3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mark: { fontSize: 34, fontWeight: '800', letterSpacing: 4, lineHeight: 36, color: COLORS.text },
  markAccent: { color: HEAT.danger },
  sub: { color: COLORS.muted, fontSize: 11, letterSpacing: 1, marginTop: SPACE.s2 },
  ticks: { flexDirection: 'row', gap: 4, marginTop: SPACE.s3 },
  tick: { height: 3, flex: 1, backgroundColor: COLORS.border },
  bottom: { flex: 1, backgroundColor: COLORS.surface },
  bottomContent: { padding: SPACE.s3, gap: SPACE.s2, flexGrow: 1 },
  error: { color: HEAT.danger, fontSize: 11, lineHeight: 16 },
});
