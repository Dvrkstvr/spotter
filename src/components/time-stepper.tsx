/**
 * `‹ 18 › : ‹ 30 ›` — the plan sheet's stepper grammar, twice.
 *
 * Two steppers rather than a wheel, a text field or a list of preset times.
 * Nothing here can be typed wrong, it needs no keyboard on a screen that is
 * mostly switches, and it borrows a control the app already has: a drag would
 * fight the settings scroll exactly as it would fight the plan sheet's.
 *
 * Each field wraps within itself — 23 goes to 00, 55 goes to 00 — so neither
 * end is a wall, and stepping the minutes never moves the hour under you.
 *
 * It lives here rather than in Settings because the reminder is now asked for
 * in two places — the tour's week screen and the settings row — and a second
 * copy of a control is a second thing to keep in step. Same argument as the
 * tour reading the tip strings.
 */
import { Pressable, Text, View } from 'react-native';

import { themed, useThemed } from '@/design/theme';
import { color, font, radius, slop } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

/**
 * Five, not one: nobody's reminder is at 18:07, and a stepper that took twelve
 * taps to cross an hour would be a text field with extra steps. The hour is the
 * decision; the minutes are how far either side of it.
 */
const MINUTE_STEP = 5;

export function TimeStepper({ at, set }: { at: number; set: (at: number) => void }) {
  const styles = useThemed(sheet);
  const { L } = useStore();
  const h = Math.floor(at / 60);
  const m = at % 60;
  const wrap = (v: number, n: number) => ((v % n) + n) % n;
  return (
    <View style={styles.timeStepper}>
      <Unit
        label={L.planAlertHour}
        value={h}
        onStep={(d) => set(wrap(h + d, 24) * 60 + m)}
      />
      <Text style={styles.timeColon}>:</Text>
      <Unit
        label={L.planAlertMinute}
        value={m}
        onStep={(d) => set(h * 60 + wrap(m + d * MINUTE_STEP, 60))}
      />
    </View>
  );
}

/** One `‹ nn ›`. Two digits always, so the row never re-flows as it steps. */
function Unit({
  label,
  value,
  onStep,
}: {
  label: string;
  value: number;
  onStep: (d: -1 | 1) => void;
}) {
  const styles = useThemed(sheet);
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} −`}
        hitSlop={slop}
        onPress={() => onStep(-1)}
        style={styles.stepBtn}
      >
        <Text style={styles.stepGlyph}>‹</Text>
      </Pressable>
      <Text style={styles.stepValue}>{String(value).padStart(2, '0')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} +`}
        hitSlop={slop}
        onPress={() => onStep(1)}
        style={styles.stepBtn}
      >
        <Text style={styles.stepGlyph}>›</Text>
      </Pressable>
    </View>
  );
}

const sheet = themed(() => ({
  timeStepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeColon: { fontFamily: font.regular, fontSize: 14, color: color.neutral500 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  stepBtn: { paddingVertical: 4, paddingHorizontal: 11 },
  stepGlyph: { fontFamily: font.regular, fontSize: 17, color: color.accent },
  stepValue: {
    fontFamily: font.regular,
    fontSize: 14,
    color: color.text,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
}));
