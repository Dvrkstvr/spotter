# Improvements

Working list, in the order we'll go through them. Check items off as they land.

## 1. Finish workout from the last exercise + completed state on Today

- [X] **Verify on-device:** the "Finish workout" row on the last exercise is
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

- [x] **Transport: mock now, swappable later** (decided). Real BLE can't run
      in Expo Go and the project is pinned to SDK 54, so the flow is built
      against `buddy-transport.ts` — three canned peers, canned latency,
      canned snapshots. A real transport reimplements its three functions
      (`scanPeers` / `connectPeer` / `sendToPeer`) and nothing else. Receives
      genuinely merge into the store and persist; sends are simulated, and the
      screen's demo note says so.
- [x] **Sync model.** `buddy-sync.ts` diffs the shareable slice (groups,
      equipment, custom exercises, routines) by key/id in both directions,
      plus missing translations (a language filled on one side, empty on the
      other — the #4 alias model). Imports pull their dependency closure:
      a routine brings its custom exercises, an exercise its group/kind.
- [x] **Buddy sync screen.** `buddy-sync-overlay.tsx`, z 79, own back
      handling: two sections ("Missing on your device" / "Missing on
      {name}'s"), per-row Transfer, Transfer all, Added/Sent marks, in-sync
      note. Pairing in the scan sheet opens it directly; the Profile buddy
      card gains a Sync button. Mock peers are staged to exercise every case
      (Jonas: bilingual extras + a routine with a custom-exercise dependency;
      Mira: German-only items; Tom: nothing, so your stuff shows sendable).

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

## 7. Real buddy radio: dev build + Google Nearby Connections

Follow-up to #5's mock-transport decision, after the app proved itself in
real gym use.

- [x] **Development build.** Composite Android SDK at `E:\android-sdk`
      (junctions into Unity 6000.5.0f1's SDK + NDK 27.2, licenses accepted by
      hand), `expo prebuild` with package `com.calvinkohl.workoutdiary`,
      `expo-dev-client` + `expo-build-properties` (NDK pin). `android/` stays
      gitignored — regenerate, don't edit.
- [x] **Native module** `modules/expo-nearby-buddy`: Kotlin Expo module over
      Google Nearby Connections (P2P_POINT_TO_POINT, byte payloads, one
      service id), all events forwarded to JS. Manifest carries the full
      Android 7→14 permission matrix; runtime requests happen JS-side via
      PermissionsAndroid (`ensureRadioPermissions`).
- [x] **Radio integration.** `buddy-radio.ts` bridges the module optionally —
      Expo Go gets `null` and keeps the mock everywhere. `<BuddyRadio>`
      (mounted with the overlays) owns the lifecycle: advertise+discover
      while scanning or waiting, auto-accept, snapshot exchange on connect,
      incoming items merged via the same `importFromPeer`. Scan sheet lists
      live endpoints; sync overlay reads `s.buddySnapshot` for both
      transports; sends go over the air for real.
- [X] **Field test with the buddy's phone** — install the release APK on both
      phones, pair in person, sync. Pre-Android-12 phones need Location
      Services ON for discovery (OS requirement, not ours).
- [x] ~~Later~~ (done as the redone invite flow, 7 Aug): pairing is now
      code-gated — both phones show Nearby's auth digits in the share sheet
      and both confirm (`pendingAuth`, `rejectConnection` added to the native
      module); the Profile button reads "Share session" and the sheet is
      framed as share mode (only others in share mode appear — both open it,
      which was always true but never said). A pairing then stands until
      Disconnect or app termination: the radio keeps looking whenever the
      link drops, re-pairs the known buddy silently, and strangers knocking
      outside share mode are auto-rejected. Profile shows Connected /
      Reconnecting… live.

## 8. Shared buddy workouts — train the same routine together

Calvin's idea, sharpened in discussion (7 Aug 2026): both phones do the same
routine, live over the real radio. Core principle decided up front:
**two synced sessions, not host-controls-client** — each phone runs its own
session and broadcasts progress; every coordination cue (whose turn, who's
waiting) is displayed, never enforced. Advisory, non-blocking, because a
forgotten tick must never freeze the buddy's screen mid-workout.

- [x] **Join prompt, not forced start.** Starting a routine while connected
      sends a session invite carrying the starter's routine content plus its
      custom-exercise/group/kind dependencies (starter's version wins — this
      also transfers/updates the routine on the spot). The buddy gets a
      one-tap "Train together?" sheet (`buddy-invite-sheet.tsx`, z 89);
      decline is fine and visible to the host.
- [x] **Live progress.** Both sides broadcast full session state (current
      exercise, per-set ticks, finished) on every change, debounced 250 ms,
      from `<BuddyRadio>`. Full state, not events — that makes reconnect
      resync free. Discard reads as "finished" to the buddy (v1).
- [x] **Buddy panel** in the session overlay's buddy bar: waiting-to-join,
      declined, same exercise (their set count + turn hint), different
      exercise (ahead/behind + one-tap jump when it's in my list), waiting
      for me, finished, connection lost. Turn hint per exercise with an
      alternate/parallel chip; fewer completed sets goes next, ties go to
      the host.
- [x] **Reconnect.** While a shared session is live and the endpoint is
      gone: keep advertising/discovering, auto-request the known buddy by
      name, auto-accept silently (no sync screen popping over the session),
      resend snapshot + full progress on reconnect. `useKeepAwake` while a
      session is open. Closing the Buddy sync screen no longer disconnects —
      the connection is the substrate for co-sessions; Disconnect on the
      Profile card is the explicit teardown.
- [x] **Today-card indicator** while connected: today's routine vs the
      buddy's snapshot via `routineEquals` (content, not id) — in sync
      (accent check) / differs / missing on their phone.
- [x] v1 boundaries: freeform sessions don't share; each phone logs only its
      own numbers; no abandon signal beyond disconnect; routine conflict
      resolution beyond "starter wins at invite" stays in Buddy sync later.
      Profile's "Connected" label still reflects pairing, not the live link.
- [x] **Minimal bar + Profile detail** (follow-up request): the session's
      buddy bar shows one glanceable line (turn hint or status) and tapping
      it tucks the session behind the tabs (`sessionMin`) and opens the
      Profile tab, which gains a Live-session card: full status, turn-mode
      chip, jump control, and a per-exercise you-vs-buddy progress table
      (accent = active on each side). The tab-bar buddy strip becomes the
      "Back to workout" resume strip (name + running clock) while minimized.

## Suggested order

1 (small, half done) → 3 (small) → 2 (medium) → 6 (persistence at least) →
4 (model change) → 5 (depends on 4, needs the transport decision).
