# Workout Diary

An Android workout logger, built with Expo and React Native. Plan a week, start
the day's routine, and type your numbers set by set while you're standing at the
machine.

It is a faithful implementation of the **Workout Diary v2** design from Claude
Design — the Nocturne design system, dark-only, in German and English.

## Running it

Two ways, and both stay supported:

- **Standalone / dev build** (the real app, with the real buddy radio):

  ```bash
  npm run android
  ```

  That runs `expo run:android` — Gradle-builds the native project and installs
  it on a connected device. A shareable release APK comes from

  ```bash
  npm run build:apk
  ```

  which Gradle-builds `assembleRelease` (regenerating `android/` first if it's
  missing) and drops `_builds/workout-diary-<date>-<hash>.apk` — the file to
  sideload on both phones. The build uses the Android SDK/NDK that ships with
  Unity, assembled into `E:\android-sdk` as directory junctions (see
  `android/local.properties`).

- **Expo Go** (JS-only iteration, mock buddy radio):

  ```bash
  npm start
  ```

  Scan the QR code from Expo Go. Native modules aren't available there, so
  the buddy sync falls back to its mock transport automatically.

iOS config is untouched but unexercised — nothing has been checked on it.

These also exist as double-clickable batch files in the repo root:
`start-app.bat` (plain Metro), `start-emulated.bat` (the full buddy-testing
setup below; takes the emulator count as an optional argument), and
`build-apk.bat` (the release APK into `_builds\`).

### Testing the buddy features without two phones

Real Nearby Connections needs Bluetooth hardware, which emulators don't have.
The sim radio replaces just the transport — a WebSocket to a relay on the dev
machine — while every line of app code above the native module runs for real:
discovery, the pairing code, sync, shared workouts, reconnects.

```bash
npm run start:emu
```

One command: boots up to two emulators (`-- 1` for just one), opens the relay
in its own console window, and starts Metro with the sim enabled — then press
`a` to open the app on an emulator, `shift+a` to pick which. Everything is
skip-if-already-there, so rerunning it reuses running emulators and the open
relay. Needs the Android emulator plus AVDs installed once (Android Studio's
Device Manager is the easy way; the script prints the alternatives).

Without emulators the two halves also run by hand — the relay plus a
sim-enabled Metro, with the app in Expo Go on one or two phones:

```bash
npm run buddy-relay
```

```bash
npm run start:sim
```

Either way, any combination of instances works — two emulators, emulator plus
phone, two phones. Each instance appears in the
other's share sheet exactly as a real phone would; pair them with the code as
usual. The relay derives nothing from the app: killing it (or pressing
`d`+Enter in its terminal) severs the link mid-session, which is the easy way
to exercise the link-lost and reconnect paths.

`EXPO_PUBLIC_SIM_RADIO` is inlined at bundle time: plain `npm start` never
includes the sim, and release builds (`__DEV__` false) ignore it entirely. On
a device where the native module exists, the real radio always wins.

### Why SDK 54 and not the latest

Expo Go supports exactly one SDK at a time, and the Play Store won't serve a
newer Expo Go than 54.0.8 to this phone — its Android version is below what the
newer builds require. So the project was pinned to SDK 54 to match. The app
itself only needs Android 7.0 (`minSdkVersion` 24); it's Expo Go that's fussy,
not the app.

The dev build now exists (see "Running it"), so Expo Go's ceiling no longer
hard-blocks an SDK upgrade — it would just cost the Expo Go workflow. Still
pinned to 54 for now to keep both paths alive.

## Checks

```bash
npm run typecheck
```

```bash
npm run lint
```

## What's in it

Five tabs, plus a Plan screen reached from Today:

| Screen        | What it does                                                        |
| ------------- | ------------------------------------------------------------------- |
| **Today**     | The day's planned routine, the week at a glance, start anything else |
| **Plan**      | August at a glance; tap a weekday to cycle what's scheduled on it    |
| **Routines**  | Saved workouts, each opening into an editor                          |
| **Exercises** | Searchable library with equipment filters and how-to sheets          |
| **Profile**   | Your details, a Bluetooth training buddy, and your totals            |

Starting a workout opens the logging screen over everything: one card per
exercise, the focused one expanded to its set rows. Last time's numbers sit
greyed beside each row — tap them to copy them in, or just tick the set and they
fill themselves.

Settings (the gear on Profile) owns the two lists the rest of the app reads:
muscle groups and equipment. Rename one and it changes everywhere; leave a label
blank and that entry becomes a divider in the library instead of a heading.

## Layout

```
src/
  app/            expo-router routes — root layout, (tabs) group
  components/     shared UI, plus overlays/ for the sheets and full-screen panels
  design/         tokens.ts and ui.tsx — the Nocturne design system, ported
  data/           exercise library, default routines, en/de dictionary
  store/          workout-store.tsx — all app state and its mutators
  hooks/
```

`src/design/tokens.ts` is the port of the design system's `styles.css`. If the
design system changes, change that file — the rest of the app reads from it and
hardcodes nothing.

## Known gaps

These are deliberate, and each is called out in the code:

- **The buddy radio is real in the dev build, mock in Expo Go.** The sync
  flow (diff both devices, transfer missing items and translations) runs on
  Google Nearby Connections — Bluetooth + Wi-Fi Direct, no network needed —
  via the local native module in `modules/expo-nearby-buddy`, bridged by
  `src/data/buddy-radio.ts` and orchestrated by the always-mounted
  `<BuddyRadio>` controller. In Expo Go the native module doesn't exist and
  everything falls back to the canned transport in
  `src/data/buddy-transport.ts`, where sends are simulated (the screen says
  so) — unless the sim radio is enabled (see "Testing the buddy features
  without two phones"), which restores the full live flow over a dev-machine
  relay. First pairing is gated by Nearby's authentication digits (the
  invitee shows them, the inviter types them); a standing pairing reconnects
  silently.
- **Routine editing has no Edit mode.** The button toggles its own label and
  nothing else — faithful to the design, where the rows are always editable.

Two of the original gaps have since been closed, as departures from the
design (which was in-memory and pinned to Friday 7 August 2026):

- **State persists.** The durable slice — routines, schedule, history, logged
  numbers, profile, settings — lives in AsyncStorage as one JSON blob; open
  overlays and the live session deliberately reset on restart. See `PERSIST`
  in `src/store/workout-store.tsx`.
- **"Today" is live.** Dates come from `src/data/date.ts`; the Plan screen
  shows the real current month; finished sessions are logged by real date and
  feed the "last time" ghosts and "last done N days ago".
