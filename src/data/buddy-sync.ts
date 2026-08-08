/**
 * The buddy diff — what two devices would have to exchange to agree.
 *
 * Pure functions over the shareable slice: whole items one side lacks
 * (matched by key/id — defaults share keys everywhere, synced items keep the
 * key they were created with), and per-language names where both sides have
 * the item but only one side has a language filled (the #4 alias model is
 * what makes "missing translation" well-defined).
 */
import type { BuddySnapshot } from '@/data/buddy-transport';
import type { Exercise, Routine } from '@/data/exercises';
import type { Lang, LangMap } from '@/data/i18n';
import type { Labelled } from '@/store/workout-store';

export type SyncSide = {
  groups: Labelled[];
  kinds: Labelled[];
  custom: Exercise[];
  routines: Routine[];
};

export type SyncItemType = 'group' | 'kind' | 'exercise' | 'routine';

export type SyncItem =
  | {
      kind: 'item';
      type: SyncItemType;
      /** key/id of the entity on the side that has it */
      key: string;
      /** display names of the thing being transferred */
      names: LangMap;
      fallback: string;
    }
  | {
      kind: 'translation';
      type: SyncItemType;
      key: string;
      /** the language being filled in, and the name that fills it */
      lang: Lang;
      text: string;
      /** the existing names on the side that lacks the language, for display */
      names: LangMap;
      fallback: string;
    };

export type BuddyDiff = {
  /** on the peer, missing here — importable for real */
  receive: SyncItem[];
  /** here, missing on the peer — mock transport, send is simulated */
  send: SyncItem[];
};

/** A stable identity for list keys and "already transferred" bookkeeping. */
export const syncItemId = (i: SyncItem) =>
  i.kind === 'item' ? `${i.type}:${i.key}` : `t:${i.type}:${i.key}:${i.lang}`;

const LANGS: Lang[] = ['en', 'de'];

function oneWay(from: SyncSide, to: SyncSide): SyncItem[] {
  const out: SyncItem[] = [];

  const walk = <T>(
    type: SyncItemType,
    fromList: T[],
    toList: T[],
    keyOf: (x: T) => string,
    namesOf: (x: T) => LangMap,
    fallbackOf: (x: T) => string
  ) => {
    for (const item of fromList) {
      const other = toList.find((x) => keyOf(x) === keyOf(item));
      if (!other) {
        out.push({
          kind: 'item',
          type,
          key: keyOf(item),
          names: namesOf(item),
          fallback: fallbackOf(item),
        });
        continue;
      }
      // Both sides have it — languages filled here but not there transfer.
      for (const lang of LANGS) {
        const text = namesOf(item)[lang]?.trim();
        if (text && !namesOf(other)[lang]?.trim())
          out.push({
            kind: 'translation',
            type,
            key: keyOf(item),
            lang,
            text,
            names: namesOf(other),
            fallback: fallbackOf(other),
          });
      }
    }
  };

  walk('group', from.groups, to.groups, (g) => g.key, (g) => g.labels, () => '');
  walk('kind', from.kinds, to.kinds, (k) => k.key, (k) => k.labels, () => '');
  walk('exercise', from.custom, to.custom, (e) => e.id, (e) => e.names ?? {}, (e) => e.name);
  walk('routine', from.routines, to.routines, (r) => r.id, (r) => r.names, () => '');

  return out;
}

export const diffBuddy = (local: SyncSide, peer: BuddySnapshot): BuddyDiff => ({
  receive: oneWay(peer, local),
  send: oneWay(local, peer),
});

/** The shareable slice of a device's state — what a snapshot carries. */
export const shareableSlice = (s: SyncSide): SyncSide => ({
  groups: s.groups,
  kinds: s.kinds,
  custom: s.custom,
  routines: s.routines,
});

/* ── shared sessions ───────────────────────────────────────────────────── */

/**
 * One phone's live session state, as broadcast to the buddy. Always the full
 * state, never an event stream — receiving any one message is enough to be
 * caught up, which is what makes reconnecting after a drop trivial.
 */
export type BuddyProgress = {
  rid: string | null;
  /** exercise id currently expanded on their screen, null when finished */
  active: string | null;
  list: { ex: string; done: boolean[] }[];
  finished: boolean;
};

type ProgressSource = {
  rid: string | null;
  list: { ex: string; sets: { done: boolean }[] }[];
};

export const progressOf = (
  session: ProgressSource,
  activeIndex: number,
  finished = false
): BuddyProgress => ({
  rid: session.rid,
  active: finished ? null : (session.list[activeIndex]?.ex ?? null),
  list: session.list.map((e) => ({ ex: e.ex, done: e.sets.map((x) => x.done) })),
  finished,
});

/**
 * Everything the buddy needs to run the starter's routine: the routine
 * itself plus any custom exercises it uses and their groups/kinds. The
 * starter's version wins — accepting upserts all of it.
 */
export type SessionInvite = {
  routine: Routine;
  custom: Exercise[];
  groups: Labelled[];
  kinds: Labelled[];
};

/** Content equality for routines — same names, same items, order included. */
export const routineEquals = (a: Routine, b: Routine) =>
  JSON.stringify({ n: a.names, i: a.items }) === JSON.stringify({ n: b.names, i: b.items });

/**
 * The dependency closure a routine needs to travel: its custom exercises and
 * their groups/kinds. Both the session invite and the co-created draft ship
 * this so the receiver can always render what arrives.
 */
export const routineClosure = (s: SyncSide, routine: Routine) => {
  const custom = s.custom.filter((e) => routine.items.some((i) => i.ex === e.id));
  return {
    custom,
    groups: s.groups.filter((g) => custom.some((e) => e.group === g.key)),
    kinds: s.kinds.filter((k) => custom.some((e) => e.kind === k.key)),
  };
};

/* ── co-created routines (build one together) ──────────────────────────── */

/**
 * One phone's view of the shared routine draft — always the full state, like
 * `progress`, so any single message resyncs the peer. The receiver adopts the
 * structure (name, exercise list, order, set counts) but keeps their own
 * reps/weight; the sender's reps/weight are shown read-only instead.
 */
export type DraftPayload = {
  routine: Routine;
  custom: Exercise[];
  groups: Labelled[];
  kinds: Labelled[];
  /** exercise id → display name of whoever added it */
  addedBy: Record<string, string>;
  /** the sender currently has the exercise picker open for this draft */
  picking: boolean;
};

/* ── wire protocol (real radio) ────────────────────────────────────────── */

/** Messages the two phones exchange once Nearby connects them. */
export type BuddyMessage =
  | { v: 1; t: 'snapshot'; name: string; data: SyncSide }
  | { v: 1; t: 'item'; item: SyncItem }
  | { v: 1; t: 'sessionInvite'; invite: SessionInvite }
  | { v: 1; t: 'sessionJoin' }
  | { v: 1; t: 'sessionDecline' }
  | { v: 1; t: 'progress'; state: BuddyProgress }
  | { v: 1; t: 'draftStart'; draft: DraftPayload }
  | { v: 1; t: 'draftUpdate'; draft: DraftPayload }
  | { v: 1; t: 'draftEnd'; reason: 'save' | 'start'; draft: DraftPayload };

const MESSAGE_TYPES = new Set([
  'snapshot',
  'item',
  'sessionInvite',
  'sessionJoin',
  'sessionDecline',
  'progress',
  'draftStart',
  'draftUpdate',
  'draftEnd',
]);

export const parseBuddyMessage = (raw: string): BuddyMessage | null => {
  try {
    const m = JSON.parse(raw);
    return m && m.v === 1 && MESSAGE_TYPES.has(m.t) ? (m as BuddyMessage) : null;
  } catch {
    return null;
  }
};
