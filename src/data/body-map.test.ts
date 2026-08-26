/**
 * The heatmap's arithmetic, which is the half of it nobody can check by eye.
 *
 * A figure painted from a wrong map still looks like a body — that is the
 * whole hazard, and it is the same class of bug the balance's own tests exist
 * for. Two decisions carry it: which part of the artwork a muscle-group key
 * colours, and where a weekly rate lands on a six-step ramp. Both are silent
 * when wrong.
 *
 * The fixtures are muscle rows rather than diaries: `stats.test.ts` already
 * owns the reading that produces them, and this module only ever sees the
 * answer.
 */
import { describe, expect, it } from 'vitest';

import { bodyPaint, HEAT_STEPS, heatStep, INERT_SLUGS, SLUG_OF } from './body-map';
import { BAND, MUSCLES_OF, REGIONS, type MuscleStat } from './stats';

/** One muscle's week, with only the fields this module reads filled in. */
const m = (group: string, perWeek: number): MuscleStat => ({
  group,
  sets: perWeek,
  perWeek,
  trained: perWeek > 0,
  low: perWeek > 0 && perWeek < BAND.min,
  over: perWeek > BAND.max,
  sources: [],
});

/** Every seeded muscle group, in the order the balance reads them. */
const ALL = REGIONS.flatMap((r) => MUSCLES_OF[r]);

const at = (paint: ReturnType<typeof bodyPaint>, slug: string) =>
  paint.find((p) => p.slug === slug)!;

/* ── the map ───────────────────────────────────────────────────────────── */

describe('every muscle the balance reads has somewhere to be drawn', () => {
  it('covers all seventeen seeded groups', () => {
    // The invariant that matters: a muscle with a rate and no part is a
    // finding the screen silently drops. `Lats` is covered by sharing a part,
    // not by being left out.
    for (const group of ALL) expect(SLUG_OF[group]).toBeDefined();
    expect(Object.keys(SLUG_OF).sort()).toEqual([...ALL].sort());
  });

  it('sends Lats and Back to the same part and nothing else there', () => {
    const shared = Object.entries(SLUG_OF).filter(([, s]) => s === 'upper-back');
    expect(shared.map(([g]) => g).sort()).toEqual(['Back', 'Lats']);
  });

  it('never paints a part it also calls inert', () => {
    const painted = new Set(Object.values(SLUG_OF));
    for (const s of INERT_SLUGS) expect(painted.has(s)).toBe(false);
  });
});

/* ── the ramp ──────────────────────────────────────────────────────────── */

describe('a weekly rate as one of six steps', () => {
  it('keeps nothing logged out of the ramp entirely', () => {
    // Step 0 is the ground, not the first step of the accent — untrained and
    // barely trained are different facts and this is where the difference is
    // drawn.
    expect(heatStep(0)).toBe(0);
    expect(heatStep(0.1)).toBe(1);
  });

  it('takes its four thresholds from the range rather than from four numbers', () => {
    // Half the floor, the floor, the middle, the ceiling. If these ever stop
    // being read off `BAND`, a bar and a fill start disagreeing about where
    // "enough" begins.
    expect(heatStep(BAND.min / 2 - 0.01)).toBe(1);
    expect(heatStep(BAND.min / 2)).toBe(2);
    expect(heatStep(BAND.min - 0.01)).toBe(2);
    expect(heatStep(BAND.min)).toBe(3);
    expect(heatStep((BAND.min + BAND.max) / 2)).toBe(4);
    expect(heatStep(BAND.max)).toBe(4);
  });

  it('gives over the range a step of its own', () => {
    // The one thing this chart exists not to do is draw *at the range* and
    // *twice it* identically — the bars' own argument for a track that runs
    // past `BAND.max`.
    expect(heatStep(BAND.max + 0.01)).toBe(5);
    expect(heatStep(BAND.max * 3)).toBe(5);
  });

  it('never climbs past the ramp it is an index into', () => {
    for (const n of [0, 1, 9.9, 10, 19.9, 20, 200])
      expect(heatStep(n)).toBeLessThan(HEAT_STEPS);
  });
});

/* ── painting ──────────────────────────────────────────────────────────── */

describe('one row per part, never one per muscle', () => {
  it('paints a part once even where two muscles claim it', () => {
    const paint = bodyPaint(ALL.map((g) => m(g, 4)));
    expect(paint).toHaveLength(new Set(Object.values(SLUG_OF)).size);
    expect(paint.filter((p) => p.slug === 'upper-back')).toHaveLength(1);
  });

  it('gives a shared part to the larger of the two, and says which it took', () => {
    // The *maximum within a region* rule one scope down. Crediting both would
    // be a lat colouring the back it is not, and averaging them would report a
    // figure nobody trained.
    const paint = bodyPaint([m('Back', 3), m('Lats', 14)]);
    expect(at(paint, 'upper-back')).toMatchObject({ group: 'Lats', perWeek: 14 });
  });

  it('leaves a tie with the group that reached it first', () => {
    // `SLUG_OF`'s own order, which is the group list's, so the panel a tap
    // opens is the same one twice rather than whichever way the sort fell.
    const paint = bodyPaint([m('Back', 7), m('Lats', 7)]);
    expect(at(paint, 'upper-back').group).toBe('Back');
  });

  it('draws an untrained muscle rather than dropping it', () => {
    // A missing part reads as *not a muscle*, which is the one thing grey on
    // this screen must not be confused with.
    const paint = bodyPaint([m('Chest', 12)]);
    expect(at(paint, 'calves')).toMatchObject({ group: 'Calves', perWeek: 0, step: 0 });
    expect(at(paint, 'chest').step).toBe(heatStep(12));
  });

  it('ignores a group the user invented', () => {
    // It maps to no region either, so its sets are already outside this
    // reading — and a plan must not be able to grow the figure behind anyone's
    // back.
    const paint = bodyPaint([m('Grip', 40), m('Chest', 12)]);
    expect(paint.some((p) => p.group === 'Grip')).toBe(false);
  });

  it('reads nothing at all as a body with nothing on it', () => {
    const paint = bodyPaint([]);
    expect(paint.every((p) => p.step === 0 && p.perWeek === 0)).toBe(true);
    expect(paint.length).toBeGreaterThan(0);
  });
});
