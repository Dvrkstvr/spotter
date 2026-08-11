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
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
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
import { todayDom, todayISO } from '@/data/date';
import { deviceInstallId, randomInstallId } from '@/data/identity';
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
};
export type SessionExercise = { ex: string; sets: LoggedSet[] };
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
/** One exercise as it was actually logged: the ticked sets, in order. */
export type LoggedExercise = { ex: string; sets: string[] };
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
  /** day-of-week index → routine id */
  schedule: Record<number, string>;
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
  daySel: number;
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
   * `src/data/rest-alarm.ts`.
   */
  restAlert: boolean;
  /**
   * Train alone. The whole buddy half of the app — the radio, the roster, the
   * bars, every sheet that can interrupt you — is hidden and switched off.
   * `knownBuddies` survives it: this is a curtain, not a divorce.
   */
  privateMode: boolean;
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
   * Why your next set isn't yours yet. `at` is the session clock the wait
   * started on — counting in `elapsed` ticks rather than wall time keeps the
   * countdown pure and re-renders it for free. `skipped` is the user saying
   * they're ready before the clock agrees.
   *
   * `own` separates the two waits that look alike: a rest you earned by
   * finishing a set — every logged set earns one, buddy or not — runs its
   * full length whatever the buddy does, while a
   * wait that only exists because it's their turn ends the moment the turn
   * comes back — otherwise the guest of a fresh session would be held three
   * minutes for a set they never did.
   */
  rest: { at: number; skipped: boolean; own: boolean } | null;
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
  pickWorkout: boolean;
  /** day-of-week index whose scheduled routine is being picked, or null */
  dayPick: number | null;
  groups: Labelled[];
  kinds: Labelled[];
  /** image-slot fills, keyed by slot id. The design persists these to a sidecar. */
  images: Record<string, string>;
};

const initialState: State = {
  routines: DEFAULT_ROUTINES.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) })),
  schedule: { 0: 'chest', 2: 'back', 4: 'both' },
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
  daySel: todayDom(),
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
  privateMode: false,
  onboarded: true,
  onboardingOpen: false,
  style: 'mixed',
  level: 'regular',
  settingsOpen: false,
  statsOpen: false,
  coachOpen: false,
  coach: { ...DEFAULT_COACH, kinds: [...DEFAULT_COACH.kinds] },
  scanning: false,
  // ANDROID_ID resolves at module load and never changes; the random
  // fallback is minted once here and then pinned by persistence.
  selfId: deviceInstallId() ?? randomInstallId(),
  buddy: null,
  knownBuddies: [],
  buddyIds: {},
  buddySync: false,
  buddySyncPending: false,
  nearbyPeers: [],
  buddyEndpoint: null,
  pendingAuth: null,
  buddySnapshot: null,
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
  coDraft: null,
  sessionMin: false,
  buddyFocus: false,
  pickWorkout: false,
  dayPick: null,
  groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
  kinds: DEFAULT_KINDS.map((k) => ({ ...k })),
  images: {},
};

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
 * not listed is transient UI (open overlays, the live session, the clock) and
 * deliberately reseeds. `buddy` stays out too: it names a live Bluetooth
 * connection, and a connection does not survive an app restart.
 */

// Keeps the pre-Spotter name: this key is where the training already logged on
// a phone lives. Renaming it to match the app would read as a first run and
// silently strand every session behind the old key.
/** The number a backup is stamped with, so an old one can be lifted forward. */
export const STORAGE_VERSION = 3;

const STORAGE_KEY = 'workout-diary/v3';
/** v3 widened the seeded muscle groups; v2 added per-language names. */
const STORAGE_KEY_V2 = 'workout-diary/v2';
const STORAGE_KEY_V1 = 'workout-diary/v1';

// Additive only: `filterPersisted` skips keys a stored blob doesn't have, so a
// phone that has been logging since v2 keeps its data and starts the new maps
// empty. Anything that changes the *shape* of an existing key needs a version.
const PERSIST = [
  'routines', 'schedule', 'history', 'lastLog', 'lastMarks', 'custom', 'profile',
  'setups', 'videos', 'lang', 'groups', 'kinds', 'images', 'exEdits', 'cueEdits',
  'knownBuddies', 'buddyIds', 'selfId', 'themeMode', 'theme', 'restSeconds', 'firstUpDefault',
  'haptics', 'restAlert', 'privateMode', 'onboarded', 'style', 'level', 'coach',
] as const satisfies readonly (keyof State)[];

type Persisted = Pick<State, (typeof PERSIST)[number]>;

const pickPersisted = (s: State): Persisted => {
  const out = {} as Persisted;
  for (const k of PERSIST) (out as Record<string, unknown>)[k] = s[k];
  return out;
};

/** Keep only known durable keys, so stale blobs can't resurrect UI state. */
const filterPersisted = (raw: unknown): Partial<State> => {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, unknown> = {};
  for (const k of PERSIST) if (k in raw) out[k] = (raw as Record<string, unknown>)[k];
  // A theme that no longer exists would leave the palette wherever it was;
  // drop the name and let the seeded default win instead.
  if ('theme' in out && !isThemeName(out.theme)) delete out.theme;
  return out as Partial<State>;
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
 * Lift a v1 blob (single `label` / `name` strings) to v2 per-language names.
 * An untouched default regains its seeded translations; anything the user
 * named is filed under the blob's language, since that is what they typed in.
 */
const migrateV1 = (raw: unknown): Partial<State> => {
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

  return filterPersisted(blob);
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

/* ── store ─────────────────────────────────────────────────────────────── */

function useWorkoutState() {
  const [state, setState] = useState<State>(initialState);
  // False until the stored blob has been merged in; saving waits for it so a
  // fresh launch can never overwrite real data with the seed.
  const [hydrated, setHydrated] = useState(false);

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
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (raw) return filterPersisted(JSON.parse(raw));
        // No v3 blob yet — walk back through the older keys, lifting whatever
        // is there through every migration since. Each key is left where it
        // is; the next save writes v3 alongside it.
        const v2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
        if (v2) return migrateV2(filterPersisted(JSON.parse(v2)));
        const v1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
        return v1 ? migrateV2(migrateV1(JSON.parse(v1))) : null;
      })
      .then((data) => {
        // `null` here is the one thing `initialState` cannot know: the read
        // succeeded and there was nothing at any version, so this phone has
        // never run the app. That — and only that — is when the OS gets to
        // pick the language and the light/dark mode.
        if (alive) patch(data ?? firstRunDefaults());
      })
      .catch(() => {}) // unreadable blob → run on the seed rather than crash
      .finally(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [patch]);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersisted(state))).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [state, hydrated]);

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
      const list = s.session.list.filter((_, k) => k !== i);
      return {
        session: { ...s.session, list },
        active: Math.max(0, Math.min(s.active > i ? s.active - 1 : s.active, list.length - 1)),
      };
    });

  /**
   * Delete a routine. The schedule slots pointing at it clear, a co-draft of
   * it ends, and the editor closes with it. `history` is untouched on
   * purpose: entries carry the name frozen at log time, and a deleted rid
   * there is already the "routine deleted since" case the plan screen and
   * save-as-routine both handle.
   */
  /**
   * Write everything the first-run flow decided, in one patch.
   *
   * The routine list is the delicate part, because this can run twice — the
   * flow is reachable again from Settings. `picked` names *seed* routines:
   * each one lands as a fresh copy of its `DEFAULT_ROUTINES` original with
   * the level scaling applied, replacing any same-id copy already here (that
   * is what "run setup again" means). Everything the user made themselves —
   * saved-as-routine, built with a buddy, id not in the seed set — survives
   * untouched, in place. An *unpicked* seed that exists on the phone is
   * dropped, exactly as `deleteRoutine` would: unticking it is the same
   * decision made in a different room. `history`, `lastLog` and `custom` are
   * never in the patch — a tour must not be able to eat a diary.
   *
   * Scaled numbers are written `planned` (below `regular` only), so the first
   * session opens with them in the fields — an unplanned row defers to "last
   * time", and a brand-new user's "last time" is the seed data's, which is
   * exactly the number the level exists to shrink.
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
        .map((r) => ({
          ...r,
          names: { ...r.names },
          items: r.items.map((it) => {
            const scaled = scaleItem(it, measureOf(ex(it.ex)), o.level);
            return o.level === 'regular' ? scaled : { ...scaled, planned: true as const };
          }),
        }));
      const seedIds = new Set(DEFAULT_ROUTINES.map((r) => r.id));
      const kept = s.routines.filter((r) => !seedIds.has(r.id));
      const routines = [...seeds, ...kept];
      // The week step only ever offers picked routines, but the schedule is
      // re-checked anyway: a slot pointing at a routine this patch just
      // dropped would be the plan screen's deleted-rid case, created here.
      const ids = new Set(routines.map((r) => r.id));
      const schedule = Object.fromEntries(
        Object.entries(o.week).filter(([, rid]) => ids.has(rid))
      );
      return {
        profile: o.profile,
        style: o.style,
        level: o.level,
        routines,
        schedule,
        onboarded: true,
        onboardingOpen: false,
      };
    });

  const deleteRoutine = (rid: string) =>
    patch((s) => ({
      routines: s.routines.filter((r) => r.id !== rid),
      schedule: Object.fromEntries(Object.entries(s.schedule).filter(([, v]) => v !== rid)),
      ...(s.coDraft?.rid === rid ? { coDraft: null } : {}),
      routineOpen: s.routineOpen === rid ? null : s.routineOpen,
    }));

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

  /* — session lifecycle — */

  const start = (rid: string | null | undefined, withBuddy?: 'host' | 'guest') => {
    patch((s) => {
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
        pickWorkout: false,
        // Solo by default — <BuddyRadio> flips this to a hosted shared
        // session right after, if a buddy is connected. `withBuddy` is the
        // co-draft path, where both sides already agreed: it starts shared
        // outright, which also tells <BuddyRadio> not to send an invite.
        sessionShared: withBuddy !== undefined,
        sessionRole: withBuddy ?? null,
        buddyJoin: withBuddy ? ('joined' as const) : null,
        buddyProgress: null,
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
        pickWorkout: false,
        sessionShared: true,
        sessionRole: 'guest',
        buddyJoin: null,
        buddyProgress: null,
        turnModes: {},
        // The host's register arrives with their next broadcast and wins the
        // rev-0 tie, so this is only what the guest shows for one message.
        firstUp: freshFirstUp(s.firstUpDefault),
        myBids: {},
        // The clock this rest was stamped against is being set back to zero.
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

  /** The durable slice, ready to be wrapped in an envelope and written out. */
  const exportState = (): Record<string, unknown> =>
    pickPersisted(state) as unknown as Record<string, unknown>;

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
  const importState = (env: { v: number; data: Record<string, unknown> }): number => {
    let data = filterPersisted(env.data);
    if (env.v < 3) data = migrateV2(env.v < 2 ? migrateV1(env.data) : data);
    const restored = { ...pickPersisted(initialState), ...data };
    patch(restored);
    // The envelope proves the file is ours, not that every key inside it
    // survived whatever edited it since.
    return Array.isArray(restored.history) ? restored.history.length : 0;
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
        return {
          knownBuddies: [...s.knownBuddies.filter((n) => n !== oldName && n !== name), name],
          buddyIds: { ...rest, [name]: id! },
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
      return { knownBuddies: s.knownBuddies.filter((n) => n !== name), buddyIds };
    });
  };

  /**
   * Ask a buddy for a session. The radio never connects to someone off the
   * roster on its own, so this is also what opens the link — which is the
   * point: no one lands in a connection they didn't answer for.
   */
  const requestSession = (name: string) =>
    patch({ buddy: name, joinSent: { to: name, state: 'waiting' } });

  /* — co-created routines (build one together) — */

  /** Open a fresh shared draft; <BuddyRadio> announces it to the buddy. */
  const startCoDraft = () => {
    const L = DICT[state.lang] ?? DICT.en;
    patch((s) => {
      const id = `r${Date.now()}`;
      return {
        routines: [...s.routines, { id, names: { [s.lang]: L.newRoutine }, items: [] }],
        routineOpen: id,
        pickWorkout: false,
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
        ...(open ? { routineOpen: merged.id, pickWorkout: false } : {}),
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
        pickWorkout: false,
        sessionShared: true,
        sessionRole: 'guest' as const,
        buddyJoin: 'joined' as const,
        buddyProgress: null,
        turnModes: {},
        firstUp: freshFirstUp(s.firstUpDefault),
        myBids: {},
        // Same reset as `start`: a rest is stamped against `elapsed`.
        rest: null,
        sessionMin: false,
      };
    });
  };

  /**
   * Ticked sets, total sets, and total volume for the live session.
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
      e.sets.forEach((s) => {
        all++;
        if (s.done) {
          done++;
          if (counts) vol += num(s.w, 0) * num(s.reps, 0);
        }
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
      for (const e of s.session.list) {
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
          lastLog[e.ex] = { date: today, sets };
          logged.push({ ex: e.ex, sets });
          // The verdicts ride alongside, one slot per string above. An
          // exercise nobody marked this time loses the key rather than
          // keeping it: last month's "go heavier" beside this month's
          // numbers is advice about a session that no longer exists.
          const marks = ticked.map((x) =>
            x.mark
              ? { mark: x.mark, ...(x.note?.trim() ? { note: x.note.trim() } : {}) }
              : null
          );
          if (marks.some(Boolean)) lastMarks[e.ex] = marks;
          else delete lastMarks[e.ex];
        }
      }

      return {
        session: null,
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
      const items = s.summary.saveable
        .filter((e) => e.sets.length > 0)
        .map((e) => {
          const src = [...e.sets].reverse().find((x) => x.done) ?? e.sets[e.sets.length - 1];
          const ghost = prevNums(src.prev);
          return {
            ex: e.ex,
            sets: e.sets.length,
            reps: Math.round(num(src.reps || ghost.r, 8)),
            w: num(src.w || ghost.w, 0),
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
      const items = (h?.list ?? [])
        .filter((e) => e.sets.length > 0)
        .map((e) => {
          const n = prevNums(e.sets[e.sets.length - 1]);
          return {
            ex: e.ex,
            sets: e.sets.length,
            reps: Math.round(num(n.r, 8)),
            w: num(n.w, 0),
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
    mutSession,
    removeSessionEx,
    mutRoutine,
    deleteRoutine,
    moveRoutineItem,
    reorder,
    importFromPeer,
    exportState,
    importState,
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
    endPairing,
    forgetBuddy,
    requestSession,
    applyOnboarding,
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
