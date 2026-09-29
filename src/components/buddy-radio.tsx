/**
 * The radio controller — mounted once next to the overlays, renders nothing.
 *
 * Owns the whole Nearby lifecycle so no sheet has to: advertising/discovery
 * run while the user is scanning, waiting in the sync screen, or mid shared
 * session with the connection down (that's the reconnect path — the known
 * buddy is re-requested by name the moment they reappear) — and only while
 * somebody could answer: on screen, or mid-workout under the foreground
 * service. Discovery steps aside for as long as a connection is forming, and
 * advertising does not — see `formed`. A connection is either a pairing,
 * confirmed by code, or a reconnect, proved by secret — the requester says
 * which, both ends greet (`hello`) and only then exchange snapshots; incoming
 * sync items merge into the store through the same importFromPeer as the mock
 * path. A connection that is refused, or that fails its handshake, is reported
 * to the user (`failPairing`) rather than dropped.
 *
 * Shared workouts (IMPROVEMENTS.md #8) also live here: starting a routine
 * while connected turns the session into a hosted shared one and sends the
 * invite; live progress is broadcast as full state, debounced, so any single
 * message — including the first after a reconnect — fully resyncs the buddy.
 *
 * Listeners are registered exactly once (the store is read through a ref kept
 * current by an effect — the useBackClose pattern, and the React Compiler
 * rule), so radio events never race a re-render. Does nothing in Expo Go.
 *
 * Every connection request and every payload in the app goes through the one
 * `request` and the one `send` built in the wiring effect — this file's own
 * and, through `claimLink`, every sheet's. That is what lets a refusal mean
 * something: a request Nearby turns down evicts the entry it was sent to, a
 * send it turns down counts against the link, and nothing is asked twice while
 * the first answer is still on its way. Each wait here also has an end — a
 * request, a handshake and an ask each carry a deadline — because every state
 * that used to need the app restarting was a wait nothing was timing.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  askEnded,
  askStrike,
  isGone,
  isUnlinked,
  lastOfPeer,
  pickPeer,
  STATUS,
  statusOf,
  withFound,
} from '@/data/buddy-link';
import {
  BANDWIDTH,
  claimLink,
  type Link,
  onRadioPoke,
  radio,
  radioAsking,
  radioErr,
  radioGrant,
  radioSwitches,
  type RequestFrom,
  watchRequests,
  requestPeer,
  takeDeclined,
  takeRequestKind,
} from '@/data/buddy-radio';
import { dlog } from '@/data/diag';
import { formingSet, scanFollower } from '@/data/scan-pause';
import {
  NO_STATUS,
  radioStateOf,
  type RadioState,
  refusedIn,
  statusOf as startStatusOf,
} from '@/data/radio-state';
import {
  authProof,
  type BuddyMessage,
  closureFor,
  decodePeerName,
  diffBuddy,
  encodePeerName,
  enrolAck,
  type HelloKind,
  judgeHello,
  judgeOffer,
  judgeRefusal,
  matchesBuddy,
  type PairingIssue,
  parseBuddyMessage,
  type PeerIdentity,
  progressOf,
  PROTOCOL_VERSION,
  type ProofRole,
  randomToken,
  rosterNameFor,
  routineClosure,
  shareableSlice,
  syncItemId,
} from '@/data/buddy-sync';
import { myName, restLeftOf, Session, State, Store, useStore } from '@/store/workout-store';

/** The shared registers a progress message carries beside the set counts. */
const sharedOf = (s: State) => ({
  modes: s.turnModes,
  first: s.firstUp,
  bids: s.myBids,
  // Which side this phone is, for a crashed buddy's re-join to take the
  // opposite of — see `rejoinSession`. Broadcasts only run while the session
  // is shared, where the role is always set.
  role: s.sessionRole,
});

/**
 * How often the reconnect ticker re-tries, and how often the radio's
 * preconditions are looked at and a refused advertising/discovery start is
 * tried again. Nearby operations are cheap;
 * five seconds is fast enough that a healed link feels automatic and slow
 * enough not to spam a Bluetooth stack that is still settling.
 */
const RETRY_MS = 5000;
/**
 * Ticks the non-preferred side waits before requesting anyway. Long enough
 * that the preferred side almost always gets there first, short enough that
 * one-sided discovery — common over Bluetooth — never becomes a deadlock.
 */
const GRACE_TICKS = 3;
/**
 * How long a connection request may stay unanswered before its in-flight
 * marker is given up. A Bluetooth connection commonly takes longer than the
 * ticker's five seconds to form, which is the whole reason for the marker:
 * without it the tap, the found-event and the ticker each request the same
 * endpoint while the first attempt is still coming up.
 */
const REQUEST_MS = 15000;
/**
 * From `onConnected` to `trust` on a reconnect: both hellos, and one proof
 * checked. Seconds of headroom over a handshake that is two small payloads —
 * and the only thing that ever ends a link whose other half never says hello.
 */
const HANDSHAKE_MS = 10000;
/**
 * How long an ask may go without a trusted link to travel over. Counted from
 * the tap, not from the last attempt, so three quick refusals and one request
 * nobody ever answers both end in the same line on the same screen.
 */
const ASK_MS = 30000;
/**
 * Refused requests in a row before discovery is restarted. Nearby reports an
 * endpoint once per discovery run, so when requests keep being turned down the
 * list is describing a room that has changed — and a restart is the only way
 * to be told again who is really in it.
 */
const STALE_AFTER = 2;
/** Undelivered payloads in a row before the failures are believed over the link. */
const FLAKY_AFTER = 2;
/**
 * How long a new name has to stand before it is advertised. The name field
 * writes on every keystroke, and a radio restarted per letter is a radio that
 * spends the whole rename refusing its own starts.
 */
const RENAME_MS = 1500;
/**
 * The beat between deciding a handshake has failed and hanging up. This
 * phone's own hello is how the other one learns *why* — its version, its kind
 * — and `sendPayload` resolving only ever meant enqueued, so a disconnect on
 * the same tick can overtake the message that explains it.
 */
const LEAVE_MS = 400;

/**
 * One connection's handshake, from the moment it is offered until it is
 * trusted or given up. All of it transient — a link never outlives the app.
 */
type Handshake = {
  /** Nearby's auth digits, witnessed by both ends: what every proof binds to */
  digits: string;
  /** this phone accepted the request rather than made it */
  incoming: boolean;
  peer: PeerIdentity;
  /** which handshake this is, settled when the connection was offered */
  kind: HelloKind;
  /** the name they go by in the store: the roster's, else the advertised one */
  who: string;
  /**
   * When the connection was offered, then — re-stamped — when it came up, so
   * the handshake can be timed on its own.
   */
  since: number;
  /** Nearby's half of the link is up */
  linked?: boolean;
  /** their hello has been judged and accepted */
  greeted?: boolean;
  /** minted and sent, not yet acknowledged — the minting side of a pairing */
  token?: string;
  /**
   * The handshake's deadline, held here because it lives and dies with the
   * record: whatever forgets the endpoint clears it.
   */
  timer?: ReturnType<typeof setTimeout>;
};

/**
 * Which side opens the reconnect. Both phones run the same code, so both used
 * to request the moment they saw each other, and Nearby fails a crossed pair
 * of requests more often than it resolves one — each failure edge-triggered
 * into another round of the same collision. One side is *preferred*: the
 * lexicographically smaller install id, which both phones can compute alone
 * because both ids are in the advertised names. The other side holds back for
 * `GRACE_TICKS` and then tries too (see the ticker) — a preference, not a
 * veto. A peer advertising no id (an older build) is never deferred to.
 */
const initiator = (s: State, peer: PeerIdentity) => !peer.id || s.selfId < peer.id;

/**
 * An install id as the log writes it — the same eight characters the header
 * prints as `self`, so a peer in this phone's file can be matched against the
 * top of the other one's.
 */
const shortId = (id: string | null) => id?.slice(0, 8) ?? 'none';

/** Advertising and discovery start, fail and are retried separately. */
const HALVES = ['advertising', 'discovery'] as const;
type Half = (typeof HALVES)[number];

export function BuddyRadio() {
  const store = useStore();

  const ref = useRef<Store>(store);
  useEffect(() => {
    ref.current = store;
  });

  // Per-connection handshake state (see `Handshake`), kept from the moment a
  // connection is offered — which is when its kind is settled — until it is
  // trusted or given up. `authed` is the set of endpoints whose hello has been
  // judged and accepted: nothing sensitive is sent to, or accepted from, an
  // endpoint that isn't in it.
  const meta = useRef<Map<string, Handshake>>(new Map());
  const authed = useRef<Set<string>>(new Set());

  // The link's verbs, built once by the wiring effect at the foot of this
  // component and read from every effect above it. Null only before the first
  // commit, when there is no link to speak of either.
  const link = useRef<Link | null>(null);
  // Restarting discovery belongs to the effect that started it — it knows
  // whether the radio is meant to be on at all — so that effect lends the
  // restart out for as long as it is alive.
  const rediscover = useRef<(() => void) | null>(null);
  // And the same for advertising, which a rename starts over.
  const readvertise = useRef<(() => void) | null>(null);
  // Connections still forming — requested or offered, not yet trusted, failed
  // or dropped — and while there is one, discovery is paused. The arithmetic
  // is `data/scan-pause.ts`; what is here is the wiring. Beside `meta` and
  // `authed` rather than in the store, for the reason they are: it is a fact
  // about a connection attempt, no screen reads it, and it cannot outlive the
  // listeners that write it.
  const formed = useRef(
    formingSet((endpointId) =>
      dlog('buddy', 'forming connection went quiet — discovery resumes', { endpoint: endpointId })
    )
  );

  /* — advertising + discovery, driven by what the user is doing — */

  // Whether anybody is there to answer. Advertising belongs to the process,
  // not to the screen: a backgrounded app with no session has no foreground
  // service, Android may freeze its JS, and Nearby goes on advertising for it
  // — the buddy reads *Nearby*, asks, and the request is accepted by nobody.
  // Anything but `background` counts as on screen, so a state this build has
  // never heard of fails towards a radio that works.
  const [fore, setFore] = useState(() => AppState.currentState !== 'background');
  // Android reports `background` for the permission dialog too — it is
  // another activity over this one. Believing that would stop the radio
  // mid-question and ask the same question again on the way back, so a pause
  // that arrives while the dialog is up is not one.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background' && radioAsking()) return;
      setFore(st !== 'background');
    });
    return () => sub.remove();
  }, []);

  // A pairing is standing until explicitly closed (Disconnect): while paired
  // but unlinked, the radio keeps looking. `knownBuddies` extends that across
  // restarts — with anyone on the list, this phone stays findable while the
  // app is open, which is what lets a buddy be asked to join without either
  // side having tapped anything first.
  const wanted =
    radio !== null &&
    (store.s.scanning ||
      store.s.buddySync ||
      store.s.sessionShared ||
      store.s.buddy !== null ||
      store.s.knownBuddies.length > 0) &&
    store.s.buddyEndpoint === null;
  // "While the app is open" means on screen — or mid-workout, where the
  // foreground service keeps JS running in a pocket and the radio is what
  // heals a dropped link. One condition rather than a second start/stop path:
  // a pause is `active` going false, so it stands down through the same
  // cleanup as a link coming up, retries included.
  const awake = fore || store.s.session !== null;
  const active = wanted && awake;

  // The one line that tells a radio that was put away from one that failed.
  // Derived here rather than in <Diagnostics>: `fore` is this component's own.
  const asleep = wanted && !awake;
  const wasAsleep = useRef(false);
  useEffect(() => {
    if (asleep === wasAsleep.current) return;
    wasAsleep.current = asleep;
    if (asleep) dlog('buddy', 'radio paused — in background, no session', undefined, true);
    else if (active) dlog('buddy', 'radio resumed', undefined, true);
  }, [asleep, active]);

  // The advertised name is read when advertising starts, so a rename has to
  // restart it or the buddy goes on seeing the old one until the radio next
  // happens to. Matching never minded — it goes by install id. Advertising
  // alone: discovery has nothing to say about this phone's name, and
  // restarting it would empty the roster's *Nearby* for a rename. Debounced,
  // because the name field writes on every keystroke.
  const name = myName(store.s);
  const [adName, setAdName] = useState(name);
  useEffect(() => {
    if (name === adName) return;
    const id = setTimeout(() => {
      dlog('buddy', 'name changed', { name });
      setAdName(name);
    }, RENAME_MS);
    return () => clearTimeout(id);
  }, [name, adName]);
  // Ahead of the radio effect on purpose: on the first commit there is no
  // restart to ask for yet, so mounting under a name is not a rename.
  useEffect(() => {
    readvertise.current?.();
  }, [adName]);

  useEffect(() => {
    const r = radio;
    if (!r || !active) return;
    let alive = true;

    // The two halves, and which of them Nearby has taken.
    const halves = {
      advertising: {
        go: () => r.startAdvertising(encodePeerName(ref.current.s.selfId, myName(ref.current.s))),
        stop: () => r.stopAdvertising(),
      },
      discovery: { go: () => r.startDiscovery(), stop: () => r.stopDiscovery() },
    };
    const up = { advertising: false, discovery: false };
    // Discovery is the only half that steps aside. Advertising runs for as
    // long as the effect does: a phone that stopped being findable while its
    // own connection formed could not be asked by anyone else, and being seen
    // costs the radio far less than looking. True until the follower below
    // says otherwise, which it does at once unless something is forming.
    let paused = true;
    // The advertised name moved, so advertising starts over — see `adName`.
    let renamed = false;
    // When discovery last took, and whether a restart of it is owed — see
    // `rediscover` below.
    let started = 0;
    let restart = false;
    let queued = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const start = async (what: Half): Promise<number | null> => {
      try {
        await halves[what].go();
        up[what] = true;
        if (what === 'discovery') started = Date.now();
        dlog('buddy', `${what} started`);
        return null;
      } catch (e) {
        // The status is the part worth having: it is what tells a Location
        // switch from a settling Bluetooth stack from a missing permission,
        // and so a silent radio from a quiet gym.
        const status = startStatusOf(e);
        dlog('buddy', `${what} refused`, {
          status: status ?? undefined,
          err: radioErr(e).err,
        });
        return status ?? NO_STATUS;
      }
    };

    // What the screen was last told. Null until the first round has reported,
    // so every start of the radio opens with one `radio state` line carrying
    // the switches — after that, only a change is worth one.
    let told: RadioState | null = null;
    const tell = (next: RadioState, why: Record<string, unknown>) => {
      if (next === told) return;
      dlog('buddy', 'radio state', { state: next, was: told ?? undefined, ...why }, true);
      told = next;
      ref.current.patch((s) => {
        // With Bluetooth off nobody is in reach, whatever was found before it
        // went. Every other state leaves the list alone: a phone that cannot
        // advertise may still be discovering, and the found-event that listed
        // a peer fires once.
        const peers = next === 'bluetooth' && s.nearbyPeers.length > 0 ? { nearbyPeers: [] } : {};
        return s.radioState === next ? null : { radioState: next, ...peers };
      });
    };

    let run = 0;
    let wentOff = false;
    let busy = false;
    let again = false;

    // One look at everything the radio needs, and a start for whichever half
    // is not running. Nearby can refuse a start in the seconds after a link
    // drops — the Bluetooth stack is still settling — and a swallowed failure
    // used to leave the radio silent until `active` next toggled, which after
    // a mid-workout drop is never. So this runs on a ticker for as long as the
    // radio is wanted: a refused half is retried until it takes (a late
    // double-start fails with STATUS_ALREADY_ADVERTISING and simply goes round
    // again), and a switch thrown or a permission granted while the app is
    // open is seen on the next round rather than on the next restart.
    //
    // The permission is *checked* here, never asked for. This effect re-runs
    // on every dropped link, and a system dialog is only ever the answer to a
    // tap — see `askRadioPermissions`.
    const round = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const grant = await radioGrant();
        let switches = await radioSwitches();
        const statuses: number[] = [];
        if (grant === 'granted') {
          if (switches.bluetooth === false) wentOff = true;
          else if (wentOff) {
            // Bluetooth is back. Whatever was running when it went is not
            // known to have survived it, and Nearby does not say — so both
            // halves start over rather than be believed.
            wentOff = false;
            for (const what of HALVES) {
              if (!alive || !up[what]) continue;
              up[what] = false;
              await halves[what].stop().catch(() => {});
            }
          }
          if (renamed) {
            renamed = false;
            if (up.advertising) {
              up.advertising = false;
              await halves.advertising.stop().catch(() => {});
            }
          }
          if (restart) {
            // A restart of discovery, owed by `rediscover`. Done here, inside
            // the round, because the round is the one thing that starts and
            // stops the halves: a stop sent from outside it could land after a
            // start it had just made, and leave discovery off and believed on.
            restart = false;
            dlog('buddy', 'discovery restarting', undefined, true);
            // Emptied first — everybody still in the room is re-reported within
            // moments, and an entry that isn't was the stale one.
            ref.current.patch((s) => (s.nearbyPeers.length > 0 ? { nearbyPeers: [] } : null));
            if (up.discovery) {
              up.discovery = false;
              await halves.discovery.stop().catch(() => {});
            }
          }
          if (paused && up.discovery) {
            dlog('buddy', 'discovery paused — connection forming');
            up.discovery = false;
            await halves.discovery.stop().catch(() => {});
          }
          for (const what of HALVES) {
            // Checked per half: the cleanup may have run while the other one
            // was starting, and a start after it would outlive the effect.
            if (!alive || up[what] || (what === 'discovery' && paused)) continue;
            const status = await start(what);
            if (status !== null) statuses.push(status);
          }
          // Nearby still switches Bluetooth on by itself when a start asks it
          // to, so a reading taken before the start may already be out of
          // date. (Google has announced the end of that for late 2026, which
          // is when the first reading starts being the true one.)
          if (switches.bluetooth === false && statuses.length === 0) {
            switches = await radioSwitches();
            if (switches.bluetooth !== false) wentOff = false;
          }
        }
        if (!alive) return;
        run = refusedIn(statuses) ? run + 1 : 0;
        tell(radioStateOf({ grant, statuses, bluetooth: switches.bluetooth, run }), {
          grant,
          bluetooth: switches.bluetooth ?? undefined,
          location: switches.location ?? undefined,
          status: statuses.length > 0 ? statuses.join(',') : undefined,
        });
      } finally {
        busy = false;
        if (again && alive) {
          again = false;
          void round();
        }
      }
    };

    // Stop and start discovery, which is the only way to be told again who is
    // really there: Nearby reports an endpoint once per run and is unreliable
    // about reporting one lost. Spaced `RETRY_MS` apart at the least, because
    // discovery is the heavy half of the radio and a run of refusals must not
    // turn into a run of restarts.
    rediscover.current = () => {
      if (!alive || queued) return;
      queued = true;
      timers.push(
        setTimeout(
          () => {
            queued = false;
            if (!alive) return;
            restart = true;
            void round();
          },
          Math.max(0, started + RETRY_MS - Date.now())
        )
      );
    };

    readvertise.current = () => {
      if (!alive) return;
      renamed = true;
      void round();
    };

    // The pause, decided by `scanFollower` and carried out by the round —
    // which stays the one thing that starts and stops a half, so a pause, a
    // restart and a retry cannot cross. A pause keeps the list: those
    // endpoints are still requestable, and emptying it would take the buddy
    // off the roster for the length of the very connection being made to them.
    const held = formed.current;
    const scan = scanFollower(
      {
        start: () => {
          paused = false;
          void round();
        },
        stop: () => {
          paused = true;
          void round();
        },
      },
      !held.any()
    );
    held.attach(scan);
    // Opens at once: the round checks the permissions itself on every pass.
    scan.open();

    void round();
    const ticker = setInterval(() => void round(), RETRY_MS);
    // The two moments the answer is known to have just moved: a dialog was
    // answered or a line tapped (the poke), and the app came back to the front
    // — which is how a trip to Android's settings ends.
    const offPoke = onRadioPoke(() => void round());
    const onApp = AppState.addEventListener('change', (next) => {
      if (next === 'active') void round();
    });

    return () => {
      alive = false;
      rediscover.current = null;
      readvertise.current = null;
      held.attach(null);
      scan.close();
      timers.forEach(clearTimeout);
      clearInterval(ticker);
      offPoke();
      onApp.remove();
      r.stopAdvertising().catch(() => {});
      r.stopDiscovery().catch(() => {});
      // Nothing is asking for the radio any more, so nothing is known to be
      // stopping it: the line goes with the search it was about.
      ref.current.patch({ nearbyPeers: [], radioState: 'ok' });
    };
  }, [active]);

  /* — reconnection: a ticker, because the found-event fires once — */

  // The only connection this phone opens by itself is back to the buddy of
  // the live pairing. `onEndpointFound` covers the buddy *reappearing*, but
  // the event is edge-triggered: a link that drops while the endpoint stays
  // in Nearby's found-set never fires it again, and a `requestConnection`
  // that failed was simply swallowed. The ticker is the level-triggered half:
  // while the pairing stands and the link is down, whoever is visible in
  // `nearbyPeers` and matches the buddy gets re-requested until one attempt
  // lands. The non-preferred side (see `initiator`) sits out the first
  // `GRACE_TICKS` visible ticks so the crossed-request collision that used to
  // eat most reconnects can't happen, then tries anyway.
  //
  // Its patience is unlimited, and that is earned by exactly one case: a
  // standing pairing, where both people already agreed to the link being
  // healed. An ask borrows the ticker without having earned the patience, so
  // an ask carries its own end (see the deadline below, and `askStrike`) — and
  // skips the grace, there being nobody on the other phone to collide with.
  //
  // Gated on `awake` with the radio: with discovery put away there is nobody
  // in `nearbyPeers` to request, and a ticker left running would spend the
  // pause writing *buddy not visible* every five seconds.
  const wantBuddy =
    radio !== null && store.s.buddy !== null && store.s.buddyEndpoint === null && awake;

  useEffect(() => {
    if (!wantBuddy) return;
    let seen = 0;
    const id = setInterval(() => {
      const st = ref.current;
      const name = st.s.buddy;
      if (!name || st.s.buddyEndpoint !== null) return;
      // The newest match, not the first: a buddy who restarted their app is
      // in this list under their old address too until Nearby says otherwise.
      const peer = pickPeer(st.s.nearbyPeers, name, st.s.buddyIds[name]);
      if (!peer) {
        // The heal is stuck at discovery rather than at the request — the two
        // are indistinguishable from the screen and want opposite fixes.
        dlog('buddy', 'reconnect: buddy not visible', { buddy: name, peers: st.s.nearbyPeers.length });
        return;
      }
      seen += 1;
      const asking = st.s.joinSent?.state === 'waiting';
      if (!asking && !initiator(st.s, peer) && seen <= GRACE_TICKS) {
        dlog('buddy', 'reconnect: holding back', { tick: seen, of: GRACE_TICKS });
        return;
      }
      link.current?.request(peer.endpointId, 'ticker');
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [wantBuddy]);

  /* — an ask must end — */

  // `requestSession` leaves `buddy` and a waiting `joinSent` standing, and
  // until the link is trusted nothing on the other phone knows it was asked.
  // If that link never forms the asker used to read *waiting for an answer*
  // for as long as the app stayed open, over a ticker re-requesting every
  // five seconds. So the ask has a deadline, counted from the tap and lifted
  // the moment the link is up — from there the wait is for a person, and a
  // person may take as long as they like.
  const askingTo =
    radio !== null && store.s.joinSent?.state === 'waiting' && store.s.buddyEndpoint === null
      ? store.s.joinSent.to
      : null;

  useEffect(() => {
    if (askingTo === null) return;
    const id = setTimeout(() => {
      dlog('buddy', 'ask timed out', { to: askingTo, ms: ASK_MS }, true);
      ref.current.patch((s) => askEnded(s));
    }, ASK_MS);
    return () => clearTimeout(id);
  }, [askingTo]);

  /* — shared-session transitions: host on start, notify on end — */

  const session = store.s.session;
  const prevSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    const prev = prevSessionRef.current;
    prevSessionRef.current = session;
    if (!radio) return;
    const out = link.current;
    const st = ref.current;

    // A routine session just started while a buddy is connected → host it.
    if (session && !prev && session.rid && st.s.buddyEndpoint && st.s.sessionRole === null) {
      const routine = st.s.routines.find((x) => x.id === session.rid);
      if (routine) {
        dlog('buddy', 'hosting — invite out', { rid: routine.id }, true);
        st.patch({ sessionShared: true, sessionRole: 'host', buddyJoin: 'pending' });
        out?.send(st.s.buddyEndpoint, {
          v: 1,
          t: 'sessionInvite',
          invite: { routine, ...routineClosure(st.s, routine) },
        });
      }
    }

    // The shared session ended (finished or discarded — the buddy just sees
    // "finished" either way, v1) → final full-state message, then reset.
    if (!session && prev && st.s.sessionShared) {
      if (st.s.buddyEndpoint) {
        out?.send(st.s.buddyEndpoint, {
          v: 1,
          t: 'progress',
          state: progressOf(prev, -1, sharedOf(st.s), true),
        });
      }
      st.patch({
        sessionShared: false,
        sessionRole: null,
        buddyJoin: null,
        buddyProgress: null,
        buddyRest: null,
        turnModes: {},
        myBids: {},
      });
    }
  }, [session]);

  /* — live progress broadcast: full state, debounced — */

  const shouldBroadcast =
    radio !== null && session !== null && store.s.sessionShared && store.s.buddyEndpoint !== null;

  useEffect(() => {
    if (!shouldBroadcast) return;
    const id = setTimeout(() => {
      const cur = ref.current.s;
      if (!cur.session || !cur.buddyEndpoint) return;
      // The one send worth a line every time: the buddy's whole picture of this
      // session is whatever the last of these carried, so "their rest never
      // showed" and "their turn never came round" are both answered by whether
      // this fired and what `rest` was in it.
      dlog('buddy', 'progress out', { active: cur.active, rest: restLeftOf(cur) || undefined });
      link.current?.send(cur.buddyEndpoint, {
        v: 1,
        t: 'progress',
        state: progressOf(
          cur.session,
          cur.active,
          sharedOf(cur),
          false,
          restLeftOf(cur),
          // What the buddy needs to name an exercise of ours they haven't
          // got — almost always nothing, and computed off the list rather
          // than off a routine, because a free session has no routine and
          // an exercise added mid-workout is in neither.
          closureFor(
            cur,
            cur.session.list.map((e) => e.ex)
          )
        ),
      });
    }, 250);
    return () => clearTimeout(id);
    // `session` (object identity), `active` and the shared registers are what
    // the broadcast reads; buddyEndpoint re-fires it after a reconnect, which
    // is the resync. Merging a peer's turn modes or first-up register never
    // bumps a rev, so the rebroadcast it triggers dies on their side rather
    // than echoing back; `myBids` is own state and is never merged at all.
    //
    // buddyJoin is here for the host's benefit: their session started before
    // the guest accepted, so without a resend on "joined" the guest sits on
    // "waiting to join" until the host happens to tick something.
    //
    // `rest` is here for the *skip*, not the start: a rest starting rides out
    // on the session change that earned it (the debounce coalesces the two),
    // but "start now" changes nothing else, and without a resend the buddy
    // would watch a countdown its owner had already dismissed. It is not a
    // per-second dependency — `rest` is written when a set lands, when it is
    // skipped, and when the session resets, and never in between.
  }, [
    shouldBroadcast,
    session,
    store.s.active,
    store.s.turnModes,
    store.s.firstUp,
    store.s.myBids,
    store.s.buddyJoin,
    store.s.buddyEndpoint,
    store.s.rest,
  ]);

  /* — co-created routine draft: announce once, then broadcast full state — */

  const draftRid = store.s.coDraft?.rid ?? null;
  const draftRole = store.s.coDraft?.role ?? null;

  // The starter announces the fresh draft; the buddy's phone opens the same
  // editor on receipt. Joiners never announce — that would boomerang.
  useEffect(() => {
    if (!draftRid || draftRole !== 'starter') return;
    const st = ref.current;
    const draft = st.draftPayload();
    if (draft && st.s.buddyEndpoint)
      link.current?.send(st.s.buddyEndpoint, { v: 1, t: 'draftStart', draft });
  }, [draftRid, draftRole]);

  const draftRev = store.s.coDraft?.rev ?? 0;
  const draftPicking =
    store.s.coDraft !== null &&
    store.s.picker === 'routine' &&
    store.s.routineOpen === store.s.coDraft.rid;
  const shouldShareDraft =
    radio !== null && store.s.coDraft !== null && store.s.buddyEndpoint !== null;

  // Same shape as the progress broadcast: full state, debounced, so any one
  // message resyncs the buddy — including the first after a reconnect. Only
  // local edits bump `rev`; applying the buddy's update doesn't, which is
  // what keeps the two phones from echoing forever.
  useEffect(() => {
    if (!shouldShareDraft) return;
    const id = setTimeout(() => {
      const st = ref.current;
      const draft = st.draftPayload();
      if (draft && st.s.buddyEndpoint)
        link.current?.send(st.s.buddyEndpoint, { v: 1, t: 'draftUpdate', draft });
    }, 250);
    return () => clearTimeout(id);
  }, [shouldShareDraft, draftRev, draftPicking, store.s.buddyEndpoint]);

  /* — event wiring, once — */

  useEffect(() => {
    const r = radio;
    if (!r) return;

    // Consecutive undelivered payloads per endpoint, reset by anything that
    // proves the link alive (a delivery, a receive). Effect-local like the
    // listeners that share it: the wiring mounts once.
    const flaky = new Map<string, number>();
    // The forming set, and every request this phone makes — see
    // `watchRequests`. The object is the ref's own and is never replaced, so
    // this is the one the radio effect attaches its scan to.
    const forming = formed.current;
    const asks = watchRequests(forming.request);
    // Connection requests this phone has out, one marker per endpoint, each
    // cleared by the connection's outcome or by `REQUEST_MS`. Mirrored into
    // the store as `requesting` so a row can say *Invite sent* truthfully.
    const inflight = new Map<
      string,
      { from: RequestFrom; timer: ReturnType<typeof setTimeout> }
    >();
    // Requests turned down in a row — see `STALE_AFTER`. Reset by any
    // connection being offered: somebody answered, so the list is not lying.
    let stale = 0;

    const publish = () => {
      const ids = [...inflight.keys()];
      ref.current.patch((s) =>
        s.requesting.length === ids.length && ids.every((id) => s.requesting.includes(id))
          ? null
          : { requesting: ids }
      );
    };

    /** Take a request's marker down. True when there was one to take. */
    const settle = (endpointId: string) => {
      const held = inflight.get(endpointId);
      if (!held) return false;
      clearTimeout(held.timer);
      inflight.delete(endpointId);
      publish();
      return true;
    };

    /**
     * Drop everything this phone remembers about a connection to an endpoint.
     * The handshake state dies with the link — a fresh connection re-derives
     * digits and must re-prove the secret — and its deadline goes with it.
     */
    const forget = (endpointId: string) => {
      const info = meta.current.get(endpointId) ?? null;
      const proven = authed.current.has(endpointId);
      if (info?.timer) clearTimeout(info.timer);
      // Whatever was forming with this endpoint is over, so the scan comes
      // back. A handshake that ended here never reached `trust`, so `active`
      // never went false and nothing else would bring discovery back.
      forming.release(endpointId);
      meta.current.delete(endpointId);
      authed.current.delete(endpointId);
      flaky.delete(endpointId);
      return { info, proven, ours: settle(endpointId) };
    };

    // Said to the user, not only to the log. Everything below that refuses,
    // gives up on or is refused a pairing ends here — a refusal used to be a
    // disconnect and a `dlog`, which on a phone with diagnostics off (every
    // phone, by default) is a connection that silently never happens.
    const report = (who: string, why: PairingIssue, endpointId: string) => {
      dlog('buddy', 'pairing issue', { endpoint: endpointId, who, why }, true);
      ref.current.failPairing(who, why);
    };

    // This phone's hello: its version, the handshake it is running, and that
    // handshake's own evidence. Built in one place because it is sent from
    // two — on connect, and by the adopting side of a pairing once it has the
    // token to acknowledge.
    const greet = (endpointId: string, info: Handshake, extra: Record<string, unknown>) => {
      const st = ref.current;
      // Through `send`, so a hello Nearby refuses is heard like any other
      // payload: one that never left is a handshake the other phone will wait
      // out, and the deadline is what ends it on this one.
      send(endpointId, {
        v: 1,
        t: 'hello',
        pv: PROTOCOL_VERSION,
        kind: info.kind,
        name: myName(st.s),
        id: st.s.selfId,
        ...extra,
      });
    };

    // A handshake that failed on a link that is up: say why, put the
    // bookkeeping away — from here nothing this endpoint sends is honoured —
    // and hang up a beat later (see `LEAVE_MS`).
    const fail = (endpointId: string, why: PairingIssue) => {
      const info = meta.current.get(endpointId);
      if (info) report(info.who, why, endpointId);
      forget(endpointId);
      setTimeout(() => r.disconnectFrom(endpointId).catch(() => {}), LEAVE_MS);
    };

    // A pairing that connected and never finished. Said, because two people
    // are waiting on it — and if this phone had already taken its half (the
    // adopting side trusts as it answers, and then waits to hear back), that
    // half comes down with it. Left standing it is a pairing only one phone
    // believes in: a buddy card reading "Reconnecting…" and a ticker asking
    // for a link the other phone has no secret to accept.
    const stalled = (endpointId: string, info: Handshake) => {
      if (authed.current.has(endpointId)) ref.current.endPairing();
      report(info.who, 'stalled', endpointId);
    };

    // A link is gone — Nearby said so (onDisconnected), or this phone stopped
    // believing in it (undelivered payloads, a refused send, a handshake
    // nobody finished). One teardown for all of them, so the paths cannot
    // drift. For the link that was the buddy's, clearing buddyEndpoint is what
    // flips `active` back on, which restarts advertising, discovery and the
    // ticker. For one that never got that far — it dropped between
    // `onConnected` and `trust` — there is no state to take back, but there
    // may be a code stage open on it and an ask waiting on it, and both used
    // to be left standing.
    const dropLink = (endpointId: string) => {
      const open = meta.current.get(endpointId);
      // A pairing that went down before it was one. The two of you confirmed
      // a code for it, so it does not get to vanish: a reconnect that drops
      // mid-handshake is the ticker's to retry and stays quiet, a pairing has
      // nobody to retry it but the people holding the phones. Still holding a
      // timer means the handshake never closed — one that failed by verdict
      // has been reported and forgotten already.
      if (open?.kind === 'pair' && open.timer) stalled(endpointId, open);
      const { info, proven } = forget(endpointId);
      dlog('buddy', 'link torn down', { endpoint: endpointId, proven }, true);
      ref.current.patch((s) => {
        if (s.buddyEndpoint === endpointId)
          return {
            buddyEndpoint: null,
            buddySyncPending: false,
            // An ask that ended in a dropped link is not a yes. Let the
            // pairing go rather than chase them down and ask again — and say
            // so, where this used to clear the line without a word. It is
            // also the backstop for a refusal that never arrived.
            ...askEnded({ ...s, buddyEndpoint: null }),
            ...(s.sessionShared ? {} : { buddySnapshot: null }),
          };
        const d = {
          ...(s.pendingAuth?.endpointId === endpointId ? { pendingAuth: null } : {}),
          // A handshake that was under way and never proved anything is an
          // attempt the ask has lost.
          ...(info && !proven ? askStrike(s, info.peer) : null),
        };
        return Object.keys(d).length > 0 ? d : null;
      });
    };

    /** A connection is being made with this endpoint, or stands. */
    const underWay = (endpointId: string) => {
      const info = meta.current.get(endpointId);
      if (!info) return false;
      // Up — handshaking against its deadline, or trusted. `dropLink` ends it.
      if (info.linked) return true;
      // Offered and not yet resolved. Bounded, so a result Nearby never
      // delivers cannot leave this endpoint unrequestable for good.
      return Date.now() - info.since < REQUEST_MS;
    };

    /** Disconnect, and don't wait to be told — Nearby may never echo it. */
    const hangUp = (endpointId: string) => {
      r.disconnectFrom(endpointId).catch(() => {});
      dropLink(endpointId);
    };

    // A connection attempt came to nothing before there was a link: the
    // request was turned down, or the connection it started failed. Three
    // things may follow, and each is a way the old swallowed `.catch` kept
    // the app asking a question it had already been answered:
    //  - the address is no good (`isGone`) → the entry leaves the list, so
    //    neither the roster row nor the ticker offers it again;
    //  - an ask was waiting on it → the ask is charged one attempt;
    //  - the list keeps being wrong → discovery restarts. Also when the
    //    eviction left nobody listed for that phone, because 8012 is as often
    //    a passing radio error as a dead address, and without a fresh run a
    //    buddy evicted over one would stay invisible while standing there.
    const lost = (
      endpointId: string,
      status: number | null,
      known: PeerIdentity | null,
      ours: boolean
    ) => {
      const st = ref.current;
      const peer = known ?? st.s.nearbyPeers.find((p) => p.endpointId === endpointId) ?? null;
      const gone = isGone(status);
      const emptied = gone && lastOfPeer(st.s.nearbyPeers, endpointId);
      if (gone) dlog('buddy', 'stale endpoint evicted', { endpoint: endpointId, status }, true);
      st.patch((s) => {
        const d = {
          ...(gone && s.nearbyPeers.some((p) => p.endpointId === endpointId)
            ? { nearbyPeers: s.nearbyPeers.filter((p) => p.endpointId !== endpointId) }
            : {}),
          // An attempt with somebody else is not the ask's to pay for; one
          // nobody can put a name to only counts if this phone made it.
          ...(peer !== null || ours ? askStrike(s, peer) : null),
        };
        return Object.keys(d).length > 0 ? d : null;
      });
      // A rejection is an answer from a phone that is there — the list was
      // right about it, whatever else went wrong.
      if (ours && status !== STATUS.rejected) stale += 1;
      if (stale >= STALE_AFTER || emptied) {
        stale = 0;
        rediscover.current?.();
      }
    };

    // The one way a connection is asked for. Four sites used to call
    // `requestConnection` themselves — the found-handler, the ticker, the
    // roster's *Request a session* and the share sheet's invite — with four
    // error handlers, three of them empty, and nothing to stop the second
    // asking while the first was still forming.
    const request = (endpointId: string, from: RequestFrom) => {
      if (inflight.has(endpointId) || underWay(endpointId)) {
        dlog('buddy', 'request held — one already in flight', { endpoint: endpointId, from });
        return false;
      }
      const st = ref.current;
      const mine = {
        from,
        timer: setTimeout(() => {
          dlog(
            'buddy',
            'request unanswered',
            { endpoint: endpointId, from, ms: REQUEST_MS },
            true
          );
          settle(endpointId);
        }, REQUEST_MS),
      };
      inflight.set(endpointId, mine);
      publish();
      dlog('buddy', 'request out', { endpoint: endpointId, from }, true);
      // Said twice and never apart (`requestPeer`): a pairing only ever from
      // the share sheet, everything else a plain request the secret proves.
      const kind = from === 'invite' ? 'pair' : 'link';
      requestPeer(kind, { id: st.s.selfId, name: myName(st.s) }, endpointId).catch((e) => {
        const status = statusOf(e);
        dlog(
          'buddy',
          'request refused',
          { endpoint: endpointId, from, status: status ?? undefined, err: radioErr(e).err },
          true
        );
        // A refusal that outlived its marker and found a newer request in its
        // place is about the old one; the new one keeps its marker.
        const held = inflight.get(endpointId);
        if (held !== undefined && held !== mine) return;
        settle(endpointId);
        // The handshake state is left alone: a refused request never became a
        // connection, so whatever `meta` holds for this endpoint belongs to
        // one that did.
        lost(endpointId, status, null, true);
      });
      return true;
    };

    // A payload that did not arrive. Two in a row with nothing delivered
    // between them and the failure is believed over the connection: tear the
    // link down ourselves, which is exactly what restarts the radio and the
    // reconnect ticker. A false positive costs a silent re-link seconds
    // later; the old behaviour cost the rest of the workout. Any endpoint,
    // not just the buddy link: a hello that can't be delivered is a handshake
    // that will never finish.
    const undelivered = (endpointId: string) => {
      const n = (flaky.get(endpointId) ?? 0) + 1;
      flaky.set(endpointId, n);
      dlog('buddy', 'payload undelivered', { endpoint: endpointId, run: n }, true);
      if (n >= FLAKY_AFTER) hangUp(endpointId);
    };

    // The one way a payload leaves. `sendPayload` resolving only ever meant
    // *enqueued*, and a delivery that then fails arrives as `onPayloadFailed`
    // — but a send Nearby refuses outright rejects the promise instead, and
    // every sender used to swallow that. It is the clearest thing Nearby says
    // about a link, so it is heard here: no link to send over (`isUnlinked`)
    // ends the link at once, anything else counts like an undelivered payload.
    // One payload can report both ways — the transfer update may beat the
    // promise — which makes a send that failed twice over a teardown on its
    // own. That errs the cheap way round.
    //
    // The snapshot is the one payload big enough to hit Nearby's ~32KB BYTES
    // cap, and a refusal of it lands here like any other: logged with its
    // type, and the link still up, so the heal path re-runs `trust` and
    // re-sends. A library that genuinely can't fit one payload wants chunking
    // (a STREAM payload) — see the module.
    const send = (endpointId: string, msg: BuddyMessage) =>
      r.sendPayload(endpointId, JSON.stringify(msg)).then(
        () => true,
        (e) => {
          const status = statusOf(e);
          dlog(
            'buddy',
            'send refused',
            { endpoint: endpointId, t: msg.t, status: status ?? undefined, err: radioErr(e).err },
            true
          );
          if (isUnlinked(status)) hangUp(endpointId);
          else undelivered(endpointId);
          return false;
        }
      );

    // Trust an endpoint: mark it authenticated, make it the buddy link, and
    // send the two things that wait behind the handshake — our snapshot and
    // any pending join-ask. Called once both hellos agree: on a pairing after
    // the secret has changed hands (and, on the minting side, been
    // acknowledged), on a reconnect after their proof checks out. Never before.
    const trust = (endpointId: string) => {
      const st = ref.current;
      const info = meta.current.get(endpointId);
      // The adopting side of a pairing keeps its deadline: it trusts as it
      // answers, so it cannot yet know the answer arrived. Hearing anything
      // back is what closes its handshake (see `onPayload`).
      if (info?.timer && !(info.kind === 'pair' && info.incoming)) {
        clearTimeout(info.timer);
        info.timer = undefined;
      }
      // `since` was re-stamped when the link came up, so this is the
      // handshake alone.
      if (info)
        dlog(
          'buddy',
          'handshake',
          { endpoint: endpointId, ms: Date.now() - info.since, kind: info.kind },
          true
        );
      dlog('buddy', 'trusted — snapshot out', { endpoint: endpointId, kind: info?.kind }, true);
      // Let go without resuming: the link is about to turn the radio off.
      forming.release(endpointId, false);
      authed.current.add(endpointId);
      // A pairing is on the roster from here, not from the snapshot: the
      // secret has just been recorded under this name, and a secret with no
      // roster entry is one `judgeOffer` can never find. The snapshot still
      // does the renaming, as before.
      if (info?.kind === 'pair') st.rememberBuddy(info.who, info.peer.id);
      st.patch((s) => ({
        buddyEndpoint: endpointId,
        // A link is up, so the radio has stopped looking and the share sheet
        // would be radiating at nobody.
        scanning: false,
        // Whatever was wrong between the two of you, it isn't any more.
        ...(info && s.pairingIssue?.name === info.who ? { pairingIssue: null } : {}),
        // A pairing becomes standing here and not at `onConnected`, where it
        // used to: a hello that turned out to be the wrong kind, or the wrong
        // version, then left `buddy` set on a pairing that never was — and a
        // reconnect ticker asking for it every five seconds. The sync screen
        // opens off the snapshot, and only if the two sides differ.
        ...(info?.kind === 'pair' ? { buddy: info.who, buddySyncPending: true } : {}),
      }));
      send(endpointId, {
        v: 1,
        t: 'snapshot',
        name: myName(st.s),
        id: st.s.selfId,
        data: shareableSlice(st.s),
      });
      // This phone opened the link to ask something — the ask follows the
      // snapshot, so the other side knows who is asking by the time it lands.
      if (st.s.joinSent?.state === 'waiting') send(endpointId, { v: 1, t: 'joinAsk' });
    };

    const api: Link = { request, send, hangUp };
    link.current = api;
    const release = claimLink(api);

    const subs = [
      r.addListener('onEndpointFound', (e) => {
        const st = ref.current;
        const peer = decodePeerName(e.name);
        // Two endpoints under one install id is a buddy who restarted their
        // app, and only one of the two can answer.
        dlog('buddy', 'endpoint found', {
          endpoint: e.endpointId,
          id: shortId(peer.id),
          name: peer.name,
        });
        // Everything else advertising this install id is the same phone under
        // an address it has since given up — see `withFound`.
        const dead = st.s.nearbyPeers.filter(
          (p) => p.endpointId !== e.endpointId && peer.id !== null && p.id === peer.id
        );
        if (dead.length > 0)
          dlog(
            'buddy',
            'stale endpoint replaced',
            { endpoint: e.endpointId, was: dead.map((p) => p.endpointId).join(',') },
            true
          );
        st.patch((s) => ({
          nearbyPeers: withFound(s.nearbyPeers, {
            endpointId: e.endpointId,
            id: peer.id,
            name: peer.name,
          }),
        }));
        // The buddy of this session reappeared — reconnect without anyone
        // having to tap anything. That is the mid-workout drop, and the only
        // connection this phone ever opens by itself: everyone else on the
        // roster is seen and listed, and stays that way until one of the two
        // asks for a session and the other one answers. Matched by install
        // id first, so a renamed buddy is still recognised. Only the
        // preferred side requests here — the other waits for the ticker's
        // grace to run out, so the two found-events firing together can't
        // cross requests (see `initiator`). An ask is the exception: it was
        // this phone's tap, the other one is not looking for anybody, and
        // after a discovery restart this is the first it hears of them.
        if (
          !st.s.buddyEndpoint &&
          st.s.buddy !== null &&
          matchesBuddy(st.s.buddy, st.s.buddyIds[st.s.buddy], peer) &&
          (st.s.joinSent?.state === 'waiting' || initiator(st.s, peer))
        ) {
          request(e.endpointId, 'found');
        }
      }),

      r.addListener('onEndpointLost', (e) => {
        // Worth a line for whether it fires at all: Nearby is late with this
        // one, or never sends it, and a stale entry is what it leaves behind.
        dlog('buddy', 'endpoint lost', { endpoint: e.endpointId });
        ref.current.patch((s) => ({
          nearbyPeers: s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId),
        }));
      }),

      // A connection is offered, and this is where its kind is settled — by
      // the request, not by what either phone happens to hold (`judgeOffer`).
      // The requester says which it is in the name it requests under
      // (`encodePeerName`'s mark) and remembers having said it
      // (`takeRequestKind`), so both ends read one fact.
      //
      //   pair   both confirm the digits, in the share sheet; the secret is
      //          minted fresh whatever either side held
      //   proof  both accept in silence and prove the secret after connect
      //
      // Nothing is kept in `meta` for a connection this phone turns away, so
      // the refusal's own echo (`onConnectionFailed`) finds nothing to report.
      r.addListener('onConnectionInitiated', (e) => {
        const st = ref.current;
        const hail = decodePeerName(e.name);
        const peer: PeerIdentity = { id: hail.id, name: hail.name };
        // Somebody answered, so the list was right about who is there.
        stale = 0;
        // A fresh connection proves itself afresh, whatever an earlier one on
        // this address was trusted with.
        const before = meta.current.get(e.endpointId);
        if (before?.timer) clearTimeout(before.timer);
        meta.current.delete(e.endpointId);
        authed.current.delete(e.endpointId);

        const roster = rosterNameFor(st.s, peer);
        const who = roster ?? peer.name;
        const offer = {
          incoming: e.isIncoming,
          pairing: e.isIncoming ? hail.pairing : takeRequestKind(e.endpointId) === 'pair',
          sharing: st.s.scanning,
          onRoster: roster !== null,
          haveSecret: roster !== null && st.s.buddySecrets[roster] !== undefined,
        };
        const verdict = judgeOffer(offer);
        // Everything the decision was made on, and the decision — so the
        // branch taken can be read off the line, the ones that say no included.
        dlog(
          'buddy',
          'connection offered',
          {
            endpoint: e.endpointId,
            id: shortId(peer.id),
            name: peer.name,
            ...offer,
            roster: roster ?? 'none',
            take: verdict.take ?? 'refused',
            why: verdict.take === null ? (verdict.why ?? 'stranger') : undefined,
          },
          true
        );

        if (verdict.take === null) {
          r.rejectConnection(e.endpointId).catch(() => {});
          // Turned away without ever taking a hold: a stranger knocking is no
          // reason to stop looking. The release is for a request of our own,
          // which paused the scan on its way out.
          forming.release(e.endpointId);
          if (verdict.why) report(who, verdict.why, e.endpointId);
          return;
        }

        meta.current.set(e.endpointId, {
          digits: e.authDigits,
          incoming: e.isIncoming,
          peer,
          kind: verdict.take,
          who,
          since: Date.now(),
        });
        forming.hold(e.endpointId);

        // A reconnect: no code and no sheet. Accepting the raw (encrypted)
        // link is safe because the secret, proved over it, is the real gate.
        if (verdict.take === 'proof') {
          r.acceptConnection(e.endpointId).catch(() => {});
          return;
        }

        // A pairing. Both sides confirm before the link is trusted: the
        // inviter by typing the displayed code (their accept), the invitee by
        // tapping Confirm in the scan sheet (which calls acceptConnection).
        // Neither is auto-accepted here, so a pairing can't become a durable
        // roster buddy without a human tap. Cancel on either side rejects.
        st.patch({
          pendingAuth: {
            endpointId: e.endpointId,
            id: peer.id,
            name: peer.name,
            digits: e.authDigits,
            incoming: e.isIncoming,
          },
        });
      }),

      // The connection that was offered came to nothing — refused by either
      // side, or lost on the way up. This used to clear the code stage and
      // nothing else, without so much as logging the status, which is how an
      // ask came to be retried for ever: `buddy` and a waiting `joinSent`
      // stood, and nothing had been told the attempt was over. The status is
      // the finding: 8004 is a rejection — somebody's decision — where 8011
      // and 8012 are an endpoint that was never there to answer, the radio's
      // trouble and not a fact about the pairing.
      r.addListener('onConnectionFailed', (e) => {
        const mine = takeDeclined(e.endpointId);
        const { info, ours } = forget(e.endpointId);
        dlog(
          'buddy',
          'connection failed',
          {
            endpoint: e.endpointId,
            status: e.status,
            ours,
            kind: info?.kind,
            declinedHere: mine,
          },
          true
        );
        ref.current.patch((s) =>
          s.pendingAuth?.endpointId === e.endpointId ? { pendingAuth: null } : null
        );
        // Only the other phone's no is news (`judgeRefusal`): this one's own
        // Cancel is a decision it already knows about, and a connection it
        // turned away at the offer left nothing in `meta` to be here for. Said
        // before the attempt is counted, so an ask the report has just ended
        // is not charged for it as well.
        if (info && !mine && e.status === STATUS.rejected)
          report(info.who, judgeRefusal(info.kind, info.incoming), e.endpointId);
        lost(e.endpointId, e.status, info?.peer ?? null, ours);
      }),

      // The link is up and nothing is trusted yet. Both phones say hello at
      // once — version, kind, and the kind's own evidence — and each judges
      // the other's (`judgeHello`). `buddyEndpoint` is not set and `buddy` is
      // not touched until that verdict is in.
      r.addListener('onConnected', (e) => {
        settle(e.endpointId);
        const st = ref.current;
        const info = meta.current.get(e.endpointId);
        if (!info) {
          // A connection this phone never agreed to the terms of.
          hangUp(e.endpointId);
          return;
        }
        info.linked = true;
        info.since = Date.now();
        // `link up` is derived from buddyEndpoint, which is not set until the
        // handshake closes — so this is the only line that says Nearby's half
        // of the link stood while it was still open.
        dlog('buddy', 'connected', { endpoint: e.endpointId, kind: info.kind }, true);
        // The link is up and the handshake begins: the backstop starts over.
        forming.hold(e.endpointId);
        // The wait has an end. If their hello never comes — their JS frozen
        // in the background, an older build, the payload lost — the link is
        // up as far as Nearby is concerned and unknown as far as the app is,
        // and point-to-point allows one connection: while the half-open one
        // stood, every further request to anybody was refused, and no sends
        // were being made for the zombie detector to count.
        info.timer = setTimeout(() => {
          if (meta.current.get(e.endpointId) !== info) return;
          info.timer = undefined;
          dlog(
            'buddy',
            'handshake timed out',
            { endpoint: e.endpointId, kind: info.kind, ms: HANDSHAKE_MS },
            true
          );
          // A reconnect that stalled is the ticker's to try again, and saying
          // so every ten seconds through a bad patch would be noise. A pairing
          // is two people waiting on a sheet.
          if (info.kind === 'pair') stalled(e.endpointId, info);
          hangUp(e.endpointId);
        }, HANDSHAKE_MS);

        if (info.kind === 'pair') {
          // Functional, because the code stage may have been opened by a patch
          // this render has not seen yet.
          st.patch((s) =>
            s.pendingAuth?.endpointId === e.endpointId ? { pendingAuth: null } : null
          );
          // The adopting side says nothing yet: its hello is also its
          // acknowledgement, and there is nothing to acknowledge until the
          // minter's has arrived.
          if (info.incoming) return;
          // Exactly one minter: the side that requested. Always a fresh token
          // — the confirmed code replaces whatever either phone held, which is
          // what makes pairing again the way out of a secret gone stale. It is
          // held here and not recorded: this phone keeps no secret the other
          // has not confirmed receiving.
          info.token = randomToken();
          greet(e.endpointId, info, { newToken: info.token });
          return;
        }

        const secret = st.s.buddySecrets[info.who];
        if (!secret) {
          // Accepted on a secret that has gone since — forgotten between the
          // offer and the link.
          fail(e.endpointId, 'stale');
          return;
        }
        // Hash under *our own* direction: the side that requested the
        // connection is the initiator, the side that accepted the responder.
        // The peer verifies under the opposite lane, so the two proofs never
        // coincide and neither can be reflected back (see `ProofRole`).
        const myRole: ProofRole = info.incoming ? 'responder' : 'initiator';
        greet(e.endpointId, info, { proof: authProof(secret, info.digits, myRole) });
      }),

      r.addListener('onDisconnected', (e) => dropLink(e.endpointId)),

      // Logged and nothing else — see `RadioEvents`. A drop within seconds of
      // one of these was the upgrade; a file with none in it never upgraded.
      r.addListener('onBandwidthChanged', (e) =>
        dlog('buddy', 'bandwidth', {
          endpoint: e.endpointId,
          quality: BANDWIDTH[e.quality] ?? e.quality,
        })
      ),

      // Anything delivered proves the link alive.
      r.addListener('onPayloadSent', (e) => flaky.delete(e.endpointId)),

      // A FAILURE transfer update is Nearby admitting the bytes never arrived
      // — transport-level, so a locked phone (whose process still receives
      // natively) never trips it. This is the zombie case: the peer died
      // without a clean disconnect, `onDisconnected` never fired, and a set
      // buddyEndpoint keeps `active` false — no advertising, no discovery,
      // and a buddy who comes back can never find this phone again. Counted
      // with the sends that were refused outright (see `undelivered`).
      r.addListener('onPayloadFailed', (e) => undelivered(e.endpointId)),

      r.addListener('onPayload', (e) => {
        flaky.delete(e.endpointId);
        const msg = parseBuddyMessage(e.data);
        if (!msg) {
          dlog('buddy', 'payload unparseable', { bytes: e.data.length }, true);
          return;
        }
        dlog('buddy', 'payload in', { t: msg.t });
        const st = ref.current;
        // Nothing but a hello is honoured from an endpoint that hasn't proved
        // the pairing secret — a reconnecting peer's snapshot, item merge,
        // session invite and draft all wait behind `trust`. This is the line
        // that stops a name-only impersonator: it connects, but every
        // sensitive message it sends lands here and is dropped.
        if (msg.t !== 'hello' && !authed.current.has(e.endpointId)) {
          // The impersonator line. Also what an ordering bug would look like,
          // which is exactly why it is worth being able to tell them apart.
          dlog('buddy', 'dropped — endpoint not authenticated', { t: msg.t }, true);
          return;
        }
        // Anything heard from a trusted endpoint closes a handshake that was
        // still waiting to be answered — the adopting side's, whose own hello
        // the minter has evidently received, since it trusts on nothing else.
        const open = meta.current.get(e.endpointId);
        if (msg.t !== 'hello' && open?.timer) {
          clearTimeout(open.timer);
          open.timer = undefined;
        }
        switch (msg.t) {
          case 'hello': {
            const info = meta.current.get(e.endpointId);
            // One hello per handshake. A second changes nothing, and one from
            // an endpoint this phone holds no handshake for has nothing to be
            // judged against.
            if (!info || info.greeted) break;
            const adopting = info.kind === 'pair' && info.incoming;
            const verdict = judgeHello(
              {
                kind: info.kind,
                incoming: info.incoming,
                secret: st.s.buddySecrets[info.who],
                digits: info.digits,
                minted: info.token,
              },
              msg
            );
            if (!verdict.ok) {
              dlog(
                'buddy',
                'hello refused',
                {
                  why: verdict.why,
                  mine: info.kind,
                  theirs: msg.kind ?? 'none',
                  pv: msg.pv ?? 'none',
                  gotProof: !!msg.proof,
                  gotAck: !!msg.ack,
                },
                true
              );
              // The adopting side has not spoken yet, and its hello is how the
              // other phone learns why — so it still says it, with nothing
              // acknowledged, before it leaves.
              if (adopting) greet(e.endpointId, info, {});
              fail(e.endpointId, verdict.why);
              break;
            }
            dlog('buddy', 'hello accepted', { who: info.who, kind: info.kind }, true);
            info.greeted = true;
            if (adopting && verdict.adopt) {
              // Record the secret — over whatever was held — and answer with
              // the hello that acknowledges it, keyed to this connection.
              st.recordBuddySecret(info.who, verdict.adopt);
              greet(e.endpointId, info, { ack: enrolAck(verdict.adopt, info.digits) });
            } else if (info.token) {
              // The minting side, and the token is acknowledged: now it is
              // this phone's secret too.
              st.recordBuddySecret(info.who, info.token);
              info.token = undefined;
            }
            trust(e.endpointId);
            break;
          }
          case 'snapshot':
            // A snapshot only ever arrives from a peer we accepted, so this
            // is the moment a pairing becomes a pairing — and the moment a
            // rename lands: same install id, new display name, and
            // rememberBuddy renames the roster entry instead of adding a
            // stranger. Older builds send no id and stay name-keyed.
            st.rememberBuddy(msg.name, msg.id ?? null);
            // Inside the functional patch, where the onConnected patch has
            // already applied — on a fast link the snapshot arrives before
            // React commits, so reading buddySyncPending via the ref races.
            st.patch((s) => {
              const snapshot = {
                peer: { id: e.endpointId, name: msg.name, device: '' },
                ...msg.data,
              };
              // Fresh pairing: the snapshot decides — nothing to exchange
              // means no sync screen at all.
              const diff = s.buddySyncPending ? diffBuddy(shareableSlice(s), snapshot) : null;
              return {
                buddy: msg.name,
                buddySnapshot: snapshot,
                // A fresh snapshot re-baselines the diff, so the settled set
                // starts over with it — a stale id from an earlier round
                // could dress a row this diff still owes a transfer.
                buddySynced: [],
                // Somebody is here again — the "they left" line has had its say.
                buddyLeft: null,
                ...(diff
                  ? {
                      buddySyncPending: false,
                      buddySync: diff.receive.length > 0 || diff.send.length > 0,
                    }
                  : {}),
              };
            });
            break;
          case 'item':
            // The buddy pushed an item — same merge as tapping Transfer here.
            // Recording the id flips the row on this phone's sync screen, and
            // the ack is what turns their Sent into Received: delivery said
            // the bytes arrived, this says the merge ran.
            if (st.s.buddySnapshot) {
              st.importFromPeer(st.s.buddySnapshot, msg.item);
              const id = syncItemId(msg.item);
              st.markBuddySynced(id);
              send(e.endpointId, { v: 1, t: 'itemAck', id });
            }
            break;
          case 'itemAck':
            st.markBuddySynced(msg.id);
            break;
          case 'sessionInvite':
            st.patch({ buddyInvite: msg.invite });
            // An invite we asked for needs no second question. The updater
            // above lands before acceptInvite's reads it, so this is safe.
            if (st.s.joinSent?.state === 'waiting') {
              st.acceptInvite();
              st.patch({ joinSent: null });
              if (st.s.buddyEndpoint) send(st.s.buddyEndpoint, { v: 1, t: 'sessionJoin' });
            }
            break;

          // Somebody wants to train. The sheet asks; nothing here decides.
          case 'joinAsk':
            st.patch({ joinAsk: st.s.buddy ?? '' });
            break;

          // Mid-routine, yes arrives as the invite instead; this is the plain
          // "sure, let's train" — the two are simply linked from here. A no
          // leaves no connection behind, or the link would outlive the answer.
          case 'joinReply':
            if (msg.ok) st.patch({ joinSent: null });
            else {
              const to = st.s.buddy ?? '';
              st.endPairing();
              st.patch({ joinSent: { to, state: 'declined' } });
            }
            break;
          case 'sessionJoin':
            st.patch({ buddyJoin: 'joined' });
            break;
          case 'sessionDecline':
            st.patch({ buddyJoin: 'declined' });
            break;
          case 'progress':
            st.patch((s) => ({
              buddyProgress: msg.state,
              // Their rest arrives as a remainder and is stamped against this
              // phone's own clock on the way in — the moment it lands is the
              // only instant the two readings are known to agree. A message
              // from a build that predates the field carries none, so their
              // rest simply never shows; the turn row degrades to what it
              // always said.
              buddyRest: msg.state.rest ? { left: msg.state.rest, at: s.elapsed } : null,
              // Any progress proves they're in — covers a lost join message.
              ...(s.buddyJoin === 'pending' ? { buddyJoin: 'joined' as const } : {}),
            }));
            // Turn modes and the first-up register ride along with progress:
            // same full-state model, so whoever missed a change catches up on
            // the next message. Their bids need no merging — they arrive as
            // part of `buddyProgress` and are read from there.
            st.mergeTurnModes(msg.state.modes);
            st.mergeFirstUpFrom(msg.state.first);
            break;
          // They tapped Disconnect. Drop the pairing rather than start
          // hunting for them — but never touch this phone's own session.
          case 'bye':
            st.endPairing(st.s.buddy);
            break;
          case 'draftStart': {
            // Both phones tapped "build together" at once → two competing
            // drafts. Deterministic tiebreak: the lower routine id wins on
            // both sides (applyDraft drops the loser's empty orphan).
            const mine = st.s.coDraft;
            if (!mine || mine.rid === msg.draft.routine.id || msg.draft.routine.id < mine.rid)
              st.applyDraft(msg.draft, true);
            break;
          }
          case 'draftUpdate':
            if (st.s.coDraft?.rid === msg.draft.routine.id) st.applyDraft(msg.draft, false);
            break;
          case 'draftEnd':
            st.endDraftFromPeer(msg.reason, msg.draft);
            break;
        }
      }),
    ];

    const { patch } = ref.current;
    const records = meta.current;
    const proven = authed.current;
    return () => {
      subs.forEach((s) => s.remove());
      asks.remove();
      forming.clear();
      release();
      link.current = null;
      // Every clock this effect started ends with it.
      inflight.forEach((held) => clearTimeout(held.timer));
      inflight.clear();
      records.forEach((info) => {
        if (info.timer) clearTimeout(info.timer);
      });
      records.clear();
      proven.clear();
      patch({ requesting: [] });
    };
  }, []);

  return null;
}
