/**
 * The scrolling content area shared by every tab.
 *
 * Matches the design's `flex:1; overflow:auto; padding:14px 16px 8px`, plus the
 * top safe-area inset the device frame stood in for. Each tab's content fades
 * up on arrival, so the entry animation replays on tab switches the way it does
 * in the design — where switching tabs remounts the panel.
 */
import { useIsFocused } from 'expo-router';
import { ReactNode } from 'react';
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
  const focused = useIsFocused();

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
      <RiseIn key={focused ? 'shown' : 'hidden'}>{children}</RiseIn>
    </ScrollView>
  );
}
