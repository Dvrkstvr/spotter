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

import { measureOf, type Exercise } from './exercises';

/**
 * The history this reads, structurally rather than by importing
 * `HistoryEntry` — `workout-store` imports half of `data/`, and a type-only
 * import back the other way is a cycle waiting to become a real one. Every
 * `HistoryEntry` is assignable to this.
 */
export type StatsSession = {
  date: string;
  /** Ticked sets per exercise. Absent on entries logged before the day view. */
  list?: { ex: string; sets: string[] }[];
  /** Load volume as the summary counted it. Absent on those same old entries. */
  vol?: number;
};

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
  const cutoff = sinceDays === null ? null : new Date(today.getTime() - sinceDays * 86_400_000);
  const from = cutoff
    ? `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(
        cutoff.getDate()
      ).padStart(2, '0')}`
    : null;

  const inWindow = history.filter((h) => (from === null ? true : h.date >= from));

  const sets = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<Region, number>;
  let counted = 0;
  let loose = 0;
  let volume = 0;
  let cardioSessions = 0;

  for (const h of inWindow) {
    volume += h.vol ?? 0;
    let hasCardio = false;
    for (const entry of h.list ?? []) {
      const e = ex(entry.ex);
      const m = measureOf(e);
      if (m === 'distance' || m === 'duration') hasCardio = true;
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
