/**
 * The real radio — a typed bridge over the NearbyBuddy native module
 * (modules/expo-nearby-buddy), which wraps Google Nearby Connections:
 * Bluetooth + Wi-Fi Direct phone-to-phone, no network needed.
 *
 * The module only exists in a development/standalone build. Without it,
 * `radio` is the dev sim (src/data/sim-radio.ts) when EXPO_PUBLIC_SIM_RADIO
 * is set, else null and everything falls back to the mock transport — check
 * `hasRadio` before using anything here.
 */
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import type { BuddyMessage } from '@/data/buddy-sync';
import type { RadioGrant, RadioState } from '@/data/radio-state';
import type { RequestEvent } from '@/data/scan-pause';
import { encodePeerName } from '@/data/buddy-sync';
import { createSimRadio } from '@/data/sim-radio';

export type RadioEvents = {
  onEndpointFound(e: { endpointId: string; name: string }): void;
  onEndpointLost(e: { endpointId: string }): void;
  onConnectionInitiated(e: {
    endpointId: string;
    name: string;
    isIncoming: boolean;
    authDigits: string;
  }): void;
  onConnected(e: { endpointId: string }): void;
  onConnectionFailed(e: { endpointId: string; status: number }): void;
  onDisconnected(e: { endpointId: string }): void;
  onPayload(e: { endpointId: string; data: string }): void;
  onPayloadSent(e: { endpointId: string; payloadId: string }): void;
  /**
   * A payload Nearby accepted but could not deliver. `sendPayload` resolving
   * only means "enqueued", so this is the one signal that a link is dead while
   * `onDisconnected` still hasn't fired — the zombie case. A locked phone
   * never trips it: its process still receives natively. An older native
   * build simply never emits it, and the listener sits idle.
   */
  onPayloadFailed(e: { endpointId: string; payloadId: string }): void;
  /**
   * Nearby moved the link to another medium — the Wi-Fi upgrade after a
   * Bluetooth connect, or the way back down. `quality` is Nearby's own
   * `BandwidthInfo.Quality` (see `BANDWIDTH`). Logged and nothing else: no
   * behaviour hangs off it. The sim never emits it, having one medium, and
   * neither does a native build from before it existed.
   */
  onBandwidthChanged(e: { endpointId: string; quality: number }): void;
};

/** `BandwidthInfo.Quality`, by its own index — what the log prints instead of a digit. */
export const BANDWIDTH = ['unknown', 'low', 'medium', 'high'] as const;

export type Radio = {
  addListener<K extends keyof RadioEvents>(
    event: K,
    listener: RadioEvents[K]
  ): { remove(): void };
  startAdvertising(name: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(): Promise<void>;
  /**
   * Stops looking; it does not forget. An endpoint already found can still be
   * requested, which is what lets <BuddyRadio> quiet the scan for as long as a
   * connection is forming. Starting again reports everyone in range afresh.
   */
  stopDiscovery(): Promise<void>;
  requestConnection(name: string, endpointId: string): Promise<void>;
  acceptConnection(endpointId: string): Promise<void>;
  rejectConnection(endpointId: string): Promise<void>;
  sendPayload(endpointId: string, data: string): Promise<void>;
  disconnectFrom(endpointId: string): Promise<void>;
  /**
   * Nearby's stopAllEndpoints: drops every link *and* invalidates advertising
   * and discovery until they are started again. <BuddyRadio> owns those two,
   * and restarts them the moment a pairing ends — so app code never calls
   * this. Ending one link is `disconnectFrom`; the surface stays here only
   * because it mirrors the native module.
   */
  stopAll(): Promise<void>;
  /**
   * Whether the system's Bluetooth / Location switch is on — null when the
   * phone would not say. Both are optional, and so is `openSwitch`: the sim
   * has no switches to read, and a native build from before these existed has
   * no such function. Read them through `radioSwitches` / `openRadioFix`,
   * which answer for the absence.
   */
  isBluetoothOn?(): Promise<boolean | null>;
  isLocationOn?(): Promise<boolean | null>;
  /** Opens Android's own screen for one of the two switches. */
  openSwitch?(which: 'bluetooth' | 'location'): Promise<void>;
};

const native = requireOptionalNativeModule<
  Radio & {
    /** Absent on a native build from before the diagnostics header asked. */
    playServicesVersion?(): string | null;
  }
>('NearbyBuddy');

/**
 * Two-instance dev testing without Bluetooth (emulators, Expo Go): with the
 * native module absent and EXPO_PUBLIC_SIM_RADIO set at bundle time, the sim
 * radio speaks the same protocol over a WebSocket to scripts/buddy-relay.mjs
 * on the dev machine. "1" derives the relay host from Metro's own address,
 * which both emulators and LAN phones can reach; a value containing "://" is
 * used as the relay URL directly.
 */
function simRadioUrl(): string | null {
  const env = process.env.EXPO_PUBLIC_SIM_RADIO;
  if (!__DEV__ || !env) return null;
  if (env.includes('://')) return env;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `ws://${host}:8787` : null;
}

const simUrl = native ? null : simRadioUrl();

const base: Radio | null = native ?? (simUrl ? createSimRadio(simUrl) : null);

const requestWatchers = new Set<(e: RequestEvent) => void>();

/**
 * Hear every connection request this phone makes, whoever made it.
 *
 * Requests leave from four places — the roster row, the scan sheet, the
 * found-handler and the reconnect ticker — and only two of them are inside
 * <BuddyRadio>, which is what has to pause discovery while a connection forms.
 * So the signal is taken where all four meet: the bridge. A fifth call site
 * needs no wiring to be heard, which a rule each site has to remember would
 * not survive.
 */
export function watchRequests(listener: (e: RequestEvent) => void): { remove(): void } {
  requestWatchers.add(listener);
  return { remove: () => void requestWatchers.delete(listener) };
}

// A listener that throws must not be able to turn a request that took into
// one that failed — this sits inside the call it is listening to.
const tell = (endpointId: string, state: RequestEvent['state']) =>
  requestWatchers.forEach((l) => {
    try {
      l({ endpointId, state });
    } catch {
      /* the request is the caller's, whatever became of the listener */
    }
  });

/**
 * The radio with its requests made audible. Everything but `requestConnection`
 * is handed straight through — spelled out rather than spread, because the
 * native module is a host object and what a spread copies off one is not
 * something this file should depend on.
 */
const watched = (r: Radio): Radio => ({
  addListener: (event, listener) => r.addListener(event, listener),
  startAdvertising: (name) => r.startAdvertising(name),
  stopAdvertising: () => r.stopAdvertising(),
  startDiscovery: () => r.startDiscovery(),
  stopDiscovery: () => r.stopDiscovery(),
  requestConnection: (name, endpointId) => {
    tell(endpointId, 'out');
    return r.requestConnection(name, endpointId).then(
      () => tell(endpointId, 'took'),
      (err) => {
        tell(endpointId, 'refused');
        // Still the caller's to handle — each site answers a refusal its own
        // way, and this is a listener on the call, not a handler for it.
        throw err;
      }
    );
  },
  acceptConnection: (endpointId) => r.acceptConnection(endpointId),
  rejectConnection: (endpointId) => r.rejectConnection(endpointId),
  sendPayload: (endpointId, data) => r.sendPayload(endpointId, data),
  disconnectFrom: (endpointId) => r.disconnectFrom(endpointId),
  stopAll: () => r.stopAll(),
});

export const radio: Radio | null = base ? watched(base) : null;

/** True when the radio is the dev sim — a WebSocket, not Bluetooth. */
export const isSimRadio = radio !== null && native === null;

export const hasRadio = radio !== null;

/* ── the link's three verbs ────────────────────────────────────────────── */

/** Who asked for a connection — for the log, and for nothing else. */
export type RequestFrom = 'tap' | 'found' | 'ticker' | 'invite';

/**
 * Everything app code may do to a link, and the only way it may do it.
 *
 * <BuddyRadio> owns the implementation and claims this slot while it is
 * mounted; sheets and screens call the three functions below and never touch
 * `radio.requestConnection` / `sendPayload` / `disconnectFrom` themselves.
 * There used to be four request sites with four error handlers and a dozen
 * sends that each swallowed their own rejection — so a refusal, which is the
 * clearest thing Nearby ever says about a link, was heard by nobody. One
 * function each means one place that hears it.
 */
export type Link = {
  /** Ask `endpointId` for a connection. False when one is already in flight. */
  request(endpointId: string, from: RequestFrom): boolean;
  /** Send one message. Resolves false when Nearby refused it; never rejects. */
  send(endpointId: string, msg: BuddyMessage): Promise<boolean>;
  /** Disconnect and forget the endpoint's handshake state with it. */
  hangUp(endpointId: string): void;
};

let link: Link | null = null;

/** <BuddyRadio> taking the slot. Returns the release for its unmount. */
export function claimLink(l: Link): () => void {
  link = l;
  return () => {
    if (link === l) link = null;
  };
}

/** Request a connection through <BuddyRadio>. False when nothing went out. */
export const requestLink = (endpointId: string, from: RequestFrom): boolean =>
  link?.request(endpointId, from) ?? false;

/**
 * Send one message to the buddy. With <BuddyRadio> unmounted (Train alone is
 * on) there is nobody to count a refusal, so the bare send stands in — the
 * only caller that can reach it then is a goodbye.
 */
export const sendTo = (endpointId: string | null, msg: BuddyMessage): Promise<boolean> => {
  if (!radio || !endpointId) return Promise.resolve(false);
  if (link) return link.send(endpointId, msg);
  return radio.sendPayload(endpointId, JSON.stringify(msg)).then(
    () => true,
    () => false
  );
};

/**
 * End one link. Nearby does not promise the side that hangs up an
 * `onDisconnected` of its own, so the handshake state is dropped here rather
 * than waited for.
 */
export const hangUp = (endpointId: string | null): void => {
  if (!radio || !endpointId) return;
  if (link) link.hangUp(endpointId);
  else radio.disconnectFrom(endpointId).catch(() => {});
};

/**
 * The Play services build on this phone, or null where there is none to ask
 * (Expo Go, the sim) or it would not say. Nearby lives in Play services rather
 * than in the app, so two phones on one APK can still be running two different
 * radios — which is why this belongs in the diagnostics header.
 */
export function playServicesVersion(): string | null {
  try {
    return native?.playServicesVersion?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * A refused radio call, as log fields.
 *
 * `status` is Nearby's own code — 8011 endpoint unknown, 8012 endpoint IO
 * error, 8007 Bluetooth, 8025 Location off — where the native side could name
 * one. It arrives on the rejection's `code` as `REQUEST_FAILED:8011`, which is
 * a string the module wrote, so reading the number back off it is not the
 * parsing of Google's message this exists to avoid. The sim never refuses, and
 * an older native build sends the bare code: `status` is simply absent.
 */
export function radioErr(e: unknown): { status?: number; err: string } {
  const code = (e as { code?: unknown } | null)?.code;
  const m = typeof code === 'string' ? /[:_](\d+)$/.exec(code) : null;
  return {
    ...(m ? { status: Number(m[1]) } : {}),
    err: e instanceof Error ? e.message : String(e),
  };
}

/**
 * What an outgoing request is for. `pair` is a tap in the share sheet: the
 * two of you mean to confirm a code, whatever either phone already holds.
 * `link` is everything else — an ask from the roster, the reconnect ticker,
 * the found-handler — and is proved by the secret or not made at all.
 */
export type RequestKind = 'pair' | 'link';

// What this phone last asked each endpoint for. The requesting side's
// connection-initiated event carries the *advertiser's* name, which says
// nothing about the request, so the kind has to be remembered from here to
// there. Module state rather than the store's: it is the radio's bookkeeping,
// nothing draws it, and it has to be written in the same breath as the
// request — a patch would land a render later than the event it is for.
const asked = new Map<string, RequestKind>();

/**
 * Request a connection, saying which kind. Every outgoing request goes through
 * here, because the kind is said twice and the two must not come apart: to the
 * other phone in the name the request travels under (`encodePeerName`'s mark),
 * and to this one in `asked`, where `takeRequestKind` collects it.
 */
export function requestPeer(
  kind: RequestKind,
  self: { id: string; name: string },
  endpointId: string
): Promise<void> {
  if (!radio) return Promise.resolve();
  asked.set(endpointId, kind);
  return radio.requestConnection(encodePeerName(self.id, self.name, kind === 'pair'), endpointId);
}

/**
 * The kind of the request this phone made to an endpoint, collected once. A
 * request nobody recorded is a `link`: that is the kind that needs a secret,
 * so forgetting can only ever make a connection harder to get, never easier.
 */
export function takeRequestKind(endpointId: string): RequestKind {
  const kind = asked.get(endpointId) ?? 'link';
  asked.delete(endpointId);
  return kind;
}

// Code stages this phone backed out of. A rejection is reported to both ends
// with the same status, so without this <BuddyRadio> cannot tell the other
// person cancelling — worth a line — from the user's own Cancel, which is not.
const declined = new Set<string>();

/** Turn a pairing down from its code stage — Cancel, back, or closing the sheet. */
export function declinePairing(endpointId: string): void {
  if (!radio) return;
  declined.add(endpointId);
  radio.rejectConnection(endpointId).catch(() => {});
}

/** Whether this phone was the one that declined, collected once. */
export const takeDeclined = (endpointId: string): boolean => declined.delete(endpointId);

/**
 * Say goodbye before pulling the plug.
 *
 * A silent drop is what the buddy's phone spends the next hour trying to
 * reconnect through — and now that the roster re-pairs on sight, a teardown
 * they never heard about would simply undo itself. The disconnect waits for
 * the payload, refused or not.
 *
 * Exactly one link goes. `stopAll` would be the obvious call and is the wrong
 * one: it also invalidates advertising and discovery, which `endPairing` has
 * <BuddyRadio> restarting in the same breath — the two race, and a lost race
 * leaves this phone unable to see or be seen until the app is restarted.
 *
 * Every path that ends a link goes through here: Disconnect, forgetting a
 * buddy, and switching the buddy half of the app off. Declining a join says
 * its own no first (`joinReply`), in the same order.
 */
export function sayGoodbye(endpointId: string | null): void {
  if (!radio || !endpointId) return;
  sendTo(endpointId, { v: 1, t: 'bye' }).then(() => hangUp(endpointId));
}

/** The runtime permissions this Android version wants before the radio runs. */
function wanted() {
  const api = Platform.Version as number;
  return api >= 33
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      ]
    : api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

// Whether the last dialog came back `never_ask_again`. Android will not say
// this of a permission without being asked for it — `check` answers granted or
// not, and nothing finer — so the only place it can be learned is the answer
// to a request, and it is remembered here for the checks that follow. Not
// state: it is a fact about Android's dialog, it dies with the process, and
// the worst a stale `false` costs is one tap that finds it out again.
let blocked = false;

/**
 * Whether the radio may run. **Never prompts** — this is the one <BuddyRadio>
 * calls, and it calls it from effects: a link dropping mid-workout, a roster
 * coming back with the app. A system dialog is only ever the answer to a tap,
 * which is `askRadioPermissions`.
 */
export async function radioGrant(): Promise<RadioGrant> {
  // The sim needs no Bluetooth permissions.
  if (isSimRadio) return 'granted';
  if (!native || Platform.OS !== 'android') return 'denied';
  try {
    const held = await Promise.all(wanted().map((p) => PermissionsAndroid.check(p)));
    if (held.every(Boolean)) {
      blocked = false;
      return 'granted';
    }
  } catch {
    // No activity to ask through — not granted, as far as anyone can tell.
  }
  return blocked ? 'blocked' : 'denied';
}

// Whether the permission dialog is up right now. Android reports `background`
// for it — it is another activity over this one — and <BuddyRadio> puts the
// radio away in the background, so a pause that arrives while the dialog is up
// is not one: believing it would stop the radio mid-question.
let asking = false;

export const radioAsking = () => asking;

/**
 * Put Android's permission dialog up. **Only ever in answer to a tap** — the
 * setup tour's card, opening share mode, the line that says a permission is
 * missing. It used to run inside <BuddyRadio>'s own effect, which meant a
 * dialog every time a link dropped, mid-set, about something nobody had just
 * asked for.
 *
 * `blocked` is Android no longer offering the dialog, which it decides after
 * two refusals: the request then returns at once with nothing shown, and the
 * only way left is the app's page in the system settings.
 */
export async function askRadioPermissions(): Promise<RadioGrant> {
  if (isSimRadio) return 'granted';
  // No radio, nothing to ask on behalf of — Expo Go's share sheet is the mock.
  if (!native || Platform.OS !== 'android') return 'denied';
  let grant: RadioGrant = 'denied';
  asking = true;
  try {
    const results = Object.values(await PermissionsAndroid.requestMultiple(wanted()));
    grant = results.every((r) => r === PermissionsAndroid.RESULTS.GRANTED)
      ? 'granted'
      : results.some((r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
        ? 'blocked'
        : 'denied';
  } catch {
    // A request with no activity behind it — nothing was asked.
  } finally {
    asking = false;
  }
  blocked = grant === 'blocked';
  pokeRadio();
  return grant;
}

/* — the poke: "look again now", from whoever just changed the answer — */

const pokes = new Set<() => void>();

/**
 * <BuddyRadio> looks at the radio's preconditions on a ticker. A poke is the
 * same look without the wait, for the moments the answer is known to have just
 * moved — a dialog answered, a line tapped. An event rather than state, so it
 * is a module slot like `intake.ts` and not a store field.
 */
export const onRadioPoke = (fn: () => void) => {
  pokes.add(fn);
  return () => void pokes.delete(fn);
};

export const pokeRadio = () => pokes.forEach((fn) => fn());

/**
 * The two system switches, as far as the phone will say. Null is "unknown" and
 * is never read as off: the sim, an older native build and a phone that threw
 * all land there, and none of them is evidence of anything.
 */
export async function radioSwitches(): Promise<{
  bluetooth: boolean | null;
  location: boolean | null;
}> {
  const read = async (ask: () => Promise<boolean | null> | undefined) => {
    try {
      return (await ask()) ?? null;
    } catch {
      return null;
    }
  };
  const [bluetooth, location] = await Promise.all([
    read(() => native?.isBluetoothOn?.()),
    read(() => native?.isLocationOn?.()),
  ]);
  return { bluetooth, location };
}

/**
 * The way out of a radio state — the tap on the line that states it.
 *
 * A missing permission gets the dialog. Everything else gets the screen in
 * Android's settings where the thing can be changed, because none of it is
 * this app's to switch: opened through the native module (a plain
 * `startActivity`, which needs no package visibility), then through React
 * Native's `sendIntent`, and failing both the app's own settings page — a
 * worse door into the right building.
 */
export function openRadioFix(state: RadioState): void {
  if (state === 'ok') return;
  if (state === 'permission') {
    void askRadioPermissions();
    return;
  }
  if (state === 'blocked') {
    Linking.openSettings().catch(() => {});
    return;
  }
  const which = state === 'location' ? 'location' : 'bluetooth';
  const action =
    which === 'location'
      ? 'android.settings.LOCATION_SOURCE_SETTINGS'
      : 'android.settings.BLUETOOTH_SETTINGS';
  const viaNative = native?.openSwitch
    ? native.openSwitch(which)
    : Promise.reject(new Error('no native openSwitch'));
  viaNative
    .catch(() => Linking.sendIntent(action))
    .catch(() => Linking.openSettings())
    .catch(() => {});
}
