/** Choose a workout — every routine except today's, plus an empty session. */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { todayDow } from '@/data/date';
import { color, font, wash } from '@/design/tokens';
import { Btn, H4 } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function PickWorkoutSheet() {
  const { s, L, patch, ex, start } = useStore();
  const close = () => patch({ pickWorkout: false });
  useBackClose(close);

  const todayRid = s.schedule[todayDow()];

  const options = [
    ...s.routines
      .filter((r) => r.id !== todayRid)
      .map((r) => ({
        key: r.id,
        name: r.name,
        meta: `${r.items.length} ${L.exCount}`,
        detail: r.items.map((i) => ex(i.ex)?.name).filter(Boolean).join(' · '),
        go: () => start(r.id),
      })),
    {
      key: '__empty',
      name: L.emptySession,
      meta: '',
      detail: L.addAsYouGo,
      go: () => start(null),
    },
  ];

  return (
    <Sheet zIndex={84} maxHeight="78%" onClose={close}>
      <H4>{L.chooseWorkout}</H4>

      <View style={styles.list}>
        {options.map((o) => (
          <Pressable key={o.key} onPress={o.go} style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.name}>{o.name}</Text>
              <Text style={styles.detail} numberOfLines={1}>
                {o.detail}
              </Text>
            </View>
            <Text style={styles.meta}>{o.meta}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: wash.text(8),
  },
  text: { flex: 1 },
  name: { fontFamily: font.regular, fontSize: 14.5, color: color.text },
  detail: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  meta: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },
  chevron: { fontFamily: font.regular, fontSize: 15, color: color.accent },
  closeBtn: { marginTop: 16, height: 40 },
});
