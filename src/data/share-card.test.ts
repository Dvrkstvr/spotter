/**
 * The share card: the one picture this app hands to somebody else.
 *
 * Everything else the app computes stays on the phone, so a wrong number there
 * is a wrong number you see. A card leaves — to a feed, to a friend — and the
 * mistakes worth a test here are the ones you would notice only after it had
 * gone: a kilo left standing after you switched Weights off, a note about your
 * shoulder, a "best yet" claimed over nothing, an English label on a German
 * card. The fixtures are diaries, and each assertion is one of those.
 */
import { describe, expect, it } from 'vitest';

import { ellipsize, textWidth, wrapRuns } from './card-layout';
import { EX, type Exercise } from './exercises';
import { DICT } from './i18n';
import {
  cardFileName,
  cardOf,
  DEFAULT_SHARE,
  prefsOf,
  sessionStep,
  setText,
  type CardEntry,
  type CardInput,
} from './share-card';

/* ── fixtures ──────────────────────────────────────────────────────────── */

const LIB: Exercise[] = [
  ...EX,
  // A run, which the seeded library deliberately leaves out.
  {
    id: 'run',
    name: 'Run',
    group: 'Cardio',
    kind: 'Bodyweight',
    measure: 'distance',
    last: 0,
    lastSets: [],
  },
];
const ex = (id: string) => LIB.find((e) => e.id === id);
const nameEn = (id: string) => ex(id)?.names?.en ?? ex(id)?.name ?? id;
const nameDe = (id: string) => ex(id)?.names?.de ?? ex(id)?.name ?? id;

const input = (history: CardEntry[], at: number, over: Partial<CardInput> = {}): CardInput => ({
  history,
  at,
  ex,
  nameOf: nameEn,
  title: 'Push A',
  L: DICT.en,
  lang: 'en',
  weights: true,
  buddy: false,
  ...over,
});

/** Tuesday 29 September 2026. */
const push: CardEntry = {
  date: '2026-09-29',
  secs: 3134,
  vol: 8420,
  buddy: 'Mara',
  list: [
    {
      ex: 'bench',
      sets: ['80 × 8', '85 × 6', '85 × 6', '80 × 7', '60 × 10'],
      links: [false, false, false, false, true],
    },
    { ex: 'incline', sets: ['30 × 10', '30 × 10', '30 × 9'] },
    { ex: 'fly', sets: ['15 × 12', '15 × 12', '15 × 11'], with: 'next' },
    { ex: 'tri', sets: ['32 × 12', '32 × 12', '32 × 10'] },
  ],
};
const lastWeek: CardEntry = {
  date: '2026-09-22',
  vol: 7000,
  list: [{ ex: 'bench', sets: ['80 × 8', '80 × 7', '80 × 6'] }],
};

const words = (o: unknown) => JSON.stringify(o);

/* ── weights off ───────────────────────────────────────────────────────── */

describe('weights off', () => {
  it('drops the weight from a lift and keeps bodyweight, which weighs nothing', () => {
    expect(setText('85 × 6', 'load', DICT.en, false)).toBe('× 6');
    expect(setText('BW × 12', 'load', DICT.en, false)).toBe('BW × 12');
    expect(setText('10 × 45', 'time', DICT.en, false)).toBe('45 sec');
    expect(setText('5 × 30', 'distance', DICT.en, false)).toBe('5 km × 30 min');
  });

  it('leaves no kilo anywhere on the card — not the volume, not the cars, not the best', () => {
    const odd: CardEntry = {
      ...push,
      vol: 9137,
      list: [{ ex: 'bench', sets: ['88.5 × 6', '88.5 × 5'] }, ...push.list!.slice(1)],
    };
    const card = cardOf(input([lastWeek, odd], 1, { weights: false }));
    const all = words(card);
    expect(all).not.toContain('88.5');
    expect(all).not.toContain('9,137');
    expect(all).not.toContain(' kg');
    // The fun fact is a volume in a costume, so it goes too.
    expect(card.fact).toBeNull();
    expect(card.best).toEqual({ name: 'Bench Press', set: null });
    expect(card.stats.map((s) => s.label)).toEqual(['Time', 'Exercises', 'Sets']);
    expect(card.exercises[0].top).toBe('2 sets');
  });

  it('keeps a distance fact, which is not a weight', () => {
    const run: CardEntry = {
      date: '2026-09-29',
      list: [{ ex: 'run', sets: ['45 × 240', '45 × 240'] }],
    };
    const card = cardOf(input([run], 0, { weights: false }));
    expect(card.fact).toContain('marathons');
  });
});

/* ── notes ─────────────────────────────────────────────────────────────── */

describe('notes', () => {
  it('never reach the card, set verdicts and exercise words alike', () => {
    const noted = {
      ...push,
      list: push.list!.map((e, k) =>
        k === 0
          ? { ...e, marks: [{ mark: 'down', note: 'SHOULDER-SET-NOTE' }], note: 'SHOULDER-EX-NOTE' }
          : e
      ),
    } as CardEntry;
    const all = words(cardOf(input([noted], 0)));
    expect(all).not.toContain('SHOULDER');
  });
});

/* ── bests ─────────────────────────────────────────────────────────────── */

describe('best set', () => {
  it('is not claimed on a first session — nothing was beaten', () => {
    const card = cardOf(input([push], 0));
    expect(card.best).toBeNull();
    expect(card.exercises.some((e) => e.best)).toBe(false);
  });

  it('prints the set that beat every earlier session, not the estimate behind it', () => {
    const card = cardOf(input([lastWeek, push], 1));
    expect(card.best).toEqual({ name: 'Bench Press', set: '85 × 6' });
    const bench = card.exercises[0];
    expect(bench.best).toBe(true);
    // Exactly one line of the ledger carries it: the set itself, not its drop.
    expect(
      bench.chains
        .flat()
        .filter((s) => s.best)
        .map((s) => s.text)
    ).toEqual(['85 × 6']);
    // 85 × 6 estimates to 102; nothing on the card says so.
    expect(words(card)).not.toContain('102');
  });

  it('reads only what came before, never a later session', () => {
    const later: CardEntry = { date: '2026-10-06', list: [{ ex: 'bench', sets: ['120 × 5'] }] };
    const card = cardOf(input([lastWeek, push, later], 1));
    expect(card.best?.name).toBe('Bench Press');
  });

  it('is not claimed on a rounding error', () => {
    // 80 × 8 estimates to 101.3 and 80.1 × 8 to 101.5: heavier by a regression's
    // decimal, the same whole kilo, and not something to tell a feed.
    const a: CardEntry = { date: '2026-09-22', list: [{ ex: 'bench', sets: ['80 × 8'] }] };
    const b: CardEntry = { date: '2026-09-29', list: [{ ex: 'bench', sets: ['80.1 × 8'] }] };
    expect(cardOf(input([a, b], 1)).best).toBeNull();
  });
});

/* ── the ledger ────────────────────────────────────────────────────────── */

describe('the ledger', () => {
  it('folds a drop into the set it came off, and counts sets as chains', () => {
    const card = cardOf(input([push], 0));
    expect(card.exercises[0].chains.map((c) => c.map((s) => s.text))).toEqual([
      ['80 × 8'],
      ['85 × 6'],
      ['85 × 6'],
      ['80 × 7', '60 × 10'],
    ]);
    // 4 + 3 + 3 + 3: the drop is part of the fourth bench set, not a fifth.
    expect(card.stats.find((s) => s.label === 'Sets')?.value).toBe('13');
  });

  it('brackets a pair by adjacency, and a trailing `with` joins nothing', () => {
    const card = cardOf(input([push], 0));
    expect(card.exercises.map((e) => e.pairNext)).toEqual([false, false, true, false]);
    const dangling: CardEntry = {
      date: '2026-09-29',
      list: [{ ex: 'fly', sets: ['15 × 12'], with: 'next' }],
    };
    expect(cardOf(input([dangling], 0)).exercises[0].pairNext).toBe(false);
  });

  it('prints a lift without its unit and anything else with the diary’s own', () => {
    const mixed: CardEntry = {
      date: '2026-09-29',
      list: [
        { ex: 'bench', sets: ['80 × 8'] },
        { ex: 'plank', sets: ['BW × 60'] },
        { ex: 'run', sets: ['5 × 30'] },
      ],
    };
    const card = cardOf(input([mixed], 0));
    expect(card.exercises.map((e) => e.top)).toEqual(['80 × 8', 'BW × 60 sec', '5 km × 30 min']);
  });
});

/* ── the figure ────────────────────────────────────────────────────────── */

describe('the figure', () => {
  it('steps on a session’s own sets, absolutely', () => {
    expect([0, 0.5, 2, 3.9, 4, 6, 8.9, 9, 30].map(sessionStep)).toEqual([
      0, 1, 2, 2, 3, 4, 4, 5, 5,
    ]);
  });

  it('paints what the session trained and nothing it didn’t', () => {
    const heat = new Map(cardOf(input([push], 0)).heat.map((h) => [h.slug, h.step]));
    // Five bench rows, three incline and three fly are eleven whole chest sets.
    expect(heat.get('chest')).toBe(5);
    expect(heat.get('quadriceps')).toBe(0);
  });
});

/* ── language ──────────────────────────────────────────────────────────── */

describe('language', () => {
  it('counts the week Monday-anchored, up to this session', () => {
    const mon: CardEntry = { date: '2026-09-28', list: [{ ex: 'bench', sets: ['80 × 8'] }] };
    const sun: CardEntry = { date: '2026-09-27', list: [{ ex: 'bench', sets: ['80 × 8'] }] };
    expect(cardOf(input([sun, mon, push], 2)).week).toBe('2nd workout this week');
    expect(cardOf(input([sun, mon, push], 2, { L: DICT.de, lang: 'de' })).week).toBe(
      '2. Einheit diese Woche'
    );
  });

  it('writes a German card with no English label on it', () => {
    const card = cardOf(input([lastWeek, push], 1, { L: DICT.de, lang: 'de', nameOf: nameDe }));
    expect(card.date).toBe('Dienstag, 29. September');
    expect(card.stats.map((s) => `${s.label} ${s.value} ${s.unit}`)).toEqual([
      'Dauer 52 Min.',
      'Volumen 8.420 kg',
      'Sätze 13 Sätze',
    ]);
    expect(card.best?.name).toBe('Bankdrücken');
    expect(card.fact).toBe('8.420 kg bewegt — etwa 5 Autos.');
  });

  it('names the partner only when asked to', () => {
    expect(cardOf(input([push], 0)).buddy).toBeNull();
    expect(cardOf(input([push], 0, { buddy: true })).buddy).toBe('Mara');
  });
});

/* ── the stored setting ────────────────────────────────────────────────── */

describe('prefsOf', () => {
  it('survives a blob that is missing, empty or wrong', () => {
    expect(prefsOf(undefined)).toEqual(DEFAULT_SHARE);
    expect(prefsOf('nope')).toEqual(DEFAULT_SHARE);
    expect(
      prefsOf({ weights: 'no', shape: 'poster', look: { theme: 'neon', lang: 'fr' } })
    ).toEqual(DEFAULT_SHARE);
  });

  it('keeps what was chosen, field by field', () => {
    expect(
      prefsOf({
        type: 'log',
        shape: 'post',
        weights: false,
        look: { lang: 'de', mode: 'light', theme: 'ember' },
      })
    ).toEqual({
      ...DEFAULT_SHARE,
      type: 'log',
      shape: 'post',
      weights: false,
      look: { lang: 'de', mode: 'light', theme: 'ember' },
    });
  });
});

/* ── the file ──────────────────────────────────────────────────────────── */

describe('cardFileName', () => {
  it('folds the session name to plain ASCII after the date', () => {
    expect(cardFileName('2026-09-29', 'Push A')).toBe('2026-09-29-push-a.png');
    expect(cardFileName('2026-09-29', 'Rücken & Bizeps · Größe')).toBe(
      '2026-09-29-rucken-bizeps-grosse.png'
    );
    expect(cardFileName('2026-09-29', '💪')).toBe('2026-09-29.png');
  });
});

/* ── layout ────────────────────────────────────────────────────────────── */

describe('card layout', () => {
  it('measures a wide glyph wider than a narrow one', () => {
    expect(textWidth('WWWW', 12)).toBeGreaterThan(textWidth('iiii', 12) * 2);
  });

  it('never ellipsizes past the width it was given', () => {
    const name = 'Schrägbankdrücken mit Kurzhanteln';
    for (const max of [20, 60, 120, 200]) {
      const cut = ellipsize(name, 13.5, max, 'heading');
      expect(textWidth(cut, 13.5, 'heading')).toBeLessThanOrEqual(max);
    }
    expect(ellipsize(name, 13.5, 1000, 'heading')).toBe(name);
  });

  it('wraps between sets, never inside one', () => {
    const tokens = ['80 × 8', '85 × 6', '85 × 6', '80 × 7', '60 × 10'].map((text) => [{ text }]);
    const lines = wrapRuns(tokens, { text: ' · ' }, 12, 90);
    expect(lines.length).toBeGreaterThan(1);
    const flat = lines
      .flat()
      .map((r) => r.text)
      .filter((t) => t !== ' · ');
    expect(flat).toEqual(['80 × 8', '85 × 6', '85 × 6', '80 × 7', '60 × 10']);
    for (const line of lines) {
      const w = line.reduce((n, r) => n + textWidth(r.text, 12), 0);
      expect(w).toBeLessThanOrEqual(90);
    }
  });
});
