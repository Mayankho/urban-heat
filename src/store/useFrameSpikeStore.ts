/**
 * G-01 SPIKE STORE — a bounded ring of the most recent raw BLE frames.
 *
 * WHY THIS EXISTS
 * ---------------
 * Closing G-01 (the undocumented PL GT M201 frame byte layout) requires
 * correlating raw bytes against a known reference temperature. That is easy over
 * USB, where the hex goes to logcat — but useless on a phone carried out to the
 * sensor with no cable attached.
 *
 * So the frames are surfaced in the app itself, on Screen 3.3, where they can be
 * read (or screenshotted) next to a thermometer with no computer involved.
 *
 * ZERO-RAM COMPLIANCE
 * -------------------
 * This is the ONLY place raw frames are retained, and it is hard-capped at
 * MAX_FRAMES. At ~20 bytes of hex per entry the ceiling is well under 1 KB, and
 * it is CONSTANT — a ten-hour session costs exactly the same as a ten-second one.
 * The Zero-RAM guardrail bans *unbounded* growth, not a fixed-size diagnostic ring.
 *
 * DELETE THIS FILE once a verified decoder is installed and G-01 is closed.
 */

import { create } from 'zustand';
import type { DecodeStatus } from '@/types/telemetry';

/** Hard cap. Enough to spot a pattern; small enough to be free. */
const MAX_FRAMES = 8;

export interface CapturedFrame {
  readonly hex: string;
  readonly byteLength: number;
  readonly decode: DecodeStatus;
  /** What the provisional decoder made of it, Celsius, or null. */
  readonly decodedC: number | null;
  readonly atUtcMs: number;
}

interface FrameSpikeState {
  frames: CapturedFrame[];
  /** Total frames seen, including ones dropped off the end of the ring. */
  totalSeen: number;
  push: (frame: CapturedFrame) => void;
  clear: () => void;
}

export const useFrameSpikeStore = create<FrameSpikeState>((set) => ({
  frames: [],
  totalSeen: 0,

  push: (frame) =>
    set((s) => ({
      // Newest first, oldest evicted at the cap.
      frames: [frame, ...s.frames].slice(0, MAX_FRAMES),
      totalSeen: s.totalSeen + 1,
    })),

  clear: () => set({ frames: [], totalSeen: 0 }),
}));

export const selectFrames = (s: FrameSpikeState) => s.frames;
export const selectTotalSeen = (s: FrameSpikeState) => s.totalSeen;
