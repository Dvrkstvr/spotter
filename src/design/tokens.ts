/**
 * Nocturne design tokens.
 *
 * Ported from the design system's `styles.css` (nocturne-e2ca9985). That file is
 * the source of truth for the look — when it changes, change this file to match.
 *
 * CSS `color-mix(in srgb, X p%, transparent)` has no React Native equivalent, so
 * those are resolved here to literal rgba() via `mix()`.
 */

import { Easing } from 'react-native';

/** color-mix(in srgb, <hex> <pct>%, transparent) */
function mix(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(pct * 100) / 10000})`;
}

const BG = '#161826';
const SURFACE = '#232532';
const TEXT = '#e9e9ed';
const ACCENT = '#9184d9';

/** The scrim behind sheets — a near-black the design uses directly, not a token. */
const SCRIM = '#0b0c14';

export const color = {
  bg: BG,
  surface: SURFACE,
  text: TEXT,
  accent: ACCENT,
  accent2: '#a7a1db',
  divider: mix(TEXT, 16),

  neutral100: '#f3f5fe',
  neutral200: '#e4e7f5',
  neutral300: '#cfd3e5',
  neutral400: '#b2b6ca',
  neutral500: '#9397ab',
  neutral600: '#75798c',
  neutral700: '#595d6c',
  neutral800: '#3f424d',
  neutral900: '#292b31',

  accent100: '#f5f4ff',
  accent200: '#e7e5fe',
  accent300: '#d2cefd',
  accent400: '#b5abfc',
  accent500: '#968ae0',
  accent600: '#796cbf',
  accent700: '#5d5294',
  accent800: '#423a6a',
  accent900: '#2b2741',
} as const;

/** Translucent washes the design builds with color-mix(). */
export const wash = {
  /** var(--color-text) at n% — hairlines, hover fills, in-sheet separators. */
  text: (pct: number) => mix(TEXT, pct),
  /** var(--color-accent) at n% — selected chip fills. */
  accent: (pct: number) => mix(ACCENT, pct),
  /** The sheet scrim. */
  scrim: (pct: number) => mix(SCRIM, pct),
  /** var(--color-bg) at n% — the tab bar sits on this. */
  bg: (pct: number) => mix(BG, pct),
} as const;

export const radius = { sm: 4, md: 8, lg: 14 } as const;

/**
 * Motion grammar. The rule: the more often a moment happens, the quieter its
 * animation. Each entry pairs a duration with an easing for Animated.timing;
 * `payoff` is the one overshoot in the system — an Animated.spring config
 * reserved for once-per-workout moments (seal pop, finish celebration).
 */
export const motion = {
  /** Press feedback on every Pressable — felt, never seen. */
  tap: { duration: 120, easing: Easing.out(Easing.ease) },
  /** State flips: check draws, colour lifts, washes. (riseIn's timing.) */
  quick: { duration: 200, easing: Easing.ease },
  /** Things that travel: bars, sheets, the tab dash. (sheetIn's curve.) */
  move: { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.3, 1) },
  /** Hold-to-confirm. Linear on purpose: the fill must report progress truthfully. */
  hold: { duration: 700, easing: Easing.linear },
  /** The overshoot spring, for Animated.spring. */
  payoff: { friction: 6, tension: 80 },
} as const;

/**
 * CSS `position:absolute; inset:0` as a spreadable object. React Native 0.86 no
 * longer types `StyleSheet.absoluteFillObject`, and `absoluteFill` is a
 * registered style id rather than something you can spread.
 */
export const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

export const space = {
  1: 2.8,
  2: 5.6,
  3: 8.4,
  4: 11.2,
  6: 16.8,
  8: 22.4,
} as const;

/**
 * Elevation. The system's --shadow-* start with a `0 0 0 1px` hairline ring,
 * which in RN is a border rather than a shadow — hence the split.
 */
export const elevation = {
  /** --shadow-sm: hairline only. */
  sm: { borderWidth: 1, borderColor: color.neutral800 },
  /** --shadow-md */
  md: {
    borderWidth: 1,
    borderColor: color.neutral700,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  /** --shadow-lg */
  lg: {
    borderWidth: 1,
    borderColor: color.neutral500,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
  },
} as const;

/**
 * The design system asks for Inter. It declares 400/500/600/700, but the screens
 * only ever reach for body (400) and heading (500) — so only those two are
 * loaded. Add the others in `app/_layout.tsx` if a screen starts needing them.
 */
export const font = {
  regular: 'Inter_400Regular',
  /** --font-heading-weight: 500 */
  heading: 'Inter_500Medium',
} as const;

/**
 * CSS letter-spacing is in em; RN's is in px. Design values are authored in em,
 * so convert against the element's own font size.
 */
export const tracking = (fontSize: number, em: number) => fontSize * em;

/**
 * The screen theme. The design ships one theme ("Ledger + cards") with a `dense`
 * prop that defaults to true; these are the dense values, resolved.
 *
 * `mark` in the design is `border-left: 0` — the accent edge marker is off in
 * this theme, so it is not represented here.
 */
export const t = {
  h2: 21,
  h3: 24,
  /** Hairline rows are square; only cards get a radius. */
  rowRadius: 0,
  cardRadius: radius.md,
  rowBg: 'transparent',
  exBg: color.surface,
  rowPadV: 7,
  rowPadH: 2,
  cardPadV: 8,
  cardPadH: 2,
  gap: 0,
  /** RULE — the hairline under every ledger row. */
  rule: wash.text(9),
  heroPad: { paddingTop: 15, paddingHorizontal: 15, paddingBottom: 14 },
  /** linear-gradient(150deg, accent-900 0%, surface 62%) */
  heroGradient: {
    colors: [color.accent900, color.surface] as const,
    locations: [0, 0.62] as const,
    start: { x: 0, y: 0 },
    end: { x: 0.9, y: 1 },
  },
} as const;

// The design pinned "today" to Friday 7 August 2026 (TODAY_DOW / TODAY_DOM
// lived here); the app went live instead — see src/data/date.ts.
