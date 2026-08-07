/**
 * The buddy diff — what two devices would have to exchange to agree.
 *
 * Pure functions over the shareable slice: whole items one side lacks
 * (matched by key/id — defaults share keys everywhere, synced items keep the
 * key they were created with), and per-language names where both sides have
 * the item but only one side has a language filled (the #4 alias model is
 * what makes "missing translation" well-defined).
 */
import type { BuddySnapshot } from '@/data/buddy-transport';
import type { Exercise, Routine } from '@/data/exercises';
import type { Lang, LangMap } from '@/data/i18n';
import type { Labelled } from '@/store/workout-store';

export type SyncSide = {
  groups: Labelled[];
  kinds: Labelled[];
  custom: Exercise[];
  routines: Routine[];
};

export type SyncItemType = 'group' | 'kind' | 'exercise' | 'routine';

export type SyncItem =
  | {
      kind: 'item';
      type: SyncItemType;
      /** key/id of the entity on the side that has it */
      key: string;
      /** display names of the thing being transferred */
      names: LangMap;
      fallback: string;
    }
  | {
      kind: 'translation';
      type: SyncItemType;
      key: string;
      /** the language being filled in, and the name that fills it */
      lang: Lang;
      text: string;
      /** the existing names on the side that lacks the language, for display */
      names: LangMap;
      fallback: string;
    };

export type BuddyDiff = {
  /** on the peer, missing here — importable for real */
  receive: SyncItem[];
  /** here, missing on the peer — mock transport, send is simulated */
  send: SyncItem[];
};

/** A stable identity for list keys and "already transferred" bookkeeping. */
export const syncItemId = (i: SyncItem) =>
  i.kind === 'item' ? `${i.type}:${i.key}` : `t:${i.type}:${i.key}:${i.lang}`;

const LANGS: Lang[] = ['en', 'de'];

function oneWay(from: SyncSide, to: SyncSide): SyncItem[] {
  const out: SyncItem[] = [];

  const walk = <T>(
    type: SyncItemType,
    fromList: T[],
    toList: T[],
    keyOf: (x: T) => string,
    namesOf: (x: T) => LangMap,
    fallbackOf: (x: T) => string
  ) => {
    for (const item of fromList) {
      const other = toList.find((x) => keyOf(x) === keyOf(item));
      if (!other) {
        out.push({
          kind: 'item',
          type,
          key: keyOf(item),
          names: namesOf(item),
          fallback: fallbackOf(item),
        });
        continue;
      }
      // Both sides have it — languages filled here but not there transfer.
      for (const lang of LANGS) {
        const text = namesOf(item)[lang]?.trim();
        if (text && !namesOf(other)[lang]?.trim())
          out.push({
            kind: 'translation',
            type,
            key: keyOf(item),
            lang,
            text,
            names: namesOf(other),
            fallback: fallbackOf(other),
          });
      }
    }
  };

  walk('group', from.groups, to.groups, (g) => g.key, (g) => g.labels, () => '');
  walk('kind', from.kinds, to.kinds, (k) => k.key, (k) => k.labels, () => '');
  walk('exercise', from.custom, to.custom, (e) => e.id, (e) => e.names ?? {}, (e) => e.name);
  walk('routine', from.routines, to.routines, (r) => r.id, (r) => r.names, () => '');

  return out;
}

export const diffBuddy = (local: SyncSide, peer: BuddySnapshot): BuddyDiff => ({
  receive: oneWay(peer, local),
  send: oneWay(local, peer),
});

/** The shareable slice of a device's state — what a snapshot carries. */
export const shareableSlice = (s: SyncSide): SyncSide => ({
  groups: s.groups,
  kinds: s.kinds,
  custom: s.custom,
  routines: s.routines,
});

/* ── wire protocol (real radio) ────────────────────────────────────────── */

/** Messages the two phones exchange once Nearby connects them. */
export type BuddyMessage =
  | { v: 1; t: 'snapshot'; name: string; data: SyncSide }
  | { v: 1; t: 'item'; item: SyncItem };

export const parseBuddyMessage = (raw: string): BuddyMessage | null => {
  try {
    const m = JSON.parse(raw);
    return m && m.v === 1 && (m.t === 'snapshot' || m.t === 'item') ? (m as BuddyMessage) : null;
  } catch {
    return null;
  }
};
