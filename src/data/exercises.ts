/** Exercise library and per-exercise instructions. Ported from the design's EX / INFO. */
import { LangMap } from './i18n';

/**
 * What the two numbers in a set row mean.
 *
 * A set row is always the same shape — two fields and a tick — because that
 * shape is the app: the tick logs, a held drag steps a field, a logged set
 * starts the rest clock. This only decides what the two fields are *labelled*
 * and whether they multiply into a volume, which is what lets a run and a
 * bench press share one screen instead of needing two.
 *
 * - `load`     kg × reps. The default, and what every seeded lift is. An
 *              empty weight reads as BW, which is how bodyweight reps already
 *              worked before this type existed.
 * - `time`     kg × seconds — a hold. The left field stays weight because a
 *              weighted plank is a real set; it just usually reads BW.
 * - `distance` km × minutes. No BW: an empty distance is unknown, not zero,
 *              so it reads as a dash.
 * - `duration` minutes, and nothing else. The only measure that draws **one**
 *              field instead of two — see `isSingle`.
 *
 * Only `load` multiplies into the session's volume stat. Kilo-seconds and
 * kilometre-minutes are not units, and silently adding them to a number
 * labelled "volume" would make the one number on the summary screen a lie.
 *
 * `duration` is the one measure nothing here is seeded with, on purpose. It
 * exists for the things that have no sets at all — a climbing session, a
 * match, a class — which is a real hole in a *diary*: a Saturday the app
 * cannot hold is a Saturday `loggedThisMonth()` gets wrong. But a football
 * entry in a lifting app's default library is clutter for almost everyone,
 * so the app ships none and lets you make your own. Ship narrow, allow wide.
 */
export type Measure = 'load' | 'time' | 'distance' | 'duration';

/** Every measure this app knows, in picker order. */
export const MEASURES: readonly Measure[] = ['load', 'time', 'distance', 'duration'];

export const isMeasure = (v: unknown): v is Measure =>
  typeof v === 'string' && (MEASURES as readonly string[]).includes(v);

/**
 * Whether the set row collapses to a single field.
 *
 * `duration` still *stores* both halves — the logged string stays "— × 90" so
 * `LoggedSet`, `prevNums` and the whole persistence format keep one shape —
 * it is only drawn as one cell. Rendering it as two with the left permanently
 * dashed was the cheap alternative, and it reads as a bug rather than a
 * decision.
 */
export const isSingle = (m: Measure) => m === 'duration';

/** Which character stands in for an empty left-hand field. */
export const blankOf = (m: Measure) => (m === 'load' || m === 'time' ? 'BW' : '—');

/**
 * What a set said about the next one.
 *
 * The numbers record what you lifted; they do not record what to do about it.
 * "70 × 8" is the same row whether the last two reps were a grind or whether
 * you racked it early because it was too light — and a week later that
 * difference is the only part you actually wanted back. So a set can carry one
 * verdict, written in the minute you still know it:
 *
 * - `up`    go heavier next time
 * - `down`  go lighter next time
 * - `ok`    this was the weight
 * - `note`  the words are the point
 *
 * One per set or none — they contradict each other, so there is nothing to
 * gain from letting two stand. The words are *not* tied to `note` though: any
 * mark can carry them, and `note` is simply what you pick when there is no
 * arrow to draw. Typing words with no mark chosen makes it `note`, and
 * clearing the mark clears the words, so "nothing to say" is one state rather
 * than three.
 *
 * A mark is only worth writing because it comes back: `finishSession` files it
 * beside the numbers in `lastMarks`, and the next session hangs it on the row
 * as `prevMark` — next to the "last time" ghost, which is where the decision
 * it was written for actually gets made.
 */
export type SetMark = 'up' | 'down' | 'ok' | 'note';

/** Every mark, in picker order. */
export const SET_MARKS = ['up', 'down', 'ok', 'note'] as const satisfies readonly SetMark[];

export const isSetMark = (v: unknown): v is SetMark =>
  typeof v === 'string' && (SET_MARKS as readonly string[]).includes(v);

/** A mark as it travels forward: the verdict, plus whatever was typed with it. */
export type MarkNote = { mark: SetMark; note?: string };

export type Exercise = {
  id: string;
  /** Canonical name — the seed library is language-neutral gym vocabulary. */
  name: string;
  /** Per-language names for user-created exercises. Seed entries have none. */
  names?: LangMap;
  /** Key into the user's muscle-group list. */
  group: string;
  /** Key into the user's equipment list. */
  kind: string;
  /** What a set of this is made of. Absent means `load` — see `Measure`. */
  measure?: Measure;
  /** Heaviest working weight last time, in kg. 0 for bodyweight. */
  last: number;
  lastSets: string[];
};

/** Absent means `load`, so nothing that predates `Measure` has to be touched. */
export const measureOf = (e: Exercise | undefined): Measure => e?.measure ?? 'load';

/* ── workout style ─────────────────────────────────────────────────────────
 *
 * What onboarding asks so the lists can lead with the right half of the
 * library. A style is an *ordering*, never a filter — everything stays
 * reachable — and it is derived from facts the library already records
 * rather than tagged on: a bodyweight movement is calisthenics, the Cardio
 * group is cardio, everything else is strength. `mixed` means "don't sort".
 */
export type StyleKey = 'strength' | 'calisthenics' | 'cardio' | 'mixed';

export const STYLE_KEYS: readonly StyleKey[] = ['strength', 'calisthenics', 'cardio', 'mixed'];

export const isStyleKey = (v: unknown): v is StyleKey =>
  typeof v === 'string' && (STYLE_KEYS as readonly string[]).includes(v);

export const styleOf = (e: Exercise): Exclude<StyleKey, 'mixed'> =>
  e.group === 'Cardio' ? 'cardio' : e.kind === 'Bodyweight' ? 'calisthenics' : 'strength';

/** Whether this exercise leads under the given style. `mixed` matches all. */
export const inStyle = (e: Exercise, s: StyleKey) => s === 'mixed' || styleOf(e) === s;

/**
 * How much of a routine is the given style: the fraction of its lines that
 * are. A full-body day that ends on a plank is a little bit calisthenics —
 * it should *appear* under the style, but rank under the routines that are
 * nothing else. `mixed` scores everything alike.
 */
export const routineStyleScore = (
  r: Routine,
  s: StyleKey,
  ex: (id: string) => Exercise | undefined
): number => {
  if (s === 'mixed') return 1;
  if (!r.items.length) return 0;
  const hits = r.items.filter((it) => { const e = ex(it.ex); return e && inStyle(e, s); });
  return hits.length / r.items.length;
};

/** Whether a routine leads under a style at all: any of its exercises do. */
export const routineInStyle = (
  r: Routine,
  s: StyleKey,
  ex: (id: string) => Exercise | undefined
) => routineStyleScore(r, s, ex) > 0;

/**
 * A flat exercise list in style order: what you train first, everything else
 * after, nothing hidden — sort is stable, so both halves keep the order they
 * arrived in. `mixed` returns the list untouched: "don't sort it" is the
 * option's whole promise, and it is also what every phone that never answered
 * the style question has.
 */
export const styleFirst = (list: Exercise[], s: StyleKey): Exercise[] =>
  s === 'mixed'
    ? list
    : [...list].sort((a, b) => Number(inStyle(b, s)) - Number(inStyle(a, s)));

export const EX: Exercise[] = [
  { id: 'bench', name: 'Bench Press', group: 'Chest', kind: 'Barbell', last: 70, lastSets: ['70 × 8', '70 × 8', '70 × 7', '65 × 8'] },
  { id: 'incline', name: 'Incline Dumbbell Press', group: 'Chest', kind: 'Dumbbell', last: 24, lastSets: ['24 × 10', '24 × 9', '22 × 10'] },
  { id: 'chestpress', name: 'Chest Press', group: 'Chest', kind: 'Machine', last: 60, lastSets: ['60 × 10', '60 × 10', '60 × 9'] },
  { id: 'pec', name: 'Pec Deck', group: 'Chest', kind: 'Machine', last: 45, lastSets: ['45 × 12', '45 × 12', '45 × 10'] },
  { id: 'fly', name: 'Cable Fly', group: 'Chest', kind: 'Cable', last: 15, lastSets: ['15 × 12', '15 × 12', '15 × 11'] },
  { id: 'pushup', name: 'Push-up', group: 'Chest', kind: 'Bodyweight', last: 0, lastSets: ['BW × 20', 'BW × 18', 'BW × 15'] },
  { id: 'lat', name: 'Lat Pulldown', group: 'Lats', kind: 'Cable', last: 52.5, lastSets: ['52.5 × 10', '52.5 × 10', '50 × 10'] },
  { id: 'row', name: 'Seated Row', group: 'Back', kind: 'Cable', last: 47.5, lastSets: ['47.5 × 10', '47.5 × 10', '45 × 11'] },
  { id: 'bbrow', name: 'Barbell Row', group: 'Back', kind: 'Barbell', last: 60, lastSets: ['60 × 8', '60 × 8', '60 × 8', '55 × 9'] },
  { id: 'pullup', name: 'Pull-up', group: 'Back', kind: 'Bodyweight', last: 0, lastSets: ['BW × 8', 'BW × 7', 'BW × 6', 'BW × 5'] },
  { id: 'sapd', name: 'Straight-arm Pulldown', group: 'Lats', kind: 'Cable', last: 25, lastSets: ['25 × 12', '25 × 12', '22.5 × 12'] },
  // Filed under the muscle it trains, not the machine it shares: the reverse
  // pec deck is a rear-delt movement that happens to sit on a chest frame.
  { id: 'rear', name: 'Reverse Pec Deck', group: 'Shoulders', kind: 'Machine', last: 35, lastSets: ['35 × 12', '35 × 12', '32.5 × 12'] },
  { id: 'lateral', name: 'Lateral Raise', group: 'Shoulders', kind: 'Dumbbell', last: 10, lastSets: ['10 × 15', '10 × 13', '10 × 12'] },
  { id: 'curl', name: 'Bicep Curl', group: 'Biceps', kind: 'Dumbbell', last: 14, lastSets: ['14 × 12', '14 × 11', '12 × 12'] },
  { id: 'tri', name: 'Triceps Pushdown', group: 'Triceps', kind: 'Cable', last: 27.5, lastSets: ['27.5 × 12', '27.5 × 12', '25 × 12'] },

  /* ── legs ────────────────────────────────────────────────────────────────
   *
   * The seed library was chest, back and arms — a whole half of the body the
   * app could not log. `Quads`, `Hamstrings`, `Glutes`, `Adductors`, `Calves`
   * and `LowerBack` were already in DEFAULT_GROUPS from the v3 widening, so
   * these only needed the exercises.
   *
   * The weights sit where they do relative to the bench at 70 — one person's
   * ratios, but plausible ones, and onboarding's level scales the lot.
   */
  { id: 'squat', name: 'Back Squat', group: 'Quads', kind: 'Barbell', last: 80, lastSets: ['80 × 8', '80 × 8', '80 × 7', '75 × 8'] },
  { id: 'frontsquat', name: 'Front Squat', group: 'Quads', kind: 'Barbell', last: 55, lastSets: ['55 × 8', '55 × 8', '52.5 × 8'] },
  { id: 'deadlift', name: 'Deadlift', group: 'LowerBack', kind: 'Barbell', last: 100, lastSets: ['100 × 5', '100 × 5', '95 × 6'] },
  { id: 'rdl', name: 'Romanian Deadlift', group: 'Hamstrings', kind: 'Barbell', last: 70, lastSets: ['70 × 10', '70 × 10', '65 × 10'] },
  { id: 'hipthrust', name: 'Hip Thrust', group: 'Glutes', kind: 'Barbell', last: 80, lastSets: ['80 × 10', '80 × 10', '70 × 12'] },
  { id: 'legpress', name: 'Leg Press', group: 'Quads', kind: 'Machine', last: 140, lastSets: ['140 × 12', '140 × 12', '130 × 12'] },
  { id: 'legext', name: 'Leg Extension', group: 'Quads', kind: 'Machine', last: 50, lastSets: ['50 × 12', '50 × 12', '45 × 12'] },
  { id: 'legcurl', name: 'Leg Curl', group: 'Hamstrings', kind: 'Machine', last: 45, lastSets: ['45 × 12', '45 × 12', '40 × 12'] },
  { id: 'hipadd', name: 'Hip Adduction', group: 'Adductors', kind: 'Machine', last: 45, lastSets: ['45 × 15', '45 × 15', '40 × 15'] },
  { id: 'calfmach', name: 'Standing Calf Raise', group: 'Calves', kind: 'Machine', last: 60, lastSets: ['60 × 15', '60 × 15', '55 × 15'] },
  { id: 'lunge', name: 'Walking Lunge', group: 'Quads', kind: 'Dumbbell', last: 16, lastSets: ['16 × 12', '16 × 12', '14 × 12'] },

  /* ── calisthenics ────────────────────────────────────────────────────────
   *
   * Push-up and Pull-up were already here — they were the entire bodyweight
   * library, which is why "calisthenics" was not something the app could
   * honestly offer. These fill it out: a push, a pull and a leg movement for
   * every level, then the holds.
   *
   * `last: 0` is not a placeholder — it is what makes the row read BW. The
   * seeded `lastSets` are a plausible first session rather than anyone's real
   * numbers, and they are what onboarding's experience level scales.
   */
  { id: 'dip', name: 'Dip', group: 'Triceps', kind: 'Bodyweight', last: 0, lastSets: ['BW × 10', 'BW × 8', 'BW × 7'] },
  { id: 'pikepush', name: 'Pike Push-up', group: 'Shoulders', kind: 'Bodyweight', last: 0, lastSets: ['BW × 10', 'BW × 9', 'BW × 8'] },
  { id: 'diamond', name: 'Diamond Push-up', group: 'Triceps', kind: 'Bodyweight', last: 0, lastSets: ['BW × 12', 'BW × 10', 'BW × 9'] },
  { id: 'chinup', name: 'Chin-up', group: 'Biceps', kind: 'Bodyweight', last: 0, lastSets: ['BW × 8', 'BW × 7', 'BW × 6'] },
  { id: 'invrow', name: 'Inverted Row', group: 'Back', kind: 'Bodyweight', last: 0, lastSets: ['BW × 12', 'BW × 11', 'BW × 10'] },
  { id: 'airsquat', name: 'Air Squat', group: 'Quads', kind: 'Bodyweight', last: 0, lastSets: ['BW × 20', 'BW × 20', 'BW × 18'] },
  { id: 'splitsq', name: 'Bulgarian Split Squat', group: 'Quads', kind: 'Bodyweight', last: 0, lastSets: ['BW × 12', 'BW × 10', 'BW × 10'] },
  { id: 'nordic', name: 'Nordic Curl', group: 'Hamstrings', kind: 'Bodyweight', last: 0, lastSets: ['BW × 6', 'BW × 5', 'BW × 4'] },
  { id: 'bridge', name: 'Glute Bridge', group: 'Glutes', kind: 'Bodyweight', last: 0, lastSets: ['BW × 15', 'BW × 15', 'BW × 12'] },
  { id: 'calfbw', name: 'Calf Raise', group: 'Calves', kind: 'Bodyweight', last: 0, lastSets: ['BW × 20', 'BW × 18', 'BW × 15'] },
  { id: 'kneeraise', name: 'Hanging Knee Raise', group: 'Core', kind: 'Bodyweight', last: 0, lastSets: ['BW × 12', 'BW × 10', 'BW × 9'] },

  // Holds. The right-hand number is seconds, so these are the reason
  // `Measure` exists at all — 45 in a column headed "reps" is a lie.
  { id: 'plank', name: 'Plank', group: 'Core', kind: 'Bodyweight', measure: 'time', last: 0, lastSets: ['BW × 60', 'BW × 50', 'BW × 45'] },
  { id: 'sideplank', name: 'Side Plank', group: 'Obliques', kind: 'Bodyweight', measure: 'time', last: 0, lastSets: ['BW × 45', 'BW × 40', 'BW × 35'] },
  { id: 'hollow', name: 'Hollow Hold', group: 'Core', kind: 'Bodyweight', measure: 'time', last: 0, lastSets: ['BW × 40', 'BW × 35', 'BW × 30'] },
  { id: 'deadhang', name: 'Dead Hang', group: 'Forearms', kind: 'Bodyweight', measure: 'time', last: 0, lastSets: ['BW × 45', 'BW × 40', 'BW × 30'] },
  { id: 'handstand', name: 'Handstand Hold', group: 'Shoulders', kind: 'Bodyweight', measure: 'time', last: 0, lastSets: ['BW × 30', 'BW × 25', 'BW × 20'] },
  { id: 'lsit', name: 'L-sit', group: 'Core', kind: 'Bodyweight', measure: 'time', last: 0, lastSets: ['BW × 20', 'BW × 18', 'BW × 15'] },
  { id: 'wallsit', name: 'Wall Sit', group: 'Quads', kind: 'Bodyweight', measure: 'time', last: 0, lastSets: ['BW × 60', 'BW × 50', 'BW × 45'] },

  /* ── cardio ──────────────────────────────────────────────────────────────
   *
   * `Cardio` was already in DEFAULT_GROUPS — the group list was widened ahead
   * of the exercises. No new equipment kinds were needed: an erg, a bike and a
   * treadmill are Machines, and you run in your own body. That matters, because
   * `kinds` is persisted, so a new kind would need a migration to reach the
   * phones already logging.
   *
   * The left number is kilometres and may be blank — a jump-rope round has a
   * duration and no distance, and a dash is the honest way to say so.
   */
  { id: 'run', name: 'Run', group: 'Cardio', kind: 'Bodyweight', measure: 'distance', last: 0, lastSets: ['5 × 28'] },
  { id: 'intervalrun', name: 'Interval Run', group: 'Cardio', kind: 'Bodyweight', measure: 'distance', last: 0, lastSets: ['0.4 × 2', '0.4 × 2', '0.4 × 2', '0.4 × 2'] },
  { id: 'walk', name: 'Walk', group: 'Cardio', kind: 'Bodyweight', measure: 'distance', last: 0, lastSets: ['4 × 45'] },
  { id: 'swim', name: 'Swim', group: 'Cardio', kind: 'Bodyweight', measure: 'distance', last: 0, lastSets: ['1 × 30'] },
  { id: 'rower', name: 'Rowing Machine', group: 'Cardio', kind: 'Machine', measure: 'distance', last: 0, lastSets: ['5 × 24'] },
  { id: 'bike', name: 'Stationary Bike', group: 'Cardio', kind: 'Machine', measure: 'distance', last: 0, lastSets: ['20 × 45'] },
  { id: 'elliptical', name: 'Elliptical', group: 'Cardio', kind: 'Machine', measure: 'distance', last: 0, lastSets: ['6 × 30'] },
  { id: 'stairs', name: 'Stair Climber', group: 'Cardio', kind: 'Machine', measure: 'distance', last: 0, lastSets: ['— × 15'] },
  { id: 'jumprope', name: 'Jump Rope', group: 'Cardio', kind: 'Bodyweight', measure: 'distance', last: 0, lastSets: ['— × 3', '— × 3', '— × 2'] },
];

/** A machine setting: [what to set, what to set it to]. */
export type SetupPair = [string, string];

export type ExerciseInfo = { setup: SetupPair[]; cues: string[] };

export const INFO: Record<string, ExerciseInfo> = {
  bench: { setup: [['Bar height', '3'], ['Bench', 'flat']], cues: ['Shoulder blades pinched, feet planted.', 'Bar to lower chest, elbows about 45°.'] },
  incline: { setup: [['Bench angle', '30°']], cues: ['Dumbbells over the collarbone at the top.', 'Stop at chest level, no bouncing.'] },
  chestpress: { setup: [['Seat', '4'], ['Handles', 'B']], cues: ['Handles level with mid-chest.', 'Do not lock the elbows out.'] },
  pec: { setup: [['Seat', '4'], ['Start position', '3']], cues: ['Elbows slightly bent, held there.', 'Squeeze one second at the front.'] },
  fly: { setup: [['Pulley height', '8'], ['Handles', 'single']], cues: ['Step forward so the cables stay loaded.', 'Arc the hands, do not press.'] },
  pushup: { setup: [], cues: ['Hands under the shoulders.', 'Body in one line, ribs down.'] },
  lat: { setup: [['Seat', '3'], ['Thigh pad', '4'], ['Bar', 'wide']], cues: ['Chest up, bar to the collarbone.', 'Lead with the elbows, not the hands.'] },
  row: { setup: [['Seat', '3'], ['Foot plate', '2']], cues: ['Back stays still, only the arms move.', 'Pull to the navel, pause.'] },
  bbrow: { setup: [['Rack pin height', '2']], cues: ['Torso about 45°, back flat.', 'Bar to the belly, control it down.'] },
  pullup: { setup: [['Bar', 'high'], ['Step box', '1']], cues: ['Full hang at the bottom.', 'Chin over the bar, no kipping.'] },
  sapd: { setup: [['Pulley height', '10']], cues: ['Arms straight the whole way.', 'Bar to the thighs, lats do the work.'] },
  rear: { setup: [['Seat', '4'], ['Arms', 'wide']], cues: ['Thumbs up, elbows soft.', 'Stop when the arms are in line with the shoulders.'] },
  lateral: { setup: [], cues: ['Lead with the elbows.', 'Stop at shoulder height.'] },
  curl: { setup: [], cues: ['Elbows pinned to the ribs.', 'No swing from the hips.'] },
  tri: { setup: [['Pulley height', '10'], ['Attachment', 'rope']], cues: ['Elbows stay at the sides.', 'Spread the rope at the bottom.'] },

  /* legs */
  squat: { setup: [['Rack pin height', '7'], ['Safety bars', '4']], cues: ['Bar on the rear delts, elbows down.', 'Hip crease below the knee, knees tracking the toes.'] },
  frontsquat: { setup: [['Rack pin height', '7']], cues: ['Elbows high, bar resting on the shoulders.', 'Stay upright — the bar drops the moment you lean.'] },
  deadlift: { setup: [['Plates', '20 kg — bar at knee height']], cues: ['Bar over mid-foot, shoulders just past it.', 'Push the floor away; the bar drags up the shins.'] },
  rdl: { setup: [['Rack pin height', '9']], cues: ['Soft knees, hinge from the hip.', 'Stop where the hamstrings stop, not where the floor is.'] },
  hipthrust: { setup: [['Bench height', 'knee'], ['Pad', 'thick']], cues: ['Shoulder blades on the bench edge.', 'Ribs down, chin tucked, squeeze at the top.'] },
  legpress: { setup: [['Seat', '3'], ['Back angle', '2']], cues: ['Feet mid-platform, shoulder width.', 'Knees to about 90° — do not let the hips curl up.'] },
  legext: { setup: [['Seat', '4'], ['Pad', '5']], cues: ['Pad on the shin, not the foot.', 'Pause a second at the top.'] },
  legcurl: { setup: [['Seat', '3'], ['Pad', '4']], cues: ['Hips flat on the pad.', 'Control the way back down.'] },
  hipadd: { setup: [['Start width', '3']], cues: ['Sit tall, squeeze the knees together.', 'Let it open slowly.'] },
  calfmach: { setup: [['Shoulder pad', '5']], cues: ['Balls of the feet on the edge.', 'Full stretch at the bottom, pause at the top.'] },
  lunge: { setup: [], cues: ['Long step, back knee to just off the floor.', 'Torso upright the whole way.'] },

  /* calisthenics */
  dip: { setup: [['Bar width', 'shoulder']], cues: ['Lean forward for chest, upright for triceps.', 'Stop when the upper arm is level.'] },
  pikepush: { setup: [], cues: ['Hips high, head between the hands.', 'Crown of the head to the floor.'] },
  diamond: { setup: [], cues: ['Index fingers and thumbs touching.', 'Elbows brush the ribs on the way down.'] },
  chinup: { setup: [['Bar', 'high'], ['Step box', '1']], cues: ['Palms toward you, hands shoulder width.', 'Full hang at the bottom, chin over the bar.'] },
  invrow: { setup: [['Bar height', 'hip']], cues: ['Body in one line from heel to head.', 'Chest to the bar, pause there.'] },
  airsquat: { setup: [], cues: ['Feet shoulder width, toes slightly out.', 'Hip crease below the knee, chest up.'] },
  splitsq: { setup: [['Bench height', 'knee']], cues: ['Back foot on the bench, front shin vertical.', 'Down until the back knee nearly touches.'] },
  nordic: { setup: [], cues: ['Ankles anchored, hips locked straight.', 'Lower as slowly as you can, push back up.'] },
  bridge: { setup: [], cues: ['Heels close to the hips.', 'Squeeze at the top, ribs down.'] },
  calfbw: { setup: [['Step', 'edge']], cues: ['Full stretch at the bottom.', 'Pause a second at the top.'] },
  kneeraise: { setup: [['Bar', 'high']], cues: ['No swing — start from a dead hang.', 'Knees to the chest, curl the hips up.'] },

  plank: { setup: [], cues: ['Elbows under the shoulders.', 'Ribs down, glutes on, one straight line.'] },
  sideplank: { setup: [], cues: ['Elbow under the shoulder, hips stacked.', 'Push the bottom hip up, not forward.'] },
  hollow: { setup: [], cues: ['Lower back pressed into the floor.', 'Lower the arms and legs only as far as that holds.'] },
  deadhang: { setup: [['Bar', 'high']], cues: ['Shoulders active, not shrugged to the ears.', 'Relax everything else and breathe.'] },
  handstand: { setup: [['Wall', 'chest-to-wall']], cues: ['Fingers spread, push the floor away.', 'Ribs down — no banana back.'] },
  lsit: { setup: [['Parallettes', 'low']], cues: ['Shoulders pushed down, arms locked.', 'Legs straight and level — tuck them if not.'] },
  wallsit: { setup: [], cues: ['Thighs parallel to the floor.', 'Back flat on the wall, weight in the heels.'] },

  /* cardio — setup pairs are the machine's own console */
  run: { setup: [], cues: ['Easy means you can still hold a conversation.', 'Land under the hip, short quick steps.'] },
  intervalrun: { setup: [], cues: ['Hard for the distance, then walk until the breath is back.', 'Even pace across every rep beats a fast first one.'] },
  walk: { setup: [], cues: ['Brisk enough that talking takes effort.'] },
  swim: { setup: [['Lane', 'medium']], cues: ['Exhale into the water the whole time your face is in it.', 'Count strokes per length — fewer is better than faster.'] },
  rower: { setup: [['Damper', '4'], ['Foot strap', '3']], cues: ['Legs, then back, then arms. Reverse it coming forward.', 'Chain stays level the whole stroke.'] },
  bike: { setup: [['Seat height', '7'], ['Resistance', '6']], cues: ['Seat so the knee stays slightly bent at the bottom.', 'Zone 2 is nose-breathing pace.'] },
  elliptical: { setup: [['Resistance', '6'], ['Incline', '4']], cues: ['Stand tall, let the handles follow the legs.'] },
  stairs: { setup: [['Level', '8']], cues: ['Stand up off the rails — they are for balance, not weight.', 'Whole foot on the step.'] },
  jumprope: { setup: [['Rope length', 'armpit']], cues: ['Turn from the wrists, not the shoulders.', 'Jump just high enough to clear the rope.'] },
};

/**
 * One line of a routine. `reps` and `w` are read through the exercise's
 * `Measure`, exactly as a logged set is: reps is seconds for a `time`
 * exercise and minutes for a `distance` one, and `w` is kilometres rather
 * than kilos on the latter. Nothing about the shape changes, which is why
 * cardio needed no new routine model.
 *
 * `planned` is what separates a number somebody chose from the one the picker
 * filled in when the row was added. Only a chosen one reaches the session —
 * see `sessionFrom` in the store. Absent means "just the default", so nothing
 * already on a phone has to be touched, and the seeded routines below stay
 * unmarked on purpose: their figures are the design's, not this user's.
 */
export type RoutineItem = { ex: string; sets: number; reps: number; w: number; planned?: true };
export type Routine = { id: string; names: LangMap; items: RoutineItem[] };

export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'chest',
    names: { en: 'Chest A', de: 'Brust A' },
    items: [
      { ex: 'bench', sets: 4, reps: 8, w: 70 },
      { ex: 'incline', sets: 3, reps: 10, w: 24 },
      { ex: 'fly', sets: 3, reps: 12, w: 15 },
      { ex: 'tri', sets: 3, reps: 12, w: 27.5 },
    ],
  },
  {
    id: 'back',
    names: { en: 'Back A', de: 'Rücken A' },
    items: [
      { ex: 'pullup', sets: 4, reps: 8, w: 0 },
      { ex: 'bbrow', sets: 4, reps: 8, w: 60 },
      { ex: 'lat', sets: 3, reps: 10, w: 52.5 },
      { ex: 'curl', sets: 3, reps: 12, w: 14 },
    ],
  },
  {
    id: 'both',
    names: { en: 'Chest & Back', de: 'Brust & Rücken' },
    items: [
      { ex: 'bench', sets: 4, reps: 8, w: 70 },
      { ex: 'lat', sets: 4, reps: 10, w: 52.5 },
      { ex: 'incline', sets: 3, reps: 10, w: 24 },
      { ex: 'row', sets: 3, reps: 10, w: 47.5 },
      { ex: 'pec', sets: 3, reps: 12, w: 45 },
    ],
  },

  {
    id: 'legsA',
    names: { en: 'Legs A', de: 'Beine A' },
    items: [
      { ex: 'squat', sets: 4, reps: 8, w: 80 },
      { ex: 'rdl', sets: 3, reps: 10, w: 70 },
      { ex: 'legpress', sets: 3, reps: 12, w: 140 },
      { ex: 'calfmach', sets: 3, reps: 15, w: 60 },
    ],
  },
  {
    id: 'legsB',
    names: { en: 'Legs B', de: 'Beine B' },
    items: [
      { ex: 'deadlift', sets: 4, reps: 5, w: 100 },
      { ex: 'frontsquat', sets: 3, reps: 8, w: 55 },
      { ex: 'legcurl', sets: 3, reps: 12, w: 45 },
      { ex: 'hipthrust', sets: 3, reps: 10, w: 80 },
    ],
  },
  {
    id: 'fullA',
    names: { en: 'Full Body A', de: 'Ganzkörper A' },
    items: [
      { ex: 'squat', sets: 4, reps: 8, w: 80 },
      { ex: 'bench', sets: 4, reps: 8, w: 70 },
      { ex: 'bbrow', sets: 3, reps: 10, w: 60 },
      { ex: 'lateral', sets: 3, reps: 15, w: 10 },
      { ex: 'plank', sets: 3, reps: 45, w: 0 },
    ],
  },

  /* ── calisthenics ─────────────────────────────────────────────────────── */
  {
    id: 'bwpush',
    names: { en: 'Push · no kit', de: 'Drücken · ohne Geräte' },
    items: [
      { ex: 'pushup', sets: 4, reps: 12, w: 0 },
      { ex: 'dip', sets: 3, reps: 8, w: 0 },
      { ex: 'pikepush', sets: 3, reps: 8, w: 0 },
      { ex: 'diamond', sets: 3, reps: 10, w: 0 },
    ],
  },
  {
    id: 'bwpull',
    names: { en: 'Pull & core', de: 'Ziehen & Rumpf' },
    items: [
      { ex: 'pullup', sets: 4, reps: 6, w: 0 },
      { ex: 'invrow', sets: 3, reps: 10, w: 0 },
      { ex: 'kneeraise', sets: 3, reps: 12, w: 0 },
      { ex: 'deadhang', sets: 3, reps: 45, w: 0 },
    ],
  },
  {
    id: 'bwlegs',
    names: { en: 'Legs · no kit', de: 'Beine · ohne Geräte' },
    items: [
      { ex: 'airsquat', sets: 4, reps: 20, w: 0 },
      { ex: 'splitsq', sets: 3, reps: 12, w: 0 },
      { ex: 'nordic', sets: 3, reps: 6, w: 0 },
      { ex: 'calfbw', sets: 3, reps: 20, w: 0 },
    ],
  },
  {
    id: 'bwfull',
    names: { en: 'Full body · no kit', de: 'Ganzkörper · ohne Geräte' },
    items: [
      { ex: 'pushup', sets: 3, reps: 15, w: 0 },
      { ex: 'airsquat', sets: 3, reps: 20, w: 0 },
      { ex: 'invrow', sets: 3, reps: 10, w: 0 },
      { ex: 'plank', sets: 3, reps: 45, w: 0 },
      { ex: 'hollow', sets: 3, reps: 30, w: 0 },
    ],
  },
  {
    id: 'bwskill',
    names: { en: 'Skill work', de: 'Skill-Training' },
    items: [
      { ex: 'handstand', sets: 5, reps: 30, w: 0 },
      { ex: 'lsit', sets: 4, reps: 20, w: 0 },
      { ex: 'deadhang', sets: 3, reps: 45, w: 0 },
    ],
  },

  /* ── cardio ───────────────────────────────────────────────────────────── */
  {
    id: 'easyrun',
    names: { en: 'Easy run', de: 'Lockerer Lauf' },
    items: [{ ex: 'run', sets: 1, reps: 30, w: 5 }],
  },
  {
    id: 'intervals',
    names: { en: 'Intervals', de: 'Intervalle' },
    items: [
      { ex: 'run', sets: 1, reps: 10, w: 1.5 },
      { ex: 'intervalrun', sets: 8, reps: 2, w: 0.4 },
    ],
  },
  {
    id: 'row5k',
    names: { en: 'Row 5k', de: 'Rudern 5 km' },
    items: [{ ex: 'rower', sets: 1, reps: 25, w: 5 }],
  },
  {
    id: 'ride',
    names: { en: 'Ride · steady', de: 'Radfahren · gleichmäßig' },
    items: [{ ex: 'bike', sets: 1, reps: 45, w: 20 }],
  },
];

/* ── experience level ──────────────────────────────────────────────────────
 *
 * What onboarding asks so the seeded numbers are not simply somebody else's.
 * A routine's authored numbers are the `regular` case — they are what the
 * exercise's own `lastSets` say — and the other two levels scale down from
 * there.
 *
 * One multiplier does every measure because each one scales in the direction
 * that keeps the set honest: a loaded lift gives up weight and holds its reps,
 * a bodyweight one gives up reps because there is no weight to give, a hold
 * gives up seconds and a run gives up both distance and time. New also caps
 * the set count — the thing a first month actually needs is to come back on
 * Thursday, not a fourth set.
 *
 * These are a starting point with a one-session shelf life. The moment
 * anything is logged, `lastLog` takes over and the guess is never read again.
 */
export type Level = 'new' | 'some' | 'regular';

const LEVEL_SCALE: Record<Level, number> = { new: 0.5, some: 0.75, regular: 1 };

/** Round to a step the gym actually has, never below one step. */
const toStep = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

export function scaleItem(item: RoutineItem, measure: Measure, level: Level): RoutineItem {
  const k = LEVEL_SCALE[level];
  if (k === 1) return { ...item };
  const sets = level === 'new' ? Math.min(item.sets, 3) : item.sets;

  if (measure === 'distance')
    return {
      ...item,
      sets,
      // A blank distance stays blank — scaling an unknown invents one.
      w: item.w ? toStep(item.w * k, 0.5) : 0,
      reps: toStep(item.reps * k, 1),
    };

  if (measure === 'time') return { ...item, sets, reps: toStep(item.reps * k, 5) };

  // Loaded lifts drop the weight to the nearest real plate jump; bodyweight
  // ones have no weight to drop, so the reps come down instead.
  return item.w
    ? { ...item, sets, w: toStep(item.w * k, 2.5) }
    : { ...item, sets, reps: toStep(item.reps * k, 1) };
}

/**
 * Both languages seeded, so switching language translates the defaults.
 *
 * Ordered head to toe, the way a body is read rather than the way a gym is
 * laid out: push, pull, the arms that serve both, the middle, then legs, with
 * the two that aren't muscles at all — and the catch-all — last. `Other` stays
 * on the list because anything filed under a key that isn't here renders as
 * the raw key, so removing it would strand exercises rather than tidy them.
 */
export const DEFAULT_GROUPS: { key: string; labels: LangMap }[] = [
  { key: 'Chest', labels: { en: 'Chest', de: 'Brust' } },
  { key: 'Back', labels: { en: 'Back', de: 'Rücken' } },
  { key: 'Lats', labels: { en: 'Lats', de: 'Latissimus' } },
  { key: 'Traps', labels: { en: 'Traps', de: 'Trapez' } },
  { key: 'LowerBack', labels: { en: 'Lower back', de: 'Unterer Rücken' } },
  { key: 'Shoulders', labels: { en: 'Shoulders', de: 'Schultern' } },
  { key: 'Neck', labels: { en: 'Neck', de: 'Nacken' } },
  { key: 'Biceps', labels: { en: 'Biceps', de: 'Bizeps' } },
  { key: 'Triceps', labels: { en: 'Triceps', de: 'Trizeps' } },
  { key: 'Forearms', labels: { en: 'Forearms', de: 'Unterarme' } },
  { key: 'Core', labels: { en: 'Core', de: 'Rumpf' } },
  { key: 'Obliques', labels: { en: 'Obliques', de: 'Schräge Bauchmuskeln' } },
  { key: 'Quads', labels: { en: 'Quads', de: 'Quadrizeps' } },
  { key: 'Hamstrings', labels: { en: 'Hamstrings', de: 'Beinbeuger' } },
  { key: 'Glutes', labels: { en: 'Glutes', de: 'Gesäß' } },
  { key: 'Adductors', labels: { en: 'Adductors', de: 'Adduktoren' } },
  { key: 'Calves', labels: { en: 'Calves', de: 'Waden' } },
  { key: 'FullBody', labels: { en: 'Full body', de: 'Ganzkörper' } },
  { key: 'Cardio', labels: { en: 'Cardio', de: 'Cardio' } },
  { key: 'Other', labels: { en: 'Other', de: 'Sonstiges' } },
];

/**
 * What `DEFAULT_GROUPS` held before the list was widened. The v2 → v3
 * migration adds only the keys that aren't in here, so a group someone
 * deleted on purpose stays deleted.
 */
export const V2_GROUP_KEYS = ['Chest', 'Back', 'Other'];

export const DEFAULT_KINDS: { key: string; labels: LangMap }[] = [
  { key: 'Barbell', labels: { en: 'Barbell', de: 'Langhantel' } },
  { key: 'Dumbbell', labels: { en: 'Dumbbell', de: 'Kurzhantel' } },
  { key: 'Machine', labels: { en: 'Machine', de: 'Maschine' } },
  { key: 'Cable', labels: { en: 'Cable', de: 'Kabelzug' } },
  { key: 'Bodyweight', labels: { en: 'Bodyweight', de: 'Körpergewicht' } },
];

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Bottom-bar tabs, with the design's own icon paths. */
export const TABS = [
  {
    id: 'today',
    label: 'Today',
    d: 'M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6M3.5 10.4l8-7.3a1 1 0 0 1 1.3 0l8 7.3a1 1 0 0 1 .3.7V20a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1v-8.9a1 1 0 0 1 .3-.7Z',
  },
  { id: 'routines', label: 'Routines', d: 'M9.5 6.5h11M9.5 12h11M9.5 17.5h11M4.2 6.5h.01M4.2 12h.01M4.2 17.5h.01' },
  { id: 'library', label: 'Exercises', d: 'M6.5 8.5v7M17.5 8.5v7M3.5 10.5v3M20.5 10.5v3M6.5 12h11' },
  { id: 'you', label: 'Profile', d: 'M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3.8 20.2a9 9 0 0 1 16.4 0' },
] as const;

export type TabId = (typeof TABS)[number]['id'];
