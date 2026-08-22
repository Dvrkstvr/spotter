/**
 * Hold a row, move it, let go. One drag grammar for every reorderable list in
 * the app — the Settings lists, the routine editor's rows, the co-draft's, and
 * the session overview's stops.
 *
 * They used to be four hand-rolled `PanResponder`s on a 20px grip, each with
 * its own copy of the same landing arithmetic and each described in its own
 * comment as "the ReorderRows pattern". This is that pattern, actually made one
 * thing — and converted to the gesture the week board introduced: **hold, then
 * move**. Calvin's call, and the reason is that a grip is a control you have to
 * be told about, where a row you can pick up by holding it anywhere is the
 * gesture a phone already teaches everywhere else. One grammar beats two.
 *
 * **The number drag is the stated exception, and it is not an inconsistency —
 * it is the same trade decided the other way.** A number cell buys its
 * immediacy by giving up the scroll *on that cell*: it is a 74px target in a
 * row that is mostly not cells, so the list is still scrollable from
 * everywhere else. These are full-width rows with nothing beside them, so an
 * immediate grab would cost the screen its scroll outright. `HOLD_MS` is what
 * buys it back, and the lift plus `buzz.grab` is what says the hold landed.
 *
 * ## What the row is measured against
 *
 * The offset is `translationY` — the finger's travel from where it came down,
 * which is the only space a reorder needs. That is why nothing here measures a
 * window rect, and therefore why the week board's `skew` has no twin in this
 * file: `skew` reconciles a gesture's `absoluteY` with `measureInWindow`, two
 * spaces that differ by the status bar under edge-to-edge, and the week board
 * enters both because a routine travels between two *different* lists. A
 * reorder never leaves its own list, so it never leaves relative space. If this
 * primitive ever grows absolute hit-testing — auto-scroll at the edges, or the
 * week board folded in — the calibration to copy is that one, read off the row
 * under the finger. Never a status-bar constant.
 *
 * **Pitch is measured per row, always.** Two of the four lists used to assume
 * every row was as tall as the first one, which is true of theirs and false of
 * the other two: a superset pair's block is taller than a lone stop, and the
 * routine editor's slot carries its pair gap along inside it. A uniform pitch
 * lands a long drag rows away from the line it drew, so the landing walks the
 * real heights outward from the row in hand. Measuring what is there is also
 * what the uniform lists were already doing, so nothing about them changes.
 *
 * ## The guard
 *
 * A row full of controls has to stay a row full of controls. Two kinds are safe
 * by construction and one is not:
 *
 * - A `TextInput` guards itself. Android's `ReactEditText` answers every
 *   ACTION_DOWN with `requestDisallowInterceptTouchEvent(true)`, which cancels
 *   every handler in the gesture orchestrator — so a hold that starts on a
 *   label or a kg cell never grabs the row, which is the right answer anyway.
 *   (The same fact the number cell had to fight; here it works for us.)
 * - A tap — the pair gutter, the overview's jump — is over long before the hold
 *   lands, and holding one was never how it was fired.
 * - **A `HoldBtn` is neither.** Its own hold runs for 700ms, so a 220ms grab
 *   would take the touch off it every time and nothing could be deleted from
 *   inside a list that reorders. So a pressed `HoldBtn` claims the touch
 *   through `useDragGuard` and the list stands its gesture down until the press
 *   is over. Declared by the control rather than arranged in the gesture graph,
 *   because the control is the thing that knows.
 */
import { createContext, ReactNode, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleProp, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { buzz } from '@/data/haptics';
import { useColors } from '@/design/theme';
import { useStore } from '@/store/workout-store';

/**
 * How long a finger has to stay put before it owns the row.
 *
 * Long enough that a scroll never grabs one by accident, short enough that it
 * doesn't read as a wait — and the row lifting under the thumb is the answer,
 * so the hold is never silent.
 */
export const HOLD_MS = 220;

/**
 * A row's height before it has laid out. Only ever read on the frame before the
 * first `onLayout` lands, which is many frames before a finger can have held
 * anything — it is here so the arithmetic always has a number, not because the
 * number is ever the answer.
 */
const ROW_ESTIMATE = 48;

/** What a control does to say a touch is its own. */
export type DragGuard = { take: () => void; give: () => void };

const GuardCtx = createContext<DragGuard | null>(null);

/**
 * For a control that lives inside a draggable row and holds the finger longer
 * than the grab does. Null outside a list, so every other call site is a no-op
 * and nothing has to know whether it is in one.
 */
export const useDragGuard = () => useContext(GuardCtx);

/** What a row needs to know about itself while a drag is running. */
export type DragRowState = {
  /** This row is the one in the air. */
  held: boolean;
  /** The landing line sits on this row's top edge. */
  target: boolean;
};

export function DragList({
  count,
  keyOf,
  rowStyle,
  liftStyle,
  gap = 0,
  enabled = true,
  style,
  onReorder,
  onScrub,
  children,
}: {
  count: number;
  /** Stable per row, like any list key. */
  keyOf: (i: number) => string;
  /** The row's own style. The landing line and the lift are added to it. */
  rowStyle?: (i: number) => StyleProp<ViewStyle>;
  /**
   * What a row wears while it is in the air — in practice the surface's own
   * colour, so the row in flight covers what it slides over instead of printing
   * through it.
   */
  liftStyle?: StyleProp<ViewStyle>;
  /** The space between rows. It is part of a row's pitch, so it is stated. */
  gap?: number;
  /** On top of the standing rule that a list of one has nowhere to drag to. */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onReorder: (from: number, to: number) => void;
  /** Told while a drag owns the finger, so the scroller around it can stand down. */
  onScrub?: (on: boolean) => void;
  children: (i: number, d: DragRowState) => ReactNode;
}) {
  const c = useColors();
  const { s } = useStore();

  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [dy] = useState(() => new Animated.Value(0));

  // Written from layout and gesture callbacks, never during render.
  const heights = useRef<number[]>([]);
  const from = useRef<number | null>(null);
  const to = useRef(0);

  const guard = useMemo<DragGuard>(
    () => ({ take: () => setBlocked(true), give: () => setBlocked(false) }),
    []
  );

  const pitch = (n: number) => (heights.current[n] ?? ROW_ESTIMATE) + gap;
  /** Which row the one in hand has been carried onto, by the real heights. */
  const landing = (start: number, offset: number) => {
    let n = start;
    let acc = 0;
    if (offset > 0)
      while (n < count - 1 && offset > acc + pitch(n + 1) / 2) {
        acc += pitch(n + 1);
        n++;
      }
    else
      while (n > 0 && -offset > acc + pitch(n - 1) / 2) {
        acc += pitch(n - 1);
        n--;
      }
    return n;
  };

  // A list of one has nowhere to drag to, so it never arms — the same reason
  // the sites that can be one row long draw no grip on it.
  const armed = enabled && !blocked && count > 1;

  // Rebuilt every render, so the closures always see the current rows and the
  // current heights.
  const dragFor = (start: number) =>
    Gesture.Pan()
      .enabled(armed)
      .activateAfterLongPress(HOLD_MS)
      .runOnJS(true)
      .onStart(() => {
        from.current = start;
        to.current = start;
        dy.setValue(0);
        setDrag({ from: start, to: start });
        onScrub?.(true);
        // The hold landing, at the same weight as a ticked set: it is the app
        // saying it read you, and your thumb is on top of the row that lifted.
        if (s.haptics) buzz.grab();
      })
      .onUpdate((e) => {
        if (from.current == null) return;
        dy.setValue(e.translationY);
        const next = landing(start, e.translationY);
        if (next === to.current) return;
        to.current = next;
        setDrag((d) => (d ? { ...d, to: next } : d));
        // Once per line the row crosses, which over a long list is often — so
        // the quietest thing in the vocabulary.
        if (s.haptics) buzz.step();
      })
      .onEnd(() => {
        if (from.current == null) return;
        if (to.current !== start) onReorder(start, to.current);
      })
      // Release and cancellation alike, so the scroll is never left off.
      .onFinalize(() => {
        from.current = null;
        dy.setValue(0);
        setDrag(null);
        onScrub?.(false);
      });

  return (
    <GuardCtx.Provider value={guard}>
      <View style={[style, gap ? { gap } : null]}>
        {Array.from({ length: count }, (_, i) => {
          const held = drag?.from === i;
          const target = !!drag && drag.to === i && drag.from !== i;
          return (
            <GestureDetector key={keyOf(i)} gesture={dragFor(i)}>
              <Animated.View
                onLayout={(e) => {
                  heights.current[i] = e.nativeEvent.layout.height;
                }}
                style={[
                  rowStyle?.(i),
                  { borderTopColor: target ? c.accent : 'transparent' },
                  held && { transform: [{ translateY: dy }], zIndex: 2, elevation: 2 },
                  held && liftStyle,
                ]}
              >
                {children(i, { held, target })}
              </Animated.View>
            </GestureDetector>
          );
        })}
      </View>
    </GuardCtx.Provider>
  );
}
