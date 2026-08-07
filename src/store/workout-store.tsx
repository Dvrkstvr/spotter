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
} from '@/data/exercises';
import { DICT, fmtDayLong, Lang, Strings } from '@/data/i18n';

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
export type Labelled = { key: string; label: string };
export type Draft = { name: string; group: string; kind: string };
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
  editing: boolean;
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
  creating: Draft | null;
  profile: Profile;
  setups: Record<string, SetupPair[]>;
  videos: Record<string, string>;
  instrOpen: string | null;
  lang: Lang;
  settingsOpen: boolean;
  scanning: boolean;
  buddy: string | null;
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
  editing: false,
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
  creating: null,
  profile: { name: '', age: '', weight: '', height: '' },
  setups: {},
  videos: {},
  instrOpen: null,
  lang: 'en',
  settingsOpen: false,
  scanning: false,
  buddy: null,
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

const STORAGE_KEY = 'workout-diary/v1';

const PERSIST = [
  'routines', 'schedule', 'history', 'lastLog', 'custom', 'profile',
  'setups', 'videos', 'lang', 'groups', 'kinds', 'images',
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
  return out as Partial<State>;
};

/* ── pure helpers (shared with screens) ────────────────────────────────── */

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
      .then((raw) => {
        if (alive && raw) patch(filterPersisted(JSON.parse(raw)));
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

  const allEx = () => [...EX, ...state.custom];
  const ex = (id: string) => allEx().find((e) => e.id === id);
  const routine = (id: string | null | undefined) => state.routines.find((r) => r.id === id);
  const gLabel = (key: string) => state.groups.find((x) => x.key === key)?.label ?? key;
  const kLabel = (key: string) => state.kinds.find((x) => x.key === key)?.label ?? key;

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

  const cues = (id: string) => INFO[id]?.cues ?? [];

  const mutSetup = (id: string, fn: (rows: SetupPair[]) => void) => {
    patch((s) => {
      const cur = (s.setups[id] ?? INFO[id]?.setup ?? []).map((p) => [...p] as SetupPair);
      fn(cur);
      return { setups: { ...s.setups, [id]: cur } };
    });
  };

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
    }));
  };

  /** Reorder one of the settings lists. Replaces the design's HTML5 drag state. */
  const reorder = (listKey: 'groups' | 'kinds', from: number, to: number) => {
    patch((s) => {
      const a = [...s[listKey]];
      const [moved] = a.splice(from, 1);
      a.splice(to, 0, moved);
      return { [listKey]: a } as Partial<State>;
    });
  };

  /* — session lifecycle — */

  const start = (rid: string | null | undefined) => {
    const r = rid ? state.routines.find((x) => x.id === rid) : null;
    patch({
      session: {
        rid: rid ?? null,
        name: r ? r.name : (DICT[state.lang] ?? DICT.en).freeSession,
        list: (r ? r.items : []).map((it) => {
          const last = lastFor(it.ex).sets;
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
      },
      active: 0,
      elapsed: 0,
      routineOpen: null,
      summary: null,
      picker: null,
      pickWorkout: false,
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
        history: [...s.history, { date: today, rid: s.session.rid }],
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
          { id: `r${Date.now()}`, name: name.trim() || L.newRoutine, items },
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
    patch,
    allEx,
    ex,
    routine,
    gLabel,
    kLabel,
    lastFor,
    doneOn,
    loggedThisMonth,
    setup,
    cues,
    mutSetup,
    mutSession,
    mutRoutine,
    reorder,
    start,
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
