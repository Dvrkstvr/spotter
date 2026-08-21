/**
 * Nocturne design tokens.
 *
 * Ported from the design system's `styles.css` (nocturne-e2ca9985). That file is
 * the source of truth for the look — when it changes, change this file to match.
 *
 * CSS `color-mix(in srgb, X p%, transparent)` has no React Native equivalent, so
 * those are resolved here to literal rgba() via `mix()`.
 *
 * ── Themes ────────────────────────────────────────────────────────────────
 *
 * The design system is dark-only and blurple-only. Light mode and the colour
 * themes are a deliberate departure (Calvin's, 10 Aug 2026) — but they are
 * *derived* from Nocturne rather than authored beside it, because measuring
 * the ported palette shows it is a system, not a set of picks:
 *
 *   · neutrals and accents share one lightness ladder, to four decimals
 *     (0.9711 · 0.9310 · 0.8699 · 0.7798 · 0.6791 · 0.5802 · 0.4801 · 0.3802
 *     · 0.2898 in OKLab L)
 *   · each ramp holds a single hue the whole way down — 289° for the accent,
 *     275° for the neutrals
 *   · chroma peaks mid-ramp and tapers to both ends
 *
 * So a colour theme is Nocturne's own ramp with the hue rotated, and light
 * mode is Nocturne *reflected about its own background*: every colour keeps
 * its perceived distance from the page it sits on, which is the relationship
 * the design actually tuned. Nothing here invents a value — with the default
 * theme on dark, `color` is byte-identical to the ported hex above.
 *
 * `color`, `t` and `elevation` are mutated in place by `applyTheme` rather
 * than rebuilt, so styles can keep being written against them at module
 * scope. What makes that safe is `themed()` in `./theme` — see there.
 */

import { Easing } from 'react-native';

export type ThemeName = 'blurple' | 'teal' | 'ember' | 'forest' | 'rose' | 'slate';
/** `system` follows the OS; the other two override it. */
export type ThemeMode = 'system' | 'light' | 'dark';

/* ── colour maths ──────────────────────────────────────────────────────────
 *
 * sRGB ↔ OKLab (Björn Ottosson's coefficients), plus polar OKLCH. OKLab is
 * what makes "same lightness, different hue" mean the same thing to the eye
 * across the wheel — rotating in HSL would make the green themes glow and the
 * blue ones sink.
 */

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

type Oklch = { L: number; C: number; H: number };

function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const H = (Math.atan2(B, A) * 180) / Math.PI;
  return { L, C: Math.hypot(A, B), H: H < 0 ? H + 360 : H };
}

/** Linear sRGB for an OKLCH triple, un-clamped — negative means out of gamut. */
function toLinearRgb({ L, C, H }: Oklch): [number, number, number] {
  const rad = (H * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/**
 * OKLCH → #rrggbb, giving up chroma rather than lightness when the hue can't
 * hold it. Rotating a blurple ramp into cyan or green walks off the edge of
 * sRGB at the saturated end; clamping the channels there would shift the hue,
 * so the chroma is bisected down to the last value that still fits.
 */
function oklchToHex(c: Oklch): string {
  let rgb = toLinearRgb(c);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = c.C;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(toLinearRgb({ ...c, C: mid }))) lo = mid;
      else hi = mid;
    }
    rgb = toLinearRgb({ ...c, C: lo });
  }
  return (
    '#' +
    rgb
      .map((v) => {
        const n = Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255);
        return n.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

/** color-mix(in srgb, <hex> <pct>%, transparent) */
function mix(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(pct * 100) / 10000})`;
}

/* ── the ported palette ────────────────────────────────────────────────── */

/** Nocturne as `styles.css` ships it. Every theme is a transform of this. */
const NOCTURNE = {
  bg: '#161826',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',
  accent2: '#a7a1db',

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

type Slot = keyof typeof NOCTURNE;

/** The scrim behind sheets — a near-black the design uses directly, not a token. */
const SCRIM = '#0b0c14';

const BASE = Object.fromEntries(
  (Object.keys(NOCTURNE) as Slot[]).map((k) => [k, hexToOklch(NOCTURNE[k])])
) as Record<Slot, Oklch>;

/** The accent ramp's hue. Every theme's `hue` is read against this one. */
const BASE_HUE = BASE.accent.H;

/** Where a light page sits on the ladder, and the point light mode reflects about. */
const LIGHT_BG_L = 0.982;

/**
 * Colour themes. `hue` turns the whole palette; the two multipliers say how
 * much chroma survives the turn, separately for the accent ramp and for the
 * page it sits on.
 *
 * They are separate because chroma is not perceived evenly around the wheel.
 * The bg's 0.028 is an unnoticed cool tint at 289°; carried to 48° at full
 * strength the same number is unmistakably brown. So the accent keeps its
 * weight — that is the theme — and the page tint is dialled back to stay a
 * tint. Blurple is 1 / 1, which is what keeps it the ported palette exactly.
 *
 * `slate` drains both instead of turning: Nocturne for a room where a purple
 * screen is the wrong amount of screen.
 */
export const THEMES: readonly {
  key: ThemeName;
  hue: number;
  /** chroma kept by accent / accent2 / accent100–900 */
  accentC: number;
  /** chroma kept by bg / surface / text / neutral100–900 */
  tintC: number;
}[] = [
  { key: 'blurple', hue: BASE_HUE, accentC: 1, tintC: 1 },
  { key: 'teal', hue: 195, accentC: 1, tintC: 0.55 },
  { key: 'forest', hue: 148, accentC: 1, tintC: 0.5 },
  { key: 'ember', hue: 48, accentC: 1, tintC: 0.45 },
  { key: 'rose', hue: 8, accentC: 1, tintC: 0.55 },
  { key: 'slate', hue: BASE_HUE, accentC: 0.22, tintC: 0.4 },
];

/** Accent-family slots take `accentC`; everything else takes `tintC`. */
const isAccentSlot = (k: Slot) => k.startsWith('accent');

export const isThemeName = (v: unknown): v is ThemeName =>
  THEMES.some((t) => t.key === v);

/**
 * Chroma has to give way as a colour approaches white: 0.028 is an unnoticed
 * tint on a near-black background and a visible cast on a near-white one. Full
 * strength below L 0.75, gone by pure white.
 */
const taper = (L: number) => Math.min(1, Math.max(0, (1 - L) / 0.25));

/**
 * Where a refusal is drawn — the one colour here that is neither a neutral nor
 * the accent. Nocturne has no such slot, so this is derived rather than
 * authored beside it, like everything else in this file.
 *
 * **It does not turn with the theme.** Every other hue is the accent's,
 * rotated; this one says *the app would not do that*, which is the same fact
 * whichever colour you chose the app to be — and under `rose` (8°) or `ember`
 * (48°) a warning built out of the accent ramp would simply be the accent. So
 * the hue is fixed, and only the mode's reflection applies: a colour that sat
 * this far above the dark page sits the same distance below the light one,
 * exactly as every slot in `buildPalette` does.
 *
 * It borrows `accent400`'s own lightness and chroma and turns them to red, so
 * it lands in this system's register rather than a browser's — understatement
 * is the voice, and a warning is the last thing that should be shouting.
 */
const WARN_HUE = 25;

const warnFor = (dark: boolean) => {
  const { L, C } = BASE.accent400;
  const lit = dark ? L : LIGHT_BG_L - (L - BASE.bg.L);
  return oklchToHex({ L: lit, C: dark ? C : C * taper(lit), H: WARN_HUE });
};

function buildPalette(name: ThemeName, dark: boolean): Record<Slot, string> {
  const theme = THEMES.find((x) => x.key === name) ?? THEMES[0];
  const dHue = theme.hue - BASE_HUE;
  const out = {} as Record<Slot, string>;
  for (const key of Object.keys(BASE) as Slot[]) {
    const src = BASE[key];
    let { L, C } = src;
    C *= isAccentSlot(key) ? theme.accentC : theme.tintC;
    if (!dark) {
      // Reflect about the background: a colour that sat 0.47 above the dark
      // page sits 0.47 below the light one, so every contrast the design
      // tuned survives the flip.
      L = LIGHT_BG_L - (L - BASE.bg.L);
      C *= taper(L);
    }
    out[key] = oklchToHex({ L, C, H: src.H + dHue });
  }
  return out;
}

/**
 * The contract with the design, checked rather than hoped for: with no hue to
 * turn and no chroma to give up, the derivation has to reproduce the ported
 * hex exactly. If this ever fires, the maths drifted and every screen in the
 * default theme drifted with it.
 */
if (__DEV__) {
  const check = buildPalette('blurple', true);
  const drift = (Object.keys(NOCTURNE) as Slot[]).filter((k) => check[k] !== NOCTURNE[k]);
  if (drift.length)
    console.warn(
      `[tokens] blurple/dark no longer matches Nocturne: ${drift
        .map((k) => `${k} ${NOCTURNE[k]}→${check[k]}`)
        .join(', ')}`
    );
}

const paletteCache = new Map<string, Record<Slot, string>>();
const paletteFor = (name: ThemeName, dark: boolean) => {
  const id = `${name}:${dark ? 'd' : 'l'}`;
  let p = paletteCache.get(id);
  if (!p) paletteCache.set(id, (p = buildPalette(name, dark)));
  return p;
};

/** Swatch colours for the settings picker, without applying the theme. */
export const themeSwatch = (name: ThemeName, dark: boolean) => {
  const p = paletteFor(name, dark);
  return { accent: p.accent, bg: p.bg, surface: p.surface };
};

/* ── the live palette ──────────────────────────────────────────────────── */

/**
 * The current theme's colours, mutated in place by `applyTheme`.
 *
 * **Only safe to read from inside a `themed()` sheet**, which is rebuilt when
 * the palette changes. Reading it during render does not work: the React
 * Compiler treats a module import as a constant, so anything derived from one
 * is hoisted out of the component and computed exactly once. Components read
 * `useColors()` instead — see `./theme`.
 */
export const color: Record<Slot | 'divider' | 'warn', string> = {
  ...NOCTURNE,
  divider: mix(NOCTURNE.text, 16),
  warn: warnFor(true),
};

/** Translucent washes the design builds with color-mix(). */
export type Wash = {
  /** var(--color-text) at n% — hairlines, hover fills, in-sheet separators. */
  text: (pct: number) => string;
  /** var(--color-accent) at n% — selected chip fills. */
  accent: (pct: number) => string;
  /** The sheet scrim. Dark in both modes: a scrim darkens, that is the job. */
  scrim: (pct: number) => string;
  /** var(--color-bg) at n% — the tab bar sits on this. */
  bg: (pct: number) => string;
};

export const wash: Wash = {
  text: (pct) => mix(color.text, pct),
  accent: (pct) => mix(color.accent, pct),
  scrim: (pct) => mix(SCRIM, pct),
  bg: (pct) => mix(color.bg, pct),
};

/** The palette as a value: colours plus washes, frozen at one generation. */
export type Palette = Record<Slot | 'divider' | 'warn', string> & { wash: Wash };

/**
 * A fresh object per theme, which is the whole point — a component memoises on
 * the identity it was handed, so it has to change when the colours do.
 */
function snapshot(): Palette {
  const c = { ...color };
  return {
    ...c,
    wash: {
      text: (pct) => mix(c.text, pct),
      accent: (pct) => mix(c.accent, pct),
      scrim: (pct) => mix(SCRIM, pct),
      bg: (pct) => mix(c.bg, pct),
    },
  };
}

let current = snapshot();

/**
 * The live palette, for module scope only — a context default, a script.
 *
 * Never call this during render. It takes no arguments, so to the React
 * Compiler it is a constant expression: it gets hoisted out of the component
 * and evaluated once, and every later theme is silently the first one.
 * `applyTheme` hands the palette back for exactly this reason.
 */
export const palette = () => current;

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
 * The decorative tails — fades, glows and small nudges drawn around the
 * action, never gating it. Hand-tuned in the motion pass; durations (ms)
 * only, each site pairing one with the tier easing its layer wants. Named
 * for the role, so a screen never carries a raw timing literal.
 */
export const linger = {
  /** the ghost column's numbers flying into the fields */
  fly: 320,
  /** the wash catching up behind that copy */
  catch: 450,
  /** a just-ticked row's flash fading back out */
  flash: 550,
  /** the progress bar's leading-edge glint */
  edge: 500,
  /** the seal's afterglow at 100% */
  glow: 900,
  /** the seal sweep across the bar */
  sweep: 550,
  /** the 3px counter rise before its payoff settle (tab bar and session) */
  rise: 100,
  /** a released hold rewinding its fill */
  rewind: 160,
  /** one leg of the shake a refused tick gives the cell it wanted filled */
  shake: 60,
  /** one radar ring's flight in the scan sheet */
  radar: 1600,
} as const;

/**
 * The reach every small control gets — × glyphs, grips, marks are drawn at
 * 20–26px, and Android wants ~48dp of touch. One constant, not per-site
 * guesses, so no two ×s in the app are differently hard to hit.
 */
export const slop = 8;

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
 * which in RN is a border rather than a shadow — hence the split. The drop
 * shadows lighten in light mode: 55% black under a sheet is the right weight
 * over a near-black page and a bruise over a near-white one.
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
};

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
  /**
   * linear-gradient(150deg, accent-900 0%, surface 62%) — geometry only. The
   * two stops are `accent900` and `surface` off the palette, and they are read
   * where the gradient is drawn rather than cached here: a colour parked on a
   * module-level object is a colour that stops following the theme.
   */
  heroGradient: {
    locations: [0, 0.62] as readonly [number, number],
    start: { x: 0, y: 0 },
    end: { x: 0.9, y: 1 },
  },
};

/* ── applying a theme ──────────────────────────────────────────────────── */

let generation = 0;
let applied = 'blurple:d';

/**
 * Swap the live palette, and hand back both halves of the result.
 *
 * The generation changes only when the palette actually did — `themed()`
 * sheets rebuild on it — and everything derived from a colour (the washes
 * baked into `t`, elevation's ring) is recomputed here, since those were
 * resolved the moment they were written.
 *
 * The colours come back out of this call rather than being fetched afterwards
 * because this is the only function in the pair whose arguments are reactive.
 * A separate `palette()` read next to it is a no-argument call the React
 * Compiler will hoist and evaluate once — which is exactly the bug that made
 * the first light mode paint a light page with a dark hero card on it.
 */
export function applyTheme(name: ThemeName, dark: boolean): { gen: number; colors: Palette } {
  const id = `${name}:${dark ? 'd' : 'l'}`;
  if (id === applied) return { gen: generation, colors: current };
  applied = id;

  Object.assign(color, paletteFor(name, dark));
  color.divider = mix(color.text, 16);
  // Not in `paletteFor` — it is the one slot the theme's hue does not reach,
  // and only the mode changes it.
  color.warn = warnFor(dark);

  elevation.sm.borderColor = color.neutral800;
  elevation.md.borderColor = color.neutral700;
  elevation.lg.borderColor = color.neutral500;
  elevation.md.shadowOpacity = dark ? 0.55 : 0.16;
  elevation.lg.shadowOpacity = dark ? 0.65 : 0.22;

  t.exBg = color.surface;
  t.rule = wash.text(9);

  current = snapshot();
  return { gen: ++generation, colors: current };
}

// The design pinned "today" to Friday 7 August 2026 (TODAY_DOW / TODAY_DOM
// lived here); the app went live instead — see src/data/date.ts.
