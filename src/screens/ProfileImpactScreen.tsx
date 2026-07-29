/**
 * Wireframe 3.2 — Profile & Cumulative Impact.
 *
 * The Impact Matrix (Total Mapped / Expeditions / UHI Hotspots) plus the session
 * feed with per-row CSV download affordance.
 *
 * The UHI Hotspots figure uses the APPROVED G-06 definition: the sum of per-session
 * counters, each incremented once per 1 Hz sample at or above 95 °F.
 *
 * CSV export (G-10) is now implemented — the per-row download control writes the
 * session's trek_points to a file and opens the native share sheet. See
 * services/csvExporter.ts for the column spec and the external-probe provenance
 * note.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LabelXS, PillDot, PortalHeader } from '@/components/atoms';
import { TabBar } from '@/components/TabBar';
import { COLORS, HEAT, SPACE, TABULAR_NUMS } from '@/config/theme';
import { getCumulativeImpact, listSessions } from '@/database/sessionsRepo';
import { selectAuthEmail, useAuthStore } from '@/store/useAuthStore';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { exportSessionCsv } from '@/services/csvExporter';
import { selectTemperatureUnit, useSettingsStore } from '@/store/useSettingsStore';
import type { CumulativeImpact, TrekSession } from '@/types/session';
import { bandForCelsius } from '@/utils/heatBand';
import {
  formatDistanceMiles,
  formatDurationCompact,
  formatTemp,
  unitSuffix,
} from '@/utils/units';

function ImpactCard({
  label,
  value,
  hot = false,
  divider = false,
}: {
  label: string;
  value: string;
  hot?: boolean;
  divider?: boolean;
}) {
  return (
    <View style={[styles.impactCard, divider && styles.impactDivider]}>
      <Text style={styles.impactLabel}>{label}</Text>
      <Text style={[styles.impactValue, hot && styles.impactValueHot]}>{value}</Text>
    </View>
  );
}

function SessionRow({
  session,
  onExport,
  busy,
}: {
  session: TrekSession;
  onExport: () => void;
  busy: boolean;
}) {
  const unit = useSettingsStore(selectTemperatureUnit);
  const band = bandForCelsius(session.avgTempC);
  const durationSeconds =
    session.endedAtUtc === null
      ? 0
      : Math.floor((session.endedAtUtc - session.startedAtUtc) / 1000);
  const date = new Date(session.startedAtUtc);
  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <View style={styles.row}>
      <View style={styles.rowMeta}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {session.name}
        </Text>
        <View style={styles.rowStats}>
          <Text style={styles.rowStat}>{dateLabel}</Text>
          <Text style={styles.rowStat}>{formatDurationCompact(durationSeconds)}</Text>
          <View style={styles.rowAvg}>
            <PillDot color={band?.color ?? COLORS.muted} />
            <Text style={styles.rowStat}>
              {formatTemp(session.avgTempC, unit)}
              {unitSuffix(unit)}
            </Text>
          </View>
          {session.endedAtUtc === null ? (
            <Text style={styles.rowUnfinished}>UNFINISHED</Text>
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Export ${session.name} as CSV`}
        accessibilityState={{ busy }}
        onPress={onExport}
        disabled={busy}
        style={[styles.download, busy && styles.downloadBusy]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.text} />
        ) : (
          <Text style={styles.downloadGlyph}>↓</Text>
        )}
      </Pressable>
    </View>
  );
}

export function ProfileImpactScreen() {
  const navigation = useNavigation();
  const email = useAuthStore(selectAuthEmail);
  const [impact, setImpact] = useState<CumulativeImpact | null>(null);
  const [sessions, setSessions] = useState<TrekSession[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setImpact(getCumulativeImpact());
    setSessions(listSessions());
  }, []);

  // Re-read on every focus so a session saved on Screen 3.1 appears immediately
  // when the user navigates back here.
  useFocusEffect(refresh);

  const onExport = useCallback(async (sessionId: string) => {
    setExportingId(sessionId);
    setNotice(null);
    const result = await exportSessionCsv(sessionId);
    setExportingId(null);
    setNotice(
      result.ok
        ? result.message ?? `Exported ${result.rowCount?.toLocaleString()} rows — ${result.fileName}`
        : `Export failed: ${result.message ?? 'unknown error'}`
    );
  }, []);

  return (
    <View style={styles.screen}>
      <PortalHeader
        title="URBAN HEAT OPERATOR PORTAL"
        subtitle={
          email !== null
            ? `Operator: ${email}`
            : 'Organization: West Atlanta Watershed Alliance'
        }
      />

      <View style={styles.impactPanel}>
        <ImpactCard
          label="Total Mapped"
          value={`${formatDistanceMiles(impact?.totalDistanceMeters ?? 0, 1)} mi`}
        />
        <ImpactCard label="Expeditions" value={`${impact?.expeditionCount ?? 0}`} divider />
        <ImpactCard
          label="UHI Hotspots"
          value={`${impact?.hotspotCount ?? 0} 🚨`}
          hot
          divider
        />
      </View>

      {/* Entry point to Screen 3.3. Wireframes 3.2 and 3.3 both show the Profile
          tab active, so Diagnostics is reached from here — without this the whole
          screen was unreachable in the running app. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Settings')}
        style={styles.settingsRow}
      >
        <Text style={styles.settingsLabel}>System Settings &amp; Diagnostics</Text>
        <Text style={styles.settingsChevron}>›</Text>
      </Pressable>

      <ScrollView style={styles.feed} contentContainerStyle={styles.feedContent}>
        {sessions.length === 0 ? (
          <View style={styles.empty}>
            <LabelXS>No expeditions recorded</LabelXS>
            <Text style={styles.emptyText}>
              Completed transects appear here with their cumulative impact.
            </Text>
          </View>
        ) : (
          sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              busy={exportingId === session.id}
              onExport={() => void onExport(session.id)}
            />
          ))
        )}
        {notice !== null ? <Text style={styles.notice}>{notice}</Text> : null}
      </ScrollView>

      <TabBar active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  impactPanel: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  impactCard: { flex: 1, paddingVertical: 12, paddingHorizontal: SPACE.s1, alignItems: 'center' },
  impactDivider: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  impactLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    color: COLORS.muted,
    letterSpacing: 1,
    fontWeight: '600',
  },
  impactValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
    fontVariant: TABULAR_NUMS,
  },
  impactValueHot: { color: HEAT.danger },
  feed: { flex: 1 },
  feedContent: { padding: SPACE.s2, gap: SPACE.s1 },
  row: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.s2,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.s2,
  },
  rowMeta: { gap: 4, flexShrink: 1, flex: 1 },
  rowTitle: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  rowStats: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  rowStat: { fontSize: 9.5, color: COLORS.muted, fontVariant: TABULAR_NUMS },
  rowAvg: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowUnfinished: { fontSize: 8, color: HEAT.crit, fontWeight: '800', letterSpacing: 0.5 },
  download: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBusy: { opacity: 0.6 },
  downloadGlyph: { fontSize: 14, color: COLORS.text },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: SPACE.s3,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingsLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.text,
  },
  settingsChevron: { fontSize: 16, color: COLORS.muted },
  empty: { padding: SPACE.s3, gap: SPACE.s1, alignItems: 'center' },
  emptyText: { fontSize: 10, color: COLORS.muted, textAlign: 'center', lineHeight: 15 },
  notice: { fontSize: 9.5, color: HEAT.crit, lineHeight: 14, paddingTop: SPACE.s1 },
});
