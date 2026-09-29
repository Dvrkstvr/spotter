/**
 * What you said last time about an exercise as a whole.
 *
 * A set's words live in `lastMarks`, index for index with the ghost. An
 * exercise's words have no such twin, on purpose: `lastLog[id].date` already
 * names the one session "last time" means, and that session's diary entry
 * already holds the note (`LoggedExercise.note`). Reading it from there costs
 * a scan of a short list, and saves a persisted key that every backup, merge
 * and migration would otherwise have to know about.
 *
 * It follows `lastMarks`'s rule without having to be written down twice: only
 * the *latest* session speaks. If you trained the exercise again and said
 * nothing, last month's "shoulder, go easy" is advice about a session that no
 * longer exists, and nothing is shown.
 *
 * Pure, like `superset.ts`: structural row types, no store, no strings.
 */

/** As much of a diary entry as the answer depends on. */
type Entry = { date: string; list?: { ex: string; note?: string }[] };

/**
 * The note the latest session of `id` left, or null.
 *
 * `last` is `lastLog[id]` — absent for an exercise never logged here, in which
 * case there is no "last time" to have said anything in. Two sessions of the
 * same exercise on one day resolve to the later one in the list, which is the
 * one `finishSession` wrote `lastLog` from.
 */
export const lastExNote = (
  history: readonly Entry[],
  last: { date: string } | undefined,
  id: string
): { date: string; note: string } | null => {
  if (!last) return null;
  for (let k = history.length - 1; k >= 0; k--) {
    const h = history[k];
    if (h.date !== last.date) continue;
    const e = h.list?.find((x) => x.ex === id);
    if (!e) continue;
    const note = e.note?.trim();
    return note ? { date: h.date, note } : null;
  }
  return null;
};
