# Workout Diary

An Android workout logger, built with Expo and React Native. Plan a week, start
the day's routine, and type your numbers set by set while you're standing at the
machine.

It is a faithful implementation of the **Workout Diary v2** design from Claude
Design — the Nocturne design system, dark-only, in German and English.

## Running it

```bash
npm run android
```

That starts the dev server and opens the app on a connected device or emulator.
`npm start` alone gives you the QR code and the usual Expo menu.

The app targets Android and runs in **Expo Go**. iOS config is untouched but
unexercised — nothing has been checked on it.

### Why SDK 54 and not the latest

Expo Go supports exactly one SDK at a time, and the Play Store won't serve a
newer Expo Go than 54.0.8 to this phone — its Android version is below what the
newer builds require. So the project is pinned to SDK 54 to match. The app
itself only needs Android 7.0 (`minSdkVersion` 24); it's Expo Go that's fussy,
not the app.

To move to a newer SDK later, build a development build instead of relying on
Expo Go — that's your own client APK, so Expo Go's ceiling stops applying. The
Android SDK bundled with Unity on this machine is enough to build one locally.

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

- **Nothing persists.** State is in-memory, as the design is. Close the app and
  it reseeds. Persistence is the first real feature to add.
- **"Today" is fixed to Friday 7 August 2026.** The design pins it, and its seed
  data — the logged days, "last done 7 days ago" — is written around that date.
  See `TODAY_DOW` / `TODAY_DOM` in `src/design/tokens.ts`.
- **The buddy is a mock.** The nearby-devices list is hardcoded; there is no
  Bluetooth. Pairing sets a name and shows the strip.
- **Routine editing has no Edit mode.** The button toggles its own label and
  nothing else — faithful to the design, where the rows are always editable.
