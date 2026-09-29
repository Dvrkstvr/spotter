/**
 * What a shared workout card says — decided here, drawn elsewhere.
 *
 * Pure like `stats.ts`: one logged session and the diary before it in,
 * finished strings out, with no store, no hooks and no colours. The drawing
 * (`components/share-card.tsx`) only lays these strings out; it never decides
 * what a switch hid or which language a line is in. That split is the point:
 * **Weights off is applied here**, so there is exactly one place a kilo could
 * leak onto a picture headed for a feed, and it has a test.
 *
 * The mockup is `design/share-workout-mockup.html`. Four decisions it argues
 * and this file keeps:
 *
 * - **It reads the diary and never writes to it.** A card is derived from a
 *   `HistoryEntry` and the entries before it; nothing new is stored about the
 *   session, which is also why there is no `STORAGE_VERSION` bump.
 * - **Notes never reach it.** `CardEntry` has no `marks` and no `note`, so a
 *   set's verdict or an exercise's words cannot be read here by construction —
 *   "shoulder, drop to 60" is diary, not a caption.
 * - **The best set is the set, not the estimate.** A best is judged by
 *   `e1rmOf` against every *earlier* session of the same exercise, but what is
 *   printed is `85 × 6`, a fact, and never the ±5% regression behind it. A
 *   first session of an exercise is not a best: nothing was beaten.
 * - **The figure paints today's sets, not a weekly rate.** Insights' ramp is a
 *   verdict against `BAND`, and one session supports no verdict — so the card
 *   has its own absolute steps (`SESSION_STEPS`) over the same contributions,
 *   and the same workout always paints the same body.
 */
import type { Slug } from 'react-native-body-highlighter';

import { bodyPaint } from './body-map';
import { dowOfISO, fromISO, shiftISO } from './date';
import { loggedLine, measureOf, type Exercise, type Measure } from './exercises';
import { countN, fmtDayLong, ordinal, type Lang, type Strings } from './i18n';
import { e1rmOf, funFact, groupDigits, trainingStats } from './stats';
import { isThemeName, type ThemeName } from '@/design/tokens';

/* ── what the sheet remembers ────────────────────────────────────────────── */

export type CardType = 'highlights' | 'log';
export type CardShape = 'story' | 'post';

/**
 * The card's own look. **Absent means follow the app** — so a phone that never
 * touched it gets a card that changes with the app, rather than a copy of the
 * app frozen on the day it first shared.
 */
export type CardLook = { lang?: Lang; mode?: 'dark' | 'light'; theme?: ThemeName };

/**
 * The persisted setting (`shareCard`). The partner's name is deliberately not
 * in it: that name belongs to somebody who didn't press Share, so the answer is
 * asked again every time rather than remembered.
 */
export type SharePrefs = {
  type: CardType;
  shape: CardShape;
  exercises: boolean;
  weights: boolean;
  body: boolean;
  look: CardLook;
};

export const DEFAULT_SHARE: SharePrefs = {
  type: 'highlights',
  // Calvin's call: story first. It is also the shape a chat and a status take.
  shape: 'story',
  exercises: true,
  weights: true,
  body: true,
  look: {},
};

const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);

/**
 * The stored setting, field by field. `PERSIST_SHAPE` only asks whether the key
 * is an object, and a stored object replaces the seeded one wholesale — so a
 * blob from before a field existed, or one that has been through a chat app,
 * has to survive every field being absent or wrong.
 */
export function prefsOf(raw: unknown): SharePrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const look = (o.look && typeof o.look === 'object' ? o.look : {}) as Record<string, unknown>;
  return {
    type: o.type === 'log' ? 'log' : 'highlights',
    shape: o.shape === 'post' ? 'post' : 'story',
    exercises: bool(o.exercises, DEFAULT_SHARE.exercises),
    weights: bool(o.weights, DEFAULT_SHARE.weights),
    body: bool(o.body, DEFAULT_SHARE.body),
    look: {
      ...(look.lang === 'en' || look.lang === 'de' ? { lang: look.lang } : {}),
      ...(look.mode === 'dark' || look.mode === 'light' ? { mode: look.mode } : {}),
      ...(isThemeName(look.theme) ? { theme: look.theme } : {}),
    },
  };
}

/* ── what a card is made from ────────────────────────────────────────────── */

/**
 * A logged session, structurally — every `HistoryEntry` is assignable. It
 * names only what a card may read: no `marks`, no `note`.
 */
export type CardEntry = {
  date: string;
  secs?: number;
  vol?: number;
  buddy?: string;
  list?: {
    ex: string;
    sets: string[];
    links?: boolean[];
    with?: 'next';
    measure?: Measure;
  }[];
};

/** One line of a set: the figure, and whether it is the session's new best. */
export type CardSet = { text: string; best: boolean };

export type CardExercise = {
  name: string;
  /** Highlights' right-hand figure: the top set, or `4 sets` with weights off. */
  top: string;
  /** Beat every earlier session of this exercise. */
  best: boolean;
  /** Log's lines: each chain is a working set followed by its drops. */
  chains: CardSet[][];
  /** Taken back to back with the next one — the superset bracket. */
  pairNext: boolean;
};

/**
 * One figure. A `count` names its own noun (`13 sets`), so a tile headed
 * *Sets* drops the unit where Log's stat line keeps it; a measure (`52 min`,
 * `8,420 kg`) keeps it everywhere.
 */
export type CardStat = { label: string; value: string; unit: string; count: boolean };

export type CardModel = {
  date: string;
  title: string;
  buddy: string | null;
  week: string;
  /** Highlights' tiles, and Log's stat line — one reading of the three figures. */
  stats: CardStat[];
  /** The headline best, for the line Highlights draws when its list is off. */
  best: { name: string; set: string | null } | null;
  exercises: CardExercise[];
  fact: string | null;
  heat: { slug: Slug; step: number }[];
  /**
   * The card's own words, in the card's language. The drawing reads these
   * rather than the app's dictionary, which may be the other language.
   */
  labels: { tag: string; bestLine: string; more: string; withBuddy: string };
};

export type CardInput = {
  history: readonly CardEntry[];
  /** Index of the session in `history` — the entries before it are "earlier". */
  at: number;
  ex: (id: string) => Exercise | undefined;
  /** An exercise's name in the card's language, plainly: no missing-translation cue. */
  nameOf: (id: string) => string;
  /** The session's name in the card's language, resolved by the caller. */
  title: string;
  /** The dictionary of the *card's* language, which may not be the app's. */
  L: Strings;
  lang: Lang;
  weights: boolean;
  buddy: boolean;
};

/* ── the figure ──────────────────────────────────────────────────────────── */

/**
 * Where a muscle's sets *in one session* turn to the next step of the ramp.
 * Absolute, never relative to the session's own biggest muscle: a relative
 * scale would paint every workout's top muscle white, and the same training
 * would stop earning the same picture.
 */
export const SESSION_STEPS = [2, 4, 6, 9] as const;

export const sessionStep = (sets: number): number => {
  if (!(sets > 0)) return 0;
  const i = SESSION_STEPS.findIndex((t) => sets < t);
  return i === -1 ? SESSION_STEPS.length + 1 : i + 1;
};

/* ── sets ────────────────────────────────────────────────────────────────── */

const halves = (raw: string) => {
  const [l = '', r = ''] = String(raw)
    .split('×')
    .map((x) => x.trim());
  return { l, r };
};
const numOf = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

/**
 * One set as the card prints it. A lift drops its unit, because the stat line
 * already says kilos and `80 kg × 8` eight times over is a column of `kg`;
 * everything else keeps the diary's own wording (`loggedLine`), because a run
 * and a plank have no header to borrow one from.
 *
 * **Weights off removes the left figure of anything weighed** — a lift's and a
 * hold's. `BW` stays: it says nothing about how much anyone lifted.
 */
export const setText = (raw: string, m: Measure, L: Strings, weights: boolean): string => {
  const { l, r } = halves(raw);
  if (m === 'load') {
    if (weights || l === 'BW') return `${l} × ${r}`;
    return `× ${r}`;
  }
  if (m === 'time' && !weights) return `${r} ${L.unitSec}`;
  return loggedLine(raw, m, L);
};

/**
 * The set an exercise is summed up by. A lift's is its best by estimate — 100
 * × 8 beats 110 × 3, the reading `keyLifts` uses — with reps breaking a tie,
 * which is what decides between bodyweight sets. Anything else is its longest.
 */
const topIndex = (sets: readonly string[], m: Measure): number => {
  let best = 0;
  let key = -Infinity;
  let tie = -Infinity;
  sets.forEach((s, j) => {
    const { l, r } = halves(s);
    const k = m === 'load' ? (e1rmOf(s) ?? -1) : m === 'distance' ? numOf(l) : numOf(r);
    const t = numOf(r);
    if (k > key || (k === key && t > tie)) {
      best = j;
      key = k;
      tie = t;
    }
  });
  return best;
};

/** The heaviest estimate among a lift's sets, or null when none estimates. */
const bestEstimate = (sets: readonly string[]): number | null => {
  let out: number | null = null;
  for (const s of sets) {
    const e = e1rmOf(s);
    if (e !== null && (out === null || e > out)) out = e;
  }
  return out;
};

const measureIn = (
  entry: { ex: string; measure?: Measure },
  ex: (id: string) => Exercise | undefined
): Measure => entry.measure ?? measureOf(ex(entry.ex));

/* ── the card ────────────────────────────────────────────────────────────── */

export function cardOf(i: CardInput): CardModel {
  const { history, at, ex, nameOf, L, lang, weights } = i;
  const entry = history[at];
  const list = entry.list ?? [];
  const earlier = history.slice(0, Math.max(0, at));

  // The best estimate each lift reached before today, over the whole diary.
  const before = new Map<string, number>();
  for (const h of earlier)
    for (const e of h.list ?? []) {
      if (measureIn(e, ex) !== 'load') continue;
      const est = bestEstimate(e.sets);
      if (est !== null) before.set(e.ex, Math.max(before.get(e.ex) ?? est, est));
    }

  let headline: { k: number; gain: number } | null = null;
  const exercises: CardExercise[] = list.map((e, k) => {
    const m = measureIn(e, ex);
    const top = topIndex(e.sets, m);
    const today = m === 'load' ? e1rmOf(e.sets[top] ?? '') : null;
    const prior = before.get(e.ex);
    // Whole kilos on both sides: the estimate is good to about ±5%, and a best
    // claimed on a decimal would be a regression's rounding error on a feed.
    const best =
      today !== null && today > 0 && prior !== undefined && Math.round(today) > Math.round(prior);
    if (best) {
      const gain = today - prior;
      if (!headline || gain > headline.gain) headline = { k, gain };
    }

    const chains: CardSet[][] = [];
    e.sets.forEach((raw, j) => {
      const line = { text: setText(raw, m, L, weights), best: best && j === top };
      if (e.links?.[j] && chains.length) chains[chains.length - 1].push(line);
      else chains.push([line]);
    });

    const weighed = m === 'load' || m === 'time';
    return {
      name: nameOf(e.ex),
      top:
        weighed && !weights
          ? countN(chains.length, L.setCountOne, L.setCount)
          : setText(e.sets[top] ?? '', m, L, weights),
      best,
      chains,
      // Adjacency, like the diary reads it: a trailing `with` joins nothing.
      pairNext: e.with === 'next' && k + 1 < list.length,
    };
  });

  const sets = exercises.reduce((n, e) => n + e.chains.length, 0);
  const vol = entry.vol ?? 0;
  const stats: CardStat[] = [];
  if (entry.secs)
    stats.push({
      label: L.time,
      value: String(Math.max(1, Math.round(entry.secs / 60))),
      unit: L.unitMin,
      count: false,
    });
  // The volume is the one figure made of nothing but kilos, so with weights off
  // its tile says how many exercises there were instead.
  if (weights && vol > 0)
    stats.push({
      label: L.volume,
      value: groupDigits(vol, L.thousandSep),
      unit: L.unitKg,
      count: false,
    });
  else
    stats.push({
      label: L.shareExercises,
      value: String(list.length),
      unit: list.length === 1 ? L.exCountOne : L.exCount,
      count: true,
    });
  stats.push({
    label: L.sets,
    value: String(sets),
    unit: sets === 1 ? L.setCountOne : L.setCount,
    count: true,
  });

  // A fun fact about volume is a volume — "5 family cars" is 7,500 kg in a
  // costume — so weights off leaves only a distance to compare.
  let km = 0;
  for (const e of list)
    if (measureIn(e, ex) === 'distance') for (const s of e.sets) km += numOf(halves(s).l);
  const f = funFact(weights ? vol : 0, km);
  const fact = f
    ? (f.kind === 'volume' ? L.statsFactVolume : L.statsFactDistance)
        .replace('{kg}', groupDigits(vol, L.thousandSep))
        .replace('{km}', groupDigits(km, L.thousandSep))
        .replace('{thing}', L[f.key].replace('{n}', String(f.n)))
    : null;

  // Monday-anchored, like every week in the app, and counted up to this
  // session rather than to today: a card shared on Friday about Tuesday says
  // what Tuesday was.
  const monday = shiftISO(entry.date, -dowOfISO(entry.date));
  const nth = history
    .slice(0, at + 1)
    .filter((h) => h.date >= monday && h.date <= entry.date).length;

  const muscles = trainingStats([entry], ex, null, fromISO(entry.date)).balance.flatMap(
    (r) => r.muscles
  );

  const h = headline as { k: number; gain: number } | null;
  return {
    date: fmtDayLong(lang, fromISO(entry.date)),
    title: i.title,
    buddy: i.buddy && entry.buddy ? entry.buddy : null,
    week: L.cardWeek.replace('{n}', ordinal(lang, Math.max(1, nth))),
    stats,
    best: h
      ? {
          name: exercises[h.k].name,
          set: weights ? exercises[h.k].top : null,
        }
      : null,
    exercises,
    fact,
    // `trainingStats` over the one session dated to its own day spans a single
    // week, so its per-week rate *is* the session's fractional sets per muscle.
    heat: bodyPaint(muscles).map((p) => ({ slug: p.slug, step: sessionStep(p.perWeek) })),
    labels: { tag: L.cardBest, bestLine: L.cardBestLine, more: L.cardMore, withBuddy: L.withBuddy },
  };
}

/**
 * `2026-09-29-push-a.png` — what the file is called in the share sheet's
 * preview and in whatever it lands in. Date first, like a backup, and the
 * session's name folded to plain ASCII: a chat app's file table is no place to
 * find out whether it copes with `ü`.
 */
export const cardFileName = (date: string, title: string) => {
  const slug = title
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `${date}${slug ? `-${slug}` : ''}.png`;
};
