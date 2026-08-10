/**
 * Exercises — the searchable library, grouped by muscle group.
 *
 * A group or equipment entry with a blank label is a divider rather than a
 * heading, which is why the settings rows advertise "leave empty for a divider".
 */
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Exercise } from '@/data/exercises';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, t, tracking } from '@/design/tokens';
import { Btn, H2, H6, Hr, Input, missingName } from '@/design/ui';
import { fmt, resolveNames, useStore } from '@/store/workout-store';

export default function LibraryScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, allEx, kInfo, exInfo } = useStore();

  const q = s.query.trim().toLowerCase();
  const filters = [
    { key: 'All', label: L.all, missing: false },
    ...s.kinds.map((k) => {
      const r = resolveNames(k.labels, s.lang);
      return { key: k.key, label: r.text, missing: r.missing };
    }),
  ];

  // Search matches the canonical name and every language's alias.
  const match = (e: Exercise) =>
    (!q ||
      e.name.toLowerCase().includes(q) ||
      Object.values(e.names ?? {}).some((n) => n?.toLowerCase().includes(q)) ||
      e.group.toLowerCase().includes(q)) &&
    (s.filter === 'All' || e.kind === s.filter);

  const groups = s.groups
    .map((g) => {
      const r = resolveNames(g.labels, s.lang);
      return {
        name: r.text,
        missing: r.missing,
        isDivider: !r.text.trim(),
        items: allEx().filter((e) => e.group === g.key && match(e)),
      };
    })
    .filter((g) => g.items.length || g.isDivider);

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
              creating: { name: '', group: st.groups[0]?.key ?? '', kind: st.kinds[0]?.key ?? '' },
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
            <Pressable
              key={f.key}
              onPress={() => patch({ filter: f.key })}
              style={[
                styles.chip,
                {
                  backgroundColor: f.key === s.filter ? c.wash.accent(16) : 'transparent',
                  borderColor: f.key === s.filter ? c.accent : c.divider,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: f.key === s.filter ? c.accent200 : c.neutral400 },
                  f.missing && missingName(c),
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ) : (
            <View key={`${f.key}${i}`} style={styles.chipDivider} />
          )
        )}
      </View>

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
                  <Text style={styles.rowLast}>
                    {e.last ? `${fmt(e.last)} kg` : e.kind === 'Bodyweight' ? L.bodyweight : '—'}
                  </Text>
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
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1 },
  chipLabel: { fontFamily: font.regular, fontSize: 11 },
  chipDivider: { width: 1, height: 18, backgroundColor: color.divider, marginHorizontal: 3 },

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
