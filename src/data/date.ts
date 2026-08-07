/**
 * Live-date helpers.
 *
 * The design pinned "today" to Friday 7 August 2026 to suit its seed data;
 * going live replaced that pin (formerly `TODAY_DOW` / `TODAY_DOM` in
 * tokens.ts) with these. Everything is local time, and day-of-week is
 * Monday-based to match `DOW` and the `schedule` keys.
 */

/** Local YYYY-MM-DD — never toISOString(), which shifts across UTC midnight. */
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayISO = () => toISO(new Date());

/** Monday-based day-of-week index of today (0 = Mon … 6 = Sun). */
export const todayDow = () => (new Date().getDay() + 6) % 7;

/** Day of month, 1-based. */
export const todayDom = () => new Date().getDate();

/** Whole local days between an ISO date and today (positive = in the past). */
export const daysSince = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
};
