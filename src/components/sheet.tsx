/**
 * The two overlay shells the design uses.
 *
 * `Sheet`   — scrim + bottom sheet with a grab handle, dismissed by tapping the
 *             scrim — or by dragging the handle down: the pill is a universal
 *             "swipe me" promise, and an affordance that doesn't afford is
 *             worse than none. The scrim is a sibling of the panel rather than
 *             its parent, so there is no click to stop propagating on.
 * `FullScreen` — an opaque panel over the whole screen, its own back affordance.
 *
 * Both shells own keyboard avoidance, so no screen has to. SDK 54 runs Android
 * edge-to-edge unconditionally, which turns `softwareKeyboardLayoutMode:
 * resize` into a no-op — the keyboard draws over an app that no longer
 * shrinks. The `KeyboardAvoidingView` in each shell puts the resize back in
 * JS: a sheet rides up onto the keyboard, a full screen keeps its footer above
 * the keys, and the platform's own scroll-to-focused-field does the rest.
 * Deliberately not react-native-keyboard-controller — that is a native module,
 * which Expo Go doesn't have. What the JS route costs is one beat of lag:
 * Android only reports the keyboard after it is up, so content moves a moment
 * behind the keys. Mockup: design/keyboard-mockup.html.
 */
import { ReactNode, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { RiseIn, SheetIn } from '@/components/motion';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, elevation, motion, radius, slop } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

export function Sheet({
  onClose,
  maxHeight = '78%',
  scrimOpacity = 66,
  zIndex,
  children,
}: {
  onClose: () => void;
  /** The design sets this per sheet: 70%, 78%, 80% or 88%. */
  maxHeight?: `${number}%`;
  scrimOpacity?: number;
  zIndex: number;
  children: ReactNode;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { L } = useStore();

  // The handle's drag. Only the grabber owns the gesture — the ScrollView
  // underneath keeps its scroll — and a release short of the threshold
  // settles the panel back on `move`, the tier sheets travel on.
  const [drag] = useState(() => new Animated.Value(0));
  const settle = () =>
    Animated.timing(drag, { toValue: 0, ...motion.move, useNativeDriver: true }).start();
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 90) onClose();
      else settle();
    },
    onPanResponderTerminate: settle,
  });

  return (
    // `padding` lifts the panel onto the keyboard. The scrim is absolutely
    // positioned, so the padding never moves it — it keeps covering the whole
    // screen, including the strip the keyboard is about to cover anyway.
    <KeyboardAvoidingView
      behavior="padding"
      style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex }]}
    >
      <Pressable
        accessibilityLabel={L.close}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.wash.scrim(scrimOpacity) }]}
      />
      <SheetIn style={[styles.panel, { maxHeight }]} offsetY={drag}>
        <View {...pan.panHandlers} hitSlop={slop} style={styles.grabZone}>
          <View style={styles.grabber} />
        </View>
        <ScrollView
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SheetIn>
    </KeyboardAvoidingView>
  );
}

export function FullScreen({
  zIndex,
  style,
  children,
}: {
  zIndex: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const styles = useThemed(sheet);
  return (
    <RiseIn style={[StyleSheet.absoluteFill, styles.full, { zIndex }, style]}>
      <KeyboardAvoidingView behavior="padding" style={styles.avoid}>
        {children}
      </KeyboardAvoidingView>
    </RiseIn>
  );
}

const sheet = themed(() => ({
  panel: {
    width: '100%',
    /** With the keyboard up the shell's padding shrinks the space above the
        keys; without this a tall panel would hold its maxHeight and push the
        grabber off the top, instead of letting the inner scroll take over. */
    flexShrink: 1,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...elevation.lg,
  },
  panelContent: { paddingHorizontal: 16, paddingBottom: 26 },
  /** The handle's touch zone — fixed above the scroll, so the drag is always
      on the pill and never fights the list. */
  grabZone: { paddingTop: 14, paddingBottom: 14, alignSelf: 'center', paddingHorizontal: 30 },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.neutral700,
  },
  full: { backgroundColor: color.bg },
  avoid: { flex: 1 },
}));
