/**
 * ============================================================================
 *  SPRINT 1 SCAFFOLD — INTENTIONALLY MINIMAL. TO BE REPLACED.
 * ============================================================================
 *
 * No navigation library was specified in any source document, and picking one is
 * a real architectural decision (expo-router vs react-navigation) with
 * implications for deep linking, the Screen 1.4 hard gate, and back-button
 * behaviour during an active recording. Rather than silently install one, this
 * store provides the smallest possible screen switcher so Sprint 1's mandated
 * work (Tasks 1.1–1.5) is demonstrable end-to-end.
 *
 * Flagged for decision — see the Sprint 1 report. When a navigator is chosen,
 * delete this file and the switch in App.tsx.
 *
 * It is a Zustand store rather than useState in App.tsx for a specific reason:
 * putting it in App-level useState would re-render the entire tree on every
 * screen change, and services (locationService, trekWriter) need to trigger
 * navigation imperatively from outside React.
 */

import { create } from 'zustand';

/** The 10 wireframe states. 2.2 is an OS notification, not a React screen. */
export type ScreenId =
  | 'welcome' // 1.1 Welcome & Auth
  | 'enrollment' // 1.2 Campaign Enrollment
  | 'bleSync' // 1.3 BLE Sensor Sync
  | 'locationGate' // 1.4 Location Hard Gate
  | 'launchpad' // 2.0 Pre-Trek Launchpad
  | 'live' // 2.1 Live Recording
  | 'validation' // 3.1 Trek Data Validation
  | 'profile' // 3.2 Profile & Cumulative Impact
  | 'settings'; // 3.3 System Settings & Diagnostics

export type TabId = 'track' | 'campaigns' | 'profile';

interface NavigationState {
  screen: ScreenId;
  navigate: (screen: ScreenId) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  screen: 'welcome',
  navigate: (screen) => set({ screen }),
}));

export const selectScreen = (s: NavigationState) => s.screen;

/** Imperative navigation for non-React callers (services, task handlers). */
export function navigateTo(screen: ScreenId): void {
  useNavigationStore.getState().navigate(screen);
}
