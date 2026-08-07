/**
 * Settings — language, and the two lists that drive the rest of the app.
 *
 * Muscle groups and equipment are user-owned: renaming one relabels it
 * everywhere, and leaving a label blank turns that entry into a divider in the
 * exercise library and its filter row.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReorderRows } from '@/components/reorder-rows';
import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { color, t, tracking } from '@/design/tokens';
import { Btn, H2, H6, Seg } from '@/design/ui';
import { resolveNames, useStore } from '@/store/workout-store';

export function SettingsOverlay() {
  const { s, L, patch, allEx, reorder } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => patch({ settingsOpen: false });
  useBackClose(close);

  /**
   * Rows edit the active language only. An entry with no name in this
   * language shows the other language's name as its placeholder — greyed, the
   * cue that typing here adds the missing translation rather than renaming.
   */
  const rowsFor = (list: typeof s.groups, field: 'group' | 'kind') =>
    list.map((g) => {
      const r = resolveNames(g.labels, s.lang);
      return {
        key: g.key,
        label: g.labels[s.lang] ?? '',
        placeholder: r.missing ? r.text : L.dividerHint,
        count: allEx().filter((e) => e[field] === g.key).length || ('' as const),
      };
    });

  const groupRows = rowsFor(s.groups, 'group');
  const kindRows = rowsFor(s.kinds, 'kind');

  const setLabel = (listKey: 'groups' | 'kinds', i: number, v: string) =>
    patch((st) => ({
      [listKey]: st[listKey].map((x, j) =>
        j === i ? { ...x, labels: { ...x.labels, [st.lang]: v } } : x
      ),
    }));

  return (
    <FullScreen zIndex={78}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.back} labelStyle={styles.backLabel} onPress={close} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <H2 size={t.h2} style={styles.tight}>
          {L.settings}
        </H2>

        <H6 style={[styles.head, styles.firstHead]}>{L.language}</H6>
        <Seg
          options={(['en', 'de'] as const).map((code) => ({
            key: code,
            label: code === 'en' ? 'English' : 'Deutsch',
            on: s.lang === code,
            pick: () => patch({ lang: code }),
          }))}
        />

        <H6 style={styles.head}>{L.muscleGroups}</H6>
        <ReorderRows
          rows={groupRows}
          placeholder={L.dividerHint}
          onLabel={(i, v) => setLabel('groups', i, v)}
          onDelete={(i) => patch((st) => ({ groups: st.groups.filter((_, j) => j !== i) }))}
          onReorder={(from, to) => reorder('groups', from, to)}
        />
        <Btn
          variant="ghost"
          label={L.addGroup}
          labelStyle={styles.ghostLabel}
          style={styles.addBtn}
          onPress={() =>
            patch((st) => ({ groups: [...st.groups, { key: `g${Date.now()}`, labels: {} }] }))
          }
        />

        <H6 style={styles.head}>{L.equipment}</H6>
        <ReorderRows
          rows={kindRows}
          placeholder={L.dividerHint}
          onLabel={(i, v) => setLabel('kinds', i, v)}
          onDelete={(i) => patch((st) => ({ kinds: st.kinds.filter((_, j) => j !== i) }))}
          onReorder={(from, to) => reorder('kinds', from, to)}
        />
        <Btn
          variant="ghost"
          label={L.addEquipment}
          labelStyle={styles.ghostLabel}
          style={styles.addBtn}
          onPress={() =>
            patch((st) => ({ kinds: [...st.kinds, { key: `k${Date.now()}`, labels: {} }] }))
          }
        />
      </ScrollView>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 6 },
  backLabel: { fontSize: 13 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  head: { marginTop: 22, marginBottom: 8, color: color.neutral500 },
  firstHead: { marginTop: 20 },
  ghostLabel: { fontSize: 12.5 },
  addBtn: { alignSelf: 'flex-start', marginTop: 7 },
});
