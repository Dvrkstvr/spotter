/** New exercise — name, muscle group, equipment. Saved into the user's own list. */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { color, font, wash } from '@/design/tokens';
import { Btn, Field, H4, H6, Input, Seg } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function NewExerciseSheet() {
  const { s, L, patch } = useStore();
  const close = () => patch({ creating: null });
  useBackClose(close);

  const draft = s.creating;
  if (!draft) return null;

  const save = () =>
    patch((st) => {
      const c = st.creating;
      if (!c || !c.name.trim()) return { creating: null };
      return {
        creating: null,
        custom: [
          ...st.custom,
          {
            id: `x${Date.now()}`,
            name: c.name.trim(),
            group: c.group,
            kind: c.kind,
            last: 0,
            lastSets: ['— × —'],
          },
        ],
      };
    });

  return (
    <Sheet zIndex={88} maxHeight="80%" scrimOpacity={62} onClose={close}>
      <H4>{L.newExercise}</H4>

      <Field label={L.name} style={styles.field}>
        <Input
          placeholder={L.exampleEx}
          value={draft.name}
          onChangeText={(v) => patch((st) => ({ creating: { ...st.creating!, name: v } }))}
        />
      </Field>

      <H6 style={styles.head}>{L.muscleGroup}</H6>
      <Seg
        options={s.groups
          .filter((g) => g.label.trim())
          .map((g) => ({
            key: g.key,
            label: g.label,
            on: draft.group === g.key,
            pick: () => patch((st) => ({ creating: { ...st.creating!, group: g.key } })),
          }))}
      />

      <H6 style={styles.head}>{L.equipment}</H6>
      <View style={styles.chips}>
        {s.kinds
          .filter((k) => k.label.trim())
          .map((k) => {
            const on = draft.kind === k.key;
            return (
              <Pressable
                key={k.key}
                onPress={() => patch((st) => ({ creating: { ...st.creating!, kind: k.key } }))}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? wash.accent(16) : 'transparent',
                    borderColor: on ? color.accent : color.divider,
                  },
                ]}
              >
                <Text style={[styles.chipLabel, { color: on ? color.accent200 : color.neutral400 }]}>
                  {k.label}
                </Text>
              </Pressable>
            );
          })}
      </View>

      <View style={styles.actions}>
        <Btn variant="secondary" label={L.cancel} style={styles.action} onPress={close} />
        <Btn variant="primary" label={L.save} style={styles.action} onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 14 },
  head: { marginTop: 16, marginBottom: 7, color: color.neutral500 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 6, borderWidth: 1 },
  chipLabel: { fontFamily: font.regular, fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  action: { flex: 1, height: 42 },
});
