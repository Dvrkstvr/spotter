/**
 * The two overlay shells the design uses.
 *
 * `Sheet`   — scrim + bottom sheet with a grab handle, dismissed by tapping the
 *             scrim. The scrim is a sibling of the panel rather than its parent,
 *             so there is no click to stop propagating on.
 * `FullScreen` — an opaque panel over the whole screen, its own back affordance.
 */
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { RiseIn, SheetIn } from '@/components/motion';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, elevation, radius } from '@/design/tokens';

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
  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex }]}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.wash.scrim(scrimOpacity) }]}
      />
      <SheetIn style={[styles.panel, { maxHeight }]}>
        <ScrollView
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grabber} />
          {children}
        </ScrollView>
      </SheetIn>
    </View>
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
    <RiseIn duration={180} style={[StyleSheet.absoluteFill, styles.full, { zIndex }, style]}>
      {children}
    </RiseIn>
  );
}

const sheet = themed(() => ({
  panel: {
    width: '100%',
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...elevation.lg,
  },
  panelContent: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 26 },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.neutral700,
    alignSelf: 'center',
    marginBottom: 14,
  },
  full: { backgroundColor: color.bg },
}));
