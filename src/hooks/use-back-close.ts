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
 * Back is always consumed — an overlay is on screen, so the press belongs to
 * it and must not fall through to the navigator underneath. The live session
 * used to opt out of the callback with a `swallow` flag; it now has a real
 * back route (minimize, land on Today), so nothing needs one.
 */
export function useBackClose(onBack: () => void) {
  const cb = useRef(onBack);

  useEffect(() => {
    cb.current = onBack;
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cb.current();
      return true;
    });
    return () => sub.remove();
  }, []);
}
