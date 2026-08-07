/**
 * The bottom tab bar, plus the buddy strip that sits directly above it.
 *
 * Only the design's four TABS entries get a button — `plan` is a screen in this
 * group but is reached from Today's "See plan", so while it is open no tab
 * reads as selected. That is the design's behaviour, not an oversight.
 *
 * Deviation: the design gates the buddy strip on a canvas prop. Here it follows
 * the connected buddy in state, which is the same strip driven by real data.
 */
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { TABS } from '@/data/exercises';
import { color, font, tracking, wash } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

/** Tab id → expo-router route name. */
const ROUTE: Record<string, string> = {
  today: 'index',
  routines: 'routines',
  library: 'library',
  you: 'you',
};

/**
 * Derived from `Tabs` itself. expo-router vendors its own copy of the bottom-tab
 * types, so importing them from `@react-navigation/bottom-tabs` yields a
 * structurally different — and incompatible — type.
 */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabBar({ state, navigation }: TabBarProps) {
  const { s, L, patch } = useStore();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  return (
    <View>
      {s.buddy && (
        <View style={styles.buddyBar}>
          <View style={styles.buddyAvatar}>
            <Text style={styles.buddyInitial}>{s.buddy[0]}</Text>
          </View>
          <Text style={styles.buddyName} numberOfLines={1}>
            {s.buddy}
          </Text>
          <Text style={styles.buddyStatus}>{L.trainingWith}</Text>
        </View>
      )}

      <View style={[styles.bar, { paddingBottom: 8 + insets.bottom }]}>
        {TABS.map((tab) => {
          const route = ROUTE[tab.id];
          const focused = current === route;
          const tint = focused ? color.accent : color.neutral600;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                // The design clears the open routine whenever a tab is picked.
                patch({ routineOpen: null });
                navigation.navigate(route);
              }}
              style={styles.tab}
            >
              <Icon d={tab.d} color={tint} size={21} />
              <Text style={[styles.tabLabel, { color: tint }]}>
                {L[tab.id === 'library' ? 'exercises' : tab.id]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingHorizontal: 6,
    backgroundColor: wash.bg(90),
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingTop: 7,
    paddingBottom: 3,
  },
  tabLabel: {
    fontFamily: font.regular,
    fontSize: 10,
    letterSpacing: tracking(10, 0.02),
  },
  buddyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: color.surface,
    borderLeftWidth: 2,
    borderLeftColor: color.accent,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  buddyAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buddyInitial: { fontFamily: font.regular, fontSize: 11, color: color.accent200 },
  buddyName: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.text },
  buddyStatus: { fontFamily: font.regular, fontSize: 11, color: color.accent400 },
});
