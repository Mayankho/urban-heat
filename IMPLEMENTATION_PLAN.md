# Urban Heat — Sprint 1 Implementation Plan

**Author:** Principal Software Architect / Lead Mobile Engineer
**Date:** 2026-07-25
**Status:** AWAITING `PROCEED` — no executable code has been generated.
**Source of truth ingested:** `CLAUDE.md`, `docs/01_PRD_and_Tech_Stack.md`, `docs/02_Urban_Heat_Wireframes.html` (683 lines), `docs/03_Brand_Bible_and_ICP.md`, `docs/04_Hardware_Emulation_Strategy.md`, `docs/05_Agile_Sprint_Backlog.md`.

**Labelling convention used throughout this document:**

| Tag | Meaning |
| :--- | :--- |
| `[SPEC]` | Stated verbatim in `/docs` or `CLAUDE.md`. Immutable. |
| `[DECISION]` | Not in the docs. My explicit architectural call, with justification. Overridable by you. |
| `[INFERRED]` | Reconstructed from wireframe evidence, not stated as a requirement. Needs your confirmation. |
| `[BLOCKER]` | Cannot be resolved by reasoning. Requires hardware capture or a product answer from you. |

Nothing in this plan silently guesses a requirement. Every gap found across the six documents is either tagged above or listed in §10.

---

## 1. Interpretation of Project Goals

Urban Heat is a **field-instrument-grade Android application** for grassroots environmental justice organisations — Tier 1 ICP being the West Atlanta Watershed Alliance (WAWA) — to produce defensible, exportable scientific evidence of localized Urban Heat Islands along walked transects in the Proctor Creek / Bankhead Highway corridor.

The product is not a consumer fitness tracker that happens to read temperature. It is a **data-integrity instrument**. The wireframes make this explicit and it drives every engineering choice below:

- Screen 1.4 is a **hard gate** — the app refuses to reach the Launchpad without `Always Allow` background location. The product would rather not run than produce a truncated transect.
- Screen 2.2 shows an **un-killable foreground notification** ("Continuous background thread secured"). Data continuity is a promised, user-visible guarantee.
- Screen 2.1 ends a session behind a **slide-to-confirm** gesture, not a tap. Accidental session termination is treated as data loss.
- Screen 3.3 exposes **raw diagnostics** (dBm, sampling rate, cache row count, firmware node) directly to the citizen scientist, and a destructive `Flush Local SQLite Cache` action. The user is trusted as an operator, not shielded as a consumer.
- Screen 3.2 frames output as an **"Interoperable CSV"** per session — the deliverable is data that survives being handed to a municipal Chief Heat Officer (Tier 2 ICP).

**Core loop `[SPEC]`:** Authenticate → Connect BLE Sensor → Walk Transect (background location + 1 Hz temp logging) → End Trek → Sync to Supabase → Export CSV.

### 1.1 Android-First MVP Roadmap — Acknowledged

I confirm and will hold the following boundary for this sprint:

- **Android only.** No iOS native files, no `ios/` directory, no CocoaPods, no `Podfile`, no Apple entitlements, no `Info.plist` keys (including `NSLocationAlwaysAndWhenInUseUsageDescription`).
- All builds via **`npx expo run:android`** against a Custom Development Client. Expo Go is BANNED `[SPEC]` — it cannot host the `react-native-ble-plx` native module or a background location foreground service.
- **Task 1.5 (App Store Shield) is copy/strings only this sprint.** I will embed the WAWA institutional research justification as an exported TypeScript constant in `src/config/complianceCopy.ts` for later reuse. I will perform **zero** Apple-side configuration and will not create or edit any `Info.plist`. See §10, Gap G-02 — the docs never supply the actual wording, so what I embed will be clearly marked `DRAFT — PENDING WAWA APPROVAL`.
- I will write `ios` out of scope in `app.json` by simply **omitting** the `ios` key rather than configuring it.

**Consequence to flag now:** the 15 MB background-array ceiling is justified in `docs/05` as protection against *"iOS background assassins."* On an Android-only MVP that specific rationale does not apply — Android kills processes via Doze, `cachedOrEmpty` LMK pressure, and OEM battery managers instead. **I am keeping the 15 MB ceiling as a hard, non-negotiable constraint regardless**, because (a) it is mandated in `CLAUDE.md` and `docs/05`, and (b) it is independently correct engineering for Android LMK survival and for the eventual iOS phase. I am flagging only that the stated *reason* is iOS-specific, not the *rule*.

---

## 2. The BLE Adapter Boundary

### 2.1 Verified Hardware Coordinates `[SPEC]`

| Field | Value |
| :--- | :--- |
| Proxy device | PocketLab Voyager |
| Advertised device name | `PL GT M201` |
| Service UUID | `F000AA11-0452-4000-B000-000000000000` |
| Target Notification Characteristic (CCCD) | `F000AA13-0452-4000-B000-000000000000` |

These will be the **only** place in the codebase where these strings appear:

```ts
// src/config/bleConstants.ts
export const POCKETLAB_DEVICE_NAME = 'PL GT M201' as const;
export const UH_SERVICE_UUID = 'F000AA11-0452-4000-B000-000000000000' as const;
export const UH_NOTIFY_CHARACTERISTIC_UUID = 'F000AA13-0452-4000-B000-000000000000' as const;
export const UH_SAMPLE_RATE_HZ = 1.0 as const;
```

**Note on UUID casing** `[DECISION]`: `react-native-ble-plx` normalises UUIDs to **lowercase** internally on Android. Any string comparison against a characteristic UUID returned by the library must be case-insensitive. I will route every comparison through a single `normalizeUuid()` helper rather than comparing the constants directly — this is a classic silent-failure source where notifications appear to never arrive.

### 2.2 The `SensorTelemetryPacket` Interface

This is the **only** shape allowed to cross out of `src/services/bleAdapter.ts`. No UI component, no store, and no database module will ever see a raw byte, a base64 string, or a `Characteristic` object from `react-native-ble-plx`. That is the Adapter Pattern mandate from `docs/04` enforced as a type boundary.

```ts
// src/types/telemetry.ts

/**
 * Canonical, hardware-agnostic telemetry sample.
 *
 * Produced EXCLUSIVELY by src/services/bleAdapter.ts, which is the sole
 * translation boundary between raw BLE bytes and the Urban Heat domain.
 *
 * When proprietary hardware replaces the PocketLab Voyager (PL GT M201),
 * ONLY bleAdapter.ts changes. This interface, useTelemetryStore, the SQLite
 * schema, the HUD, and the CSV exporter remain untouched.
 *
 * Source characteristic: F000AA13-0452-4000-B000-000000000000
 * Parent service:        F000AA11-0452-4000-B000-000000000000
 */
export interface SensorTelemetryPacket {
  /** Monotonic device clock, epoch milliseconds UTC. Stamped by the adapter at
   *  the moment the notification is received, NOT by the peripheral. */
  readonly receivedAtUtcMs: number;

  /** Ambient temperature in CELSIUS. Canonical storage unit for the entire
   *  system (matches trek_points.ambient_temp_c). Fahrenheit exists only at
   *  the presentation layer. null when the frame carried no valid temperature. */
  readonly ambientTempC: number | null;

  /** Relative humidity, percent (0–100). null when the proxy hardware does
   *  not expose humidity — see Gap G-04. Do NOT default this to 0; a false
   *  0% RH silently corrupts every downstream heat-index calculation. */
  readonly humidityPct: number | null;

  /** NOAA Rothfusz heat index in CELSIUS, or null when it cannot be computed
   *  (missing humidity, or temperature below the algorithm's valid floor).
   *  Derived, never transmitted by hardware. See §4.3. */
  readonly heatIndexC: number | null;

  /** Radio signal strength in dBm, surfaced on Screen 3.3 diagnostics
   *  ("BLE Strength: -62 dBm (Strong)"). null if unavailable this frame. */
  readonly rssiDbm: number | null;

  /** Provenance of this sample. Lets the UI and the CSV distinguish real
   *  hardware from the development simulator without inspecting call sites. */
  readonly source: TelemetrySource;

  /** Adapter decode outcome. 'ok' packets are persisted; anything else is
   *  counted for diagnostics and dropped, never written as a partial row. */
  readonly decode: DecodeStatus;

  /** Uppercase hex of the raw frame. POPULATED ONLY IN __DEV__ — see the
   *  memory note below. undefined in release builds. */
  readonly rawHex?: string;
}

export type TelemetrySource = 'PL_GT_M201' | 'SIMULATOR' | 'UNKNOWN';

export type DecodeStatus =
  | 'ok'
  | 'unknown_frame_type'
  | 'length_mismatch'
  | 'out_of_range'
  | 'parse_error';
```

**Why `rawHex` is `__DEV__`-only** — this is a direct consequence of Guardrail 2 (Zero-RAM). At 1 Hz over a 60-minute transect, retaining a hex string per packet accumulates unbounded string garbage in the JS heap for the entire session. It is invaluable for reverse-engineering the frame layout (Gap G-01) and unacceptable in a release build. The field is optional in the type and stripped by a `__DEV__` guard at construction.

**Explicit non-goal:** `SensorTelemetryPacket` carries **no latitude/longitude**. Position is owned by `expo-location`, not by the sensor. Fusing the two streams is a separate, deliberate concern — see §5.3, which is the single largest unspecified behaviour in the source docs.

### 2.3 `src/services/bleAdapter.ts` — Adapter Boundary Contract

The adapter is the **only** module permitted to `import` from `react-native-ble-plx`. I will enforce this with an ESLint `no-restricted-imports` rule so the boundary is mechanically defended rather than defended by convention:

```
Peripheral (PL GT M201)
   │  notification on F000AA13-…  →  base64 payload
   ▼
┌──────────────────────────────────────────────────────────────┐
│ src/services/bleAdapter.ts        ← ONLY ble-plx importer    │
│                                                              │
│  scanForSensor()      filter: name === 'PL GT M201'          │
│  connect()            + discoverAllServicesAndCharacteristics│
│  subscribe()          monitorCharacteristicForService(        │
│                         UH_SERVICE_UUID,                      │
│                         UH_NOTIFY_CHARACTERISTIC_UUID)        │
│  decodeFrame(b64)     base64 → Uint8Array → typed fields      │
│                       ── THE TRANSLATION SEAM ──              │
│                       (byte layout BLOCKED on Gap G-01)       │
│  → emits SensorTelemetryPacket                                │
└──────────────────────────────────────────────────────────────┘
   │
   ├──► useTelemetryStore.ingest(packet)   // hot path, no React state
   └──► trekWriter.persist(packet, fix)    // synchronous SQLite write
```

Everything downstream of the seam is hardware-agnostic. Swapping in proprietary hardware means rewriting `decodeFrame` and `POCKETLAB_DEVICE_NAME`; nothing else in the repository moves.

---

## 3. Exact SQL — Local SQLite Schema

These are the literal strings that will live in `src/database/schema.ts` and execute inside a single transaction on first launch.

### 3.1 Connection Pragmas

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = FULL;
PRAGMA foreign_keys = ON;
```

`[DECISION]` **WAL + `synchronous = FULL`.** Guardrail 3 and Task 1.3 mandate *synchronous writes directly to disk*. WAL gives us an append-only commit path (fast, no page shuffling); `FULL` fsyncs the WAL on every commit so a process kill mid-transect loses **zero** committed rows. The cost is one fsync per second, which is trivially affordable at 1 Hz and is exactly the trade the wireframes demand — Screen 2.2 promises an un-killable stream, so durability wins over throughput. I explicitly rejected `synchronous = NORMAL` (the common default) because it permits losing the last commits on an OS-level kill, which is precisely the failure mode Android LMK produces.

### 3.2 `sessions`

`[INFERRED — REQUIRES YOUR CONFIRMATION]` `docs/05` Task 1.1 says *"Create `sessions` table and `trek_points` table (id, session_id, timestamp_utc, latitude, longitude, ambient_temp_c, humidity_pct, heat_index)"* — the parenthesised column list grammatically attaches to `trek_points` only. **No columns are specified anywhere for `sessions`.** I reconstructed the following strictly from wireframe evidence rather than inventing fields; each column cites its screen.

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT    PRIMARY KEY NOT NULL,
  name              TEXT    NOT NULL,
  campaign_token    TEXT,
  privacy           TEXT    NOT NULL DEFAULT 'public_muni'
                            CHECK (privacy IN ('public_muni', 'private_wawa')),
  started_at_utc    INTEGER NOT NULL,
  ended_at_utc      INTEGER,
  distance_meters   REAL    NOT NULL DEFAULT 0,
  avg_temp_c        REAL,
  max_temp_c        REAL,
  point_count       INTEGER NOT NULL DEFAULT 0,
  sync_state        TEXT    NOT NULL DEFAULT 'local'
                            CHECK (sync_state IN ('local', 'syncing', 'synced', 'failed')),
  synced_at_utc     INTEGER,
  device_name       TEXT,
  app_version       TEXT,
  schema_version    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sessions_started_at
  ON sessions (started_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_sync_state
  ON sessions (sync_state);
```

Column provenance:

| Column | Evidence |
| :--- | :--- |
| `name` | Screen 3.1 `Session Identifier` → *"Proctor Creek Sidewalk Run_01"* |
| `campaign_token` | Screen 1.2 → `WAWA-PROCTOR`. Nullable because Screen 1.2 offers *"Skip to Public Muni Layer"* |
| `privacy` | Screen 3.1 toggle → `Public Muni Layer` / `Private WAWA Archive` |
| `started_at_utc`, `ended_at_utc` | Screen 2.1 HUD `Elapsed Time 00:24:15`; Screen 3.2 feed `24:15` |
| `distance_meters` | Screen 2.1 HUD `Mapped Distance 1.12 mi`; Screen 3.2 `Total Mapped 24.4 mi` |
| `avg_temp_c` | Screen 2.1 HUD `Session Average 84.2°F`; Screen 3.2 per-row avg + band dot |
| `max_temp_c` | Needed to compute Screen 3.2 `UHI Hotspots 42` — **but the definition of "hotspot" is undefined, see Gap G-06** |
| `sync_state`, `synced_at_utc` | Offline-first mandate: *"Sync to Supabase only occurs when the user explicitly ends the session"* |
| `device_name`, `app_version`, `schema_version` | Scientific provenance. Screen 3.3 shows `Firmware Node: v1.0.4-UH` |

`distance_meters` is stored in **metres** and `avg_temp_c`/`max_temp_c` in **Celsius** — SI at the storage layer, imperial only at the presentation layer. See §4.2.

### 3.3 `trek_points`

This uses **exactly** the eight columns you specified, in your stated order. I have deliberately added nothing.

```sql
CREATE TABLE IF NOT EXISTS trek_points (
  id             TEXT    PRIMARY KEY NOT NULL,
  session_id     TEXT    NOT NULL,
  timestamp_utc  INTEGER NOT NULL,
  latitude       REAL,
  longitude      REAL,
  ambient_temp_c REAL,
  humidity_pct   REAL,
  heat_index     REAL,
  FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trek_points_session_time
  ON trek_points (session_id, timestamp_utc);
```

Design notes, each an explicit call rather than an accident:

1. **`id TEXT` (client-generated UUIDv4), not `INTEGER AUTOINCREMENT`** `[DECISION]`. The docs do not specify the key type. UUID is correct here because rows are born offline on N devices and later merged into one Supabase/PostGIS table; an autoincrementing local integer collides across devices and forces an ID-rewrite pass at sync time. UUID makes the local row and the cloud row the *same* row, which makes sync idempotent and safely re-runnable after a failed upload.
2. **`timestamp_utc INTEGER` = epoch milliseconds, not ISO-8601 text** `[DECISION]`. At 1 Hz an integer costs 8 bytes versus ~24 for `2026-07-25T14:03:22.000Z`, sorts natively, and needs no parsing to compute elapsed time for the HUD. I am flagging the naming tension: `_utc` reads as though it implies a string. Epoch-ms is inherently UTC, so the name stays accurate. ISO-8601 is generated at the CSV boundary only.
3. **`latitude`/`longitude` nullable.** A GPS fix can drop under tree canopy along Proctor Creek. A temperature reading with no position is still scientifically meaningful and must not be discarded; the alternative — writing `0,0` — plants points in the Gulf of Guinea and silently poisons the dataset.
4. **`ambient_temp_c` nullable.** A BLE frame can be missed. Same reasoning: never fabricate a reading.
5. **`humidity_pct` nullable.** May be permanently null on this proxy hardware — Gap G-04.
6. **`heat_index` nullable, unit `[DECISION]` = CELSIUS.** The column name carries no unit suffix, unlike its `ambient_temp_c` sibling. I am standardising it as **Celsius** for consistency with every other stored temperature, and will name the TypeScript field `heatIndexC` so the unit is unambiguous in code even though the SQL column cannot express it. **If you want `heat_index` stored in Fahrenheit — the unit the NOAA algorithm and the Brand Bible bands both natively use — say so before I write code; this is cheap to change now and expensive later.**
7. **`ON DELETE CASCADE` + `PRAGMA foreign_keys = ON`.** Screen 3.3's `Flush Local SQLite Cache` becomes a single `DELETE FROM sessions`, with no orphaned-point leak.
8. **Exactly one index on `trek_points`.** Every index is a write-amplification tax on the 1 Hz hot path. `(session_id, timestamp_utc)` serves both queries the app actually makes — replay a session's polyline in order, and stream a session in order for CSV export. I add no others.

### 3.4 The Hot-Path Insert

```sql
INSERT INTO trek_points
  (id, session_id, timestamp_utc, latitude, longitude, ambient_temp_c, humidity_pct, heat_index)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
```

Executed via a **prepared statement created once per session** and reused for every sample, using `expo-sqlite`'s synchronous API. Preparing once avoids re-parsing SQL 3,600 times per hour and is the difference between a smooth and a stuttering HUD.

---

## 4. Units, Colour Bands, and Derived Values

The docs contain a real unit split that must be resolved explicitly rather than absorbed ad hoc.

### 4.1 The Contradiction

- `docs/05` schema column is **`ambient_temp_c`** — Celsius.
- `docs/03` Brand Bible functional colour tokens are entirely in **°F** (`< 75°F`, `>= 105°F`).
- Wireframe HUD, feed rows, and lock-screen notification all render **°F** (`96.4°F`, `84.2°F`, `106.1°F`).
- Screen 3.3 offers a **`Fahrenheit (°F)` / `Celsius (°C)` toggle with Fahrenheit active by default.**

### 4.2 Resolution `[DECISION]`

**Celsius is the canonical storage and transport unit. Fahrenheit is a presentation-layer transform with a default-on user preference.** One conversion boundary, in `src/utils/units.ts`, and nowhere else. Rationale: the database column name is `_c` and is immutable per `docs/05`; PostGIS/scientific interchange expects SI; and a display toggle must never mutate stored data or a user flipping the switch would appear to rewrite history. The Fahrenheit-default toggle state lives in a separate low-frequency `useSettingsStore` — never in the telemetry store.

### 4.3 Heat Index `[DECISION]` — G-05 Resolution

`heat_index` is mandated as a column but **no formula, unit, or validity range is given anywhere in the docs.** My call:

- **Algorithm:** NOAA Rothfusz regression (the US National Weather Service standard), including the low-humidity and high-humidity adjustment terms. This is the defensible choice for a US environmental-justice dataset that a Chief Heat Officer may audit.
- **Native units:** the regression is defined in °F and %RH. Implementation converts stored °C → °F, evaluates, converts the result back to °C for storage.
- **Validity floor:** Rothfusz is only valid at **≥ 80 °F (26.67 °C)**. Below that the NWS uses a simple-average fallback. Rather than store a misleading number, `heat_index` is **`NULL` below the floor** and the UI shows `—`.
- **Missing humidity → `NULL`.** No substituted "typical Atlanta humidity" constant. A fabricated input produces a fabricated scientific claim.
- Computed **at write time** in `src/utils/heatIndex.ts`, not at read time, so the CSV a partner receives contains the same values the operator saw in the field.

### 4.4 Colour Band Boundary Gap `[DECISION]` — G-07 Resolution

The Brand Bible bands are `< 75`, `75–84.9`, `85–94.9`, `95–104.9`, `>= 105`. These leave **undefined slivers**: a reading of `84.95 °F` belongs to no band. I will implement **half-open intervals** so the classifier is total:

| Band | Interval (°F) | Token | Hex |
| :--- | :--- | :--- | :--- |
| Cool Blue | `(-∞, 75)` | `--cool` | `#3498DB` |
| Temperate Green | `[75, 85)` | `--normal` | `#2ECC71` |
| Thermal Warning | `[85, 95)` | `--warn` | `#F1C40F` |
| Critical Heat | `[95, 105)` | `--crit` | `#E67E22` |
| Extreme Danger | `[105, +∞)` | `--danger` | `#E74C3C` |

Classification always runs on **°F**, regardless of the display toggle, so the polyline colour of a given transect is stable and comparable across operators who set different display units.

### 4.5 Design Tokens Extracted from `docs/02`

Transcribed verbatim into `src/config/theme.ts` — a frozen object, never magic hex literals in components.

```
Light (default)   bg #F8F9FA · surface #FFFFFF · border #E1E4E8 · text #0D1117 · muted #586069
Dark (override)   bg #0D1117 · surface #161B22 · border #30363D · text #FFFFFF · muted #8B949E
Heat array       cool #3498DB · normal #2ECC71 · warn #F1C40F · crit #E67E22 · danger #E74C3C
Rigid 8px grid   s1 8 · s2 16 · s3 24 · s4 32
Radii            0 everywhere — "flat / rigid" per the .device comment
Numerics         font-variant-numeric: tabular-nums on all HUD values (RN: fontVariant: ['tabular-nums'])
Type             800 weight, uppercase, letterSpacing 1–4px for labels/brand
```

Two token observations worth your attention: the wireframe defines a **complete dark theme** that the Brand Bible never mentions and that no screen exposes a control for (Screen 3.3 has only a unit toggle; the page-level toggle is labelled *"Global Toggle Theme Preview"*, a blueprint affordance). And the HTML `<head>` **preconnects to Google Fonts but never loads Inter** — the wireframe you have been reviewing renders in a system fallback. Both are logged as G-08 and G-09.

---

## 5. Runtime Environment, Versions, and Compatibility

### 5.1 Honest Statement on Version Pinning

You asked for exact pinned versions **and** for known incompatibilities flagged *before* code is written. Phase 1 forbids network and filesystem writes, so I have **not** run `npm view`, `npx expo install`, or anything else that would let me assert today's published patch numbers. I will not fabricate version strings that look authoritative and are wrong — a hallucinated pin is worse than an honest one, because it silently becomes the lockfile.

So this section gives (a) the **rules** that must hold, which I can state with confidence, and (b) the **exact commands** that resolve them to numbers, to be run as step 1 of Phase 3 with the output pasted back into this document.

### 5.2 Version Policy `[DECISION]`

**Expo SDK target: the newest stable SDK that passes the BLE compatibility check in §5.3, with SDK 54 as the hard floor.** SDK 54 is the floor because it is the oldest release I can attest carries the `expo-sqlite` synchronous API, first-class `react-native-ble-plx` config-plugin support, and the Android 14 foreground-service-type plumbing this app requires. Given today's date, a newer SDK almost certainly exists and should be preferred **only after** the BLE check passes.

**`expo-*` packages are never hand-pinned.** `expo-sqlite` and `expo-location` versions are bound to the SDK release; hand-editing them in `package.json` is the single most common cause of unbuildable Expo projects. They are resolved by:

```bash
npx expo install expo-sqlite expo-location expo-task-manager expo-file-system expo-sharing
npx expo install --check      # asserts every expo-* package matches the SDK
```

`react-native-ble-plx` is **not** an Expo package and therefore **is** explicitly pinned to an exact version (no `^`), because BLE regressions between minors are real and a caret range on the BLE driver means a teammate's `npm install` can produce a differently-behaving radio stack. Required: **`react-native-ble-plx` v3.x**, which ships its own Expo config plugin — v2.x has no plugin and would force a manual `prebuild` patch.

Resolution commands to run at the start of Phase 3:

```bash
npx create-expo-app@latest UrbanHeat --template blank-typescript   # pins current SDK
npx expo install react-native-ble-plx
npm ls expo expo-sqlite expo-location react-native-ble-plx        # capture exact tree
npx expo-doctor                                                    # authoritative compat report
```

### 5.3 Incompatibilities Flagged Before Code — the Three Real Risks

**R-01 — New Architecture (Fabric/TurboModules) × `react-native-ble-plx`. HIGHEST RISK.**
The New Architecture is enabled by default on modern Expo SDKs. `react-native-ble-plx` is a legacy-bridge native module that runs through the interop layer, and BLE libraries in that position have a history of subtle breakage — most dangerously in *notification callback delivery*, which is exactly the mechanism this entire app depends on. **Mitigation:** the very first thing built in Phase 3 is a throwaway spike that connects to `PL GT M201` and logs raw notifications on the default (New Arch) configuration. If notifications do not arrive reliably at 1 Hz, we set `"newArchEnabled": false` in `app.json` and re-verify. Everything else is worthless if this fails, so it is gated first and nothing is built on top of an unverified radio.

**R-02 — `expo-location` background task × `react-native-ble-plx` BLE subscription.**
This is an architectural collision the docs never address, and it is the most likely thing to quietly break in the field. `expo-location`'s `startLocationUpdatesAsync` + `expo-task-manager` can deliver fixes into a **headless JS context** — a context in which the BLE `Device` object and its active notification subscription **do not exist**. If we naively write the location handler as a headless task and the BLE handler in the app context, the two streams live in different JS realms and cannot be joined into a single `trek_points` row.

`[DECISION]` **One process, one JS context, kept alive by one foreground service.** We start a `location` foreground service (Screen 2.2's persistent notification is the user-visible proof) which keeps the app process and its JS context resident. Both the location fixes and the BLE notifications are then handled in that **same** context, where they can be fused. The `TaskManager` task is registered as required by the API but is written as a thin forwarder into the single writer module, and must be **defensive about running headless** — it verifies the writer is initialised and otherwise persists a position-only row rather than crashing.

**R-03 — Sample fusion policy: which stream drives a row?**
`[DECISION — this is the largest genuinely unspecified behaviour in the docs; see G-03.]` BLE notifies at 1 Hz; `expo-location` emits on its own cadence based on `distanceInterval`/`timeInterval` and satellite conditions. Nothing in `/docs` states how a temperature and a coordinate become one row.

I choose a **1 Hz telemetry-driven write with last-known-position attachment**:
- The **BLE packet is the clock.** Each decoded `ok` packet writes exactly one `trek_points` row. This makes `docs/05`'s "1 Hz writing rule" literally true in the data — 3,600 rows/hour, evenly spaced, which is what a scientific transect requires.
- Each row attaches the **most recent GPS fix**, held as a single mutable `lastFix` reference (one object, not a growing array — Guardrail 2).
- A fix older than a **staleness threshold** attaches `NULL` position rather than a misleading coordinate. `[DECISION]` threshold = **10 seconds**, chosen as ~1 walking-pace GPS cycle: long enough to ride out a brief canopy dropout, short enough that a pedestrian at ~1.4 m/s has not moved more than ~14 m, which is inside the spatial resolution a sidewalk-scale UHI transect can claim anyway.

I chose this over the alternative (GPS-fix-driven writes) because a GPS-driven cadence produces irregular, satellite-dependent sampling that no longer honours "1 Hz" and yields ragged transects across operators. The cost is rows with `NULL` coordinates during dropout, which §3.3 note 3 already accommodates and which is the scientifically honest representation.

### 5.4 `app.json` Configuration

```jsonc
{
  "expo": {
    "name": "Urban Heat",
    "slug": "urban-heat",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",          // Brand Bible: Light Mode Default
    "android": {
      "package": "org.urbanheat.field",     // [DECISION] confirm before first build — immutable in Play
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "FOREGROUND_SERVICE_CONNECTED_DEVICE",
        "BLUETOOTH_SCAN",
        "BLUETOOTH_CONNECT"
      ]
    },
    // NOTE: no "ios" key. Android-only MVP, deliberately omitted.
    "plugins": [
      [
        "react-native-ble-plx",
        {
          "isBackgroundEnabled": true,
          "modes": ["peripheral", "central"],
          "bluetoothAlwaysPermission": false   // iOS-only key; false = do not emit
        }
      ],
      [
        "expo-location",
        {
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ],
      "expo-sqlite"
    ]
  }
}
```

`newArchEnabled` is intentionally absent until R-01 is empirically settled. Adding it pre-emptively in either direction would be exactly the kind of unverified assumption this plan exists to prevent.

---

## 6. Android Permissions Architecture `[DECISION]`

You correctly identified that **none of the source documents specify this.** Here is my explicit design and the reasoning, not a silent default.

### 6.1 Manifest Declarations

```xml
<!-- Android 12+ (API 31+) Bluetooth -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
                 android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Pre-Android 12 legacy Bluetooth, capped so API 31+ ignores them -->
<uses-permission android:name="android.permission.BLUETOOTH"       android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- Location -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Foreground service, Android 14+ typed -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />
```

**Why `neverForLocation` on `BLUETOOTH_SCAN`** — Android lets an app derive coarse location from BLE beacon scans, so by default `BLUETOOTH_SCAN` is treated as location-adjacent. Urban Heat does **not** do that: it scans for exactly one device by name and gets position from GPS. Declaring `neverForLocation` (a) is a truthful capability declaration, which matters for a Play listing and for a privacy-sensitive EJ-nonprofit audience, and (b) **decouples the two subsystems' failure modes** — without it, a location-permission denial can present as a mysterious empty BLE scan, which is a miserable thing to debug in the field. I want "GPS denied" and "sensor not found" to be two visibly different errors on Screens 1.3 and 1.4.

### 6.2 Runtime Request Sequence

Android 11+ **refuses** to grant background location in the same dialog as foreground location, and Android 12+ requires the new Bluetooth runtime grants. The order is therefore not arbitrary:

```
Screen 1.3  BLE Sensor Sync
  └─ 1. request BLUETOOTH_SCAN + BLUETOOTH_CONNECT   (single grouped runtime dialog, API 31+)
        ├─ granted  → scan for 'PL GT M201' → connect → subscribe → advance
        └─ denied   → in-screen remediation; NEVER silently retry a scan that cannot succeed

Screen 1.4  Location Hard Gate
  └─ 2. request ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION   (foreground, "While using the app")
  └─ 3. request ACCESS_BACKGROUND_LOCATION                       (SEPARATE call, must follow #2)
        ├─ On API 30+ the OS shows no inline "Always Allow" option; it routes to app settings.
        │  This is precisely the wireframe's 3-step schematic ("Open OS System Settings →
        │  Apps → Urban Heat → Permissions → Always Allow"), so the wireframe is already
        │  describing correct Android 11+ behaviour and we implement it literally.
        ├─ Provide an explicit deep link: Linking.openSettings()  [DECISION — the wireframe
        │  gives instructions but specifies no button; a manual-navigation-only flow is a
        │  needless drop-off for a field volunteer]
        └─ On return to foreground, RE-CHECK the grant. Do not trust that the user complied.

  Gate release: 'Proceed to App Launchpad' stays disabled (opacity .3, 🔒) until
  ACCESS_BACKGROUND_LOCATION reads 'granted'. This is a hard block, per Screen 1.4.
```

`[DECISION]` **BLE before location.** The wireframe orders the screens 1.3 (BLE) → 1.4 (Location Gate), and I am implementing that order rather than front-loading all permissions. It is also better UX: the Bluetooth grant is uncontroversial and builds consent momentum before the app asks for the genuinely invasive always-on location grant, and by then the user has seen live sensor data that makes the reason self-evident.

### 6.3 Foreground Service Type `[DECISION]` — the call you asked me to make explicit

**Declare the service with BOTH `location` AND `connectedDevice` types.**

```xml
<service
    android:name="…ExpoLocationForegroundService"
    android:foregroundServiceType="location|connectedDevice"
    android:exported="false" />
```

Justification. Android 14 (API 34) requires every foreground service to declare a type matching its actual work, and enforces it: using a capability outside the declared type raises `SecurityException` / `MissingForegroundServiceTypeException`. Urban Heat's single background service genuinely performs **two** distinct restricted activities at once — it receives GPS fixes (`location`) *and* holds an active GATT connection to a BLE peripheral (`connectedDevice`). Declaring only `location` describes half the truth and leaves us exposed to enforcement tightening in a later Android release; a background-BLE crash that only reproduces on one Android version after twenty minutes in the field is the worst class of bug this project could ship.

**Implementation caveat you should know now:** `expo-location`'s config plugin declares the `location` type only. Adding `connectedDevice` requires a **small custom Expo config plugin** (`plugins/withUrbanHeatForegroundService.js`) that patches the `<service>` element during prebuild. That file is in the Sprint 1 checklist below. Ordering matters — it must run after `expo-location`'s plugin.

Also declared: `android:stopWithTask="false"` so a swipe-away of the task does not kill the transect, which is the literal promise of Screen 2.2's *"Continuous background thread secured."* The notification copy comes from that screen: title *"Active Climate Expedition Running"*, body *"Logging {campaign} · Current ambient temp: {temp}°F"*.

---

## 7. Formal Guardrail Acknowledgement

> **I formally confirm the following, and will treat each as a build-breaking constraint rather than a guideline.**
>
> **1. Both standard React `useState` AND React Context are BANNED for the 1 Hz BLE telemetry stream.**
> No live sensor value will ever be held in `useState`, `useReducer`, or any React Context provider. All 1 Hz telemetry is written directly into an isolated atomic Zustand store, `useTelemetryStore`. `useState` and Context remain permitted **only** for genuinely local, low-frequency UI concerns — a text input's draft value, a modal's open flag — and never for a value that changes at sensor cadence.
>
> Enforcement, beyond good intentions:
> - HUD components subscribe with **narrow atomic selectors** — `useTelemetryStore(s => s.currentTempC)` — so a temperature tick re-renders only the temperature text node, not the map, not the polyline, not the slider, not the parent screen. Screen 2.1's four HUD quadrants are four independently-subscribed leaf components.
> - Values needed by imperative consumers (the SQLite writer, the map polyline appender, the CSV exporter) read from the store via `getState()` **outside** the React render cycle entirely, so they cost zero renders.
> - No `useTelemetryStore()` call without a selector — an unselected subscription re-renders on every store mutation and would defeat the entire architecture. This becomes an ESLint rule.
> - An ESLint `no-restricted-syntax` rule additionally forbids importing `createContext` inside `src/store/**` and `src/services/**`.
>
> **2. Background JS arrays must stay under 15 MB, and payloads are dumped from active memory instantly.**
> No session-length accumulation of telemetry in the JS heap. The write path is: decode → synchronous `INSERT` to SQLite disk → release the reference. `useTelemetryStore` holds a **fixed-size** shape — current temperature, humidity, heat index, RSSI, elapsed seconds, distance, running average accumulators, connection status — of **O(1)** size, never an append-only sample array. The running average is maintained as a `(sum, count)` pair, never by retaining points to average later. Raw hex is retained only under `__DEV__`. The only unavoidably growing in-memory structure is the map polyline; it will be **decimated for display** (retaining full fidelity on disk) with the specific decimation strategy chosen in the sprint that builds the map, and it will be bounded rather than unbounded.
>
> **3. Custom Development Client only.** Standard Expo Go is banned and cannot host this app's native modules. All verification happens on a device built via `npx expo run:android`.

---

## 8. Sprint 1 File Checklist

Ordered by dependency. Nothing here is created until you issue `PROCEED`.

### Step 0 — Repository Hygiene (currently a non-git directory)

| # | Action | Notes |
| :--- | :--- | :--- |
| 0.1 | `git init` | Confirmed **not** currently a repo (`git rev-parse` fails) |
| 0.2 | `.gitignore` | `node_modules/`, `.expo/`, `dist/`, `web-build/`, `android/`, `*.jks`, `*.keystore`, `.env*`, `npm-debug.*`, `*.orig.*`, `.DS_Store`, `expo-env.d.ts` |
| 0.3 | Initial commit of `/docs` + `CLAUDE.md` + this plan | Establishes the immutable source-of-truth baseline before any generated code |
| 0.4 | **Ask you about 3 stray root files** | `PLEASE_DELETE_claude_test_artifact.txt`, `PLEASE_DELETE_claude_test_artifact_2.txt`, `.DS_Store`. Their names suggest deletion, but I will not delete files you have not asked me to delete. `.DS_Store` is gitignored above regardless. |

**On `android/`** — I gitignore it because `npx expo run:android` regenerates it via prebuild (Continuous Native Generation), so committing it invites drift between the manifest and the config plugins. This is a real trade-off and your call: if you later need to hand-edit native Android files, we commit `android/` and abandon CNG. My recommendation is to stay on CNG and express all native changes through config plugins — which is exactly why §6.3's foreground-service change is written as a plugin.

### Step 1 — Scaffold & Native Verification (gated on R-01)

| # | File / Action |
| :--- | :--- |
| 1.1 | `npx create-expo-app@latest . --template blank-typescript` |
| 1.2 | `npx expo install expo-sqlite expo-location expo-task-manager expo-file-system expo-sharing` |
| 1.3 | `npx expo install react-native-ble-plx` then repin to an exact version |
| 1.4 | `app.json` — permissions, plugins, no `ios` key (§5.4) |
| 1.5 | `plugins/withUrbanHeatForegroundService.js` — patch FGS type to `location\|connectedDevice` (§6.3) |
| 1.6 | `tsconfig.json` — `strict: true`, `@/*` path alias |
| 1.7 | `.eslintrc` — `no-restricted-imports` (ble-plx confined to the adapter), no-Context-in-stores, no-unselected-store-subscription |
| 1.8 | **`npx expo run:android` + BLE notification spike → resolve R-01 before proceeding** |

### Step 2 — Task 1.1: Local Database

| # | File | Contents |
| :--- | :--- | :--- |
| 2.1 | `src/database/schema.ts` | The exact SQL strings from §3, plus pragmas and `PRAGMA user_version` migration guard |
| 2.2 | `src/database/db.ts` | `openDatabaseSync('urbanheat.db')` singleton, pragma application, idempotent `initialize()` |
| 2.3 | `src/database/sessionsRepo.ts` | create / finalise / list / delete; aggregate rollups for Screen 3.2's Impact Matrix |
| 2.4 | `src/database/trekPointsRepo.ts` | Prepared-statement `insertPoint`, ordered `streamBySession` for export |
| 2.5 | `src/types/telemetry.ts` | `SensorTelemetryPacket`, `TelemetrySource`, `DecodeStatus` (§2.2) |
| 2.6 | `src/types/session.ts` | `TrekSession`, `TrekPoint`, `PrivacyMode`, `SyncState` |

### Step 3 — Task 1.2: Zustand Telemetry Pipeline

| # | File | Contents |
| :--- | :--- | :--- |
| 3.1 | `src/store/useTelemetryStore.ts` | Atomic, O(1), 1 Hz hot path. No arrays. No Context. |
| 3.2 | `src/store/useSessionStore.ts` | Low-frequency session lifecycle: id, name, privacy, start time, `isRecording` |
| 3.3 | `src/store/useSettingsStore.ts` | °F/°C toggle (default °F), persisted separately from telemetry |
| 3.4 | `src/config/theme.ts` | Frozen tokens transcribed from `docs/02` (§4.5) |
| 3.5 | `src/utils/units.ts` | The single C↔F boundary |
| 3.6 | `src/utils/heatIndex.ts` | NOAA Rothfusz + validity floor + null semantics (§4.3) |
| 3.7 | `src/utils/heatBand.ts` | Half-open-interval band classifier (§4.4) |

### Step 4 — Task 1.3 + BLE: Services

| # | File | Contents |
| :--- | :--- | :--- |
| 4.1 | `src/config/bleConstants.ts` | Device name, Service UUID, Characteristic UUID, sample rate |
| 4.2 | `src/services/bleAdapter.ts` | **The only ble-plx importer.** Scan/connect/subscribe/decode → `SensorTelemetryPacket` |
| 4.3 | `src/services/bleSimulator.ts` | Deterministic 1 Hz synthetic source so UI work is unblocked while G-01 is open |
| 4.4 | `src/services/locationService.ts` | `startLocationUpdatesAsync` + typed foreground service + Screen 2.2 notification copy |
| 4.5 | `src/services/trekWriter.ts` | Fusion + Zero-RAM write path (§5.3 R-03). Single `lastFix` ref, 10 s staleness rule |
| 4.6 | `src/services/backgroundLocationTask.ts` | `TaskManager.defineTask`, headless-safe forwarder |
| 4.7 | `src/services/permissionsService.ts` | The §6.2 sequence, re-check on foreground resume |
| 4.8 | `src/config/complianceCopy.ts` | **Task 1.5** — WAWA justification constant, `DRAFT — PENDING WAWA APPROVAL`. Strings only. |

### Step 5 — Screens (structure + tokens; map layer deliberately deferred)

`src/screens/`: `WelcomeAuthScreen.tsx` (1.1) · `CampaignEnrollmentScreen.tsx` (1.2) · `BleSyncScreen.tsx` (1.3) · `LocationGateScreen.tsx` (1.4) · `LaunchpadScreen.tsx` (2.0) · `LiveRecordingScreen.tsx` (2.1) · `ValidationScreen.tsx` (3.1) · `ProfileImpactScreen.tsx` (3.2) · `SettingsDiagnosticsScreen.tsx` (3.3).
Screen 2.2 is an OS lock-screen notification, not a React screen — it is implemented in `locationService.ts`.

`src/components/`: `HudQuadrant.tsx` (atomic selector subscriber) · `SlideToEndTrek.tsx` (port of the wireframe's drag interaction) · `StatusPill.tsx` · `HeatStrip.tsx` · `DiagnosticsCard.tsx` · `TabBar.tsx` · `PrimaryButton.tsx` · `LabeledInput.tsx`.

### Step 6 — Verification

`npx expo-doctor` · `tsc --noEmit` · lint · `npx expo run:android` on a physical device with the `PL GT M201` · a 20-minute screen-off transect confirming continuous rows and a flat JS heap.

### Explicitly NOT in Sprint 1

Supabase client, auth, and PostGIS cloud schema; CSV export implementation; the map rendering layer. `docs/05` scopes Sprint 1 as *"Architecture & Local Cache Baseline"*, and none of these appear in Tasks 1.1–1.5 — but note that Supabase sync and CSV export **are** in the PRD core loop, so they are deferred, not dropped (G-10, G-11).

---

## 9. Directory Structure Conformance

Matches `CLAUDE.md` exactly, with two additions flagged for your approval:

```
src/
├── components/   ✅ per CLAUDE.md
├── config/       ✅ per CLAUDE.md
├── database/     ✅ per CLAUDE.md
├── services/     ✅ per CLAUDE.md
├── store/        ✅ per CLAUDE.md
├── screens/      ✅ per CLAUDE.md
├── types/        ⚠️  ADDITION — shared interfaces incl. SensorTelemetryPacket
└── utils/        ⚠️  ADDITION — pure functions: units, heatIndex, heatBand
plugins/          ⚠️  ADDITION (root) — Expo config plugin, must sit outside src/
```

The alternative is to fold `types/` into `config/` and `utils/` into `services/`. I recommend against it: `config/` is specified as *"Immutable constants"* and `services/` as *"Decoupled background workers"*, and putting pure testable functions in either muddies both. **Say the word if you want strict six-directory conformance instead.**

---

## 10. Gaps, Contradictions, and Unstated Assumptions

Nothing below has been silently resolved. Items marked **BLOCKING** stop specific code from being written correctly at all.

| ID | Severity | Finding |
| :--- | :--- | :--- |
| **G-01** | 🔴 **BLOCKING** | **No BLE frame byte layout exists in any document.** `docs/04` gives the Service and Characteristic UUIDs but never the payload structure — no byte offsets, no endianness, no scaling factors, no frame-type discriminator, no MTU. `decodeFrame()` **cannot be written** from the docs. Options: (a) I build the full pipeline against `bleSimulator.ts` and you capture real frames with nRF Connect for a follow-up decode task; (b) you supply the PocketLab frame spec; (c) I write a dev-only hex logger and we derive it empirically from the device. **I recommend (a) + (c) in parallel** — it unblocks all UI and database work today and turns decode into one isolated function. This is the one place where guessing would silently produce plausible, wrong scientific data, so I will not guess. |
| **G-02** | 🟠 Needs your input | **Task 1.5's WAWA justification text does not exist in the docs.** `docs/05` says "embed WAWA institutional research justification text" but supplies no wording, and institutional language for a real nonprofit is not mine to invent. I will scaffold the constant with clearly-marked `DRAFT — PENDING WAWA APPROVAL` placeholder copy. Also note the task references *App Store Connect* (Apple) while the MVP is Android-only — per your instruction this is strings-only, but the same text will eventually be needed for the **Play Console** background-location declaration, which has its own separate requirements. |
| **G-03** | 🔴 **BLOCKING (resolved by decision)** | **No document specifies how the BLE stream and the GPS stream are joined into one `trek_points` row.** These are independent, differently-paced sources. Resolved in §5.3 R-03 as telemetry-driven at 1 Hz with last-known-fix attachment and a 10 s staleness cutoff. **This is my decision, not a documented requirement — please confirm or override, because it determines the shape of every dataset the project ever produces.** |
| **G-04** | 🟠 Needs verification | **`humidity_pct` may be unobtainable.** The schema requires humidity and `heat_index` depends on it, but `docs/04` verifies exactly **one** notification characteristic, and it is unconfirmed whether the PocketLab Voyager exposes relative humidity at all. If it does not: humidity and heat index are permanently `NULL` for the entire proxy phase, and Screen 3.2/3.3 must show `—` rather than a fabricated value. Resolvable only against the physical device. |
| **G-05** | 🟡 Resolved by decision | **`heat_index` has no specified formula, unit, or validity range.** Resolved in §4.3 (NOAA Rothfusz, stored °C, `NULL` below 80 °F / when humidity is absent, computed at write time). Confirm the **stored unit** in particular — §3.3 note 6. |
| **G-06** | 🟡 Needs your input | **"UHI Hotspots: 42" on Screen 3.2 is undefined.** No document defines a hotspot. Candidates: any point ≥ 105 °F (`--danger`); any point ≥ N °F above that session's mean; or a spatially-clustered run of consecutive hot points. These produce wildly different numbers from identical data, and it is a headline metric a Chief Heat Officer will ask about. **This is a product/scientific definition, not an engineering one — I need your call.** |
| **G-07** | 🟡 Resolved by decision | **The Brand Bible colour bands have undefined gaps** (`75–84.9` then `85–94.9` leaves `84.95` unclassified). Resolved as half-open intervals in §4.4. |
| **G-08** | 🟡 Contradiction | **Dark mode exists in the wireframe but nowhere else.** `docs/02` defines a full `body.dark-theme` token set; `docs/03` says "Light Mode Default" and lists *only* light tokens; the page control is labelled "Global Toggle *Preview*"; and **no app screen exposes a theme switch** — Screen 3.3 has only the unit toggle. Is dark mode in MVP scope, and if so what UI reaches it? I will transcribe both token sets into `theme.ts` but wire only light mode, with `userInterfaceStyle: "light"`. |
| **G-09** | 🟢 Minor | **The Inter font is never actually loaded in `docs/02`.** The `<head>` has `<link rel="preconnect">` to Google Fonts but no stylesheet `<link>`, so the wireframe renders in a system fallback — meaning the type you have been approving may not be the type you specified. React Native needs `expo-font` + bundled Inter files. Confirm Inter is intended (its 800 weight and tabular numerals do fit the "tactical" tone) and I will add `expo-font` and vendor the weights. |
| **G-10** | 🟡 Scope | **CSV export is in the PRD core loop and on Screen 3.2 ("Download Interoperable CSV") but is absent from the Sprint 1 backlog.** No column spec, no delimiter/encoding, no filename convention, and no library in the stack list (needs `expo-file-system` + `expo-sharing`). Deferred past Sprint 1 — confirm. "Interoperable" also implies a target consumer format (QGIS? ArcGIS? plain spreadsheet?) that nobody has named, and that choice drives the column headers. |
| **G-11** | 🟡 Scope | **No mapping library appears anywhere in the tech stack**, yet Screens 2.0 and 2.1 are map-first with a colour-graded telemetry polyline. `react-native-maps` (Google, needs an API key + billing) vs MapLibre (open, self-hostable tiles, no key) is a material cost/privacy decision for an EJ nonprofit — and MapLibre arguably suits the audience better. Out of Sprint 1 scope, but it needs deciding before Screen 2.1 is built, and an API-key dependency has procurement lead time. |
| **G-12** | 🟡 Gap | **Auth and campaign-enrollment semantics are unspecified.** Screen 1.1 is email/password (presumably Supabase Auth); Screen 1.2 validates an org token (`WAWA-PROCTOR`) against an undocumented campaigns table; Screen 1.2 also offers *"Skip to Public Muni Layer"* — so is enrollment optional? Can an un-enrolled user record? The core loop lists "Authenticate" first, but is offline-first login (cached session, no connectivity at the trailhead) required? **A field volunteer with no signal who cannot log in cannot record, which would defeat the offline-first premise** — this needs an answer before the auth screens are built. |
| **G-13** | 🟢 Copy inconsistency | **Three different names for the same sensor.** `docs/04`: device name `PL GT M201`. Screen 1.3: `UH-Proxy-Sensor (PL Voyager)`. Screen 2.0: `Probe Node: Linked (DS18B20)` — a DS18B20 is a specific Dallas 1-Wire digital thermometer, not a PocketLab. I will scan/filter on the authoritative `PL GT M201` and treat the others as display copy, but Screen 2.0's `DS18B20` should be confirmed as intentional forward-looking copy for the proprietary hardware rather than an error. |
| **G-14** | 🟢 Minor | **Screen 3.3's cache figures don't reconcile.** `1,420 rows (1.2MB)` implies ~850 bytes/row; the §3.3 schema is ~60–90 bytes/row including index overhead. The displayed size should be read from the actual DB file (`expo-file-system` `getInfoAsync`) rather than computed from a per-row constant, or the diagnostics panel will lie. Also: `Firmware Node: v1.0.4-UH` — is that app version or sensor firmware? They should not share a label. |
| **G-15** | 🟢 Rationale mismatch | **The 15 MB ceiling is justified against "iOS background assassins"** while the MVP is Android-only. **The rule is kept as non-negotiable** (§1.1); only its stated rationale is off-target for this platform. Android's actual pressure comes from Doze, LMK, and OEM battery managers — worth testing explicitly against an aggressive OEM (Samsung/Xiaomi) rather than a Pixel, since those are what volunteers will actually carry. |
| **G-16** | 🟢 Decision needed | **Android `package` identifier is unspecified.** I have proposed `org.urbanheat.field`. This is **immutable once published to Play** — please confirm before the first build. |
| **G-17** | 🟢 Note | **No Expo SDK version is named in any document** (§5.1–5.2). No exact dependency versions have been asserted, because Phase 1 forbids the network calls that would verify them. Resolved at the start of Phase 3 by the commands in §5.2, with output pasted back into this file. |

---

## 11. Recommended First Move on `PROCEED`

Build Step 0 (git hygiene) and Step 1 (scaffold), then **stop at 1.8 and run the BLE notification spike before writing any other code.** R-01 (New Architecture × `react-native-ble-plx`) and G-01 (unknown frame layout) both live in that one experiment, and they are the two things that can invalidate downstream work. A day spent proving the radio delivers 1 Hz notifications on a real `PL GT M201` protects the entire sprint from being built on an unverified foundation.

**Awaiting your explicit `PROCEED`.** I would also like answers to **G-03**, **G-06**, and **G-12** before Step 2 — and **G-16** before the first Android build.
