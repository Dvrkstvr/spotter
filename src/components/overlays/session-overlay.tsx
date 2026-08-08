/**
 * The live session — the screen you actually stand in the gym with.
 *
 * One card per exercise; the focused one opens to its set rows. Tapping the
 * greyed "last time" figure copies those numbers in, and ticking an untouched
 * set fills it from last time rather than logging a blank.
 *
 * In a shared session the buddy bar goes live: their exercise, their set
 * count, whose turn it is. All of it advisory — nothing here ever blocks
 * input on what the other phone does (or forgets) to tap.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { HoldBtn } from '@/components/hold-btn';
import { CHECK_D } from '@/components/icon';
import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { useBuddyLive } from '@/hooks/use-buddy-live';
import { color, fill as absFill, font, motion, radius, t, tracking, wash } from '@/design/tokens';
import { Btn, H3, Input, missingName, Tag } from '@/design/ui';
import { prevNums, useStore } from '@/store/workout-store';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** CHECK_D's path length in its 24×24 viewBox — the draw-on dash budget. */
const CHECK_LEN = 25;

export function SessionOverlay() {
  const { s, L, patch, ex, gInfo, kInfo, exInfo, setup, mutSession, totals, finishSession } =
    useStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const buddyLive = useBuddyLive();

  // Gym phones lock constantly, and a lock kills the Nearby link — keep the
  // screen on while a session is open. Also just right for a logging screen.
  useKeepAwake();

  // No back route in the design — only Discard and Finish. Swallow it so a
  // stray press cannot throw away a workout in progress.
  useBackClose(() => {}, { swallow: true });

  const session = s.session;

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
  }, [doneCount, tick]);

  if (!session) return null;

  const tot = totals();
  const progressPct = tot.all ? Math.round((tot.done / tot.all) * 100) : 0;

  return (
    <FullScreen zIndex={80}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>{L.logging}</Text>
            <H3 size={22} style={styles.title}>
              {session.name}
            </H3>
          </View>
          <Animated.Text style={[styles.count, { transform: [{ translateY: tick }] }]}>
            {tot.done} {L.ofSets} {tot.all} {L.setsWord}
          </Animated.Text>
        </View>
        <ProgressBar pct={progressPct} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 10 }}>
          {session.list.map((entry, i) => {
            const meta = ex(entry.ex);
            if (!meta) return null;
            const active = i === s.active;
            const doneN = entry.sets.filter((x) => x.done).length;
            const allDone = doneN === entry.sets.length && entry.sets.length > 0;
            const settings = setup(meta.id);
            // There is no next exercise past the last one, so that row closes
            // out the workout instead of going nowhere.
            const isLast = i === session.list.length - 1;

            return (
              <View
                key={`${entry.ex}-${i}`}
                style={[
                  styles.card,
                  { borderColor: active ? color.accent700 : 'transparent' },
                ]}
              >
                <Pressable onPress={() => patch({ active: i })} style={styles.cardHead}>
                  <View style={styles.cardHeadText}>
                    <Text style={[styles.cardName, exInfo(meta).missing && missingName]}>
                      {exInfo(meta).text}
                    </Text>
                    <Text style={styles.cardSub}>
                      {kInfo(meta.kind).text} · {gInfo(meta.group).text}
                    </Text>
                  </View>
                  <PopOnTrue
                    on={allDone}
                    style={[
                      styles.cardCount,
                      { color: allDone ? color.accent400 : color.neutral600 },
                    ]}
                  >
                    {doneN}/{entry.sets.length}
                  </PopOnTrue>
                </Pressable>

                {active && (
                  <View style={styles.cardBody}>
                    <View style={styles.setupRow}>
                      {settings.length > 0 && (
                        <View style={styles.setupTags}>
                          {settings.map((p, k) => (
                            <Tag
                              key={k}
                              tone="accent"
                              label={`${p[0]} ${p[1]}`}
                              textStyle={styles.setupTagText}
                            />
                          ))}
                        </View>
                      )}
                      <View style={styles.spacer} />
                      <Btn
                        variant="secondary"
                        label={L.howTo}
                        labelStyle={styles.howToLabel}
                        style={styles.howToBtn}
                        onPress={() => patch({ instrOpen: meta.id })}
                      />
                    </View>

                    <View style={styles.colHead}>
                      <Text style={[styles.colLabel, styles.colIndex]}>#</Text>
                      <Text style={[styles.colLabel, styles.colPrev]}>{L.lastTime}</Text>
                      <Text style={[styles.colLabel, styles.colFlex]}>kg</Text>
                      <Text style={[styles.colLabel, styles.colFlex]}>{L.reps}</Text>
                      <View style={styles.colCheck} />
                    </View>

                    <View style={{ gap: 5 }}>
                      {entry.sets.map((set, j) => (
                        <SetRow
                          key={j}
                          index={j}
                          set={set}
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

                      <Pressable
                        onPress={() =>
                          mutSession(i, (e) => {
                            const last = e.sets[e.sets.length - 1];
                            e.sets.push({ w: '', reps: '', done: false, prev: last ? last.prev : '—' });
                          })
                        }
                        style={styles.addSet}
                      >
                        <Text style={styles.addSetPlus}>+</Text>
                        <Text style={styles.addSetLabel}>{L.addSet}</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() =>
                        isLast
                          ? finishSession()
                          : patch((st) => ({
                              active: Math.min(st.active + 1, (st.session?.list.length ?? 1) - 1),
                            }))
                      }
                      style={styles.next}
                    >
                      <Text style={[styles.nextLabel, isLast && styles.nextLabelFinish]}>
                        {isLast ? L.finishWorkout : L.nextExercise}
                      </Text>
                      <Text style={styles.nextChevron}>›</Text>
                    </Pressable>
                  </View>
                )}
                <SealFx sealed={allDone} />
              </View>
            );
          })}
        </View>

        <Btn
          variant="secondary"
          block
          label={L.addExerciseBtn}
          style={styles.addExercise}
          onPress={() => patch({ picker: 'session', query: '' })}
        />
      </ScrollView>

      {s.buddy && (
        // Deliberately minimal — one glanceable line. Tapping tucks the
        // session behind the tabs and opens Profile, where the full
        // co-session detail lives; the tab bar grows a resume strip.
        <Pressable
          onPress={() => {
            patch({ sessionMin: true });
            router.navigate('/you');
          }}
          style={styles.buddyBar}
        >
          <View style={styles.buddyAvatar}>
            <Text style={styles.buddyInitial}>{s.buddy[0]}</Text>
          </View>
          <Text style={styles.buddyName} numberOfLines={1}>
            {s.buddy}
          </Text>
          <Text style={styles.buddyStatus} numberOfLines={1}>
            {buddyLive ? (buddyLive.turn ?? buddyLive.text) : L.trainingWith}
          </Text>
          <Text style={styles.buddyChevron}>›</Text>
        </Pressable>
      )}

      <View style={[styles.footer, { paddingBottom: 10 + insets.bottom }]}>
        {/* Throwing a session away is always a held gesture; finishing only
            needs the guard while sets are still open. */}
        <HoldBtn
          label={L.holdDiscard}
          onConfirm={() => patch({ session: null })}
          style={styles.discard}
        />
        <HoldBtn
          variant="primary"
          hold={tot.done < tot.all}
          label={tot.done < tot.all ? L.holdFinish : L.finish}
          onConfirm={finishSession}
          style={styles.finish}
          labelStyle={styles.finishLabel}
        />
      </View>
    </FullScreen>
  );
}

/* ── animated pieces ─────────────────────────────────────────────────────
   The driving Animated.Values live in lazy state (they are read while
   rendering, which the React Compiler does not allow of refs); "did this
   prop just flip" refs are only touched inside effects. */

/** One set row: dim on done, accent flash on tick, ghost figures that fly. */
function SetRow({
  index,
  set,
  onCopy,
  onW,
  onReps,
  onToggle,
}: {
  index: number;
  set: { w: string; reps: string; done: boolean; prev: string };
  onCopy: (w: string, r: string) => void;
  onW: (v: string) => void;
  onReps: (v: string) => void;
  onToggle: (w: string, r: string) => void;
}) {
  const ghost = prevNums(set.prev);
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
  const inputW = Math.max(0, (rowW - 148) / 2);
  const flyDx = 74 + inputW / 2;

  return (
    <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
      <Animated.View pointerEvents="none" style={[styles.rowFlash, { opacity: flash }]} />
      <Animated.View style={[styles.setRow, { opacity: dim }]}>
        <Text style={styles.setIndex}>{index + 1}</Text>
        <Pressable onPress={copy} style={styles.colPrev}>
          <Text style={styles.prevText}>{set.prev}</Text>
        </Pressable>
        <Input
          style={[styles.setInput, styles.colFlex]}
          keyboardType="decimal-pad"
          placeholder={ghost.w}
          value={set.w}
          onChangeText={onW}
        />
        <Input
          style={[styles.setInput, styles.colFlex]}
          keyboardType="number-pad"
          placeholder={ghost.r}
          value={set.reps}
          onChangeText={onReps}
        />
        <AnimatedCheck done={set.done} onPress={() => onToggle(ghost.w, ghost.r)} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.inputCatch, { opacity: catchV }]} />
      {flying && (
        <View pointerEvents="none" style={styles.flyerLane}>
          <Animated.Text
            style={[
              styles.flyerText,
              {
                opacity: fly.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.95, 0.6, 0] }),
                transform: [
                  { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, flyDx] }) },
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

/** The tick target: accent fill fades up while the checkmark strokes itself on. */
function AnimatedCheck({ done, onPress }: { done: boolean; onPress: () => void }) {
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
      style={[styles.check, { borderColor: done ? color.accent600 : color.divider }]}
    >
      <Animated.View pointerEvents="none" style={[styles.checkFill, { opacity: draw }]} />
      <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
        {/* The faint preview check the design shows on unticked sets. */}
        <Path
          d={CHECK_D}
          stroke={color.neutral700}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          d={CHECK_D}
          stroke={color.accent100}
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
 * The card's sealed state: a hairline of light sweeps the top edge, then the
 * border settles on accent-700. Plays when the last set goes green, unwinds
 * quietly if a set is unticked.
 */
function SealFx({ sealed }: { sealed: boolean }) {
  const [sweep] = useState(() => new Animated.Value(0));
  const [border] = useState(() => new Animated.Value(sealed ? 1 : 0));
  const [w, setW] = useState(0);
  const prev = useRef(sealed);

  useEffect(() => {
    if (prev.current === sealed) return;
    prev.current = sealed;
    if (sealed) {
      sweep.setValue(0);
      Animated.timing(sweep, {
        toValue: 1,
        duration: 550,
        easing: motion.move.easing,
        useNativeDriver: true,
      }).start();
      Animated.timing(border, {
        toValue: 1,
        duration: 500,
        delay: 250,
        easing: motion.quick.easing,
        useNativeDriver: true,
      }).start();
    } else {
      sweep.setValue(0);
      Animated.timing(border, { toValue: 0, ...motion.quick, useNativeDriver: true }).start();
    }
  }, [sealed, sweep, border]);

  const sweepW = w * 0.4;
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.sealBorder, { opacity: border }]} />
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
                {
                  translateX: sweep.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-sweepW, w],
                  }),
                },
              ],
            }}
          >
            <LinearGradient
              colors={['transparent', color.accent300, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}
      </View>
    </>
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

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 10 },
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
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: color.neutral800,
    marginTop: 10,
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

  scroll: { flex: 1 },
  body: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  card: {
    borderRadius: t.cardRadius,
    backgroundColor: t.exBg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  cardHeadText: { flex: 1 },
  cardName: { fontFamily: font.regular, fontSize: 14.5, color: color.text },
  cardSub: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  cardCount: { fontFamily: font.regular, fontSize: 11.5 },
  cardBody: { paddingHorizontal: 12, paddingBottom: 12 },

  setupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  setupTags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  setupTagText: { fontSize: 10.5 },
  spacer: { flex: 1 },
  howToBtn: { paddingVertical: 4, paddingHorizontal: 9 },
  howToLabel: { fontSize: 11.5 },

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

  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowFlash: { ...absFill, borderRadius: radius.sm, backgroundColor: wash.accent(12) },
  /** Over the two inputs — left of them sit 16+66 plus two 8px gaps, right the 34px check plus one. */
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
  check: {
    width: 34,
    height: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  checkFill: { ...absFill, backgroundColor: color.accent800 },
  sealBorder: {
    ...absFill,
    borderWidth: 1,
    borderRadius: t.cardRadius,
    borderColor: color.accent700,
  },
  sealTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, overflow: 'hidden' },

  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: wash.text(8),
  },
  addSetPlus: { width: 16, fontFamily: font.regular, fontSize: 13, color: color.accent },
  addSetLabel: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.neutral500 },

  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: wash.text(8),
  },
  nextLabel: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.neutral400 },
  /** The closing action reads in the accent, like every other terminal action. */
  nextLabelFinish: { color: color.accent },
  nextChevron: { fontFamily: font.regular, fontSize: 14, color: color.accent },

  addExercise: { marginTop: 12, height: 40 },

  buddyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: color.surface,
    borderLeftWidth: 2,
    borderLeftColor: color.accent,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  buddyAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buddyInitial: { fontFamily: font.regular, fontSize: 11, color: color.accent200 },
  buddyName: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.text },
  buddyStatus: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.accent400,
    maxWidth: '55%',
  },
  buddyChevron: { fontFamily: font.regular, fontSize: 14, color: color.accent },

  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  /** The design splits 1:2, but "Hold to discard" needs more room than the
      design's tap-label "Discard" — 1.4:1.6 keeps Finish dominant without
      truncating the hold labels. */
  discard: { flex: 1.4, height: 44 },
  finish: { flex: 1.6, height: 44 },
  finishLabel: { fontSize: 15 },
});
