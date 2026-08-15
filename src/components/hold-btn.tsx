/**
 * Hold-to-confirm — for irreversible actions, the button itself is the
 * confirmation: an accent wash fills left-to-right on the linear `hold` curve
 * while the press is held, and the action commits only when the fill lands.
 * Releasing early rewinds in 160ms, so an accidental tap costs nothing.
 *
 * `hold={false}` degrades to a plain tap for the cases that need no guarding
 * (Finish with every set already ticked).
 *
 * `dashed` borrows the set row's grammar — a dashed outline is something that
 * isn't yours yet — so the bottom CTA can say "there's still work here" before
 * you touch it, rather than only revealing the guard once you press.
 *
 * `destructive` is the buzz, and nothing else — no colour, no label, no second
 * confirm. Every deletion in the app already leaves through a hold, so this is
 * the one place that knows a hold destroyed something rather than committing
 * something, and firing the haptics from the six call sites instead would be
 * six chances for them to drift apart. The buzz is deliberately exclusive to
 * deletion (Calvin's call): a hold that completes is silent everywhere else,
 * which is what makes a phone that buzzes mean exactly one thing.
 *
 * It is two moments, not one. `buzz.winding` runs *with* the fill — the same
 * report the bar is making, through the finger that is covering the bar — and
 * `buzz.gone` lands as its final beat. Both are the fill's, so both are torn
 * down wherever the fill is: on release, and on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';

import { buzz } from '@/data/haptics';
import { themed, useColors, useThemed } from '@/design/theme';
import { fill, font, linger, motion, Palette, radius, space } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Takes the palette for the same reason ui.tsx's `btnVariant` does. */
const holdVariant = (variant: 'primary' | 'secondary', c: Palette) =>
  ({
    primary: { border: c.accent, label: c.accent, fill: c.wash.accent(20) },
    secondary: { border: c.divider, label: c.text, fill: c.wash.text(12) },
  })[variant];

export function HoldBtn({
  label,
  onConfirm,
  variant = 'secondary',
  hold = true,
  dashed = false,
  destructive = false,
  style,
  labelStyle,
  accessibilityLabel,
  hitSlop,
}: {
  label: string;
  onConfirm: () => void;
  variant?: 'primary' | 'secondary';
  hold?: boolean;
  dashed?: boolean;
  /** This hold deletes something — it commits with `buzz.gone`. */
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  /** For glyph labels ("×") that a screen reader shouldn't read literally. */
  accessibilityLabel?: string;
  hitSlop?: number;
}) {
  const styles = useThemed(sheet);
  const v = holdVariant(variant, useColors());
  // The gate lives here rather than in `buzz`, which is the vocabulary and not
  // the switch. It costs this component the store subscription it did without,
  // which is the price of the six call sites not each carrying one.
  const { s } = useStore();
  const [fillV] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(1));

  /** `buzz.winding`'s cancel while a destructive fill is running. */
  const winding = useRef<(() => void) | null>(null);
  const unwind = () => {
    winding.current?.();
    winding.current = null;
  };

  // A button can lose its screen mid-hold — a row deleted under your thumb by
  // a buddy's edit — and a ramp counting down from a button that no longer
  // exists would arrive as a buzz about nothing.
  useEffect(() => () => winding.current?.(), []);

  const press = (to: number) =>
    Animated.timing(scale, { toValue: to, ...motion.tap, useNativeDriver: true }).start();

  // Shared by both routes out — the fill landing and, under `hold={false}`, a
  // plain tap — so a button can never be destructive down one and silent down
  // the other. The buzz goes first: it should land with the row leaving rather
  // than a frame behind it.
  const commit = () => {
    unwind();
    if (destructive && s.haptics) buzz.gone();
    onConfirm();
  };

  const start = () => {
    press(0.965);
    if (!hold) return;
    // Off the fill's own duration, so the ramp is measuring the same 700ms the
    // bar is. `unwind` first: a second press-in without a release in between
    // would otherwise orphan the first ramp's cancel and leave it ticking.
    unwind();
    if (destructive && s.haptics) winding.current = buzz.winding(motion.hold.duration);
    Animated.timing(fillV, { toValue: 1, ...motion.hold, useNativeDriver: true }).start(
      ({ finished }) => {
        // `finished` is false whenever the rewind interrupted the fill, so a
        // released hold can never commit.
        if (finished) {
          fillV.setValue(0);
          commit();
        }
      }
    );
  };

  const release = () => {
    press(1);
    // Silent on the frame the fill starts rewinding. A released hold has
    // already committed if it got that far, so this only ever cancels ticks
    // for a gesture that has been abandoned.
    unwind();
    if (hold) {
      Animated.timing(fillV, {
        toValue: 0,
        duration: linger.rewind,
        easing: motion.tap.easing,
        useNativeDriver: true,
      }).start();
    }
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      onPressIn={start}
      onPressOut={release}
      onPress={hold ? undefined : commit}
      style={[
        styles.btn,
        { borderColor: v.border },
        dashed && styles.dashed,
        style,
        { transform: [{ scale }] },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fill,
          { backgroundColor: v.fill, transform: [{ scaleX: fillV }] },
        ]}
      />
      <Text
        style={[styles.label, { color: v.label }, labelStyle]}
        numberOfLines={1}
        // The hold labels run long ("Zum Verwerfen halten") — shrink a little
        // before truncating.
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const sheet = themed(() => ({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    // Stated, never left absent. Android's border drawable recomputes its path
    // effect inside a `borderStyle?.let` (BorderDrawable.updatePathEffect), so
    // *removing* the style is a no-op and the last dash effect stays on the
    // paint: the session CTA kept its dashes after the final set was ticked,
    // with its label and its tap already gone solid. Naming solid here makes
    // every flip a value change, which is the case that clears the effect.
    borderStyle: 'solid',
    paddingVertical: space[2],
    paddingHorizontal: space[3] * 1.2,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  dashed: { borderStyle: 'dashed' },
  fill: { ...fill, transformOrigin: 'left' },
  label: { fontFamily: font.heading, fontSize: 14, lineHeight: 14 * 1.2 },
}));
