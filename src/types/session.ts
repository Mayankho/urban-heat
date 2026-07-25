/**
 * Session and trek-point domain types.
 *
 * These mirror the SQLite schema in src/database/schema.ts one-for-one. Keep them
 * in lockstep — schema.ts is the source of truth for column names and units.
 */

/** Wireframe Screen 3.1 privacy toggle: "Public Muni Layer" / "Private WAWA Archive". */
export type PrivacyMode = 'public_muni' | 'private_wawa';

/** Offline-first sync lifecycle. Rows are born 'local' and only leave the device
 *  when the user explicitly ends a session (docs/01 core loop). */
export type SyncState = 'local' | 'syncing' | 'synced' | 'failed';

/**
 * A recorded transect. Column provenance is documented in
 * IMPLEMENTATION_PLAN.md §3.2 — every field traces to a wireframe screen.
 *
 * UNITS: distance in METRES, temperatures in CELSIUS, times in epoch ms UTC.
 * Imperial units exist only at the presentation layer (utils/units.ts).
 */
export interface TrekSession {
  readonly id: string;
  readonly name: string;
  /** Screen 1.2 org token, e.g. "WAWA-PROCTOR". Null when the user chose
   *  "Skip to Public Muni Layer". */
  readonly campaignToken: string | null;
  readonly privacy: PrivacyMode;
  readonly startedAtUtc: number;
  readonly endedAtUtc: number | null;
  readonly distanceMeters: number;
  readonly avgTempC: number | null;
  readonly maxTempC: number | null;
  readonly pointCount: number;
  /**
   * Screen 3.2 headline metric ("UHI Hotspots 42").
   *
   * Per the approved G-06 definition: an absolute-threshold counter incremented
   * once for every individual 1 Hz packet whose ambient temperature is
   * >= 95 °F (the --crit band floor, covering Critical Heat AND Extreme Danger).
   * No spatial clustering, no delta-above-mean — this is a live counter, not a
   * post-processed statistic.
   */
  readonly hotspotCount: number;
  readonly syncState: SyncState;
  readonly syncedAtUtc: number | null;
  readonly deviceName: string | null;
  readonly appVersion: string | null;
  readonly schemaVersion: number;
}

/**
 * One 1 Hz telemetry sample joined with the most recent GPS fix.
 *
 * Field names map directly to the eight mandated trek_points columns
 * (docs/05 Task 1.1). `heatIndex` is stored in CELSIUS — the SQL column name
 * carries no unit suffix, so the unit lives in the TypeScript name and in
 * IMPLEMENTATION_PLAN.md §3.3 note 6.
 */
export interface TrekPoint {
  readonly id: string;
  readonly sessionId: string;
  readonly timestampUtc: number;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly ambientTempC: number | null;
  readonly humidityPct: number | null;
  readonly heatIndexC: number | null;
}

/** Aggregate rollups for the Screen 3.2 Cumulative Impact Matrix. */
export interface CumulativeImpact {
  readonly totalDistanceMeters: number;
  readonly expeditionCount: number;
  readonly hotspotCount: number;
}
