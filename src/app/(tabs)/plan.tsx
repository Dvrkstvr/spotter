/**
 * Plan — the month at a glance and the weekly schedule.
 *
 * Reached from Today's "See plan", so it has no tab of its own. The design
 * fixed the month to August 2026; this shows the real current month.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { toISO, todayDom } from '@/data/date';
import { DOW } from '@/data/exercises';
import { MONTHS } from '@/data/i18n';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, t, tracking } from '@/design/tokens';
import { H2, H4, H6, missingName } from '@/design/ui';
import { useStore } from '@/store/workout-store';

const GRID_GAP = 3;

export default function PlanScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, routine, doneOn, loggedThisMonth, rInfo } = useStore();
  const [gridWidth, setGridWidth] = useState(0);

  const cell = gridWidth ? (gridWidth - GRID_GAP * 6) / 7 : 0;

  /* The live month replaces the design's fixed August 2026. */
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = MONTHS[s.lang][month];
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dom = todayDom();
  const isoOf = (day: number) => toISO(new Date(year, month, day));

  const selDow = (firstDow + s.daySel - 1) % 7;
  const selRoutine = routine(s.schedule[selDow] ?? null);
  const selDone = doneOn(isoOf(s.daySel));

  const daySel = {
    head:
      s.lang === 'de'
        ? `${DOW[selDow]} ${s.daySel}. ${monthName}`
        : `${DOW[selDow]} ${s.daySel} ${monthName}`,
    title: selRoutine ? rInfo(selRoutine).text : L.restDay,
    body: selRoutine
      ? selDone
        ? L.dayDone
        : s.daySel < dom
          ? L.dayPlannedPast
          : L.dayPlanned
      : L.dayFree,
  };

  return (
    <Screen>
      <H2 size={t.h2} style={styles.tight}>
        {L.plan}
      </H2>

      <View style={styles.monthRow}>
        <H4>{`${monthName} ${year}`}</H4>
        <Text style={styles.monthMeta}>
          {loggedThisMonth()} {L.loggedMonth}
        </Text>
      </View>

      <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {DOW.map((d, i) => (
          <View key={`h${i}`} style={{ width: cell }}>
            <Text style={styles.dowHead}>{d[0]}</Text>
          </View>
        ))}

        {/* Lead-in blanks so the 1st lands on its real weekday. */}
        {Array.from({ length: firstDow }, (_, i) => (
          <View key={`b${i}`} style={{ width: cell, height: cell }} />
        ))}

        {Array.from({ length: daysInMonth }, (_, k) => {
          const day = k + 1;
          const rid = s.schedule[(firstDow + day - 1) % 7];
          const isDone = doneOn(isoOf(day));
          const isSel = day === s.daySel;
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              onPress={() => patch({ daySel: day })}
              style={[
                styles.cell,
                {
                  width: cell,
                  height: cell,
                  backgroundColor: isSel ? c.accent900 : 'transparent',
                  borderColor: isSel ? c.accent700 : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.cellNum,
                  { color: day < dom ? c.neutral600 : c.neutral300 },
                ]}
              >
                {day}
              </Text>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: rid
                      ? isDone
                        ? c.accent
                        : c.accent800
                      : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: c.accent }]} />
          <Text style={styles.legendText}>{L.doneWord}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: c.accent800 }]} />
          <Text style={styles.legendText}>{L.plannedWord}</Text>
        </View>
      </View>

      <View style={styles.dayCard}>
        <Text style={styles.dayHead}>{daySel.head}</Text>
        <Text style={styles.dayTitle}>{daySel.title}</Text>
        <Text style={styles.dayBody}>{daySel.body}</Text>
      </View>

      <H6 style={styles.sectionHead}>{L.weeklyPlan}</H6>
      <View style={styles.planRows}>
        {DOW.map((d, i) => {
          const r = routine(s.schedule[i] ?? null);
          const rn = r ? rInfo(r) : null;
          // Opens the routine selector — the design cycled through the seed
          // routines here, which locked out any user-created ones.
          return (
            <Pressable key={d} onPress={() => patch({ dayPick: i })} style={styles.row}>
              <Text style={styles.rowDay}>{d.toUpperCase()}</Text>
              <Text
                style={[
                  styles.rowName,
                  { color: r ? c.text : c.neutral600 },
                  rn?.missing && missingName(c),
                ]}
                numberOfLines={1}
              >
                {rn ? rn.text : L.rest}
              </Text>
              <Text style={styles.rowMeta}>{r ? `${r.items.length} ${L.exCount}` : ''}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const sheet = themed(() => ({
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  monthMeta: { fontFamily: font.regular, fontSize: 11, color: color.neutral500 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: 10 },
  dowHead: {
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.07),
    color: color.neutral600,
    paddingBottom: 2,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  cellNum: { fontFamily: font.regular, fontSize: 12 },
  dot: { width: 15, height: 2.5, borderRadius: 2 },

  legend: { flexDirection: 'row', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: font.regular, fontSize: 11, color: color.neutral500 },

  dayCard: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: t.cardRadius,
    backgroundColor: color.surface,
  },
  dayHead: {
    fontFamily: font.regular,
    fontSize: 11,
    letterSpacing: tracking(11, 0.08),
    textTransform: 'uppercase',
    color: color.accent,
  },
  dayTitle: { fontFamily: font.regular, fontSize: 15, color: color.text, marginTop: 4 },
  dayBody: { fontFamily: font.regular, fontSize: 12, color: color.neutral500, marginTop: 2 },

  sectionHead: { marginTop: 22, marginBottom: 8, color: color.neutral500 },
  planRows: { gap: t.gap, paddingBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderRadius: t.rowRadius,
    backgroundColor: t.rowBg,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  rowDay: {
    width: 34,
    fontFamily: font.regular,
    fontSize: 11,
    letterSpacing: tracking(11, 0.08),
    color: color.neutral500,
  },
  rowName: { flex: 1, fontFamily: font.regular, fontSize: 14 },
  rowMeta: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
}));
