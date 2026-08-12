/**
 * Routines — yours to search, order and filter, with the full seed collection
 * shelved underneath.
 *
 * The collection renders `DEFAULT_ROUTINES` straight from code, grouped the
 * way onboarding already thinks: the recommended group is the tour's pick
 * list verbatim (`routineInStyle` + `routineStyleScore`), so the two rooms
 * can never disagree about what "recommended" means; the other groups are
 * whatever recommendation didn't claim, filed by family. Its + installs
 * exactly what a tour pick installs (`addSeedRoutine`), and a seed already
 * on your list says so instead.
 *
 * Search reads more than titles: names, the exercises inside, and their
 * muscle groups, across every language a thing is named in — "back" and
 * "Rücken" find the same rows, and a routine found through an exercise says
 * which one, because a result that can't explain itself reads as a bug.
 *
 * The lens (query · sort · filter) lives in the store beside `query`/`filter`
 * and outside `PERSIST`: a fresh launch opens on Week · All, empty search.
 */
import { ReactNode, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { CHECK_D, Icon } from '@/components/icon';
import { RiseIn } from '@/components/motion';
import { Screen } from '@/components/screen';
import { radio } from '@/data/buddy-radio';
import {
  DEFAULT_ROUTINES,
  Routine,
  routineFamily,
  routineInStyle,
  routineStyleScore,
  StyleKey,
} from '@/data/exercises';
import { countN, repeatLabel, Strings } from '@/data/i18n';
import { nextDays, rulesFor } from '@/data/plan';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, motion, radius, slop, t, tracking, wash } from '@/design/tokens';
import { Btn, Chip, H2, H6, Input, missingName, Seg } from '@/design/ui';
import {
  resolveNames,
  RoutineFilter,
  RoutineSort,
  useStore,
} from '@/store/workout-store';

const SEED_IDS = new Set(DEFAULT_ROUTINES.map((r) => r.id));

/** A family's chip / group heading. Takes `L` so nothing here gets hoisted. */
const famName = (f: Exclude<StyleKey, 'mixed'>, L: Strings) =>
  ({ strength: L.famStrength, calisthenics: L.famCal, cardio: L.famCardio })[f];

/** The onboarding style names, reused so the recommended heading matches the tour. */
const styleTitle = (k: StyleKey, L: Strings) =>
  ({
    strength: L.obStyleStrength,
    calisthenics: L.obStyleCal,
    cardio: L.obStyleCardio,
    mixed: L.obStyleMixed,
  })[k];

/** Unscheduled routines sort after every real distance `nextDays` can return. */
const NO_DAY = 9999;

export default function RoutinesScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, rInfo, exInfo, gInfo, start, startCoDraft, addSeedRoutine, clock } =
    useStore();

  /**
   * A workout is running, so nothing on this tab can start one — the guard in
   * `start` resurfaces the session instead. The rows that offer a start step
   * aside rather than being relabelled: ten cards all reading "Back to
   * workout" is furniture, and one row at the top says it once.
   *
   * Reading and editing stay open. The collection's + installs a routine, it
   * does not start it, and that is still a useful thing to do while resting.
   */
  const live = s.session;

  const q = s.routineQuery.trim().toLowerCase();
  const hasAny = s.routines.length > 0;

  // What a group answers to in search: the library's rule, verbatim — its
  // name in every language it has one in, with the raw key as a fallback.
  const groupText = new Map(
    s.groups.map((g) => [
      g.key,
      [g.key, ...Object.values(g.labels)].filter(Boolean).join(' ').toLowerCase(),
    ])
  );

  /**
   * Whether a routine answers the query, and where — its own name (rank 0),
   * an exercise's name (1), or an exercise's muscle group (2). The rank is
   * the search's whole ordering: where the match is, without inventing a
   * score. `why` is what a found row shows instead of its counts; a row
   * matched on its own name keeps them.
   *
   * The group is named only when the group is what matched. "Back Squat"
   * answers "back" by its own name, and crediting its muscle group there
   * would read as though Quads had matched — the line has to say the true
   * reason or it is worse than no line.
   */
  const matchRoutine = (
    r: Routine
  ): { rank: number; why: { names: string[]; group: string | null } | null } | null => {
    if (!q) return { rank: 0, why: null };
    if (Object.values(r.names).some((n) => n?.toLowerCase().includes(q)))
      return { rank: 0, why: null };
    const byName: string[] = [];
    const byGroup: string[] = [];
    let group: string | null = null;
    for (const it of r.items) {
      const e = ex(it.ex);
      if (!e) continue;
      if (
        e.name.toLowerCase().includes(q) ||
        Object.values(e.names ?? {}).some((n) => n?.toLowerCase().includes(q))
      ) {
        byName.push(exInfo(e).text);
      } else if ((groupText.get(e.group) ?? e.group.toLowerCase()).includes(q)) {
        byGroup.push(exInfo(e).text);
        group ??= gInfo(e.group).text;
      }
    }
    if (byName.length) return { rank: 1, why: { names: byName.slice(0, 2), group: null } };
    if (byGroup.length) return { rank: 2, why: { names: byGroup.slice(0, 2), group } };
    return null;
  };

  const passesFilter = (r: Routine) =>
    s.routineFilter === 'all' ||
    (s.routineFilter === 'yours'
      ? !SEED_IDS.has(r.id)
      : routineFamily(r, ex) === s.routineFilter);

  /**
   * Days to each routine's next planned day, today counting as 0.
   *
   * One forward walk over the rules, computed once — it feeds the Week sort
   * *and* the today marker below, and the old weekday scan could not order two
   * routines that shared a weekday at all.
   */
  const upcoming = nextDays(s.plan);

  /** The last date this routine was logged, or '' — read from `history` by rid. */
  const lastTrained = (rid: string) => {
    let last = '';
    for (const h of s.history) if (h.rid === rid && h.date > last) last = h.date;
    return last;
  };

  type Row = { r: Routine; m: NonNullable<ReturnType<typeof matchRoutine>> };

  const mine: Row[] = s.routines.flatMap((r) => {
    if (!passesFilter(r)) return [];
    const m = matchRoutine(r);
    return m ? [{ r, m }] : [];
  });

  // Stable sort throughout, so ties keep the list's own order. While a query
  // is live the seg steps aside and relevance orders instead.
  const ordered = [...mine].sort((a, b) => {
    if (q.length) return a.m.rank - b.m.rank;
    switch (s.routineSort) {
      case 'week':
        return (upcoming[a.r.id] ?? NO_DAY) - (upcoming[b.r.id] ?? NO_DAY);
      case 'recent':
        // '' sorts below every real date, so never-trained sinks.
        return lastTrained(b.r.id).localeCompare(lastTrained(a.r.id));
      case 'az':
        return rInfo(a.r).text.localeCompare(rInfo(b.r).text);
    }
  });

  /**
   * The shelf. A family chip shows that family whole, in catalogue order —
   * the question changed from "what suits how I train?" to "what cardio is
   * there?" — and the recommended group steps aside; `yours` hides the shelf
   * entirely, every row down here being by definition not yours. Groups a
   * search empties drop out whole, the way the library hides empty groups.
   */
  const collection = (() => {
    type Grp = { key: string; title: string; accent: boolean; rows: Row[] };
    if (s.routineFilter === 'yours') return [] as Grp[];
    const rowsOf = (list: Routine[]): Row[] =>
      list.flatMap((r) => {
        const m = matchRoutine(r);
        return m ? [{ r, m }] : [];
      });
    if (s.routineFilter !== 'all') {
      const fam = s.routineFilter;
      const rows = rowsOf(DEFAULT_ROUTINES.filter((r) => routineFamily(r, ex) === fam));
      return rows.length ? [{ key: fam, title: famName(fam, L), accent: false, rows }] : [];
    }
    // Under `mixed` there is no recommended group at all — "don't sort it" is
    // the option's whole promise — so the three families stand alone.
    const rec =
      s.style === 'mixed'
        ? []
        : DEFAULT_ROUTINES.filter((r) => routineInStyle(r, s.style, ex)).sort(
            (a, b) => routineStyleScore(b, s.style, ex) - routineStyleScore(a, s.style, ex)
          );
    const recIds = new Set(rec.map((r) => r.id));
    const groups: Grp[] = [];
    const recRows = rowsOf(rec);
    if (recRows.length)
      groups.push({
        key: 'rec',
        title: L.recommendedFor.replace('{style}', styleTitle(s.style, L)),
        accent: true,
        rows: recRows,
      });
    for (const fam of ['strength', 'calisthenics', 'cardio'] as const) {
      const rows = rowsOf(
        DEFAULT_ROUTINES.filter((r) => !recIds.has(r.id) && routineFamily(r, ex) === fam)
      );
      if (rows.length) groups.push({ key: fam, title: famName(fam, L), accent: false, rows });
    }
    return groups;
  })();

  /**
   * How this routine repeats — the rule in words, not a list of weekdays.
   *
   * The same `repeatLabel` the Plan row pills and the sheet's sentence print,
   * so three surfaces cannot describe one rule three ways. A routine carrying
   * more than one rule shows the first and counts the rest: the line is one
   * narrow row, and the editor is where the full picture belongs.
   */
  const dayFor = (rid: string) => {
    const rules = rulesFor(s.plan, rid);
    if (!rules.length) return L.unscheduled;
    const first = repeatLabel(rules[0].repeat, L, s.lang);
    return rules.length > 1 ? `${first} +${rules.length - 1}` : first;
  };

  const newRoutine = () =>
    patch((st) => {
      const id = `r${Date.now()}`;
      // Named in the active language; the other stays empty until translated.
      return {
        routines: [...st.routines, { id, names: { [st.lang]: L.newRoutine }, items: [] }],
        routineOpen: id,
      };
    });

  // Building a routine together needs a live link, not just a pairing.
  const canCoBuild = radio !== null && s.buddy !== null && s.buddyEndpoint !== null;

  const sorts: { key: RoutineSort; label: string }[] = [
    { key: 'week', label: L.sortWeek },
    { key: 'recent', label: L.sortRecent },
    { key: 'az', label: L.sortAZ },
  ];
  const chips: { key: RoutineFilter; label: string }[] = [
    { key: 'all', label: L.all },
    { key: 'strength', label: L.famStrength },
    { key: 'calisthenics', label: L.famCal },
    { key: 'cardio', label: L.famCardio },
    { key: 'yours', label: L.famYours },
  ];

  const searching = q.length > 0;
  const narrowed =
    hasAny && ordered.length < s.routines.length && (searching || s.routineFilter !== 'all');

  /**
   * One shelf row. Installed, the whole row opens its card above; not
   * installed, only the + is live — a stray tap must not put a routine on
   * your list, so the row itself is inert rather than a second add target.
   * Two shapes rather than a Pressable inside a Pressable.
   */
  const collRow = ({ r, m }: Row) => {
    const name = resolveNames(r.names, s.lang);
    const installed = s.routines.some((x) => x.id === r.id);
    const sets = r.items.reduce((a, i) => a + i.sets, 0);
    const body = (
      <>
        <View style={styles.collText}>
          <Text style={[styles.collName, name.missing && missingName(c)]}>{name.text}</Text>
          {/* A found row says why it was found — a result that can't account
              for itself reads as a bug. Matched on its own name, it keeps
              its counts. */}
          <Text style={[styles.collMeta, m.why && { color: c.accent300 }]} numberOfLines={1}>
            {m.why
              ? m.why.names.join(' · ') + (m.why.group ? ` — ${m.why.group}` : '')
              : `${countN(r.items.length, L.exCountOne, L.exCount)} · ${countN(
                  sets,
                  L.setCountOne,
                  L.setCount
                )}`}
          </Text>
        </View>
      </>
    );
    return installed ? (
      <Pressable key={r.id} onPress={() => patch({ routineOpen: r.id })} style={styles.collRow}>
        {body}
        <View style={styles.have}>
          <View style={styles.haveTick}>
            <Icon d={CHECK_D} size={10} strokeWidth={2.4} color={c.accent} />
          </View>
          <Text style={styles.haveText}>{L.onYourList}</Text>
        </View>
      </Pressable>
    ) : (
      <View key={r.id} style={styles.collRow}>
        {body}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name.text}
          hitSlop={slop}
          onPress={() => addSeedRoutine(r.id)}
          style={styles.plusBtn}
        >
          <Text style={styles.plusGlyph}>+</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.head}>
        <H2 size={t.h2} style={styles.tight}>
          {L.routines}
        </H2>
        <Btn variant="ghost" label={L.new} onPress={newRoutine} labelStyle={styles.newLabel} />
      </View>

      {/* Where the workout went. It sits above the lens because it outranks
          it: while this row is here it is the only thing on the tab that
          starts anything, and the Start buttons below have stood down. */}
      {live && (
        <Pressable
          onPress={() => patch({ sessionMin: false })}
          style={[styles.coRow, styles.liveRow]}
        >
          <View style={styles.coDot} />
          <View style={styles.coText}>
            <Text style={styles.coName} numberOfLines={1}>
              {live.name}
            </Text>
            <Text style={styles.coDetail}>
              {L.workoutRunning} · {clock}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      {/* With nothing of yours the controls would order and narrow an empty
          list — furniture. The collection is the screen instead. */}
      {hasAny && (
        <>
          <Input
            style={styles.search}
            placeholder={L.searchRoutines}
            value={s.routineQuery}
            onChangeText={(v) => patch({ routineQuery: v })}
          />
          {/* While a query is live the seg steps aside — results order by
              where the match is, which is relevance without a score. */}
          {!searching && (
            <Seg
              style={styles.sortSeg}
              options={sorts.map((o) => ({
                key: o.key,
                label: o.label,
                on: s.routineSort === o.key,
                pick: () => patch({ routineSort: o.key }),
              }))}
            />
          )}
          <View style={styles.filters}>
            {chips.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                on={f.key === s.routineFilter}
                onPress={() => patch({ routineFilter: f.key })}
              />
            ))}
          </View>
        </>
      )}

      <View style={styles.list}>
        {ordered.map(({ r }) => {
          const name = rInfo(r);
          const today = upcoming[r.id] === 0;
          return (
            <Pressable
              key={r.id}
              onPress={() => patch({ routineOpen: r.id })}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.cardName, name.missing && missingName(c)]}>{name.text}</Text>
                <View style={styles.spacer} />
                <Text style={[styles.cardDays, today && { color: c.accent300 }]}>
                  {dayFor(r.id)}
                </Text>
              </View>
              <Text style={styles.cardSummary} numberOfLines={1}>
                {r.items
                  .map((i) => {
                    const e = ex(i.ex);
                    return e ? exInfo(e).text : null;
                  })
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {/* Starting used to require the detour through the editor —
                  the card is where you decide, so the card can start it. */}
              {!live && (
                <View style={styles.cardActions}>
                  <Btn
                    variant="ghost"
                    label={`${L.startBare} ›`}
                    labelStyle={styles.startLabel}
                    onPress={() => start(r.id)}
                  />
                </View>
              )}
            </Pressable>
          );
        })}
        {!hasAny && <Text style={styles.empty}>{L.noRoutines}</Text>}
      </View>

      {/* The narrowed count — a short list must read as narrowed, not as loss. */}
      {narrowed && (
        <Text style={styles.narrowed}>
          {(searching ? L.hiddenBySearch : L.hiddenByFilter)
            .replace('{n}', String(ordered.length))
            .replace('{m}', String(s.routines.length))}
        </Text>
      )}
      {searching && ordered.length === 0 && collection.length === 0 && (
        <Text style={styles.empty}>{L.noResults}</Text>
      )}

      {/* The escape hatch and the shared build, moved in from Today's chooser.
          They sit out any lens: neither is a routine with a name to match.
          Both start a workout, so both stand down while one is running. */}
      {!live && hasAny && s.routineFilter === 'all' && !searching && (
        <>
          <Pressable onPress={() => start(null)} style={styles.freeRow}>
            <Text style={styles.freeName}>{L.freeSession}</Text>
            <Text style={styles.freeMeta}>{L.addAsYouGo}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          {canCoBuild && (
            <Pressable onPress={startCoDraft} style={styles.coRow}>
              <View style={styles.coDot} />
              <View style={styles.coText}>
                <Text style={styles.coName}>{L.buildTogether}</Text>
                <Text style={styles.coDetail} numberOfLines={1}>
                  {L.buildTogetherSub.replace('{name}', s.buddy ?? '')}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        </>
      )}

      {collection.length > 0 && (
        <>
          <H6 style={styles.collHead}>{L.fullCollection}</H6>
          <Text style={styles.collSub}>{L.collectionSub}</Text>
          {/* The first group is the one worth arriving open — the recommended
              one where there is one, else the leading family. A shelf that
              unfolds whole is a screen and a half of rows. */}
          {collection.map((g, i) => (
            <CollGroup
              key={g.key}
              title={g.title}
              count={g.rows.length}
              accent={g.accent}
              defaultOpen={i === 0}
              forceOpen={searching || s.routineFilter !== 'all'}
            >
              {g.rows.map(collRow)}
            </CollGroup>
          ))}
        </>
      )}

      <View style={{ height: 10 }} />
    </Screen>
  );
}

/**
 * One collection group — the settings lists' fold, with a count in the head.
 * Open is local state, deliberately not persisted (which shelves you had open
 * is not a preference); a live search or family filter holds every surviving
 * group open, because results hidden behind a fold read as no results.
 */
function CollGroup({
  title,
  count,
  accent,
  defaultOpen,
  forceOpen,
  children,
}: {
  title: string;
  count: number;
  accent: boolean;
  defaultOpen: boolean;
  forceOpen: boolean;
  children: ReactNode;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const [open, setOpen] = useState(defaultOpen);
  const [spin] = useState(() => new Animated.Value(defaultOpen ? 1 : 0));

  // Fired from the handler rather than an effect, the way <Btn> settles its
  // press scale: one gesture, one animation, no render in between.
  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(spin, {
      toValue: next ? 1 : 0,
      ...motion.move,
      useNativeDriver: true,
    }).start();
  };

  const shown = forceOpen || open;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: shown }}
        disabled={forceOpen}
        onPress={toggle}
        style={styles.grpHead}
      >
        <H6 style={[styles.grpTitle, accent && { color: c.accent200 }]}>{title}</H6>
        <Text style={styles.grpCount}>{count}</Text>
        {/* Held open there is nothing to spin — the caret just states it. */}
        {forceOpen ? (
          <Text style={styles.grpCaret}>▾</Text>
        ) : (
          <Animated.Text
            style={[
              styles.grpCaret,
              {
                transform: [
                  {
                    rotate: spin.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-90deg', '0deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            ▾
          </Animated.Text>
        )}
      </Pressable>
      {/* Unfolding is a riseIn, the way content arrives everywhere here;
          folding is a cut, because there is nothing left to watch. */}
      {shown && <RiseIn>{children}</RiseIn>}
    </View>
  );
}

const sheet = themed(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  newLabel: { fontSize: 13 },

  search: { marginTop: 12 },
  sortSeg: { marginTop: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },

  list: { gap: t.gap, marginTop: 12, paddingBottom: 2 },
  card: {
    paddingVertical: t.cardPadV,
    paddingHorizontal: t.cardPadH,
    borderRadius: t.rowRadius,
    backgroundColor: t.rowBg,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardName: { fontFamily: font.heading, fontSize: 17, color: color.text },
  spacer: { flex: 1 },
  cardDays: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  cardSummary: { fontFamily: font.regular, fontSize: 12, color: color.neutral500, marginTop: 5 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  startLabel: { fontSize: 13 },
  empty: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: color.neutral500,
    marginTop: 4,
  },
  narrowed: { fontFamily: font.regular, fontSize: 12, color: color.neutral500, marginTop: 8 },

  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: t.rowPadH,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.divider,
    borderRadius: radius.md,
  },
  freeName: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  freeMeta: { flex: 1, textAlign: 'right', fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  chevron: { fontFamily: font.regular, fontSize: 15, color: color.accent },

  /** Composed over `coRow`, not a copy of it: the two live things on this tab
      are the same row — accent frame, dot, chevron — and only the gap above
      differs, this one sitting under the head rather than after a list. */
  liveRow: { marginTop: 12 },
  coRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: t.rowPadH,
    borderWidth: 1,
    borderColor: color.accent800,
    borderRadius: radius.md,
    backgroundColor: wash.accent(10),
  },
  coDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent },
  coText: { flex: 1 },
  coName: { fontFamily: font.regular, fontSize: 13.5, color: color.accent400 },
  coDetail: { fontFamily: font.regular, fontSize: 11, color: color.accent600 },

  collHead: { marginTop: 22, color: color.neutral500 },
  collSub: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 12 * 1.5,
    color: color.neutral500,
    marginTop: 5,
  },

  grpHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 14,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  grpTitle: { flex: 1, color: color.neutral500 },
  grpCount: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral600,
    fontVariant: ['tabular-nums'],
  },
  grpCaret: { fontFamily: font.regular, fontSize: 12, color: color.neutral600 },

  collRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  collText: { flex: 1, minWidth: 0 },
  collName: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  collMeta: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral600,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  plusBtn: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md * 0.85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusGlyph: { fontFamily: font.regular, fontSize: 15, lineHeight: 17, color: color.accent },
  have: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  haveTick: {
    width: 15,
    height: 15,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.accent700,
    backgroundColor: wash.accent(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  haveText: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600 },
}));
