/**
 * Stored bytes in, state out.
 *
 * Every durable thing this app knows lives in one AsyncStorage blob, and this
 * is the only code that decides what a blob *becomes*: which keys are durable,
 * what shape each has to arrive in, how a blob written by an older build is
 * lifted to the current one, and what it means to merge a backup into what is
 * already here. Nothing else may read a stored key directly.
 *
 * Pure, like `data/plan.ts` and `data/stats.ts` — values in, values out, no
 * store, no hooks, no AsyncStorage. The store owns the *keys* (`STORAGE_KEY`
 * and its old versions are addresses, and reading them is I/O) and owns when
 * to call any of this; this module owns the answers.
 *
 * It is here rather than in the store for one reason: it is the code where a
 * wrong answer costs someone their training, and in the store it could only be
 * tested through a React Native harness. Here it is tested by importing it.
 *
 * The one import that points back at the store is `import type { State }`, and
 * type-only is what makes that safe: it is erased, so there is no runtime edge
 * and no cycle. The alternative — restating every one of these shapes
 * structurally, the way `data/stats.ts` does — would mean two definitions of
 * the durable slice, kept in step by hand, which is a worse trade for the
 * module whose whole job is being right about that slice.
 */
import { mondayISO } from '@/data/date';
import {
  DEFAULT_GROUPS,
  DEFAULT_KINDS,
  DEFAULT_ROUTINES,
  V2_GROUP_KEYS,
} from '@/data/exercises';
import type { Lang, LangMap } from '@/data/i18n';
import { asPlan, planFromSchedule } from '@/data/plan';
import { isThemeName } from '@/design/tokens';
import type { HistoryEntry, Labelled, State } from '@/store/workout-store';

/* ── the durable slice ───────────────────────────────────────────── */

/** The number a backup is stamped with, so an old one can be lifted forward. */
export const STORAGE_VERSION = 4;

// Additive only: `filterPersisted` skips keys a stored blob doesn't have, so a
// phone that has been logging since v2 keeps its data and starts the new maps
// empty. Anything that changes the *shape* of an existing key needs a version.
export const PERSIST = [
  'routines', 'plan', 'history', 'lastLog', 'lastMarks', 'custom', 'profile',
  'setups', 'videos', 'lang', 'groups', 'kinds', 'images', 'exEdits', 'cueEdits',
  'knownBuddies', 'buddyIds', 'buddySecrets', 'selfId', 'themeMode', 'theme', 'restSeconds', 'firstUpDefault',
  'haptics', 'restAlert', 'planAlert', 'planAlertAt', 'privateMode', 'onboarded', 'style', 'level', 'coach', 'tips',
  // Ordinary settings, and they ride in a backup like every other one: a
  // restored `diagDir` names a grant the new phone doesn't hold, which is the
  // revoked-folder case the export row already answers by offering the picker.
  'diag', 'diagDir',
  // The LIVE keys — crash recovery, not diary (additive like everything else,
  // so no version bump). A swiped-away app or a process death mid-workout used
  // to lose every ticked set; now the session comes back. `elapsed` is special
  // twice over: the dirty check below skips it so the clock alone never
  // schedules a write, and `flush` stamps the blob with `savedAt` so hydration
  // can add the wall gap back — the clock is wall-anchored, so stored plus gap
  // is the second the interval would have reached. `sessionRole` rides along
  // for one reader: a session resumes *solo*, and `rejoinSession` needs to
  // know which side of the shared workout this phone was — the connection
  // itself is still never persisted.
  'session', 'active', 'elapsed', 'rest', 'sessionRole',
] as const satisfies readonly (keyof State)[];

export type Persisted = Pick<State, (typeof PERSIST)[number]>;

/**
 * The crash-recovery keys, named so backups can refuse them: a backup restored
 * on another phone must not open a phantom workout, and a restore must not
 * reach into one in progress. Both directions go through `dropLive`.
 */
export const dropLive = (
  o: Persisted
): Omit<Persisted, 'session' | 'active' | 'elapsed' | 'rest' | 'sessionRole'> => {
  const { session: _s, active: _a, elapsed: _e, rest: _r, sessionRole: _o, ...durable } = o;
  return durable;
};

/**
 * The radio-identity keys, stripped from any blob on the way *in* from a
 * backup. Approved decision: a restore brings back diary / library / plan /
 * settings only — never who this phone *is* on the buddy radio. Left in, a
 * foreign backup's `selfId` / `knownBuddies` / `buddyIds` / `buddySecrets`
 * would install over this phone's, hijacking its identity and its buddies'
 * trust; a new phone simply re-pairs each buddy through the code flow. Enforced
 * on import, not export — a backup file may still carry them, the guarantee is
 * that they never land. `mergePersisted` already returns only its parts' keys,
 * so the "Add what's missing" path needs no stripping.
 */
export const dropIdentity = <T extends Partial<Persisted>>(
  o: T
): Omit<T, 'selfId' | 'knownBuddies' | 'buddyIds' | 'buddySecrets'> => {
  const { selfId: _i, knownBuddies: _k, buddyIds: _b, buddySecrets: _y, ...rest } = o;
  return rest;
};

export const pickPersisted = (s: State): Persisted => {
  const out = {} as Persisted;
  for (const k of PERSIST) (out as Record<string, unknown>)[k] = s[k];
  return out;
};

/**
 * The container each durable key must arrive as. A blob that was hand-edited
 * or mangled in transit (backups round-trip through chat apps) can carry the
 * right key with the wrong shape — `history: "..."` — and one such key throws
 * in every screen that maps over it, after which the debounced save writes the
 * corruption over the good blob. A mistyped key is dropped here and its seeded
 * default stands; the row-level shapes inside are the mutators' business.
 */
export const PERSIST_SHAPE: Record<
  (typeof PERSIST)[number],
  'array' | 'object' | 'string' | 'number' | 'boolean'
> = {
  routines: 'array', plan: 'object', history: 'array', lastLog: 'object',
  lastMarks: 'object', custom: 'array', profile: 'object', setups: 'object',
  videos: 'object', lang: 'string', groups: 'array', kinds: 'array',
  images: 'object', exEdits: 'object', cueEdits: 'object', knownBuddies: 'array',
  buddyIds: 'object', buddySecrets: 'object', selfId: 'string',
  themeMode: 'string', theme: 'string', restSeconds: 'number',
  firstUpDefault: 'string', haptics: 'boolean', restAlert: 'boolean',
  planAlert: 'boolean', planAlertAt: 'number',
  privateMode: 'boolean', onboarded: 'boolean', style: 'string',
  level: 'string', coach: 'object', tips: 'object',
  // `diagDir`'s 'string' does for its null what `sessionRole`'s does for its.
  diag: 'boolean', diagDir: 'string',
  // `session` and `rest` are object-or-null, and 'object' is exactly the
  // right filter for that: a stored null fails it, the key is dropped, and
  // the seeded null stands — which is what null meant. `sessionRole`'s
  // 'string' does the same for its null.
  session: 'object', active: 'number', elapsed: 'number', rest: 'object',
  sessionRole: 'string',
};

const fitsShape = (v: unknown, shape: (typeof PERSIST_SHAPE)[keyof typeof PERSIST_SHAPE]) =>
  shape === 'array'
    ? Array.isArray(v)
    : shape === 'object'
      ? typeof v === 'object' && v !== null && !Array.isArray(v)
      : typeof v === shape;

/**
 * Whether a parseable blob carries a durable key of the wrong *shape* — the
 * corruption `filterPersisted` silently drops to its seeded default, which the
 * next save then writes over whatever else was in there. A present-but-null key
 * is not corruption (a stored `session`/`rest`/`diagDir` null is exactly what
 * null meant), so only a non-null value that fails its shape counts. Value-level
 * drops (an unknown theme name, a stray `sessionRole` string) are benign and
 * deliberately not flagged.
 */
export const droppedByShape = (raw: unknown): boolean => {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return PERSIST.some((k) => k in o && o[k] != null && !fitsShape(o[k], PERSIST_SHAPE[k]));
};

/** Keep only known durable keys, so stale blobs can't resurrect UI state. */
export const filterPersisted = (raw: unknown): Partial<State> => {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, unknown> = {};
  for (const k of PERSIST) {
    const v = (raw as Record<string, unknown>)[k];
    if (k in raw && fitsShape(v, PERSIST_SHAPE[k])) out[k] = v;
  }
  // A theme that no longer exists would leave the palette wherever it was;
  // drop the name and let the seeded default win instead.
  if ('theme' in out && !isThemeName(out.theme)) delete out.theme;
  // The plan's two sub-keys are load-bearing where every other durable key's
  // rows are the mutators' business — see `asPlan`.
  if ('plan' in out) out.plan = asPlan(out.plan);
  // A session's `list` is load-bearing the same way — everything that resumes
  // one maps over it. And the three companion keys describe a session: with
  // none to resume they are stale readings from one already finished, and the
  // seeded defaults stand instead.
  if (out.session && !Array.isArray((out.session as { list?: unknown }).list))
    delete out.session;
  if (!out.session) {
    delete out.active;
    delete out.elapsed;
    delete out.rest;
    delete out.sessionRole;
  }
  // The role is a closed pair, not any string a mangled blob happens to hold.
  if ('sessionRole' in out && out.sessionRole !== 'host' && out.sessionRole !== 'guest')
    delete out.sessionRole;
  return out as Partial<State>;
};

/**
 * v2 → v3: the seeded muscle groups went from three to the full body.
 *
 * Everything the phone already has is kept exactly as it is — renamed,
 * reordered, added — and only the keys that are *new* in v3 are inserted, so a
 * group someone deleted on purpose stays deleted. They land ahead of a
 * trailing catch-all, because "Other" should keep the last word.
 */
const migrateV2 = (data: Partial<State>): Partial<State> => {
  const have = data.groups;
  if (!Array.isArray(have)) return data;
  const fresh = DEFAULT_GROUPS.filter(
    (d) => !V2_GROUP_KEYS.includes(d.key) && !have.some((g) => g?.key === d.key)
  ).map((d) => ({ key: d.key, labels: { ...d.labels } }));
  if (fresh.length === 0) return data;
  const trailingOther = have.length > 0 && have[have.length - 1]?.key === 'Other' ? 1 : 0;
  return {
    ...data,
    groups: [
      ...have.slice(0, have.length - trailingOther),
      ...fresh,
      ...have.slice(have.length - trailingOther),
    ],
  };
};

/**
 * v3 → v4: the seven weekday slots become dated weekly rules.
 *
 * Takes the **raw** blob alongside the filtered data, and that is the trap
 * worth naming: `schedule` has left `PERSIST`, so `filterPersisted` drops it —
 * read the filtered object here and every phone silently wakes up with an
 * empty plan. A blob with no usable `schedule` keeps whatever it has, which on
 * this path means the seeded plan stands.
 */
const migrateV3 = (raw: unknown, data: Partial<State>): Partial<State> => {
  const sched = (raw as Record<string, unknown> | null)?.schedule;
  // An *empty* schedule is an answer — someone cleared every day — so the lift
  // is written either way and the seeded plan does not come back. Only a blob
  // missing the key entirely is left alone, since it has nothing to say.
  if (typeof sched !== 'object' || sched === null || Array.isArray(sched)) return data;
  return { ...data, plan: planFromSchedule(sched, mondayISO()) };
};

/**
 * Lift a v1 blob (single `label` / `name` strings) to v2 per-language names.
 * An untouched default regains its seeded translations; anything the user
 * named is filed under the blob's language, since that is what they typed in.
 *
 * Returns the lifted blob **unfiltered** — the caller filters. Filtering here
 * would drop `schedule` before `migrateV3` could read it, and a v1 phone's
 * whole schedule would go with it.
 */
const migrateV1 = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== 'object' || raw === null) return {};
  const blob = raw as Record<string, any>;
  const lang: Lang = blob.lang === 'de' ? 'de' : 'en';

  const lift = (defs: readonly { key: string; labels: LangMap }[], rows: any[]): Labelled[] =>
    rows.map((r) => {
      if (r?.labels) return r;
      const label = typeof r?.label === 'string' ? r.label : '';
      const def = defs.find((d) => d.key === r?.key);
      if (def && label === def.labels.en) return { key: r.key, labels: { ...def.labels } };
      return { key: r?.key, labels: label.trim() ? { [lang]: label } : {} };
    });

  if (Array.isArray(blob.groups)) blob.groups = lift(DEFAULT_GROUPS, blob.groups);
  if (Array.isArray(blob.kinds)) blob.kinds = lift(DEFAULT_KINDS, blob.kinds);
  if (Array.isArray(blob.routines))
    blob.routines = blob.routines.map((r: any) => {
      if (r?.names) return r;
      const def = DEFAULT_ROUTINES.find((d) => d.id === r?.id);
      const names: LangMap =
        def && r?.name === def.names.en
          ? { ...def.names }
          : typeof r?.name === 'string' && r.name.trim()
            ? { [lang]: r.name }
            : {};
      const { name: _drop, ...rest } = r ?? {};
      return { ...rest, names };
    });
  if (Array.isArray(blob.custom))
    blob.custom = blob.custom.map((e: any) =>
      e?.names || typeof e?.name !== 'string' ? e : { ...e, names: { [lang]: e.name } }
    );

  return blob;
};

/**
 * A stored blob at version `v`, lifted to the current shape.
 *
 * The one place the chain is written down, so the load path and a backup
 * restore cannot disagree about the order — which matters because
 * `migrateV3` reads the raw blob and the other two read the filtered one.
 */
export const migrateBlob = (raw: unknown, v: number): Partial<State> => {
  const lifted = v < 2 ? migrateV1(raw) : raw;
  let data = filterPersisted(lifted);
  if (v < 3) data = migrateV2(data);
  if (v < 4) data = migrateV3(lifted, data);
  return data;
};

/* ── restoring from a backup ───────────────────────────────────────────────
 *
 * A restore used to have one answer — replace the lot — which is right for a
 * new phone and wrong every other time: a backup is a stranger to whatever you
 * have trained since it was written. So there is a second way in, and it is the
 * rule this app already applies to a buddy's library (`upsertShared`) and to
 * the coach's plan: **additive, and what is on this phone wins.** A backup that
 * has never watched you lift does not get to overwrite what you actually did.
 *
 * That rule is what makes a conflict screen unnecessary. There is nothing to
 * ask about item by item — either the backup fills a gap, in which case take
 * it, or it disagrees with something already here, in which case here wins.
 * Someone who wants the backup's version of everything wants Replace, which is
 * still one hold away.
 *
 * Pure, and in `data/` after all. It sat beside the other merges in the store
 * on the grounds that a `data/` module would have to restate these shapes
 * structurally to avoid an import cycle — `data/stats.ts`'s rule. What that
 * missed is that a *type-only* import is erased: `import type { State }` makes
 * no runtime edge, so the shapes stay singly defined and this module still
 * loads with nothing native under it. Which is the move's whole point.
 */

/** The parts of a backup that can be taken separately. */
export const RESTORE_PARTS = ['sessions', 'library', 'plan'] as const;
export type RestorePart = (typeof RESTORE_PARTS)[number];

/** What taking a backup's every part would add to what is already here. */
export type RestoreCounts = {
  sessions: number;
  routines: number;
  exercises: number;
  plan: number;
};

/**
 * A logged session's identity.
 *
 * `HistoryEntry` carries no id — it never needed one, because until now nothing
 * ever met the same session twice — so this is a content key over the fields
 * `finishSession` writes. Two entries that agree on all of them are one
 * session logged once and copied; two real sessions on one day differ in the
 * clock or the volume long before they collide here.
 *
 * Deliberately not `JSON.stringify`: key order is an implementation detail of
 * whichever literal built the object, and a blob that has been through a
 * migration is not obliged to keep it.
 */
export const historyKey = (e: HistoryEntry) =>
  [e.date, e.rid ?? '', e.name ?? '', e.secs ?? '', e.vol ?? ''].join('|');

/** Fill the gaps in a keyed map, and only the gaps: what is here wins. */
const fillGaps = <T,>(mine: Record<string, T>, theirs: Record<string, T> | undefined) => ({
  ...(theirs ?? {}),
  ...mine,
});

/** Add the rows whose key this phone doesn't have yet, in the backup's order. */
const addMissing = <T,>(mine: T[], theirs: T[] | undefined, key: (x: T) => string) => {
  const here = new Set(mine.map(key));
  return [...mine, ...(theirs ?? []).filter((x) => !here.has(key(x)))];
};

/**
 * The durable slice with a backup's missing pieces added to it.
 *
 * Returns only the keys the chosen parts touch, so everything else — every
 * setting, the profile, and the whole buddy roster including `selfId` — is
 * untouched by construction rather than by being listed. Which is the point:
 * a merge must not be able to hand this phone another phone's install id.
 */
export const mergePersisted = (
  mine: Persisted,
  theirs: Partial<Persisted>,
  parts: ReadonlySet<RestorePart>
): Partial<State> => {
  const out: Partial<State> = {};

  if (parts.has('sessions')) {
    // A mangled-but-envelope-valid backup can carry a row with a missing or
    // non-string `date`; coerce before comparing so "Add what's missing" sorts
    // rather than throwing on `.localeCompare`.
    out.history = addMissing(mine.history, theirs.history, historyKey).sort((a, b) =>
      String(a.date ?? '').localeCompare(String(b.date ?? ''))
    );

    // `lastLog` carries the date of the session it came from, so "newer wins"
    // is exact rather than a guess — and `lastMarks` moves with it index for
    // index (see the key's own comment), or a ▲ ends up sitting on a set it
    // was never a verdict about.
    const lastLog = { ...mine.lastLog };
    const lastMarks = { ...mine.lastMarks };
    for (const [id, log] of Object.entries(theirs.lastLog ?? {})) {
      if ((lastLog[id]?.date ?? '') >= log.date) continue;
      lastLog[id] = log;
      const marks = theirs.lastMarks?.[id];
      if (marks) lastMarks[id] = marks;
      else delete lastMarks[id];
    }
    out.lastLog = lastLog;
    out.lastMarks = lastMarks;
  }

  if (parts.has('library')) {
    out.routines = addMissing(mine.routines, theirs.routines, (r) => r.id);
    out.custom = addMissing(mine.custom, theirs.custom, (e) => e.id);
    // The lists come with the library rather than on their own tick: an
    // exercise filed under a group this phone doesn't have is stranded outside
    // the library's filter row, which is the state deleting a seeded group
    // produces. Gaps only, so a renamed row keeps the user's name.
    out.groups = addMissing(mine.groups, theirs.groups, (g) => g.key);
    out.kinds = addMissing(mine.kinds, theirs.kinds, (k) => k.key);
    out.setups = fillGaps(mine.setups, theirs.setups);
    out.videos = fillGaps(mine.videos, theirs.videos);
    out.images = fillGaps(mine.images, theirs.images);
    out.exEdits = fillGaps(mine.exEdits, theirs.exEdits);
    out.cueEdits = fillGaps(mine.cueEdits, theirs.cueEdits);
  }

  if (parts.has('plan')) {
    const theirPlan = asPlan(theirs.plan);
    // A rule names a routine, so one whose routine did not come along names
    // nothing — it would draw a planned day the app cannot start. Only the
    // *incoming* rules are filtered: an existing entry whose routine is gone is
    // a state the plan screen already handles, and a merge has no business
    // tidying it.
    const rids = new Set((out.routines ?? mine.routines).map((r) => r.id));
    const here = new Set(mine.plan.entries.map((e) => e.id));
    const entries = [
      ...mine.plan.entries,
      ...theirPlan.entries.filter((e) => !here.has(e.id) && rids.has(e.rid)),
    ];

    // A skip names an entry id, so one pointing at a rule that didn't come
    // along is a cancellation of nothing.
    const ids = new Set(entries.map((e) => e.id));
    const skips: Record<string, string[]> = { ...mine.plan.skips };
    for (const [iso, list] of Object.entries(theirPlan.skips)) {
      const add = list.filter((id) => ids.has(id) && !(skips[iso] ?? []).includes(id));
      if (add.length) skips[iso] = [...(skips[iso] ?? []), ...add];
    }
    out.plan = { entries, skips };
  }

  return out;
};

/**
 * What a backup would add.
 *
 * Computed by running the merge and measuring it, rather than by a second pass
 * that counts — so the preview cannot promise a number the import then misses.
 */
export const restoreCounts = (mine: Persisted, theirs: Partial<Persisted>): RestoreCounts => {
  const all = mergePersisted(mine, theirs, new Set(RESTORE_PARTS));
  return {
    sessions: (all.history?.length ?? 0) - mine.history.length,
    routines: (all.routines?.length ?? 0) - mine.routines.length,
    exercises: (all.custom?.length ?? 0) - mine.custom.length,
    plan: (all.plan?.entries.length ?? 0) - mine.plan.entries.length,
  };
};
