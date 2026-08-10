/**
 * Nocturne component classes as React Native components.
 *
 * One component here per class in the design system's `styles.css`
 * (.btn, .input, .tag, .seg, .field, .hr, .card-kicker) plus the element-level
 * heading styles. Screens compose these rather than restating the tokens.
 *
 * Everything colour-bearing goes through `useThemed` — see `./theme` for why
 * that is a rule rather than a preference.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, RefObject, useState } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { themed, useColors, useThemed } from './theme';
import { color, fill, font, motion, Palette, radius, space, tracking, wash } from './tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ── type ──────────────────────────────────────────────────────────────── */

/** body: 15px / 1.55, weight 400 */
export function Txt({ style, ...rest }: TextProps) {
  const styles = useThemed(sheet);
  return <Text style={[styles.body, style]} {...rest} />;
}

type HeadingProps = TextProps & { size?: number };

/**
 * The heading colour lives in a themed sheet and the metrics stay inline —
 * they are computed from a size the caller can override, so there is nothing
 * to cache, and the sheet read is what subscribes the component to the theme.
 */
function heading(baseSize: number) {
  return function Heading({ size, style, ...rest }: HeadingProps) {
    const styles = useThemed(sheet);
    const fontSize = size ?? baseSize;
    return (
      <Text
        style={[
          styles.heading,
          { fontSize, lineHeight: fontSize * 1.12, letterSpacing: tracking(fontSize, -0.015) },
          style,
        ]}
        {...rest}
      />
    );
  };
}

export const H2 = heading(32);
export const H3 = heading(25);
export const H4 = heading(20);
export const H5 = heading(16);

/** h6 — the system's section label: 13px, uppercase, 0.08em tracking. */
export function H6({ size, style, ...rest }: HeadingProps) {
  const styles = useThemed(sheet);
  const fontSize = size ?? 13;
  return (
    <Text
      style={[
        styles.h6,
        { fontSize, lineHeight: fontSize * 1.12, letterSpacing: tracking(fontSize, 0.08) },
        style,
      ]}
      {...rest}
    />
  );
}

/** .card-kicker */
export function CardKicker({ style, ...rest }: TextProps) {
  const styles = useThemed(sheet);
  return <Text style={[styles.kicker, style]} {...rest} />;
}

/**
 * The cue for a name with no entry in the active language — the fallback
 * shows greyed and italic until a translation is added in Settings.
 *
 * Takes the palette rather than reading the token: called from inside a
 * component, a no-argument version would be hoisted to a single object built
 * on whichever palette loaded first and would never change colour again.
 */
export const missingName = (c: Palette): TextStyle => ({
  color: c.neutral600,
  fontStyle: 'italic',
});

/* ── rules ─────────────────────────────────────────────────────────────── */

/**
 * .hr — a Nocturne signature: the rule fades to transparent over 48px at each
 * end. The ramp is authored in px against an unknown width, so measure it.
 */
export function Hr({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useThemed(sheet);
  const c = useColors();
  const [width, setWidth] = useState(0);
  const fade = width > 96 ? 48 / width : 0.5;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.hr, style]}
    >
      {width > 0 && (
        <LinearGradient
          colors={['transparent', c.divider, c.divider, 'transparent']}
          locations={[0, fade, 1 - fade, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

/* ── buttons ───────────────────────────────────────────────────────────── */

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'bare';

export type BtnProps = Omit<PressableProps, 'style' | 'children'> & {
  variant?: BtnVariant;
  block?: boolean;
  label?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

/**
 * .btn plus .btn-primary / .btn-secondary / .btn-ghost / .btn-block
 *
 * Every button shares the press grammar: a 120ms settle to 0.965 scale on
 * press-in, released on the same curve — juice felt in the thumb, not the eye.
 */
export function Btn({
  variant = 'secondary',
  block,
  label,
  children,
  style,
  labelStyle,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: BtnProps) {
  const styles = useThemed(sheet);
  const v = btnVariant(variant, useColors());
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  const settle = (to: number) =>
    Animated.timing(scale, {
      toValue: to,
      ...motion.tap,
      useNativeDriver: true,
    }).start();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        settle(0.965);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        settle(1);
        onPressOut?.(e);
      }}
      style={[
        styles.btn,
        v.box,
        block && styles.btnBlock,
        disabled && styles.btnDisabled,
        pressed && !disabled && { backgroundColor: v.pressed },
        style,
        { transform: [{ scale }] },
      ]}
      {...rest}
    >
      {label !== undefined && (
        <Text style={[styles.btnLabel, { color: v.color }, labelStyle]} numberOfLines={1}>
          {label}
        </Text>
      )}
      {children}
    </AnimatedPressable>
  );
}

/** Takes the palette for the same reason `missingName` does. */
const btnVariant = (
  variant: BtnVariant,
  c: Palette
): { box: ViewStyle; color: string; pressed: string } =>
  ({
    primary: {
      box: { borderColor: c.accent },
      color: c.accent,
      pressed: c.wash.accent(22),
    },
    secondary: {
      box: { borderColor: c.divider },
      color: c.text,
      pressed: c.wash.text(14),
    },
    ghost: {
      box: { borderColor: 'transparent', paddingHorizontal: space[1] },
      color: c.accent,
      pressed: c.wash.accent(18),
    },
    /** Not a system class — an unstyled hit target for the design's bare rows. */
    bare: {
      box: { borderColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
      color: c.text,
      pressed: c.wash.text(7),
    },
  })[variant];

/* ── forms ─────────────────────────────────────────────────────────────── */

/**
 * .input
 *
 * `ref` is an ordinary prop under React 19 — declared here so a caller can
 * hold the field itself (the session screen moves focus weight → reps).
 */
export function Input({
  style,
  ref,
  ...rest
}: TextInputProps & { ref?: RefObject<TextInput | null> }) {
  const styles = useThemed(sheet);
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.neutral600}
      cursorColor={c.accent}
      selectionColor={c.accent}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={[styles.input, focused && { borderColor: c.accent }, style]}
      {...rest}
    />
  );
}

/** .field — label above a control. */
export function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemed(sheet);
  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export type SegOption = { key: string; label: string; on: boolean; pick: () => void };

/**
 * .seg / .seg-opt — a segmented radio row. The checked option's accent ring is
 * an overlay so selecting one never shifts the row's layout.
 */
export function Seg({ options, style }: { options: SegOption[]; style?: StyleProp<ViewStyle> }) {
  const styles = useThemed(sheet);
  const c = useColors();
  return (
    <View style={[styles.seg, style]}>
      {options.map((o, i) => (
        <Pressable
          key={o.key}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.on }}
          onPress={o.pick}
          style={({ pressed }) => [
            styles.segOpt,
            i > 0 && styles.segOptDivided,
            pressed && !o.on && { backgroundColor: c.wash.text(7) },
          ]}
        >
          <Text style={[styles.segLabel, o.on && { color: c.accent }]}>{o.label}</Text>
          {o.on && <View pointerEvents="none" style={styles.segRing} />}
        </Pressable>
      ))}
    </View>
  );
}

/* ── tags ──────────────────────────────────────────────────────────────── */

export type TagTone = 'accent' | 'accent-2' | 'neutral' | 'outline';

export function Tag({
  label,
  tone = 'neutral',
  style,
  textStyle,
}: {
  label: string;
  tone?: TagTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const styles = useThemed(sheet);
  const v = tagTone(tone, useColors());
  return (
    <View style={[styles.tag, v.box, style]}>
      <Text style={[styles.tagLabel, { color: v.color }, textStyle]}>{label}</Text>
    </View>
  );
}

const tagTone = (tone: TagTone, c: Palette): { box: ViewStyle; color: string } =>
  ({
    accent: { box: { backgroundColor: c.accent800 }, color: c.accent100 },
    // The design gives this one a literal #423e5d / #f5f4ff — a desaturated
    // accent-800 with no token behind it, and the only pair in the system that
    // couldn't follow a theme. Nothing renders this tone, so it takes the
    // nearest ramp step rather than a hardcoded colour.
    'accent-2': { box: { backgroundColor: c.accent700 }, color: c.accent100 },
    neutral: { box: { backgroundColor: c.neutral800 }, color: c.neutral100 },
    outline: { box: { borderWidth: 1, borderColor: c.accent }, color: c.accent },
  })[tone];

/* ── styles ────────────────────────────────────────────────────────────── */

const sheet = themed(() => ({
  body: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    color: color.text,
  },
  heading: { fontFamily: font.heading, color: color.text },
  h6: { fontFamily: font.heading, textTransform: 'uppercase', color: color.text },
  kicker: {
    fontFamily: font.regular,
    fontSize: 10,
    letterSpacing: tracking(10, 0.1),
    textTransform: 'uppercase',
    color: color.accent,
  },
  hr: { height: 1, marginVertical: space[4] },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    paddingVertical: space[2],
    paddingHorizontal: space[3] * 1.2,
    borderRadius: radius.md,
  },
  btnLabel: {
    fontFamily: font.heading,
    fontSize: 14,
    lineHeight: 14 * 1.2,
  },
  btnBlock: { width: '100%', marginTop: space[2] },
  btnDisabled: { opacity: 0.45 },
  input: {
    width: '100%',
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontFamily: font.regular,
    fontSize: 14,
    color: color.text,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
  },
  fieldLabel: {
    fontFamily: font.regular,
    fontSize: 12,
    marginBottom: 5,
    color: wash.text(70),
  },
  seg: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
  },
  segOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  segOptDivided: { borderLeftWidth: 1, borderLeftColor: color.divider },
  segLabel: { fontFamily: font.regular, fontSize: 13, color: color.text },
  segRing: {
    ...fill,
    borderWidth: 1,
    borderColor: color.accent,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.md * 0.75,
  },
  tagLabel: {
    fontFamily: font.regular,
    fontSize: 11,
    letterSpacing: tracking(11, 0.02),
  },
}));
