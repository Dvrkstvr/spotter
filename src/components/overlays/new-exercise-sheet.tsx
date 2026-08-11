/** New exercise — name, muscle group, equipment. Saved into the user's own list. */
import { Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { MEASURES } from '@/data/exercises';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useThemed } from '@/design/theme';
import { color, font } from '@/design/tokens';
import { Btn, Chip, Field, H4, H6, Input } from '@/design/ui';
import { measureLabel, resolveNames, useStore } from '@/store/workout-store';

export function NewExerciseSheet() {
  const styles = useThemed(sheet);
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
            // `load` is the default everywhere else, so it stays absent
            // rather than being written out — that keeps a custom lift byte
            // -identical to how one was made before measures existed.
            ...(c.measure === 'load' ? {} : { measure: c.measure }),
            last: 0,
            lastSets: ['— × —'],
          },
        ],
      };
    });

  return (
    // This is the one sheet holding an uncommitted draft — every other editor
    // commits per keystroke — so a scrim brush with a name typed keeps the
    // sheet open instead of eating the draft. Cancel and back still discard:
    // explicit exits, not accidents.
    <Sheet
      zIndex={88}
      maxHeight="80%"
      scrimOpacity={62}
      onClose={() => {
        if (!draft.name.trim()) close();
      }}
    >
      <H4>{L.newExercise}</H4>

      <Field label={L.name} style={styles.field}>
        <Input
          placeholder={L.exampleEx}
          value={draft.name}
          onChangeText={(v) => patch((st) => ({ creating: { ...st.creating!, name: v } }))}
        />
      </Field>

      {/* Wrapping chips, not a Seg: twenty groups in a single non-wrapping
          row run off the screen, and a group past the clip can't be picked
          at all. Same treatment as equipment below. */}
      <H6 style={styles.head}>{L.muscleGroup}</H6>
      <View style={styles.chips}>
        {s.groups
          .map((g) => ({ ...g, r: resolveNames(g.labels, s.lang) }))
          .filter((g) => g.r.text.trim())
          .map((g) => (
            <Chip
              key={g.key}
              label={g.r.text}
              on={draft.group === g.key}
              missing={g.r.missing}
              onPress={() => patch((st) => ({ creating: { ...st.creating!, group: g.key } }))}
            />
          ))}
      </View>

      <H6 style={styles.head}>{L.equipment}</H6>
      <View style={styles.chips}>
        {s.kinds
          .map((k) => ({ ...k, r: resolveNames(k.labels, s.lang) }))
          .filter((k) => k.r.text.trim())
          .map((k) => (
            <Chip
              key={k.key}
              label={k.r.text}
              on={draft.kind === k.key}
              missing={k.r.missing}
              onPress={() => patch((st) => ({ creating: { ...st.creating!, kind: k.key } }))}
            />
          ))}
      </View>

      {/* Chosen once, here. A logged set is stored as one string shape for
          every measure, so switching an exercise's measure later would not
          break the history — it would silently re-read it as different
          units, which is worse. */}
      <H6 style={styles.head}>{L.measure}</H6>
      <View style={styles.chips}>
        {MEASURES.map((m) => (
          <Chip
            key={m}
            label={measureLabel(m, L)}
            on={draft.measure === m}
            onPress={() => patch((st) => ({ creating: { ...st.creating!, measure: m } }))}
          />
        ))}
      </View>
      <Text style={styles.hint}>{L.measureHint}</Text>

      <View style={styles.actions}>
        <Btn variant="secondary" label={L.cancel} style={styles.action} onPress={close} />
        {/* Disabled rather than a silent no-op: Save with nothing to save
            used to close the sheet exactly like Cancel, which reads as
            "created" to whoever tapped it. */}
        <Btn
          variant="primary"
          label={L.save}
          style={styles.action}
          disabled={!draft.name.trim()}
          onPress={save}
        />
      </View>
    </Sheet>
  );
}

const sheet = themed(() => ({
  field: { marginTop: 14 },
  head: { marginTop: 16, marginBottom: 7, color: color.neutral500 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.45,
    color: color.neutral600,
    marginTop: 8,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  action: { flex: 1, height: 42 },
}));
