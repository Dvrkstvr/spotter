/**
 * The app's single source of truth.
 *
 * This is a direct port of the design's `Component` class: the same state
 * shape, the same mutators, the same derived values. `patch()` stands in for
 * the class's `setState` — partial merge, optional updater function.
 *
 * The durable slice (see PERSIST below) is stored in AsyncStorage as one JSON
 * blob: hydrated once on launch, debounce-saved on every change. The design
 * itself was in-memory only; persistence and the real-date history are
 * deliberate departures from it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type {
  Bid,
  BuddyProgress,
  DraftPayload,
  FirstUp,
  FirstUpChoice,
  SessionInvite,
  SyncItem,
  TurnChoice,
  TurnMode,
} from '@/data/buddy-sync';
import type { BuddySnapshot } from '@/data/buddy-transport';
import { mergeFirstUp, mergeTurns, routineClosure } from '@/data/buddy-sync';
import { mondayISO, todayISO } from '@/data/date';
import { dlog } from '@/data/diag';
import { deviceInstallId, randomInstallId } from '@/data/identity';
import {
  anchorFor,
  asPlan,
  dropEntries,
  planFromSchedule,
  skip,
  unskip,
  type Plan,
  type Repeat,
} from '@/data/plan';
import {
  DEFAULT_GROUPS,
  DEFAULT_KINDS,
  DEFAULT_ROUTINES,
  blankOf,
  EX,
  Exercise,
  infoFor,
  isSingle,
  Level,
  MarkNote,
  Measure,
  measureOf,
  Routine,
  scaleItem,
  SetMark,
  SetupPair,
  StyleKey,
  V2_GROUP_KEYS,
} from '@/data/exercises';
import { DEFAULT_COACH, type CoachOptions, type ResolvedPlan } from '@/data/coach';
import { setCounts, stopsOf } from '@/data/superset';
import type { TipId, Tips } from '@/data/tips';
import { deviceLang, DICT, fmtDayLong, Lang, LangMap, Strings } from '@/data/i18n';
import { isThemeName, ThemeMode, ThemeName } from '@/design/tokens';

/* ── types ─────────────────────────────────────────────────────────────── */

export type LoggedSet = {
  w: string;
  reps: string;
  done: boolean;
  prev: string;
  /** This set's own verdict on the weight — see `SetMark`. */
  mark?: SetMark;
  /** The words that go with it. Any mark can carry them; none has to. */
  note?: string;
  /**
   * Last time's verdict for this row, denormalised beside `prev` for the same
   * reason `prev` itself is: the ghost and the mark describe one past set, and
   * copying them together at session build is what keeps them describing the
   * same one when a routine asks for more sets than last time had.
   */
  prevMark?: MarkNote | null;
  /**
   * This set continues the one above it — taken straight after, so the tick on
   * that one earns no rest. A drop set, and the only thing in the app that
   * writes one is the session: a drop is a decision about how *that* set went,
   * which is why nothing like it exists on `RoutineItem`. See
   * `data/superset.ts` for the rest rule both halves of this feature share.
   */
  link?: true;
};
/**
 * `with` is the routine's superset, carried through unchanged — the pair is
 * made in the editor and nowhere else. The list stays **flat**: a pair is two
 * entries that happen to be joined, so `progress.list`, `removeSessionEx`, the
 * overview and `totals` all keep reading a list of exercises and only the
 * screen groups them into stops.
 */
export type SessionExercise = { ex: string; sets: LoggedSet[]; with?: 'next' };
export type Session = { rid: string | null; name: string; list: SessionExercise[] };
export type Summary = {
  name: string;
  stats: { k: string; v: string | number }[];
  note: string;
  /**
   * Nothing was ticked, so nothing was logged — the modal drops the "Saved"
   * kicker, the stats and the confetti. A discarded session should read as a
   * quiet exit, not spend the payoff moment on a mistake.
   */
  empty: boolean;
  /**
   * The finished exercises, kept only when the session was freeform (no
   * routine) and non-empty — the summary modal offers to save them as a new
   * routine. Null otherwise; not part of the original design.
   */
  saveable: SessionExercise[] | null;
};
export type Labelled = { key: string; labels: LangMap };
/**
 * A name resolved for the current language. `missing` means the current
 * language has no entry and `text` is a fallback from the other one — shown
 * greyed as the cue that a translation is still wanted.
 */
export type Resolved = { text: string; missing: boolean };
export type Draft = { name: string; group: string; kind: string; measure: Measure };
/**
 * Collaboration metadata for a routine being built together with the buddy
 * (the routine itself lives in `routines` like any other). Structure — name,
 * exercise list, order, set counts — syncs both ways; reps and weight stay
 * per-person, with the buddy's shown read-only.
 */
export type CoDraft = {
  rid: string;
  /** the starter announces the draft with draftStart; both broadcast edits */
  role: 'starter' | 'joiner';
  /** local edit counter — <BuddyRadio> broadcasts the draft when it moves */
  rev: number;
  /** exercise id → display name of whoever added it */
  addedBy: Record<string, string>;
  /** the buddy's reps/weight per exercise id */
  buddyVals: Record<string, { reps: number; w: number }>;
  /** the buddy currently has the exercise picker open */
  buddyPicking: boolean;
};
export type Profile = { name: string; age: string; weight: string; height: string };
export type PickerMode = 'routine' | 'session' | null;
/** How the Routines tab orders your list. */
export type RoutineSort = 'week' | 'recent' | 'az';
/** What it is narrowed to: a family (see `routineFamily`) or your own makes. */
export type RoutineFilter = 'all' | 'strength' | 'calisthenics' | 'cardio' | 'yours';
/**
 * One exercise as it was actually logged: the ticked sets, in order.
 *
 * `marks` is index for index with `sets` — the same relationship `lastMarks`
 * has to `lastLog[id].sets`, and load-bearing for the same reason: a verdict
 * that slides one slot is a ▲ about a set that never earned it. It is optional
 * and absent when nothing was marked, so an entry logged before this keeps its
 * numbers and simply says nothing — which is the whole migration.
 *
 * What `lastMarks` cannot do is remember: it holds only the latest session per
 * exercise, so without this a note lives exactly one week and is then written
 * over. This is the copy that stays on the day it belongs to.
 *
 * `links` and `with` are the same arrangement for the other thing a set can
 * carry: which of these rows was a drop taken straight off the one before it,
 * and whether the exercise was supersetted with the next one. Both are what
 * keeps the day readable — 50 × 8 after 65 × 6 reads as a bad set unless the
 * record says the two were one effort — and both are optional and absent when
 * there is nothing to say, so every entry logged before them keeps its numbers.
 */
export type LoggedExercise = {
  ex: string;
  sets: string[];
  marks?: (MarkNote | null)[];
  links?: boolean[];
  with?: 'next';
};
/**
 * One finished session: which local day it landed on, from which routine, and
 * what was actually done.
 *
 * Everything past `rid` is optional, and that is the whole migration: a phone
 * that has been logging since before the day view existed keeps every entry it
 * has, and those days simply say so rather than inventing a set list. Nothing
 * about the stored shape changed for the two keys that were always there, so
 * this needs no `STORAGE_VERSION` bump.
 *
 * The sets are the same "70 × 8" strings `lastLog` and `prev` are written in —
 * one format for a logged set, read back through `prevNums` / `loggedLine` and
 * interpreted against the exercise's measure.
 */
export type HistoryEntry = {
  date: string;
  rid: string | null;
  /** What the session was called on the day — a routine renamed since doesn't rewrite it. */
  name?: string;
  /** Ticked sets per exercise, in session order. Exercises with none are left out. */
  list?: LoggedExercise[];
  /** Wall clock, in seconds. The one stat that can't be re-derived. */
  secs?: number;
  /** Load volume, as the summary counted it — see `totals`. */
  vol?: number;
  /** Who you trained with, if the session was shared. */
  buddy?: string;
};
/** The last logged numbers for one exercise, shown as the "last time" ghosts. */
export type LastLog = { date: string; sets: string[] };

/**
 * Everything the design keeps in `Component.state`, minus `tab` — which screen
 * is showing is the router's job here — and minus the HTML5 `drag` bookkeeping,
 * which `ReorderRows` owns as local gesture state.
 */
export type State = {
  routines: Routine[];
  /**
   * The schedule: dated rules plus cancelled occurrences — see `data/plan.ts`,
   * which owns the whole model and every question anyone asks of it. Replaces
   * v3's seven weekday slots, which is the shape change v4 migrates.
   */
  plan: Plan;
  routineOpen: string | null;
  exOpen: string | null;
  picker: PickerMode;
  session: Session | null;
  /** index into session.list of the exercise currently expanded */
  active: number;
  query: string;
  filter: string;
  elapsed: number;
  summary: Summary | null;
  /**
   * Every finished session, by real local date. Replaces the design's
   * `done: number[]` (days of a pinned August 2026), which stopped making
   * sense once "today" went live.
   */
  history: HistoryEntry[];
  /** last logged numbers per exercise id — real history behind "last time" */
  lastLog: Record<string, LastLog>;
  /**
   * Last session's verdicts per exercise id, index for index with
   * `lastLog[id].sets` — an unmarked set holds its place as a `null` so the
   * two arrays keep describing the same rows.
   *
   * A separate key rather than a richer `LastLog`, and deliberately: `PERSIST`
   * is additive, so a new key costs a phone that has been logging for months
   * nothing, where changing the shape of `lastLog` would cost it a
   * `STORAGE_VERSION` bump and a migration over real training data.
   */
  lastMarks: Record<string, (MarkNote | null)[]>;
  /**
   * Which day the Plan screen has open, as an ISO date rather than a day of
   * the month: the plan is dated now, and a bare number needed the viewed
   * month beside it to mean anything (which is what the old clamp on month
   * paging was for).
   */
  daySel: string;
  custom: Exercise[];
  /**
   * Edits to the *seeded* library, by exercise id — the user's name, muscle
   * group and equipment win over what `EX` shipped with, and `resetEx` puts
   * the seed back. Exercises the user created are edited in `custom` itself
   * instead, so the buddy keeps receiving them the way they were made.
   */
  exEdits: Record<string, { names?: LangMap; group?: string; kind?: string }>;
  /** Rewritten cues by exercise id — same override model as `setups`. */
  cueEdits: Record<string, string[]>;
  creating: Draft | null;
  profile: Profile;
  setups: Record<string, SetupPair[]>;
  videos: Record<string, string>;
  instrOpen: string | null;
  lang: Lang;
  /** Which palette, and whether the OS gets to pick between light and dark. */
  themeMode: ThemeMode;
  theme: ThemeName;
  /**
   * How long a logged set buys you, in seconds. 0 turns the rest cue off
   * entirely — the row stays yours and nothing counts down.
   */
  restSeconds: number;
  /**
   * What a fresh shared session's first-up policy starts as. Only a seed: the
   * live policy is `firstUp`, a register both phones agree on, and changing it
   * mid-workout doesn't change this.
   */
  firstUpDefault: FirstUp;
  /** Vibrate on the moments worth feeling: a set ticked, a rest run out. */
  haptics: boolean;
  /**
   * Let a rest that runs out while the phone is away reach you anyway, as a
   * notification. The out-of-app half of `haptics`: a suspended JS thread never
   * feels the moment pass, so the alarm is handed to Android up front — see
   * `src/data/alarms.ts`.
   */
  restAlert: boolean;
  /**
   * Remind you, once, on a day something is planned. The plan is dated rules,
   * so which days hold a workout is knowable a fortnight out — see
   * `<PlanAlarm>`, which is the only thing that reads this pair.
   *
   * Off by default, unlike `restAlert`: a rest alert only ever fires inside a
   * workout you started, where this one arrives on a day you may not have
   * opened the app at all. Something that speaks unprompted is asked for
   * rather than assumed.
   */
  planAlert: boolean;
  /**
   * When, as minutes past local midnight. A number rather than `'18:00'`
   * because it is arithmetic at every reader — the stepper clamps it, the
   * schedule adds it to a date — and a string would be parsed back at each one.
   */
  planAlertAt: number;
  /**
   * Train alone. The whole buddy half of the app — the radio, the roster, the
   * bars, every sheet that can interrupt you — is hidden and switched off.
   * `knownBuddies` survives it: this is a curtain, not a divorce.
   */
  privateMode: boolean;
  /**
   * Record what the app does, to a file, for reporting a bug that happened in a
   * gym — see `src/data/diag.ts`. Off unless someone turned it on: `dlog`
   * returns on its first line, so a phone that is not being tested spends
   * nothing. Additive like `coach` and `tips`, so no `STORAGE_VERSION` bump.
   */
  diag: boolean;
  /**
   * The folder the log is exported into — a SAF tree URI the user picked once,
   * whose grant Android persists against this install. Null until they do.
   *
   * A URI rather than a path because Android will not let an app write into
   * shared storage by name, and a persisted grant is what makes "after the
   * workout, copy your buddy's file out of Files" a one-time setup rather than
   * a picker every export. It can still be revoked — the folder is deleted,
   * storage is cleared — so every write answers failure rather than trusting it.
   */
  diagDir: string | null;
  /**
   * Whether the first-run flow has been completed (or skipped). True in
   * `initialState` on purpose: an existing phone's blob predates the key, so
   * `filterPersisted` leaves this default standing — and a phone with months
   * of logged training must never wake up to a welcome tour. Only
   * `firstRunDefaults` sets it false, and only the flow's last screen sets it
   * back.
   */
  onboarded: boolean;
  /** Reopened from Settings — same flow, but back can leave it. Transient. */
  onboardingOpen: boolean;
  /**
   * How this person trains. An ordering for the lists, never a filter —
   * `mixed` (the pre-onboarding default) means "don't sort".
   */
  style: StyleKey;
  /**
   * What onboarding scaled the starter routines by. Spent the moment the
   * picks are written; kept so re-running setup starts from the last answer.
   */
  level: Level;
  settingsOpen: boolean;
  /**
   * The Insights screen, opened from the Profile card. Transient like every
   * other open-overlay flag — the statistics are derived from `history` on
   * every render, so there is nothing about this view worth surviving a
   * restart.
   */
  statsOpen: boolean;
  /** The coach flow — goal, prompt, import. Transient like `statsOpen`. */
  coachOpen: boolean;
  /**
   * What the coach was last asked for. Persisted so re-running it next month
   * is two taps rather than four — a new key, which `PERSIST` takes without a
   * version bump or a migration.
   */
  coach: CoachOptions;
  /**
   * What each in-place tip has cost the user so far — see `data/tips.ts`.
   * Additive like `coach` and `buddySecrets`, so a phone that has been logging
   * for months takes it without a `STORAGE_VERSION` bump or a migration: the
   * key is simply absent, `filterPersisted` leaves `{}` standing, and every
   * tip is unmet. Which is the right answer for an existing phone too — the
   * gestures were never explained to it either.
   */
  tips: Tips;
  scanning: boolean;
  /**
   * This phone's install id, advertised alongside the profile name (see
   * `encodePeerName`). ANDROID_ID when available — it survives reinstalls —
   * else a random id generated once and persisted with everything else.
   */
  selfId: string;
  buddy: string | null;
  /**
   * Everyone this phone has paired with, by display name. The pairing is the
   * durable half of a buddy — the connection isn't — so this is what survives
   * a restart and what the radio goes looking for. Nothing removes a name but
   * the user: the list is how you see who is around when you run into each
   * other, which only works if it outlasts every link that ever dropped.
   */
  knownBuddies: string[];
  /**
   * Roster name → that buddy's install id, recorded from their snapshot. The
   * id is what makes a renamed buddy still the same buddy: a known id
   * arriving under a new name renames the roster entry (`rememberBuddy`)
   * instead of introducing a stranger. Its own persisted key rather than a
   * reshaped `knownBuddies` — `PERSIST` is additive, and both phones carry
   * real name-keyed rosters.
   */
  buddyIds: Record<string, string>;
  /**
   * Roster name → the per-pairing shared secret (`randomToken`), minted once
   * during the code-gated first pairing and persisted on both phones. It is
   * what a reconnecting peer proves before this phone trusts it: the name and
   * install id it advertises are both forgeable, so on their own they let a
   * nearby attacker who knows a buddy's name impersonate them. Its own
   * additive `PERSIST` key, like `buddyIds`. A buddy paired before this
   * existed has no entry and re-pairs once (through the code) to get one.
   */
  buddySecrets: Record<string, string>;
  /** whether the buddy-sync overlay is open */
  buddySync: boolean;
  /** pairing confirmed, snapshot not here yet — it decides if the sync screen opens */
  buddySyncPending: boolean;
  /** live radio state (real transport only; all transient) */
  nearbyPeers: { endpointId: string; id: string | null; name: string }[];
  buddyEndpoint: string | null;
  /** a connection awaiting the users' code check — both phones confirm */
  pendingAuth: {
    endpointId: string;
    /** the knocker's install id, null from older builds */
    id: string | null;
    name: string;
    digits: string;
    incoming: boolean;
  } | null;
  /** the connected peer's shareable data, from either transport */
  buddySnapshot: BuddySnapshot | null;
  /**
   * Sync rows settled over the air rather than by a tap on this phone: the
   * `syncItemId`s of items the buddy pushed here, and of sent items whose
   * merge they have acknowledged. The sync screen unions these into its own
   * marks; the radio is the only writer. Reset with each snapshot — the set
   * baselines the diff, and a stale id could dress an un-transferred row.
   */
  buddySynced: string[];
  /* — shared workout (all transient; see IMPROVEMENTS.md #8) — */
  /** incoming "train together?" invite awaiting a decision */
  buddyInvite: SessionInvite | null;
  /** they asked to train together — their name, awaiting your answer */
  joinAsk: string | null;
  /** your own outstanding ask, and who it went to */
  joinSent: { to: string; state: 'waiting' | 'declined' } | null;
  /** whether the live session is shared with the buddy */
  sessionShared: boolean;
  /** who initiated the shared session — ties on turn order go to the host */
  sessionRole: 'host' | 'guest' | null;
  /** host's view of the invite: has the buddy joined? */
  buddyJoin: 'pending' | 'joined' | 'declined' | null;
  /** the buddy's live session state, as last broadcast */
  buddyProgress: BuddyProgress | null;
  /**
   * Per-exercise turn-taking choice, one last-writer-wins register each —
   * advisory display only, but the same on both phones (see `mergeTurns`).
   */
  turnModes: Record<string, TurnChoice>;
  /**
   * Who leads an exercise when you're level on it — one last-writer-wins
   * register for the whole session, seeded from `firstUpDefault` and changeable
   * from the overview sheet by either phone. Like `turnModes` it is advisory
   * display only, and like `turnModes` both phones must land on the same answer,
   * which is why the coin's seed travels inside the register (see `leaderOf`).
   */
  firstUp: FirstUpChoice;
  /**
   * This phone's answer to "who's up?", per exercise, under the `ask` policy.
   * Own state, never merged — a bid is one phone's opinion, and the buddy's
   * arrives in their `progress` rather than becoming ours.
   */
  myBids: Record<string, Bid>;
  /** the buddy tapped Disconnect; a line says so until it's dismissed */
  buddyLeft: string | null;
  /**
   * The rest a logged set earned you — every logged set earns one, buddy or
   * not. `at` is the session clock it started on: counting in `elapsed` ticks
   * rather than wall time keeps the countdown pure and re-renders it for free.
   * `skipped` is the user saying they're ready before the clock agrees.
   *
   * **Only ever a rest of your own.** The buddy being mid-set is the other
   * reason your next set can be held, and it is deliberately not stamped here:
   * it has no clock to run down and ends when they tick rather than when a
   * timer does. Writing it as a rest gave the guest of a fresh session a
   * three-minute countdown on a set nobody had lifted yet.
   */
  rest: { at: number; skipped: boolean } | null;
  /**
   * The buddy's rest, re-anchored to *this* phone's clock: `left` is the
   * remainder they broadcast and `at` the `elapsed` it landed on here, so it
   * runs down by the same arithmetic `rest` does. Transient like
   * `buddyProgress`, and cleared everywhere that is.
   *
   * Separate from `buddyProgress` rather than stamped into it, because
   * `BuddyProgress` is the wire shape — what the other phone said — and `at`
   * is a local reading of a local clock that nothing about their message
   * knows.
   */
  buddyRest: { left: number; at: number } | null;
  /** live co-created routine draft, or null (transient) */
  coDraft: CoDraft | null;
  /**
   * Session overlay tucked away behind the tabs (tap the buddy bar) — the
   * session itself keeps running; the tab bar shows a resume strip.
   */
  sessionMin: boolean;
  /**
   * Set by whichever buddy bar was tapped; Profile scrolls its buddy section
   * into view once and clears it. Transient, one-shot.
   */
  buddyFocus: boolean;
  /**
   * The Routines tab's lens — what the list is searched for, how it is
   * ordered, which family it is narrowed to. UI state like `query`/`filter`,
   * outside `PERSIST` on purpose: a fresh launch opens on Week · All, empty
   * search.
   */
  routineQuery: string;
  routineSort: RoutineSort;
  routineFilter: RoutineFilter;
  /**
   * One-shot handoff to the Plan screen: an ISO date it should land on
   * (Today's "Recently" rows tap through). Plan consumes and clears it —
   * its month shift stays local state, so reopening Plan cold still lands
   * on the present.
   */
  planFocus: string | null;
  /**
   * One-shot handoff to the coach: a reply that arrived as a file rather than
   * being pasted (see `<Intake>`), for it to open on the import step already
   * holding. Consumed and cleared there, like `planFocus`.
   *
   * The text, not a parsed plan: the coach parses what it is given and shows
   * the reasons it couldn't, and handing it a pre-digested object would mean two
   * places deciding what a plan is.
   */
  coachIntake: string | null;
  /**
   * The plan sheet's subject, or null: the date being planned, and which
   * existing rule is being edited if any. A date rather than the old weekday
   * index — a rule needs an anchor, and a weekday has none.
   */
  dayPlan: { iso: string; entry: string | null } | null;
  groups: Labelled[];
  kinds: Labelled[];
  /** image-slot fills, keyed by slot id. The design persists these to a sidecar. */
  images: Record<string, string>;
};

const initialState: State = {
  routines: DEFAULT_ROUTINES.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) })),
  // The design's Mon/Wed/Fri, as rules: anchored on this week's Monday so the
  // seed is live the day it lands and claims nothing behind it. Same lift the
  // v3 migration performs, from the same function.
  plan: planFromSchedule({ 0: 'chest', 2: 'back', 4: 'both' }, mondayISO()),
  routineOpen: null,
  exOpen: null,
  picker: null,
  session: null,
  active: 0,
  query: '',
  filter: 'All',
  elapsed: 0,
  summary: null,
  history: [],
  lastLog: {},
  lastMarks: {},
  daySel: todayISO(),
  custom: [],
  exEdits: {},
  cueEdits: {},
  creating: null,
  profile: { name: '', age: '', weight: '', height: '' },
  setups: {},
  videos: {},
  instrOpen: null,
  // English and dark, not the OS's answer to either — see `firstRunDefaults`,
  // which is where following the OS actually happens. This object is also what
  // an existing phone renders before its blob comes back and what an
  // unreadable blob falls back to, and neither of those may change a setting
  // the user already has.
  lang: 'en',
  themeMode: 'dark',
  theme: 'blurple',
  restSeconds: 180,
  // What the app has always done, now that it has a name: the tie goes to
  // whoever started the session.
  firstUpDefault: 'host',
  haptics: true,
  restAlert: true,
  planAlert: false,
  // 18:00 — after work and before the evening is gone, which is when a
  // reminder can still be acted on. Only ever the starting point: the whole
  // setting is the time.
  planAlertAt: 18 * 60,
  privateMode: false,
  diag: false,
  diagDir: null,
  onboarded: true,
  onboardingOpen: false,
  style: 'mixed',
  level: 'regular',
  settingsOpen: false,
  statsOpen: false,
  coachOpen: false,
  coach: { ...DEFAULT_COACH, kinds: [...DEFAULT_COACH.kinds] },
  tips: {},
  scanning: false,
  // ANDROID_ID resolves at module load and never changes; the random
  // fallback is minted once here and then pinned by persistence.
  selfId: deviceInstallId() ?? randomInstallId(),
  buddy: null,
  knownBuddies: [],
  buddyIds: {},
  buddySecrets: {},
  buddySync: false,
  buddySyncPending: false,
  nearbyPeers: [],
  buddyEndpoint: null,
  pendingAuth: null,
  buddySnapshot: null,
  buddySynced: [],
  buddyInvite: null,
  joinAsk: null,
  joinSent: null,
  sessionShared: false,
  sessionRole: null,
  buddyJoin: null,
  buddyProgress: null,
  turnModes: {},
  firstUp: { policy: 'host', seed: 0, rev: 0 },
  myBids: {},
  buddyLeft: null,
  rest: null,
  buddyRest: null,
  coDraft: null,
  sessionMin: false,
  buddyFocus: false,
  routineQuery: '',
  routineSort: 'week',
  routineFilter: 'all',
  planFocus: null,
  coachIntake: null,
  dayPlan: null,
  groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
  kinds: DEFAULT_KINDS.map((k) => ({ ...k })),
  images: {},
};

/**
 * A plan entry's id. A skip names one, so it has to be unique for the life of
 * the blob — the clock alone isn't (two rules can be written in one
 * millisecond by a tap that swaps a day), so a few random characters ride
 * along. Minted in a mutator, never during render.
 */
const newEntryId = () => `e${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A session's first-up register, fresh from the setting. The seed is minted
 * here and only here: every new session re-rolls, so running the same routine
 * twice doesn't hand the same person every exercise both times.
 */
const freshFirstUp = (policy: FirstUp): FirstUpChoice => ({
  policy,
  seed: Math.floor(Math.random() * 0x7fffffff),
  rev: 0,
});

/**
 * What a phone that has never run this app starts with, over `initialState`.
 *
 * Kept out of `initialState` deliberately. That object serves three cases —
 * the frame before an existing phone's blob comes back, an unreadable blob,
 * and a true first run — and only the last one may follow the OS. A phone
 * that has been logging for months must not turn white because of an update,
 * and someone who chose English on a German phone must not have it undone.
 * The hydration path is the only place that can tell the three apart.
 *
 * Both are ordinary settings the moment they land: changing either in
 * Settings writes it to the blob, and the blob is what every later launch
 * reads. Nothing re-asks the OS afterwards.
 */
const firstRunDefaults = (): Partial<State> => ({
  lang: deviceLang(),
  themeMode: 'system',
  // The one path that shows onboarding. An abandoned first run saves a blob
  // with this still false, so the flow comes back on the next launch — the
  // half that matters most, the routines, is the half at the end.
  onboarded: false,
});

type Patch = Partial<State> | ((s: State) => Partial<State> | null);

/* ── persistence ──────────────────────────────────────────────────────────
 *
 * The durable slice of state, as one JSON blob in AsyncStorage. Everything
 * not listed is transient UI (open overlays) and deliberately reseeds. The
 * live session rides in the blob too — not because it is diary, but because
 * an accidentally closed app must not cost a workout (see the LIVE keys
 * below). `buddy` stays out: it names a live Bluetooth connection, and a
 * connection does not survive an app restart.
 */

// Keeps the pre-Spotter name: this key is where the training already logged on
// a phone lives. Renaming it to match the app would read as a first run and
// silently strand every session behind the old key.
/** The number a backup is stamped with, so an old one can be lifted forward. */
export const STORAGE_VERSION = 4;

const STORAGE_KEY = 'workout-diary/v4';
/**
 * v4 turned the seven weekday slots into dated rules; v3 widened the seeded
 * muscle groups; v2 added per-language names.
 */
const STORAGE_KEY_V3 = 'workout-diary/v3';
const STORAGE_KEY_V2 = 'workout-diary/v2';
const STORAGE_KEY_V1 = 'workout-diary/v1';
/** Where an unparseable blob is copied before the saver is allowed back on. */
const RECOVERY_KEY = 'workout-diary/recovered';

// Additive only: `filterPersisted` skips keys a stored blob doesn't have, so a
// phone that has been logging since v2 keeps its data and starts the new maps
// empty. Anything that changes the *shape* of an existing key needs a version.
const PERSIST = [
  'routines', 'plan', 'history', 'lastLog', 'lastMarks', 'custom', 'profile',
  'setups', 'videos', 'lang', 'groups', 'kinds', 'images', 'exEdits', 'cueEdits',
  'knownBuddies', 'buddyIds', 'buddySecrets', 'selfId', 'themeMode', 'theme', 'restSeconds', 'firstUpDefault',
  'haptics', 'restAlert', 'planAlert', 'planAlertAt', 'privateMode', 'onboarded', 'style', 'level', 'coach', 'tips',
  // Ordinary settings, and they ride in a backup like every other one: a
  // restored `diagDir` names a grant the new phone doesn't hold, which is the
  // revoked-folder case the export row already answers by offering the picker.
  'diag', 'diagDir',
  // The LIVE keys — crash recovery, not diary (additive like everything else,
  // so no version bump). A swiped-away app or a process death mid-workout used
  // to lose every ticked set; now the session comes back. `elapsed` is special
  // twice over: the dirty check below skips it so the clock alone never
  // schedules a write, and `flush` stamps the blob with `savedAt` so hydration
  // can add the wall gap back — the clock is wall-anchored, so stored plus gap
  // is the second the interval would have reached. `sessionRole` rides along
  // for one reader: a session resumes *solo*, and `rejoinSession` needs to
  // know which side of the shared workout this phone was — the connection
  // itself is still never persisted.
  'session', 'active', 'elapsed', 'rest', 'sessionRole',
] as const satisfies readonly (keyof State)[];

type Persisted = Pick<State, (typeof PERSIST)[number]>;

/**
 * The crash-recovery keys, named so backups can refuse them: a backup restored
 * on another phone must not open a phantom workout, and a restore must not
 * reach into one in progress. Both directions go through `dropLive`.
 */
const dropLive = (
  o: Persisted
): Omit<Persisted, 'session' | 'active' | 'elapsed' | 'rest' | 'sessionRole'> => {
  const { session: _s, active: _a, elapsed: _e, rest: _r, sessionRole: _o, ...durable } = o;
  return durable;
};

const pickPersisted = (s: State): Persisted => {
  const out = {} as Persisted;
  for (const k of PERSIST) (out as Record<string, unknown>)[k] = s[k];
  return out;
};

/**
 * The container each durable key must arrive as. A blob that was hand-edited
 * or mangled in transit (backups round-trip through chat apps) can carry the
 * right key with the wrong shape — `history: "..."` — and one such key throws
 * in every screen that maps over it, after which the debounced save writes the
 * corruption over the good blob. A mistyped key is dropped here and its seeded
 * default stands; the row-level shapes inside are the mutators' business.
 */
const PERSIST_SHAPE: Record<
  (typeof PERSIST)[number],
  'array' | 'object' | 'string' | 'number' | 'boolean'
> = {
  routines: 'array', plan: 'object', history: 'array', lastLog: 'object',
  lastMarks: 'object', custom: 'array', profile: 'object', setups: 'object',
  videos: 'object', lang: 'string', groups: 'array', kinds: 'array',
  images: 'object', exEdits: 'object', cueEdits: 'object', knownBuddies: 'array',
  buddyIds: 'object', buddySecrets: 'object', selfId: 'string',
  themeMode: 'string', theme: 'string', restSeconds: 'number',
  firstUpDefault: 'string', haptics: 'boolean', restAlert: 'boolean',
  planAlert: 'boolean', planAlertAt: 'number',
  privateMode: 'boolean', onboarded: 'boolean', style: 'string',
  level: 'string', coach: 'object', tips: 'object',
  // `diagDir`'s 'string' does for its null what `sessionRole`'s does for its.
  diag: 'boolean', diagDir: 'string',
  // `session` and `rest` are object-or-null, and 'object' is exactly the
  // right filter for that: a stored null fails it, the key is dropped, and
  // the seeded null stands — which is what null meant. `sessionRole`'s
  // 'string' does the same for its null.
  session: 'object', active: 'number', elapsed: 'number', rest: 'object',
  sessionRole: 'string',
};

const fitsShape = (v: unknown, shape: (typeof PERSIST_SHAPE)[keyof typeof PERSIST_SHAPE]) =>
  shape === 'array'
    ? Array.isArray(v)
    : shape === 'object'
      ? typeof v === 'object' && v !== null && !Array.isArray(v)
      : typeof v === shape;

/** Keep only known durable keys, so stale blobs can't resurrect UI state. */
const filterPersisted = (raw: unknown): Partial<State> => {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, unknown> = {};
  for (const k of PERSIST) {
    const v = (raw as Record<string, unknown>)[k];
    if (k in raw && fitsShape(v, PERSIST_SHAPE[k])) out[k] = v;
  }
  // A theme that no longer exists would leave the palette wherever it was;
  // drop the name and let the seeded default win instead.
  if ('theme' in out && !isThemeName(out.theme)) delete out.theme;
  // The plan's two sub-keys are load-bearing where every other durable key's
  // rows are the mutators' business — see `asPlan`.
  if ('plan' in out) out.plan = asPlan(out.plan);
  // A session's `list` is load-bearing the same way — everything that resumes
  // one maps over it. And the three companion keys describe a session: with
  // none to resume they are stale readings from one already finished, and the
  // seeded defaults stand instead.
  if (out.session && !Array.isArray((out.session as { list?: unknown }).list))
    delete out.session;
  if (!out.session) {
    delete out.active;
    delete out.elapsed;
    delete out.rest;
    delete out.sessionRole;
  }
  // The role is a closed pair, not any string a mangled blob happens to hold.
  if ('sessionRole' in out && out.sessionRole !== 'host' && out.sessionRole !== 'guest')
    delete out.sessionRole;
  return out as Partial<State>;
};

/**
 * Wake a session that survived the process. `savedAt` is the wall moment the
 * blob was written (stamped by `flush`); the clock is wall-anchored, so
 * elapsed-at-last-write plus the gap since is the second the interval would
 * have reached — and `rest`, measured in `elapsed` ticks, comes back
 * mid-countdown for free. Resumed *minimized*: the app opens on Today with
 * the hero's "Back to workout ›" — exactly where backing out of a live
 * session lands — rather than teleporting into the overlay.
 */
const resumeSession = (raw: unknown, data: Partial<State>): Partial<State> => {
  if (!data.session) return data;
  const savedAt = (raw as Record<string, unknown>).savedAt;
  const gap =
    typeof savedAt === 'number' && Number.isFinite(savedAt)
      ? Math.max(0, Math.floor((Date.now() - savedAt) / 1000))
      : 0;
  return {
    ...data,
    elapsed: (data.elapsed ?? 0) + gap,
    active: Math.min(data.active ?? 0, Math.max(0, data.session.list.length - 1)),
    sessionMin: true,
  };
};

/**
 * v2 → v3: the seeded muscle groups went from three to the full body.
 *
 * Everything the phone already has is kept exactly as it is — renamed,
 * reordered, added — and only the keys that are *new* in v3 are inserted, so a
 * group someone deleted on purpose stays deleted. They land ahead of a
 * trailing catch-all, because "Other" should keep the last word.
 */
const migrateV2 = (data: Partial<State>): Partial<State> => {
  const have = data.groups;
  if (!Array.isArray(have)) return data;
  const fresh = DEFAULT_GROUPS.filter(
    (d) => !V2_GROUP_KEYS.includes(d.key) && !have.some((g) => g?.key === d.key)
  ).map((d) => ({ key: d.key, labels: { ...d.labels } }));
  if (fresh.length === 0) return data;
  const trailingOther = have.length > 0 && have[have.length - 1]?.key === 'Other' ? 1 : 0;
  return {
    ...data,
    groups: [
      ...have.slice(0, have.length - trailingOther),
      ...fresh,
      ...have.slice(have.length - trailingOther),
    ],
  };
};

/**
 * v3 → v4: the seven weekday slots become dated weekly rules.
 *
 * Takes the **raw** blob alongside the filtered data, and that is the trap
 * worth naming: `schedule` has left `PERSIST`, so `filterPersisted` drops it —
 * read the filtered object here and every phone silently wakes up with an
 * empty plan. A blob with no usable `schedule` keeps whatever it has, which on
 * this path means the seeded plan stands.
 */
const migrateV3 = (raw: unknown, data: Partial<State>): Partial<State> => {
  const sched = (raw as Record<string, unknown> | null)?.schedule;
  // An *empty* schedule is an answer — someone cleared every day — so the lift
  // is written either way and the seeded plan does not come back. Only a blob
  // missing the key entirely is left alone, since it has nothing to say.
  if (typeof sched !== 'object' || sched === null || Array.isArray(sched)) return data;
  return { ...data, plan: planFromSchedule(sched, mondayISO()) };
};

/**
 * Lift a v1 blob (single `label` / `name` strings) to v2 per-language names.
 * An untouched default regains its seeded translations; anything the user
 * named is filed under the blob's language, since that is what they typed in.
 *
 * Returns the lifted blob **unfiltered** — the caller filters. Filtering here
 * would drop `schedule` before `migrateV3` could read it, and a v1 phone's
 * whole schedule would go with it.
 */
const migrateV1 = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== 'object' || raw === null) return {};
  const blob = raw as Record<string, any>;
  const lang: Lang = blob.lang === 'de' ? 'de' : 'en';

  const lift = (defs: readonly { key: string; labels: LangMap }[], rows: any[]): Labelled[] =>
    rows.map((r) => {
      if (r?.labels) return r;
      const label = typeof r?.label === 'string' ? r.label : '';
      const def = defs.find((d) => d.key === r?.key);
      if (def && label === def.labels.en) return { key: r.key, labels: { ...def.labels } };
      return { key: r?.key, labels: label.trim() ? { [lang]: label } : {} };
    });

  if (Array.isArray(blob.groups)) blob.groups = lift(DEFAULT_GROUPS, blob.groups);
  if (Array.isArray(blob.kinds)) blob.kinds = lift(DEFAULT_KINDS, blob.kinds);
  if (Array.isArray(blob.routines))
    blob.routines = blob.routines.map((r: any) => {
      if (r?.names) return r;
      const def = DEFAULT_ROUTINES.find((d) => d.id === r?.id);
      const names: LangMap =
        def && r?.name === def.names.en
          ? { ...def.names }
          : typeof r?.name === 'string' && r.name.trim()
            ? { [lang]: r.name }
            : {};
      const { name: _drop, ...rest } = r ?? {};
      return { ...rest, names };
    });
  if (Array.isArray(blob.custom))
    blob.custom = blob.custom.map((e: any) =>
      e?.names || typeof e?.name !== 'string' ? e : { ...e, names: { [lang]: e.name } }
    );

  return blob;
};

/**
 * A stored blob at version `v`, lifted to the current shape.
 *
 * The one place the chain is written down, so the load path and a backup
 * restore cannot disagree about the order — which matters because
 * `migrateV3` reads the raw blob and the other two read the filtered one.
 */
const migrateBlob = (raw: unknown, v: number): Partial<State> => {
  const lifted = v < 2 ? migrateV1(raw) : raw;
  let data = filterPersisted(lifted);
  if (v < 3) data = migrateV2(data);
  if (v < 4) data = migrateV3(lifted, data);
  return data;
};

/* ── pure helpers (shared with screens) ────────────────────────────────── */

/** Resolve a per-language name map for a language, falling back to the other. */
export const resolveNames = (names: LangMap | undefined, lang: Lang, fallback = ''): Resolved => {
  const cur = names?.[lang]?.trim();
  if (cur) return { text: cur, missing: false };
  const other: Lang = lang === 'en' ? 'de' : 'en';
  const alt = names?.[other]?.trim();
  if (alt) return { text: alt, missing: true };
  return { text: fallback, missing: false };
};

/** Trim trailing zeros the way the design's `fmt` does. */
export const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Parse a user-typed number, comma or dot, falling back when it isn't one. */
export const num = (v: string | number, fb: number) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? fb : n;
};

/**
 * One routine line, written the way its measure reads: "4 × 8 · 70 kg",
 * "3 × 45 sec", "5 km · 30 min", "90 min".
 *
 * Every screen that previews a routine — the Today hero, the plan, the
 * routine editor — was formatting this inline as `sets × reps · kg`, which a
 * duration entry would render as "1 × 90 · BW". One helper so there is one
 * place to be right.
 */
/** A set mark spelled out. Takes `L` for the same reason `measureLabel` does. */
export const markLabel = (m: SetMark, L: Strings) =>
  ({ up: L.markUp, down: L.markDown, ok: L.markOk, note: L.markNote })[m];

/** The measure spelled out, for a picker. Takes `L` so it can't be hoisted. */
export const measureLabel = (m: Measure, L: Strings) =>
  ({
    load: L.measureLoad,
    time: L.measureTime,
    distance: L.measureDistance,
    duration: L.measureDuration,
  })[m];

/**
 * A compact unit tag for a routine row — '' for a plain lift.
 *
 * The routine editor is one grid with shared column headers, but a routine can
 * mix measures: Full Body A ends on a plank, where "reps" means seconds and
 * "kg" means nothing. A per-row tag is the only honest label a shared header
 * can carry, short of a column per measure.
 */
export const unitTag = (m: Measure, L: Strings) =>
  m === 'load'
    ? ''
    : m === 'time'
      ? L.unitSec
      : m === 'duration'
        ? L.unitMin
        : `${L.unitKm} × ${L.unitMin}`;

export const schemeLine = (
  it: { sets: number; reps: number; w: number },
  m: Measure,
  L: Strings,
  /**
   * Drop the set count. For the co-created draft, where the sets belong to
   * both of you and only the reps and kg are yours — printing "1 ×" there
   * would claim a set count that line does not own.
   */
  noSets = false
): string => {
  // One set is the usual case for anything measured in distance or minutes,
  // and "1 ×" in front of a run reads as noise rather than information.
  const pre = noSets || it.sets <= 1 ? '' : `${it.sets} × `;
  if (m === 'duration') return `${it.reps} ${L.unitMin}`;
  if (m === 'time') return `${pre}${it.reps} ${L.unitSec}${it.w ? `  ·  ${fmt(it.w)} ${L.unitKg}` : ''}`;
  if (m === 'distance')
    return `${pre}${it.w ? `${fmt(it.w)} ${L.unitKm}  ·  ` : ''}${it.reps} ${L.unitMin}`;
  // A lift keeps its "4 × 8", where the set count is the point.
  const n = noSets ? `${it.reps}` : `${it.sets} × ${it.reps}`;
  return `${n}  ·  ${it.w ? `${fmt(it.w)} ${L.unitKg}` : blankOf(m)}`;
};

/**
 * Split a "70 × 8" summary back into its two fields. BW counts as 0; a dash
 * is a `distance` set with no distance recorded, and has to come back empty
 * rather than as the character itself — copying "—" into the field would put
 * an em-dash in a numeric input.
 */
export const prevNums = (prev: string) => {
  const left = (prev || '').split('×')[0]?.trim() ?? '';
  const m = String(prev).split('×');
  return {
    w: left === '—' ? '' : left.replace('BW', '0'),
    r: (m[1] || '').trim(),
  };
};

/**
 * What is left of your own rest, in seconds — 0 when there is none, when it
 * was skipped, or when the setting is off (`restSeconds` 0 collapses this to a
 * constant 0).
 *
 * Pure, and takes the slice rather than reading the store, because two callers
 * need the same arithmetic from different places: the session overlay draws
 * it, and <BuddyRadio> puts it on the wire (`BuddyProgress.rest`) so the buddy
 * can draw it too. One helper, or the number on their screen is a second
 * opinion about your clock.
 */
export const restLeftOf = (s: Pick<State, 'rest' | 'restSeconds' | 'elapsed'>) =>
  s.rest && !s.rest.skipped ? Math.max(0, s.restSeconds - (s.elapsed - s.rest.at)) : 0;

/**
 * The same reading of the buddy's rest, off the remainder they broadcast and
 * the local `elapsed` it landed on. Their clock and yours share no origin, so
 * a remainder re-anchored here is the only honest way to run it down — see
 * `buddyRest`.
 */
export const buddyRestLeftOf = (s: Pick<State, 'buddyRest' | 'elapsed'>) =>
  s.buddyRest ? Math.max(0, s.buddyRest.left - (s.elapsed - s.buddyRest.at)) : 0;

/** mm:ss. The live session's clock and every logged one are the same number. */
export const fmtClock = (secs: number) =>
  `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

/**
 * One logged set, written out with its units: "70 kg × 8", "BW × 20",
 * "5 km × 30 min", "90 min".
 *
 * `schemeLine` does this for a *plan*, where the numbers are a routine item and
 * the set count is part of the sentence. This does it for a set that actually
 * happened, from the stored "70 × 8" string — and it carries its units on its
 * back, because the day view lists them loose rather than under a column
 * header, and a day can mix all four measures.
 *
 * An empty left field keeps whichever blank `blankOf` wrote: BW is a fact
 * worth printing, an unrecorded distance is not, so the dash drops out and
 * leaves the minutes standing alone.
 */
export const loggedLine = (logged: string, m: Measure, L: Strings): string => {
  const [rawL = '', rawR = ''] = String(logged).split('×').map((x) => x.trim());
  if (m === 'duration') return `${rawR} ${L.unitMin}`;
  const right = m === 'load' ? rawR : `${rawR} ${m === 'time' ? L.unitSec : L.unitMin}`;
  const left =
    rawL === '—' ? '' : rawL === 'BW' ? 'BW' : `${rawL} ${m === 'distance' ? L.unitKm : L.unitKg}`;
  return left ? `${left} × ${right}` : right;
};

/**
 * Build a fresh session from a routine, with "last time" ghosts filled in.
 *
 * A row somebody typed numbers into (`planned`) opens with them already in the
 * fields, so the weight two people sat down and agreed on is the one standing
 * in front of them rather than a figure that stayed in the editor. The ghost
 * still says what *you* did last time and tapping it still copies that back
 * over the plan — an opening bid, not a cage. A row nobody touched carries the
 * picker's defaults, which are no one's decision, and stays out of the way.
 */
const sessionFrom = (s: State, r: Routine): Session => {
  const exOf = (id: string) => [...EX, ...s.custom].find((e) => e.id === id);
  const lastOf = (id: string) => s.lastLog[id]?.sets ?? exOf(id)?.lastSets ?? [];
  return {
    rid: r.id,
    name: resolveNames(r.names, s.lang).text,
    list: r.items.map((it) => {
      const last = lastOf(it.ex);
      const marks = s.lastMarks[it.ex] ?? [];
      // Nothing goes in the left field when the measure hasn't got one, or
      // when the plan's own figure is 0 — empty is already how bodyweight and
      // an unrecorded distance are written, and it keeps the BW ghost.
      const left = !isSingle(measureOf(exOf(it.ex))) && it.w > 0;
      const w = it.planned && left ? fmt(it.w) : '';
      const reps = it.planned ? String(it.reps) : '';
      return {
        ex: it.ex,
        // The pair travels as it is. It is the routine's decision and the
        // session only ever reads it — there is no pairing control anywhere
        // in a running workout.
        ...(it.with ? { with: it.with } : {}),
        sets: Array.from({ length: it.sets }, (_, k) => {
          // A plan asking for more sets than last time had falls back to the
          // first ghost; the mark falls back with it, or the arrow on the row
          // would be a verdict on a different set.
          const src = last[k] ? k : 0;
          return {
            w,
            reps,
            done: false,
            prev: last[src] || `${fmt(it.w)} × ${it.reps}`,
            prevMark: marks[src] ?? null,
          };
        }),
      };
    }),
  };
};

/**
 * The row literal every mid-session add is built from — the picker's + and the
 * buddy's offer both, or an exercise you took on from them would arrive a
 * different shape from one you picked yourself.
 *
 * `sets` is how many rows to open; where last time had fewer, the ghost falls
 * back to the first one and its verdict falls back with it, exactly as
 * `sessionFrom` does for a routine asking for more.
 */
/**
 * Put a new exercise on the end of a live session's list.
 *
 * A `with` on what used to be the last row claimed a partner that wasn't
 * there, so it resolved to no pair — appending would silently hand it one.
 * A superset is made in the routine and only there, and adding an exercise
 * mid-workout is not the user saying they want one.
 */
const appendSessionEx = (list: SessionExercise[], fresh: SessionExercise): SessionExercise[] => [
  ...list.map((e, k) => (k === list.length - 1 && e.with ? { ...e, with: undefined } : e)),
  fresh,
];

const freshSessionEx = (s: State, id: string, sets: number): SessionExercise => {
  const last = s.lastLog[id]?.sets ?? [...EX, ...s.custom].find((e) => e.id === id)?.lastSets ?? [];
  const marks = s.lastMarks[id] ?? [];
  return {
    ex: id,
    sets: Array.from({ length: Math.max(1, sets) }, (_, k) => {
      const src = last[k] ? k : 0;
      return {
        w: '',
        reps: '',
        done: false,
        prev: last[src] || '—',
        prevMark: marks[src] ?? null,
      };
    }),
  };
};

/** The name this phone shows up as on the buddy's screen. */
export const myName = (s: State) => s.profile.name.trim() || 'Spotter';

/**
 * Adopt a peer's version of a routine while keeping this phone's own numbers:
 * structure (name, exercise list, order, set counts) is theirs, reps and
 * weight stay local wherever the exercise was already in the local copy.
 *
 * `planned` travels with the numbers it describes. On a row that arrives from
 * the buddy their figure is the only one this phone has, so it lands as the
 * starting point — but unmarked: it is their decision, not this phone's, and
 * a weight nobody here agreed to must not turn up pre-typed in their session.
 */
const mergeRoutine = (local: Routine | undefined, incoming: Routine): Routine => ({
  ...incoming,
  items: incoming.items.map((it) => {
    const mine = local?.items.find((x) => x.ex === it.ex);
    return mine
      ? { ...it, reps: mine.reps, w: mine.w, planned: mine.planned }
      : { ...it, planned: undefined };
  }),
});

const upsertRoutine = (routines: Routine[], r: Routine): Routine[] =>
  routines.some((x) => x.id === r.id)
    ? routines.map((x) => (x.id === r.id ? r : x))
    : [...routines, r];

/** Upsert a peer's dependency closure — custom exercises win, groups/kinds only fill gaps. */
const upsertShared = (
  s: State,
  inc: { custom: Exercise[]; groups: Labelled[]; kinds: Labelled[] }
) => {
  const custom = [...s.custom];
  for (const e of inc.custom) {
    const i = custom.findIndex((x) => x.id === e.id);
    if (i < 0) custom.push(e);
    else custom[i] = e;
  }
  return {
    custom,
    groups: [...s.groups, ...inc.groups.filter((g) => !s.groups.some((x) => x.key === g.key))],
    kinds: [...s.kinds, ...inc.kinds.filter((k) => !s.kinds.some((x) => x.key === k.key))],
  };
};

/* ── restoring from a backup ───────────────────────────────────────────────
 *
 * A restore used to have one answer — replace the lot — which is right for a
 * new phone and wrong every other time: a backup is a stranger to whatever you
 * have trained since it was written. So there is a second way in, and it is the
 * rule this app already applies to a buddy's library (`upsertShared`) and to
 * the coach's plan: **additive, and what is on this phone wins.** A backup that
 * has never watched you lift does not get to overwrite what you actually did.
 *
 * That rule is what makes a conflict screen unnecessary. There is nothing to
 * ask about item by item — either the backup fills a gap, in which case take
 * it, or it disagrees with something already here, in which case here wins.
 * Someone who wants the backup's version of everything wants Replace, which is
 * still one hold away.
 *
 * Pure and module-level, beside the other merges rather than in `data/`: these
 * shapes are the store's own, and a `data/` module would have to restate every
 * one of them structurally to avoid an import cycle (see `data/stats.ts`).
 */

/** The parts of a backup that can be taken separately. */
export const RESTORE_PARTS = ['sessions', 'library', 'plan'] as const;
export type RestorePart = (typeof RESTORE_PARTS)[number];

/** What taking a backup's every part would add to what is already here. */
export type RestoreCounts = {
  sessions: number;
  routines: number;
  exercises: number;
  plan: number;
};

/**
 * A logged session's identity.
 *
 * `HistoryEntry` carries no id — it never needed one, because until now nothing
 * ever met the same session twice — so this is a content key over the fields
 * `finishSession` writes. Two entries that agree on all of them are one
 * session logged once and copied; two real sessions on one day differ in the
 * clock or the volume long before they collide here.
 *
 * Deliberately not `JSON.stringify`: key order is an implementation detail of
 * whichever literal built the object, and a blob that has been through a
 * migration is not obliged to keep it.
 */
const historyKey = (e: HistoryEntry) =>
  [e.date, e.rid ?? '', e.name ?? '', e.secs ?? '', e.vol ?? ''].join('|');

/** Fill the gaps in a keyed map, and only the gaps: what is here wins. */
const fillGaps = <T,>(mine: Record<string, T>, theirs: Record<string, T> | undefined) => ({
  ...(theirs ?? {}),
  ...mine,
});

/** Add the rows whose key this phone doesn't have yet, in the backup's order. */
const addMissing = <T,>(mine: T[], theirs: T[] | undefined, key: (x: T) => string) => {
  const here = new Set(mine.map(key));
  return [...mine, ...(theirs ?? []).filter((x) => !here.has(key(x)))];
};

/**
 * The durable slice with a backup's missing pieces added to it.
 *
 * Returns only the keys the chosen parts touch, so everything else — every
 * setting, the profile, and the whole buddy roster including `selfId` — is
 * untouched by construction rather than by being listed. Which is the point:
 * a merge must not be able to hand this phone another phone's install id.
 */
const mergePersisted = (
  mine: Persisted,
  theirs: Partial<Persisted>,
  parts: ReadonlySet<RestorePart>
): Partial<State> => {
  const out: Partial<State> = {};

  if (parts.has('sessions')) {
    out.history = addMissing(mine.history, theirs.history, historyKey).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // `lastLog` carries the date of the session it came from, so "newer wins"
    // is exact rather than a guess — and `lastMarks` moves with it index for
    // index (see the key's own comment), or a ▲ ends up sitting on a set it
    // was never a verdict about.
    const lastLog = { ...mine.lastLog };
    const lastMarks = { ...mine.lastMarks };
    for (const [id, log] of Object.entries(theirs.lastLog ?? {})) {
      if ((lastLog[id]?.date ?? '') >= log.date) continue;
      lastLog[id] = log;
      const marks = theirs.lastMarks?.[id];
      if (marks) lastMarks[id] = marks;
      else delete lastMarks[id];
    }
    out.lastLog = lastLog;
    out.lastMarks = lastMarks;
  }

  if (parts.has('library')) {
    out.routines = addMissing(mine.routines, theirs.routines, (r) => r.id);
    out.custom = addMissing(mine.custom, theirs.custom, (e) => e.id);
    // The lists come with the library rather than on their own tick: an
    // exercise filed under a group this phone doesn't have is stranded outside
    // the library's filter row, which is the state deleting a seeded group
    // produces. Gaps only, so a renamed row keeps the user's name.
    out.groups = addMissing(mine.groups, theirs.groups, (g) => g.key);
    out.kinds = addMissing(mine.kinds, theirs.kinds, (k) => k.key);
    out.setups = fillGaps(mine.setups, theirs.setups);
    out.videos = fillGaps(mine.videos, theirs.videos);
    out.images = fillGaps(mine.images, theirs.images);
    out.exEdits = fillGaps(mine.exEdits, theirs.exEdits);
    out.cueEdits = fillGaps(mine.cueEdits, theirs.cueEdits);
  }

  if (parts.has('plan')) {
    const theirPlan = asPlan(theirs.plan);
    // A rule names a routine, so one whose routine did not come along names
    // nothing — it would draw a planned day the app cannot start. Only the
    // *incoming* rules are filtered: an existing entry whose routine is gone is
    // a state the plan screen already handles, and a merge has no business
    // tidying it.
    const rids = new Set((out.routines ?? mine.routines).map((r) => r.id));
    const here = new Set(mine.plan.entries.map((e) => e.id));
    const entries = [
      ...mine.plan.entries,
      ...theirPlan.entries.filter((e) => !here.has(e.id) && rids.has(e.rid)),
    ];

    // A skip names an entry id, so one pointing at a rule that didn't come
    // along is a cancellation of nothing.
    const ids = new Set(entries.map((e) => e.id));
    const skips: Record<string, string[]> = { ...mine.plan.skips };
    for (const [iso, list] of Object.entries(theirPlan.skips)) {
      const add = list.filter((id) => ids.has(id) && !(skips[iso] ?? []).includes(id));
      if (add.length) skips[iso] = [...(skips[iso] ?? []), ...add];
    }
    out.plan = { entries, skips };
  }

  return out;
};

/**
 * What a backup would add.
 *
 * Computed by running the merge and measuring it, rather than by a second pass
 * that counts — so the preview cannot promise a number the import then misses.
 */
const restoreCounts = (mine: Persisted, theirs: Partial<Persisted>): RestoreCounts => {
  const all = mergePersisted(mine, theirs, new Set(RESTORE_PARTS));
  return {
    sessions: (all.history?.length ?? 0) - mine.history.length,
    routines: (all.routines?.length ?? 0) - mine.routines.length,
    exercises: (all.custom?.length ?? 0) - mine.custom.length,
    plan: (all.plan?.entries.length ?? 0) - mine.plan.entries.length,
  };
};

/* ── store ─────────────────────────────────────────────────────────────── */

function useWorkoutState() {
  const [state, setState] = useState<State>(initialState);
  // False until the stored blob has been merged in; saving waits for it so a
  // fresh launch can never overwrite real data with the seed.
  const [hydrated, setHydrated] = useState(false);
  // Armed separately from `hydrated`: hydrated lifts the splash, canSave says
  // the read actually *succeeded*. A transient read failure used to arm the
  // saver anyway, and 400ms later the debounce wrote the seed over the real
  // blob — the one data loss this store could cause entirely by itself.
  const [canSave, setCanSave] = useState(false);

  // Everything below closes over `state` directly. The hook re-runs on every
  // change anyway, so there is nothing for a latest-value ref to buy — and
  // screens call these lookups while rendering, where reading a ref is not
  // allowed.
  const patch = useCallback((u: Patch) => {
    setState((s) => {
      const d = typeof u === 'function' ? u(s) : u;
      return d ? { ...s, ...d } : s;
    });
  }, []);

  /* — hydrate once, then debounce-save the durable slice on every change — */

  useEffect(() => {
    let alive = true;
    (async () => {
      let data: Partial<State> | null = null;
      let ok = false;
      // Whatever raw string was in hand when a parse failed — the thing worth
      // copying aside before the saver is ever allowed near its key again.
      let held: string | null = null;
      try {
        held = await AsyncStorage.getItem(STORAGE_KEY);
        if (held) {
          const raw: unknown = JSON.parse(held);
          data = resumeSession(raw, filterPersisted(raw));
        } else {
          // No v4 blob yet — walk back through the older keys, lifting
          // whatever is there through every migration since. Each key is left
          // where it is; the next save writes v4 alongside it.
          for (const [key, v] of [
            [STORAGE_KEY_V3, 3],
            [STORAGE_KEY_V2, 2],
            [STORAGE_KEY_V1, 1],
          ] as const) {
            held = await AsyncStorage.getItem(key);
            if (held) {
              data = migrateBlob(JSON.parse(held), v);
              break;
            }
          }
        }
        ok = true;
      } catch {
        // Unreadable store: run on the seed rather than crash — but never
        // save over it. An unparseable blob is copied aside first, and only a
        // successful copy re-arms the saver; a failed *read* keeps this
        // launch read-only, because the blob may be intact and merely
        // unreachable, and either way it holds real training.
        if (held !== null)
          ok = await AsyncStorage.setItem(RECOVERY_KEY, held).then(
            () => true,
            () => false
          );
      }
      if (!alive) return;
      // The one line the log cannot derive from a transition: by the time
      // <Diagnostics> sees a session it cannot tell a resumed one from a fresh
      // one except by `sessionMin`, and it can never see *why* a phone came up
      // holding the seeded defaults. It is written before the setting it
      // depends on is known — which is what `diag.ts`'s undecided state is for,
      // rather than this reading the blob a second time.
      dlog(
        'data',
        'hydrated',
        {
          found: held !== null,
          canSave: ok,
          resumed: !!data?.session,
          elapsed: data?.elapsed,
        },
        true
      );
      if (data) patch(data);
      // `held === null` is the one thing `initialState` cannot know: every
      // read succeeded and there was nothing at any version, so this phone
      // has never run the app. That — and only that — is when the OS gets to
      // pick the language and the light/dark mode.
      else if (ok && held === null) patch(firstRunDefaults());
      setCanSave(ok);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [patch]);

  // The slice waiting on the debounce and the last one written. Refs, not
  // state: bookkeeping for the effects below, never rendered.
  const pendingRef = useRef<Persisted | null>(null);
  const savedRef = useRef<Persisted | null>(null);

  const flush = useCallback(() => {
    const slice = pendingRef.current;
    if (!slice) return;
    pendingRef.current = null;
    savedRef.current = slice;
    // `savedAt` rides beside the durable keys: the wall moment this blob was
    // written, which is what lets `resumeSession` advance the clock by the
    // time spent dead. Not a State key — nothing renders it, and stamping it
    // here keeps it honest about *this* write rather than some earlier tick.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...slice, savedAt: Date.now() })).catch(
      () => {}
    );
  }, []);

  useEffect(() => {
    if (!canSave) return;
    const slice = pickPersisted(state);
    const last = pendingRef.current ?? savedRef.current;
    // Every mutator is copy-on-write, so per-key reference equality is exact.
    // `elapsed` is skipped on purpose: the clock ticks every second, and a
    // full-blob serialize and disk write per second is the cost this check
    // exists to avoid. Every write something else earns carries the clock as
    // of that moment, and `savedAt` plus the wall gap at hydration makes up
    // whatever the last one missed (see `resumeSession`).
    if (!last || PERSIST.some((k) => k !== 'elapsed' && slice[k] !== last[k]))
      pendingRef.current = slice;
    if (!pendingRef.current) return;
    const id = setTimeout(flush, 400);
    return () => clearTimeout(id);
  }, [state, canSave, flush]);

  // Android suspends the JS thread on a screen lock: Finish followed by
  // pocketing the phone leaves the workout in an unfired 400ms timeout, and a
  // process death while locked would lose it. Backgrounding flushes at once.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') flush();
    });
    return () => sub.remove();
  }, [flush]);

  /* — lookups — */

  /** A seeded exercise as the user has since renamed/refiled it. */
  const edited = (e: Exercise): Exercise => {
    const o = state.exEdits[e.id];
    return o ? { ...e, ...o, names: { ...e.names, ...o.names } } : e;
  };

  const allEx = () => [...EX.map(edited), ...state.custom];
  const ex = (id: string) => allEx().find((e) => e.id === id);
  const routine = (id: string | null | undefined) => state.routines.find((r) => r.id === id);

  /* Per-language names, resolved for the active language. Callers render
     `.text` and grey it when `.missing` — the "not translated yet" cue. */
  const gInfo = (key: string): Resolved => {
    const g = state.groups.find((x) => x.key === key);
    return g ? resolveNames(g.labels, state.lang) : { text: key, missing: false };
  };
  const kInfo = (key: string): Resolved => {
    const k = state.kinds.find((x) => x.key === key);
    return k ? resolveNames(k.labels, state.lang) : { text: key, missing: false };
  };
  const exInfo = (e: Exercise): Resolved => resolveNames(e.names, state.lang, e.name);
  const rInfo = (r: Routine): Resolved => resolveNames(r.names, state.lang);

  /**
   * "Last time" for an exercise — really logged history first, then the seed.
   *
   * `marks` runs index for index with `sets`, and is empty for the seeded
   * library: nobody was there to judge those.
   */
  const lastFor = (
    id: string
  ): { date: string | null; sets: string[]; marks: (MarkNote | null)[] } => {
    const logged = state.lastLog[id];
    if (logged) return { date: logged.date, sets: logged.sets, marks: state.lastMarks[id] ?? [] };
    return { date: null, sets: ex(id)?.lastSets ?? [], marks: [] };
  };

  /** Whether a given local day (ISO) has a logged session. */
  const doneOn = (iso: string) => state.history.some((h) => h.date === iso);

  /**
   * Every session logged on a local day, each with its index in `history`.
   *
   * The index is what `saveDayAsRoutine` writes back through: history entries
   * carry no id of their own, and a day can hold more than one session.
   */
  const sessionsOn = (iso: string) =>
    state.history.map((h, i) => ({ h, i })).filter((x) => x.h.date === iso);

  /** Distinct days with a logged session in the current month. */
  const loggedThisMonth = () => {
    const prefix = todayISO().slice(0, 8); // 'YYYY-MM-'
    return new Set(state.history.map((h) => h.date).filter((d) => d.startsWith(prefix))).size;
  };

  /* The machine settings / cues for an exercise — the user's edits, else the
     seeds in the active language (`infoFor`). An edit is the user's own words
     and wins in both languages, exactly like an edited name. */
  const setup = (id: string): SetupPair[] =>
    state.setups[id] ?? (infoFor(id, state.lang)?.setup ?? []).map((p) => [...p] as SetupPair);

  const cues = (id: string) => state.cueEdits[id] ?? infoFor(id, state.lang)?.cues ?? [];

  const mutSetup = (id: string, fn: (rows: SetupPair[]) => void) => {
    patch((s) => {
      const cur = (s.setups[id] ?? infoFor(id, s.lang)?.setup ?? []).map((p) => [...p] as SetupPair);
      fn(cur);
      return { setups: { ...s.setups, [id]: cur } };
    });
  };

  const mutCues = (id: string, fn: (rows: string[]) => void) => {
    patch((s) => {
      const cur = [...(s.cueEdits[id] ?? infoFor(id, s.lang)?.cues ?? [])];
      fn(cur);
      return { cueEdits: { ...s.cueEdits, [id]: cur } };
    });
  };

  /**
   * Rename an exercise or refile it under another group/equipment. A custom
   * exercise is edited where it lives, so the change travels to the buddy
   * with it; a seeded one gets an entry in `exEdits` instead — `EX` is a
   * constant, and an override is also what makes "reset" meaningful.
   */
  const editEx = (id: string, d: { names?: LangMap; group?: string; kind?: string }) => {
    const merged = <T extends { names?: LangMap }>(cur: T): T => ({
      ...cur,
      ...d,
      ...(d.names ? { names: { ...cur.names, ...d.names } } : {}),
    });
    patch((s) =>
      s.custom.some((e) => e.id === id)
        ? { custom: s.custom.map((e) => (e.id === id ? merged(e) : e)) }
        : { exEdits: { ...s.exEdits, [id]: merged(s.exEdits[id] ?? {}) } }
    );
  };

  /** Whether a seeded exercise carries user edits — i.e. whether Reset does anything. */
  const exEdited = (id: string) => state.exEdits[id] !== undefined || state.cueEdits[id] !== undefined;

  /** Put a seeded exercise back the way it shipped, cues included. */
  const resetEx = (id: string) =>
    patch((s) => {
      const { [id]: _dropEdits, ...exEdits } = s.exEdits;
      const { [id]: _dropCues, ...cueEdits } = s.cueEdits;
      return { exEdits, cueEdits };
    });

  /* — tips — */

  /**
   * One more showing on the clock. Called by `<Tip>` after its dwell, not on
   * mount: a tip that flashed past while the list scrolled was never read, and
   * charging it a showing would spend the budget on nothing.
   *
   * A retired tip is left alone rather than counted up — `done` is the end
   * state and nothing walks back out of it.
   */
  const tipShown = (id: TipId) =>
    patch((s) => {
      const cur = s.tips[id];
      if (cur?.done) return null;
      return { tips: { ...s.tips, [id]: { seen: (cur?.seen ?? 0) + 1, done: false } } };
    });

  /**
   * That tip is finished. Written from the gesture it teaches as well as from
   * its ×, so it is deliberately idempotent and cheap: every call site fires it
   * blindly rather than first working out whether the tip was even on screen.
   */
  const tipDone = (id: TipId) =>
    patch((s) =>
      s.tips[id]?.done
        ? null
        : { tips: { ...s.tips, [id]: { seen: s.tips[id]?.seen ?? 0, done: true } } }
    );

  /**
   * Meet them all again. One key, cleared — which is why this row can live in
   * the ordinary part of Settings where re-running the tour could not: nothing
   * is re-applied and nothing is overwritten.
   */
  const resetTips = () => patch({ tips: {} });

  /* — mutation — */

  /** Copy-on-write one exercise inside the live session, then mutate the copy. */
  const mutSession = (i: number, fn: (e: SessionExercise) => void) => {
    patch((s) => {
      if (!s.session) return null;
      const list = s.session.list.map((e, k) =>
        k === i ? { ...e, sets: e.sets.map((x) => ({ ...x })) } : e
      );
      fn(list[i]);
      return { session: { ...s.session, list } };
    });
  };

  /**
   * Add an exercise to the live session, or start a free one around it when
   * there is none — the picker's whole job. The clock restarts with a fresh
   * session, so the rest goes with it: a stamp from the previous session
   * against a zeroed clock reads as a half-hour countdown.
   */
  const addSessionEx = (id: string) =>
    patch((s) => {
      const fresh = freshSessionEx(s, id, 3);
      if (!s.session)
        return {
          session: { rid: null, name: (DICT[s.lang] ?? DICT.en).freeSession, list: [fresh] },
          active: 0,
          elapsed: 0,
          rest: null,
          summary: null,
        };
      return {
        session: { ...s.session, list: appendSessionEx(s.session.list, fresh) },
        active: s.session.list.length,
      };
    });

  /**
   * Take on an exercise the buddy has in their session and this phone hasn't
   * — the other half of the jump button, and the only way one phone's list
   * ever grows from the other's. Never automatic: their list changing must
   * not move what a swipe lands on or flip Finish between a tap and a hold
   * while a set is in front of you.
   *
   * Their set count is adopted and their numbers are not — the co-draft's
   * rule, and what makes the turn arithmetic right on the first set instead
   * of after you match counts by hand. The ghost is your own history, because
   * "last time" was never theirs.
   *
   * If it is a custom exercise of theirs, the closure that arrived with the
   * progress naming it is upserted here and nowhere earlier: receiving it
   * makes the row nameable, and only this tap writes it into the library.
   */
  const adoptBuddyEx = (id: string, focus = true) =>
    patch((s) => {
      if (!s.session || !s.sessionShared) return null;
      if (s.session.list.some((e) => e.ex === id)) return null;
      const theirs = s.buddyProgress?.list.find((e) => e.ex === id);
      if (!theirs) return null;
      const deps = s.buddyProgress?.deps;
      const merged = deps?.custom.some((e) => e.id === id) ? upsertShared(s, deps) : null;
      // The ghost is read after the upsert, so an adopted exercise falls back
      // to the same place an invited one does.
      const fresh = freshSessionEx(merged ? { ...s, ...merged } : s, id, theirs.done.length);
      return {
        ...(merged ?? {}),
        session: { ...s.session, list: appendSessionEx(s.session.list, fresh) },
        ...(focus ? { active: s.session.list.length } : {}),
      };
    });

  /**
   * Drop an exercise from the live session — the undo for a wrong pick, which
   * otherwise caps progress below 100% for the rest of the workout. Guarded to
   * exercises with nothing ticked: a set that was actually lifted is a fact,
   * and facts don't leave through an ×. Safe with a buddy for the same reason
   * adding is: `progress` is whole-state and keyed by exercise id.
   */
  const removeSessionEx = (i: number) =>
    patch((s) => {
      if (!s.session) return null;
      const entry = s.session.list[i];
      if (!entry || entry.sets.some((x) => x.done)) return null;
      const list = s.session.list
        .filter((_, k) => k !== i)
        // A pair needs both halves. Removing one leaves the other pointing at
        // whatever slid up into its place, which would superset two exercises
        // nobody joined — the same guard the routine editor's × carries.
        .map((e, k) => (k === i - 1 && e.with ? { ...e, with: undefined } : e));
      return {
        session: { ...s.session, list },
        active: Math.max(0, Math.min(s.active > i ? s.active - 1 : s.active, list.length - 1)),
      };
    });

  /**
   * Reorder the live session — the overview's drag, by *stop*: a superset pair
   * is one thing on the screen behind, so it travels as one thing here, which
   * is also what keeps `with` adjacency true by construction and keeps this a
   * reorder rather than a pairing control (a running workout still has none).
   * A `with` that already resolved to no pair — only the last row can carry
   * one — is cleared rather than handed whatever lands after it:
   * `appendSessionEx`'s rule, met from the other side. `active` keeps naming
   * the exercise it named, wherever that exercise lands.
   */
  const moveSessionStop = (from: number, to: number) =>
    patch((s) => {
      if (!s.session) return null;
      const stops = stopsOf(s.session.list);
      if (from === to || !stops[from] || !stops[to]) return null;
      const list = s.session.list.map((e, k) =>
        e.with && stops.some((st) => st.head === k && st.ids.length === 1)
          ? { ...e, with: undefined }
          : e
      );
      const order = stops.map((st) => st.ids.map((k) => list[k]));
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      const next = order.flat();
      const held = list[Math.max(0, Math.min(s.active, list.length - 1))];
      return {
        session: { ...s.session, list: next },
        active: Math.max(0, next.indexOf(held)),
      };
    });

  /**
   * A fresh copy of a seed routine at an experience level — what onboarding
   * installs for a pick and what the collection's + installs for one, so the
   * two can never write different shapes. Scaled numbers are marked `planned`
   * (below `regular` only): a first session opens with them in the fields,
   * where an unplanned row defers to "last time" — and a brand-new user's
   * "last time" is the seed data's, which is exactly the number the level
   * exists to shrink. `regular` stays unmarked, because those figures are the
   * design's, not this user's.
   */
  const scaledSeed = (r: Routine, level: Level): Routine => ({
    ...r,
    names: { ...r.names },
    items: r.items.map((it) => {
      const scaled = scaleItem(it, measureOf(ex(it.ex)), level);
      return level === 'regular' ? scaled : { ...scaled, planned: true as const };
    }),
  });

  /**
   * Put one seed on the list — the collection row's +. A same-id copy already
   * here is replaced with the fresh scaled one, exactly as re-running setup
   * would replace a pick; everything else on the list keeps its place.
   */
  const addSeedRoutine = (rid: string) =>
    patch((s) => {
      const seed = DEFAULT_ROUTINES.find((r) => r.id === rid);
      if (!seed) return null;
      return { routines: [...s.routines.filter((r) => r.id !== rid), scaledSeed(seed, s.level)] };
    });

  /**
   * Write everything the first-run flow decided, in one patch.
   *
   * The routine list is the delicate part, because this can run twice — the
   * flow is reachable again from Settings. `picked` names *seed* routines:
   * each one lands as a fresh `scaledSeed` copy, replacing any same-id copy
   * already here (that is what "run setup again" means). Everything the user
   * made themselves — saved-as-routine, built with a buddy, id not in the
   * seed set — survives untouched, in place. An *unpicked* seed that exists
   * on the phone is dropped, exactly as `deleteRoutine` would: unticking it
   * is the same decision made in a different room. `history`, `lastLog` and
   * `custom` are never in the patch — a tour must not be able to eat a diary.
   */
  const applyOnboarding = (o: {
    profile: Profile;
    style: StyleKey;
    level: Level;
    picked: string[];
    week: Record<number, string>;
  }) =>
    patch((s) => {
      const seeds = o.picked
        .map((id) => DEFAULT_ROUTINES.find((r) => r.id === id))
        .filter((r): r is Routine => !!r)
        .map((r) => scaledSeed(r, o.level));
      const seedIds = new Set(DEFAULT_ROUTINES.map((r) => r.id));
      const kept = s.routines.filter((r) => !seedIds.has(r.id));
      const routines = [...seeds, ...kept];
      // The week step only ever offers picked routines, but the schedule is
      // re-checked anyway: a slot pointing at a routine this patch just
      // dropped would be the plan screen's deleted-rid case, created here.
      const ids = new Set(routines.map((r) => r.id));
      const week = Object.fromEntries(
        Object.entries(o.week).filter(([, rid]) => ids.has(rid))
      );
      return {
        profile: o.profile,
        style: o.style,
        level: o.level,
        routines,
        // The tour's seven slots become weekly rules, anchored on this week's
        // Monday — the same lift the v3 migration performs, from the same
        // function, so a fresh setup and a migrated phone hold one shape.
        plan: planFromSchedule(week, mondayISO()),
        onboarded: true,
        onboardingOpen: false,
      };
    });

  /**
   * Delete a routine. The rules pointing at it go, a co-draft of it ends, and
   * the editor closes with it. `history` is untouched on purpose: entries carry
   * the name frozen at log time, and a deleted rid there is already the
   * "routine deleted since" case the plan screen and save-as-routine handle.
   *
   * Two things to clear now rather than one: a skip names an entry id, so the
   * skips of a rule that just left would otherwise sit in the blob forever
   * cancelling nothing.
   */
  const deleteRoutine = (rid: string) =>
    patch((s) => ({
      routines: s.routines.filter((r) => r.id !== rid),
      plan: dropEntries(s.plan, (e) => e.rid === rid),
      ...(s.coDraft?.rid === rid ? { coDraft: null } : {}),
      routineOpen: s.routineOpen === rid ? null : s.routineOpen,
    }));

  /* — the plan: five writes, one per thing the sheet and the day panel can do —
   *
   * Every one of them goes through `data/plan.ts`'s two primitives: a rule in
   * `entries`, or a cancelled occurrence in `skips`. Nothing here reaches for a
   * third concept, which is what keeps "what is planned on this day" a single
   * function the whole app reads.
   */

  /** Plan a routine on a date, from that date on. */
  const addPlan = (iso: string, rid: string, repeat: Repeat) =>
    patch((s) => ({
      plan: {
        ...s.plan,
        entries: [
          ...s.plan.entries,
          { id: newEntryId(), rid, from: anchorFor(iso, repeat), repeat },
        ],
      },
      dayPlan: null,
    }));

  /** Change a rule itself — every occurrence, past bars included. */
  const editPlan = (id: string, rid: string, repeat: Repeat) =>
    patch((s) => ({
      plan: {
        ...s.plan,
        entries: s.plan.entries.map((e) =>
          e.id === id ? { ...e, rid, from: anchorFor(e.from, repeat), repeat } : e
        ),
      },
      dayPlan: null,
    }));

  /**
   * Swap one occurrence for a different routine, leaving the rule alone: the
   * occurrence is cancelled and a one-off takes its place. Picking the routine
   * the rule already names just un-cancels it — writing a `once` that duplicates
   * the rule would leave two identical rows on the day.
   */
  const swapPlanDay = (iso: string, id: string, rid: string) =>
    patch((s) => {
      const held = s.plan.entries.find((e) => e.id === id);
      if (!held) return { dayPlan: null };
      if (held.rid === rid) return { plan: unskip(s.plan, iso, id), dayPlan: null };
      const skipped = skip(s.plan, iso, id);
      return {
        plan: {
          ...skipped,
          entries: [
            ...skipped.entries,
            { id: newEntryId(), rid, from: iso, repeat: { unit: 'once' } },
          ],
        },
        dayPlan: null,
      };
    });

  /** Cancel one occurrence. With nothing left standing the day reads as rest. */
  const skipPlanDay = (iso: string, id: string) =>
    patch((s) => ({ plan: skip(s.plan, iso, id), dayPlan: null }));

  /** Put a cancelled occurrence back — the undo for the row above. */
  const restorePlanDay = (iso: string, id: string) =>
    patch((s) => ({ plan: unskip(s.plan, iso, id), dayPlan: null }));

  /** Drop a rule outright, and every skip that only existed to cancel it. */
  const dropPlan = (id: string) =>
    patch((s) => ({ plan: dropEntries(s.plan, (e) => e.id === id), dayPlan: null }));

  const mutRoutine = (rid: string, fn: (r: Routine) => void) => {
    patch((s) => ({
      routines: s.routines.map((r) => {
        if (r.id !== rid) return r;
        const copy = { ...r, items: r.items.map((i) => ({ ...i })) };
        fn(copy);
        return copy;
      }),
      // Editing the live co-draft bumps its rev so <BuddyRadio> rebroadcasts.
      ...(s.coDraft?.rid === rid ? { coDraft: { ...s.coDraft, rev: s.coDraft.rev + 1 } } : {}),
    }));
  };

  /** Move one routine item — the co-draft editor's drag reorder. */
  const moveRoutineItem = (rid: string, from: number, to: number) =>
    mutRoutine(rid, (r) => {
      const [moved] = r.items.splice(from, 1);
      r.items.splice(to, 0, moved);
    });

  /** Reorder one of the settings lists. Replaces the design's HTML5 drag state. */
  const reorder = (listKey: 'groups' | 'kinds', from: number, to: number) => {
    patch((s) => {
      const a = [...s[listKey]];
      const [moved] = a.splice(from, 1);
      a.splice(to, 0, moved);
      return { [listKey]: a } as Partial<State>;
    });
  };

  /**
   * Merge one diffed item from a buddy's snapshot into local state — the
   * "receive" half of buddy sync. Whole items come with their dependency
   * closure: an exercise pulls its group/kind if those are missing too, a
   * routine pulls its custom exercises. Translations fill one language on an
   * entity both sides already have.
   */
  const importFromPeer = (peer: BuddySnapshot, item: SyncItem) => {
    patch((s) => {
      if (item.kind === 'translation') {
        const fill = (names: LangMap): LangMap => ({ ...names, [item.lang]: item.text });
        switch (item.type) {
          case 'group':
            return {
              groups: s.groups.map((g) => (g.key === item.key ? { ...g, labels: fill(g.labels) } : g)),
            };
          case 'kind':
            return {
              kinds: s.kinds.map((k) => (k.key === item.key ? { ...k, labels: fill(k.labels) } : k)),
            };
          case 'exercise':
            return {
              custom: s.custom.map((e) =>
                e.id === item.key ? { ...e, names: fill(e.names ?? {}) } : e
              ),
            };
          case 'routine':
            return {
              routines: s.routines.map((r) =>
                r.id === item.key ? { ...r, names: fill(r.names) } : r
              ),
            };
        }
      }

      const groups = [...s.groups];
      const kinds = [...s.kinds];
      const custom = [...s.custom];
      const routines = [...s.routines];

      const needGroup = (key: string) => {
        if (groups.some((g) => g.key === key)) return;
        const g = peer.groups.find((x) => x.key === key);
        if (g) groups.push(g);
      };
      const needKind = (key: string) => {
        if (kinds.some((k) => k.key === key)) return;
        const k = peer.kinds.find((x) => x.key === key);
        if (k) kinds.push(k);
      };
      const needExercise = (id: string) => {
        if (EX.some((e) => e.id === id) || custom.some((e) => e.id === id)) return;
        const e = peer.custom.find((x) => x.id === id);
        if (!e) return;
        custom.push(e);
        needGroup(e.group);
        needKind(e.kind);
      };

      switch (item.type) {
        case 'group':
          needGroup(item.key);
          break;
        case 'kind':
          needKind(item.key);
          break;
        case 'exercise':
          needExercise(item.key);
          break;
        case 'routine': {
          if (!routines.some((r) => r.id === item.key)) {
            const r = peer.routines.find((x) => x.id === item.key);
            if (r) {
              routines.push(r);
              r.items.forEach((i) => needExercise(i.ex));
            }
          }
          break;
        }
      }
      return { groups, kinds, custom, routines };
    });
  };

  /** Record a sync row as settled over the air — pushed here, or acked there. */
  const markBuddySynced = (id: string) =>
    patch((s) => (s.buddySynced.includes(id) ? null : { buddySynced: [...s.buddySynced, id] }));

  /* — session lifecycle — */

  const start = (rid: string | null | undefined, withBuddy?: 'host' | 'guest') => {
    patch((s) => {
      // One workout at a time: a Start tap while a session is running
      // resurfaces it instead of replacing it. Back now tucks a session
      // behind the tabs rather than swallowing the press, so every Start in
      // the app is reachable mid-workout — and a second one would throw away
      // sets that were actually lifted. This is the single choke point, so
      // "impossible to start another" holds wherever the button lives.
      // Shared starts (`withBuddy`) pass through: both phones already agreed,
      // and a one-sided refusal would strand the buddy in a shared session
      // this phone never joined.
      if (withBuddy === undefined && s.session)
        return { sessionMin: false, routineOpen: null, picker: null };
      const r = rid ? s.routines.find((x) => x.id === rid) : null;
      return {
        session: r
          ? sessionFrom(s, r)
          : { rid: null, name: (DICT[s.lang] ?? DICT.en).freeSession, list: [] },
        active: 0,
        elapsed: 0,
        routineOpen: null,
        summary: null,
        picker: null,
        // Solo by default — <BuddyRadio> flips this to a hosted shared
        // session right after, if a buddy is connected. `withBuddy` is the
        // co-draft path, where both sides already agreed: it starts shared
        // outright, which also tells <BuddyRadio> not to send an invite.
        sessionShared: withBuddy !== undefined,
        sessionRole: withBuddy ?? null,
        buddyJoin: withBuddy ? ('joined' as const) : null,
        buddyProgress: null,
        buddyRest: null,
        turnModes: {},
        firstUp: freshFirstUp(s.firstUpDefault),
        myBids: {},
        buddyLeft: null,
        rest: null,
        sessionMin: false,
      };
    });
  };

  /**
   * Accept an incoming "train together" invite: upsert the starter's routine
   * and its dependencies (their version wins — that's the sync), then start
   * the same session as the guest.
   */
  const acceptInvite = () => {
    patch((s) => {
      const inv = s.buddyInvite;
      if (!inv) return null;

      const deps = upsertShared(s, inv);
      // The starter's structure wins — that's the sync — but this phone's own
      // reps/weights survive: numbers are personal (see the co-draft model).
      const merged = mergeRoutine(
        s.routines.find((r) => r.id === inv.routine.id),
        inv.routine
      );

      return {
        ...deps,
        routines: upsertRoutine(s.routines, merged),
        buddyInvite: null,
        session: sessionFrom({ ...s, custom: deps.custom }, merged),
        active: 0,
        elapsed: 0,
        routineOpen: null,
        summary: null,
        picker: null,
        sessionShared: true,
        sessionRole: 'guest',
        buddyJoin: null,
        buddyProgress: null,
        buddyRest: null,
        turnModes: {},
        // The host's register arrives with their next broadcast and wins the
        // rev-0 tie, so this is only what the guest shows for one message.
        firstUp: freshFirstUp(s.firstUpDefault),
        myBids: {},
        // The clock this rest was stamped against is being set back to zero —
        // and so is the one their remainder was anchored against.
        rest: null,
        sessionMin: false,
      };
    });
  };

  const declineInvite = () => patch({ buddyInvite: null });

  /* — turn taking (shared, advisory) — */

  /** The agreed mode for an exercise; alternate until someone says otherwise. */
  const turnMode = (exId: string): TurnMode => state.turnModes[exId]?.mode ?? 'alternate';

  /** Flip it here and bump the rev — <BuddyRadio> carries it over on the next broadcast. */
  const toggleTurnMode = (exId: string) =>
    patch((s) => {
      const cur = s.turnModes[exId];
      return {
        turnModes: {
          ...s.turnModes,
          [exId]: {
            mode: cur?.mode === 'parallel' ? 'alternate' : 'parallel',
            rev: (cur?.rev ?? 0) + 1,
          },
        },
      };
    });

  /** Adopt the buddy's registers where theirs win. Returns nothing to patch if none do. */
  const mergeTurnModes = (theirs: Record<string, TurnChoice> | undefined) =>
    patch((s) => {
      const merged = mergeTurns(s.turnModes, theirs, s.sessionRole);
      return merged ? { turnModes: merged } : null;
    });

  /* — who goes first (shared, advisory) — */

  /**
   * Change the policy for this session. Mints a new seed with it — the two
   * always travel together (see `FirstUpChoice`), and it means picking Random
   * a second time re-rolls rather than sitting on the same coin. Bids go with
   * it: the question has changed, so the old answers aren't answers to it.
   */
  const setFirstUp = (policy: FirstUp) =>
    patch((s) => ({
      firstUp: { ...freshFirstUp(policy), rev: s.firstUp.rev + 1 },
      myBids: {},
    }));

  /** Adopt the buddy's register if theirs wins. Adopting never bumps a rev. */
  const mergeFirstUpFrom = (theirs: FirstUpChoice | undefined) =>
    patch((s) => {
      const merged = mergeFirstUp(s.firstUp, theirs, s.sessionRole);
      return merged ? { firstUp: merged } : null;
    });

  /**
   * Answer "who's up?" for an exercise. Tapping the same answer again takes it
   * back — the row returns and you can say the other thing, which is the only
   * way out of a misfire, since a bid is otherwise final for the exercise.
   */
  const bidFirst = (exId: string, bid: Bid) =>
    patch((s) => {
      const next = { ...s.myBids };
      if (next[exId] === bid) delete next[exId];
      else next[exId] = bid;
      return { myBids: next };
    });

  /* — backup — */

  /**
   * The durable slice, ready to be wrapped in an envelope and written out.
   * Minus the LIVE keys: they are crash recovery, not diary, and a backup
   * restored on another phone must not open a phantom workout there.
   */
  const exportState = (): Record<string, unknown> =>
    dropLive(pickPersisted(state)) as unknown as Record<string, unknown>;

  /**
   * Take a backup's word for everything durable.
   *
   * A restore *replaces* rather than merges: the seeded defaults go down
   * first, so a key the backup doesn't carry resets instead of surviving from
   * whatever this phone happened to have. Older backups come through the same
   * migrations a stored blob would. Transient state — the live session, open
   * overlays, anything buddy-shaped — is deliberately untouched.
   *
   * Returns how many sessions came back, which is the only number worth
   * showing: it is what the user is really checking for.
   */
  const importState = (env: { v: number; data: Record<string, unknown> }): number | null => {
    // A backup stamped by a newer build is the one case where a key's shape
    // may have legitimately changed — that is what the stamp is for — and
    // "migrate forward" has no backward direction. Refused rather than loaded
    // raw; the app updates, the file doesn't. The screen says so.
    if (env.v > STORAGE_VERSION) return null;
    // `dropLive` on the way in too: the seeded side now carries the LIVE keys
    // (session: null included), and patching those through would end a workout
    // in progress — the one thing a restore has always promised not to touch.
    const restored = dropLive({ ...pickPersisted(initialState), ...migrateBlob(env.data, env.v) });
    patch(restored);
    // The envelope proves the file is ours, not that every key inside it
    // survived whatever edited it since.
    return Array.isArray(restored.history) ? restored.history.length : 0;
  };

  /**
   * What this backup would add, without adding it. `null` for a file from a
   * newer build — the same refusal `importState` makes, made early so the
   * screen can say so instead of offering a preview it would then decline.
   */
  const previewRestore = (env: { v: number; data: Record<string, unknown> }): RestoreCounts | null =>
    env.v > STORAGE_VERSION
      ? null
      : restoreCounts(pickPersisted(state), migrateBlob(env.data, env.v) as Partial<Persisted>);

  /**
   * Take the parts of a backup this phone is missing and leave everything else
   * alone — the non-destructive half of a restore. Older backups come through
   * the same migrations, and `mergePersisted` returns only the keys the chosen
   * parts touch, so nothing outside them can be written by accident.
   *
   * Returns what actually landed, which is the number worth showing: "added 3
   * sessions" and "added nothing, it was all here" are different answers and
   * the screen says which.
   */
  const mergeState = (
    env: { v: number; data: Record<string, unknown> },
    parts: ReadonlySet<RestorePart>
  ): RestoreCounts | null => {
    if (env.v > STORAGE_VERSION) return null;
    const mine = pickPersisted(state);
    const theirs = migrateBlob(env.data, env.v) as Partial<Persisted>;
    const merged = mergePersisted(mine, theirs, parts);
    patch(merged);
    return {
      sessions: (merged.history?.length ?? mine.history.length) - mine.history.length,
      routines: (merged.routines?.length ?? mine.routines.length) - mine.routines.length,
      exercises: (merged.custom?.length ?? mine.custom.length) - mine.custom.length,
      plan: (merged.plan?.entries.length ?? mine.plan.entries.length) - mine.plan.entries.length,
    };
  };

  /**
   * Remember a buddy we just paired with, so the radio can find them again —
   * and record their install id when one arrived. The id is the rename
   * detector: a known id showing up under a new display name renames the
   * roster entry (and the live pairing) instead of adding a stranger, which
   * is the whole reason ids exist.
   */
  const rememberBuddy = (name: string, id: string | null = null) =>
    patch((s) => {
      const oldName = id
        ? Object.keys(s.buddyIds).find((n) => s.buddyIds[n] === id && n !== name)
        : undefined;
      if (oldName) {
        const { [oldName]: _dropped, ...rest } = s.buddyIds;
        // The pairing secret follows the rename — it belongs to the buddy, not
        // to the name they happened to advertise it under.
        const { [oldName]: movedSecret, ...restSecrets } = s.buddySecrets;
        return {
          knownBuddies: [...s.knownBuddies.filter((n) => n !== oldName && n !== name), name],
          buddyIds: { ...rest, [name]: id! },
          ...(movedSecret !== undefined
            ? { buddySecrets: { ...restSecrets, [name]: movedSecret } }
            : {}),
          ...(s.buddy === oldName ? { buddy: name } : {}),
        };
      }
      const known = s.knownBuddies.includes(name);
      const newId = id !== null && s.buddyIds[name] !== id;
      if (known && !newId) return null;
      return {
        ...(known ? {} : { knownBuddies: [...s.knownBuddies, name] }),
        ...(newId ? { buddyIds: { ...s.buddyIds, [name]: id! } } : {}),
      };
    });

  /**
   * Record the shared secret for a buddy — minted here on a first pairing, or
   * adopted from the minting side's hello. Keyed by roster name like
   * `buddyIds`; a no-op when it already holds this value, so it never churns
   * persistence on a reconnect.
   */
  const recordBuddySecret = (name: string, token: string) =>
    patch((s) =>
      s.buddySecrets[name] === token
        ? null
        : { buddySecrets: { ...s.buddySecrets, [name]: token } }
    );

  /**
   * Tear the pairing down — both when this phone taps Disconnect and when the
   * buddy's `bye` arrives. Everything buddy-shaped goes, including the shared
   * half of a live session; the session itself is untouched, so whoever was
   * mid-workout keeps their numbers and finishes alone.
   *
   * They keep their place on `knownBuddies` — you are still paired, and the
   * list is how you spot each other later. Clearing `buddy` is all a
   * disconnect needs to stick: nothing on the roster is connected to without
   * being asked, so there is nothing to reconnect behind your back.
   */
  const endPairing = (left: string | null = null) =>
    patch((s) => ({
      buddy: null,
      buddyEndpoint: null,
      buddySnapshot: null,
      buddySynced: [],
      buddySync: false,
      buddySyncPending: false,
      pendingAuth: null,
      nearbyPeers: [],
      buddyInvite: null,
      joinAsk: null,
      joinSent: null,
      buddyLeft: left,
      sessionShared: false,
      sessionRole: null,
      buddyJoin: null,
      buddyProgress: null,
      buddyRest: null,
      turnModes: {},
      firstUp: freshFirstUp(s.firstUpDefault),
      myBids: {},
      coDraft: null,
    }));

  /**
   * Unpair for good — the one thing that does take a name off the list. The
   * connected buddy goes through the full teardown first.
   */
  const forgetBuddy = (name: string) => {
    if (state.buddy === name) endPairing();
    patch((s) => {
      const { [name]: _dropped, ...buddyIds } = s.buddyIds;
      // Forgetting a buddy drops the secret too — re-pairing later mints a
      // fresh one, and a stale secret for a name you no longer trust is exactly
      // what should not linger.
      const { [name]: _secret, ...buddySecrets } = s.buddySecrets;
      return { knownBuddies: s.knownBuddies.filter((n) => n !== name), buddyIds, buddySecrets };
    });
  };

  /**
   * Ask a buddy for a session. The radio never connects to someone off the
   * roster on its own, so this is also what opens the link — which is the
   * point: no one lands in a connection they didn't answer for.
   */
  const requestSession = (name: string) =>
    patch({ buddy: name, joinSent: { to: name, state: 'waiting' } });

  /**
   * Re-attach the live session to the buddy's still-running shared one — the
   * way back in after this phone's app died mid shared workout. A session
   * resumes *solo* on purpose (the LIVE keys carry no connection), so
   * re-joining is an act: a button on the buddy's roster row, drawn while
   * their shared broadcasts are flowing. Local state only — the buddy's phone
   * never dropped anything, so the moment `sessionShared` flips, this phone's
   * own broadcasts resume and the two screens converge: their next progress
   * message is whole state by design, and `mergeTurns` / `mergeFirstUp`
   * already decide which side's reset defaults yield.
   *
   * The role comes from their broadcast first — they say which side they are,
   * this phone takes the other. An older build sends none, and the role the
   * session persisted stands in (right whenever the resumed session is the
   * one that was shared); 'guest' is the last resort rather than a coin flip,
   * because the survivor kept the session running the whole time this phone
   * was gone.
   */
  const rejoinSession = () =>
    patch((s) => {
      if (!s.session || s.sessionShared || !s.buddy || !s.buddyProgress) return null;
      const theirs = s.buddyProgress.role;
      const role: 'host' | 'guest' = theirs
        ? theirs === 'host'
          ? 'guest'
          : 'host'
        : (s.sessionRole ?? 'guest');
      return {
        sessionShared: true,
        sessionRole: role,
        buddyJoin: 'joined' as const,
        myBids: {},
        // Land in the workout, not on the row that was tapped — the overlay
        // reappearing over whatever tab this is, buddy lines and all, is the
        // whole confirmation the tap needs.
        sessionMin: false,
      };
    });

  /* — co-created routines (build one together) — */

  /** Open a fresh shared draft; <BuddyRadio> announces it to the buddy. */
  const startCoDraft = () => {
    const L = DICT[state.lang] ?? DICT.en;
    patch((s) => {
      const id = `r${Date.now()}`;
      return {
        routines: [...s.routines, { id, names: { [s.lang]: L.newRoutine }, items: [] }],
        routineOpen: id,
        coDraft: {
          rid: id,
          role: 'starter' as const,
          rev: 0,
          addedBy: {},
          buddyVals: {},
          buddyPicking: false,
        },
      };
    });
  };

  /** The live draft as a wire payload, or null when there is none. */
  const draftPayload = (): DraftPayload | null => {
    const d = state.coDraft;
    const r = d ? state.routines.find((x) => x.id === d.rid) : undefined;
    if (!d || !r) return null;
    return {
      routine: r,
      ...routineClosure(state, r),
      addedBy: d.addedBy,
      picking: state.picker === 'routine' && state.routineOpen === d.rid,
    };
  };

  /**
   * Merge the buddy's draft state in: adopt the structure, keep own
   * reps/weight, remember theirs for the read-only line. `open` pulls this
   * phone into the editor — draftStart does that; draftUpdate only ever
   * applies to a draft this phone already knows (a stale update arriving
   * after the draft ended must not reopen it).
   */
  const applyDraft = (d: DraftPayload, open: boolean) => {
    patch((s) => {
      const deps = upsertShared(s, d);
      const merged = mergeRoutine(
        s.routines.find((r) => r.id === d.routine.id),
        d.routine
      );
      const known = s.coDraft?.rid === merged.id;
      // Adopting a different draft (the both-tapped-at-once tiebreak, see
      // <BuddyRadio>) orphans this phone's own one — drop it if still empty.
      const stale =
        s.coDraft && !known ? s.routines.find((x) => x.id === s.coDraft!.rid) : undefined;
      const base =
        stale && stale.items.length === 0
          ? s.routines.filter((x) => x.id !== stale.id)
          : s.routines;
      // An update that brought exercises this phone didn't have yet gets one
      // echo back (a rev bump → rebroadcast), so the adder learns this
      // phone's reps/weight for them. An echo never carries new items for
      // the peer, so it can't ping-pong.
      const local = s.routines.find((r) => r.id === d.routine.id);
      const gotNew = d.routine.items.some(
        (it) => !(local?.items.some((x) => x.ex === it.ex) ?? false)
      );
      return {
        ...deps,
        routines: upsertRoutine(base, merged),
        coDraft: {
          rid: merged.id,
          role: known ? s.coDraft!.role : ('joiner' as const),
          rev: (known ? s.coDraft!.rev : 0) + (gotNew ? 1 : 0),
          addedBy: d.addedBy,
          buddyVals: Object.fromEntries(
            d.routine.items.map((it) => [it.ex, { reps: it.reps, w: it.w }])
          ),
          buddyPicking: d.picking,
        },
        ...(open ? { routineOpen: merged.id } : {}),
      };
    });
  };

  /**
   * The buddy ended the draft. 'save' keeps the routine on both phones and
   * closes the editor; 'start' also launches it as the guest half of a
   * shared session — no invite round-trip, this phone co-built it.
   */
  const endDraftFromPeer = (reason: 'save' | 'start', d: DraftPayload) => {
    patch((s) => {
      const deps = upsertShared(s, d);
      const merged = mergeRoutine(
        s.routines.find((r) => r.id === d.routine.id),
        d.routine
      );
      const closed = {
        ...deps,
        routines: upsertRoutine(s.routines, merged),
        coDraft: null,
        routineOpen: s.routineOpen === merged.id ? null : s.routineOpen,
        // The draft's picker must not outlive it — a tap in an orphaned
        // routine picker would fall through to the add-to-session branch.
        picker:
          s.picker === 'routine' && s.routineOpen === merged.id ? null : s.picker,
      };
      if (reason === 'save') return closed;
      return {
        ...closed,
        session: sessionFrom({ ...s, custom: deps.custom }, merged),
        active: 0,
        elapsed: 0,
        routineOpen: null,
        summary: null,
        picker: null,
        sessionShared: true,
        sessionRole: 'guest' as const,
        buddyJoin: 'joined' as const,
        buddyProgress: null,
        buddyRest: null,
        turnModes: {},
        firstUp: freshFirstUp(s.firstUpDefault),
        myBids: {},
        // Same reset as `start`: a rest is stamped against `elapsed`, theirs
        // included.
        rest: null,
        sessionMin: false,
      };
    });
  };

  /**
   * Ticked sets, total sets, and total volume for the live session.
   *
   * **Sets are chains and volume is rows**, and the two differ for exactly one
   * reason. `n of m sets` is progress against what the routine asked for, so a
   * drop must not inflate the denominator — an exercise that moved further
   * from being finished every time you dropped would be reporting the opposite
   * of what happened. Volume is a measure of work performed, and a drop is
   * work: 50 × 8 is 400 kg whatever it is part of.
   *
   * (The diary's `n sets` is the third reading and counts rows, because there
   * it is a tally of efforts rather than progress against a plan. Calvin's
   * call, and the two numbers answer different questions.)
   *
   * Only `load` exercises reach the volume: kg × seconds and km × minutes are
   * not units, so adding a plank or a run into that total would quietly make
   * the summary's one number mean nothing.
   */
  const totals = () => {
    const list = state.session?.list ?? [];
    let done = 0;
    let all = 0;
    let vol = 0;
    list.forEach((e) => {
      const counts = measureOf(ex(e.ex)) === 'load';
      const n = setCounts(e.sets);
      all += n.all;
      done += n.done;
      if (counts)
        e.sets.forEach((s) => {
          if (s.done) vol += num(s.w, 0) * num(s.reps, 0);
        });
    });
    return { done, all, vol };
  };

  const clock = fmtClock(state.elapsed);

  const finishSession = () => {
    const L = DICT[state.lang] ?? DICT.en;
    const tot = totals();
    const today = todayISO();
    patch((s) => {
      if (!s.session) return null;

      // Write the ticked numbers back per exercise — these become the "last
      // time" ghosts, replacing the static seed the design shipped with — and
      // keep the same list on the day itself, which is what the plan screen
      // reads back. `lastLog` only ever holds the *latest* session for an
      // exercise; a diary has to remember the ones before it too.
      const lastLog = { ...s.lastLog };
      const lastMarks = { ...s.lastMarks };
      const logged: LoggedExercise[] = [];
      for (const [k, e] of s.session.list.entries()) {
        // An empty left field means bodyweight on a lift or a hold, and an
        // unrecorded distance on a run — same blank, two different facts, so
        // the measure decides which one gets written down. A `duration` set
        // has no left field at all and always takes the dash, which is what
        // keeps its stored string the same shape as everything else.
        const blank = blankOf(measureOf(ex(e.ex)));
        const ticked = e.sets.filter((x) => x.done);
        const sets = ticked.map(
          (x) => `${num(x.w, 0) ? fmt(num(x.w, 0)) : blank} × ${Math.round(num(x.reps, 0))}`
        );
        if (sets.length) {
          // The verdicts ride alongside, one slot per string above — built in
          // the same pass as `sets`, off the same `ticked` array, because two
          // loops are two chances for the indexes to stop describing each
          // other.
          const marks = ticked.map((x) =>
            x.mark
              ? { mark: x.mark, ...(x.note?.trim() ? { note: x.note.trim() } : {}) }
              : null
          );
          const marked = marks.some(Boolean);
          // **The ghost is the working sets only.** `lastLog` is read back
          // index for index by `sessionFrom`, and a drop is an extra row that
          // the routine asking for next week's sets knows nothing about — so
          // one taken off set 2 of 4 would hand set 3 the drop's figure and
          // shift every ghost below it, permanently, for that exercise.
          // `lastMarks` is the same array's verdicts and has to be cut in the
          // same place, or the arrow would be a verdict on a different set.
          //
          // Nothing is lost by it: a drop is a fact about the *day*, and the
          // day keeps its own complete copy below (`sets` / `links`). This
          // one is only the answer to "what did I lift last time", which is a
          // question about the working set.
          //
          // An exercise where nothing but a drop was ticked has no working
          // set to offer, so it falls back to what there is — a ghost of the
          // wrong shape beats no ghost at all, and both keys fall back
          // together so they stay describing each other.
          const work = ticked.flatMap((x, j) => (x.link ? [] : [j]));
          const ghostAt = work.length ? work : ticked.map((_, j) => j);
          const ghostSets = ghostAt.map((j) => sets[j]);
          const ghostMarks = ghostAt.map((j) => marks[j]);
          // Which of the ticked rows were drops, in the same pass off the same
          // array for the same reason. A drop is a fact about how the day went
          // and the numbers alone misreport it: 50 × 8 under 65 × 6 reads as a
          // set that went wrong.
          const links = ticked.map((x) => !!x.link);
          const linked = links.some(Boolean);
          // The day keeps its own copy, and keeps it for good. `lastMarks` is
          // the ghost for *next* time and holds one session per exercise, so
          // an exercise nobody marked this time loses the key rather than
          // keeping it: last month's "go heavier" beside this month's numbers
          // is advice about a session that no longer exists. The entry below
          // is the diary, where that same note is the point.
          logged.push({
            ex: e.ex,
            sets,
            ...(marked ? { marks } : {}),
            ...(linked ? { links } : {}),
            // Only when the partner actually made it into the day: a pair
            // whose second half was never ticked isn't one, and a bracket
            // drawn over a single block would be describing nothing.
            ...(e.with && s.session.list[k + 1]?.sets.some((x) => x.done) ? { with: e.with } : {}),
          });
          lastLog[e.ex] = { date: today, sets: ghostSets };
          // Read off `ghostMarks`, not `marked`: a verdict left on a drop
          // alone is a verdict on no row this map still holds, and writing
          // the key for it would put an arrow beside a set nobody judged.
          if (ghostMarks.some(Boolean)) lastMarks[e.ex] = ghostMarks;
          else delete lastMarks[e.ex];
        }
      }

      return {
        session: null,
        // The rest earned by the final set must not outlive the session:
        // <RestAlarm> stays mounted after finish and would re-arm a fresh
        // full-length alarm off the stale stamp — "Rest over", minutes after
        // the workout ended. The buddy's goes for the plainer reason that
        // there is no longer a row to draw it on.
        rest: null,
        buddyRest: null,
        // Finish is the only way out of a session now that Discard is gone, so
        // it has to carry what Discard did: a session where nothing was ticked
        // never happened, and must not land on the calendar as a training day.
        history: tot.done
          ? [
              ...s.history,
              {
                date: today,
                rid: s.session.rid,
                // The name as it read today. A routine renamed next month must
                // not rewrite what this workout was called when it happened.
                name: s.session.name,
                list: logged,
                secs: s.elapsed,
                vol: Math.round(tot.vol),
                ...(s.sessionShared && s.buddy ? { buddy: s.buddy } : {}),
              },
            ]
          : s.history,
        lastLog,
        lastMarks,
        summary: {
          name: s.session.name,
          stats: [
            { k: L.sets, v: tot.done },
            { k: L.volume, v: Math.round(tot.vol) },
            { k: L.time, v: clock },
          ],
          note: tot.done
            ? L.savedNote.replace('{date}', fmtDayLong(s.lang, new Date()))
            : L.savedEmpty,
          empty: !tot.done,
          saveable:
            s.session.rid === null && s.session.list.length > 0 ? s.session.list : null,
        },
      };
    });
  };

  /**
   * Turn the summary's freeform session into a routine. Each exercise keeps
   * its set count; weight and reps come from the last ticked set (else the
   * last set at all), falling back to the "last time" ghost.
   */
  const saveAsRoutine = (name: string) => {
    patch((s) => {
      if (!s.summary?.saveable) return null;
      // **A drop is not a set a routine can ask for.** `RoutineItem` has no
      // `link` twin — a drop is a decision about how that set went, which
      // nobody makes a week early — so one carried in here would come back
      // next week as an ordinary planned row, *and* at the drop's weight,
      // since it is also the last row the numbers are read off. Both the
      // count and the figures are taken over the working sets only.
      const kept = s.summary.saveable
        .map((e) => ({ e, sets: e.sets.filter((x) => !x.link) }))
        .filter((x) => x.sets.length > 0);
      const items = kept.map(({ e, sets }, k) => {
        const src = [...sets].reverse().find((x) => x.done) ?? sets[sets.length - 1];
        const ghost = prevNums(src.prev);
        return {
          ex: e.ex,
          sets: sets.length,
          reps: Math.round(num(src.reps || ghost.r, 8)),
          w: num(src.w || ghost.w, 0),
          // As above: the pair survives into the routine, but only where its
          // partner did too.
          ...(e.with && k + 1 < kept.length ? { with: e.with } : {}),
        };
      });
      if (items.length === 0) return null;
      const L = DICT[s.lang] ?? DICT.en;
      return {
        routines: [
          ...s.routines,
          { id: `r${Date.now()}`, names: { [s.lang]: name.trim() || L.newRoutine }, items },
        ],
        summary: { ...s.summary, saveable: null, note: L.routineSaved },
      };
    });
  };

  /**
   * Keep a logged day as a routine — the same offer the summary makes, still
   * open a week later from the plan screen.
   *
   * The summary saves the session that is still on screen, sets never ticked
   * included, because that is the shape you built. This saves what actually
   * happened: the ticked sets, and nothing else. Numbers come from the last
   * set of each exercise — the one you finished on, which is the one worth
   * repeating — and there is no ghost to fall back on, because a set that was
   * logged always has its own numbers.
   *
   * A session with no routine of its own is *filed* under the new one as well:
   * a freeform workout, or one whose routine has since been deleted, gets the
   * hole in its history filled in. A session that already belongs to a live
   * routine keeps it — saving a variant under a new name must not rewrite what
   * the day was.
   */
  const saveDayAsRoutine = (i: number, name: string) =>
    patch((s) => {
      const h = s.history[i];
      // The working sets only, for the reason `saveAsRoutine` gives: a routine
      // cannot hold a drop, and the day's last row is usually one — so its
      // weight would become the routine's. `links` is index for index with
      // `sets`, and absent on every entry logged before drops existed.
      const kept = (h?.list ?? [])
        .map((e) => ({ e, sets: e.sets.filter((_, j) => !e.links?.[j]) }))
        .filter((x) => x.sets.length > 0);
      const items = kept.map(({ e, sets }, k) => {
        const n = prevNums(sets[sets.length - 1]);
        return {
          ex: e.ex,
          sets: sets.length,
          reps: Math.round(num(n.r, 8)),
          w: num(n.w, 0),
          // The day was taken as a superset, so the routine made from it is
          // one. Only where the partner survived the filter, or the pair
          // would point at whatever followed it instead.
          ...(e.with && k + 1 < kept.length ? { with: e.with } : {}),
        };
      });
      if (items.length === 0) return null;
      const L = DICT[s.lang] ?? DICT.en;
      const label = name.trim() || L.newRoutine;
      const id = `r${Date.now()}`;
      const orphan = !s.routines.some((r) => r.id === h.rid);
      return {
        routines: [...s.routines, { id, names: { [s.lang]: label }, items }],
        history: orphan
          ? s.history.map((x, k) => (k === i ? { ...x, rid: id, name: label } : x))
          : s.history,
      };
    });

  /**
   * Write an AI plan in — the one place anything from outside reaches the
   * library.
   *
   * **Additive, always.** New `custom` exercises and new `routines`, and
   * nothing else: no edit to an exercise already here, no routine replaced,
   * and `history` / `lastLog` untouched by construction. The worst a bad plan
   * can do is leave rows to delete, which is why the preview can afford to be
   * a preview rather than a warning.
   *
   * `picked` names which routines the user left ticked. An exercise is created
   * only if a ticked routine needs it, so unticking a routine also drops the
   * exercises that came with it rather than seeding the library with orphans
   * from a plan that was turned down.
   *
   * The AI's reps and kilos land as `planned` **only where this phone has no
   * history of its own** for that exercise. Where you have lifted the thing,
   * your own "last time" ghost is the better number and the plan defers to it,
   * exactly as a buddy's figures do (see `mergeRoutine`) — an AI that has
   * never watched you lift does not get to overwrite what you actually did.
   * Where you haven't, its figure is the only one anyone has, and a blank row
   * would throw away the part of the recommendation that was useful.
   */
  const importPlan = (plan: ResolvedPlan, picked: boolean[]) =>
    patch((s) => {
      const wanted = plan.routines.filter((_, i) => picked[i] !== false);
      if (wanted.length === 0) return null;

      const needed = new Set<number>();
      for (const r of wanted) for (const it of r.items) needed.add(it.ref);

      const custom = [...s.custom];
      const stamp = Date.now();
      /** Plan-exercise index → the id it resolved to or was created as. */
      const idOf = new Map<number, string>();
      plan.exercises.forEach((e, i) => {
        if (e.existingId) {
          idOf.set(i, e.existingId);
          return;
        }
        if (!needed.has(i) || !e.create) return;
        const id = `x${stamp}${i}`;
        idOf.set(i, id);
        // The same literal the new-exercise sheet writes, down to `load`
        // staying absent — an imported lift must be indistinguishable from a
        // hand-made one, or it would sync to a buddy as a different shape.
        custom.push({
          id,
          name: e.name,
          names: { [s.lang]: e.name },
          group: e.create.group,
          kind: e.create.kind,
          ...(e.create.measure === 'load' ? {} : { measure: e.create.measure }),
          last: 0,
          lastSets: ['— × —'],
        });
      });

      const routines = [...s.routines];
      wanted.forEach((r, k) => {
        const items = r.items.flatMap((it) => {
          const ex = idOf.get(it.ref);
          if (!ex) return [];
          return [
            {
              ex,
              sets: it.sets,
              reps: it.reps,
              w: it.kg,
              ...(s.lastLog[ex] ? {} : { planned: true as const }),
            },
          ];
        });
        if (items.length) routines.push({ id: `r${stamp}${k}`, names: { [s.lang]: r.name }, items });
      });

      return { custom, routines };
    });

  /* — the elapsed clock, ticking only while a session is open — */

  /**
   * Counted in whole seconds of *wall time*, not in ticks that happened to
   * arrive. Android suspends the JS thread the moment the screen locks, and an
   * interval that adds 1 per firing simply stops — taking the rest countdown
   * with it, since that is measured in `elapsed` (see `rest`). Adding the gap
   * since the last tick instead means a minute spent locked is still a minute.
   *
   * Deliberately a delta rather than a `startedAt` anchor in state: `elapsed: 0`
   * is written from four places, and none of them has to learn a companion
   * field for this to be right — after a reset the clock simply counts up from
   * 0 again, because only the gap since the last tick is ever added.
   *
   * `last` keeps the sub-second remainder, so it can't drift; the AppState
   * listener is what makes the correction land on the frame the screen lights
   * up rather than whenever a throttled interval next fires.
   */
  const hasSession = state.session !== null;
  useEffect(() => {
    if (!hasSession) return;
    let last = Date.now();
    const advance = () => {
      const gained = Math.floor((Date.now() - last) / 1000);
      if (gained <= 0) return;
      last += gained * 1000;
      patch((s) => ({ elapsed: s.elapsed + gained }));
    };
    const id = setInterval(advance, 1000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') advance();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [hasSession, patch]);

  const L: Strings = DICT[state.lang] ?? DICT.en;

  // Deliberately a fresh object each render. Every consumer reads state, so
  // every consumer should re-render when it changes — memoising here would only
  // add bookkeeping for no saved work.
  return {
    s: state,
    L,
    /** False until the stored blob is in — the splash waits on it, so a
        light-mode phone doesn't flash the dark palette on every launch. */
    hydrated,
    patch,
    allEx,
    ex,
    routine,
    gInfo,
    kInfo,
    exInfo,
    rInfo,
    lastFor,
    doneOn,
    sessionsOn,
    loggedThisMonth,
    setup,
    cues,
    mutSetup,
    mutCues,
    editEx,
    exEdited,
    resetEx,
    tipShown,
    tipDone,
    resetTips,
    mutSession,
    addSessionEx,
    adoptBuddyEx,
    removeSessionEx,
    moveSessionStop,
    mutRoutine,
    deleteRoutine,
    moveRoutineItem,
    reorder,
    importFromPeer,
    markBuddySynced,
    exportState,
    importState,
    previewRestore,
    mergeState,
    start,
    acceptInvite,
    declineInvite,
    turnMode,
    toggleTurnMode,
    mergeTurnModes,
    setFirstUp,
    mergeFirstUpFrom,
    bidFirst,
    rememberBuddy,
    recordBuddySecret,
    endPairing,
    forgetBuddy,
    requestSession,
    rejoinSession,
    applyOnboarding,
    addPlan,
    editPlan,
    swapPlanDay,
    skipPlanDay,
    restorePlanDay,
    dropPlan,
    addSeedRoutine,
    startCoDraft,
    draftPayload,
    applyDraft,
    endDraftFromPeer,
    totals,
    clock,
    finishSession,
    saveAsRoutine,
    saveDayAsRoutine,
    importPlan,
  };
}

export type Store = ReturnType<typeof useWorkoutState>;

const StoreContext = createContext<Store | null>(null);

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const store = useWorkoutState();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <WorkoutProvider>');
  return store;
}
