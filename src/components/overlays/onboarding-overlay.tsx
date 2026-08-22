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
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECK_D, Icon } from '@/components/icon';
import { DragDemo, PX_PER_REP, PX_PER_STEP, useNumberDrag } from '@/components/num-drag';
import { WeekBoard } from '@/components/week-board';
import { TimeStepper } from '@/components/time-stepper';
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
import { countN, DAYS_SHORT, Lang, Strings } from '@/data/i18n';
import { weekSlots } from '@/data/plan';
import { ensureAlarmPermission } from '@/data/alarms';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, fill, font, linger, motion, radius, t, tracking, wash } from '@/design/tokens';
import { Btn, CardKicker, H2, H3, H6, missingName } from '@/design/ui';
import { num, Profile, resolveNames, schemeLine, useStore } from '@/store/workout-store';

/* ── step order ──────────────────────────────────────────────────────────── */

const STEPS = [
  // The welcome hero and the rundown were one screen's worth of content spread
  // over two — the hero said what the app is and the rundown said what it does,
  // and neither filled a page. They are one screen now, and it is the first.
  'how',
  // The buddy screen explains the feature *and* carries its own radio
  // permission — the reason and the ask on one screen, rather than the ask
  // arriving later beside an unrelated one. It comes before `you` because the
  // name field ("so your side of a shared session has a name on it") is a
  // question with no reason on it until this has been read.
  'buddy',
  'you',
  'perms',
  'style',
  'level',
  'pick',
  'week',
  // The coach is last before the seal, because it is the one feature that has
  // nothing to say yet: it reads eight weeks of a diary that is still empty.
  // Introduced as something waiting rather than something to do now.
  'coach',
  'done',
] as const;
type Step = (typeof STEPS)[number];

/* ── glyphs (24×24, the app's stroke grammar) ───────────────────────────── */

const FEAT_DRAG_D = 'M12 4.5v15M12 4.5 8.5 8M12 4.5 15.5 8M12 19.5 8.5 16M12 19.5 15.5 16';
const FEAT_REST_D = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.4 2';
const FEAT_BUDDY_D =
  'M9 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8M2.8 19.6a6.6 6.6 0 0 1 12.4 0M16.5 5.2a3.4 3.4 0 0 1 0 6.6M17.5 13.4a6.6 6.6 0 0 1 3.7 6.2';
const BELL_D = 'M18 8.5a6 6 0 1 0-12 0c0 5.2-2 6.5-2 6.5h16s-2-1.3-2-6.5M13.7 19a2 2 0 0 1-3.4 0';

/**
 * The features the rundown teaches, and it is deliberately down to two.
 *
 * A rundown can only ever *describe* a gesture, and the two it used to open
 * with are both better shown: the drag has moved to the profile step, where it
 * is demonstrated on a field you can drag while reading about it, and the tick
 * is left to `data/tips.ts` to teach on the first set row it applies to. What
 * stays here is the pair a screen cannot demonstrate at minute zero — a rest
 * that starts itself, and a second phone that isn't in the room yet.
 *
 * They read the **tip** strings rather than a set of their own, and so does the
 * profile step's drag row: one list, every surface, so an in-place hint and a
 * tour card can never phrase one gesture two ways. The buddy card keeps its own
 * copy — there is no buddy tip, because the button that opens it has a label.
 */
const features = (L: Strings) => [
  { d: FEAT_REST_D, title: L.tipRest, sub: L.tipRestSub },
  { d: FEAT_BUDDY_D, title: L.obFeatBuddy, sub: L.obFeatBuddySub },
];

/**
 * The buddy screen's three steps. Takes `L`, like `features`.
 *
 * Deliberately the flow rather than the feature list: pairing is the only part
 * of this app two people have to do *together*, in the right order, before
 * anything works — and it is the part a screenshot cannot show. What happens
 * inside a shared session is one line, because by then the session is drawing
 * it for you.
 */
const buddyWalk = (L: Strings) => [
  { title: L.obBuddyPair, sub: L.obBuddyPairSub },
  { title: L.obBuddyStart, sub: L.obBuddyStartSub },
  { title: L.obBuddyLive, sub: L.obBuddyLiveSub },
];

/**
 * The coach screen's three steps — read, send, read back. The same three the
 * coach overlay is built in, said once before anyone stands in front of them:
 * the middle one leaves the app entirely, which is the part that needs saying
 * in advance, and the third is what makes leaving safe to do.
 */
const coachWalk = (L: Strings) => [
  { title: L.obCoachRead, sub: L.obCoachReadSub },
  { title: L.obCoachSend, sub: L.obCoachSendSub },
  { title: L.obCoachBack, sub: L.obCoachBackSub },
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

/**
 * The profile step's three fields, and what a drag on each one is worth.
 *
 * Whole units for age and height on the coarser `PX_PER_REP` travel, half-kilos
 * for body weight on `PX_PER_STEP` — the same pairing the set row makes, and for
 * the same reason: the smaller the unit, the less finger it should cost. The
 * labels are thunks because they read the dictionary, which the React Compiler
 * would otherwise freeze into whichever language loaded first.
 */
const MEASURES = [
  { key: 'age', label: (L: Strings) => L.age, unit: (L: Strings) => L.yrs,
    keyboard: 'number-pad', step: 1, px: PX_PER_REP, base: 30 },
  { key: 'weight', label: (L: Strings) => L.bodyWeight, unit: () => 'kg',
    keyboard: 'decimal-pad', step: 0.5, px: PX_PER_STEP, base: 70 },
  { key: 'height', label: (L: Strings) => L.height, unit: () => 'cm',
    keyboard: 'number-pad', step: 1, px: PX_PER_REP, base: 175 },
] as const;

/**
 * How much still has to be below the fold before the cue appears.
 *
 * A few pixels of overhang is a rounding error, not a page — an arrow that
 * showed for one would be pointing at nothing.
 */
const MORE_EPS = 24;

/** The profile fields' one column width — the demo's lane is written against it. */
const MEASURE_W = 74;

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

  // Dropped on a build with no radio at all — plain Expo Go, where there is no
  // pairing to teach and a screen promising a dialog that never comes teaches
  // the wrong lesson. (With the dev sim the card stands and answers instantly,
  // exactly as it did on the perms screen: `ensureRadioPermissions` short-
  // circuits on `isSimRadio`.) That is the *whole* gate, deliberately: the same
  // fact the permission card itself is gated on. Not Train alone as well: the
  // card lives here now, so this is the only place a re-run can say "Train
  // alone is on" — a phone already training alone still gets the screen, in
  // its answered state.
  // Captured at mount, because a list that renumbered mid-flow would move the
  // steps under a back press.
  const [steps] = useState<readonly Step[]>(() =>
    hasRadio ? STEPS : STEPS.filter((k) => k !== 'buddy')
  );

  const [step, setStep] = useState(0);
  const id: Step = steps[step];

  /* — drafts, prefilled from the store so a re-run starts from the answers — */
  const [profile, setProfile] = useState<Profile>(() => ({ ...s.profile }));
  const [style, setStyle] = useState<StyleKey>(() => s.style);
  const [level, setLevel] = useState<Level>(() => s.level);
  const [showAll, setShowAll] = useState(false);
  const [permRadio, setPermRadio] = useState<PermState>(() => (s.privateMode ? 'no' : 'ask'));
  const [permNotif, setPermNotif] = useState<PermState>('ask');
  // A drag anywhere on the current step takes the scroll away from it, the
  // same trade the session list makes: the gesture and the scroll are the
  // same finger going the same direction, so one of them has to yield.
  const [scrubbing, setScrubbing] = useState(false);
  // A re-run meets it already answered when the setting is on — the tour
  // shows the state rather than asking a second time.
  const [permPlan, setPermPlan] = useState<PermState>(() => (s.planAlert ? 'ok' : 'ask'));

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
  const [prog] = useState(() => new Animated.Value((0 + 1) / steps.length));
  useEffect(() => {
    Animated.timing(prog, {
      toValue: (step + 1) / steps.length,
      ...motion.move,
      useNativeDriver: true,
    }).start();
  }, [step, steps.length, prog]);

  const next = () => setStep((n) => Math.min(n + 1, steps.length - 1));

  /**
   * Whether this step's button travels with the content instead of sitting over
   * it.
   *
   * The two steps whose lower half is the point. On buddy it is the permission
   * card; on the week it is the pool you drag from and the reminder under it —
   * both are screens where a button parked on the glass is a way past the thing
   * the screen is for. Everywhere else the answer is already in view, and a
   * primary action that moved about would be worse than one that waits.
   */
  const footInScroll = id === 'buddy' || id === 'week';

  /* — whether this step has content below the fold, and the cue that says so — */
  const [more, setMore] = useState(false);
  const seen = useRef({ view: 0, content: 0, at: 0 });
  const gauge = () => {
    const g = seen.current;
    setMore(g.content - g.view - g.at > MORE_EPS);
  };

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

  // The same permission as `allowNotif` — Android grants POST_NOTIFICATIONS to
  // the app rather than to a channel, so whichever of the two was answered
  // first has already asked, and this one resolves without a second dialog.
  const allowPlanAlert = async () => {
    const ok = await ensureAlarmPermission();
    patch({ planAlert: ok });
    setPermPlan(ok ? 'ok' : 'no');
  };

  const denyPlanAlert = () => {
    patch({ planAlert: false });
    setPermPlan('no');
  };

  /* Leaving either permission screen resolves an unanswered card as a no —
     skipping the question and answering "not now" are the same fact. Two
     screens, two cards, so the rule is stated twice rather than once over
     both. */

  const leaveBuddy = () => {
    if (permRadio === 'ask') goPrivate();
    next();
  };

  const leavePerms = () => {
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

  /** Put a routine on a day, or take the day back to rest. The board's one write. */
  const setDay = (dow: number, rid: string | null) =>
    setWeek((w) => {
      const out = { ...w };
      if (rid) out[dow] = rid;
      else delete out[dow];
      return out;
    });

  // `reopened` is `s.onboarded` captured at mount — true iff the tour was
  // reopened from Settings, which is exactly first-run-vs-re-run. On a re-run
  // `applyOnboarding` skips the plan write, so a plan built since setup (dated
  // rules, intervals, one-offs, chosen rest days) is not flattened back to
  // weekday slots.
  const finish = () => applyOnboarding({ profile, style, level, picked, week, rerun: reopened });

  const seedName = (r: Routine) => resolveNames(r.names, s.lang);

  // What the week board has to place — the picks, in the order they were made,
  // resolved once here rather than per row. A pick whose seed has gone simply
  // drops out, which is the same thing `applyOnboarding` does on the way out.
  const weekPool = picked.flatMap((rid) => {
    const r = DEFAULT_ROUTINES.find((x) => x.id === rid);
    if (!r) return [];
    const name = seedName(r);
    return [{ rid, text: name.text, missing: name.missing }];
  });

  /* ── per-step content ──────────────────────────────────────────────────── */

  const body = () => {
    switch (id) {
      case 'how':
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
            <H2 size={t.h2} style={styles.howTitle}>
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

      case 'buddy':
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obBuddyTitle}
            </H2>
            <Text style={styles.sub}>{L.obBuddySub}</Text>
            <Walk items={buddyWalk(L)} />
            <Text style={styles.tiny}>{L.obBuddyNote}</Text>
            {/* The explanation closes on its own note, and the ask stands under
                a heading of its own: three numbered rows followed by a fourth
                glyph row would read as a fourth step until you saw the buttons.
                No `hasRadio` guard — the step does not exist without one. */}
            <H6 style={styles.sectionHead}>{L.obBuddyAsk}</H6>
            <PermCard
              d={FEAT_BUDDY_D}
              name={L.obPermRadio}
              why={L.obPermRadioWhy}
              no={L.obPermRadioNo}
              state={permRadio}
              onAllow={allowRadio}
              onDeny={goPrivate}
            />
            {permRadio === 'no' && (
              <View style={styles.aloneBar}>
                <Icon d={CHECK_D} size={12} strokeWidth={2.2} color={c.accent} />
                <Text style={styles.aloneText}>{L.obAloneOn}</Text>
              </View>
            )}
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
            {/* The rundown used to describe this gesture two screens ago and a
                screen away from anything you could try it on. It says the same
                words here — `tipDrag`, the tip's own — standing directly above
                three fields that answer to it, with the demo playing over one
                of them. A number nobody's training depends on is the right
                place to meet a control your sets will. */}
            <View style={styles.featRow}>
              <View style={styles.featGlyph}>
                <Icon d={FEAT_DRAG_D} size={16} color={c.accent300} />
              </View>
              <View style={styles.featText}>
                <Text style={styles.featTitle}>{L.tipDrag}</Text>
                <Text style={styles.featSub}>{L.tipDragSub}</Text>
              </View>
            </View>
            {MEASURES.map(({ label, unit, key, keyboard, step, px, base }) => (
              <MeasureRow
                key={key}
                label={label(L)}
                unit={unit(L)}
                keyboard={keyboard}
                step={step}
                px={px}
                base={base}
                // One demo, on the field where half-steps and scrubbing are
                // most obviously the point. Two would be a slideshow.
                demo={key === 'weight'}
                value={profile[key]}
                onChange={(v) => setProfile((p) => ({ ...p, [key]: v }))}
                onScrub={setScrubbing}
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
            {/* The rest alert alone — the radio card moved onto the buddy
                screen, where the reason for it is. What is left here is the one
                permission with no feature screen of its own to sit on, plus the
                note about the one this tour deliberately never asks for. */}
            <PermCard
              d={BELL_D}
              name={L.obPermNotif}
              why={L.obPermNotifWhy}
              no={L.obPermNotifNo}
              state={permNotif}
              onAllow={allowNotif}
              onDeny={denyNotif}
            />
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
                  {countN(r.items.length, L.exCountOne, L.exCount)} ·{' '}
                  {countN(sets, L.setCountOne, L.setCount)}
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
            {/* Empty picks means an empty pool, and a board with nothing to
                drag is a gesture with no answer — the day list still stands,
                because seven rest days is a legitimate week. */}
            {weekPool.length === 0 ? (
              <>
                <View style={styles.weekList}>
                  {DAYS_OF_WEEK.map((dow) => (
                    <View key={dow} style={styles.weekRow}>
                      <Text style={styles.weekDay}>{dayLabel(s.lang, dow)}</Text>
                      <Text style={[styles.weekName, styles.weekRest]}>{L.rest}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.tiny}>{L.obWeekPoolEmpty}</Text>
              </>
            ) : (
              <>
                <WeekBoard
                  dows={DAYS_OF_WEEK}
                  week={week}
                  pool={weekPool}
                  dayLabel={(dow) => dayLabel(s.lang, dow)}
                  restLabel={L.rest}
                  removeLabel={L.remove}
                  poolLabel={L.obWeekPool}
                  onSet={setDay}
                  onScrub={setScrubbing}
                />
                <Text style={styles.tiny}>{L.obWeekDrag}</Text>
              </>
            )}
            {/* Only once the week actually holds something: a reminder about
                days you have not set is furniture, and this is the rule the
                settings screen already applies to the time row under its own
                switch. Off is the default, so leaving it unanswered needs no
                resolving on the way out — unlike the radio card, where an
                unanswered question has to become Train alone. */}
            {Object.keys(week).length > 0 && (
              <>
                <H6 style={styles.sectionHead}>{L.obWeekRemind}</H6>
                <PermCard
                  d={BELL_D}
                  name={L.planAlertLabel}
                  why={L.planAlertHint}
                  no={L.obPlanAlertNo}
                  state={permPlan}
                  onAllow={allowPlanAlert}
                  onDeny={denyPlanAlert}
                />
                {permPlan === 'ok' && (
                  <View style={styles.timeRow}>
                    <Text style={styles.timeLabel}>{L.planAlertTime}</Text>
                    <TimeStepper
                      at={s.planAlertAt}
                      set={(at) => patch({ planAlertAt: at })}
                    />
                  </View>
                )}
              </>
            )}
          </>
        );

      case 'coach':
        return (
          <>
            <H2 size={t.h2} style={styles.title}>
              {L.obCoachTitle}
            </H2>
            <Text style={styles.sub}>{L.obCoachSub}</Text>
            <Walk items={coachWalk(L)} />
            <Text style={styles.tiny}>{L.obCoachNote}</Text>
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
      case 'how':
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
      // Both permission screens carry one button whose label says what leaving
      // it unanswered will mean.
      case 'buddy':
        return (
          <Btn
            variant="primary"
            block
            label={permRadio === 'ask' ? L.obSkipAlone : L.obContinue}
            style={styles.cta}
            onPress={leaveBuddy}
          />
        );
      case 'perms':
        return (
          <Btn
            variant="primary"
            block
            label={permNotif === 'ask' ? L.obSkipAlert : L.obContinue}
            style={styles.cta}
            onPress={leavePerms}
          />
        );
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
              // The reminder is deliberately not switched back off here. It is
              // an answer the user gave out loud, it announces nothing while
              // the plan is empty (`<PlanAlarm>` derives its fortnight from
              // `plannedOn`), and it starts working by itself the day a plan
              // exists — where un-asking it would be this screen quietly
              // overruling a choice made on it.
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
      <View style={styles.scrollWrap}>
      <ScrollView
        key={step}
        style={styles.scroll}
        scrollEventThrottle={32}
        onScroll={(e) => {
          seen.current.at = e.nativeEvent.contentOffset.y;
          gauge();
        }}
        onLayout={(e) => {
          seen.current.view = e.nativeEvent.layout.height;
          gauge();
        }}
        onContentSizeChange={(_w, h) => {
          seen.current.content = h;
          gauge();
        }}
        contentContainerStyle={[styles.body, footInScroll && { paddingBottom: 14 + insets.bottom }]}
        // `"always"`, not `"handled"`: under `handled` a ScrollView grabs any
        // touch that isn't already a responder so it can dismiss the keyboard,
        // and that grab is a `setJSResponder` which gesture-handler answers by
        // cancelling everything it owns — including the profile step's number
        // drag. What it costs is tap-away-to-dismiss, which the cell's own
        // second tap hands back. See the note in `num-drag`.
        keyboardShouldPersistTaps="always"
        scrollEnabled={!scrubbing}
        showsVerticalScrollIndicator={false}
      >
        {body()}
        {/* The buddy screen's button is the end of its own content rather than
            a bar over it: the screen is an explanation with a permission under
            it, and a CTA parked at the bottom of the glass is a way past both
            without reading either. Every other step's answer is on the screen
            already, so only this one earns the scroll. */}
        {footInScroll && <View style={styles.inlineFoot}>{foot()}</View>}
      </ScrollView>
      {/* Only ever a cue: it never takes a touch, and it is gone the moment the
          bottom is reached. On the two steps whose button is down there with
          the rest of the content, it is also the only thing saying so. */}
      {/* With the button in the scroll there is no footer under this wrapper,
          so the cue has to clear the gesture bar itself. */}
      <MoreBelow show={more} inset={footInScroll ? insets.bottom : 0} />
      </View>

      {!footInScroll && (
        <View style={[styles.foot, { paddingBottom: 14 + insets.bottom }]}>{foot()}</View>
      )}
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

/**
 * One profile figure — a field that is also a slider, which is the whole reason
 * this step now exists before the first workout rather than only beside it.
 *
 * The gesture, the glide and the pan/tap race come from `num-drag`; what this
 * row owns is how it is drawn. The two rules that module states are both
 * obeyed here: the field sits inside a `box-only` wrapper so the editor never
 * sees an ACTION_DOWN, and the tour's ScrollView is `"always"` so it cannot
 * take the touch away — see the note at the ScrollView.
 */
function MeasureRow({
  label,
  unit,
  value,
  keyboard,
  step,
  px,
  base,
  demo,
  onChange,
  onScrub,
}: {
  label: string;
  unit: string;
  value: string;
  keyboard: 'number-pad' | 'decimal-pad';
  step: number;
  px: number;
  /**
   * Where a drag on this field starts when it is empty, and what the demo
   * scrubs from.
   *
   * A set row gets this for free — an empty cell starts from last time's ghost.
   * Nothing has been logged yet here, and starting from zero makes the gesture
   * useless on the one screen that is teaching it: reaching a real body weight
   * from 0 is a sweep nobody would finish. So each field states a plausible
   * figure. It is not a claim about you and is never drawn — the placeholder
   * stays a dash, and the field is empty until you move it — it only decides
   * where the first notch lands.
   */
  base: number;
  /** Whether this row is the one the demo plays over. */
  demo: boolean;
  onChange: (v: string) => void;
  onScrub: (on: boolean) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const ref = useRef<TextInput>(null);
  const [editing, setEditing] = useState(false);

  // The IME swallows Android's back key, so the keyboard goes down without the
  // app hearing it and the field keeps focus — leaving a cell drawn as being
  // typed into while the next tap on it would only blur it.
  useEffect(() => {
    if (!editing) return;
    const sub = Keyboard.addListener('keyboardDidHide', () => ref.current?.blur());
    return () => sub.remove();
  }, [editing]);

  const { gesture, dragging } = useNumberDrag({
    value,
    // Not drawn as a placeholder anywhere — `ghost` is only where a drag on an
    // empty field begins. See `base`.
    ghost: String(base),
    step,
    px,
    onText: onChange,
    onScrub,
    onTapToggle: () => (editing ? ref.current?.blur() : ref.current?.focus()),
  });

  return (
    <View style={styles.measureRow}>
      <Text style={styles.measureLabel}>{label}</Text>
      {/* The demo's lane is this wrapper exactly, which is what lets it be
          `left: 0` here where the session's is written against a column. */}
      <View style={styles.measureField}>
        <GestureDetector gesture={gesture}>
          {/* Never `auto`, focused or not: the editor must not see an
              ACTION_DOWN or the drag is cancelled before it starts. */}
          <View pointerEvents="box-only">
            <TextInput
              ref={ref}
              value={value}
              placeholder="—"
              placeholderTextColor={c.neutral600}
              cursorColor={c.accent}
              selectionColor={c.accent}
              keyboardType={keyboard}
              onChangeText={onChange}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              style={[styles.measureInput, dragging && styles.measureInputDragging]}
            />
          </View>
        </GestureDetector>
        {demo && (
          <DragDemo
            width={MEASURE_W}
            lane={{ left: 0 }}
            size={14}
            step={step}
            px={px}
            base={num(value, base)}
          />
        )}
      </View>
      <Text style={styles.measureUnit}>{unit}</Text>
    </View>
  );
}

/**
 * A numbered walkthrough — the feature rows' shape with the glyph tile spending
 * its 30px on a digit instead. The tile is `featGlyph` itself rather than a
 * copy of it, so the icon rows and the numbered ones cannot drift apart.
 */
function Walk({ items }: { items: readonly { title: string; sub: string }[] }) {
  const styles = useThemed(sheet);
  return (
    <View style={styles.featList}>
      {items.map((it, i) => (
        <View key={it.title} style={styles.featRow}>
          <View style={styles.featGlyph}>
            <Text style={styles.walkNum}>{i + 1}</Text>
          </View>
          <View style={styles.featText}>
            <Text style={styles.featTitle}>{it.title}</Text>
            <Text style={styles.featSub}>{it.sub}</Text>
          </View>
        </View>
      ))}
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

/**
 * The "there is more below" cue: one chevron, over the foot of the scroll.
 *
 * It nudges **twice and then holds still**, which is `DragDemo`'s rule and for
 * the same reason — a mark that bobbed for as long as you stayed on the screen
 * would be the furniture this tour is trying not to have. Two is enough to
 * catch the eye; after that the arrow is a sign rather than an animation, and
 * scrolling to the end takes it away entirely.
 *
 * `pointerEvents="none"` throughout: it says where to go and never intercepts
 * the gesture that goes there.
 */
function MoreBelow({ show, inset }: { show: boolean; inset: number }) {
  const styles = useThemed(sheet);
  const [fade] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const to = Animated.timing(fade, {
      toValue: show ? 1 : 0,
      ...motion.quick,
      useNativeDriver: true,
    });
    to.start();
    if (!show) return () => to.stop();
    const nudge = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: linger.beckon,
          easing: motion.move.easing,
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: linger.beckon,
          easing: motion.move.easing,
          useNativeDriver: true,
        }),
      ]),
      { iterations: 2 }
    );
    nudge.start();
    return () => {
      to.stop();
      nudge.stop();
      bob.setValue(0);
    };
  }, [show, fade, bob]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.more,
        {
          bottom: 6 + inset,
          opacity: fade,
          transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }],
        },
      ]}
    >
      <Text style={styles.moreGlyph}>▾</Text>
    </Animated.View>
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

  scrollWrap: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 12 },
  foot: { paddingHorizontal: 16, paddingTop: 8, gap: 2 },
  inlineFoot: { marginTop: 20, gap: 2 },
  more: {
    position: 'absolute',
    alignSelf: 'center',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: wash.accent(12),
  },
  moreGlyph: { fontFamily: font.regular, fontSize: 13, lineHeight: 15, color: color.accent },
  cta: { height: 44 },

  title: { letterSpacing: tracking(t.h2, -0.02) },
  /** The rundown's heading, which now sits under the welcome hero. */
  howTitle: { marginTop: 26, letterSpacing: tracking(t.h2, -0.02) },
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
  walkNum: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.accent300,
    fontVariant: ['tabular-nums'],
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
  measureField: { width: MEASURE_W },
  measureInput: {
    width: MEASURE_W,
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
  measureInputDragging: { borderColor: color.accent },
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

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  timeLabel: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },

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
