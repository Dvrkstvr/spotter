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
import { ComponentProps, ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { TABS } from '@/data/exercises';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, linger, motion, tracking, wash } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

const DASH_W = 28;

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
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, clock } = useStore();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  const minimized = s.session !== null && s.sessionMin;

  // Deviation: the design has no active-tab indicator. The 2px accent dash
  // that slides along the top hairline is a motion-pass addition — it fades
  // out entirely while a non-tab screen (plan) is showing.
  const focusedIdx = TABS.findIndex((tab) => ROUTE[tab.id] === current);
  const [barW, setBarW] = useState(0);
  const [dashX] = useState(() => new Animated.Value(0));
  const [dashO] = useState(() => new Animated.Value(0));
  const dashPlaced = useRef(false);

  useEffect(() => {
    if (!barW) return;
    if (focusedIdx < 0) {
      Animated.timing(dashO, { toValue: 0, ...motion.quick, useNativeDriver: true }).start();
      return;
    }
    const tabW = (barW - 12) / TABS.length;
    const x = 6 + focusedIdx * tabW + tabW / 2 - DASH_W / 2;
    if (dashPlaced.current) {
      Animated.timing(dashX, {
        toValue: x,
        duration: motion.move.duration,
        easing: motion.move.easing,
        useNativeDriver: true,
      }).start();
    } else {
      // First layout: appear in place rather than sliding in from x=0.
      dashPlaced.current = true;
      dashX.setValue(x);
    }
    Animated.timing(dashO, { toValue: 1, ...motion.quick, useNativeDriver: true }).start();
  }, [barW, focusedIdx, dashX, dashO]);

  return (
    <View>
      {minimized ? (
        // A session is tucked behind the tabs — the strip is the way back.
        <Pressable onPress={() => patch({ sessionMin: false })} style={styles.buddyBar}>
          <View style={styles.buddyAvatar}>
            <View style={styles.liveDot} />
          </View>
          <Text style={styles.buddyName} numberOfLines={1}>
            {s.session!.name} · {clock}
          </Text>
          <Text style={styles.buddyStatus}>{L.backToWorkout} ›</Text>
        </Pressable>
      ) : (
        s.buddy && (
          // Same tap target as the session overlay's bar, and the same
          // destination: the buddy section on Profile. A pairing is worth
          // reaching whether or not a workout is running.
          <Pressable
            onPress={() => {
              patch({ routineOpen: null, buddyFocus: true });
              navigation.navigate(ROUTE.you);
            }}
            style={styles.buddyBar}
          >
            <View style={styles.buddyAvatar}>
              <Text style={styles.buddyInitial}>{s.buddy[0]}</Text>
            </View>
            <Text style={styles.buddyName} numberOfLines={1}>
              {s.buddy}
            </Text>
            <Text style={styles.buddyStatus}>{L.trainingWith}</Text>
            <Text style={styles.buddyChevron}>›</Text>
          </Pressable>
        )
      )}

      {/* They tapped Disconnect and the strip above them just vanished —
          say why once, then let it go. The session screen has its own. */}
      {!minimized && !s.buddy && s.buddyLeft && (
        <Pressable onPress={() => patch({ buddyLeft: null })} style={styles.leftNote}>
          <Text style={styles.leftNoteText}>
            {L.buddyLeftNote.replace('{name}', s.buddyLeft)}
          </Text>
        </Pressable>
      )}

      <View
        style={[styles.bar, { paddingBottom: 8 + insets.bottom }]}
        onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.dash, { opacity: dashO, transform: [{ translateX: dashX }] }]}
        />
        {TABS.map((tab) => {
          const route = ROUTE[tab.id];
          const focused = current === route;
          const tint = focused ? c.accent : c.neutral600;
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
              <TabGlyph focused={focused}>
                <Icon d={tab.d} color={tint} size={21} />
              </TabGlyph>
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

/** A 3px rise-and-settle when a tab becomes active. */
function TabGlyph({ focused, children }: { focused: boolean; children: ReactNode }) {
  const [y] = useState(() => new Animated.Value(0));
  const prev = useRef(focused);

  useEffect(() => {
    if (prev.current === focused) return;
    prev.current = focused;
    if (focused) {
      Animated.sequence([
        Animated.timing(y, {
          toValue: -3,
          duration: linger.rise,
          easing: motion.tap.easing,
          useNativeDriver: true,
        }),
        Animated.spring(y, { toValue: 0, ...motion.payoff, useNativeDriver: true }),
      ]).start();
    }
  }, [focused, y]);

  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

const sheet = themed(() => ({
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
  /** Covers the bar's top hairline (top 0 keeps it inside the bar's bounds,
      out of reach of Android's outside-the-parent clipping). */
  dash: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DASH_W,
    height: 2,
    borderRadius: 1,
    backgroundColor: color.accent,
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
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  buddyName: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.text },
  buddyStatus: { fontFamily: font.regular, fontSize: 11, color: color.accent400 },
  buddyChevron: { fontFamily: font.regular, fontSize: 14, color: color.accent },
  leftNote: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  leftNoteText: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },
}));
