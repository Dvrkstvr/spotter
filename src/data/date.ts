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

/** An ISO date as a local Date at midnight — never `new Date(iso)`, which is UTC. */
export const fromISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Monday-based day-of-week index of an ISO date (0 = Mon … 6 = Sun). */
export const dowOfISO = (iso: string) => (fromISO(iso).getDay() + 6) % 7;

/** `iso` moved by n whole local days. */
export const shiftISO = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

/** Whole local days from `a` to `b` (positive = b is later). */
export const daysBetween = (a: string, b: string) =>
  Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);

/**
 * ISO date of the Monday that opens the current local week.
 *
 * What the v3 → v4 migration anchors every lifted rule to: "from the start of
 * this week", so nothing is claimed retroactively and every rule is live the
 * same day.
 */
export const mondayISO = () => shiftISO(todayISO(), -todayDow());

/** Whole local days between an ISO date and today (positive = in the past). */
export const daysSince = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
};
