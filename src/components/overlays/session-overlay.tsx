/**
 * The live session — one exercise, the whole screen.
 *
 * Deviation from the design, decided after real gym use: the design stacks
 * every exercise as a collapsed card and expands the active one. That spends
 * the screen on what you already did and what you haven't reached yet, and
 * squeezes the two numbers you actually type into 15px cells. Here the focused
 * exercise owns the screen, the set you're on is a raised row with numbers you
 * can hit with a thumb, and the whole list moves into the overview sheet
 * behind the "3 / 5" chip — along with Add exercise, Discard and Finish, which
 * are once-a-session actions that were costing permanent screen space.
 *
 * One primary button sits at the bottom and always names what it will do:
 * Log set → Next exercise → Finish workout. While you type it lands directly
 * above the keys — the shell's KeyboardAvoidingView shrinks the overlay by
 * the keyboard's height (`softwareKeyboardLayoutMode: resize` used to do
 * this, until SDK 54's enforced edge-to-edge made it a no-op; see sheet.tsx).
 *
 * In a shared session the turn hint moves into the exercise itself, between
 * the name and its sets, with the take-turns/parallel chip beside it — the
 * thing you tap and the thing it changes in the same place. All of it
 * advisory: nothing here ever blocks input on what the other phone does (or
 * forgets) to tap.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleProp,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { HoldBtn } from '@/components/hold-btn';
import { DragList } from '@/components/drag-list';
import { CHECK_D, GripIcon, Icon, MARK_D } from '@/components/icon';
import { FullScreen, Sheet } from '@/components/sheet';
import { Tip } from '@/components/tip';
import type { Bid } from '@/data/buddy-sync';
import { FIRST_UPS } from '@/data/buddy-sync';
import { isSingle, MarkNote, Measure, measureOf, SET_MARKS, SetMark } from '@/data/exercises';
import {
  DragDemo,
  PX_PER_REP,
  PX_PER_STEP,
  useNumberDrag,
} from '@/components/num-drag';
import { buzz } from '@/data/haptics';
import { Strings } from '@/data/i18n';
import {
  chainsOf, liveIn, restEarned, roundOf, roundsOf, setNumberOf, stopAt, stopsOf,
} from '@/data/superset';
import { pickTip, tipLive, type TipId } from '@/data/tips';
import { useBackClose } from '@/hooks/use-back-close';
import { useBuddyLive } from '@/hooks/use-buddy-live';
import { themed, useColors, useThemed } from '@/design/theme';
import {
  color, fill as absFill, font, linger, motion, radius, slop, space, t, tracking, wash,
} from '@/design/tokens';
import { Btn, CardKicker, Field, H3, H4, Input, missingName, Seg, Tag } from '@/design/ui';
import {
  fmt, LoggedSet, markLabel, num, prevNums, restLeftOf, SessionExercise, useStore,
} from '@/store/workout-store';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** CHECK_D's path length in its 24×24 viewBox — the draw-on dash budget. */
const CHECK_LEN = 25;

/**
 * The refused tick's answer, in px per leg — each one `linger.shake` long.
 *
 * Out, back past centre, then twice more at a shrinking reach: the shape of a
 * head shaking, rather than of something that has been knocked and is
 * settling. `space[2]` is far enough to be unmissable beside the column next
 * to it and near enough that the row never looks like it is coming apart.
 */
const SHAKE = [1, -1, 0.6, -0.6, 0].map((n) => n * space[2]);

const mmss = (total: number) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

/**
 * What to head the two set-row columns with.
 *
 * Takes `L` rather than reading the dictionary itself: that keeps it a call
 * with a reactive argument, which is what stops the React Compiler hoisting it
 * out of the component and freezing the labels in whichever language loaded
 * first — the same rule `missingName(c)` follows for colours.
 */
const unitsFor = (m: Measure, L: Strings): { left: string; right: string; single: boolean } => {
  const single = isSingle(m);
  if (m === 'duration') return { left: '', right: L.unitMin, single };
  if (m === 'distance') return { left: L.unitKm, right: L.unitMin, single };
  return { left: L.unitKg, right: m === 'time' ? L.unitSec : L.reps, single };
};

/**
 * The "last time" ghost as it should read on this row.
 *
 * A single-field measure stores both halves anyway — "— × 90" — so the dash
 * has to be dropped here rather than at the point it was written, which is
 * what keeps one persistence format for every measure.
 */
const prevLabel = (prev: string, single: boolean) => {
  if (!single) return prev;
  const right = (prev || '').split('×')[1]?.trim();
  return right ? right : '—';
};

export function SessionOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const {
    s, L, patch, ex, gInfo, kInfo, exInfo, setup, mutSession, totals, finishSession, bidFirst,
    tipDone,
  } = useStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const buddyLive = useBuddyLive();
  const [overview, setOverview] = useState(false);
  // Which set has the mark sheet open. Both indexes, because a superset puts
  // two exercises on the screen and a bare row number would be ambiguous.
  const [markAt, setMarkAt] = useState<{ i: number; j: number } | null>(null);
  // A number being dragged owns the gesture; the list must not scroll under it.
  const [scrubbing, setScrubbing] = useState(false);
  // Whether the keyboard is up. Only the tips read it: someone typing has
  // already chosen, and interrupting to recommend the other way is the app
  // arguing with a decision it just watched being made.
  const [typing, setTyping] = useState(false);
  // Which tip this visit is carrying, if any — picked once, below.
  const [tip, setTip] = useState<TipId | null>(null);

  useEffect(() => {
    const up = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const down = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);

  // Gym phones lock constantly, and a lock kills the Nearby link — keep the
  // screen on while a session is open. Also just right for a logging screen.
  useKeepAwake();

  // Back tucks the workout behind the tabs and lands on Today — the same move
  // the buddy tap already makes, with a different destination. It is not an
  // exit: nothing is discarded, the clock keeps running, and Today's hero card
  // says so with the way back on it. Finish (held) is still the only way to
  // end a session, which is what makes a stray press cheap. The overview sheet
  // mounts later and so wins back first; that's the useBackClose contract.
  useBackClose(() => {
    patch({ sessionMin: true });
    router.navigate('/');
  });

  const session = s.session;

  /**
   * What is left of the wait, in seconds. Counted in `elapsed` ticks rather
   * than wall time, so it stays pure and re-renders for free — `elapsed` itself
   * is wall-anchored, so a minute spent with the screen locked still counts.
   * `restSeconds` of 0 is the setting turned off, and collapses this to a
   * constant 0.
   */
  const restLeft = restLeftOf(s);

  // `rest` is only ever a rest of your own (see the store), so this is the
  // whole of "a clock is running": a turn coming back is the buddy's business
  // and has no clock behind it.
  const restRunning = restLeft > 0;
  const wasResting = useRef(restRunning);
  useEffect(() => {
    // Only in the hand. A rest that ran out during a lock transitions on the
    // frame the screen comes back, and a buzz then would be about something
    // that finished ten minutes ago — <RestAlarm> is the channel that reaches
    // a pocket, and it already did.
    const inHand = AppState.currentState === 'active';
    if (wasResting.current && !restRunning && s.haptics && inHand) buzz.rest();
    wasResting.current = restRunning;
  }, [restRunning, s.haptics]);

  // The counter's 3px tick whenever another set lands. Hooks stay above the
  // early return; the effect just never fires without a session.
  const [tick] = useState(() => new Animated.Value(0));
  /** The clamped bounce for a swipe past either end — see the swipe responder. */
  const [endNudge] = useState(() => new Animated.Value(0));
  const doneCount = session ? totals().done : 0;
  const prevDoneCount = useRef(doneCount);
  useEffect(() => {
    if (prevDoneCount.current === doneCount) return;
    const rose = doneCount > prevDoneCount.current;
    prevDoneCount.current = doneCount;
    if (!rose) return;
    Animated.sequence([
      Animated.timing(tick, { toValue: -3, duration: linger.rise, easing: motion.tap.easing, useNativeDriver: true }),
      Animated.spring(tick, { toValue: 0, ...motion.payoff, useNativeDriver: true }),
    ]).start();
    if (s.haptics) buzz.set();
    // A set of yours just landed — that, not the buddy's turn, is what the
    // rest is measured from, so it starts the same way whether anyone else is
    // training with you. It runs to the end even once a buddy is done and the
    // turn has come back round, which is the whole point of resting.
    //
    // Unless something is queued to be taken straight after it, which is the
    // one sentence drop sets and supersets are both made of — see
    // `data/superset.ts`. Read off the *fresh* state inside the updater, since
    // the answer is about the row that is live now rather than the one that
    // just landed. A tick that earns nothing also ends whatever was running:
    // ticking the first half of a round mid-rest means that rest is over, and
    // leaving it counting down would draw a stale clock on the row you are
    // walking to.
    patch((st) => {
      if (!st.session) return null;
      const at = stopAt(st.session.list, Math.min(st.active, st.session.list.length - 1));
      if (at && !restEarned(st.session.list, at)) return st.rest ? { rest: null } : null;
      return st.restSeconds > 0 ? { rest: { at: st.elapsed, skipped: false } } : null;
    });
  }, [doneCount, tick, patch, s.haptics]);

  // The first wait of a shared exercise has no set behind it: the buddy simply
  // goes first (whoever the first-up policy hands the level score to — see
  // `leaderOf`). It holds the row on its own, below — deliberately without
  // stamping a rest, because there is no clock to run down. Doing so gave the
  // phone that isn't leading a three-minute countdown before either of them
  // had lifted anything, and the number was fiction: the wait ends when the
  // other phone ticks.
  const theirTurn = !!buddyLive?.turn && !buddyLive.mine;

  // Changing exercise deliberately does NOT clear a running rest any more: a
  // swipe forward to peek at what's next and a swipe straight back was
  // costing the whole countdown (and its scheduled notification) with no
  // feedback. A rest is about your body, not the machine you are standing at
  // — it draws on whatever set is next wherever you land, and "start now" is
  // still one tap if you disagree.

  // Everything from here down tolerates having no session, so that the tip
  // pick below it can be an effect — hooks cannot live under an early return,
  // and what a tip is armed by is the same state the screen is drawn from.
  const list = session?.list ?? [];
  const count = list.length;
  /**
   * One exercise per screen became one *stop* per screen: a lone exercise, or a
   * superset pair. `s.active` still means an exercise for everything that
   * writes it — the overview's jump, the buddy's offer, a fresh session — and
   * is snapped to its stop here, which is the whole cost of the change.
   */
  const stops = stopsOf(list);
  // A freeform session starts empty; everything below tolerates having no
  // exercise to show, which is the state the "add your first one" screen is.
  const stop = count ? stopAt(list, Math.min(s.active, count - 1)) : null;
  const i = stop ? stop.head : -1;
  const entry = stop ? list[i] : null;
  const meta = entry ? ex(entry.ex) : undefined;
  /** The pair's second half, when this stop is one. */
  const mateIdx = stop && stop.ids.length > 1 ? stop.ids[1] : -1;
  const mate = mateIdx >= 0 ? list[mateIdx] : null;
  const mateMeta = mate ? ex(mate.ex) : undefined;
  const paired = !!mate;

  const stopIdx = stop ? stops.findIndex((x) => x.head === stop.head) : -1;
  const stopCount = stops.length;

  const tot = totals();
  const progressPct = tot.all ? Math.round((tot.done / tot.all) * 100) : 0;

  const doneN = stop
    ? stop.ids.reduce((n, k) => n + list[k].sets.filter((x) => x.done).length, 0)
    : 0;
  const allN = stop ? stop.ids.reduce((n, k) => n + list[k].sets.length, 0) : 0;
  /**
   * The set you're on, as an exercise index and a row: exactly one across a
   * pair, and the halves alternate round by round — see `liveIn`.
   */
  const live = stop ? liveIn(list, stop) : null;
  const liveSet = live ? list[live.i].sets[live.j] : null;
  const sealed = !!stop && allN > 0 && !live;
  const isLast = stopIdx === stopCount - 1;
  /** Whether the bottom button is currently a held gesture — see the footer. */
  const ctaHeld = !!entry && (isLast ? tot.done < tot.all : !sealed);

  /* ── tips ──────────────────────────────────────────────────────────────
   *
   * Which hints this screen *could* show right now. The conditions live here
   * rather than in `data/tips.ts` because they are this screen's own state —
   * a copy of them over there would be a second reading of the session, kept
   * in step by hand. `pickTip` turns the list into at most one, by priority,
   * so "never two on one screen" is structural.
   *
   * The pick is then **held for the visit**: once a tip has been chosen it is
   * the only one this mounting of the session will ever show, so a first
   * workout cannot become a slideshow of eight hints. Minimising and coming
   * back is a new visit, which is the natural pace — one thing learned per
   * time you look at the screen.
   */
  const armed: TipId[] = [];
  if (entry) {
    if (liveSet) {
      armed.push('drag');
      const g = prevNums(liveSet.prev);
      // Filled fields and no tick is the moment the box is the answer; empty
      // fields with a ghost behind them is the moment the ghost is.
      if (liveSet.w || liveSet.reps) armed.push('tick');
      else if (g.w || g.r) armed.push('ghost');
    }
    // A rest with under a minute on it is about to answer the question itself.
    if (restRunning && restLeft > 60) armed.push('rest');
    // From the first tick, because that is both when the line it explains is
    // drawn and when there is a set to have an opinion about. It used to wait
    // for two, back when the only way in was the set number and there was
    // nothing on the glass to point at.
    if (doneN >= 1) armed.push('mark');
    if (stopCount > 1 && sealed) armed.push('swipe');
    if (stopCount > 1) armed.push('chip');
    if (ctaHeld) armed.push('hold');
  }
  /**
   * Nothing new is *offered* over an open keyboard or a running drag: someone
   * typing has already chosen, and recommending the other way mid-word is the
   * app arguing with a decision it just watched being made.
   *
   * The gate is on the pick rather than on the arming, and deliberately: a tip
   * already on screen stays there while the keyboard is up. Unmounting it and
   * bringing it back would be a second showing charged against a budget of
   * three, for a hint nobody looked away from.
   */
  const pick = typing || scrubbing ? null : pickTip(s.tips, armed);
  useEffect(() => {
    if (pick) setTip((cur) => cur ?? pick);
  }, [pick]);
  /** The visit's tip, while it is still live and its own moment still holds. */
  const showTip = tip && armed.includes(tip) && tipLive(s.tips, tip) ? tip : null;

  if (!session) return null;

  // Every way of reaching another exercise answers the swipe hint — the chip's
  // list is one of them, so finding the list the other way is just as good a
  // reason for the tip to stop asking.
  const go = (to: number) => {
    tipDone('swipe');
    patch({ active: Math.max(0, Math.min(to, count - 1)) });
  };
  /** Move a whole stop at a time — a pair is one screen, so it is one step. */
  const goStop = (d: number) => {
    const next = stops[stopIdx + d];
    if (next) go(next.head);
  };

  /**
   * Their rest, run down against this phone's clock — see `buddyRest`.
   * Deliberately not gated on whose turn it is: `buddyLive.rest` is already 0
   * unless you are both on the same exercise, and a buddy resting through a
   * turn of *yours* is exactly the wait this screen used to keep to itself.
   */
  const theirRestLeft = buddyLive?.rest ?? 0;

  /** What they're doing, when it's worth a line: resting, or mid-set. */
  const theirLine =
    theirRestLeft > 0
      ? L.theirRest.replace('{name}', s.buddy ?? '').replace('{t}', mmss(theirRestLeft))
      : theirTurn && buddyLive?.turn
        ? buddyLive.turn
        : null;

  /**
   * A set that isn't yours yet — dashed, unhighlighted, with whatever it is
   * you're waiting on written across it. Two things can hold it, and they are
   * not the same shape: your own rest, which runs a clock you may cut short,
   * and the buddy's set, which ends when they tick rather than when a timer
   * says so. That is the first set of a shared exercise on the phone that
   * isn't leading.
   *
   * Both are advisory and either alone is enough: the rest doesn't end because
   * they got quicker, and their turn doesn't end because your clock ran out.
   * `skipped` silences only the countdown it was a tap on — the buddy's turn is
   * a different fact, usually one that hadn't happened yet when you skipped, so
   * it still holds the row.
   *
   * **Every wait that is running is drawn, and each one says whose it is.**
   * Their remainder used to be drawn *in place of* your own countdown, on the
   * grounds that two descending numbers in one 12.5px line can't be told
   * apart. They can't — but the fix for that is to name them, not to hide one:
   * with your clock replaced by theirs the commonest question in a shared
   * session ("whose pause is that?") had no answer on the screen at all. So
   * yours is a line and theirs is a line under it, and while there are two of
   * them yours reads `myRest` rather than the bare `restLeftLabel` — the owner
   * is added exactly when there is somebody else to be told apart from.
   *
   * `held` is the separate question of whether the row is *yours* yet, and only
   * your own rest or their turn answers it. A buddy resting through a set of
   * yours is information, not a reason to dash the box you're about to lift
   * into.
   */
  const held = restRunning || theirTurn;
  const waiting =
    held || theirLine
      ? {
          held,
          mine: restRunning
            ? (theirLine ? L.myRest : L.restLeftLabel).replace('{t}', mmss(restLeft))
            : null,
          theirs: theirLine,
          // Your own clock is the only one anybody can jump, and now that it is
          // on the row whenever it runs, so is the way out of it. It cuts your
          // countdown short and nothing else: under a turn of theirs the row
          // stays held, which the line below says in their name.
          start: restRunning
            ? {
                label: L.startNow,
                onPress: () => {
                  tipDone('rest');
                  patch((st) => (st.rest ? { rest: { ...st.rest, skipped: true } } : null));
                },
              }
            : null,
        }
      : null;

  /**
   * The same slot, asking instead of telling: under the `ask` policy, while
   * you're level on the exercise and this phone hasn't answered. It takes the
   * row's place because it is the same question — what is happening before my
   * next set — and it answers rather than blocks: the fields and the tick keep
   * working underneath, the turn underneath is already decided by the coin,
   * and if neither of you ever taps, the coin is simply what stands.
   */
  const asking =
    buddyLive?.asking && entry
      ? {
          label: restRunning ? `${L.whosUp} · ${mmss(restLeft)}` : L.whosUp,
          mine: L.bidMine,
          theirs: L.bidTheirs,
          onBid: (b: Bid) => bidFirst(entry.ex, b),
        }
      : null;

  /**
   * Why this row has no countdown on it. Both halves of the same sentence —
   * something is queued to be taken straight after the set that just landed —
   * and it stands exactly where the clock would have been, so the eye that
   * went looking for one finds the reason instead.
   */
  const queued =
    liveSet?.link && live
      ? // The set it is a line *of* — `setNumberOf`, never the row index. With
        // an earlier drop anywhere above, counting rows names the wrong set.
        L.dropAfter.replace('{n}', String(setNumberOf(list[live.i].sets, live.j)))
      : paired && live && live.i === mateIdx && list[i].sets[live.j]?.done && meta
        ? L.noRestFrom.replace('{name}', exInfo(meta).text)
        : null;

  /** The visit's tip, as the node that draws under the live row. */
  const liveTip =
    showTip === 'drag' ? (
      <Tip id="drag" title={L.tipDrag} sub={L.tipDragSub} />
    ) : showTip === 'tick' ? (
      <Tip id="tick" title={L.tipTick} sub={L.tipTickSub} />
    ) : showTip === 'ghost' ? (
      <Tip id="ghost" title={L.tipGhost} sub={L.tipGhostSub} />
    ) : showTip === 'rest' ? (
      <Tip id="rest" title={L.tipRest} sub={L.tipRestSub} />
    ) : showTip === 'mark' ? (
      <Tip id="mark" title={L.tipMark} sub={L.tipMarkSub} />
    ) : null;

  /**
   * Which half carries Add set / Add drop. One row of them per stop, not per
   * exercise: four held buttons permanently on screen for one pair is exactly
   * the furniture this screen works hardest not to become. It follows the live
   * half, and falls back to the last one so a sealed pair can still be
   * extended.
   */
  const addUnder = paired && stop ? (live ? live.i : stop.ids[stop.ids.length - 1]) : i;

  // Horizontal drag moves between exercises. Nothing else on this screen
  // travels sideways, so the threshold can be generous without stealing the
  // vertical scroll or a tap into an input.
  //
  // A swipe past either end answers with a small clamped bounce: with no
  // visual affordance for the gesture, silence at the ends is
  // indistinguishable from the swipe not registering.
  const bounce = (dir: number) =>
    Animated.sequence([
      Animated.timing(endNudge, {
        toValue: dir * 14,
        duration: motion.tap.duration,
        easing: motion.tap.easing,
        useNativeDriver: true,
      }),
      Animated.timing(endNudge, { toValue: 0, ...motion.quick, useNativeDriver: true }),
    ]).start();
  const swipe = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      stopCount > 1 && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => {
      if (g.dx <= -50) {
        if (isLast) bounce(-1);
        else goStop(1);
      } else if (g.dx >= 50) {
        if (stopIdx <= 0) bounce(1);
        else goStop(-1);
      }
    },
  });

  return (
    <FullScreen zIndex={80}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            {/* The system's kicker, not a private near-copy of it. */}
            <CardKicker>{L.logging}</CardKicker>
            <H3 size={22} style={styles.title} numberOfLines={1}>
              {session.name}
            </H3>
          </View>
          <Animated.Text style={[styles.count, { transform: [{ translateY: tick }] }]}>
            {tot.done} {L.ofSets} {tot.all} {L.setsWord}
          </Animated.Text>
        </View>
        <View style={styles.progressRow}>
          <ProgressBar pct={progressPct} />
          {/* The whole list lives behind this chip — jump, add, discard, finish. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tipDone('chip');
              setOverview(true);
            }}
            style={styles.posChip}
          >
            <Text style={styles.posText}>
              {count ? stopIdx + 1 : 0} / {stopCount}
            </Text>
            <Text style={styles.posCaret}>▾</Text>
          </Pressable>
        </View>
        {/* Directly under what they point at — the chip, and the exercise the
            swipe leaves. In flow, so they scroll and shift with the header
            rather than needing to be re-anchored to it. */}
        {showTip === 'chip' && <Tip id="chip" title={L.tipChip} sub={L.tipChipSub} />}
        {showTip === 'swipe' && <Tip id="swipe" title={L.tipSwipe} sub={L.tipSwipeSub} />}
      </View>

      <Animated.View style={{ flex: 1, transform: [{ translateX: endNudge }] }}>
      <ExerciseSlide index={stopIdx}>
        <View style={styles.exercise} {...swipe.panHandlers}>
          {entry && meta ? (
            <>
              {/* A pair keeps one heading for the stop and moves the per-
                  exercise furniture — How-to, the kind/group line, the machine
                  setup — down into each half, where it belongs to the machine
                  you are standing at. The heading never moves; which half is
                  live is said by the half's own name going accent. */}
              <View style={styles.exHead}>
                <View style={styles.exNameRow}>
                  {paired && mateMeta ? (
                    <H3 size={19} style={styles.exName} numberOfLines={2}>
                      <Text style={exInfo(meta).missing ? missingName(c) : undefined}>
                        {exInfo(meta).text}
                      </Text>
                      <Text style={styles.pairPlus}> + </Text>
                      <Text style={exInfo(mateMeta).missing ? missingName(c) : undefined}>
                        {exInfo(mateMeta).text}
                      </Text>
                    </H3>
                  ) : (
                    <>
                      <H3 size={23} style={[styles.exName, exInfo(meta).missing && missingName(c)]}>
                        {exInfo(meta).text}
                      </H3>
                      <Btn
                        variant="secondary"
                        label={L.howTo}
                        labelStyle={styles.howToLabel}
                        style={styles.howToBtn}
                        onPress={() => patch({ instrOpen: meta.id })}
                      />
                    </>
                  )}
                </View>
                <View style={styles.exSubRow}>
                  <Text style={styles.exSub} numberOfLines={1}>
                    {paired && stop
                      ? L.supersetRound
                          .replace('{n}', String(Math.min(roundOf(list, stop) + 1, roundsOf(list, stop))))
                          .replace('{m}', String(roundsOf(list, stop)))
                      : `${kInfo(meta.kind).text} · ${gInfo(meta.group).text}`}
                  </Text>
                  <PopOnTrue
                    on={sealed}
                    style={[styles.exCount, { color: sealed ? c.accent400 : c.neutral600 }]}
                  >
                    {doneN}/{allN}
                  </PopOnTrue>
                </View>
                {!paired && setup(meta.id).length > 0 && (
                  <View style={styles.setupTags}>
                    {setup(meta.id).map((p, k) => (
                      <Tag
                        key={k}
                        tone="accent"
                        label={`${p[0]} ${p[1]}`}
                        textStyle={styles.setupTagText}
                      />
                    ))}
                  </View>
                )}
              </View>

              <BuddySlot
                onOpenProfile={() => {
                  patch({ sessionMin: true, buddyFocus: true });
                  router.navigate('/you');
                }}
              />

              <View style={styles.sealLane}>
                <SealSweep sealed={sealed} />
              </View>

              {/* `always`, not `handled`: with the keyboard up, `handled` has
                  the list grab any touch that isn't already a responder so it
                  can dismiss — and grabbing it means `setJSResponder` with the
                  native responder blocked, which gesture-handler answers by
                  cancelling every handler it owns. That would leave the number
                  cells' hold-and-drag working only while the keyboard is
                  down, which is precisely when you don't need it. What it
                  costs is tap-away-to-dismiss, so the cell carries its own
                  way out: a second tap on a focused cell blurs it. Enter on
                  reps still closes it too, by logging the set. */}
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={false}
                scrollEnabled={!scrubbing}
              >
                {paired && stop ? (
                  // Two ledgers, one hairline down the outside of both — the
                  // same grammar the chain uses between a set and its drop,
                  // one level up. Nothing else binds them: the live row is
                  // still the only accented thing on the screen.
                  <View style={styles.pairWrap}>
                    <View style={styles.pairRule} />
                    <View style={styles.pairBody}>
                      {stop.ids.map((k, half) => (
                        <View key={k} style={half > 0 ? styles.pairSecond : undefined}>
                          <Ledger
                            i={k}
                            entry={list[k]}
                            half
                            liveJ={live && live.i === k ? live.j : -1}
                            waiting={live && live.i === k ? waiting : null}
                            asking={live && live.i === k ? asking : null}
                            queued={live && live.i === k ? queued : null}
                            tip={live && live.i === k ? liveTip : null}
                            demo={!!live && live.i === k && showTip === 'drag'}
                            showAdd={k === addUnder}
                            onScrub={setScrubbing}
                            onMark={(j) => {
                              tipDone('mark');
                              setMarkAt({ i: k, j });
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Ledger
                    i={i}
                    entry={entry}
                    liveJ={live ? live.j : -1}
                    waiting={live ? waiting : null}
                    asking={live ? asking : null}
                    queued={live ? queued : null}
                    tip={live ? liveTip : null}
                    demo={!!live && showTip === 'drag'}
                    showAdd
                    onScrub={setScrubbing}
                    onMark={(j) => {
                      tipDone('mark');
                      setMarkAt({ i, j });
                    }}
                  />
                )}

                {/* Nothing left to draw the wait on: the whole stop is sealed
                    (or has no sets yet), so the set your rest is for lives on
                    another one. The clock still belongs on this screen, so the
                    lines stand on their own under the last row. The `ask` is
                    deliberately not repeated here — who takes the next set of
                    an exercise you have finished is not your question. */}
                {!live && waiting ? (
                  <View style={styles.waitLoose}>
                    <WaitLines waiting={waiting} asking={null} />
                  </View>
                ) : null}
              </ScrollView>
            </>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{L.emptySessionNote}</Text>
            </View>
          )}
        </View>
      </ExerciseSlide>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: 10 + insets.bottom }]}>
        {showTip === 'hold' && (
          <Tip id="hold" title={L.tipHold} sub={L.tipHoldSub} style={styles.footerTip} />
        )}
        {/* The exercise just sealed and this is where you're going next — the
            pop is the nudge, since the button itself doesn't change. */}
        <PopOnFlip on={sealed}>
          {!entry ? (
            <Btn
              variant="primary"
              block
              label={L.addExerciseBtn}
              style={styles.cta}
              labelStyle={styles.ctaLabel}
              onPress={() => patch({ picker: 'session' })}
            />
          ) : !isLast ? (
            // Leaving an exercise with sets still open is a held gesture, and
            // the dashed outline says so before you press: solid means this
            // machine is done with you and moving on is a tap.
            <HoldBtn
              variant="primary"
              hold={!sealed}
              dashed={!sealed}
              label={sealed ? `${L.nextExercise} ›` : L.holdNext}
              onConfirm={() => {
                // A hold that completed is the tip's whole lesson. Only from
                // the held variant: a tap on the solid one proves nothing.
                if (!sealed) tipDone('hold');
                goStop(1);
              }}
              style={styles.cta}
              labelStyle={styles.ctaLabel}
            />
          ) : (
            // Finishing with sets still open anywhere stays a held gesture —
            // same slot, same rule, so it wears the same dashes.
            <HoldBtn
              variant="primary"
              hold={tot.done < tot.all}
              dashed={tot.done < tot.all}
              label={tot.done < tot.all ? L.holdFinish : L.finishWorkout}
              onConfirm={finishSession}
              style={styles.cta}
              labelStyle={styles.ctaLabel}
            />
          )}
        </PopOnFlip>
        {/* The way out, said before the press rather than after it.
            `finishSession` writes no history entry when nothing was ticked —
            that is what Discard used to be for — but nobody hunting for a way
            to cancel a workout they started by mistake is going to try a
            button labelled Finish. Deliberately not a tip: a tip teaches
            something invisible three times and then gives up, where this is a
            permanent statement of what the button will do, shown exactly
            while it is true. It is `savedEmpty` in the other tense. */}
        {isLast && tot.done === 0 && <Text style={styles.ctaHint}>{L.finishLogsNothing}</Text>}
      </View>

      {overview && <Overview onClose={() => setOverview(false)} onJump={go} />}

      {/* Guarded on the index still being there: Add set can't shrink the list,
          but the buddy's copy of a routine can, and a sheet opened over a set
          that no longer exists would be a sheet with nothing behind it. */}
      {markAt && list[markAt.i] && markAt.j < list[markAt.i].sets.length && (
        <MarkSheet
          n={setNumberOf(list[markAt.i].sets, markAt.j)}
          isDrop={!!list[markAt.i].sets[markAt.j].link}
          after={setNumberOf(list[markAt.i].sets, markAt.j - 1)}
          removeLabel={removeSetLabel(list[markAt.i].sets, markAt.j, L)}
          set={list[markAt.i].sets[markAt.j]}
          exName={(() => {
            const m = ex(list[markAt.i].ex);
            return m ? exInfo(m).text : list[markAt.i].ex;
          })()}
          onClose={() => setMarkAt(null)}
          onPick={(m) =>
            mutSession(markAt.i, (e) => {
              const cur = e.sets[markAt.j];
              // Tapping the mark you already carry takes it back off, and the
              // words go with it: a note nothing points at would never be
              // shown again, and half-erased is worse than erased.
              cur.mark = m ?? undefined;
              if (!m) cur.note = undefined;
            })
          }
          onNote={(v) =>
            mutSession(markAt.i, (e) => {
              const cur = e.sets[markAt.j];
              cur.note = v;
              // Words imply a mark, and emptying them takes back the one they
              // implied — so you can open this sheet and just type, and the
              // row still ends up with exactly one state to draw.
              if (v.trim() && !cur.mark) cur.mark = 'note';
              else if (!v.trim() && cur.mark === 'note') cur.mark = undefined;
            })
          }
          // Set 1 has nothing above it to continue, so the switch is absent
          // rather than shown disabled — and it is the only way to take a
          // drop's link back off again.
          onLink={
            markAt.j > 0
              ? (on) =>
                  mutSession(markAt.i, (e) => {
                    if (on) e.sets[markAt.j].link = true;
                    else delete e.sets[markAt.j].link;
                  })
              : undefined
          }
          /* The undo for a set that isn't going to happen — a routine that
             asked for more than today has in it, or a drop added by mistake.
             Two rules, and `removeRows` is the one reading of both:

             *Unticked only*, which is `removeSessionEx`'s rule one scope down:
             a set that was lifted is a fact, and facts don't leave through a
             held button. Untick it first and it stops being one. Taking a
             *set* means every line of it, so the test is over the whole chain —
             a drop you already logged protects the set it hangs from.

             *Never the last set*, because an exercise with no sets at all is a
             state nothing draws; that case is the overview's ×. Counted in
             chains like everything else here, so an exercise of one set and
             its drop still refuses. */
          onRemove={
            removeRows(list[markAt.i].sets, markAt.j)
              ? () => {
                  const rows = removeRows(list[markAt.i].sets, markAt.j)!;
                  setMarkAt(null);
                  // Back to front, or each splice moves the indexes under the
                  // ones still to go.
                  mutSession(markAt.i, (e) => {
                    for (const j of [...rows].reverse()) e.sets.splice(j, 1);
                  });
                }
              : undefined
          }
        />
      )}
    </FullScreen>
  );
}

/* ── one exercise's ledger ───────────────────────────────────────────────── */

/**
 * Which rows a held remove would actually take, or null when it may not run.
 *
 * Removing a **drop** takes that line. Removing a **set** takes the set — the
 * row and every drop hanging off it — because a drop is a line of that set and
 * there is nothing for it to be a line of afterwards. Promoting the first drop
 * to be the set instead was the alternative and it quietly rewrites what you
 * lifted: your 65 × 6 becomes a 50 × 8 you never programmed.
 *
 * Null means the control is absent rather than shown dead, and it is null in
 * two cases: anything in the chain has been ticked (a lifted set is a fact, and
 * unticking first is what makes removing it a two-step decision), or this is
 * the exercise's last set (an exercise with no sets is a state nothing draws —
 * that one is the overview sheet's ×).
 *
 * One reading, because the label above the button has to describe exactly what
 * the button does; two would be two chances for the warning to be wrong.
 */
const removeRows = (sets: LoggedSet[], j: number): number[] | null => {
  const chains = chainsOf(sets);
  const c = chains.find((x) => x.ids.includes(j));
  if (!c) return null;
  const rows = j === c.head ? c.ids : [j];
  if (rows.some((k) => sets[k].done)) return null;
  if (j === c.head && chains.length < 2) return null;
  return rows;
};

/** What that remove is about to take, said before the hold rather than after. */
const removeSetLabel = (sets: LoggedSet[], j: number, L: Strings) => {
  const rows = removeRows(sets, j);
  const drops = rows ? rows.length - 1 : 0;
  if (drops === 1) return L.holdRemoveSetDrops;
  if (drops > 1) return L.holdRemoveSetDropsN.replace('{n}', String(drops));
  return L.holdRemoveSet;
};

/**
 * **A logged set whose reps reach zero stops being logged.** Written on the
 * draft, after whatever just changed the cell.
 *
 * The tick refuses to write a row with nothing in the right-hand cell; a row
 * that is *already* ticked can be emptied down to the same nothing afterwards,
 * and the two have to answer alike or the rule only ever held for sets you
 * had not lifted yet. So the tick comes off rather than the edit being
 * blocked — blocking cannot be done kindly, because the cell is a text field
 * and an empty string is the first keystroke of every retype: refusing it
 * would mean never being able to clear a 12 to make it an 8. And it is the
 * gentler answer besides, since the way back is the tap it always was.
 *
 * One reading of it, because there are three doors into that cell — typing,
 * dragging, and copying the ghost onto the row — and a rule kept at two of
 * them is a rule for two of them.
 */
const keepLogged = (cur: LoggedSet) => {
  if (cur.done && !num(cur.reps, 0)) cur.done = false;
};

/**
 * The column header, the rows, and the two held buttons under them — for one
 * exercise, drawn once on an ordinary screen and twice inside a superset.
 *
 * It owns everything that is genuinely per-exercise, and the measure is why:
 * `unitsFor` decides the column labels and whether the row has one field or
 * two, so a pair of a plank and a run has to be able to head its two halves
 * differently. `half` adds the name, kind/group and machine setup that a lone
 * exercise keeps up in the screen's own heading.
 */
function Ledger({
  i,
  entry,
  half,
  liveJ,
  waiting,
  asking,
  queued,
  tip,
  demo,
  showAdd,
  onScrub,
  onMark,
}: {
  /** index into `session.list` — every write here goes through it */
  i: number;
  entry: SessionExercise;
  /** one half of a superset: draw its own name block above the ledger */
  half?: boolean;
  /** the live row in *this* exercise, or -1 when the live row is elsewhere */
  liveJ: number;
  waiting: Waiting | null;
  asking: Asking | null;
  queued?: string | null;
  tip?: ReactNode;
  demo?: boolean;
  showAdd?: boolean;
  onScrub: (on: boolean) => void;
  onMark: (j: number) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, exInfo, gInfo, kInfo, setup, mutSession, tipDone } = useStore();
  const meta = ex(entry.ex);
  const units = unitsFor(measureOf(meta), L);

  /**
   * Where a drop would go: immediately after the set you just lifted, which is
   * the row above the live one — or the end of the ledger once the exercise is
   * sealed, since then the last set *is* the one you just lifted.
   *
   * 0 means there is nothing above to drop from, which is a fresh exercise with
   * nothing ticked. The button is absent there rather than shown dead: a drop
   * off a set that hasn't happened is not a thing to offer.
   */
  const dropAt = liveJ >= 0 ? liveJ : entry.sets.length;

  /**
   * The last tick this ledger turned down, as a row and a count.
   *
   * A count rather than a flag, because the likeliest way this is ever met is
   * twice running — you tap, nothing logs, you tap again — and a flag that is
   * already set has nothing to say the second time.
   */
  const [refused, setRefused] = useState({ j: -1, n: 0 });

  /**
   * Say no where the no is about.
   *
   * The reps cell is the only thing that could have been wrong: the left one
   * is allowed to end up empty, which is how bodyweight and an unrecorded
   * distance are written. So the answer is drawn on that one cell and nowhere
   * else, and it is drawn rather than written — a line of copy under the row
   * would outlive the moment it explains and settle into furniture, on the
   * screen working hardest not to have any. It shakes, it goes `warn`, and a
   * third of a second later the row is exactly as it was.
   */
  const refuse = (j: number) => {
    if (s.haptics) buzz.refused();
    setRefused((r) => ({ j, n: r.n + 1 }));
  };

  /**
   * Tick a set, filling whatever is still empty from last time.
   *
   * **The two fields are filled one at a time.** Testing them as a pair was
   * enough while every row had a ghost behind it, and a drop is the row that
   * has none: it arrives carrying the weight of the set it came off, so the
   * pair-wise test saw a filled cell and let the row through with the right
   * one still empty — logging `65 × 0`, which is exactly the record this
   * refuses everywhere else.
   *
   * The right-hand figure is what makes a set a set — reps, the seconds of a
   * hold, the minutes of a run — so with nothing typed there and nothing to
   * copy, the tick is refused. The left one may legitimately end up empty:
   * that is how bodyweight and an unrecorded distance are written.
   *
   * This is the one reading of what a tick may record; the box and Enter on
   * the reps field both come through here.
   *
   * **The test is made out here rather than inside the updater**, which is
   * where it used to sit. A `patch` updater is pure and its early return is
   * silent, so a refused tick was a tap that did nothing at all — on the one
   * screen where doing nothing is indistinguishable from a missed tap. Out
   * here the refusal has somewhere to go: `refuse` shakes the cell that has
   * to be filled, which is the only thing that could have been wrong.
   */
  const logSet = (j: number) => {
    const cur = entry.sets[j];
    const g = prevNums(cur.prev);
    const w = cur.w || g.w;
    const reps = cur.reps || g.r;
    // Nothing to record and nothing to copy: refuse, rather than write the
    // "× 0" that would haunt next session as the last-time ghost.
    if (!num(reps, 0)) return refuse(j);
    // Only now — the gesture is taught by having worked, and a tap the app
    // turned down teaches nothing.
    tipDone('tick');
    mutSession(i, (e) => {
      e.sets[j].w = w;
      e.sets[j].reps = reps;
      e.sets[j].done = true;
    });
  };

  return (
    <View>
      {half && meta && (
        <View style={styles.halfHead}>
          <View style={styles.exNameRow}>
            <Text
              style={[
                styles.halfName,
                liveJ >= 0 && styles.halfNameLive,
                exInfo(meta).missing && missingName(c),
              ]}
              numberOfLines={1}
            >
              {exInfo(meta).text}
            </Text>
            <Btn
              variant="secondary"
              label={L.howTo}
              labelStyle={styles.howToLabel}
              style={styles.howToBtn}
              onPress={() => patch({ instrOpen: meta.id })}
            />
          </View>
          <Text style={styles.halfMeta} numberOfLines={1}>
            {kInfo(meta.kind).text} · {gInfo(meta.group).text}
          </Text>
          {setup(meta.id).length > 0 && (
            <View style={styles.setupTags}>
              {setup(meta.id).map((p, k) => (
                <Tag key={k} tone="accent" label={`${p[0]} ${p[1]}`} textStyle={styles.setupTagText} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Above the ledger, so it is read on the way in and scrolls away once
          you are working. */}
      <LastNotes id={entry.ex} />

      <View style={styles.colHead}>
        <Text style={[styles.colLabel, styles.colIndex]}>#</Text>
        <Text style={[styles.colLabel, styles.colPrev]}>{L.lastTime}</Text>
        {/* Usually only the labels change. `duration` is the one measure that
            drops a column outright — the remaining cell keeps flex:1 and
            simply takes the whole span. */}
        {!units.single && <Text style={[styles.colLabel, styles.colFlex]}>{units.left}</Text>}
        <Text style={[styles.colLabel, styles.colFlex]}>{units.right}</Text>
        <View style={styles.colCheck} />
      </View>

      {/* Sets, not rows. `chainsOf` is the one place the ledger is grouped,
          so the number a block carries, the tick it gets and the `n of m` in
          the summary can never disagree about what a set is. */}
      {chainsOf(entry.sets).map((chain, k) => (
        <SetStack
          key={chain.head}
          n={k + 1}
          lines={chain.ids.map((j) => ({ j, set: entry.sets[j] }))}
          liveJ={liveJ}
          single={units.single}
          units={units}
          waiting={chain.ids.includes(liveJ) ? waiting : null}
          asking={chain.ids.includes(liveJ) ? asking : null}
          queued={chain.ids.includes(liveJ) ? queued : null}
          // Every tip about a set draws under the live one, and the drag's
          // demo draws on its left-hand cell.
          demo={!!demo}
          tip={chain.ids.includes(liveJ) ? tip : null}
          onLog={logSet}
          onScrub={onScrub}
          // Opening the sheet is the whole of what the tip was for — it
          // teaches what the line does, not where it is — and what you then
          // decide about the set is your business. Every way in lands here:
          // the `+ Note` line, your own note line, and the index cell.
          onMark={onMark}
          onCopy={(j, w, r) => {
            tipDone('ghost');
            mutSession(i, (e) => {
              e.sets[j].w = w;
              e.sets[j].reps = r;
              // The third door, and the one nobody would go looking for: a
              // ghost with no figure in it, copied onto a set already ticked.
              keepLogged(e.sets[j]);
            });
          }}
          // The refused tick's answer, drawn on the line it is about.
          warn={refused}
          onW={(j, v) => mutSession(i, (e) => { e.sets[j].w = v; })}
          // Typing and dragging are two of `keepLogged`'s three doors — the
          // clamp at zero is the drag's own end of the same edit.
          onReps={(j, v) =>
            mutSession(i, (e) => {
              e.sets[j].reps = v;
              keepLogged(e.sets[j]);
            })
          }
          /* The block's one tick, and it moves one line at a time.
             Logging is `logSet`, which is also what Enter on the reps field
             runs — the box used to carry a second copy of the
             fill-from-last-time rule, and a second copy is how the two came to
             disagree about what an untouched drop may record.
             Unticking takes the *last* logged line back rather than the whole
             set: the commonest reason to untick a set you dropped is that the
             drop's figures are wrong, and clearing the working set with them
             would cost you a correct row to fix an incorrect one. Two taps
             down, two taps back up — the same gesture read both ways. */
          onToggle={() => {
            const open = chain.ids.find((j) => !entry.sets[j].done);
            if (open !== undefined) return logSet(open);
            tipDone('tick');
            const last = chain.ids[chain.ids.length - 1];
            mutSession(i, (e) => {
              e.sets[last].done = false;
            });
          }}
        />
      ))}

      {/* Held, not tapped: this row sits right under the last set, where a
          thumb reaching for the tick can find it. */}
      {showAdd && (
        <View style={styles.addRow}>
          <HoldBtn
            label={L.holdAddSet}
            onConfirm={() =>
              mutSession(i, (e) => {
                // The last *working* row, not the last row. A drop carries no
                // ghost by construction, so copying from one hands the new set
                // a blank where last week's figures should be — and with the
                // last set now the usual place to drop from, that is the
                // common case rather than the odd one.
                const last = [...e.sets].reverse().find((x) => !x.link) ?? e.sets[e.sets.length - 1];
                e.sets.push({
                  w: '',
                  reps: '',
                  done: false,
                  prev: last ? last.prev : '—',
                  // The ghost and its verdict travel together, here as
                  // everywhere else a row is built.
                  prevMark: last ? last.prevMark : null,
                });
              })
            }
            style={styles.addSet}
            labelStyle={styles.addSetLabel}
          />
          {/* A drop goes on **the set you just lifted**, which is the row above
              the live one — not the end of the ledger. You decide to drop
              having finished set 2 of 4, and the two sets it would otherwise
              be filed behind are still ahead of you.

              So it is inserted rather than appended, and that is the one way
              the two buttons differ: Add set means one more at the end, where
              a drop is positional by definition. It carries the weight of the
              row it came off, and no ghost of its own — last week's set N+1
              was not this drop, and a figure that isn't about this row is
              worse than none. */}
          {dropAt > 0 && (
            <HoldBtn
              label={L.holdAddDrop}
              onConfirm={() => {
                mutSession(i, (e) => {
                  const src = e.sets[dropAt - 1];
                  const g = prevNums(src.prev);
                  e.sets.splice(dropAt, 0, {
                    w: src.w || g.w,
                    reps: '',
                    done: false,
                    prev: '—',
                    prevMark: null,
                    link: true,
                  });
                });
                // The rest running under it was written by the tick this drop
                // now says earned none. Its alarm goes with it, through the
                // scheduling effect's own cleanup — no new cancel path.
                patch((st) => (st.rest ? { rest: null } : null));
              }}
              style={styles.addSet}
              labelStyle={styles.addSetLabel}
            />
          )}
        </View>
      )}
    </View>
  );
}

/* ── the mark sheet ──────────────────────────────────────────────────────── */

/**
 * What the set said about the next one.
 *
 * Four verdicts and no more, because this gets answered while you are still
 * breathing hard: heavier, lighter, that was the weight, or words. The words
 * sit under all four rather than only under `note` — "heavier, but my grip
 * went first" is one thought, and making the user choose between the arrow and
 * the sentence would lose whichever they didn't pick.
 *
 * Last time's verdict is printed at the top, because this is also the one
 * screen with room to read a note in full: the row itself only has a glyph.
 */
function MarkSheet({
  n,
  isDrop,
  after,
  set,
  exName,
  removeLabel,
  onClose,
  onPick,
  onNote,
  onLink,
  onRemove,
}: {
  /** the number of the set this row belongs to — `setNumberOf`, not the row */
  n: number;
  /** a line of the set above rather than the head of one */
  isDrop: boolean;
  /** the set the link switch would hang this row off */
  after: number;
  set: LoggedSet;
  exName: string;
  /**
   * What the held remove is about to take.
   *
   * The caller writes it because the caller is what knows whether this row has
   * drops hanging off it, and taking a set removes them with it — they are
   * lines of it, and there is no set for them to belong to afterwards. Saying
   * so in the label is the warning: it is read *before* the hold rather than
   * discovered after it, which is the same place every other destructive act
   * in the app puts its warning.
   */
  removeLabel: string;
  onClose: () => void;
  /** null clears the mark */
  onPick: (m: SetMark | null) => void;
  onNote: (v: string) => void;
  /** absent on set 1, which has nothing above it to be taken straight after */
  onLink?: (on: boolean) => void;
  /** absent on a ticked set and on an exercise's last remaining set */
  onRemove?: () => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { L } = useStore();
  useBackClose(onClose);

  return (
    <Sheet zIndex={84} maxHeight="70%" onClose={onClose}>
      <H4>{(isDrop ? L.dropLabel : L.setLabel).replace('{n}', String(n))}</H4>
      <Text style={styles.markSub} numberOfLines={1}>
        {exName}
      </Text>

      {set.prevMark && (
        <View style={styles.markPrev}>
          <Icon d={MARK_D[set.prevMark.mark]} size={13} color={c.neutral500} strokeWidth={2.2} />
          <Text style={styles.markPrevText}>
            {L.markLastTime.replace(
              '{t}',
              set.prevMark.note?.trim() || markLabel(set.prevMark.mark, L)
            )}
          </Text>
        </View>
      )}

      <View style={styles.markRow}>
        {SET_MARKS.map((m) => {
          const on = set.mark === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onPick(on ? null : m)}
              style={[
                styles.markTile,
                {
                  borderColor: on ? c.accent : c.divider,
                  backgroundColor: on ? c.wash.accent(14) : 'transparent',
                },
              ]}
            >
              <Icon
                d={MARK_D[m]}
                size={22}
                color={on ? c.accent200 : c.neutral400}
                strokeWidth={2}
              />
              <Text
                style={[styles.markTileLabel, on && { color: c.accent200 }]}
                numberOfLines={2}
              >
                {markLabel(m, L)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Only once there is something to clear — the way out of a state you
          are not in is noise. */}
      {set.mark && <Text style={styles.markHelp}>{L.markClear}</Text>}

      <Field label={L.markNoteLabel} style={styles.markField}>
        <Input
          value={set.note ?? ''}
          placeholder={L.markNotePlaceholder}
          onChangeText={onNote}
          multiline
          style={styles.markInput}
        />
      </Field>

      {/* The general way to make a drop set — the button under the ledger is
          the quick one for the common case, and this is the only way to take
          the link back off. It says what is true of the set rather than what
          the feature is called: `Drop set` is a name for an action and lives
          on the button that performs one, where a switch labelled with it
          would make you translate it back into a fact about your workout. */}
      {onLink && (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: !!set.link }}
          onPress={() => onLink(!set.link)}
          style={styles.linkRow}
        >
          <View style={styles.linkText}>
            <Text style={styles.linkLabel}>
              {L.linkLabel.replace('{n}', String(after))}
            </Text>
            <Text style={styles.linkSub}>{L.linkSub}</Text>
          </View>
          <Switch
            value={!!set.link}
            onValueChange={onLink}
            trackColor={{ false: c.neutral800, true: c.accent700 }}
            thumbColor={set.link ? c.accent : c.neutral500}
          />
        </Pressable>
      )}

      {/* Taking the row out of the ledger — destructive, so it wears the hold
          grammar like every other × in the app. It closes the sheet itself:
          the set this sheet was about is gone, and the row now under its
          index is a different one. */}
      {onRemove && (
        <HoldBtn
          destructive
          label={removeLabel}
          onConfirm={onRemove}
          style={styles.markRemove}
          labelStyle={styles.markRemoveLabel}
        />
      )}

      <Btn variant="secondary" block label={L.close} style={styles.markClose} onPress={onClose} />
    </Sheet>
  );
}

/* ── last session's verdicts ─────────────────────────────────────────────── */

/**
 * What you told yourself last time about this exercise, at the top of it.
 *
 * These lines used to be drawn one per row, on the live set, out of
 * `prevMark`. That put each one exactly where it was written — and exactly two
 * sets too late to act on. "Shoulder, drop to 60" is advice about the exercise
 * you are walking up to, and reading it when you reach set 3 is reading it
 * after you have already loaded the bar twice.
 *
 * So it is hoisted, and it is hoisted **whole**: every mark last session left
 * on this exercise, each naming its set, which is what keeps "try 75 next"
 * attached to the 70 it was about. The row-level copy is gone rather than kept
 * alongside — the same sentence in two places is two readings of one fact, and
 * the set row's single note slot is now its own words or nothing.
 *
 * Read from `lastMarks` rather than off `entry.sets[].prevMark`: that map is
 * the complete list for the exercise, where the session's copy is truncated to
 * however many sets today's routine asks for. Four notes last week and three
 * sets today would silently drop the fourth.
 *
 * In the scroll rather than the fixed header on purpose — it is read once, on
 * the way in, and then it should get out of the way of the ledger.
 */
function LastNotes({ id }: { id: string }) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L } = useStore();

  const rows = (s.lastMarks[id] ?? [])
    .map((m, i) => ({ m, i }))
    .filter((r): r is { m: MarkNote; i: number } => !!r.m);
  if (!rows.length) return null;

  return (
    <View style={styles.lastNotes}>
      {rows.map(({ m, i }) => (
        <View key={i} style={styles.lastNote}>
          <Icon d={MARK_D[m.mark]} size={12} color={c.neutral500} strokeWidth={2.2} />
          {/* "Last time · Set 2 · bar felt light". Three segments and no new
              string: `markLastTime` already carries the tense and `setLabel`
              the number, and a mark with no words reads as its own label —
              the same fallback the mark sheet prints. */}
          <Text style={styles.lastNoteText} numberOfLines={2}>
            {L.markLastTime.replace(
              '{t}',
              `${L.setLabel.replace('{n}', String(i + 1))} · ${
                m.note?.trim() || markLabel(m.mark, L)
              }`
            )}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ── the overview sheet ──────────────────────────────────────────────────── */

/**
 * What the card stack used to show all session long, on demand: the order,
 * each exercise's count, one tap to jump. Add exercise, Discard and Finish
 * live here too — the buddy's live counts stay on Profile, one tap further.
 */
function Overview({ onClose, onJump }: { onClose: () => void; onJump: (to: number) => void }) {
  const styles = useThemed(sheet);
  const c = useColors();
  const {
    s,
    L,
    patch,
    ex,
    exInfo,
    totals,
    clock,
    finishSession,
    setFirstUp,
    removeSessionEx,
    moveSessionStop,
    adoptBuddyEx,
  } = useStore();
  useBackClose(onClose);

  // A stop is in the air, so the sheet's own scroller stands down for the
  // length of the drag — the panel is the only scroller this list can reach.
  const [scrub, setScrub] = useState(false);

  const session = s.session;
  if (!session) return null;
  const tot = totals();

  const stops = stopsOf(session.list);

  // Where the two lists have drifted apart — the same diff the buddy line
  // reads, over the whole of their session rather than the one exercise they
  // are on. A row that can't be named is left out rather than shown as an id.
  // Gated on the link being up for the same reason the buddy line answers a
  // dropped one with `stLost` rather than the last thing it heard: an offer
  // read off a phone that is no longer there is a reading, not a fact.
  const bp = s.sessionShared && s.buddyEndpoint ? s.buddyProgress : null;
  const theirsOnly = (bp?.finished ? [] : (bp?.list ?? []))
    .filter((e) => !session.list.some((m) => m.ex === e.ex))
    .flatMap((e) => {
      const meta = ex(e.ex) ?? bp?.deps?.custom.find((x) => x.id === e.ex);
      if (!meta) return [];
      return [
        {
          ex: e.ex,
          name: exInfo(meta).text,
          done: e.done.filter(Boolean).length,
          sets: e.done.length,
        },
      ];
    });

  return (
    <Sheet zIndex={82} maxHeight="80%" scrollEnabled={!scrub} onClose={onClose}>
      <H4>{session.name}</H4>
      <Text style={styles.ovSub}>
        {tot.done} {L.ofSets} {tot.all} {L.setsWord} · {clock}
      </Text>

      {/* By stop rather than by exercise, so a pair reads here as the one
          thing it is on the screen behind. There is no pairing control:
          a superset is made in the routine and only ever read in a session,
          so this sheet can show one and never offer one — which is also why
          the drag moves a whole stop: a hold that could pull a pair apart
          would be an unpairing control wearing a reorder's clothes.

          The pitch `DragList` measures is per stop for the same reason: a
          pair's block is taller than a lone row, and a uniform one would land
          a long drag rows away from the line it drew. */}
      <DragList
        style={styles.ovList}
        count={stops.length}
        keyOf={(n) => `${session.list[stops[n].head].ex}-${stops[n].head}`}
        rowStyle={() => styles.ovStop}
        // The surface's own colour, so the stop in flight covers what it
        // slides over instead of printing through it.
        liftStyle={{ backgroundColor: c.surface }}
        onReorder={moveSessionStop}
        onScrub={setScrub}
      >
        {(n, d) => {
          const stop = stops[n];
          const rows = stop.ids.map((k) => {
            const entry = session.list[k];
            const meta = ex(entry.ex);
            const name = meta ? exInfo(meta) : { text: entry.ex, missing: false };
            const done = entry.sets.filter((x) => x.done).length;
            const all = entry.sets.length;
            return { k, entry, name, done, all, finished: all > 0 && done === all };
          });
          const paired = rows.length > 1;
          // The stop is current when either half is: `s.active` is snapped to
          // the stop's head on the screen, so both rows light together.
          const currentStop = stop.ids.includes(s.active);
          const body = rows.map(({ k, entry, name, done, all, finished }) => {
          const current = currentStop;
          return (
            <Pressable
              key={`${entry.ex}-${k}`}
              onPress={() => {
                onJump(k);
                onClose();
              }}
              style={[styles.ovRow, current && styles.ovRowCurrent]}
            >
              {current && <View style={styles.ovDot} />}
              <Text
                style={[
                  styles.ovName,
                  current && { color: c.accent200 },
                  finished && !current && { color: c.neutral500 },
                  name.missing && missingName(c),
                ]}
                numberOfLines={1}
              >
                {name.text}
              </Text>
              <Text style={[styles.ovCount, current && { color: c.accent400 }]}>
                {done}/{all}
              </Text>
              {finished && <Text style={styles.ovTick}>✓</Text>}
              {/* The undo for a wrong pick. Only while nothing is ticked —
                  see `removeSessionEx` — so what it can throw away is at most
                  a plan, never a set that happened. Held, not tapped: typed
                  numbers are still a plan, but they were still typed. */}
              {done === 0 && (
                <HoldBtn
                  destructive
                  label="×"
                  accessibilityLabel={L.removeExercise}
                  hitSlop={slop}
                  onConfirm={() => removeSessionEx(k)}
                  style={styles.ovRemove}
                  labelStyle={styles.ovRemoveGlyph}
                />
              )}
            </Pressable>
          );
          });
          const inner = paired ? (
            <View style={styles.ovPair}>
              <View style={styles.ovPairRule} />
              <View style={styles.ovPairBody}>
                <Text style={styles.ovPairTag}>{L.superset}</Text>
                {body}
              </View>
            </View>
          ) : (
            body
          );
          return (
            <>
              {/* Not the handle any more — the stop is — but it stays as the
                  word this app uses for "this one moves", and it still says
                  which stop is in the air. Absent on a list of one, where a
                  drag with nowhere to go is furniture. */}
              {stops.length > 1 && (
                <View accessibilityLabel={L.dragReorder} style={styles.ovGrip}>
                  <GripIcon color={d.held ? c.accent : c.neutral700} />
                </View>
              )}
              <View style={styles.ovStopBody}>{inner}</View>
            </>
          );
        }}
      </DragList>

      {/* The ledger version of the buddy line's offer: everything in their
          session that isn't in yours, not just whatever they happen to be
          standing at. This is where you'd come to reconcile anyway — the
          list, the jump and the × already live here — and it catches the
          three things they added while your phone was in a pocket. Adding
          from here doesn't jump: you may be taking on several, and the sheet
          is not the place to be yanked out of. */}
      {theirsOnly.length > 0 && (
        <>
          <Text style={styles.ovSetting}>
            {L.ovTheirsOnly.replace('{name}', s.buddy ?? '')}
          </Text>
          <View style={styles.ovTheirs}>
            {theirsOnly.map((e) => (
              <Pressable
                key={e.ex}
                onPress={() => adoptBuddyEx(e.ex, false)}
                accessibilityLabel={L.addTheirs.replace('{ex}', e.name)}
                style={styles.ovRow}
              >
                <Text style={styles.ovName} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text style={styles.ovCount}>
                  {e.done}/{e.sets}
                </Text>
                <Text style={styles.ovPlus}>+</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Only while there is somebody to go first ahead of. Changing it here
          changes it on both phones — one register, last writer wins — and the
          new seed re-rolls every exercise you haven't reached. */}
      {s.sessionShared && (
        <>
          <Text style={styles.ovSetting}>{L.whoFirst}</Text>
          <Seg
            style={styles.ovSeg}
            options={FIRST_UPS.map((p) => ({
              key: p,
              label: p === 'host' ? L.firstHost : p === 'random' ? L.firstRandom : L.firstAsk,
              on: s.firstUp.policy === p,
              pick: () => setFirstUp(p),
            }))}
          />
        </>
      )}

      <Btn
        variant="ghost"
        label={L.addExerciseBtn}
        labelStyle={styles.ovAddLabel}
        style={styles.ovAdd}
        onPress={() => {
          onClose();
          patch({ picker: 'session' });
        }}
      />

      {/* The only way out of a session. Held while sets are still open, and a
          session with nothing ticked writes no history — which is what Discard
          used to be for, and what the line under it says out loud. */}
      <HoldBtn
        variant="primary"
        hold={tot.done < tot.all}
        dashed={tot.done < tot.all}
        label={tot.done < tot.all ? L.holdFinish : L.finish}
        onConfirm={finishSession}
        style={styles.ovFinish}
        labelStyle={styles.ovFinishLabel}
      />
      {tot.done === 0 && <Text style={styles.ovFinishHint}>{L.finishLogsNothing}</Text>}
    </Sheet>
  );
}

/* ── the buddy line ──────────────────────────────────────────────────────── */

/**
 * Whose set it is, in the exercise rather than in a bar at the bottom of the
 * screen — with the take-turns/parallel chip that decides it right beside the
 * hint, and the same tap-through to Profile for the full picture. Also the
 * slot where "they disconnected" lands, since that is the same question
 * answered: what is the other phone doing.
 */
function BuddySlot({ onOpenProfile }: { onOpenProfile: () => void }) {
  const styles = useThemed(sheet);
  const { s, L, patch, turnMode, toggleTurnMode, adoptBuddyEx } = useStore();
  const buddyLive = useBuddyLive();

  if (s.buddyLeft) {
    return (
      <Pressable onPress={() => patch({ buddyLeft: null })} style={styles.leftNote}>
        <Text style={styles.leftNoteText}>
          {L.buddyLeftNote.replace('{name}', s.buddyLeft)}
        </Text>
      </Pressable>
    );
  }

  if (!s.buddy) return null;

  // Paired but training alone — the row is still the way to Profile.
  if (!buddyLive) {
    return (
      <Pressable onPress={onOpenProfile} style={styles.buddy}>
        <View style={styles.buddyAvatar}>
          <Text style={styles.buddyInitial}>{s.buddy[0]}</Text>
        </View>
        <Text style={[styles.buddyText, styles.buddyTurn]} numberOfLines={1}>
          {s.buddy}
        </Text>
        <Text style={styles.buddySub}>{L.trainingWith}</Text>
        <Text style={styles.buddyChevron}>›</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onOpenProfile} style={styles.buddy}>
      <View style={styles.buddyAvatar}>
        <Text style={styles.buddyInitial}>{s.buddy[0]}</Text>
      </View>
      <View style={styles.buddyText}>
        <Text
          style={[
            styles.buddyTurn,
            !buddyLive.turn && styles.buddyTurnPlain,
            buddyLive.mine && styles.buddyTurnMine,
          ]}
          numberOfLines={1}
        >
          {buddyLive.turn ?? buddyLive.text}
        </Text>
        {buddyLive.turn && (
          <Text style={styles.buddySub} numberOfLines={1}>
            {s.buddy} {buddyLive.text}
          </Text>
        )}
      </View>
      {buddyLive.jump && (
        <Btn
          variant="ghost"
          label={L.jumpTo.replace('{ex}', buddyLive.jump.name)}
          labelStyle={styles.jumpLabel}
          style={styles.jumpBtn}
          onPress={() => patch({ active: buddyLive.jump!.index })}
        />
      )}
      {/* Same slot as the jump, because it is the same errand: they are on
          something you are not. One tap takes it on — nothing crosses on its
          own. */}
      {buddyLive.add && (
        <Btn
          variant="ghost"
          label={L.addTheirs.replace('{ex}', buddyLive.add.name)}
          labelStyle={styles.jumpLabel}
          style={styles.jumpBtn}
          onPress={() => adoptBuddyEx(buddyLive.add!.ex)}
        />
      )}
      {buddyLive.modeEx && (
        <Pressable onPress={() => toggleTurnMode(buddyLive.modeEx!)} style={styles.modeChip}>
          <Text style={styles.modeChipLabel}>
            {turnMode(buddyLive.modeEx) === 'alternate' ? L.modeAlternate : L.modeParallel}
          </Text>
        </Pressable>
      )}
      <Text style={styles.buddyChevron}>›</Text>
    </Pressable>
  );
}

/* ── animated pieces ─────────────────────────────────────────────────────
   The driving Animated.Values live in lazy state (they are read while
   rendering, which the React Compiler does not allow of refs); "did this
   prop just flip" refs are only touched inside effects. */

/** Moving between exercises: a short slide in from the side you came from. */
function ExerciseSlide({ index, children }: { index: number; children: ReactNode }) {
  const styles = useThemed(sheet);
  const [x] = useState(() => new Animated.Value(0));
  const [o] = useState(() => new Animated.Value(1));
  const prev = useRef(index);

  useEffect(() => {
    if (prev.current === index) return;
    const dir = index > prev.current ? 1 : -1;
    prev.current = index;
    x.setValue(dir * 20);
    o.setValue(0);
    Animated.parallel([
      Animated.timing(x, { toValue: 0, ...motion.move, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, ...motion.quick, useNativeDriver: true }),
    ]).start();
  }, [index, x, o]);

  return (
    <Animated.View style={[styles.slide, { opacity: o, transform: [{ translateX: x }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * One number cell. A tap opens the keyboard on it and a second tap closes it
 * again; touching it and sliding steps the value instead — up to add — which is
 * how most sets get entered without the keyboard ever opening.
 *
 * **How far a pixel carries depends on how fast it is travelling.** A nudge is
 * one step per `px`, exactly as it always was, and a sweep is up to `MAX_GAIN`
 * of them; a release above `FLING_V` glides on and slows to a stop. That is one
 * gesture doing two jobs — landing on 62.5 kg and getting from 20 to 80 —
 * where a fixed scale can only be tuned for one of them, and was tuned for the
 * first. It costs the drag its reversibility: the figure is integrated frame by
 * frame rather than mapped from the gesture's total travel, so dragging back is
 * only an undo if you drag back at the speed you came. Worth it, because the
 * expensive direction was always the long one.
 *
 * **The finger must never land on the `TextInput`, or there is no gesture at
 * all.** Android's `ReactEditText.onTouchEvent` answers every ACTION_DOWN with
 * `parent.requestDisallowInterceptTouchEvent(true)`, which walks up to
 * `GestureHandlerRootView` — and gesture-handler reads that as a native view
 * claiming the touch, so its root helper cancels *every* handler in the
 * orchestrator on the spot. A pan still waiting on its `GRAB_Y` is already dead
 * by the time the finger has moved that far. This is why the drag never worked:
 * not a negotiation this lost, one it was never entered into. (It is also why a
 * `PanResponder` can't do the job either — same disallow, one layer up.)
 *
 * So the cell is `box-only` **always**, focused or not: `ReactViewGroup`
 * intercepts the touch natively, the editor below never sees a DOWN, and
 * nothing cancels anything. It used to go back to `auto` once focused, so that
 * a tap could still place the caret inside a figure — and that quietly cost the
 * drag on every cell the keyboard had ever been opened on, which after one set
 * is most of them. Four characters of numeral do not need a caret you can aim;
 * the drag is what this cell is for.
 *
 * What the input gives up either way is the tap, so the tap is handed back as a
 * gesture — `Gesture.Tap` racing the pan, focusing the field, and blurring it
 * when it already has focus. That second tap is also the way out of the
 * keyboard that doesn't log a set: the list is `keyboardShouldPersistTaps`
 * `"always"` (see its note), so tapping away from a field is deliberately
 * inert, and Android's back key is eaten by the IME before any of this sees it.
 *
 * Nothing separates the drag from the list's own scroll any more, because the
 * thing that did was the wait this gesture is better off without — see `GRAB_Y`
 * for the trade. What is still separated is the swipe between exercises, by
 * `GIVE_X`: a sideways drag fails the pan outright and reaches the row's own
 * `PanResponder`. Activation cancels the native touch, which also means the
 * long-press text selection menu never gets to fire.
 */
function NumCell({
  value,
  ghost,
  step,
  px,
  live,
  warn,
  style,
  onText,
  onScrub,
  inputRef,
  ...input
}: {
  value: string;
  /** last time's figure — where a drag starts from when the cell is empty */
  ghost: string;
  step: number;
  /** travel per step at aiming speed — `PX_PER_STEP` or the coarser `PX_PER_REP` */
  px: number;
  live: boolean;
  /**
   * A refusal this cell is the answer to, as a counter — every change to a
   * non-zero value runs the shake once. Only the reps column is ever handed
   * one; see `refuse` in `Ledger`.
   */
  warn?: number;
  style?: StyleProp<ViewStyle>;
  onText: (v: string) => void;
  onScrub: (on: boolean) => void;
  inputRef?: RefObject<TextInput | null>;
} & TextInputProps) {
  const styles = useThemed(sheet);
  // Whether this cell is currently answering a refusal — it wears `warn` for
  // exactly as long as the shake runs, and no longer. Keeping the colour until
  // the reps were filled in was the other option and it is wrong: an empty
  // reps cell is the ordinary state of every set you have not lifted yet, so a
  // standing mark would light up rows that are merely in the future.
  const [warned, setWarned] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  // Whether the editor is focused. Not what opens this cell to touches any
  // more — nothing does, see the note above — but what the tap toggles.
  const [editing, setEditing] = useState(false);
  // The row walks Enter from weight to reps through `inputRef`; a cell nobody
  // walks to still needs a handle of its own to focus on a tap.
  const own = useRef<TextInput>(null);
  const ref = inputRef ?? own;

  // The IME swallows Android's back key, so the keyboard goes down without the
  // app hearing about it and the field keeps focus — leaving a cell that draws
  // itself as being typed into while the next tap on it would only blur it.
  // Only the focused cell subscribes, so there is never more than one listener.
  useEffect(() => {
    if (!editing) return;
    const sub = Keyboard.addListener('keyboardDidHide', () => ref.current?.blur());
    return () => sub.remove();
  }, [editing, ref]);

  // The refusal, drawn. Native driver, which is what rules the colour out of
  // the animation: `translateX` is a transform and rides the UI thread, where
  // a border colour cannot, so the colour is a plain state flip that lives and
  // dies with the travel rather than a fade of its own. Cross-fading two
  // layers is the usual way around that and would be two more views per cell,
  // for a third of a second, on the busiest list in the app.
  useEffect(() => {
    if (!warn) return;
    setWarned(true);
    const run = Animated.sequence(
      SHAKE.map((to) =>
        Animated.timing(shake, {
          toValue: to,
          duration: linger.shake,
          easing: motion.tap.easing,
          useNativeDriver: true,
        })
      )
    );
    run.start(({ finished }) => finished && setWarned(false));
    // A cell that is refused again mid-shake starts the new one from rest, and
    // one that leaves the screen takes its own animation with it.
    return () => {
      run.stop();
      shake.setValue(0);
      setWarned(false);
    };
  }, [warn, shake]);

  const toggleFocus = () => {
    if (editing) ref.current?.blur();
    else ref.current?.focus();
  };

  // The physics, the glide and the pan/tap race all live in `num-drag` — this
  // cell owns only how it is drawn and what its tap means.
  const { gesture, dragging } = useNumberDrag({
    value,
    ghost,
    step,
    px,
    onText,
    onScrub,
    onTapToggle: toggleFocus,
  });

  return (
    <GestureDetector gesture={gesture}>
      {/* Never `auto`, focused or not: the editor must not see an ACTION_DOWN
          or the drag is cancelled before it starts. */}
      <Animated.View
        style={[style, { transform: [{ translateX: shake }] }]}
        pointerEvents="box-only"
      >
        <Input
          ref={ref}
          style={[
            styles.setInput,
            live && styles.setInputLive,
            dragging && styles.setInputDragging,
            // Last, so it wins over both: while the cell is being refused it
            // is the only thing the row is about.
            warned && styles.setInputWarn,
          ]}
          placeholder={ghost}
          value={value}
          onChangeText={onText}
          {...input}
          onFocus={(e) => {
            setEditing(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setEditing(false);
            input.onBlur?.(e);
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}

/** Whatever is standing between you and this set — see `waiting` above. */
type Waiting = {
  /** the set isn't yours yet: your own rest, or their turn. Dashes the box. */
  held: boolean;
  /** your countdown, named while theirs is on screen too */
  mine: string | null;
  /** their rest, or their set while it holds the row */
  theirs: string | null;
  /** the way out of your own countdown; null when there isn't one running */
  start: { label: string; onPress: () => void } | null;
};

/** The `ask` policy, open — see `asking` above. */
type Asking = { label: string; mine: string; theirs: string; onBid: (b: Bid) => void };

/**
 * The wait, written out: at most one line about you and at most one about the
 * buddy, in that order.
 *
 * Yours goes first and carries the tap — it is your screen and the only clock
 * you can do anything about — with theirs a step back under it, context rather
 * than a second thing to act on. Whichever of them lands first keeps the
 * hairline that separates the lines from the set above.
 *
 * Its own component because a sealed exercise has no live row to hang it under
 * and still has your rest running on it.
 */
function WaitLines({
  waiting,
  asking,
  queued,
}: {
  waiting: Waiting | null;
  asking: Asking | null;
  /**
   * Why there is no countdown here: a drop taken off the row above, or the
   * other half of a superset round. It stands where the clock would have
   * been — which is what makes it an explanation rather than furniture, since
   * it leaves with the row exactly as a rest does.
   */
  queued?: string | null;
}) {
  const styles = useThemed(sheet);
  if (!waiting && !asking && !queued) return null;

  // A row with nothing to tap is a line, not a Pressable — the ripple and the
  // chevron are what promise the tap does something.
  const own = asking ? (
    <View style={styles.waitRow}>
      <Text style={styles.waitLabel} numberOfLines={1}>
        {asking.label}
      </Text>
      <Pressable onPress={() => asking.onBid('me')} style={styles.bidBtn}>
        <Text style={styles.bidMine}>{asking.mine}</Text>
      </Pressable>
      <Pressable onPress={() => asking.onBid('you')} style={styles.bidBtn}>
        <Text style={styles.bidTheirs}>{asking.theirs}</Text>
      </Pressable>
    </View>
  ) : waiting?.mine ? (
    waiting.start ? (
      <Pressable onPress={waiting.start.onPress} style={styles.waitRow}>
        <Text style={styles.waitLabel} numberOfLines={1}>
          {waiting.mine}
        </Text>
        <Text style={styles.waitStart}>{waiting.start.label} ›</Text>
      </Pressable>
    ) : (
      <View style={styles.waitRow}>
        <Text style={styles.waitLabel} numberOfLines={1}>
          {waiting.mine}
        </Text>
      </View>
    )
  ) : null;

  return (
    <>
      {/* Above the buddy's line and below nothing: it is a fact about this row
          rather than about either of you, and it is the reason the clock the
          eye was looking for isn't there. */}
      {queued ? (
        <View style={styles.waitRow}>
          <Text style={[styles.waitLabel, styles.waitLabelQueued]} numberOfLines={1}>
            {queued}
          </Text>
        </View>
      ) : null}
      {own}
      {waiting?.theirs ? (
        <View style={[styles.waitRow, (!!own || !!queued) && styles.waitRowUnder]}>
          <Text style={[styles.waitLabel, styles.waitLabelTheirs]} numberOfLines={1}>
            {waiting.theirs}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/**
 * One **line** of a set: dim on done, accent flash on tick, ghost figures that
 * fly.
 *
 * A set is a chain — the row and the drops taken off it (`chainsOf`) — and
 * `SetStack` is what draws one. This draws a line inside it, and deliberately
 * owns nothing that belongs to the set as a whole: no tick, no wait lines, no
 * note line, not even the raised box. What it does own is every measurement,
 * which is why the tick left rather than the geometry moving — see the
 * `inputW` / `flyDx` note below, where every number is a column width.
 */
function SetLine({
  n,
  isDrop,
  drop,
  set,
  single,
  live,
  held,
  demo,
  warn,
  onCopy,
  onW,
  onReps,
  onLog,
  onScrub,
  onMark,
}: {
  /**
   * The number of the set this line belongs to — printed on the head, and on
   * a drop line only spoken, in `dropLabel`.
   *
   * A **chain ordinal**, never the row index: with a drop in the array
   * `index + 1` counts it as a set, so a drop off set 3 drew as 4 and the
   * working set under it as 5 — a four-set exercise counting to five in its
   * own ledger, for the rest of the workout.
   */
  n: number;
  /** a line of the set above rather than the head of one */
  isDrop: boolean;
  /** How far this line fell from the top of its chain — `−15 kg`, or null. */
  drop: string | null;
  set: LoggedSet;
  /** `duration` — one wide field instead of two, and no weight to walk to */
  single: boolean;
  /** the set you're on — raised, with numbers at thumb size */
  live: boolean;
  /** live, but not yours yet: your own rest, their turn, or an open question */
  held?: boolean;
  /** Play the taught hold-and-drag over this row's left cell — see `DragDemo`. */
  demo?: boolean;
  onCopy: (w: string, r: string) => void;
  onW: (v: string) => void;
  onReps: (v: string) => void;
  /**
   * A refused tick, as a bare counter — the reps cell shakes whenever it
   * changes to something non-zero. A counter and not a flag because the
   * same row is most likely to be refused twice running.
   */
  warn?: number;
  /** enter on the reps field — log it, don't toggle it */
  onLog: () => void;
  onScrub: (on: boolean) => void;
  /** open the mark sheet for this set */
  onMark: () => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { L } = useStore();
  const ghost = prevNums(set.prev);
  const repsRef = useRef<TextInput>(null);
  const [dim] = useState(() => new Animated.Value(set.done ? 0.6 : 1));
  const [flash] = useState(() => new Animated.Value(0));
  const [fly] = useState(() => new Animated.Value(0));
  const [catchV] = useState(() => new Animated.Value(0));
  const [flying, setFlying] = useState(false);
  const [rowW, setRowW] = useState(0);
  const prevDone = useRef(set.done);

  useEffect(() => {
    if (prevDone.current === set.done) return;
    prevDone.current = set.done;
    Animated.timing(dim, {
      toValue: set.done ? 0.6 : 1,
      ...motion.quick,
      useNativeDriver: true,
    }).start();
    if (set.done) {
      flash.setValue(1);
      Animated.timing(flash, {
        toValue: 0,
        duration: linger.flash,
        easing: motion.quick.easing,
        useNativeDriver: true,
      }).start();
    }
  }, [set.done, dim, flash]);

  const copy = () => {
    onCopy(ghost.w, ghost.r);
    setFlying(true);
    fly.setValue(0);
    Animated.timing(fly, {
      toValue: 1,
      duration: linger.fly,
      easing: motion.move.easing,
      useNativeDriver: true,
    }).start(({ finished }) => finished && setFlying(false));
    catchV.setValue(1);
    Animated.timing(catchV, {
      toValue: 0,
      duration: linger.catch,
      delay: 150,
      easing: motion.quick.easing,
      useNativeDriver: true,
    }).start();
  };

  // Row geometry: [16 index][8][66 prev][8][kg flex][8][reps flex][8][34 check].
  // Measured on the inner row, so the live row's own padding never enters it
  // and the ghost still flies from the "last time" figure into the cell it
  // lands in. A `duration` row drops the kg cell and one 8px gap with it, so
  // the single remaining field spans what the pair used to.
  const inputW = single ? Math.max(0, rowW - 140) : Math.max(0, (rowW - 148) / 2);
  const flyDx = 74 + inputW / 2;

  return (
    <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
          <Animated.View pointerEvents="none" style={[styles.rowFlash, { opacity: flash }]} />
          <Animated.View style={[styles.setRow, { opacity: dim }]}>
            {/* The row's number is also where its verdict lives, and the two
                never need to be read at once: which set this is, you can
                count, and once you have judged it the judgement is the more
                useful thing to spend 16px on. Taking the mark over the digit
                rather than adding a column is also what keeps every figure in
                the geometry above untouched. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                set.mark
                  ? markLabel(set.mark, L)
                  : isDrop
                    ? L.dropLabel.replace('{n}', String(n))
                    : L.setLabel.replace('{n}', String(n))
              }
              onPress={onMark}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
              style={styles.markCell}
            >
              {/* A drop line has no digit — it is not a set being counted —
                  but it keeps the cell, and a verdict still takes it. That is
                  what a drop can say for itself that the old gutter riser
                  could not: judge it and the judgement lands on the line it
                  is about, with nothing of the drop erased, because what says
                  it is a drop is the block around it. */}
              {set.mark ? (
                <Icon d={MARK_D[set.mark]} size={15} color={c.accent400} strokeWidth={2.2} />
              ) : isDrop ? null : (
                <Text style={[styles.setIndex, live && !held && styles.setIndexLive]}>{n}</Text>
              )}
            </Pressable>
            {/* A drop has no ghost by construction — last week's set N + 1 was
                not this drop — so the column is free on exactly the lines that
                have something else to say, and what they say is how far the
                weight fell. Deliberately no arrow beside it: `MARK_D.down` is
                a down arrow at `accent400`, drawn in the cell immediately to
                the left for *go lighter next time*, and two of them meaning
                two things on one line is worse than none. The minus already
                says which way it went. */}
            <Pressable onPress={copy} style={styles.colPrev}>
              {drop ? (
                <Text style={styles.dropText}>{drop}</Text>
              ) : (
                <Text style={styles.prevText}>{prevLabel(set.prev, single)}</Text>
              )}
            </Pressable>
            {!single && (
              <NumCell
                style={styles.colFlex}
                live={live}
                value={set.w}
                ghost={ghost.w}
                step={0.5}
                px={PX_PER_STEP}
                onText={onW}
                onScrub={onScrub}
                keyboardType="decimal-pad"
                // Enter walks the row: weight → reps → logged. `submit` keeps
                // the keyboard up so the hand-off doesn't flash it away. With
                // one field there is nowhere to walk to, so Enter just logs.
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => repsRef.current?.focus()}
              />
            )}
            <NumCell
              style={styles.colFlex}
              live={live}
              inputRef={repsRef}
              value={set.reps}
              ghost={ghost.r}
              step={1}
              // The whole-unit column, whichever unit it is: reps, seconds of a
              // hold, minutes of a run. All of them are the bigger fact, and
              // all of them get the longer travel.
              px={PX_PER_REP}
              // The one cell a refusal can be about: the left one is allowed
              // to be empty, this one is what makes a set a set.
              warn={warn}
              onText={onReps}
              onScrub={onScrub}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={onLog}
            />
            {/* The tick belongs to the *set*, so `SetStack` draws one over
                the block. What stays here is its footprint — same width, same
                height — because `inputW` and `flyDx` above are written out of
                this row's column widths, and a column leaving the flow would
                have moved every one of them. */}
            <View style={[styles.check, live && styles.checkLive, styles.checkSlot]} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.inputCatch, { opacity: catchV }]} />
          {/* Drawn over the left-hand number cell, and writing nothing: the
              `TextInput` under it is untouched and still typeable throughout.
              A demo that actually drove the gesture would have to put a figure
              into your set and then take it back, and an app that types into
              a workout to show off a feature is one that loses a set. */}
          {demo && rowW > 0 && (
            <DragDemo
              width={inputW}
              // The lane is the left-hand number cell exactly, using the same
              // 98px offset `inputCatch` is written against (16 + 66 plus the
              // two 8px gaps to its left) — which is also `DragDemo`'s default,
              // this being the site it was drawn for. A `duration` row drops
              // the kg cell and its gap, so its one field starts here too.
              step={single ? 1 : 0.5}
              px={single ? PX_PER_REP : PX_PER_STEP}
              // The same expression `NumCell`'s own `onStart` uses, so the
              // demo scrubs from exactly where a real finger would.
              base={single ? num(set.reps, num(ghost.r, 0)) : num(set.w, num(ghost.w, 0))}
            />
          )}
          {flying && (
            <View pointerEvents="none" style={styles.flyerLane}>
              <Animated.Text
                style={[
                  styles.flyerText,
                  {
                    opacity: fly.interpolate({
                      inputRange: [0, 0.7, 1],
                      outputRange: [0.95, 0.6, 0],
                    }),
                    transform: [
                      {
                        translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, flyDx] }),
                      },
                    ],
                  },
                ]}
              >
                {set.prev}
              </Animated.Text>
            </View>
          )}
    </View>
  );
}

/**
 * One **set**: the row you lifted, and the drops you took off it.
 *
 * A drop is not a set being logged — it is a set still being finished — so the
 * unit the ledger draws, numbers and ticks is the chain (`chainsOf`), not the
 * row. Three things follow, and they are the whole feature:
 *
 * - **One tick, centred across however many lines the set took.** Which is what
 *   says the *set* is the thing being ticked. It acts on one line at a time —
 *   logging the first still open, and on a sealed set taking the last one
 *   back — so ticking a two-line set is two taps and unticking it is two, which
 *   is one gesture read in both directions.
 * - **Adding a drop takes the tick off, and nothing writes it off.** A set is
 *   done when every line of it is (`chainDone`), so one fresh unticked line is
 *   the whole of it. The row above keeps its own `done`, which is what lets
 *   `liveIn` walk straight to the drop instead of back to the set you have
 *   already lifted.
 * - **The block is the only thing saying these were one effort**, so it has to
 *   survive the tick — which the wait line's *Drop from set 3* does not, that
 *   being furniture which leaves with the countdown it stands in for.
 *
 * It draws the raised box, the note lines and the wait lines, because all three
 * are about the set rather than about a line of it. `SetLine` keeps every
 * measurement, and that is why the tick is drawn *over* the block on the
 * footprint each line still reserves for it rather than being lifted out of the
 * row: `inputW` and `flyDx` are written out of that row's column widths.
 */
function SetStack({
  n,
  lines,
  liveJ,
  single,
  units,
  waiting,
  asking,
  queued,
  demo,
  tip,
  warn,
  onCopy,
  onW,
  onReps,
  onToggle,
  onLog,
  onScrub,
  onMark,
}: {
  /** the set's number — its position among chains, never among rows */
  n: number;
  /** the head and its drops, as row indexes into the exercise's `sets` */
  lines: { j: number; set: LoggedSet }[];
  /** the row index of the live set, or -1 */
  liveJ: number;
  single: boolean;
  /** the exercise's units, for writing a drop's delta in the right one */
  units: { left: string; right: string; single: boolean };
  waiting: Waiting | null;
  asking: Asking | null;
  queued?: string | null;
  demo?: boolean;
  tip?: ReactNode;
  /** the refused tick's answer — see `refuse` in `Ledger` */
  warn: { j: number; n: number };
  onCopy: (j: number, w: string, r: string) => void;
  onW: (j: number, v: string) => void;
  onReps: (j: number, v: string) => void;
  /** the block's one tick — logs the open line, or takes the last one back */
  onToggle: () => void;
  onLog: (j: number) => void;
  onScrub: (on: boolean) => void;
  onMark: (j: number) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { L } = useStore();
  const head = lines[0].j;
  const stacked = lines.length > 1;
  const live = lines.some((l) => l.j === liveJ);
  const held = live && (!!waiting?.held || !!asking);
  const done = lines.every((l) => l.set.done);

  /**
   * How far a line fell — against the top of the chain, not the line above it.
   *
   * The reference has to stay fixed for the figures to be a curve: −15 then
   * −25 against 8 then 6 reps says how much weight had to come off for the
   * muscle to keep producing reps, which is the thing a drop set is for.
   * Measured line to line it would read −15 then −10, and the second number
   * would be about a different weight than the first.
   *
   * Absent when there is nothing to report — an equal or heavier line, which
   * includes the moment a drop is added, since it opens carrying the weight it
   * came off — and absent on any measure whose left-hand cell is not a weight:
   * a `distance` row's is kilometres and a `duration` row has none at all.
   */
  const fell = (set: LoggedSet) => {
    if (units.single || units.left !== L.unitKg) return null;
    const d = num(lines[0].set.w, 0) - num(set.w, 0);
    return d > 0 ? `−${fmt(d)} ${L.unitKg}` : null;
  };

  /**
   * The way in to the mark sheet, offered **once per set** and on its last
   * logged line.
   *
   * Per line it would draw `+ Note` twice under a two-line set, which is the
   * furniture this whole arrangement exists to avoid. The last line is the
   * right one: it is the effort you have just finished, so it is the one you
   * have an opinion about. Words already written stay on the line they were
   * written about, however many of them there are.
   */
  const offerAt = [...lines].reverse().find((l) => l.set.done && !l.set.note?.trim())?.j ?? -1;

  return (
    <View style={styles.rowWrap}>
      <View style={[live && styles.liveBox, held && styles.liveBoxWaiting]}>
        {/* The block: a hairline and the faintest wash in the palette — enough
            to read as one thing at arm's length, quiet enough that a ledger of
            ordinary sets is the ledger it always was. It bleeds past the rows
            on both sides by its own border plus padding, so its *content* box
            is their content box and every column lands on the same x. Aligning
            it by eye instead puts a stacked set's kilos out by the padding,
            which on tabular figures reads as a broken column. */}
        <View style={[stacked && styles.stackBox, stacked && live && styles.stackBoxLive]}>
          {lines.map(({ j, set }) => (
            <View key={j} style={stacked && j !== head ? styles.stackLine : undefined}>
              <SetLine
                n={n}
                isDrop={j !== head}
                drop={j !== head ? fell(set) : null}
                set={set}
                single={single}
                live={j === liveJ}
                held={held}
                demo={j === liveJ && !!demo}
                warn={warn.j === j ? warn.n : 0}
                onCopy={(w, r) => onCopy(j, w, r)}
                onW={(v) => onW(j, v)}
                onReps={(v) => onReps(j, v)}
                onLog={() => onLog(j)}
                onScrub={onScrub}
                onMark={() => onMark(j)}
              />
            </View>
          ))}
          {/* Over the footprint every line still reserves for it, centred down
              the block's whole height. Absolute rather than in the flow, so a
              set of one line is drawn exactly where it has always been. */}
          <View style={styles.stackCheck} pointerEvents="box-none">
            <AnimatedCheck done={done} live={live} onPress={onToggle} />
          </View>
        </View>

        {/* Words already written, on the line they are about — then the way in,
            once. See `offerAt` for why the offer is not drawn per line. */}
        {lines.map(({ j, set }) =>
          set.mark && set.note?.trim() ? (
            <Pressable key={j} onPress={() => onMark(j)} style={styles.markLine}>
              <Icon d={MARK_D[set.mark]} size={12} color={c.accent400} strokeWidth={2.2} />
              <Text style={[styles.markLineText, styles.markLineOwn]} numberOfLines={2}>
                {set.note.trim()}
              </Text>
            </Pressable>
          ) : j === offerAt ? (
            // The quietest thing on the screen — dimmer than the ghost figures
            // beside it, because it is an offer and everything else on the row
            // is the workout. No fill and above all no dash: dashed means *this
            // one is held* at three sites, and a hint drawn as a control you
            // must press and hold is the exact confusion it exists to end.
            <Pressable key={j} onPress={() => onMark(j)} style={styles.markLine}>
              <Icon d={MARK_D.note} size={12} color={c.neutral700} strokeWidth={2.2} />
              <Text style={[styles.markLineText, styles.markLineAdd]} numberOfLines={1}>
                {L.addNote}
              </Text>
            </Pressable>
          ) : null
        )}

        {live && <WaitLines waiting={waiting} asking={asking} queued={queued} />}
      </View>
      {/* Under the live box, never over anything: the tick, the fields and the
          CTA all stay exactly where they were, and the tip costs one row of a
          list that on a fresh exercise is empty rows anyway. */}
      {live && tip}
    </View>
  );
}

/** The tick target: accent fill fades up while the checkmark strokes itself on. */
function AnimatedCheck({
  done,
  live,
  onPress,
}: {
  done: boolean;
  live: boolean;
  onPress: () => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  // JS-driven: strokeDashoffset is an SVG prop, not a transform/opacity.
  const [draw] = useState(() => new Animated.Value(done ? 1 : 0));
  const prev = useRef(done);

  useEffect(() => {
    if (prev.current === done) return;
    prev.current = done;
    Animated.timing(draw, {
      toValue: done ? 1 : 0,
      duration: done ? 220 : motion.tap.duration,
      easing: motion.quick.easing,
      useNativeDriver: false,
    }).start();
  }, [done, draw]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      onPress={onPress}
      style={[
        styles.check,
        live && styles.checkLive,
        { borderColor: done ? c.accent600 : live ? c.accent700 : c.divider },
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.checkFill, { opacity: draw }]} />
      <Svg width={live ? 19 : 15} height={live ? 19 : 15} viewBox="0 0 24 24" fill="none">
        {/* The faint preview check the design shows on unticked sets. */}
        <Path
          d={CHECK_D}
          stroke={c.neutral700}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          d={CHECK_D}
          stroke={c.accent100}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LEN}
          strokeDashoffset={draw.interpolate({
            inputRange: [0, 1],
            outputRange: [CHECK_LEN, 0],
          })}
        />
      </Svg>
    </Pressable>
  );
}

/** The header bar: eased fill with a bright leading edge; one glow at 100%. */
function ProgressBar({ pct }: { pct: number }) {
  const styles = useThemed(sheet);
  const [pr] = useState(() => new Animated.Value(pct / 100));
  const [edge] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const [trackW, setTrackW] = useState(0);
  const prev = useRef(pct);

  useEffect(() => {
    if (prev.current === pct) return;
    prev.current = pct;
    // Twice the move duration: this is the one element that travels far.
    Animated.timing(pr, {
      toValue: pct / 100,
      duration: motion.move.duration * 2,
      easing: motion.move.easing,
      useNativeDriver: true,
    }).start();
    edge.setValue(0.9);
    Animated.timing(edge, {
      toValue: 0,
      duration: linger.edge,
      easing: motion.quick.easing,
      useNativeDriver: true,
    }).start();
    if (pct >= 100) {
      glow.setValue(0.7);
      Animated.timing(glow, {
        toValue: 0,
        duration: linger.glow,
        easing: motion.quick.easing,
        useNativeDriver: true,
      }).start();
    }
  }, [pct, pr, edge, glow]);

  return (
    <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.fill, { transform: [{ scaleX: pr }] }]} />
      {trackW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fillEdge,
            {
              opacity: edge,
              transform: [
                {
                  translateX: pr.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-8, trackW - 8],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      <Animated.View pointerEvents="none" style={[styles.fillGlow, { opacity: glow }]} />
    </View>
  );
}

/**
 * The exercise's sealed state: a hairline of light sweeps the rule between
 * the exercise and its sets when the last set goes green. The design played
 * this on the card border; there is no card here, so it plays on the rule.
 */
function SealSweep({ sealed }: { sealed: boolean }) {
  const styles = useThemed(sheet);
  const c = useColors();
  const [sweep] = useState(() => new Animated.Value(0));
  const [w, setW] = useState(0);
  const prev = useRef(sealed);

  useEffect(() => {
    if (prev.current === sealed) return;
    prev.current = sealed;
    sweep.setValue(0);
    if (!sealed) return;
    Animated.timing(sweep, {
      toValue: 1,
      duration: linger.sweep,
      easing: motion.move.easing,
      useNativeDriver: true,
    }).start();
  }, [sealed, sweep]);

  const sweepW = w * 0.4;
  return (
    <View
      pointerEvents="none"
      style={styles.sealTrack}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 && (
        <Animated.View
          style={{
            width: sweepW,
            height: '100%',
            opacity: sweep.interpolate({
              inputRange: [0, 0.05, 0.95, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-sweepW, w] }) },
            ],
          }}
        >
          <LinearGradient
            colors={['transparent', c.accent300, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

/** The same pop, around a box rather than a line of text (the footer button). */
function PopOnFlip({
  on,
  style,
  children,
}: {
  on: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const prev = useRef(on);

  useEffect(() => {
    if (prev.current === on) return;
    prev.current = on;
    if (!on) return;
    scale.setValue(0.94);
    Animated.spring(scale, { toValue: 1, ...motion.payoff, useNativeDriver: true }).start();
  }, [on, scale]);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
  );
}

/** Text that does the payoff pop when its flag flips true (the n/n count). */
function PopOnTrue({
  on,
  style,
  children,
}: {
  on: boolean;
  style: StyleProp<TextStyle>;
  children: ReactNode;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const prev = useRef(on);

  useEffect(() => {
    if (prev.current === on) return;
    prev.current = on;
    if (on) {
      scale.setValue(0.7);
      Animated.spring(scale, { toValue: 1, ...motion.payoff, useNativeDriver: true }).start();
    }
  }, [on, scale]);

  return <Animated.Text style={[style, { transform: [{ scale }] }]}>{children}</Animated.Text>;
}

const sheet = themed(() => ({
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  title: { marginTop: 2, letterSpacing: tracking(22, -0.02) },
  count: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.neutral400,
    fontVariant: ['tabular-nums'],
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  posChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
  },
  posText: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral300, fontVariant: ['tabular-nums'] },
  posCaret: { fontFamily: font.regular, fontSize: 11, color: color.accent },

  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.neutral800,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    width: '100%',
    borderRadius: 2,
    backgroundColor: color.accent,
    transformOrigin: 'left',
  },
  fillEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 8,
    borderRadius: 2,
    backgroundColor: color.accent300,
  },
  fillGlow: { ...absFill, borderRadius: 2, backgroundColor: wash.accent(45) },

  slide: { flex: 1 },
  exercise: { flex: 1 },
  exHead: { paddingHorizontal: 16, paddingTop: 10 },
  exNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exName: { flex: 1, letterSpacing: tracking(23, -0.02) },
  howToBtn: { paddingVertical: 4, paddingHorizontal: 9, marginTop: 2 },
  howToLabel: { fontSize: 11.5 },
  exSubRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 3 },
  exSub: { flex: 1, fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },
  exCount: { fontFamily: font.regular, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  setupTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  setupTagText: { fontSize: 10.5 },
  /* The join in `A + B`. Quiet enough that the two names read as the pair's
     two halves rather than as a sum. */
  pairPlus: { color: color.neutral700 },

  /**
   * A superset: two ledgers, one unit. One hairline down the outside of both
   * is the only thing binding them — the same grammar the chain uses between a
   * set and its drop, one level up, and deliberately nothing more: the live
   * row has to stay the only accented thing on the screen.
   */
  pairWrap: { flexDirection: 'row', gap: 10 },
  pairRule: { width: 1, borderRadius: 1, backgroundColor: color.accent700, marginVertical: 6 },
  pairBody: { flex: 1 },
  pairSecond: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.rule },
  /* Per half, since the screen's own heading now names the pair. The name is
     where "which machine am I at" is answered, so the live one takes the
     accent — the heading above never moves. */
  halfHead: { marginBottom: 2 },
  halfName: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 15,
    color: color.neutral300,
    letterSpacing: tracking(15, -0.01),
  },
  halfNameLive: { color: color.accent200 },
  halfMeta: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral700, marginTop: 1 },

  sealLane: { height: 1.5, marginTop: 12, marginHorizontal: 16 },
  sealTrack: { ...absFill, overflow: 'hidden', borderTopWidth: 1, borderTopColor: wash.text(8) },

  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.neutral500,
    textAlign: 'center',
  },

  colHead: { flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingBottom: 5 },
  colLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.07),
    textTransform: 'uppercase',
    color: color.neutral700,
  },
  colIndex: { width: 16 },
  colPrev: { width: 66 },
  colFlex: { flex: 1, minWidth: 0, textAlign: 'center' },
  colCheck: { width: 34 },

  rowWrap: { marginBottom: 5 },
  /* The gutter riser that used to draw the chain lived here — one absolutely
     positioned hairline between two rows, kept out of the index cell because
     that cell belongs to `SetMark`. It is gone with the whole idea of a
     connector: a drop was drawn with a working set's row and then annotated,
     so the annotation was arguing with everything else on the line. What says
     it now is `stackBox`, which is the row's own shape. */
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** The set you're on: raised out of the ledger, numbers at thumb size. */
  liveBox: {
    marginVertical: 3,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: color.accent700,
    // Stated for the reason hold-btn's is: a removed `borderStyle` leaves the
    // dashes on Android's paint, so the row that stops waiting has to be told
    // it is solid again rather than simply dropping `liveBoxWaiting`.
    borderStyle: 'solid',
    borderRadius: radius.lg * 0.72,
    backgroundColor: wash.accent(7),
  },
  /** Yours, but not yet — the buddy is mid-set. Dashed, and not accented. */
  liveBoxWaiting: {
    borderStyle: 'dashed',
    borderColor: color.neutral700,
    backgroundColor: 'transparent',
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: wash.text(8),
  },
  waitLabel: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    fontVariant: ['tabular-nums'],
  },
  /** The second line of a wait — under the first, without a rule between. */
  waitRowUnder: { marginTop: 4, paddingTop: 0, borderTopWidth: 0 },
  /** Theirs, a step back from yours: the same line, read second. */
  waitLabelTheirs: { color: color.neutral600 },
  /* The reason there is no clock here. Accent, because it is a fact about the
     row you are standing at rather than a wait you are serving. */
  waitLabelQueued: { color: color.accent400 },
  /**
   * The same lines with no live row to hang under — a sealed exercise still
   * has your rest running on it, and a countdown that vanishes for the length
   * of the rest is the opacity this is here to end. Matches the live box's own
   * horizontal padding so the two read as one column.
   */
  waitLoose: { paddingHorizontal: 8 },
  waitStart: { fontFamily: font.regular, fontSize: 11.5, color: color.accent },
  /**
   * The two answers to "who's up?". Same line and same weight as "start now"
   * — this is one more thing you may tap on the waiting row, not a dialog —
   * with only the claim accented, so glancing at the row still reads as "the
   * set is not yours yet" rather than as two equal buttons demanding a choice.
   */
  bidBtn: { paddingHorizontal: 8, paddingVertical: 3, marginVertical: -3 },
  bidMine: { fontFamily: font.regular, fontSize: 11.5, color: color.accent },
  bidTheirs: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },
  rowFlash: { ...absFill, borderRadius: radius.sm, backgroundColor: wash.accent(12) },
  /** Over the two inputs — 16+66 plus two 8px gaps to their left, the 34px
      check plus one to their right. */
  inputCatch: {
    position: 'absolute',
    left: 98,
    right: 42,
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: radius.md,
  },
  flyerLane: { ...absFill, justifyContent: 'center', paddingLeft: 24 },
  flyerText: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.accent2,
    fontVariant: ['tabular-nums'],
    alignSelf: 'flex-start',
  },
  /** The index column, now a tap target — 16px wide, thumb-sized by hitSlop. */
  markCell: { width: 16, alignItems: 'flex-start', justifyContent: 'center' },
  setIndex: { fontFamily: font.regular, fontSize: 12, color: color.neutral600 },
  setIndexLive: { color: color.accent400 },
  /** A mark's line under the row — last time's advice, or this set's words. */
  markLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, paddingLeft: 2 },
  markLineText: { flex: 1, fontFamily: font.regular, fontSize: 11, color: color.neutral500 },
  markLineOwn: { color: color.neutral400 },
  markLineAdd: { color: color.neutral700 },

  /**
   * Last session's verdicts, hoisted to the top of the exercise.
   *
   * Read before set 1, which is the only time "drop to 60" can still change
   * what you do — on the row it was written on it arrives two sets late.
   */
  lastNotes: { gap: 4, marginBottom: 10, paddingHorizontal: 2 },
  lastNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastNoteText: { flex: 1, fontFamily: font.regular, fontSize: 11, color: color.neutral500 },
  prevText: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    fontVariant: ['tabular-nums'],
  },
  /** How far a drop fell, in the cell a drop is guaranteed not to be using. */
  dropText: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.accent400,
    fontVariant: ['tabular-nums'],
  },
  setInput: {
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  setInputLive: {
    fontSize: 22,
    minHeight: 46,
    paddingVertical: 4,
    borderColor: color.accent800,
    backgroundColor: color.bg,
  },
  /** While a hold-drag is stepping the number. */
  setInputDragging: { borderColor: color.accent, backgroundColor: wash.accent(10) },

  /**
   * A set that took more than one line — see `SetStack`.
   *
   * The negative margins are the point rather than a tweak: the block's own
   * border and padding would push its columns in by 7px, and a stacked set
   * whose kilos sit 7px right of the kilos above it reads as a broken column,
   * not as a group. Bleeding the block back out by exactly that much makes its
   * *content* box the plain row's content box, so every figure stays in its
   * column and only the card moves.
   *
   * The faintest wash the palette has, and a hairline one step below the
   * ledger's own: it has to read as one thing at arm's length without turning
   * a ledger of ordinary sets into a stack of cards.
   */
  stackBox: {
    borderWidth: 1,
    borderColor: color.neutral900,
    borderStyle: 'solid',
    borderRadius: radius.md,
    backgroundColor: wash.text(4),
    paddingHorizontal: 6,
    marginHorizontal: -7,
  },
  /** Inside the live box the block sits on the accent wash, not the text one. */
  stackBoxLive: { borderColor: color.accent800, backgroundColor: 'transparent' },
  /** Between two lines of one set — the app's own in-sheet separator weight. */
  stackLine: { borderTopWidth: 1, borderTopColor: t.rule },
  /**
   * The set's one tick, over the footprint each line reserves for it.
   *
   * Absolute, so a set of a single line is drawn exactly where it always was
   * and every measurement in `SetLine` is untouched; `box-none` so the block
   * behind it keeps taking touches everywhere the check itself is not.
   */
  stackCheck: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** What the line leaves behind where its tick used to be. */
  checkSlot: { borderWidth: 0, backgroundColor: 'transparent' },
  /**
   * While a tick this cell is the reason for is being refused. The one place
   * `warn` is drawn in the app — and it is drawn on the edge and the figure
   * rather than as a fill, because the cell is usually *empty* at this moment
   * (that being the whole complaint) and a fill would have nothing to sit
   * behind.
   */
  setInputWarn: { borderColor: color.warn, color: color.warn },
  check: {
    width: 34,
    height: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  checkLive: { height: 46, backgroundColor: color.bg },
  checkFill: { ...absFill, backgroundColor: color.accent800 },

  /** A ledger row, not a button — the hold fill is the only thing that reads
      as one, and only while it's being held. */
  addSet: {
    flex: 1,
    marginTop: 3,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: wash.text(8),
    borderRadius: 0,
  },
  addSetLabel: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500 },
  /* Add set and Add drop, side by side and equal: both are held, both add a
     row, and the only difference between them is whether the row it adds
     earns the one above it a rest. */
  addRow: { flexDirection: 'row', gap: 8 },

  buddy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 11,
    marginHorizontal: 16,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: color.surface,
    borderLeftWidth: 2,
    borderLeftColor: color.accent,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  buddyAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buddyInitial: { fontFamily: font.regular, fontSize: 11, color: color.accent200 },
  buddyText: { flex: 1 },
  buddyTurn: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral300 },
  buddyTurnPlain: { color: color.neutral400 },
  /** Your set is the one cue worth the accent — theirs stays quiet. */
  buddyTurnMine: { color: color.accent300 },
  buddySub: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600, fontVariant: ['tabular-nums'] },
  buddyChevron: { fontFamily: font.regular, fontSize: 14, color: color.accent },
  modeChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.md * 0.75,
    borderWidth: 1,
    borderColor: color.divider,
  },
  modeChipLabel: { fontFamily: font.regular, fontSize: 10, color: color.neutral400 },
  jumpBtn: { paddingVertical: 2 },
  jumpLabel: { fontSize: 11.5 },
  leftNote: {
    marginTop: 11,
    marginHorizontal: 16,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  leftNoteText: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },

  footer: {
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  cta: { height: 50, marginTop: 0, backgroundColor: wash.accent(10) },
  ctaLabel: { fontSize: 15, fontFamily: font.heading, color: color.accent },
  /** The tip's own margin is meant for a list; above the CTA it wants less. */
  footerTip: { marginTop: 0, marginBottom: 9 },
  /** What Finish is about to do, while it is about to do nothing. */
  ctaHint: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    textAlign: 'center',
    marginTop: 7,
  },

  ovSub: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, marginTop: 3 },
  ovList: { marginTop: 12 },
  /* One stop of the drag list: grip beside content, and ReorderRows' landing
     cue — a 2px top border, transparent until targeted so the layout never
     shifts. */
  ovStop: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 2 },
  ovStopBody: { flex: 1 },
  ovGrip: { width: 20, height: 26, alignItems: 'center', justifyContent: 'center' },
  /* A pair, bracketed — one unit here because it is one stop on the screen
     behind, and tapping either row lands on the same place. */
  ovPair: { flexDirection: 'row', gap: 9, marginVertical: 6 },
  ovPairRule: { width: 1, borderRadius: 1, backgroundColor: color.accent700 },
  ovPairBody: { flex: 1 },
  ovPairTag: {
    fontFamily: font.regular,
    fontSize: 9,
    letterSpacing: tracking(9, 0.07),
    textTransform: 'uppercase',
    color: color.accent400,
    paddingHorizontal: t.rowPadH,
    marginBottom: 2,
  },
  ovRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  ovRowCurrent: { paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: wash.accent(7) },
  ovDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  ovName: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  ovCount: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral600,
    fontVariant: ['tabular-nums'],
  },
  ovTick: { fontFamily: font.regular, fontSize: 12, color: color.accent400 },
  ovRemove: {
    width: 26,
    height: 26,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderColor: 'transparent',
  },
  ovRemoveGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
  ovSetting: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    marginTop: 14,
    marginBottom: 6,
    letterSpacing: tracking(11.5, 0.02),
  },
  /** Their rows, drawn without the current-row dot or the tick — nothing here
      is yours yet, and the + is the whole of what a row can do. */
  ovTheirs: { marginBottom: 2 },
  ovPlus: { fontFamily: font.regular, fontSize: 16, color: color.accent },
  ovSeg: { marginBottom: 2 },
  ovAdd: { alignSelf: 'flex-start', marginTop: 8 },
  ovAddLabel: { fontSize: 12.5 },
  ovFinish: { width: '100%', height: 46, marginTop: 16 },
  ovFinishLabel: { fontSize: 15 },
  ovFinishHint: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    textAlign: 'center',
    marginTop: 7,
  },

  markSub: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, marginTop: 3 },
  markPrev: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: radius.md,
    backgroundColor: wash.text(5),
  },
  markPrevText: { flex: 1, fontFamily: font.regular, fontSize: 11.5, color: color.neutral400 },
  /** Four tiles across, so the whole vocabulary is one glance and one tap. */
  markRow: { flexDirection: 'row', gap: 7, marginTop: 14 },
  markTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  markTileLabel: {
    fontFamily: font.regular,
    fontSize: 11,
    textAlign: 'center',
    color: color.neutral400,
  },
  markHelp: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600, marginTop: 8 },
  markField: { marginTop: 14 },
  markInput: { minHeight: 66, paddingTop: 9, textAlignVertical: 'top' },
  /* The general way to make a drop, under the sheet's own divider — the same
     toggle-row shape Settings uses, so a switch reads as a switch here too. */
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.rule,
  },
  linkText: { flex: 1 },
  linkLabel: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  linkSub: { fontFamily: font.regular, fontSize: 11, color: color.neutral600, marginTop: 1 },
  markRemove: { marginTop: 14, height: 40 },
  markRemoveLabel: { color: color.neutral500 },
  markClose: { marginTop: 16, height: 40 },
}));
