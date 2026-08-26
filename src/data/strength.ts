/**
 * How strong the lifts are, against something outside this app.
 *
 * Everything in `stats.ts` is a fact about *your own diary* — sets, weeks,
 * shares. This is the one reading that compares you to anybody else, and it is
 * therefore the one that needs the three things the balance deliberately
 * refused: **bodyweight, sex and age**. That is the honest answer to whether
 * those fields are of any use — yes, here; no, there
 * (`design/stats-research.md` §5).
 *
 * Pure, like `stats.ts` and `plan.ts`: figures in, a standing out. No store,
 * no hooks, no colours, no strings.
 *
 * ## What this is not
 *
 * It is **not a test result**, and nothing here is drawn to more precision
 * than it has. Three separate approximations stack up:
 *
 * 1. The lift is an *estimate* from a working set (`e1rmOf`), ±5% at best.
 * 2. The thresholds are coarse, and public tables disagree with each other by
 *    a level at the edges — ExRx is markedly more conservative than the
 *    community databases at Intermediate and above.
 * 3. The age and bodyweight adjustments are single-number models of things
 *    that vary between people far more than between the numbers.
 *
 * So the output is a **band, never a percentile**: a named level and the
 * kilos to the next one. Anything finer would be inventing a measurement.
 */
import type { KeyLift } from './stats';

/** The five bands every published standard uses, weakest first. */
export type Level = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export const LEVELS: readonly Level[] = [
  'beginner',
  'novice',
  'intermediate',
  'advanced',
  'elite',
];

export type Sex = 'male' | 'female';

/**
 * The bodyweight each lift's multiples are quoted at.
 *
 * Published standards are given as multiples of bodyweight, which is a
 * *linear* scaling — and linear is the one thing strength is known not to do.
 * Muscle cross-section grows with the square of a linear dimension where mass
 * grows with the cube, so a 100 kg lifter is not 25% stronger than an 80 kg
 * one; empirically the exponent is nearer ⅔ (§5, and it is what Wilks, DOTS
 * and IPF GL points all approximate).
 *
 * Rather than choose between the convention and the correction, the multiples
 * are read as an *anchor at one bodyweight* and scaled from there by
 * `EXPONENT`. A heavier lifter therefore gets a threshold below their
 * bodyweight multiple and a lighter one above, which is the direction every
 * scoring formula in the sport agrees on.
 */
const REF_KG: Record<Sex, number> = { male: 80, female: 65 };

/** Muscle area over mass. See `REF_KG`. */
const EXPONENT = 2 / 3;

/**
 * One-rep-max as a multiple of bodyweight at `REF_KG`, weakest band first.
 *
 * **Only barbell lifts with published tables are in here**, which is four of
 * them. That is deliberately thin: a standard invented for a machine press
 * would be a number about that machine's leverage, and one for a bodyweight
 * movement cannot be read at all while `e1rmOf` reports no load for it. A lift
 * with no entry simply has no standing, and the card lists what it can.
 *
 * The figures are the usual ones and are coarse on purpose — arguable in the
 * quarter, and only ever read as a band.
 */
const STANDARDS: Record<string, Record<Sex, readonly number[]>> = {
  bench: { male: [0.5, 0.75, 1.25, 1.75, 2.0], female: [0.25, 0.5, 0.75, 1.0, 1.5] },
  squat: { male: [0.75, 1.25, 1.75, 2.5, 3.0], female: [0.5, 0.75, 1.25, 1.75, 2.25] },
  deadlift: { male: [1.0, 1.5, 2.0, 2.75, 3.25], female: [0.5, 1.0, 1.25, 1.75, 2.5] },
  bbrow: { male: [0.5, 0.75, 1.0, 1.5, 1.75], female: [0.3, 0.5, 0.65, 0.9, 1.2] },
};

/** Whether a lift has a standard at all. */
export const hasStandard = (id: string) => id in STANDARDS;

/**
 * How much the thresholds relax with age.
 *
 * Public tables are calibrated on trained adults roughly 20–40, where strength
 * peaks, and the usual rule of thumb is about 5% of absolute 1RM per decade
 * after 40 — which this applies straight, at half a percent a year.
 *
 * It is a **conservative** model and knowingly so: real decline past seventy
 * outruns a straight line, so the thresholds stay harder than they should
 * rather than softer. Erring that way is the right way round for a figure that
 * pays somebody a compliment. The floor is a guard against a hand-edited blob
 * rather than a real age — `numOf` caps age at 120, and the line does not
 * reach 0.6 before then.
 *
 * Under 40 — and with no age given — nothing moves. An unstated age is not an
 * assumed one.
 */
export const ageFactor = (age: number | null): number =>
  age === null || age <= 40 ? 1 : Math.max(0.6, 1 - (0.05 * (age - 40)) / 10);

/** A lift's five thresholds in kilos, for this body. */
export const thresholdsFor = (
  id: string,
  sex: Sex,
  bodyKg: number,
  age: number | null
): number[] | null => {
  const mult = STANDARDS[id]?.[sex];
  if (!mult) return null;
  const ref = REF_KG[sex];
  const scale = ref * Math.pow(bodyKg / ref, EXPONENT) * ageFactor(age);
  return mult.map((m) => m * scale);
};

export type Standing = {
  id: string;
  /** The estimate this is read from, in kilos. */
  e1rm: number;
  /** As a multiple of bodyweight — the figure lifters actually quote. */
  bw: number;
  /** The band reached, or null while still under the first threshold. */
  level: Level | null;
  /** The band above, and the kilos to it. Both null at the top. */
  next: Level | null;
  toNext: number | null;
};

/**
 * The profile as this module needs it: parsed, and **null rather than
 * defaulted**.
 *
 * The balance could survive a guessed bodyweight, because it only ever shifted
 * a share. A standard cannot: 75 kg assumed for a 60 kg lifter is a whole band
 * of error, stated as a fact about a person. So a missing figure makes the
 * reading unavailable rather than approximate, and the screen says which one
 * is missing.
 */
export type Body = { bodyKg: number | null; sex: Sex | undefined; age: number | null };

/** A free-text profile figure as a number, or null when it isn't a plausible one. */
export const numOf = (v: string | undefined | null, lo: number, hi: number): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(n) && n >= lo && n <= hi ? n : null;
};

export const bodyOf = (p: { weight?: string; age?: string; sex?: Sex }): Body => ({
  bodyKg: numOf(p.weight, 20, 400),
  sex: p.sex,
  age: numOf(p.age, 10, 120),
});

/** Whether there is enough about the person to say anything at all. */
export const canRead = (b: Body): b is Body & { bodyKg: number; sex: Sex } =>
  b.bodyKg !== null && b.sex !== undefined;

/**
 * Every key lift that has a standard, as a standing.
 *
 * Order is `keyLifts`' own — most-trained first — rather than by level: this
 * is a read of the lifts you actually do, and sorting by score would turn it
 * into a leaderboard of which of your lifts is best, which is a different and
 * much less useful question.
 */
export function standings(lifts: readonly KeyLift[], body: Body): Standing[] {
  if (!canRead(body)) return [];
  const out: Standing[] = [];
  for (const l of lifts) {
    const th = thresholdsFor(l.id, body.sex, body.bodyKg, body.age);
    // No standard, or a lift with no load to read — a bodyweight movement
    // estimates to zero and has nothing to compare.
    if (!th || l.e1rm <= 0) continue;
    let reached = -1;
    for (let i = 0; i < th.length; i++) if (l.e1rm >= th[i]) reached = i;
    const nextIdx = reached + 1;
    out.push({
      id: l.id,
      e1rm: l.e1rm,
      bw: l.e1rm / body.bodyKg,
      level: reached < 0 ? null : LEVELS[reached],
      next: nextIdx < LEVELS.length ? LEVELS[nextIdx] : null,
      toNext: nextIdx < LEVELS.length ? Math.max(0, Math.round(th[nextIdx] - l.e1rm)) : null,
    });
  }
  return out;
}
