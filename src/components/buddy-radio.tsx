/**
 * The radio controller — mounted once next to the overlays, renders nothing.
 *
 * Owns the whole Nearby lifecycle so no sheet has to: advertising/discovery
 * run while the user is scanning, waiting in the sync screen, or mid shared
 * session with the connection down (that's the reconnect path — the known
 * buddy is re-requested by name the moment they reappear). Incoming
 * connections are auto-accepted; on connect both sides exchange snapshots;
 * incoming sync items merge into the store through the same importFromPeer
 * as the mock path.
 *
 * Shared workouts (IMPROVEMENTS.md #8) also live here: starting a routine
 * while connected turns the session into a hosted shared one and sends the
 * invite; live progress is broadcast as full state, debounced, so any single
 * message — including the first after a reconnect — fully resyncs the buddy.
 *
 * Listeners are registered exactly once (the store is read through a ref kept
 * current by an effect — the useBackClose pattern, and the React Compiler
 * rule), so radio events never race a re-render. Does nothing in Expo Go.
 */
import { useEffect, useRef } from 'react';

import { ensureRadioPermissions, radio } from '@/data/buddy-radio';
import { dlog } from '@/data/diag';
import {
  authProof,
  closureFor,
  decodePeerName,
  diffBuddy,
  encodePeerName,
  matchesBuddy,
  parseBuddyMessage,
  type PeerIdentity,
  progressOf,
  proofOk,
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
 * How often the reconnect ticker re-tries, and how often a failed
 * advertising/discovery start is re-kicked. Nearby operations are cheap;
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

export function BuddyRadio() {
  const store = useStore();

  const ref = useRef<Store>(store);
  useEffect(() => {
    ref.current = store;
  });

  // Per-connection handshake state, all transient (a link never outlives the
  // app). `meta` remembers what the connection-initiated event told us — the
  // shared auth digits the proof binds to, which side requested (the requester
  // mints the secret), and the peer's advertised identity — until `onConnected`
  // can act on it. `authed` is the set of endpoints that have proved the
  // pairing secret: nothing sensitive is sent to, or accepted from, an
  // endpoint that isn't in it.
  const meta = useRef<
    Map<string, { digits: string; incoming: boolean; peer: PeerIdentity; first?: boolean }>
  >(new Map());
  const authed = useRef<Set<string>>(new Set());

  /* — advertising + discovery, driven by what the user is doing — */

  // A pairing is standing until explicitly closed (Disconnect): while paired
  // but unlinked, the radio keeps looking. `knownBuddies` extends that across
  // restarts — with anyone on the list, this phone stays findable while the
  // app is open, which is what lets a buddy be asked to join without either
  // side having tapped anything first.
  const active =
    radio !== null &&
    (store.s.scanning ||
      store.s.buddySync ||
      store.s.sessionShared ||
      store.s.buddy !== null ||
      store.s.knownBuddies.length > 0) &&
    store.s.buddyEndpoint === null;

  useEffect(() => {
    const r = radio;
    if (!r || !active) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Nearby can refuse a start in the seconds after a link drops — the
    // Bluetooth stack is still settling — and a swallowed failure used to
    // leave the radio silent until `active` next toggled, which after a
    // mid-workout drop is never. So each half re-kicks itself until it takes;
    // a late double-start fails with STATUS_ALREADY_ADVERTISING and is
    // swallowed like every other refusal.
    const kick = (go: () => Promise<void>, what: string) => {
      go()
        .then(() => dlog('buddy', `${what} started`))
        .catch((e) => {
          // The refusal Nearby gives while the Bluetooth stack is settling, and
          // the one thing that tells a silent radio apart from a quiet gym.
          dlog('buddy', `${what} refused`, { err: e instanceof Error ? e.message : String(e) });
          if (alive) timers.push(setTimeout(() => kick(go, what), RETRY_MS));
        });
    };
    ensureRadioPermissions().then((ok) => {
      dlog('buddy', 'radio permissions', { ok }, true);
      if (!ok || !alive) return;
      kick(
        () => r.startAdvertising(encodePeerName(ref.current.s.selfId, myName(ref.current.s))),
        'advertising'
      );
      kick(() => r.startDiscovery(), 'discovery');
    });
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      r.stopAdvertising().catch(() => {});
      r.stopDiscovery().catch(() => {});
      ref.current.patch({ nearbyPeers: [] });
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
  const wantBuddy = radio !== null && store.s.buddy !== null && store.s.buddyEndpoint === null;

  useEffect(() => {
    const r = radio;
    if (!r || !wantBuddy) return;
    let seen = 0;
    const id = setInterval(() => {
      const st = ref.current;
      const name = st.s.buddy;
      if (!name || st.s.buddyEndpoint !== null) return;
      const peer = st.s.nearbyPeers.find((p) => matchesBuddy(name, st.s.buddyIds[name], p));
      if (!peer) {
        // The heal is stuck at discovery rather than at the request — the two
        // are indistinguishable from the screen and want opposite fixes.
        dlog('buddy', 'reconnect: buddy not visible', { buddy: name, peers: st.s.nearbyPeers.length });
        return;
      }
      seen += 1;
      if (!initiator(st.s, peer) && seen <= GRACE_TICKS) {
        dlog('buddy', 'reconnect: holding back', { tick: seen, of: GRACE_TICKS });
        return;
      }
      dlog('buddy', 'reconnect: requesting', { tick: seen, endpoint: peer.endpointId }, true);
      r.requestConnection(encodePeerName(st.s.selfId, myName(st.s)), peer.endpointId).catch((e) =>
        dlog('buddy', 'reconnect: request failed', {
          err: e instanceof Error ? e.message : String(e),
        })
      );
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [wantBuddy]);

  /* — shared-session transitions: host on start, notify on end — */

  const session = store.s.session;
  const prevSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    const prev = prevSessionRef.current;
    prevSessionRef.current = session;
    const r = radio;
    if (!r) return;
    const st = ref.current;

    // A routine session just started while a buddy is connected → host it.
    if (session && !prev && session.rid && st.s.buddyEndpoint && st.s.sessionRole === null) {
      const routine = st.s.routines.find((x) => x.id === session.rid);
      if (routine) {
        dlog('buddy', 'hosting — invite out', { rid: routine.id }, true);
        st.patch({ sessionShared: true, sessionRole: 'host', buddyJoin: 'pending' });
        r.sendPayload(
          st.s.buddyEndpoint,
          JSON.stringify({
            v: 1,
            t: 'sessionInvite',
            invite: { routine, ...routineClosure(st.s, routine) },
          })
        ).catch(() => {});
      }
    }

    // The shared session ended (finished or discarded — the buddy just sees
    // "finished" either way, v1) → final full-state message, then reset.
    if (!session && prev && st.s.sessionShared) {
      if (st.s.buddyEndpoint) {
        r.sendPayload(
          st.s.buddyEndpoint,
          JSON.stringify({
            v: 1,
            t: 'progress',
            state: progressOf(prev, -1, sharedOf(st.s), true),
          })
        ).catch(() => {});
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
    const r = radio;
    if (!r || !shouldBroadcast) return;
    const id = setTimeout(() => {
      const cur = ref.current.s;
      if (!cur.session || !cur.buddyEndpoint) return;
      // The one send worth a line every time: the buddy's whole picture of this
      // session is whatever the last of these carried, so "their rest never
      // showed" and "their turn never came round" are both answered by whether
      // this fired and what `rest` was in it.
      dlog('buddy', 'progress out', { active: cur.active, rest: restLeftOf(cur) || undefined });
      r.sendPayload(
        cur.buddyEndpoint,
        JSON.stringify({
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
        })
      ).catch(() => {});
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
    const r = radio;
    if (!r || !draftRid || draftRole !== 'starter') return;
    const st = ref.current;
    const draft = st.draftPayload();
    if (draft && st.s.buddyEndpoint)
      r.sendPayload(st.s.buddyEndpoint, JSON.stringify({ v: 1, t: 'draftStart', draft })).catch(
        () => {}
      );
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
    const r = radio;
    if (!r || !shouldShareDraft) return;
    const id = setTimeout(() => {
      const st = ref.current;
      const draft = st.draftPayload();
      if (draft && st.s.buddyEndpoint)
        r.sendPayload(st.s.buddyEndpoint, JSON.stringify({ v: 1, t: 'draftUpdate', draft })).catch(
          () => {}
        );
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

    // A link is gone — Nearby said so (onDisconnected), or this phone stopped
    // believing in it (undelivered payloads, see onPayloadFailed). One
    // teardown for both, so the two paths cannot drift: the handshake state
    // dies with the link — a fresh connection re-derives digits and must
    // re-prove the secret — and clearing buddyEndpoint is what flips `active`
    // back on, which restarts advertising, discovery and the ticker.
    const dropLink = (endpointId: string) => {
      dlog('buddy', 'link torn down', { endpoint: endpointId }, true);
      meta.current.delete(endpointId);
      authed.current.delete(endpointId);
      flaky.delete(endpointId);
      ref.current.patch((s) =>
        s.buddyEndpoint === endpointId
          ? {
              buddyEndpoint: null,
              buddySyncPending: false,
              // An ask that ended in a dropped link is not a yes. Let the
              // pairing go rather than chase them down and ask again —
              // this is also the backstop for a refusal that never arrived.
              ...(s.joinSent?.state === 'waiting' ? { buddy: null, joinSent: null } : {}),
              ...(s.sessionShared ? {} : { buddySnapshot: null }),
            }
          : null
      );
    };

    // Trust an endpoint: mark it authenticated, make it the buddy link, and
    // send the two things that used to go out unconditionally on connect — our
    // snapshot and any pending join-ask. Called on a code-gated first pairing
    // and after a reconnecting peer's proof checks out, never before.
    const trust = (endpointId: string) => {
      const st = ref.current;
      dlog('buddy', 'trusted — snapshot out', { endpoint: endpointId }, true);
      authed.current.add(endpointId);
      if (st.s.buddyEndpoint !== endpointId) st.patch({ buddyEndpoint: endpointId });
      r.sendPayload(
        endpointId,
        JSON.stringify({
          v: 1,
          t: 'snapshot',
          name: myName(st.s),
          id: st.s.selfId,
          data: shareableSlice(st.s),
        })
      ).catch(() => {});
      // This phone opened the link to ask something — the ask follows the
      // snapshot, so the other side knows who is asking by the time it lands.
      if (st.s.joinSent?.state === 'waiting')
        r.sendPayload(endpointId, JSON.stringify({ v: 1, t: 'joinAsk' })).catch(() => {});
    };

    const subs = [
      r.addListener('onEndpointFound', (e) => {
        const st = ref.current;
        const peer = decodePeerName(e.name);
        st.patch((s) => ({
          nearbyPeers: [
            ...s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId),
            { endpointId: e.endpointId, ...peer },
          ],
        }));
        // The buddy of this session reappeared — reconnect without anyone
        // having to tap anything. That is the mid-workout drop, and the only
        // connection this phone ever opens by itself: everyone else on the
        // roster is seen and listed, and stays that way until one of the two
        // asks for a session and the other one answers. Matched by install
        // id first, so a renamed buddy is still recognised. Only the
        // preferred side requests here — the other waits for the ticker's
        // grace to run out, so the two found-events firing together can't
        // cross requests (see `initiator`).
        if (
          !st.s.buddyEndpoint &&
          st.s.buddy !== null &&
          matchesBuddy(st.s.buddy, st.s.buddyIds[st.s.buddy], peer) &&
          initiator(st.s, peer)
        ) {
          r.requestConnection(encodePeerName(st.s.selfId, myName(st.s)), e.endpointId).catch(
            () => {}
          );
        }
      }),

      r.addListener('onEndpointLost', (e) =>
        ref.current.patch((s) => ({
          nearbyPeers: s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId),
        }))
      ),

      // First pairing is code-gated: both phones show Nearby's auth digits
      // and both users confirm (the scan sheet renders the code; accept /
      // reject happen there). A silent reconnect is allowed only for a buddy
      // we already share a secret with — which they then have to *prove* after
      // connect (see the `hello` handler) before this phone trusts them.
      r.addListener('onConnectionInitiated', (e) => {
        const st = ref.current;
        const peer = decodePeerName(e.name);
        meta.current.set(e.endpointId, {
          digits: e.authDigits,
          incoming: e.isIncoming,
          peer,
        });

        // A buddy we hold a pairing secret for reconnects with no code and no
        // sheet — accepting the raw (encrypted) link is safe because the
        // secret, proved over it, is the real gate now.
        const roster = rosterNameFor(st.s, peer);
        if (roster !== null && st.s.buddySecrets[roster] !== undefined) {
          r.acceptConnection(e.endpointId).catch(() => {});
          return;
        }

        // Everyone else pairs only through the code check, and the code only
        // shows in the share sheet: a stranger, an ex-buddy's phone
        // auto-reconnecting after a one-sided disconnect, an impersonator
        // advertising a known buddy's name, *and* a genuine buddy paired
        // before secrets existed — all re-pair by code, which is what mints
        // the secret. Anyone knocking while we're not sharing is turned away.
        if (!st.s.scanning) {
          r.rejectConnection(e.endpointId).catch(() => {});
          return;
        }
        // The invitee displays the code and accepts up front — the actual
        // gate is the inviter typing that code, which only their accept can
        // pass. Cancel on the invitee side still rejects.
        if (e.isIncoming) r.acceptConnection(e.endpointId).catch(() => {});
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

      r.addListener('onConnectionFailed', (e) =>
        ref.current.patch((s) =>
          s.pendingAuth?.endpointId === e.endpointId ? { pendingAuth: null } : null
        )
      ),

      r.addListener('onConnected', (e) => {
        const st = ref.current;
        const pa = st.s.pendingAuth;
        const first = !!(pa && pa.endpointId === e.endpointId);
        const info = meta.current.get(e.endpointId);
        if (info) info.first = first;

        if (first) {
          // Code-authenticated by the users just now, so trust is already
          // established: mark the link, set the buddy, and let the snapshot
          // flow as before (the sync screen opens only if the sides differ).
          // The added job is seeding the pairing secret for every future
          // reconnect — the requester (non-incoming side) mints it and ships
          // it in its hello; the other side adopts it. Exactly one minter.
          st.patch({ scanning: false, buddy: pa!.name, pendingAuth: null, buddySyncPending: true });
          const cur = ref.current;
          const hello: Record<string, unknown> = {
            v: 1,
            t: 'hello',
            name: myName(cur.s),
            id: cur.s.selfId,
          };
          if (info && !info.incoming) {
            const token = cur.s.buddySecrets[pa!.name] ?? randomToken();
            cur.recordBuddySecret(pa!.name, token);
            hello.newToken = token;
          }
          r.sendPayload(e.endpointId, JSON.stringify(hello)).catch(() => {});
          trust(e.endpointId);
          return;
        }

        // A reconnect proves the secret before anything sensitive crosses, so
        // buddyEndpoint is NOT set yet — `trust` does that once their proof
        // checks out. `onConnectionInitiated` only accepted this link because
        // we hold a secret for them, so it is there; send our proof and wait.
        const roster = info ? rosterNameFor(st.s, info.peer) : null;
        const secret = roster ? st.s.buddySecrets[roster] : undefined;
        if (!secret) {
          r.disconnectFrom(e.endpointId).catch(() => {});
          return;
        }
        const digits = info?.digits ?? '';
        r.sendPayload(
          e.endpointId,
          JSON.stringify({
            v: 1,
            t: 'hello',
            name: myName(st.s),
            id: st.s.selfId,
            proof: authProof(secret, digits),
          })
        ).catch(() => {});
      }),

      r.addListener('onDisconnected', (e) => dropLink(e.endpointId)),

      // Anything delivered proves the link alive.
      r.addListener('onPayloadSent', (e) => flaky.delete(e.endpointId)),

      // A FAILURE transfer update is Nearby admitting the bytes never arrived
      // — transport-level, so a locked phone (whose process still receives
      // natively) never trips it. This is the zombie case: the peer died
      // without a clean disconnect, `onDisconnected` never fired, and a set
      // buddyEndpoint keeps `active` false — no advertising, no discovery,
      // and a buddy who comes back can never find this phone again. Two in a
      // row with nothing delivered between them and the failure is believed
      // over the connection: tear the link down ourselves, which is exactly
      // what restarts the radio and the reconnect ticker. A false positive
      // costs a silent re-link seconds later; the old behaviour cost the rest
      // of the workout.
      r.addListener('onPayloadFailed', (e) => {
        const n = (flaky.get(e.endpointId) ?? 0) + 1;
        flaky.set(e.endpointId, n);
        dlog('buddy', 'payload undelivered', { endpoint: e.endpointId, run: n }, true);
        if (n < 2) return;
        // Any endpoint, not just the buddy link: a hello that can't be
        // delivered is a handshake that will never finish, and dropLink's
        // patch already limits itself to the link that was the buddy's.
        r.disconnectFrom(e.endpointId).catch(() => {});
        // Nearby may not echo a disconnect for an endpoint it has already
        // lost track of, so don't wait for one.
        dropLink(e.endpointId);
      }),

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
        switch (msg.t) {
          case 'hello': {
            const info = meta.current.get(e.endpointId);
            const digits = info?.digits ?? '';
            if (info?.first) {
              // Code-gated first pairing — the code was the gate, and the
              // snapshot has already been exchanged. Adopt the minted secret
              // (present only in the minting side's hello) and mark trusted.
              if (typeof msg.newToken === 'string' && msg.newToken)
                st.recordBuddySecret(st.s.buddy ?? msg.name, msg.newToken);
              authed.current.add(e.endpointId);
              break;
            }
            // Reconnect: their proof must match the secret we hold for them,
            // bound to this connection's digits. If it doesn't — an
            // impersonator, or a peer that lost its secret — drop the link
            // rather than trust it.
            const roster = info ? rosterNameFor(st.s, info.peer) : (st.s.buddy ?? null);
            const secret = roster ? st.s.buddySecrets[roster] : undefined;
            if (!proofOk(secret, msg.proof, digits)) {
              dlog(
                'buddy',
                'proof refused',
                { roster: roster ?? 'none', haveSecret: secret !== undefined, gotProof: !!msg.proof },
                true
              );
              r.disconnectFrom(e.endpointId).catch(() => {});
              break;
            }
            dlog('buddy', 'proof accepted', { roster: roster ?? 'none' }, true);
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
              r.sendPayload(e.endpointId, JSON.stringify({ v: 1, t: 'itemAck', id })).catch(
                () => {}
              );
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
              if (st.s.buddyEndpoint)
                r.sendPayload(
                  st.s.buddyEndpoint,
                  JSON.stringify({ v: 1, t: 'sessionJoin' })
                ).catch(() => {});
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

    return () => subs.forEach((s) => s.remove());
  }, []);

  return null;
}
