/**
 * The scrolling content area shared by every tab.
 *
 * Matches the design's `flex:1; overflow:auto; padding:14px 16px 8px`, plus the
 * top safe-area inset the device frame stood in for. Each tab's content fades
 * up on arrival, so the entry animation replays on tab switches the way it does
 * in the design — where switching tabs remounts the panel.
 */
import { useFocusEffect } from 'expo-router';
import { ReactNode, RefObject, useCallback, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RiseIn } from '@/components/motion';

export function Screen({
  children,
  contentStyle,
  scrollRef,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** For screens that scroll themselves to a section — see Profile's buddy card. */
  scrollRef?: RefObject<ScrollView | null>;
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
    // The same rule the overlay shells follow (see sheet.tsx): edge-to-edge
    // made Android's `resize` a no-op, so the shell shrinks itself under the
    // keyboard — here so a list filtered from the search field can still be
    // scrolled all the way to its last row while the keyboard is up.
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
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
    </KeyboardAvoidingView>
  );
}
