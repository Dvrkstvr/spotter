/**
 * Typed bridge over the SessionService native module
 * (modules/expo-session-service) — the foreground service a live workout runs
 * under. See SessionService.kt for what it buys; this file only makes it
 * optional, the buddy-radio.ts pattern: Expo Go has no module, every call is
 * a no-op, and the app degrades to what it did before the service existed —
 * a session that survives through the LIVE keys instead of through the
 * process.
 */
import { requireOptionalNativeModule } from 'expo';

type Api = {
  start(
    title: string,
    text: string,
    channelName: string,
    startedAtMs: number,
    keepAwake: boolean
  ): void;
  stop(): void;
};

const native = requireOptionalNativeModule<Api>('SessionService');

/** True when the service exists — a dev/standalone build, not Expo Go. */
export const hasSessionService = native !== null;

export function startSessionService(
  title: string,
  text: string,
  channelName: string,
  startedAtMs: number,
  keepAwake: boolean
): void {
  try {
    native?.start(title, text, channelName, startedAtMs, keepAwake);
  } catch {
    /* a workout must never be lost to a notification */
  }
}

export function stopSessionService(): void {
  try {
    native?.stop();
  } catch {
    /* nothing to stop is the same as stopped */
  }
}
