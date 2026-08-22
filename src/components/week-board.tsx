/**
 * The setup tour's week: seven day slots, the picked routines under them, and
 * one gesture between the two.
 *
 * The week used to be seven rows you tapped to cycle through your picks. That
 * works and teaches nothing — it is a control invented for this screen and
 * found nowhere else in the app, on the one screen whose job is to hand you the
 * app's habits. Dragging is what this app does with lists everywhere else, so
 * planning a week is dragging: hold a routine, put it on a day.
 *
 * **This one holds first, where the number drag deliberately doesn't.** That is
 * not an inconsistency, it is the same trade decided the other way. A number
 * cell buys its immediacy by giving up the scroll *on that cell* — it is a
 * 74px target in a row that is mostly not cells, so the list is still scrollable
 * from everywhere else. These are full-width rows with nothing beside them, so
 * an immediate grab would cost the screen its scroll outright. `HOLD_MS` is what
 * buys it back, and the lift plus the buzz is what says the hold has landed.
 *
 * Positions come from `measureInWindow` at touch-down rather than from
 * `onLayout` arithmetic: the board sits in a ScrollView, so a row's offset
 * inside its parent is not where the finger will find it. Measuring at the
 * start of every touch is a handful of calls once per grab, and it is exact.
 */
import { useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { GripIcon } from '@/components/icon';
import { buzz } from '@/data/haptics';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, slop, t, tracking, wash } from '@/design/tokens';
import { H6, missingName } from '@/design/ui';
import { useStore } from '@/store/workout-store';

/**
 * How long a finger has to stay put before it owns the row.
 *
 * Long enough that a scroll never grabs one by accident, short enough that it
 * doesn't read as a wait — and the row lifting under the thumb is the answer,
 * so the hold is never silent.
 */
const HOLD_MS = 220;

export type PoolItem = { rid: string; text: string; missing?: boolean };

type Grab = {
  rid: string;
  text: string;
  missing?: boolean;
  /** The day it came off, or null when it came out of the pool. */
  from: number | null;
  /** Where the flyer starts, in board coordinates. */
  top: number;
  height: number;
};

export function WeekBoard({
  dows,
  week,
  pool,
  dayLabel,
  restLabel,
  removeLabel,
  poolLabel,
  onSet,
  onScrub,
}: {
  dows: readonly number[];
  week: Record<number, string>;
  pool: readonly PoolItem[];
  dayLabel: (dow: number) => string;
  restLabel: string;
  removeLabel: string;
  /** Heads the pool. Drawn here rather than by the step, because it belongs to
      the half of the board it labels and must not drift away from it. */
  poolLabel: string;
  onSet: (dow: number, rid: string | null) => void;
  onScrub: (on: boolean) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s } = useStore();

  const [grab, setGrab] = useState<Grab | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [dy] = useState(() => new Animated.Value(0));

  // Written only from layout and gesture callbacks, never during render.
  const board = useRef<View>(null);
  const boardY = useRef(0);
  const dayRefs = useRef<Record<number, View | null>>({});
  const dayRects = useRef<Record<number, { top: number; bottom: number }>>({});
  // Where the grabbed row was, in window coordinates — converted to board ones
  // at `onStart`, by which point both measurements have landed.
  const srcRect = useRef({ top: 0, height: 0 });
  /**
   * What separates the two coordinate spaces in play, measured rather than
   * assumed.
   *
   * `measureInWindow` and a gesture's `absoluteY` do not share an origin on
   * Android — the touch space counts from the physical top of the display where
   * the measured one counts from the window's content, and under edge-to-edge
   * those differ by the status bar. Nothing in either API states the gap, so it
   * is read off the one thing that exists in both spaces at once: the row under
   * the finger, whose top is `absoluteY - y` in touch coordinates and
   * `srcRect.top` in measured ones. Everything else is compared through it.
   */
  const skew = useRef(0);
  // The live grab, for the gesture callbacks — reading it out of state inside
  // one would give them whatever the closure captured when the row rendered.
  const live = useRef<Grab | null>(null);
  const overRef = useRef<number | null>(null);
  const poolRefs = useRef<Record<string, View | null>>({});

  /** Measure the board and every day slot, in window coordinates. */
  const survey = () => {
    board.current?.measureInWindow((_x, y) => {
      boardY.current = y;
    });
    dows.forEach((d) => {
      dayRefs.current[d]?.measureInWindow((_x, y, _w, h) => {
        dayRects.current[d] = { top: y, bottom: y + h };
      });
    });
  };

  /** Which day slot the finger is over, if any. */
  const dayAt = (winY: number) => {
    for (const d of dows) {
      const r = dayRects.current[d];
      if (r && winY >= r.top && winY < r.bottom) return d;
    }
    return null;
  };

  const setOverTo = (d: number | null) => {
    if (overRef.current === d) return;
    overRef.current = d;
    setOver(d);
    // The quietest thing in the app, and the right weight: this fires once per
    // slot the finger crosses, which over seven rows is often.
    if (d != null && s.haptics) buzz.step();
  };

  const dragFor = (src: () => View | null, make: (at: { top: number; height: number }) => Grab) =>
    Gesture.Pan()
      .activateAfterLongPress(HOLD_MS)
      .runOnJS(true)
      // Touch-down, not activation: the hold is the measuring window, so by the
      // time the row lifts every rect is already in.
      .onBegin(() => {
        survey();
        src()?.measureInWindow((_x, y, _w, h) => {
          srcRect.current = { top: y, height: h };
        });
      })
      .onStart((e) => {
        skew.current = e.absoluteY - e.y - srcRect.current.top;
        const g = make({
          top: srcRect.current.top - boardY.current,
          height: srcRect.current.height,
        });
        live.current = g;
        overRef.current = g.from;
        dy.setValue(0);
        setGrab(g);
        setOver(g.from);
        onScrub(true);
        if (s.haptics) buzz.grab();
      })
      .onUpdate((e) => {
        if (!live.current) return;
        // In measured space, which is the space the rects and the board are in.
        const y = e.absoluteY - skew.current;
        dy.setValue(y - (live.current.top + boardY.current) - live.current.height / 2);
        setOverTo(dayAt(y));
      })
      .onEnd(() => {
        const g = live.current;
        if (!g) return;
        const to = overRef.current;
        // Dropped on a day: it lands there, and a day it was dragged off is
        // cleared first — one routine may sit on several days, but the row it
        // was picked up from must not keep a copy it looks like it lost.
        if (to != null) {
          if (g.from != null && g.from !== to) onSet(g.from, null);
          onSet(to, g.rid);
        } else if (g.from != null) {
          // Dragged off the week and let go of: that is how a day is cleared
          // with the same gesture that filled it.
          onSet(g.from, null);
        }
      })
      // Release and cancellation alike, so the scroll is never left off.
      .onFinalize(() => {
        live.current = null;
        overRef.current = null;
        setGrab(null);
        setOver(null);
        onScrub(false);
      });

  return (
    <View ref={board} collapsable={false}>
      <View style={styles.days}>
        {dows.map((dow) => {
          const rid = week[dow];
          const item = rid ? pool.find((p) => p.rid === rid) : undefined;
          // The slot it was lifted out of reads as empty while it is in the
          // air — the routine is under the thumb, not on the day any more.
          const lifted = grab?.from === dow;
          const filled = !!item && !lifted;
          const target = over === dow && !!grab;
          return (
            <View
              key={dow}
              ref={(r) => {
                dayRefs.current[dow] = r;
              }}
              collapsable={false}
              style={[styles.day, target && styles.dayTarget]}
            >
              <Text style={styles.dayName}>{dayLabel(dow)}</Text>
              {filled ? (
                <GestureDetector
                  gesture={dragFor(
                    () => dayRefs.current[dow],
                    (at) => ({ rid: item.rid, text: item.text, missing: item.missing, from: dow, ...at })
                  )}
                >
                  <View style={styles.dayGrab}>
                    <Text
                      style={[styles.dayRoutine, item.missing && missingName(c)]}
                      numberOfLines={1}
                    >
                      {item.text}
                    </Text>
                  </View>
                </GestureDetector>
              ) : (
                <Text style={styles.dayRest}>{restLabel}</Text>
              )}
              {filled && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={removeLabel}
                  hitSlop={slop}
                  onPress={() => onSet(dow, null)}
                  style={styles.clear}
                >
                  <Text style={styles.clearGlyph}>×</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <H6 style={styles.poolHead}>{poolLabel}</H6>
      <View style={styles.pool}>
        {pool.map((p) => (
          <GestureDetector
            key={p.rid}
            gesture={dragFor(
              () => poolRefs.current[p.rid],
              (at) => ({ rid: p.rid, text: p.text, missing: p.missing, from: null, ...at })
            )}
          >
            <View
              ref={(r) => {
                poolRefs.current[p.rid] = r;
              }}
              collapsable={false}
              style={[styles.poolRow, grab?.from === null && grab.rid === p.rid && styles.poolHeld]}
            >
              <GripIcon color={c.neutral700} />
              <Text style={[styles.poolName, p.missing && missingName(c)]} numberOfLines={1}>
                {p.text}
              </Text>
            </View>
          </GestureDetector>
        ))}
      </View>

      {/* The row in the air. A sibling of both lists rather than a child of
          either, so it can travel between them. */}
      {grab && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flyer,
            { top: grab.top, height: grab.height, transform: [{ translateY: dy }] },
          ]}
        >
          <Text style={[styles.flyerName, grab.missing && missingName(c)]} numberOfLines={1}>
            {grab.text}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const sheet = themed(() => ({
  days: { marginTop: 12 },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 40,
    paddingHorizontal: t.rowPadH,
    borderWidth: 1,
    // Named in the base style, not only when it flips: Android recomputes a
    // border's path effect inside a `borderStyle?.let`, so removing the style
    // is a no-op. See AGENTS.md.
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: radius.md,
  },
  dayTarget: { borderColor: color.accent, backgroundColor: wash.accent(8) },
  dayName: {
    width: 34,
    fontFamily: font.regular,
    fontSize: 11,
    letterSpacing: tracking(11, 0.08),
    color: color.neutral500,
  },
  dayGrab: { flex: 1, minWidth: 0, paddingVertical: 8 },
  dayRoutine: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  dayRest: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.neutral600 },
  clear: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  clearGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },

  poolHead: { marginTop: 22, marginBottom: 8, color: color.neutral500 },
  pool: { gap: 6 },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.divider,
  },
  /** The row it came out of, while it is in the air. */
  poolHeld: { opacity: 0.35 },
  poolName: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.text },

  flyer: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.accent,
    backgroundColor: color.surface,
    elevation: 4,
    zIndex: 3,
  },
  flyerName: { fontFamily: font.regular, fontSize: 13.5, color: color.accent },
}));
