/**
 * The radio controller — mounted once next to the overlays, renders nothing.
 *
 * Owns the whole Nearby lifecycle so no sheet has to: advertising/discovery
 * run while the user is scanning or waiting in the sync screen and stop once
 * connected; incoming connections are auto-accepted; on connect both sides
 * exchange snapshots; incoming sync items merge into the store through the
 * same importFromPeer as the mock path.
 *
 * Listeners are registered exactly once (the store is read through a ref kept
 * current by an effect — the useBackClose pattern, and the React Compiler
 * rule), so radio events never race a re-render. Does nothing in Expo Go.
 */
import { useEffect, useRef } from 'react';

import { ensureRadioPermissions, radio } from '@/data/buddy-radio';
import { parseBuddyMessage, shareableSlice } from '@/data/buddy-sync';
import { Store, useStore } from '@/store/workout-store';

export function BuddyRadio() {
  const store = useStore();

  const ref = useRef<Store>(store);
  useEffect(() => {
    ref.current = store;
  });

  /* — advertising + discovery, driven by what the user is doing — */

  const active =
    radio !== null && (store.s.scanning || store.s.buddySync) && store.s.buddyEndpoint === null;

  useEffect(() => {
    const r = radio;
    if (!r || !active) return;
    let alive = true;
    ensureRadioPermissions().then((ok) => {
      if (!ok || !alive) return;
      const name = ref.current.s.profile.name.trim() || 'Workout Diary';
      r.startAdvertising(name).catch(() => {});
      r.startDiscovery().catch(() => {});
    });
    return () => {
      alive = false;
      r.stopAdvertising().catch(() => {});
      r.stopDiscovery().catch(() => {});
      ref.current.patch({ nearbyPeers: [] });
    };
  }, [active]);

  /* — event wiring, once — */

  useEffect(() => {
    const r = radio;
    if (!r) return;

    const subs = [
      r.addListener('onEndpointFound', (e) =>
        ref.current.patch((s) => ({
          nearbyPeers: [...s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId), e],
        }))
      ),

      r.addListener('onEndpointLost', (e) =>
        ref.current.patch((s) => ({
          nearbyPeers: s.nearbyPeers.filter((p) => p.endpointId !== e.endpointId),
        }))
      ),

      // Both sides must accept; v1 trusts proximity and auto-accepts. The
      // incoming side also opens the sync screen, mirroring the outgoing tap.
      r.addListener('onConnectionInitiated', (e) => {
        r.acceptConnection(e.endpointId).catch(() => {});
        if (e.isIncoming) {
          ref.current.patch({ buddy: e.name, buddySync: true, scanning: false });
        }
      }),

      r.addListener('onConnected', (e) => {
        const st = ref.current;
        st.patch({ buddyEndpoint: e.endpointId, scanning: false });
        const name = st.s.profile.name.trim() || 'Workout Diary';
        r
          .sendPayload(
            e.endpointId,
            JSON.stringify({ v: 1, t: 'snapshot', name, data: shareableSlice(st.s) })
          )
          .catch(() => {});
      }),

      r.addListener('onDisconnected', (e) =>
        ref.current.patch((s) =>
          s.buddyEndpoint === e.endpointId ? { buddyEndpoint: null, buddySnapshot: null } : null
        )
      ),

      r.addListener('onPayload', (e) => {
        const msg = parseBuddyMessage(e.data);
        if (!msg) return;
        const st = ref.current;
        if (msg.t === 'snapshot') {
          st.patch({
            buddy: msg.name,
            buddySnapshot: {
              peer: { id: e.endpointId, name: msg.name, device: '' },
              ...msg.data,
            },
          });
        } else if (st.s.buddySnapshot) {
          // The buddy pushed an item — same merge as tapping Transfer here.
          st.importFromPeer(st.s.buddySnapshot, msg.item);
        }
      }),
    ];

    return () => subs.forEach((s) => s.remove());
  }, []);

  return null;
}
