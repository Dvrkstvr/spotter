/**
 * Haptics, on the same grammar as motion: the more often a moment happens, the
 * quieter its feedback.
 *
 * Ticking a set happens forty times a session, so it gets the lightest impact
 * there is — a confirmation you feel through the phone rather than a buzz you
 * notice. A rest running out happens once between sets and has to reach you
 * across the gym with the phone face-down on a bench, so it gets the louder
 * notification pattern.
 *
 * The number drag is where that ladder earns its keep, because it is the one
 * gesture you perform with the cell hidden under your own thumb:
 *
 * - `grab` is the hold landing — the moment the cell stops being a field you
 *   are about to type in and becomes one you steer. It is the same weight as a
 *   ticked set, because it is the same kind of event: the app saying it read
 *   you. Feeling it is what tells you when to start moving; without it you
 *   either move too early and never take the cell, or wait longer than you
 *   needed to.
 * - `step` fires ten or twenty times inside one drag, so it is the quietest
 *   thing here, and it is the one call that leaves the cross-platform API.
 *   `selectionAsync` reads like the right answer and is not: on Android expo
 *   implements it as a 50 ms buzz at amplitude 30 — the same vibration as a
 *   Light impact — which twenty times in one drag is a rumble, not a ladder of
 *   ticks. `Segment_Frequent_Tick` is the constant Android defines for exactly
 *   this ("many potential choices… expected to be very soft, so as not to be
 *   uncomfortable when performed a lot in quick succession"), and a phone
 *   whose motor can't make it that soft is allowed to make nothing, which is
 *   the right failure. It fires only when the figure actually changes, never
 *   per frame and never once the clamp at zero has stopped it, so a buzz
 *   always means the number moved.
 *
 * Every call is fire-and-forget: a phone with no vibrator (or an emulator)
 * rejects these, and a missing buzz must never take a logged set with it.
 * Every *caller* is gated on the `haptics` setting — this module is the
 * vocabulary, not the switch.
 */
import * as Haptics from 'expo-haptics';

const impact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};

/**
 * `winding`'s ramp: where each tick falls as a fraction of the hold's own
 * duration, and the weight it lands at.
 *
 * The gaps shorten the whole way down — 30, 25, 20, 15% of the fill, then 10%
 * of silence into the payoff — which is what makes it read as approaching
 * something rather than as a metronome. Two constraints fix the numbers:
 * no gap may be shorter than the pulse before it (Android's vibrator replaces
 * whatever is running, so a tighter one would eat its own predecessor — 15% of
 * 700ms is 105, against a 43ms Medium), and the last gap has to be the
 * shortest in the run, or the deletion arrives after the ramp has already
 * finished instead of as its final beat.
 */
const WIND: [number, Haptics.ImpactFeedbackStyle][] = [
  [0, Haptics.ImpactFeedbackStyle.Light],
  [0.3, Haptics.ImpactFeedbackStyle.Light],
  [0.55, Haptics.ImpactFeedbackStyle.Light],
  [0.75, Haptics.ImpactFeedbackStyle.Medium],
  [0.9, Haptics.ImpactFeedbackStyle.Medium],
];

export const buzz = {
  /** A set ticked off. */
  set: () => impact(Haptics.ImpactFeedbackStyle.Light),
  /** A number cell taken by a hold — the drag is yours now. */
  grab: () => impact(Haptics.ImpactFeedbackStyle.Light),
  /** One 0.5 kg / one rep gone by under the thumb. */
  step: () => {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick)
      .catch(() => {});
  },
  /** A rest run out — you are probably not looking at the screen. */
  rest: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /**
   * A destructive hold winding up — the ticks that say an action is running
   * before it has run. Handed the fill's own duration, so the two can never
   * drift apart; see `WIND` for where they fall.
   *
   * The filling bar is the visual answer to "is something happening?", and it
   * is exactly the answer you can't see, because your thumb is on top of it.
   * This is the same report through the same finger, and it accelerates for the
   * same reason the bar fills left to right: it has to say *how far in* you
   * are, not merely that you are.
   *
   * Returns its own cancel and the caller must hold it. A hold released halfway
   * has to fall silent on the frame the fill starts rewinding — a phone still
   * counting down to something that is no longer going to happen is worse than
   * one that never counted.
   */
  winding: (ms: number) => {
    const timers = WIND.map(([at, style]) => setTimeout(() => impact(style), at * ms));
    return () => timers.forEach(clearTimeout);
  },
  /**
   * Something deleted, at the far end of a hold — the one negative in the
   * vocabulary, and the only thing here that isn't a confirmation. Lands as the
   * final beat of `winding`'s ramp rather than as a separate event: the Heavy
   * arrives one gap after the last Medium, and that gap is the shortest in the
   * run.
   *
   * Heavy, then Light 120ms behind it: the weight of the thing dropping off.
   * `NotificationFeedbackType.Error` is the obvious reach and is wrong — its
   * three pulses are the platform saying a failure happened, where deleting a
   * routine is something you held a button down for on purpose. Ditto
   * `AndroidHaptics.Reject`, which also needs Android 11 and refuses outright
   * below it; two impacts work on every phone the app runs on.
   *
   * Two calls rather than one pattern because Android's vibrator *replaces*
   * whatever is running — the gap has to outlast the 60ms first pulse or the
   * second hit swallows it.
   */
  gone: () => {
    impact(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => impact(Haptics.ImpactFeedbackStyle.Light), 120);
  },
};
