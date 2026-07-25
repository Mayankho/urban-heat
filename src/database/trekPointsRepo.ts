/**
 * trek_points repository — the 1 Hz hot path.
 *
 * ZERO-RAM CONTRACT (Guardrail 2 / Task 1.3)
 * ------------------------------------------
 * insertPoint() takes primitives, writes them synchronously to disk, and returns.
 * It retains NOTHING. There is no module-level buffer, no batch array, no pending
 * queue. The prepared statement is the only retained object and it is fixed-size.
 *
 * Do not add a "batch for performance" buffer here. At 1 Hz there is no
 * throughput problem to solve, and a buffer is exactly the unbounded JS array the
 * 15 MB ceiling exists to prevent.
 */

import type { SQLiteStatement } from 'expo-sqlite';
import { getDb } from './db';
import { INSERT_TREK_POINT } from './schema';
import type { TrekPoint } from '@/types/session';

/**
 * Prepared statement, compiled once and reused for every sample.
 * Avoids re-parsing the INSERT 3,600 times per hour.
 */
let insertStatement: SQLiteStatement | null = null;

/** Compile the hot-path statement. Call once when a session starts. */
export function prepareWriter(): void {
  if (insertStatement !== null) return;
  insertStatement = getDb().prepareSync(INSERT_TREK_POINT);
}

/** Release the prepared statement. Call when a session ends. */
export function releaseWriter(): void {
  if (insertStatement === null) return;
  insertStatement.finalizeSync();
  insertStatement = null;
}

/**
 * Write one trek point synchronously to disk.
 *
 * Parameters are passed as primitives rather than as a TrekPoint object so no
 * intermediate object is allocated per sample on the hot path.
 */
export function insertPoint(
  id: string,
  sessionId: string,
  timestampUtc: number,
  latitude: number | null,
  longitude: number | null,
  ambientTempC: number | null,
  humidityPct: number | null,
  heatIndexC: number | null
): void {
  // Lazily prepare so a stray write can never throw on an unprepared statement.
  if (insertStatement === null) prepareWriter();

  insertStatement!.executeSync([
    id,
    sessionId,
    timestampUtc,
    latitude,
    longitude,
    ambientTempC,
    humidityPct,
    heatIndexC,
  ]);
}

/** Row shape as SQLite returns it (snake_case). */
interface TrekPointRow {
  id: string;
  session_id: string;
  timestamp_utc: number;
  latitude: number | null;
  longitude: number | null;
  ambient_temp_c: number | null;
  humidity_pct: number | null;
  heat_index: number | null;
}

function mapRow(row: TrekPointRow): TrekPoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestampUtc: row.timestamp_utc,
    latitude: row.latitude,
    longitude: row.longitude,
    ambientTempC: row.ambient_temp_c,
    humidityPct: row.humidity_pct,
    heatIndexC: row.heat_index,
  };
}

/**
 * Read a session's points in time order.
 *
 * CAUTION: this materialises the whole session in memory — ~3,600 objects per
 * hour walked. Acceptable for rendering a completed session's polyline or
 * exporting a CSV, and NEVER to be called during live recording. Use
 * streamBySession() for large exports.
 */
export function getPointsBySession(sessionId: string): TrekPoint[] {
  const rows = getDb().getAllSync<TrekPointRow>(
    'SELECT * FROM trek_points WHERE session_id = ? ORDER BY timestamp_utc ASC;',
    [sessionId]
  );
  return rows.map(mapRow);
}

/**
 * Page through a session's points in time order without holding them all at once.
 * This is the path a CSV exporter should use.
 */
export function streamBySession(
  sessionId: string,
  pageSize: number,
  onPage: (page: TrekPoint[]) => void
): void {
  const database = getDb();
  let offset = 0;
  for (;;) {
    const rows = database.getAllSync<TrekPointRow>(
      'SELECT * FROM trek_points WHERE session_id = ? ORDER BY timestamp_utc ASC LIMIT ? OFFSET ?;',
      [sessionId, pageSize, offset]
    );
    if (rows.length === 0) return;
    onPage(rows.map(mapRow));
    offset += rows.length;
    if (rows.length < pageSize) return;
  }
}

/**
 * Coordinates only, for drawing a completed session's polyline.
 * Rows with a NULL fix are excluded — a polyline cannot render a gap as a vertex.
 */
export function getPolylineBySession(
  sessionId: string
): Array<{ latitude: number; longitude: number; ambientTempC: number | null }> {
  return getDb().getAllSync<{
    latitude: number;
    longitude: number;
    ambient_temp_c: number | null;
  }>(
    `SELECT latitude, longitude, ambient_temp_c
       FROM trek_points
      WHERE session_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY timestamp_utc ASC;`,
    [sessionId]
  ).map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    ambientTempC: r.ambient_temp_c,
  }));
}

export function countBySession(sessionId: string): number {
  const row = getDb().getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM trek_points WHERE session_id = ?;',
    [sessionId]
  );
  return row?.n ?? 0;
}
