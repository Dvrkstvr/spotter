/**
 * Haptics, on the same grammar as motion: the more often a moment happens, the
 * quieter its feedback.
 *
 * Ticking a set happens forty times a session, so it gets the lightest impact
 * there is — a confirmation you feel through the phone rather than a buzz you
 * notice. A rest running out happens once between sets and has to reach you
 * across the gym with the phone face-down on a bench, so it gets the louder
 * notification pattern. Nothing else in the app vibrates.
 *
 * Every call is fire-and-forget: a phone with no vibrator (or an emulator)
 * rejects these, and a missing buzz must never take a logged set with it.
 */
import * as Haptics from 'expo-haptics';

export const buzz = {
  /** A set ticked off. */
  set: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** A rest run out — you are probably not looking at the screen. */
  rest: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
