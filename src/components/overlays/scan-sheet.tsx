/** Nearby devices — the Bluetooth buddy pairing sheet. */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { color, font, wash } from '@/design/tokens';
import { Btn, H4 } from '@/design/ui';
import { useStore } from '@/store/workout-store';

/** Placeholder discovery results — the design ships these, there is no radio yet. */
const NEARBY = [
  { name: 'Jonas', device: 'Pixel 8 · 2 m' },
  { name: 'Mira', device: 'Galaxy S24 · 5 m' },
  { name: 'Tom', device: 'Pixel 7a · 9 m' },
];

export function ScanSheet() {
  const { L, patch } = useStore();
  const close = () => patch({ scanning: false });
  useBackClose(close);

  return (
    <Sheet zIndex={87} maxHeight="70%" onClose={close}>
      <H4>{L.nearby}</H4>

      <View style={styles.searchingRow}>
        <SearchingDot />
        <Text style={styles.searching}>{L.searching}</Text>
      </View>

      <View style={styles.list}>
        {NEARBY.map((n) => (
          <Pressable
            key={n.name}
            onPress={() => patch({ buddy: n.name, scanning: false })}
            style={styles.row}
          >
            <View style={styles.avatar}>
              <Text style={styles.initial}>{n.name[0]}</Text>
            </View>
            <View style={styles.text}>
              <Text style={styles.name}>{n.name}</Text>
              <Text style={styles.device}>{n.device}</Text>
            </View>
            <Text style={styles.invite}>{L.inviteShort}</Text>
          </Pressable>
        ))}
      </View>

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

/**
 * The scanning indicator. The design loops its `riseIn` keyframe here, which
 * also shifts 8px — on a 7px dot that reads as a glitch, so only the opacity
 * half of it is kept.
 */
function SearchingDot() {
  const [p] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [p]);

  return <Animated.View style={[styles.dot, { opacity: p }]} />;
}

const styles = StyleSheet.create({
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent },
  searching: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },

  list: { marginTop: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: wash.text(8),
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: font.regular, fontSize: 12, color: color.neutral400 },
  text: { flex: 1 },
  name: { fontFamily: font.regular, fontSize: 14, color: color.text },
  device: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  invite: { fontFamily: font.regular, fontSize: 11.5, color: color.accent },
  closeBtn: { marginTop: 16, height: 40 },
});
