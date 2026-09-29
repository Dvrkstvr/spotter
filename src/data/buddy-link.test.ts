/**
 * The link arithmetic. Every case here is a state the two phones reached in a
 * gym and only a restart cleared — so the fixtures are lists and refusals as
 * Nearby actually hands them over, not tidy ones.
 */
import { describe, expect, it } from 'vitest';

import {
  ASK_ATTEMPTS,
  askEnded,
  askStrike,
  isGone,
  isUnlinked,
  lastOfPeer,
  type NearbyPeer,
  pickPeer,
  statusOf,
  withFound,
} from '@/data/buddy-link';

const peer = (endpointId: string, id: string | null, name = 'Jonas'): NearbyPeer => ({
  endpointId,
  id,
  name,
});

describe('withFound', () => {
  it('replaces the dead entry of a buddy who restarted their app', () => {
    // New endpoint id, same install id, and no `lost` for the old one.
    const list = withFound([peer('AB12', 'install-j')], peer('XY34', 'install-j'));
    expect(list).toEqual([peer('XY34', 'install-j')]);
  });

  it('follows the install id through a rename', () => {
    const list = withFound([peer('AB12', 'install-j', 'Jonas')], peer('XY34', 'install-j', 'Jo'));
    expect(list).toEqual([peer('XY34', 'install-j', 'Jo')]);
  });

  it('replaces an entry re-reported under the same endpoint id', () => {
    const list = withFound([peer('AB12', 'install-j', 'Jonas')], peer('AB12', 'install-j', 'Jo'));
    expect(list).toEqual([peer('AB12', 'install-j', 'Jo')]);
  });

  it('leaves everybody else where they were', () => {
    const mia = peer('MM01', 'install-m', 'Mia');
    const list = withFound([mia, peer('AB12', 'install-j')], peer('XY34', 'install-j'));
    expect(list).toEqual([mia, peer('XY34', 'install-j')]);
  });

  it('never merges two id-less peers — null is not an identity', () => {
    const old = peer('AB12', null, 'Jonas');
    const list = withFound([old], peer('XY34', null, 'Mia'));
    expect(list).toEqual([old, peer('XY34', null, 'Mia')]);
  });

  it('keeps an id-less entry when a peer with an id is found', () => {
    const old = peer('AB12', null, 'Jonas');
    const list = withFound([old], peer('XY34', 'install-j'));
    expect(list).toEqual([old, peer('XY34', 'install-j')]);
  });
});

describe('pickPeer', () => {
  it('takes the newest match, which is the backstop for id-less peers', () => {
    const list = [peer('AB12', null), peer('XY34', null)];
    expect(pickPeer(list, 'Jonas', undefined)?.endpointId).toBe('XY34');
  });

  it('matches by install id under a name the roster has not adopted yet', () => {
    const list = [peer('MM01', 'install-m', 'Mia'), peer('XY34', 'install-j', 'Jo')];
    expect(pickPeer(list, 'Jonas', 'install-j')?.endpointId).toBe('XY34');
  });

  it('answers null for somebody who is not there', () => {
    expect(pickPeer([peer('MM01', 'install-m', 'Mia')], 'Jonas', 'install-j')).toBeNull();
    expect(pickPeer([], 'Jonas', undefined)).toBeNull();
  });
});

describe('lastOfPeer', () => {
  it('is true when the eviction would leave that phone unlisted', () => {
    const list = [peer('MM01', 'install-m', 'Mia'), peer('XY34', 'install-j')];
    expect(lastOfPeer(list, 'XY34')).toBe(true);
  });

  it('is false while an id-less twin is still listed', () => {
    const list = [peer('AB12', null), peer('XY34', null)];
    expect(lastOfPeer(list, 'XY34')).toBe(false);
  });

  it('is false for an endpoint that was never listed', () => {
    expect(lastOfPeer([peer('AB12', 'install-j')], 'ZZ99')).toBe(false);
  });
});

describe('statusOf', () => {
  it("reads the code out of an ApiException's message", () => {
    expect(statusOf(new Error('8011: STATUS_ENDPOINT_UNKNOWN'))).toBe(8011);
  });

  it('reads it through the bridge wrapping the message in its own sentence', () => {
    const wrapped = new Error(
      "Call to function 'NearbyBuddy.requestConnection' has been rejected.\n→ Caused by: 8012: STATUS_ENDPOINT_IO_ERROR"
    );
    expect(statusOf(wrapped)).toBe(8012);
  });

  it('falls back to the name when the number is missing', () => {
    expect(statusOf(new Error('STATUS_NOT_CONNECTED_TO_ENDPOINT'))).toBe(8005);
  });

  it('takes a bare string', () => {
    expect(statusOf('8005: STATUS_NOT_CONNECTED_TO_ENDPOINT')).toBe(8005);
  });

  it('answers null for anything that is not a Nearby refusal', () => {
    expect(statusOf(new Error('React context gone'))).toBeNull();
    expect(statusOf(new Error('STATUS_SOMETHING_NEW'))).toBeNull();
    expect(statusOf(new Error('payload of 80110 bytes'))).toBeNull();
    expect(statusOf(undefined)).toBeNull();
    expect(statusOf({ message: '8011' })).toBeNull();
  });
});

describe('isGone / isUnlinked', () => {
  it('evicts on an unknown or unreachable endpoint and nothing else', () => {
    expect(isGone(8011)).toBe(true);
    expect(isGone(8012)).toBe(true);
    // A rejection is an answer from a live phone.
    expect(isGone(8004)).toBe(false);
    expect(isGone(null)).toBe(false);
  });

  it('believes a send that says there is no link', () => {
    expect(isUnlinked(8005)).toBe(true);
    expect(isUnlinked(8011)).toBe(true);
    expect(isUnlinked(8012)).toBe(false);
    expect(isUnlinked(null)).toBe(false);
  });
});

const waiting = (fails?: number) => ({
  buddy: 'Jonas' as string | null,
  buddyEndpoint: null as string | null,
  buddyIds: { Jonas: 'install-j' } as Record<string, string>,
  joinSent: { to: 'Jonas', state: 'waiting' as const, ...(fails ? { fails } : {}) },
  sessionShared: false,
});

describe('askStrike', () => {
  const jonas = { id: 'install-j', name: 'Jonas' };

  it('counts a lost attempt and leaves the ask waiting', () => {
    expect(askStrike(waiting(), jonas)).toEqual({
      joinSent: { to: 'Jonas', state: 'waiting', fails: 1 },
    });
  });

  it('ends the ask when the budget is spent', () => {
    expect(askStrike(waiting(ASK_ATTEMPTS - 1), jonas)).toEqual({
      buddy: null,
      joinSent: { to: 'Jonas', state: 'failed' },
    });
  });

  it('ends on exactly the third failure when walked from the start', () => {
    let s = waiting();
    for (let i = 1; i < ASK_ATTEMPTS; i++) {
      const p = askStrike(s, jonas);
      expect(p?.joinSent.state).toBe('waiting');
      s = { ...s, ...p } as typeof s;
    }
    expect(askStrike(s, jonas)?.joinSent.state).toBe('failed');
  });

  it("does not charge the ask for somebody else's failure", () => {
    expect(askStrike(waiting(), { id: 'install-m', name: 'Mia' })).toBeNull();
  });

  it('recognises the asked buddy by install id under a new name', () => {
    expect(askStrike(waiting(), { id: 'install-j', name: 'Jo' })?.joinSent.fails).toBe(1);
  });

  it('counts an attempt nobody recorded an identity for', () => {
    expect(askStrike(waiting(), null)?.joinSent.fails).toBe(1);
  });

  it('does nothing without a waiting ask', () => {
    expect(askStrike({ ...waiting(), joinSent: null }, jonas)).toBeNull();
    expect(
      askStrike({ ...waiting(), joinSent: { to: 'Jonas', state: 'declined' } }, jonas)
    ).toBeNull();
    expect(
      askStrike({ ...waiting(), joinSent: { to: 'Jonas', state: 'failed' } }, jonas)
    ).toBeNull();
  });

  it('does nothing once the link is up — the ask was delivered', () => {
    expect(askStrike({ ...waiting(), buddyEndpoint: 'XY34' }, jonas)).toBeNull();
  });
});

describe('askEnded', () => {
  it('fails the ask and lets the pairing go', () => {
    expect(askEnded(waiting(1))).toEqual({
      buddy: null,
      joinSent: { to: 'Jonas', state: 'failed' },
    });
  });

  it('keeps the pairing of a shared session in progress', () => {
    // The ticker's patience belongs to the workout, not to the ask.
    const p = askEnded({ ...waiting(), sessionShared: true });
    expect(p).toEqual({ joinSent: { to: 'Jonas', state: 'failed' } });
    expect(p && 'buddy' in p).toBe(false);
  });

  it('does nothing to an ask that already has an answer', () => {
    expect(askEnded({ ...waiting(), joinSent: null })).toBeNull();
    expect(askEnded({ ...waiting(), joinSent: { to: 'Jonas', state: 'declined' } })).toBeNull();
    expect(askEnded({ ...waiting(), buddyEndpoint: 'XY34' })).toBeNull();
  });
});
