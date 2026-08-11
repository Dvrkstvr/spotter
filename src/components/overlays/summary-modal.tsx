/**
 * Post-workout summary — sets, volume, time, and where it was filed.
 *
 * The payoff moment: the stats rise in staggered and count up from zero under
 * a single confetti burst cut from the accent ramp. Once per workout, then
 * done — celebration stays scarce so it stays meaningful.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { RiseIn } from '@/components/motion';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, elevation, fill, font, Palette, radius, tracking, wash } from '@/design/tokens';
import { Btn, CardKicker, H3, Input } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function SummaryModal() {
  const styles = useThemed(sheet);
  const { s, L, patch, saveAsRoutine } = useStore();
  const router = useRouter();
  const [routineName, setRoutineName] = useState('');

  const close = () => {
    patch({ summary: null });
    router.navigate('/');
  };
  useBackClose(close);

  const summary = s.summary;
  if (!summary) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <RiseIn style={styles.card}>
        {/* A zero-tick finish logged nothing: no "Saved", no stats, no
            confetti — the note says what happened and the card bows out. */}
        {!summary.empty && <CardKicker>{L.saved}</CardKicker>}
        <H3 size={23} style={styles.title}>
          {summary.name}
        </H3>

        {!summary.empty && (
          <View style={styles.stats}>
            {summary.stats.map((stat, i) => (
              <RiseIn key={stat.k} delay={150 + i * 90} style={styles.stat}>
                <Text style={styles.statKey}>{stat.k}</Text>
                <StatValue v={stat.v} delay={150 + i * 90} />
              </RiseIn>
            ))}
          </View>
        )}

        <Text style={styles.note}>{summary.note}</Text>

        {/* Freeform sessions can be kept as a routine — not in the original
            design, which threw the exercise list away here. */}
        {summary.saveable && (
          <View style={styles.saveRow}>
            <Input
              style={styles.saveInput}
              placeholder={L.newRoutine}
              value={routineName}
              onChangeText={setRoutineName}
            />
            <Btn
              variant="secondary"
              label={L.saveAsRoutine}
              labelStyle={styles.saveLabel}
              onPress={() => saveAsRoutine(routineName)}
            />
          </View>
        )}

        {/* The design wrote "Done" literally, but the design was
            single-language — the dictionary's own word for this verdict is
            the one thing that must not be English on a German phone's
            payoff screen. */}
        <Btn variant="primary" block label={L.ok} style={styles.doneBtn} onPress={close} />
        {!summary.empty && <Confetti />}
      </RiseIn>
    </View>
  );
}

/** Numeric stats count up from zero; strings (the clock) hold still. */
function StatValue({ v, delay }: { v: number | string; delay: number }) {
  const styles = useThemed(sheet);
  const target = typeof v === 'number' ? v : null;
  const [shown, setShown] = useState<number | string>(target === null ? v : 0);

  useEffect(() => {
    if (target === null) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const dur = 600;
    const step = (now: number) => {
      const p = Math.min(Math.max((now - t0) / dur, 0), 1);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delay]);

  return <Text style={styles.statValue}>{shown}</Text>;
}

/** Takes the palette for the same reason ui.tsx's `btnVariant` does. */
const confettiColors = (c: Palette) => [
  c.accent300,
  c.accent,
  c.accent2,
  c.accent600,
  c.neutral400,
  c.accent100,
];

/** Flight time in seconds, and the shared-progress keyframe stops. */
const FLIGHT = 1.7;
const STOPS = [0, 0.25, 0.5, 0.75, 1];
const GRAVITY = 480;

/**
 * One burst from the card's top edge, ~30 pieces. A single shared progress
 * value drives every particle through keyframed interpolations — one native
 * animation, thirty tumbling Views, gone in under two seconds.
 */
function Confetti() {
  const styles = useThemed(sheet);
  const c = useColors();
  const [p] = useState(() => new Animated.Value(0));
  const [w, setW] = useState(0);
  const [parts] = useState(() => {
    const palette = confettiColors(c);
    return Array.from({ length: 30 }, () => {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const speed = 70 + Math.random() * 170;
      return {
        fx: Math.random() - 0.5,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        w: 3.5 + Math.random() * 3,
        h: 7 + Math.random() * 4,
        color: palette[(Math.random() * palette.length) | 0],
        spin: (Math.random() - 0.5) * 720,
      };
    });
  });

  useEffect(() => {
    if (!w) return;
    Animated.timing(p, {
      toValue: 1,
      duration: FLIGHT * 1000,
      delay: 150,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [p, w]);

  return (
    <View
      pointerEvents="none"
      style={styles.confetti}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 &&
        parts.map((pt, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: w / 2 + pt.fx * w * 0.9,
              width: pt.w,
              height: pt.h,
              borderRadius: 1,
              backgroundColor: pt.color,
              opacity: p.interpolate({ inputRange: [0, 0.02, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                {
                  translateX: p.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, pt.vx * FLIGHT * 0.9],
                  }),
                },
                {
                  // Ballistic arc, sampled at the keyframe stops.
                  translateY: p.interpolate({
                    inputRange: STOPS,
                    outputRange: STOPS.map(
                      (s) => pt.vy * s * FLIGHT + 0.5 * GRAVITY * s * FLIGHT * s * FLIGHT
                    ),
                  }),
                },
                {
                  rotate: p.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${pt.spin}deg`],
                  }),
                },
              ],
            }}
          />
        ))}
    </View>
  );
}

const sheet = themed(() => ({
  backdrop: {
    zIndex: 90,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: wash.scrim(70),
  },
  card: {
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingVertical: 20,
    paddingHorizontal: 18,
    ...elevation.lg,
  },
  title: { marginTop: 5 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 15 },
  stat: { flex: 1, padding: 11, borderRadius: radius.md, backgroundColor: color.bg },
  statKey: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.08),
    textTransform: 'uppercase',
    color: color.neutral600,
  },
  statValue: {
    fontFamily: font.regular,
    fontSize: 18,
    color: color.text,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  note: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral400, marginTop: 14 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  saveInput: { flex: 1, width: undefined },
  saveLabel: { fontSize: 12.5 },
  doneBtn: { marginTop: 16, height: 42 },
  /** Anchor over the whole card; particles spawn on its top edge and overflow freely. */
  confetti: { ...fill },
}));
