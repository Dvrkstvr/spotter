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
import { parseBuddyMessage, progressOf, shareableSlice } from '@/data/buddy-sync';
import { Session, Store, useStore } from '@/store/workout-store';

const myName = (s: Store['s']) => s.profile.name.trim() || 'Workout Diary';

export function BuddyRadio() {
  const store = useStore();

  const ref = useRef<Store>(store);
  useEffect(() => {
    ref.current = store;
  });

  /* — advertising + discovery, driven by what the user is doing — */

  const active =
    radio !== null &&
    (store.s.scanning || store.s.buddySync || store.s.sessionShared) &&
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
        const custom = st.s.custom.filter((e) => routine.items.some((i) => i.ex === e.id));
        const groups = st.s.groups.filter((g) => custom.some((e) => e.group === g.key));
        const kinds = st.s.kinds.filter((k) => custom.some((e) => e.kind === k.key));
        st.patch({ sessionShared: true, sessionRole: 'host', buddyJoin: 'pending' });
        r.sendPayload(
          st.s.buddyEndpoint,
          JSON.stringify({ v: 1, t: 'sessionInvite', invite: { routine, custom, groups, kinds } })
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
        // Mid-session reconnect: the known buddy reappeared — reconnect
        // without anyone having to tap anything.
        if (st.s.sessionShared && !st.s.buddyEndpoint && st.s.buddy === e.name) {
          r.requestConnection(myName(st.s), e.endpointId).catch(() => {});
        }
      }),

      r.addListener('onEndpointLost', (e) =>
        ref.current.patch((s) => ({
          nearbyPeers: s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId),
        }))
      ),

      // Both sides must accept; v1 trusts proximity and auto-accepts. The
      // incoming side also opens the sync screen — unless a shared session is
      // live, where this is a silent reconnect.
      r.addListener('onConnectionInitiated', (e) => {
        r.acceptConnection(e.endpointId).catch(() => {});
        if (e.isIncoming && !ref.current.s.sessionShared) {
          ref.current.patch({ buddy: e.name, buddySync: true, scanning: false });
        }
      }),

      r.addListener('onConnected', (e) => {
        const st = ref.current;
        st.patch({ buddyEndpoint: e.endpointId, scanning: false });
        r.sendPayload(
          e.endpointId,
          JSON.stringify({ v: 1, t: 'snapshot', name: myName(st.s), data: shareableSlice(st.s) })
        ).catch(() => {});
      }),

      r.addListener('onDisconnected', (e) =>
        ref.current.patch((s) =>
          s.buddyEndpoint === e.endpointId
            ? { buddyEndpoint: null, ...(s.sessionShared ? {} : { buddySnapshot: null }) }
            : null
        )
      ),

      r.addListener('onPayload', (e) => {
        const msg = parseBuddyMessage(e.data);
        if (!msg) return;
        const st = ref.current;
        switch (msg.t) {
          case 'snapshot':
            st.patch({
              buddy: msg.name,
              buddySnapshot: {
                peer: { id: e.endpointId, name: msg.name, device: '' },
                ...msg.data,
              },
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
        }
      }),
    ];

    return () => subs.forEach((s) => s.remove());
  }, []);

  return null;
}
