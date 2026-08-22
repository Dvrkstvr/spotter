/**
 * The coach's contract, from both ends.
 *
 * `buildPrompt` writes the request and `parsePlan` reads the reply, and
 * neither knows who is on the other side — which is exactly why this is worth
 * testing: the far end is a chat model that will phrase things however it
 * likes, and the only guarantee is the fenced block. Everything here is a
 * reply the app has to survive.
 *
 * `resolvePlan` is the other half of the seam: names in, ids out, and the
 * numbers clamped before they can reach a persisted routine.
 */
import { describe, expect, it } from 'vitest';
import { FENCE, parsePlan, resolvePlan } from './coach';
import type { Exercise } from './exercises';

/* ── fixtures ──────────────────────────────────────────────────────────── */

const ex = (id: string, name: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, name, group: 'Chest', kind: 'Barbell', last: 0, lastSets: [], ...extra,
});

const LIB: Exercise[] = [
  ex('bench', 'Bench Press', { names: { en: 'Bench Press', de: 'Bankdrücken' } }),
  ex('row', 'Barbell Row', { group: 'Back' }),
  ex('plank', 'Plank', { measure: 'time', group: 'Core' }),
];

const GROUPS = ['Chest', 'Back', 'Core', 'Other'];
const KINDS = ['Barbell', 'Dumbbell', 'Machine'];
const FALLBACK = { group: 'Other', kind: 'Machine' };

const resolve = (
  plan: Parameters<typeof resolvePlan>[0],
  routineNames: string[] = [],
) => resolvePlan(plan, LIB, GROUPS, KINDS, routineNames, FALLBACK);

const TICKS = '```';

/** A reply the way one actually arrives: prose, the block, then prose. */
const reply = (body: string, tag: string = FENCE) =>
  `Sure — here is a plan based on what you sent.\n\n${TICKS}${tag}\n${body}\n${TICKS}\n\nCopy this whole message, open Spotter and paste it.`;

const ROUTINE = { name: 'Push A', items: [{ exercise: 'Bench Press', sets: 4, reps: 8, kg: 60 }] };

const ok = (r: ReturnType<typeof parsePlan>) => {
  if (!r.ok) throw new Error(`expected a plan, got ${r.reason}`);
  return r.plan;
};

/* ── finding the plan in the prose ─────────────────────────────────────── */

describe('parsePlan — finding the block', () => {
  it('reads a tagged fence out of surrounding prose', () => {
    const plan = ok(parsePlan(reply(JSON.stringify({ routines: [ROUTINE] }))));
    expect(plan.routines).toHaveLength(1);
    expect(plan.routines[0].name).toBe('Push A');
  });

  it('accepts the tag in any case, and with trailing words on the fence line', () => {
    const text = `${TICKS}  SPOTTER json\n${JSON.stringify({ routines: [ROUTINE] })}\n${TICKS}`;
    expect(ok(parsePlan(text)).routines).toHaveLength(1);
  });

  it('falls back to an untagged fence, because models drop the tag', () => {
    const plan = ok(parsePlan(reply(JSON.stringify({ routines: [ROUTINE] }), 'json')));
    expect(plan.routines[0].items[0].exercise).toBe('Bench Press');
  });

  it('falls back again to a bare object in the prose', () => {
    const text = `Here it is: ${JSON.stringify({ routines: [ROUTINE] })} — good luck.`;
    expect(ok(parsePlan(text)).routines).toHaveLength(1);
  });

  it('keeps the whole nested object, not up to the first closing brace', () => {
    const body = JSON.stringify({
      exercises: [{ name: 'Face Pull', group: 'Back', equipment: 'Machine' }],
      routines: [ROUTINE],
    });
    const plan = ok(parsePlan(reply(body, 'json')));
    expect(plan.exercises).toHaveLength(1);
    expect(plan.routines).toHaveLength(1);
  });

  it('reports nothing found when there is no block at all', () => {
    expect(parsePlan('I cannot help with that.')).toEqual({ ok: false, reason: 'none' });
  });

  it('reports bad JSON separately from a bad shape', () => {
    expect(parsePlan(reply('{ "routines": [ }'))).toEqual({ ok: false, reason: 'json' });
  });

  it('reports a bad shape when the block parses but holds no plan', () => {
    expect(parsePlan(reply('[1, 2, 3]'))).toEqual({ ok: false, reason: 'shape' });
    expect(parsePlan(reply('{"notes":"do some squats"}'))).toEqual({ ok: false, reason: 'shape' });
  });

  it('survives a reply that is not a string at all', () => {
    expect(parsePlan(undefined as unknown as string).ok).toBe(false);
  });
});

/* ── what the block is allowed to contain ──────────────────────────────── */

describe('parsePlan — cleaning the plan', () => {
  it('drops the placeholder rows a model copies out of the template', () => {
    const body = JSON.stringify({
      exercises: [{ name: '…' }, { name: '...' }, { name: 'Face Pull' }],
      routines: [ROUTINE],
    });
    expect(ok(parsePlan(reply(body))).exercises.map((e) => e.name)).toEqual(['Face Pull']);
  });

  it('drops a routine with no usable items, and one with no name', () => {
    const body = JSON.stringify({
      routines: [
        { name: 'Empty', items: [] },
        { name: '', items: [{ exercise: 'Bench Press' }] },
        { name: 'Ghosts', items: [{ exercise: '…' }] },
        ROUTINE,
      ],
    });
    expect(ok(parsePlan(reply(body))).routines.map((r) => r.name)).toEqual(['Push A']);
  });

  it('takes an item named with `name` as well as `exercise`', () => {
    const body = JSON.stringify({ routines: [{ name: 'Push A', items: [{ name: 'Bench Press' }] }] });
    expect(ok(parsePlan(reply(body))).routines[0].items[0].exercise).toBe('Bench Press');
  });

  it('reads a comma decimal, because half the world writes 72,5', () => {
    const body = JSON.stringify({
      routines: [{ name: 'A', items: [{ exercise: 'Bench Press', kg: '72,5' }] }],
    });
    expect(ok(parsePlan(reply(body))).routines[0].items[0].kg).toBe(72.5);
  });

  it('refuses a non-finite number rather than passing Infinity along', () => {
    // JSON.parse turns 1e999 into Infinity, which would sail through every
    // downstream Math.max and land in a persisted routine.
    const body = '{"routines":[{"name":"A","items":[{"exercise":"Bench Press","sets":1e999,"reps":"nope"}]}]}';
    const item = ok(parsePlan(reply(body))).routines[0].items[0];
    expect(item.sets).toBeUndefined();
    expect(item.reps).toBeUndefined();
  });

  it('truncates a name rather than rejecting it', () => {
    const long = 'x'.repeat(500);
    const body = JSON.stringify({ exercises: [{ name: long }], routines: [ROUTINE] });
    expect(ok(parsePlan(reply(body))).exercises[0].name).toHaveLength(100);
  });

  it('caps how much one reply can ask for', () => {
    const body = JSON.stringify({
      exercises: Array.from({ length: 250 }, (_, i) => ({ name: `E${i}` })),
      routines: Array.from({ length: 60 }, (_, i) => ({
        name: `R${i}`,
        items: Array.from({ length: 60 }, () => ({ exercise: 'Bench Press' })),
      })),
    });
    const plan = ok(parsePlan(reply(body)));
    expect(plan.exercises).toHaveLength(200);
    expect(plan.routines).toHaveLength(50);
    expect(plan.routines[0].items).toHaveLength(50);
  });
});

/* ── names in, ids out ─────────────────────────────────────────────────── */

describe('resolvePlan — matching against the library', () => {
  it('matches an existing exercise instead of creating a second one', () => {
    const r = resolve({ exercises: [{ name: 'bench   press' }], routines: [] });
    expect(r.exercises[0].existingId).toBe('bench');
    expect(r.exercises[0].create).toBeUndefined();
  });

  it('matches on any language the exercise is named in', () => {
    // The prompt is German while half the library is still named in English.
    const r = resolve({ exercises: [{ name: 'Bankdrücken' }], routines: [] });
    expect(r.exercises[0].existingId).toBe('bench');
  });

  it('lets the first library entry win a shared name, deterministically', () => {
    const lib = [ex('a', 'Row'), ex('b', 'Row')];
    const r = resolvePlan({ exercises: [{ name: 'row' }], routines: [] }, lib, GROUPS, KINDS, [], FALLBACK);
    expect(r.exercises[0].existingId).toBe('a');
  });

  it('files an unknown group or equipment under the fallback, and says so', () => {
    const r = resolve({
      exercises: [{ name: 'Face Pull', group: 'Rotator Cuff', equipment: 'Resistance Band' }],
      routines: [],
    });
    expect(r.exercises[0].create).toEqual({ group: 'Other', kind: 'Machine', measure: 'load' });
    expect(r.exercises[0].guessedGroup).toBe(true);
    expect(r.exercises[0].guessedKind).toBe(true);
  });

  it('keeps a group and equipment it can resolve, case-insensitively', () => {
    const r = resolve({
      exercises: [{ name: 'Face Pull', group: 'back', equipment: 'machine' }],
      routines: [],
    });
    expect(r.exercises[0].create).toEqual({ group: 'Back', kind: 'Machine', measure: 'load' });
    expect(r.exercises[0].guessedGroup).toBe(false);
  });

  it('takes a measure it knows and falls back to load for one it does not', () => {
    // `measure` is an identifier in this app's data, not a word being
    // translated — a German reply carrying "gewicht" imports as nothing.
    const r = resolve({
      exercises: [
        { name: 'Wall Sit', measure: 'time' },
        { name: 'Kniebeuge', measure: 'gewicht' },
      ],
      routines: [],
    });
    expect(r.exercises[0].create?.measure).toBe('time');
    expect(r.exercises[1].create?.measure).toBe('load');
  });

  it('names a routine a duplicate when this phone already has the name', () => {
    const r = resolve({ exercises: [], routines: [ROUTINE] }, ['push a']);
    expect(r.routines[0].duplicate).toBe(true);
  });
});

describe('resolvePlan — routine items', () => {
  it('resolves an item the block never declared but the library already has', () => {
    const r = resolve({ exercises: [], routines: [ROUTINE] });
    expect(r.dropped).toEqual([]);
    expect(r.exercises).toHaveLength(1);
    expect(r.exercises[0].existingId).toBe('bench');
    expect(r.routines[0].items[0].ref).toBe(0);
  });

  it('drops an item naming something neither here nor in the block', () => {
    const r = resolve({
      exercises: [],
      routines: [{ name: 'Push A', items: [{ exercise: 'Zercher Squat' }, { exercise: 'Plank' }] }],
    });
    expect(r.dropped).toEqual(['Zercher Squat']);
    expect(r.routines[0].items.map((i) => i.name)).toEqual(['Plank']);
  });

  it('points two items at one exercise rather than resolving it twice', () => {
    const r = resolve({
      exercises: [{ name: 'Bench Press' }],
      routines: [{ name: 'A', items: [{ exercise: 'bench press' }, { exercise: 'BENCH PRESS' }] }],
    });
    expect(r.exercises).toHaveLength(1);
    expect(r.routines[0].items.map((i) => i.ref)).toEqual([0, 0]);
  });

  it("fills the AI's missing numbers with the app's own defaults", () => {
    const r = resolve({ exercises: [], routines: [{ name: 'A', items: [{ exercise: 'Plank' }] }] });
    expect(r.routines[0].items[0]).toMatchObject({ sets: 3, reps: 8, kg: 0 });
  });

  it('clamps the numbers at the seam, before they can reach a routine', () => {
    // `sessionFrom` sizes an array by `sets`: a pasted 1e9 has to become a
    // bounded plan here, not a crash on every start of the imported routine.
    const r = resolve({
      exercises: [],
      routines: [{
        name: 'A',
        items: [
          { exercise: 'Plank', sets: 1e9, reps: 1e9, kg: 1e9 },
          { exercise: 'Bench Press', sets: 0, reps: -5, kg: -20 },
        ],
      }],
    });
    expect(r.routines[0].items[0]).toMatchObject({ sets: 20, reps: 1000, kg: 2000 });
    expect(r.routines[0].items[1]).toMatchObject({ sets: 1, reps: 1, kg: 0 });
  });

  it('rounds sets and reps but leaves a half-kilo alone', () => {
    const r = resolve({
      exercises: [],
      routines: [{ name: 'A', items: [{ exercise: 'Plank', sets: 3.6, reps: 8.4, kg: 72.5 }] }],
    });
    expect(r.routines[0].items[0]).toMatchObject({ sets: 4, reps: 8, kg: 72.5 });
  });
});

/* ── the superset, across both halves of the seam ──────────────────────── */

describe('the superset field', () => {
  const pair = (items: unknown[]) =>
    parsePlan(reply(JSON.stringify({ routines: [{ name: 'A', items }] })));

  it('reads the literal the prompt asks for', () => {
    const plan = ok(pair([
      { exercise: 'Bench Press', with: 'next' },
      { exercise: 'Barbell Row' },
    ]));
    expect(plan.routines[0].items.map((i) => i.with)).toEqual(['next', undefined]);
  });

  it('takes a boolean, because that is what a model reaches for instead', () => {
    const plan = ok(pair([
      { exercise: 'Bench Press', with: true },
      { exercise: 'Barbell Row' },
    ]));
    expect(plan.routines[0].items[0].with).toBe('next');
  });

  it('ignores a value that means nothing here', () => {
    const plan = ok(pair([
      { exercise: 'Bench Press', with: 'Barbell Row' },
      { exercise: 'Barbell Row' },
    ]));
    expect(plan.routines[0].items[0].with).toBeUndefined();
  });

  it('clears a pair on the last row, which has nobody to be paired with', () => {
    const plan = ok(pair([{ exercise: 'Bench Press', with: 'next' }]));
    expect(plan.routines[0].items[0].with).toBeUndefined();
  });

  // The whole reason `keepPairs` exists: `with` is adjacency, so a filter that
  // drops a row hands the survivor whatever slid up into its place — a pair
  // between two exercises nobody joined, which nothing downstream could spot.
  it('breaks a pair whose other half was a placeholder row', () => {
    const plan = ok(pair([
      { exercise: 'Bench Press', with: 'next' },
      { exercise: '…' },
      { exercise: 'Plank' },
    ]));
    expect(plan.routines[0].items.map((i) => i.exercise)).toEqual([
      'Bench Press',
      'Plank',
    ]);
    expect(plan.routines[0].items[0].with).toBeUndefined();
  });

  it('carries a resolved pair through to the routine', () => {
    const r = resolve({
      exercises: [],
      routines: [{
        name: 'A',
        items: [{ exercise: 'Bench Press', with: 'next' }, { exercise: 'Barbell Row' }],
      }],
    });
    expect(r.routines[0].items.map((i) => i.with)).toEqual(['next', undefined]);
  });

  it('breaks a pair whose other half named an exercise that is not here', () => {
    const r = resolve({
      exercises: [],
      routines: [{
        name: 'A',
        items: [
          { exercise: 'Bench Press', with: 'next' },
          { exercise: 'Zercher Squat' },
          { exercise: 'Plank' },
        ],
      }],
    });
    expect(r.dropped).toEqual(['Zercher Squat']);
    expect(r.routines[0].items.map((i) => i.name)).toEqual(['Bench Press', 'Plank']);
    expect(r.routines[0].items[0].with).toBeUndefined();
  });

  it('clears a pair left trailing once the row after it was dropped', () => {
    const r = resolve({
      exercises: [],
      routines: [{
        name: 'A',
        items: [{ exercise: 'Bench Press', with: 'next' }, { exercise: 'Zercher Squat' }],
      }],
    });
    expect(r.routines[0].items).toHaveLength(1);
    expect(r.routines[0].items[0].with).toBeUndefined();
  });
});
