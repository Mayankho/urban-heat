/**
 * Bounded display polyline for the live map.
 *
 * ============================================================================
 *  THE ONLY GROWING STRUCTURE IN THE APP — AND IT IS HARD-CAPPED.
 * ============================================================================
 *
 * A map polyline is unavoidably a list. The approved plan (§7 item 2) commits to
 * keeping it DECIMATED FOR DISPLAY and BOUNDED, with full fidelity retained on
 * disk in SQLite rather than in memory.
 *
 * Two mechanisms enforce that:
 *   1. DECIMATION — only every Nth fix becomes a vertex. At 1 Hz with N=5 that is
 *      one vertex per 5 s, which at walking pace is roughly one every 7 m — finer
 *      than a map at city zoom can resolve anyway.
 *   2. HARD CAP — at MAX_VERTICES the oldest vertex is dropped. The array can
 *      never exceed a fixed length regardless of session duration.
 *
 * Worst-case footprint: 600 vertices x ~32 bytes ≈ 19 KB. Against the 15 MB
 * background ceiling that is negligible, and crucially it is CONSTANT — a
 * ten-hour trek costs exactly the same as a ten-minute one.
 *
 * The full-fidelity path for rendering a COMPLETED session is
 * trekPointsRepo.getPolylineBySession(), read from disk on demand.
 *
 * This store is deliberately separate from useTelemetryStore so that the map — an
 * expensive native view — re-renders at 0.2 Hz rather than at the HUD's 1 Hz.
 */

import { create } from 'zustand';

/** Keep 1 vertex in every 5 fixes (~one per 5 s at 1 Hz). */
const DECIMATION_FACTOR = 5;

/** Hard ceiling on retained vertices. Oldest are dropped beyond this. */
const MAX_VERTICES = 600;

export interface HeatVertex {
  latitude: number;
  longitude: number;
  /** Celsius, for colouring the segment. */
  tempC: number | null;
}

interface PolylineState {
  vertices: HeatVertex[];
  /** Fix counter driving decimation. Not exposed to the UI. */
  fixCounter: number;
  addVertex: (vertex: HeatVertex) => void;
  reset: () => void;
}

export const usePolylineStore = create<PolylineState>((set) => ({
  vertices: [],
  fixCounter: 0,

  addVertex: (vertex) =>
    set((s) => {
      const counter = s.fixCounter + 1;

      // Decimate: skip everything that is not on the sampling boundary. The
      // counter still advances so sampling stays evenly spaced.
      if (counter % DECIMATION_FACTOR !== 0) {
        return { fixCounter: counter };
      }

      const next = s.vertices.length >= MAX_VERTICES
        ? [...s.vertices.slice(s.vertices.length - MAX_VERTICES + 1), vertex]
        : [...s.vertices, vertex];

      return { vertices: next, fixCounter: counter };
    }),

  reset: () => set({ vertices: [], fixCounter: 0 }),
}));

export const selectVertices = (s: PolylineState) => s.vertices;
