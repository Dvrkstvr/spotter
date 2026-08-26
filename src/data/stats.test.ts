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
import {
  e1rmOf,
  EVEN_SHARE,
  headlineOf,
  keyLifts,
  rate,
  REGIONS,
  trainingStats,
  type Region,
  type StatsSession,
} from './stats';

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
  mk('calf', 'Calves'),

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

/** A bounded window, so `weeks` — and therefore every rate — is exact. */
const over = (days: number, history: StatsSession[]) => trainingStats(history, ex, days, TODAY);

const muscle = (st: ReturnType<typeof stats>, group: string) =>
  st.balance.flatMap((b) => b.muscles).find((m) => m.group === group)!;

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
    const st = over(14, [day(evenBody(24))]);
    for (const b of st.balance) expect(b.share).toBeCloseTo(EVEN_SHARE, 6);
  });

  it('calls an even split even and still short, which a share never could', () => {
    // The whole of §7C in one assertion. Three sets a week through every
    // region is a perfectly even body and nowhere near enough training, and
    // the old reading — a share against an even split — could not tell the
    // difference between this and the fixture above.
    const st = over(14, [day(evenBody(24))]); // 12 a week — inside the range
    const thin = over(14, [day(evenBody(4))]); // 2 a week — the same shape
    expect(thin.balance.map((b) => b.share)).toEqual(st.balance.map((b) => b.share));
    expect(st.weak).toEqual([]);
    expect(thin.weak.length).toBeGreaterThan(0);
    expect(thin.weak.every((w) => w.perWeek === 2)).toBe(true);
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
    expect(st.balance.every((b) => b.share === 0 && b.low === 0)).toBe(true);
  });
});

/* ── rates and the band ───────────────────────────────────────────────── */

describe('sets per week, against the range', () => {
  it('divides by the window rather than by the diary', () => {
    // The whole point of a rate: eight weeks and twelve months are read
    // against the same range only if each divides by its own length.
    const st = over(56, [day([reps('fly', 24)])]);
    expect(st.weeks).toBe(8);
    expect(muscle(st, 'Chest').perWeek).toBe(3);
    expect(st.balance.find((b) => b.region === 'Chest')!.perWeek).toBe(3);
  });

  it('never divides by less than a week', () => {
    // A three-day window would otherwise multiply every rate by more than
    // two, and report a single session as a training habit.
    expect(over(3, [day([reps('fly', 4)])]).weeks).toBe(1);
    expect(muscle(over(3, [day([reps('fly', 4)])]), 'Chest').perWeek).toBe(4);
  });

  it('takes an all-time window from the diary rather than from nothing', () => {
    const st = stats([
      { date: '2026-07-24', list: [reps('fly', 14)], vol: 0 }, // 27 days back — 28 inclusive
      day([reps('fly', 14)]),
    ]);
    expect(st.weeks).toBe(4);
    expect(muscle(st, 'Chest').perWeek).toBe(7);
  });

  it('calls a muscle low under the range and over above it', () => {
    const low = muscle(over(14, [day([reps('fly', 6)])]), 'Chest');
    expect(low.perWeek).toBe(3);
    expect(low.low).toBe(true);
    expect(low.over).toBe(false);

    const ok = muscle(over(14, [day([reps('fly', 30)])]), 'Chest');
    expect(ok.low).toBe(false);
    expect(ok.over).toBe(false);

    const over_ = muscle(over(14, [day([reps('fly', 50)])]), 'Chest');
    expect(over_.perWeek).toBe(25);
    expect(over_.over).toBe(true);
    // Sayable for the first time: a share could only ever rank.
    expect(over_.low).toBe(false);
  });

  it('does not call an untrained muscle a weak one', () => {
    // Nobody trains the neck. A screen flagging it every week beside a
    // genuinely neglected calf has stopped being read, so nothing counts as
    // low until it has been trained at all.
    const st = over(14, [day([reps('fly', 30)])]);
    const neck = muscle(st, 'Neck');
    expect(neck.trained).toBe(false);
    expect(neck.low).toBe(false);
    expect(st.weak.map((w) => w.group)).not.toContain('Neck');
  });
});

/* ── the weak reading ──────────────────────────────────────────────────── */

describe('what needs work', () => {
  it('names muscles rather than regions, furthest short first', () => {
    const st = over(14, [
      day([reps('fly', 30), reps('legext', 30), reps('calf', 4), reps('curl', 12)]),
    ]);
    // Calves 2/week, Biceps 6/week — both short, worst first.
    expect(st.weak.map((w) => w.group)).toEqual(['Calves', 'Biceps']);
    expect(st.weak[0].perWeek).toBe(2);
  });

  it('gives a region a count of low muscles and no verdict of its own', () => {
    // The reason the band cannot live on a region: Legs at a contented rate,
    // with a starving calf inside it. A region cannot be measured against a
    // figure stated per muscle, so it carries the count and the verdict lives
    // one level down.
    const st = over(14, [day([reps('legext', 30), reps('calf', 4)])]);
    const legs = st.balance.find((b) => b.region === 'Legs')!;
    expect(legs.perWeek).toBe(17);
    expect(legs.low).toBe(1);
    expect(st.weak.map((w) => w.group)).toEqual(['Calves']);
  });

  it('leaves a region whose muscles are all in range alone', () => {
    const st = over(14, [day([reps('legext', 30), reps('legcurl', 30), reps('calf', 30)])]);
    expect(st.balance.find((b) => b.region === 'Legs')!.low).toBe(0);
    expect(st.weak).toEqual([]);
  });

  it('keeps a region fewer sets than its muscles add up to', () => {
    // The maximum is taken per set at the region level and never at the muscle
    // level, so the two deliberately disagree: a squat is one Legs set and a
    // whole set for each of the muscles it names.
    const st = over(14, [day([reps('squat', 10)])]);
    const legs = st.balance.find((b) => b.region === 'Legs')!;
    expect(legs.sets).toBe(10);
    expect(legs.muscles.reduce((a, m) => a + m.sets, 0)).toBe(30);
    expect(muscle(st, 'Quads').sets).toBe(10);
    expect(muscle(st, 'Glutes').sets).toBe(10);
    expect(muscle(st, 'Hamstrings').sets).toBe(5);
  });
});

/* ── the headline ──────────────────────────────────────────────────────── */

describe('the card headline', () => {
  it('names the muscle furthest short, with its rate', () => {
    const st = over(14, [day([reps('fly', 30), reps('calf', 4)])]);
    expect(headlineOf(st)).toEqual({ kind: 'low', group: 'Calves', perWeek: 2 });
  });

  it('falls back to the region doing best when nothing is short', () => {
    const st = over(14, [day([reps('fly', 40), reps('legext', 30), reps('legcurl', 30), reps('calf', 30), reps('curl', 30), reps('lateral', 30), reps('crunch', 30), reps('row', 30)])]);
    const head = headlineOf(st);
    expect(head?.kind).toBe('even');
  });

  it('says nothing at all with nothing counted', () => {
    expect(headlineOf(stats([]))).toBeNull();
  });
});

/* ── rounding ──────────────────────────────────────────────────────────── */

describe('rate', () => {
  it('is one decimal, and drops a trailing zero', () => {
    // One rounding for every surface: a card saying 2 and a row saying 2.4
    // about the same muscle is a disagreement nobody can debug.
    expect(rate(3)).toBe('3');
    expect(rate(2.04)).toBe('2');
    expect(rate(2.45)).toBe('2.5');
    expect(rate(0)).toBe('0');
  });
});

/* ── key lifts ─────────────────────────────────────────────────────────── */

describe('key lifts, by estimate rather than by weight', () => {
  const lifts = (history: StatsSession[]) => keyLifts(history, ex, null, 6, TODAY);
  const on = (date: string, sets: string[]): StatsSession => ({
    date,
    list: [{ ex: 'fly', sets }],
    vol: 0,
  });

  it('sees progress that a top-weight reading calls no change', () => {
    // The blind spot this closes: same bar, three more reps, and the old
    // reading reported a plateau.
    const l = lifts([on('2026-08-06', ['100 × 3']), on('2026-08-20', ['100 × 8'])])[0];
    expect(l.deltaKg).toBeGreaterThan(0);
    expect(l.latest).toBe('100 × 8');
  });

  it('picks the best set of a session by estimate, not by what was heaviest', () => {
    // 100 × 8 estimates at 127; 110 × 3 at 121. The heavier set is not the
    // better one, and which you happened to do is what a trend must see past.
    const l = lifts([on('2026-08-20', ['110 × 3', '100 × 8'])])[0];
    expect(l.latest).toBe('100 × 8');
    expect(l.e1rm).toBe(127);
  });

  it('leaves a true single alone rather than inflating it', () => {
    // Epley would add its own 3% to a set that already *is* a max.
    expect(e1rmOf('120 × 1')).toBe(120);
    expect(lifts([on('2026-08-20', ['120 × 1'])])[0].e1rm).toBe(120);
  });

  it('reports a stalled lift as 0 and a new one as null', () => {
    // "No reading yet" and "stalled" are different facts, and a prompt that
    // confused them would call a first session a plateau.
    expect(lifts([on('2026-08-20', ['100 × 5'])])[0].deltaKg).toBeNull();
    expect(
      lifts([on('2026-08-06', ['100 × 5']), on('2026-08-20', ['100 × 5'])])[0].deltaKg
    ).toBe(0);
  });

  it('refuses a set with nothing to estimate from', () => {
    expect(e1rmOf('— × 8')).toBeNull(); // an unrecorded weight
    expect(e1rmOf('100 × ')).toBeNull(); // no reps
    expect(e1rmOf('BW × 10')).toBe(0); // bodyweight: no load to trend, as before
  });

  it('rounds to whole kilos, because the estimate is a regression', () => {
    // ±5% between two and ten reps. A decimal on it would claim a precision
    // the formula has not got.
    expect(lifts([on('2026-08-20', ['102.5 × 7'])])[0].e1rm).toBe(126);
  });
});

/* ── push and pull ─────────────────────────────────────────────────────── */

describe('push against pull', () => {
  it('says what the six regions structurally cannot', () => {
    // Arms merges biceps and triceps, which pair oppositely — so a lifter who
    // presses constantly and never rows reads as a perfectly healthy Arms.
    // Triceps 10 a week and biceps 12 — both squarely inside the range, so
    // the Arms row has nothing at all to report.
    const st = over(14, [day([reps('bench', 40), reps('curl', 24)])]);
    const arms = st.balance.find((b) => b.region === 'Arms')!;
    expect(arms.low).toBe(0);
    // And eighty sets of pushing against twenty-four of pulling, which no
    // region on the screen is in a position to mention.
    expect(st.pushPull.ratio).toBeLessThan(0.5);
  });

  it('counts each half off the muscles, fractionally', () => {
    // Bench: chest 1, triceps 0.5, shoulders 0.5 — all three on the push side,
    // so ten sets is twenty of push. Rows are ten of pull.
    const st = over(14, [day([reps('bench', 10), reps('row', 10)])]);
    expect(st.pushPull.push).toBe(20);
    expect(st.pushPull.pull).toBe(10);
    expect(st.pushPull.ratio).toBe(0.5);
    expect(st.pushPull.pushPerWeek).toBe(10);
    expect(st.pushPull.pullPerWeek).toBe(5);
  });

  it('leaves legs and core out of both halves', () => {
    // Upper body only: the lower-body version is a different argument with
    // different numbers, and squats would swamp both sides.
    const st = over(14, [day([reps('legext', 20), reps('crunch', 20), reps('squat', 20)])]);
    expect(st.pushPull.push).toBe(0);
    expect(st.pushPull.pull).toBe(0);
    expect(st.pushPull.ratio).toBeNull();
  });

  it('has no ratio to a zero, but reports a pull of none as a finding', () => {
    // Null and 0 again say different things: "nothing to compare" against
    // "you never pull".
    expect(over(14, [day([reps('row', 10)])]).pushPull.ratio).toBeNull();
    expect(over(14, [day([reps('bench', 10)])]).pushPull.ratio).toBe(0);
  });

  it('reads a balanced upper body as one to one', () => {
    const st = over(14, [day([reps('fly', 10), reps('row', 10)])]);
    expect(st.pushPull.ratio).toBe(1);
  });
});
