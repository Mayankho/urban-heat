/**
 * TASK 1.2 — The Zustand Telemetry Pipeline.
 *
 * ============================================================================
 *  MANDATE: `useState` and React Context are BANNED for the 1 Hz BLE stream.
 * ============================================================================
 *
 * This store is the ONLY destination for live sensor data. It exists because at
 * 1 Hz, React state would trigger a full reconciliation every second for the
 * entire session — on Screen 2.1 that means re-rendering a map, a polyline, four
 * HUD quadrants, and a gesture-driven slider once per second, indefinitely.
 *
 * TWO INVARIANTS THAT MUST NOT BE BROKEN
 * --------------------------------------
 * 1. FIXED SIZE (Guardrail 2 / Zero-RAM). Every field below is a scalar. There
 *    is NO array, NO Map, NO growing buffer. The running average is maintained
 *    as a (sum, count) pair rather than by retaining samples to average later.
 *    Total footprint is O(1) for a 10-minute walk and for a 10-hour one.
 *
 *    Do NOT add `recentSamples: SensorTelemetryPacket[]` here, however tempting
 *    it is for a sparkline. That is precisely the unbounded JS array the 15 MB
 *    background ceiling exists to prevent. Read history from SQLite instead.
 *
 * 2. ATOMIC SELECTOR ACCESS. Consumers MUST subscribe with a narrow selector:
 *
 *        const temp = useTelemetryStore((s) => s.currentTempC);   // ✅
 *        const all  = useTelemetryStore();                        // ❌ BANNED
 *
 *    An unselected subscription re-renders on every store mutation and defeats
 *    the entire architecture. Imperative consumers (the SQLite writer, the
 *    polyline appender, the CSV exporter) read via `useTelemetryStore.getState()`
 *    OUTSIDE the React render cycle, costing zero renders.
 */

import { create } from 'zustand';
import type { BleConnectionState, DecodeStatus, SensorTelemetryPacket } from '@/types/telemetry';
import { isHotspotSample } from '@/utils/heatBand';

interface TelemetryState {
  // ---- Live sensor values (the 1 Hz hot fields) ----
  /**
   * Latest EXTERNAL PROBE temperature, CELSIUS. null before the first packet.
   * This is the reading the HUD renders, the DB stores, and the CSV exports.
   */
  currentTempC: number | null;
  /**
   * Latest INTERNAL PCB temperature, CELSIUS — diagnostics only.
   * Surfaced on Screen 3.3 so an operator can confirm the channels are being
   * separated correctly; never persisted, charted, or exported.
   */
  currentInternalTempC: number | null;
  currentHumidityPct: number | null;
  currentHeatIndexC: number | null;
  rssiDbm: number | null;

  // ---- Link state ----
  connection: BleConnectionState;
  deviceName: string | null;
  /** Epoch ms of the last successfully decoded packet — drives a staleness dot. */
  lastPacketAtMs: number | null;

  // ---- Session accumulators (all O(1)) ----
  /** Running sum of valid temperature samples, for the average. */
  tempSumC: number;
  /** Count of valid temperature samples contributing to tempSumC. */
  tempSampleCount: number;
  maxTempC: number | null;
  /** Total rows written to disk this session. */
  pointCount: number;
  /** G-06 counter: samples at or above 95 °F. */
  hotspotCount: number;
  /** Metres accumulated incrementally from GPS fixes. */
  distanceMeters: number;
  /** Whole seconds since recording began, ticked by a 1 Hz timer. */
  elapsedSeconds: number;

  // ---- Diagnostics (Screen 3.3) ----
  /** Count of packets dropped, keyed by why. Fixed-size record, not a log. */
  decodeFailures: Record<Exclude<DecodeStatus, 'ok'>, number>;
  /** GPS fixes discarded for exceeding the staleness limit. */
  staleFixDrops: number;

  // ---- Actions ----
  ingest: (packet: SensorTelemetryPacket) => void;
  noteDecodeFailure: (status: Exclude<DecodeStatus, 'ok'>) => void;
  notePointWritten: () => void;
  noteStaleFixDrop: () => void;
  addDistance: (meters: number) => void;
  setElapsedSeconds: (seconds: number) => void;
  setConnection: (state: BleConnectionState, deviceName?: string | null) => void;
  setRssi: (rssiDbm: number | null) => void;
  /** Reset every accumulator. Called at session start, NOT at session end —
   *  the summary screen still needs the totals after the trek stops. */
  resetSession: () => void;
}

const ZERO_FAILURES: Record<Exclude<DecodeStatus, 'ok'>, number> = {
  unknown_frame_type: 0,
  length_mismatch: 0,
  out_of_range: 0,
  parse_error: 0,
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  currentTempC: null,
  currentInternalTempC: null,
  currentHumidityPct: null,
  currentHeatIndexC: null,
  rssiDbm: null,

  connection: 'idle',
  deviceName: null,
  lastPacketAtMs: null,

  tempSumC: 0,
  tempSampleCount: 0,
  maxTempC: null,
  pointCount: 0,
  hotspotCount: 0,
  distanceMeters: 0,
  elapsedSeconds: 0,

  decodeFailures: { ...ZERO_FAILURES },
  staleFixDrops: 0,

  /**
   * THE HOT PATH — called once per second for the entire session.
   *
   * Deliberately does the minimum: updates scalars and returns. The packet
   * argument is NOT retained anywhere; after this returns the caller's reference
   * is the only one, and trekWriter drops it immediately after persisting.
   */
  ingest: (packet) =>
    set((s) => {
      const temp = packet.ambientTempC;
      const hasTemp = temp !== null && Number.isFinite(temp);

      return {
        currentTempC: temp,
        currentInternalTempC: packet.internalTempC,
        currentHumidityPct: packet.humidityPct,
        currentHeatIndexC: packet.heatIndexC,
        rssiDbm: packet.rssiDbm ?? s.rssiDbm,
        lastPacketAtMs: packet.receivedAtUtcMs,

        tempSumC: hasTemp ? s.tempSumC + temp : s.tempSumC,
        tempSampleCount: hasTemp ? s.tempSampleCount + 1 : s.tempSampleCount,
        maxTempC: hasTemp
          ? s.maxTempC === null
            ? temp
            : Math.max(s.maxTempC, temp)
          : s.maxTempC,
        hotspotCount: isHotspotSample(temp) ? s.hotspotCount + 1 : s.hotspotCount,
      };
    }),

  noteDecodeFailure: (status) =>
    set((s) => ({
      decodeFailures: { ...s.decodeFailures, [status]: s.decodeFailures[status] + 1 },
    })),

  notePointWritten: () => set((s) => ({ pointCount: s.pointCount + 1 })),

  noteStaleFixDrop: () => set((s) => ({ staleFixDrops: s.staleFixDrops + 1 })),

  addDistance: (meters) => set((s) => ({ distanceMeters: s.distanceMeters + meters })),

  setElapsedSeconds: (seconds) => set({ elapsedSeconds: seconds }),

  setConnection: (state, deviceName) =>
    set((s) => ({
      connection: state,
      deviceName: deviceName === undefined ? s.deviceName : deviceName,
    })),

  setRssi: (rssiDbm) => set({ rssiDbm }),

  resetSession: () =>
    set({
      currentTempC: null,
      currentInternalTempC: null,
      currentHumidityPct: null,
      currentHeatIndexC: null,
      lastPacketAtMs: null,
      tempSumC: 0,
      tempSampleCount: 0,
      maxTempC: null,
      pointCount: 0,
      hotspotCount: 0,
      distanceMeters: 0,
      elapsedSeconds: 0,
      decodeFailures: { ...ZERO_FAILURES },
      staleFixDrops: 0,
    }),
}));

/**
 * ---------------------------------------------------------------------------
 *  ATOMIC SELECTORS
 * ---------------------------------------------------------------------------
 * Use these rather than inlining selectors at call sites. Each is a stable
 * function reference returning a PRIMITIVE, so zustand's default Object.is
 * comparison prevents a re-render unless that specific value actually changed.
 *
 * A temperature tick therefore re-renders the temperature text node and nothing
 * else — not the map, not the polyline, not the slider, not the parent screen.
 */
export const selectCurrentTempC = (s: TelemetryState) => s.currentTempC;
/** Internal PCB channel — Screen 3.3 diagnostics only. */
export const selectCurrentInternalTempC = (s: TelemetryState) => s.currentInternalTempC;

/**
 * True when the sensor link is live AND packets are actually arriving.
 *
 * Deliberately stricter than `connection === 'subscribed'`: a subscription can
 * attach to a characteristic that never fires, which would show "Connected" over
 * a dead stream. Requiring a recent packet means the indicator reflects data
 * flowing, not merely a socket being open.
 */
export const selectIsStreaming = (s: TelemetryState): boolean =>
  s.connection === 'subscribed' &&
  s.lastPacketAtMs !== null &&
  Date.now() - s.lastPacketAtMs < 5000;
export const selectCurrentHumidity = (s: TelemetryState) => s.currentHumidityPct;
export const selectCurrentHeatIndexC = (s: TelemetryState) => s.currentHeatIndexC;
export const selectRssi = (s: TelemetryState) => s.rssiDbm;
export const selectConnection = (s: TelemetryState) => s.connection;
export const selectDeviceName = (s: TelemetryState) => s.deviceName;
export const selectElapsedSeconds = (s: TelemetryState) => s.elapsedSeconds;
export const selectDistanceMeters = (s: TelemetryState) => s.distanceMeters;
export const selectPointCount = (s: TelemetryState) => s.pointCount;
export const selectHotspotCount = (s: TelemetryState) => s.hotspotCount;
export const selectMaxTempC = (s: TelemetryState) => s.maxTempC;

/**
 * Session mean temperature — Screen 2.1 HUD "Session Average".
 *
 * Derived from the (sum, count) pair, so it costs O(1) and requires retaining no
 * samples. Returns a primitive, keeping it safe as a selector.
 */
export const selectAvgTempC = (s: TelemetryState): number | null =>
  s.tempSampleCount === 0 ? null : s.tempSumC / s.tempSampleCount;

/** True when the link has gone quiet for more than ~3 sample periods. */
export const selectIsStale = (s: TelemetryState): boolean => {
  if (s.lastPacketAtMs === null) return false;
  return Date.now() - s.lastPacketAtMs > 3000;
};

/** Total dropped packets across all decode failure modes — Screen 3.3. */
export const selectTotalDecodeFailures = (s: TelemetryState): number =>
  s.decodeFailures.unknown_frame_type +
  s.decodeFailures.length_mismatch +
  s.decodeFailures.out_of_range +
  s.decodeFailures.parse_error;
