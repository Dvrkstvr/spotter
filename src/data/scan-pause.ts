/**
 * When discovery steps aside — the arithmetic, with no radio in it.
 *
 * Google's guidance is that discovery is a heavy radio operation that raises
 * the odds of a connection breaking, and that stopping it does not stop Nearby
 * honouring a request for an endpoint already found. <BuddyRadio> used to scan
 * all the way through the Bluetooth connect, both accepts and both hellos —
 * its `active` only goes false at `trust` — so the most fragile seconds a link
 * has were spent with the radio at its busiest.
 *
 * Two halves, and they are separate because they answer separate questions.
 * `formingSet` knows *whether* a connection is forming; `scanFollower` knows
 * what to do to the scan about it. Pure like `superset.ts` and `tips.ts`:
 * events in, `start` and `stop` out, no store, no hooks and no native module —
 * which is what lets the interleavings be tested, since the two phones they
 * happen on cannot be.
 */

/**
 * How long the scan waits before it actually stops for a request. Nearby turns
 * some requests down out of hand — an endpoint it no longer knows, a link it
 * already holds — without touching a radio, and that answer is back well
 * inside this. Stopping and restarting discovery around each of them would be
 * the heavy operation the pause exists to avoid, paid once per refusal, which
 * under the reconnect ticker is every five seconds. A real attempt takes
 * seconds: it loses a beat of quiet and nothing else.
 */
export const PAUSE_GRACE_MS = 400;
/**
 * The shortest a pause lasts once it has landed, because the restart is the
 * expensive half. Android throttles an app that starts more than five
 * Bluetooth scans in thirty seconds; whether Nearby's count against that is
 * not something its documentation says, and six seconds apart keeps the
 * question from mattering.
 */
export const QUIET_MS = 6000;
/**
 * The longest one forming connection may hold the scan with no news of it. A
 * backstop and not a handshake deadline — it tears nothing down. It exists
 * because a pause nothing ends is a phone that sees nobody, which would be one
 * more state only a restart clears. Long enough for a Bluetooth connection and
 * an unhurried look at a pairing code; every step the connection takes starts
 * it again.
 */
export const FORMING_MS = 30000;

/**
 * What became of a connection request, as far as the call itself can say.
 * `out` is the request leaving; `took` is Nearby accepting it, so a connection
 * is forming and the lifecycle events take over from here; `refused` is Nearby
 * turning it down, which no lifecycle event follows — `onConnectionFailed` is
 * only ever about a connection that was offered first.
 */
export type RequestEvent = { endpointId: string; state: 'out' | 'took' | 'refused' };

/** What the forming set asks of the scan. Both only say what is wanted. */
export type Scan = { pause(): void; resume(): void };

type Forming = { pending: number; live: boolean; timer: ReturnType<typeof setTimeout> };

/**
 * Connections still forming, by endpoint: requested or offered, and not yet
 * trusted, failed or dropped. While there is one, the scan is paused.
 *
 * `pending` counts requests Nearby has not answered yet and `live` says it has
 * acknowledged a connection, so a *second* request being refused — the ticker
 * asking again while the first attempt is still forming — cannot release a
 * pause the first one is still owed.
 */
export function formingSet(onLapse: (endpointId: string) => void = () => {}) {
  const held = new Map<string, Forming>();
  let scan: Scan | null = null;

  const lapse = (endpointId: string) =>
    setTimeout(() => {
      onLapse(endpointId);
      release(endpointId);
    }, FORMING_MS);

  // A connection to this endpoint took a step. The first one quiets the scan;
  // every later one only starts the backstop again. A repeat *request* is
  // counted and is not a step — the ticker asking again every five seconds
  // must not be able to hold the scan off for ever.
  const hold = (endpointId: string, asked = false) => {
    const was = held.get(endpointId);
    if (was) {
      if (asked) {
        was.pending += 1;
        return;
      }
      clearTimeout(was.timer);
      was.live = true;
      was.timer = lapse(endpointId);
      return;
    }
    held.set(endpointId, { pending: asked ? 1 : 0, live: !asked, timer: lapse(endpointId) });
    if (held.size === 1) scan?.pause();
  };

  // It is over, either way. `resume` is false in exactly one place, `trust`,
  // where the link is about to turn the radio off altogether: restarting the
  // scan for the one render before it is stopped again would be the very
  // noise this keeps off a link that has only just formed.
  //
  // Everywhere else it resumes whether or not there was a hold to let go of,
  // and that is deliberate. A link trusted and dropped again inside one render
  // never shows the radio as off, so nothing restarts it, and the pause
  // `trust` left standing would have nothing to end it. Asking for what is
  // already so costs nothing: the follower compares before it acts.
  const release = (endpointId: string, resume = true) => {
    const was = held.get(endpointId);
    if (was) {
      clearTimeout(was.timer);
      held.delete(endpointId);
    }
    if (resume && held.size === 0) scan?.resume();
  };

  return {
    hold: (endpointId: string) => hold(endpointId),
    release,
    /**
     * A request, from wherever one is made. A refusal releases only a pause
     * nothing else is owed: no connection acknowledged, no other request
     * still out.
     */
    request: (e: RequestEvent) => {
      if (e.state === 'out') {
        hold(e.endpointId, true);
        return;
      }
      const was = held.get(e.endpointId);
      if (!was) return;
      was.pending -= 1;
      if (e.state === 'took') was.live = true;
      else if (!was.live && was.pending <= 0) release(e.endpointId);
    },
    /** The scan to steer, or null while the radio is not running. */
    attach: (to: Scan | null) => {
      scan = to;
    },
    /** True while anything is forming — what a scan starting up has to ask. */
    any: () => held.size > 0,
    clear: () => {
      held.forEach((f) => clearTimeout(f.timer));
      held.clear();
    },
  };
}

/**
 * The scan, following what is wanted of it.
 *
 * A pause and a resume only ever say what is wanted; `follow` is the one
 * place the radio is told. So however the two interleave there is one writer,
 * the calls leave in the order they were decided — and the native module runs
 * them in the order they leave — and a stop is never followed by a stop.
 *
 * `start` is handed `still`, which goes false the moment that start has been
 * overtaken: the radio retries a refused start every five seconds, and a retry
 * that has been paused over since must not come back and restart the scan
 * under a forming connection.
 */
export function scanFollower(
  io: { start(still: () => boolean): void; stop(): void },
  wanted: boolean
) {
  let want = wanted;
  let on = false;
  // Nothing is asked of the radio before the permissions are in — a resume
  // included.
  let open = false;
  let run = 0;
  let stoppedAt = 0;
  let due: ReturnType<typeof setTimeout> | null = null;

  const follow = () => {
    due = null;
    if (!open || want === on) return;
    on = want;
    run += 1;
    if (want) {
      const mine = run;
      io.start(() => open && mine === run);
    } else {
      stoppedAt = Date.now();
      io.stop();
    }
  };
  // With nothing to wait out there is nothing to schedule — the scan is told
  // in the same breath it was decided in.
  const plan = (ms: number) => {
    if (due) clearTimeout(due);
    if (ms <= 0) follow();
    else due = setTimeout(follow, ms);
  };

  return {
    pause: () => {
      want = false;
      plan(PAUSE_GRACE_MS);
    },
    resume: () => {
      want = true;
      plan(Math.max(0, stoppedAt + QUIET_MS - Date.now()));
    },
    /** The permissions are in: start, unless something is already forming. */
    open: () => {
      open = true;
      follow();
    },
    /** The radio is going down. Whatever was planned is not going to happen. */
    close: () => {
      open = false;
      if (due) clearTimeout(due);
      due = null;
    },
  };
}
