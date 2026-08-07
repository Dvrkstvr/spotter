/** Today — the planned workout, the week at a glance, and a way to start anything else. */
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CHECK_D, Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { daysSince, todayDow, todayISO } from '@/data/date';
import { DOW } from '@/data/exercises';
import { fmtDayShort, fmtLastDone } from '@/data/i18n';
import { color, elevation, font, t, tracking } from '@/design/tokens';
import { Btn, CardKicker, H2, H3, H6, missingName } from '@/design/ui';
import { fmt, useStore } from '@/store/workout-store';

export default function TodayScreen() {
  const { s, L, patch, ex, routine, start, doneOn, rInfo, exInfo } = useStore();
  const router = useRouter();

  const dow = todayDow();
  const todayRid = s.schedule[dow];
  const tr = routine(todayRid ?? null);

  /**
   * Whether today has a logged session. The design has no completed state for
   * this card — it always reads "planned" — so this treatment is an addition,
   * built from the design's own cues: the accent check from a ticked set, and
   * the demotion of a spent primary button to secondary.
   */
  const doneToday = doneOn(todayISO());

  /** Days since this routine was last logged, or null if it never was. */
  const lastDays = (() => {
    if (!todayRid) return null;
    const dates = s.history.filter((h) => h.rid === todayRid).map((h) => h.date);
    return dates.length ? daysSince(dates.sort().pop()!) : null;
  })();

  const trName = tr ? rInfo(tr) : null;
  const todayRoutine = tr
    ? {
        name: trName!.text,
        missing: trName!.missing,
        summary: `${tr.items.length} ${L.exCount} · ${tr.items.reduce((a, i) => a + i.sets, 0)} ${L.setCount}`,
        lines: tr.items.map((i) => ({
          ...exInfo(ex(i.ex)!),
          scheme: `${i.sets} × ${i.reps}  ·  ${i.w ? `${fmt(i.w)} kg` : 'BW'}`,
        })),
      }
    : { name: L.restDay, missing: false, summary: '', lines: [] };

  const weekRows = DOW.map((d, i) => {
    const rid = s.schedule[i];
    const r = routine(rid ?? null);
    const rn = r ? rInfo(r) : null;
    const isToday = i === dow;
    return {
      day: d.toUpperCase(),
      dayColor: isToday ? color.accent : color.neutral500,
      name: rn ? rn.text : L.rest,
      missing: rn?.missing ?? false,
      nameColor: r ? (isToday ? color.text : color.neutral300) : color.neutral600,
      meta: r ? `${r.items.length} ${L.exCount}` : '',
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
        colors={[...t.heroGradient.colors]}
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
              <Icon d={CHECK_D} size={12} strokeWidth={2.2} color={color.accent400} />
              <Text style={styles.doneBadgeText}>{L.completedToday}</Text>
            </View>
          ) : (
            lastDays !== null && (
              <Text style={styles.heroLastDone}>{fmtLastDone(L, lastDays)}</Text>
            )
          )}
        </View>

        <View style={styles.heroNameRow}>
          <H3 size={t.h3} style={[styles.tight, todayRoutine.missing && missingName]}>
            {todayRoutine.name}
          </H3>
          <Text style={styles.heroSummary}>{todayRoutine.summary}</Text>
        </View>

        <View style={styles.heroLines}>
          {todayRoutine.lines.map((l, i) => (
            <View key={i} style={styles.heroLine}>
              <Text style={[styles.heroLineName, l.missing && missingName]} numberOfLines={1}>
                {l.text}
              </Text>
              <Text style={styles.heroLineScheme}>{l.scheme}</Text>
            </View>
          ))}
        </View>

        <Btn
          variant={doneToday ? 'secondary' : 'primary'}
          block
          label={doneToday ? L.startAgain : `${L.start} ${todayRoutine.name}`}
          onPress={() => start(todayRid)}
          style={styles.startBtn}
          labelStyle={styles.startLabel}
        />
      </LinearGradient>

      <View style={styles.sectionRow}>
        <H6 style={styles.sectionHead}>{L.thisWeek}</H6>
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
          <View key={i} style={styles.row}>
            <Text style={[styles.rowDay, { color: w.dayColor }]}>{w.day}</Text>
            <Text
              style={[styles.rowName, { color: w.nameColor }, w.missing && missingName]}
              numberOfLines={1}
            >
              {w.name}
            </Text>
            <Text style={styles.rowMeta}>{w.meta}</Text>
          </View>
        ))}
      </View>

      <H6 style={[styles.sectionHead, styles.orStart]}>{L.orStart}</H6>
      <Pressable style={styles.chooseRow} onPress={() => patch({ pickWorkout: true })}>
        <Text style={styles.chooseLabel} numberOfLines={1}>
          {L.chooseWorkout}
        </Text>
        <Text style={styles.chooseCount}>
          {s.routines.length} {L.routines.toLowerCase()}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <View style={{ height: 10 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
