/**
 * Every overlay in the app, stacked in the design's z-order.
 *
 * The order below is the order they paint in — later wins — and each carries the
 * z-index the design gives it, so the two never drift apart:
 *
 *   70 exercise · 75 routine · 78 settings · 80 session · 83 schedule
 *   84 pick workout · 85 picker · 86 how-to · 87 nearby · 88 new exercise
 *   90 summary
 *
 * 83 (schedule) is not from the design — the day-routine selector replaces the
 * design's tap-to-cycle, slotted just under its sibling picker sheets.
 */
import { ExerciseSheet } from '@/components/overlays/exercise-sheet';
import { InstructionsSheet } from '@/components/overlays/instructions-sheet';
import { NewExerciseSheet } from '@/components/overlays/new-exercise-sheet';
import { PickWorkoutSheet } from '@/components/overlays/pick-workout-sheet';
import { PickerOverlay } from '@/components/overlays/picker-overlay';
import { RoutineOverlay } from '@/components/overlays/routine-overlay';
import { ScanSheet } from '@/components/overlays/scan-sheet';
import { ScheduleSheet } from '@/components/overlays/schedule-sheet';
import { SessionOverlay } from '@/components/overlays/session-overlay';
import { SettingsOverlay } from '@/components/overlays/settings-overlay';
import { SummaryModal } from '@/components/overlays/summary-modal';
import { useStore } from '@/store/workout-store';

export function Overlays() {
  const { s } = useStore();

  return (
    <>
      {s.exOpen && <ExerciseSheet />}
      {s.routineOpen && <RoutineOverlay />}
      {s.settingsOpen && <SettingsOverlay />}
      {s.session && <SessionOverlay />}
      {s.dayPick !== null && <ScheduleSheet />}
      {s.pickWorkout && <PickWorkoutSheet />}
      {s.picker && <PickerOverlay />}
      {s.instrOpen && <InstructionsSheet />}
      {s.scanning && <ScanSheet />}
      {s.creating && <NewExerciseSheet />}
      {s.summary && <SummaryModal />}
    </>
  );
}
