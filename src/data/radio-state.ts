/**
 * What is stopping the radio — read off what Android and Nearby said.
 *
 * Pure, like `plan.ts` and `tips.ts`: a grant, the status codes a round of
 * starts was refused with and a Bluetooth reading in, one word out. It knows
 * nothing about the store or the bridge, which is what lets the one decision
 * here be tested — which precondition a refusal names — without a phone.
 *
 * The codes are play-services-nearby 19.3.0's `ConnectionsStatusCodes`, read
 * off the library with `javap` rather than remembered.
 */

/**
 * - `ok` — running, or not known to be stopped.
 * - `permission` — a runtime permission is missing and Android will still ask.
 * - `blocked` — one is missing and the dialog is no longer on offer: the way
 *   out is the app's page in Android's settings.
 * - `bluetooth` / `location` — a system switch is off.
 * - `refused` — Nearby keeps saying no and none of the above explains it.
 */
export type RadioState = 'ok' | 'permission' | 'blocked' | 'bluetooth' | 'location' | 'refused';

/** What the permission check found. `blocked` is a denial Android stopped asking about. */
export type RadioGrant = 'granted' | 'denied' | 'blocked';

export const NEARBY = {
  alreadyAdvertising: 8001,
  alreadyDiscovering: 8002,
  /** STATUS_BLUETOOTH_ERROR, renamed STATUS_RADIO_ERROR — same number. */
  radioError: 8007,
  locationOff: 8025,
  /** MISSING_PERMISSION_* is a contiguous block, 8029 to 8039. */
  permissionFirst: 8029,
  permissionLast: 8039,
} as const;

/** A refusal that carried no code at all. */
export const NO_STATUS = -1;

/**
 * Rounds a refusal has to persist for before it is called one. Nearby refuses
 * starts for a few seconds after every dropped link, while the Bluetooth stack
 * settles — a line that appeared for each of those would be a statement about
 * a problem that is already fixing itself.
 */
export const SETTLE_ROUNDS = 3;

/**
 * The Nearby status a rejection carried, or null when it carried none.
 *
 * The native module appends it to the error's code (`ADVERTISE_FAILED:8025`;
 * an underscore is read too, which is what one build of the module wrote).
 * The message is the fallback: `ApiException` writes its own as
 * `"8025: MISSING_SETTING_LOCATION_MUST_BE_ON"`, which is all a native build
 * from before the code was passed has to offer.
 */
export function statusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  const fromCode = typeof code === 'string' ? /[:_](\d+)$/.exec(code) : null;
  if (fromCode) return Number(fromCode[1]);
  const fromMessage = typeof message === 'string' ? /^\s*(\d+):/.exec(message) : null;
  return fromMessage ? Number(fromMessage[1]) : null;
}

/** "Already running" is Nearby declining to start twice, not a precondition missing. */
const isRefusal = (status: number) =>
  status !== NEARBY.alreadyAdvertising && status !== NEARBY.alreadyDiscovering;

const isPermission = (status: number) =>
  status >= NEARBY.permissionFirst && status <= NEARBY.permissionLast;

/** Whether a round of starts ended in a refusal worth counting toward `run`. */
export const refusedIn = (statuses: readonly number[]) => statuses.some(isRefusal);

export function radioStateOf(input: {
  grant: RadioGrant;
  /** The status each refused start came back with this round; `NO_STATUS` for none. */
  statuses: readonly number[];
  /** Whether Bluetooth is on; null when the phone would not say. */
  bluetooth: boolean | null;
  /** Consecutive rounds that ended in a refusal, this one included. */
  run: number;
}): RadioState {
  const { grant, bluetooth, run } = input;
  if (grant !== 'granted') return grant === 'blocked' ? 'blocked' : 'permission';

  const refusals = input.statuses.filter(isRefusal);
  // Android says everything is granted and Nearby names a permission anyway —
  // so the dialog has nothing left to offer, and the settings page is the only
  // place the two can be brought to agree.
  if (refusals.some(isPermission)) return 'blocked';
  if (refusals.includes(NEARBY.locationOff)) return 'location';
  // The reading, not the code: 8007 is also what a settling stack answers
  // with, and it is no evidence of a switch being off. The reading also stands
  // alone — a start Nearby accepted over a radio that is off finds nobody.
  if (bluetooth === false) return 'bluetooth';
  if (refusals.length > 0 && run >= SETTLE_ROUNDS) return 'refused';
  return 'ok';
}
