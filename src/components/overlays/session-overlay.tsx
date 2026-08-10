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
 * Log set → Next exercise → Finish workout. Android's keyboard resizes the
 * screen (`softwareKeyboardLayoutMode: resize`), so it lands directly above
 * the keys while you're typing.
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
  PanResponder,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { HoldBtn } from '@/components/hold-btn';
import { CHECK_D } from '@/components/icon';
import { FullScreen, Sheet } from '@/components/sheet';
import { buzz } from '@/data/haptics';
import { useBackClose } from '@/hooks/use-back-close';
import { useBuddyLive } from '@/hooks/use-buddy-live';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, fill as absFill, font, motion, radius, t, tracking, wash } from '@/design/tokens';
import { Btn, H3, H4, Input, missingName, Tag } from '@/design/ui';
import { fmt, num, prevNums, useStore } from '@/store/workout-store';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** CHECK_D's path length in its 24×24 viewBox — the draw-on dash budget. */
const CHECK_LEN = 25;

/** How long a set is still to be before a drag on it counts as an edit. */
const HOLD_MS = 220;
/** Vertical travel per step while dragging a number. */
const PX_PER_STEP = 12;

const mmss = (total: number) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

export function SessionOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, gInfo, kInfo, exInfo, setup, mutSession, totals, finishSession } =
    useStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const buddyLive = useBuddyLive();
  const [overview, setOverview] = useState(false);
  // A number being dragged owns the gesture; the list must not scroll under it.
  const [scrubbing, setScrubbing] = useState(false);

  // Gym phones lock constantly, and a lock kills the Nearby link — keep the
  // screen on while a session is open. Also just right for a logging screen.
  useKeepAwake();

  // No back route in the design — only Discard and Finish. Swallow it so a
  // stray press cannot throw away a workout in progress. The overview sheet
  // mounts later and so wins back first; that's the useBackClose contract.
  useBackClose(() => {}, { swallow: true });

  const session = s.session;

  /**
   * What is left of the wait, in seconds. Counted in `elapsed` ticks rather
   * than wall time, so it stays pure and re-renders for free. `restSeconds`
   * of 0 is the setting turned off, and collapses this to a constant 0.
   */
  const restLeft =
    s.rest && !s.rest.skipped ? Math.max(0, s.restSeconds - (s.elapsed - s.rest.at)) : 0;

  // The rest running out, announced to a pocket. Only for a rest you earned:
  // a turn coming back is the buddy's business and already on screen.
  const restRunning = restLeft > 0 && !!s.rest?.own;
  const wasResting = useRef(restRunning);
  useEffect(() => {
    if (wasResting.current && !restRunning && s.haptics) buzz.rest();
    wasResting.current = restRunning;
  }, [restRunning, s.haptics]);

  // The counter's 3px tick whenever another set lands. Hooks stay above the
  // early return; the effect just never fires without a session.
  const [tick] = useState(() => new Animated.Value(0));
  const doneCount = session ? totals().done : 0;
  const prevDoneCount = useRef(doneCount);
  useEffect(() => {
    if (prevDoneCount.current === doneCount) return;
    const rose = doneCount > prevDoneCount.current;
    prevDoneCount.current = doneCount;
    if (!rose) return;
    Animated.sequence([
      Animated.timing(tick, { toValue: -3, duration: 80, easing: motion.tap.easing, useNativeDriver: true }),
      Animated.spring(tick, { toValue: 0, ...motion.payoff, useNativeDriver: true }),
    ]).start();
    if (s.haptics) buzz.set();
    // A set of yours just landed — that, not the buddy's turn, is what the
    // rest is measured from, so it starts the same way whether anyone else is
    // training with you. It runs to the end even once a buddy is done and the
    // turn has come back round, which is the whole point of resting.
    patch((st) =>
      st.restSeconds > 0 ? { rest: { at: st.elapsed, skipped: false, own: true } } : null
    );
  }, [doneCount, tick, patch, s.haptics]);

  const theirTurn = !!buddyLive?.turn && !buddyLive.mine;

  // The first wait of a shared exercise has no set behind it: the buddy simply
  // goes first (ties go to the host). Give it the same shape, so the guest sees
  // "their set" rather than a screen that looks like their own — but mark it
  // `own: false`, so it lets go the moment the turn comes back. A rest of your
  // own outranks it and is left alone.
  useEffect(() => {
    patch((st) => {
      if (!theirTurn) return null;
      // Any wait still running keeps its stamp — this effect also runs when
      // the screen is restored from the tab bar, and restarting a countdown
      // because someone checked their Profile would be a lie.
      const r = st.rest;
      if (r && (r.own || st.elapsed - r.at < st.restSeconds)) return null;
      return { rest: { at: st.elapsed, skipped: false, own: false } };
    });
  }, [theirTurn, patch]);

  // A new exercise is a fresh start — you walked to another machine. Only on a
  // real change: on mount the current exercise is not a new one.
  const activeEx = session?.list[s.active]?.ex ?? null;
  const prevEx = useRef(activeEx);
  useEffect(() => {
    if (prevEx.current === activeEx) return;
    prevEx.current = activeEx;
    patch((st) => (st.rest ? { rest: null } : null));
  }, [activeEx, patch]);

  if (!session) return null;

  const count = session.list.length;
  // A freeform session starts empty; everything below tolerates having no
  // exercise to show, which is the state the "add your first one" screen is.
  const i = count ? Math.min(s.active, count - 1) : -1;
  const entry = i >= 0 ? session.list[i] : null;
  const meta = entry ? ex(entry.ex) : undefined;

  const tot = totals();
  const progressPct = tot.all ? Math.round((tot.done / tot.all) * 100) : 0;

  const doneN = entry ? entry.sets.filter((x) => x.done).length : 0;
  /** The set you're on: the first one not ticked off. */
  const liveIdx = entry ? entry.sets.findIndex((x) => !x.done) : -1;
  const sealed = !!entry && entry.sets.length > 0 && liveIdx < 0;
  const isLast = i === count - 1;

  const go = (to: number) => patch({ active: Math.max(0, Math.min(to, count - 1)) });

  /** Tick a set, filling an untouched one from last time — as the box does. */
  const logSet = (j: number) =>
    mutSession(i, (e) => {
      const cur = e.sets[j];
      if (!cur.w && !cur.reps) {
        const g = prevNums(cur.prev);
        cur.w = g.w;
        cur.reps = g.r;
      }
      cur.done = true;
    });

  /**
   * A set that isn't yours yet — dashed, unhighlighted, with whatever it is
   * you're waiting on written across it. Two things can hold it: your own
   * rest, and the buddy being mid-set. Both are advisory, both are one tap to
   * override, and either alone is enough — the rest doesn't end because they
   * got quicker, and their turn doesn't end because your clock ran out.
   */
  const held = !s.rest?.skipped && (restRunning || theirTurn);
  const waiting = held
    ? {
        label:
          theirTurn && buddyLive?.turn
            ? restLeft > 0
              ? `${buddyLive.turn} · ${mmss(restLeft)}`
              : buddyLive.turn
            : L.restLeftLabel.replace('{t}', mmss(restLeft)),
        startLabel: L.startNow,
        onStart: () => patch((st) => (st.rest ? { rest: { ...st.rest, skipped: true } } : null)),
      }
    : null;

  // Horizontal drag moves between exercises. Nothing else on this screen
  // travels sideways, so the threshold can be generous without stealing the
  // vertical scroll or a tap into an input.
  const swipe = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      count > 1 && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => {
      if (g.dx <= -50) go(i + 1);
      else if (g.dx >= 50) go(i - 1);
    },
  });

  return (
    <FullScreen zIndex={80}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>{L.logging}</Text>
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
            onPress={() => setOverview(true)}
            style={styles.posChip}
          >
            <Text style={styles.posText}>
              {count ? i + 1 : 0} / {count}
            </Text>
            <Text style={styles.posCaret}>▾</Text>
          </Pressable>
        </View>
      </View>

      <ExerciseSlide index={i}>
        <View style={styles.exercise} {...swipe.panHandlers}>
          {entry && meta ? (
            <>
              <View style={styles.exHead}>
                <View style={styles.exNameRow}>
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
                </View>
                <View style={styles.exSubRow}>
                  <Text style={styles.exSub} numberOfLines={1}>
                    {kInfo(meta.kind).text} · {gInfo(meta.group).text}
                  </Text>
                  <PopOnTrue
                    on={sealed}
                    style={[styles.exCount, { color: sealed ? c.accent400 : c.neutral600 }]}
                  >
                    {doneN}/{entry.sets.length}
                  </PopOnTrue>
                </View>
                {setup(meta.id).length > 0 && (
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

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                scrollEnabled={!scrubbing}
              >
                <View style={styles.colHead}>
                  <Text style={[styles.colLabel, styles.colIndex]}>#</Text>
                  <Text style={[styles.colLabel, styles.colPrev]}>{L.lastTime}</Text>
                  <Text style={[styles.colLabel, styles.colFlex]}>kg</Text>
                  <Text style={[styles.colLabel, styles.colFlex]}>{L.reps}</Text>
                  <View style={styles.colCheck} />
                </View>

                {entry.sets.map((set, j) => (
                  <SetRow
                    key={j}
                    index={j}
                    set={set}
                    live={j === liveIdx}
                    waiting={j === liveIdx ? waiting : null}
                    onLog={() => logSet(j)}
                    onScrub={setScrubbing}
                    onCopy={(w, r) =>
                      mutSession(i, (e) => {
                        e.sets[j].w = w;
                        e.sets[j].reps = r;
                      })
                    }
                    onW={(v) => mutSession(i, (e) => { e.sets[j].w = v; })}
                    onReps={(v) => mutSession(i, (e) => { e.sets[j].reps = v; })}
                    onToggle={(w, r) =>
                      mutSession(i, (e) => {
                        const cur = e.sets[j];
                        // Ticking an untouched set logs last time's numbers.
                        if (!cur.done && !cur.w && !cur.reps) {
                          cur.w = w;
                          cur.reps = r;
                        }
                        cur.done = !cur.done;
                      })
                    }
                  />
                ))}

                {/* Held, not tapped: this row sits right under the last set,
                    where a thumb reaching for the tick can find it. */}
                <HoldBtn
                  label={L.holdAddSet}
                  onConfirm={() =>
                    mutSession(i, (e) => {
                      const last = e.sets[e.sets.length - 1];
                      e.sets.push({ w: '', reps: '', done: false, prev: last ? last.prev : '—' });
                    })
                  }
                  style={styles.addSet}
                  labelStyle={styles.addSetLabel}
                />
              </ScrollView>
            </>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{L.emptySessionNote}</Text>
            </View>
          )}
        </View>
      </ExerciseSlide>

      <View style={[styles.footer, { paddingBottom: 10 + insets.bottom }]}>
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
              onPress={() => patch({ picker: 'session', query: '' })}
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
              onConfirm={() => go(i + 1)}
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
      </View>

      {overview && <Overview onClose={() => setOverview(false)} onJump={go} />}
    </FullScreen>
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
  const { s, L, patch, ex, exInfo, totals, clock, finishSession } = useStore();
  useBackClose(onClose);

  const session = s.session;
  if (!session) return null;
  const tot = totals();

  return (
    <Sheet zIndex={82} maxHeight="80%" onClose={onClose}>
      <H4>{session.name}</H4>
      <Text style={styles.ovSub}>
        {tot.done} {L.ofSets} {tot.all} {L.setsWord} · {clock}
      </Text>

      <View style={styles.ovList}>
        {session.list.map((entry, k) => {
          const meta = ex(entry.ex);
          const name = meta ? exInfo(meta) : { text: entry.ex, missing: false };
          const done = entry.sets.filter((x) => x.done).length;
          const all = entry.sets.length;
          const finished = all > 0 && done === all;
          const current = k === s.active;
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
            </Pressable>
          );
        })}
      </View>

      <Btn
        variant="ghost"
        label={L.addExerciseBtn}
        labelStyle={styles.ovAddLabel}
        style={styles.ovAdd}
        onPress={() => {
          onClose();
          patch({ picker: 'session', query: '' });
        }}
      />

      {/* The only way out of a session. Held while sets are still open, and a
          session with nothing ticked writes no history — which is what Discard
          used to be for. */}
      <HoldBtn
        variant="primary"
        hold={tot.done < tot.all}
        label={tot.done < tot.all ? L.holdFinish : L.finish}
        onConfirm={finishSession}
        style={styles.ovFinish}
        labelStyle={styles.ovFinishLabel}
      />
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
  const { s, L, patch, turnMode, toggleTurnMode } = useStore();
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
 * One number cell. A tap focuses it and types; a press-and-hold followed by a
 * vertical drag steps the value instead — 0.5 kg or one rep per 12px, up to
 * add — which is how most sets get entered without the keyboard ever opening.
 *
 * The hold is what makes both possible, and it has to come from
 * react-native-gesture-handler rather than a `PanResponder`: Android's
 * `ReactEditText` calls `requestDisallowInterceptTouchEvent(true)` the moment
 * a finger lands on it, which stops the root view from feeding those moves
 * into JS's responder negotiation — so a capture-phase responder wrapped
 * around a `TextInput` never reliably gets the gesture. `activateAfterLongPress`
 * is the same idea one layer down, where it works: the pan only claims the
 * touch once the finger has been down for `HOLD_MS` and still, so a quick tap
 * reaches the input underneath and a straight drag still scrolls the list.
 * Activation cancels the native touch, which also means the long-press text
 * selection menu never gets to fire.
 */
function NumCell({
  value,
  ghost,
  step,
  live,
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
  live: boolean;
  style?: StyleProp<ViewStyle>;
  onText: (v: string) => void;
  onScrub: (on: boolean) => void;
  inputRef?: RefObject<TextInput | null>;
} & TextInputProps) {
  const styles = useThemed(sheet);
  const [dragging, setDragging] = useState(false);
  // Where the drag started from. Touched only from gesture callbacks, never
  // while rendering.
  const base = useRef(0);

  // `runOnJS` because every callback here talks to React state and the store —
  // none of them are worklets, and babel-preset-expo would otherwise hand them
  // to the UI thread.
  const drag = Gesture.Pan()
    .activateAfterLongPress(HOLD_MS)
    .runOnJS(true)
    .onStart(() => {
      // An empty cell starts from last time's figure, which is what it's
      // showing as its placeholder.
      base.current = num(value, num(ghost, 0));
      setDragging(true);
      onScrub(true);
    })
    .onUpdate((g) => {
      const steps = Math.round(-g.translationY / PX_PER_STEP);
      onText(fmt(Math.max(0, base.current + steps * step)));
    })
    // Fires on release and on cancellation alike, so the list can never be
    // left unscrollable.
    .onFinalize(() => {
      setDragging(false);
      onScrub(false);
    });

  return (
    <GestureDetector gesture={drag}>
      <View style={style}>
        <Input
          ref={inputRef}
          style={[
            styles.setInput,
            live && styles.setInputLive,
            dragging && styles.setInputDragging,
          ]}
          placeholder={ghost}
          value={value}
          onChangeText={onText}
          {...input}
        />
      </View>
    </GestureDetector>
  );
}

/** One set row: dim on done, accent flash on tick, ghost figures that fly. */
function SetRow({
  index,
  set,
  live,
  waiting,
  onCopy,
  onW,
  onReps,
  onToggle,
  onLog,
  onScrub,
}: {
  index: number;
  set: { w: string; reps: string; done: boolean; prev: string };
  /** the set you're on — raised, with numbers at thumb size */
  live: boolean;
  /** the buddy is mid-set: this one is yours but not yet */
  waiting: { label: string; startLabel: string; onStart: () => void } | null;
  onCopy: (w: string, r: string) => void;
  onW: (v: string) => void;
  onReps: (v: string) => void;
  onToggle: (w: string, r: string) => void;
  /** enter on the reps field — log it, don't toggle it */
  onLog: () => void;
  onScrub: (on: boolean) => void;
}) {
  const styles = useThemed(sheet);
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
        duration: 550,
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
      duration: 320,
      easing: motion.move.easing,
      useNativeDriver: true,
    }).start(({ finished }) => finished && setFlying(false));
    catchV.setValue(1);
    Animated.timing(catchV, {
      toValue: 0,
      duration: 450,
      delay: 150,
      easing: motion.quick.easing,
      useNativeDriver: true,
    }).start();
  };

  // Row geometry: [16 index][8][66 prev][8][kg flex][8][reps flex][8][34 check].
  // Measured on the inner row, so the live row's own padding never enters it
  // and the ghost still flies from the "last time" figure into the kg cell.
  const inputW = Math.max(0, (rowW - 148) / 2);
  const flyDx = 74 + inputW / 2;

  return (
    <View style={styles.rowWrap}>
      <View style={[live && styles.liveBox, live && waiting && styles.liveBoxWaiting]}>
        <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
          <Animated.View pointerEvents="none" style={[styles.rowFlash, { opacity: flash }]} />
          <Animated.View style={[styles.setRow, { opacity: dim }]}>
            <Text style={[styles.setIndex, live && !waiting && styles.setIndexLive]}>
              {index + 1}
            </Text>
            <Pressable onPress={copy} style={styles.colPrev}>
              <Text style={styles.prevText}>{set.prev}</Text>
            </Pressable>
            <NumCell
              style={styles.colFlex}
              live={live}
              value={set.w}
              ghost={ghost.w}
              step={0.5}
              onText={onW}
              onScrub={onScrub}
              keyboardType="decimal-pad"
              // Enter walks the row: weight → reps → logged. `submit` keeps
              // the keyboard up so the hand-off doesn't flash it away.
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => repsRef.current?.focus()}
            />
            <NumCell
              style={styles.colFlex}
              live={live}
              inputRef={repsRef}
              value={set.reps}
              ghost={ghost.r}
              step={1}
              onText={onReps}
              onScrub={onScrub}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={onLog}
            />
            <AnimatedCheck
              done={set.done}
              live={live}
              onPress={() => onToggle(ghost.w, ghost.r)}
            />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.inputCatch, { opacity: catchV }]} />
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

        {live && waiting && (
          <Pressable onPress={waiting.onStart} style={styles.waitRow}>
            <Text style={styles.waitLabel} numberOfLines={1}>
              {waiting.label}
            </Text>
            <Text style={styles.waitStart}>{waiting.startLabel} ›</Text>
          </Pressable>
        )}
      </View>
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
      duration: 500,
      easing: motion.quick.easing,
      useNativeDriver: true,
    }).start();
    if (pct >= 100) {
      glow.setValue(0.7);
      Animated.timing(glow, {
        toValue: 0,
        duration: 900,
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
      duration: 550,
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
  kicker: {
    fontFamily: font.regular,
    fontSize: 10.5,
    letterSpacing: tracking(10.5, 0.08),
    textTransform: 'uppercase',
    color: color.accent,
  },
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
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** The set you're on: raised out of the ledger, numbers at thumb size. */
  liveBox: {
    marginVertical: 3,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: color.accent700,
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
  waitStart: { fontFamily: font.regular, fontSize: 11.5, color: color.accent },
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
  setIndex: { width: 16, fontFamily: font.regular, fontSize: 12, color: color.neutral600 },
  setIndexLive: { color: color.accent400 },
  prevText: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
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
    marginTop: 3,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: wash.text(8),
    borderRadius: 0,
  },
  addSetLabel: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500 },

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
    borderRadius: 6,
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

  ovSub: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, marginTop: 3 },
  ovList: { marginTop: 12 },
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
  ovAdd: { alignSelf: 'flex-start', marginTop: 8 },
  ovAddLabel: { fontSize: 12.5 },
  ovFinish: { width: '100%', height: 46, marginTop: 16 },
  ovFinishLabel: { fontSize: 15 },
}));
