/**
 * The sim radio — the exact Radio surface of the native NearbyBuddy module,
 * carried over a WebSocket to the dev relay (scripts/buddy-relay.mjs)
 * instead of Bluetooth. Pure JS, so it runs in Expo Go — which is what makes
 * two-instance buddy testing possible on emulators and single-phone setups,
 * where real Nearby Connections has no hardware to run on.
 *
 * Only ever constructed by buddy-radio.ts, and only when the native module
 * is absent and EXPO_PUBLIC_SIM_RADIO was set at bundle time.
 *
 * The socket reconnects forever (the relay may start after the app, and
 * killing the relay is a supported way to simulate link loss). Intents —
 * "should be advertising as X", "should be discovering" — live here and are
 * replayed on every reconnect, so app code never has to know the socket
 * dropped; established connections do drop with the socket, which surfaces
 * as the same onDisconnected the real radio sends when a buddy vanishes.
 */
import type { Radio, RadioEvents } from '@/data/buddy-radio';

type EventName = keyof RadioEvents;

type RelayMessage = {
  t: string;
  id: string;
  name?: string;
  isIncoming?: boolean;
  digits?: string;
  status?: number;
  data?: string;
  payloadId?: string;
};

export function createSimRadio(url: string): Radio {
  const listeners = new Map<EventName, Set<(e: never) => void>>();

  const emit = <K extends EventName>(event: K, e: Parameters<RadioEvents[K]>[0]) => {
    listeners.get(event)?.forEach((l) => (l as (arg: typeof e) => void)(e));
  };

  let sock: WebSocket | null = null;
  let advertising: string | null = null;
  let discovering = false;
  const linked = new Set<string>();

  const push = (msg: object) => {
    if (sock?.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
  };

  const handle = (m: RelayMessage) => {
    switch (m.t) {
      case 'found':
        emit('onEndpointFound', { endpointId: m.id, name: m.name ?? '' });
        break;
      case 'lost':
        emit('onEndpointLost', { endpointId: m.id });
        break;
      case 'initiated':
        emit('onConnectionInitiated', {
          endpointId: m.id,
          name: m.name ?? '',
          isIncoming: !!m.isIncoming,
          authDigits: m.digits ?? '',
        });
        break;
      case 'connected':
        linked.add(m.id);
        emit('onConnected', { endpointId: m.id });
        break;
      case 'failed':
        emit('onConnectionFailed', { endpointId: m.id, status: m.status ?? 13 });
        break;
      case 'disconnected':
        linked.delete(m.id);
        emit('onDisconnected', { endpointId: m.id });
        break;
      case 'payload':
        emit('onPayload', { endpointId: m.id, data: m.data ?? '' });
        break;
      case 'sent':
        emit('onPayloadSent', { endpointId: m.id, payloadId: m.payloadId ?? '' });
        break;
    }
  };

  const connect = () => {
    const s = new WebSocket(url);
    sock = s;
    s.onopen = () => {
      if (advertising !== null) push({ t: 'advertise', name: advertising });
      if (discovering) push({ t: 'discover' });
    };
    s.onmessage = (ev) => {
      try {
        handle(JSON.parse(String(ev.data)) as RelayMessage);
      } catch {
        // not ours
      }
    };
    s.onclose = () => {
      if (sock !== s) return;
      linked.forEach((id) => emit('onDisconnected', { endpointId: id }));
      linked.clear();
      setTimeout(connect, 2500);
    };
    s.onerror = () => s.close();
  };
  connect();

  return {
    addListener<K extends EventName>(event: K, listener: RadioEvents[K]) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      const entry = listener as (e: never) => void;
      set.add(entry);
      return { remove: () => void set.delete(entry) };
    },
    async startAdvertising(name) {
      advertising = name;
      push({ t: 'advertise', name });
    },
    async stopAdvertising() {
      advertising = null;
      push({ t: 'stopAdvertise' });
    },
    async startDiscovery() {
      discovering = true;
      push({ t: 'discover' });
    },
    async stopDiscovery() {
      discovering = false;
      push({ t: 'stopDiscover' });
    },
    async requestConnection(name, endpointId) {
      push({ t: 'request', name, to: endpointId });
    },
    async acceptConnection(endpointId) {
      push({ t: 'accept', to: endpointId });
    },
    async rejectConnection(endpointId) {
      push({ t: 'reject', to: endpointId });
    },
    async sendPayload(endpointId, data) {
      push({ t: 'payload', to: endpointId, data });
    },
    async disconnectFrom(endpointId) {
      push({ t: 'disconnect', to: endpointId });
    },
    async stopAll() {
      push({ t: 'stopAll' });
    },
  };
}
