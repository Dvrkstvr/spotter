/**
 * The out-of-app half of `buzz.rest()`.
 *
 * A rest ends whether or not anyone is looking at the screen, and a phone in a
 * pocket has suspended the JS thread — so the haptic never fires and the
 * countdown is only correct again once you unlock. A local notification is
 * handed to Android up front and fires on its own clock, app running or not.
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
 * module is fetched on first *use*, so a launch that never rests never pays for
 * it at all; and `init` mutes that one message before fetching it, because the
 * warning is unavoidable the moment the module loads at all. Lazy on its own
 * only moves the bar off the tab bar and onto the session's own CTA.
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
 * and would become `SCHEDULE_EXACT_ALARM` plus a prompt if it ever shipped.
 */
import { LogBox, Platform } from 'react-native';

import { themeSwatch } from '@/design/tokens';

// Type-only, so it is erased rather than required: the whole point is that
// nothing pulls the module in until `init` asks for it.
import type * as Notifications from 'expo-notifications';

/** The module's runtime shape — what `init` hands back once it has one. */
type Api = typeof import('expo-notifications');

const CHANNEL = 'rest';

/**
 * The handler decides what a notification does while the app is *foregrounded*,
 * and the answer is nothing: the countdown is already on the session screen, so
 * a banner over it would be telling you what you are looking at. Backgrounded,
 * Android shows it without asking us — which is the whole point.
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
/**
 * The channel's own name, which Android shows in the app's notification
 * settings — so it is a translated string like every other one the user reads.
 * `<RestAlarm>` sets it before anything here is called; re-creating the channel
 * under the same id is how Android takes a rename, so switching language
 * updates it rather than leaving the first language that ever ran.
 */
let channelName = 'Rest timer';

/** Module + handler + channel, once, on first use. Null means "no alarms here". */
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
      await writeChannel(mod);
      // Anything already in the tray at this point is from a previous process:
      // the app has, by definition, not posted a notification yet this run. That
      // is the cold-start case `dismissRestAlarms` can no longer cover on its
      // own — it runs at mount, and mount is the one moment nothing may load
      // this module. Clearing here moves that sweep to the first workout instead
      // of the first frame. Android covers the common half by itself: content is
      // auto-cancel, so a tapped alarm has already gone.
      await mod.dismissAllNotificationsAsync();
      // Same argument one step earlier in an alarm's life: anything still
      // *scheduled* now was scheduled by a previous process, whose rest either
      // resumed with the session (its re-arm schedules a fresh alarm right
      // after this — without the sweep, two announce one rest) or died with
      // it. A pending alarm this process owns can't be caught here: `init`
      // runs once, before the first `scheduleRestAlarm` ever resolves.
      await mod.cancelAllScheduledNotificationsAsync();
      api = mod;
      return mod;
    } catch {
      return null;
    }
  })();
  return ready;
}

async function writeChannel(mod: Api): Promise<void> {
  if (Platform.OS !== 'android') return;
  await mod.setNotificationChannelAsync(CHANNEL, {
    name: channelName,
    // Heads-up and a buzz, no sound: the app's existing answer to "you are not
    // looking at the screen" is a vibration, and a gym does not need a chime
    // every ninety seconds.
    importance: mod.AndroidImportance.HIGH,
    sound: null,
    vibrationPattern: [0, 220, 120, 220],
    lightColor: themeSwatch('blurple', true).accent,
  });
}

/** Name the channel in the user's language. No-op until something needs it. */
export function setAlarmChannelName(name: string): void {
  if (name === channelName) return;
  channelName = name;
  // Only rewrite a channel that already exists — otherwise `init` will create
  // it with the right name the first time anything asks for an alarm. Which is
  // also what keeps this call, made from `<RestAlarm>`'s first render, off the
  // loading path.
  if (ready)
    ready
      .then((mod) => {
        if (mod) return writeChannel(mod);
      })
      .catch(() => {});
}

/**
 * Android 13+ wants POST_NOTIFICATIONS at runtime. Only ever prompts while the
 * answer is still undetermined — a previous "no" is left alone rather than
 * asked again every workout.
 *
 * Called from exactly two places, both of them calm: switching the setting on,
 * and starting a workout. Nothing on the rest path asks — a system dialog three
 * minutes into an exercise lands right where your thumb is going. Both are also
 * where the module itself gets loaded, for the same reason: they are moments
 * you chose, not moments the app arrived at.
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
        channelId: CHANNEL,
        seconds,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: nothing downstream waits on an alarm going away.
 *
 * Only ever cancels through a module that is already up, which costs nothing:
 * an id exists because `scheduleRestAlarm` returned one, and that loaded it. So
 * "no module" and "no id" are the same sentence said twice.
 */
export function cancelRestAlarm(id: string | null | undefined): void {
  const mod = api;
  if (!id || !mod) return;
  try {
    mod.cancelScheduledNotificationAsync(id).catch(() => {});
  } catch {
    /* no notifications on this build */
  }
}

/**
 * Clear the tray. `dismissAll` rather than by id because this app posts nothing
 * else, which makes the two equivalent — and this one cannot be defeated by an
 * identifier that didn't survive the trip through the notification tray.
 *
 * Also loads nothing, and here that is a real trade rather than a free one: it
 * runs on mount and on every return to the app, so a load would be the startup
 * import all over again. Within a process the two are identical — nothing can
 * be in the tray that this app didn't put there. Across a process death they
 * are not, and `init`'s own sweep is what covers the difference.
 */
export function dismissRestAlarms(): void {
  const mod = api;
  if (!mod) return;
  try {
    mod.dismissAllNotificationsAsync().catch(() => {});
  } catch {
    /* no notifications on this build */
  }
}
