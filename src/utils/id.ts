/**
 * Client-generated identifiers.
 *
 * Rows are born offline on N devices and later merged into a single Supabase /
 * PostGIS table. A locally autoincrementing integer collides across devices and
 * forces an ID-rewrite pass at sync time; a client-generated UUID makes the local
 * row and the cloud row the SAME row, which is what makes sync idempotent and
 * safely re-runnable after a failed upload.
 *
 * See IMPLEMENTATION_PLAN.md §3.3 note 1.
 */

import * as Crypto from 'expo-crypto';

/** Cryptographically-random UUID v4. */
export function newId(): string {
  return Crypto.randomUUID();
}
