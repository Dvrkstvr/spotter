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
import { isMeasure, type Exercise, type Routine, type RoutineItem } from '@/data/exercises';
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
  /**
   * Which side of the shared session the sender is. Read by exactly one
   * thing: `rejoinSession`, which takes the opposite — a phone whose app died
   * mid shared workout re-attaches as the complement of whoever kept going,
   * instead of guessing. Optional like `first` and `bids`: an older build
   * sends none, and the re-join falls back to the role the session persisted.
   */
  role?: 'host' | 'guest';
  /**
   * Seconds left on the sender's own rest **as this message was built** — 0 or
   * absent when they aren't resting. Deliberately a remainder rather than the
   * `{ at, skipped }` the sender holds: `at` is a stamp on *their* `elapsed`,
   * and the two phones' session clocks share no origin (a guest joins mid-way,
   * and `restSeconds` is a per-phone setting anyway). A remainder is the one
   * figure that means the same thing on both sides; the receiver re-anchors it
   * to its own clock on arrival and counts down from there. Optional, like
   * `first` and `bids`, so an older build's message still parses.
   */
  rest?: number;
  /**
   * The closure for the exercises in `list` that aren't in the seeded library
   * — see `closureFor`. An exercise one of you added mid-session is otherwise
   * an id the other phone cannot name, so the offer to take it on could not
   * be drawn, let alone accepted.
   *
   * It rides here rather than as a message of its own for the reason
   * everything in this protocol does: `progress` is whole state, so a closure
   * that missed a dropped link arrives with the next broadcast instead of
   * being lost for the workout. Nothing is written from it until the offer is
   * accepted — receiving it only makes the row nameable.
   *
   * Absent when the session is all seeded exercises, which is almost always,
   * and absent from an older build — whose extra exercises simply stay
   * unnameable, exactly as they are today.
   */
  deps?: ExClosure;
};

type ProgressSource = {
  rid: string | null;
  list: { ex: string; sets: { done: boolean }[] }[];
};

export const progressOf = (
  session: ProgressSource,
  activeIndex: number,
  shared: {
    modes: Record<string, TurnChoice>;
    first: FirstUpChoice;
    bids: Record<string, Bid>;
    role?: 'host' | 'guest' | null;
  },
  finished = false,
  restLeft = 0,
  deps?: ExClosure
): BuddyProgress => ({
  rid: session.rid,
  active: finished ? null : (session.list[activeIndex]?.ex ?? null),
  list: session.list.map((e) => ({ ex: e.ex, done: e.sets.map((x) => x.done) })),
  finished,
  modes: shared.modes,
  first: shared.first,
  bids: shared.bids,
  ...(shared.role ? { role: shared.role } : {}),
  rest: finished ? 0 : Math.max(0, Math.round(restLeft)),
  // Only when there is something to carry: a session of seeded exercises adds
  // nothing to the wire, and the field stays as absent as it is on a build
  // that predates it.
  ...(deps && deps.custom.length > 0 ? { deps } : {}),
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

/** What a set of exercises needs alongside it to be renderable on another phone. */
export type ExClosure = { custom: Exercise[]; groups: Labelled[]; kinds: Labelled[] };

/**
 * The dependency closure a set of exercises needs to travel: the custom ones
 * among them and the groups/kinds those file under. Seeded exercises carry
 * nothing — both phones have the library already.
 */
export const closureFor = (s: SyncSide, exIds: string[]): ExClosure => {
  const custom = s.custom.filter((e) => exIds.includes(e.id));
  return {
    custom,
    // An exercise depends on more groups than the one it is filed under: every
    // key in `also` is a group too, and one this phone has never heard of files
    // nowhere — silently, and only in the statistics, which is the worst place
    // to find out.
    groups: s.groups.filter((g) =>
      custom.some((e) => e.group === g.key || e.also?.[g.key] !== undefined)
    ),
    kinds: s.kinds.filter((k) => custom.some((e) => e.kind === k.key)),
  };
};

/**
 * The dependency closure a routine needs to travel. Both the session invite
 * and the co-created draft ship this so the receiver can always render what
 * arrives.
 */
export const routineClosure = (s: SyncSide, routine: Routine): ExClosure =>
  closureFor(
    s,
    routine.items.map((i) => i.ex)
  );

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

/* ── peer identity ─────────────────────────────────────────────────────── */

/**
 * The Nearby advertising name carries both halves of a peer's identity:
 * `<installId>|<displayName>`. The install id (`selfId` in the store) is
 * ANDROID_ID or a once-generated random string — stable across renames — so
 * a pairing survives the buddy renaming themselves. A raw name with no
 * separator (an older build advertising name-only) parses as id-less and
 * matches by name, as before.
 */
export const encodePeerName = (id: string, name: string) => (id ? `${id}|${name}` : name);

export type PeerIdentity = { id: string | null; name: string };

export const decodePeerName = (raw: string): PeerIdentity => {
  const i = raw.indexOf('|');
  const id = i > 0 ? raw.slice(0, i) : '';
  return /^[a-z0-9]{8,}$/.test(id) ? { id, name: raw.slice(i + 1) } : { id: null, name: raw };
};

/**
 * Does an advertised identity match this display name? The id is what makes
 * a renamed buddy still the buddy; the name fallback keeps id-less older
 * builds pairable. `id` is the install id recorded for the name in
 * `buddyIds`, if one ever arrived.
 */
export const matchesBuddy = (name: string, id: string | undefined, peer: PeerIdentity) =>
  (peer.id !== null && peer.id === id) || peer.name === name;

/** Is this peer anywhere on the roster — by recorded install id or by name? */
export const isKnownPeer = (
  s: { knownBuddies: string[]; buddyIds: Record<string, string> },
  peer: PeerIdentity
) =>
  s.knownBuddies.includes(peer.name) ||
  (peer.id !== null && Object.values(s.buddyIds).includes(peer.id));

/**
 * The roster name this advertised identity maps to, or null for a stranger.
 * Install id first — that is what survives a rename — then exact display name
 * for id-less older builds. This is *identification*, not authentication: both
 * halves are self-asserted and forgeable, which is the whole reason the
 * pairing secret below exists.
 */
export const rosterNameFor = (
  s: { knownBuddies: string[]; buddyIds: Record<string, string> },
  peer: PeerIdentity
): string | null => {
  if (peer.id !== null) {
    const byId = Object.keys(s.buddyIds).find((n) => s.buddyIds[n] === peer.id);
    if (byId) return byId;
  }
  return s.knownBuddies.includes(peer.name) ? peer.name : null;
};

/* ── pairing secret (impersonation defence) ────────────────────────────── */

/**
 * A per-pairing shared secret, minted once during the code-gated first
 * pairing and persisted on both phones (`buddySecrets` in the store). It is
 * the thing a *reconnecting* peer must prove before this phone trusts it —
 * sends it a snapshot, merges its items, honours its session invites. The
 * advertised name and install id authenticate nothing on their own (both are
 * self-asserted strings a nearby attacker can forge), so without this a device
 * that merely knows a buddy's first name could impersonate them. Only a phone
 * that was in the room for the confirmed first pairing ever learns this.
 *
 * 128 bits of `Math.random` — not a CSPRNG, but the secret is only ever
 * exchanged over the code-authenticated, Nearby-encrypted channel and never
 * leaves it, so its one job is to be unguessable to an impersonator who has
 * never seen it. (`identity.ts` mints the install id the same way.)
 */
export const randomToken = (): string =>
  Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0')
  ).join('');

/**
 * Which end of the connection a proof was hashed for. Both endpoints witness
 * the *same* auth digits, so a proof with no direction lane is byte-identical
 * in both directions — and because each phone sends its proof before checking
 * the peer's, an attacker could simply echo this phone's own proof straight
 * back and be trusted. The side that *requested* the connection hashes as
 * `initiator`, the side that *accepted* as `responder`, and each verifies the
 * peer's proof under the OPPOSITE lane, so the two proofs never coincide.
 * (Protocol change — both phones must rebuild, same rollout story as the
 * secret itself: an un-updated peer's proof lands under the wrong lane, fails
 * verification, and re-pairs through the code.)
 */
export type ProofRole = 'initiator' | 'responder';

/**
 * The proof a peer sends to show it holds the pairing secret, bound to *this*
 * connection via Nearby's authentication digits *and* the sender's direction
 * (see `ProofRole`). Both endpoints witness the same digits — an artefact of
 * the encrypted handshake, unpredictable to any third party — so a proof
 * captured from one session cannot be replayed into another, and the raw
 * secret is never re-sent after enrolment.
 *
 * A pure-JS keyed hash (four decorrelated FNV-1a lanes → 128 bits) rather than
 * a native SHA: the channel is already encrypted and per-session keyed, so an
 * attacker never observes a proof to begin with — this only has to be a
 * stable, not-invertible-in-practice mixing of (secret, digits, role). If the
 * transport is ever not encrypted, swap in expo-crypto through the
 * optional-native bridge.
 */
export const authProof = (secret: string, digits: string, role: ProofRole): string =>
  [0, 1, 2, 3]
    .map((lane) => {
      const msg = `${secret}|${digits}|${role}|${lane}`;
      let h = (0x811c9dc5 ^ Math.imul(lane, 0x9e3779b1)) >>> 0;
      for (let i = 0; i < msg.length; i++) {
        h ^= msg.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    })
    .join('');

/**
 * Whether a peer's hello proves the secret we hold for them on this link.
 * `role` is the *peer's* direction — the opposite of ours — so a reflected
 * copy of our own proof (hashed under our role) never verifies.
 */
export const proofOk = (
  secret: string | undefined,
  proof: unknown,
  digits: string,
  role: ProofRole
): boolean => !!secret && typeof proof === 'string' && proof === authProof(secret, digits, role);

/* ── wire protocol (real radio) ────────────────────────────────────────── */

/** Messages the two phones exchange once Nearby connects them. */
export type BuddyMessage =
  /**
   * The first message on every connection, before anything sensitive crosses.
   * A reconnecting peer carries `proof` (see `authProof`); the first pairing
   * carries `newToken` from the minting side instead — the code check was the
   * gate there, and this only *establishes* the secret for next time. Nothing
   * but a `hello` is honoured from an unauthenticated endpoint.
   */
  | { v: 1; t: 'hello'; name: string; id?: string; proof?: string; newToken?: string }
  /** `id` is the sender's install id; absent from older builds */
  | { v: 1; t: 'snapshot'; name: string; id?: string; data: SyncSide }
  | { v: 1; t: 'item'; item: SyncItem }
  /**
   * The receiver merged a sync item — `id` is its `syncItemId`. Delivery only
   * says the bytes arrived; this says the merge ran, which is what upgrades
   * the sender's Sent to Received. Sent both when a pushed item lands and when
   * a Transfer tap pulls one, so either phone's act settles the row on the
   * other. An older build never acks and the mark stays delivery-based.
   */
  | { v: 1; t: 'itemAck'; id: string }
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

/* ── incoming payload validation ───────────────────────────────────────── */

/**
 * Everything below runs on bytes another phone sent. The envelope check (`v`,
 * `t`) was never enough on its own: the payload bodies used to be cast
 * (`as BuddyMessage`) and merged into persisted state unread, so a peer — a
 * buggy build, or an attacker who cleared the secret gate — could ship a
 * `names` that is a string instead of a map, a non-array `items`, a megabyte
 * of them, and the store would swallow it. A wrong-typed field then crashes
 * whatever screen assumes the shape, and because the durable blob is rehydrated
 * every launch, that crash can be permanent.
 *
 * So each payload is rebuilt field-by-field into a known-good shape: right
 * types, capped sizes, unknown fields dropped. A sub-item that can't be
 * salvaged is filtered out rather than poisoning the whole message; a payload
 * whose spine is wrong (a snapshot with no object `data`, an invite with no
 * routine) drops the message entirely. The caps are generous headroom over any
 * real library — they exist to bound a hostile payload, not to fit an honest
 * one.
 */
const CAP = { str: 200, list: 400, items: 200 } as const;

/**
 * Bounds on the numeric fields a hostile peer could inflate. A weight is
 * kilograms and a register revision is bumped once per user action, so both
 * caps are generous headroom over any honest value — they exist only to stop
 * a payload that sends `1e308` (still `Number.isFinite`) from overflowing a
 * display or permanently winning a last-writer register.
 */
const WEIGHT_MAX = 100000;
const REV_MAX = 1e9;
const clampRev = (n: number) => Math.max(-REV_MAX, Math.min(REV_MAX, n));

const capStr = (v: unknown, cap = CAP.str): string =>
  typeof v === 'string' ? v.slice(0, cap) : '';

/** A string that must be present and sanely bounded, else the item is dropped. */
const reqStr = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= CAP.str ? v : null;

const finite = (v: unknown, fb = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Keep only the two known languages, each a capped string. */
const cleanLangMap = (v: unknown): LangMap => {
  const out: LangMap = {};
  if (isObj(v)) {
    for (const l of LANGS) if (typeof v[l] === 'string') out[l] = capStr(v[l]);
  }
  return out;
};

const cleanList = <T>(v: unknown, f: (x: unknown) => T | null): T[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, CAP.list)
    .map(f)
    .filter((x): x is T => x !== null);

const cleanLabelled = (v: unknown): Labelled | null => {
  if (!isObj(v)) return null;
  const key = reqStr(v.key);
  return key ? { key, labels: cleanLangMap(v.labels) } : null;
};

const cleanExercise = (v: unknown): Exercise | null => {
  if (!isObj(v)) return null;
  const id = reqStr(v.id);
  if (!id) return null;
  const ex: Exercise = {
    id,
    name: capStr(v.name),
    group: capStr(v.group),
    kind: capStr(v.kind),
    last: Math.min(WEIGHT_MAX, Math.max(0, finite(v.last))),
    lastSets: (Array.isArray(v.lastSets) ? v.lastSets : [])
      .slice(0, CAP.items)
      .filter((s): s is string => typeof s === 'string')
      .map((s) => capStr(s)),
  };
  const names = cleanLangMap(v.names);
  if (Object.keys(names).length) ex.names = names;
  if (isMeasure(v.measure)) ex.measure = v.measure;
  // `also` has to be named explicitly, like `with` on a routine item: this
  // rebuilds field by field and drops what it doesn't know. A protocol
  // addition rather than a change — an older build sends no map, which arrives
  // meaning exactly what it has always meant. Clamped here as well as in
  // `contribOf`, because a hostile peer is the one source that gets to pick
  // the numbers.
  if (isObj(v.also)) {
    const also: Record<string, number> = {};
    for (const [g, n] of Object.entries(v.also)) {
      if (Object.keys(also).length >= CAP.items) break;
      if (typeof n !== 'number' || !isFinite(n) || n <= 0) continue;
      const key = capStr(g);
      if (key) also[key] = Math.min(1, n);
    }
    if (Object.keys(also).length) ex.also = also;
  }
  return ex;
};

const cleanRoutineItem = (v: unknown): RoutineItem | null => {
  if (!isObj(v)) return null;
  const ex = reqStr(v.ex);
  if (!ex) return null;
  const it: RoutineItem = {
    ex,
    sets: Math.min(999, Math.max(0, Math.round(finite(v.sets, 1)))),
    reps: Math.min(99999, Math.max(0, Math.round(finite(v.reps, 0)))),
    w: Math.min(WEIGHT_MAX, Math.max(0, finite(v.w, 0))),
  };
  if (v.planned === true) it.planned = true;
  // The superset travels, because it is structure — the same half of a routine
  // `mergeRoutine` takes from the sender along with the order and the set
  // counts, where reps and weight stay this phone's. A build that predates it
  // sends nothing and the routine simply arrives unpaired.
  if (v.with === 'next') it.with = 'next';
  return it;
};

const cleanRoutine = (v: unknown): Routine | null => {
  if (!isObj(v)) return null;
  const id = reqStr(v.id);
  if (!id) return null;
  return {
    id,
    names: cleanLangMap(v.names),
    items: (Array.isArray(v.items) ? v.items : [])
      .slice(0, CAP.items)
      .map(cleanRoutineItem)
      .filter((x): x is RoutineItem => x !== null),
  };
};

const cleanSide = (v: unknown): SyncSide | null =>
  isObj(v)
    ? {
        groups: cleanList(v.groups, cleanLabelled),
        kinds: cleanList(v.kinds, cleanLabelled),
        custom: cleanList(v.custom, cleanExercise),
        routines: cleanList(v.routines, cleanRoutine),
      }
    : null;

const SYNC_ITEM_TYPES = new Set<string>(['group', 'kind', 'exercise', 'routine']);

const cleanSyncItem = (v: unknown): SyncItem | null => {
  if (!isObj(v) || typeof v.type !== 'string' || !SYNC_ITEM_TYPES.has(v.type)) return null;
  const key = reqStr(v.key);
  if (!key) return null;
  const type = v.type as SyncItemType;
  const fallback = capStr(v.fallback);
  if (v.kind === 'translation') {
    if (v.lang !== 'en' && v.lang !== 'de') return null;
    if (typeof v.text !== 'string') return null;
    return { kind: 'translation', type, key, lang: v.lang, text: capStr(v.text), names: cleanLangMap(v.names), fallback };
  }
  if (v.kind === 'item') return { kind: 'item', type, key, names: cleanLangMap(v.names), fallback };
  return null;
};

const cleanStrMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (isObj(v))
    for (const [k, val] of Object.entries(v).slice(0, CAP.items))
      if (k.length <= CAP.str && typeof val === 'string') out[k] = capStr(val);
  return out;
};

const cleanInvite = (v: unknown): SessionInvite | null => {
  if (!isObj(v)) return null;
  const routine = cleanRoutine(v.routine);
  return routine
    ? {
        routine,
        custom: cleanList(v.custom, cleanExercise),
        groups: cleanList(v.groups, cleanLabelled),
        kinds: cleanList(v.kinds, cleanLabelled),
      }
    : null;
};

const cleanDraft = (v: unknown): DraftPayload | null => {
  if (!isObj(v)) return null;
  const routine = cleanRoutine(v.routine);
  return routine
    ? {
        routine,
        custom: cleanList(v.custom, cleanExercise),
        groups: cleanList(v.groups, cleanLabelled),
        kinds: cleanList(v.kinds, cleanLabelled),
        addedBy: cleanStrMap(v.addedBy),
        picking: v.picking === true,
      }
    : null;
};

const cleanTurnChoice = (v: unknown): TurnChoice | null => {
  if (!isObj(v) || (v.mode !== 'alternate' && v.mode !== 'parallel')) return null;
  return typeof v.rev === 'number' && Number.isFinite(v.rev)
    ? { mode: v.mode, rev: clampRev(v.rev) }
    : null;
};

const cleanModes = (v: unknown): Record<string, TurnChoice> => {
  const out: Record<string, TurnChoice> = {};
  if (isObj(v))
    for (const [k, val] of Object.entries(v).slice(0, CAP.items)) {
      if (k.length > CAP.str) continue;
      const t = cleanTurnChoice(val);
      if (t) out[k] = t;
    }
  return out;
};

const cleanFirstUp = (v: unknown): FirstUpChoice | undefined => {
  if (!isObj(v) || typeof v.policy !== 'string' || !FIRST_UP_SET.has(v.policy)) return undefined;
  if (typeof v.seed !== 'number' || !Number.isFinite(v.seed)) return undefined;
  if (typeof v.rev !== 'number' || !Number.isFinite(v.rev)) return undefined;
  return { policy: v.policy as FirstUp, seed: v.seed, rev: clampRev(v.rev) };
};

const cleanBids = (v: unknown): Record<string, Bid> | undefined => {
  if (!isObj(v)) return undefined;
  const out: Record<string, Bid> = {};
  for (const [k, val] of Object.entries(v).slice(0, CAP.items))
    if (k.length <= CAP.str && (val === 'me' || val === 'you')) out[k] = val;
  return out;
};

/**
 * Same rebuild `cleanInvite` gives an invite's closure, and bounded by the
 * same caps. An empty one is dropped rather than carried: the field's whole
 * meaning is "here are the exercises you can't name", and an empty closure
 * says nothing a missing field doesn't.
 */
const cleanClosure = (v: unknown): ExClosure | undefined => {
  if (!isObj(v)) return undefined;
  const custom = cleanList(v.custom, cleanExercise);
  return custom.length
    ? {
        custom,
        groups: cleanList(v.groups, cleanLabelled),
        kinds: cleanList(v.kinds, cleanLabelled),
      }
    : undefined;
};

const cleanProgress = (v: unknown): BuddyProgress | null => {
  if (!isObj(v)) return null;
  const list = (Array.isArray(v.list) ? v.list : [])
    .slice(0, CAP.items)
    .flatMap((e): { ex: string; done: boolean[] }[] => {
      if (!isObj(e) || typeof e.ex !== 'string' || e.ex.length > CAP.str) return [];
      const done = (Array.isArray(e.done) ? e.done : []).slice(0, CAP.items).map((b) => b === true);
      return [{ ex: e.ex, done }];
    });
  const prog: BuddyProgress = {
    rid: typeof v.rid === 'string' ? capStr(v.rid) : null,
    active: typeof v.active === 'string' ? capStr(v.active) : null,
    list,
    finished: v.finished === true,
    modes: cleanModes(v.modes),
  };
  const first = cleanFirstUp(v.first);
  if (first) prog.first = first;
  const bids = cleanBids(v.bids);
  if (bids) prog.bids = bids;
  // Rebuilt field-by-field like everything here, so the new field has to be
  // named or an updated sender's role would be stripped on arrival.
  if (v.role === 'host' || v.role === 'guest') prog.role = v.role;
  const deps = cleanClosure(v.deps);
  if (deps) prog.deps = deps;
  // A day's worth of headroom over any rest anybody sets, which is all this
  // has to be: the figure only ever drives a countdown label.
  prog.rest = Math.min(86400, Math.max(0, Math.round(finite(v.rest))));
  return prog;
};

/**
 * Parse and validate one wire message. Returns a message whose payload has
 * been rebuilt into a known-good shape, or null — for bad JSON, a wrong
 * envelope, or a body that couldn't be salvaged. Every handler downstream can
 * treat the result as trusted-shaped; the security gate (is this peer allowed
 * to be heard at all) is separate, in `<BuddyRadio>`.
 */
export const parseBuddyMessage = (raw: string): BuddyMessage | null => {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m) || m.v !== 1 || typeof m.t !== 'string') return null;

  switch (m.t) {
    case 'hello':
      return typeof m.name === 'string'
        ? {
            v: 1,
            t: 'hello',
            name: capStr(m.name),
            ...(typeof m.id === 'string' ? { id: capStr(m.id) } : {}),
            ...(typeof m.proof === 'string' ? { proof: capStr(m.proof) } : {}),
            ...(typeof m.newToken === 'string' ? { newToken: capStr(m.newToken) } : {}),
          }
        : null;
    case 'snapshot': {
      const data = cleanSide(m.data);
      return data && typeof m.name === 'string'
        ? {
            v: 1,
            t: 'snapshot',
            name: capStr(m.name),
            data,
            ...(typeof m.id === 'string' ? { id: capStr(m.id) } : {}),
          }
        : null;
    }
    case 'item': {
      const item = cleanSyncItem(m.item);
      return item ? { v: 1, t: 'item', item } : null;
    }
    case 'itemAck':
      // The id is a syncItemId — a typed prefix on a capped key, so it may
      // run a shade past what CAP.str allows a bare string.
      return typeof m.id === 'string' && m.id.length > 0 && m.id.length <= CAP.str + 24
        ? { v: 1, t: 'itemAck', id: m.id }
        : null;
    case 'sessionInvite': {
      const invite = cleanInvite(m.invite);
      return invite ? { v: 1, t: 'sessionInvite', invite } : null;
    }
    case 'progress': {
      const state = cleanProgress(m.state);
      return state ? { v: 1, t: 'progress', state } : null;
    }
    case 'draftStart': {
      const draft = cleanDraft(m.draft);
      return draft ? { v: 1, t: 'draftStart', draft } : null;
    }
    case 'draftUpdate': {
      const draft = cleanDraft(m.draft);
      return draft ? { v: 1, t: 'draftUpdate', draft } : null;
    }
    case 'draftEnd': {
      const draft = cleanDraft(m.draft);
      const reason = m.reason === 'save' || m.reason === 'start' ? m.reason : null;
      return draft && reason ? { v: 1, t: 'draftEnd', reason, draft } : null;
    }
    case 'joinReply':
      return typeof m.ok === 'boolean' ? { v: 1, t: 'joinReply', ok: m.ok } : null;
    case 'sessionJoin':
      return { v: 1, t: 'sessionJoin' };
    case 'sessionDecline':
      return { v: 1, t: 'sessionDecline' };
    case 'bye':
      return { v: 1, t: 'bye' };
    case 'joinAsk':
      return { v: 1, t: 'joinAsk' };
    default:
      return null;
  }
};
