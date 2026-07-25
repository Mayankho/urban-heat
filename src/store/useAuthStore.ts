/**
 * Auth state — offline-first (G-12).
 *
 * `hasCachedSession` is the gate for the recording flow. It reflects whether a
 * JWT exists in AsyncStorage, NOT whether that JWT is currently valid, because a
 * volunteer at a trailhead with no signal must still be able to record.
 */

import { create } from 'zustand';
import { getCachedSession, isSupabaseConfigured } from '@/services/supabaseClient';

interface AuthState {
  /** null = not yet checked; true/false = resolved. */
  hasCachedSession: boolean | null;
  email: string | null;
  isCheckingSession: boolean;
  /** True when the build has no Supabase project configured — Sprint 1 default.
   *  Local recording remains fully available in this mode. */
  isLocalOnlyBuild: boolean;

  restoreSession: () => Promise<void>;
  setSession: (email: string | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  hasCachedSession: null,
  email: null,
  isCheckingSession: false,
  isLocalOnlyBuild: !isSupabaseConfigured,

  /**
   * Read the persisted session from disk at launch. Requires no network — this
   * is the offline trailhead path.
   */
  restoreSession: async () => {
    set({ isCheckingSession: true });
    const session = await getCachedSession();
    set({
      hasCachedSession: session !== null,
      email: session?.user?.email ?? null,
      isCheckingSession: false,
    });
  },

  setSession: (email) => set({ hasCachedSession: true, email }),
  clearSession: () => set({ hasCachedSession: false, email: null }),
}));

export const selectHasCachedSession = (s: AuthState) => s.hasCachedSession;
export const selectAuthEmail = (s: AuthState) => s.email;
export const selectIsLocalOnlyBuild = (s: AuthState) => s.isLocalOnlyBuild;
