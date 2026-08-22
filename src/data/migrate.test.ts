/**
 * What a stored blob becomes.
 *
 * These are the tests worth having: everything here runs against real training
 * data on a real phone, and every bug in it is silent — a key quietly dropped
 * to its seeded default, a plan that wakes up empty, a merge that overwrites
 * what you actually lifted. None of it throws; you just find out in the gym.
 *
 * The chain is tested through `migrateBlob` rather than through `migrateV1` /
 * `migrateV2` / `migrateV3` one at a time, because the order is the thing that
 * has been wrong before — `migrateV3` reads the *raw* blob and the other two
 * read the filtered one, and that is exactly the sort of fact a refactor
 * loses.
 */
import { describe, expect, it } from 'vitest';
import { mondayISO } from './date';
import { DEFAULT_GROUPS, V2_GROUP_KEYS } from './exercises';
import type { HistoryEntry } from '@/store/workout-store';
import {
  droppedByShape,
  filterPersisted,
  historyKey,
  mergePersisted,
  migrateBlob,
  type Persisted,
  RESTORE_PARTS,
  type RestorePart,
  STORAGE_VERSION,
} from './migrate';

/* ── fixtures ──────────────────────────────────────────────────────────── */

/**
 * `Persisted` is forty-odd keys and `mergePersisted` reads thirteen of them.
 * Casting rather than spelling out the rest keeps a test about the merge from
 * turning into a copy of the seeded state that has to be maintained beside it.
 */
const mine = (over: Record<string, unknown> = {}): Persisted =>
  ({
    history: [], lastLog: {}, lastMarks: {},
    routines: [], custom: [], groups: [], kinds: [],
    setups: {}, videos: {}, images: {}, exEdits: {}, cueEdits: {},
    plan: { entries: [], skips: {} },
    ...over,
  }) as unknown as Persisted;

const theirs = (over: Record<string, unknown> = {}) => over as Partial<Persisted>;

const session = (date: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  date, rid: 'chest', name: 'Chest A', secs: 3600, vol: 5000, ...over,
});

const ALL = new Set<RestorePart>(RESTORE_PARTS);

const weekly = (id: string, rid: string, dows: number[]) => ({
  id, rid, from: '2026-01-05', repeat: { unit: 'week' as const, n: 1, dows },
});

/* ── the version chain ─────────────────────────────────────────────────── */

describe('migrateBlob — v3 to v4, the weekday slots', () => {
  it('reads `schedule` off the raw blob, not the filtered one', () => {
    // The trap this whole signature exists for: `schedule` left PERSIST, so
    // `filterPersisted` drops it. Read the filtered object and every phone in
    // the world silently wakes up with an empty plan.
    const out = migrateBlob({ schedule: { 0: 'chest', 3: 'chest', 5: 'back' } }, 3);
    expect(out.plan?.entries).toHaveLength(2);
  });

  it('groups a routine planned twice into one rule with two weekdays', () => {
    // `{0:'chest', 3:'chest'}` was always one intention.
    const out = migrateBlob({ schedule: { 0: 'chest', 3: 'chest' } }, 3);
    expect(out.plan?.entries[0]).toMatchObject({
      rid: 'chest',
      from: mondayISO(),
      repeat: { unit: 'week', n: 1, dows: [0, 3] },
    });
  });

  it('anchors the lift at the start of the week it runs in, never earlier', () => {
    // A rule claims no day before its `from`, which is what stops the migration
    // ringing every Monday there has ever been as "planned, not logged".
    const out = migrateBlob({ schedule: { 1: 'back' } }, 3);
    expect(out.plan?.entries[0].from).toBe(mondayISO());
  });

  it('treats an emptied schedule as an answer, not as an absence', () => {
    // Someone cleared every day. The seeded plan must not come back.
    const out = migrateBlob({ schedule: {} }, 3);
    expect(out.plan).toEqual({ entries: [], skips: {} });
  });

  it('leaves a blob with no schedule key alone', () => {
    expect(migrateBlob({ routines: [] }, 3).plan).toBeUndefined();
  });

  it('ignores a schedule of the wrong shape rather than inventing a plan', () => {
    expect(migrateBlob({ schedule: 'monday' }, 3).plan).toBeUndefined();
    expect(migrateBlob({ schedule: ['chest'] }, 3).plan).toBeUndefined();
  });
});

describe('migrateBlob — v2 to v3, the widened muscle groups', () => {
  const v2 = (groups: { key: string; labels: Record<string, string> }[]) =>
    migrateBlob({ groups }, 2).groups!;

  it('adds every key that is new in v3', () => {
    const out = v2(V2_GROUP_KEYS.map((key) => ({ key, labels: { en: key } })));
    expect(out).toHaveLength(DEFAULT_GROUPS.length);
  });

  it('leaves a group the user deleted deleted', () => {
    // Only keys absent from V2_GROUP_KEYS are added, so a v2 key that is gone
    // is gone on purpose.
    const out = v2([{ key: 'Chest', labels: { en: 'Chest' } }, { key: 'Other', labels: { en: 'Other' } }]);
    expect(out.some((g) => g.key === 'Back')).toBe(false);
    expect(out).toHaveLength(DEFAULT_GROUPS.length - 1);
  });

  it('keeps the user’s own name and their order', () => {
    const out = v2([
      { key: 'Back', labels: { en: 'Pulling' } },
      { key: 'Chest', labels: { en: 'Chest' } },
      { key: 'Other', labels: { en: 'Other' } },
    ]);
    expect(out[0]).toEqual({ key: 'Back', labels: { en: 'Pulling' } });
    expect(out[1].key).toBe('Chest');
  });

  it('lets a trailing Other keep the last word', () => {
    const out = v2(V2_GROUP_KEYS.map((key) => ({ key, labels: { en: key } })));
    expect(out[out.length - 1].key).toBe('Other');
  });

  it('appends when Other is not last, rather than moving it', () => {
    const out = v2([{ key: 'Other', labels: { en: 'Other' } }, { key: 'Chest', labels: { en: 'Chest' } }]);
    expect(out[0].key).toBe('Other');
    expect(out[1].key).toBe('Chest');
  });

  it('does nothing to a blob with no groups at all', () => {
    expect(migrateBlob({ routines: [] }, 2).groups).toBeUndefined();
  });
});

describe('migrateBlob — v1 to v2, the per-language names', () => {
  it('gives an untouched default back both languages', () => {
    const out = migrateBlob({ lang: 'de', groups: [{ key: 'Chest', label: 'Chest' }] }, 1);
    expect(out.groups?.[0].labels).toEqual({ en: 'Chest', de: 'Brust' });
  });

  it('files a renamed one under the language it was typed in', () => {
    const out = migrateBlob({ lang: 'de', groups: [{ key: 'Chest', label: 'Brustkorb' }] }, 1);
    expect(out.groups?.[0].labels).toEqual({ de: 'Brustkorb' });
  });

  it('lifts a routine name and drops the old single string', () => {
    const out = migrateBlob(
      { lang: 'en', groups: [], routines: [{ id: 'chest', name: 'Chest A', items: [] }] },
      1,
    );
    expect(out.routines?.[0].names).toEqual({ en: 'Chest A', de: 'Brust A' });
    expect('name' in out.routines![0]).toBe(false);
  });

  it('keeps a custom exercise’s canonical name beside the lifted one', () => {
    const out = migrateBlob(
      { lang: 'de', groups: [], custom: [{ id: 'x1', name: 'Kreuzheben', group: 'Back', kind: 'Barbell' }] },
      1,
    );
    expect(out.custom?.[0]).toMatchObject({ name: 'Kreuzheben', names: { de: 'Kreuzheben' } });
  });

  it('carries a v1 schedule all the way to a v4 plan', () => {
    // migrateV1 has to hand its blob back *unfiltered*, or `schedule` is gone
    // before migrateV3 can read it and a v1 phone loses its whole plan.
    const out = migrateBlob({ lang: 'en', groups: [], schedule: { 2: 'back' } }, 1);
    expect(out.plan?.entries).toHaveLength(1);
    expect(out.plan?.entries[0].rid).toBe('back');
  });

  it('survives a blob that is not an object', () => {
    expect(migrateBlob(null, 1)).toEqual({});
    expect(migrateBlob('nonsense', 1)).toEqual({});
  });
});

describe('migrateBlob — a current blob', () => {
  it('runs no migration at the current version', () => {
    const groups = [{ key: 'Chest', labels: { en: 'Chest' } }];
    expect(migrateBlob({ groups }, STORAGE_VERSION).groups).toEqual(groups);
  });
});

/* ── the corruption guard ──────────────────────────────────────────────── */

describe('filterPersisted', () => {
  it('keeps only durable keys, so stale UI state cannot be resurrected', () => {
    const out = filterPersisted({ history: [], picker: 'routine', daySel: '2026-01-01' });
    expect(Object.keys(out)).toEqual(['history']);
  });

  it('drops a durable key that arrives as the wrong shape', () => {
    // A backup round-tripped through a chat app can carry `history: "..."`,
    // and one such key throws in every screen that maps over it.
    const out = filterPersisted({ history: 'oops', routines: {}, restSeconds: '180' });
    expect(out).toEqual({});
  });

  it('drops a stored null so the seeded default stands', () => {
    expect(filterPersisted({ session: null, rest: null })).toEqual({});
  });

  it('drops a theme name that no longer exists', () => {
    expect(filterPersisted({ theme: 'chartreuse' }).theme).toBeUndefined();
    expect(filterPersisted({ theme: 'blurple' }).theme).toBe('blurple');
  });

  it('repairs the plan’s two sub-keys, which are load-bearing', () => {
    expect(filterPersisted({ plan: {} }).plan).toEqual({ entries: [], skips: {} });
    expect(filterPersisted({ plan: { entries: 'no', skips: 7 } }).plan).toEqual({ entries: [], skips: {} });
  });

  it('drops a plan entry that names no routine', () => {
    const plan = { entries: [weekly('a', 'chest', [0]), { id: 'b', from: '2026-01-05' }], skips: {} };
    expect(filterPersisted({ plan }).plan?.entries).toHaveLength(1);
  });

  it('drops a session whose list is not a list, and the keys that describe it', () => {
    const out = filterPersisted({
      session: { list: 'gone' }, active: 2, elapsed: 90, rest: { at: 10 }, sessionRole: 'host',
    });
    expect(out).toEqual({});
  });

  it('keeps the companion keys when there is a session to resume', () => {
    const out = filterPersisted({
      session: { list: [] }, active: 2, elapsed: 90, sessionRole: 'guest',
    });
    expect(out).toMatchObject({ active: 2, elapsed: 90, sessionRole: 'guest' });
  });

  it('treats sessionRole as a closed pair, not any string', () => {
    const out = filterPersisted({ session: { list: [] }, sessionRole: 'bystander' });
    expect(out.sessionRole).toBeUndefined();
  });
});

describe('droppedByShape', () => {
  it('flags a non-null key of the wrong shape', () => {
    expect(droppedByShape({ history: 'oops' })).toBe(true);
  });

  it('does not flag a present-but-null key, which is what null meant', () => {
    expect(droppedByShape({ session: null, rest: null, diagDir: null })).toBe(false);
  });

  it('does not flag a value-level drop, which is benign', () => {
    expect(droppedByShape({ theme: 'chartreuse', sessionRole: 'bystander' })).toBe(false);
  });

  it('says nothing about a blob that is not an object', () => {
    expect(droppedByShape(null)).toBe(false);
    expect(droppedByShape('nope')).toBe(false);
  });
});

/* ── a session's identity ──────────────────────────────────────────────── */

describe('historyKey', () => {
  it('does not depend on the order the object was built in', () => {
    // Deliberately not JSON.stringify: a blob that has been through a
    // migration is not obliged to keep the original literal's key order.
    const a = { date: '2026-01-05', rid: 'chest', name: 'Chest A', secs: 3600, vol: 5000 };
    const b = { vol: 5000, secs: 3600, name: 'Chest A', rid: 'chest', date: '2026-01-05' };
    expect(historyKey(a as HistoryEntry)).toBe(historyKey(b as HistoryEntry));
  });

  it('tells two real sessions on one day apart', () => {
    const a = session('2026-01-05', { secs: 3600 });
    const b = session('2026-01-05', { secs: 2700 });
    expect(historyKey(a)).not.toBe(historyKey(b));
  });

  it('survives the optional fields being absent', () => {
    expect(historyKey({ date: '2026-01-05', rid: null })).toBe('2026-01-05||||');
  });
});

/* ── adding a backup's missing pieces ──────────────────────────────────── */

describe('mergePersisted — what it is allowed to touch', () => {
  it('returns only the keys the chosen parts touch', () => {
    const out = mergePersisted(mine(), theirs({ routines: [] }), new Set<RestorePart>(['plan']));
    expect(Object.keys(out)).toEqual(['plan']);
  });

  it('cannot hand this phone another phone’s identity or settings', () => {
    // Untouched by construction rather than by being listed.
    const out = mergePersisted(
      mine(),
      theirs({ selfId: 'THEIRS', knownBuddies: ['Jonas'], profile: { name: 'Jonas' }, restSeconds: 90 }),
      ALL,
    );
    for (const k of ['selfId', 'knownBuddies', 'profile', 'restSeconds']) {
      expect(Object.keys(out)).not.toContain(k);
    }
  });
});

describe('mergePersisted — sessions', () => {
  it('adds the days this phone does not have, in date order', () => {
    const out = mergePersisted(
      mine({ history: [session('2026-01-05')] }),
      theirs({ history: [session('2026-01-02'), session('2026-01-09')] }),
      ALL,
    );
    expect(out.history?.map((h) => h.date)).toEqual(['2026-01-02', '2026-01-05', '2026-01-09']);
  });

  it('meets the same session twice and keeps one', () => {
    const one = session('2026-01-05');
    const out = mergePersisted(mine({ history: [one] }), theirs({ history: [{ ...one }] }), ALL);
    expect(out.history).toHaveLength(1);
  });

  it('sorts a mangled row rather than throwing on it', () => {
    // An envelope-valid backup can still carry a row with no date.
    const bad = { rid: null } as unknown as HistoryEntry;
    const out = mergePersisted(mine({ history: [session('2026-01-05')] }), theirs({ history: [bad] }), ALL);
    expect(out.history).toHaveLength(2);
  });

  it('lets the newer lastLog win, because it carries its own date', () => {
    const out = mergePersisted(
      mine({ lastLog: { bench: { date: '2026-01-05', sets: ['70 × 8'] } } }),
      theirs({ lastLog: { bench: { date: '2026-02-01', sets: ['75 × 8'] } } }),
      ALL,
    );
    expect(out.lastLog?.bench.sets).toEqual(['75 × 8']);
  });

  it('keeps this phone’s when the backup is older', () => {
    const out = mergePersisted(
      mine({ lastLog: { bench: { date: '2026-02-01', sets: ['75 × 8'] } } }),
      theirs({ lastLog: { bench: { date: '2026-01-05', sets: ['70 × 8'] } } }),
      ALL,
    );
    expect(out.lastLog?.bench.sets).toEqual(['75 × 8']);
  });

  it('moves lastMarks with the lastLog it describes', () => {
    // They are index for index; taking one without the other puts a verdict on
    // a set it was never about.
    const out = mergePersisted(
      mine({
        lastLog: { bench: { date: '2026-01-05', sets: ['70 × 8'] } },
        lastMarks: { bench: [{ mark: 'up' }] },
      }),
      theirs({
        lastLog: { bench: { date: '2026-02-01', sets: ['75 × 8', '75 × 6'] } },
        lastMarks: { bench: [null, { mark: 'down' }] },
      }),
      ALL,
    );
    expect(out.lastMarks?.bench).toEqual([null, { mark: 'down' }]);
  });

  it('clears a stale mark when the newer log brought none', () => {
    const out = mergePersisted(
      mine({
        lastLog: { bench: { date: '2026-01-05', sets: ['70 × 8'] } },
        lastMarks: { bench: [{ mark: 'up' }] },
      }),
      theirs({ lastLog: { bench: { date: '2026-02-01', sets: ['75 × 8'] } } }),
      ALL,
    );
    expect(out.lastMarks?.bench).toBeUndefined();
  });
});

describe('mergePersisted — the library', () => {
  it('adds routines and exercises the backup has and this phone does not', () => {
    const out = mergePersisted(
      mine({ routines: [{ id: 'chest', names: {}, items: [] }] }),
      theirs({ routines: [{ id: 'chest', names: { en: 'THEIRS' }, items: [] }, { id: 'legs', names: {}, items: [] }] }),
      ALL,
    );
    expect(out.routines?.map((r) => r.id)).toEqual(['chest', 'legs']);
    expect(out.routines?.[0].names).toEqual({});
  });

  it('brings the group and equipment lists along with the library', () => {
    // An exercise filed under a group this phone lacks is stranded outside
    // the library's filter row.
    const out = mergePersisted(
      mine({ groups: [{ key: 'Chest', labels: { en: 'Chest' } }] }),
      theirs({ groups: [{ key: 'Chest', labels: { en: 'THEIRS' } }, { key: 'Calves', labels: { en: 'Calves' } }] }),
      ALL,
    );
    expect(out.groups?.map((g) => g.key)).toEqual(['Chest', 'Calves']);
    expect(out.groups?.[0].labels).toEqual({ en: 'Chest' });
  });

  it('fills gaps in the keyed maps and never overwrites one', () => {
    const out = mergePersisted(
      mine({ setups: { bench: [['Seat', '3']] } }),
      theirs({ setups: { bench: [['Seat', '9']], row: [['Seat', '4']] } }),
      ALL,
    );
    expect(out.setups).toEqual({ bench: [['Seat', '3']], row: [['Seat', '4']] });
  });
});

describe('mergePersisted — the plan', () => {
  it('drops an incoming rule whose routine did not come along', () => {
    // A rule names a routine; one that names nothing draws a planned day the
    // app cannot start.
    const out = mergePersisted(
      mine(),
      theirs({ routines: [], plan: { entries: [weekly('e1', 'ghost', [0])], skips: {} } }),
      ALL,
    );
    expect(out.plan?.entries).toEqual([]);
  });

  it('keeps one whose routine arrived with it', () => {
    const out = mergePersisted(
      mine(),
      theirs({
        routines: [{ id: 'legs', names: {}, items: [] }],
        plan: { entries: [weekly('e1', 'legs', [0])], skips: {} },
      }),
      ALL,
    );
    expect(out.plan?.entries.map((e) => e.id)).toEqual(['e1']);
  });

  it('does not tidy an existing rule whose routine is already gone', () => {
    // That is a state the plan screen handles, and a merge has no business
    // reaching into it.
    const out = mergePersisted(
      mine({ plan: { entries: [weekly('mine', 'deleted', [1])], skips: {} } }),
      theirs({}),
      ALL,
    );
    expect(out.plan?.entries.map((e) => e.id)).toEqual(['mine']);
  });

  it('drops a skip that cancels a rule which never arrived', () => {
    const out = mergePersisted(
      mine(),
      theirs({ plan: { entries: [], skips: { '2026-01-07': ['ghost'] } } }),
      ALL,
    );
    expect(out.plan?.skips).toEqual({});
  });

  it('keeps a skip whose rule is here, without duplicating one', () => {
    const out = mergePersisted(
      mine({ plan: { entries: [weekly('e1', 'chest', [0])], skips: { '2026-01-07': ['e1'] } } }),
      theirs({
        routines: [],
        plan: { entries: [], skips: { '2026-01-07': ['e1'], '2026-01-14': ['e1'] } },
      }),
      ALL,
    );
    expect(out.plan?.skips).toEqual({ '2026-01-07': ['e1'], '2026-01-14': ['e1'] });
  });
});
