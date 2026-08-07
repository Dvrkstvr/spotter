/**
 * Exercises — the searchable library, grouped by muscle group.
 *
 * A group or equipment entry with a blank label is a divider rather than a
 * heading, which is why the settings rows advertise "leave empty for a divider".
 */
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { color, font, t, tracking, wash } from '@/design/tokens';
import { Btn, H2, H6, Hr, Input } from '@/design/ui';
import { fmt, useStore } from '@/store/workout-store';

export default function LibraryScreen() {
  const { s, L, patch, allEx, kLabel } = useStore();

  const q = s.query.trim().toLowerCase();
  const filters = [{ key: 'All', label: L.all }, ...s.kinds];

  const match = (e: { name: string; group: string; kind: string }) =>
    (!q || e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q)) &&
    (s.filter === 'All' || e.kind === s.filter);

  const groups = s.groups
    .map((g) => ({
      name: g.label,
      isDivider: !g.label.trim(),
      items: allEx().filter((e) => e.group === g.key && match(e)),
    }))
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
                  backgroundColor: f.key === s.filter ? wash.accent(16) : 'transparent',
                  borderColor: f.key === s.filter ? color.accent : color.divider,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: f.key === s.filter ? color.accent200 : color.neutral400 },
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
            <H6 style={styles.groupHead}>{g.name}</H6>
          )}
          <View style={{ gap: t.gap }}>
            {g.items.map((e) => (
              <Pressable key={e.id} onPress={() => patch({ exOpen: e.id })} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{e.name}</Text>
                  <Text style={styles.rowKind}>{kLabel(e.kind)}</Text>
                </View>
                <Text style={styles.rowLast}>
                  {e.last ? `${fmt(e.last)} kg` : e.kind === 'Bodyweight' ? L.bodyweight : '—'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Fragment>
      ))}

      <View style={{ height: 12 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
