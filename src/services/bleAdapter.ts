/**
 * ============================================================================
 *  THE ADAPTER BOUNDARY — the ONLY module permitted to import ble-plx.
 * ============================================================================
 *
 * docs/04 mandate: "The mobile app must never tightly couple UI components to
 * the PocketLab. All raw incoming Bluetooth data must pass through an isolated
 * Adapter (src/services/bleAdapter.ts). This normalizes the hex bytes into a
 * standard SensorTelemetryPacket interface."
 *
 * Nothing downstream of this file knows what a byte is. Swapping the PocketLab
 * Voyager for proprietary hardware means editing decodeFrame() below and
 * POCKETLAB_DEVICE_NAME in config/bleConstants.ts. Nothing else moves.
 *
 * ============================================================================
 *  ⚠️  G-01 — THE FRAME BYTE LAYOUT IS NOT DOCUMENTED ANYWHERE.
 * ============================================================================
 *
 * docs/04 supplies the Service UUID and the Notification Characteristic UUID but
 * NO payload structure: no byte offsets, no endianness, no scaling factors, no
 * frame-type discriminator, no MTU.
 *
 * I have NOT invented one. `decodeFrame` dispatches to a pluggable decoder that
 * defaults to UNVERIFIED_DECODER, which:
 *   • logs the raw hex in __DEV__ so the layout can be derived empirically
 *   • applies candidate interpretations
 *   • REJECTS anything failing the plausibility gate in bleConstants.ts
 *
 * The plausibility gate is the real safety mechanism: a misparsed frame is far
 * more likely to yield -1370.25 °C than 31.2 °C, so out-of-range values are
 * dropped and counted rather than persisted. A plausible-but-wrong value that
 * reaches the database is unrecoverable scientific corruption; a dropped frame
 * is a visible, countable gap.
 *
 * TO CLOSE G-01: capture frames from a live PL GT M201 (this module's dev hex log
 * or nRF Connect), determine the true layout, then implement a verified decoder
 * and set ACTIVE_DECODER to it. That is a single-function change.
 */

import {
  BleManager,
  type Characteristic,
  type Device,
  type Subscription,
  State as BluetoothState,
} from 'react-native-ble-plx';
import {
  BLE_SCAN_TIMEOUT_MS,
  HUMIDITY_PLAUSIBLE_MAX_PCT,
  HUMIDITY_PLAUSIBLE_MIN_PCT,
  POCKETLAB_DEVICE_NAME,
  TEMP_PLAUSIBLE_MAX_C,
  TEMP_PLAUSIBLE_MIN_C,
  UH_NOTIFY_CHARACTERISTIC_UUID,
  UH_SERVICE_UUID,
  uuidEquals,
} from '@/config/bleConstants';
import type {
  BleConnectionState,
  DecodeStatus,
  SensorTelemetryPacket,
} from '@/types/telemetry';
import { computeHeatIndexC } from '@/utils/heatIndex';

// ---------------------------------------------------------------------------
// Byte utilities
// ---------------------------------------------------------------------------

/** base64 → bytes. React Native has no Buffer, and atob is not guaranteed. */
function base64ToBytes(b64: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const idx = table.indexOf(clean[i]!);
    if (idx < 0) continue;
    acc = (acc << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0').toUpperCase();
  return s;
}

// ---------------------------------------------------------------------------
// Decoder strategy
// ---------------------------------------------------------------------------

interface DecodeResult {
  status: DecodeStatus;
  ambientTempC: number | null;
  humidityPct: number | null;
}

type FrameDecoder = (bytes: Uint8Array) => DecodeResult;

const REJECT: DecodeResult = {
  status: 'unknown_frame_type',
  ambientTempC: null,
  humidityPct: null,
};

function isPlausibleTemp(c: number): boolean {
  return Number.isFinite(c) && c >= TEMP_PLAUSIBLE_MIN_C && c <= TEMP_PLAUSIBLE_MAX_C;
}

function isPlausibleHumidity(pct: number): boolean {
  return (
    Number.isFinite(pct) &&
    pct >= HUMIDITY_PLAUSIBLE_MIN_PCT &&
    pct <= HUMIDITY_PLAUSIBLE_MAX_PCT
  );
}

/**
 * UNVERIFIED decoder — active until G-01 is closed against real hardware.
 *
 * Tries the layouts that are conventional for TI SensorTag-derived BLE profiles
 * (the F000AAxx UUID family originates there), in order of likelihood, and
 * accepts the FIRST interpretation that passes the plausibility gate:
 *
 *   A. IEEE-754 float32, little-endian, at offset 0 — °C directly
 *   B. int16 little-endian at offset 0, scaled by 1/100 — centi-°C
 *   C. int16 little-endian at offset 0, scaled by 1/128 — TI IR-temp convention
 *
 * "First plausible interpretation wins" is a HEURISTIC, not a specification. It
 * is explicitly a scaffold to keep the pipeline exercisable, and it is why every
 * packet from this decoder is marked with a source of 'PL_GT_M201' but must be
 * treated as provisional until a verified decoder replaces it.
 *
 * DO NOT SHIP FIELD DATA COLLECTED THROUGH THIS DECODER as validated science
 * until the layout is confirmed.
 */
const UNVERIFIED_DECODER: FrameDecoder = (bytes) => {
  if (bytes.length === 0) {
    return { status: 'length_mismatch', ambientTempC: null, humidityPct: null };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // A. float32 LE
  if (bytes.length >= 4) {
    const f = view.getFloat32(0, true);
    if (isPlausibleTemp(f)) {
      return { status: 'ok', ambientTempC: f, humidityPct: null };
    }
  }

  // B / C. int16 LE with candidate scale factors
  if (bytes.length >= 2) {
    const raw = view.getInt16(0, true);
    for (const scale of [100, 128]) {
      const c = raw / scale;
      if (isPlausibleTemp(c)) {
        return { status: 'ok', ambientTempC: c, humidityPct: null };
      }
    }
    // A well-formed frame we simply cannot interpret is materially different
    // from a garbage frame — surface it as out_of_range so the Screen 3.3
    // diagnostics distinguish "wrong layout" from "corrupt radio".
    return { status: 'out_of_range', ambientTempC: null, humidityPct: null };
  }

  return REJECT;
};

/**
 * G-01 SPIKE SWITCH — set true to log the raw hex of EVERY frame, not only the
 * ones that fail to decode.
 *
 * Leave this ON only while reverse-engineering the PL GT M201 frame layout
 * against a reference thermometer. Turn it OFF once a verified decoder is
 * installed: at 1 Hz it is one console line per second, which is noise in normal
 * use and a real cost in a long session. Has no effect in release builds — the
 * call site is already inside an `__DEV__` guard.
 */
const SPIKE_LOG_EVERY_FRAME = true;

/**
 * Swap this to a verified decoder once the PL GT M201 layout is confirmed.
 * Keeping it a single mutable binding means closing G-01 touches one line.
 */
let ACTIVE_DECODER: FrameDecoder = UNVERIFIED_DECODER;

/** Install a verified decoder (or a test double). */
export function setFrameDecoder(decoder: FrameDecoder): void {
  ACTIVE_DECODER = decoder;
}

/** True while the provisional decoder is in use — surfaced on Screen 3.3 so the
 *  operator can see that readings are not yet layout-verified. */
export function isUsingUnverifiedDecoder(): boolean {
  return ACTIVE_DECODER === UNVERIFIED_DECODER;
}

/**
 * THE TRANSLATION SEAM — raw base64 notification → SensorTelemetryPacket.
 *
 * Exported for unit testing with captured hex, which is how G-01 gets closed.
 */
export function decodeFrame(
  base64Value: string,
  rssiDbm: number | null,
  receivedAtUtcMs: number
): SensorTelemetryPacket {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64Value);
  } catch {
    return {
      receivedAtUtcMs,
      ambientTempC: null,
      humidityPct: null,
      heatIndexC: null,
      rssiDbm,
      source: 'PL_GT_M201',
      decode: 'parse_error',
    };
  }

  const result = ACTIVE_DECODER(bytes);

  const humidityPct =
    result.humidityPct !== null && isPlausibleHumidity(result.humidityPct)
      ? result.humidityPct
      : null;

  const packet: SensorTelemetryPacket = {
    receivedAtUtcMs,
    ambientTempC: result.status === 'ok' ? result.ambientTempC : null,
    humidityPct,
    // Derived here so the value the operator sees in the field is the value that
    // reaches the CSV. Returns null when humidity is absent — no fabricated RH.
    heatIndexC:
      result.status === 'ok'
        ? computeHeatIndexC(result.ambientTempC, humidityPct)
        : null,
    rssiDbm,
    source: 'PL_GT_M201',
    decode: result.status,
    // Populated in __DEV__, and also in ANY build while the G-01 spike is on —
    // a standalone release APK carried out to the sensor has no Metro and no
    // logcat, so the bytes have to reach the UI to be useful.
    //
    // Still safe against the Zero-RAM guardrail: the packet is transient, and the
    // only thing that RETAINS a frame is useFrameSpikeStore, which is hard-capped.
    ...(__DEV__ || SPIKE_LOG_EVERY_FRAME ? { rawHex: bytesToHex(bytes) } : {}),
  };

  if (SPIKE_LOG_EVERY_FRAME || (__DEV__ && result.status !== 'ok')) {
    // In spike mode we log EVERY frame, not just failures. Rationale: if the
    // provisional decoder happens to accept a plausible-but-WRONG value we would
    // otherwise see a believable number and no hex at all — the worst possible
    // outcome, because it looks like success. Logging every frame lets the bytes
    // be correlated against a reference thermometer, which is what actually
    // closes G-01.
    const decoded =
      packet.ambientTempC === null ? '—' : `${packet.ambientTempC.toFixed(3)}C`;
    console.log(
      `[bleAdapter][G-01] status=${result.status} len=${bytes.length} ` +
        `decoded=${decoded} hex=${bytesToHex(bytes)}`
    );
  }

  return packet;
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

export interface AdapterCallbacks {
  onPacket: (packet: SensorTelemetryPacket) => void;
  onStateChange: (state: BleConnectionState, deviceName?: string | null) => void;
  onError?: (message: string) => void;
}

let manager: BleManager | null = null;
let device: Device | null = null;
let notifySubscription: Subscription | null = null;
let disconnectSubscription: Subscription | null = null;
let callbacks: AdapterCallbacks | null = null;

/** Lazily construct the manager. Constructing it at module scope would spin up
 *  the native radio stack on import, before permissions have been requested. */
function getManager(): BleManager {
  if (manager === null) manager = new BleManager();
  return manager;
}

function emitState(state: BleConnectionState, deviceName?: string | null): void {
  callbacks?.onStateChange(state, deviceName);
}

export function registerCallbacks(cb: AdapterCallbacks): void {
  callbacks = cb;
}

/** Is the radio actually on? Distinguishes "Bluetooth off" from "not found". */
export async function getBluetoothState(): Promise<BluetoothState> {
  return getManager().state();
}

/**
 * Raised when the radio itself is not usable, as distinct from "scan found nothing".
 *
 * Carries the BleConnectionState so the UI can render the right remediation, and a
 * `recoverable` flag so we never invite the user to retry something that can never
 * succeed (a device with no BLE radio at all).
 */
export class BleNotReadyError extends Error {
  readonly connectionState: BleConnectionState;
  readonly recoverable: boolean;

  constructor(message: string, connectionState: BleConnectionState, recoverable: boolean) {
    super(message);
    this.name = 'BleNotReadyError';
    this.connectionState = connectionState;
    this.recoverable = recoverable;
  }
}

/**
 * Resolve the adapter's settled power state.
 *
 * `Resetting` and `Unknown` are transient — they occur while the stack is coming up,
 * notably in the first moments after the app launches. Treating either as a hard
 * failure would produce spurious "Bluetooth is off" errors, so we wait briefly for
 * the adapter to settle before reporting.
 */
async function settledBluetoothState(waitMs: number): Promise<BluetoothState> {
  const manager = getManager();
  const isTransient = (s: BluetoothState) =>
    s === BluetoothState.Resetting || s === BluetoothState.Unknown;

  const immediate = await manager.state();
  if (!isTransient(immediate)) return immediate;

  return new Promise<BluetoothState>((resolve) => {
    let done = false;
    let subscription: Subscription | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (state: BluetoothState) => {
      if (done) return;
      done = true;
      subscription?.remove();
      if (timer !== null) clearTimeout(timer);
      resolve(state);
    };

    timer = setTimeout(() => {
      void manager.state().then(finish);
    }, waitMs);

    subscription = manager.onStateChange((state) => {
      if (!isTransient(state)) finish(state);
    }, false);
  });
}

/**
 * RADIO PRE-FLIGHT — call before any scan.
 *
 * WHY THIS EXISTS: without it, a phone with Bluetooth switched off runs the full
 * 15 s scan timeout and then reports *"No device named 'PL GT M201' found — confirm
 * the sensor is powered on"*. That sends a field volunteer hunting for a hardware
 * fault that does not exist, and during the R-01 spike it would masquerade as
 * evidence that BLE notifications are broken.
 *
 * Distinguishing "radio off" from "sensor absent" is the whole point: they have
 * completely different remedies and completely different diagnostic meanings.
 */
export async function assertBluetoothReady(waitMs = 2500): Promise<void> {
  const state = await settledBluetoothState(waitMs);

  switch (state) {
    case BluetoothState.PoweredOn:
      return;

    case BluetoothState.PoweredOff:
      emitState('bluetooth_off');
      throw new BleNotReadyError(
        'Bluetooth is turned off. Switch it on, then link the sensor again.',
        'bluetooth_off',
        true
      );

    case BluetoothState.Unauthorized:
      // Distinct from a denied runtime grant: the OS is refusing at adapter level.
      emitState('unauthorized');
      throw new BleNotReadyError(
        'Urban Heat is not authorised to use Bluetooth. Enable Nearby devices for this app in system settings.',
        'unauthorized',
        true
      );

    case BluetoothState.Unsupported:
      emitState('error');
      throw new BleNotReadyError(
        'This device has no Bluetooth Low Energy radio, so the hardware sensor cannot be used. Use simulator mode instead.',
        'error',
        false // no retry will ever help
      );

    default:
      emitState('error');
      throw new BleNotReadyError(
        `Bluetooth adapter is not ready (state: ${state}). Wait a moment and try again.`,
        'error',
        true
      );
  }
}

/**
 * Scan for the PL GT M201 and resolve the first match.
 *
 * Filtering by NAME rather than by advertised service UUID is deliberate: many
 * peripherals (the Voyager included) do not advertise their full service list in
 * the advertisement packet, so a service-UUID scan filter can miss the device
 * entirely. docs/04 gives us an exact, verified device name — we use it.
 *
 * Runs the radio pre-flight FIRST, so "Bluetooth is off" is never reported as
 * "sensor not found" after a pointless 15-second wait.
 */
export async function scanForSensor(timeoutMs = BLE_SCAN_TIMEOUT_MS): Promise<Device> {
  // Throws BleNotReadyError with an accurate, actionable message.
  await assertBluetoothReady();

  const bleManager = getManager();
  emitState('scanning');

  return new Promise<Device>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      bleManager.stopDeviceScan();
      emitState('error');
      reject(
        new Error(
          `No device named "${POCKETLAB_DEVICE_NAME}" found within ${timeoutMs / 1000}s. ` +
            'Confirm the sensor is powered on and not already connected to another phone.'
        )
      );
    }, timeoutMs);

    bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, scanned) => {
      if (settled) return;

      if (error) {
        settled = true;
        clearTimeout(timer);
        bleManager.stopDeviceScan();
        // BluetoothLE errors here are most often a missing BLUETOOTH_SCAN grant.
        emitState('unauthorized');
        reject(error);
        return;
      }

      const name = scanned?.name ?? scanned?.localName ?? null;
      if (name !== null && name.trim() === POCKETLAB_DEVICE_NAME) {
        settled = true;
        clearTimeout(timer);
        bleManager.stopDeviceScan();
        resolve(scanned!);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Device discovery (multi-sensor picker)
// ---------------------------------------------------------------------------

/** A named BLE peripheral seen during a discovery scan. */
export interface DiscoveredDevice {
  readonly id: string;
  readonly name: string;
  readonly rssiDbm: number | null;
  /** True when the name matches docs/04's verified "PL GT M201" exactly. */
  readonly isExpectedSensor: boolean;
  /** True when the name looks PocketLab-ish but is not the documented unit. */
  readonly isProbablePocketLab: boolean;
}

let discoveryActive = false;

/** Heuristic for "this looks like a PocketLab" when the name is not an exact match. */
function looksLikePocketLab(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('pl ') || n.includes('pocketlab') || n.startsWith('pl-');
}

/**
 * Scan and report EVERY named peripheral in range, rather than auto-connecting to
 * one hardcoded name.
 *
 * WHY: docs/04 records "PL GT M201" as a verified field-test observation from a
 * SINGLE unit. It does not say whether that is a model name shared by every
 * PocketLab Voyager or a per-device name. With a bench full of sensors, an exact
 * match silently ignores every other unit and reports "sensor not found" — which
 * is indistinguishable from a genuine hardware fault.
 *
 * Listing everything answers that empirically and lets the operator choose, which
 * also preserves scientific provenance: you know exactly which unit produced a
 * transect, instead of auto-connecting to whichever sensor answered first.
 *
 * `onUpdate` receives the full deduplicated list each time it changes, sorted with
 * the documented sensor first, then other likely PocketLabs, then everything else
 * by signal strength.
 */
export async function startDiscovery(
  onUpdate: (devices: DiscoveredDevice[]) => void,
  durationMs = 12_000
): Promise<void> {
  await assertBluetoothReady();

  const bleManager = getManager();
  const found = new Map<string, DiscoveredDevice>();
  discoveryActive = true;
  emitState('scanning');

  const publish = () => {
    const list = [...found.values()].sort((a, b) => {
      if (a.isExpectedSensor !== b.isExpectedSensor) return a.isExpectedSensor ? -1 : 1;
      if (a.isProbablePocketLab !== b.isProbablePocketLab) {
        return a.isProbablePocketLab ? -1 : 1;
      }
      return (b.rssiDbm ?? -999) - (a.rssiDbm ?? -999);
    });
    onUpdate(list);
  };

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      discoveryActive = false;
      bleManager.stopDeviceScan();
      clearTimeout(timer);
      emitState(found.size > 0 ? 'idle' : 'error');
      resolve();
    };

    const timer = setTimeout(finish, durationMs);

    bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, scanned) => {
      if (settled) return;

      if (error) {
        settled = true;
        discoveryActive = false;
        clearTimeout(timer);
        bleManager.stopDeviceScan();
        emitState('unauthorized');
        reject(error);
        return;
      }

      const rawName = scanned?.name ?? scanned?.localName ?? null;
      // Unnamed peripherals are ubiquitous background noise (beacons, laptops,
      // earbuds advertising anonymously). Showing them would bury the sensor.
      if (scanned === null || rawName === null || rawName.trim() === '') return;

      const name = rawName.trim();
      const existing = found.get(scanned.id);
      // Keep the strongest RSSI we have seen for this device.
      if (existing !== undefined && (existing.rssiDbm ?? -999) >= (scanned.rssi ?? -999)) {
        return;
      }

      found.set(scanned.id, {
        id: scanned.id,
        name,
        rssiDbm: scanned.rssi ?? null,
        isExpectedSensor: name === POCKETLAB_DEVICE_NAME,
        isProbablePocketLab: looksLikePocketLab(name),
      });
      publish();
    });
  });
}

export function stopDiscovery(): void {
  if (!discoveryActive) return;
  discoveryActive = false;
  getManager().stopDeviceScan();
}

/**
 * Connect to a specific peripheral chosen from the discovery list.
 *
 * Distinguishes the two failure modes that matter:
 *   • cannot connect at all — out of range, or already bound to another central
 *   • connects but has no Urban Heat service — a different PocketLab model
 *     exposing different UUIDs. Name matching is necessary but NOT sufficient.
 */
export async function connectToDeviceId(deviceId: string): Promise<void> {
  stopDiscovery();
  const bleManager = getManager();
  const connected = await bleManager.connectToDevice(deviceId, { autoConnect: false });
  await subscribeToConnectedDevice(connected);
}

/**
 * Connect, discover, and subscribe to the 1 Hz notification characteristic.
 * This is the full happy path from "device found" to "packets flowing".
 */
export async function connectAndSubscribe(target: Device): Promise<void> {
  emitState('connecting', target.name ?? POCKETLAB_DEVICE_NAME);

  const connected = await target.connect({ autoConnect: false });
  await subscribeToConnectedDevice(connected);
}

/** Shared tail of both connect paths: discover services, then subscribe. */
async function subscribeToConnectedDevice(connected: Device): Promise<void> {
  device = connected;
  emitState('connecting', connected.name ?? POCKETLAB_DEVICE_NAME);

  // MUST happen before monitoring, or the characteristic handle is unknown to
  // the native layer and the subscription silently never fires.
  await connected.discoverAllServicesAndCharacteristics();

  // Name matching is necessary but NOT sufficient. A different PocketLab model
  // can advertise a similar name and expose entirely different GATT services —
  // in which case monitorCharacteristicForService would attach to nothing and the
  // stream would simply stay silent forever, looking exactly like an R-01 failure.
  // Verify up front so the operator gets a specific, actionable message instead.
  const services = await connected.services();
  const hasUrbanHeatService = services.some((s) => uuidEquals(s.uuid, UH_SERVICE_UUID));

  if (!hasUrbanHeatService) {
    const available = services.map((s) => s.uuid).join(', ') || '(none reported)';
    try {
      await connected.cancelConnection();
    } catch {
      // Already gone — nothing to clean up.
    }
    device = null;
    emitState('error');
    throw new BleNotReadyError(
      `Connected to "${connected.name ?? 'device'}" but it does not expose the Urban Heat ` +
        `service ${UH_SERVICE_UUID}. This is most likely a different PocketLab model. ` +
        `Services it does expose: ${available}`,
      'error',
      false
    );
  }

  emitState('connected', connected.name ?? POCKETLAB_DEVICE_NAME);

  // Surface disconnects rather than leaving the HUD showing a frozen last value
  // while the volunteer keeps walking, believing they are still logging.
  disconnectSubscription = connected.onDisconnected(() => {
    emitState('disconnected');
    void teardownSubscriptions();
  });

  notifySubscription = connected.monitorCharacteristicForService(
    UH_SERVICE_UUID,
    UH_NOTIFY_CHARACTERISTIC_UUID,
    (error, characteristic: Characteristic | null) => {
      if (error) {
        callbacks?.onError?.(error.message);
        emitState('error');
        return;
      }
      const value = characteristic?.value;
      if (!value) return;

      // Timestamp here — at the moment of receipt. The PL GT M201 transmits no
      // clock, and trusting a peripheral clock across a reconnect would corrupt
      // the transect's time axis.
      const packet = decodeFrame(value, device?.rssi ?? null, Date.now());
      callbacks?.onPacket(packet);
    }
  );

  emitState('subscribed', connected.name ?? POCKETLAB_DEVICE_NAME);
}

/** Convenience: scan, then connect and subscribe. */
export async function startSensorLink(): Promise<void> {
  const found = await scanForSensor();
  await connectAndSubscribe(found);
}

async function teardownSubscriptions(): Promise<void> {
  notifySubscription?.remove();
  notifySubscription = null;
  disconnectSubscription?.remove();
  disconnectSubscription = null;
}

/** Refresh RSSI for the Screen 3.3 diagnostics panel. Cheap; call sparingly. */
export async function readRssi(): Promise<number | null> {
  if (device === null) return null;
  try {
    const updated = await device.readRSSI();
    return updated.rssi ?? null;
  } catch {
    return null;
  }
}

/** Full teardown. Safe to call when nothing is connected. */
export async function disconnect(): Promise<void> {
  await teardownSubscriptions();
  if (device !== null) {
    try {
      await device.cancelConnection();
    } catch {
      // Already gone — nothing to do.
    }
    device = null;
  }
  emitState('idle', null);
}

/** Release the native manager entirely. Call on app teardown. */
export function destroyAdapter(): void {
  void teardownSubscriptions();
  device = null;
  manager?.destroy();
  manager = null;
}

export function getConnectedDeviceName(): string | null {
  return device?.name ?? null;
}
