/**
 * The schedule, as dated rules.
 *
 * Replaces v3's `schedule: Record<number, string>` — seven timeless
 * pigeonholes, each able to say only "this weekday, forever". A plan is now a
 * list of rules anchored to a date plus a list of cancelled occurrences, and
 * **those two primitives are the whole model**: every state the Plan screen can
 * draw is one of them or both.
 *
 * - A **one-off** is a rule (`unit: 'once'`), not an exception. Which is why
 *   there is no per-date override map: adding a workout to a single day is the
 *   same write as adding a weekly one, and a one-day *swap* is a skip plus a
 *   `once` — see `restChosen` for the other thing that falls out for free.
 * - **Rest is the absence of rows.** An entry always names a routine. Storing
 *   "rest" as a thing would give it a precedence to argue with every rule that
 *   matched the same day.
 * - **A day holds as many workouts as you plan on it**, and nothing is deduped:
 *   two rules may put the same routine on the same day, and the screen shows
 *   both rows with their two different rules. Hiding one would mean an entry
 *   you cannot see, cannot edit and cannot remove.
 * - **Order is insertion order, everywhere.** It is what makes "the first
 *   unlogged row" a stable answer for both Today's hero and which row on Plan
 *   gets the primary Start.
 *
 * Pure, like `data/stats.ts`: dates and rules in, answers out. No store, no
 * hooks, no colours, and no strings — the words live in `i18n.ts`
 * (`repeatLabel` / `repeatSentence`), because a rule is arithmetic and how it
 * reads is a translation.
 *
 * There is deliberately **no end date**. A rule runs until it is removed, and
 * removing it takes its past "planned" bars with it — the logged sessions, the
 * part a diary owes you, are untouched. An `until` field is an additive change
 * needing no migration if anyone ever asks for one.
 */
import { daysBetween, dowOfISO, shiftISO, todayISO } from '@/data/date';

/**
 * How often a rule lands. `n` is the interval — 1 is daily / weekly, 2 is
 * every other day / bi-weekly — and it is a value rather than a preset,
 * because a preset list always turns out to be missing somebody's interval.
 *
 * `week` carries its own weekday set, which is what the retired seven rows
 * became: "Chest A, every week, Mon and Thu" is one rule set once.
 */
export type Repeat =
  | { unit: 'once' }
  | { unit: 'day'; n: number }
  | { unit: 'week'; n: number; dows: number[] };

export type PlanEntry = {
  id: string;
  /** A routine id. Rest is the absence of entries, never an entry. */
  rid: string;
  /** ISO anchor — the first day the rule lands on, and what intervals count from. */
  from: string;
  repeat: Repeat;
};

export type Plan = {
  entries: PlanEntry[];
  /** ISO date → the entry ids cancelled on that date. */
  skips: Record<string, string[]>;
};

export const EMPTY_PLAN: Plan = { entries: [], skips: {} };

/** The interval, clamped to what the stepper can produce. */
const span = (n: number) => Math.min(12, Math.max(1, Math.round(n) || 1));

/**
 * Monday-anchored calendar weeks from `a`'s week to `b`'s week.
 *
 * Monday-anchored so a bi-weekly Mon-and-Sat rule keeps both days in the same
 * week instead of drifting nine days apart. Exact: the day offsets cancel the
 * remainder, so the division is always whole.
 */
const weeksBetween = (a: string, b: string) =>
  (daysBetween(a, b) + dowOfISO(a) - dowOfISO(b)) / 7;

/** Whether one rule lands on one date. */
export const occurs = (e: PlanEntry, iso: string): boolean => {
  if (iso < e.from) return false;
  const r = e.repeat;
  if (r.unit === 'once') return iso === e.from;
  if (r.unit === 'day') return daysBetween(e.from, iso) % span(r.n) === 0;
  if (!r.dows.includes(dowOfISO(iso))) return false;
  return weeksBetween(e.from, iso) % span(r.n) === 0;
};

/**
 * What is planned on a date, in insertion order.
 *
 * The whole resolver. Every screen learns what a day holds through this one
 * function — a second reading of the rules is how a Wednesday ends up planned
 * on Today and blank on Plan.
 */
export const plannedOn = (p: Plan, iso: string): PlanEntry[] =>
  p.entries.filter((e) => occurs(e, iso) && !p.skips[iso]?.includes(e.id));

/** Rules that would have landed on a date but were cancelled on it. */
export const skippedOn = (p: Plan, iso: string): PlanEntry[] => {
  const off = p.skips[iso];
  return off?.length ? p.entries.filter((e) => off.includes(e.id) && occurs(e, iso)) : [];
};

/**
 * A rest day you chose, as opposed to a day nothing was ever planned on.
 *
 * Something was cancelled and nothing survived it — which is the whole
 * distinction, stored for free by the skip that made it. Before dated rules
 * the app could not tell the two apart, so every blank day called itself
 * "Rest day".
 */
export const restChosen = (p: Plan, iso: string) =>
  !!p.skips[iso]?.length && plannedOn(p, iso).length === 0;

/**
 * Days from `fromISO` to each routine's next planned day, routine id → offset
 * (0 = today). Routines with nothing inside the horizon are absent.
 *
 * One forward walk rather than a search per routine: this feeds the Routines
 * tab's Week sort *and* its today marker, and computing it twice is how those
 * two would start disagreeing. A year is the horizon — every repeating rule
 * lands inside 12 weeks, and a `once` further out than that reads as
 * unscheduled, which is honest.
 */
export const nextDays = (p: Plan, fromISO: string = todayISO(), horizon = 366) => {
  const out: Record<string, number> = {};
  // Every routine with a rule, so the walk can stop the moment they are all
  // placed — which for a plan of weekly rules is inside a week. Only a `once`
  // months out ever costs the full horizon, and this runs on every render of
  // the Routines tab.
  const want = new Set(p.entries.map((e) => e.rid)).size;
  let found = 0;
  for (let i = 0; i <= horizon && found < want; i++) {
    const iso = shiftISO(fromISO, i);
    for (const e of plannedOn(p, iso))
      if (!(e.rid in out)) {
        out[e.rid] = i;
        found++;
      }
  }
  return out;
};

/**
 * The first day on or after `iso` that a rule actually lands on.
 *
 * A weekly rule whose weekdays exclude the day you opened the sheet on has to
 * anchor forward, or `occurs` would never fire and the plan would silently be
 * nothing. Within a week the move is free — both days share one Monday, so the
 * interval counting is unchanged.
 */
export const anchorFor = (iso: string, r: Repeat): string => {
  if (r.unit !== 'week' || r.dows.length === 0) return iso;
  const here = dowOfISO(iso);
  const ahead = Math.min(...r.dows.map((d) => (d - here + 7) % 7));
  return ahead ? shiftISO(iso, ahead) : iso;
};

/** The rules that put a routine on the calendar, stale one-offs dropped. */
export const rulesFor = (p: Plan, rid: string, today: string = todayISO()) =>
  p.entries.filter(
    (e) => e.rid === rid && (e.repeat.unit !== 'once' || e.from >= today)
  );

/**
 * Lift a v3 seven-slot schedule into weekly rules — one per routine, carrying
 * every weekday it held, anchored on `mondayISO`.
 *
 * Grouped by routine rather than one rule per slot, because that is the shape
 * the sheet writes now: `{0:'chest', 3:'chest'}` was always one intention.
 * Anchoring at the start of the current week is what keeps the migration from
 * claiming days in the past — v3's slots ringed every Monday there had ever
 * been, which read as workouts you had skipped.
 */
export const planFromSchedule = (schedule: unknown, mondayISO: string): Plan => {
  if (typeof schedule !== 'object' || schedule === null || Array.isArray(schedule))
    return { entries: [], skips: {} };
  const byRid = new Map<string, number[]>();
  for (const [k, rid] of Object.entries(schedule as Record<string, unknown>)) {
    const dow = Number(k);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    if (typeof rid !== 'string' || !rid) continue;
    const held = byRid.get(rid);
    if (held) held.push(dow);
    else byRid.set(rid, [dow]);
  }
  let n = 0;
  const entries = [...byRid].map(([rid, dows]) => ({
    id: `p${n++}-${rid}`,
    rid,
    from: mondayISO,
    repeat: { unit: 'week' as const, n: 1, dows: dows.sort((a, b) => a - b) },
  }));
  return { entries, skips: {} };
};

/**
 * The plan as seven weekday slots — the shape onboarding's cycle-day picker
 * thinks in, and only that picker.
 *
 * Weekly rules only, later rules winning, which is a deliberate flattening: the
 * tour offers one routine per day by design ("the Plan tab's full sheet exists
 * for everything past it"), and a rule that repeats every third day has no
 * weekday to show there.
 */
export const weekSlots = (p: Plan): Record<number, string> => {
  const out: Record<number, string> = {};
  for (const e of p.entries)
    if (e.repeat.unit === 'week') for (const d of e.repeat.dows) out[d] = e.rid;
  return out;
};

/* ── the writes, as pure transforms ─────────────────────────────────────────
 *
 * The store's mutators are these plus a `patch`. Kept here because they are
 * where the two primitives are actually maintained — in particular that a skip
 * names an entry id, so nothing may remove an entry without sweeping the skips
 * that pointed at it.
 */

/** Cancel one occurrence of one rule. */
export const skip = (p: Plan, iso: string, id: string): Plan =>
  p.skips[iso]?.includes(id)
    ? p
    : { ...p, skips: { ...p.skips, [iso]: [...(p.skips[iso] ?? []), id] } };

/** Un-cancel one occurrence, dropping the date's list once it empties. */
export const unskip = (p: Plan, iso: string, id: string): Plan => {
  const held = p.skips[iso];
  if (!held?.includes(id)) return p;
  const kept = held.filter((x) => x !== id);
  const skips = { ...p.skips };
  if (kept.length) skips[iso] = kept;
  else delete skips[iso];
  return { ...p, skips };
};

/**
 * Drop every rule matching a test, and every skip that only existed to cancel
 * one of them. A skip left behind would cancel nothing forever — and if an id
 * were ever reused, would cancel the wrong thing.
 */
export const dropEntries = (p: Plan, gone: (e: PlanEntry) => boolean): Plan => {
  const ids = new Set(p.entries.filter(gone).map((e) => e.id));
  if (!ids.size) return p;
  const skips: Record<string, string[]> = {};
  for (const [iso, held] of Object.entries(p.skips)) {
    const kept = held.filter((id) => !ids.has(id));
    if (kept.length) skips[iso] = kept;
  }
  return { entries: p.entries.filter((e) => !ids.has(e.id)), skips };
};

/**
 * A stored plan, or the empty one.
 *
 * `PERSIST_SHAPE` only asks whether a durable key is an object, and leaves the
 * rows inside to the mutators — but both of this one's sub-keys are load-bearing
 * (`plannedOn` filters `entries` and indexes `skips`), and a backup that has
 * been through a chat app can arrive with either missing. One bad key would
 * throw in every screen that reads the plan, after which the debounced save
 * would write the wreck over the good blob.
 */
export const asPlan = (v: unknown): Plan => {
  const held = v as { entries?: unknown; skips?: unknown } | null;
  if (!held || typeof held !== 'object') return { entries: [], skips: {} };
  const entries = (Array.isArray(held.entries) ? held.entries : []).filter(
    (e: unknown): e is PlanEntry => {
      const r = e as PlanEntry | null;
      return (
        !!r &&
        typeof r.id === 'string' &&
        typeof r.rid === 'string' &&
        typeof r.from === 'string' &&
        !!r.repeat &&
        (r.repeat.unit === 'once' || r.repeat.unit === 'day' || r.repeat.unit === 'week')
      );
    }
  );
  const skips: Record<string, string[]> = {};
  const raw = held.skips;
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    for (const [iso, ids] of Object.entries(raw as Record<string, unknown>))
      if (Array.isArray(ids)) {
        const kept = ids.filter((x): x is string => typeof x === 'string');
        if (kept.length) skips[iso] = kept;
      }
  return { entries, skips };
};
