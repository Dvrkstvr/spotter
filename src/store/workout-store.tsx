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

import type {
  BuddyProgress,
  DraftPayload,
  SessionInvite,
  SyncItem,
  TurnChoice,
  TurnMode,
} from '@/data/buddy-sync';
import type { BuddySnapshot } from '@/data/buddy-transport';
import { mergeTurns, routineClosure } from '@/data/buddy-sync';
import { todayDom, todayISO } from '@/data/date';
import {
  DEFAULT_GROUPS,
  DEFAULT_KINDS,
  DEFAULT_ROUTINES,
  EX,
  Exercise,
  INFO,
  Routine,
  SetupPair,
  V2_GROUP_KEYS,
} from '@/data/exercises';
import { DICT, fmtDayLong, Lang, LangMap, Strings } from '@/data/i18n';
import { isThemeName, ThemeMode, ThemeName } from '@/design/tokens';

/* ── types ─────────────────────────────────────────────────────────────── */

export type LoggedSet = { w: string; reps: string; done: boolean; prev: string };
export type SessionExercise = { ex: string; sets: LoggedSet[] };
export type Session = { rid: string | null; name: string; list: SessionExercise[] };
export type Summary = {
  name: string;
  stats: { k: string; v: string | number }[];
  note: string;
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
export type Draft = { name: string; group: string; kind: string };
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
/** One finished session: which local day it landed on, and from which routine. */
export type HistoryEntry = { date: string; rid: string | null };
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
  /** Vibrate on the moments worth feeling: a set ticked, a rest run out. */
  haptics: boolean;
  /**
   * Train alone. The whole buddy half of the app — the radio, the roster, the
   * bars, every sheet that can interrupt you — is hidden and switched off.
   * `knownBuddies` survives it: this is a curtain, not a divorce.
   */
  privateMode: boolean;
  settingsOpen: boolean;
  scanning: boolean;
  buddy: string | null;
  /**
   * Everyone this phone has paired with, by display name. The pairing is the
   * durable half of a buddy — the connection isn't — so this is what survives
   * a restart and what the radio goes looking for. Nothing removes a name but
   * the user: the list is how you see who is around when you run into each
   * other, which only works if it outlasts every link that ever dropped.
   */
  knownBuddies: string[];
  /** whether the buddy-sync overlay is open */
  buddySync: boolean;
  /** pairing confirmed, snapshot not here yet — it decides if the sync screen opens */
  buddySyncPending: boolean;
  /** live radio state (real transport only; all transient) */
  nearbyPeers: { endpointId: string; name: string }[];
  buddyEndpoint: string | null;
  /** a connection awaiting the users' code check — both phones confirm */
  pendingAuth: { endpointId: string; name: string; digits: string; incoming: boolean } | null;
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
  daySel: todayDom(),
  custom: [],
  exEdits: {},
  cueEdits: {},
  creating: null,
  profile: { name: '', age: '', weight: '', height: '' },
  setups: {},
  videos: {},
  instrOpen: null,
  lang: 'en',
  // Dark, not 'system': the app was dark-only until now, so a phone that has
  // been logging for months must not turn white because of an update. Anyone
  // who wants the OS to decide can say so in Settings.
  themeMode: 'dark',
  theme: 'blurple',
  restSeconds: 180,
  haptics: true,
  privateMode: false,
  settingsOpen: false,
  scanning: false,
  buddy: null,
  knownBuddies: [],
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
  'routines', 'schedule', 'history', 'lastLog', 'custom', 'profile',
  'setups', 'videos', 'lang', 'groups', 'kinds', 'images', 'exEdits', 'cueEdits',
  'knownBuddies', 'themeMode', 'theme', 'restSeconds', 'haptics', 'privateMode',
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

/** Split a "70 × 8" summary back into its weight and reps. BW counts as 0. */
export const prevNums = (prev: string) => {
  const m = String(prev).split('×');
  return { w: (m[0] || '').trim().replace('BW', '0'), r: (m[1] || '').trim() };
};

/** Build a fresh session from a routine, with "last time" ghosts filled in. */
const sessionFrom = (s: State, r: Routine): Session => {
  const lastOf = (id: string) =>
    s.lastLog[id]?.sets ?? [...EX, ...s.custom].find((e) => e.id === id)?.lastSets ?? [];
  return {
    rid: r.id,
    name: resolveNames(r.names, s.lang).text,
    list: r.items.map((it) => {
      const last = lastOf(it.ex);
      return {
        ex: it.ex,
        sets: Array.from({ length: it.sets }, (_, k) => ({
          w: '',
          reps: '',
          done: false,
          prev: last[k] || last[0] || `${fmt(it.w)} × ${it.reps}`,
        })),
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
 */
const mergeRoutine = (local: Routine | undefined, incoming: Routine): Routine => ({
  ...incoming,
  items: incoming.items.map((it) => {
    const mine = local?.items.find((x) => x.ex === it.ex);
    return mine ? { ...it, reps: mine.reps, w: mine.w } : { ...it };
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
        if (alive && data) patch(data);
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

  /** "Last time" for an exercise — really logged history first, then the seed. */
  const lastFor = (id: string): { date: string | null; sets: string[] } => {
    const logged = state.lastLog[id];
    if (logged) return { date: logged.date, sets: logged.sets };
    return { date: null, sets: ex(id)?.lastSets ?? [] };
  };

  /** Whether a given local day (ISO) has a logged session. */
  const doneOn = (iso: string) => state.history.some((h) => h.date === iso);

  /** Distinct days with a logged session in the current month. */
  const loggedThisMonth = () => {
    const prefix = todayISO().slice(0, 8); // 'YYYY-MM-'
    return new Set(state.history.map((h) => h.date).filter((d) => d.startsWith(prefix))).size;
  };

  /** The machine settings for an exercise — the user's edits, else the defaults. */
  const setup = (id: string): SetupPair[] =>
    state.setups[id] ?? (INFO[id]?.setup ?? []).map((p) => [...p] as SetupPair);

  /** The cues for an exercise — the user's rewrite, else the seeded ones. */
  const cues = (id: string) => state.cueEdits[id] ?? INFO[id]?.cues ?? [];

  const mutSetup = (id: string, fn: (rows: SetupPair[]) => void) => {
    patch((s) => {
      const cur = (s.setups[id] ?? INFO[id]?.setup ?? []).map((p) => [...p] as SetupPair);
      fn(cur);
      return { setups: { ...s.setups, [id]: cur } };
    });
  };

  const mutCues = (id: string, fn: (rows: string[]) => void) => {
    patch((s) => {
      const cur = [...(s.cueEdits[id] ?? INFO[id]?.cues ?? [])];
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

  /** Remember a buddy we just paired with, so the radio can find them again. */
  const rememberBuddy = (name: string) =>
    patch((s) =>
      s.knownBuddies.includes(name) ? null : { knownBuddies: [...s.knownBuddies, name] }
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
    patch(() => ({
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
      coDraft: null,
    }));

  /**
   * Unpair for good — the one thing that does take a name off the list. The
   * connected buddy goes through the full teardown first.
   */
  const forgetBuddy = (name: string) => {
    if (state.buddy === name) endPairing();
    patch((s) => ({ knownBuddies: s.knownBuddies.filter((n) => n !== name) }));
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
        // Same reset as `start`: a rest is stamped against `elapsed`.
        rest: null,
        sessionMin: false,
      };
    });
  };

  /** Ticked sets, total sets, and total volume for the live session. */
  const totals = () => {
    const list = state.session?.list ?? [];
    let done = 0;
    let all = 0;
    let vol = 0;
    list.forEach((e) =>
      e.sets.forEach((s) => {
        all++;
        if (s.done) {
          done++;
          vol += num(s.w, 0) * num(s.reps, 0);
        }
      })
    );
    return { done, all, vol };
  };

  const mm = String(Math.floor(state.elapsed / 60)).padStart(2, '0');
  const ss = String(state.elapsed % 60).padStart(2, '0');
  const clock = `${mm}:${ss}`;

  const finishSession = () => {
    const L = DICT[state.lang] ?? DICT.en;
    const tot = totals();
    const today = todayISO();
    patch((s) => {
      if (!s.session) return null;

      // Write the ticked numbers back per exercise — these become the "last
      // time" ghosts, replacing the static seed the design shipped with.
      const lastLog = { ...s.lastLog };
      for (const e of s.session.list) {
        const sets = e.sets
          .filter((x) => x.done)
          .map((x) => `${num(x.w, 0) ? fmt(num(x.w, 0)) : 'BW'} × ${Math.round(num(x.reps, 0))}`);
        if (sets.length) lastLog[e.ex] = { date: today, sets };
      }

      return {
        session: null,
        // Finish is the only way out of a session now that Discard is gone, so
        // it has to carry what Discard did: a session where nothing was ticked
        // never happened, and must not land on the calendar as a training day.
        history: tot.done
          ? [...s.history, { date: today, rid: s.session.rid }]
          : s.history,
        lastLog,
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

  /* — the elapsed clock, ticking only while a session is open — */

  const hasSession = state.session !== null;
  useEffect(() => {
    if (!hasSession) return;
    const id = setInterval(() => patch((s) => ({ elapsed: s.elapsed + 1 })), 1000);
    return () => clearInterval(id);
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
    loggedThisMonth,
    setup,
    cues,
    mutSetup,
    mutCues,
    editEx,
    exEdited,
    resetEx,
    mutSession,
    mutRoutine,
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
    rememberBuddy,
    endPairing,
    forgetBuddy,
    requestSession,
    startCoDraft,
    draftPayload,
    applyDraft,
    endDraftFromPeer,
    totals,
    clock,
    finishSession,
    saveAsRoutine,
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
