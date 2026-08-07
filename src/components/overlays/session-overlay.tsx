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
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECK_D, Icon } from '@/components/icon';
import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { useBuddyLive } from '@/hooks/use-buddy-live';
import { color, font, t, tracking, wash } from '@/design/tokens';
import { Btn, H3, Input, missingName, Tag } from '@/design/ui';
import { prevNums, useStore } from '@/store/workout-store';

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
          <Text style={styles.count}>
            {tot.done} {L.ofSets} {tot.all} {L.setsWord}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progressPct}%` }]} />
        </View>
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
                  <Text
                    style={[
                      styles.cardCount,
                      { color: allDone ? color.accent400 : color.neutral600 },
                    ]}
                  >
                    {doneN}/{entry.sets.length}
                  </Text>
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
                      {entry.sets.map((set, j) => {
                        const ghost = prevNums(set.prev);
                        return (
                          <View key={j} style={[styles.setRow, { opacity: set.done ? 0.6 : 1 }]}>
                            <Text style={styles.setIndex}>{j + 1}</Text>
                            <Pressable
                              onPress={() =>
                                mutSession(i, (e) => {
                                  e.sets[j].w = ghost.w;
                                  e.sets[j].reps = ghost.r;
                                })
                              }
                              style={styles.colPrev}
                            >
                              <Text style={styles.prevText}>{set.prev}</Text>
                            </Pressable>
                            <Input
                              style={[styles.setInput, styles.colFlex]}
                              keyboardType="decimal-pad"
                              placeholder={ghost.w}
                              value={set.w}
                              onChangeText={(v) => mutSession(i, (e) => { e.sets[j].w = v; })}
                            />
                            <Input
                              style={[styles.setInput, styles.colFlex]}
                              keyboardType="number-pad"
                              placeholder={ghost.r}
                              value={set.reps}
                              onChangeText={(v) => mutSession(i, (e) => { e.sets[j].reps = v; })}
                            />
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: set.done }}
                              onPress={() =>
                                mutSession(i, (e) => {
                                  const cur = e.sets[j];
                                  // Ticking an untouched set logs last time's numbers.
                                  if (!cur.done && !cur.w && !cur.reps) {
                                    cur.w = ghost.w;
                                    cur.reps = ghost.r;
                                  }
                                  cur.done = !cur.done;
                                })
                              }
                              style={[
                                styles.check,
                                {
                                  backgroundColor: set.done ? color.accent800 : 'transparent',
                                  borderColor: set.done ? color.accent600 : color.divider,
                                },
                              ]}
                            >
                              <Icon
                                d={CHECK_D}
                                size={15}
                                strokeWidth={2.2}
                                color={set.done ? color.accent100 : color.neutral700}
                              />
                            </Pressable>
                          </View>
                        );
                      })}

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
        <Btn
          variant="secondary"
          label={L.discard}
          style={styles.discard}
          onPress={() => patch({ session: null })}
        />
        <Btn
          variant="primary"
          label={L.finish}
          style={styles.finish}
          labelStyle={styles.finishLabel}
          onPress={finishSession}
        />
      </View>
    </FullScreen>
  );
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
  fill: { height: '100%', borderRadius: 2, backgroundColor: color.accent },

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
  },

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
  discard: { flex: 1, height: 44 },
  finish: { flex: 2, height: 44 },
  finishLabel: { fontSize: 15 },
});
