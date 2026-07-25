/**
 * Low-frequency user preferences — Wireframe Screen 3.3.
 *
 * Deliberately SEPARATE from useTelemetryStore. Mixing a preference that changes
 * once a month into the store that mutates once a second would make every
 * settings read a subscriber to the 1 Hz stream.
 *
 * Persisted to AsyncStorage so the unit preference survives a relaunch at the
 * trailhead with no connectivity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Screen 3.3 "Unit Scale Configuration". Fahrenheit is the active default,
 *  matching both the wireframe toggle state and the Brand Bible's °F bands. */
export type TemperatureUnit = 'F' | 'C';

interface SettingsState {
  temperatureUnit: TemperatureUnit;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  toggleTemperatureUnit: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      temperatureUnit: 'F',
      setTemperatureUnit: (unit) => set({ temperatureUnit: unit }),
      toggleTemperatureUnit: () =>
        set({ temperatureUnit: get().temperatureUnit === 'F' ? 'C' : 'F' }),
    }),
    {
      name: 'urban-heat-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export const selectTemperatureUnit = (s: SettingsState) => s.temperatureUnit;
