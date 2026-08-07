/**
 * Plan — the month at a glance and the weekly schedule.
 *
 * Reached from Today's "See plan", so it has no tab of its own. The month is
 * August 2026 with 1 August on a Saturday, exactly as the design fixes it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { DOW } from '@/data/exercises';
import { color, font, t, tracking, TODAY_DOM } from '@/design/tokens';
import { H2, H4, H6 } from '@/design/ui';
import { useStore } from '@/store/workout-store';

/** Weekday index of the 1st: August 2026 opens on a Saturday. */
const FIRST_DOW = 5;
const DAYS_IN_MONTH = 31;
const GRID_GAP = 3;

/** Tapping a weekday cycles it through the routines, then back to rest. */
const CYCLE: (string | null)[] = [null, 'chest', 'back', 'both'];

export default function PlanScreen() {
  const { s, L, patch, routine } = useStore();
  const [gridWidth, setGridWidth] = useState(0);

  const cell = gridWidth ? (gridWidth - GRID_GAP * 6) / 7 : 0;

  const selDow = (FIRST_DOW + s.daySel - 1) % 7;
  const selRoutine = routine(s.schedule[selDow] ?? null);
  const selDone = s.done.includes(s.daySel);

  const daySel = {
    head: `${DOW[selDow]} ${s.daySel} August`,
    title: selRoutine ? selRoutine.name : L.restDay,
    body: selRoutine
      ? selDone
        ? L.dayDone
        : s.daySel < TODAY_DOM
          ? L.dayPlannedPast
          : L.dayPlanned
      : L.dayFree,
  };

  const cycle = (dow: number) =>
    patch((st) => {
      const next = CYCLE[(CYCLE.indexOf(st.schedule[dow] ?? null) + 1) % CYCLE.length];
      const schedule = { ...st.schedule };
      if (next) schedule[dow] = next;
      else delete schedule[dow];
      return { schedule };
    });

  return (
    <Screen>
      <H2 size={t.h2} style={styles.tight}>
        {L.plan}
      </H2>

      <View style={styles.monthRow}>
        <H4>August 2026</H4>
        <Text style={styles.monthMeta}>
          {s.done.length} {L.loggedMonth}
        </Text>
      </View>

      <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {DOW.map((d, i) => (
          <View key={`h${i}`} style={{ width: cell }}>
            <Text style={styles.dowHead}>{d[0]}</Text>
          </View>
        ))}

        {/* Lead-in blanks so the 1st lands on its real weekday. */}
        {Array.from({ length: FIRST_DOW }, (_, i) => (
          <View key={`b${i}`} style={{ width: cell, height: cell }} />
        ))}

        {Array.from({ length: DAYS_IN_MONTH }, (_, k) => {
          const day = k + 1;
          const rid = s.schedule[(FIRST_DOW + day - 1) % 7];
          const isDone = s.done.includes(day);
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
                  backgroundColor: isSel ? color.accent900 : 'transparent',
                  borderColor: isSel ? color.accent700 : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.cellNum,
                  { color: day < TODAY_DOM ? color.neutral600 : color.neutral300 },
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
                        ? color.accent
                        : color.accent800
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
          <View style={[styles.dot, { backgroundColor: color.accent }]} />
          <Text style={styles.legendText}>{L.doneWord}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: color.accent800 }]} />
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
          return (
            <Pressable key={d} onPress={() => cycle(i)} style={styles.row}>
              <Text style={styles.rowDay}>{d.toUpperCase()}</Text>
              <Text
                style={[styles.rowName, { color: r ? color.text : color.neutral600 }]}
                numberOfLines={1}
              >
                {r ? r.name : L.rest}
              </Text>
              <Text style={styles.rowMeta}>{r ? `${r.items.length} ${L.exCount}` : ''}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
