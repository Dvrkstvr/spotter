/**
 * Something the OS handed this app, waiting for React to look at it.
 *
 * Two ways in and one slot, because they arrive the same way and end in the
 * same place: a **file** tapped in another app (`+native-intent` lifts the URI
 * off the intent) and the **text** of a message shared into Spotter
 * (`share-text.ts`, which needs a native module because the payload is an
 * intent extra). Both land before there is necessarily a component tree —
 * expo-router's `+native-intent` runs while the bundle is still starting — so
 * this is a slot written from outside React, and `<Intake>` drains it at mount
 * for a cold start and on notification for every later one.
 *
 * Deliberately one payload deep. Two things cannot be handed over at once, and
 * a queue would only ever hold the case where the first is still being read —
 * where the newer one is what the user is waiting on anyway.
 *
 * No knowledge of files or plans here on purpose: what a URI turns out to be is
 * `backup.ts`'s question, and what to do about either is the component's.
 */

export type Incoming = { kind: 'file'; uri: string } | { kind: 'text'; text: string };

let pending: Incoming | null = null;
const listeners = new Set<() => void>();

const offer = (next: Incoming) => {
  pending = next;
  for (const fn of listeners) fn();
};

/** Called from `+native-intent`, outside React. */
export const offerFile = (uri: string) => offer({ kind: 'file', uri });

/** Called from the share-text bridge, which may be outside React too. */
export const offerText = (text: string) => offer({ kind: 'text', text });

/** Take what is waiting, if anything, and empty the slot. */
export const takeIncoming = (): Incoming | null => {
  const next = pending;
  pending = null;
  return next;
};

export const subscribeIncoming = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
