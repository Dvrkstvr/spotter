/**
 * The rest alarm, mounted for the life of the app.
 *
 * Renders nothing — it exists to own a side-effecting subsystem, the way
 * <BuddyRadio> does. It deliberately sits outside <SessionOverlay>, which
 * unmounts whenever the session is tucked behind the tabs, and outside the
 * `social` gate in <Overlays>: a rest has nothing to do with a buddy, and one
 * that was scheduled must still be cancellable from a screen that isn't the
 * session.
 *
 * Three jobs, one effect each: arm the alarm while a rest of your own is
 * running, ask for the permission at a calm moment, and clear the tray when you
 * come back to the app.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  cancelRestAlarm,
  dismissRestAlarms,
  ensureAlarmPermission,
  scheduleRestAlarm,
  setAlarmChannelName,
} from '@/data/rest-alarm';
import { useStore } from '@/store/workout-store';

export function RestAlarm() {
  const { s, L, ex, exInfo } = useStore();

  // Android shows this in the app's notification settings, so it follows the
  // language like everything else the user reads.
  useEffect(() => setAlarmChannelName(L.restAlertChannel), [L.restAlertChannel]);

  const rest = s.rest;
  /**
   * Only a rest you earned. A wait that exists because it's the buddy's turn
   * ends when the turn comes back, not when a clock does — there is no moment
   * to announce, and `own` is what separates the two (see `rest` in the store).
   */
  const armed = !!rest && rest.own && !rest.skipped && s.restSeconds > 0 && s.restAlert;

  /**
   * What the lock screen says. Deliberately the exercise and nothing more: a
   * set number would change the moment a set is ticked, which is one render
   * *before* the new rest is stamped, and the alarm would be torn down and
   * rebuilt for a rest that is already over. Changing exercise deliberately
   * does *not* clear a running rest (see the deviations in AGENTS.md), so a
   * swipe mid-rest lands here as a re-arm — which is why the schedule below
   * counts what is left rather than starting the full length over.
   */
  const entry = s.session?.list[s.active];
  const meta = entry ? ex(entry.ex) : undefined;
  const body = meta ? exInfo(meta).text : L.restOverBody;

  // The session clock, readable from inside the arm effect without joining
  // its deps — `elapsed` ticks every second, and a dep would tear the alarm
  // down and rebuild it each tick. Updated in an effect, per the compiler.
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = s.elapsed;
  });

  const at = rest?.at ?? 0;
  useEffect(() => {
    if (!armed) return;
    let id: string | null = null;
    let dropped = false;
    // What is *left* of this rest, not its full length: a fresh rest was
    // stamped this tick (`at` ≈ elapsed, so the difference is zero), but a
    // re-arm mid-rest — the exercise swiped, the length setting changed —
    // inherits a rest already partly served, and rescheduling the whole
    // `restSeconds` from now would announce it minutes late.
    const left = Math.max(1, s.restSeconds - (elapsedRef.current - at));
    // The schedule is async and the rest can end before it lands — hence both
    // halves of the guard: cancel what came back late, and cancel what arrived.
    scheduleRestAlarm(left, L.restOverTitle, body).then((got) => {
      if (dropped) cancelRestAlarm(got);
      else id = got;
    });
    // Cleanup is the *only* cancel path, and it covers every way a rest can
    // end: skipped with "start now", the next set ticked, the workout
    // finished, the setting switched off.
    return () => {
      dropped = true;
      cancelRestAlarm(id);
    };
    // `at` identifies the rest: a new one always means a new stamp.
  }, [armed, at, s.restSeconds, L.restOverTitle, body]);

  /**
   * Android 13+ wants POST_NOTIFICATIONS at runtime, and asking for it at
   * "start workout" is the calm moment — three minutes later you are reaching
   * for the tick, which is no place for a system dialog. Only ever prompts
   * while the answer is undetermined, so this is a no-op from the second
   * session on.
   */
  const hasSession = !!s.session;
  useEffect(() => {
    if (hasSession && s.restAlert && s.restSeconds > 0) ensureAlarmPermission();
  }, [hasSession, s.restAlert, s.restSeconds]);

  /**
   * "It vanishes when you open the app back up." Also on mount, which is the
   * cold-start case: an alarm that fired while the app was gone would otherwise
   * still be sitting in the shade.
   */
  useEffect(() => {
    dismissRestAlarms();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') dismissRestAlarms();
    });
    return () => sub.remove();
  }, []);

  return null;
}
