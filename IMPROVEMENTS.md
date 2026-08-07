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

- [x] `finishSession()` carries the exercise list into `summary.saveable` when
      the session was freeform (`rid === null`) and non-empty.
- [x] UI in `summary-modal.tsx` (decided over a separate screen): name field +
      "Save as new routine" button; after saving, the row disappears and the
      note flips to "Saved to your routines."
- [x] Conversion in `saveAsRoutine()`: set count kept per exercise;
      weight/reps from the last ticked set (else last set), falling back to
      the "last time" ghost. Empty name falls back to "New routine".

## 3. Routine selector in the weekly plan

- [x] Replace the tap-to-cycle in `plan.tsx` (`CYCLE` array — hardcoded the
      three seed routine ids, so custom routines couldn't be scheduled) with a
      proper picker: `schedule-sheet.tsx`, z 83, listing all `s.routines` +
      Rest with the current choice checked in the accent. New store field
      `dayPick`, new dict key `chooseRoutine`.
- [x] `weeklyPlan` string kept as-is — "tap to change" still describes the
      new behaviour in both languages.

## 4. Per-language aliases for user-named things

- [x] Muscle groups + equipment (`labels: LangMap`), routines (`names`), and
      custom exercises (`names`, with `name` kept as canonical fallback) are
      per-language. Machine-setup labels deliberately excluded — they're
      freeform per-machine notes, not vocabulary.
- [x] Resolution via store helpers `gInfo`/`kInfo`/`rInfo`/`exInfo` →
      `{ text, missing }`; `missing` renders with the shared `missingName`
      style (greyed italic) across every screen and sheet.
- [x] Editing writes the active language: settings rows and the routine title
      input show the current-language value with the other language's name as
      grey placeholder — typing adds the translation. Search matches every
      language's alias.
- [x] Defaults seeded in both languages (Chest/Brust, Barbell/Langhantel,
      Chest A/Brust A, …) so switching language now translates them; v1
      storage blobs migrate on first load (untouched defaults regain both
      languages, user-named things file under the blob's language).

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

- [x] **Persistence.** The durable slice (`PERSIST` in the store) is one JSON
      blob in AsyncStorage — hydrated on launch, debounce-saved (400 ms) on
      change. Transient UI and the live session reset on restart; `buddy` too,
      since a connection can't survive one.
- [x] **Real date.** `src/data/date.ts` replaces `TODAY_DOW`/`TODAY_DOM`;
      the Plan grid computes the real current month; date labels are formatted
      per language (`fmtDay*` in i18n.ts) instead of dictionary constants.
- [x] **Real history.** `done: number[]` became `history` (real ISO dates +
      routine id): the "last done N days ago" label is computed (hidden until
      a routine has history), and `finishSession()` writes ticked numbers to
      `lastLog`, which feeds the "last time" ghosts and the exercise sheet's
      last-session rows with their real date.

## Suggested order

1 (small, half done) → 3 (small) → 2 (medium) → 6 (persistence at least) →
4 (model change) → 5 (depends on 4, needs the transport decision).
