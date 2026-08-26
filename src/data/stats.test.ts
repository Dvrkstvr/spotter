/**
 * The muscle balance, which is the one number on the statistics screen nobody
 * can check by eye.
 *
 * Everything else there is a total — sessions, kilos, kilometres — and a wrong
 * one is visible the moment you look at it. The balance is a *model*: what a
 * set is worth, which muscles a set of one exercise reaches, and how twenty
 * muscles collapse into six regions. Each of those is a decision a refactor can
 * silently invert while still drawing a plausible hexagon, which is exactly the
 * class of bug `data/` is tested for.
 *
 * It counts **fractional sets** now, not kilos: a bench press set is a whole
 * chest set and half a triceps set. The corrections the old volume reading
 * needed — a body weight for bodyweight sets, a seconds-to-reps rate for holds,
 * a per-region muscle mass so a squat and a curl were comparable — are all gone
 * with it, because counting sets never introduced the distortion they existed
 * to undo.
 *
 * The fixtures are diaries rather than payloads: a session of pull-ups, a
 * session of planks, a run — the shapes the arithmetic has to survive.
 */
import { describe, expect, it } from 'vitest';
import type { Exercise } from './exercises';
import { EVEN_SHARE, REGIONS, trainingStats, type Region, type StatsSession } from './stats';

/* ── fixtures ──────────────────────────────────────────────────────────── */

const mk = (id: string, group: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, name: id, group, kind: 'Barbell', last: 0, lastSets: [], ...extra,
});

/**
 * One isolation exercise per region, plus the awkward ones each rule needs.
 * The isolations are what let a fixture state "three sets of legs" without
 * quietly crediting three other regions on the way past.
 */
const LIB: Exercise[] = [
  mk('fly', 'Chest'),
  mk('curl', 'Biceps'),
  mk('lateral', 'Shoulders'),
  mk('crunch', 'Core'),
  mk('row', 'Back'),
  mk('legext', 'Quads'),
  mk('legcurl', 'Hamstrings'),

  // Compounds, which is where `also` earns its place.
  mk('bench', 'Chest', { also: { Triceps: 0.5, Shoulders: 0.5 } }),
  // Every muscle it names rolls into Legs — the fixture the maximum rule is for.
  mk('squat', 'Quads', { also: { Glutes: 1, Hamstrings: 0.5, Adductors: 0.5 } }),
  mk('pullup', 'Back', { kind: 'Bodyweight', also: { Biceps: 0.5 } }),

  mk('plank', 'Core', { kind: 'Bodyweight', measure: 'time' }),
  mk('run', 'Cardio', { kind: 'Bodyweight', measure: 'distance' }),
  mk('football', 'FullBody', { kind: 'Bodyweight', measure: 'duration' }),
  // Cardio filed under a muscle, which the seeded library never does and a
  // user readily might. It is the only fixture for which the measure gate is
  // load-bearing: `Cardio` and `FullBody` map to no region either way.
  mk('bike', 'Quads', { kind: 'Machine', measure: 'distance' }),
  // A group the user invented: mapped by nothing, on purpose.
  mk('gripper', 'Grip'),
];

const ex = (id: string) => LIB.find((e) => e.id === id);

/** A session on a fixed day, so no test depends on the clock it runs at. */
const day = (list: { ex: string; sets: string[] }[]): StatsSession => ({
  date: '2026-08-20',
  list,
  vol: 0,
});

const TODAY = new Date(2026, 7, 20);

const stats = (history: StatsSession[]) => trainingStats(history, ex, null, TODAY);

const region = (history: StatsSession[], r: Region) =>
  stats(history).balance.find((b) => b.region === r)!;

/** `n` sets of one exercise, written so the figures never matter. */
const reps = (id: string, n: number) => ({ ex: id, sets: Array(n).fill('50 × 10') });

/** Equal sets through every region, using isolations so nothing cross-credits. */
const evenBody = (n: number) =>
  [reps('fly', n), reps('curl', n), reps('lateral', n), reps('crunch', n), reps('row', n), reps('legext', n)];

/* ── fractional sets ───────────────────────────────────────────────────── */

describe('counting sets, fractionally', () => {
  it('credits a compound to every muscle it works, at its own weight', () => {
    const st = stats([day([reps('bench', 4)])]);
    expect(region([day([reps('bench', 4)])], 'Chest').sets).toBe(4);
    // Half a set each, and to two *different* regions, so nothing collapses.
    expect(st.balance.find((b) => b.region === 'Arms')!.sets).toBe(2);
    expect(st.balance.find((b) => b.region === 'Shoulders')!.sets).toBe(2);
  });

  it('lets one set total more than one across the body', () => {
    // The reading this guards against: a map normalised to sum to 1, which
    // would report a whole diary as half-trained against every published
    // figure. One bench set is a whole chest set *and* two halves elsewhere.
    const st = stats([day([reps('bench', 1)])]);
    expect(st.balance.reduce((a, b) => a + b.sets, 0)).toBe(2);
    expect(st.countedSets).toBe(1);
  });

  it('sums the six shares to one, in drawing order, however lopsided', () => {
    const st = stats([day([reps('squat', 5)])]);
    expect(st.balance.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 6);
    expect(st.balance.map((b) => b.region)).toEqual([...REGIONS]);
  });

  it('reads an evenly trained body as even', () => {
    const st = stats([day(evenBody(3))]);
    for (const b of st.balance) expect(b.share).toBeCloseTo(EVEN_SHARE, 6);
    expect(st.weak).toEqual([]);
  });
});

/* ── the maximum rule ──────────────────────────────────────────────────── */

describe('a region takes the largest contribution in a set, never the sum', () => {
  it('counts one squat set as one set of legs', () => {
    // Quads 1, Glutes 1, Hamstrings 0.5, Adductors 0.5 — all of them Legs.
    // Added up that is 3 sets of legs out of one set, which is the single
    // mistake here that still draws a plausible chart.
    expect(region([day([reps('squat', 1)])], 'Legs').sets).toBe(1);
    expect(region([day([reps('squat', 4)])], 'Legs').sets).toBe(4);
  });

  it('still adds across sets, so two different leg exercises are two sets', () => {
    // The other half of the rule: only the collapse *within* a set is a
    // maximum. A global one would report a whole leg day as a single set.
    const st = [day([reps('legext', 1), reps('legcurl', 1)])];
    expect(region(st, 'Legs').sets).toBe(2);
  });

  it('does not let a squat crowd out the regions it never touches', () => {
    const st = stats([day([reps('squat', 3), reps('bench', 3)])]);
    expect(st.balance.find((b) => b.region === 'Legs')!.sets).toBe(3);
    expect(st.balance.find((b) => b.region === 'Chest')!.sets).toBe(3);
  });
});

/* ── sets, not volume ──────────────────────────────────────────────────── */

describe('a set is a set, whatever was on the bar', () => {
  it('counts a heavy set and a light one the same', () => {
    // The whole of the difference from the volume reading this replaced,
    // where one heavy set outweighed five light ones.
    const heavy = stats([day([{ ex: 'fly', sets: ['200 × 3'] }])]);
    const light = stats([day([{ ex: 'fly', sets: ['5 × 20'] }])]);
    expect(heavy.balance).toEqual(light.balance);
  });

  it('counts a bodyweight set, with nothing invented to weigh it', () => {
    // A diary of pull-ups used to have a volume of 0 and drew a body with no
    // back in it; the fix was to charge it at the profile's weight. Counting
    // sets needs no figure at all — and the balance no longer knows anything
    // about the person.
    const st = stats([day([{ ex: 'pullup', sets: ['BW × 10', 'BW × 8'] }])]);
    expect(st.balance.find((b) => b.region === 'Back')!.sets).toBe(2);
    expect(st.balance.find((b) => b.region === 'Arms')!.sets).toBe(1);
    expect(st.countedSets).toBe(2);
  });

  it('counts a hold as one set rather than as kilo-seconds', () => {
    const st = stats([day([{ ex: 'plank', sets: ['BW × 60', 'BW × 45'] }])]);
    expect(region([day([{ ex: 'plank', sets: ['BW × 60', 'BW × 45'] }])], 'Core').sets).toBe(2);
    expect(st.balance.find((b) => b.region === 'Core')!.share).toBe(1);
  });

  it('leaves `volume` the summary’s own number, untouched by any of it', () => {
    // `vol` is what `totals()` wrote, and re-deriving it here would mean
    // re-deciding what counts in a second place.
    const st = stats([
      { date: '2026-08-20', vol: 4321, list: [{ ex: 'pullup', sets: ['BW × 10'] }] },
    ]);
    expect(st.volume).toBe(4321);
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
    expect(st.cardioSessions).toBe(1);
    expect(st.distanceKm).toBe(5);
  });

  it('counts loose and counted sets in whole rows, so the disclosure adds up', () => {
    // `RegionStat.sets` is fractional; these two are not, or "2 sets reached
    // no muscle group" would be measured against something it cannot be
    // compared with.
    const st = stats([day([reps('bench', 3), reps('run', 2)])]);
    expect(st.countedSets).toBe(3);
    expect(st.looseSets).toBe(2);
  });

  it('keeps cardio out even when it is filed under a muscle', () => {
    // The measure decides, not the group. A stationary bike someone filed
    // under Quads is still a run: it has a distance and no sets to speak of,
    // and letting it into the six would put a cardio month on the leg axis.
    const st = stats([day([{ ex: 'bike', sets: ['12 × 30', '8 × 20'] }])]);
    expect(st.balance.find((b) => b.region === 'Legs')!.sets).toBe(0);
    expect(st.looseSets).toBe(2);
    expect(st.countedSets).toBe(0);
    expect(st.cardioSessions).toBe(1);
    expect(st.distanceKm).toBe(20);
  });

  it('files an exercise deleted since as loose rather than guessing a region', () => {
    const st = stats([day([{ ex: 'gone', sets: ['50 × 10'] }])]);
    expect(st.looseSets).toBe(1);
    expect(st.countedSets).toBe(0);
  });

  it('files a group the user invented as loose', () => {
    const st = stats([day([reps('gripper', 3)])]);
    expect(st.looseSets).toBe(3);
    expect(st.balance.every((b) => b.sets === 0)).toBe(true);
  });

  it('claims nothing at all about an empty window', () => {
    const st = stats([]);
    expect(st.weak).toEqual([]);
    expect(st.balance.every((b) => b.share === 0 && !b.weak)).toBe(true);
  });
});

/* ── the weak reading ──────────────────────────────────────────────────── */

describe('weak points', () => {
  it('names the region under three quarters of an even split, worst first', () => {
    // Spelled out rather than sliced from `evenBody`: the region being
    // starved has to be obvious in the fixture, and a slice picks by position.
    const st = stats([
      day([
        reps('fly', 3), reps('curl', 3), reps('lateral', 3),
        reps('row', 3), reps('legext', 3), reps('crunch', 1),
      ]),
    ]);
    expect(st.weak.map((w) => w.region)).toEqual(['Core']);
    expect(st.weak[0].share).toBeLessThan(EVEN_SHARE * 0.75);
  });

  it('does not flag half the body for sitting under the mean', () => {
    // Three regions are below even in any real week; only three quarters of
    // an even split is worth naming.
    const st = stats([
      day([
        reps('fly', 4), reps('curl', 4), reps('lateral', 4),
        reps('crunch', 3), reps('row', 4), reps('legext', 3),
      ]),
    ]);
    expect(st.weak).toEqual([]);
  });
});
