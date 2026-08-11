/**
 * Exercises — the searchable library, grouped by muscle group.
 *
 * A group or equipment entry with a blank label is a divider rather than a
 * heading, which is why the settings rows advertise "leave empty for a divider".
 */
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Exercise, inStyle, measureOf, styleFirst } from '@/data/exercises';
import { Strings } from '@/data/i18n';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, t, tracking } from '@/design/tokens';
import { Btn, Chip, H2, H6, Hr, Input, missingName } from '@/design/ui';
import { fmt, prevNums, resolveNames, useStore } from '@/store/workout-store';

/**
 * The right-hand figure in a library row: the number off the set you last
 * finished on — working weight, distance, or minutes by measure — or why
 * there isn't one.
 *
 * Reads the logged ghost (`lastFor`'s sets), not `e.last`: the seed's number
 * is written once and never again, so after the first real session it would
 * quietly disagree with the exercise sheet one tap away. `lastFor` already
 * falls back to the seeded `lastSets` for a lift never logged on this phone.
 *
 * Takes `L` rather than reading the dictionary, so the React Compiler can't
 * hoist it and freeze the label in one language.
 */
const lastLabel = (e: Exercise, L: Strings, sets: string[]) => {
  const { w, r } = prevNums(sets[sets.length - 1] ?? '');
  switch (measureOf(e)) {
    case 'duration':
      return r && r !== '—' ? `${r} ${L.unitMin}` : '—';
    // A run doesn't have a load — it isn't lifting your bodyweight, it's
    // covering ground — so its figure is the distance, or the dash.
    case 'distance':
      return w && w !== '0' ? `${w} ${L.unitKm}` : '—';
    default:
      if (w && w !== '0') return `${w} ${L.unitKg}`;
      // "Bodyweight" describes a load: an explicit BW set last time, or a
      // bodyweight exercise that has never been logged.
      if (w === '0' || e.kind === 'Bodyweight') return L.bodyweight;
      return e.last ? `${fmt(e.last)} ${L.unitKg}` : '—';
  }
};

export default function LibraryScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, allEx, kInfo, exInfo, lastFor } = useStore();

  const q = s.query.trim().toLowerCase();
  const filters = [
    { key: 'All', label: L.all, missing: false },
    ...s.kinds.map((k) => {
      const r = resolveNames(k.labels, s.lang);
      return { key: k.key, label: r.text, missing: r.missing };
    }),
  ];

  // What a group answers to in search: its name in every language it has one
  // in — the names on screen — with the raw key as a fallback. Matching the
  // key alone meant "Brust" found nothing and a renamed group still answered
  // to a name it no longer wears.
  const groupText = new Map(
    s.groups.map((g) => [
      g.key,
      [g.key, ...Object.values(g.labels)].filter(Boolean).join(' ').toLowerCase(),
    ])
  );

  // Search matches the canonical name and every language's alias.
  const match = (e: Exercise) =>
    (!q ||
      e.name.toLowerCase().includes(q) ||
      Object.values(e.names ?? {}).some((n) => n?.toLowerCase().includes(q)) ||
      (groupText.get(e.group) ?? e.group.toLowerCase()).includes(q)) &&
    (s.filter === 'All' || e.kind === s.filter);

  // With a style chosen, sorting works at both depths: groups that hold any
  // of it float over groups that hold none, and within a group its exercises
  // lead. Sorting, never filtering — every group and row is still here.
  const sorted = s.style !== 'mixed';
  const inStyleGroup = (g: { items: Exercise[] }) => g.items.some((e) => inStyle(e, s.style));

  const groups = s.groups
    .map((g) => {
      const r = resolveNames(g.labels, s.lang);
      return {
        name: r.text,
        missing: r.missing,
        isDivider: !r.text.trim(),
        items: styleFirst(
          allEx().filter((e) => e.group === g.key && match(e)),
          s.style
        ),
      };
    })
    // Dividers punctuate the user's own ordering; between zero results they
    // are stray rules floating in blank space, and in a style-sorted list the
    // ordering is no longer the one they were placed in.
    .filter((g) => g.items.length || (g.isDivider && !q && !sorted))
    .sort((a, b) => (sorted ? Number(inStyleGroup(b)) - Number(inStyleGroup(a)) : 0));

  return (
    <Screen>
      <View style={styles.head}>
        <H2 size={t.h2} style={styles.tight}>
          {L.exercises}
        </H2>
        <Btn
          variant="ghost"
          label={L.new}
          labelStyle={styles.newLabel}
          onPress={() =>
            patch((st) => ({
              creating: {
                name: '',
                group: st.groups[0]?.key ?? '',
                kind: st.kinds[0]?.key ?? '',
                measure: 'load',
              },
            }))
          }
        />
      </View>

      <Input
        style={styles.search}
        placeholder={L.search}
        value={s.query}
        onChangeText={(v) => patch({ query: v })}
      />

      <View style={styles.filters}>
        {filters.map((f, i) =>
          f.label.trim() ? (
            <Chip
              key={f.key}
              label={f.label}
              on={f.key === s.filter}
              missing={f.missing}
              onPress={() => patch({ filter: f.key })}
            />
          ) : (
            <View key={`${f.key}${i}`} style={styles.chipDivider} />
          )
        )}
      </View>

      {groups.length === 0 && <Text style={styles.empty}>{L.noResults}</Text>}

      {groups.map((g, gi) => (
        <Fragment key={gi}>
          {g.isDivider ? (
            <Hr style={styles.groupRule} />
          ) : (
            <H6 style={[styles.groupHead, g.missing && missingName(c)]}>{g.name}</H6>
          )}
          <View style={{ gap: t.gap }}>
            {g.items.map((e) => {
              const name = exInfo(e);
              const kind = kInfo(e.kind);
              return (
                <Pressable key={e.id} onPress={() => patch({ exOpen: e.id })} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, name.missing && missingName(c)]}>{name.text}</Text>
                    <Text style={[styles.rowKind, kind.missing && missingName(c)]}>{kind.text}</Text>
                  </View>
                  <Text style={styles.rowLast}>{lastLabel(e, L, lastFor(e.id).sets)}</Text>
                </Pressable>
              );
            })}
          </View>
        </Fragment>
      ))}

      <View style={{ height: 12 }} />
    </Screen>
  );
}

const sheet = themed(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  newLabel: { fontSize: 13 },
  search: { marginTop: 12 },

  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  chipDivider: { width: 1, height: 18, backgroundColor: color.divider, marginHorizontal: 3 },

  empty: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500, marginTop: 18 },
  groupRule: { marginTop: 16, marginBottom: 4 },
  groupHead: { marginTop: 18, marginBottom: 7, color: color.neutral500 },

  row: {
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
  rowText: { flex: 1 },
  rowName: { fontFamily: font.regular, fontSize: 14, color: color.text },
  rowKind: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  rowLast: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.neutral400,
    fontVariant: ['tabular-nums'],
  },
}));
