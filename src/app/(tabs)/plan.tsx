/**
 * Plan — the month, and the day in full.
 *
 * Reached from Today's "See plan", so it has no tab of its own — which is why
 * it now carries a **‹ Back** header, the same shape Settings, Insights and the
 * picker use. Android's back always worked here; nothing on the glass said so.
 *
 * The design fixed the month to August 2026; this shows the real one and pages.
 * The weekday rows that used to sit under the grid are gone: they were the
 * second answer to a question the calendar above them already answered, and
 * they could only ever say "this weekday, forever". **The calendar is now the
 * only place a plan is organised** — see `src/data/plan.ts` for the model and
 * `design/plan-revamp-mockup.html` for the screen this is built from.
 *
 * The day panel answers two questions that must never merge: what was
 * *planned* (rules, one row each) and what was *logged* (`history`, as
 * written). A day can be one, both or neither — per row.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon, MARK_D } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Tip } from '@/components/tip';
import { fromISO, toISO, todayISO } from '@/data/date';
import { measureOf } from '@/data/exercises';
import { countN, DAYS_SHORT, fmtDayShort, MONTHS, repeatLabel } from '@/data/i18n';
import { loggedRows, plannedOn, restChosen, skippedOn } from '@/data/plan';
import { pickTip } from '@/data/tips';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, t, tracking } from '@/design/tokens';
import { Btn, H2, H4, H6, Input, missingName } from '@/design/ui';
import { fmtClock, loggedLine, type LoggedExercise, useStore } from '@/store/workout-store';

const GRID_GAP = 3;

/**
 * A logged session's exercises, grouped into what they were on the screen: a
 * lone exercise, or the supersets that were taken as one thing. Adjacency,
 * like the routine field it comes from — and a `with` on the last entry, or on
 * one whose partner never got a set ticked, simply groups nothing.
 */
const logGroups = (list: readonly LoggedExercise[]): number[][] => {
  const out: number[][] = [];
  list.forEach((_, k) => {
    if (k > 0 && list[k - 1].with === 'next') out[out.length - 1].push(k);
    else out.push([k]);
  });
  return out;
};

export default function PlanScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const {
    s, L, patch, ex, exInfo, routine, doneOn, sessionsOn, rInfo, saveDayAsRoutine, start,
    restorePlanDay, tipDone,
  } = useStore();
  const router = useRouter();
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

  /**
   * Today's Recently rows hand a date over in `planFocus`; this is the only
   * thing that moves `shift` without a tap. Consumed once and cleared — it is
   * a handoff, not a position, so reopening Plan cold still lands on the
   * present. In an effect rather than during render: it writes to the store.
   */
  useEffect(() => {
    if (!s.planFocus) return;
    const [fy, fm] = s.planFocus.split('-').map(Number);
    const n = new Date();
    setShift((fy - n.getFullYear()) * 12 + (fm - 1 - n.getMonth()));
    patch({ daySel: s.planFocus, planFocus: null });
    setNaming(null);
    setSaved(null);
  }, [s.planFocus, patch]);

  const now = new Date();
  const view = new Date(now.getFullYear(), now.getMonth() + shift, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const monthName = MONTHS[s.lang][month];
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayISO();
  const isoOf = (day: number) => toISO(new Date(year, month, day));

  const clearDay = () => {
    setNaming(null);
    setSaved(null);
  };

  const goMonth = (d: number) => {
    const nv = new Date(year, month + d, 1);
    const dim = new Date(nv.getFullYear(), nv.getMonth() + 1, 0).getDate();
    setShift(shift + d);
    // Keep the same day of the month where the shorter month allows it. The
    // selection is a date now, so it has to be rewritten rather than clamped.
    const dom = Math.min(Number(s.daySel.slice(8)), dim);
    patch({ daySel: toISO(new Date(nv.getFullYear(), nv.getMonth(), dom)) });
    clearDay();
  };

  /**
   * Distinct days trained in the *viewed* month — the store's
   * `loggedThisMonth` only ever counts the present one.
   */
  const monthISO = isoOf(1).slice(0, 7);
  const loggedInView = new Set(
    s.history.filter((h) => h.date.startsWith(monthISO)).map((h) => h.date)
  ).size;

  const sel = s.daySel;
  const selSessions = sessionsOn(sel);
  /** Today and forward is a plan; behind it is a record — see below. */
  const editable = sel >= today;
  const live = s.session !== null;

  /**
   * The day's planned workouts, in the order their rules were made.
   *
   * `logged` is consumed positionally, not matched by identity: `loggedRows`
   * spends each session against the first not-yet-logged row of its routine, so
   * planning a routine twice and logging it once ticks the first row and leaves
   * the second waiting. A free session belongs to no row and lands only in the
   * Logged block. `next` is the first row *not* logged — one definition, shared
   * with Today's hero and the plan reminder, so none of the three can disagree
   * about which workout is the one to start.
   */
  const planned = plannedOn(s.plan, sel);
  const doneFlags = loggedRows(
    planned,
    selSessions.map((x) => x.h.rid)
  );
  const rows = planned.map((e, i) => {
    const r = routine(e.rid);
    const name = r ? rInfo(r) : null;
    const sets = r ? r.items.reduce((a, i) => a + i.sets, 0) : 0;
    return {
      entry: e,
      name: name?.text ?? e.rid,
      missing: !r || !!name?.missing,
      summary: r
        ? `${countN(r.items.length, L.exCountOne, L.exCount)} · ${countN(sets, L.setCountOne, L.setCount)}`
        : '',
      rule: repeatLabel(e.repeat, L, s.lang),
      logged: doneFlags[i],
    };
  });
  const next = doneFlags.findIndex((d) => !d);

  /** Occurrences cancelled on this day — kept on screen so Restore is one tap. */
  const off = skippedOn(s.plan, sel).map((e) => {
    const r = routine(e.rid);
    const name = r ? rInfo(r) : null;
    return {
      entry: e,
      name: name?.text ?? e.rid,
      missing: !r || !!name?.missing,
      rule: repeatLabel(e.repeat, L, s.lang),
    };
  });

  /**
   * With no rows, the title is the whole answer — and "Rest day" is now a
   * *choice* (a cancelled occurrence) rather than the only way to say nothing.
   * Before dated rules every blank day called itself a rest day, which is what
   * put "Nothing planned" over a logged session.
   */
  const empty = restChosen(s.plan, sel)
    ? { title: L.restDay, body: L.restNote }
    : {
        title: L.nothingPlanned,
        body: selSessions.length ? L.dayDone : L.dayFree,
      };

  const pickDay = (day: number) => {
    patch({ daySel: isoOf(day) });
    clearDay();
  };

  // Opening a day is the card's whole lesson — the rest of the model is
  // written on the sheet that comes up.
  const planDay = (entry: string | null) => {
    tipDone('plan');
    patch({ dayPlan: { iso: sel, entry } });
  };

  /** Start, or resurface the one already running — the guard in `start` decides. */
  const startRow = (rid: string) => (live ? patch({ sessionMin: false }) : start(rid));

  return (
    <Screen>
      {/* Plan is in the tabs but has no button in the bar, so this is the only
          affordance out of it. `canGoBack` is the floor: a notification or deep
          link can land here cold, and a dead back button is worse than none. */}
      <View style={styles.header}>
        <Btn
          variant="ghost"
          label={L.back}
          labelStyle={styles.backLabel}
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>

      <H2 size={t.h2} style={styles.tight}>
        {L.plan}
      </H2>

      {/* A card rather than a nudge, because what it teaches is the whole
          screen's model rather than one control: the grid *is* the plan now
          that the seven weekday rows are gone, and nothing in a month of dots
          says a rule lives behind each one. Capped list of two — this and
          Insights — and a third screen wanting one would be a screen with a
          problem a card can't fix. */}
      {pickTip(s.tips, ['plan']) === 'plan' && (
        <Tip card id="plan" title={L.tipPlan} sub={L.tipPlanSub} />
      )}

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
          const iso = isoOf(day);
          const isDone = doneOn(iso);
          const isSel = iso === sel;
          // One planned workout and three draw the same bar. What a day holds
          // is the panel's job; a fourth mark nobody can read at this size is
          // not an improvement.
          const isPlanned = plannedOn(s.plan, iso).length > 0;
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
                style={[styles.cellNum, { color: iso < today ? c.neutral600 : c.neutral300 }]}
              >
                {day}
              </Text>
              {/* A day you trained is a full bar whether or not anything was
                  scheduled — the old order gated "done" on there being a
                  routine that day, which left every freeform workout off the
                  calendar entirely. */}
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: isDone ? c.accent : isPlanned ? c.accent800 : 'transparent',
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
        <Text style={styles.dayHead}>
          {`${fmtDayShort(s.lang, fromISO(sel))}${sel === today ? ` · ${L.agoToday}` : ''}`}
        </Text>

        {rows.length === 0 && (
          <>
            <Text style={styles.dayTitle}>{empty.title}</Text>
            <Text style={styles.dayBody}>{empty.body}</Text>
          </>
        )}

        {rows.map((r, i) => (
          <Pressable
            key={r.entry.id}
            disabled={!editable}
            onPress={() => planDay(r.entry.id)}
            style={[styles.planRow, i === 0 && styles.planRowFirst]}
          >
            <View style={styles.planText}>
              <Text style={[styles.planName, r.missing && missingName(c)]} numberOfLines={1}>
                {r.name}
              </Text>
              {/* A past row that never happened says so where its set count
                  would be: the plan is the only thing left to report. */}
              <Text style={styles.planSub} numberOfLines={1}>
                {!r.logged && sel < today ? L.dayPlannedPast : r.summary}
              </Text>
            </View>
            <Text style={styles.rulePill}>{r.rule}</Text>
            {r.logged ? (
              <Text style={styles.planDone}>{`✓ ${L.planLogged}`}</Text>
            ) : (
              sel === today &&
              !live &&
              (i === next ? (
                <Btn
                  variant="primary"
                  label={L.startBare}
                  style={styles.rowStart}
                  labelStyle={styles.rowStartLabel}
                  onPress={() => startRow(r.entry.rid)}
                />
              ) : (
                <Btn
                  variant="ghost"
                  label={`${L.startBare} ›`}
                  style={styles.rowGhost}
                  labelStyle={styles.rowGhostLabel}
                  onPress={() => startRow(r.entry.rid)}
                />
              ))
            )}
          </Pressable>
        ))}

        {/* Dashed is the app's "not yet a fact" grammar — the waiting set row,
            the held CTA — and a cancelled occurrence is exactly that. It stays
            on screen so undoing is one tap rather than a re-plan. */}
        {off.map((o) => (
          <View key={o.entry.id} style={styles.offRow}>
            <Text style={[styles.offName, o.missing && missingName(c)]} numberOfLines={1}>
              {o.name}
            </Text>
            <Text style={styles.offRule}>{o.rule}</Text>
            {editable && (
              <Btn
                variant="ghost"
                label={`${L.planRestore} ›`}
                style={styles.rowGhost}
                labelStyle={styles.rowGhostLabel}
                onPress={() => restorePlanDay(sel, o.entry.id)}
              />
            )}
          </View>
        ))}

        <View style={styles.dayFoot}>
          {/* One live session owns every Start in the app, so a day of rows
              carries one way back rather than a row of identical labels. */}
          {live && sel === today && (
            <Btn
              variant="secondary"
              label={`${L.backToWorkout} ›`}
              style={styles.backToWorkout}
              labelStyle={styles.rowGhostLabel}
              onPress={() => patch({ sessionMin: false })}
            />
          )}
          {/* A past day is a record: a rule anchored backwards would invent
              workouts you never planned, and skips you never chose. */}
          {editable && (
            <Btn
              variant="ghost"
              label={L.planWorkout}
              style={styles.addPlan}
              labelStyle={styles.addPlanLabel}
              onPress={() => planDay(null)}
            />
          )}
        </View>
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
                  // Grouped the way the session drew them: consecutive entries
                  // joined by `with` were one superset, and two ordinary blocks
                  // would file as two exercises what was taken as one thing.
                  logGroups(h.list).map((group) => {
                    const blocks = group.map((k) => {
                      const e = h.list![k];
                      const en = ex(e.ex);
                      const info = en ? exInfo(en) : null;
                      // Each drop folded into the set it came off. `50 × 8`
                      // under `65 × 6` reads as a set that went wrong unless
                      // the record says the two were one effort — which is the
                      // whole reason `links` is kept.
                      const chains: number[][] = [];
                      e.sets.forEach((_, j) => {
                        if (e.links?.[j] && chains.length) chains[chains.length - 1].push(j);
                        else chains.push([j]);
                      });
                      const setNode = (j: number, chained: boolean) => {
                        const line = loggedLine(e.sets[j], measureOf(en), L);
                        const text = chained ? `↳ ${line}` : line;
                        // Index for index with the sets — see
                        // `LoggedExercise`. Absent on every entry logged
                        // before marks were kept, and on any session nobody
                        // marked.
                        const mk = e.marks?.[j] ?? null;
                        if (!mk) {
                          return (
                            <Text key={j} style={styles.logSet}>
                              {text}
                            </Text>
                          );
                        }
                        const note = mk.note?.trim();
                        return (
                          // A verdict is worth a glyph and stays in the wrap;
                          // only *words* earn a line of their own, and take
                          // the full width to get one. The sets around it
                          // close up as before, so a card with nothing written
                          // on it is the card it always was.
                          <View key={j} style={[styles.logMarked, !!note && styles.logNoted]}>
                            <Text style={styles.logSet}>{text}</Text>
                            {/* `neutral500`, not accent: in the session the
                                mark is live and yours to change, here it is
                                history, written in the greys the figures
                                beside it are. */}
                            <Icon d={MARK_D[mk.mark]} size={12} color={c.neutral500} strokeWidth={2.2} />
                            {note ? (
                              <Text style={styles.logNote} numberOfLines={2}>
                                {note}
                              </Text>
                            ) : null}
                          </View>
                        );
                      };
                      return (
                        <View key={k} style={styles.logEx}>
                          <View style={styles.logExTop}>
                            {/* An exercise deleted since falls back to its id,
                                greyed the same way an untranslated name is —
                                the sets are still what happened. */}
                            <Text
                              style={[styles.logExName, (!info || info.missing) && missingName(c)]}
                              numberOfLines={1}
                            >
                              {info ? info.text : e.ex}
                            </Text>
                            <Text style={styles.logExCount}>
                              {countN(e.sets.length, L.setCountOne, L.setCount)}
                            </Text>
                          </View>
                          <View style={styles.logSets}>
                            {chains.map((members, ci) =>
                              members.length === 1 ? (
                                setNode(members[0], false)
                              ) : (
                                <View
                                  key={`c${ci}`}
                                  style={[
                                    styles.logChain,
                                    members.some((j) => e.marks?.[j]?.note?.trim()) &&
                                      styles.logNoted,
                                  ]}
                                >
                                  {members.map((j, mi) => setNode(j, mi > 0))}
                                </View>
                              )
                            )}
                          </View>
                        </View>
                      );
                    });
                    return group.length > 1 ? (
                      <View key={`g${group[0]}`} style={styles.logPair}>
                        <View style={styles.logPairRule} />
                        <View style={styles.logPairBody}>
                          <Text style={styles.logPairTag}>{L.superset}</Text>
                          {blocks}
                        </View>
                      </View>
                    ) : (
                      blocks
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

      <View style={{ height: 14 }} />
    </Screen>
  );
}

const sheet = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { paddingVertical: 4, paddingHorizontal: 0 },
  backLabel: { fontSize: 13 },
  tight: { letterSpacing: tracking(t.h2, -0.02), marginTop: 2 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
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

  /* — the day — */
  dayCard: {
    marginTop: 14,
    paddingVertical: 11,
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
  dayTitle: { fontFamily: font.regular, fontSize: 15, color: color.neutral500, marginTop: 4 },
  dayBody: { fontFamily: font.regular, fontSize: 12, color: color.neutral500, marginTop: 2 },

  /** One planned workout. The rule pill is the only new thing on this screen,
      and it is what lets the calendar stand alone: you can see a plan
      repeating without a second list stating it. */
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: t.rule,
  },
  planRowFirst: { borderTopWidth: 0, marginTop: 3 },
  planText: { flex: 1, minWidth: 0 },
  planName: { fontFamily: font.regular, fontSize: 14.5, color: color.text },
  planSub: { fontFamily: font.regular, fontSize: 11, color: color.neutral600, marginTop: 1 },
  rulePill: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.accent300,
    borderWidth: 1,
    borderColor: color.accent800,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  planDone: { fontFamily: font.regular, fontSize: 11, color: color.accent400 },
  rowStart: { paddingVertical: 6, paddingHorizontal: 13 },
  rowStartLabel: { fontSize: 12.5 },
  rowGhost: { paddingVertical: 4, paddingHorizontal: 4 },
  rowGhostLabel: { fontSize: 12.5 },

  offRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 7,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.divider,
    borderRadius: t.rowRadius,
  },
  offName: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.neutral600 },
  offRule: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.neutral600,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },

  dayFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  backToWorkout: { paddingVertical: 6, paddingHorizontal: 12 },
  addPlan: { paddingVertical: 3, paddingHorizontal: 0 },
  addPlanLabel: { fontSize: 12.5 },

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
  /** A set carrying a verdict: the figure, then the glyph, still in the wrap. */
  logMarked: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /** With words it leaves the wrap and takes the whole line. */
  logNoted: { flexBasis: '100%' },
  logNote: { flex: 1, minWidth: 0, fontFamily: font.regular, fontSize: 11, color: color.neutral500 },
  /** A set and its drop, joined by `↳` — one item in the wrap, one effort. */
  logChain: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  /* A logged superset keeps the bracket the session drew it with. One step
     down in weight from the live one, for the same reason the mark's glyph
     dims here: there it is yours to change, here it is history. */
  logPair: { flexDirection: 'row', gap: 9 },
  logPairRule: { width: 1, borderRadius: 1, backgroundColor: color.accent800, marginTop: 14 },
  logPairBody: { flex: 1 },
  logPairTag: {
    fontFamily: font.regular,
    fontSize: 10,
    letterSpacing: tracking(10, 0.06),
    textTransform: 'uppercase',
    color: color.accent400,
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: t.rule,
  },

  saveLinkBtn: { alignSelf: 'flex-start', marginTop: 11, paddingVertical: 2, paddingHorizontal: 0 },
  saveLink: { fontSize: 12 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  saveInput: { flex: 1, width: undefined },
  saveBtn: { paddingVertical: 7 },
  saveLabel: { fontSize: 12.5 },
  logSaved: { fontFamily: font.regular, fontSize: 11.5, color: color.accent400, marginTop: 11 },

  sectionHead: { marginTop: 20, marginBottom: 6, color: color.neutral500 },
}));
