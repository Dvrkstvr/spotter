/**
 * The number-drag gesture, and the picture that teaches it.
 *
 * Touch a figure and slide up or down to step it. This is the app's one
 * genuinely invisible control and its most carefully tuned one, so it lives
 * here rather than being written twice: the session's set rows use it, and so
 * does the setup tour's profile step, which is where a first-run user now meets
 * it — on three fields where a wrong number costs nothing, before it matters on
 * a set. What each site keeps for itself is the *drawing*; what it takes from
 * here is the physics, the trap below, and the demo.
 *
 * **The finger must never land on the `TextInput`, or there is no gesture at
 * all.** Android's `ReactEditText.onTouchEvent` answers every ACTION_DOWN with
 * `parent.requestDisallowInterceptTouchEvent(true)`, which walks up to
 * `GestureHandlerRootView` — and gesture-handler reads that as a native view
 * claiming the touch, so its root helper cancels *every* handler in the
 * orchestrator on the spot. A pan still waiting on its `GRAB_Y` is already dead
 * by the time the finger has moved that far. So every caller must draw the
 * field inside a `pointerEvents="box-only"` wrapper, **focused or not**:
 * `ReactViewGroup` intercepts the touch natively, the editor below never sees a
 * DOWN, and nothing cancels anything. (It is also why a `PanResponder` can't do
 * the job — same disallow, one layer up.)
 *
 * The other half of that trap is the scroll view above it: under
 * `keyboardShouldPersistTaps="handled"` a ScrollView grabs any touch that isn't
 * already a responder so it can dismiss the keyboard, and grabbing it means
 * `setJSResponder` with the native responder blocked — which gesture-handler
 * also answers by cancelling everything it owns. Every list that holds one of
 * these is `"always"` for that reason, and hands the tap-away back through the
 * cell's own second tap.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { buzz } from '@/data/haptics';
import { themed, useThemed } from '@/design/theme';
import { color, fill as absFill, font, motion, radius, wash } from '@/design/tokens';
import { fmt, num, useStore } from '@/store/workout-store';

/**
 * `GRAB_Y` is a dead zone rather than a wait — small enough that touch-and-
 * slide reads as immediate, big enough that a tap with a shaky thumb still
 * opens the keyboard rather than nudging the figure. It also sits under
 * Android's own scroll slop, so the pan activates and cancels the native touch
 * *before* the ScrollView would have claimed it; a larger one would race the
 * list rather than beat it. `GIVE_X` fails the pan on a sideways drag, which is
 * what leaves the session's swipe between exercises alone.
 */
export const GRAB_Y = 4;
export const GIVE_X = 12;
/**
 * Vertical travel per step while dragging a number, at the speeds a finger
 * moves at when it is aiming at a figure. There are two of them because the
 * two columns are not equally easy to overshoot: half a kilo is a small enough
 * fact that 12px of travel per step still lands where you meant, where a whole
 * rep on the same distance turns a careful nudge into a lottery. A rep is the
 * bigger unit, so it costs more finger.
 */
export const PX_PER_STEP = 12;
export const PX_PER_REP = 20;
/**
 * How much more a pixel is worth in a sweep than in a nudge. Below `SLOW_V`
 * the travel above is exactly what it says; from there the gain climbs to
 * `MAX_GAIN` at `FAST_V`, and quadratically rather than linearly so that an
 * ordinary careful drag stays at 1x and only a deliberate sweep multiplies.
 * The point is that plus-twenty-kilos costs one gesture instead of 480px of
 * travel, not that every drag becomes approximate.
 */
const SLOW_V = 250;
const FAST_V = 2200;
const MAX_GAIN = 6;
/**
 * Momentum. Releasing above `FLING_V` keeps the figure stepping, launched at
 * whatever the pointer had *over* that threshold — so the glide grows from
 * nothing at the line instead of jumping at it — and decaying with
 * `GLIDE_TAU`, which puts its whole travel at roughly `v0 × GLIDE_TAU`. It
 * ends under `GLIDE_MIN` steps a second, at the clamp, or the moment the cell
 * is touched again.
 *
 * These are gesture physics rather than motion: `motion.*` is for the
 * animations a screen plays at you, where this is the arithmetic of a control
 * under your own thumb — the same reason the travels above are local constants.
 */
const FLING_V = 800;
const GLIDE_TAU = 0.15;
const GLIDE_MIN = 2;
/** How many steps the drag demo travels — three, so its figure moves three times. */
const DEMO_STEPS = 3;

/**
 * What one pixel of drag is worth right now, as a multiple of the cell's own
 * travel. Pure and argument-taking, so the React Compiler is welcome to hoist
 * it.
 */
const gainAt = (v: number) => {
  const t = Math.min(1, Math.max(0, (Math.abs(v) - SLOW_V) / (FAST_V - SLOW_V)));
  return 1 + (MAX_GAIN - 1) * t * t;
};

/**
 * The gesture pair for one draggable figure: the pan that scrubs it and the
 * tap that races the pan for the keyboard.
 *
 * `onTapToggle` is what the tap does — focus the field, or blur it when it is
 * already focused. That second tap is the way out of the keyboard that doesn't
 * commit anything, and it is the tap-away the surrounding list gave up (see the
 * module note).
 */
export function useNumberDrag({
  value,
  ghost,
  step,
  px,
  onText,
  onScrub,
  onTapToggle,
}: {
  value: string;
  /** last time's figure — where a drag starts from when the cell is empty */
  ghost: string;
  step: number;
  /** travel per step at aiming speed — `PX_PER_STEP` or the coarser `PX_PER_REP` */
  px: number;
  onText: (v: string) => void;
  onScrub: (on: boolean) => void;
  onTapToggle: () => void;
}) {
  const { s, tipDone } = useStore();
  const [dragging, setDragging] = useState(false);
  // The figure the drag is on before it is rounded to the step grid, and the
  // last text this cell wrote. Both touched only from gesture and animation
  // callbacks, never while rendering.
  const raw = useRef(0);
  const last = useRef('');
  // Where the last frame's finger was. The drag integrates frame by frame
  // rather than mapping the gesture's total travel, because a pixel is worth
  // different amounts at different speeds.
  const lastY = useRef(0);
  // Whether the drag under way has ever moved the figure.
  const stepped = useRef(false);
  // The glide: its frame handle, what speed is left in it (units a second),
  // and the timestamp of the frame it last integrated.
  const raf = useRef<number | null>(null);
  const vel = useRef(0);
  const at = useRef(0);
  // Whether the touch under way began by catching a glide — in which case it
  // has already said its piece and must not also open the keyboard on the way
  // up. Written once per touch, in the pan's `onBegin`.
  const caught = useRef(false);

  // A glide outliving the cell would step a figure into a screen that has moved
  // on. Nothing else has to cancel it: every other way one ends goes through
  // `stopGlide`.
  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    []
  );

  /**
   * Put `raw` in the cell, but only when the figure on the step grid actually
   * changes — which is once per `px` of slow travel rather than once per frame,
   * and never while the clamp at zero is holding it still. That is what keeps a
   * buzz meaning "the number moved", and it also stops a drag writing to the
   * store sixty times a second. Answers whether it wrote.
   */
  const emit = () => {
    const next = fmt(Math.round(raw.current / step) * step);
    if (next === last.current) return false;
    last.current = next;
    stepped.current = true;
    onText(next);
    // You have done the thing, so the hint about it is finished — from the
    // gesture rather than from a button, which is the whole dismissal model.
    // Idempotent, so firing it on every step of every drag forever is free.
    tipDone('drag');
    return true;
  };

  /** Answers whether there was one, which is what makes the touch that ended it count. */
  const stopGlide = () => {
    if (raf.current == null) return false;
    cancelAnimationFrame(raf.current);
    raf.current = null;
    vel.current = 0;
    return true;
  };

  // The momentum frame. It deliberately does not buzz: `buzz.step` reports a
  // figure moving under your finger, and by now your finger is off the glass —
  // what the glide has instead is the number itself, which you are watching.
  const glide = (now: number) => {
    // First frame only records the clock; a stalled one is capped rather than
    // integrated whole, or coming back from a dropped frame would jump.
    const dt = at.current === 0 ? 0 : Math.min(0.064, (now - at.current) / 1000);
    at.current = now;
    raw.current = Math.max(0, raw.current + vel.current * dt);
    emit();
    vel.current *= Math.exp(-dt / GLIDE_TAU);
    // There is nothing below zero to coast into, so a downward glide ends at
    // the clamp instead of running its decay out against it.
    if (raw.current === 0 && vel.current < 0) vel.current = 0;
    if (Math.abs(vel.current) < GLIDE_MIN * step) {
      raf.current = null;
      return;
    }
    raf.current = requestAnimationFrame(glide);
  };

  // `runOnJS` because every callback here talks to React state and the store —
  // none of them are worklets, and babel-preset-expo would otherwise hand them
  // to the UI thread.
  const drag = Gesture.Pan()
    // Touch and slide, with no hold in front of it: the cell is taken after
    // `GRAB_Y` of vertical travel, and handed back after `GIVE_X` of sideways.
    .activeOffsetY([-GRAB_Y, GRAB_Y])
    .failOffsetX([-GIVE_X, GIVE_X])
    .runOnJS(true)
    // Touching the cell catches a glide, the way a finger on a scrolling list
    // stops it. `onBegin` fires on touch-down whether or not the pan goes on to
    // activate, which is what makes it the one writer of `caught` — the tap
    // below and the release above both only read it.
    .onBegin(() => {
      caught.current = stopGlide();
    })
    .onStart(() => {
      // An empty cell starts from last time's figure, which is what it's
      // showing as its placeholder.
      raw.current = num(value, num(ghost, 0));
      last.current = fmt(raw.current);
      lastY.current = 0;
      stepped.current = false;
      setDragging(true);
      onScrub(true);
      if (s.haptics) buzz.grab();
    })
    .onUpdate((g) => {
      const dy = g.translationY - lastY.current;
      lastY.current = g.translationY;
      // Up is more. This frame's pixels are worth `step` per `px` at aiming
      // speed and up to `MAX_GAIN` of that in a sweep — the gain is read per
      // frame, so one gesture can sweep and then settle.
      raw.current = Math.max(0, raw.current - (dy / px) * gainAt(g.velocityY) * step);
      if (emit() && s.haptics) buzz.step();
    })
    .onEnd((g, success) => {
      if (!success) return;
      // Let go while still moving and the figure carries on. Launched at what
      // was left over `FLING_V` rather than at the whole velocity, so the glide
      // grows from nothing at the threshold instead of jumping at it, and at
      // the pointer's own speed rather than the gained one — the sweep has
      // already been paid for in travel, and multiplying it twice is how a
      // flick lands 60 kg away from where you were looking.
      if (stepped.current) {
        const over = Math.abs(g.velocityY) - FLING_V;
        if (over <= 0) return;
        vel.current = -Math.sign(g.velocityY) * (over / px) * step;
        at.current = 0;
        raf.current = requestAnimationFrame(glide);
        return;
      }
      // A touch that took the cell, went nowhere and was released is a tap with
      // a shaky thumb, and gets what a tap gets. That is what lets `GRAB_Y` be
      // as small as it is: crossing it by accident costs you nothing. `onEnd`
      // rather than `onFinalize` — a cancelled gesture is not a tap — and the
      // travel test as well as `stepped`, because a long drag down against the
      // clamp at zero emits no step either.
      if (caught.current) return;
      if (Math.abs(g.translationY) < px) onTapToggle();
    })
    // Fires on release and on cancellation alike, so the list can never be
    // left unscrollable.
    .onFinalize(() => {
      setDragging(false);
      onScrub(false);
    });

  // Racing rather than waiting on the pan: a tap that never travelled `GRAB_Y`
  // never let the pan activate, so whichever the finger meant has already been
  // decided by the time either could fire.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      if (!caught.current) onTapToggle();
    });

  return { gesture: Gesture.Race(drag, tap), dragging };
}

/**
 * The `drag` hint's demonstration — the only tip that gets one, because words
 * teach a tap and cannot teach a slide that isn't a scroll.
 *
 * It writes nothing. It is a pointer and a figure on an overlay above the cell
 * — `pointerEvents: 'none'`, no synthetic touches, and nothing written to the
 * store — so what it costs is nothing.
 *
 * **Every number in it is the real one.** The travel is three times the cell's
 * own `px`, so the figure steps three times, and it begins the moment the
 * pointer lands because that is now when a real one begins. It scrubs at 1x on
 * purpose, which is the honest speed for a pointer moving as unhurriedly as
 * this one — the gain is something a real finger finds the moment it sweeps. A
 * demo that swept 60 to 100 in one gesture would be teaching a gesture this app
 * does not have. (`base` is the cell's own figure where it has one. The tour's
 * profile fields are empty on a first run, so there it is a stated starting
 * figure rather than a reading — the one place this picture invents its number,
 * and it is drawn over a field it never writes to.)
 *
 * Deliberately **not** on the native driver: the figure is text, which no
 * driver can animate, so the pointer and the number it is dragging share one
 * JS-side clock instead of drifting apart on two. It is two small views for
 * two passes, which is what makes that affordable.
 *
 * It does not buzz. `buzz.grab` reports that your finger took the cell, and
 * firing it because a picture of a finger did would make the buzz mean two
 * things. The ring is that moment drawn instead, so the real one is expected
 * rather than surprising.
 */
export function DragDemo({
  width,
  step,
  px,
  base,
  size = 22,
  lane,
}: {
  width: number;
  step: number;
  px: number;
  base: number;
  /** The host cell's own figure size, so the picture reads as that cell. */
  size?: number;
  /** Where the lane sits: the session's cell column, or a profile row's field. */
  lane?: { left?: number; right?: number };
}) {
  const styles = useThemed(sheet);
  const [fade] = useState(() => new Animated.Value(0));
  const [travel] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    const id = travel.addListener(({ value }) => {
      const n = Math.min(DEMO_STEPS, Math.max(0, Math.round(-value / px)));
      setSteps((cur) => (cur === n ? cur : n));
    });
    const pass = Animated.sequence([
      Animated.timing(travel, { toValue: 0, duration: 0, useNativeDriver: false }),
      Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: false }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 240,
        easing: motion.quick.easing,
        useNativeDriver: false,
      }),
      // The ring blooms *while* the figure is already moving, rather than
      // before it. The gesture has no wait in it any more, and a demo that
      // pauses on the touch teaches one that isn't there.
      Animated.parallel([
        Animated.timing(ring, {
          toValue: 1,
          duration: 340,
          easing: motion.tap.easing,
          useNativeDriver: false,
        }),
        Animated.timing(travel, {
          toValue: -DEMO_STEPS * px,
          duration: 900,
          easing: motion.move.easing,
          useNativeDriver: false,
        }),
      ]),
      Animated.delay(700),
      Animated.timing(fade, {
        toValue: 0,
        duration: 260,
        easing: motion.quick.easing,
        useNativeDriver: false,
      }),
      Animated.delay(600),
    ]);
    // Twice and then done. A hint that loops for the length of a workout is
    // the furniture this whole feature is trying not to become.
    const loop = Animated.loop(pass, { iterations: 2 });
    loop.start();
    return () => {
      loop.stop();
      travel.removeListener(id);
    };
  }, [fade, travel, ring, px]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.demoLane, lane ?? { left: 98 }, { width, opacity: fade }]}
    >
      {/* The cell, mid-drag. Opaque and clipped, so the figure it is scrubbing
          reads as the cell's own rather than doubled over the real value. */}
      <View style={styles.demoBox}>
        <Text style={[styles.demoNum, { fontSize: size }]}>{fmt(base + steps * step)}</Text>
      </View>
      {/* The finger, and a sibling of the box rather than a child of it: a
          real drag carries it up out of the cell, and clipping it at the
          border would draw a gesture that stops where the control does. */}
      <Animated.View style={[styles.demoPtr, { transform: [{ translateY: travel }] }]}>
        <Animated.View
          style={[
            styles.demoRing,
            {
              opacity: ring.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.9, 0] }),
              transform: [
                { scale: ring.interpolate({ inputRange: [0, 0.25, 1], outputRange: [1.7, 1, 1.6] }) },
              ],
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const sheet = themed(() => ({
  demoLane: { position: 'absolute', top: 0, bottom: 0 },
  /** Wearing the dragging cell's own accent edge, because that is the state
      being demonstrated: this is what the cell looks like under a finger. */
  demoBox: {
    ...absFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  /** The scrubbed figure, at the live cell's own size so it reads as the cell. */
  demoNum: {
    fontFamily: font.regular,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  demoPtr: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: wash.text(34),
    backgroundColor: wash.text(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoRing: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: -6,
    bottom: -6,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: color.accent,
  },
}));
