/**
 * The discovery pause is tested as a sequence, because every bug it can have
 * is an interleaving: a stop that lands after the start meant to undo it, a
 * refusal releasing a pause somebody else is still owed, a pause that nothing
 * ever ends. The last of those is the one worth the most — a phone that has
 * stopped looking and will not start again is a state only a restart clears,
 * which is the class of bug this whole pass exists to remove.
 *
 * The radio is a list of the calls made to it, in order. That is the property:
 * the native module runs what it is handed in the order it is handed it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FORMING_MS, formingSet, PAUSE_GRACE_MS, QUIET_MS, scanFollower } from './scan-pause';

/** A radio that has been cleared to run, wired the way <BuddyRadio> wires it. */
function rig(opened = true) {
  const calls: string[] = [];
  const stills: (() => boolean)[] = [];
  const lapsed: string[] = [];
  const held = formingSet((id) => lapsed.push(id));
  const scan = scanFollower(
    {
      start: (still) => {
        calls.push('start');
        stills.push(still);
      },
      stop: () => calls.push('stop'),
    },
    !held.any()
  );
  held.attach(scan);
  if (opened) scan.open();
  return { calls, stills, lapsed, held, scan };
}

const out = (endpointId: string) => ({ endpointId, state: 'out' as const });
const took = (endpointId: string) => ({ endpointId, state: 'took' as const });
const refused = (endpointId: string) => ({ endpointId, state: 'refused' as const });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T18:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the pause', () => {
  it('starts discovery once the radio is cleared, and not before', () => {
    const { calls, scan } = rig(false);
    expect(calls).toEqual([]);
    scan.open();
    expect(calls).toEqual(['start']);
  });

  it('stops discovery a beat after a request goes out', () => {
    const { calls, held } = rig();
    held.request(out('AB12'));
    expect(calls).toEqual(['start']);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(calls).toEqual(['start', 'stop']);
  });

  it('stops for a connection offered by the other side', () => {
    const { calls, held } = rig();
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(calls).toEqual(['start', 'stop']);
  });

  it('never touches the scan for a request refused out of hand', () => {
    // The stale-endpoint loop: the ticker asks a dead endpoint every five
    // seconds and Nearby says no at once. Ten rounds, and not one restart.
    const { calls, held } = rig();
    for (let i = 0; i < 10; i++) {
      held.request(out('AB12'));
      vi.advanceTimersByTime(50);
      held.request(refused('AB12'));
      vi.advanceTimersByTime(5000);
    }
    expect(calls).toEqual(['start']);
  });

  it('stays paused through the handshake and does not restart on trust', () => {
    const { calls, held } = rig();
    held.request(out('AB12'));
    held.request(took('AB12'));
    held.hold('AB12'); // initiated
    vi.advanceTimersByTime(3000);
    held.hold('AB12'); // connected
    vi.advanceTimersByTime(2000);
    held.release('AB12', false); // trusted
    vi.advanceTimersByTime(QUIET_MS * 2);
    expect(calls).toEqual(['start', 'stop']);
  });
});

describe('the resume', () => {
  it('comes back when the connection fails', () => {
    const { calls, held } = rig();
    held.request(out('AB12'));
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.release('AB12');
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('waits out the quiet, so restarts are never closer than it', () => {
    const { calls, held } = rig();
    held.request(out('AB12'));
    vi.advanceTimersByTime(PAUSE_GRACE_MS); // stopped here
    vi.advanceTimersByTime(1000);
    held.release('AB12');
    vi.advanceTimersByTime(QUIET_MS - 1001);
    expect(calls).toEqual(['start', 'stop']);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('is not delayed once the quiet has already passed', () => {
    const { calls, held } = rig();
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS + QUIET_MS + 500);
    held.release('AB12');
    vi.advanceTimersByTime(0);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('is cancelled by a new connection forming inside the quiet', () => {
    const { calls, held } = rig();
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.release('AB12');
    vi.advanceTimersByTime(1000);
    held.hold('XY34');
    vi.advanceTimersByTime(QUIET_MS * 2);
    // Still the one stop: a stop is never followed by a stop.
    expect(calls).toEqual(['start', 'stop']);
  });

  it('does nothing for a stranger turned away with no hold taken', () => {
    const { calls, held } = rig();
    held.release('ZZ99');
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start']);
  });

  it('waits for every forming connection, not the first to end', () => {
    const { calls, held } = rig();
    held.hold('AB12');
    held.hold('XY34');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.release('AB12');
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start', 'stop']);
    held.release('XY34');
    vi.advanceTimersByTime(0);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('follows a link trusted and dropped inside one render', () => {
    // `trust` lets go without resuming because the radio is about to be
    // turned off — but if the drop lands before that render, it never is, and
    // the teardown is the only thing left that can bring the scan back.
    const { calls, held } = rig();
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.release('AB12', false);
    held.release('AB12');
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
});

describe('a request refused while another is forming', () => {
  it('does not release the pause the first request is owed', () => {
    const { calls, held } = rig();
    held.request(out('AB12'));
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.request(out('AB12')); // the ticker, five seconds impatient
    held.request(refused('AB12'));
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start', 'stop']);
    held.request(took('AB12'));
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start', 'stop']);
  });

  it('does not release a connection Nearby has already acknowledged', () => {
    const { calls, held } = rig();
    held.request(out('AB12'));
    held.request(took('AB12'));
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.request(out('AB12'));
    held.request(refused('AB12'));
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start', 'stop']);
  });

  it('survives the acknowledgement arriving before the request settles', () => {
    const { calls, held } = rig();
    held.request(out('AB12'));
    held.hold('AB12'); // initiated first
    held.request(took('AB12'));
    vi.advanceTimersByTime(PAUSE_GRACE_MS + QUIET_MS);
    expect(calls).toEqual(['start', 'stop']);
  });
});

describe('the backstop', () => {
  it('ends a pause nothing else ended', () => {
    const { calls, lapsed, held } = rig();
    held.request(out('AB12'));
    held.request(took('AB12'));
    vi.advanceTimersByTime(FORMING_MS - 1);
    expect(calls).toEqual(['start', 'stop']);
    vi.advanceTimersByTime(1);
    expect(lapsed).toEqual(['AB12']);
    expect(calls).toEqual(['start', 'stop', 'start']);
    expect(held.any()).toBe(false);
  });

  it('starts over with every step the connection takes', () => {
    const { calls, held } = rig();
    held.hold('AB12');
    vi.advanceTimersByTime(FORMING_MS - 1000);
    held.hold('AB12');
    vi.advanceTimersByTime(FORMING_MS - 1000);
    expect(calls).toEqual(['start', 'stop']);
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('is not pushed back by the ticker asking again', () => {
    // A half-open link: Nearby holds it, no hello ever comes, and the ticker
    // goes on requesting. If a request counted as a step, this pause would
    // never end.
    const { calls, held } = rig();
    held.hold('AB12');
    for (let t = 5000; t < FORMING_MS; t += 5000) {
      vi.advanceTimersByTime(5000);
      held.request(out('AB12'));
      held.request(refused('AB12'));
    }
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('is cleared with the set, and fires nothing afterwards', () => {
    const { calls, lapsed, held } = rig();
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.clear();
    vi.advanceTimersByTime(FORMING_MS * 2);
    expect(lapsed).toEqual([]);
    expect(calls).toEqual(['start', 'stop']);
  });
});

describe('a start that has been overtaken', () => {
  it('is told so, which is what retires its retry', () => {
    const { stills, held } = rig();
    expect(stills[0]()).toBe(true);
    held.hold('AB12');
    // Wanted off, but not yet told: the start is still the current one.
    expect(stills[0]()).toBe(true);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(stills[0]()).toBe(false);
  });

  it('stays retired after the scan has started again', () => {
    const { stills, held } = rig();
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.release('AB12');
    vi.advanceTimersByTime(QUIET_MS);
    expect(stills).toHaveLength(2);
    expect(stills[0]()).toBe(false);
    expect(stills[1]()).toBe(true);
  });

  it('is retired by the radio going down', () => {
    const { stills, scan } = rig();
    scan.close();
    expect(stills[0]()).toBe(false);
  });
});

describe('a radio that is not running', () => {
  it('starts paused when something was already forming', () => {
    const calls: string[] = [];
    const held = formingSet();
    held.hold('AB12');
    const scan = scanFollower(
      { start: () => calls.push('start'), stop: () => calls.push('stop') },
      !held.any()
    );
    held.attach(scan);
    scan.open();
    expect(calls).toEqual([]);
    held.release('AB12');
    vi.advanceTimersByTime(0);
    expect(calls).toEqual(['start']);
  });

  it('asks nothing of Nearby before it is cleared', () => {
    const { calls, held, scan } = rig(false);
    held.hold('AB12');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    held.release('AB12');
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual([]);
    scan.open();
    expect(calls).toEqual(['start']);
  });

  it('drops what was planned when it goes down', () => {
    const { calls, held, scan } = rig();
    held.hold('AB12');
    scan.close();
    held.attach(null);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    // The effect's own cleanup stops discovery; the follower must not also.
    expect(calls).toEqual(['start']);
    held.release('AB12');
    vi.advanceTimersByTime(QUIET_MS);
    expect(calls).toEqual(['start']);
  });
});
