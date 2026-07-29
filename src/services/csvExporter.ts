/**
 * CSV export — resolves G-10.
 *
 * G-10 was left open in Sprint 1 because the PRD's core loop ends in "Export CSV"
 * and Screen 3.2 shows a download control, but no task, column spec, or target
 * consumer format was ever defined. The spec now exists, so this implements it.
 *
 * EXPORT SPEC
 *   filename: UrbanHeat_Session_[id].csv
 *   columns:  Timestamp (UTC), Elapsed Seconds, Latitude, Longitude,
 *             External_Ambient_Temp_C, External_Ambient_Temp_F
 *
 * TEMPERATURE PROVENANCE
 * ----------------------
 * The exported temperature is the EXTERNAL PROBE only. The PL GT M92 streams two
 * thermal channels and the internal one measures the inside of the sensor's own
 * enclosure — exporting it would publish the box's self-heating as though it were
 * street-level ambient. Only the external channel is ever persisted to
 * trek_points.ambient_temp_c, so this reads that column directly. The column name
 * says External_ so the provenance survives the handoff to a partner.
 *
 * Fahrenheit is CALCULATED AT EXPORT from the stored Celsius rather than being a
 * second stored column — one source of truth, no chance of the two drifting.
 *
 * MEMORY
 * ------
 * Rows are streamed from SQLite in pages and appended to a string builder rather
 * than materialising every TrekPoint object at once. A 10-hour transect is ~36,000
 * rows; the paged read keeps peak footprint bounded.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { streamBySession } from '@/database/trekPointsRepo';
import { getSession } from '@/database/sessionsRepo';
import { celsiusToFahrenheit } from '@/utils/units';

/** Rows fetched per page from SQLite. */
const PAGE_SIZE = 500;

export const CSV_HEADERS = [
  'Timestamp (UTC)',
  'Elapsed Seconds',
  'Latitude',
  'Longitude',
  'External_Ambient_Temp_C',
  'External_Ambient_Temp_F',
] as const;

/**
 * RFC-4180 quoting. Session names are user-entered and can contain commas or
 * quotes; without this a single comma would silently shift every later column.
 */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Fixed-precision or empty — never "null" or "NaN" leaking into a data file. */
function num(value: number | null, dp: number): string {
  if (value === null || !Number.isFinite(value)) return '';
  return value.toFixed(dp);
}

export interface CsvExportResult {
  ok: boolean;
  uri?: string;
  fileName?: string;
  rowCount?: number;
  message?: string;
}

/**
 * Build the CSV for one session and hand it to the native share sheet.
 *
 * Written to the CACHE directory, not documents: it is a derived artefact that
 * the OS may reclaim, and the share sheet copies it wherever the user chooses.
 */
export async function exportSessionCsv(sessionId: string): Promise<CsvExportResult> {
  try {
    const session = getSession(sessionId);
    if (session === null) {
      return { ok: false, message: 'Session not found in the local database.' };
    }

    const startedAt = session.startedAtUtc;
    const lines: string[] = [CSV_HEADERS.join(',')];
    let rowCount = 0;

    streamBySession(sessionId, PAGE_SIZE, (page) => {
      for (const p of page) {
        const elapsedSeconds = (p.timestampUtc - startedAt) / 1000;
        const tempC = p.ambientTempC;
        const tempF = tempC === null ? null : celsiusToFahrenheit(tempC);

        lines.push(
          [
            csvCell(new Date(p.timestampUtc).toISOString()),
            num(elapsedSeconds, 2),
            num(p.latitude, 6), // ~0.11 m at the equator; finer than consumer GPS
            num(p.longitude, 6),
            num(tempC, 3),
            num(tempF, 3),
          ].join(',')
        );
        rowCount += 1;
      }
    });

    if (rowCount === 0) {
      return { ok: false, message: 'This session has no recorded points to export.' };
    }

    // Trailing newline: POSIX convention, and some spreadsheet importers drop the
    // final row without it.
    const csv = lines.join('\n') + '\n';

    const fileName = `UrbanHeat_Session_${sessionId}.csv`;
    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    file.write(csv);

    if (!(await Sharing.isAvailableAsync())) {
      // The file is still on disk and valid, so report the path rather than
      // pretending the export failed.
      return {
        ok: true,
        uri: file.uri,
        fileName,
        rowCount,
        message: `Sharing is unavailable on this device. File written to ${file.uri}`,
      };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: `Export ${session.name}`,
      UTI: 'public.comma-separated-values-text',
    });

    return { ok: true, uri: file.uri, fileName, rowCount };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'CSV export failed.',
    };
  }
}
