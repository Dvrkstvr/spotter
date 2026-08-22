/**
 * The muscle balance, which is the one number on the statistics screen nobody
 * can check by eye.
 *
 * Everything else there is a total — sessions, kilos, kilometres — and a wrong
 * one is visible the moment you look at it. The balance is a *model*: volume
 * per set, the body's own weight standing in for a blank left-hand field, a
 * hold's seconds as reps, and every region divided by the muscle it carries.
 * Each of those is a decision a refactor can silently invert while still
 * drawing a plausible hexagon, which is exactly the class of bug `data/` is
 * tested for.
 *
 * The fixtures are diaries rather than payloads: a session of pull-ups, a
 * session of planks, a run — the shapes the arithmetic has to survive.
 */
import { describe, expect, it } from 'vitest';
import type { Exercise } from './exercises';
import {
  bodyKgOf,
  DEFAULT_BODY_KG,
  EVEN_SHARE,
  REGIONS,
  trainingStats,
  type Region,
  type StatsSession,
} from './stats';

/* ── fixtures ──────────────────────────────────────────────────────────── */

const mk = (id: string, group: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, name: id, group, kind: 'Barbell', last: 0, lastSets: [], ...extra,
});

/** One exercise per region, plus the awkward ones each rule below needs. */
const LIB: Exercise[] = [
  mk('squat', 'Quads'),
  mk('row', 'Back'),
  mk('curl', 'Biceps'),
  mk('press', 'Shoulders'),
  mk('bench', 'Chest'),
  mk('crunch', 'Core'),
  mk('pullup', 'Back', { kind: 'Bodyweight' }),
  mk('weighted', 'Back', { kind: 'Bodyweight' }),
  mk('plank', 'Core', { kind: 'Bodyweight', measure: 'time' }),
  mk('run', 'Cardio', { kind: 'Bodyweight', measure: 'distance' }),
  mk('football', 'FullBody', { kind: 'Bodyweight', measure: 'duration' }),
];

const ex = (id: string) => LIB.find((e) => e.id === id);

/** A session on a fixed day, so no test depends on the clock it runs at. */
const day = (list: { ex: string; sets: string[] }[]): StatsSession => ({
  date: '2026-08-20',
  list,
  vol: 0,
});

const TODAY = new Date(2026, 7, 20);

const stats = (history: StatsSession[], bodyKg?: number) =>
  trainingStats(history, ex, null, { today: TODAY, bodyKg });

const regionOf = (history: StatsSession[], r: Region, bodyKg?: number) =>
  stats(history, bodyKg).balance.find((b) => b.region === r)!;

/**
 * Work laid down in the exact ratio `REGION_MASS` states — 4200 kg through
 * the legs against 700 through the core. Every set is written `kg × 1`, so
 * the left-hand figure *is* that region's work, which keeps the arithmetic
 * these tests are checking visible in the fixture.
 */
const EVEN_BODY = [
  { ex: 'squat', sets: ['4200 × 1'] },
  { ex: 'row', sets: ['2000 × 1'] },
  { ex: 'curl', sets: ['1200 × 1'] },
  { ex: 'press', sets: ['1000 × 1'] },
  { ex: 'bench', sets: ['900 × 1'] },
  { ex: 'crunch', sets: ['700 × 1'] },
];

/* ── the size weighting ────────────────────────────────────────────────── */

describe('per-region size weighting', () => {
  it('reads a body trained in proportion to its own muscle as even', () => {
    const st = stats([day(EVEN_BODY)]);
    for (const b of st.balance) expect(b.share).toBeCloseTo(EVEN_SHARE, 6);
    expect(st.weak).toEqual([]);
  });

  it('does not call the same kilos on legs and on arms a balanced body', () => {
    // The raw-volume reading this weighting exists to correct: equal kilos are
    // a great deal of arm work and almost no leg work.
    const st = stats([
      day([
        { ex: 'squat', sets: ['1000 × 1'] },
        { ex: 'curl', sets: ['1000 × 1'] },
      ]),
    ]);
    const legs = st.balance.find((b) => b.region === 'Legs')!;
    const arms = st.balance.find((b) => b.region === 'Arms')!;
    expect(legs.work).toBe(arms.work);
    expect(arms.share).toBeGreaterThan(legs.share);
    // And it is exactly the ratio of the two masses, nothing else.
    expect(arms.share / legs.share).toBeCloseTo(0.42 / 0.12, 6);
  });

  it('sums the six shares to one, in drawing order, however lopsided', () => {
    const st = stats([day([{ ex: 'squat', sets: ['100 × 5'] }])]);
    expect(st.balance.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 6);
    expect(st.balance.map((b) => b.region)).toEqual([...REGIONS]);
  });
});

/* ── volume, not sets ──────────────────────────────────────────────────── */

describe('volume rather than set count', () => {
  it('lets one heavy set outweigh five light ones', () => {
    const st = stats([
      day([
        { ex: 'bench', sets: ['100 × 10'] },
        { ex: 'curl', sets: ['10 × 10', '10 × 10', '10 × 10', '10 × 10', '10 × 10'] },
      ]),
    ]);
    const chest = st.balance.find((b) => b.region === 'Chest')!;
    const arms = st.balance.find((b) => b.region === 'Arms')!;
    // Five sets against one, and the chest still carries the larger share:
    // this is the whole of the difference from the count it used to be.
    expect(arms.sets).toBeGreaterThan(chest.sets);
    expect(chest.work).toBe(1000);
    expect(arms.work).toBe(500);
    expect(chest.share).toBeGreaterThan(arms.share);
    expect(st.countedSets).toBe(6);
    expect(st.countedWork).toBe(1500);
  });

  it('leaves `volume` the summary’s own number, untouched by any of it', () => {
    // `vol` is what `totals()` wrote and the work is a second reading for a
    // second question — a bodyweight session moves nothing by the first and a
    // great deal by the second.
    const st = stats([
      { date: '2026-08-20', vol: 4321, list: [{ ex: 'pullup', sets: ['BW × 10'] }] },
    ]);
    expect(st.volume).toBe(4321);
    expect(st.countedWork).toBe(DEFAULT_BODY_KG * 10);
  });
});

/* ── what a bodyweight set weighs ──────────────────────────────────────── */

describe('bodyweight work', () => {
  it('counts a pull-up as the body rather than as nothing', () => {
    const history = [day([{ ex: 'pullup', sets: ['BW × 10', 'BW × 8'] }])];
    expect(regionOf(history, 'Back', 80).work).toBe(80 * 18);
    expect(regionOf(history, 'Back', 80).share).toBe(1);
  });

  it('adds the belt to the body rather than replacing it', () => {
    // The bug this guards: reading `20 × 5` as 20 kg would file a weighted
    // pull-up as a quarter of an unweighted one.
    const loaded = [day([{ ex: 'weighted', sets: ['20 × 5'] }])];
    const bare = [day([{ ex: 'pullup', sets: ['BW × 5'] }])];
    expect(regionOf(loaded, 'Back', 80).work).toBe((80 + 20) * 5);
    expect(regionOf(loaded, 'Back', 80).work).toBeGreaterThan(regionOf(bare, 'Back', 80).work);
  });

  it('leaves a loaded exercise alone', () => {
    expect(regionOf([day([{ ex: 'bench', sets: ['70 × 8'] }])], 'Chest', 80).work).toBe(560);
  });

  it('falls back for a profile with no usable weight in it', () => {
    for (const w of ['', '   ', 'abc', '0', '19', '401', undefined, null])
      expect(bodyKgOf(w)).toBe(DEFAULT_BODY_KG);
    expect(bodyKgOf('82')).toBe(82);
    // The number cell writes a decimal comma in German, like `setKg`.
    expect(bodyKgOf('82,5')).toBe(82.5);
  });
});

/* ── holds ─────────────────────────────────────────────────────────────── */

describe('holds', () => {
  it('converts a plank’s seconds to reps rather than dropping it', () => {
    // Three of the seeded core exercises are holds. At kilo-seconds they
    // would dwarf everything else on the chart; at nothing they would empty
    // the core out of it, which is what a volume balance does by default.
    const history = [day([{ ex: 'plank', sets: ['BW × 60'] }])];
    expect(regionOf(history, 'Core', 75).work).toBe((75 * 60) / 3);
    expect(regionOf(history, 'Core', 75).share).toBe(1);
  });
});

/* ── what never reaches a region ───────────────────────────────────────── */

describe('loose sets', () => {
  it('leaves cardio out of the six and says how much it left out', () => {
    const st = stats([
      day([
        { ex: 'bench', sets: ['70 × 8'] },
        { ex: 'run', sets: ['5 × 28'] },
        { ex: 'football', sets: ['— × 90'] },
      ]),
    ]);
    expect(st.looseSets).toBe(2);
    expect(st.countedSets).toBe(1);
    expect(st.countedWork).toBe(560);
    expect(st.cardioSessions).toBe(1);
    expect(st.distanceKm).toBe(5);
  });

  it('files an exercise deleted since as loose rather than guessing a region', () => {
    const st = stats([day([{ ex: 'gone', sets: ['50 × 10'] }])]);
    expect(st.looseSets).toBe(1);
    expect(st.countedWork).toBe(0);
  });

  it('claims nothing at all about an empty window', () => {
    const st = stats([]);
    expect(st.weak).toEqual([]);
    expect(st.balance.every((b) => b.share === 0 && !b.weak)).toBe(true);
  });
});

/* ── the weak reading ──────────────────────────────────────────────────── */

describe('weak points', () => {
  it('is measured against the weighted share, worst first', () => {
    const st = stats([
      // An even body but for the core, at a tenth of what it should carry.
      day([...EVEN_BODY.slice(0, 5), { ex: 'crunch', sets: ['70 × 1'] }]),
    ]);
    expect(st.weak.map((w) => w.region)).toEqual(['Core']);
    expect(st.weak[0].share).toBeLessThan(EVEN_SHARE * 0.75);
  });

  it('does not flag half the body for sitting under the mean', () => {
    // Three regions are below even in any real week; only three quarters of
    // an even split is worth naming.
    const st = stats([
      day([
        { ex: 'squat', sets: ['4400 × 1'] },
        { ex: 'row', sets: ['1900 × 1'] },
        { ex: 'curl', sets: ['1150 × 1'] },
        { ex: 'press', sets: ['950 × 1'] },
        { ex: 'bench', sets: ['880 × 1'] },
        { ex: 'crunch', sets: ['660 × 1'] },
      ]),
    ]);
    expect(st.weak).toEqual([]);
  });
});
