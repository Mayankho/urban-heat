/**
 * Deterministic 1 Hz telemetry simulator.
 *
 * WHY THIS EXISTS
 * ---------------
 * G-01 (undocumented BLE frame layout) blocks a verified decoder, and R-01
 * (react-native-ble-plx 3.5.1 has no New Architecture support and RN 0.86 no
 * longer permits disabling the New Architecture) means real-hardware BLE is
 * unproven until the field spike runs.
 *
 * Neither of those should block the database layer, the Zustand pipeline, the
 * Zero-RAM write path, or the HUD — all of which are Sprint 1 deliverables and
 * all of which are fully testable against a synthetic source. This simulator
 * emits packets through the SAME SensorTelemetryPacket interface as the real
 * adapter, so every downstream consumer is exercised identically.
 *
 * DETERMINISTIC by design: it walks a fixed sinusoidal profile rather than using
 * Math.random(), so two runs produce identical data and a regression in the write
 * path is visible as a diff rather than as noise.
 *
 * The profile deliberately crosses the 95 °F hotspot threshold and the 105 °F
 * Extreme Danger boundary, so the G-06 counter and all five colour bands are
 * exercised on every run.
 */

import { UH_SAMPLE_PERIOD_MS } from '@/config/bleConstants';
import type { SensorTelemetryPacket } from '@/types/telemetry';
import { computeHeatIndexC } from '@/utils/heatIndex';
import { fahrenheitToCelsius } from '@/utils/units';

/** Sweep 78 °F → 108 °F and back, so every band and the hotspot threshold are hit. */
const MIN_F = 78;
const MAX_F = 108;
/** Samples for a full cycle. 240 s at 1 Hz — long enough to look like a walk. */
const CYCLE_SAMPLES = 240;

/** Fixed relative humidity so heat index is exercised rather than null.
 *  NOTE: real PL GT M201 humidity availability is unconfirmed (G-04). */
const SIM_HUMIDITY_PCT = 62;

let timer: ReturnType<typeof setInterval> | null = null;
let tick = 0;

export interface SimulatorCallbacks {
  onPacket: (packet: SensorTelemetryPacket) => void;
}

/** Temperature in °F for a given tick — a smooth triangular-ish sine sweep. */
function tempFahrenheitForTick(n: number): number {
  const phase = (n % CYCLE_SAMPLES) / CYCLE_SAMPLES;
  const mid = (MIN_F + MAX_F) / 2;
  const amplitude = (MAX_F - MIN_F) / 2;
  return mid + amplitude * Math.sin(phase * 2 * Math.PI);
}

export function startSimulator(cb: SimulatorCallbacks): void {
  if (timer !== null) return;
  tick = 0;

  timer = setInterval(() => {
    const tempC = fahrenheitToCelsius(tempFahrenheitForTick(tick));
    const packet: SensorTelemetryPacket = {
      receivedAtUtcMs: Date.now(),
      ambientTempC: tempC,
      humidityPct: SIM_HUMIDITY_PCT,
      heatIndexC: computeHeatIndexC(tempC, SIM_HUMIDITY_PCT),
      // Plausible indoor-desk RSSI, drifting slightly so the diagnostics panel
      // visibly updates.
      rssiDbm: -58 - (tick % 7),
      source: 'SIMULATOR',
      decode: 'ok',
    };
    tick += 1;
    cb.onPacket(packet);
  }, UH_SAMPLE_PERIOD_MS);
}

export function stopSimulator(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

export function isSimulatorRunning(): boolean {
  return timer !== null;
}
