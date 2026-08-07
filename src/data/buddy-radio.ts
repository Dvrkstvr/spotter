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
import { PermissionsAndroid, Platform } from 'react-native';

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
};

export type Radio = {
  addListener<K extends keyof RadioEvents>(
    event: K,
    listener: RadioEvents[K]
  ): { remove(): void };
  startAdvertising(name: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  requestConnection(name: string, endpointId: string): Promise<void>;
  acceptConnection(endpointId: string): Promise<void>;
  rejectConnection(endpointId: string): Promise<void>;
  sendPayload(endpointId: string, data: string): Promise<void>;
  disconnectFrom(endpointId: string): Promise<void>;
  stopAll(): Promise<void>;
};

const native = requireOptionalNativeModule<Radio>('NearbyBuddy');

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

export const radio: Radio | null = native ?? (simUrl ? createSimRadio(simUrl) : null);

/** True when the radio is the dev sim — a WebSocket, not Bluetooth. */
export const isSimRadio = radio !== null && native === null;

export const hasRadio = radio !== null;

/**
 * Ask for whatever runtime permissions this Android version wants before
 * touching the radio. Resolves true when everything needed was granted.
 */
export async function ensureRadioPermissions(): Promise<boolean> {
  // The sim needs no Bluetooth permissions — don't prompt for them.
  if (isSimRadio) return true;
  if (Platform.OS !== 'android') return false;
  const api = Platform.Version as number;

  const wanted =
    api >= 33
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

  const results = await PermissionsAndroid.requestMultiple(wanted);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}
