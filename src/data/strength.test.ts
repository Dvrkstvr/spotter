/**
 * The one reading in the app that compares you to somebody else.
 *
 * Everything in `stats.ts` is a fact about your own diary and can only be
 * wrong about you. This can be wrong about *people*: a threshold that scales
 * the wrong way with bodyweight tells a heavy lifter they are weak and a light
 * one they are strong, and both would look perfectly plausible on the screen.
 *
 * So what is tested here is mostly **direction and refusal** — that heavier
 * bodyweight raises the bar but by less than linearly, that age relaxes it and
 * only after forty, that a missing figure produces no reading at all rather
 * than a confident one off a default. The threshold table itself is coarse by
 * design and is not asserted to the kilo; what is asserted is that it is read
 * in the right order and anchored where it says it is.
 */
import { describe, expect, it } from 'vitest';
import type { KeyLift } from './stats';
import {
  ageFactor,
  bodyOf,
  canRead,
  hasStandard,
  LEVELS,
  numOf,
  standings,
  thresholdsFor,
} from './strength';

const lift = (id: string, e1rm: number): KeyLift => ({
  id,
  sessions: 4,
  latest: `${e1rm} × 1`,
  e1rm,
  deltaKg: 0,
});

const MALE = { bodyKg: 80, sex: 'male' as const, age: null };

describe('thresholds', () => {
  it('are the quoted bodyweight multiples at the reference weight', () => {
    // 80 kg male, the weight the male column is quoted at, so the scaling
    // factor is exactly one and the numbers are the table.
    const th = thresholdsFor('bench', 'male', 80, null)!;
    expect(th).toEqual([0.5, 0.75, 1.25, 1.75, 2.0].map((m) => m * 80));
  });

  it('rise with bodyweight, but by less than bodyweight does', () => {
    // The whole reason the multiples are read as an anchor rather than a
    // ratio: muscle area grows as the square where mass grows as the cube, so
    // a 100 kg lifter is not 25% stronger than an 80 kg one. Linear scaling
    // would put this at exactly 1.25.
    const at80 = thresholdsFor('bench', 'male', 80, null)![2];
    const at100 = thresholdsFor('bench', 'male', 100, null)![2];
    expect(at100).toBeGreaterThan(at80);
    expect(at100 / at80).toBeLessThan(1.25);
    expect(at100 / at80).toBeCloseTo(Math.pow(100 / 80, 2 / 3), 6);
  });

  it('fall with bodyweight the same way', () => {
    const at60 = thresholdsFor('bench', 'male', 60, null)![2];
    const at80 = thresholdsFor('bench', 'male', 80, null)![2];
    expect(at60).toBeLessThan(at80);
    // And a light lifter's bar sits *above* their bodyweight multiple, which
    // is the other half of the correction.
    expect(at60).toBeGreaterThan(1.25 * 60);
  });

  it('are lower for women, and anchored at their own reference weight', () => {
    const m = thresholdsFor('bench', 'male', 65, null)![2];
    const f = thresholdsFor('bench', 'female', 65, null)![2];
    expect(f).toBeLessThan(m);
    expect(f).toBeCloseTo(0.75 * 65, 6);
  });

  it('rank weakest to strongest, for every lift and both sexes', () => {
    // A table typo that put Advanced under Intermediate would still draw a
    // level on the screen — just the wrong one, for everybody.
    for (const id of ['bench', 'squat', 'deadlift', 'bbrow'])
      for (const sex of ['male', 'female'] as const) {
        const th = thresholdsFor(id, sex, 80, null)!;
        expect(th).toHaveLength(LEVELS.length);
        expect([...th]).toEqual([...th].sort((a, b) => a - b));
      }
  });

  it('has none for a lift nobody publishes one for', () => {
    expect(hasStandard('legpress')).toBe(false);
    expect(hasStandard('pullup')).toBe(false);
    expect(thresholdsFor('legpress', 'male', 80, null)).toBeNull();
  });
});

describe('age', () => {
  it('changes nothing before forty, or without an age', () => {
    expect(ageFactor(null)).toBe(1);
    expect(ageFactor(25)).toBe(1);
    expect(ageFactor(40)).toBe(1);
  });

  it('relaxes the bar by about five percent a decade after forty', () => {
    expect(ageFactor(50)).toBeCloseTo(0.95, 6);
    expect(ageFactor(60)).toBeCloseTo(0.9, 6);
    expect(thresholdsFor('bench', 'male', 80, 60)![2]).toBeCloseTo(1.25 * 80 * 0.9, 6);
  });

  it('declines straight through a whole lifespan, and floors past one', () => {
    // Half a percent a year, so ninety is 0.75 — conservative, since real
    // decline past seventy outruns a straight line. The floor guards a
    // hand-edited blob rather than a person: `numOf` caps age at 120, and the
    // line only reaches 0.6 there.
    expect(ageFactor(90)).toBeCloseTo(0.75, 6);
    expect(ageFactor(120)).toBeCloseTo(0.6, 6);
    expect(ageFactor(500)).toBe(0.6);
  });
});

describe('reading the profile', () => {
  it('refuses a figure that is not a plausible one', () => {
    for (const w of ['', '  ', 'abc', '0', '19', '401', undefined, null])
      expect(numOf(w, 20, 400)).toBeNull();
    expect(numOf('82', 20, 400)).toBe(82);
    // The number cell writes a decimal comma in German.
    expect(numOf('82,5', 20, 400)).toBe(82.5);
  });

  it('will not read anything without a weight and a sex', () => {
    // A standard on a guessed bodyweight is a whole band of error stated as a
    // fact about a person — so a missing figure makes the reading unavailable
    // rather than approximate. This is the one place the balance's
    // fall-back-to-75 habit would have been actively harmful.
    expect(canRead({ bodyKg: null, sex: 'male', age: 30 })).toBe(false);
    expect(canRead({ bodyKg: 80, sex: undefined, age: 30 })).toBe(false);
    expect(canRead({ bodyKg: 80, sex: 'male', age: null })).toBe(true);
    expect(standings([lift('bench', 100)], { bodyKg: null, sex: 'male', age: 30 })).toEqual([]);
  });

  it('parses a profile as the store holds it', () => {
    expect(bodyOf({ weight: '82,5', age: '29', sex: 'female' })).toEqual({
      bodyKg: 82.5,
      age: 29,
      sex: 'female',
    });
    expect(bodyOf({ weight: '', age: '' })).toEqual({ bodyKg: null, age: null, sex: undefined });
  });
});

describe('standings', () => {
  it('names the band reached and the kilos to the next', () => {
    // 80 kg male: intermediate bench is 100, advanced is 140.
    const [s] = standings([lift('bench', 110)], MALE);
    expect(s.level).toBe('intermediate');
    expect(s.next).toBe('advanced');
    expect(s.toNext).toBe(30);
    expect(s.bw).toBeCloseTo(110 / 80, 6);
  });

  it('says nothing rather than something wrong below the first threshold', () => {
    const [s] = standings([lift('bench', 20)], MALE);
    expect(s.level).toBeNull();
    expect(s.next).toBe('beginner');
    expect(s.toNext).toBe(20);
  });

  it('has no next above the top band', () => {
    const [s] = standings([lift('bench', 500)], MALE);
    expect(s.level).toBe('elite');
    expect(s.next).toBeNull();
    expect(s.toNext).toBeNull();
  });

  it('skips lifts with no standard and lifts with no load to read', () => {
    // Two different reasons to be absent, and `squat` is the one that matters:
    // it *has* a standard, and a barbell lift logged with BW in the weight
    // field estimates to zero. Without its own guard it would draw a row with
    // no level and "60 kg to beginner" — a verdict on a blank. `legpress` and
    // `pullup` are skipped for the duller reason that nobody publishes a
    // standard for them.
    const out = standings(
      [lift('bench', 100), lift('squat', 0), lift('legpress', 200), lift('pullup', 0)],
      MALE
    );
    expect(out.map((s) => s.id)).toEqual(['bench']);
  });

  it('keeps the order it was given rather than ranking', () => {
    // `keyLifts` sorts by how often a lift was trained. Sorting by score here
    // would turn a read of the lifts you do into a leaderboard of which one is
    // best, which is a different and much less useful question.
    const out = standings([lift('squat', 200), lift('bench', 60), lift('deadlift', 250)], MALE);
    expect(out.map((s) => s.id)).toEqual(['squat', 'bench', 'deadlift']);
  });

  it('lets age move a lifter up a band without the lift changing', () => {
    // The same 150 kg deadlift, read for a 30-year-old and a 60-year-old:
    // intermediate is 160 kg at thirty and 144 at sixty.
    const young = standings([lift('deadlift', 150)], { ...MALE, age: 30 })[0];
    const older = standings([lift('deadlift', 150)], { ...MALE, age: 60 })[0];
    expect(young.level).toBe('novice');
    expect(older.level).toBe('intermediate');
  });
});
