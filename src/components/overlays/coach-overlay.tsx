/**
 * The AI coach, in three steps: ask, send, read back.
 *
 * One overlay rather than three, because it is one errand — and because back
 * should walk the steps rather than throw the whole thing away. Only the last
 * step writes anything, and only when the user taps Import.
 *
 * The prompt is shown in full on the way out. That is the point: it is exactly
 * what leaves the phone, which is what makes the switches on the first step
 * mean something rather than being a promise.
 *
 * The last step has two ways in: pasted, or handed over by `<Intake>` when the
 * reply arrived as a file that was tapped in another app (`coachIntake`). Both
 * land in the same place holding the same text, because the answer is text
 * either way — `parsePlan` is what reads it, and it does not care which door it
 * came through.
 */
import { router } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullScreen } from '@/components/sheet';
import {
  buildPrompt,
  GOALS,
  goalLabel,
  newCount,
  NOTE_MAX,
  parsePlan,
  resolvePlan,
  type ResolvedPlan,
} from '@/data/coach';
import { measureOf } from '@/data/exercises';
import type { Strings } from '@/data/i18n';
import { keyLifts, periodOf, trainingStats, type Region } from '@/data/stats';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, slop, t, tracking } from '@/design/tokens';
import { Btn, Chip, H2, H6, missingName, Seg, Tag } from '@/design/ui';
import { resolveNames, schemeLine, useStore } from '@/store/workout-store';

/** The muscle group an unresolvable one falls back to — a real seeded row. */
const FALLBACK = { group: 'Other' };

/** The window the coach reads. The same eight weeks the card headlines. */
const COACH_DAYS = periodOf('8w').days;

const regionLabel = (r: Region, L: Strings): string =>
  ({
    Chest: L.regionChest,
    Back: L.regionBack,
    Shoulders: L.regionShoulders,
    Arms: L.regionArms,
    Core: L.regionCore,
    Legs: L.regionLegs,
  })[r];

type Step = 'goal' | 'prompt' | 'import';

/**
 * "1 routine", "2 routines". Every count on this screen can legitimately be
 * one, and the counts are composed into three different sentences — so the
 * pieces carry their own agreement rather than each sentence needing a
 * singular twin.
 */
const nRoutines = (n: number, L: Strings) =>
  (n === 1 ? L.countRoutine : L.countRoutines).replace('{n}', String(n));
const nExercises = (n: number, L: Strings) =>
  (n === 1 ? L.countExercise : L.countExercises).replace('{n}', String(n));

export function CoachOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, allEx, ex, exInfo, gInfo, kInfo, importPlan } = useStore();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('goal');
  const [reply, setReply] = useState('');
  /** Whether the raw reply is unfolded again after a plan was read out of it. */
  const [showReply, setShowReply] = useState(false);
  /**
   * Which routines of the parsed plan are ticked. Sparse on purpose — an entry
   * is only written once you touch that row, so everything else follows the
   * default `takes` computes rather than a value frozen at parse time.
   */
  const [picked, setPicked] = useState<(boolean | undefined)[]>([]);

  /**
   * A reply that arrived whole rather than through the paste box — a file
   * tapped in a chat app, or the message itself shared into Spotter, routed
   * here by `<Intake>`. It lands on the import step with the text already read:
   * the preview, the folded reply, and Import still the only thing that writes.
   *
   * An effect rather than lazy initial state because the coach may already be
   * open when it arrives — this is the one path that covers both, and clearing
   * the key is what stops it re-seeding over a reply being edited.
   */
  useEffect(() => {
    if (!s.coachIntake) return;
    setReply(s.coachIntake);
    setPicked([]);
    setShowReply(false);
    setStep('import');
    patch({ coachIntake: null });
  }, [s.coachIntake, patch]);

  const close = () => patch({ coachOpen: false });
  // Back walks the steps. Losing a pasted answer to a stray back press would
  // mean going and fetching it out of the chat app again.
  useBackClose(() =>
    step === 'import' ? setStep('prompt') : step === 'prompt' ? setStep('goal') : close()
  );

  /**
   * Where an exercise lands when the AI names a group or equipment this phone
   * doesn't have. It has to be a row that *exists*: filing under a raw key
   * would strand the exercise outside the library's filter row, the same state
   * deleting a seeded group produces.
   *
   * Groups ship a real catch-all. Equipment does not — `DEFAULT_KINDS` is five
   * concrete kinds — so the last row stands in, which on an untouched phone is
   * Bodyweight: of the five, the likeliest thing an unnamed piece of equipment
   * turns out to be. Either way the preview says so rather than filing quietly.
   */
  const fallbackKind = s.kinds[s.kinds.length - 1]?.key ?? FALLBACK.group;

  const opts = s.coach;
  const setOpts = (d: Partial<typeof opts>) => patch({ coach: { ...opts, ...d } });

  const stats = trainingStats(s.history, ex, COACH_DAYS);
  const lifts = keyLifts(s.history, ex, COACH_DAYS);
  const library = allEx();

  const prompt = buildPrompt({
    opts,
    stats,
    lifts,
    library,
    groupKeys: s.groups.filter((g) => gInfo(g.key).text).map((g) => g.key),
    kindKeys: s.kinds.map((k) => k.key),
    profile: s.profile,
    periodLabel: L.period8w,
    sessionCount: (n) =>
      (n === 1 ? L.statsFootSession : L.statsFootSessions).replace('{n}', String(n)),
    regionName: (r) => regionLabel(r, L),
    exName: (e) => exInfo(e).text,
    kindName: (k) => kInfo(k).text,
    L,
  });

  /* — reading the answer — */

  const parsed = reply.trim() ? parsePlan(reply) : null;
  const plan: ResolvedPlan | null =
    parsed?.ok
      ? resolvePlan(
          parsed.plan,
          library,
          s.groups.map((g) => g.key),
          s.kinds.map((k) => k.key),
          // Through the store's resolver, not `r.names[s.lang] ?? …`: an empty
          // string for the current language is not nullish, so the raw form let
          // a routine whose name is '' in this language compare as blank and
          // miss the duplicate flag — arriving ticked as a second "Push A".
          s.routines.map((r) => resolveNames(r.names, s.lang).text),
          { group: FALLBACK.group, kind: fallbackKind }
        )
      : null;

  /**
   * Whether routine `i` is ticked, and what it defaults to.
   *
   * A routine this phone already has a name for starts **off** — the same rule
   * a backup merge follows: what is here wins, and the import fills gaps. It
   * used to start on, which meant the one thing the preview warned about was
   * also the one thing it did by default, and you left with two routines called
   * Push A.
   *
   * Unlike the restore sheet's empty rows it stays *tickable*, and that
   * difference is the point: an empty row has nothing to add, where the AI's
   * "Push A" may be a genuinely different workout that happens to share a name.
   * The tag says which case you're in and the tick is how you overrule it.
   */
  const takes = (i: number) => picked[i] ?? (plan ? !plan.routines[i].duplicate : true);

  const chosen = plan ? plan.routines.filter((_, i) => takes(i)) : [];
  const chosenRefs = new Set(chosen.flatMap((r) => r.items.map((it) => it.ref)));
  const chosenNew = plan
    ? plan.exercises.filter((e, i) => !e.existingId && chosenRefs.has(i)).length
    : 0;

  /**
   * Import, then leave — onto the Routines tab, where what you just accepted
   * actually is.
   *
   * The confirmation line this used to show ("Imported. 2 routines added.") was
   * a dead end: it left you on the import screen, holding a reply you were done
   * with, one back press from a prompt step you had no reason to revisit. The
   * list is the better answer to "did that work?" — the app's own habit of
   * showing the thing rather than announcing it.
   *
   * Insights closes with the coach, because it is what the coach was opened
   * over and dropping back onto it would put a screen between you and the
   * routines you came for.
   */
  const doImport = () => {
    if (!plan) return;
    importPlan(plan, plan.routines.map((_, i) => takes(i)));
    patch({ coachOpen: false, statsOpen: false });
    router.push('/routines');
  };

  /* — chrome — */

  const back = () =>
    step === 'import' ? setStep('prompt') : step === 'prompt' ? setStep('goal') : close();

  const weakList = stats.weak
    .slice(0, 3)
    .map((w) => regionLabel(w.region, L))
    .join(', ');

  return (
    <FullScreen zIndex={77}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.back} labelStyle={styles.backLabel} onPress={back} />
        <View style={styles.dots}>
          {(['goal', 'prompt', 'import'] as Step[]).map((k) => (
            <View key={k} style={[styles.dot, step === k && styles.dotOn]} />
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 'goal' && (
          <>
            <H2 size={t.h2} style={styles.tight}>
              {L.coach}
            </H2>
            <Text style={styles.sub}>{L.coachSub.replace('{period}', L.period8w)}</Text>

            <H6 style={styles.head}>{L.coachGoalHead}</H6>
            <View style={styles.chips}>
              {GOALS.map((g) => (
                <Chip
                  key={g}
                  label={goalLabel(g, L)}
                  on={opts.goal === g}
                  onPress={() => setOpts({ goal: g })}
                />
              ))}
            </View>
            {/* The screen says why "Fix weak points" is already picked — a
                default nobody can see the reason for reads as an opinion. */}
            {weakList !== '' && opts.goal === 'weak' && (
              <Text style={styles.hint}>{L.coachWeakPreselect.replace('{list}', weakList)}</Text>
            )}

            <H6 style={styles.head}>{L.coachWeekHead}</H6>
            <Seg
              options={[2, 3, 4, 5].map((n) => ({
                key: String(n),
                label: String(n),
                on: opts.perWeek === n,
                pick: () => setOpts({ perWeek: n }),
              }))}
            />

            {/* Seeded from the user's own equipment list, renames included, so
                the plan comes back in gear that exists in this library. */}
            <H6 style={styles.head}>{L.coachGearHead}</H6>
            <View style={styles.chips}>
              {s.kinds.map((k) => {
                const info = kInfo(k.key);
                if (!info.text) return null;
                const on = opts.kinds.includes(k.key);
                return (
                  <Chip
                    key={k.key}
                    label={info.text}
                    missing={info.missing}
                    on={on}
                    onPress={() =>
                      setOpts({
                        kinds: on
                          ? opts.kinds.filter((x) => x !== k.key)
                          : [...opts.kinds, k.key],
                      })
                    }
                  />
                );
              })}
            </View>

            {/* The widest thing on the screen and the cheapest: six chips and
                a seg are a taxonomy, and everything they can't say — a
                fortnight's rotation, every second day, a shoulder to work
                around — is a sentence. Uncontrolled, like every other
                store-backed field here: the editor's `defaultValue` grammar,
                which keeps a keystroke off the round trip through `patch`.
                The step unmounts on the way forward, so it re-seeds on back. */}
            <H6 style={styles.head}>{L.coachNoteHead}</H6>
            <TextInput
              multiline
              maxLength={NOTE_MAX}
              defaultValue={opts.note ?? ''}
              onChangeText={(v) => setOpts({ note: v })}
              placeholder={L.coachNotePlaceholder}
              placeholderTextColor={c.neutral600}
              cursorColor={c.accent}
              selectionColor={c.accent}
              style={styles.note}
              textAlignVertical="top"
            />

            <H6 style={styles.head}>{L.coachShareHead}</H6>
            {/* The first two rows are what the statistics *are* — there is no
                prompt without them, so they are stated rather than offered.
                The third is the only personal data in the flow and is off. */}
            {[L.coachShareBalance, L.coachShareLifts].map((label) => (
              <View key={label} style={styles.shareRow}>
                {/* Ticked, and greyed rather than accented: it is on and it is
                    not a choice. An empty box here read as "off", which was
                    the opposite of true. */}
                <View style={[styles.tick, styles.tickFixed]}>
                  <Text style={styles.tickMarkFixed}>✓</Text>
                </View>
                <Text style={styles.shareLabel}>{label}</Text>
              </View>
            ))}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: opts.shareProfile }}
              hitSlop={slop}
              onPress={() => setOpts({ shareProfile: !opts.shareProfile })}
              style={styles.shareRow}
            >
              <View style={[styles.tick, opts.shareProfile && styles.tickOn]}>
                {opts.shareProfile && <Text style={styles.tickMark}>✓</Text>}
              </View>
              <Text style={styles.shareLabel}>{L.coachShareProfile}</Text>
              <Text style={styles.shareSub}>{L.coachShareProfileSub}</Text>
            </Pressable>
            <Text style={styles.hint}>{L.coachPrivacy}</Text>

            <Btn
              variant="primary"
              block
              label={L.coachCreate}
              style={styles.cta}
              onPress={() => setStep('prompt')}
            />
          </>
        )}

        {step === 'prompt' && (
          <>
            <H2 size={t.h2} style={styles.tight}>
              {L.promptTitle}
            </H2>
            <Text style={styles.sub}>
              {goalLabel(opts.goal, L)} · {L.promptWeek.replace('{n}', String(opts.perWeek))}
            </Text>

            {/* Selectable rather than scrolled-past: the share sheet is the
                way out, but a phone whose share target refuses text should
                still let the prompt be lifted by hand. */}
            <Text selectable style={styles.prompt}>
              {prompt}
            </Text>

            <Btn
              variant="primary"
              block
              label={L.promptShare}
              style={styles.cta}
              onPress={() => {
                Share.share({ message: prompt }).catch(() => {});
              }}
            />
            <Text style={styles.hint}>{L.promptShareHint}</Text>

            <Btn
              variant="secondary"
              block
              label={L.promptHaveAnswer}
              style={styles.cta}
              onPress={() => setStep('import')}
            />
          </>
        )}

        {step === 'import' && (
          <>
            <H2 size={t.h2} style={styles.tight}>
              {L.importTitle}
            </H2>
            {!plan && <Text style={styles.sub}>{L.importPasteHint}</Text>}

            {/* Once a plan has been read the box has done its job, and what
                matters is the routines under it — so it folds away to a link
                rather than sitting there as the largest thing on the screen.
                It stays reachable, because a reply whose JSON needs a nudge is
                exactly the case where you want the raw text back. A parse that
                *failed* keeps the box open: that is the one time editing it is
                the whole point. */}
            {plan && !showReply ? (
              <Pressable hitSlop={slop} onPress={() => setShowReply(true)}>
                <Text style={styles.reveal}>{L.importShowReply}</Text>
              </Pressable>
            ) : (
              <TextInput
                multiline
                value={reply}
                onChangeText={(v) => {
                  setReply(v);
                  setPicked([]);
                }}
                placeholder={L.importPaste}
                placeholderTextColor={c.neutral600}
                cursorColor={c.accent}
                selectionColor={c.accent}
                style={styles.paste}
                textAlignVertical="top"
              />
            )}

            {parsed && !parsed.ok && (
              <Text style={styles.error}>
                {parsed.reason === 'none'
                  ? L.importNoBlock
                  : parsed.reason === 'json'
                    ? L.importBadJson
                    : L.importBadShape}
              </Text>
            )}

            {plan && (
              <>
                <Text style={styles.found}>
                  {L.importFound
                    .replace('{r}', nRoutines(plan.routines.length, L))
                    .replace('{e}', nExercises(plan.exercises.length, L))}
                  {newCount(plan) > 0 && '  '}
                  {newCount(plan) > 0 && (
                    <Text style={styles.newCount}>
                      {L.importNew.replace('{n}', String(newCount(plan)))}
                    </Text>
                  )}
                </Text>

                {plan.routines.map((r, i) => {
                  const on = takes(i);
                  return (
                    <View key={`${r.name}-${i}`} style={[styles.card, !on && styles.cardOff]}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        hitSlop={slop}
                        onPress={() =>
                          setPicked((p) => {
                            // Normalised against the same defaults, or the
                            // rows nobody has touched would flip to `true` the
                            // moment a neighbour is tapped.
                            const next = plan.routines.map((_, k) => p[k] ?? !plan.routines[k].duplicate);
                            next[i] = !on;
                            return next;
                          })
                        }
                        style={styles.cardHead}
                      >
                        <View style={[styles.tick, on && styles.tickOn]}>
                          {on && <Text style={styles.tickMark}>✓</Text>}
                        </View>
                        <Text style={[styles.routineName, !on && styles.dim]}>{r.name}</Text>
                        {r.duplicate && <Tag label={L.importDuplicate} tone="neutral" />}
                      </Pressable>

                      {r.items.map((it, k) => {
                        const res = plan.exercises[it.ref];
                        const existing = res.existingId ? ex(res.existingId) : undefined;
                        const info = existing ? exInfo(existing) : null;
                        const m = existing ? measureOf(existing) : res.create!.measure;
                        // `resolvePlan` has already broken any pair whose other
                        // half was dropped, so the trailing test is belt and
                        // braces — and it is the same test the editor makes,
                        // which is what keeps the two drawings honest about the
                        // same data. A pair arriving unannounced and only
                        // turning up afterwards in the routine would be the one
                        // thing this screen exists to prevent.
                        const paired = it.with === 'next' && k < r.items.length - 1;
                        return (
                          <Fragment key={`${it.name}-${k}`}>
                            <View
                              style={[
                                styles.itemRow,
                                k < r.items.length - 1 && !paired && styles.ruled,
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.itemName,
                                  info?.missing && missingName(c),
                                  !on && styles.dim,
                                ]}
                              >
                                {info ? info.text : it.name}
                              </Text>
                              <Tag
                                label={res.existingId ? L.importInLibrary : L.importNewTag}
                                tone={res.existingId ? 'neutral' : 'accent'}
                              />
                              {/* Written the way its measure reads, so a plank
                                  and a run are legible in the same list. */}
                              <Text style={styles.itemScheme}>
                                {schemeLine({ sets: it.sets, reps: it.reps, w: it.kg }, m, L)}
                              </Text>
                            </View>
                            {/* The rule between the two rows *is* the pair —
                                the editor's own construction, a hairline in the
                                gutter and the word, rather than a badge beside a
                                name that would read as a property of one row. */}
                            {paired && (
                              <View style={styles.pairGap}>
                                <View style={styles.pairGlyph}>
                                  <View style={styles.pairRule} />
                                </View>
                                <Text style={[styles.pairLabel, !on && styles.dim]}>
                                  {L.superset}
                                </Text>
                              </View>
                            )}
                          </Fragment>
                        );
                      })}
                    </View>
                  );
                })}

                {/* Everything the plan asked for that this phone can't do,
                    said in words rather than silently dropped. */}
                {plan.exercises.some((e) => e.guessedGroup || e.guessedKind) && (
                  <Text style={styles.foot}>
                    {L.importGuessed
                      .replace('{group}', gInfo(FALLBACK.group).text || FALLBACK.group)
                      .replace('{kind}', kInfo(fallbackKind).text || fallbackKind)}
                  </Text>
                )}
                {plan.dropped.length > 0 && (
                  <Text style={styles.foot}>
                    {L.importDropped.replace('{n}', String(plan.dropped.length))}
                  </Text>
                )}

                <Btn
                  variant="primary"
                  block
                  disabled={chosen.length === 0}
                  label={
                    chosen.length === 0
                      ? L.importDoNothing
                      : L.importDo
                          .replace('{r}', nRoutines(chosen.length, L))
                          .replace('{e}', nExercises(chosenNew, L))
                  }
                  style={styles.cta}
                  onPress={doImport}
                />
                {/* Said out loud now that a duplicate arrives unticked: the
                    promise is the same one the restore sheet makes, in the
                    same words, because it is the same rule. */}
                <Text style={styles.hint}>{L.addOnlyMissing}</Text>

                {/* Saying no is an act, not the absence of one. Without it the
                    only way out of a plan you don't want is the back arrow,
                    which for a reply that arrived from outside the app means
                    backing into a prompt step you never asked to see. */}
                <Btn
                  variant="secondary"
                  block
                  label={L.importDiscard}
                  style={styles.cta}
                  onPress={() => {
                    setReply('');
                    setPicked([]);
                    setShowReply(false);
                    setStep('goal');
                  }}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </FullScreen>
  );
}

const sheet = themed(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  backLabel: { fontSize: 13 },
  /** Three steps, three dots — where you are in an errand with a middle. */
  dots: { flexDirection: 'row', gap: 5, marginLeft: 'auto', marginRight: 14 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.neutral700 },
  dotOn: { backgroundColor: color.accent },

  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  sub: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500, marginTop: 3 },
  head: { marginTop: 20, marginBottom: 8, color: color.neutral500 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  hint: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 11 * 1.45,
    color: color.neutral600,
    marginTop: 8,
  },
  cta: { marginTop: 16 },

  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  tick: {
    width: 17,
    height: 17,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Not a choice: the statistics are the prompt. Drawn on, never pressable. */
  tickFixed: { borderColor: color.neutral700, backgroundColor: color.neutral800 },
  tickOn: { borderColor: color.accent, backgroundColor: color.accent800 },
  tickMark: { fontFamily: font.regular, fontSize: 10, color: color.accent100 },
  tickMarkFixed: { fontFamily: font.regular, fontSize: 10, color: color.neutral400 },
  shareLabel: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  shareSub: {
    marginLeft: 'auto',
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral600,
  },

  prompt: {
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.neutral800,
    backgroundColor: color.surface,
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 11 * 1.55,
    color: color.neutral400,
  },

  /** The free-text ask. `paste`'s box at a sentence's height rather than a
      whole reply's — it is one or two lines, not a pasted message. */
  note: {
    marginTop: 0,
    minHeight: 66,
    padding: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.divider,
    backgroundColor: color.surface,
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.45,
    color: color.text,
  },

  paste: {
    marginTop: 12,
    minHeight: 132,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.divider,
    backgroundColor: color.surface,
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.text,
  },
  /** The folded reply's way back open — the app's ghost-link grammar. */
  reveal: {
    marginTop: 12,
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.accent,
  },
  error: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.45,
    color: color.neutral400,
    marginTop: 12,
  },
  found: { fontFamily: font.regular, fontSize: 13, color: color.neutral400, marginTop: 16 },
  newCount: { color: color.accent200 },

  card: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.neutral800,
    // Stated for the reason hold-btn's is — a re-ticked card has to be told it
    // is solid again, or it keeps the dashes `cardOff` put on the paint.
    borderStyle: 'solid',
  },
  cardOff: { opacity: 0.5, borderStyle: 'dashed' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  routineName: { flex: 1, fontFamily: font.heading, fontSize: 14.5, color: color.text },
  dim: { color: color.neutral500 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  /* The routine editor's pair mark at preview scale — same hairline, same
     accent, same uppercase word, so one feature reads one way in both places. */
  pairGap: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 14 },
  pairGlyph: { width: 12, height: 14, alignItems: 'center', justifyContent: 'center' },
  pairRule: { width: 1, height: 14, backgroundColor: color.accent700 },
  pairLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.06),
    textTransform: 'uppercase',
    color: color.accent400,
  },
  ruled: { borderBottomWidth: 1, borderBottomColor: t.rule },
  itemName: { flex: 1, fontFamily: font.regular, fontSize: 13, color: color.text },
  itemScheme: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral500,
    fontVariant: ['tabular-nums'],
  },

  foot: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 11 * 1.45,
    color: color.neutral600,
    marginTop: 12,
  },
}));
