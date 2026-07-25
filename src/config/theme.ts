/**
 * Design tokens transcribed verbatim from docs/02_Urban_Heat_Wireframes.html
 * and cross-referenced against docs/03_Brand_Bible_and_ICP.md.
 *
 * Frozen. Components must never inline a hex literal — if a colour is needed and
 * missing here, that is a question for the Brand Bible, not a local decision.
 */

import type { TextStyle } from 'react-native';

/** Light mode — the default per Brand Bible §2 ("Color Palette (Light Mode Default)"). */
export const LIGHT = {
  bg: '#F8F9FA', // Primary Canvas — foundation background layer
  surface: '#FFFFFF', // Surface Container — cards and HUD backdrops
  border: '#E1E4E8', // Structural Border — perimeter borders and framing strokes
  text: '#0D1117', // Primary Text — core metrics and bold typography
  muted: '#586069', // Muted Metadata — secondary metadata and timestamps
} as const;

/**
 * Dark mode — defined in the wireframe's `body.dark-theme` block.
 *
 * NOTE (G-08): the Brand Bible never mentions dark mode and no app screen
 * exposes a control to reach it (Screen 3.3 has only the °F/°C toggle; the
 * wireframe's page-level button is labelled "Global Toggle Theme Preview").
 * Transcribed for completeness; NOT wired up. app.config.ts pins
 * userInterfaceStyle: 'light' until scope is confirmed.
 */
export const DARK = {
  bg: '#0D1117',
  surface: '#161B22',
  border: '#30363D',
  text: '#FFFFFF',
  muted: '#8B949E',
} as const;

/**
 * Functional Data Tokens — "The Polyline Heat Array" (Brand Bible §2).
 * Thresholds are in FAHRENHEIT. See utils/heatBand.ts for the classifier.
 */
export const HEAT = {
  cool: '#3498DB', // < 75 °F
  normal: '#2ECC71', // 75 – 84.9 °F
  warn: '#F1C40F', // 85 – 94.9 °F
  crit: '#E67E22', // 95 – 104.9 °F
  danger: '#E74C3C', // >= 105 °F
} as const;

/** Rigid 8px grid — `--s1` through `--s4` in the wireframe. */
export const SPACE = {
  s1: 8,
  s2: 16,
  s3: 24,
  s4: 32,
} as const;

/**
 * Radii are zero everywhere. The wireframe's `.device` rule sets
 * `border-radius: 0` and annotates it "flat / rigid".
 *
 * The only exceptions are intentional circles (radar core, launch button,
 * pill dots), which use their own width/2.
 */
export const RADIUS = { none: 0 } as const;

/**
 * Typography. The wireframe specifies Inter but never actually loads it —
 * the <head> has a Google Fonts preconnect with no stylesheet link, so the
 * blueprint renders in a system fallback (G-09).
 *
 * Until Inter is vendored via expo-font, `family: undefined` lets React Native
 * use the platform default (Roboto on Android), which is the honest equivalent
 * of what the wireframe actually displays.
 */
export const TYPE = {
  family: undefined as string | undefined,
  monoFamily: 'monospace',
  // Weights and letter-spacing lifted from the wireframe's rules
  brandWeight: '800',
  labelWeight: '600',
  metricWeight: '800',
  brandSpacing: 3,
  labelSpacing: 1.5,
  metricSpacing: -0.5,
} as const;

/**
 * Tabular numerals — critical for a 1 Hz HUD, otherwise digits jitter as they
 * change width and the temperature readout visibly wobbles every second.
 * Wireframe: `font-variant-numeric: tabular-nums`.
 *
 * Typed as TextStyle['fontVariant'] rather than `as const`: React Native's style
 * types require a mutable array here.
 */
export const TABULAR_NUMS: TextStyle['fontVariant'] = ['tabular-nums'];

export type ThemeColors = typeof LIGHT;

/** Active palette. Light-only until G-08 is resolved. */
export const COLORS: ThemeColors = LIGHT;

export const THEME = {
  colors: COLORS,
  heat: HEAT,
  space: SPACE,
  radius: RADIUS,
  type: TYPE,
} as const;
