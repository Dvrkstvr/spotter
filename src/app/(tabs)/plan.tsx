/**
 * Plan — the month at a glance, the day in full, and the weekly schedule.
 *
 * Reached from Today's "See plan", so it has no tab of its own. The design
 * fixed the month to August 2026; this shows the real current month.
 *
 * The day detail below the grid is not in the design, which only ever said
 * whether a day was planned or done. This is a diary: tapping a day should
 * answer "what did I actually do", set by set — so every session logged on
 * that day gets its own card here, and the card is also where a workout that
 * isn't filed under a routine can be kept as one.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { toISO, todayISO } from '@/data/date';
import { DOW, measureOf } from '@/data/exercises';
import { countN, DAYS_SHORT, MONTHS } from '@/data/i18n';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, t, tracking } from '@/design/tokens';
import { Btn, H2, H4, H6, Input, missingName } from '@/design/ui';
import { fmtClock, loggedLine, useStore } from '@/store/workout-store';

const GRID_GAP = 3;

export default function PlanScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, exInfo, routine, doneOn, sessionsOn, rInfo, saveDayAsRoutine, start } =
    useStore();
  const [gridWidth, setGridWidth] = useState(0);
  /**
   * Which logged session has its name field open, and which has just been
   * saved — both by index into `history`, both cleared when the day changes.
   * The offer stays a quiet one-line link until it is asked for: most days
   * you are reading the diary, not filing it.
   */
  const [naming, setNaming] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const cell = gridWidth ? (gridWidth - GRID_GAP * 6) / 7 : 0;

  /*
   * The live month replaces the design's fixed August 2026 — and can page.
   * This is a diary: a session logged in August must still be readable in
   * September, so the grid walks back (and forward) month by month. `shift`
   * is months away from today — local state, deliberately not persisted, so
   * reopening the screen always lands on the present.
   */
  const [shift, setShift] = useState(0);
  const now = new Date();
  const view = new Date(now.getFullYear(), now.getMonth() + shift, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const monthName = MONTHS[s.lang][month];
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayISO();
  const isoOf = (day: number) => toISO(new Date(year, month, day));

  const goMonth = (d: number) => {
    const nv = new Date(year, month + d, 1);
    const dim = new Date(nv.getFullYear(), nv.getMonth() + 1, 0).getDate();
    setShift(shift + d);
    // Keep the same day selected where the shorter month allows it.
    patch({ daySel: Math.min(s.daySel, dim) });
    setNaming(null);
    setSaved(null);
  };

  /**
   * Distinct days trained in the *viewed* month — the store's
   * `loggedThisMonth` only ever counts the present one.
   */
  const monthISO = isoOf(1).slice(0, 7);
  const loggedInView = new Set(
    s.history.filter((h) => h.date.startsWith(monthISO)).map((h) => h.date)
  ).size;

  const selDow = (firstDow + s.daySel - 1) % 7;
  const selRoutine = routine(s.schedule[selDow] ?? null);
  const selSessions = sessionsOn(isoOf(s.daySel));

  const pickDay = (day: number) => {
    patch({ daySel: day });
    setNaming(null);
    setSaved(null);
  };

  const daySel = {
    head:
      s.lang === 'de'
        ? `${DAYS_SHORT.de[selDow]} ${s.daySel}. ${monthName}`
        : `${DAYS_SHORT.en[selDow]} ${s.daySel} ${monthName}`,
    title: selRoutine ? rInfo(selRoutine).text : L.restDay,
    // Having trained wins over what was planned, and it says so on a rest day
    // too — the old wording only reached a day with a routine on it, so a
    // freeform Saturday read "Nothing planned" with the session sitting
    // right underneath.
    body: selSessions.length
      ? L.dayDone
      : selRoutine
        ? isoOf(s.daySel) < today
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
        <View style={styles.monthNav}>
          <Btn variant="ghost" label="‹" labelStyle={styles.monthChev} onPress={() => goMonth(-1)} />
          <H4>{`${monthName} ${year}`}</H4>
          <Btn variant="ghost" label="›" labelStyle={styles.monthChev} onPress={() => goMonth(1)} />
        </View>
        <Text style={styles.monthMeta}>
          {/* Away from the present, "this month" would be the wrong claim. */}
          {loggedInView} {shift === 0 ? L.loggedMonth : L.doneWord}
        </Text>
      </View>

      <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {DAYS_SHORT[s.lang].map((d, i) => (
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
              onPress={() => pickDay(day)}
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
                  { color: isoOf(day) < today ? c.neutral600 : c.neutral300 },
                ]}
              >
                {day}
              </Text>
              {/* A day you trained is a full dot whether or not anything was
                  scheduled — the old order gated "done" on there being a
                  routine that day, which left every freeform workout off the
                  calendar entirely. */}
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: isDone
                      ? c.accent
                      : rid
                        ? c.accent800
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
        {/* "Planned for today" used to be a statement with nothing to press —
            the one day a Start belongs is the one you're standing in. */}
        {isoOf(s.daySel) === today && !!selRoutine && selSessions.length === 0 && (
          <Btn
            variant="primary"
            label={L.start}
            style={styles.dayStart}
            labelStyle={styles.dayStartLabel}
            onPress={() => start(selRoutine.id)}
          />
        )}
      </View>

      {selSessions.length > 0 && (
        <>
          <H6 style={styles.sectionHead}>{L.loggedSessions}</H6>
          {selSessions.map(({ h, i }) => {
            const r = routine(h.rid);
            // What it was called that day wins; an entry from before the name
            // was recorded falls back to whatever its routine is called now.
            const title = h.name?.trim() || (r ? rInfo(r).text : L.freeSession);
            const setCount = (h.list ?? []).reduce((a, e) => a + e.sets.length, 0);
            const stats = [
              setCount ? countN(setCount, L.setCountOne, L.setCount) : '',
              h.vol ? `${h.vol} ${L.unitKg}` : '',
              h.secs ? fmtClock(h.secs) : '',
            ]
              .filter(Boolean)
              .join('  ·  ');

            const keep = () => {
              saveDayAsRoutine(i, newName);
              setNaming(null);
              setSaved(i);
            };

            return (
              <View key={i} style={styles.logCard}>
                <View style={styles.logTop}>
                  <Text style={styles.logTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {!!h.buddy && (
                    <Text style={styles.logBuddy} numberOfLines={1}>
                      {L.withBuddy.replace('{name}', h.buddy)}
                    </Text>
                  )}
                </View>
                {!!stats && <Text style={styles.logStats}>{stats}</Text>}

                {h.list?.length ? (
                  h.list.map((e, k) => {
                    const en = ex(e.ex);
                    const info = en ? exInfo(en) : null;
                    return (
                      <View key={k} style={styles.logEx}>
                        <View style={styles.logExTop}>
                          {/* An exercise deleted since falls back to its id,
                              greyed the same way an untranslated name is —
                              the sets are still what happened. */}
                          <Text
                            style={[
                              styles.logExName,
                              (!info || info.missing) && missingName(c),
                            ]}
                            numberOfLines={1}
                          >
                            {info ? info.text : e.ex}
                          </Text>
                          <Text style={styles.logExCount}>
                            {countN(e.sets.length, L.setCountOne, L.setCount)}
                          </Text>
                        </View>
                        <View style={styles.logSets}>
                          {e.sets.map((v, j) => (
                            <Text key={j} style={styles.logSet}>
                              {loggedLine(v, measureOf(en), L)}
                            </Text>
                          ))}
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.logNone}>{L.noDetail}</Text>
                )}

                {/* Keeping a workout as a routine, still open long after the
                    summary closed: a freeform session, one improvised with a
                    buddy, or a routine you drifted far enough from that the
                    day deserves its own name. */}
                {!!h.list?.length &&
                  (saved === i ? (
                    <Text style={styles.logSaved}>{L.routineSaved}</Text>
                  ) : naming === i ? (
                    <View style={styles.saveRow}>
                      <Input
                        style={styles.saveInput}
                        placeholder={L.nameRoutine}
                        value={newName}
                        onChangeText={setNewName}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={keep}
                      />
                      <Btn
                        variant="primary"
                        label={L.save}
                        labelStyle={styles.saveLabel}
                        style={styles.saveBtn}
                        onPress={keep}
                      />
                    </View>
                  ) : (
                    <Btn
                      variant="ghost"
                      label={`+ ${L.saveAsRoutine}`}
                      labelStyle={styles.saveLink}
                      style={styles.saveLinkBtn}
                      onPress={() => {
                        setNewName('');
                        setNaming(i);
                      }}
                    />
                  ))}
              </View>
            );
          })}
        </>
      )}

      <H6 style={styles.sectionHead}>{L.weeklyPlan}</H6>
      <View style={styles.planRows}>
        {DAYS_SHORT[s.lang].map((d, i) => {
          const r = routine(s.schedule[i] ?? null);
          const rn = r ? rInfo(r) : null;
          // Opens the routine selector — the design cycled through the seed
          // routines here, which locked out any user-created ones.
          return (
            <Pressable key={DOW[i]} onPress={() => patch({ dayPick: i })} style={styles.row}>
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
              <Text style={styles.rowMeta}>
                {r ? countN(r.items.length, L.exCountOne, L.exCount) : ''}
              </Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  monthChev: { fontSize: 18, lineHeight: 18 * 1.2 },
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
  dayStart: { alignSelf: 'flex-start', marginTop: 10, minWidth: 120 },
  dayStartLabel: { fontSize: 13 },

  /* — one logged session — */
  logCard: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: t.cardRadius,
    backgroundColor: color.surface,
  },
  logTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  logTitle: { flex: 1, fontFamily: font.heading, fontSize: 15, color: color.text },
  logBuddy: { fontFamily: font.regular, fontSize: 11, color: color.accent400 },
  logStats: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  logNone: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600, marginTop: 8 },

  logEx: { marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.rule },
  logExTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  logExName: { flex: 1, fontFamily: font.regular, fontSize: 13, color: color.text },
  logExCount: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600 },
  /** The sets run loose and wrap; each carries its own unit, so a day that
      mixes a run, a plank and a bench press still reads straight down. */
  logSets: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 3 },
  logSet: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.neutral400,
    fontVariant: ['tabular-nums'],
  },

  saveLinkBtn: { alignSelf: 'flex-start', marginTop: 11, paddingVertical: 2, paddingHorizontal: 0 },
  saveLink: { fontSize: 12 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  saveInput: { flex: 1, width: undefined },
  saveBtn: { paddingVertical: 7 },
  saveLabel: { fontSize: 12.5 },
  logSaved: { fontFamily: font.regular, fontSize: 11.5, color: color.accent400, marginTop: 11 },

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
