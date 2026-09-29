/**
 * The arithmetic of a link being made — who is really nearby, which of two
 * entries to believe, what a refusal means, and when an ask has had its turn.
 *
 * Pure, like `plan.ts` and `superset.ts`: values in, answers out, no radio, no
 * store, no timers. <BuddyRadio> owns every clock and every side effect; what
 * lives here is the part of its decisions that can be read off the state
 * alone, which is also the part that can be tested without two phones.
 */
import { matchesBuddy, type PeerIdentity } from '@/data/buddy-sync';

/** One advertisement Nearby reported: a radio address and who it claims to be. */
export type NearbyPeer = PeerIdentity & { endpointId: string };

/** Your own outstanding ask, who it went to, and how it stands. */
export type JoinSent = {
  to: string;
  /**
   * `failed` is the ask that never arrived — the connection it needed could
   * not be made. Not the same fact as `declined`, which is an answer.
   */
  state: 'waiting' | 'declined' | 'failed';
  /** connection attempts this ask has lost so far; absent means none */
  fails?: number;
};

/**
 * Failed connection attempts an ask survives. The reconnect ticker's patience
 * is unlimited because it heals a link two people already agreed to; an ask
 * borrows the ticker and has not earned that — three attempts is the radio
 * having had a fair try, and after it the screen owes the asker an answer.
 */
export const ASK_ATTEMPTS = 3;

/* ── Nearby's status codes, the ones this app acts on ──────────────────── */

export const STATUS = {
  /** the other side said no — the endpoint is alive, the answer was a refusal */
  rejected: 8004,
  /** a send to an endpoint Nearby holds no connection to */
  notConnected: 8005,
  /** Nearby has never heard of this endpoint id, or no longer has */
  endpointUnknown: 8011,
  /** the endpoint is known and the radio could not reach it */
  endpointIo: 8012,
} as const;

const STATUS_NAMES: Record<string, number> = {
  STATUS_CONNECTION_REJECTED: STATUS.rejected,
  STATUS_NOT_CONNECTED_TO_ENDPOINT: STATUS.notConnected,
  STATUS_ENDPOINT_UNKNOWN: STATUS.endpointUnknown,
  STATUS_ENDPOINT_IO_ERROR: STATUS.endpointIo,
};

/**
 * The Nearby status inside a rejected promise, or null when there is none.
 *
 * The native module writes it onto the rejection's `code`, as
 * `REQUEST_FAILED:8011` — a string the module wrote, so reading the number
 * back off it is not the parsing of Google's prose. That is believed first.
 * A native build from before the code carried it passes only the
 * `ApiException`'s message through — `8011: STATUS_ENDPOINT_UNKNOWN`, possibly
 * wrapped in the bridge's own sentence — and the sim words its refusals the
 * same way, so the message is the fallback: the number where there is one,
 * then the name. An error that names neither is not a Nearby refusal and is
 * answered `null`, never guessed at.
 */
export const statusOf = (err: unknown): number | null => {
  const tag = (err as { code?: unknown } | null)?.code;
  const coded = typeof tag === 'string' ? /[:_](\d+)$/.exec(tag) : null;
  if (coded) return Number(coded[1]);
  const text =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const code = /\b(8\d{3})\b/.exec(text);
  if (code) return Number(code[1]);
  const name = /\bSTATUS_[A-Z_]+\b/.exec(text);
  return name ? (STATUS_NAMES[name[0]] ?? null) : null;
};

/**
 * A refused *request* that says the address itself is no good — the entry in
 * `nearbyPeers` is stale and asking it again will be refused again.
 */
export const isGone = (status: number | null) =>
  status === STATUS.endpointUnknown || status === STATUS.endpointIo;

/**
 * A refused *send* that says there is no link to send over. The clearest
 * statement Nearby ever makes that a connection is gone, so it is believed at
 * once rather than counted.
 */
export const isUnlinked = (status: number | null) =>
  status === STATUS.notConnected || status === STATUS.endpointUnknown;

/* ── who is nearby ─────────────────────────────────────────────────────── */

/**
 * The list after an advertisement is found.
 *
 * Nearby mints a new endpoint id when an app restarts and is late — or never —
 * to report the old one lost, so a buddy who restarted is reported twice: two
 * addresses, one install id. The newest advertisement is the only one that can
 * be live, so everything else carrying that install id goes before it is
 * appended. A peer advertising no id (an older build) can only be matched by
 * its address; `pickPeer` taking the last match is the backstop for those.
 */
export const withFound = (peers: NearbyPeer[], found: NearbyPeer): NearbyPeer[] => [
  ...peers.filter(
    (p) => p.endpointId !== found.endpointId && (found.id === null || p.id !== found.id)
  ),
  found,
];

/**
 * The entry to believe for a roster name: the newest that matches, by install
 * id first and display name second (`matchesBuddy`). One picker for the roster
 * row and the reconnect ticker — the row saying *Nearby* about one entry while
 * the ticker requests another is how a tap came to go nowhere.
 */
export const pickPeer = (
  peers: NearbyPeer[],
  name: string,
  id: string | undefined
): NearbyPeer | null => {
  for (let i = peers.length - 1; i >= 0; i--)
    if (matchesBuddy(name, id, peers[i])) return peers[i];
  return null;
};

/** Do two advertisements claim to be the same phone? */
const samePeer = (a: PeerIdentity, b: PeerIdentity) =>
  a.id !== null && b.id !== null ? a.id === b.id : a.name === b.name;

/**
 * Whether evicting `endpointId` would leave nobody in the list for the phone
 * it claimed to be. Nearby reports an endpoint once per discovery run, so an
 * eviction that empties an identity is only safe when discovery is restarted
 * behind it — otherwise a buddy evicted over a passing radio error stays
 * invisible for as long as they keep advertising.
 */
export const lastOfPeer = (peers: NearbyPeer[], endpointId: string): boolean => {
  const gone = peers.find((p) => p.endpointId === endpointId);
  if (!gone) return false;
  return !peers.some((p) => p.endpointId !== endpointId && samePeer(p, gone));
};

/* ── an ask must end ───────────────────────────────────────────────────── */

type AskState = {
  buddy: string | null;
  buddyEndpoint: string | null;
  buddyIds: Record<string, string>;
  joinSent: JoinSent | null;
  sessionShared: boolean;
};

type AskPatch = { buddy?: null; joinSent: JoinSent };

/** An ask still waiting on a link — the only kind a failure can end. */
const asking = (s: AskState): s is AskState & { joinSent: JoinSent } =>
  s.joinSent?.state === 'waiting' && s.buddyEndpoint === null;

/**
 * End a waiting ask as `failed`, or null when there is none to end.
 *
 * The pairing goes with it — `requestSession` set `buddy` only so the radio
 * had somebody to look for, and leaving it would leave the ticker asking. The
 * one exception is a shared session in progress: that pairing was standing
 * before the ask and is the link a mid-workout drop heals through, so an
 * impatient tap on *Request a session* must not be what ends the healing.
 */
export const askEnded = (s: AskState): AskPatch | null =>
  asking(s)
    ? {
        ...(s.sessionShared ? {} : { buddy: null }),
        joinSent: { to: s.joinSent.to, state: 'failed' },
      }
    : null;

/**
 * One connection attempt was lost while an ask was waiting: count it, and end
 * the ask when the budget is spent. `peer` is who the attempt was with — an
 * attempt known to be with somebody else (an invite from the share sheet, a
 * stranger knocking) is not the ask's failure; one whose identity nobody
 * recorded is counted, the ask being the only reason this phone requests.
 */
export const askStrike = (s: AskState, peer: PeerIdentity | null): AskPatch | null => {
  if (!asking(s)) return null;
  const to = s.joinSent.to;
  if (peer !== null && !matchesBuddy(to, s.buddyIds[to], peer)) return null;
  const fails = (s.joinSent.fails ?? 0) + 1;
  return fails >= ASK_ATTEMPTS ? askEnded(s) : { joinSent: { ...s.joinSent, fails } };
};
