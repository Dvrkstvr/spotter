# Spotter

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before
writing any code.

**This project is pinned to SDK 54 on purpose.** Calvin's phone is too old for
any Expo Go newer than 54.0.8, and Expo Go only ever supports one SDK. A dev
build now exists (see "Running it" in the README) so the pin is no longer
load-bearing, but keep it until an upgrade is actually wanted — Expo Go is
still the fast JS-iteration path and must keep working, which also means:
never import a native module directly from app code. Go through an optional
bridge like `src/data/buddy-radio.ts` (`requireOptionalNativeModule` + a
mock fallback), so Expo Go degrades instead of crashing.

Native side: `android/` is generated (gitignored) — change `app.json` and
rerun `npx expo prebuild --platform android`, don't edit `android/` by hand.
The Android SDK/NDK comes from Unity via junctions at `E:\android-sdk`
(licenses hand-accepted there). Local native modules live in `modules/`.

## What this project is

An Android workout logger built from the **Workout Diary v2** design in Claude
Design (project `4c9a34bb-759f-4961-8040-29e00e6aae7a`, file
`Workout Diary v2.dc.html`). The design is the spec. When code and design
disagree, that's a bug in the code unless someone decided otherwise on purpose.

The app ships as **Spotter** — the design keeps its own name, so a reference to
"Workout Diary v2" means the design file, not the product. The brand assets in
`assets/images/` are generated, not drawn: `npm run icons` renders all six from
the geometry in `scripts/make-icons.mjs` and a palette mirrored from
`tokens.ts`. Edit the script, never the PNGs, and mirror any colour change
rather than inventing one.

The design system is **Nocturne** — dark-only, Inter, a blurple accent. Its
`styles.css` is ported to `src/design/tokens.ts` (values) and `src/design/ui.tsx`
(the `.btn` / `.input` / `.tag` / `.seg` / `.field` / `.hr` classes).

The app now also has a light mode and six colour themes, which Nocturne does
not — see "Themes" below. The default (blurple, dark) is still byte-identical
to the ported palette, and that is the property to preserve.

## Rules that matter here

- **Never hardcode a colour, radius, spacing, or animation timing.** Everything
  comes from `src/design/tokens.ts`. If a value isn't there, it belongs there.
- **Themes: a colour is read one of exactly two ways.** Inside a sheet —
  `themed(() => ({ … color.text … }))`, read back with `useThemed(sheet)` — or
  during render, from `useColors()`. Reading the `color` import during render
  compiles but does not work, and the failure is silent: see "Themes" below.
- **Motion goes through `motion.*` in tokens** — `tap` / `quick` / `move` /
  `hold` / `payoff`. The governing rule is *the more often a moment happens, the
  quieter its animation*: a set gets ticked forty times a session, so it gets
  `quick`; `payoff` is the system's one overshoot and is reserved for
  once-per-workout moments (the seal pop, the summary). Spend it sparingly or it
  stops meaning anything. Prefer the native driver — that rules out animating
  `width`/`height`/colours, so animate `scaleX` on a left-anchored fill or
  cross-fade two layers instead. The hand-tuned decorative tails — fades,
  glows, the counter nudge, the hold rewind — are durations in `linger`,
  named for the role; a screen never carries a raw timing literal.
- **Small controls share one reach.** Every × glyph, grip and shutter is drawn
  at 20–26px and takes `hitSlop={slop}` from tokens — no per-site guesses, so
  no two ×s in the app are differently hard to hit. The selectable pill is
  `Chip` in ui.tsx (radio semantics, `missing`-translation styling built in);
  four screens had hand-rolled it apart before it was extracted.
- **`color-mix()` has no RN equivalent** — use the `wash.*` helpers in tokens,
  which resolve to literal rgba. Don't inline your own.
- **CSS letter-spacing is em, RN's is px.** Always go through `tracking(size, em)`.
- **All state lives in `src/store/workout-store.tsx`**, a direct port of the
  design's `Component` class — same shape, same mutators. Add state there, not in
  a screen.
- **A set row is two fields and a tick; `Measure` only decides what they
  mean.** `load` is kg × reps — the default, and what every lift is. `time` is
  kg × seconds for a hold (the left field stays weight, because a weighted
  plank is a real set). `distance` is km × minutes. `duration` is minutes and
  nothing else. Read it through `measureOf(ex)`, never `ex.measure`: absent
  means `load`, so nothing that predates the type has to be touched. Four
  rules follow, and each is a place the row's shape stops being enough:
  - **Only `load` multiplies into volume.** Kilo-seconds and kilometre-minutes
    are not units, and quietly adding a plank or a run to the summary's one
    number would make it a lie. `totals()` gates on the measure.
  - **An empty left field means two different things.** Bodyweight on a lift
    or a hold, an *unrecorded* distance on a run — so it is written `BW` or
    `—` (`blankOf`), and `prevNums` hands the dash back as an empty string
    rather than parse it. Anything that formats or reads a `"70 × 8"` string
    has to ask which measure it belongs to.
  - **`duration` is drawn with one field but still stored with two.** The
    logged string stays `"— × 90"`, so `LoggedSet`, `prevNums` and the whole
    persistence format keep exactly one shape; only the row collapses
    (`isSingle`), and `prevLabel` drops the dash on the way to the screen.
    Rendering it as two cells with the left permanently dashed was the cheap
    alternative and reads as a bug rather than a decision.
  - **The measure is fixed when the exercise is made.** Not in `editEx`, not
    in `exEdits`. Because every measure shares one stored shape, changing it
    later would not *break* the history — it would silently re-read `"— × 90"`
    as 90 reps, which is worse than breaking.

  This is what lets a run and a bench press share one screen instead of
  needing two. **The library it draws is deliberately asymmetric: the app
  ships no `duration` exercise and lets you make as many as you like.** A
  football entry in a lifting app's default library is clutter for almost
  everyone, but a Saturday the app cannot hold is a Saturday
  `loggedThisMonth()` gets wrong — and this is a diary. Ship narrow, allow
  wide. Which is also why routine rows carry a `unitTag`: one grid, shared
  column headers, and a routine that may mix all four.
- **The React Compiler is on** (`experiments.reactCompiler` in `app.json`). That
  means no reading or writing `ref.current` during render. Lazy `useState` for
  `Animated.Value`; update latest-value refs inside an effect.
- **Overlays are siblings of the navigator**, rendered from
  `src/components/overlays/index.tsx` in the design's z-order. That is what lets
  them cover the tab bar. Adding one means adding it there, in the right place.
- **Each overlay owns its own back handling** via `useBackClose`. There is no
  central back router — BackHandler runs listeners newest-first, which is what
  makes the layering work. Don't re-register on every render or it breaks.
- **`android.package` and `STORAGE_KEY` still say `workout-diary`.** They are
  addresses, not labels: the package id is the app's identity to Android and
  the key is where a phone's logged sessions actually live. Renaming either to
  match the app loses real training data — a new package installs beside the
  old app with an empty diary, a new key reads as a first run. Both are
  commented at their site; leave them alone unless you are also writing the
  migration.

## Themes

Nocturne is dark-only and blurple-only. The app has a light mode and six
colour themes on top of it, and both are *derived* rather than authored
beside it — measuring the ported palette shows it is a system: neutrals and
accents share one lightness ladder to four decimals, each ramp holds a single
hue, chroma peaks mid-ramp. So:

- a **colour theme** is Nocturne's own ramp with the hue rotated in OKLCH, at
  a per-theme chroma weight for the accent and a lower one for the page tint
  (the same chroma is an invisible cool tint at 289° and unmistakably brown at
  48°);
- **light mode** is Nocturne reflected about its own background — every colour
  keeps its perceived distance from the page it sits on, which is the
  relationship the design tuned.

`blurple` + dark is therefore byte-identical to the ported hex. **Keep it
that way**; `scripts/` has no check for this, but `buildPalette('blurple',
true)` must equal `NOCTURNE` exactly or the design has silently drifted.

### The React Compiler makes this sharp

The compiler treats a module import as a constant, so anything derived from
one during render is hoisted out of the component and evaluated **once**. Two
rules follow, and breaking either produces a half-themed screen rather than an
error:

- **A colour used during render comes from `useColors()`**, never from the
  `color` import. That includes conditional styles, `Icon`'s `color` prop,
  gradient stops, `placeholderTextColor`.
- **A module-level helper that returns a colour takes the palette as a
  parameter** — `missingName(c)`, `btnVariant(variant, c)`. A no-argument
  version is a constant expression and gets hoisted.

Same reason, one level up: `applyTheme` *returns* the palette instead of
leaving the caller to fetch it with `palette()`. It is the only call in the
pair with reactive arguments, so it is the only one the compiler re-runs — a
`palette()` beside it is what made the first light mode paint a light page
with a dark hero card on it.

Sheets are exempt: `themed()`'s thunk runs outside any component, and
`useThemed(sheet)` passes the generation in, which is a reactive argument.

## Deliberate deviations from the design

Keep these; they're decisions, not drift. Each is commented at its site.

- `tab` is not in the store — expo-router owns which screen is showing.
- The buddy strip follows connected-buddy state, where the design gates it on a
  canvas prop.
- The scanning dot radiates radar rings. The design loops its `riseIn` keyframe
  here, which also shifts 8px — on a 7px dot that reads as a glitch.
- The tab bar has an active-tab dash (2px, slides on `move`); the design has no
  indicator at all. It fades out entirely on `plan`, which no tab owns.
- Finish and Discard are hold-to-confirm (`src/components/hold-btn.tsx`), where
  the design fires both on a tap. Finish only holds while sets are still open.
  Commit happens in the timing callback and only when it reports `finished`, so
  a released hold can never end a workout.
- **The session's bottom CTA is dashed exactly while it needs a hold.** Leaving
  an exercise with sets still open, or finishing with sets open anywhere, is a
  held gesture; once everything is ticked the same button goes solid and fires
  on a tap. `dashed` on `HoldBtn` borrows the waiting set row's grammar, so the
  outline is the tell before you press rather than a surprise once you do.
- `<image-slot>` is filled by the photo picker rather than drag-and-drop.
- The design's `recent` array is computed but never rendered — not ported.
- "Today" is live (`src/data/date.ts`), not the design's pinned Friday
  7 August 2026. Sessions are logged by real date (`history` / `lastLog` in
  the store), and the durable slice of state persists to AsyncStorage — see
  `PERSIST` in `workout-store.tsx` before adding state you expect to survive
  a restart.
- User-named things (groups, equipment, routines, custom exercises) carry
  per-language names (`LangMap`), where the design had single strings. Resolve
  them through the store's `gInfo`/`kInfo`/`rInfo`/`exInfo` — never read
  `.labels`/`.names` directly in a screen — and render a `missing` result with
  the `missingName` style from `ui.tsx`.
- **`DOW` is the schedule's key set and is never rendered.** What a screen
  shows is `DAYS_SHORT[s.lang]` from i18n — the keys read as English in
  either language, and did for a year before anyone noticed.
- **The live session is one exercise per screen**, not the design's stack of
  collapsed cards. The whole list, Add exercise, Discard and Finish live in the
  overview sheet behind the "3 / 5" chip; the bottom button is navigation only
  (Next exercise / Finish workout). Swipe or the overview moves between
  exercises — `s.active` is still what drives it, and the swipe stays a swipe:
  the hold guards the button, not the gesture.
- **A set is logged in exactly one place: its own tick box.** Enter on the
  weight field moves to reps, Enter on reps logs the set. There is deliberately
  no second "log" button — the box is also the only way to *un*-tick a set, so
  it's the one that has to stay.
- **A set can also carry a verdict** (`SetMark`: `up` / `down` / `ok` / `note`)
  — heavier next time, lighter next time, that was the weight, or words. Not in
  the design; the numbers record what you lifted and never what to do about it,
  which by next week is the part you wanted back. Four rules hold it together:
  - **The mark lives in the index column, and takes the digit's place.** Which
    set a row is you can count; once you have judged it the judgement is worth
    more in 16px. Taking the slot rather than adding a column is also what
    leaves `inputW` / `flyDx` / `inputCatch` untouched — that arithmetic is
    written out at its site and every number in it is a column width.
  - **Words imply a mark and clearing a mark clears the words.** Typing with
    nothing picked makes it `note`; emptying the box takes `note` back; tapping
    the mark you already carry removes both. One state to draw, never a note
    that nothing points at. The words are available under *all four* marks —
    "heavier, but my grip went first" is one thought.
  - **It only pays off next session, so it has to survive one.**
    `finishSession` files marks in `lastMarks` index-for-index with
    `lastLog[id].sets`, and every place that builds a row copies `prevMark`
    beside `prev` — same fallback, or the arrow would be a verdict on a
    different set. A new persisted key rather than a richer `LastLog`: `PERSIST`
    is additive, and reshaping `lastLog` would cost a `STORAGE_VERSION` bump
    and a migration over real training data.
  - **It never leaves the phone.** `BuddyProgress` carries `done` booleans and
    nothing else; what you thought of your own set is not the buddy's business.
- **Numbers are also a gesture**: hold a kg or reps cell still for `HOLD_MS`,
  then drag up or down to step it (0.5 kg / 1 rep per `PX_PER_STEP`). The hold
  is what lets a tap still focus the field and a straight drag still scroll the
  list; while a drag runs, the list's `scrollEnabled` goes off. Most sets never
  need the keyboard. This one gesture is the reason
  `react-native-gesture-handler` is mounted at all (`GestureHandlerRootView` in
  `src/app/_layout.tsx`): it sits on top of a `TextInput`, and Android's
  `ReactEditText` disallows touch interception the moment a finger lands, so a
  `PanResponder` watching the capture phase never reliably sees the drag.
  `Gesture.Pan().activateAfterLongPress()` does the same negotiation a layer
  down, where it works. Everything else on this screen — the swipe between
  exercises included — is still a plain `PanResponder`, and should stay one.
- Add set is hold-to-confirm — it sits under the last row, right where a thumb
  reaching for the tick lands.
- **There is no Discard.** Finish is the only way out of a session, so it
  carries what Discard used to: `finishSession` writes no `history` entry when
  nothing was ticked. A session you started by mistake costs you a hold, not a
  training day on the calendar — and its summary is quiet (`Summary.empty`):
  no "Saved", no stats, no confetti, so the payoff moment is never spent on a
  mistake.
- **An exercise with nothing ticked can leave the session.** The × on the
  overview sheet's rows is the undo for a wrong pick — held, like every
  destructive glyph — and `removeSessionEx` refuses the moment a set is done:
  a set that was lifted is a fact, and facts don't leave through an ×. Ticks
  are also refused when they would record nothing — empty fields *and* an
  empty ghost would log "BW × 0", which becomes next session's last-time lie.
- **A routine deletes from its editor, held.** `deleteRoutine` clears the
  schedule slots pointing at it and ends a matching co-draft; `history` is
  untouched on purpose — entries carry their name frozen at log time, and a
  deleted rid there is already the case the plan screen handles.
- **Changing exercise does not clear a running rest.** A swipe forward to
  peek and a swipe straight back used to silently cost the countdown and its
  scheduled notification. The rest is about your body, not the machine you
  stand at; "start now" is the out. (Skipping silences only the countdown —
  the buddy's turn still holds the row, being a different fact.)
- The buddy's turn sits inside the exercise (with the take-turns/parallel chip
  beside it) rather than in a bar at the bottom; the bar's tap-through to
  Profile survives as the row's own. Turn modes are last-writer-wins registers
  (`TurnChoice`, `mergeTurns`) carried inside `progress`, so both phones agree.
- **Whose set it is is arithmetic with exactly one tie**: fewer completed sets
  goes next, and being level is the only undecided moment. `FirstUp` is what
  breaks that tie and is therefore the *whole* of "who goes first" — `host`
  (what the app always did), `random`, or `ask`. It is one session-level
  register (`FirstUpChoice`, `mergeFirstUp`) riding in `progress` beside the
  turn modes, seeded from the persisted `firstUpDefault` and changeable
  mid-session from the overview sheet by either phone.
  - **The coin's seed lives inside the register, not beside it.** Both phones
    must land on the same leader with nothing to exchange, so `flipLeader` is
    a pure hash of (seed, exercise id) and the seed travels with the policy it
    belongs to — a phone that adopted the policy but kept its own seed would
    flip a different coin and the two screens would disagree about whose set
    it is. Changing the policy mints a fresh seed, which is also how you
    re-roll; every new session mints one too, so the same routine twice
    doesn't hand the same person every exercise both times.
  - **One flip per exercise, not per set.** Re-flipping every level score
    would let one of you lift twice across a round boundary, which is not what
    "take turns" means. A flip at the exercise, then strict alternation inside
    it.
  - **`ask` asks, it does not gate.** The question replaces the waiting row —
    two taps on the line that already says "start now" — and everything under
    it keeps working: the coin has already decided, so the turn hint is never
    blank, and ticking your set answers it by making it moot. A lone bid
    stands; two that cancel out (both "I'll go") decide nothing, so the coin
    does. Your *own* answer is what puts the row away, so a phone left in a
    pocket can't leave the other one being asked all exercise. `myBids` is own
    state and is never merged — a bid is one phone's opinion, and the buddy's
    is read out of their `progress`.
- **Every logged set starts a three-minute rest** (`REST_SECONDS`), training
  alone included. It is drawn on the set you're on next, as a set that isn't
  yours yet: dashed, unaccented, the countdown written across it and a "start
  now" out. The countdown lives in `rest` and is measured in `elapsed` ticks,
  not wall time, so it stays pure and re-renders for free — which is also why
  anything that puts `elapsed` back to zero has to clear `rest` with it.
  **`elapsed` itself is wall-anchored**: its interval adds the gap since the
  last tick rather than a flat 1, and an `AppState` listener advances it the
  moment the app comes back. Android suspends the JS thread on a screen lock,
  and a clock that counts firings simply stops — taking the rest with it. Keep
  it a delta, not a `startedAt` field: `elapsed: 0` is written from four places
  and none of them has to know about this.
- While the turn is theirs, that same row says so instead, and carries
  `own: false` so it lets go the moment the turn comes back rather than running
  its full length — the guest of a fresh session must not be held three minutes
  for a set they never did. Like every other buddy cue it only changes how the
  row *looks* — the inputs and the tick never stop working, because a phone in
  someone else's pocket must not block your set.
- Disconnect is explicit and two-sided: the phone that taps it sends `bye` and
  the other tears the pairing down (`endPairing`) instead of hunting for a
  reconnect. Neither side's *session* is touched — the workout keeps running
  solo, because ending someone's live session from another phone would throw
  away sets they actually lifted. Any path that ends a link has to send `bye`
  first, or the other phone spends the next hour reconnecting through it.
- **`knownBuddies` is the durable half of a buddy** (the connection is not, and
  still isn't persisted). With anyone on it the radio advertises and discovers
  while the app is open, so two paired phones find each other with nobody
  tapping anything; a known name is auto-accepted with no code. That is a
  deliberate battery trade, decided with Calvin — the alternative was both
  people having to tap before either could be seen.
- **Nothing takes a name off that list but the user** (× / `forgetBuddy`). It is
  how you see who is around when you run into each other, which only works if
  it outlasts every link that ever dropped — including the ones you ended.
- **The only connection this app opens by itself is back to the buddy of the
  session in progress** (`s.buddy`), because a mid-workout drop has to heal
  without anyone tapping. Everyone else on the roster is discovered, listed and
  left alone: a link between two idle phones starts with `joinAsk` and does not
  outlive a `no` — decline disconnects. Nobody ends up connected to anybody
  they didn't answer for, which is why the roster button asks for a session
  rather than offering to connect.
- **Joining goes both ways.** `sessionInvite` is the host offering; `joinAsk` is
  the other side asking, and it doubles as the request that opens the link.
  Mid-routine the *invite is the yes* (no `joinReply` — sending one would clear
  `joinSent` and win the asker a second prompt for what they just asked for);
  idle, `joinReply { ok: true }` is the yes and simply leaves the two linked.
  Either way the asker's phone never asks them again.
- Exercises are editable, the seeded ones included. A custom exercise is edited
  where it lives (so it still syncs); a seeded one gets an override in
  `exEdits` / `cueEdits`, which is also what makes `resetEx` possible. Machine
  setup stays editable outside edit mode on purpose — it's a note about the
  machine you're standing at.
- The routine editor has no Edit button. The design's only ever swapped its own
  label; the rows were always editable.
- **A routine's reps and kg are a plan, and only a plan reaches the session.**
  A row starts life carrying whatever the picker filled in from the exercise —
  nobody's decision — so `sessionFrom` leaves it to the "last time" ghost, the
  way it always did. Typing in the cell marks the item `planned`, and a planned
  row opens with its numbers already in the fields. Without that the weights two
  people agree on while building a routine together were editor decoration: the
  session read `lastLog` and the figures never left the screen they were typed
  on. The ghost column still says what *you* did last time and tapping it still
  copies that back over — an opening bid, not a cage. `planned` travels with the
  numbers it describes, so `mergeRoutine` keeps it with yours and drops it from
  a row adopted from the buddy: their 80 kg is the only figure your phone has
  for a new row, but it is still theirs, and a weight you never agreed to must
  not turn up pre-typed in your session.
- A rest day shows a line, not a "Start Rest day" button. Freeform is still one
  tap away under the week.
- **A `HistoryEntry` records the day, not just that there was one.** The design
  only ever knew whether a date was planned or done; this is a diary, so
  finishing a session also files the ticked sets, the clock, the volume, the
  name it went by, and who you trained with — and the plan screen reads that
  back set by set under the calendar. Three things follow:
  - **Every field past `rid` is optional, and that is the whole migration.**
    A phone that has been logging since before this keeps every entry it has;
    those days say so rather than inventing a set list. Nothing changed shape,
    so nothing needed a `STORAGE_VERSION` bump — see `PERSIST`'s additive rule.
  - **`lastLog` is not history.** It holds only the *latest* session per
    exercise, because that is all a "last time" ghost needs. The day's own copy
    is what survives the next workout, and it is written in the same
    `"70 × 8"` format — read back through `prevNums`, or `loggedLine` when it
    has to be shown with units, which is how a day that mixes a run, a plank
    and a bench press stays readable without a column header.
  - **The name is frozen at log time.** A routine renamed in March must not
    rewrite what February's workout was called.
- **Save-as-routine stays open after the summary closes.** The offer sits on
  every logged session in the plan screen: a freeform workout, one improvised
  with a buddy, or a routine you drifted far enough from that the day earned
  its own name. It saves what actually happened — the ticked sets, numbers off
  the set you finished on — where the summary's version saves the session you
  built, sets never ticked included. **It also files the day under the new
  routine, but only when the day had none** (`rid` null, or a routine deleted
  since): filling a hole is not the same as overwriting a fact, and saving a
  variant must not retitle the session it came from.
- **A day you trained is a full dot on the calendar whether or not anything was
  scheduled.** The dot used to test the schedule first, so a freeform Saturday
  was invisible on the month grid and the day card called it "Nothing planned"
  with the session listed right underneath it.
- **Every logged set's rest is `restSeconds`, not a constant** — a setting, 0
  meaning off. `REST_SECONDS` is gone from the session overlay.
- **A rest that ends out of the app arrives as a notification** (`restAlert`,
  `src/data/rest-alarm.ts`, `<RestAlarm>` mounted in `Overlays`). It is the
  out-of-app half of `buzz.rest()` and the two are exclusive: the haptic now
  only fires while `AppState` is `active`, because a wall-anchored clock makes
  the rest transition on the frame you unlock, and a buzz then is about
  something that finished ten minutes ago. The alarm is handed to Android when
  the rest starts and **cancelled by the scheduling effect's cleanup** — that
  one path covers skipping, ticking the next set, changing exercise and
  finishing, so a new way to end a rest needs no new cancel. Coming back to the
  app clears the tray. `<RestAlarm>` is deliberately outside both
  `<SessionOverlay>` (which unmounts on `sessionMin`) and the `social` gate.
  **`expo-notifications` is imported lazily** — the package registers a
  push-token listener as an import side effect, which in Expo Go is a
  `console.error` about remote push, drawn as a red LogBox bar over the screen.
  So the module loads on first use and `init` mutes that one message on its way
  in; lazy alone only moves the bar from launch to the first workout. What that
  costs is `cancelRestAlarm` / `dismissRestAlarms`, which run at mount and may
  therefore never load it: they clear through an already-loaded module, and
  `init` sweeps the tray itself to cover the cold start after a process death.
  Known hole: the live session still isn't persisted, so a process death while
  the phone is locked loses the workout even though the alarm still fires.
- **Train alone** (`privateMode`) hides *and disables* the buddy half: the
  gate is `Overlays` unmounting `<BuddyRadio>` and the four buddy sheets, not
  hidden buttons, because the radio is what advertises and answers. Turning it
  on sends `bye` and tears the pairing down like any other teardown.
  `knownBuddies` survives — it is a curtain, not a divorce.
- **Backup is the durable slice in an envelope** (`src/data/backup.ts`),
  stamped with `STORAGE_VERSION` so an old file is migrated forward rather
  than loaded raw. A restore *replaces*: the seeded defaults go down first, so
  a key the backup lacks resets instead of surviving.
- **The muscle-group and equipment lists fold away, and their seeded rows
  keep no ×.** Twenty groups and five kinds unfolded put Data and About a
  screen and a half down, past the settings people actually come back for, so
  both sections start folded (`Fold` — local state, deliberately not
  persisted). Deleting a seeded row was never tidying: those keys are what
  every exercise is filed under, and dropping one strands its exercises on the
  raw key and takes the entry out of the library's filter row. Renaming and
  reordering stay open, and a divider is an added row like any other — it
  drags into the middle of the seeded block, which is the whole point of
  having one.

## Checks

Both must pass before committing:

```bash
npm run typecheck
```

```bash
npm run lint
```

`npx expo export --platform android` catches things that only break at bundle
time. There are no tests yet.
