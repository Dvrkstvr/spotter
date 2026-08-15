/**
 * Every overlay in the app, stacked in the design's z-order.
 *
 * The order below is the order they paint in — later wins — and each carries the
 * z-index the design gives it, so the two never drift apart:
 *
 *   70 exercise · 75 routine · 76 insights · 77 coach · 78 settings
 *   79 buddy sync · 80 session
 *   83 plan · 84 pick workout · 85 picker · 86 how-to · 87 nearby
 *   88 new exercise · 89 buddy invite / join ask · 90 summary · 91 intake
 *
 * 76 (insights), 77 (coach), 79 (buddy sync), 83 (plan), and 89 (buddy
 * invite, join ask) are not from the design: the plan sheet replaces the
 * design's tap-to-cycle day selector, and the buddy screens belong to the real
 * radio the design's mock never had. The coach sits directly above insights
 * because that is where it is opened from and it has to cover it; closing it
 * drops you back onto the statistics you left. Both buddy questions sit just
 * under the summary so "train together?" and "can I join?" can land on top of
 * whatever is open — including the session, which is exactly where the second
 * one arrives.
 *
 * 91 (intake) is above the summary because it answers a tap that happened in
 * another app entirely, which outranks anything this one had open — but below
 * onboarding, which on a first run *is* the app. Restoring a backup onto a phone
 * mid-setup would leave the tour running over the restored data and re-applying
 * its routine picks at the end; the sheet waits, and is still there afterwards.
 */
import { BuddyRadio } from '@/components/buddy-radio';
import { Intake } from '@/components/intake';
import { BuddyInviteSheet } from '@/components/overlays/buddy-invite-sheet';
import { OnboardingOverlay } from '@/components/overlays/onboarding-overlay';
import { BuddySyncOverlay } from '@/components/overlays/buddy-sync-overlay';
import { CoachOverlay } from '@/components/overlays/coach-overlay';
import { ExerciseSheet } from '@/components/overlays/exercise-sheet';
import { InsightsOverlay } from '@/components/overlays/insights-overlay';
import { InstructionsSheet } from '@/components/overlays/instructions-sheet';
import { JoinAskSheet } from '@/components/overlays/join-ask-sheet';
import { NewExerciseSheet } from '@/components/overlays/new-exercise-sheet';
import { PickerOverlay } from '@/components/overlays/picker-overlay';
import { RoutineOverlay } from '@/components/overlays/routine-overlay';
import { ScanSheet } from '@/components/overlays/scan-sheet';
import { PlanSheet } from '@/components/overlays/plan-sheet';
import { SessionOverlay } from '@/components/overlays/session-overlay';
import { SettingsOverlay } from '@/components/overlays/settings-overlay';
import { SummaryModal } from '@/components/overlays/summary-modal';
import { RestAlarm } from '@/components/rest-alarm';
import { useStore } from '@/store/workout-store';

export function Overlays() {
  const { s } = useStore();

  // Training alone is enforced here rather than by hiding buttons. Unmounting
  // <BuddyRadio> is what actually switches the radio off — it owns
  // advertising, discovery and every incoming message — and dropping the four
  // buddy sheets with it means no stale flag can put a "train together?"
  // question over a workout that is meant to be private.
  const social = !s.privateMode;

  return (
    <>
      {social && <BuddyRadio />}
      {/* Not gated on `social`, and not inside the session: a rest is yours
          whether or not anyone is training with you, and it has to survive the
          session being tucked behind the tabs. Renders nothing. */}
      <RestAlarm />
      {/* 91 when it has something to say, nothing at all the rest of the time.
          Mounted unconditionally because the file it answers for arrives before
          any flag could be set — on a cold start, before React exists. */}
      <Intake />
      {s.exOpen && <ExerciseSheet />}
      {s.routineOpen && <RoutineOverlay />}
      {s.statsOpen && <InsightsOverlay />}
      {s.coachOpen && <CoachOverlay />}
      {s.settingsOpen && <SettingsOverlay />}
      {social && s.buddySync && <BuddySyncOverlay />}
      {s.session && !s.sessionMin && <SessionOverlay />}
      {s.dayPlan !== null && <PlanSheet />}
      {s.picker && <PickerOverlay />}
      {s.instrOpen && <InstructionsSheet />}
      {social && s.scanning && <ScanSheet />}
      {s.creating && <NewExerciseSheet />}
      {social && s.buddyInvite && <BuddyInviteSheet />}
      {social && s.joinAsk !== null && <JoinAskSheet />}
      {s.summary && <SummaryModal />}
      {/* 95 — above everything, the summary included: on a first run it *is*
          the app, and reopened from Settings it has to cover Settings. Not
          gated on `social`: its permission screen is where privateMode gets
          decided, so it cannot sit behind the flag it writes. */}
      {(!s.onboarded || s.onboardingOpen) && <OnboardingOverlay />}
    </>
  );
}
