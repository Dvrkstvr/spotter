# Improvements

Working list, in the order we'll go through them. Check items off as they land.

## 1. Finish workout from the last exercise + completed state on Today

- [ ] **Verify on-device:** the "Finish workout" row on the last exercise is
      already implemented (`session-overlay.tsx`, commit `d89227a`) — the last
      card's footer row calls `finishSession()` and reads in the accent. If the
      phone still shows "Next exercise", the running bundle is stale; reload
      and confirm before touching this.
- [x] **Today card completed state — the actually missing half.**
      When `doneToday`, the hero's "last done" text swaps for an accent check +
      "Completed today", and the Start button demotes to secondary with
      "Start again". (The `doneToday` flag, imports, and both dictionary
      strings were already in place from `d89227a` — this wired them up.)

## 2. "Save as new routine" after finishing an empty session

- [ ] When `finishSession()` runs on a session with `rid === null` (freeform /
      empty start) and a non-empty `list`, offer saving it as a routine.
- [ ] UI: extend `summary-modal.tsx` with a name field + "Save as routine"
      button rather than a whole new screen — the summary modal is already the
      post-workout moment, and overlays are added in `overlays/index.tsx`
      z-order.
- [ ] Conversion: each `SessionExercise` → routine item
      `{ ex, sets: sets.length, reps, w }`, taking reps/weight from the logged
      numbers (mode or last set — decide when implementing; `prevNums` helps).
- [ ] Store: needs `rid` (or a `wasFreeform` flag) and the finished `list`
      carried into `summary`, since `session` is nulled on finish.

## 3. Routine selector in the weekly plan

- [ ] Replace the tap-to-cycle in `plan.tsx` (`CYCLE` array — hardcodes the
      three seed routine ids, so custom routines can't be scheduled at all
      today) with a proper picker.
- [ ] Reuse the existing sheet pattern: a small sheet listing all
      `s.routines` + "Rest", in the style of `pick-workout-sheet.tsx`. Tapping
      a weekday row opens it for that day.
- [ ] Update the `weeklyPlan` string ("Weekly plan · tap to change") in both
      languages to match the new behaviour.

## 4. Per-language aliases for user-named things

- [ ] Applies to everything the user can name: muscle groups + equipment
      (`Labelled` in the store), custom exercises, routines, machine-setup
      labels.
- [ ] Data model: label becomes per-language, e.g.
      `label: Partial<Record<Lang, string>>` with the language it was created
      in filled. `gLabel`/`kLabel` (and friends) resolve current lang →
      fallback to any available lang.
- [ ] Display: when the current language has no alias, show the fallback
      greyed (`color.neutral600`-ish, from tokens) — the visual cue that it
      still needs translating.
- [ ] Editing: in Settings (and wherever the thing is named), editing while in
      language X writes the X alias; an untranslated entry's field shows the
      fallback as placeholder.
- [ ] Migration: seed data (`DEFAULT_GROUPS`, `DEFAULT_KINDS`) already exists
      in both languages via the dictionary — decide whether defaults keep
      using dict keys or move to the same per-language structure.

## 5. Buddy invite + buddy sync screen

The big one. Currently the buddy is a mock: hardcoded nearby list, no
transport, pairing just sets a name (`scan-sheet.tsx`).

- [ ] **Transport decision first.** Real Bluetooth needs a native module
      (e.g. `react-native-ble-plx`) which does **not** run in Expo Go — and
      this project is pinned to SDK 54 because Expo Go is the only way the app
      runs on the phone (see AGENTS.md). Options:
      1. move to a development build (unblocks BLE, drops the Expo Go
         constraint — README already sketches this),
      2. sync over local network / internet instead of BLE,
      3. build the whole sync flow against a mock transport now, swap the
         real one in later.
- [ ] **Sync model.** Every user can add their own groups, equipment,
      exercises, aliases — so a shared session can reference things missing on
      the other device. Diff what the session needs against what the peer has:
      custom exercises, groups/kinds (with aliases from #4), setups, images.
- [ ] **Buddy sync screen.** New overlay (registered in `overlays/index.tsx`,
      own `useBackClose`): lists missing items and missing translations on
      either side, each transferable with a tap, plus a "transfer all".
- [ ] Depends on #4 — the alias model defines what a "missing translation"
      even is, so do #4 first.

## 6. Go live: persistence, real date, real history

Everything is currently seed data, frozen in memory (README "Known gaps").

- [ ] **Persistence.** AsyncStorage (`@react-native-async-storage/async-storage`,
      works in Expo Go SDK 54): hydrate the store on launch, debounce-save on
      every `patch()`. The state is already one JSON-serializable object with a
      single choke point, so this is cheap. expo-sqlite only if history
      outgrows it.
- [ ] **Real date.** Derive today from `new Date()` instead of
      `TODAY_DOW`/`TODAY_DOM`; compute the Plan month grid (first weekday,
      day count) instead of the fixed August 2026.
- [ ] **Real history.** `done` becomes real dates, not day-of-month numbers;
      "last done 7 days ago" computed from history; `finishSession()` writes
      the logged numbers back so "last time" ghosts come from actual sessions
      instead of static `lastSets`.
- [ ] Order matters: persistence first (worthless to log real history that
      evaporates), then date, then history.

## Suggested order

1 (small, half done) → 3 (small) → 2 (medium) → 6 (persistence at least) →
4 (model change) → 5 (depends on 4, needs the transport decision).
