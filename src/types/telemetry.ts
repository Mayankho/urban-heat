/**
 * Canonical telemetry types — the hardware-agnostic boundary.
 *
 * See IMPLEMENTATION_PLAN.md §2.2.
 */

export type TelemetrySource = 'PL_GT_M201' | 'SIMULATOR' | 'UNKNOWN';

export type DecodeStatus =
  | 'ok'
  | 'unknown_frame_type'
  | 'length_mismatch'
  | 'out_of_range'
  | 'parse_error';

/**
 * Canonical, hardware-agnostic telemetry sample.
 *
 * Produced EXCLUSIVELY by src/services/bleAdapter.ts (or bleSimulator.ts), which
 * is the sole translation boundary between raw BLE bytes and the Urban Heat
 * domain. No UI component, store, or database module ever sees a raw byte, a
 * base64 string, or a react-native-ble-plx object.
 *
 * When proprietary hardware replaces the PocketLab Voyager (PL GT M201), ONLY
 * bleAdapter.ts changes. This interface, useTelemetryStore, the SQLite schema,
 * the HUD, and the CSV exporter remain untouched.
 *
 * Source characteristic: F000AA13-0452-4000-B000-000000000000
 * Parent service:        F000AA11-0452-4000-B000-000000000000
 */
export interface SensorTelemetryPacket {
  /**
   * Monotonic device clock, epoch milliseconds UTC. Stamped by the adapter at the
   * moment the notification is received, NOT by the peripheral — the PL GT M201
   * transmits no timestamp, and trusting a peripheral clock across a reconnect
   * would corrupt the time axis of the transect.
   */
  readonly receivedAtUtcMs: number;

  /**
   * ═══ THE EXTERNAL TEMPERATURE PROBE, in CELSIUS. ═══
   *
   * This is the scientifically meaningful reading and the ONLY one persisted to
   * trek_points.ambient_temp_c, charted, or exported.
   *
   * The PL GT M92 stream carries TWO thermal channels — confirmed against a
   * PocketLab export ("Internal Temperature Probe Jul 28 2026.csv", 68 samples
   * at 1.00 s):
   *   • Internal Temperature (PCB):  25.8–25.9 °C   range 0.1 °C  — near-constant
   *   • Temperature Probe (external): 25.3–33.3 °C  range 8.0 °C  — responsive
   *
   * The internal channel measures the inside of the sensor's own enclosure. Using
   * it for an Urban Heat Island transect would be meaningless — it reports the
   * box's self-heating, not the street. It is retained for diagnostics only.
   *
   * Canonical unit is Celsius; Fahrenheit exists only at the presentation layer.
   * null when the frame carried no valid external reading.
   */
  readonly ambientTempC: number | null;

  /**
   * Internal PCB temperature in CELSIUS — DIAGNOSTIC ONLY.
   *
   * Never written to trek_points, never charted, never exported. Surfaced on
   * Screen 3.3 so a field operator can confirm the two channels are being told
   * apart correctly: the internal reading should sit near room temperature and
   * barely move, while the external probe tracks the environment.
   */
  readonly internalTempC: number | null;

  /**
   * Relative humidity, percent (0–100). null when the proxy hardware does not
   * expose humidity — see IMPLEMENTATION_PLAN.md G-04.
   *
   * Do NOT default this to 0. A false 0% RH silently corrupts every downstream
   * heat-index calculation and would publish a fabricated scientific claim.
   */
  readonly humidityPct: number | null;

  /**
   * NOAA Rothfusz heat index in CELSIUS, or null when it cannot be computed
   * (missing humidity, or temperature below the algorithm's valid floor).
   * Derived by the adapter, never transmitted by hardware. See utils/heatIndex.ts.
   */
  readonly heatIndexC: number | null;

  /**
   * Radio signal strength in dBm, surfaced on Wireframe Screen 3.3 diagnostics
   * ("BLE Strength: -62 dBm (Strong)"). null if unavailable this frame.
   */
  readonly rssiDbm: number | null;

  /** Provenance of this sample — lets the UI and CSV distinguish real hardware
   *  from the development simulator without inspecting call sites. */
  readonly source: TelemetrySource;

  /** Adapter decode outcome. Only 'ok' packets are persisted; anything else is
   *  counted for diagnostics and dropped, never written as a partial row. */
  readonly decode: DecodeStatus;

  /**
   * Uppercase hex of the raw frame. POPULATED ONLY IN __DEV__.
   *
   * At 1 Hz over a 60-minute transect, retaining a hex string per packet
   * accumulates unbounded string garbage in the JS heap for the entire session —
   * a direct violation of the Zero-RAM guardrail. Invaluable for reverse-
   * engineering the frame layout (G-01), unacceptable in a release build.
   */
  readonly rawHex?: string;
}

/** A GPS fix, owned by expo-location. Deliberately NOT part of the sensor packet
 *  — fusing the two streams is a separate concern (see services/trekWriter.ts). */
export interface PositionFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters: number | null;
  readonly capturedAtUtcMs: number;
}

/** Live BLE link state, driven by the adapter, consumed by Screens 1.3 / 2.1. */
export type BleConnectionState =
  | 'idle'
  | 'unauthorized'
  | 'bluetooth_off'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'subscribed'
  | 'disconnected'
  | 'error';
