/**
 * Nocturne component classes as React Native components.
 *
 * One component here per class in the design system's `styles.css`
 * (.btn, .input, .tag, .seg, .field, .hr, .card-kicker) plus the element-level
 * heading styles. Screens compose these rather than restating the tokens.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useState } from 'react';
import {
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

import { color, fill, font, radius, space, tracking, wash } from './tokens';

/* ── type ──────────────────────────────────────────────────────────────── */

/** body: 15px / 1.55, weight 400 */
export function Txt({ style, ...rest }: TextProps) {
  return <Text style={[styles.body, style]} {...rest} />;
}

type HeadingProps = TextProps & { size?: number };

function heading(baseSize: number) {
  return function Heading({ size, style, ...rest }: HeadingProps) {
    const fontSize = size ?? baseSize;
    return (
      <Text
        style={[
          {
            fontFamily: font.heading,
            fontSize,
            lineHeight: fontSize * 1.12,
            letterSpacing: tracking(fontSize, -0.015),
            color: color.text,
          },
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
  const fontSize = size ?? 13;
  return (
    <Text
      style={[
        {
          fontFamily: font.heading,
          fontSize,
          lineHeight: fontSize * 1.12,
          letterSpacing: tracking(fontSize, 0.08),
          textTransform: 'uppercase',
          color: color.text,
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** .card-kicker */
export function CardKicker({ style, ...rest }: TextProps) {
  return <Text style={[styles.kicker, style]} {...rest} />;
}

/**
 * The cue for a name with no entry in the active language — the fallback
 * shows greyed and italic until a translation is added in Settings.
 */
export const missingName: TextStyle = { color: color.neutral600, fontStyle: 'italic' };

/* ── rules ─────────────────────────────────────────────────────────────── */

/**
 * .hr — a Nocturne signature: the rule fades to transparent over 48px at each
 * end. The ramp is authored in px against an unknown width, so measure it.
 */
export function Hr({ style }: { style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  const fade = width > 96 ? 48 / width : 0.5;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height: 1, marginVertical: space[4] }, style]}
    >
      {width > 0 && (
        <LinearGradient
          colors={['transparent', color.divider, color.divider, 'transparent']}
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

/** .btn plus .btn-primary / .btn-secondary / .btn-ghost / .btn-block */
export function Btn({
  variant = 'secondary',
  block,
  label,
  children,
  style,
  labelStyle,
  disabled,
  ...rest
}: BtnProps) {
  const v = BTN_VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        v.box,
        block && styles.btnBlock,
        disabled && styles.btnDisabled,
        pressed && !disabled && { backgroundColor: v.pressed },
        style,
      ]}
      {...rest}
    >
      {label !== undefined && (
        <Text style={[styles.btnLabel, { color: v.color }, labelStyle]} numberOfLines={1}>
          {label}
        </Text>
      )}
      {children}
    </Pressable>
  );
}

const BTN_VARIANTS: Record<
  BtnVariant,
  { box: ViewStyle; color: string; pressed: string }
> = {
  primary: {
    box: { borderColor: color.accent },
    color: color.accent,
    pressed: wash.accent(22),
  },
  secondary: {
    box: { borderColor: color.divider },
    color: color.text,
    pressed: wash.text(14),
  },
  ghost: {
    box: { borderColor: 'transparent', paddingHorizontal: space[1] },
    color: color.accent,
    pressed: wash.accent(18),
  },
  /** Not a system class — an unstyled hit target for the design's bare rows. */
  bare: {
    box: { borderColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
    color: color.text,
    pressed: wash.text(7),
  },
};

/* ── forms ─────────────────────────────────────────────────────────────── */

/** .input */
export function Input({ style, ...rest }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={color.neutral600}
      cursorColor={color.accent}
      selectionColor={color.accent}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={[styles.input, focused && { borderColor: color.accent }, style]}
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
            pressed && !o.on && { backgroundColor: wash.text(7) },
          ]}
        >
          <Text style={[styles.segLabel, o.on && { color: color.accent }]}>{o.label}</Text>
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
  const v = TAG_TONES[tone];
  return (
    <View style={[styles.tag, v.box, style]}>
      <Text style={[styles.tagLabel, { color: v.color }, textStyle]}>{label}</Text>
    </View>
  );
}

const TAG_TONES: Record<TagTone, { box: ViewStyle; color: string }> = {
  accent: { box: { backgroundColor: color.accent800 }, color: color.accent100 },
  'accent-2': { box: { backgroundColor: '#423e5d' }, color: '#f5f4ff' },
  neutral: { box: { backgroundColor: color.neutral800 }, color: color.neutral100 },
  outline: { box: { borderWidth: 1, borderColor: color.accent }, color: color.accent },
};

/* ── styles ────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  body: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    color: color.text,
  },
  kicker: {
    fontFamily: font.regular,
    fontSize: 10,
    letterSpacing: tracking(10, 0.1),
    textTransform: 'uppercase',
    color: color.accent,
  },
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
});
