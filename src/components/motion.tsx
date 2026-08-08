/**
 * The design's two entry animations, as components.
 *
 *   @keyframes riseIn  { opacity 0, translateY 8px → none }   .18–.2s ease
 *   @keyframes sheetIn { translateY 100% → none }             .24s cubic-bezier(.2,.8,.3,1)
 *
 * `translateY(100%)` is relative to the element's own height, which RN cannot
 * express declaratively — so SheetIn measures itself first and animates from
 * that height.
 *
 * The driving `Animated.Value`s are held in lazy state rather than a ref: they
 * are read while rendering, which the React Compiler does not allow of refs.
 */
import { ReactNode, useEffect, useState } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

import { motion } from '@/design/tokens';

/** riseIn — fade up 8px. */
export function RiseIn({
  children,
  duration = motion.quick.duration,
  delay = 0,
  style,
}: {
  children: ReactNode;
  duration?: number;
  /** Stagger support — the content stays hidden until the delay elapses. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [p] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(p, {
      toValue: 1,
      duration,
      delay,
      easing: motion.quick.easing,
      useNativeDriver: true,
    }).start();
  }, [delay, duration, p]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: p,
          transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** sheetIn — slide up from fully below its own bottom edge. */
export function SheetIn({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [p] = useState(() => new Animated.Value(0));
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!height) return;
    Animated.timing(p, {
      toValue: 1,
      duration: motion.move.duration,
      easing: motion.move.easing,
      useNativeDriver: true,
    }).start();
  }, [height, p]);

  return (
    <Animated.View
      // Only the first measurement is kept, so the slide never replays when the
      // sheet later grows (keyboard opening, a set being added). By then the
      // animation has finished at 0 anyway, so the stale start value is unused.
      onLayout={(e) => setHeight((h) => h || e.nativeEvent.layout.height)}
      style={[
        style,
        {
          // Stay parked off-screen until measured, so the first frame is never
          // a flash of the sheet at its final position.
          opacity: height ? 1 : 0,
          transform: [
            {
              translateY: p.interpolate({
                inputRange: [0, 1],
                outputRange: [height || 600, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
