import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/**
 * Close this overlay on the Android back button.
 *
 * BackHandler runs its listeners newest-first, so an overlay that mounts on top
 * of another automatically wins back — which is what the design's z-order
 * implies. Each overlay owns its own handler; there is no central back router.
 *
 * The callback is held in a ref, kept current by an effect, so the listener is
 * registered exactly once. Re-registering on every render would make whichever
 * overlay rendered last the newest listener, and the layering would break.
 *
 * Pass `swallow` for an overlay with no back route (the live session): back is
 * consumed so it cannot fall through, but nothing closes.
 */
export function useBackClose(onBack: () => void, { swallow = false } = {}) {
  const cb = useRef(onBack);

  useEffect(() => {
    cb.current = onBack;
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!swallow) cb.current();
      return true;
    });
    return () => sub.remove();
  }, [swallow]);
}
