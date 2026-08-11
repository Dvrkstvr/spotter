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
 */
import { useState } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';

import { themed, useColors, useThemed } from '@/design/theme';
import { fill, font, linger, motion, Palette, radius, space } from '@/design/tokens';

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
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  /** For glyph labels ("×") that a screen reader shouldn't read literally. */
  accessibilityLabel?: string;
  hitSlop?: number;
}) {
  const styles = useThemed(sheet);
  const v = holdVariant(variant, useColors());
  const [fillV] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(1));

  const press = (to: number) =>
    Animated.timing(scale, { toValue: to, ...motion.tap, useNativeDriver: true }).start();

  const start = () => {
    press(0.965);
    if (!hold) return;
    Animated.timing(fillV, { toValue: 1, ...motion.hold, useNativeDriver: true }).start(
      ({ finished }) => {
        // `finished` is false whenever the rewind interrupted the fill, so a
        // released hold can never commit.
        if (finished) {
          fillV.setValue(0);
          onConfirm();
        }
      }
    );
  };

  const release = () => {
    press(1);
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
      onPress={hold ? undefined : onConfirm}
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
    paddingVertical: space[2],
    paddingHorizontal: space[3] * 1.2,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  dashed: { borderStyle: 'dashed' },
  fill: { ...fill, transformOrigin: 'left' },
  label: { fontFamily: font.heading, fontSize: 14, lineHeight: 14 * 1.2 },
}));
