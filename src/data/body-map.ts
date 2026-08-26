/**
 * The diary, laid over an anatomical figure.
 *
 * Everything here is the *arithmetic* of the heatmap — which muscle-group key
 * paints which of the artwork's parts, and how a weekly rate becomes one of
 * six steps. Pure like `stats.ts` and `plan.ts`: rates in, painting
 * instructions out, no store, no hooks, no colours and no strings. The ramp
 * itself is built from `useColors()` at render, one file over, because a
 * colour read at module scope is hoisted once and paints a stale theme.
 *
 * The artwork is `react-native-body-highlighter` (MIT, © 2022 ELABBASSI
 * Hicham), taken as a dependency rather than vendored so `npm run licenses`
 * keeps the attribution honest by itself. Only its `Slug` type is imported
 * here, which erases at compile — this module stays loadable in plain Node.
 */
import type { Slug } from 'react-native-body-highlighter';

import { BAND, type MuscleStat } from './stats';

/**
 * A muscle-group key, and the part of the figure it colours.
 *
 * Sixteen of the seventeen seeded groups have a part of their own. In
 * `DEFAULT_GROUPS` order, which is head to toe, and which is also the order a
 * tie between two groups sharing a part is broken in.
 *
 * `FullBody`, `Cardio`, `Other` and anything the user invented are absent on
 * purpose: they map to no region either (`REGION_OF`), so a set filed under
 * one is already outside this reading and lands in `looseSets`.
 */
export const SLUG_OF: Readonly<Record<string, Slug>> = {
  Chest: 'chest',
  // `Lats` is the one gap in the artwork — no part of its own — so it and
  // `Back` both paint `upper-back`, at the larger of the two. That is the
  // *maximum within a region* rule `regionsOf` applies, one scope down, and
  // the Bars view still separates them, so nothing is lost, only unlocated.
  Back: 'upper-back',
  Lats: 'upper-back',
  Traps: 'trapezius',
  LowerBack: 'lower-back',
  Shoulders: 'deltoids',
  Neck: 'neck',
  Biceps: 'biceps',
  Triceps: 'triceps',
  Forearms: 'forearm',
  Core: 'abs',
  Obliques: 'obliques',
  Quads: 'quadriceps',
  Hamstrings: 'hamstring',
  Glutes: 'gluteal',
  Adductors: 'adductors',
  Calves: 'calves',
};

/**
 * Parts of the figure that are not muscles, and never carry a value.
 *
 * Drawn at the inert fill and ignored on tap. They are what make the drawing
 * read as a body rather than as a diagram of meat — which is the whole reason
 * the artwork is licensed rather than generated.
 *
 * Deliberately *not* the library's own `disabledParts`: that prop forces a
 * hardcoded `#EBEBE4` fill, which is a light grey on a dark page and the one
 * colour in the app no theme could reach.
 */
export const INERT_SLUGS: readonly Slug[] = ['head', 'hands', 'feet', 'knees', 'tibialis', 'ankles'];

/** Drawn at all: hair says nothing about training and reads as a hat. */
export const HIDDEN_SLUGS: readonly Slug[] = ['hair'];

/**
 * How many steps the ramp has, the untrained ground included.
 *
 * Six rather than a continuous fill, because a continuous one would claim a
 * precision fractional counting has not got — and the exact figure is one tap
 * away regardless.
 */
export const HEAT_STEPS = 6;

/**
 * A weekly rate as one of six steps: 0 is nothing logged, 1–5 climb.
 *
 * The four thresholds are the range's own quarters rather than four numbers of
 * their own — half the floor, the floor, the middle, the ceiling — so a ramp
 * and a bar can never come to disagree about where "enough" starts. Step 5 is
 * over the range and exists for the same reason the bars' track runs past it:
 * *at the range* and *twice it* must not draw identically.
 */
export const heatStep = (perWeek: number): number => {
  if (!(perWeek > 0)) return 0;
  if (perWeek < BAND.min / 2) return 1;
  if (perWeek < BAND.min) return 2;
  if (perWeek < (BAND.min + BAND.max) / 2) return 3;
  if (perWeek <= BAND.max) return 4;
  return 5;
};

/** One part of the figure, and the muscle whose week it is drawing. */
export type BodyPaint = {
  slug: Slug;
  /**
   * The muscle-group key the part is painted from — and therefore the one a
   * tap on it resolves to, so the panel explains the figure you are looking
   * at rather than its quieter twin.
   */
  group: string;
  /** That muscle's rate, in sets per week. */
  perWeek: number;
  /** `heatStep(perWeek)`. */
  step: number;
};

/**
 * Every part of the figure that carries a value, at the value it carries.
 *
 * One row per *part*, never per muscle: where two groups share a part the
 * larger takes it, and the smaller is simply unlocated rather than lost. A
 * muscle with nothing logged is still in here, at step 0 — untrained and
 * barely trained are different facts, and the bottom of the ramp is where the
 * difference is drawn.
 *
 * **One value, painted on both sides.** No row carries a `side`: the diary
 * does not know which arm lifted, and a darker left arm would be inventing
 * data.
 */
export function bodyPaint(muscles: readonly MuscleStat[]): BodyPaint[] {
  const by = new Map<string, MuscleStat>(muscles.map((m) => [m.group, m]));
  const out: BodyPaint[] = [];
  const at = new Map<Slug, number>();
  for (const [group, slug] of Object.entries(SLUG_OF)) {
    const perWeek = by.get(group)?.perWeek ?? 0;
    const seen = at.get(slug);
    if (seen === undefined) {
      at.set(slug, out.length);
      out.push({ slug, group, perWeek, step: heatStep(perWeek) });
      continue;
    }
    // Strictly greater, so a tie leaves the part with the group that reached
    // it first — `SLUG_OF`'s own order, which is the group list's.
    if (perWeek > out[seen].perWeek) out[seen] = { slug, group, perWeek, step: heatStep(perWeek) };
  }
  return out;
}
