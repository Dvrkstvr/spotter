/**
 * A message shared into Spotter — a typed bridge over the ShareText native
 * module (modules/expo-share-text).
 *
 * Optional, like `buddy-radio.ts` and for the same reason: the module only
 * exists in a development or standalone build, and Expo Go must degrade rather
 * than crash. Without it every call here is a no-op and the coach's paste box
 * is still the way in — which is why the prompt keeps telling the AI to put the
 * block in the message either way.
 *
 * The native side hands over a string and nothing else. What the string turns
 * out to be is `<Intake>`'s question, the same as for a tapped file.
 */
import { requireOptionalNativeModule } from 'expo';

type ShareTextNative = {
  /** The waiting share, taken once. Null when there isn't one. */
  takeSharedText(): string | null;
  addListener(
    event: 'onSharedText',
    listener: (e: { text: string }) => void
  ): { remove(): void };
};

const native = requireOptionalNativeModule<ShareTextNative>('ShareText');

/** Whether this build can be shared into at all. False in Expo Go. */
export const hasShareText = !!native;

/**
 * The share that launched the app, if it was launched by one. Called at mount:
 * a cold-start share lands before there is any JS to notify, so it waits in the
 * module until asked for.
 */
export const takeSharedText = (): string | null => {
  try {
    return native?.takeSharedText() ?? null;
  } catch {
    return null;
  }
};

/** A share into an app that was already running. */
export const onSharedText = (fn: (text: string) => void): (() => void) => {
  if (!native) return () => {};
  const sub = native.addListener('onSharedText', (e) => fn(e.text));
  return () => sub.remove();
};
