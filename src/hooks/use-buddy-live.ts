/**
 * The live co-session status, derived once for everyone who shows it: the
 * session overlay's buddy bar (minimal) and the Profile tab's session panel
 * (full detail). All advisory — nothing here ever blocks input.
 */
import { Strings } from '@/data/i18n';
import { useStore } from '@/store/workout-store';

export type BuddyLive = {
  /** one-line status, already localised and name-substituted */
  text: string;
  /** whose set is next (accent cue), when both are on the same exercise */
  turn: string | null;
  /** the turn is yours — the one cue worth the accent */
  mine: boolean;
  /** the exercise the turn hint applies to — the alternate/parallel chip's key */
  modeEx: string | null;
  /** their exercise is in my list too — one tap to reconverge */
  jump: { index: number; name: string } | null;
};

export function useBuddyLive(): BuddyLive | null {
  const { s, L, ex, exInfo, turnMode } = useStore();
  const session = s.session;

  if (!session || !s.sessionShared) return null;

  const nm = (v: keyof Strings) => L[v].replace('{name}', s.buddy ?? '');
  const line = (text: string): BuddyLive => ({
    text,
    turn: null,
    mine: false,
    modeEx: null,
    jump: null,
  });

  if (!s.buddyEndpoint) return line(nm('stLost'));
  if (s.buddyJoin === 'declined') return line(nm('stDeclined'));
  const bp = s.buddyProgress;
  // The host is genuinely waiting for an answer; the guest already answered
  // and is only waiting for the first broadcast to land.
  if (!bp || s.buddyJoin === 'pending')
    return line(nm(s.sessionRole === 'guest' ? 'stJoining' : 'stPending'));
  if (bp.finished) return line(nm('stFinished'));

  const myActiveEx = session.list[s.active]?.ex ?? null;

  if (bp.active && bp.active === myActiveEx) {
    const mySets = session.list[s.active].sets;
    const mine = mySets.filter((x) => x.done).length;
    const theirs = bp.list.find((e) => e.ex === bp.active);
    const theirDone = theirs?.done.filter(Boolean).length ?? 0;
    const theirAll = theirs?.done.length ?? 0;
    if (theirAll > 0 && theirDone >= theirAll) {
      // Both through the exercise — nobody is waiting on anybody, which is
      // what "{name} is waiting for you" used to claim in parallel mode.
      const iAmDone = mySets.length > 0 && mine >= mySets.length;
      return line(iAmDone ? L.stBothDone : nm('stWaiting'));
    }
    const mode = turnMode(bp.active);
    // Fewer completed sets goes next; ties go to the host.
    const yours = mine < theirDone || (mine === theirDone && s.sessionRole === 'host');
    const turn = mode === 'parallel' ? L.together : yours ? L.yourTurn : nm('theirTurn');
    return {
      text: `${theirDone}/${theirAll}`,
      turn,
      mine: mode === 'parallel' || yours,
      modeEx: bp.active,
      jump: null,
    };
  }

  if (bp.active) {
    const meta = ex(bp.active);
    const exName = meta ? exInfo(meta).text : bp.active;
    const myIndex = session.list.findIndex((e) => e.ex === bp.active);
    const prefix = myIndex >= 0 ? `${nm(myIndex > s.active ? 'stAhead' : 'stBehind')} · ` : '';
    return {
      text: `${prefix}${exName}`,
      turn: null,
      mine: false,
      modeEx: null,
      jump: myIndex >= 0 && myIndex !== s.active ? { index: myIndex, name: exName } : null,
    };
  }
  return line(nm('stPending'));
}
