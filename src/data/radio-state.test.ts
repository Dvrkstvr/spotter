/**
 * The line on the screen is only as good as the word under it, and every
 * mistake here is a confident one: a phone told to turn on a Bluetooth that is
 * on, or told nothing while its Location switch keeps it blind.
 */
import { describe, expect, it } from 'vitest';
import { NO_STATUS, radioStateOf, refusedIn, SETTLE_ROUNDS, statusOf } from './radio-state';

const round = (over: Partial<Parameters<typeof radioStateOf>[0]> = {}) =>
  radioStateOf({ grant: 'granted', statuses: [], bluetooth: true, run: 0, ...over });

describe('statusOf', () => {
  it('reads the status the native module appends to the code', () => {
    expect(statusOf({ code: 'DISCOVERY_FAILED_8025', message: 'whatever' })).toBe(8025);
  });

  it('falls back to the message an older native build sends', () => {
    expect(
      statusOf({ code: 'DISCOVERY_FAILED', message: '8025: MISSING_SETTING_LOCATION_MUST_BE_ON' })
    ).toBe(8025);
  });

  it('prefers the code over a message that disagrees', () => {
    expect(statusOf({ code: 'ADVERTISE_FAILED_8007', message: '8025: nope' })).toBe(8007);
  });

  it('is null for a rejection that names no status', () => {
    expect(statusOf(new Error('React context gone'))).toBeNull();
    expect(statusOf({ code: 'NO_CONTEXT' })).toBeNull();
    expect(statusOf('8025')).toBeNull();
    expect(statusOf(null)).toBeNull();
  });
});

describe('radioStateOf', () => {
  it('is ok when nothing was refused', () => {
    expect(round()).toBe('ok');
  });

  it('puts a missing grant ahead of everything Nearby said', () => {
    expect(round({ grant: 'denied', statuses: [8025], bluetooth: false })).toBe('permission');
    expect(round({ grant: 'blocked' })).toBe('blocked');
  });

  it('names the Location switch from 8025 on the first round', () => {
    expect(round({ statuses: [8025], run: 1 })).toBe('location');
  });

  it('sends a permission Nearby misses but Android granted to the settings page', () => {
    for (const status of [8029, 8034, 8036, 8037, 8038, 8039])
      expect(round({ statuses: [status], run: 1 })).toBe('blocked');
  });

  it('does not call a settling stack Bluetooth being off', () => {
    expect(round({ statuses: [8007, 8007], run: 1 })).toBe('ok');
    expect(round({ statuses: [8007], run: SETTLE_ROUNDS - 1 })).toBe('ok');
  });

  it('calls a refusal that outlasts the settle window refused, not bluetooth', () => {
    expect(round({ statuses: [8007], run: SETTLE_ROUNDS })).toBe('refused');
    expect(round({ statuses: [NO_STATUS], run: SETTLE_ROUNDS })).toBe('refused');
  });

  it('believes the reading that Bluetooth is off, refusal or none', () => {
    expect(round({ statuses: [8007], bluetooth: false, run: 1 })).toBe('bluetooth');
    expect(round({ bluetooth: false })).toBe('bluetooth');
  });

  it('claims nothing from a phone that would not say', () => {
    expect(round({ bluetooth: null })).toBe('ok');
    expect(round({ statuses: [8007], bluetooth: null, run: 1 })).toBe('ok');
  });

  it('ranks Location over Bluetooth when the two halves disagree', () => {
    expect(round({ statuses: [8007, 8025], bluetooth: false, run: 1 })).toBe('location');
  });

  it('does not count already-running as a refusal', () => {
    expect(refusedIn([8001, 8002])).toBe(false);
    expect(refusedIn([8001, 8007])).toBe(true);
    expect(round({ statuses: [8001, 8002], run: SETTLE_ROUNDS })).toBe('ok');
  });
});
