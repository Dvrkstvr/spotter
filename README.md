# Spotter

An Android workout logger, built with Expo and React Native. Plan a week, start
the day's routine, and type your numbers set by set while you're standing at the
machine. Two phones can pair over the local radio and train the same session
together — which is where the name comes from: a spotter is whoever is there
for your set, and here that is both the app and the person on the other phone.

It is a faithful implementation of the **Workout Diary v2** design from Claude
Design — the Nocturne design system, dark-only, in German and English.

The icon is two weight plates overlapping, the lens where they meet lit: your
session, your buddy's, and the part you do together. It isn't a drawing —
`npm run icons` renders every asset from the geometry and the palette in
`src/design/tokens.ts`, so a colour change can be followed through.

Renamed from **Workout Diary**; two identifiers deliberately kept the old name,
because both are addresses rather than labels — see below.

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
  missing) and drops `_builds/spotter-<date>-<hash>.apk` — the file to
  sideload on both phones. The build uses the Android SDK/NDK that ships with
  Unity, assembled into `E:\android-sdk` as directory junctions (see
  `android/local.properties`).

  To put that APK on a phone hanging off the USB cable:

  ```bash
  npm run install:apk
  ```

  It takes the newest APK in `_builds/`, installs it over the existing one
  (`adb install -r`, so the diary on that phone survives) and launches it.
  Emulators and adb-over-wifi targets are ignored — this is the cable only.
  `-- --build` builds a fresh APK first, `-- -s <serial>` picks between two
  connected phones, `-- --no-launch` just installs. Signature mismatches
  (a dev build already installed) are reported rather than resolved: the
  uninstall that would fix one also erases that phone's history.

- **Expo Go** (JS-only iteration, mock buddy radio):

  ```bash
  npm start
  ```

  Scan the QR code from Expo Go. Native modules aren't available there, so
  the buddy sync falls back to its mock transport automatically.

iOS config is untouched but unexercised — nothing has been checked on it.

These also exist as double-clickable batch files in the repo root:
`start-app.bat` (plain Metro), `start-emulated.bat` (the full buddy-testing
setup below; takes the emulator count as an optional argument),
`start-phone.bat` (that setup with the cabled phone as one of the two),
`build-apk.bat` (the release APK into `_builds\`) and `install-apk.bat`
(that APK onto the phone on the cable).

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

To have the real phone be one of the two, put it on the USB cable and run

```bash
npm run start:phone
```

which is the same script with `--phone`: the phone becomes one of the two
instances, so only one emulator is booted. `-- 0` boots none (two cabled
phones are the pair), `-- -s <serial>` singles out one of two. Also
double-clickable as `start-phone.bat`. The phone is opt-in rather than
detected, because tethering keeps it on the cable permanently and a plain
`start:emu` must not take it over.

Nothing new is involved: adb reverse is what the emulators already use, and
for the phone it is a path down the cable — no LAN address, no route, no
firewall rule. That is why it works unchanged **while the PC is online through
that same phone's tethering**, where the LAN-mode alternative is exactly what
tethering makes awkward. Toggling tethering re-enumerates USB and drops the
forwards, so they are re-armed every few seconds rather than set once.

The phone runs the app in Expo Go here, not the installed Spotter: where the
native module exists the real radio always wins, and an emulator has no
Bluetooth to answer it. Expo Go keeps its own storage, so that instance is a
scratch diary and the real one is untouched. Installing Expo Go on the phone
is the one manual step — an emulator's is x86_64, so the clone-between-
emulators trick can't reach it.

When the instances are already running but showing stale code (or the
standalone app), put them back on the current sim-radio bundle with

```bash
npm run update:emu
```

which replaces any Metro holding port 8081 with a fresh sim-enabled one and
cold-restarts Expo Go on every emulator so it refetches the JS — a stale
Metro keeps the port and serves old code otherwise, silently. `-- --phone`
includes the cabled phone, which would otherwise be the one instance left on
old code. Also double-clickable as `update-emulators.bat`.

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

### What the rename didn't touch

The app was called Workout Diary. Two identifiers still say so, and both are
load-bearing — they address existing data rather than describe the app, so
renaming them would quietly throw that data away:

- **`android.package`** is `com.calvinkohl.workoutdiary`, not the tidier
  `com.calkoh.spotter`. It is the app's identity to Android. Change it and the
  next install lands *beside* the old app instead of over it, with an empty
  diary, while the real history stays in the old package's storage.
- **`STORAGE_KEY`** in `workout-store.tsx` is `workout-diary/v2`. Same story
  one level down: rename the key and every logged session becomes unreachable
  and the app reads as a first run.

Neither is visible anywhere in the UI — the launcher shows `expo.name`. If the
package id is ever worth changing, it needs an export/import path first, and
both phones migrated in the same session.

## Releasing it

The sideload loop above signs with Expo's debug keystore, which Play will not
accept and which a release-signed build cannot install over. Before the first
real release, read **[docs/release-signing.md](docs/release-signing.md)** —
switching keys costs an uninstall on every phone that already has the app, so
both diaries have to be backed up first.

```bash
npm run build:aab     # the App Bundle Play takes
npm run build:apk     # the APK to sideload
```

Both check that `app.json` and `package.json` state the same version (`npm run
version -- --fix` syncs them, app.json being the source of truth) and print which
key is about to sign. A debug-signed artefact is named `-debugsigned` so the file
says what it is.

Store-submission material lives in `docs/`:

| File | What it is |
| ---- | ---------- |
| [privacy-policy.md](docs/privacy-policy.md) | English privacy policy — needs a public URL and a postal address |
| [datenschutz.md](docs/datenschutz.md) | the German one, for the German listing |
| [play-data-safety.md](docs/play-data-safety.md) | the Data safety answers, with the reason for each, plus the two permission declarations Play will ask about |
| [release-signing.md](docs/release-signing.md) | making the upload key, and the one-time migration off the debug key |

## Checks

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run test
```

Vitest over the pure modules in `src/data` — the storage migrations and backup
merge (`migrate.ts`) and the AI coach's parse/resolve seam (`coach.ts`). Plain
Node, no React Native harness; `npm run test:watch` while working on either.

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

## Licence

Proprietary — see [LICENSE](LICENSE). The open-source components bundled into
the app keep their own terms; the notices they require are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), regenerated with `npm run
licenses`.
