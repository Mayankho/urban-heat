/**
 * SQLite connection singleton.
 *
 * Uses expo-sqlite's SYNCHRONOUS API (openDatabaseSync / execSync / runSync).
 * This is not a stylistic preference — Guardrail 2 and Task 1.3 mandate
 * synchronous writes straight to disk so a payload can be released from JS
 * memory immediately rather than being held alive by a pending promise.
 */

import * as SQLite from 'expo-sqlite';
import { DB_NAME, MIGRATION_V1, PRAGMAS, SCHEMA_VERSION } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

/** Open (or reuse) the database handle. */
export function getDb(): SQLite.SQLiteDatabase {
  if (db === null) {
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

/**
 * Create tables and apply pragmas. Idempotent — safe to call on every launch.
 *
 * Migration strategy uses SQLite's built-in `user_version` counter rather than a
 * bespoke migrations table: at this schema size a table would be more moving
 * parts than the problem warrants, and user_version is atomic with the
 * transaction that performs the migration.
 */
export function initializeDatabase(): void {
  const database = getDb();

  // Pragmas are per-connection and must be applied before the transaction.
  // journal_mode in particular cannot be changed inside one.
  for (const pragma of PRAGMAS) {
    database.execSync(pragma);
  }

  const row = database.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) return;

  database.withTransactionSync(() => {
    if (currentVersion < 1) {
      for (const statement of MIGRATION_V1) {
        database.execSync(statement);
      }
    }
    // Future migrations: `if (currentVersion < 2) { ... }`
    database.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}

/**
 * Screen 3.3 — "⚠️ Flush Local SQLite Cache".
 *
 * A single DELETE FROM sessions suffices: ON DELETE CASCADE plus
 * `PRAGMA foreign_keys = ON` removes every dependent trek_point with no
 * orphan leak.
 *
 * VACUUM afterwards actually returns the pages to the filesystem — without it
 * the file stays large and the Screen 3.3 cache-size readout would keep
 * reporting the pre-flush size, making the destructive action look broken.
 */
export function flushLocalCache(): void {
  const database = getDb();
  database.withTransactionSync(() => {
    database.execSync('DELETE FROM sessions;');
  });
  // VACUUM cannot run inside a transaction.
  database.execSync('VACUUM;');
}

/**
 * On-disk size of the database in bytes, for the Screen 3.3 diagnostics panel.
 *
 * Derived from SQLite's own page accounting rather than a per-row constant.
 * The wireframe's "1,420 rows (1.2MB)" implies ~850 bytes/row against a schema
 * that is ~60–90 bytes/row (G-14), so a computed estimate would simply lie.
 */
export function getDatabaseSizeBytes(): number {
  const database = getDb();
  const pageCount = database.getFirstSync<{ page_count: number }>(
    'PRAGMA page_count;'
  );
  const pageSize = database.getFirstSync<{ page_size: number }>('PRAGMA page_size;');
  return (pageCount?.page_count ?? 0) * (pageSize?.page_size ?? 0);
}

/** Total cached trek_points across all sessions — Screen 3.3 "Cache Ledger". */
export function getTotalPointCount(): number {
  const database = getDb();
  const row = database.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM trek_points;'
  );
  return row?.n ?? 0;
}

/** Test/debug helper. Closes the handle so the next getDb() reopens. */
export function closeDatabase(): void {
  if (db !== null) {
    db.closeSync();
    db = null;
  }
}
