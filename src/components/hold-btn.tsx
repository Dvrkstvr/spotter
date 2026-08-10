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

import { themed, useThemed } from '@/design/theme';
import { color, fill, font, motion, radius, space, wash } from '@/design/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const VARIANTS = {
  primary: { border: color.accent, label: color.accent, fill: wash.accent(20) },
  secondary: { border: color.divider, label: color.text, fill: wash.text(12) },
} as const;

export function HoldBtn({
  label,
  onConfirm,
  variant = 'secondary',
  hold = true,
  dashed = false,
  style,
  labelStyle,
}: {
  label: string;
  onConfirm: () => void;
  variant?: keyof typeof VARIANTS;
  hold?: boolean;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const styles = useThemed(sheet);
  const v = VARIANTS[variant];
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
        duration: 160,
        easing: motion.tap.easing,
        useNativeDriver: true,
      }).start();
    }
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
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
