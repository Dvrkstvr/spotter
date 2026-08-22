/**
 * The plan reminder, mounted for the life of the app.
 *
 * Renders nothing — it owns a side-effecting subsystem the way <RestAlarm> and
 * <BuddyRadio> do, and sits beside them in <Overlays>: outside the `social`
 * gate and outside the session, because what you planned for Thursday has
 * nothing to do with a buddy and nothing to do with whether a workout is
 * running right now.
 *
 * **It stamps a fortnight ahead rather than asking Android to repeat itself.**
 * A daily trigger would fire on rest days too, and there is no trigger shape
 * that means "every third day from the 4th, unless it was cancelled". The plan
 * already answers that — `plannedOn` is the one resolver — so the honest move
 * is to ask it for each of the next `HORIZON` days and hand Android the answer
 * as dated alarms. The list is re-stamped whenever anything it was derived from
 * moves: the rules, the routines' names, what has been logged, the time, the
 * language, and the day itself.
 *
 * What that costs is a horizon: a phone left unopened for longer than
 * `HORIZON` days runs out of stamped reminders. That is the right failure —
 * the reminders are about a plan, and a plan two weeks stale is not one this
 * app should keep announcing on its own.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { PlanAlarm as Alarm, schedulePlanAlarms, setChannelName } from '@/data/alarms';
import { fromISO, shiftISO, todayISO } from '@/data/date';
import { loggedRows, plannedOn } from '@/data/plan';
import { useStore } from '@/store/workout-store';

/**
 * How far ahead days are stamped. Two weeks covers every phone that gets opened
 * to log a workout, which is the only phone this feature is for, and it is
 * short enough that a rewritten plan is never more than a fortnight of stale
 * alarms — all of which are dropped and re-stamped the moment the app comes up.
 */
const HORIZON = 14;

export function PlanAlarm() {
  const { s, L, routine, rInfo } = useStore();

  // Android shows this in the app's notification settings, so it follows the
  // language like everything else the user reads.
  useEffect(() => setChannelName('plan', L.planAlertChannel), [L.planAlertChannel]);

  /**
   * Today, as state rather than a call during render.
   *
   * The React Compiler treats a call with no reactive arguments as something it
   * may compute once (see the Themes section in AGENTS.md), and "what day is
   * it" is exactly the question that must not be answered once per process. As
   * state it is reactive by construction, and it is re-read at the one moment
   * it can have changed without the app noticing: coming back from the
   * background. Setting it to the same string is a no-op, so a hundred
   * app-switches inside one day cost nothing.
   */
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setToday(todayISO());
    });
    return () => sub.remove();
  }, []);

  /**
   * Which of today's rows need no reminder: already logged, or being trained
   * right now. Only today can be either — nothing in the future has happened
   * yet — so this is consumed on day 0 and nowhere else.
   *
   * Consumed positionally by `loggedRows`, the same arithmetic Plan and Today's
   * hero read, so a day holding one routine twice and trained once still reminds
   * about the second row rather than dropping both. The running session counts
   * as one of the spending sessions because the reminder's errand is "this is
   * still to do", and a workout under way is neither still to do nor yet in
   * `history`; abandoning it means one reminder that doesn't fire, the cheaper
   * mistake.
   */
  const live = s.session?.rid ?? null;
  const todayRows = plannedOn(s.plan, today);
  const todayHandled = loggedRows(todayRows, [
    live,
    ...s.history.filter((h) => h.date === today).map((h) => h.rid),
  ]);

  /**
   * The chosen minute, clamped on read the way `span()` clamps a plan's
   * interval: the stepper can only produce 0–1439, but a backup that has been
   * through a chat app or a text editor can arrive with anything, and
   * `setHours(83)` would quietly announce a workout three days later.
   */
  const minute = Math.min(1439, Math.max(0, Math.round(s.planAlertAt) || 0));

  const alarms: Alarm[] = [];
  if (s.planAlert)
    for (let i = 0; i < HORIZON; i++) {
      const iso = shiftISO(today, i);
      const rows = i > 0 ? plannedOn(s.plan, iso) : todayRows.filter((_, j) => !todayHandled[j]);
      // One reminder per day, not per rule: a day holding two workouts is one
      // thing to be told about, and it names both.
      const names = [
        ...new Set(
          rows
            .map((e) => {
              const r = routine(e.rid);
              return r ? rInfo(r).text : null;
            })
            // A rule naming a routine deleted since resolves to nothing, which
            // is the plan screen's own case. A notification has no room to
            // explain it, so it simply isn't one of the day's names — and a day
            // with no names left is not announced at all.
            .filter((n): n is string => !!n)
        ),
      ];
      if (!names.length) continue;
      // `setHours` on a local date rather than adding milliseconds to midnight:
      // a fortnight can cross a DST boundary, and 18:00 has to stay 18:00 on
      // the other side of it.
      const when = fromISO(iso);
      when.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      alarms.push({ at: when.getTime(), title: L.plannedToday, body: names.join(' · ') });
    }

  /**
   * The list is its own dependency, serialised.
   *
   * Everything above is derived from state, so the array is a fresh object
   * every render and can't be a dep — and naming the dozen inputs it was built
   * from would be a second, hand-maintained copy of the derivation. The plan
   * the effect is about to write *is* what should decide whether it runs, so
   * that is what it is given; a re-render that changes none of it produces the
   * identical string and nothing is re-stamped.
   */
  const spec = JSON.stringify(alarms);
  useEffect(() => {
    schedulePlanAlarms(JSON.parse(spec) as Alarm[]);
  }, [spec]);

  return null;
}
