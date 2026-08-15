/**
 * First-run setup — the welcome tour, and the only screen that exists before
 * the app does.
 *
 * Mounted while `!onboarded || onboardingOpen`, above everything (z 95): on a
 * true first run it *is* the app, and reopened from Settings it has to cover
 * whatever was under it. The two entrances share every screen; the only
 * difference is that back can leave a reopened tour, where a first run's
 * back walks steps and stops at the first one — there is nothing to fall
 * back to.
 *
 * Everything here drafts locally and lands in one `applyOnboarding` patch on
 * the last screen. That is what makes abandoning safe at any point: a killed
 * first run has written nothing but `onboarded: false`, so the flow simply
 * comes back; a reopened one leaves no half-applied picks behind. The two
 * exceptions are the permission cards, which act immediately — a permission
 * dialog is already an irreversible conversation with Android, and Train
 * alone flipping on the spot is the honest preview of what declining means.
 */
import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECK_D, Icon } from '@/components/icon';
import { FullScreen } from '@/components/sheet';
import { ensureRadioPermissions, hasRadio, sayGoodbye } from '@/data/buddy-radio';
import {
  DEFAULT_ROUTINES,
  Level,
  measureOf,
  Routine,
  routineInStyle,
  routineStyleScore,
  scaleItem,
  StyleKey,
  STYLE_KEYS,
} from '@/data/exercises';
import { DAYS_SHORT, Lang, Strings } from '@/data/i18n';
import { weekSlots } from '@/data/plan';
import { ensureAlarmPermission } from '@/data/rest-alarm';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, fill, font, motion, radius, t, tracking, wash } from '@/design/tokens';
import { Btn, CardKicker, H2, H3, H6, missingName } from '@/design/ui';
import { Profile, resolveNames, schemeLine, useStore } from '@/store/workout-store';

/* ── step order ──────────────────────────────────────────────────────────── */

const STEPS = ['welcome', 'how', 'you', 'perms', 'style', 'level', 'pick', 'week', 'done'] as const;
type Step = (typeof STEPS)[number];

/* ── glyphs (24×24, the app's stroke grammar) ───────────────────────────── */

const FEAT_TICK_D = 'M4.5 4.5h15v15h-15zM8 12l3 3 5.5-6.5';
const FEAT_DRAG_D = 'M12 4.5v15M12 4.5 8.5 8M12 4.5 15.5 8M12 19.5 8.5 16M12 19.5 15.5 16';
const FEAT_REST_D = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.4 2';
const FEAT_BUDDY_D =
  'M9 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8M2.8 19.6a6.6 6.6 0 0 1 12.4 0M16.5 5.2a3.4 3.4 0 0 1 0 6.6M17.5 13.4a6.6 6.6 0 0 1 3.7 6.2';
const BELL_D = 'M18 8.5a6 6 0 1 0-12 0c0 5.2-2 6.5-2 6.5h16s-2-1.3-2-6.5M13.7 19a2 2 0 0 1-3.4 0';

/**
 * The features the rundown teaches. Takes `L` so nothing here gets hoisted.
 *
 * The first three read the **tip** strings rather than a set of their own —
 * they are the same three features `data/tips.ts` teaches in place, and two
 * wordings for one gesture is exactly the drift this pre-empts. The rundown
 * still earns its screen: it is what the app is, said before there is an app
 * to point at. What it cannot do is be present at minute forty, in a gym,
 * which is the half the tips carry.
 *
 * The buddy card keeps its own copy — there is no buddy tip, because the
 * button that opens it has a label on it.
 */
const features = (L: Strings) => [
  { d: FEAT_TICK_D, title: L.tipTick, sub: L.tipTickSub },
  { d: FEAT_DRAG_D, title: L.tipDrag, sub: L.tipDragSub },
  { d: FEAT_REST_D, title: L.tipRest, sub: L.tipRestSub },
  { d: FEAT_BUDDY_D, title: L.obFeatBuddy, sub: L.obFeatBuddySub },
];

const styleName = (k: StyleKey, L: Strings) =>
  ({
    strength: L.obStyleStrength,
    calisthenics: L.obStyleCal,
    cardio: L.obStyleCardio,
    mixed: L.obStyleMixed,
  })[k];

const styleSub = (k: StyleKey, L: Strings) =>
  ({
    strength: L.obStyleStrengthSub,
    calisthenics: L.obStyleCalSub,
    cardio: L.obStyleCardioSub,
    mixed: L.obStyleMixedSub,
  })[k];

const LEVELS: readonly Level[] = ['new', 'some', 'regular'];

const levelName = (k: Level, L: Strings) =>
  ({ new: L.obLevelNew, some: L.obLevelSome, regular: L.obLevelReg })[k];

const levelSub = (k: Level, L: Strings) =>
  ({ new: L.obLevelNewSub, some: L.obLevelSomeSub, regular: L.obLevelRegSub })[k];

/**
 * The level preview's sample lines: one seed routine line per measure, looked
 * up rather than restated so the preview can never drift from what the pick
 * actually installs. (rid, exercise) pairs; a pair that stops existing simply
 * drops its line.
 */
const PREVIEW_LINES: readonly [string, string][] = [
  ['chest', 'bench'],
  ['bwpull', 'pullup'],
  ['bwfull', 'plank'],
  ['easyrun', 'run'],
];

/** Mon / Wed / Fri — where the picked routines land until the user says otherwise. */
const WEEK_SLOTS = [0, 2, 4];

type PermState = 'ask' | 'ok' | 'no';

export function OnboardingOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, exInfo, allEx, endPairing, applyOnboarding } = useStore();
  const insets = useSafeAreaInsets();

  // Reopened from Settings, as opposed to being the first run. Captured once
  // at mount: the final apply sets `onboarded` true, and the exit path must
  // not change meaning mid-flow because of it.
  const [reopened] = useState(() => s.onboarded);

  const [step, setStep] = useState(0);
  const id: Step = STEPS[step];

  /* — drafts, prefilled from the store so a re-run starts from the answers — */
  const [profile, setProfile] = useState<Profile>(() => ({ ...s.profile }));
  const [style, setStyle] = useState<StyleKey>(() => s.style);
  const [level, setLevel] = useState<Level>(() => s.level);
  const [showAll, setShowAll] = useState(false);
  const [permRadio, setPermRadio] = useState<PermState>(() => (s.privateMode ? 'no' : 'ask'));
  const [permNotif, setPermNotif] = useState<PermState>('ask');

  // Mostly-in-style ranks over barely-in-style: one pull-up must not put a
  // barbell day above the all-bodyweight ones on a calisthenics list. Ties
  // keep catalogue order (sort is stable).
  const recommended = DEFAULT_ROUTINES.filter((r) => routineInStyle(r, style, ex)).sort(
    (a, b) => routineStyleScore(b, style, ex) - routineStyleScore(a, style, ex)
  );
  const others = DEFAULT_ROUTINES.filter((r) => !routineInStyle(r, style, ex));

  // Re-run: whatever seeds are still on the phone — the picks a previous run
  // (or deleting routines since) already made. First run: the top three for
  // the style, which `pickStyle` re-proposes when the style step is answered.
  // The gate has to be `onboarded`, not whether seeds are present: a first
  // run's routine list *is* every seed, and "all fifteen, pre-ticked" reads
  // as a chore rather than a suggestion.
  const [picked, setPicked] = useState<string[]>(() =>
    s.onboarded
      ? DEFAULT_ROUTINES.filter((d) => s.routines.some((r) => r.id === d.id)).map((r) => r.id)
      : DEFAULT_ROUTINES.filter((r) => routineInStyle(r, s.style, ex))
          .sort((a, b) => routineStyleScore(b, s.style, ex) - routineStyleScore(a, s.style, ex))
          .slice(0, 3)
          .map((r) => r.id)
  );

  // The tour thinks in seven weekday slots and always did — `applyOnboarding`
  // turns them into weekly rules on the way out. Reading the plan back down to
  // slots (`weekSlots`) is the deliberate other half of that: a rule repeating
  // every third day has no weekday to show on this screen, and this screen is
  // not where that gets set.
  const [week, setWeek] = useState<Record<number, string>>(() => weekSlots(s.plan));

  const close = () => patch({ onboarded: true, onboardingOpen: false });

  // Back walks the steps. A reopened tour can be left from its first screen;
  // a first run cannot — `close` there would mean "skip setup", and a button
  // that big deserves to be pressed, not backed into.
  useBackClose(() => {
    if (step > 0) setStep(step - 1);
    else if (reopened) close();
  });

  /* — the progress fill: travels on `move`, like everything that moves — */
  const [prog] = useState(() => new Animated.Value((0 + 1) / STEPS.length));
  useEffect(() => {
    Animated.timing(prog, {
      toValue: (step + 1) / STEPS.length,
      ...motion.move,
      useNativeDriver: true,
    }).start();
  }, [step, prog]);

  const next = () => setStep((n) => Math.min(n + 1, STEPS.length - 1));

  const proposeFor = (k: StyleKey) =>
    DEFAULT_ROUTINES.filter((r) => routineInStyle(r, k, ex))
      .sort((a, b) => routineStyleScore(b, k, ex) - routineStyleScore(a, k, ex))
      .slice(0, 3)
      .map((r) => r.id);

  const pickStyle = (k: StyleKey) => {
    setStyle(k);
    // A new answer re-proposes; keeping stale picks would make the previous
    // style's list the real answer and this screen decoration.
    setPicked(proposeFor(k));
  };

  const togglePick = (rid: string) =>
    setPicked((p) => (p.includes(rid) ? p.filter((x) => x !== rid) : [...p, rid]));

  /* — permissions: the two acts that don't wait for the final patch — */

  const goPrivate = () => {
    sayGoodbye(s.buddyEndpoint);
    endPairing();
    patch({ privateMode: true });
    setPermRadio('no');
  };

  const allowRadio = async () => {
    const ok = await ensureRadioPermissions();
    if (ok) {
      patch({ privateMode: false });
      setPermRadio('ok');
    } else goPrivate();
  };

  const allowNotif = async () => {
    const ok = await ensureAlarmPermission();
    patch({ restAlert: ok });
    setPermNotif(ok ? 'ok' : 'no');
  };

  const denyNotif = () => {
    patch({ restAlert: false });
    setPermNotif('no');
  };

  /** Leaving the permission screen resolves anything unanswered as a no —
      skipping the question and answering "not now" are the same fact. */
  const leavePerms = () => {
    if (permRadio === 'ask') goPrivate();
    if (permNotif === 'ask') denyNotif();
    next();
  };

  /** Entering the week step: keep slots that still point at picks, and seed
      Mon/Wed/Fri from the picks when nothing survives. */
  const enterWeek = () => {
    setWeek((w) => {
      const kept = Object.fromEntries(
        Object.entries(w).filter(([, rid]) => picked.includes(rid))
      );
      if (Object.keys(kept).length) return kept;
      const fresh: Record<number, string> = {};
      WEEK_SLOTS.forEach((slot, i) => {
        if (picked[i]) fresh[slot] = picked[i];
      });
      return fresh;
    });
    next();
  };

  /** Tap a day: cycle rest → each picked routine → rest. Small list, honest
      control — the Plan tab's full sheet exists for everything past it. */
  const cycleDay = (dow: number) =>
    setWeek((w) => {
      const cur = w[dow];
      const i = cur ? picked.indexOf(cur) : -1;
      const nextRid = picked[i + 1];
      const out = { ...w };
      if (nextRid) out[dow] = nextRid;
      else delete out[dow];
      return out;
    });

  const finish = () => applyOnboarding({ profile, style, level, picked, week });

  const seedName = (r: Routine) => resolveNames(r.names, s.lang);

  /* ── per-step content ──────────────────────────────────────────────────── */

  const body = () => {
    switch (id) {
      case 'welcome':
        return (
          <>
            <View style={styles.hero}>
              <CardKicker>{L.obWelcomeKicker}</CardKicker>
              <H3 size={t.h3} style={styles.heroTitle}>
                {L.obAppName}
              </H3>
              <Text style={styles.heroTagline}>{L.obTagline}</Text>
              <Text style={styles.sub}>{L.obWelcomeSub}</Text>
            </View>
            <View style={styles.featList}>
              {features(L)
                .slice(0, 2)
                .map((f) => (
                  <View key={f.title} style={styles.featRow}>
                    <View style={styles.featGlyph}>
                      <Icon d={f.d} size={16} color={c.accent300} />
                    </View>
                    <Text style={styles.featTitle}>{f.title}</Text>
                  </View>
                ))}
              <Text style={styles.tiny}>{L.obAndMore}</Text>
            </View>
          </>
        );

      case 'how':
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obHowTitle}
            </H2>
            <Text style={styles.sub}>{L.obHowSub}</Text>
            <View style={styles.featList}>
              {features(L).map((f) => (
                <View key={f.title} style={styles.featRow}>
                  <View style={styles.featGlyph}>
                    <Icon d={f.d} size={16} color={c.accent300} />
                  </View>
                  <View style={styles.featText}>
                    <Text style={styles.featTitle}>{f.title}</Text>
                    <Text style={styles.featSub}>{f.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        );

      case 'you':
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obYouTitle}
            </H2>
            <Text style={styles.sub}>{L.obYouSub}</Text>
            <NameField value={profile.name} onChange={(name) => setProfile((p) => ({ ...p, name }))} />
            <H6 style={styles.sectionHead}>{L.aboutYou}</H6>
            {(
              [
                [L.age, L.yrs, 'age', 'number-pad'],
                [L.bodyWeight, 'kg', 'weight', 'decimal-pad'],
                [L.height, 'cm', 'height', 'number-pad'],
              ] as const
            ).map(([label, unit, key, keyboard]) => (
              <MeasureRow
                key={key}
                label={label}
                unit={unit}
                keyboard={keyboard}
                value={profile[key]}
                onChange={(v) => setProfile((p) => ({ ...p, [key]: v }))}
              />
            ))}
          </>
        );

      case 'perms':
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obPermsTitle}
            </H2>
            <Text style={styles.sub}>{L.obPermsSub}</Text>
            {/* The radio card only exists on a build with a radio: Expo Go's
                mock transport has nothing to permit, and a card promising a
                dialog that never comes teaches the wrong lesson. */}
            {hasRadio && (
              <PermCard
                d={FEAT_BUDDY_D}
                name={L.obPermRadio}
                why={L.obPermRadioWhy}
                no={L.obPermRadioNo}
                state={permRadio}
                onAllow={allowRadio}
                onDeny={goPrivate}
              />
            )}
            <PermCard
              d={BELL_D}
              name={L.obPermNotif}
              why={L.obPermNotifWhy}
              no={L.obPermNotifNo}
              state={permNotif}
              onAllow={allowNotif}
              onDeny={denyNotif}
            />
            {permRadio === 'no' && (
              <View style={styles.aloneBar}>
                <Icon d={CHECK_D} size={12} strokeWidth={2.2} color={c.accent} />
                <Text style={styles.aloneText}>{L.obAloneOn}</Text>
              </View>
            )}
            <Text style={styles.tiny}>{L.obPhotosNote}</Text>
          </>
        );

      case 'style':
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obStyleTitle}
            </H2>
            <Text style={styles.sub}>{L.obStyleSub}</Text>
            {STYLE_KEYS.map((k) => (
              <ChoiceCard
                key={k}
                title={styleName(k, L)}
                sub={styleSub(k, L)}
                on={style === k}
                onPress={() => pickStyle(k)}
              />
            ))}
          </>
        );

      case 'level': {
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obLevelTitle}
            </H2>
            <Text style={styles.sub}>{L.obLevelSub}</Text>
            {LEVELS.map((k) => (
              <ChoiceCard
                key={k}
                title={levelName(k, L)}
                sub={levelSub(k, L)}
                on={level === k}
                onPress={() => setLevel(k)}
              />
            ))}
            <H6 style={styles.sectionHead}>{L.obLevelPreview}</H6>
            {PREVIEW_LINES.map(([rid, exId]) => {
              const item = DEFAULT_ROUTINES.find((r) => r.id === rid)?.items.find(
                (it) => it.ex === exId
              );
              const e = ex(exId);
              if (!item || !e) return null;
              const name = exInfo(e);
              return (
                <View key={exId} style={styles.previewRow}>
                  <Text
                    style={[styles.previewName, name.missing && missingName(c)]}
                    numberOfLines={1}
                  >
                    {name.text}
                  </Text>
                  <Text style={styles.previewNums}>
                    {schemeLine(scaleItem(item, measureOf(e), level), measureOf(e), L)}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.tiny}>{L.obLevelNote}</Text>
          </>
        );
      }

      case 'pick': {
        const row = (r: Routine) => {
          const name = seedName(r);
          const on = picked.includes(r.id);
          const sets = r.items.reduce((a, i) => a + i.sets, 0);
          const line = r.items
            .slice(0, 3)
            .map((it) => {
              const e = ex(it.ex);
              return e ? exInfo(e).text : it.ex;
            })
            .join(' · ');
          return (
            <Pressable
              key={r.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => togglePick(r.id)}
              style={[styles.choice, on && styles.choiceOn]}
            >
              <View style={[styles.tickBox, on && { borderColor: c.accent }]}>
                {on && <Icon d={CHECK_D} size={12} strokeWidth={2.4} color={c.accent} />}
              </View>
              <View style={styles.choiceText}>
                <Text style={[styles.choiceTitle, on && { color: c.accent }, name.missing && missingName(c)]}>
                  {name.text}
                </Text>
                <Text style={styles.choiceMeta}>
                  {r.items.length} {L.exCount} · {sets} {L.setCount}
                </Text>
                <Text style={styles.choiceSub} numberOfLines={1}>
                  {line}
                </Text>
              </View>
            </Pressable>
          );
        };
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obPickTitle}
            </H2>
            <Text style={styles.sub}>
              {L.obPickSub.replace('{style}', styleName(style, L).toLowerCase())}
            </Text>
            {recommended.map(row)}
            {others.length > 0 && (
              <Pressable onPress={() => setShowAll((v) => !v)} style={styles.moreRow}>
                <Text style={styles.moreLabel}>{showAll ? L.obHideRest : L.obShowAll}</Text>
                <Text style={styles.moreChevron}>{showAll ? '▾' : '›'}</Text>
              </Pressable>
            )}
            {showAll && (
              <>
                <H6 style={styles.sectionHead}>{L.obEverythingElse}</H6>
                {others.map(row)}
              </>
            )}
          </>
        );
      }

      case 'week':
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obWeekTitle}
            </H2>
            <Text style={styles.sub}>{L.obWeekSub}</Text>
            <View style={styles.weekList}>
              {DAYS_OF_WEEK.map((dow) => {
                const rid = week[dow];
                const r = rid ? DEFAULT_ROUTINES.find((x) => x.id === rid) : undefined;
                const name = r ? seedName(r) : null;
                return (
                  <Pressable key={dow} onPress={() => cycleDay(dow)} style={styles.weekRow}>
                    <Text style={styles.weekDay}>{dayLabel(s.lang, dow)}</Text>
                    <Text
                      style={[
                        styles.weekName,
                        !name && styles.weekRest,
                        name?.missing && missingName(c),
                      ]}
                      numberOfLines={1}
                    >
                      {name ? name.text : L.rest}
                    </Text>
                    <Text style={styles.weekChevron}>›</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.tiny}>{L.obWeekTap}</Text>
          </>
        );

      case 'done': {
        const stats: [string, number][] = [
          [L.obDoneRoutines, picked.length],
          [L.obDoneDays, Object.keys(week).length],
          [L.obDoneEx, allEx().length],
        ];
        return (
          <>
            <View style={[styles.hero, styles.doneHero]}>
              <Seal />
              <H3 size={t.h3} style={styles.doneTitle}>
                {L.obDoneTitle}
              </H3>
              <Text style={styles.subCenter}>
                {(() => {
                  const name = profile.name.trim();
                  // No name: the placeholder was the sentence's start, so the
                  // first letter has to step up. Works in both languages —
                  // "your"→"Your", "dein"→"Dein".
                  const line = L.obDoneSub.replace('{name}', name ? `${name}, ` : '');
                  return name ? line : line.charAt(0).toUpperCase() + line.slice(1);
                })()}
              </Text>
            </View>
            <View style={styles.stats}>
              {stats.map(([k, v]) => (
                <View key={k} style={styles.stat}>
                  <Text style={styles.statKey}>{k}</Text>
                  <Text style={styles.statValue}>{v}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.tiny}>{L.obDoneNote}</Text>
          </>
        );
      }
    }
  };

  /* ── the footer's one or two buttons, per step ────────────────────────── */

  const foot = () => {
    switch (id) {
      case 'welcome':
        return (
          <>
            <Btn variant="primary" block label={L.obGetStarted} style={styles.cta} onPress={next} />
            <Btn variant="ghost" block label={L.obSkipSetup} onPress={close} />
          </>
        );
      case 'you':
        return (
          <>
            <Btn variant="primary" block label={L.obContinue} style={styles.cta} onPress={next} />
            <Btn variant="ghost" block label={L.obSkipForNow} onPress={next} />
          </>
        );
      case 'perms': {
        const answered = (!hasRadio || permRadio !== 'ask') && permNotif !== 'ask';
        return (
          <Btn
            variant="primary"
            block
            label={answered ? L.obContinue : L.obSkipBoth}
            style={styles.cta}
            onPress={leavePerms}
          />
        );
      }
      case 'pick':
        return (
          <Btn
            variant="primary"
            block
            label={
              picked.length === 0
                ? L.obAddNone
                : picked.length === 1
                  ? L.obAddRoutine
                  : L.obAddRoutines.replace('{n}', String(picked.length))
            }
            style={styles.cta}
            onPress={enterWeek}
          />
        );
      case 'week':
        return (
          <>
            <Btn variant="primary" block label={L.obContinue} style={styles.cta} onPress={next} />
            <Btn
              variant="ghost"
              block
              label={L.obSkipNoPlan}
              onPress={() => {
                setWeek({});
                next();
              }}
            />
          </>
        );
      case 'done':
        return (
          <Btn variant="primary" block label={L.obStartTraining} style={styles.cta} onPress={finish} />
        );
      default:
        return (
          <Btn variant="primary" block label={L.obContinue} style={styles.cta} onPress={next} />
        );
    }
  };

  return (
    <FullScreen zIndex={95}>
      <View style={[styles.top, { paddingTop: 10 + insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.back}
          disabled={step === 0}
          onPress={() => setStep((n) => Math.max(0, n - 1))}
          style={[styles.backBtn, step === 0 && styles.backHidden]}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.progTrack}>
          <Animated.View style={[styles.progFill, { transform: [{ scaleX: prog }] }]} />
        </View>
      </View>

      {/* Remounts per step, so each screen rises in the way tabs do. */}
      <ScrollView
        key={step}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {body()}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: 14 + insets.bottom }]}>{foot()}</View>
    </FullScreen>
  );
}

/* ── the schedule's key set (indexes into DAYS_SHORT — never renders DOW) ── */

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

const dayLabel = (lang: Lang, dow: number) => DAYS_SHORT[lang][dow].toUpperCase();

/* ── small parts ─────────────────────────────────────────────────────────── */

/** The underlined name field, the Profile tab's grammar. */
function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { L } = useStore();
  return (
    <TextInput
      value={value}
      placeholder={L.yourName}
      placeholderTextColor={c.neutral600}
      cursorColor={c.accent}
      selectionColor={c.accent}
      onChangeText={onChange}
      style={styles.nameInput}
    />
  );
}

function MeasureRow({
  label,
  unit,
  value,
  keyboard,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  keyboard: 'number-pad' | 'decimal-pad';
  onChange: (v: string) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  return (
    <View style={styles.measureRow}>
      <Text style={styles.measureLabel}>{label}</Text>
      <TextInput
        value={value}
        placeholder="—"
        placeholderTextColor={c.neutral600}
        cursorColor={c.accent}
        selectionColor={c.accent}
        keyboardType={keyboard}
        onChangeText={onChange}
        style={styles.measureInput}
      />
      <Text style={styles.measureUnit}>{unit}</Text>
    </View>
  );
}

/** A radio card: dot, title, one line of why. Style and level share it. */
function ChoiceCard({
  title,
  sub,
  on,
  onPress,
}: {
  title: string;
  sub: string;
  on: boolean;
  onPress: () => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.choice, on && styles.choiceOn]}
    >
      <View style={[styles.radioDot, on && { borderColor: c.accent }]}>
        {on && <View style={styles.radioInner} />}
      </View>
      <View style={styles.choiceText}>
        <Text style={[styles.choiceTitle, on && { color: c.accent }]}>{title}</Text>
        <Text style={styles.choiceSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

/** One permission: the reason, the two answers, and what a no now means. */
function PermCard({
  d,
  name,
  why,
  no,
  state,
  onAllow,
  onDeny,
}: {
  d: string;
  name: string;
  why: string;
  no: string;
  state: PermState;
  onAllow: () => void;
  onDeny: () => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { L } = useStore();
  return (
    <View style={styles.permCard}>
      <View style={styles.permHead}>
        <View style={styles.featGlyph}>
          <Icon d={d} size={16} color={c.accent300} />
        </View>
        <Text style={styles.permName}>{name}</Text>
        {state === 'ok' && (
          <View style={styles.permState}>
            <Icon d={CHECK_D} size={11} strokeWidth={2.4} color={c.accent} />
            <Text style={styles.permOk}>{L.obAllowed}</Text>
          </View>
        )}
        {state === 'no' && <Text style={styles.permNo}>{L.obDenied}</Text>}
      </View>
      <Text style={styles.permWhy}>{why}</Text>
      {state === 'no' && <Text style={styles.permConsequence}>{no}</Text>}
      {state === 'ask' && (
        <View style={styles.permBtns}>
          <Btn variant="primary" label={L.obAllow} style={styles.permBtn} onPress={onAllow} />
          <Btn variant="secondary" label={L.notNow} style={styles.permBtn} onPress={onDeny} />
        </View>
      )}
    </View>
  );
}

/** The seal pop — the system's one overshoot, spent on arrival. */
function Seal() {
  const styles = useThemed(sheet);
  const c = useColors();
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, ...motion.payoff, useNativeDriver: true }).start();
  }, [pop]);
  return (
    <Animated.View style={[styles.seal, { transform: [{ scale: pop }] }]}>
      <Icon d={CHECK_D} size={24} strokeWidth={2.2} color={c.accent} />
    </Animated.View>
  );
}

/* ── styles ──────────────────────────────────────────────────────────────── */

const sheet = themed(() => ({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  backBtn: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  backHidden: { opacity: 0 },
  backGlyph: { fontFamily: font.regular, fontSize: 19, color: color.accent },
  progTrack: { flex: 1, height: 2, borderRadius: 1, backgroundColor: t.rule, overflow: 'hidden' },
  progFill: { ...fill, backgroundColor: color.accent, transformOrigin: 'left' },

  scroll: { flex: 1 },
  body: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 12 },
  foot: { paddingHorizontal: 16, paddingTop: 8, gap: 2 },
  cta: { height: 44 },

  title: { letterSpacing: tracking(t.h2, -0.02) },
  sub: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: color.neutral500,
    marginTop: 7,
  },
  subCenter: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: color.neutral500,
    marginTop: 8,
    textAlign: 'center',
  },
  tiny: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 11 * 1.5,
    color: color.neutral600,
    marginTop: 14,
  },
  sectionHead: { marginTop: 22, marginBottom: 8, color: color.neutral500 },

  hero: {
    marginTop: 12,
    ...t.heroPad,
    borderRadius: t.cardRadius,
    backgroundColor: t.exBg,
  },
  heroTitle: { marginTop: 8, letterSpacing: tracking(t.h3, -0.02) },
  heroTagline: { fontFamily: font.regular, fontSize: 13.5, color: color.neutral300, marginTop: 9 },

  featList: { marginTop: 18 },
  featRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  featGlyph: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: color.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featText: { flex: 1 },
  featTitle: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  featSub: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.45,
    color: color.neutral500,
    marginTop: 3,
  },

  nameInput: {
    width: '100%',
    marginTop: 16,
    paddingTop: 0,
    paddingBottom: 5,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    color: color.text,
    fontFamily: font.heading,
    fontSize: 21,
    letterSpacing: tracking(21, -0.02),
  },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  measureLabel: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  measureInput: {
    width: 74,
    minHeight: 36,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontFamily: font.regular,
    fontSize: 14,
    color: color.text,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
    fontVariant: ['tabular-nums'],
  },
  measureUnit: { width: 26, fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },

  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.divider,
  },
  choiceOn: { borderColor: color.accent, backgroundColor: wash.accent(8) },
  choiceText: { flex: 1, minWidth: 0 },
  choiceTitle: { fontFamily: font.regular, fontSize: 14, color: color.text },
  choiceMeta: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral600,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  choiceSub: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.45,
    color: color.neutral500,
    marginTop: 3,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
  tickBox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },

  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 14,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  moreLabel: { flex: 1, fontFamily: font.regular, fontSize: 13, color: color.accent },
  moreChevron: { fontFamily: font.regular, fontSize: 13, color: color.accent },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  previewName: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.neutral400 },
  previewNums: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.accent400,
    fontVariant: ['tabular-nums'],
  },

  permCard: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  permHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  permName: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  permState: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  permOk: { fontFamily: font.regular, fontSize: 11, color: color.accent },
  permNo: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  permWhy: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.5,
    color: color.neutral500,
    marginTop: 7,
  },
  permConsequence: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.5,
    color: color.neutral600,
    marginTop: 8,
    paddingLeft: 9,
    borderLeftWidth: 1,
    borderLeftColor: color.divider,
  },
  permBtns: { flexDirection: 'row', gap: 8, marginTop: 11 },
  permBtn: { flex: 1, height: 38 },

  aloneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: radius.md,
    backgroundColor: wash.accent(8),
  },
  aloneText: { fontFamily: font.regular, fontSize: 12, color: color.accent },

  weekList: { marginTop: 12 },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  weekDay: {
    width: 34,
    fontFamily: font.regular,
    fontSize: 11,
    letterSpacing: tracking(11, 0.08),
    color: color.neutral500,
  },
  weekName: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.text },
  weekRest: { color: color.neutral600 },
  weekChevron: { fontFamily: font.regular, fontSize: 15, color: color.accent },

  doneHero: { marginTop: 34, alignItems: 'center' },
  doneTitle: { marginTop: 15, letterSpacing: tracking(t.h3, -0.02) },
  seal: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.accent900,
    borderWidth: 1,
    borderColor: color.accent800,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  statKey: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.08),
    textTransform: 'uppercase',
    color: color.neutral600,
  },
  statValue: {
    fontFamily: font.regular,
    fontSize: 19,
    color: color.text,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
}));
