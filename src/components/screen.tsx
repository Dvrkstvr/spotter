/**
 * The scrolling content area shared by every tab.
 *
 * Matches the design's `flex:1; overflow:auto; padding:14px 16px 8px`, plus the
 * top safe-area inset the device frame stood in for. Each tab's content fades
 * up on arrival, so the entry animation replays on tab switches the way it does
 * in the design — where switching tabs remounts the panel.
 */
import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { ScrollView, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RiseIn } from '@/components/motion';

export function Screen({
  children,
  contentStyle,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();

  // Bumping this remounts RiseIn, which is what replays the animation. Driven
  // by useFocusEffect rather than useIsFocused: it's the hook expo-router
  // actually exports, on every SDK.
  const [focusCount, setFocusCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusCount((n) => n + 1);
    }, [])
  );

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        { paddingTop: 14 + insets.top, paddingHorizontal: 16, paddingBottom: 8 },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <RiseIn key={focusCount}>{children}</RiseIn>
    </ScrollView>
  );
}
