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

import { measureOf, type Exercise, type Measure } from './exercises';

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

/** An even split across the six. The line every share is read against. */
export const EVEN_SHARE = 1 / REGIONS.length;

/**
 * How far below even a region has to sit before it is called out. Three
 * quarters, not "below even": in any real week three regions are below the
 * mean by definition, and a chart that flags half the body every time is
 * noise rather than a finding.
 */
const WEAK_AT = 0.75;

/**
 * Sessions to log before the statistics are worth showing. Balance over two
 * workouts is not a weakness, it is a Tuesday — and a coach prompt built on it
 * would be confident nonsense.
 */
export const MIN_SESSIONS = 5;

export type RegionStat = {
  region: Region;
  /** Working sets logged in the window. */
  sets: number;
  /** Fraction of the counted sets — 0…1, summing to 1 across the six. */
  share: number;
  /** Below three quarters of an even split, and therefore worth naming. */
  weak: boolean;
};

export type TrainingStats = {
  /** Distinct local days with a logged session, in the window. */
  days: number;
  /** Logged sessions in the window — two on one day are two. */
  sessions: number;
  /** Load volume in kg. Only sessions that recorded one contribute (see below). */
  volume: number;
  /** Every region, in `REGIONS` order, whether or not it was trained. */
  balance: RegionStat[];
  /** The weak ones, worst first. Empty when the split is even enough. */
  weak: RegionStat[];
  /** Working sets that rolled into a region — the denominator of every share. */
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
 * An entry from before the day view carries neither `vol` nor `list`; it still
 * counts as a session, and contributes nothing to the balance. A diary that
 * predates a feature should read as short on detail, never as short on days.
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
      const region = e ? regionOf(e.group) : null;
      if (region && m !== 'distance' && m !== 'duration') {
        sets[region] += entry.sets.length;
        counted += entry.sets.length;
      } else {
        loose += entry.sets.length;
      }
    }
    if (hasCardio) cardioSessions++;
  }

  const balance: RegionStat[] = REGIONS.map((region) => {
    const share = counted === 0 ? 0 : sets[region] / counted;
    return {
      region,
      sets: sets[region],
      share,
      // Nothing is weak until something has been logged: with no counted sets
      // every share is 0, and calling all six weak would be an opinion about
      // an empty diary.
      weak: counted > 0 && share < EVEN_SHARE * WEAK_AT,
    };
  });

  return {
    days: new Set(inWindow.map((h) => h.date)).size,
    sessions: inWindow.length,
    volume,
    balance,
    weak: balance.filter((b) => b.weak).sort((a, b) => a.share - b.share),
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
  | { kind: 'weak'; region: Region; pct: number; top: Region }
  | { kind: 'even'; region: Region; pct: number };

export const headlineOf = (st: TrainingStats): Headline | null => {
  if (st.countedSets === 0) return null;
  const top = st.balance.reduce((a, b) => (b.share > a.share ? b : a));
  const worst = st.weak[0];
  if (worst) return { kind: 'weak', region: worst.region, pct: pct(worst.share), top: top.region };
  return { kind: 'even', region: top.region, pct: pct(top.share) };
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
  /** The heaviest set of the most recent session, in the stored "70 × 8" form. */
  latest: string;
  /**
   * Kilos gained on the top set since the first session in the window — 0 for
   * a lift that has not moved, null when there is only one session to go on.
   * Null and 0 say different things: "no reading yet" and "stalled", and a
   * coach prompt that confused them would call a new lift a plateau.
   */
  deltaKg: number | null;
};

/** The left-hand field of a stored set, in kg. BW is 0; an unrecorded dash isn't a number. */
const setKg = (s: string): number | null => {
  const left = String(s).split('×')[0]?.trim() ?? '';
  if (left === '—' || left === '') return null;
  if (left === 'BW') return 0;
  const n = parseFloat(left.replace(',', '.'));
  return isNaN(n) ? null : n;
};

export function keyLifts(
  history: readonly StatsSession[],
  ex: (id: string) => Exercise | undefined,
  sinceDays: number | null = null,
  limit = 6,
  today: Date = new Date()
): KeyLift[] {
  type Seen = { date: string; topKg: number; topSet: string };
  const byEx = new Map<string, Seen[]>();

  for (const h of history) {
    if (sinceDays !== null && daysAgo(h.date, today) >= sinceDays) continue;
    for (const entry of h.list ?? []) {
      // Same stamp-first read: a since-deleted run must not fall back to `load`
      // and slip into the key-lift trends as if it were a barbell exercise.
      if (measureOfLogged(entry, ex) !== 'load') continue;
      let top: Seen | null = null;
      for (const set of entry.sets) {
        const kg = setKg(set);
        if (kg === null) continue;
        if (!top || kg > top.topKg) top = { date: h.date, topKg: kg, topSet: set };
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
        deltaKg: sorted.length > 1 ? Math.round((last.topKg - first.topKg) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}
