/**
 * Wireframe 3.1 — Trek Data Validation ("Save Session").
 *
 * Rename, set privacy, and upload the trek that just finished. Reads the completed
 * session from SQLite rather than from the telemetry store, so the summary shown
 * is the DURABLE record — if the two ever disagree, the disk is the truth and the
 * operator should see the truth.
 *
 * Cloud upload is NOT implemented this sprint (docs/05 scopes Sprint 1 as
 * "Architecture & Local Cache Baseline"; Supabase sync appears in no Task 1.x).
 * The button saves metadata locally and marks the session pending sync.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  HeaderTitle,
  LabelXS,
  LabeledInput,
  PrimaryButton,
  SecondaryButton,
  SegmentedToggle,
  Spacer,
} from '@/components/atoms';
import { TemperatureChart } from '@/components/TemperatureChart';
import { exportSessionCsv } from '@/services/csvExporter';
import { COLORS, HEAT, SPACE } from '@/config/theme';
import { getSession, updateSessionMeta } from '@/database/sessionsRepo';
import { useNavigation } from '@react-navigation/native';
import { usePolylineStore } from '@/store/usePolylineStore';
import { selectTemperatureUnit, useSettingsStore } from '@/store/useSettingsStore';
import { useSessionStore } from '@/store/useSessionStore';
import type { PrivacyMode, TrekSession } from '@/types/session';
import { formatDistanceMiles, formatTemp, unitSuffix } from '@/utils/units';

const PRIVACY_OPTIONS: ReadonlyArray<{ value: PrivacyMode; label: string }> = [
  { value: 'public_muni', label: 'Public Muni Layer' },
  { value: 'private_wawa', label: 'Private WAWA Archive' },
];

export function ValidationScreen() {
  const navigation = useNavigation();
  const sessionId = useSessionStore((s) => s.activeSessionId);
  const draftName = useSessionStore((s) => s.draftName);
  const setDraftName = useSessionStore((s) => s.setDraftName);
  const draftPrivacy = useSessionStore((s) => s.draftPrivacy);
  const setDraftPrivacy = useSessionStore((s) => s.setDraftPrivacy);
  const unit = useSettingsStore(selectTemperatureUnit);
  const resetPolyline = usePolylineStore((s) => s.reset);

  const [summary, setSummary] = useState<TrekSession | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const onExportCsv = async () => {
    if (sessionId === null || exporting) return;
    setExporting(true);
    const result = await exportSessionCsv(sessionId);
    setExporting(false);
    setExportNotice(
      result.ok
        ? result.message ?? `Exported ${result.rowCount?.toLocaleString()} rows — ${result.fileName}`
        : `Export failed: ${result.message ?? 'unknown error'}`
    );
  };

  // Read the finalized row from disk — the durable record, not the live store.
  useEffect(() => {
    if (sessionId === null) return;
    setSummary(getSession(sessionId));
  }, [sessionId]);

  const onSave = () => {
    if (sessionId === null) return;
    updateSessionMeta(sessionId, draftName.trim() || 'Untitled Transect', draftPrivacy);
    resetPolyline();
    navigation.navigate('Profile');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pad}>
        <HeaderTitle>Save Session</HeaderTitle>

        {/* .thumb — geospatial thumbnail placeholder. A static map snapshot is a
            follow-up; the numeric summary below is the load-bearing content. */}
        <View style={styles.thumb}>
          {summary !== null ? (
            <View style={styles.thumbStats}>
              <Text style={styles.thumbStat}>
                {formatDistanceMiles(summary.distanceMeters)} mi mapped
              </Text>
              <Text style={styles.thumbStat}>
                {summary.pointCount.toLocaleString()} points at 1 Hz
              </Text>
              <Text style={styles.thumbStat}>
                avg {formatTemp(summary.avgTempC, unit)}
                {unitSuffix(unit)} · max {formatTemp(summary.maxTempC, unit)}
                {unitSuffix(unit)}
              </Text>
              <Text style={[styles.thumbStat, styles.thumbHot]}>
                {summary.hotspotCount.toLocaleString()} UHI hotspot samples 🚨
              </Text>
            </View>
          ) : (
            <Text style={styles.thumbStat}>No session data.</Text>
          )}
        </View>

        {/* Heat profile for the trek just completed — X: elapsed, Y: external
            probe. Read from SQLite, so it reflects the durable record. */}
        {sessionId !== null ? <TemperatureChart sessionId={sessionId} /> : null}

        <LabeledInput
          label="Session Identifier"
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Proctor Creek Sidewalk Run_01"
          autoCapitalize="characters"
        />

        <View style={styles.fieldGroup}>
          <LabelXS>Privacy Configuration</LabelXS>
          <SegmentedToggle
            options={PRIVACY_OPTIONS}
            value={draftPrivacy}
            onChange={setDraftPrivacy}
          />
        </View>

        <Spacer />

        <PrimaryButton label="Upload Session Data Package" onPress={onSave} />
        <SecondaryButton
          label={exporting ? 'Exporting…' : 'Export CSV'}
          onPress={() => void onExportCsv()}
        />
        {exportNotice !== null ? (
          <Text style={styles.note}>{exportNotice}</Text>
        ) : (
          <Text style={styles.note}>
            Saved locally to SQLite and queued for sync. Cloud upload lands in the
            Supabase sprint.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACE.s3, gap: SPACE.s2, flexGrow: 1 },
  thumb: {
    height: 140,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    padding: SPACE.s2,
  },
  thumbStats: { gap: 6 },
  thumbStat: { fontSize: 11, color: COLORS.muted },
  thumbHot: { color: HEAT.danger, fontWeight: '700' },
  fieldGroup: { gap: 4 },
  note: { fontSize: 9.5, color: COLORS.muted, lineHeight: 14 },
});
