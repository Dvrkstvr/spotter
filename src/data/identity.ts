/**
 * This phone's install id — the stable half of the peer identity that the
 * radio advertises (see encodePeerName in buddy-sync.ts).
 *
 * On Android it is ANDROID_ID: per device + app signing key, so it survives
 * reinstalls — a wiped and reinstalled app is still the same buddy. Anywhere
 * that isn't available, a random id is generated once and persisted
 * (`selfId` in the store); that one dies with the app data, which the
 * name-fallback matching absorbs.
 */
import * as Application from 'expo-application';
import { Platform } from 'react-native';

export function deviceInstallId(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    const id = Application.getAndroidId();
    return id && /^[a-z0-9]{8,}$/i.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const randomInstallId = () =>
  `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 16);
