/**
 * What a set of an exercise actually works.
 *
 * Two things are under test and they fail in different ways. `contribOf` is
 * arithmetic over a stored map, and every bad reading it could take is silent:
 * a self-reference weighting the primary down, a `1e999` from a hostile peer,
 * a `0` that should have been absent. The **seeded table** is thirty-five rows
 * of hand-written judgement, where the realistic failure is a typo — `Tricep`,
 * `Glute`, a muscle filed against an exercise id that no longer exists — and a
 * key that names nothing simply vanishes from every count without complaint.
 *
 * So the table is checked against the two lists it has to agree with rather
 * than against itself, which is the only way a typo in it can be caught at all.
 */
import { describe, expect, it } from 'vitest';
import { contribOf, DEFAULT_GROUPS, EX, measureOf, type Exercise } from './exercises';

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'x',
  name: 'X',
  group: 'Chest',
  kind: 'Barbell',
  last: 0,
  lastSets: [],
  ...over,
});

describe('contribOf', () => {
  it('gives a deleted exercise nothing', () => {
    expect(contribOf(undefined)).toEqual({});
  });

  it('is the filing group alone when nothing else is named', () => {
    expect(contribOf(ex())).toEqual({ Chest: 1 });
    expect(contribOf(ex({ also: {} }))).toEqual({ Chest: 1 });
  });

  it('adds the secondaries and keeps the primary at 1', () => {
    expect(contribOf(ex({ also: { Triceps: 0.5, Shoulders: 0.5 } }))).toEqual({
      Chest: 1,
      Triceps: 0.5,
      Shoulders: 0.5,
    });
  });

  it('lets a set total more than 1, which is the whole point', () => {
    // A bench press is a *whole* chest set and *half* a triceps set — not a
    // pie sliced three ways. Normalised to 1 it would report the body as
    // half-trained against every published figure.
    const total = Object.values(contribOf(ex({ also: { Triceps: 0.5, Shoulders: 0.5 } }))).reduce(
      (a, b) => a + b,
      0
    );
    expect(total).toBe(2);
  });

  it('refuses to let a stale self-reference weight the primary down', () => {
    // What a refile leaves behind: filed under Chest, still naming Chest at a
    // half from when it was filed elsewhere.
    expect(contribOf(ex({ also: { Chest: 0.5, Triceps: 0.5 } }))).toEqual({
      Chest: 1,
      Triceps: 0.5,
    });
  });

  it('clamps above 1 and drops anything that is not a weight', () => {
    const c = contribOf(
      ex({
        also: {
          Triceps: 4,
          Shoulders: 1e999, // Infinity once parsed — the payload cap's own case
          Biceps: 0,
          Lats: -1,
          Traps: NaN,
          Core: 'a lot' as unknown as number,
        },
      })
    );
    expect(c).toEqual({ Chest: 1, Triceps: 1 });
  });
});

describe('the seeded contribution table', () => {
  const groups = new Set(DEFAULT_GROUPS.map((g) => g.key));
  const seeded = EX.filter((e) => e.also);

  it('is on the exercises it is meant to be on', () => {
    // Not a fixed list — that would be this table written twice. Enough of the
    // library to be doing its job, and well short of all of it, because a
    // library where most rows needed a map would be a library filed wrong.
    expect(seeded.length).toBeGreaterThan(30);
    expect(seeded.length).toBeLessThan(EX.length);
  });

  it('names only real muscle groups', () => {
    const strays = seeded.flatMap((e) =>
      Object.keys(e.also ?? {})
        .filter((g) => !groups.has(g))
        .map((g) => `${e.id} → ${g}`)
    );
    expect(strays).toEqual([]);
  });

  it('never names the group it is already filed under', () => {
    const dupes = seeded.filter((e) => e.also?.[e.group] !== undefined).map((e) => e.id);
    expect(dupes).toEqual([]);
  });

  it('weighs everything at a half or a whole, and nothing else', () => {
    // The editor offers a third step for the user's own exercises. The seeds
    // are the app making a claim, and only these two have evidence under them.
    const odd = seeded.flatMap((e) =>
      Object.entries(e.also ?? {})
        .filter(([, n]) => n !== 0.5 && n !== 1)
        .map(([g, n]) => `${e.id} → ${g} = ${n}`)
    );
    expect(odd).toEqual([]);
  });

  it('leaves cardio naming nothing', () => {
    // Excluded by measure long before this is read, so a figure here would be
    // dead — and a dead figure is how a refactor quietly files a Run under
    // Quads.
    const cardio = EX.filter((e) => ['distance', 'duration'].includes(measureOf(e)));
    expect(cardio.length).toBeGreaterThan(0);
    expect(cardio.filter((e) => e.also)).toEqual([]);
  });

  it('credits a bench press to the arms and shoulders it actually uses', () => {
    expect(contribOf(EX.find((e) => e.id === 'bench'))).toEqual({
      Chest: 1,
      Triceps: 0.5,
      Shoulders: 0.5,
    });
  });

  it('credits a deadlift to the posterior chain rather than to the back alone', () => {
    // The row the field exists for: filed under `LowerBack`, so without this
    // the heaviest lift in most diaries lands on one region whole.
    const c = contribOf(EX.find((e) => e.id === 'deadlift'));
    expect(c.LowerBack).toBe(1);
    expect(c.Glutes).toBe(1);
    expect(c.Hamstrings).toBe(1);
  });

  it('keeps a dip a chest exercise even though it is filed under Triceps', () => {
    const dip = EX.find((e) => e.id === 'dip');
    expect(dip?.group).toBe('Triceps');
    expect(contribOf(dip).Chest).toBe(1);
  });

  it('leaves an isolation movement naming nothing', () => {
    expect(contribOf(EX.find((e) => e.id === 'legext'))).toEqual({ Quads: 1 });
  });
});
