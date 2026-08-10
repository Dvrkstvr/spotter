/** New exercise — name, muscle group, equipment. Saved into the user's own list. */
import { Pressable, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font } from '@/design/tokens';
import { Btn, Field, H4, H6, Input, missingName, Seg } from '@/design/ui';
import { resolveNames, useStore } from '@/store/workout-store';

export function NewExerciseSheet() {
  const styles = useThemed(sheet);
  const c = useColors();
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
            // Canonical fallback plus the alias in the language it was typed in.
            name: c.name.trim(),
            names: { [st.lang]: c.name.trim() },
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
          .map((g) => ({ ...g, r: resolveNames(g.labels, s.lang) }))
          .filter((g) => g.r.text.trim())
          .map((g) => ({
            key: g.key,
            label: g.r.text,
            on: draft.group === g.key,
            pick: () => patch((st) => ({ creating: { ...st.creating!, group: g.key } })),
          }))}
      />

      <H6 style={styles.head}>{L.equipment}</H6>
      <View style={styles.chips}>
        {s.kinds
          .map((k) => ({ ...k, r: resolveNames(k.labels, s.lang) }))
          .filter((k) => k.r.text.trim())
          .map((k) => {
            const on = draft.kind === k.key;
            return (
              <Pressable
                key={k.key}
                onPress={() => patch((st) => ({ creating: { ...st.creating!, kind: k.key } }))}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? c.wash.accent(16) : 'transparent',
                    borderColor: on ? c.accent : c.divider,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: on ? c.accent200 : c.neutral400 },
                    k.r.missing && missingName(c),
                  ]}
                >
                  {k.r.text}
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

const sheet = themed(() => ({
  field: { marginTop: 14 },
  head: { marginTop: 16, marginBottom: 7, color: color.neutral500 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 6, borderWidth: 1 },
  chipLabel: { fontFamily: font.regular, fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  action: { flex: 1, height: 42 },
}));
