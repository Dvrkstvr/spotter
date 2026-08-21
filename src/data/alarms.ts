/**
 * Everything this app hands to Android's notification tray.
 *
 * Two things are announced, and they are the same problem at two scales — a
 * moment that matters while nobody is looking at the screen:
 *
 * - **The rest alarm** is the out-of-app half of `buzz.rest()`. A rest ends
 *   whether or not anyone is watching, and a phone in a pocket has suspended
 *   the JS thread — so the haptic never fires and the countdown is only correct
 *   again once you unlock. The alarm is handed over up front and fires on its
 *   own clock, app running or not.
 * - **The plan reminder** is the same trick a day out instead of three minutes.
 *   The plan is dated rules, so which days hold a workout is already knowable a
 *   fortnight ahead; those days are stamped in advance and re-stamped whenever
 *   the plan, the time or the day changes. `<PlanAlarm>` decides the list.
 *
 * They share this module because **the sweeps are app-wide**: `init` clears the
 * tray and every pending alarm a dead process left behind, and it can only do
 * that once, before anything this process schedules. Two modules would mean two
 * `init`s, and whichever ran second would cancel the first one's work. One
 * loader, one sweep, one channel registry.
 *
 * Everything here is guarded and lazy, for the same reason `buddy-radio.ts` is:
 * app code must never hard-depend on a native module, so Expo Go (and an
 * emulator with no notification support) degrades to "no alarm" instead of
 * crashing. `expo-notifications` does support local notifications in Expo Go on
 * SDK 54, so this is belt-and-braces — but a missing alarm must never take a
 * logged set with it, which is why every call swallows its own failure.
 *
 * **The import is lazy as well, and that half is not belt-and-braces.** Loading
 * `expo-notifications` runs `DevicePushTokenAutoRegistration.fx` as a module
 * side effect, which registers a push-token listener, which on Android in Expo
 * Go is a `console.error` about remote push having left with SDK 53 — about a
 * feature this app never asks for, drawn as a full-width red LogBox bar over
 * whatever you were looking at. Two things follow and both are needed: the
 * module is fetched on first *use*, so a launch that neither rests nor plans
 * anything never pays for it at all; and `init` mutes that one message before
 * fetching it, because the warning is unavoidable the moment the module loads
 * at all. Lazy on its own only moves the bar off the tab bar and onto the
 * session's own CTA.
 *
 * The two clearing calls at the bottom are what the laziness costs: they run at
 * mount and on every return to the app, so neither of them may load the module.
 *
 * **The alarm is exact, and that is a manifest declaration rather than anything
 * in this file.** expo-notifications picks its own branch —
 * `setExactAndAllowWhileIdle` where `canScheduleExactAlarms()` is true and
 * `setAndAllowWhileIdle` otherwise — and the package's own manifest declares
 * neither exact-alarm permission, so for a year every rest took the inexact
 * branch. Inexact means batched with whatever else wakes the phone, and a rest
 * is exactly the shape that reaches Doze: screen off, phone stationary on a
 * bench, three minutes. In Doze the inexact call is rate-limited to about once
 * per nine minutes, which is a ninety-second rest announced four minutes late —
 * by which time you have already done the set. So `app.json` declares
 * `USE_EXACT_ALARM` (Android 13+, granted at install, no prompt and no trip to
 * settings) and `SCHEDULE_EXACT_ALARM` for 12 and 13, where declaring it is
 * itself the grant. Two things follow: this is a native change, so it needs a
 * prebuild and a fresh build on both phones; and `USE_EXACT_ALARM` is a
 * Play-restricted permission, which costs nothing while Spotter is sideloaded
 * and would become `SCHEDULE_EXACT_ALARM` plus a prompt if it ever shipped. The
 * plan reminder inherits the exactness and doesn't need it — but a setting that
 * says 18:00 is no worse for meaning it.
 */
import { LogBox, Platform } from 'react-native';

import { themeSwatch } from '@/design/tokens';

// Type-only, so it is erased rather than required: the whole point is that
// nothing pulls the module in until `init` asks for it.
import type * as Notifications from 'expo-notifications';

/** The module's runtime shape — what `init` hands back once it has one. */
type Api = typeof import('expo-notifications');

/**
 * One channel per kind, so the phone's own notification settings can silence
 * the reminder without silencing the rest timer. Both are declared here rather
 * than at their call sites for the same reason the loader is: `init` writes
 * every channel it knows about in one pass, before anything can post.
 */
export type ChannelId = 'rest' | 'plan';

/**
 * A buzz each, shaped like what they are about: the rest alarm interrupts
 * something you are in the middle of, the reminder is one tap on the shoulder
 * about the rest of your day.
 */
const VIBRATION: Record<ChannelId, number[]> = {
  rest: [0, 220, 120, 220],
  plan: [0, 180],
};

/**
 * Each channel's own name, which Android shows in the app's notification
 * settings — so they are translated strings like every other one the user
 * reads. `<RestAlarm>` and `<PlanAlarm>` set theirs before anything here is
 * called; re-creating a channel under the same id is how Android takes a
 * rename, so switching language updates it rather than leaving the first
 * language that ever ran.
 */
const names: Record<ChannelId, string> = { rest: 'Rest timer', plan: 'Planned workouts' };

/**
 * The handler decides what a notification does while the app is *foregrounded*,
 * and the answer is nothing: the countdown is already on the session screen, so
 * a banner over it would be telling you what you are looking at — and a
 * reminder to train is being read by someone who has the app open.
 * Backgrounded, Android shows both without asking us, which is the whole point.
 */
const SILENT_IN_APP: Notifications.NotificationBehavior = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

/**
 * The loaded module, or null until something needs it. Read directly only by
 * the clearing calls, which are defined as "clear through a module that is
 * already up" precisely so that reading it is never a reason to load it.
 */
let api: Api | null = null;
let ready: Promise<Api | null> | null = null;

/** Module + handler + channels, once, on first use. Null means "no alarms here". */
function init(): Promise<Api | null> {
  ready ??= (async () => {
    try {
      // Muted on the one line that causes it, rather than globally in the root
      // layout: this is the only import of the package in the app, so the
      // pattern and the thing it is about can't drift apart. `ignoreLogs`
      // appends, and is a no-op outside __DEV__.
      LogBox.ignoreLogs([/expo-notifications: Android Push notifications/]);
      const mod = await import('expo-notifications');
      mod.setNotificationHandler({ handleNotification: async () => SILENT_IN_APP });
      await writeChannels(mod);
      // Anything already in the tray at this point is from a previous process:
      // the app has, by definition, not posted a notification yet this run. That
      // is the cold-start case `dismissAlarms` can no longer cover on its own —
      // it runs at mount, and mount is the one moment nothing may load this
      // module. Clearing here moves that sweep to the first workout instead of
      // the first frame. Android covers the common half by itself: content is
      // auto-cancel, so a tapped alarm has already gone.
      await mod.dismissAllNotificationsAsync();
      // Same argument one step earlier in an alarm's life: anything still
      // *scheduled* now was scheduled by a previous process, whose rest either
      // resumed with the session (its re-arm schedules a fresh alarm right
      // after this — without the sweep, two announce one rest) or died with
      // it. A pending alarm this process owns can't be caught here: `init`
      // runs once, before the first `scheduleRestAlarm` ever resolves.
      //
      // A dead process's plan reminders go with them, and that is a decision
      // rather than collateral: they are a projection of a plan that may have
      // changed since, and `<PlanAlarm>` re-stamps the whole horizon within a
      // frame of the app coming up. What survives intact is the launch that
      // never happened — `init` is lazy, so a phone nobody opens keeps every
      // reminder it was already given, which is the case the horizon exists
      // for.
      await mod.cancelAllScheduledNotificationsAsync();
      api = mod;
      return mod;
    } catch {
      return null;
    }
  })();
  return ready;
}

async function writeChannels(mod: Api): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const id of Object.keys(names) as ChannelId[]) await writeChannel(mod, id);
}

async function writeChannel(mod: Api, id: ChannelId): Promise<void> {
  if (Platform.OS !== 'android') return;
  await mod.setNotificationChannelAsync(id, {
    name: names[id],
    // Heads-up and a buzz, no sound: the app's existing answer to "you are not
    // looking at the screen" is a vibration, and a gym does not need a chime
    // every ninety seconds.
    importance: mod.AndroidImportance.HIGH,
    sound: null,
    vibrationPattern: VIBRATION[id],
    lightColor: themeSwatch('blurple', true).accent,
  });
}

/** Name a channel in the user's language. No-op until something needs it. */
export function setChannelName(id: ChannelId, name: string): void {
  if (name === names[id]) return;
  names[id] = name;
  // Only rewrite a channel that already exists — otherwise `init` will create
  // it with the right name the first time anything asks for an alarm. Which is
  // also what keeps this call, made from the alarm components' first render,
  // off the loading path.
  if (ready)
    ready
      .then((mod) => {
        if (mod) return writeChannel(mod, id);
      })
      .catch(() => {});
}

/**
 * Android 13+ wants POST_NOTIFICATIONS at runtime. Only ever prompts while the
 * answer is still undetermined — a previous "no" is left alone rather than
 * asked again every workout.
 *
 * The permission is the app's rather than a channel's, so whichever of the two
 * features asks first has asked for both.
 *
 * Called from calm places only: switching either setting on, and starting a
 * workout. Nothing on the rest path asks — a system dialog three minutes into
 * an exercise lands right where your thumb is going. Those are also where the
 * module itself gets loaded, for the same reason: they are moments you chose,
 * not moments the app arrived at.
 */
export async function ensureAlarmPermission(): Promise<boolean> {
  const mod = await init();
  if (!mod) return false;
  try {
    const cur = await mod.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await mod.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** The module, but only once it may actually post. Reads; never asks. */
async function granted(): Promise<Api | null> {
  const mod = await init();
  if (!mod) return null;
  try {
    return (await mod.getPermissionsAsync()).granted ? mod : null;
  } catch {
    return null;
  }
}

/** Schedule the rest-over alarm. Returns the id to cancel it with, or null. */
export async function scheduleRestAlarm(
  seconds: number,
  title: string,
  body: string
): Promise<string | null> {
  if (seconds <= 0) return null;
  const mod = await granted();
  if (!mod) return null;
  try {
    return await mod.scheduleNotificationAsync({
      // Android takes the sound from the channel; `false` is the same answer
      // said in the content's own vocabulary, for anywhere that reads it there.
      content: { title, body, sound: false },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId: 'rest',
        seconds,
      },
    });
  } catch {
    return null;
  }
}

/**
 * One day's reminder: a wall moment, and what it should say when it gets there.
 *
 * `at` is milliseconds rather than a `Date` because this list doubles as its
 * own effect dependency in `<PlanAlarm>` — a number can be compared, where two
 * `Date`s meaning the same second are two different objects and would restamp
 * the fortnight on every render.
 */
export type PlanAlarm = { at: number; title: string; body: string };

/**
 * What is currently stamped, so a restamp takes back exactly its own alarms.
 * `cancelAllScheduledNotificationsAsync` is the obvious call and the wrong one:
 * a rest may well be running while the plan changes underneath it.
 */
let planIds: string[] = [];

/**
 * The last list asked for. A stale run — one superseded while it was still
 * awaiting the module — skips itself rather than laying down a fortnight that
 * has already been replaced.
 */
let wanted: readonly PlanAlarm[] = [];

/** Serialised, so two restamps can never interleave their cancel and schedule. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Replace every pending plan reminder with this list. Fire-and-forget: nothing
 * downstream waits on a reminder being stamped, and an empty list is how the
 * feature is switched off.
 */
export function schedulePlanAlarms(items: readonly PlanAlarm[]): void {
  wanted = items;
  queue = queue.then(() => (wanted === items ? restamp(items) : undefined)).catch(() => {});
}

async function restamp(items: readonly PlanAlarm[]): Promise<void> {
  // No permission and no module both mean "cancel what is there and stop",
  // which is why an empty list deliberately doesn't fetch the module: switching
  // the setting off must not be the thing that loads it.
  const mod = items.length ? await granted() : api;
  for (const id of planIds) cancelAlarm(id);
  planIds = [];
  if (!mod) return;
  const now = Date.now();
  for (const it of items) {
    // A time already gone by is not a reminder, it is a notification about the
    // past. `<PlanAlarm>` drops those too; this is the one that catches the app
    // sitting open across the chosen minute.
    if (it.at <= now) continue;
    try {
      planIds.push(
        await mod.scheduleNotificationAsync({
          content: { title: it.title, body: it.body, sound: false },
          trigger: {
            type: mod.SchedulableTriggerInputTypes.DATE,
            channelId: 'plan',
            date: it.at,
          },
        })
      );
    } catch {
      /* one bad day is not worth the fortnight */
    }
  }
}

/**
 * Fire-and-forget: nothing downstream waits on an alarm going away.
 *
 * Only ever cancels through a module that is already up, which costs nothing:
 * an id exists because a schedule call returned one, and that loaded it. So
 * "no module" and "no id" are the same sentence said twice.
 */
export function cancelAlarm(id: string | null | undefined): void {
  const mod = api;
  if (!id || !mod) return;
  try {
    mod.cancelScheduledNotificationAsync(id).catch(() => {});
  } catch {
    /* no notifications on this build */
  }
}

/**
 * Clear the tray. `dismissAll` rather than by id because it is the app's tray
 * and both of the things in it are answered by the app being open — you are
 * looking at the rest you were waiting on, or at the workout you were being
 * reminded of. It also cannot be defeated by an identifier that didn't survive
 * the trip through the notification tray.
 *
 * Also loads nothing, and here that is a real trade rather than a free one: it
 * runs on mount and on every return to the app, so a load would be the startup
 * import all over again. Within a process the two are identical — nothing can
 * be in the tray that this app didn't put there. Across a process death they
 * are not, and `init`'s own sweep is what covers the difference.
 */
export function dismissAlarms(): void {
  const mod = api;
  if (!mod) return;
  try {
    mod.dismissAllNotificationsAsync().catch(() => {});
  } catch {
    /* no notifications on this build */
  }
}
