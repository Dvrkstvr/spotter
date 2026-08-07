/** Post-workout summary — sets, volume, time, and where it was filed. */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RiseIn } from '@/components/motion';
import { useBackClose } from '@/hooks/use-back-close';
import { color, elevation, font, radius, tracking, wash } from '@/design/tokens';
import { Btn, CardKicker, H3, Input } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function SummaryModal() {
  const { s, L, patch, saveAsRoutine } = useStore();
  const router = useRouter();
  const [routineName, setRoutineName] = useState('');

  const close = () => {
    patch({ summary: null });
    router.navigate('/');
  };
  useBackClose(close);

  const summary = s.summary;
  if (!summary) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <RiseIn style={styles.card}>
        <CardKicker>{L.saved}</CardKicker>
        <H3 size={23} style={styles.title}>
          {summary.name}
        </H3>

        <View style={styles.stats}>
          {summary.stats.map((stat) => (
            <View key={stat.k} style={styles.stat}>
              <Text style={styles.statKey}>{stat.k}</Text>
              <Text style={styles.statValue}>{stat.v}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>{summary.note}</Text>

        {/* Freeform sessions can be kept as a routine — not in the original
            design, which threw the exercise list away here. */}
        {summary.saveable && (
          <View style={styles.saveRow}>
            <Input
              style={styles.saveInput}
              placeholder={L.newRoutine}
              value={routineName}
              onChangeText={setRoutineName}
            />
            <Btn
              variant="secondary"
              label={L.saveAsRoutine}
              labelStyle={styles.saveLabel}
              onPress={() => saveAsRoutine(routineName)}
            />
          </View>
        )}

        {/* The design labels this button "Done" literally, not from the dictionary. */}
        <Btn variant="primary" block label="Done" style={styles.doneBtn} onPress={close} />
      </RiseIn>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    zIndex: 90,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: wash.scrim(70),
  },
  card: {
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingVertical: 20,
    paddingHorizontal: 18,
    ...elevation.lg,
  },
  title: { marginTop: 5 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 15 },
  stat: { flex: 1, padding: 11, borderRadius: radius.md, backgroundColor: color.bg },
  statKey: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.08),
    textTransform: 'uppercase',
    color: color.neutral600,
  },
  statValue: {
    fontFamily: font.regular,
    fontSize: 18,
    color: color.text,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  note: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral400, marginTop: 14 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  saveInput: { flex: 1, width: undefined },
  saveLabel: { fontSize: 12.5 },
  doneBtn: { marginTop: 16, height: 42 },
});
