/**
 * Two sets that share one rest.
 *
 * A **drop set** is a set taken straight after the one above it, at a lower
 * weight; a **superset** is a set taken straight after on the other machine.
 * The app had neither, and what it got wrong about both was the same thing:
 * every tick starts `restSeconds`, which is the precise opposite of what either
 * of them means. So one sentence governs the pair of them —
 *
 *   > a tick earns a rest only when nothing is queued to be taken
 *   > immediately after it
 *
 * — and the two features are the two ways something can be queued: the next
 * row of this ledger (`LoggedSet.link`), or the paired exercise's row of this
 * round (`RoutineItem.with` / `SessionExercise.with`).
 *
 * The two are made in different places on purpose. A drop is a decision about
 * how *that set* went, which nobody makes a week early, so it is a session fact
 * and the routine never mentions it. A superset is a decision about *which two
 * exercises*, which is exactly what a routine holds, so it is made in the
 * editor and nowhere else — there is no mid-session pairing anywhere in the
 * app. The mockup is `design/drop-superset-mockup.html`.
 *
 * Pure, like `plan.ts` and `tips.ts`: rows in, answers out — no store, no
 * hooks, no colours, no strings. The row types are structural rather than
 * imported so this module owes the store nothing at all.
 */

/** As much of a session set as any answer here depends on. */
type Row = { done: boolean; link?: true };
/** As much of a session exercise. `SessionExercise` satisfies it. */
type Item = { sets: Row[]; with?: 'next' };

/**
 * One screen stop: a lone exercise, or a superset pair, as indexes into
 * `session.list`.
 *
 * The list itself stays flat — a pair is two entries that happen to be joined,
 * so the buddy diff, the overview's ×, `removeSessionEx` and `totals` all keep
 * reading a list of exercises and only the screen groups them. `head` is the
 * index the stop is addressed by, which is what `s.active` is snapped to.
 */
export type Stop = { head: number; ids: number[] };

/**
 * Every stop in the list, in order.
 *
 * A `with` on the last row — or on one whose neighbour has since been deleted —
 * resolves to no pair here rather than being swept from the data, the same way
 * a plan entry naming a deleted routine is handled where it is read.
 */
export const stopsOf = (list: readonly Item[]): Stop[] => {
  const out: Stop[] = [];
  for (let i = 0; i < list.length; i++) {
    const paired = list[i].with === 'next' && i + 1 < list.length;
    out.push({ head: i, ids: paired ? [i, i + 1] : [i] });
    if (paired) i++;
  }
  return out;
};

/**
 * The stop an exercise index belongs to — which is how `s.active` keeps
 * meaning "an exercise" for everything that writes it (the overview's jump, the
 * buddy's offer, a fresh session) while the screen reads it as "a stop".
 */
export const stopAt = (list: readonly Item[], i: number): Stop | null =>
  stopsOf(list).find((st) => st.ids.includes(i)) ?? null;

/** The first set nobody has ticked, or the length when they all are. */
const openAt = (sets: readonly Row[]) => {
  const k = sets.findIndex((x) => !x.done);
  return k < 0 ? sets.length : k;
};

/**
 * Which round a pair is on: the lowest set index still open in either half.
 *
 * Derived, never stored — the same "first unlogged row" arithmetic the plan
 * uses to decide what *next* means, one scope down. Nothing to persist and
 * nothing that can drift out of step with the ticks it is counting.
 */
export const roundOf = (list: readonly Item[], stop: Stop) =>
  Math.min(...stop.ids.map((i) => openAt(list[i].sets)));

/** How many rounds the pair has in it: the longer half decides. */
export const roundsOf = (list: readonly Item[], stop: Stop) =>
  Math.max(...stop.ids.map((i) => list[i].sets.length));

/**
 * The set you're on, as an exercise index and a row index — or null when the
 * whole stop is sealed.
 *
 * Exactly one row across a pair is live, and the halves alternate: within a
 * round the first half goes, then the second. A half that has run out of sets
 * is simply skipped, which is the whole of what uneven set counts need.
 */
export const liveIn = (list: readonly Item[], stop: Stop): { i: number; j: number } | null => {
  const r = roundOf(list, stop);
  for (const i of stop.ids) {
    const row = list[i].sets[r];
    if (row && !row.done) return { i, j: r };
  }
  return null;
};

/**
 * Whether the set that just landed earns a rest.
 *
 * Read off the row that is live *now* rather than the one just ticked, because
 * that is the row which says it: a `link`ed row is a drop waiting in the same
 * ledger, and a pair's second half sitting open at a round whose first half is
 * already done is mid-round. Both mean the next effort is immediate.
 *
 * A sealed stop earns one: nothing is queued, and the rest belongs to whatever
 * you walk to next.
 */
export const restEarned = (list: readonly Item[], stop: Stop) => {
  const live = liveIn(list, stop);
  if (!live) return true;
  if (list[live.i].sets[live.j]?.link) return false;
  const [first, second] = stop.ids;
  if (second !== undefined && live.i === second && list[first].sets[live.j]?.done) return false;
  return true;
};
