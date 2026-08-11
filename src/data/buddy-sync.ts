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

/** Whether a shared exercise is taken in turns or lifted at the same time. */
export type TurnMode = 'alternate' | 'parallel';

/**
 * One exercise's turn choice, as a last-writer-wins register: every local
 * change bumps `rev`, and the higher `rev` wins on both phones (ties go to
 * the host). That is the whole conflict resolution — it rides along inside
 * `progress`, so a phone that missed the toggle catches up on the next
 * broadcast, and adopting a value never bumps a rev, so the two can't echo.
 */
export type TurnChoice = { mode: TurnMode; rev: number };

/* ── who goes first ────────────────────────────────────────────────────── */

/**
 * How the tie is broken when the two of you are level on an exercise — which
 * is the only moment turn order is ever undecided, and so the only thing this
 * changes. `host` is what the app always did; `random` flips a coin per
 * exercise; `ask` puts the question to both of you and keeps the coin as the
 * fallback.
 */
export type FirstUp = 'host' | 'random' | 'ask';

export const FIRST_UPS: readonly FirstUp[] = ['host', 'random', 'ask'];
const FIRST_UP_SET = new Set<string>(FIRST_UPS);

/**
 * The session's first-up policy: one last-writer-wins register for the whole
 * workout, the same discipline as `TurnChoice` one level up. `seed` rides
 * with the policy rather than beside it, because they have to change
 * together — a phone that adopted the policy but kept its own seed would flip
 * a different coin and the two screens would disagree about whose set it is.
 * Re-picking a policy mints a fresh seed, which is also how you re-roll.
 */
export type FirstUpChoice = { policy: FirstUp; seed: number; rev: number };

/** One phone's answer to "who's up?" on one exercise, under the `ask` policy. */
export type Bid = 'me' | 'you';

/**
 * The coin, as a pure function of the shared seed and the exercise — so both
 * phones land on the same answer with nothing to exchange, and a phone that
 * reconnects mid-workout recomputes instead of resyncing. FNV-1a over the id,
 * mixed with the seed; one well-stirred bit is the coin.
 */
export const flipLeader = (seed: number, exId: string): 'host' | 'guest' => {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < exId.length; i++) {
    h ^= exId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 16) & 1) === 0 ? 'host' : 'guest';
};

/**
 * Who leads this exercise. Both phones run this over the same inputs and must
 * agree, so everything it reads is either shared (`first`) or symmetric (the
 * two bids, swapped). A lone bid stands — if only one of you had an opinion,
 * that opinion is the answer; two that cancel out (both "I'll go", or both
 * "you go") decide nothing, so the coin does.
 */
export const leaderOf = (
  first: FirstUpChoice,
  exId: string,
  myBid: Bid | undefined,
  theirBid: Bid | undefined,
  role: 'host' | 'guest' | null
): 'host' | 'guest' => {
  if (first.policy === 'host') return 'host';
  if (first.policy === 'random') return flipLeader(first.seed, exId);

  const me = role === 'guest' ? 'guest' : 'host';
  const them = me === 'host' ? 'guest' : 'host';
  if (myBid && theirBid) {
    if (myBid === 'me' && theirBid === 'you') return me;
    if (myBid === 'you' && theirBid === 'me') return them;
    return flipLeader(first.seed, exId);
  }
  if (myBid) return myBid === 'me' ? me : them;
  if (theirBid) return theirBid === 'me' ? them : me;
  return flipLeader(first.seed, exId);
};

/**
 * Merge a peer's first-up register. Same rule as `mergeTurns`: higher rev
 * wins, an equal rev with a different value goes to the host. Adopting never
 * bumps a rev, so the two phones can't echo each other.
 */
export const mergeFirstUp = (
  mine: FirstUpChoice,
  theirs: FirstUpChoice | undefined,
  role: 'host' | 'guest' | null
): FirstUpChoice | null => {
  if (!theirs || !FIRST_UP_SET.has(theirs.policy) || typeof theirs.seed !== 'number') return null;
  if (typeof theirs.rev !== 'number' || theirs.rev < mine.rev) return null;
  if (theirs.rev === mine.rev) {
    const same = theirs.policy === mine.policy && theirs.seed === mine.seed;
    if (same || role !== 'guest') return null;
  }
  return { policy: theirs.policy, seed: theirs.seed, rev: theirs.rev };
};

/**
 * The question is still open on *this* phone — the policy is `ask` and you
 * haven't answered. Your own answer is what puts the row away, not theirs: a
 * phone in a pocket must not leave the other one being asked all exercise.
 */
export const bidPending = (first: FirstUpChoice, myBid: Bid | undefined) =>
  first.policy === 'ask' && !myBid;

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
  /** their turn-mode registers, merged by rev on arrival */
  modes: Record<string, TurnChoice>;
  /**
   * Their first-up register, merged by rev like `modes`, and their own bids
   * per exercise, which are read rather than merged — a bid is one phone's
   * answer and never becomes the other's. Both optional so a message from a
   * phone that predates them still parses as progress.
   */
  first?: FirstUpChoice;
  bids?: Record<string, Bid>;
};

type ProgressSource = {
  rid: string | null;
  list: { ex: string; sets: { done: boolean }[] }[];
};

export const progressOf = (
  session: ProgressSource,
  activeIndex: number,
  shared: { modes: Record<string, TurnChoice>; first: FirstUpChoice; bids: Record<string, Bid> },
  finished = false
): BuddyProgress => ({
  rid: session.rid,
  active: finished ? null : (session.list[activeIndex]?.ex ?? null),
  list: session.list.map((e) => ({ ex: e.ex, done: e.sets.map((x) => x.done) })),
  finished,
  modes: shared.modes,
  first: shared.first,
  bids: shared.bids,
});

/**
 * Merge a peer's registers into ours. Higher rev wins; an equal rev with a
 * different value goes to the host, so a simultaneous toggle settles in one
 * round instead of flapping.
 */
export const mergeTurns = (
  mine: Record<string, TurnChoice>,
  theirs: Record<string, TurnChoice> | undefined,
  role: 'host' | 'guest' | null
): Record<string, TurnChoice> | null => {
  if (!theirs) return null;
  const out = { ...mine };
  let changed = false;
  for (const [ex, t] of Object.entries(theirs)) {
    if (!t || (t.mode !== 'alternate' && t.mode !== 'parallel')) continue;
    const m = out[ex];
    const wins = !m || t.rev > m.rev || (t.rev === m.rev && t.mode !== m.mode && role === 'guest');
    if (!wins || (m && m.mode === t.mode && m.rev === t.rev)) continue;
    out[ex] = t;
    changed = true;
  }
  return changed ? out : null;
};

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
  | { v: 1; t: 'draftEnd'; reason: 'save' | 'start'; draft: DraftPayload }
  /**
   * Someone tapped Disconnect. Not the same as the link dropping: a drop is
   * something to reconnect through, this is a decision. The receiver tears
   * the pairing down instead of going looking for them again.
   */
  | { v: 1; t: 'bye' }
  /**
   * "Shall we train together?" — the other direction from `sessionInvite`,
   * and the only thing that ever opens a link between two paired phones: the
   * radio connects for it, but nobody is *in* anything until this is
   * answered. If the asked phone is already running a routine, an accepted
   * ask is answered with a plain `sessionInvite` on top, so joining a workout
   * in progress runs the one code path it always did.
   */
  | { v: 1; t: 'joinAsk' }
  | { v: 1; t: 'joinReply'; ok: boolean };

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
  'bye',
  'joinAsk',
  'joinReply',
]);

export const parseBuddyMessage = (raw: string): BuddyMessage | null => {
  try {
    const m = JSON.parse(raw);
    return m && m.v === 1 && MESSAGE_TYPES.has(m.t) ? (m as BuddyMessage) : null;
  } catch {
    return null;
  }
};
