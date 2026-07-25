/**
 * TASK 1.1 — Local Database Initialization.
 *
 * The exact raw SQL strings for the offline-first SQLite cache, as approved in
 * IMPLEMENTATION_PLAN.md §3. This file is the SOURCE OF TRUTH for column names
 * and units; src/types/session.ts mirrors it and must be kept in lockstep.
 *
 * UNITS: temperatures CELSIUS, distance METRES, timestamps epoch MILLISECONDS UTC.
 */

/** Bump when the schema changes, and add a migration branch in db.ts. */
export const SCHEMA_VERSION = 1;

/**
 * Connection pragmas.
 *
 * WAL + synchronous=FULL. Guardrail 3 and Task 1.3 mandate synchronous writes
 * directly to disk. WAL gives an append-only commit path; FULL fsyncs the WAL on
 * every commit, so an Android LMK process kill mid-transect loses ZERO committed
 * rows. The cost is one fsync per second, trivially affordable at 1 Hz.
 *
 * We explicitly REJECT the common `synchronous = NORMAL` default: it permits
 * losing the last commits on an OS-level kill, which is precisely the failure
 * mode Android low-memory kills produce and precisely what Screen 2.2's
 * "un-killable data stream" promise forbids.
 */
export const PRAGMAS = [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA synchronous  = FULL;',
  'PRAGMA foreign_keys = ON;',
] as const;

/**
 * sessions
 *
 * NOTE: docs/05 Task 1.1 specifies columns for `trek_points` only — the
 * parenthesised list attaches grammatically to that table. NO columns are
 * specified anywhere for `sessions`. Every column below was reconstructed from
 * wireframe evidence, with provenance documented in IMPLEMENTATION_PLAN.md §3.2.
 * This table remains INFERRED and pending product confirmation.
 */
export const CREATE_TABLE_SESSIONS = `
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
  hotspot_count     INTEGER NOT NULL DEFAULT 0,
  sync_state        TEXT    NOT NULL DEFAULT 'local'
                            CHECK (sync_state IN ('local', 'syncing', 'synced', 'failed')),
  synced_at_utc     INTEGER,
  device_name       TEXT,
  app_version       TEXT,
  schema_version    INTEGER NOT NULL DEFAULT 1
);
`;

export const CREATE_INDEX_SESSIONS_STARTED = `
CREATE INDEX IF NOT EXISTS idx_sessions_started_at
  ON sessions (started_at_utc DESC);
`;

export const CREATE_INDEX_SESSIONS_SYNC = `
CREATE INDEX IF NOT EXISTS idx_sessions_sync_state
  ON sessions (sync_state);
`;

/**
 * trek_points
 *
 * Exactly the eight columns mandated by docs/05 Task 1.1, in the specified order.
 * Nothing has been added.
 *
 * NULLABILITY IS DELIBERATE, not laziness:
 *   • latitude/longitude — a GPS fix can drop under tree canopy along Proctor
 *     Creek. A temperature reading with no position is still scientifically
 *     meaningful. Writing 0,0 instead would plant points in the Gulf of Guinea
 *     and silently poison the dataset.
 *   • ambient_temp_c — a BLE frame can be missed. Never fabricate a reading.
 *   • humidity_pct — may be permanently NULL on this proxy hardware (G-04).
 *   • heat_index — NULL below the Rothfusz validity floor or when humidity is
 *     absent. Stored in CELSIUS (see IMPLEMENTATION_PLAN.md §3.3 note 6).
 */
export const CREATE_TABLE_TREK_POINTS = `
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
`;

/**
 * EXACTLY ONE index on trek_points.
 *
 * Every index is a write-amplification tax on the 1 Hz hot path. This composite
 * serves both queries the app actually makes — replay a session's polyline in
 * order, and stream a session in order for CSV export. No others are added.
 */
export const CREATE_INDEX_TREK_POINTS = `
CREATE INDEX IF NOT EXISTS idx_trek_points_session_time
  ON trek_points (session_id, timestamp_utc);
`;

/** Ordered DDL executed inside a single transaction on first launch. */
export const MIGRATION_V1: readonly string[] = [
  CREATE_TABLE_SESSIONS,
  CREATE_INDEX_SESSIONS_STARTED,
  CREATE_INDEX_SESSIONS_SYNC,
  CREATE_TABLE_TREK_POINTS,
  CREATE_INDEX_TREK_POINTS,
];

/**
 * THE 1 Hz HOT-PATH INSERT.
 *
 * Compiled ONCE per session into a prepared statement and reused for every
 * sample. Preparing once avoids re-parsing this SQL 3,600 times per hour and is
 * the difference between a smooth and a stuttering HUD.
 */
export const INSERT_TREK_POINT = `
INSERT INTO trek_points
  (id, session_id, timestamp_utc, latitude, longitude, ambient_temp_c, humidity_pct, heat_index)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`;

export const DB_NAME = 'urbanheat.db';
