/**
 * Supabase client — OFFLINE-FIRST AUTH (resolves G-12 per product directive).
 *
 * DIRECTIVE
 * ---------
 * "A volunteer cannot be blocked from recording if they lose signal at the
 *  trailhead. Integrate @react-native-async-storage/async-storage. Supabase
 *  gotrue must be configured to persist the JWT session token locally. If a user
 *  logs in once at WAWA headquarters on WiFi, their authenticated session
 *  persists indefinitely on the device for offline trailhead launches."
 *
 * HOW THAT IS ACHIEVED HERE
 * -------------------------
 *   storage:            AsyncStorage  — the JWT and refresh token survive process
 *                                       death and device reboot, on disk.
 *   persistSession:     true          — write the session to that storage.
 *   autoRefreshToken:   true          — refresh opportunistically WHEN online.
 *   detectSessionInUrl: false         — no browser redirect flow on React Native.
 *
 * THE IMPORTANT SUBTLETY
 * ----------------------
 * `getSession()` reads from local storage and does NOT require network. That is
 * what makes an offline trailhead launch work. `getUser()` DOES hit the network
 * and will fail offline — so the app must never gate recording on getUser().
 * Use isAuthenticatedOffline() below.
 *
 * A refresh token can still expire if the device stays offline past its lifetime
 * (a Supabase project setting, not something the client can override). That is a
 * genuine limitation of "indefinitely" and is called out in the Sprint 1 report:
 * recording is gated on the presence of a cached session, NOT on token freshness,
 * so an expired token still permits local recording — only the cloud SYNC step
 * requires a valid token, and sync is deferred until the user ends the session
 * and has connectivity.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Credentials come from the environment, never from source control.
 * See .env.example. The anon key is a public client key by design, but it is
 * still project-identifying and is kept out of the repo.
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True when the project is configured. Absent config is NOT fatal — Sprint 1 is
 *  local-only, and the app must remain fully usable for offline recording. */
export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example). Local recording does ' +
        'not require this; only cloud sync does.'
    );
  }
  if (client === null) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // THE OFFLINE-FIRST AUTH CONTRACT — see file header.
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Read the cached session from disk. Does NOT require network.
 *
 * This is the call that makes an offline trailhead launch work: a volunteer who
 * logged in on WiFi at WAWA headquarters days earlier gets a session back here
 * with no connectivity at all.
 */
export async function getCachedSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) return null;
    return data.session;
  } catch {
    // Never let an auth read failure block the field workflow.
    return null;
  }
}

/**
 * The ONLY authentication check the recording flow is permitted to use.
 *
 * Deliberately checks for the PRESENCE of a cached session rather than its
 * validity. An expired access token must not stop a volunteer from recording to
 * local SQLite — only the cloud sync step needs a live token, and that happens
 * later, on purpose, when the user ends the session.
 *
 * Never gate recording on supabase.auth.getUser(): that call requires network
 * and would fail at exactly the moment the guarantee matters most.
 */
export async function isAuthenticatedOffline(): Promise<boolean> {
  const session = await getCachedSession();
  return session !== null;
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured on this build.' };
  }
  try {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? `Network unavailable. Sign in once on WiFi; the session then persists offline. (${e.message})`
          : 'Sign-in failed.',
    };
  }
}

/**
 * Sign out — clears the persisted session from AsyncStorage.
 *
 * Warn the user before calling this in the field: it destroys the cached
 * credential that makes offline recording possible, and they cannot sign back in
 * without connectivity.
 */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await getSupabase().auth.signOut();
}
