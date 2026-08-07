/**
 * The app's single source of truth.
 *
 * This is a direct port of the design's `Component` class: the same state
 * shape, the same mutators, the same derived values. `patch()` stands in for
 * the class's `setState` — partial merge, optional updater function.
 *
 * State is in-memory only, exactly as the design is. Nothing survives a reload
 * yet; persistence is the obvious next step but is not part of this design.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

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
import { DICT, Lang, Strings } from '@/data/i18n';
import { TODAY_DOM } from '@/design/tokens';

/* ── types ─────────────────────────────────────────────────────────────── */

export type LoggedSet = { w: string; reps: string; done: boolean; prev: string };
export type SessionExercise = { ex: string; sets: LoggedSet[] };
export type Session = { rid: string | null; name: string; list: SessionExercise[] };
export type Summary = { name: string; stats: { k: string; v: string | number }[]; note: string };
export type Labelled = { key: string; label: string };
export type Draft = { name: string; group: string; kind: string };
export type Profile = { name: string; age: string; weight: string; height: string };
export type PickerMode = 'routine' | 'session' | null;

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
  /** days of the month with a logged session */
  done: number[];
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
  done: [3, 5],
  daySel: 7,
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
  groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
  kinds: DEFAULT_KINDS.map((k) => ({ ...k })),
  images: {},
};

type Patch = Partial<State> | ((s: State) => Partial<State> | null);

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

  /* — lookups — */

  const allEx = () => [...EX, ...state.custom];
  const ex = (id: string) => allEx().find((e) => e.id === id);
  const routine = (id: string | null | undefined) => state.routines.find((r) => r.id === id);
  const gLabel = (key: string) => state.groups.find((x) => x.key === key)?.label ?? key;
  const kLabel = (key: string) => state.kinds.find((x) => x.key === key)?.label ?? key;

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
    const lookup = (id: string) => allEx().find((e) => e.id === id)!;
    patch({
      session: {
        rid: rid ?? null,
        name: r ? r.name : (DICT[state.lang] ?? DICT.en).freeSession,
        list: (r ? r.items : []).map((it) => ({
          ex: it.ex,
          sets: Array.from({ length: it.sets }, (_, k) => ({
            w: '',
            reps: '',
            done: false,
            prev:
              lookup(it.ex).lastSets[k] ||
              lookup(it.ex).lastSets[0] ||
              `${fmt(it.w)} × ${it.reps}`,
          })),
        })),
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
    patch((s) => {
      if (!s.session) return null;
      return {
        session: null,
        done: s.done.includes(TODAY_DOM) ? s.done : [...s.done, TODAY_DOM],
        summary: {
          name: s.session.name,
          stats: [
            { k: L.sets, v: tot.done },
            { k: L.volume, v: Math.round(tot.vol) },
            { k: L.time, v: clock },
          ],
          note: tot.done ? L.savedNote : L.savedEmpty,
        },
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
