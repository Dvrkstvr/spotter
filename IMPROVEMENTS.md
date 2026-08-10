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
- [x] **Field feedback round (8 Aug):** the tapped row flips to "Invite
      sent"; the code now shows only on the invitee (who accepts up front —
      Cancel still rejects) while the inviter types it in, auto-checked at
      full length with a wrong-code hint. The typed code is the pairing gate:
      it proves the inviter is physically reading the invitee's screen.

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

## 9. Polish round (9 Aug 2026)

Six things Calvin wanted right after the app settled into real use.

- [x] **Rest day says something instead of offering nothing.** The hero's
      "Start Rest day" button became a line — `restNote`, "Enjoy your day to
      the fullest." The freeform row under the week is unchanged, so a rest day
      that turns into a session is still one tap.
- [x] **The tab bar's buddy strip is tappable**, like the session's already
      was: both set `buddyFocus`, and Profile scrolls its buddy section into
      view once and clears the flag (`Screen` grew an optional `scrollRef`).
- [x] **Session screen overhaul.** One exercise per screen; the set you're on
      is a raised row with 22px numbers; the list, Add exercise, Discard and
      Finish moved into the overview sheet behind the "3 / 5" chip; one primary
      button at the bottom (Log set → Next exercise → Finish workout) that
      lands directly above Android's keyboard, since `softwareKeyboardLayoutMode`
      is `resize`. Swipe left/right between exercises. Decided against a custom
      in-app keypad for now (Calvin's call) — the layout is the fix, the OS
      keyboard stays.
  - [x] **9a. The turn is in the exercise**, not only in the bottom bar: turn
        line, their set count, and the alternate/parallel chip that sets it,
        all in one row between the exercise and its sets.
  - [x] **9b. Turn modes sync.** `turnModes` became `Record<string, TurnChoice>`
        — a last-writer-wins register per exercise (higher `rev` wins, ties to
        the host) carried inside the existing full-state `progress` broadcast.
        Adopting never bumps a rev, which is what stops the two phones echoing.
- [x] **Disconnect ends it for both.** A new `bye` message: the tapping phone
      sends it before `stopAll`, the receiver runs `endPairing` and stops
      looking for them. Live sessions are deliberately left running — see the
      deviation note in AGENTS.md.
- [x] **Exercises are editable**, seeded library included: name (per language),
      muscle group, equipment in the exercise sheet's edit mode; cues in the
      How-to sheet's. Custom exercises are edited in place; seeded ones through
      the `exEdits` / `cueEdits` override maps, with Reset to the original.
      Logged history stays read-only (Calvin's call). Both maps are additive
      `PERSIST` keys, so no storage version bump.
- [x] **The routine editor's dead Edit button is gone**, and with it the
      `editing` flag it was the only reader of.

Open, deliberately not done: deleting a custom exercise.

## 10. Logging without the keyboard (9 Aug 2026)

Second round on the session screen, once the layout was there to react to.

- [x] **Enter walks the row.** Weight → `returnKeyType="next"` +
      `submitBehavior="submit"` hands focus to reps without dropping the
      keyboard; reps → `done` logs the set. Which meant picking one logging
      control: the per-set tick box stayed and the "Log set" button went, since
      the box is also the only way to un-tick. The footer is navigation only
      now (Next exercise / Finish workout).
- [x] **Hold-drag to change a number.** `NumCell` watches touches in the
      capture phase and claims the gesture only after the finger has been
      still for 220 ms — so a tap still focuses the field and a straight drag
      still scrolls. Then up/down steps 0.5 kg or 1 rep per 12 px, starting
      from last time's figure when the cell is empty. The list's
      `scrollEnabled` goes off for the duration.
- [x] **Add set is a hold**, styled as the ledger row it was (the fill is the
      only thing that reads as a button, and only while held).
- [x] **Their turn looks like their turn.** Your next set goes dashed and
      loses the accent while the buddy is mid-set, with `3:00` counting down
      on it and "Start now ›" for when it isn't three minutes. `rest` in the
      store, counted in `elapsed` ticks.
- [x] **"Waiting for you" no longer fires when nobody is waiting.** If the
      buddy finished the exercise and so have you, the line reads "Both done —
      ready for the next exercise" (`stBothDone`) instead — the parallel-mode
      case that made it wrong.

### Fixes on top (same day)

- [x] **The guest was stuck on "waiting for {name} to join".** Two halves: the
      host's session started before the guest accepted, so nothing re-fired
      the progress broadcast — `buddyJoin` joined the broadcast effect's deps.
      And the pending line is role-aware now: the host waits for an answer
      (`stPending`), the guest is only waiting for the first message
      (`stJoining`). The starter going first needed no new control — the
      turn tie already goes to the host, and "Start now ›" is the guest's way
      out of waiting.
- [x] **The rest ended when the buddy finished, not when it was over.** The
      clock now starts on *your own* logged set and runs its full three
      minutes whatever they do. `rest.own` tells the two waits apart: a rest
      you earned outlasts the turn coming back, a wait that exists only
      because it's their turn ends with it — otherwise a guest who had lifted
      nothing yet would be held three minutes at the start of a session.

## 11. One way out, and a way back in (9 Aug 2026)

- [x] **Discard is gone**; Finish is the only exit from a session and now
      carries Discard's job too — `finishSession` skips the `history` entry
      when nothing was ticked, so an accidental start doesn't land on the
      calendar as a training day. The empty-session note says so.
- [x] **Ask to join.** `joinAsk` / `joinReply` are the other direction from
      `sessionInvite`, for the buddy who missed it or arrived late. A yes is
      answered with the ordinary invite, which the asker's phone accepts
      without a second prompt (`joinSent === 'waiting'`) — one join path, not
      two. A no, or an ask to someone who isn't training, comes back as a line
      on Profile. `join-ask-sheet.tsx`, z 89, beside the invite.
- [x] **A roster of paired buddies** (`knownBuddies`, persisted) under Share
      session: name, live state (Connected / Nearby / Not nearby), Ask to join
      or Connect, and × to forget. Pairing remembers; both Disconnect and ×
      send `bye` first, or the other phone reconnects through the teardown.
- [x] **The roster is permanent** (asked for right after): a name only leaves
      it by ×. Seeing who is around when you happen to be in the same gym is
      the point of the list, and that needs it to outlast every dropped link —
      so Disconnect can't be an unpairing. Rows say nothing rather than "Not
      nearby" while a link is up, since the radio has stopped looking and
      can't know.
- [x] **Every link is a handshake** (asked for right after that): the Connect
      button became **Request a session**, and the radio no longer connects to
      anyone on the roster on its own — the one exception is back to the buddy
      of the session in progress, where a drop has to heal by itself. Asking
      is what opens the link, the ask is answered on the other phone, and a no
      takes the link down with it (flushed before the disconnect, or their
      phone reads the refusal as a drop and comes back to ask again). Dropped
      mid-ask counts as a no, for the same reason.
      This also deleted `avoided` and `resumeBuddy` from the round before:
      with nothing auto-connecting, clearing `buddy` is all a disconnect
      needs to stick.
- [x] **The radio stays findable** whenever the roster isn't empty (Calvin's
      call over the cheaper "only while you're looking"): known names are
      auto-accepted with no code, so two paired phones re-find each other after
      a restart with nobody tapping anything.

## 12. Settings, properly (10 Aug 2026)

Calvin: "tidy up the settings view and add some more functionality — light and
dark mode, maybe even some colour themes. Also add all of the muscle groups
and translate them properly into German." Plus, chosen from the options: a
private mode, a rest-timer length, backup & restore, and haptics.

- [x] **Light mode and six colour themes, derived from Nocturne rather than
      authored next to it.** The ported palette turned out to be a system
      (one shared lightness ladder, one hue per ramp), so a theme is that ramp
      hue-rotated in OKLCH and light mode is the palette reflected about its
      own background. Blurple + dark stays byte-identical to the ported hex.
      Mode is System / Light / Dark; `userInterfaceStyle` in `app.json` went
      to `automatic` so the OS can be asked.
- [x] **The machinery to make a palette swap reach `StyleSheet.create`**:
      `themed()` + `useThemed()` in `src/design/theme.tsx`, and every sheet in
      the app converted. The sharp edge is the React Compiler — see the
      "Themes" section of AGENTS.md, which is the part worth reading before
      touching a colour again.
- [x] **Muscle groups: 3 → 20**, head to toe, both languages, with `Other`
      kept last as the catch-all. Seeded exercises refiled (lat pulldown →
      Lats, reverse pec deck → Shoulders, curl → Biceps …). Storage went to
      `v3`: the migration adds only keys that are *new* in v3, so a group
      someone deleted stays deleted and every rename is kept.
- [x] **Rest between sets is a setting** (`restSeconds`, Off/1:00/1:30/2:00/
      3:00/5:00) rather than the hardcoded 180.
- [x] **Haptics** (`src/data/haptics.ts`) on the same grammar as motion: the
      lightest impact for a ticked set, which happens forty times a session;
      the louder notification for a rest running out, which you feel from a
      pocket. Toggle in Settings.
- [x] **Train alone** — a privacy switch that unmounts `<BuddyRadio>` and the
      buddy sheets and hides the buddy half of Profile. Paired names are
      remembered; turning it on says `bye` first.
- [x] **Backup & restore** — the durable slice as one JSON file through the
      share sheet, and back in through the document picker, behind an envelope
      check and a last-moment confirm.
- [x] **Settings reordered** by how often it is opened for a thing:
      Appearance, Workout, Privacy, Language, the two long lists, Data, About.

Open: equipment is still the original five (no bands/kettlebell/Smith); units
are kg-only.

## Suggested order

1 (small, half done) → 3 (small) → 2 (medium) → 6 (persistence at least) →
4 (model change) → 5 (depends on 4, needs the transport decision).
