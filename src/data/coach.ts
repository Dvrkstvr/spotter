/**
 * The AI coach: one prompt out, one plan back.
 *
 * The app has the data and no opinion; a chat model has opinions and no data.
 * So this builds a prompt around what the diary actually knows, hands it to
 * whichever AI app is on the phone, and reads the answer back through a fixed
 * JSON block. No API key, no account, no network call of its own — the whole
 * exchange is the Android share sheet and a paste.
 *
 * **The contract is the seam.** `buildPrompt` writes the request and
 * `parsePlan` reads the reply, and neither knows who is on the other side. A
 * tiny on-device model later replaces the share-and-paste hop by answering the
 * same block; the preview and the import path do not change.
 *
 * Pure, and deliberately store-free: it takes what it needs as arguments, so
 * the prompt can be rebuilt on any screen and the parser can be reasoned about
 * without a phone.
 */

import { measureOf, type Exercise, type Measure } from './exercises';
import type { LangMap, Strings } from './i18n';
import type { KeyLift, RegionStat, TrainingStats } from './stats';

/* ── what the user asks for ────────────────────────────────────────────── */

export type GoalKey =
  | 'weak' | 'strength' | 'muscle' | 'cardio' | 'mobility' | 'balanced';

export const GOALS: readonly GoalKey[] = [
  'weak', 'strength', 'muscle', 'cardio', 'mobility', 'balanced',
];

/**
 * The coach's settings, persisted so re-running it next month is two taps.
 *
 * `kinds` holds *equipment keys*, not labels: the user renames those freely,
 * and a stored label would stop matching the moment they did.
 */
export type CoachOptions = {
  goal: GoalKey;
  /** Sessions per week to plan for. */
  perWeek: number;
  /** Equipment keys to plan with. Empty means "whatever I have". */
  kinds: string[];
  /**
   * Put age, bodyweight and height in the prompt. Off by default and stated
   * on screen: it is the only personal data anywhere in this flow, and the
   * prompt is shown in full precisely so this switch means something.
   */
  shareProfile: boolean;
};

export const DEFAULT_COACH: CoachOptions = {
  goal: 'weak',
  perWeek: 3,
  kinds: [],
  shareProfile: false,
};

const goalKey = (g: GoalKey) => `goal${g[0].toUpperCase()}${g.slice(1)}` as `goal${Capitalize<GoalKey>}`;

/** A goal's chip label. Takes `L` so it can't be hoisted — see `ui.tsx`. */
export const goalLabel = (g: GoalKey, L: Strings) => L[goalKey(g)];

/** The sentence the prompt states the goal with. */
const goalLine = (g: GoalKey, L: Strings) =>
  L[`${goalKey(g)}Ask` as `goal${Capitalize<GoalKey>}Ask`];

/* ── the prompt ────────────────────────────────────────────────────────── */

/** The fence tag the reply's data block carries. Also what `parsePlan` hunts for. */
export const FENCE = 'spotter';

/** The four measures, spelled out for a reader who has never seen this app. */
const measureMenu = (L: Strings) =>
  `load (${L.measureLoad}), time (${L.measureTime}), distance (${L.measureDistance}), duration (${L.measureDuration})`;

export type PromptInput = {
  opts: CoachOptions;
  stats: TrainingStats;
  lifts: KeyLift[];
  /** Every exercise the phone already has, so the answer reuses them. */
  library: Exercise[];
  /** Muscle-group and equipment keys the import can actually resolve. */
  groupKeys: string[];
  kindKeys: string[];
  profile: { age: string; weight: string; height: string };
  /** The window the numbers describe, already spelled out ("8 weeks"). */
  periodLabel: string;
  /** "1 session" / "4 sessions" — agreement belongs to the caller's dictionary. */
  sessionCount: (n: number) => string;
  regionName: (r: RegionStat['region']) => string;
  exName: (e: Exercise) => string;
  kindName: (key: string) => string;
  L: Strings;
};

/**
 * Everything the AI is told, as one block of text.
 *
 * Written in the user's language, because they read it before they send it —
 * it is shown in full on the way out, which is what makes the privacy switch
 * honest rather than decorative. The *contract* stays English-keyed
 * regardless: `"measure": "load"` is an identifier in this app's data, not a
 * word being translated, and a German reply carrying `"gewicht"` would import
 * as nothing.
 */
export function buildPrompt(i: PromptInput): string {
  const { L, stats, opts } = i;
  const out: string[] = [];

  out.push(L.promptIntro, '');

  const gear = opts.kinds.length
    ? opts.kinds.map(i.kindName).join(', ')
    : L.promptAnyGear;
  out.push(
    `${L.promptGoalHead}  ${goalLine(opts.goal, L)} ` +
      L.promptWeek.replace('{n}', String(opts.perWeek)) +
      ` ${L.promptGear.replace('{gear}', gear)}`,
    ''
  );

  // The balance, in the same six regions the screen draws — and the weak ones
  // named again in words, because that is the finding rather than the table.
  const shares = stats.balance
    .map((b) => `${i.regionName(b.region)} ${Math.round(b.share * 100)}`)
    .join(' · ');
  out.push(`${L.promptBalanceHead} (${i.periodLabel}, %)  ${shares}`);
  if (stats.weak.length)
    out.push(
      `${L.promptWeakHead} ` +
        stats.weak
          .map((w) => `${i.regionName(w.region)} ${Math.round(w.share * 100)}%`)
          .join(', ')
    );
  out.push(
    `${L.promptCardioHead} ` +
      (stats.cardioSessions === 0
        ? L.promptCardioNone
        : L.promptCardioSome
            .replace('{n}', i.sessionCount(stats.cardioSessions))
            .replace('{km}', String(Math.round(stats.distanceKm))))
  );
  out.push('');

  if (i.lifts.length) {
    const lifts = i.lifts.map((l) => {
      const e = i.library.find((x) => x.id === l.id);
      const name = e ? i.exName(e) : l.id;
      // A lift seen once has no trend, and saying "+0 kg" about it would
      // report a plateau that hasn't had a chance to happen yet.
      const trend =
        l.deltaKg === null
          ? L.promptLiftNew
          : l.deltaKg === 0
            ? L.promptLiftFlat
            : L.promptLiftUp.replace('{kg}', (l.deltaKg > 0 ? '+' : '') + String(l.deltaKg));
      return `${name} ${l.latest} (${trend})`;
    });
    out.push(`${L.promptLiftsHead}  ${lifts.join(' · ')}`, '');
  }

  if (opts.shareProfile) {
    const bits = [
      i.profile.age && `${i.profile.age} ${L.yrs}`,
      i.profile.weight && `${i.profile.weight} kg`,
      i.profile.height && `${i.profile.height} cm`,
    ].filter(Boolean);
    if (bits.length) out.push(`${L.promptAboutHead}  ${bits.join(', ')}`, '');
  }

  /* — the reply contract — */

  out.push(L.promptRulesHead);
  out.push(L.promptRule1);
  out.push(L.promptRule2);
  out.push(
    '```' + FENCE,
    '{"exercises":[{"name":"…","group":"…","equipment":"…","measure":"load"}],' +
      '"routines":[{"name":"…","items":[{"exercise":"…","sets":3,"reps":8,"kg":40}]}]}',
    '```'
  );
  out.push(`- ${L.promptRuleMeasure.replace('{list}', measureMenu(L))}`);
  out.push(`- ${L.promptRuleGroup.replace('{list}', i.groupKeys.join(', '))}`);
  out.push(`- ${L.promptRuleKind.replace('{list}', i.kindKeys.join(', '))}`);
  // The library goes in so the answer builds on what is here rather than
  // inventing "Flat Barbell Chest Press" next to Bench Press. Names are the
  // join key on the way back — see `parsePlan`.
  out.push(`- ${L.promptRuleReuse.replace('{list}', i.library.map(i.exName).join(', '))}`);

  // The second way home, offered to the AI rather than printed for the user:
  // Spotter answers a tapped file now, so a reply that *can* arrive as one saves
  // the copy and the paste. Belt and braces on purpose — the block still goes in
  // the message, because most chat AIs cannot attach anything and a delivery
  // route that replaced the working one with an unproven one would be a
  // downgrade.
  //
  // `.json` rather than this app's own `.sptr` (`EXT` in backup.ts), and that is
  // the one place the two disagree on purpose: the export is a file we write and
  // name, while this one is written by a stranger and has to survive a chat app's
  // attachment rules — where a type nothing recognises is the thing most likely
  // to be refused. The filter claims json anyway, so nothing is lost by asking
  // for the format the far end can actually send.
  out.push('', L.promptRuleFile);

  // Rule 3 is what makes the answer carry its own way home. Whoever wandered
  // into a chat app has no reason to remember this flow, so the reply ends by
  // walking them back — now by *sharing* the message rather than copying it,
  // which is one gesture and no clipboard. Paste survives as the third step
  // rather than the first: it is what an Expo Go build and any chat app without
  // a share sheet still have, and `parsePlan` reads both the same way.
  out.push('', L.promptRule3);
  out.push(L.promptStep1, L.promptStep2, L.promptStep3);

  return out.join('\n');
}

/* ── reading the reply ─────────────────────────────────────────────────── */

export type PlanExercise = {
  name: string;
  group?: string;
  equipment?: string;
  measure?: string;
};
export type PlanItem = { exercise: string; sets?: number; reps?: number; kg?: number };
export type PlanRoutine = { name: string; items: PlanItem[] };
export type Plan = { exercises: PlanExercise[]; routines: PlanRoutine[] };

export type ParseResult =
  | { ok: true; plan: Plan }
  | { ok: false; reason: 'none' | 'json' | 'shape' };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Caps at the parse seam. An AI reply is untrusted input that gets rendered in
 * a preview and, on import, persisted into routines a later session sizes
 * arrays from. A runaway or malicious block must not be able to hang the render
 * or bloat the store. The limits are generous — no real week of training comes
 * near them — so a normal plan is never touched. (New exercises can only come
 * from the block, so `MAX_EXERCISES` bounds every one the import would create;
 * routine items naming an unknown exercise are dropped, not invented.)
 */
const MAX_ROUTINES = 50;
const MAX_ITEMS = 50; // per routine
const MAX_EXERCISES = 200;
const MAX_NAME = 100; // characters; a longer name is truncated, not rejected

/** A trimmed, length-capped name — for the strings that get persisted. */
const capName = (v: unknown) => str(v).slice(0, MAX_NAME);

/** The prompt's own example placeholders — an echoed one must not import. */
const isPlaceholder = (s: string) => s === '…' || s === '...';

const numOr = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  // Finite, not just non-NaN: JSON.parse turns `1e999` into Infinity, which
  // would sail through every downstream Math.max and land in a persisted
  // routine — where `Array.from({ length: Infinity })` throws on session start.
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Find the plan inside whatever the AI said.
 *
 * The reply is prose *and* data, and only the data is ours — so this hunts the
 * fenced block and ignores everything around it, which is what lets the user
 * paste the whole message without editing it. That is the entire interaction
 * on their side: copy, paste.
 *
 * A bare ``` fence is accepted as a fallback because models drop the tag more
 * often than they drop the block, and refusing a plan that is plainly right
 * there would be pedantry rather than safety — the shape is still checked, and
 * anything that isn't a plan fails on that.
 */
export function parsePlan(reply: string): ParseResult {
  const text = String(reply ?? '');
  const tagged = new RegExp('```[ \\t]*' + FENCE + '[^\\n]*\\n([\\s\\S]*?)```', 'i').exec(text);
  const raw =
    tagged?.[1] ??
    // Any fenced block whose contents look like an object, else a bare object
    // in the prose. Both still have to survive JSON.parse and the shape check.
    /```[^\n]*\n\s*(\{[\s\S]*?\})\s*```/.exec(text)?.[1] ??
    /(\{[\s\S]*"routines"[\s\S]*\})/.exec(text)?.[1];

  if (!raw) return { ok: false, reason: 'none' };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, reason: 'shape' };

  const d = data as Record<string, unknown>;
  const exercises: PlanExercise[] = (Array.isArray(d.exercises) ? d.exercises : [])
    .slice(0, MAX_EXERCISES)
    .map((e): PlanExercise => {
      const o = (e ?? {}) as Record<string, unknown>;
      return {
        name: capName(o.name),
        group: capName(o.group) || undefined,
        equipment: capName(o.equipment) || undefined,
        measure: str(o.measure) || undefined,
      };
    })
    .filter((e) => e.name && !isPlaceholder(e.name));

  const routines: PlanRoutine[] = (Array.isArray(d.routines) ? d.routines : [])
    .slice(0, MAX_ROUTINES)
    .map((r): PlanRoutine => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        name: capName(o.name),
        items: (Array.isArray(o.items) ? o.items : [])
          .slice(0, MAX_ITEMS)
          .map((it): PlanItem => {
            const p = (it ?? {}) as Record<string, unknown>;
            return {
              exercise: capName(p.exercise) || capName(p.name),
              sets: numOr(p.sets),
              reps: numOr(p.reps),
              kg: numOr(p.kg),
            };
          })
          .filter((it) => it.exercise && !isPlaceholder(it.exercise)),
      };
    })
    .filter((r) => r.name && !isPlaceholder(r.name) && r.items.length > 0);

  if (exercises.length === 0 && routines.length === 0) return { ok: false, reason: 'shape' };
  return { ok: true, plan: { exercises, routines } };
}

/* ── resolving it against this phone ───────────────────────────────────── */

export type ResolvedExercise = {
  /** The name as the AI wrote it. */
  name: string;
  /** An exercise already here, matched by name — then nothing is created. */
  existingId?: string;
  /** What would be created. Absent when `existingId` is set. */
  create?: { group: string; kind: string; measure: Measure };
  /** The AI named a group or equipment this phone doesn't have. */
  guessedGroup?: boolean;
  guessedKind?: boolean;
};

export type ResolvedItem = {
  name: string;
  sets: number;
  reps: number;
  kg: number;
  /** Index into `ResolvedPlan.exercises`. */
  ref: number;
};

export type ResolvedRoutine = {
  name: string;
  items: ResolvedItem[];
  /** Already have a routine by this name — importing makes a second one. */
  duplicate: boolean;
};

export type ResolvedPlan = {
  exercises: ResolvedExercise[];
  routines: ResolvedRoutine[];
  /** Items naming an exercise that is neither here nor in the block. */
  dropped: string[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const MEASURES: Measure[] = ['load', 'time', 'distance', 'duration'];

/**
 * Match a plan against the library, without writing anything.
 *
 * Names are the join key in both directions — the AI was given names and
 * answers in names — so this is where a name becomes an id. Matching is
 * case- and space-insensitive and checks *every* language an exercise is named
 * in, because the prompt is German while the library may still carry English
 * names for the seeded half.
 *
 * Nothing here mutates: the screen shows what would happen and the store does
 * it only if the user says so.
 */
export function resolvePlan(
  plan: Plan,
  library: Exercise[],
  groupKeys: string[],
  kindKeys: string[],
  routineNames: string[],
  fallback: { group: string; kind: string }
): ResolvedPlan {
  // First library entry wins a shared normalised name, deterministically —
  // `set` would otherwise let whichever came last silently claim the name.
  const byName = new Map<string, string>();
  const claim = (n: string | undefined, id: string) => {
    if (n && !byName.has(norm(n))) byName.set(norm(n), id);
  };
  for (const e of library) {
    for (const n of Object.values((e.names ?? {}) as LangMap)) claim(n, e.id);
    claim(e.name, e.id);
  }

  const keyOf = (keys: string[], v: string | undefined) =>
    v ? keys.find((k) => norm(k) === norm(v)) : undefined;

  const exercises: ResolvedExercise[] = [];
  const indexOfName = new Map<string, number>();

  const add = (raw: PlanExercise): number => {
    const key = norm(raw.name);
    const already = indexOfName.get(key);
    if (already !== undefined) return already;

    const existingId = byName.get(key);
    let res: ResolvedExercise;
    if (existingId) {
      res = { name: raw.name, existingId };
    } else {
      const group = keyOf(groupKeys, raw.group);
      const kind = keyOf(kindKeys, raw.equipment);
      const measure = MEASURES.find((m) => m === raw.measure) ?? 'load';
      res = {
        name: raw.name,
        // An unresolvable group or equipment files under the catch-all rather
        // than inventing a key: the lists are the user's, and a plan must not
        // be able to grow them behind their back. Flagged so the screen can
        // say so instead of guessing quietly.
        create: { group: group ?? fallback.group, kind: kind ?? fallback.kind, measure },
        guessedGroup: !group,
        guessedKind: !kind,
      };
    }
    exercises.push(res);
    indexOfName.set(key, exercises.length - 1);
    return exercises.length - 1;
  };

  for (const e of plan.exercises) add(e);

  const dropped: string[] = [];
  const routines: ResolvedRoutine[] = plan.routines.map((r) => ({
    name: r.name,
    duplicate: routineNames.some((n) => norm(n) === norm(r.name)),
    items: r.items.flatMap((it): ResolvedItem[] => {
      const key = norm(it.exercise);
      // A routine may name an exercise the block never declared — if this
      // phone already has it that is fine and common (the prompt asked for
      // reuse); if it doesn't, there is nothing to create it from.
      const known = indexOfName.has(key) || byName.has(key);
      if (!known) {
        dropped.push(it.exercise);
        return [];
      }
      const ref = indexOfName.get(key) ?? add({ name: it.exercise });
      // Clamped both ways at the seam: these numbers come off the wire, get
      // persisted into a routine, and `sessionFrom` sizes an array by `sets` —
      // a pasted 1e9 must become a bounded plan here, not a crash that recurs
      // on every start of the imported routine. The caps are generous for
      // every measure (reps carries seconds for a hold, kg carries km for a
      // run), just not absurd.
      return [
        {
          name: it.exercise,
          sets: Math.min(20, Math.max(1, Math.round(it.sets ?? 3))),
          reps: Math.min(1000, Math.max(1, Math.round(it.reps ?? 8))),
          kg: Math.min(2000, Math.max(0, it.kg ?? 0)),
          ref,
        },
      ];
    }),
  }));

  return { exercises, routines, dropped };
}

/** How many exercises this import would actually create. */
export const newCount = (p: ResolvedPlan) => p.exercises.filter((e) => !e.existingId).length;

/** The measure of a resolved entry, for previewing its numbers with units. */
export const resolvedMeasure = (
  e: ResolvedExercise,
  library: Exercise[]
): Measure => (e.existingId ? measureOf(library.find((x) => x.id === e.existingId)) : e.create!.measure);
