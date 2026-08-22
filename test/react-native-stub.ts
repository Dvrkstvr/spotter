/**
 * The one native thing a pure module drags in, stubbed.
 *
 * `filterPersisted` asks `design/tokens` whether a stored theme name is a real
 * one, and `tokens` builds its `motion` table out of React Native's `Easing`
 * at module scope — so importing `data/migrate` evaluates that table. The
 * curves are never called here; nothing under test animates.
 *
 * Deliberately the only stub in the suite. A test setup that needs one per
 * native import rots the first time the code gains one, which is the reason
 * everything tested lives in `data/` and takes values rather than hooks.
 */
const curve = (t: number) => t;
const curved = () => curve;

export const Easing = {
  ease: curve,
  linear: curve,
  quad: curve,
  cubic: curve,
  sin: curve,
  circle: curve,
  exp: curve,
  bounce: curve,
  step0: curve,
  step1: curve,
  in: curved,
  out: curved,
  inOut: curved,
  back: curved,
  elastic: curved,
  poly: curved,
  bezier: curved,
};
