/**
 * Session lifecycle — low frequency (start, end, metadata edits).
 *
 * Separate from useTelemetryStore so that a HUD component subscribing to the
 * temperature never re-renders because the session name changed, and vice versa.
 */

import { create } from 'zustand';
import type { PrivacyMode } from '@/types/session';

interface SessionState {
  /** UUID of the active session, or null when not recording. */
  activeSessionId: string | null;
  isRecording: boolean;
  startedAtUtc: number | null;
  /** Screen 1.2 org verification token, e.g. "WAWA-PROCTOR". Null for the
   *  "Skip to Public Muni Layer" path. */
  campaignToken: string | null;
  /** Screen 3.1 draft name, editable before upload. */
  draftName: string;
  draftPrivacy: PrivacyMode;

  beginSession: (id: string, startedAtUtc: number, campaignToken: string | null) => void;
  endSession: () => void;
  setCampaignToken: (token: string | null) => void;
  setDraftName: (name: string) => void;
  setDraftPrivacy: (privacy: PrivacyMode) => void;
}

/**
 * Default session name, e.g. "Transect 2026-07-25 14:03". Replaced by the user on
 * Screen 3.1, where the wireframe shows "Proctor Creek Sidewalk Run_01".
 *
 * Exported so sessionController uses the SAME name when it INSERTs the row. It
 * previously wrote a raw `toISOString()` string, which surfaced in the Screen 3.2
 * feed as "Transect 2026-07-26T22:33:59.211Z" for any session the user never got
 * to rename — e.g. one interrupted by a crash.
 */
export function defaultSessionName(startedAtUtc: number): string {
  const d = new Date(startedAtUtc);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `Transect ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSessionId: null,
  isRecording: false,
  startedAtUtc: null,
  campaignToken: null,
  draftName: '',
  draftPrivacy: 'public_muni',

  beginSession: (id, startedAtUtc, campaignToken) =>
    set({
      activeSessionId: id,
      isRecording: true,
      startedAtUtc,
      campaignToken,
      draftName: defaultSessionName(startedAtUtc),
      draftPrivacy: 'public_muni',
    }),

  /** Clears `isRecording` but KEEPS activeSessionId — Screen 3.1 still needs it
   *  to rename, set privacy, and upload the session that just finished. */
  endSession: () => set({ isRecording: false }),

  setCampaignToken: (token) => set({ campaignToken: token }),
  setDraftName: (name) => set({ draftName: name }),
  setDraftPrivacy: (privacy) => set({ draftPrivacy: privacy }),
}));

export const selectIsRecording = (s: SessionState) => s.isRecording;
export const selectActiveSessionId = (s: SessionState) => s.activeSessionId;
export const selectCampaignToken = (s: SessionState) => s.campaignToken;
export const selectDraftName = (s: SessionState) => s.draftName;
export const selectDraftPrivacy = (s: SessionState) => s.draftPrivacy;
