/** Routines — the saved workouts, each opening into the routine editor. */
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { DOW } from '@/data/exercises';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, t, tracking } from '@/design/tokens';
import { Btn, H2, missingName } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export default function RoutinesScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, rInfo, exInfo } = useStore();

  /** Which weekdays this routine is scheduled on. */
  const dayFor = (rid: string) =>
    DOW.filter((_, i) => s.schedule[i] === rid).join(' · ') || L.unscheduled;

  const newRoutine = () =>
    patch((st) => {
      const id = `r${Date.now()}`;
      // Named in the active language; the other stays empty until translated.
      return {
        routines: [...st.routines, { id, names: { [st.lang]: L.newRoutine }, items: [] }],
        routineOpen: id,
      };
    });

  return (
    <Screen>
      <View style={styles.head}>
        <H2 size={t.h2} style={styles.tight}>
          {L.routines}
        </H2>
        <Btn variant="ghost" label={L.new} onPress={newRoutine} labelStyle={styles.newLabel} />
      </View>

      <View style={styles.list}>
        {s.routines.map((r) => {
          const name = rInfo(r);
          return (
            <Pressable
              key={r.id}
              onPress={() => patch({ routineOpen: r.id })}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.cardName, name.missing && missingName(c)]}>{name.text}</Text>
                <View style={styles.spacer} />
                <Text style={styles.cardDays}>{dayFor(r.id)}</Text>
              </View>
              <Text style={styles.cardSummary}>
                {r.items
                  .map((i) => {
                    const e = ex(i.ex);
                    return e ? exInfo(e).text : null;
                  })
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const sheet = themed(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  newLabel: { fontSize: 13 },

  list: { gap: t.gap, marginTop: 14, paddingBottom: 10 },
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
}));
