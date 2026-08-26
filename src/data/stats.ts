/**
 * What the diary already knows about itself.
 *
 * Every number here is *derived* from `history` — the sessions the app has
 * been filing since the day view landed — and nothing is stored. That is the
 * point: the statistics view costs no new persisted key, no `STORAGE_VERSION`
 * bump and no migration over real training data. A phone that has been logging
 * for months already has everything this needs.
 *
 * Deliberately pure and free of the store: it takes a history slice and an
 * exercise lookup, so the same call answers the You card's one-line headline
 * and, later, the whole Insights screen. It also keeps the React Compiler out
 * of the question — no colours, no hooks, nothing to hoist.
 */

import { contribOf, measureOf, type Exercise, type Measure } from './exercises';

/**
 * The history this reads, structurally rather than by importing
 * `HistoryEntry` — `workout-store` imports half of `data/`, and a type-only
 * import back the other way is a cycle waiting to become a real one. Every
 * `HistoryEntry` is assignable to this.
 */
export type StatsSession = {
  date: string;
  /** What the session was called on the day — frozen at log time. */
  name?: string;
  /** Ticked sets per exercise. Absent on entries logged before the day view. */
  list?: {
    ex: string;
    sets: string[];
    /**
     * The measure this exercise was logged under, stamped at log time and
     * present only when it wasn't the default `load`. Read through
     * `measureOfLogged`: it lets a since-deleted run or hold keep counting as
     * cardio, where `measureOf(ex(id))` would default a missing exercise to
     * `load`. Absent on entries logged before the stamp existed.
     */
    measure?: Measure;
  }[];
  /** Load volume as the summary counted it. Absent on those same old entries. */
  vol?: number;
};

/**
 * The measure a logged exercise was recorded under. Prefer the stamp
 * `finishSession` now writes, and fall back to the exercise's live measure —
 * so a distance/duration exercise that has since been *deleted* keeps its
 * cardio identity instead of `measureOf(undefined)` quietly defaulting it to
 * `load` and erasing it from the cardio and distance totals. Old, unstamped
 * entries have no `measure` and behave exactly as before.
 */
const measureOfLogged = (
  entry: { ex: string; measure?: Measure },
  ex: (id: string) => Exercise | undefined
): Measure => entry.measure ?? measureOf(ex(entry.ex));

/* ── regions ───────────────────────────────────────────────────────────────
 *
 * Twenty muscle groups is the right granularity for filing an exercise and the
 * wrong one for reading a body at a glance: a chart with twenty axes says
 * nothing, and "Traps 1%" is not a finding. So balance is read over six
 * regions, each a fixed roll-up of the seeded group keys.
 *
 * A region is not a group, which is why its name comes from the dictionary
 * rather than from `groups`: the user's list is theirs to rename, reorder and
 * extend, while these six are an analysis this app performs. That also makes
 * the mapping total on the seed set and partial everywhere else — a group
 * someone invented ("Grip"), plus `FullBody`, `Cardio` and `Other`, map to
 * nothing on purpose. `Cardio` is not a muscle to be balanced against the
 * others, and it is counted separately by measure below.
 */

export type Region = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Core' | 'Legs';

/** Drawing order — around the radar, and left to right on the card's bars. */
export const REGIONS: readonly Region[] = ['Chest', 'Arms', 'Shoulders', 'Core', 'Back', 'Legs'];

const REGION_OF: Record<string, Region> = {
  Chest: 'Chest',
  Back: 'Back',
  Lats: 'Back',
  Traps: 'Back',
  LowerBack: 'Back',
  Shoulders: 'Shoulders',
  Neck: 'Shoulders',
  Biceps: 'Arms',
  Triceps: 'Arms',
  Forearms: 'Arms',
  Core: 'Core',
  Obliques: 'Core',
  Quads: 'Legs',
  Hamstrings: 'Legs',
  Glutes: 'Legs',
  Adductors: 'Legs',
  Calves: 'Legs',
};

/** The region a muscle-group key rolls up into, or null when it isn't one. */
export const regionOf = (group: string): Region | null => REGION_OF[group] ?? null;

/**
 * The muscle-group keys under each region, in `REGION_OF`'s own order.
 *
 * Derived rather than written out, so the two can never disagree about which
 * muscles a region is made of — the failure would be a region whose bar and
 * whose rows describe different bodies. It is the seeded set only: a group the
 * user invented maps to no region and appears in neither.
 */
export const MUSCLES_OF = REGIONS.reduce(
  (acc, r) => {
    acc[r] = Object.keys(REGION_OF).filter((g) => REGION_OF[g] === r);
    return acc;
  },
  {} as Record<Region, string[]>
);

/**
 * One set's muscle contributions, rolled up to the six regions.
 *
 * **The largest contribution among a region's own muscles, never their sum.**
 * `regionOf` is many-to-one, and a squat naming Quads, Glutes, Hamstrings and
 * the lower back would credit **Legs** two and a half sets out of one set if
 * these were added. One squat set is one Legs set; a leg extension set and a
 * leg curl set are two, because sets add across the window and only the
 * within-a-set collapse is a maximum.
 *
 * This is the single mistake this feature can make that still draws a
 * plausible chart, which is why it is a named function with a test rather than
 * a `+=` inside the loop. It is also the compromise that belongs to the
 * *region* view and not to the data: at muscle level there is nothing to
 * reconcile, because quads got a whole set and glutes got a whole set and both
 * are true.
 */
const regionsOf = (contrib: Record<string, number>): Partial<Record<Region, number>> => {
  const out: Partial<Record<Region, number>> = {};
  for (const [group, n] of Object.entries(contrib)) {
    const r = regionOf(group);
    if (r) out[r] = Math.max(out[r] ?? 0, n);
  }
  return out;
};

/* ── what a set is worth ───────────────────────────────────────────────────
 *
 * **One.** The balance counts *sets*, not kilos, and this is the decision the
 * rest of the file falls out of.
 *
 * It used to count work — kilos moved, with a bodyweight set charged at the
 * profile's weight, a hold's seconds converted to reps at a stated rate, and
 * every region divided by the muscle it carries so that a squat and a curl
 * could be compared at all. Each of those was a correction, and every one of
 * them was correcting the same thing: that kilos are not comparable across the
 * six. A working set of squats moves five times what a working set of curls
 * does, which is a fact about the leverage of a leg rather than about how hard
 * an arm was trained.
 *
 * Counting sets never introduces that distortion, so none of the corrections
 * is needed and all of them are gone — `REGION_MASS`, `HOLD_SECONDS_PER_REP`,
 * `bodyKgOf` and `DEFAULT_BODY_KG` with them. **The balance no longer needs to
 * know anything about the person**, which is a simplification as much as a
 * correction: the majority of phones never filled the weight field in, and a
 * default was silently shaping every share on the screen.
 *
 * It is also what the literature actually counts. The unit in every published
 * figure this could be read against — 10–20 a week, and the dose-response
 * meta-analyses behind it — is the hard set per muscle per week, and volume
 * load is a poor proxy for the stimulus. See `design/stats-research.md`.
 *
 * Two consequences worth stating:
 *
 * - **A bodyweight set counts like any other**, which is what the old
 *   bodyweight arithmetic was straining to achieve. A diary of pull-ups and
 *   push-ups reads correctly with no figure invented for it.
 * - **A hold counts as a set.** A plank is one set of core, not forty-five
 *   kilo-seconds needing a conversion rate nobody measured.
 *
 * `distance` and `duration` are still worth nothing here and still land in
 * `looseSets`: a run is not a muscle to be balanced against the others, and it
 * has the cardio line of its own that says so.
 */

/** The right-hand field: reps. Absent or unparseable reads as none. */
const setReps = (str: string): number => {
  const n = parseFloat((String(str).split('×')[1] ?? '').trim().replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

/**
 * A set's estimated one-rep max, in kilos — Epley: `w × (1 + r / 30)`.
 *
 * **A trend needs one number that means the same thing in two sessions**, and
 * the heaviest weight is not it: 100 × 8 after last week's 100 × 3 is a real
 * week of progress that a top-weight reading calls "no change". An estimate
 * folds the reps in, so the two are comparable without asking anyone to test a
 * single.
 *
 * Epley rather than Brzycki because it is the better fit in the 6–10 range
 * most working sets live in. Both are population regressions accurate to about
 * ±5% between two and ten reps and drifting well past that above it, so this
 * is a **trend line and not a max** — which is also why nothing prints it as a
 * target. A true single is returned unchanged rather than inflated by the
 * formula's own 3%.
 *
 * Null when the set carries no usable pair: an unrecorded weight, or no reps.
 * A bodyweight set is `0` kg and estimates to 0, exactly as its top weight did
 * — `keyLifts` has never had a figure to trend for those.
 */
export const e1rmOf = (set: string): number | null => {
  const kg = setKg(set);
  if (kg === null) return null;
  const reps = setReps(set);
  if (reps < 1) return null;
  return reps === 1 ? kg : kg * (1 + reps / 30);
};

/** The left-hand field of a stored set, in kg. BW is 0; an unrecorded dash isn't a number. */
const setKg = (s: string): number | null => {
  const left = String(s).split('×')[0]?.trim() ?? '';
  if (left === '—' || left === '') return null;
  if (left === 'BW') return 0;
  const n = parseFloat(left.replace(',', '.'));
  return isNaN(n) ? null : n;
};

/** An even split across the six. The line every share is read against. */
export const EVEN_SHARE = 1 / REGIONS.length;

/**
 * The weekly-set range a muscle is read against.
 *
 * This is the number the whole rebuild was for. A *share* can only ever say
 * "relatively less" — Chest at 17% is the same figure at four sets a week and
 * at twenty — where a rate against a stated range can say **not enough**, and
 * say it against a figure that exists outside this app. 10–20 hard sets per
 * muscle per week is where the dose-response literature settles; see
 * `design/stats-research.md`.
 *
 * **Per muscle, never per region.** A region rolls up two to five of these, so
 * Legs at twelve sets a week can be three trained muscles and two starving
 * ones under one contented number. The region carries its rate and a count of
 * how many of its muscles are short; the verdict itself lives one level down.
 */
export const BAND = { min: 10, max: 20 } as const;

/* ── push and pull ─────────────────────────────────────────────────────────
 *
 * The one ratio a diary can honestly compute, and it says something the six
 * regions structurally cannot: **Arms** merges biceps and triceps, which pair
 * oppositely, so a lifter who never rows and curls constantly reads as a
 * perfectly healthy Arms. 1:1 is the common default and 1:2 pull-favoured is
 * the usual advice for shoulders and for a desk worker's posture.
 *
 * Upper body only. The literature's push:pull is about the shoulder girdle;
 * the lower-body version is a different argument with different numbers, and
 * folding squats into this would swamp both sides with the largest muscles in
 * the body. So legs, core, neck and the lower back are in neither list — this
 * is a ratio between two named halves, not a partition of everything.
 *
 * **Rear delts are the known inaccuracy.** They pull, and they file under
 * `Shoulders`, which is on the push side — a `Bodyweight`-kind reverse fly
 * credits the push half. It is not fixable without splitting `Shoulders` into
 * front and rear, which would be a twenty-first muscle group in the user's own
 * list for the sake of one line. The seeded rear-delt work names `Traps` and
 * `Back` in its `also`, so it does land partly on the pull side; the residue
 * is accepted and stated rather than hidden.
 */
const PUSH_GROUPS = ['Chest', 'Shoulders', 'Triceps'];
const PULL_GROUPS = ['Back', 'Lats', 'Traps', 'Biceps'];

export type PushPull = {
  /** Fractional sets on each half, in the window. */
  push: number;
  pull: number;
  /** The same, per week. */
  pushPerWeek: number;
  pullPerWeek: number;
  /**
   * Pull against push, so the line reads `1 : {ratio}` — under 1 is
   * push-heavy, which is the direction worth noticing.
   *
   * Null when nothing on the push side was logged: there is no ratio to a
   * zero, and printing one would be inventing the interesting half of it. A
   * pull of zero against real pushing is `0`, which is a finding rather than
   * an absence.
   */
  ratio: number | null;
};

/**
 * Sessions to log before the statistics are worth showing. Balance over two
 * workouts is not a weakness, it is a Tuesday — and a coach prompt built on it
 * would be confident nonsense.
 */
export const MIN_SESSIONS = 5;

/**
 * One muscle group's week.
 *
 * The level the band is stated at, and therefore the level every verdict on
 * this screen is made at.
 */
export type MuscleStat = {
  /** The muscle-group key. Resolve its name through the store, never here. */
  group: string;
  /** Fractional sets credited in the window. */
  sets: number;
  /** Those sets per week, so two window lengths are comparable. */
  perWeek: number;
  /**
   * Whether anything at all was logged for it.
   *
   * **An untrained muscle is not a weak one**, and keeping the two apart is
   * what stops this being noise: nobody trains `Neck`, and a screen flagging
   * it every week beside a genuinely neglected calf has stopped being read.
   * So `low` is only ever true of a muscle you have actually trained, and one
   * you haven't shows a dash and stays out of the list.
   */
  trained: boolean;
  /** Trained, and under the band. */
  low: boolean;
  /** Over it — sayable for the first time, which a share never could. */
  over: boolean;
};

export type RegionStat = {
  region: Region;
  /**
   * Sets credited to the region in the window, **fractionally** — so this is
   * rarely a whole number. A bench press set is a whole chest set and half a
   * triceps set, and within one set a region takes the largest contribution
   * among its own muscles rather than their sum (`regionsOf`).
   *
   * Not to be confused with `TrainingStats.countedSets`, which counts logged
   * rows and is a whole number, nor with the sum of `muscles` below — the
   * maximum is taken per set, so a region is nearly always fewer sets than its
   * muscles add up to.
   */
  sets: number;
  /** Those sets per week. What the row states, and what a bar is drawn to. */
  perWeek: number;
  /** Fraction of the six regions' sets — 0…1, summing to 1 across them. */
  share: number;
  /** The muscles under it, in `MUSCLES_OF` order. */
  muscles: MuscleStat[];
  /**
   * How many of them are under the band. What the region row's tag counts, and
   * the whole reason a region has no verdict of its own: it cannot be measured
   * against a figure stated per muscle.
   */
  low: number;
};

export type TrainingStats = {
  /** Distinct local days with a logged session, in the window. */
  days: number;
  /** Logged sessions in the window — two on one day are two. */
  sessions: number;
  /** Load volume in kg. Only sessions that recorded one contribute (see below). */
  volume: number;
  /** Whole weeks the window spans. What every `perWeek` is divided by. */
  weeks: number;
  /** Every region, in `REGIONS` order, whether or not it was trained. */
  balance: RegionStat[];
  /** Upper-body pushing against pulling. See `PUSH_GROUPS`. */
  pushPull: PushPull;
  /**
   * Every **muscle** under the band, furthest short first — never a region,
   * because the band is stated per muscle. Untrained muscles are not in it
   * (see `MuscleStat.trained`), which is what keeps it a finding rather than a
   * list of everything nobody does.
   */
  weak: MuscleStat[];
  /**
   * Logged sets that reached at least one region — **whole rows**, not the
   * fractional figure `RegionStat.sets` carries. It is what `looseSets` is
   * measured against, and the two have to be countable in the same unit for
   * the disclosure under the chart to mean anything.
   */
  countedSets: number;
  /**
   * Sets logged in the window that reached no region: cardio, full-body, and
   * anything filed under a group the user invented. Kept so a screen can
   * disclose what its percentages left out rather than quietly rounding it
   * away.
   */
  looseSets: number;
  /** Sessions containing at least one `distance` or `duration` exercise. */
  cardioSessions: number;
  /**
   * Kilometres covered, off the left-hand field of every `distance` set. The
   * one number here that *is* re-derived from the stored strings, because
   * nothing ever totalled it: `vol` deliberately counts load and only load,
   * so a run has never had a number of its own. An unrecorded distance is
   * written `—` and contributes nothing rather than zero — see `blankOf`.
   */
  distanceKm: number;
};

/**
 * Read a slice of history.
 *
 * `sinceDays` bounds the window against the day it is called on; null reads
 * everything, which is what the all-time totals want.
 *
 * Volume is taken from each entry's own `vol` rather than recomputed, because
 * that number was written by `totals()` and is already gated to `load` sets —
 * re-deriving it here would mean re-deciding what counts, in a second place.
 * The *balance* does not use it at all and says so at "what a set is worth".
 * An entry from before the day view carries neither `vol` nor `list`; it still
 * counts as a session, and contributes nothing to the balance. A diary that
 * predates a feature should read as short on detail, never as short on days.
 *
 * `today` is positional again, like the siblings'. It was bundled into an
 * options bag to keep it apart from `bodyKg` — both `number | null`, so side
 * by side they typechecked in either order and a call site could go wrong
 * silently. Counting sets took `bodyKg` out of this function entirely, and
 * with nothing left to be confused with, the bag had nothing to do.
 */
export function trainingStats(
  history: readonly StatsSession[],
  ex: (id: string) => Exercise | undefined,
  sinceDays: number | null = null,
  today: Date = new Date()
): TrainingStats {
  // One window boundary for every reader: whole local days back, futures
  // excluded, so the footer total, the bars and the coach prompt describe the
  // same slice. `daysAgo` is the same day-count `volumeSeries` and `keyLifts`
  // use — `h.date >= from` admitted a 57th day and any future-dated row.
  const inWindow = history.filter((h) => {
    const ago = daysAgo(h.date, today);
    if (!Number.isFinite(ago) || ago < 0) return false;
    return sinceDays === null || ago < sinceDays;
  });

  const sets = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<Region, number>;
  const muscle: Record<string, number> = {};
  let counted = 0;
  let loose = 0;
  let volume = 0;
  let cardioSessions = 0;
  let distanceKm = 0;

  for (const h of inWindow) {
    volume += h.vol ?? 0;
    let hasCardio = false;
    for (const entry of h.list ?? []) {
      const e = ex(entry.ex);
      const m = measureOfLogged(entry, ex);
      if (m === 'distance' || m === 'duration') hasCardio = true;
      if (m === 'distance')
        for (const set of entry.sets) {
          // Comma or dot — normalise like `setKg`/`num`, or "5,5 km" reads as 5.
          const km = parseFloat((String(set).split('×')[0]?.trim() ?? '').replace(',', '.'));
          if (!isNaN(km)) distanceKm += km;
        }
      // Cardio is not a muscle to be balanced against the others, so it is
      // gated out before the contributions are read at all — which is also
      // why the seeded cardio exercises carry no `also` to read.
      const contrib = m === 'distance' || m === 'duration' ? {} : contribOf(e);
      const reached = Object.entries(regionsOf(contrib)) as [Region, number][];
      if (reached.length === 0) {
        // Reached no region: cardio, full body, or filed under a group the
        // user invented. Counted in rows, because that is the unit the
        // disclosure under the chart states it in.
        loose += entry.sets.length;
        continue;
      }
      counted += entry.sets.length;
      for (const [region, n] of reached) sets[region] += entry.sets.length * n;
      // The muscle level keeps every contribution as it stands: the maximum
      // above is the *region* view's compromise, and applying it here too
      // would throw away the numbers the band is actually stated against.
      for (const [group, n] of Object.entries(contrib))
        if (regionOf(group)) muscle[group] = (muscle[group] ?? 0) + entry.sets.length * n;
    }
    if (hasCardio) cardioSessions++;
  }

  const total = REGIONS.reduce((a, r) => a + sets[r], 0);

  // Whole weeks the window spans, so 8 weeks and 12 months are read against
  // the same band. A bounded period divides by its own length; all-time has no
  // length of its own and takes the diary's, from the oldest session logged.
  // Never below one, or a three-day window would multiply every rate by two.
  const spanDays =
    sinceDays ??
    (inWindow.length
      ? Math.max(...inWindow.map((h) => daysAgo(h.date, today) + 1).filter(Number.isFinite))
      : 7);
  const weeks = Math.max(1, spanDays / 7);

  const balance: RegionStat[] = REGIONS.map((region) => {
    const muscles: MuscleStat[] = MUSCLES_OF[region].map((group) => {
      const n = muscle[group] ?? 0;
      const perWeek = n / weeks;
      return {
        group,
        sets: n,
        perWeek,
        trained: n > 0,
        // Untrained is not low: see `MuscleStat.trained`. Nobody trains the
        // neck, and flagging it every week would cost the list its meaning.
        low: n > 0 && perWeek < BAND.min,
        over: perWeek > BAND.max,
      };
    });
    return {
      region,
      sets: sets[region],
      perWeek: sets[region] / weeks,
      share: total === 0 ? 0 : sets[region] / total,
      muscles,
      low: muscles.filter((m) => m.low).length,
    };
  });

  // Off the muscle map rather than the regions: push and pull is a fact about
  // muscles, and the region roll-up has already collapsed the two halves of
  // Arms into one number by the time it is drawn.
  const half = (groups: string[]) => groups.reduce((a, g) => a + (muscle[g] ?? 0), 0);
  const push = half(PUSH_GROUPS);
  const pull = half(PULL_GROUPS);

  return {
    days: new Set(inWindow.map((h) => h.date)).size,
    sessions: inWindow.length,
    volume,
    weeks,
    balance,
    pushPull: {
      push,
      pull,
      pushPerWeek: push / weeks,
      pullPerWeek: pull / weeks,
      ratio: push === 0 ? null : pull / push,
    },
    // Furthest short first, which is the order the screen lists them in and
    // the order the coach prompt names them.
    weak: balance
      .flatMap((b) => b.muscles)
      .filter((m) => m.low)
      .sort((a, b) => a.perWeek - b.perWeek),
    countedSets: counted,
    looseSets: loose,
    cardioSessions,
    distanceKm,
  };
}

/**
 * The one thing worth saying on the card, as data for the screen to phrase.
 *
 * The card has to earn its tap before you take it, so it says something true
 * about this week rather than a label. Which fact wins is a fixed order —
 * the worst-off region if there is one, else the region carrying the most —
 * because a headline that changes its own criteria week to week reads as
 * random even when every sentence is accurate.
 *
 * Null when nothing has been counted yet; the card shows its empty state.
 */
export type Headline =
  /** A muscle under the band. Its key — resolve the name through the store. */
  | { kind: 'low'; group: string; perWeek: number }
  /** Nothing short: the region carrying the most, so the card still says something. */
  | { kind: 'even'; region: Region; perWeek: number };

export const headlineOf = (st: TrainingStats): Headline | null => {
  if (st.countedSets === 0) return null;
  // The muscle furthest short, else the region doing best. It names a rate
  // rather than a share now, which is the difference between a finding and a
  // comparison with the rest of your own training.
  const worst = st.weak[0];
  if (worst) return { kind: 'low', group: worst.group, perWeek: worst.perWeek };
  const top = st.balance.reduce((a, b) => (b.perWeek > a.perWeek ? b : a));
  return { kind: 'even', region: top.region, perWeek: top.perWeek };
};

/**
 * A weekly rate as the screens print it: one decimal, and no trailing `.0`.
 *
 * One rounding for every surface, like `pct` — a card saying 2 and a row
 * saying 2.4 about the same muscle is the kind of disagreement nobody can
 * debug from a screenshot.
 */
export const rate = (perWeek: number): string => {
  const n = Math.round(perWeek * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/** A share as whole percent. One rounding, so no two screens disagree by 1. */
export const pct = (share: number) => Math.round(share * 100);

/**
 * 428000 → "428,000". `toLocaleString` would be the obvious call and is not
 * one to make here: Hermes ships without full ICU on Android unless the build
 * asks for it, so the separator would silently be whatever the runtime felt
 * like. The dictionary knows which character its language groups with.
 */
export const groupDigits = (n: number, sep: string) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/* ── periods ───────────────────────────────────────────────────────────────
 *
 * What the Insights seg offers. Every option is *bounded*, and that is the
 * point: the volume chart buckets the window it is given, and "all time" has
 * no bucket size — one bar per week over three years is not a chart, and one
 * bar per year over three weeks is not one either. A phone with six weeks of
 * training picking twelve months sees mostly empty chart, which is the honest
 * picture rather than a missing one.
 *
 * `bucketDays` divides its window into 8–13 bars, the most a phone screen can
 * carry and still let you tell one from its neighbour.
 */
export type PeriodKey = '8w' | '6m' | '12m';

export const PERIODS: readonly { key: PeriodKey; days: number; bucketDays: number }[] = [
  { key: '8w', days: 56, bucketDays: 7 },
  { key: '6m', days: 182, bucketDays: 14 },
  { key: '12m', days: 364, bucketDays: 28 },
];

export const periodOf = (k: PeriodKey) => PERIODS.find((p) => p.key === k) ?? PERIODS[0];

/** Whole local days from an ISO date to a given day. Never `toISOString()`. */
const daysAgo = (iso: string, today: Date) => {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((now.getTime() - then.getTime()) / 86_400_000);
};

export type Bucket = { volume: number; sessions: number };

/**
 * Load volume bucketed over the window, oldest bucket first, with the newest
 * bucket ending today. Empty buckets are present as zeroes — a fortnight you
 * did not train is a fact about the shape, and closing the gap would draw a
 * chart of a training history nobody had.
 */
export function volumeSeries(
  history: readonly StatsSession[],
  sinceDays: number,
  bucketDays: number,
  today: Date = new Date()
): Bucket[] {
  const n = Math.ceil(sinceDays / bucketDays);
  const out: Bucket[] = Array.from({ length: n }, () => ({ volume: 0, sessions: 0 }));
  for (const h of history) {
    const ago = daysAgo(h.date, today);
    // A malformed date yields NaN, which slips past both comparisons and lands
    // as out[NaN] — skip it, the way the sibling readers tolerate it.
    if (!Number.isFinite(ago) || ago < 0 || ago >= n * bucketDays) continue;
    const i = n - 1 - Math.floor(ago / bucketDays);
    out[i].volume += h.vol ?? 0;
    out[i].sessions++;
  }
  return out;
}

/* ── favourites ─────────────────────────────────────────────────────────── */

export type FavExercise = { id: string; sessions: number };

export type Favourites = {
  /** The exercise logged in the most sessions, with that count. */
  exercise: FavExercise | null;
  /**
   * Every exercise, most sessions first — so a screen can fall back to the
   * runner-up when the top one has since been deleted and no longer resolves,
   * rather than dropping the row. Ties keep history order, like `exercise`.
   */
  exercises: FavExercise[];
  /**
   * The session name logged most often, with that count.
   *
   * Counted by the name each session was *filed under*, not by routine id, for
   * the same reason the day view shows that name: it was frozen at log time,
   * so a routine renamed in March doesn't rewrite February, and one deleted
   * since still counts the days it was actually trained. A freeform habit
   * therefore surfaces as "Free session", which is an honest answer to what
   * this person does most.
   */
  session: { name: string; count: number } | null;
};

export function favourites(
  history: readonly StatsSession[],
  sinceDays: number | null = null,
  today: Date = new Date()
): Favourites {
  const inWindow = history.filter(
    (h) => sinceDays === null || daysAgo(h.date, today) < sinceDays
  );
  const exCount = new Map<string, number>();
  const nameCount = new Map<string, number>();
  for (const h of inWindow) {
    // An exercise trained twice in one session is one session, not two.
    for (const id of new Set((h.list ?? []).map((e) => e.ex)))
      exCount.set(id, (exCount.get(id) ?? 0) + 1);
    const name = h.name?.trim();
    if (name) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  const top = <T,>(m: Map<T, number>): [T, number] | null => {
    let best: [T, number] | null = null;
    // Ties go to whichever was met first, which is insertion order — history
    // order — so the answer is stable rather than dependent on the sort.
    for (const [k, v] of m) if (!best || v > best[1]) best = [k, v];
    return best;
  };
  // Ranked, most sessions first. Array sort is stable (ES2019+, and in Hermes),
  // so `exCount` insertion order — history order — breaks ties, matching `top`.
  const rankedEx: FavExercise[] = [...exCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, sessions]) => ({ id, sessions }));
  const n = top(nameCount);
  return {
    exercise: rankedEx[0] ?? null,
    exercises: rankedEx,
    session: n ? { name: n[0], count: n[1] } : null,
  };
}

/* ── fun facts ─────────────────────────────────────────────────────────────
 *
 * A tonne of anything is an abstraction; thirty cars is a picture. Each entry
 * pairs a dictionary key with what one of the thing weighs (kg) or spans (km),
 * and `funFact` picks the largest one you have cleared at least twice over.
 *
 * Twice over is what keeps the sentence plural, which is what lets every
 * translation say "{n} cars" and skip singular agreement entirely — German
 * would otherwise need a case for `1` in every line. It also keeps the
 * comparison meaningful: "about 1 elephant" says less than the number did.
 *
 * The scale grows with the diary rather than being reseeded on a timer: the
 * same training earns the same sentence, and passing a threshold is the reward.
 */
export type FactKey =
  | 'factWashingMachine' | 'factPiano' | 'factCar' | 'factElephant' | 'factBus' | 'factJet'
  | 'factMarathon' | 'factChannel' | 'factGermany' | 'factSahara';

export type FunFact = { key: FactKey; n: number; kind: 'volume' | 'distance' };

const WEIGHTS: readonly { key: FactKey; kg: number }[] = [
  { key: 'factWashingMachine', kg: 70 },
  { key: 'factPiano', kg: 450 },
  { key: 'factCar', kg: 1500 },
  { key: 'factElephant', kg: 5400 },
  { key: 'factBus', kg: 12_000 },
  { key: 'factJet', kg: 183_000 },
];

const SPANS: readonly { key: FactKey; km: number }[] = [
  { key: 'factMarathon', km: 42.195 },
  { key: 'factChannel', km: 34 },
  { key: 'factGermany', km: 640 },
  { key: 'factSahara', km: 1800 },
];

const pick = <T extends { key: FactKey }>(
  scale: readonly (T & { kg?: number; km?: number })[],
  total: number,
  unit: 'kg' | 'km',
  kind: 'volume' | 'distance'
): FunFact | null => {
  let best: FunFact | null = null;
  for (const item of scale) {
    const size = unit === 'kg' ? item.kg! : item.km!;
    // Floor, not round: "2 elephants" must mean two were actually cleared, not
    // 1.5 rounded up — the sentence claims the thing was cleared twice over.
    const n = Math.floor(total / size);
    if (n >= 2) best = { key: item.key, n, kind };
  }
  return best;
};

/**
 * The one comparison worth printing, or null when nothing clears the smallest
 * of them. Distance wins when there is any, because a diary full of kilos says
 * something about you that a diary with kilometres in it hasn't said yet.
 */
export const funFact = (volumeKg: number, distanceKm: number): FunFact | null =>
  pick([...SPANS].sort((a, b) => a.km - b.km), distanceKm, 'km', 'distance') ??
  pick(WEIGHTS, volumeKg, 'kg', 'volume');

/* ── key lifts ─────────────────────────────────────────────────────────────
 *
 * What a coach would actually ask about: the handful of lifts you keep doing,
 * what you last did on them, and whether the number has moved.
 *
 * Only `load` exercises qualify. A trend needs one number that means the same
 * thing in two sessions, and kilo-seconds and kilometre-minutes are not units
 * — the same reason `totals()` refuses to add them into volume.
 */

export type KeyLift = {
  id: string;
  /** Sessions in the window that contained it. */
  sessions: number;
  /**
   * The *best* set of the most recent session, in the stored "70 × 8" form —
   * best by estimated 1RM rather than by weight, so a heavier set taken for
   * fewer reps does not automatically win.
   */
  latest: string;
  /** That set's estimated 1RM, rounded to a kilo. See `e1rmOf`. */
  e1rm: number;
  /**
   * Kilos of estimated 1RM gained since the first session in the window — 0
   * for a lift that has not moved, null when there is only one session to go
   * on. Null and 0 say different things: "no reading yet" and "stalled", and a
   * coach prompt that confused them would call a new lift a plateau.
   */
  deltaKg: number | null;
};

export function keyLifts(
  history: readonly StatsSession[],
  ex: (id: string) => Exercise | undefined,
  sinceDays: number | null = null,
  limit = 6,
  today: Date = new Date()
): KeyLift[] {
  type Seen = { date: string; e1rm: number; topSet: string };
  const byEx = new Map<string, Seen[]>();

  for (const h of history) {
    if (sinceDays !== null && daysAgo(h.date, today) >= sinceDays) continue;
    for (const entry of h.list ?? []) {
      // Same stamp-first read: a since-deleted run must not fall back to `load`
      // and slip into the key-lift trends as if it were a barbell exercise.
      if (measureOfLogged(entry, ex) !== 'load') continue;
      // The best set by *estimate*, not by weight: 100 × 8 beats 105 × 3, and
      // which of the two you happened to do is the thing a trend has to see
      // past.
      let top: Seen | null = null;
      for (const set of entry.sets) {
        const est = e1rmOf(set);
        if (est === null) continue;
        if (!top || est > top.e1rm) top = { date: h.date, e1rm: est, topSet: set };
      }
      if (!top) continue;
      const list = byEx.get(entry.ex) ?? [];
      list.push(top);
      byEx.set(entry.ex, list);
    }
  }

  return [...byEx.entries()]
    .map(([id, seen]) => {
      // Appended-on-finish history is already chronological, but the trend is
      // the difference between two specific ends of it — worth not assuming.
      const sorted = [...seen].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      return {
        id,
        sessions: sorted.length,
        latest: last.topSet,
        // Whole kilos: the estimate is a ±5% regression, and a decimal on it
        // would claim a precision the formula does not have.
        e1rm: Math.round(last.e1rm),
        deltaKg: sorted.length > 1 ? Math.round(last.e1rm - first.e1rm) : null,
      };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}
