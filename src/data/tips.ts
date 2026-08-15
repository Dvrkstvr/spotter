/**
 * The tips — one short hint per thing a screen cannot show about itself.
 *
 * The problem they answer: half of what this app can do is invisible. A kg
 * cell is a text field that is also a slider; a set number is a button; the
 * bottom CTA sometimes has to be *held*; the "3 / 5" chip is the door to the
 * whole workout. The welcome tour already says four of these — and it says
 * them at minute zero, before the user has ever opened a session, on a screen
 * they see once. A tip says the same thing in the place it applies, the first
 * time they are standing in front of it, and then goes away for good.
 *
 * The design mockup is `design/tutorial-mockup.html`, which stands in the same
 * relation to this feature that Workout Diary v2 does to the rest of the app.
 *
 * Pure, like `data/plan.ts` and `data/stats.ts`: durable counters in, one id
 * out. No store, no hooks, no colours and no strings — a tip's words live in
 * `i18n.ts` like every other user-facing line, and its anchor lives at the
 * site that draws it. The rules that could not live at a site are the ones
 * here: which tip wins when two are armed, and when a tip has had its say.
 *
 * Three things about the model are load-bearing:
 *
 * - **A tip is armed by the surface, not by this module.** The call site knows
 *   whether the fields are empty, whether a rest is running, whether the CTA
 *   is dashed; encoding that here would mean a second copy of every screen's
 *   state, kept in step by hand. So a screen offers the ids it *could* show
 *   and `pickTip` answers with the one it *should*.
 * - **Doing the thing is the dismissal.** `done` is written from the gesture
 *   itself — a drag that steps a figure retires `drag` — not from a button.
 *   The × is for "I know this already" and lands in the same place.
 * - **Three showings and then never.** A tip being ignored is furniture, and
 *   furniture is what the session screen is trying hardest not to become.
 *   `seen` only counts a showing that lasted (see `DWELL_MS` in `<Tip>`).
 */

/**
 * Every tip in the app. Deliberately a closed list: the admission test is
 * *"could a careful person use this for a month and never find it?"*, and if
 * the answer is yes for something not here, the honest fix is usually the
 * control rather than a hint about it.
 *
 * What that test kept out is as much of the design as what it let in — there
 * is no tip for Start, for Add exercise or for anything else that already
 * carries a label. `+ Add exercise` is only unfindable while the overview
 * sheet is, which is why `chip` is a tip and adding an exercise is not.
 */
export type TipId =
  /** hold a number cell, then drag it */
  | 'drag'
  /** the tick box is the whole button */
  | 'tick'
  /** last time's figures are tappable */
  | 'ghost'
  /** the rest started itself, and can be cut short */
  | 'rest'
  /** the set number opens a verdict */
  | 'mark'
  /** swipe between exercises */
  | 'swipe'
  /** the whole workout is behind the position chip */
  | 'chip'
  /** a dashed control wants a hold */
  | 'hold'
  /** the week strip's days are tappable */
  | 'strip'
  /** search matches muscle groups, not just names */
  | 'search'
  /** the calendar *is* the plan */
  | 'plan'
  /** the statistics are read, never stored */
  | 'stats';

/**
 * How loudly a tip is drawn.
 *
 * `nudge` is the default and covers anything a sentence can teach. `demo` is
 * the same words plus the app performing the gesture on the real control —
 * reserved for `drag`, because words can teach a tap and cannot teach
 * hold-then-drag. `card` is for a whole surface's model rather than one
 * control, and is capped at the two screens that earn it: if a third seems to
 * need one, that screen has a problem a card will not fix.
 */
export type TipShape = 'nudge' | 'demo' | 'card';

/** What one tip has cost the user so far. */
export type TipState = { seen: number; done: boolean };

/** The durable slice: tip id → its counters. Absent means never shown. */
export type Tips = Record<string, TipState>;

/** Showings before a tip gives up on being read. */
export const MAX_SHOWS = 3;

/**
 * Priority, and therefore the order a first workout meets them in. Earlier
 * wins when two are armed at once — which happens constantly, since most of
 * the session's tips are armed by the same empty live row.
 *
 * The session's own run is ordered by how early the gesture is needed:
 * you type numbers before you tick them, you rest before you judge the set,
 * and you do all of that before you go looking for the exercise after this
 * one. `hold` is last of the session's because the CTA explains itself the
 * moment you press it — the tip only saves you the failed tap.
 */
export const TIP_ORDER: readonly TipId[] = [
  'drag',
  'tick',
  'rest',
  'ghost',
  'mark',
  'swipe',
  'chip',
  'hold',
  'strip',
  'search',
  'plan',
  'stats',
];

export const TIP_SHAPE: Record<TipId, TipShape> = {
  drag: 'demo',
  tick: 'nudge',
  ghost: 'nudge',
  rest: 'nudge',
  mark: 'nudge',
  swipe: 'nudge',
  chip: 'nudge',
  hold: 'nudge',
  strip: 'nudge',
  search: 'nudge',
  plan: 'card',
  stats: 'card',
};

/**
 * Whether a tip still has something to say.
 *
 * Written against a possibly-hand-edited blob on purpose: `PERSIST_SHAPE`
 * only asks whether `tips` is an object, so a row inside it may be anything at
 * all. A row that is not a `TipState` reads as a fresh tip rather than
 * throwing, which is the same forgiveness every other keyed durable takes.
 */
export const tipLive = (tips: Tips, id: TipId): boolean => {
  const st = tips[id] as Partial<TipState> | undefined;
  return !st?.done && (typeof st?.seen === 'number' ? st.seen : 0) < MAX_SHOWS;
};

/**
 * The one tip to draw, of the ones a surface says it could draw right now.
 *
 * Returns at most one, always — "never two on one screen" is structural here
 * rather than a rule each screen has to remember. A surface that wants the
 * pick to hold still while the user works is welcome to keep it in state; see
 * the session overlay, which picks once per visit so that a first workout
 * cannot become a slideshow.
 */
export const pickTip = (tips: Tips, armed: readonly TipId[]): TipId | null =>
  TIP_ORDER.find((id) => armed.includes(id) && tipLive(tips, id)) ?? null;

/** How many tips have finished with the user — the Settings row's numerator. */
export const tipsRetired = (tips: Tips): number =>
  TIP_ORDER.filter((id) => !tipLive(tips, id)).length;

/** How many there are to meet at all — the Settings row's denominator. */
export const TIP_COUNT = TIP_ORDER.length;
