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
import {
  diffBuddy,
  parseBuddyMessage,
  progressOf,
  routineClosure,
  shareableSlice,
} from '@/data/buddy-sync';
import { myName, Session, Store, useStore } from '@/store/workout-store';

export function BuddyRadio() {
  const store = useStore();

  const ref = useRef<Store>(store);
  useEffect(() => {
    ref.current = store;
  });

  /* — advertising + discovery, driven by what the user is doing — */

  // A pairing is standing until explicitly closed (Disconnect) or the app
  // dies: while paired but unlinked, the radio keeps looking for the buddy.
  const active =
    radio !== null &&
    (store.s.scanning || store.s.buddySync || store.s.sessionShared || store.s.buddy !== null) &&
    store.s.buddyEndpoint === null;

  useEffect(() => {
    const r = radio;
    if (!r || !active) return;
    let alive = true;
    ensureRadioPermissions().then((ok) => {
      if (!ok || !alive) return;
      r.startAdvertising(myName(ref.current.s)).catch(() => {});
      r.startDiscovery().catch(() => {});
    });
    return () => {
      alive = false;
      r.stopAdvertising().catch(() => {});
      r.stopDiscovery().catch(() => {});
      ref.current.patch({ nearbyPeers: [] });
    };
  }, [active]);

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
          JSON.stringify({ v: 1, t: 'progress', state: progressOf(prev, -1, true) })
        ).catch(() => {});
      }
      st.patch({
        sessionShared: false,
        sessionRole: null,
        buddyJoin: null,
        buddyProgress: null,
        turnModes: {},
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
      r.sendPayload(
        cur.buddyEndpoint,
        JSON.stringify({ v: 1, t: 'progress', state: progressOf(cur.session, cur.active) })
      ).catch(() => {});
    }, 250);
    return () => clearTimeout(id);
    // `session` (object identity) and `active` are what the broadcast reads;
    // buddyEndpoint re-fires it after a reconnect, which is the resync.
  }, [shouldBroadcast, session, store.s.active, store.s.buddyEndpoint]);

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

    const subs = [
      r.addListener('onEndpointFound', (e) => {
        const st = ref.current;
        st.patch((s) => ({
          nearbyPeers: [...s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId), e],
        }));
        // The known buddy reappeared while the pairing stands — reconnect
        // without anyone having to tap anything.
        if (!st.s.buddyEndpoint && st.s.buddy === e.name) {
          r.requestConnection(myName(st.s), e.endpointId).catch(() => {});
        }
      }),

      r.addListener('onEndpointLost', (e) =>
        ref.current.patch((s) => ({
          nearbyPeers: s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId),
        }))
      ),

      // First pairing is code-gated: both phones show Nearby's auth digits
      // and both users confirm (the scan sheet renders the code; accept /
      // reject happen there). Re-pairing with the already-trusted buddy is
      // silent — that's the standing-pairing reconnect.
      r.addListener('onConnectionInitiated', (e) => {
        const st = ref.current;
        if (e.name === st.s.buddy) {
          r.acceptConnection(e.endpointId).catch(() => {});
          return;
        }
        // Strangers only pair through the code check, and the code only
        // shows in the share sheet — anyone knocking while we're not in
        // share mode (e.g. an ex-buddy's phone auto-reconnecting after a
        // one-sided disconnect) is turned away.
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
            name: e.name,
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
        st.patch({
          buddyEndpoint: e.endpointId,
          scanning: false,
          // A confirmed first pairing waits for the peer's snapshot — the
          // sync screen only opens if the two sides differ. A silent
          // reconnect changes nothing on screen.
          ...(pa && pa.endpointId === e.endpointId
            ? { buddy: pa.name, pendingAuth: null, buddySyncPending: true }
            : {}),
        });
        r.sendPayload(
          e.endpointId,
          JSON.stringify({ v: 1, t: 'snapshot', name: myName(st.s), data: shareableSlice(st.s) })
        ).catch(() => {});
      }),

      r.addListener('onDisconnected', (e) =>
        ref.current.patch((s) =>
          s.buddyEndpoint === e.endpointId
            ? {
                buddyEndpoint: null,
                buddySyncPending: false,
                ...(s.sessionShared ? {} : { buddySnapshot: null }),
              }
            : null
        )
      ),

      r.addListener('onPayload', (e) => {
        const msg = parseBuddyMessage(e.data);
        if (!msg) return;
        const st = ref.current;
        switch (msg.t) {
          case 'snapshot':
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
            if (st.s.buddySnapshot) st.importFromPeer(st.s.buddySnapshot, msg.item);
            break;
          case 'sessionInvite':
            st.patch({ buddyInvite: msg.invite });
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
              // Any progress proves they're in — covers a lost join message.
              ...(s.buddyJoin === 'pending' ? { buddyJoin: 'joined' as const } : {}),
            }));
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
