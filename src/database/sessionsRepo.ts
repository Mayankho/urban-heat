/**
 * sessions repository — low-frequency lifecycle operations.
 *
 * Unlike trekPointsRepo this is NOT a hot path: it runs on session start, session
 * end, and when the Profile/Archive screen renders. It is therefore free to build
 * objects and run aggregates.
 */

import { getDb } from './db';
import { SCHEMA_VERSION } from './schema';
import type {
  CumulativeImpact,
  PrivacyMode,
  SyncState,
  TrekSession,
} from '@/types/session';

interface SessionRow {
  id: string;
  name: string;
  campaign_token: string | null;
  privacy: PrivacyMode;
  started_at_utc: number;
  ended_at_utc: number | null;
  distance_meters: number;
  avg_temp_c: number | null;
  max_temp_c: number | null;
  point_count: number;
  hotspot_count: number;
  sync_state: SyncState;
  synced_at_utc: number | null;
  device_name: string | null;
  app_version: string | null;
  schema_version: number;
}

function mapRow(row: SessionRow): TrekSession {
  return {
    id: row.id,
    name: row.name,
    campaignToken: row.campaign_token,
    privacy: row.privacy,
    startedAtUtc: row.started_at_utc,
    endedAtUtc: row.ended_at_utc,
    distanceMeters: row.distance_meters,
    avgTempC: row.avg_temp_c,
    maxTempC: row.max_temp_c,
    pointCount: row.point_count,
    hotspotCount: row.hotspot_count,
    syncState: row.sync_state,
    syncedAtUtc: row.synced_at_utc,
    deviceName: row.device_name,
    appVersion: row.app_version,
    schemaVersion: row.schema_version,
  };
}

export interface CreateSessionInput {
  id: string;
  name: string;
  campaignToken: string | null;
  privacy: PrivacyMode;
  startedAtUtc: number;
  deviceName: string | null;
  appVersion: string | null;
}

/**
 * Insert the session row at the MOMENT recording starts, not when it ends.
 *
 * This matters: the foreign key on trek_points requires the parent row to exist
 * before the first sample lands, and if the process is killed mid-transect the
 * already-written points remain attached to a real, recoverable session rather
 * than being orphaned by a parent that was never committed.
 */
export function createSession(input: CreateSessionInput): void {
  getDb().runSync(
    `INSERT INTO sessions
       (id, name, campaign_token, privacy, started_at_utc, device_name, app_version, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      input.id,
      input.name,
      input.campaignToken,
      input.privacy,
      input.startedAtUtc,
      input.deviceName,
      input.appVersion,
      SCHEMA_VERSION,
    ]
  );
}

export interface FinalizeSessionInput {
  id: string;
  endedAtUtc: number;
  distanceMeters: number;
  avgTempC: number | null;
  maxTempC: number | null;
  pointCount: number;
  hotspotCount: number;
}

/** Write the rollups computed in-memory during the trek. */
export function finalizeSession(input: FinalizeSessionInput): void {
  getDb().runSync(
    `UPDATE sessions
        SET ended_at_utc    = ?,
            distance_meters = ?,
            avg_temp_c      = ?,
            max_temp_c      = ?,
            point_count     = ?,
            hotspot_count   = ?
      WHERE id = ?;`,
    [
      input.endedAtUtc,
      input.distanceMeters,
      input.avgTempC,
      input.maxTempC,
      input.pointCount,
      input.hotspotCount,
      input.id,
    ]
  );
}

/** Rename / re-privacy from Wireframe Screen 3.1 before upload. */
export function updateSessionMeta(
  id: string,
  name: string,
  privacy: PrivacyMode
): void {
  getDb().runSync('UPDATE sessions SET name = ?, privacy = ? WHERE id = ?;', [
    name,
    privacy,
    id,
  ]);
}

export function setSyncState(
  id: string,
  state: SyncState,
  syncedAtUtc: number | null
): void {
  getDb().runSync('UPDATE sessions SET sync_state = ?, synced_at_utc = ? WHERE id = ?;', [
    state,
    syncedAtUtc,
    id,
  ]);
}

/** Screen 3.2 feed, newest first. */
export function listSessions(limit = 100): TrekSession[] {
  return getDb()
    .getAllSync<SessionRow>(
      'SELECT * FROM sessions ORDER BY started_at_utc DESC LIMIT ?;',
      [limit]
    )
    .map(mapRow);
}

export function getSession(id: string): TrekSession | null {
  const row = getDb().getFirstSync<SessionRow>('SELECT * FROM sessions WHERE id = ?;', [
    id,
  ]);
  return row ? mapRow(row) : null;
}

/**
 * Recover a session that was recording when the process died.
 *
 * A row with a NULL ended_at_utc means recording never completed. On next launch
 * we can surface it to the user rather than silently abandoning field data a
 * volunteer walked several miles to collect.
 */
export function findUnfinishedSession(): TrekSession | null {
  const row = getDb().getFirstSync<SessionRow>(
    'SELECT * FROM sessions WHERE ended_at_utc IS NULL ORDER BY started_at_utc DESC LIMIT 1;'
  );
  return row ? mapRow(row) : null;
}

/**
 * Rebuild rollups for a session directly from its points.
 *
 * Used for crash recovery, where the in-memory accumulators are gone. Note this
 * recomputes avg/max/hotspots from disk but NOT distance — distance requires the
 * ordered fix sequence and jitter filtering, so a recovered session keeps
 * whatever distance was last persisted.
 */
export function recomputeRollupsFromPoints(id: string): void {
  const database = getDb();
  const row = database.getFirstSync<{
    n: number;
    avg_c: number | null;
    max_c: number | null;
  }>(
    `SELECT COUNT(*) AS n, AVG(ambient_temp_c) AS avg_c, MAX(ambient_temp_c) AS max_c
       FROM trek_points WHERE session_id = ?;`,
    [id]
  );

  // Hotspot threshold is 95 °F; the SQL compares in Celsius, so convert once:
  // (95 - 32) * 5/9 = 35.0 °C exactly.
  const hotspot = database.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM trek_points
      WHERE session_id = ? AND ambient_temp_c IS NOT NULL AND ambient_temp_c >= 35.0;`,
    [id]
  );

  database.runSync(
    `UPDATE sessions
        SET point_count = ?, avg_temp_c = ?, max_temp_c = ?, hotspot_count = ?
      WHERE id = ?;`,
    [row?.n ?? 0, row?.avg_c ?? null, row?.max_c ?? null, hotspot?.n ?? 0, id]
  );
}

export function deleteSession(id: string): void {
  // ON DELETE CASCADE removes dependent trek_points.
  getDb().runSync('DELETE FROM sessions WHERE id = ?;', [id]);
}

/** Screen 3.2 Cumulative Impact Matrix: Total Mapped / Expeditions / UHI Hotspots. */
export function getCumulativeImpact(): CumulativeImpact {
  const row = getDb().getFirstSync<{
    total_m: number | null;
    n: number;
    hotspots: number | null;
  }>(
    `SELECT SUM(distance_meters) AS total_m,
            COUNT(*)             AS n,
            SUM(hotspot_count)   AS hotspots
       FROM sessions
      WHERE ended_at_utc IS NOT NULL;`
  );
  return {
    totalDistanceMeters: row?.total_m ?? 0,
    expeditionCount: row?.n ?? 0,
    hotspotCount: row?.hotspots ?? 0,
  };
}
