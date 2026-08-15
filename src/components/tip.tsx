/**
 * One in-place tip — the whole of what a tip looks like.
 *
 * Deliberately the quietest thing on any screen it appears on, and
 * deliberately not borrowing an outline that already means something:
 *
 * - **no accent fill**, because that is the live set box; and
 * - **no dashed border**, because in this app dashed means *this one is held*
 *   at three sites (`HoldBtn`, the waiting set row, the coach's routine card),
 *   and a dashed hint would read as a control you are meant to press and hold
 *   — which is exactly the confusion a hint is supposed to end.
 *
 * So: one hairline, no fill, an accent dot, dim text, and a single × at the
 * app's small-control reach. Nothing else in it is interactive. Everything
 * under and around it stays pressable, because the phone is on a bench
 * between sets and a hint does not get to hold it hostage.
 *
 * See `data/tips.ts` for the model and `design/tutorial-mockup.html` for the
 * argument. `card` is the same component drawn for a whole screen's model
 * rather than one control — it sits at the top of a surface instead of under
 * a row, and is capped at two screens.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';

import { themed, useThemed } from '@/design/theme';
import { color, font, motion, radius, slop } from '@/design/tokens';
import type { TipId } from '@/data/tips';
import { useStore } from '@/store/workout-store';

/**
 * How long a tip has to survive on screen before it counts as shown.
 *
 * A tip that flashed past while the list scrolled to the next exercise was
 * never read, and charging it one of its three showings would spend the whole
 * budget on nothing. Two seconds is about the shortest glance that could have
 * taken the sentence in.
 */
const DWELL_MS = 2000;

export function Tip({
  id,
  title,
  sub,
  card,
  style,
}: {
  id: TipId;
  title: string;
  /** The consequence line. Optional — some tips are one sentence. */
  sub?: string;
  /** The whole-screen form: a little more room, at the top of a surface. */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemed(sheet);
  const { s, L, tipShown, tipDone } = useStore();
  const [enter] = useState(() => new Animated.Value(0));

  /**
   * The one rule that belongs to no surface: nothing counts while the welcome
   * tour is up. The tour covers the whole screen, so a tip mounted behind it
   * would sit out its dwell unread and spend a showing on nobody — and the
   * tour is already saying three of these sentences on its own second screen.
   */
  const covered = !s.onboarded || s.onboardingOpen;

  // `tipShown` is rebuilt on every store change, so it cannot be a dependency
  // — the timer would restart on every tick of the session clock and never
  // fire. The latest one is kept in a ref written inside an effect, which is
  // also what the React Compiler asks for.
  const shown = useRef(tipShown);
  useEffect(() => {
    shown.current = tipShown;
  });

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, ...motion.move, useNativeDriver: true }).start();
    if (covered) return;
    const t = setTimeout(() => shown.current(id), DWELL_MS);
    return () => clearTimeout(t);
  }, [id, enter, covered]);

  return (
    <Animated.View
      style={[
        styles.tip,
        card && styles.card,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-5, 0] }) },
          ],
        },
        style,
      ]}
    >
      <View style={styles.dot} />
      <View style={styles.body}>
        <Text style={[styles.title, card && styles.titleCard]}>{title}</Text>
        {!!sub && <Text style={[styles.sub, card && styles.subCard]}>{sub}</Text>}
      </View>
      {/* The only thing in here you can press, and it means "I know this
          already" — which is believed, and lands in the same durable place as
          having done the gesture. Drawn at 20px and reached at `slop`, like
          every other × in the app. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={L.dismissTip}
        hitSlop={slop}
        onPress={() => tipDone(id)}
        style={styles.close}
      >
        <Text style={styles.closeGlyph}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

const sheet = themed(() => ({
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: color.divider,
    // Stated rather than left to default, for the reason `HoldBtn`'s is: this
    // is a bordered view in a screen full of dashed ones, and naming it here
    // keeps it out of Android's path-effect trap if it ever learns to flip.
    borderStyle: 'solid',
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingLeft: 11,
    paddingRight: 10,
    marginVertical: 8,
    backgroundColor: 'transparent',
  },
  card: { paddingVertical: 12, paddingLeft: 13, marginBottom: 12 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.accent,
    marginTop: 6,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.heading, fontSize: 13, color: color.text, lineHeight: 17 },
  titleCard: { fontSize: 14 },
  sub: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, lineHeight: 16 },
  subCard: { fontSize: 12, marginTop: 2 },
  close: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { fontFamily: font.regular, fontSize: 16, color: color.neutral600, lineHeight: 18 },
}));
