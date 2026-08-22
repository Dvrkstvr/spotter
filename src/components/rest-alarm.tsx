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

import { dlog } from '@/data/diag';
import {
  cancelAlarm,
  dismissAlarms,
  ensureAlarmPermission,
  scheduleRestAlarm,
  setChannelName,
} from '@/data/alarms';
import { useStore } from '@/store/workout-store';

export function RestAlarm() {
  const { s, L, ex, exInfo } = useStore();

  // Android shows this in the app's notification settings, so it follows the
  // language like everything else the user reads.
  useEffect(() => setChannelName('rest', L.restAlertChannel), [L.restAlertChannel]);

  const rest = s.rest;
  /**
   * Every rest here is one you earned, because that is the only kind `rest`
   * holds (see the store): a wait that exists because it's the buddy's turn
   * ends when they tick, not when a clock does, so there is no moment to
   * announce and nothing is stamped for it.
   */
  const armed = !!rest && !rest.skipped && s.restSeconds > 0 && s.restAlert;

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
    const left = s.restSeconds - (elapsedRef.current - at);
    // Already run out in-app (`s.rest` was never cleared): a re-arm on any dep
    // change would otherwise fire a fresh near-immediate alarm about a rest
    // that ended minutes ago. Only arm when there is genuinely time left.
    if (left <= 0) return;
    // The schedule is async and the rest can end before it lands — hence both
    // halves of the guard: cancel what came back late, and cancel what arrived.
    scheduleRestAlarm(left, L.restOverTitle, body).then((got) => {
      // `null` here is the whole of "the alarm never fired": no module, no
      // permission, or a rest of zero. Nothing on the screen distinguishes
      // those from an alarm that fired while the phone was in a pocket.
      dlog('rest', 'alarm scheduled', { in: left, ok: got !== null, late: dropped }, true);
      if (dropped) cancelAlarm(got);
      else id = got;
    });
    // Cleanup is the *only* cancel path, and it covers every way a rest can
    // end: skipped with "start now", the next set ticked, the workout
    // finished, the setting switched off.
    return () => {
      dropped = true;
      dlog('rest', 'alarm cancelled', { had: id !== null });
      cancelAlarm(id);
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
   *
   * The tray is the app's, so this sweep takes the plan reminder with it, which
   * is right — you are in the app, which is where the reminder was pointing. It
   * lives here rather than in <PlanAlarm> because one sweep asked for twice is
   * still one sweep, and this is the component that has always owned it.
   */
  useEffect(() => {
    dismissAlarms();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') dismissAlarms();
    });
    return () => sub.remove();
  }, []);

  return null;
}
