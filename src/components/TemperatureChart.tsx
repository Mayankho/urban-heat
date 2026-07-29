/**
 * Session temperature chart — X: elapsed time, Y: EXTERNAL probe temperature.
 *
 * Reads the completed session's points from SQLite rather than from any store, so
 * it charts the DURABLE record. If the chart and the database ever disagree, the
 * database is the truth and the operator should see the truth.
 *
 * ONLY the external probe is plotted. The internal PCB channel measures the
 * inside of the sensor's enclosure and would draw a near-flat line that says
 * nothing about the street — see types/telemetry.ts for the channel split.
 *
 * DOWNSAMPLING
 * ------------
 * A 1 Hz transect produces ~3,600 points per hour. Handing that to a chart is
 * both unreadable and slow, so the series is decimated to at most MAX_POINTS
 * buckets using min/max-preserving selection: within each bucket we keep the
 * EXTREME value rather than an average, because averaging would erase exactly the
 * heat spikes this chart exists to reveal.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, HEAT, SPACE, TYPE } from '@/config/theme';
import { getPointsBySession } from '@/database/trekPointsRepo';
import { selectTemperatureUnit, useSettingsStore } from '@/store/useSettingsStore';
import { HOTSPOT_THRESHOLD_F } from '@/utils/heatBand';
import { celsiusToFahrenheit, unitSuffix } from '@/utils/units';
import { LabelXS } from './atoms';

/** Upper bound on plotted points — beyond this the line is unreadable anyway. */
const MAX_POINTS = 60;
/** X-axis tick count; more than this and the labels collide. */
const X_LABELS = 5;

interface Series {
  values: number[];
  labels: string[];
  minV: number;
  maxV: number;
  count: number;
}

/** mm:ss for the X axis. */
function elapsedLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TemperatureChart({ sessionId }: { sessionId: string }) {
  const unit = useSettingsStore(selectTemperatureUnit);
  const { width } = useWindowDimensions();

  const series = useMemo<Series | null>(() => {
    const points = getPointsBySession(sessionId).filter((p) => p.ambientTempC !== null);
    if (points.length < 2) return null;

    const startedAt = points[0]!.timestampUtc;
    const toDisplay = (c: number) => (unit === 'F' ? celsiusToFahrenheit(c) : c);

    // Bucketed extreme-preserving downsample. Averaging would flatten the spikes.
    const bucketSize = Math.max(1, Math.ceil(points.length / MAX_POINTS));
    const values: number[] = [];
    const times: number[] = [];

    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      let pick = bucket[0]!;
      let pickAbs = Math.abs(pick.ambientTempC!);
      for (const p of bucket) {
        const a = Math.abs(p.ambientTempC!);
        if (a > pickAbs) {
          pick = p;
          pickAbs = a;
        }
      }
      values.push(toDisplay(pick.ambientTempC!));
      times.push((pick.timestampUtc - startedAt) / 1000);
    }

    // Sparse X labels so they do not overlap.
    const labelEvery = Math.max(1, Math.floor(values.length / X_LABELS));
    const labels = times.map((t, i) => (i % labelEvery === 0 ? elapsedLabel(t) : ''));

    return {
      values,
      labels,
      minV: Math.min(...values),
      maxV: Math.max(...values),
      count: points.length,
    };
  }, [sessionId, unit]);

  if (series === null) {
    return (
      <View style={styles.empty}>
        <LabelXS>Temperature Profile</LabelXS>
        <Text style={styles.emptyText}>
          Not enough temperature samples in this session to plot a curve.
        </Text>
      </View>
    );
  }

  const hotspotLine = unit === 'F' ? HOTSPOT_THRESHOLD_F : (HOTSPOT_THRESHOLD_F - 32) * (5 / 9);
  const crossesHotspot = series.maxV >= hotspotLine;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <LabelXS>Temperature Profile · External Probe</LabelXS>
        {/* Unit lives here, not on the axis ticks — see formatYLabel below. */}
        <Text style={styles.range}>
          {series.minV.toFixed(1)}–{series.maxV.toFixed(1)}
          {unitSuffix(unit)}
        </Text>
      </View>

      <LineChart
        data={{
          labels: series.labels,
          datasets: [
            {
              data: series.values,
              // Per-dataset colour at FULL opacity. The chartConfig `color`
              // callback is also used for grid/fill, where chart-kit passes a low
              // opacity — relying on it alone renders the trace washed-out pink
              // instead of the --danger red the Brand Bible specifies.
              color: () => HEAT.danger,
              strokeWidth: 2,
            },
          ],
        }}
        width={width - SPACE.s3 * 2}
        height={180}
        withDots={false}
        withInnerLines
        withOuterLines={false}
        withShadow={false}
        // Whole degrees on the axis, unit in the header. With one decimal AND a
        // "°F" suffix the labels outgrow chart-kit's reserved gutter and get
        // clipped to ".0°F" — verified on device.
        formatYLabel={(v) => `${Math.round(Number(v))}`}
        segments={4}
        chartConfig={{
          backgroundGradientFrom: COLORS.surface,
          backgroundGradientTo: COLORS.surface,
          decimalPlaces: 0,
          color: (o = 1) => `rgba(231, 76, 60, ${o})`, // --danger
          labelColor: (o = 1) => `rgba(88, 96, 105, ${o})`, // --muted
          propsForBackgroundLines: { stroke: COLORS.border, strokeDasharray: '' },
          propsForLabels: { fontSize: 9, fontFamily: TYPE.monoFamily },
        }}
        bezier
        style={styles.chart}
      />

      <Text style={styles.caption}>
        {series.count.toLocaleString()} samples at 1 Hz · X: elapsed (mm:ss)
        {crossesHotspot ? ` · crosses the ${hotspotLine.toFixed(0)}${unitSuffix(unit)} hotspot threshold` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  range: {
    fontSize: 10,
    color: COLORS.text,
    fontWeight: '700',
    fontFamily: TYPE.monoFamily,
  },
  chart: {
    borderWidth: 1,
    borderColor: COLORS.border,
    // The wireframe is explicitly "flat / rigid" — chart-kit rounds by default.
    borderRadius: 0,
    paddingRight: SPACE.s4,
  },
  caption: { fontSize: 9, color: COLORS.muted, lineHeight: 13 },
  empty: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: SPACE.s2,
    gap: 6,
  },
  emptyText: { fontSize: 10, color: COLORS.muted, lineHeight: 15 },
  hotspot: { color: HEAT.danger },
});
