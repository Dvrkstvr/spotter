/**
 * Today — the planned workout, the week at a glance, and the diary's rearview.
 *
 * The "choose a workout" row and its sheet are gone: the Routines tab is the
 * one place that starts anything, one tab-tap away, with search and the seed
 * collection behind it. What the removal paid for: the seven week rows (which
 * duplicated Plan's list one screen from Plan) compressed to a strip in the
 * calendar's dot grammar, and a Recently section — the last sessions as
 * `history` wrote them, tapping through to their day on Plan.
 *
 * While a session is running the hero card describes it instead of the day's
 * plan. Back out of a workout and this is where you land, so this card is the
 * first thing that has to account for where the workout went.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CHECK_D, Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Tip } from '@/components/tip';
import { routineEquals } from '@/data/buddy-sync';
import { daysSince, shiftISO, todayDow, todayISO } from '@/data/date';
import { measureOf } from '@/data/exercises';
import { loggedRows, plannedOn } from '@/data/plan';
import { countN, DAYS_SHORT, fmtDayShort, fmtDayTiny, fmtLastDone } from '@/data/i18n';
import { groupDigits } from '@/data/stats';
import { stopsOf } from '@/data/superset';
import { pickTip } from '@/data/tips';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, elevation, font, radius, t, tracking, wash } from '@/design/tokens';
import { Btn, CardKicker, H2, H3, H6, missingName } from '@/design/ui';
import { fmtClock, schemeLine, useStore } from '@/store/workout-store';

/**
 * The hero's lines, grouped into stops — a lone exercise, or a superset pair.
 *
 * Through `stopsOf`, not a walk of its own: it is the app's one reading of
 * `with`, so this card cannot come to a different conclusion about which two
 * are joined than the screen you stand in them on does, and an orphan (last
 * row, or a neighbour deleted since) resolves to no pair here exactly as it
 * resolves to none everywhere else.
 */
const heroStops = <T,>(src: readonly { with?: 'next' }[], lines: T[]) =>
  stopsOf(src).map((st) => ({ paired: st.ids.length > 1, lines: st.ids.map((i) => lines[i]) }));

/**
 * One stop's lines, bracketed when they are a pair.
 *
 * A routine that supersets two exercises says so on every surface that draws
 * it — the editor's gutter hairline and word, the overview sheet's and the
 * diary's rule down the side of the two blocks — and this card, the glance you
 * read *before* deciding to train, said nothing at all. The mark is the diary's
 * rather than the editor's because this is a read, not an edit; the word is not
 * repeated because you made the pair in the editor and will stand in it in the
 * overview, and 14px of height on the card above the week strip is the most
 * expensive thing this screen has to spend. The mockup is
 * `design/hero-superset-mockup.html`.
 */
function HeroStop({ paired, children }: { paired: boolean; children: ReactNode }) {
  const styles = useThemed(sheet);
  if (!paired) return <>{children}</>;
  return (
    <View style={styles.heroPair}>
      <View style={styles.heroPairRule} />
      <View style={styles.heroPairBody}>{children}</View>
    </View>
  );
}

export default function TodayScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, routine, start, doneOn, rInfo, exInfo, totals, clock, tipDone } =
    useStore();
  const router = useRouter();

  const dow = todayDow();
  const iso = todayISO();

  /**
   * Today's plan, and which of it the hero is about.
   *
   * A day can hold several workouts now, and the hero shows exactly one: **the
   * first one not yet logged**, or the last of them once they all are (which is
   * what keeps "Completed today" working on a finished day). One definition,
   * shared with which row on Plan gets the primary Start — a second predicate
   * is how the two screens would start disagreeing about what to do next.
   */
  const dayRows = plannedOn(s.plan, iso);
  /**
   * Which rows today's sessions have fulfilled, consumed positionally by
   * `loggedRows` — one session spends against the first not-yet-logged row of
   * its routine, so a day holding the same routine twice logs one row and keeps
   * the other. Same arithmetic Plan and the reminder read, so the hero, the
   * primary Start and the alarm can never disagree about which is next.
   */
  const doneFlags = loggedRows(
    dayRows,
    s.history.filter((h) => h.date === iso).map((h) => h.rid)
  );
  const heroEntry = dayRows.find((_, i) => !doneFlags[i]) ?? dayRows[dayRows.length - 1];
  const todayRid = heroEntry?.rid;
  const tr = routine(todayRid ?? null);
  /**
   * The rest of the day, named under the hero's own lines. Filtered by entry
   * id, not rid: two rules may name the same routine on one day, and dropping
   * by rid would hide the second copy — an entry you could neither see nor act
   * on.
   */
  const alsoToday = dayRows.filter((e) => e.id !== heroEntry?.id);

  /**
   * Whether the card's own workout happened. The design has no completed
   * state for this card — it always reads "planned" — so this treatment is an
   * addition, built from the design's own cues: the accent check from a
   * ticked set, and the demotion of a spent primary button to secondary.
   *
   * Gated on the plan the card names, not on any session: a morning freeform
   * run must not stamp "Completed today" on an untouched Push Day. With
   * several workouts planned the claim has to hold for all of them, or the
   * badge would appear with two rows still to do. A rest-day card names
   * nothing, so there any training counts — and the calendar dot keeps the
   * plain any-session meaning on purpose.
   */
  const doneToday = dayRows.length ? doneFlags.every(Boolean) : doneOn(iso);

  /**
   * A workout is running. The hero stops describing the day's plan and
   * describes the session instead: it is the one thing on this screen that is
   * happening now, and no Start on this phone can start a second one while it
   * is (the guard in `start`), so a card still offering one would be lying.
   *
   * Not gated on `sessionMin` — a session that isn't minimized has the overlay
   * over this card anyway, and reading it off `session` alone keeps the card's
   * state and the store's guard the same question.
   */
  const live = s.session;
  const liveTot = totals();

  /** The session's exercises, each with its ticked count — progress, in place of a scheme. */
  const liveLines = (live?.list ?? []).map((e) => {
    const meta = ex(e.ex);
    const done = e.sets.filter((x) => x.done).length;
    return {
      ...(meta ? exInfo(meta) : { text: e.ex, missing: true }),
      count: `${done} / ${e.sets.length}`,
      full: e.sets.length > 0 && done === e.sets.length,
    };
  });
  /** A pair is still a pair while you are standing in it. */
  const liveStops = heroStops(live?.list ?? [], liveLines);

  /** Days since this routine was last logged, or null if it never was. */
  const lastDays = (() => {
    if (!todayRid) return null;
    const dates = s.history.filter((h) => h.rid === todayRid).map((h) => h.date);
    return dates.length ? daysSince(dates.sort().pop()!) : null;
  })();

  /**
   * While a buddy is live-connected: is today's routine the same on their
   * phone? Content comparison, not id existence — both may have edited it.
   */
  const planSync = (() => {
    if (!tr || !s.buddyEndpoint || !s.buddySnapshot) return null;
    const theirs = s.buddySnapshot.routines.find((r) => r.id === tr.id);
    if (!theirs) return { text: L.planMissing, ok: false };
    if (routineEquals(tr, theirs)) return { text: L.planSynced, ok: true };
    return { text: L.planDiffers, ok: false };
  })();

  const trName = tr ? rInfo(tr) : null;
  /* Built flat and grouped after, so `heroStops` indexes them the way `stopsOf`
     indexes the items they came from. The summary below stays a count of
     exercises and sets, pairs included — a superset is two exercises taken back
     to back, not one exercise. */
  const trLines = (tr?.items ?? []).map((i) => ({
    ...exInfo(ex(i.ex)!),
    scheme: schemeLine(i, measureOf(ex(i.ex)), L),
  }));
  const todayRoutine = tr
    ? {
        name: trName!.text,
        missing: trName!.missing,
        summary: `${countN(tr.items.length, L.exCountOne, L.exCount)} · ${countN(
          tr.items.reduce((a, i) => a + i.sets, 0),
          L.setCountOne,
          L.setCount
        )}`,
        stops: heroStops(tr.items, trLines),
      }
    : { name: L.restDay, missing: false, summary: '', stops: [] };

  /**
   * The week as a strip, in the Plan calendar's dot grammar: full dot
   * trained, ring planned, dash rest — trained wins over planned, exactly as
   * the calendar's full dot does. Each day's ISO is real, so a freeform
   * Saturday shows as trained with nothing scheduled on it.
   */
  const weekStrip = DAYS_SHORT[s.lang].map((d, i) => {
    const date = shiftISO(iso, i - dow);
    return {
      label: d.toUpperCase(),
      date,
      isToday: i === dow,
      state: doneOn(date)
        ? ('done' as const)
        : plannedOn(s.plan, date).length
          ? ('plan' as const)
          : ('rest' as const),
    };
  });

  /**
   * The diary's rearview: the last sessions as `history` wrote them — name
   * frozen at log time, volume as `totals()` counted it. Entries logged
   * before the day view kept detail show what they have (the day, at least).
   */
  const recent = s.history.slice(-2).reverse().map((h, i) => {
    const r = routine(h.rid);
    const sets = h.list?.reduce((a, e) => a + e.sets.length, 0) ?? 0;
    const [y, m, d] = h.date.split('-').map(Number);
    const parts = [fmtDayTiny(s.lang, new Date(y, m - 1, d))];
    if (sets) parts.push(countN(sets, L.setCountOne, L.setCount));
    if (h.vol) parts.push(`${groupDigits(h.vol, L.thousandSep)} ${L.unitKg}`);
    if (h.secs) parts.push(fmtClock(h.secs));
    return {
      key: `${h.date}-${i}`,
      title: h.name?.trim() || (r ? rInfo(r).text : L.freeSession),
      missing: h.name?.trim() ? false : r ? rInfo(r).missing : false,
      meta: parts.join(' · '),
      date: h.date,
    };
  });

  /** Recently taps through to its day on Plan — `planFocus` is the handoff. */
  const openDay = (iso: string) => {
    patch({ planFocus: iso });
    router.push('/plan');
  };

  return (
    <Screen>
      <View style={styles.titleRow}>
        <H2 size={t.h2} style={styles.tight}>
          {L.today}
        </H2>
        <Text style={styles.todayLabel}>{fmtDayShort(s.lang, new Date())}</Text>
      </View>

      <LinearGradient
        colors={[c.accent900, c.surface]}
        locations={[...t.heroGradient.locations]}
        start={t.heroGradient.start}
        end={t.heroGradient.end}
        style={styles.hero}
      >
        {live ? (
          /* The running session, in the planned card's own grammar: kicker,
             name, the lines underneath, one button. What changes is what the
             numbers mean — sets ticked rather than sets planned — and that the
             button goes back into the workout instead of starting one. */
          <>
            <View style={styles.heroTop}>
              <CardKicker>{L.workoutRunning}</CardKicker>
              <View style={styles.spacer} />
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveClock}>{clock}</Text>
              </View>
            </View>

            <View style={styles.heroNameRow}>
              <H3 size={t.h3} style={styles.tight}>
                {live.name}
              </H3>
              {/* A freeform session opens with nothing in it — "0 of 0 sets"
                  is a count of nothing, so it waits for the first exercise. */}
              {liveTot.all > 0 && (
                <Text style={styles.heroSummary}>
                  {`${liveTot.done} ${L.ofSets} ${liveTot.all} ${L.setsWord}`}
                </Text>
              )}
            </View>

            <View style={styles.heroLines}>
              {liveStops.map((st, i) => (
                <HeroStop key={i} paired={st.paired}>
                  {st.lines.map((l, j) => (
                    <View key={j} style={styles.heroLine}>
                      <Text
                        style={[styles.heroLineName, l.missing && missingName(c)]}
                        numberOfLines={1}
                      >
                        {l.text}
                      </Text>
                      <Text style={[styles.heroLineScheme, l.full && { color: c.accent400 }]}>
                        {l.count}
                      </Text>
                    </View>
                  ))}
                </HeroStop>
              ))}
            </View>

            <Btn
              variant="primary"
              block
              label={`${L.backToWorkout} ›`}
              onPress={() => patch({ sessionMin: false })}
              style={styles.startBtn}
              labelStyle={styles.startLabel}
            />
          </>
        ) : (
          <>
            <View style={styles.heroTop}>
              <CardKicker>{L.plannedToday}</CardKicker>
              <View style={styles.spacer} />
              {doneToday ? (
                <View style={styles.doneBadge}>
                  <Icon d={CHECK_D} size={12} strokeWidth={2.2} color={c.accent400} />
                  <Text style={styles.doneBadgeText}>{L.completedToday}</Text>
                </View>
              ) : (
                lastDays !== null && (
                  <Text style={styles.heroLastDone}>{fmtLastDone(L, lastDays)}</Text>
                )
              )}
            </View>

            <View style={styles.heroNameRow}>
              <H3 size={t.h3} style={[styles.tight, todayRoutine.missing && missingName(c)]}>
                {todayRoutine.name}
              </H3>
              <Text style={styles.heroSummary}>{todayRoutine.summary}</Text>
            </View>

            {planSync && (
              <View style={styles.planSyncRow}>
                {planSync.ok && (
                  <Icon d={CHECK_D} size={10} strokeWidth={2.2} color={c.accent400} />
                )}
                <Text
                  style={[
                    styles.planSyncText,
                    { color: planSync.ok ? c.accent400 : c.neutral500 },
                  ]}
                >
                  {planSync.text.replace('{name}', s.buddy ?? '')}
                </Text>
              </View>
            )}

            <View style={styles.heroLines}>
              {todayRoutine.stops.map((st, i) => (
                <HeroStop key={i} paired={st.paired}>
                  {st.lines.map((l, j) => (
                    <View key={j} style={styles.heroLine}>
                      <Text
                        style={[styles.heroLineName, l.missing && missingName(c)]}
                        numberOfLines={1}
                      >
                        {l.text}
                      </Text>
                      <Text style={styles.heroLineScheme}>{l.scheme}</Text>
                    </View>
                  ))}
                </HeroStop>
              ))}
            </View>

            {/* A day can hold more than one workout, and the hero is about
                one of them — so the rest are named rather than stacked into a
                second card. They come back as the hero themselves once this
                one is logged, which is the whole of "next". */}
            {alsoToday.length > 0 && (
              <Text style={styles.alsoToday} numberOfLines={1}>
                {`${L.alsoToday} ${alsoToday
                  .map((e) => {
                    const r = routine(e.rid);
                    return r ? rInfo(r).text : e.rid;
                  })
                  .join(' · ')}`}
              </Text>
            )}

            {/* A rest day has nothing to start — "Start Rest day" was a button
                that promised a workout and delivered an empty one. The way out
                is the free session under the note: it used to live in Today's
                chooser row, which this screen no longer has. */}
            {tr ? (
              <Btn
                variant={doneToday ? 'secondary' : 'primary'}
                block
                label={doneToday ? L.startAgain : `${L.start} ${todayRoutine.name}`}
                onPress={() => start(todayRid)}
                style={styles.startBtn}
                labelStyle={styles.startLabel}
              />
            ) : (
              <>
                <Text style={styles.restNote}>{L.restNote}</Text>
                <Btn
                  variant="ghost"
                  label={`${L.freeSession} ›`}
                  onPress={() => start(null)}
                  style={styles.restFree}
                  labelStyle={styles.restFreeLabel}
                />
              </>
            )}
          </>
        )}
      </LinearGradient>

      {/* Same name as the Plan screen's heading — two labels for one thing made
          the inert copy here read as a broken one. Without the "tap to change"
          hint, though: it was written for Plan's seven named rows, and the
          strip's own tap is a bonus rather than what the heading promises. */}
      <H6 style={[styles.sectionHead, styles.weekHead]}>{L.weeklyPlan}</H6>

      <View style={styles.week}>
        {weekStrip.map((w, i) => (
          // The same tap the seven rows had: pick that day's routine. It's a
          // shortcut on a glance now that the heading no longer advertises it —
          // the day you meant to change is the one you just noticed was wrong.
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={w.label}
            onPress={() => {
              tipDone('strip');
              // A past day is a record — tapping it opens Plan read-only on
              // that day rather than the rule editor, which anchored backwards
              // would invent a workout you never planned. Today and forward
              // still plan in place.
              if (w.date < iso) {
                patch({ planFocus: w.date });
                router.push('/plan');
              } else {
                patch({ dayPlan: { iso: w.date, entry: null } });
              }
            }}
            style={[styles.day, w.isToday && styles.dayToday]}
          >
            <Text style={[styles.dayLabel, w.isToday && { color: c.accent200 }]}>{w.label}</Text>
            <View
              style={[
                styles.dot,
                w.state === 'done' && { backgroundColor: c.accent },
                w.state === 'plan' && { borderWidth: 1, borderColor: c.neutral500 },
                w.state === 'rest' && styles.dotRest,
              ]}
            />
          </Pressable>
        ))}
      </View>

      {/* Where the "tap to change" hint went. The heading deliberately no
          longer advertises the tap — it was written for Plan's seven named
          rows — so this is the one place that says the dots are days you can
          open, and it says it once. */}
      {pickTip(s.tips, ['strip']) === 'strip' && (
        <Tip id="strip" title={L.tipStrip} sub={L.tipStripSub} />
      )}

      {/* Under the strip rather than beside the heading: the glance comes
          first, and the way to the whole plan is what you reach for after
          reading it. Left-aligned like the rest-day's Free session ›. */}
      <Btn
        variant="ghost"
        label={`${L.seePlan} ›`}
        onPress={() => router.push('/plan')}
        labelStyle={styles.seePlan}
        style={styles.seePlanBtn}
      />

      {recent.length > 0 && (
        <>
          <H6 style={[styles.sectionHead, styles.recentHead]}>{L.recently}</H6>
          {recent.map((h) => (
            <Pressable key={h.key} onPress={() => openDay(h.date)} style={styles.recentRow}>
              <View style={styles.recentText}>
                <Text style={[styles.recentName, h.missing && missingName(c)]} numberOfLines={1}>
                  {h.title}
                </Text>
                <Text style={styles.recentMeta} numberOfLines={1}>
                  {h.meta}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </>
      )}

      <View style={{ height: 10 }} />
    </Screen>
  );
}

const sheet = themed(() => ({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  todayLabel: { fontFamily: font.regular, fontSize: 12, color: color.neutral500 },

  hero: {
    marginTop: 14,
    ...t.heroPad,
    borderRadius: t.cardRadius,
    ...elevation.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flex: 1 },
  heroLastDone: { fontFamily: font.regular, fontSize: 11, color: color.neutral500 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  doneBadgeText: { fontFamily: font.regular, fontSize: 11, color: color.accent400 },
  /** The tab-bar strip's dot, at the card's scale. Static on purpose: a
      pulse is motion every second of a workout, which is the opposite of
      what the animation budget is for — the clock beside it already moves. */
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent },
  liveClock: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.accent400,
    fontVariant: ['tabular-nums'],
  },
  planSyncRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  planSyncText: { fontFamily: font.regular, fontSize: 10.5 },
  heroNameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 5 },
  heroSummary: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.neutral500,
    paddingBottom: 5,
  },
  alsoToday: { fontFamily: font.regular, fontSize: 11, color: color.accent400, marginTop: 8 },
  heroLines: { gap: 3, marginTop: 11 },
  heroLine: { flexDirection: 'row', gap: 10 },
  /* A superset's bracket, hung in the card's own padding: 1 + 9 back out
     again, so the paired names keep the left edge every other line has and the
     mark costs no height at all — which on the card above the week strip is
     what buys it. `accent700` rather than the diary's `accent800`, and not as
     a preference: out here the rule sits on the gradient's own `accent900`
     corner, where a 1px `accent800` is four hex digits from its ground and
     simply does not draw. */
  heroPair: { flexDirection: 'row', gap: 9, marginLeft: -10 },
  heroPairRule: { width: 1, borderRadius: 1, backgroundColor: color.accent700 },
  heroPairBody: { flex: 1, gap: 3 },
  heroLineName: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.neutral400 },
  heroLineScheme: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.neutral500,
    fontVariant: ['tabular-nums'],
  },
  startBtn: { marginTop: 14, height: 44 },
  startLabel: { fontSize: 15 },
  /** Stands where the Start button would be, so the card keeps its shape. */
  restNote: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.accent400,
    marginTop: 14,
    paddingVertical: 6,
  },
  restFree: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 0 },
  restFreeLabel: { fontSize: 13 },

  sectionHead: { color: color.neutral500 },
  weekHead: { marginTop: 20 },
  seePlanBtn: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 0 },
  seePlan: { fontSize: 12.5 },

  week: { flexDirection: 'row', gap: 5, marginTop: 8 },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.md,
  },
  dayToday: { borderColor: color.accent700, backgroundColor: wash.accent(10) },
  dayLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.06),
    color: color.neutral500,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  /** A rest day is a dash, not a dot — the calendar draws it the same way. */
  dotRest: { width: 8, height: 1, borderRadius: 0, marginTop: 9.5, backgroundColor: color.neutral700 },

  recentHead: { marginTop: 20, marginBottom: 2 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  recentText: { flex: 1, minWidth: 0 },
  recentName: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  recentMeta: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral600,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  chevron: { fontFamily: font.regular, fontSize: 15, color: color.accent },
}));
