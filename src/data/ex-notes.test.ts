/**
 * Last time's exercise note is read back out of the diary, so the test is
 * whether it reads the *right* day — the one `lastLog` says was last — and
 * stays quiet when that day said nothing, however much an older one did.
 */
import { describe, expect, it } from 'vitest';
import { lastExNote } from './ex-notes';

const day = (date: string, list: { ex: string; note?: string }[]) => ({ date, list });

describe('lastExNote', () => {
  it('reads the note off the session lastLog names', () => {
    const history = [day('2026-09-01', [{ ex: 'bench', note: 'shoulder, go easy' }])];
    expect(lastExNote(history, { date: '2026-09-01' }, 'bench')).toEqual({
      date: '2026-09-01',
      note: 'shoulder, go easy',
    });
  });

  it('says nothing when the latest session said nothing, whatever an older one did', () => {
    const history = [
      day('2026-09-01', [{ ex: 'bench', note: 'shoulder, go easy' }]),
      day('2026-09-08', [{ ex: 'bench' }]),
    ];
    expect(lastExNote(history, { date: '2026-09-08' }, 'bench')).toBeNull();
  });

  it('is null for an exercise never logged here', () => {
    const history = [day('2026-09-01', [{ ex: 'bench', note: 'fine' }])];
    expect(lastExNote(history, undefined, 'squat')).toBeNull();
  });

  it('is null when the day lastLog names is missing from the diary', () => {
    // A merge can bring a newer `lastLog` than the history it came with.
    const history = [day('2026-09-01', [{ ex: 'bench', note: 'old' }])];
    expect(lastExNote(history, { date: '2026-09-15' }, 'bench')).toBeNull();
  });

  it('takes the later of two sessions on one day', () => {
    const history = [
      day('2026-09-01', [{ ex: 'bench', note: 'morning' }]),
      day('2026-09-01', [{ ex: 'bench', note: 'evening' }]),
    ];
    expect(lastExNote(history, { date: '2026-09-01' }, 'bench')?.note).toBe('evening');
  });

  it('skips a same-day session that did not include the exercise', () => {
    const history = [
      day('2026-09-01', [{ ex: 'bench', note: 'grip went' }]),
      day('2026-09-01', [{ ex: 'squat' }]),
    ];
    expect(lastExNote(history, { date: '2026-09-01' }, 'bench')?.note).toBe('grip went');
  });

  it('treats whitespace as nothing said', () => {
    const history = [day('2026-09-01', [{ ex: 'bench', note: '   ' }])];
    expect(lastExNote(history, { date: '2026-09-01' }, 'bench')).toBeNull();
  });
});
