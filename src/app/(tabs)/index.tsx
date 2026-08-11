/** Today — the planned workout, the week at a glance, and a way to start anything else. */
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { CHECK_D, Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { routineEquals } from '@/data/buddy-sync';
import { daysSince, todayDow, todayISO } from '@/data/date';
import { measureOf } from '@/data/exercises';
import { countN, DAYS_SHORT, fmtDayShort, fmtLastDone } from '@/data/i18n';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, elevation, font, t, tracking } from '@/design/tokens';
import { Btn, CardKicker, H2, H3, H6, missingName } from '@/design/ui';
import { schemeLine, useStore } from '@/store/workout-store';

export default function TodayScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, routine, start, doneOn, rInfo, exInfo } = useStore();
  const router = useRouter();

  const dow = todayDow();
  const todayRid = s.schedule[dow];
  const tr = routine(todayRid ?? null);

  /**
   * Whether the card's own workout happened. The design has no completed
   * state for this card — it always reads "planned" — so this treatment is an
   * addition, built from the design's own cues: the accent check from a
   * ticked set, and the demotion of a spent primary button to secondary.
   *
   * Gated on the routine the card names, not on any session: a morning
   * freeform run must not stamp "Completed today" on an untouched Push Day.
   * A rest-day card names nothing, so there any training counts — and the
   * calendar dot keeps the plain any-session meaning on purpose.
   */
  const doneToday = todayRid
    ? s.history.some((h) => h.date === todayISO() && h.rid === todayRid)
    : doneOn(todayISO());

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
  const todayRoutine = tr
    ? {
        name: trName!.text,
        missing: trName!.missing,
        summary: `${countN(tr.items.length, L.exCountOne, L.exCount)} · ${countN(
          tr.items.reduce((a, i) => a + i.sets, 0),
          L.setCountOne,
          L.setCount
        )}`,
        lines: tr.items.map((i) => ({
          ...exInfo(ex(i.ex)!),
          scheme: schemeLine(i, measureOf(ex(i.ex)), L),
        })),
      }
    : { name: L.restDay, missing: false, summary: '', lines: [] };

  const weekRows = DAYS_SHORT[s.lang].map((d, i) => {
    const rid = s.schedule[i];
    const r = routine(rid ?? null);
    const rn = r ? rInfo(r) : null;
    const isToday = i === dow;
    return {
      day: d.toUpperCase(),
      dayColor: isToday ? c.accent : c.neutral500,
      name: rn ? rn.text : L.rest,
      missing: rn?.missing ?? false,
      nameColor: r ? (isToday ? c.text : c.neutral300) : c.neutral600,
      meta: r ? countN(r.items.length, L.exCountOne, L.exCount) : '',
    };
  });

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
          {todayRoutine.lines.map((l, i) => (
            <View key={i} style={styles.heroLine}>
              <Text style={[styles.heroLineName, l.missing && missingName(c)]} numberOfLines={1}>
                {l.text}
              </Text>
              <Text style={styles.heroLineScheme}>{l.scheme}</Text>
            </View>
          ))}
        </View>

        {/* A rest day has nothing to start — "Start Rest day" was a button that
            promised a workout and delivered an empty one. The freeform row
            below the week is still there for the day it turns into one. */}
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
          <Text style={styles.restNote}>{L.restNote}</Text>
        )}
      </LinearGradient>

      <View style={styles.sectionRow}>
        {/* Same list, same rows, same name as the Plan screen's — two labels
            for one thing made the inert copy here read as a broken one. */}
        <H6 style={styles.sectionHead}>{L.weeklyPlan}</H6>
        <Btn
          variant="ghost"
          label={`${L.seePlan} ›`}
          onPress={() => router.push('/plan')}
          labelStyle={styles.seePlan}
          style={styles.seePlanBtn}
        />
      </View>

      <View style={styles.week}>
        {weekRows.map((w, i) => (
          // The same tap as Plan's weekly rows: pick that day's routine. The
          // rows looked identical to Plan's and did nothing, which reads as
          // the tap not registering rather than as a design choice.
          <Pressable key={i} onPress={() => patch({ dayPick: i })} style={styles.row}>
            <Text style={[styles.rowDay, { color: w.dayColor }]}>{w.day}</Text>
            <Text
              style={[styles.rowName, { color: w.nameColor }, w.missing && missingName(c)]}
              numberOfLines={1}
            >
              {w.name}
            </Text>
            <Text style={styles.rowMeta}>{w.meta}</Text>
          </Pressable>
        ))}
      </View>

      <H6 style={[styles.sectionHead, styles.orStart]}>{L.orStart}</H6>
      <Pressable style={styles.chooseRow} onPress={() => patch({ pickWorkout: true })}>
        <Text style={styles.chooseLabel} numberOfLines={1}>
          {L.chooseWorkout}
        </Text>
        <Text style={styles.chooseCount}>
          {/* Its own key, not `.toLowerCase()` — German keeps the capital. */}
          {s.routines.length} {L.routinesWord}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

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
  planSyncRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  planSyncText: { fontFamily: font.regular, fontSize: 10.5 },
  heroNameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 5 },
  heroSummary: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.neutral500,
    paddingBottom: 5,
  },
  heroLines: { gap: 3, marginTop: 11 },
  heroLine: { flexDirection: 'row', gap: 10 },
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

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  sectionHead: { color: color.neutral500 },
  seePlanBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  seePlan: { fontSize: 12.5 },

  week: { marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  rowDay: { width: 34, fontFamily: font.regular, fontSize: 11, letterSpacing: tracking(11, 0.08) },
  rowName: { flex: 1, fontFamily: font.regular, fontSize: 13.5 },
  rowMeta: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },

  orStart: { marginTop: 20, marginBottom: 8 },
  chooseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderRadius: t.rowRadius,
    backgroundColor: t.rowBg,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  chooseLabel: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  chooseCount: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },
  chevron: { fontFamily: font.regular, fontSize: 15, color: color.accent },
}));
