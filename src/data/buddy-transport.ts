/**
 * The buddy transport — how this phone talks to a training buddy's phone.
 *
 * MOCK IMPLEMENTATION. Real Bluetooth needs a native module that cannot run
 * inside Expo Go, and this project is pinned to Expo Go SDK 54 (see
 * AGENTS.md), so the whole sync flow is built against this file's fake radio
 * instead: three canned peers, canned latency, canned snapshots. Swapping in
 * a real transport later means reimplementing these three functions —
 * `scanPeers`, `connectPeer`, `sendToPeer` — and nothing else; the sync
 * screen and the diff logic only ever see the types below.
 *
 * "Receiving" from a mock peer is real (the items genuinely merge into the
 * store and persist); "sending" goes nowhere, which the UI says out loud.
 *
 * For live two-way testing without Bluetooth (two emulators, or emulator +
 * phone in Expo Go), use the sim radio instead: src/data/sim-radio.ts over
 * scripts/buddy-relay.mjs, enabled via `npm run start:sim`.
 */
import {
  DEFAULT_GROUPS,
  DEFAULT_KINDS,
  DEFAULT_ROUTINES,
  Exercise,
  Routine,
} from '@/data/exercises';
import type { Labelled } from '@/store/workout-store';

export type BuddyPeer = { id: string; name: string; device: string };

/** Everything shareable that a peer's device holds. */
export type BuddySnapshot = {
  peer: BuddyPeer;
  groups: Labelled[];
  kinds: Labelled[];
  custom: Exercise[];
  routines: Routine[];
};

/* ── the fake radio ────────────────────────────────────────────────────── */

const PEERS: BuddyPeer[] = [
  { id: 'jonas', name: 'Jonas', device: 'Pixel 8 · 2 m' },
  { id: 'mira', name: 'Mira', device: 'Galaxy S24 · 5 m' },
  { id: 'tom', name: 'Tom', device: 'Pixel 7a · 9 m' },
];

/**
 * Canned per-peer extras on top of the shared defaults. Deliberately staged
 * to exercise every sync case: Jonas has a bilingual group and an English
 * routine, Mira has the same group German-only (pair both and the missing
 * English name becomes a transferable translation), Tom has nothing — so
 * everything user-made on this phone shows as sendable to him.
 */
const EXTRAS: Record<string, Partial<Omit<BuddySnapshot, 'peer'>>> = {
  jonas: {
    groups: [{ key: 'gNeck', labels: { en: 'Neck', de: 'Nacken' } }],
    kinds: [{ key: 'kKettlebell', labels: { en: 'Kettlebell', de: 'Kettlebell' } }],
    custom: [
      {
        id: 'xFacepull',
        name: 'Face Pull',
        names: { en: 'Face Pull' },
        group: 'Back',
        kind: 'Cable',
        last: 25,
        lastSets: ['25 × 15', '25 × 14', '22.5 × 15'],
      },
    ],
    routines: [
      {
        id: 'rPullB',
        names: { en: 'Pull B' },
        items: [
          { ex: 'xFacepull', sets: 3, reps: 15, w: 25 },
          { ex: 'lat', sets: 4, reps: 10, w: 55 },
          { ex: 'curl', sets: 3, reps: 12, w: 14 },
        ],
      },
    ],
  },
  mira: {
    groups: [{ key: 'gNeck', labels: { de: 'Nacken' } }],
    custom: [
      {
        id: 'xPlank',
        name: 'Plank',
        names: { de: 'Unterarmstütz' },
        group: 'Other',
        kind: 'Bodyweight',
        last: 0,
        lastSets: ['BW × 60s'],
      },
    ],
  },
  tom: {},
};

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const latency = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/* ── the three functions a real transport would replace ────────────────── */

export const scanPeers = (): BuddyPeer[] => PEERS;

export async function connectPeer(id: string): Promise<BuddySnapshot> {
  await latency(700);
  const peer = PEERS.find((p) => p.id === id);
  if (!peer) throw new Error(`unknown peer ${id}`);
  const extra = EXTRAS[id] ?? {};
  return copy({
    peer,
    groups: [...DEFAULT_GROUPS, ...(extra.groups ?? [])],
    kinds: [...DEFAULT_KINDS, ...(extra.kinds ?? [])],
    custom: extra.custom ?? [],
    routines: [...DEFAULT_ROUTINES, ...(extra.routines ?? [])],
  });
}

/** Mock: the payload is accepted and dropped. A real transport would ship it. */
export async function sendToPeer(_id: string, _payload: unknown): Promise<void> {
  await latency(400);
}
