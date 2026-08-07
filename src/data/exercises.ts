/** Exercise library and per-exercise instructions. Ported from the design's EX / INFO. */
import { LangMap } from './i18n';

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
  /** Heaviest working weight last time, in kg. 0 for bodyweight. */
  last: number;
  lastSets: string[];
};

export const EX: Exercise[] = [
  { id: 'bench', name: 'Bench Press', group: 'Chest', kind: 'Barbell', last: 70, lastSets: ['70 × 8', '70 × 8', '70 × 7', '65 × 8'] },
  { id: 'incline', name: 'Incline Dumbbell Press', group: 'Chest', kind: 'Dumbbell', last: 24, lastSets: ['24 × 10', '24 × 9', '22 × 10'] },
  { id: 'chestpress', name: 'Chest Press', group: 'Chest', kind: 'Machine', last: 60, lastSets: ['60 × 10', '60 × 10', '60 × 9'] },
  { id: 'pec', name: 'Pec Deck', group: 'Chest', kind: 'Machine', last: 45, lastSets: ['45 × 12', '45 × 12', '45 × 10'] },
  { id: 'fly', name: 'Cable Fly', group: 'Chest', kind: 'Cable', last: 15, lastSets: ['15 × 12', '15 × 12', '15 × 11'] },
  { id: 'pushup', name: 'Push-up', group: 'Chest', kind: 'Bodyweight', last: 0, lastSets: ['BW × 20', 'BW × 18', 'BW × 15'] },
  { id: 'lat', name: 'Lat Pulldown', group: 'Back', kind: 'Cable', last: 52.5, lastSets: ['52.5 × 10', '52.5 × 10', '50 × 10'] },
  { id: 'row', name: 'Seated Row', group: 'Back', kind: 'Cable', last: 47.5, lastSets: ['47.5 × 10', '47.5 × 10', '45 × 11'] },
  { id: 'bbrow', name: 'Barbell Row', group: 'Back', kind: 'Barbell', last: 60, lastSets: ['60 × 8', '60 × 8', '60 × 8', '55 × 9'] },
  { id: 'pullup', name: 'Pull-up', group: 'Back', kind: 'Bodyweight', last: 0, lastSets: ['BW × 8', 'BW × 7', 'BW × 6', 'BW × 5'] },
  { id: 'sapd', name: 'Straight-arm Pulldown', group: 'Back', kind: 'Cable', last: 25, lastSets: ['25 × 12', '25 × 12', '22.5 × 12'] },
  { id: 'rear', name: 'Reverse Pec Deck', group: 'Back', kind: 'Machine', last: 35, lastSets: ['35 × 12', '35 × 12', '32.5 × 12'] },
  { id: 'lateral', name: 'Lateral Raise', group: 'Other', kind: 'Dumbbell', last: 10, lastSets: ['10 × 15', '10 × 13', '10 × 12'] },
  { id: 'curl', name: 'Bicep Curl', group: 'Other', kind: 'Dumbbell', last: 14, lastSets: ['14 × 12', '14 × 11', '12 × 12'] },
  { id: 'tri', name: 'Triceps Pushdown', group: 'Other', kind: 'Cable', last: 27.5, lastSets: ['27.5 × 12', '27.5 × 12', '25 × 12'] },
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
};

export type RoutineItem = { ex: string; sets: number; reps: number; w: number };
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
];

/** Both languages seeded, so switching language translates the defaults. */
export const DEFAULT_GROUPS: { key: string; labels: LangMap }[] = [
  { key: 'Chest', labels: { en: 'Chest', de: 'Brust' } },
  { key: 'Back', labels: { en: 'Back', de: 'Rücken' } },
  { key: 'Other', labels: { en: 'Other', de: 'Sonstiges' } },
];

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
