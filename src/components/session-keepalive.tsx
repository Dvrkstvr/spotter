/**
 * Runs the foreground service for exactly as long as a session is live —
 * mounted in <Overlays> beside <RestAlarm>, outside <SessionOverlay> (which
 * unmounts on `sessionMin`) and outside the `social` gate (a solo workout
 * deserves its notification too). Renders nothing.
 *
 * The service is started on every input change rather than tracked: repeated
 * starts re-post the same notification id, which is how the title, a language
 * switch and the wakelock follow state. `keepAwake` is the one judged input —
 * the CPU is kept on only while the buddy half needs the radio breathing
 * (a suspended JS thread can't broadcast progress or heal a dropped link),
 * because for a solo session the clock is wall-anchored and the rest alarm is
 * already Android's, so the battery would buy nothing.
 */
import { useEffect, useRef } from 'react';

import { startSessionService, stopSessionService } from '@/data/session-service';
import { useStore } from '@/store/workout-store';

export function SessionKeepalive() {
  const { s, L } = useStore();

  const hasSession = s.session !== null;
  const title = s.session?.name ?? '';
  // The pairing, not just the shared session: a healed link that hasn't been
  // re-joined yet still needs the radio alive to stay healed.
  const keepAwake = hasSession && (s.sessionShared || s.buddy !== null);

  // The session clock, readable inside the start effect without joining its
  // deps — the elapsed tick must not re-post the notification every second.
  // The chronometer needs it once per start, as a wall anchor. Updated in an
  // effect, per the compiler.
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = s.elapsed;
  });

  useEffect(() => {
    if (!hasSession) return;
    // `elapsed` is wall-anchored, so now-minus-elapsed is the moment the
    // session began — the chronometer counts up from the same second the
    // in-app clock shows, across process deaths included.
    startSessionService(
      title,
      L.sessionOngoing,
      L.sessionChannel,
      Date.now() - elapsedRef.current * 1000,
      keepAwake
    );
  }, [hasSession, title, keepAwake, L.sessionOngoing, L.sessionChannel]);

  // Stopping is its own effect rather than the starter's cleanup: a cleanup
  // runs on every dep change, and a keepAwake flip must re-post the
  // notification, not tear the service down and re-create it.
  useEffect(() => {
    if (!hasSession) stopSessionService();
  }, [hasSession]);
  useEffect(() => stopSessionService, []);

  return null;
}
