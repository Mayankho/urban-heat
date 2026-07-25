/**
 * Wireframe 1.2 — Campaign Enrollment.
 *
 * OPEN QUESTION (G-12 remainder): no document defines the campaigns table or how
 * a token is validated server-side. The wireframe also offers "Skip to Public Muni
 * Layer", which implies enrollment is OPTIONAL.
 *
 * Sprint 1 therefore stores the token LOCALLY on the session row and performs no
 * server validation. That keeps the offline-first guarantee intact (a token cannot
 * be validated at a trailhead with no signal anyway) and defers the server
 * contract to the sprint that builds Supabase sync.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  HeaderTitle,
  LabelXS,
  LabeledInput,
  PrimaryButton,
  Prompt,
  SecondaryButton,
  Spacer,
} from '@/components/atoms';
import { COLORS, SPACE } from '@/config/theme';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSessionStore } from '@/store/useSessionStore';

export function CampaignEnrollmentScreen() {
  const navigate = useNavigationStore((s) => s.navigate);
  const setCampaignToken = useSessionStore((s) => s.setCampaignToken);
  const [token, setToken] = useState('');

  const onValidate = () => {
    const trimmed = token.trim().toUpperCase();
    setCampaignToken(trimmed.length > 0 ? trimmed : null);
    navigate('bleSync');
  };

  const onSkip = () => {
    setCampaignToken(null);
    navigate('bleSync');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.pad}>
        <HeaderTitle>URBAN HEAT</HeaderTitle>
        <LabelXS>Campaign Directory</LabelXS>
        <Prompt>
          Enter your organization verification token to sync coordinates directly
          with active community field campaigns.
        </Prompt>

        <LabeledInput
          label=""
          value={token}
          onChangeText={setToken}
          placeholder="WAWA-PROCTOR"
          autoCapitalize="characters"
          mono
        />

        <PrimaryButton label="Validate Campaign" onPress={onValidate} />
        <Spacer />
        <SecondaryButton label="Skip to Public Muni Layer" onPress={onSkip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  pad: { flex: 1, padding: SPACE.s3, gap: SPACE.s2 },
});
