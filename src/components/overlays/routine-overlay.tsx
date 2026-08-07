/**
 * Routine editor — rename it, tune sets/reps/weight per exercise, start it.
 *
 * The Edit toggle is faithful to the design, where it only swaps its own label:
 * the rows are always editable and the delete control is always visible.
 */
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { DOW } from '@/data/exercises';
import { color, font, t, tracking } from '@/design/tokens';
import { Btn, Input } from '@/design/ui';
import { fmt, num, useStore } from '@/store/workout-store';

export function RoutineOverlay() {
  const { s, L, patch, ex, routine, gLabel, kLabel, mutRoutine, start } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => patch({ routineOpen: null });
  useBackClose(close);

  const r = routine(s.routineOpen);
  if (!r) return null;

  const days = DOW.filter((_, i) => s.schedule[i] === r.id).join(' · ') || L.unscheduled;
  const summary = `${days} · ${r.items.reduce((a, i) => a + i.sets, 0)} ${L.setsWord}`;

  return (
    <FullScreen zIndex={75}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.backRoutines} labelStyle={styles.headLabel} onPress={close} />
        <View style={styles.spacer} />
        <Btn
          variant="ghost"
          label={s.editing ? L.editDone : L.edit}
          labelStyle={styles.headLabel}
          onPress={() => patch((st) => ({ editing: !st.editing }))}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          value={r.name}
          onChangeText={(v) => mutRoutine(r.id, (copy) => { copy.name = v; })}
          cursorColor={color.accent}
          selectionColor={color.accent}
          style={styles.nameInput}
        />
        <Text style={styles.summary}>{summary}</Text>

        <View style={styles.colHead}>
          <Text style={[styles.colLabel, styles.colName]}>{L.exercise}</Text>
          <Text style={[styles.colLabel, styles.colNarrow]}>{L.sets}</Text>
          <Text style={[styles.colLabel, styles.colNarrow]}>{L.reps}</Text>
          <Text style={[styles.colLabel, styles.colWide]}>kg</Text>
          <View style={styles.colDel} />
        </View>

        <View style={{ gap: t.gap }}>
          {r.items.map((item, n) => {
            const e = ex(item.ex);
            return (
              <View key={`${item.ex}-${n}`} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{e?.name}</Text>
                  <Text style={styles.rowKind}>
                    {e ? `${kLabel(e.kind)} · ${gLabel(e.group)}` : ''}
                  </Text>
                </View>
                <Input
                  style={[styles.numInput, styles.colNarrow]}
                  keyboardType="number-pad"
                  defaultValue={String(item.sets)}
                  onChangeText={(v) =>
                    mutRoutine(r.id, (copy) => {
                      copy.items[n].sets = Math.max(1, Math.round(num(v, item.sets)));
                    })
                  }
                />
                <Input
                  style={[styles.numInput, styles.colNarrow]}
                  keyboardType="number-pad"
                  defaultValue={String(item.reps)}
                  onChangeText={(v) =>
                    mutRoutine(r.id, (copy) => {
                      copy.items[n].reps = Math.max(1, Math.round(num(v, item.reps)));
                    })
                  }
                />
                <Input
                  style={[styles.numInput, styles.colWide]}
                  keyboardType="decimal-pad"
                  defaultValue={fmt(item.w)}
                  onChangeText={(v) =>
                    mutRoutine(r.id, (copy) => {
                      copy.items[n].w = Math.max(0, num(v, item.w));
                    })
                  }
                />
                <Pressable
                  accessibilityLabel="Remove exercise"
                  onPress={() => mutRoutine(r.id, (copy) => { copy.items.splice(n, 1); })}
                  style={styles.colDel}
                >
                  <Text style={styles.delGlyph}>×</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Btn
          variant="secondary"
          block
          label={L.addExerciseBtn}
          style={styles.addBtn}
          onPress={() => patch({ picker: 'routine', query: '' })}
        />
        <Btn
          variant="primary"
          block
          label={L.startRoutine}
          style={styles.startBtn}
          labelStyle={styles.startLabel}
          onPress={() => start(r.id)}
        />
      </ScrollView>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 6 },
  headLabel: { fontSize: 13 },
  spacer: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },

  nameInput: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 5,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    color: color.text,
    fontFamily: font.heading,
    fontSize: 26,
    letterSpacing: tracking(26, -0.02),
  },
  summary: { fontFamily: font.regular, fontSize: 12, color: color.neutral500, marginTop: 6 },

  colHead: { flexDirection: 'row', gap: 10, paddingTop: 14, paddingHorizontal: 2, paddingBottom: 6 },
  colLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.07),
    textTransform: 'uppercase',
    color: color.neutral700,
    textAlign: 'center',
  },
  colName: { flex: 1, textAlign: 'left' },
  colNarrow: { width: 38 },
  colWide: { width: 56 },
  colDel: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  numInput: {
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontVariant: ['tabular-nums'],
  },
  delGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },

  addBtn: { marginTop: 12, height: 40 },
  startBtn: { marginTop: 8, height: 44 },
  startLabel: { fontSize: 15 },
});
