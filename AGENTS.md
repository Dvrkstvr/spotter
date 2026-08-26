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
- **A list reorders by hold-to-grab, and there is one implementation of it.**
  `DragList` in `src/components/drag-list.tsx`: hold a row for `HOLD_MS`
  (220 ms), move it, let go. Four lists used to hand-roll the same
  `PanResponder` on a 20px grip — the Settings groups and equipment, the
  routine editor's rows, the co-draft's, and the session overview's stops —
  each calling itself "the ReorderRows pattern" in a comment while quietly
  disagreeing with the others about pitch. Calvin's call: one grammar, and this
  is it. Five things follow, and each is a place the old grip was hiding a
  decision:
  - **The number drag is the stated exception, and it stays one.**
    `num-drag.tsx` takes the cell after 4px of travel with no wait. That is the
    same trade decided the other way, not an inconsistency: a number cell buys
    its immediacy by giving up the scroll *on that cell*, which it can afford
    because it is a 74px target in a row that is mostly not cells. A full-width
    row has nothing beside it, so an immediate grab would cost the screen its
    scroll outright. Never "unify" that one.
  - **The grip stays, and stops being the handle.** The row is what you hold
    now, so the glyph is no longer a control — but a list still has to *say*
    it reorders, and this is the app's word for that. It keeps its 20×26 slot
    and still goes accent to report which row is in the air; it loses nothing
    else, and the same choice is applied at all four sites so no list is
    differently discoverable. It is still withheld where a list of one would
    make a drag furniture, which is the same thing `DragList` refuses to arm
    for.
  - **Pitch is measured per row, everywhere.** Two of the four used to take the
    first row's height for all of them, which is true of theirs and false of
    the other two — a superset pair's block is taller than a lone stop, and the
    routine editor's slot carries its pair gap along inside it. The landing
    walks the real heights outward from the row in hand, which is also exactly
    what the uniform lists were already getting.
  - **A control that holds the finger longer than the grab does says so**
    (`useDragGuard`). A `HoldBtn`'s own hold runs 700 ms, so a 220 ms grab
    would take the touch off every × in a reorderable list and nothing could be
    deleted from one. A pressed `HoldBtn` claims the touch and the list stands
    its gesture down — declared by the control, because the control is what
    knows. A `TextInput` needs no such thing: Android's `ReactEditText`
    disallow already cancels the grab, which is the one place in the app that
    fact helps rather than hurts. A tap — the pair gutter, the overview's jump
    — is over before the hold lands.
  - **The week board's `skew` has no twin in `DragList`, and that is not an
    oversight.** `skew` reconciles a gesture's `absoluteY` with
    `measureInWindow`, two spaces that differ by the status bar under
    edge-to-edge, and the week board enters both because a routine travels
    between two *different* lists. A reorder never leaves its own list, so it
    never leaves relative space — the offset is `translationY` and nothing is
    measured in window coordinates. If this ever grows absolute hit-testing
    (auto-scroll at the edges, the week board folded in), the calibration to
    copy is that one, read off the row under the finger. Never a status-bar
    constant.

  What it costs: on a screen whose scroller is `keyboardShouldPersistTaps` =
  `handled`, a grab does not land while the keyboard is up — the ScrollView
  takes the touch so it can dismiss the keyboard, and taking it cancels every
  handler the orchestrator owns (the same fact the session list answers with
  `always`). Accepted rather than fixed: you are not reordering while you type,
  and buying it back would cost those screens tap-away-to-dismiss with nothing
  to replace it.
- **Small controls share one reach.** Every × glyph and shutter is drawn at
  20–26px and takes `hitSlop={slop}` from tokens — no per-site guesses, so
  no two ×s in the app are differently hard to hit. (A grip is drawn to the
  same 20×26 and takes none, being an affordance rather than a control — see
  hold-to-grab above.) The selectable pill is
  `Chip` in ui.tsx (radio semantics, `missing`-translation styling built in);
  four screens had hand-rolled it apart before it was extracted.
- **`color-mix()` has no RN equivalent** — use the `wash.*` helpers in tokens,
  which resolve to literal rgba. Don't inline your own.
- **CSS letter-spacing is em, RN's is px.** Always go through `tracking(size, em)`.
- **A bordered view that ever goes dashed states `borderStyle` in its base
  style.** Android recomputes the border's path effect inside a
  `borderStyle?.let` (RN 0.81 `BorderDrawable.updatePathEffect`), so *removing*
  the style is a no-op and the dashes stay on the paint — `dashed && styles.dashed`
  paints one way only. Naming `solid` in the base makes every flip a value
  change, which is the case that clears it. Three sites: `HoldBtn`, the session's
  live set row, the coach's routine card.
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
- **The keyboard is the shells' problem, never a screen's.** SDK 54 runs
  Android edge-to-edge unconditionally, which makes
  `softwareKeyboardLayoutMode: resize` a no-op — the keyboard draws over an
  app that no longer shrinks. So `Sheet` / `FullScreen` (sheet.tsx) and
  `Screen` (screen.tsx) each carry a `KeyboardAvoidingView`, and every input
  inherits avoidance by rendering through them; a new surface with a text
  field needs no keyboard code of its own. Deliberately pure JS —
  react-native-keyboard-controller is a native module, which Expo Go doesn't
  have and both phones would need rebuilt for. The cost is content moving a
  beat after the keyboard (Android has no will-show event), accepted. The
  mockup is `design/keyboard-mockup.html`.
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

### `warn` is the one hue that doesn't turn

Nocturne has no semantic colour at all — neutrals and one accent, and every
theme is that accent rotated. `warn` is the single exception, added for the
refused tick, and two things keep it in the system rather than beside it:

- **It is derived, like everything else here.** `accent400`'s own lightness and
  chroma at a fixed hue, through the same `oklchToHex`, and reflected about the
  background in light mode exactly as `buildPalette` reflects every slot. So it
  reads in this system's register — a muted red, not a browser's — which is the
  colour equivalent of the copy voice's understatement.
- **The hue is fixed, and the theme does not reach it.** It says *the app would
  not do that*, which is the same fact whichever colour you chose the app to
  be; and under `rose` (8°) or `ember` (48°) a warning rotated with the accent
  would simply *be* the accent. `applyTheme` sets it from the mode alone, which
  is why it is not in `paletteFor`.

## The Routines tab

The design's routine list is flat and in insertion order. This one is
searched, ordered and filtered, and carries the whole seed collection under
your own list — the mockup is `design/routines-list-mockup.html`, which stands
in the same relation to this screen that Workout Diary v2 does to the rest of
the app. It is also now the only place a workout is started from, which is
what paid for Today's redesign (see the deviations list).

- **One ordering, computed in one place.** The recommended group *is*
  onboarding's pick list — `routineInStyle` filters, `routineStyleScore`
  orders, over `DEFAULT_ROUTINES` — so the tour and the tab can never disagree
  about what "recommended" means. That is also why `Back A` shows up under a
  calisthenics answer and ranks below the all-bodyweight days: one pull-up in
  four lines is a little bit calisthenics, and the score already says so.
- **Family is derived, never stored.** `routineFamily` is the dominant
  `styleOf` across a routine's items, computed for seeds and user routines
  alike. No new field on `Routine`, nothing to migrate, and a routine edited
  toward cardio drifts into the cardio chip by itself. An empty routine files
  under none.
- **Adding a seed is `applyOnboarding`'s move for one routine.** Both go
  through `scaledSeed`: fresh copy, level-scaled, `planned` below `regular`,
  same-id replace. An added routine must be indistinguishable from a picked
  one, or it reaches a buddy as a different shape.
- **Search matches what the row can explain.** Routine names, exercise names
  and group labels, every language, through the store's resolvers — so "back"
  and "Rücken" find the same rows, and `Legs B` turns up for "back" because
  the Deadlift files under Lower back, which is the entire point of searching
  by muscle. A found row's meta line quotes the match, and **names the group
  only when the group is what matched**: "Back Squat" answers "back" by its
  own name, and crediting Quads there would read as though Quads had matched.
- **The lens narrows both halves, or it argues with itself.** A Cardio chip
  that thinned your list while still offering three strength days to add would
  contradict itself; under a family chip the recommended group also steps
  aside, because the question changed from "what suits how I train?" to "what
  cardio is there?". `yours` hides the shelf outright — every row down there
  is by definition not yours.
- **A narrowed list says so** (`hiddenBySearch` / `hiddenByFilter`), the same
  reason Insights discloses `looseSets`: a short list must read as narrowed
  rather than as loss. While a query is live the sort seg steps aside and
  results order by *where* the match is — relevance without inventing a score.
- **Empty means the shelf, not a sentence.** With nothing of yours the
  controls don't render (a seg ordering nothing is furniture) and the
  collection is the screen; `noRoutines` is one line pointing at it.
- **The lens is UI state.** `routineQuery` / `routineSort` / `routineFilter`
  sit beside `query`/`filter` and outside `PERSIST` — a fresh launch opens on
  Week · All, empty search. Which shelves were folded is local state for the
  same reason the settings `Fold` is. Nothing in this feature touches
  `STORAGE_VERSION`.
- **The collection reads; the editor writes.** No delete, rename or reorder on
  the shelf: a seed's row flips between + and *on your list*, and that is its
  whole state space. Removing stays the editor's held delete.

## The Plan tab

The design's plan is seven weekday slots under a month grid — `schedule:
Record<number, string>`, timeless, each able to say only *this weekday,
forever*. This one is **dated rules**, and the calendar is the only place a plan
is organised: the seven weekday rows under the grid are gone. The mockup is
`design/plan-revamp-mockup.html`, which stands in the same relation to this
screen that Workout Diary v2 does to the rest of the app.

**Two primitives, and every state the screen can draw is one of them or both**
(`src/data/plan.ts` — pure, like `data/stats.ts`: dates and rules in, answers
out, no store, no hooks, no colours, no strings):

```ts
entries: PlanEntry[]              // rules; a one-off is `repeat.unit === 'once'`
skips:   Record<string, string[]> // ISO date → entry ids cancelled on it
```

- **One resolver, read everywhere.** `plannedOn(plan, iso)` is the only way any
  screen learns what a day holds — Today's hero, its week strip, the calendar
  grid, the day panel, the Routines card. A second reading of the rules is how a
  Wednesday ends up planned on Today and blank on Plan.
- **One formatter, printed everywhere.** `repeatLabel` writes the day-panel
  pills, the sheet's sentence, the Routines card's days line and the routine
  editor's. Three surfaces phrasing one rule three ways is the bug this
  pre-empts. `repeatSentence` is the same thing plus the anchor, which is what
  makes an every-third-day rule readable at all.
- **A one-off is a rule, not an exception.** That is why there is no per-date
  override map: planning a single day is the same write as planning a weekly
  one, and a **one-day swap is a skip plus a `once`** — two primitives composing,
  no third concept.
- **Rest is the absence of rows.** An entry always names a routine. And because
  choosing rest is now a real act (a skip), the app can finally tell a chosen
  **Rest day** from a blank **Nothing planned** — `restChosen` is "something was
  cancelled and nothing survived it", stored for free by the skip that made it.
  Before this, every dayless day called itself a rest day, which is what put
  "Nothing planned" over a logged session.
- **A day holds as many workouts as you plan on it, and nothing is deduped.**
  Two rules may name the same routine on the same day, and the panel shows both
  rows with their two different pills. Hiding one would mean an entry you can
  neither see, edit nor remove.
- **Order is insertion order, everywhere**, which is what makes *the first
  unlogged row* a stable answer. That phrase is the whole of "next": it picks
  the one workout Today's hero is about **and** which Plan row gets the primary
  Start, so the two screens cannot disagree. A day whose rows are all logged
  shows the last of them, which is what keeps `doneToday` and *Completed today*
  working. The other rows are named under the hero (`alsoToday`) rather than
  stacked into a second card — they become the hero themselves once this one is
  filed.
- **A skip names an entry id**, so nothing may remove an entry without sweeping
  the skips that pointed at it. `dropEntries` is the only way an entry leaves,
  and `deleteRoutine` goes through it.
- **The past is read-only.** No adding, editing or removing behind today: a rule
  anchored backwards would invent workouts you never planned and skips you never
  chose, and this is a diary.
- **The plan starts when you made it.** A rule claims no day before its `from`.
  v3's timeless slots ringed every Monday there had ever been and the day card
  called them "Planned, not logged" — an accusation about a workout scheduled
  retroactively. After the migration the past keeps its logged dots and loses
  only the fictional rings.
- **There is no end date, by decision.** A rule runs until it is removed or
  changed, and either takes its past faint bars with it: without an `until` there
  is nowhere to record that the rule *used to* be something else. What survives
  is the logged sessions — what actually happened, and the part a diary owes you.
  Calvin's call: wait for someone to ask. `until` is an additive field needing no
  migration if they do.
- **Daily and bi-weekly are values, not options** — `{ unit: 'day', n: 1 }` and
  `{ unit: 'week', n: 2 }`, from a seg, a stepper clamped to 1–12, and a weekday
  strip drawn only for weeks (an interval counted from the anchor has no weekday
  to pick). A preset list always turns out to be missing somebody's interval.
  `span()` clamps on read too, so a hand-edited blob can't divide by zero.
- **Weeks are Monday-anchored**, like `DOW` and the grid, so a bi-weekly
  Mon-and-Sat rule keeps both days in one week instead of drifting nine days
  apart. `anchorFor` moves a rule forward to its first real day when the
  weekdays exclude the one the sheet was opened on — otherwise `occurs` would
  never fire and the plan would silently be nothing.
- **The sheet commits on Save**, unlike the v3 sheet which committed on the tap
  that picked a routine. Two fields depend on each other now. Editing a
  repeating rule adds the scope question, and the scope governs what is under
  it: under *Just this day* the Repeats field steps aside, because no repeat is
  being written. Removal is held, like every destructive act here, and its label
  says which one it means.
- **UI state stays UI state.** `daySel` is an ISO date (which retired the
  `Math.min(daySel, daysInMonth)` clamp on month paging) and `dayPick` became
  `dayPlan: { iso, entry }`. Neither is in `PERSIST`.

### The one shape change since v3

`plan` replaces `schedule` in `PERSIST`, so this is the first *shape* change to
a durable key in a while: **`STORAGE_VERSION` 4**, `STORAGE_KEY`
`workout-diary/v4`, `migrateV3`. Three things about it are load-bearing:

- **`migrateV3` reads the raw blob**, not the filtered one. `schedule` has left
  `PERSIST`, so `filterPersisted` drops it — read the filtered object and every
  phone silently wakes up with an empty plan. `migrateV1` was changed to return
  its lifted blob *unfiltered* for the same reason, and `migrateBlob` is the one
  place the chain's order is written down so the load path and a backup restore
  cannot disagree.
- **The lift groups by routine**, not by slot: `{0:'chest', 3:'chest'}` was
  always one intention, and becomes one rule with `dows: [0, 3]`. `from` is
  `mondayISO()` — the start of the week the migration runs. `planFromSchedule`
  is also what seeds `initialState` and what `applyOnboarding` writes, so a
  fresh phone, a migrated one and a re-run tour all hold one shape.
- **`asPlan` guards the stored shape.** `PERSIST_SHAPE` only asks whether a key
  is an object and leaves the rows to the mutators, but both of this key's
  sub-keys are load-bearing — `plannedOn` filters `entries` and indexes `skips`
  — and a backup that has been through a chat app can arrive without either.

Buddy sync needed no protocol change: `schedule` was never in a snapshot, and
the plan-sync line compares today's routine by content (`routineEquals`) through
the hero. `backup.ts` needed none either — it carries `STORAGE_VERSION` in its
envelope and `importState` migrates forward.

## Statistics & the AI coach

The design has no statistics view and no coach — both are Calvin's, and the
mockup they were built from is `design/stats-ai-coach-mockup.html`, which
stands in the same relation to these screens that Workout Diary v2 does to the
rest of the app.

It is a Profile card → Insights → the coach's three steps, and the property
that holds the whole thing together is that **it only ever reads**.
`data/stats.ts` and `data/coach.ts` are pure — a history slice and a lookup
in, numbers and strings out — with no store, no hooks and no colours, which
also keeps the React Compiler out of the question. Nothing about the
statistics is persisted, and that is what makes them free: a phone that has
been logging for months already has everything they need, with no new key,
no `STORAGE_VERSION` bump and no migration over real training data. `coach` —
the goal, the week, the equipment — is the one thing here that is stored, and
it is a *setting*, added the additive way `PERSIST` allows.

- **Balance is read over six regions, not twenty muscle groups.** Twenty is the
  right granularity for filing an exercise and the wrong one for reading a body
  at a glance: a chart with twenty axes says nothing, and "Traps 1%" is not a
  finding. `REGION_OF` rolls the seeded keys up, and a region's *name* comes
  from the dictionary rather than from `groups` — the user's list is theirs to
  rename, reorder and extend, while these six are an analysis this app
  performs. That is also why the mapping is deliberately partial: a group
  someone invented, plus `FullBody`, `Cardio` and `Other`, map to nothing.
- **A region's share is fractional *sets*, and nothing about the person.** The
  unit is the hard set per muscle per week, which is what every published
  figure this could be read against is stated in, and volume load is a poor
  proxy for the stimulus besides (`design/stats-research.md`). Sets were the
  first reading here too and were replaced by weighted volume, which was the
  wrong fix for a real problem: kilos are not comparable across the six, so a
  raw-kilo chart says *Legs enormous, Arms starving* about every diary ever
  kept. That needed `REGION_MASS` to divide each region's kilos by the muscle
  it carries, a body weight to make a pull-up worth anything, and a
  seconds-to-reps rate to keep planks on the chart. **Counting sets never
  introduces the distortion, so all three corrections are gone** — with them
  `bodyKgOf`, `DEFAULT_BODY_KG`, and the options bag `trainingStats` took to
  keep `bodyKg` from being confused with `sinceDays`. `today` is positional
  again, like the siblings'. A bodyweight set now counts like any other with no
  figure invented for it, a hold is one set of core, and the majority of phones
  that never filled the weight field in are no longer having a default shape
  every share on their screen.
- **Which muscles a set reaches is `contribOf`, and the roll-up takes a
  maximum.** A set credits its filing group 1 and every muscle in `also` its
  own fraction, so one set legitimately totals more than one *across the body*
  — see `design/muscle-contribution-spec.md`. But `regionOf` is many-to-one, so
  a squat naming Quads, Glutes, Hamstrings and Adductors would credit **Legs**
  three sets out of one if those were added: `regionsOf` takes the **largest**
  contribution within a set, and sets add across the window. One squat set is
  one Legs set; a leg extension and a leg curl are two. That compromise belongs
  to the six-region view rather than to the data — at muscle level quads got a
  whole set and glutes got a whole set and both are true — and it is the one
  mistake here that still draws a plausible chart, which is why it has a test
  named for it.
- **Cardio is gated by measure, before the contributions are read.** `Cardio`
  and `FullBody` map to no region anyway, so the gate looks redundant and is
  not: a `distance` exercise someone filed under Quads is still a run, and
  without it a cardio month lands on the leg axis.
- **`countedSets` and `looseSets` are whole rows; `RegionStat.sets` is
  fractional.** The disclosure under the chart says how many sets reached no
  muscle group, and it has to be measured in something a person counted.
- **A rate against a range, not a share against an even split** (`BAND`, 10–20
  sets a week). This is what the whole rebuild was for: a share can only ever
  say *relatively less* — Chest at 17% is the same figure at four sets a week
  and at twenty — where a rate can say **not enough**, against a number that
  exists outside this app. It also makes *over-trained* sayable for the first
  time, which no share could express. `perWeek` divides by `weeks`, so eight
  weeks and twelve months are read against the same range; a bounded window
  takes its own length and all-time takes the diary's, never less than one
  week.
- **The range is stated per muscle, so the verdict lives there and not on a
  region.** Legs at seventeen sets a week can be a trained quad and a starving
  calf under one contented number, so `RegionStat` carries its rate and
  `low` — a *count* of its muscles under the range — while
  `TrainingStats.weak` is a list of **muscles**, furthest short first. That is
  what the card headline names, what Insights lists, and what the coach prompt
  sends: "Calves 2" is something a plan can be written from where "Legs behind"
  is not.
- **An untrained muscle is not a weak one** (`MuscleStat.trained`). Nobody
  trains `Neck`, and a screen flagging it every week beside a genuinely
  neglected calf has stopped being read — so nothing counts as low until it has
  been trained at all. This is the one place the per-muscle range needed a rule
  the per-region share never did.
- **Push against pull is the one ratio a diary can honestly compute**, and it
  is on the screen because the six regions structurally cannot say it: **Arms**
  merges biceps and triceps, which pair oppositely, so someone who presses
  constantly and never rows reads as a perfectly healthy Arms. 1:1 is the
  common default, 1:2 pull-favoured the usual advice for shoulders. Three
  things about it:
  - **Upper body only.** The literature's push:pull is about the shoulder
    girdle; the lower-body version is a different argument with different
    numbers, and folding squats in would swamp both halves with the largest
    muscles in the body. Legs, core, neck and the lower back are in neither
    list — this is a ratio between two named halves, not a partition of
    everything.
  - **Counted off the muscle map, not the regions**, which have already
    collapsed the two halves of Arms into one number by the time anything is
    drawn.
  - **Rear delts are the known inaccuracy, and are stated rather than hidden.**
    They pull and they file under `Shoulders`, which is on the push side. Not
    fixable without splitting `Shoulders` front from rear — a twenty-first
    group in the user's own list, for one line. The seeded rear-delt work names
    `Traps` and `Back` in its `also` and so lands partly on the pull side; the
    residue is accepted.
  - `ratio` is **pull over push**, so the line reads `1 : n` and under one is
    push-heavy. Null when nothing was pushed — there is no ratio to a zero —
    where a pull of zero against real pressing is `0`, which is a finding. The
    card hides itself when neither half was trained, a legs-only window having
    no ratio and a bar of two zeroes being furniture.
  - **It is in the coach prompt too, and it carries its own aim.** A bare ratio
    is a number a model has to guess the good direction of, the same trap
    `promptBandNote` answers one line above — so the string says *1 : 1 or more
    is the usual aim* and *upper body only*, in prose and in the user's
    language. It rides with the balance rather than behind `shareProfile`:
    nothing here is a fact about the person.
- **The radar is retired, and the reason is the unit rather than the shape.**
  `BandBars` replaced `BalanceRadar`, which is deleted. A radar plots six
  numbers against each other, which is all a share could ever be; these plot
  sets a week against 10–20 on a track identical for every row, so a bar is
  read against a target *and* against the other bars. Four things it does that
  the polygon could not:
  - **A region opens to its muscles**, one at a time — six regions each opening
    five is a screen you scroll past rather than read, and "why is that one
    short?" is asked about one region at a time.
  - **The track runs to `BAND.max × 1.2`**, so an over-trained muscle has
    somewhere to go. A track ending at the top of the range would draw *at the
    range* and *twice it* identically, which is the one thing this chart exists
    not to do.
  - **An untrained muscle draws a dash and no fill**, never a zero: `trained`
    is a different fact from `low`, and this is the level that shows it.
  - **Under the range is a quieter fill (`accent700`), never `warn`** — the
    same one-step-down grammar the diary uses for a superset's rule, and for
    the same reason a tip borrows no dashed outline.
- **The balance card has two views, and they answer two different questions.**
  A `Body · Bars` seg in the card head, `BodyHeat` beside `BandBars`, and the
  body is what the card opens on — it is the better glance, and the verdict it
  cannot draw is stated in words directly under it. Which one you left it on is
  local state, like the settings `Fold`; nothing here is persisted and nothing
  here re-reads the diary, both views being the same `balance` drawn twice. The
  mockup is `design/body-heatmap-mockup.html`, and `design/stats-research.md`
  §9.2 is the argument.
  - **The body answers *where did my work go*; the bars answer *was it
    enough*.** Which is the whole reason the ramp is sequential and single-hue
    — five steps of accent up from the untrained ground, and **never `warn`**,
    whose meaning is fixed as *the app would not do that* at three other sites.
    An under-trained calf is not a refusal, and a red body is a diagnosis this
    app is not qualified to make. The range lives in the bars, and the range's
    own quarters are where `heatStep`'s four thresholds come from, so the two
    views cannot come to disagree about where *enough* begins.
  - **The body is licensed art, and the first cut proved why.** That one drew
    the figure from rounded rects and ellipses, reasoning from
    `make-icons.mjs` — the brand assets are generated from coordinates, so a
    body could be too. **It looked like a Lego man.** The constraint that makes
    a good brand mark makes a bad human: a muscle map reads as a body or it
    reads as nothing, and reading as a body takes bezier work nobody types from
    a table. So `react-native-body-highlighter` (MIT, © 2022 ELABBASSI Hicham)
    over `react-native-svg`, which Expo Go already bundles — no prebuild, no
    optional bridge, nothing that degrades. **Taken as a dependency rather than
    vendored**, though the licence permits the copy, because `npm run licenses`
    regenerates the attribution from the dependency tree: a vendored copy is a
    hand-written notice that goes stale the first time nobody remembers it.
  - **The package's artwork is used; its component is not, and the phone is
    what decided that.** `<Body>` drew these same paths until it turned out
    **its taps do not survive a finger**: a synthetic tap with no movement
    selects a muscle, while a tap with three pixels of travel — or one held for
    400 ms — selects nothing, and an ordinary `Pressable` in the same
    ScrollView answers both. It builds each `<Path>` with a fixed prop list, so
    there is no way in from outside, and a muscle map nobody can tap is the
    feature gone. `react-native-svg`'s `Path` takes the full responder API and
    `<Body>` simply never forwards it, so `Figure` imports the asset arrays
    (plain typed data, no `exports` map forbidding it) and draws them here.
    Still a dependency, so the attribution still maintains itself.
  - **A press is held through the wobble and yielded to the scroll**
    (`TAP_SLOP`). Refusing termination outright is what makes a tap survive,
    and it would also keep the touch for ever and cost the card its scroll on a
    view that is mostly figure — so the refusal lasts exactly as long as the
    finger stays inside the slop. Same trade `num-drag` makes one screen over,
    decided the same way.
  - **Two of the library's own mechanisms had to go with it, and both were
    traps.** Every asset part carries a *baked* `color` — `#3f3f3f`, and
    `#bebebe` for the head — which `getColorToFill` returns **before** it ever
    falls back, so `defaultFill` never runs and any part left unstated paints
    in two hardcoded greys no theme can reach. And `disabledParts`, the
    library's own way to say *not a muscle*, forces a hardcoded `#EBEBE4`
    ahead of *every* other priority. Drawing the paths here retires both:
    `INERT_SLUGS` states its own fill and is what the tap handler ignores.
  - **The head and the hair are drawn, not hidden.** They were `hiddenParts`
    and `defaultFill` at first, which between them left a figure the colour of
    the card with no head on it — decapitated rather than neutral. They take
    the inert fill (`neutral800`) like the hands and the feet: a grey plainly
    off the accent ramp says *not a muscle* without saying *not there*. What
    was lost with `<Body>` is its own silhouette outline, which lives in its
    wrapper rather than in the asset data; the parts carry the figure on their
    own strokes.
  - **`Lats` is the one muscle with no part of its own.** It and `Back` both
    paint `upper-back`, at the larger of the two — `regionsOf`'s *maximum
    within a region* rule, one scope down — and the row records **which** of
    them it took, so the panel a tap opens explains the figure you are looking
    at rather than its quieter twin. The Bars view still separates them, so
    nothing is lost, only unlocated.
  - **One value, painted on both sides.** No row carries a `side`: the diary
    does not know which arm lifted, and a darker left arm would be inventing
    data. The same `data` array paints the front figure and the back one, which
    is also why a selection lights a muscle on both.
  - **Front and back are shown together, never behind a flip.** A back you have
    to ask for is a back nobody looks at, and that is exactly where the
    neglected muscles live. A flip would also be a control invented for one
    screen, which is what the week board's tap-to-cycle was.
  - **Grey is *nothing logged*, and a permanent caption says so.** The bottom of
    a sequential scale is ambiguous by nature and here the ambiguity is the
    finding — `MuscleStat.trained` is a different fact from `low`. It is
    `finishLogsNothing`'s shape rather than a tip: a statement of what
    something means, not a hint that retires. The same line is why a tapped
    muscle is offered in words too, that being the only thing on the card which
    says the figure is tappable at all.
  - **The tapped muscle shows its provenance, and that is the feature.**
    `MuscleStat.sources` — one row per exercise, largest first, carrying what
    *one* set of it was worth (`Bench Press ½ · 4.0`). Half a set off a bench
    press is the least intuitive figure in the app and this is the only place
    it is ever explained, by the data rather than by a line of copy; it is also
    the fastest way to spot an `also` weighted wrong. Built in the same pass as
    the total it explains and off the same figure, or the rows and the headline
    on one card could add up differently. Capped at five rows, and what is left
    over is **said** — a short list has to read as narrowed rather than as all
    there was. Additive on a type nothing persists, so no `STORAGE_VERSION`
    bump and no migration; the coach reads named fields and never saw it.
  - **The figure follows `Profile.sex` and never asks for it.** Unanswered
    draws the male one. §9.2 recommended shipping one figure outright, on the
    grounds that the answer to *where did my work go* does not change with the
    outline it is drawn on — which is still true, and is why this reads the
    field where it finds it rather than putting a question on the screen.
    Nothing about what the app stores or sends moved, so
    `docs/play-data-safety.md` is unchanged.
  - **The figure is drawn uncropped, which the mockup is not.** The mockup
    crops to the artwork's drawn bounds and gains about 16% of height for it.
    `VIEW_BOX` is this file's now, so the crop became possible when the
    rendering moved here — and it stays undone, because the four boxes differ
    per gender and side and only the male pair has a measured crop. The figure
    keeps its margin, `MAX_SCALE` sizes the *body* to the width the mockup drew
    one at, and the side caption is pulled up into the margin that is left.
  - **The ramp climbs to `accent200`, not to `accent`.** A first cut ran
    `wash.accent` 26/46/70 into the flat accent, which put three of the five
    steps within a few percent of the card: on a real diary the figure read as
    one flat mid-purple and the two brightest steps were reached by almost
    nothing. 38/60/82 then `accent400`, `accent200` spends the whole ramp.
    Checked monotonic — in perceived distance from the page, which is what
    reverses in light mode — across both modes and a rotated hue.
- **The You card reads on the same scale as the screen it opens.** Its six mini
  bars are sets a week with the line at the *bottom of the range* rather than
  at an even split, and the scale is floored at the top of the range — so a
  card of six short bars says "not enough" where it used to say "evenly not
  much". A card and a screen disagreeing about what their one line means is
  worse than either reading alone.
- **`Profile.sex` is optional, absent until answered, and clears by re-tapping.**
  It is stored because it is the largest single moderator in every strength
  standard, muscle-distribution table and lean-mass formula there is — larger
  than age and height together (`design/stats-research.md` §5) — and it is the
  most sensitive field in the app, so it gets the narrowest treatment: two
  chips and no third, because pressing the lit one clears it and unanswered is
  where it starts. A "prefer not to say" chip would make the question louder
  than it is. The balance does not read it (that reading needs nothing about
  the person at all); today it reaches the coach prompt behind `shareProfile`,
  with the age, weight and height it belongs beside, and it is what the
  strength card reads. It never crosses to a buddy — `profile` is not in a
  snapshot at all — and adding it moved four privacy files and the data-safety
  note, which is the rule for anything that changes what the app stores.
- **Strength is the one reading that compares you to anybody else**, and
  therefore the only one that needs the three profile fields the balance
  refused (`data/strength.ts`, pure like `stats.ts`). It is the honest answer
  to whether weight and age are of any use: yes here, no there. Five things
  hold it together:
  - **A missing figure means no reading, never a default.** The balance could
    survive a guessed bodyweight because it only shifted a share; a standard
    cannot — 75 kg assumed for a 60 kg lifter is a whole band of error stated
    as a fact about a person. `canRead` gates it, and the card says which of
    weight or sex is missing rather than guessing.
  - **Published multiples are read as an anchor, not as a ratio.** Standards
    are quoted as multiples of bodyweight, which is linear, and strength is
    not: muscle area grows as the square where mass grows as the cube. So the
    multiple is taken at `REF_KG` and scaled from there by `EXPONENT` (⅔) —
    a heavier lifter's threshold lands below their bodyweight multiple and a
    lighter one's above, which is the direction Wilks, DOTS and IPF GL all
    agree on. It is also why the card does **not** print the bodyweight
    multiple: that figure is not what the verdict was computed from, and
    showing it invites "1.2 × bodyweight, why only Novice?".
  - **Four lifts, because four have published tables.** A standard for a
    machine press would be a number about that machine's leverage, and a
    bodyweight movement estimates to no load at all. A lift with no entry
    simply has no standing.
  - **Age relaxes the thresholds, at half a percent a year past forty**, and
    knowingly under-corrects: real decline past seventy outruns a straight
    line, so the bar stays harder than it should rather than softer. Erring
    that way round is right for a figure that pays somebody a compliment. An
    unstated age moves nothing — it is not an assumed one.
  - **A band, never a percentile.** Three approximations stack up — the lift
    is an estimate, the tables are coarse and disagree with each other at the
    edges, and the two adjustments are single-number models. So the output is
    a named level and the kilos to the next one, and nothing finer.
- **Under `MIN_SESSIONS` the card makes no claims.** Balance across two workouts
  is a Tuesday, not a weakness, and a coach prompt built on it would be
  confident nonsense. The card still stands, because it is the door — its
  empty state says what will appear there, which is more use than a card that
  refuses to be pressed.
- **Every period option is bounded** — `PERIODS` is 8 weeks, 6 months, 12
  months, and no "all time". The volume chart buckets whatever window it is
  handed, and all-time has no bucket size: one bar per week over three years is
  not a chart, and one bar per year over three weeks is not one either. Each
  period carries its own `bucketDays`, sized to land 8–13 bars, and the
  heading says which. Empty buckets stay in — a fortnight you did not train is
  a fact about the shape, and closing the gap would draw a history nobody had.
- **Cardio is a line, never a seventh axis.** It is not a muscle to be balanced
  against the others — but "none at all" is exactly the gap this screen exists
  to show, so it is stated under the weak points instead of being left out.
  What the six percentages *do* leave out is disclosed at the foot
  (`looseSets`), or a cardio-heavy month reads as a missing one.
- **`distanceKm` is re-derived from the stored set strings; the headline volume
  never is.** `volume` is each entry's own `vol`, because that number was
  written by `totals()` and is already gated to `load` sets — re-deriving it
  here would mean re-deciding what counts in a second place, and it is the
  number reported back to you in kilos. Distance is re-derived because it is an
  answer to a question `vol` deliberately refuses: it never had a total of its
  own. An unrecorded `—` contributes nothing rather than zero. The balance
  re-derives neither, counting rows instead.
- **A fun fact compares against the largest thing you have cleared twice over.**
  The threshold does two jobs: "about 1 elephant" says less than the number did,
  and always being plural is what lets every line read "{n} cars" and skip
  singular agreement, which German would otherwise need a case for in each one.
  The scale grows with the diary rather than being reseeded on a timer — the
  same training earns the same sentence, and passing a threshold is the reward.
- **Favourites are counted by the name frozen at log time**, like everything
  else that reads `history`: a routine renamed in March must not rewrite what
  February's workout was called, and one deleted since still counts the days it
  was actually trained.
- **`keyLifts` only reads `load`.** A trend needs one number that means the same
  thing in two sessions, and kilo-seconds and kilometre-minutes are not
  units — the same reason `totals()` refuses to add them into volume.
  `deltaKg` is `null` for a lift seen once and `0` for one that has not moved:
  "no reading yet" and "stalled" are different facts, and a prompt that
  confused them would call a new lift a plateau.
- **And that number is an *estimated* 1RM, not the heaviest weight** (`e1rmOf`,
  Epley `w × (1 + r / 30)`). The top weight is not comparable across sessions:
  100 × 8 after last week's 100 × 3 is a real week of progress that a
  weight-only reading reports as no change at all. Four things follow:
  - **The best set of a session is the best *estimate***, so 100 × 8 wins over
    110 × 3 and which of the two you happened to do stops deciding the trend.
    `latest` is that set, still in its stored `"100 × 8"` form.
  - **A true single is returned unchanged.** Epley would otherwise add its own
    3% to a set that already is a max.
  - **Whole kilos, everywhere.** Both Epley and Brzycki are population
    regressions good to roughly ±5% between two and ten reps and drifting well
    past that above it, so this is a trend line and nothing prints it as a
    target. A decimal would claim a precision the formula has not got.
  - **A bodyweight set still estimates to 0**, because `setKg` reads `BW` as no
    load — `keyLifts` has never had a figure to trend for those, and this
    changes nothing about that.

### The coach's contract is the seam

`buildPrompt` writes the request and `parsePlan` reads the reply, and neither
knows who is on the other side. That is the whole design: today the far end is
a chat app reached through the Android share sheet, and a tiny on-device model
later answers the same fenced block with the preview and the import path
untouched.

- **Every figure in the prompt is sets a week**, and the balance line names the
  unit and the range once for all of them (`promptBalanceUnit`). It has been
  wrong twice: it said "% of volume, weighted by muscle size" while the balance
  counted kilos, and later sent percentages while the line under it already
  sent rates — one reading in two units a line apart, which a model has to
  guess its way out of. A wrong guess about the unit is a confident
  recommendation about the wrong muscle, so this string moves whenever the
  arithmetic does. Stated once rather than beside every number: the weak line
  repeats neither. Prose, so it is in the user's language — unlike the
  identifiers in the fenced block.
- **`RegionStat` carries no share, and `stats.ts` has no `pct`.** Both went
  when the prompt stopped sending percentages — the last reader of either.
  Nothing on a screen or in the prompt is a proportion of your own training any
  more; every figure is a rate against a stated range, which is the point of
  the whole rebuild.
- **The prompt is in the user's language; the contract inside it is not.** They
  read it before they send it — it is shown in full, which is what makes the
  privacy switch on the step before it mean something rather than being a
  promise. But `"measure": "load"` is an identifier in this app's data, not a
  word being translated, and a German reply carrying `"gewicht"` imports as
  nothing.
- **The chips are a taxonomy; the ask is a sentence.** Six goals, a week seg and
  a gear list will never anticipate what somebody wants next month — a
  fortnight's rotation, every second day, a shoulder to work around — so
  `coach.note` is free text under its own `ALSO` heading, in the user's own
  words, and the far end reads prose anyway. It is the cheapest thing in this
  flow and the widest. Additive inside a key that already exists, so no
  `STORAGE_VERSION` bump — and **optional rather than defaulted**, because a
  stored `coach` replaces the seeded object wholesale, so a phone that saved one
  before this existed has no `note` and every read has to survive its absence.
  It is also why `promptIntro` stopped asking for "weekly routines": an intro
  that had already decided the cycle length would be arguing with the sentence
  under it.
- **Exactly one of the two rest-sharing features crosses this seam, and the
  other is named so it can't be missed.** A superset is a decision about *which
  two exercises*, which is what a routine holds — so `with: 'next'` is in the
  block and lands in `RoutineItem` unchanged, read liberally (`true` is what a
  model reaches for when a literal was asked for, the same argument that makes
  an untagged fence acceptable). A drop is a decision about how *that set* went,
  which nobody makes a week early and which has no honest planned form — so it
  has no field, and the prompt says so out loud rather than leaving it to be
  guessed at. A model told nothing either ignores drops or encodes them
  somewhere `parsePlan` drops on the floor; told this, it puts them in the
  prose, which is where advice about how hard to push a set belongs anyway.
  - **`with` is adjacency, so every filter that drops a row owns the pair it
    just broke.** `keepPairs` is that one reading, at the two seams that can
    drop one — a placeholder row in `parsePlan`, an unresolvable name in
    `resolvePlan`. This is *not* the orphan case the rest of the app resolves
    where it reads (`stopsOf`): an orphan is a pair with a half missing and
    reads back as no pair, where this is a pair between two exercises nobody
    joined and nothing downstream could tell. A trailing `with` is cleared with
    it, because every other *writer* here clears one too — `appendSessionEx`,
    `saveAsRoutine` — and resolve-at-read is the rule for data already stored,
    not for data being made.
  - **The preview draws the pair with the editor's own mark** — a hairline in
    the gutter and the word — rather than a badge beside a name, which would
    read as a property of one row. A pair arriving unannounced and only turning
    up afterwards in the routine is the one thing that screen exists to prevent.
- **Rule 3 makes the answer carry its own way home.** The reply is told to close
  with copy-this-message → open Spotter → paste. Whoever wandered off into a
  chat app has no reason to remember this flow, and `parsePlan` hunting the
  block out of the surrounding prose is what makes "copy the whole thing" true
  advice rather than a trap.
  - **There is a second way home, and the prompt offers it to the AI rather than
    printing it for the user** (`promptRuleFile`): Spotter answers a tapped file
    now, so a reply that *can* arrive as `plan.json` skips the copy and the
    paste — see the intake bullet under the deviations. Belt and braces on
    purpose, because the block still goes in the message: most chat AIs cannot
    attach anything, and swapping the working delivery route for an unproven one
    would be a downgrade. Nothing about the contract changed — the file is read
    by the same `parsePlan`, which is the point of it being the seam.
- **Names are the join key in both directions.** The prompt ships the library,
  the muscle-group keys and the equipment keys so the answer builds on what is
  here instead of inventing a second Bench Press; `resolvePlan` turns names back
  into ids, matching case- and space-insensitively across *every* language an
  exercise is named in — the prompt is German while half the library is still
  named in English.
- **Import is additive only.** New `custom` exercises and new `routines` through
  the shapes the app already has: nothing edited, nothing replaced, and
  `history` / `lastLog` untouchable by construction. The worst a bad plan can do
  is leave rows to delete, which is what lets the preview be a preview rather
  than a warning.
  - **So a routine you already have a name for arrives unticked** (`takes` in
    the coach overlay) — the same rule a backup merge follows, and it now says
    so in the same words (`addOnlyMissing`, shared with `RestoreSheet`, because
    two wordings would read as two rules). It used to arrive ticked, which made
    the one thing the preview warned about also the one thing it did by
    default, and you left with two routines called Push A. It stays *tickable*,
    unlike an empty row in the restore sheet: an empty row has nothing to add,
    where the AI's "Push A" may be a genuinely different workout that happens
    to share a name. The tag says which case you are in; the tick overrules it.
  - Exercises never needed this — `resolvePlan` matches them by name across
    every language and reuses the id, so a duplicate exercise cannot be created
    in the first place. Routines have no id to match on (the AI was never given
    one), which is why the name is the key and why the answer is a default
    rather than a silent skip.
- **The import step folds the reply away and then leaves.** Both halves are
  about the same thing — the step is a preview of routines, not a text editor:
  - Once a plan parses, the paste box collapses to a link
    (`importShowReply`), because it has done its job and the routines under it
    are what the screen is for. A parse that *failed* keeps the box open, which
    is the one time editing the raw text is the point.
  - Importing closes the coach *and* Insights and lands on the Routines tab. It
    used to print "Imported. 2 routines added." and leave you on the import
    screen holding a reply you were finished with; the list is the better answer
    to "did that work?", and it is the app's habit anyway — show the thing
    rather than announce it. Insights closes with it because it is what the
    coach was opened over, and dropping back onto it would put a screen between
    you and what you came for.
  - **Saying no is an act** (`importDiscard`), and it lands on the coach's first
    step. Without it the only way out was the back arrow, which for a reply that
    arrived from outside the app means backing into a prompt step the user never
    asked to see. An imported exercise is written with the same literal the
  new-exercise sheet writes, down to `load` staying absent — it must be
  indistinguishable from a hand-made one, or it reaches a buddy as a different
  shape.
- **The AI's reps and kilos land as `planned` only where this phone has no
  history for that exercise.** Where you have lifted the thing, your own "last
  time" ghost is the better number and the plan defers to it — the same rule
  `mergeRoutine` applies to a buddy's figures, and for the same reason: an AI
  that has never watched you lift does not get to overwrite what you actually
  did. Where you haven't, its figure is the only one anyone has, and a blank row
  would throw away the part of the recommendation that was useful.
- **An unresolvable group or equipment files under a row that exists, and the
  preview says so.** The lists are the user's, and a plan must not be able to
  grow them behind their back; filing under a raw key would strand the exercise
  outside the library's filter row, which is the state deleting a seeded group
  produces. Groups ship a catch-all and equipment does not, so the last row
  stands in.
- **No new native dependency.** The prompt leaves through React Native's own
  `Share`, not a clipboard module: there isn't one in the project, adding one
  costs a dev-build rebuild for one button, and the share sheet is the primary
  action anyway. The prompt is `selectable` for the phone whose share target
  refuses text.
- **Counts compose from their own singular and plural pieces**
  (`countRoutine` / `countRoutines`), because the same count lands in three
  different sentences and every one of them can legitimately be 1.
- **The coach sits directly above Insights in the overlay stack** (76 → 77).
  It is opened from there and has to cover it; closing it drops you back onto
  the statistics you left.

## Drop sets and supersets

Two features, one sentence: **a tick earns a rest only when nothing is queued
to be taken immediately after it.** The app started `restSeconds` on every
tick, which is the precise opposite of what either of these things means, and
that was the only thing actually missing — a drop set was always representable
(add a set, type a lower weight, tick it) and a superset always workable (swipe
across, since changing exercise deliberately keeps a running rest). The mockup
is `design/drop-superset-mockup.html`; the arithmetic is `src/data/superset.ts`,
pure like `plan.ts` and `tips.ts`, with structural row types so it owes the
store nothing.

- **A drop is made in the session, a superset only in the routine.** Not an
  inconsistency — a drop is a decision about *how that set went*, which nobody
  makes a week early, and a superset is a decision about *which two exercises*,
  which is exactly what a routine holds. So `RoutineItem.with` has no drop-set
  twin, and **there is no pairing control anywhere in a running workout**: the
  overview sheet shows a pair and never offers one. The planned-drop version
  (*Last set drops* on an editor row) was drawn and turned down — it has to
  invent a weight, and the app already refuses to let a plan write a number
  over your own history.
- **`with: 'next'` is adjacency, not a group id.** The editor is a flat
  reorderable list, so a drag out of a pair breaks it with no bookkeeping and a
  third exercise joined on is two links in a row. An orphan — the last row, or
  a neighbour deleted since — resolves to no pair *where it is read*, never
  swept, exactly as a plan entry naming a deleted routine is. Three places had
  to learn that a pair needs both halves, and each is a place a row can leave
  or arrive: the editor's ×, `removeSessionEx`, and `appendSessionEx` (adding
  an exercise mid-workout must not hand a trailing `with` the partner it never
  had).
- **One exercise per screen became one *stop* per screen.** A `Stop` is a lone
  exercise or a pair, as indexes into `session.list`; `s.active` still means an
  *exercise* for everything that writes it — the overview's jump, the buddy's
  offer, a fresh session — and is snapped to its stop on the way in. That is
  the whole cost of the decision. The chip, the swipe and the bottom button all
  count stops; **the list itself stays flat**, so `progress.list`,
  `removeSessionEx`, `totals` and the buddy diff learn nothing.
- **Exactly one row is live across a pair, and the round is what advances.**
  `roundOf` is the lowest set index still open in either half — the same "first
  unlogged row" arithmetic the plan uses to decide what *next* means, one scope
  down — and within a round the first half goes, then the second. Derived,
  never stored, so there is nothing to persist and nothing that can drift. A
  half that has run out of sets is skipped, which is the whole of what uneven
  set counts need.
- **The heading names the pair; the *half's* name says which machine.** The
  title never moves, and the live half's name goes accent — so "which of these
  am I standing at" is answered without anything jumping. How-to, the
  kind/group line and the machine setup move down into each half, because they
  are facts about one machine. `Ledger` is the component that owns them, drawn
  once normally and twice inside a pair, and it owns the column header too:
  `unitsFor` is per-exercise, so a pair of a plank and a run heads its two
  halves differently.
- **A drop is inserted, not appended** — after the set you just lifted, which
  is the row above the live one, or the end of the ledger once the exercise is
  sealed. That is the one way the two held buttons differ, and it is the
  difference between them: Add set means one more at the end, where a drop is
  positional by definition. Appending was the first cut and it is wrong the
  moment you drop off set 2 of 4 — the drop lands behind two sets you have not
  done yet. With nothing ticked there is nothing above to drop from, so the
  button is absent rather than dead.
- **A drop is one set that is dropping, so the tick belongs to the set and not
  to the row.** Calvin's call, and it is the sentence the whole drawing follows
  from — the first two attempts drew a drop with a working set's row and then
  annotated it (a hairline in the gutter, at three lengths), which reads as an
  annotation arguing with everything else on the line. The unit is the **chain**
  (`chainsOf` in `data/superset.ts` — the row and the drops taken off it), drawn
  as one block with one tick, and the mockup is
  `design/drop-set-stack-mockup.html`.
  - **A drop used to take a set number, which is the bug under the complaint.**
    The index cell rendered `index + 1`, the raw row index, so a drop off set 3
    drew as *4* and the working set under it as *5* — a four-set exercise
    counting to five in its own ledger for the rest of the workout. Every set
    number now comes from `setNumberOf`, and a drop line prints none at all: it
    is not a set being counted. It keeps the *cell*, so a verdict still lands on
    the line it is about — which is the collision the gutter riser was invented
    to dodge, and the reason sub-numbering (`3a` / `3b`) was rejected.
  - **Adding a drop takes the tick off, and nothing writes it off.** A set is
    done when every line of it is (`chainDone`), so one fresh unticked line is
    the whole of it. The row above keeps its own `done`, which is what lets
    `liveIn` walk straight to the drop instead of back to the set you have
    already lifted — and it is why this needed no new state and no third
    half-ticked thing to draw.
  - **The tick moves one line at a time, in both directions.** It logs the
    first line still open, and on a sealed set takes the *last* one back rather
    than the whole chain: the commonest reason to untick a set you dropped is
    that the drop's figures are wrong, and clearing the working set with them
    would cost a correct row to fix an incorrect one.
  - **Sets are chains, volume is rows, and the diary is rows.** `totals()`
    counts chains because `n of m sets` is progress against what the routine
    asked for — an exercise that moved *further* from being finished every time
    you dropped would report the opposite of what happened. Volume counts every
    ticked line, because a drop is work: 50 × 8 is 400 kg whatever it is part
    of. The diary's `n sets` counts rows, because there it is a tally of efforts
    with no plan to measure against, and it keeps the `↳` fold so the record
    still says the two were one effort. Three readings of "a set", each
    answering its own question — Calvin's call on the third.
  - **The delta is the drop's other half**, in the ghost column: `−15 kg`,
    measured from the *top of the chain* rather than the line above, because the
    reference has to stay fixed for the figures to be a curve — −15 then −25
    against 8 then 6 reps says how much weight had to come off for the muscle to
    keep producing reps. That column is free by construction (a drop is written
    `prev: '—'`), and it is absent when there is nothing to report: an equal or
    heavier line, or any measure whose left cell is not a weight.
    - **And it carries no arrow.** `MARK_D.down` *is* a down arrow at
      `accent400`, drawn in the cell immediately to its left for *go lighter
      next time*. Two of them meaning two things on one line is worse than one;
      the minus already says which way it went.
  - **Removing a set removes its drops, and the held label says so before the
    hold rather than after it** (`removeRows` / `removeSetLabel` — one reading,
    or the warning could describe something the button doesn't do). They are
    lines of that set and there is nothing for them to be a line of afterwards;
    promoting the first drop instead would quietly rewrite what you lifted. The
    unticked-only rule is now over the whole chain, so a logged drop protects
    the set it hangs from, and *never the last set* is counted in chains too.
  - **`SetStack` owns the set, `SetLine` owns the line, and the tick is drawn
    over a footprint the line still reserves.** `inputW` / `flyDx` are written
    out of that row's column widths, so a column *leaving the flow* would have
    moved every one of them; the block bleeds its own border and padding back
    out in negative margins so its content box is the plain row's and every
    figure stays in its column. `+ Note` is offered once per set, on its last
    logged line — per line it draws twice under a two-line set, which is the
    furniture this arrangement exists to avoid.
  - **The buddy still counts rows, and `chained` stays.** `BuddyProgress.list`
    carries a flat `done: boolean[]` with no `link` on the wire, so the
    receiving phone cannot group *their* rows into chains; both sides inflate
    symmetrically, which is what the existing comment argues. Nothing about this
    feature crosses the wire, and no `STORAGE_VERSION` bump — `link?: true` on
    `LoggedSet` was already the whole model.
- **The explanation stands where the countdown would have been.** *Drop from
  set 3 — no rest* / *No rest — straight from {name}* live in the wait slot, so
  they leave with the row the way a rest does and nothing permanent is added to
  the ledger. `WaitLines` draws it above the buddy's line: it is a fact about
  the row rather than about either of you.
- **A tick that earns nothing also ends what was running.** Ticking the first
  half of a round mid-rest means that rest is over, and leaving it counting
  down would draw a stale clock on the row you are walking to. Adding a drop
  clears it too, for the stronger reason that the tick which wrote it is now
  claimed to have earned none. Both go through `rest: null`, so the alarm is
  cancelled by the scheduling effect's existing cleanup — no new cancel path.
- **The turn waits for the chain, not for the row.** `mine < theirDone` assumes
  one set is one handover; a drop is two sets that must both be yours, so a
  live `link`ed row makes the turn yours outright. `mine` stays a count of rows
  on both sides — their drops inflate theirs the same way yours inflate mine,
  where counting chain heads on this side alone would skew it. Nothing new
  crosses the wire.
- **Four optional fields, no version bump.** `RoutineItem.with`,
  `LoggedSet.link`, `SessionExercise.with`, and `LoggedExercise.links` / `with`
  — every one additive inside a key that already exists, so
  `STORAGE_VERSION` stays 4. The buddy sanitiser (`cleanRoutineItem`) had to
  learn `with` explicitly, since it rebuilds field-by-field and drops what it
  doesn't know: a protocol addition, and an older build simply sends a routine
  that arrives unpaired.
- **The diary keeps both brackets, because the numbers alone misreport them.**
  `50 × 8` under `65 × 6` reads as a set that went wrong unless the record says
  the two were one effort, so a drop folds into the set it came off with `↳`,
  as one item in the existing wrap; a pair keeps the session's hairline down
  the side of its two blocks, at `accent800` — one step down, for the same
  reason the mark's glyph dims there. The set count stays honest (*4 sets*,
  because four sets were lifted), and a note still breaks the wrap: one feature
  owns the figure, the other owns the line under it. `with` is written only
  when the partner actually got a set ticked, or the bracket would describe
  nothing — and `saveAsRoutine` / `saveDayAsRoutine` carry it back out under
  the same condition.
- **Today's hero card brackets a pair too, and hangs the rule in its own
  padding.** Every other surface that draws a routine says which two are joined
  — the editor's gutter hairline and word, the overview sheet's and the diary's
  rule down the side of two blocks, the coach preview's borrowed mark — and the
  one screen you read *before* deciding to train listed `tr.items` flat.
  `HeroStop` fixes that in both branches, planned and live. The mockup is
  `design/hero-superset-mockup.html`, and four of its arguments are the shape
  of what shipped:
  - **The mark, not the word.** You made the pair in the editor, which names it,
    and you will stand in it in the overview, which names it again; this card is
    the glance in between. The word costs ~14px per pair on the card above the
    week strip and Recently, which is the most expensive vertical space in the
    app, and buys a sentence two other screens have already said.
  - **Hung at `marginLeft: -10`, so nothing moves.** 1px of rule plus a 9px gap
    is exactly the 10 taken back, so the paired names keep the left edge every
    other line has and the bracket is drawn in space the card was not using.
    Inset was the first cut and the two rows read as a sub-list before they read
    as a pair.
  - **`accent700`, not the diary's `accent800`, and not as a preference.** Out
    in the padding the rule sits on the hero gradient's own `accent900` corner,
    where a 1px `accent800` is four hex digits from its ground and does not
    draw — every frame of the mockup was rendered with an invisible pair until
    it was found. Inset it would not need raising, the gradient having already
    lightened 10px further in.
  - **Through `stopsOf`, which is why it takes `Joined` now.** That function
    read `{ sets: Row[]; with?: 'next' }`, and a `RoutineItem`'s `sets` is a
    count rather than an array — so a hero walking `with` for itself would have
    been a fourth reading of adjacency and a fourth chance to disagree about
    which two are joined. `stopsOf` / `stopAt` are typed over the pairing alone;
    everything below them still needs the rows. The summary is untouched: a pair
    is two exercises taken back to back, not one exercise.
- **But everything read back *index for index* takes the working sets only.**
  The diary is a record of the day and keeps every row; the three maps that
  answer "what am I doing next" are aligned against a routine that has never
  heard of a drop, so an extra row in them shifts everything below it:
  - **`lastLog` and `lastMarks`** are read `last[k]` by `sessionFrom`, so a
    drop off set 2 of 4 hands set 3 the drop's figure and its verdict — and
    permanently, since `lastLog` is rewritten from the shifted session next
    week too. Both are cut in the same place, or the arrow lands on a set
    nobody judged; an exercise where *only* a drop was ticked falls back to
    what there is, both keys together.
  - **`saveAsRoutine` / `saveDayAsRoutine`** take the count *and* the numbers
    over the unlinked rows. `RoutineItem` has no `link` twin by decision, so a
    drop cannot come back as a drop — and it must not come back as a set
    either, least of all as the weight, which it would be: it is the last row
    the figures are read off.
  - The tick is what keeps a drop from being empty in the first place. A row
    is filled from its ghost **one field at a time** — a drop arrives carrying
    the weight it came off and has no ghost, so the old pair-wise test saw a
    filled cell and logged `65 × 0`, the exact record the tick refuses
    everywhere else. The right-hand figure is what makes a set a set; with
    nothing typed there and nothing to copy, the tick is refused. `logSet` is
    the one reading of that rule — the box used to carry a second copy, which
    is how the two came to disagree.
- **No tip for either.** Both are reached through labelled controls — *+ Drop
  set*, and a routine you paired yourself. The catalogue's admission test is
  whether a careful person could use the app for a month and never find it, and
  neither can hide.
- **Deliberately not built.** Rest-pause, cluster sets and myo-reps are all the
  same field with a different rest between the halves: if `link` ever needs a
  duration it is `link?: number` in seconds, with `true` meaning zero —
  additive again, so waiting for someone to ask costs nothing. Circuits repeat
  `with: 'next'` and the editor would draw them with no new code, but the
  paired screen is sized and worded for exactly two, so a third half is a third
  screen decision rather than a longer bracket.

## The tips

Half of what this app can do is invisible: a kg cell is a text field that is
also a slider, a set number is a button, the bottom CTA sometimes has to be
*held*, the `3 / 5` chip is the door to the whole workout. The tour's second
screen already says four of these — and it says them at minute zero, before
anyone has opened a session, on a screen seen once (its Settings row is
commented out, because finishing the tour re-applies routine picks). A **tip**
says the same thing in the place it applies, the first time you are standing
in front of it, and then goes away for good. Mockup:
`design/tutorial-mockup.html`.

- **The model is `src/data/tips.ts`, and it deliberately does not know what a
  screen is doing.** Pure like `plan.ts` / `stats.ts`: the `TipId` union,
  `TIP_ORDER` (priority), `TIP_SHAPE`, `pickTip(tips, armed)`. Whether a set is
  open or a rest is running is the *screen's* state, and a copy of it in there
  would be a second reading of the session kept in step by hand — so a surface
  offers the ids it could show and `pickTip` answers with the one it should.
  That is also what makes "never two on one screen" structural rather than a
  rule each site has to remember.
- **`tips: Record<string, { seen, done }>` is additive**, like `coach` and
  `buddySecrets` — no `STORAGE_VERSION` bump, no migration. A phone that has
  been logging for months simply lacks the key and meets every tip fresh, which
  is right: nobody explained the drag to it either. It is in a backup (a backup
  is the durable slice), untouched by `mergePersisted` (which returns only the
  keys sessions / library / plan touch), and **never in a buddy snapshot** —
  what one phone has been taught is not the buddy's business, the same rule set
  marks follow.
- **Doing the thing is the dismissal.** `tipDone` is written from the gesture —
  a drag that steps a figure retires `drag`, `onCopy` retires `ghost` — not from
  a button. It is idempotent, so every call site fires it blindly, including
  `NumCell`'s `onUpdate` on every step of every drag; `patch` returns the
  identical state when its updater returns null, so React bails and the repeats
  are free. The × means "I know this already" and lands in the same place.
- **Three showings, then never** (`MAX_SHOWS`), and a showing only counts after
  a two-second dwell (`DWELL_MS` in `<Tip>`) — one that flashed past while the
  list scrolled was never read. A tip being ignored is furniture, and furniture
  is what the session screen is trying hardest not to become.
- **One tip per visit, not just one at a time.** Most of the session's tips are
  armed by the same empty live row, so the overlay picks once per mounting and
  holds it: when that one is dealt with, nothing replaces it until you next open
  the screen. Otherwise a first workout is a slideshow of eight hints.
- **Nothing new is offered over an open keyboard — but a tip already on screen
  stays.** The gate is on the pick, not the arming. Unmounting and re-mounting
  it would charge a second showing against a budget of three for a hint nobody
  looked away from.
- **The tip borrows no outline that already means something.** Not the live
  box's accent fill, and above all **not dashed** — dashed means *this one is
  held* at three sites, and a dashed hint reads as a control you are supposed to
  press and hold, which is the exact confusion it exists to end. One hairline,
  no fill, an accent dot, dim text, one × at `slop`.
- **Only `drag` gets a demo, and the demo writes nothing.** Words teach a tap
  and cannot teach a slide that isn't a scroll. `DragDemo` draws a pointer and a
  figure on an overlay above the cell (`pointerEvents: 'none'`); the `TextInput`
  underneath is untouched and still typeable. Every number in it is the real
  one — the travel is `DEMO_STEPS ×` the cell's own `px`, and the touch ring
  blooms *while* the figure is already moving rather than before it, because the
  gesture has no wait in it and a demo that pauses teaches one that isn't there.
  It scrubs at 1×: the gain is what a real finger finds the moment it sweeps,
  and a pointer moving this unhurriedly would be lying to claim it. It is the
  one animation in
  the app deliberately **off** the native driver: the figure is text, which no
  driver can animate, so the pointer and the number share one JS clock instead of
  drifting apart on two. It does not buzz — `buzz.grab` reports that *your*
  finger took the cell, and the ring is that moment drawn instead.
- **The `drag` tip's sub-line spends its aside on the sweep, not the notch.**
  The notch is the speed a first drag is made at and the one it discovers by
  itself; that a faster slide steps in bigger jumps is the half nobody would go
  looking for, so that is the half the line says out loud.
- **The tour reads the tip strings.** `obFeatTick/Drag/Rest` are gone;
  `onboarding-overlay.tsx`'s `features()` reads `tipTick` / `tipDrag` / `tipRest`.
  One list, two surfaces, so a rundown card and an in-place hint cannot phrase
  one gesture two ways. The buddy card kept its own copy, having no tip twin —
  the button that opens pairing carries a label, so it fails the admission test
  in the right direction.
- **Two features get a tour screen of their own, and neither is a tip.** The
  buddy half and the AI coach are the two things in this app that cannot be
  taught in place: a tip stands next to the control it explains, and both of
  these are *flows* — pairing is the only thing here two people have to do
  together in the right order before anything works, and the coach's middle
  step leaves the app entirely for a chat window that has never heard of
  Spotter. So they are numbered walkthroughs (`buddyWalk` / `coachWalk`, drawn
  by `Walk` — the feature rows' own shape with the glyph tile spending its 30px
  on a digit), and the catalogue in `tips.ts` stays closed.
  - **The buddy screen carries its own permission.** The radio card sits under
    the walkthrough that explains it, not on the perms screen — the reason and
    the ask on one screen, which is also what stopped `obPermRadioWhy` being a
    compressed second telling of `obBuddySub`; it now says the other half, what
    Android is about to put on the glass. Grouping the two permission cards
    only ever grouped them by implementation: a rest alert has nothing to do
    with a training partner, and on a build with no radio that screen has
    always been one card under a title that said "two". So `perms` is the rest
    alert alone, plus `obPhotosNote` — the permission this tour deliberately
    never asks for, which has no feature screen of its own to sit on.
  - **Each sits ahead of what it explains, or behind it.** Buddy comes before
    `you`, because the name field ("so your side of a shared session has a name
    on it") is a question with no reason on it until it has been read. The
    coach comes second to last, because it is the one feature with nothing to
    say yet — it reads eight weeks of a diary that is still empty — so it is
    introduced as something waiting rather than something to do now, and its
    closing line says so.
  - **`hasRadio` is the whole gate**, which is why `steps` is state rather than
    the module's `STEPS`. Not Train alone as well: the card lives here now, so
    this is the only place a re-run can say *Train alone is on*, and a phone
    already training alone still gets the screen in its answered state.
    Captured at mount, or a list that renumbered mid-flow would move the steps
    under a back press; the progress fill and `next` read it, not the constant.
  - **Each permission screen resolves its own unanswered card**, and its one
    button says what leaving it will mean — *Skip — train alone*, *Skip — no
    alerts*, the `obSkipNoPlan` grammar. `leavePerms` used to answer for both
    cards at once; two screens means the rule is stated twice rather than once
    over both. The week screen's plan reminder is the exception that proves it:
    off is already its default, so there is nothing to resolve, and Continue
    stays *Continue* — that button also continues past the week, and
    relabelling it after the reminder would misdescribe what it does. That
    third card is also why `obPermsSub` stopped promising nothing would be
    asked again.
  - **The coach is not in the `how` rundown.** It has a labelled button on the
    statistics card, so by the rundown's own heading — things you wouldn't guess
    by looking at a screen — it doesn't belong there; the buddy row is the
    headline the very next screen expands.
- **The tour shows what it can and only describes the rest**, which is what took
  the opening two screens down to one and the rundown down to two rows.
  - **Welcome and the rundown were one screen's worth of content over two.** The
    hero says what the app is, the rundown says what it does, and neither filled
    a page — so the hero moved onto the rundown and `welcome` is gone, footer
    and all. *Get started* / *Skip setup* came with it: the first screen is
    still the one you can leave the tour from.
  - **The tick and the drag left the rundown, because a rundown can only ever
    describe a gesture.** The drag moved to the profile step, where it is
    demonstrated on a field you can drag *while reading the line about it*; the
    tick is left to `tips.ts`, which teaches it on the first set row it applies
    to. What stays is the pair no screen can demonstrate at minute zero — a rest
    that starts itself, and a second phone that isn't in the room. `obAndMore`
    went with the screen that counted rows.
  - **The profile fields are the first draggable numbers you meet**, and that is
    the whole reason they now use the real gesture rather than being three plain
    inputs: age, weight and height are figures where a wrong answer costs
    nothing, which is the right place to learn a control your sets depend on.
    The `drag` row stands directly above them, reading `tipDrag` — the tip's own
    words, one list, every surface.
    - **`num-drag.tsx` is where the gesture lives now** — the physics, the
      glide, the pan/tap race, the `box-only` trap and `DragDemo`, extracted
      from the session so the two sites cannot drift. `NumCell` keeps only its
      drawing and its refusal shake and calls `useNumberDrag`.
    - **The tour's ScrollView had to become `keyboardShouldPersistTaps="always"`**,
      for the reason the session list already is: under `"handled"` a ScrollView
      grabs any touch that isn't already a responder, and that grab cancels every
      gesture-handler gesture — including this one. It also yields `scrollEnabled`
      while a drag runs.
    - **An empty field starts its drag from a stated figure** (30 / 70 / 175),
      because a set row gets that for free from last time's ghost and this
      screen has no history to read. Starting at zero made the gesture useless
      on the one screen teaching it — reaching a real body weight from 0 is a
      sweep nobody finishes. It is never drawn: the placeholder stays a dash and
      the field is empty until you move it. It only decides where the first
      notch lands.
- **The week is dragged, not cycled** (`components/week-board.tsx`). Seven day
  slots, the picked routines under them, and one gesture between: hold a
  routine, put it on a day. Tap-to-cycle worked and taught nothing — it was a
  control invented for this screen and found nowhere else, on the screen whose
  job is to hand over the app's habits.
  - **It holds first, where the number drag deliberately doesn't**, and that is
    the same trade decided the other way. A number cell buys immediacy by giving
    up the scroll *on that cell* — a 74px target in a row that is mostly not
    cells. These are full-width rows, so an immediate grab would cost the screen
    its scroll outright; `HOLD_MS` buys it back, and the lift plus `buzz.grab` is
    what says the hold landed. The number is **imported from `DragList`**, not
    redeclared: a hold that meant 220ms here and something else in a reorder
    would be two gestures wearing one name, and the merge that brought the two
    features together is exactly where a second copy would have started drifting.
  - **Pool → day assigns, day → day moves, day → anywhere else clears.** One
    gesture for all three, and a routine is never consumed: the same one goes on
    as many days as you like. The × on a filled day is the quick way out, not a
    second mechanism.
  - **Positions are measured, and so is the gap between the two coordinate
    spaces.** `measureInWindow` and a gesture's `absoluteY` do not share an
    origin on Android — under edge-to-edge they differ by the status bar, which
    landed every drop one row off until it was found. Nothing in either API
    states the gap, so `skew` reads it off the one thing in both spaces at once:
    the row under the finger, whose top is `absoluteY - y` in touch coordinates
    and `srcRect.top` in measured ones. Do not replace this with a constant.
- **Two steps carry their button at the end of their own content**, rather than
  on a bar over it: buddy, where the lower half is a permission to answer, and
  the week, where it is the pool you drag from and the reminder under it. A
  primary action parked on the glass is a way past the thing the screen is for.
  Everywhere else the answer is already in view, and a button that moved about
  would be worse than one that waits.
  - **`MoreBelow` is the cue that those steps need**, and it earns its place by
    disappearing: one chevron over the foot of the scroll, gone the moment the
    bottom is reached, never taking a touch. It nudges **twice and then holds
    still** — `DragDemo`'s rule, for the same reason — after which it is a sign
    rather than an animation. `MORE_EPS` keeps it from pointing at a rounding
    error, and `linger.beckon` is its one leg.
- **The catalogue is closed on purpose.** The admission test is *"could a
  careful person use this for a month and never find it?"* — and if the answer
  is yes for something not on the list, the honest fix is usually the control.
  There is no tip for Start, Add exercise or Settings; `+ Add exercise` is only
  unfindable while the overview sheet is, which is why `chip` is a tip and
  adding an exercise is not.
- **`finishLogsNothing` is not a tip**, and the distinction is the point. A tip
  teaches something invisible three times and retires; that line is a permanent
  statement of what a button is about to do, drawn under Finish while
  `tot.done === 0` in both places Finish lives. It is the answer to "how do I
  cancel this" — `finishSession` writes no `history` entry when nothing was
  ticked, which is what Discard used to be for, but nobody hunting for a way out
  tries a button labelled *Finish*. It is `savedEmpty` in the other tense on
  purpose: two phrasings of "nothing happened" would read as two rules.
- **"Show tips again" lives in ordinary Settings**, not the danger corner. It
  writes `tips: {}` and nothing else — nothing re-applied, nothing overwritten —
  which is precisely what re-running the tour could not promise. The count on
  the right going back to zero is the whole confirmation it needs.

## The diagnostics log

Everything this app gets wrong that is worth chasing happens where a debugger
cannot follow: a link healing in a gym, an alarm firing through a locked screen,
a session coming back after Android killed the process, two phones disagreeing
about whose set it is. The bug report was a memory of what the screen looked
like an hour ago. This writes it down as it happens — `src/data/diag.ts` for the
recording, `<Diagnostics>` for the harness, three rows in Settings' Data
section. It is Calvin's, has no design behind it, and is off by default.

- **It records events, not state**, and **every line carries both clocks** —
  wall time and `elapsed`. Half of what is worth chasing here is exactly those
  two disagreeing (a screen lock, a resume, a buddy's rest re-anchored on
  arrival), and one clock would make those lines say nothing. What it never
  records is the per-second tick or a drag's per-frame steps: the argument the
  saver's dirty check makes about `elapsed`, one module over.
- **`dlog` is off unless the setting is on, with one deliberate third state.**
  `on` is `null` until hydration lands — and the most valuable lines in the file
  happen before that: what the blob held, whether a session resumed, how far its
  clock was advanced. So an undecided launch buffers into a bounded `preroll`
  and the first `setDiagOn` either takes it or throws it away. After that the
  answer is settled for the process and `dlog` returns on its first line, which
  is "off costs nothing" intact — it just starts one beat later than it looks.
- **Most of what is recorded is *derived*, in `<Diagnostics>`.** A transition in
  state is a fact the store already holds, and watching one there costs nothing
  at the site that caused it: a session appearing, a rest stamped or skipped, a
  link up or down. Only what leaves no trace gets a `dlog` where it happens — a
  payload sent, a proof refused, an alarm handed to Android — because those are
  events rather than values and by the next render they are over. A store
  littered with logging is a store where the logging and the behaviour drift
  apart; a component reading transitions can only report what happened.
- **Two places for the bytes, and the split is the whole design.** The live log
  is a file in the app's own document directory, appended through a debounced
  buffer, because that is what survives a process death and has to be cheap.
  The *export* is a whole copy written into a folder the user picked, because a
  SAF document cannot be cheaply appended — every write is
  open-truncate-write-close through a content provider. So the folder gets a
  file at the moments worth one: a finished session, or the button.
- **Appended through a `FileHandle`, not rewritten.** `File.write` replaces, so
  the obvious version reads half a megabyte back and writes it out again on
  every flush — during exactly the activity being measured. Seeking to the end
  costs the batch. That needs bytes, and this runtime has no `TextEncoder`
  (Hermes ships none; Expo's winter runtime installs `TextDecoder` and
  `TextEncoderStream` but not the encoder), hence the twenty-line `utf8` — whose
  multi-byte branches exist for exactly one real case, a German name. The
  whole-file rewrite survives as the fallback and as the trim.
- **The folder is a SAF tree URI, not a path.** Android will not let an app write
  into shared storage by name, and the grant is persistable, so `diagDir`
  survives a restart and the picker is one-time setup rather than per export.
  It can still be revoked — folder deleted, storage cleared — so every write
  answers failure rather than trusting it, and the row offers the picker again.
  `folderLabel` decodes the tail so a settings row says `Development/Spotter`
  rather than the machine's answer to a question about your own phone.
- **The filename carries whose phone it came off** (`diagFileName`). The errand
  is two logs in one folder on a laptop after a shared workout; a timestamp
  alone means opening both to find out which is which.
- **Names are in it and training is not.** A log with `buddy=` and no name
  cannot be lined up against the other phone's, so names and a shortened
  `selfId` are in the header. No set, weight or note ever reaches a line — what
  someone lifted is diary, and this is a machine transcript.
- **`diag` and `diagDir` are additive `PERSIST` keys** — no `STORAGE_VERSION`
  bump, no migration — and they ride in a backup like every other setting. A
  restored `diagDir` names a grant the new phone doesn't hold, which is the
  revoked-folder case the export row already answers. Nothing about this is in
  a buddy snapshot: what one phone has been asked to record is not the buddy's
  business, the same rule set marks follow.
- **A derived line depends on the value, never on the object it came from.**
  The first real logs came back 46% one repeated line: the `exercise` watcher
  depended on `s.session`, which is copy-on-write, so every keystroke and every
  frame of a number drag re-fired it — the exact per-frame recording the rule
  above forbids, arrived at by accident. Depend on `s.active`, not on the
  session that holds it. Two more came from the same batch and are the same
  lesson from the other side: a **rest replaced by a fresh rest** fell through
  every branch of its transition test, so a workout with twenty rests recorded
  two (`at` identifies a rest, exactly as `<RestAlarm>` reads it), and
  `totals()` at the end-of-session transition read the session that had *just*
  become null and reported `0 of 0` for the workout — the numbers have to be
  captured while the session still stands. **A set landing is now its own
  event**, derived from that count, because everything else in a workout hangs
  off it and a drop set or a superset earns no rest to infer it from.
- **The automatic export waits for the session to settle** (`EXPORT_SETTLE_MS`).
  Written on the instant the session ends, the file stops at `session ended` —
  and the goodbye, the link coming down and the radio restarting all land in the
  twenty seconds after it, which for a shared workout is the part worth having.
  The cost is a force-close inside that window losing the automatic copy, which
  is what the Save row is for.
- **The rows reveal themselves.** With the switch off there is nothing under it
  but the switch — a folder row, a save row and a clear row are furniture on a
  phone that is only being trained with. Save-now with no folder yet asks for
  one on the way rather than sending you to the row above and back.

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
- `<image-slot>` is filled by the photo picker rather than drag-and-drop —
  and whatever fills it goes through `src/data/photos.ts` first: downscaled,
  JPEG'd, and moved out of the OS-clearable picker/camera cache into the
  document directory. The store only holds durable URIs from then on;
  `deletePersisted` cleans up replaced files and never touches a URI it
  doesn't own, which is what keeps pre-existing cache URIs harmless.
- The design's `recent` array is computed but never rendered — not ported. What
  Today *does* show under the week is **Recently**: the last two `history`
  entries, read as written (name frozen at log time, `vol` as `totals()`
  counted it), each tapping through to its day on Plan. That handoff is
  `planFocus` — a one-shot ISO date the Plan screen consumes and clears in an
  effect, so a cold open still lands on the present month.
- **Today has no workout chooser, and the Routines tab is why.** `pickWorkout`
  and `PickWorkoutSheet` are gone: they listed every routine plus a free
  session, which is the Routines tab's whole job one tab-tap away, now with
  search and the seed collection behind it. Every job the sheet had was
  reassigned before it went — free session and build-together sit on the
  Routines tab, and the rest-day card carries its own **Free session ›**
  because the note used to point at the row this removed.
- **Today's week is a strip, not seven rows.** The rows restated Plan's list
  one screen from Plan; the strip keeps the glance in the calendar's own dot
  grammar (full dot trained, ring planned, dash rest, today framed) and keeps
  the tap — `dayPlan`, the plan sheet, now handed an ISO date. Trained beats
  planned on a day that is both, exactly as the calendar's full dot does. Two
  things follow from the strip being a glance rather than a list:
  - **No "tap to change" hint.** It was written for Plan's seven named rows,
    and those are gone (see "The Plan tab"); under this heading are seven dots
    you read. The tap still works — it is a bonus on a glance, not the glance's
    purpose — and `tapToChange` went with its last caller.
  - **Seeing the whole plan sits *under* the strip, not beside the heading.**
    The glance is what you came for; the way out of it is what you reach for
    after reading it, so **See plan ›** is a left-aligned ghost link on the
    line below — the rest-day card's **Free session ›** grammar.
- **Plan carries a `‹ Back` header, and the weekday rows under its grid are
  gone.** It is registered in the tabs but has no button in the bar, so back was
  the only way out and nothing on the glass said so; the header is the same shape
  Settings, Insights, Buddy sync and the picker use, with
  `router.canGoBack() ? back() : replace('/')` as the floor for a cold landing.
  The rows were the second answer to a question the calendar above them already
  answered — see "The Plan tab" for the model that replaced them and for where
  each of their jobs went.
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
- **`DOW` is the weekday key set and is never rendered.** What a screen shows is
  `DAYS_SHORT[s.lang]` from i18n — the keys read as English in either language,
  and did for a year before anyone noticed. Weekday *indexes* (a `week` rule's
  `dows`, `todayDow`, `dowOfISO`) are Monday-based to match it.
- **The live session is one exercise per screen**, not the design's stack of
  collapsed cards. The whole list, Add exercise, Discard and Finish live in the
  overview sheet behind the "3 / 5" chip; the bottom button is navigation only
  (Next exercise / Finish workout). Swipe or the overview moves between
  exercises — `s.active` is still what drives it, and the swipe stays a swipe:
  the hold guards the button, not the gesture.
- **Back leaves the session running and lands on Today.** It used to be
  swallowed: the design has no back route out of a workout, and the worry was a
  stray press throwing one away. But a workout is the one screen you have a
  real reason to step out of mid-way, and back is the gesture Android reaches
  for. So it minimizes (`sessionMin`) and navigates to `/` — the move the buddy
  tap already made, with a different destination. Nothing is discarded,
  `elapsed` keeps counting, and both the tab-bar strip and Today's hero are the
  way back. Finish, held, is still the only thing that ends a session, which is
  what makes a stray press cheap. `useBackClose` lost its `swallow` option with
  its last caller.
- **A running workout owns Today's hero card, and no second one can start.**
  Two halves of one rule, and the first half is why the second is needed:
  backing out put every Start in the app within reach of a live session, so
  `start` refuses outright — any Start tap while `s.session` is set resurfaces
  it instead of replacing it, where it used to refuse only once a set had been
  ticked. It is the single choke point, so "impossible to start another" holds
  wherever the button lives. Shared starts (`withBuddy`) still pass through:
  both phones agreed, and a one-sided refusal would strand the buddy in a
  session this phone never joined.
  - **The refusal is visible before the press, never after it.** Today's hero
    switches from the day's plan to the session — kicker, name, a live dot and
    the clock, one `n / m` line per exercise, and **Back to workout ›** — while
    the Plan day card and the routine editor relabel their Start. The Routines
    tab instead drops its per-card Start, its free session and its
    build-together outright and carries one live row at the top: ten cards all
    reading "Back to workout" is furniture, and one row says it once. Reading,
    editing and the collection's + stay open, because installing a routine is
    not starting one and is a fine thing to do between sets.
  - **`hasTicked` is gone.** It existed to hold the old guard and Today's old
    button label to one definition. Now that the guard asks only whether there
    is a session, both read `s.session`, and a second predicate would just be a
    way for the two to disagree again.
- **A set is logged in exactly one place: its own tick box.** Enter on the
  weight field moves to reps, Enter on reps logs the set. There is deliberately
  no second "log" button — the box is also the only way to *un*-tick a set, so
  it's the one that has to stay. Which is also why `logSet` is the one reading
  of what a tick may record: both ways in run it, and the box's own inline
  copy of the fill-from-last-time rule is what let the two disagree about an
  untouched drop.
- **The right-hand figure is what makes a set a set, and the app says so twice
  — once when you tick, once if you take it away again.** Reps, the seconds of
  a hold, the minutes of a run. The left one may legitimately end up empty:
  that is how bodyweight and an unrecorded distance are written.
  - **A tick that would record nothing is refused, visibly.** The test used to
    live inside the `patch` updater, whose early return is silent — so the
    refusal was a tap that did nothing at all, on the one screen where doing
    nothing is exactly what a missed tap looks like. It is made in the screen
    now, and `refuse` answers it: the reps cell shakes (`SHAKE`, `linger.shake`
    a leg), wears `warn` for as long as the shake runs, and `buzz.refused`
    reports it through the thumb that made it. Drawn on that one cell because
    it is the only thing that could have been wrong, and drawn rather than
    written — a line of copy would outlive the moment it explains and settle
    into furniture on the screen working hardest not to have any.
  - **A logged set whose reps reach zero stops being logged** (`keepLogged`).
    The same rule from the other side: without it the tick's refusal only ever
    held for sets you had not lifted yet, and clearing the cell afterwards
    still filed the `× 0`. It is one reading over three doors — typing,
    dragging to the clamp, and copying an empty ghost onto a ticked row — and
    it unticks rather than blocking the edit, because the cell is a text field
    and an empty string is the first keystroke of every retype: refusing that
    would mean never being able to clear a 12 to make it an 8. The way back is
    the tap it always was.
- **A set can also carry a verdict** (`SetMark`: `up` / `down` / `ok` / `note`)
  — heavier next time, lighter next time, that was the weight, or words. Not in
  the design; the numbers record what you lifted and never what to do about it,
  which by next week is the part you wanted back. The mockup is
  `design/set-notes-mockup.html`. Seven rules hold it together:
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
  - **It is a fact about the day too, so it also goes in the diary.**
    `LoggedExercise.marks?: (MarkNote | null)[]`, index for index with `sets`
    and written in the same pass off the same `ticked` array — two loops are
    two chances for the indexes to stop describing each other. `lastMarks`
    holds only the *latest* session per exercise, so without this copy a note
    lives exactly one week and is then written over; the entry on the day is
    what a diary owes you. Optional and absent when nothing was marked, so
    every entry logged before it keeps its numbers and simply says nothing —
    which is the whole migration, and why `STORAGE_VERSION` stays 4. A backup
    carries it inside `history`, and `mergePersisted` needs no change:
    `historyKey` is over date / rid / name / secs / vol, so adding notes cannot
    split one session into two.
  - **Last time's verdicts are read at the top of the exercise, not on the
    row** (`LastNotes`). They used to draw one per live row out of `prevMark`,
    which put each where it was written and two sets too late to act on:
    "shoulder, drop to 60" is advice about the exercise you are walking up to.
    So they hoist, whole, each naming its set — which keeps "try 75 next"
    attached to the 70 it was about — and they hoist out of `lastMarks` rather
    than off `entry.sets[].prevMark`, because that map is the complete list
    where the session's copy is truncated to however many sets today's routine
    asks for. The row-level copy is **gone**, not kept alongside: the same
    sentence twice is two readings of one fact, and that row can already be
    carrying a rest countdown or the buddy's turn. `prevMark` stays on
    `LoggedSet` for the mark sheet, which prints last time's verdict for *that*
    set and is per-set correctly.
  - **The set row has exactly one note slot**: your own words, else — on a set
    you have *ticked* — the way in (`addNote`), else nothing. **All three
    arrangements were built and two were tried on the phone**, and the order is
    worth keeping because the reasoning is:
    - *The index digit alone* was the original. 16px, unlabelled, and a thing
      you had to already know about — a control you have to be told about is
      one most people never use, and the honest fix for that is the control,
      not a hint about it.
    - *A line under every row* answered that and gave back too much screen:
      eight rows is ~130px of mostly `+ Note`, and the set you are working on
      sits that much further down. Measured in the hand, not argued about.
    - *From the tick* is where it landed. It is the moment the two things
      coincide — a set you have lifted is a set you have an opinion about, and
      it is also the only set you could be writing about. Row 4 is a plan, and
      an offer standing on it is furniture on the screen working hardest not to
      become furniture. What it costs is that the way in arrives rather than
      being always there; what it buys is that it arrives on every set you
      could use it on, which is the part the index digit never managed.

    It borrows no outline — no fill and above all no dash, for the reason a tip
    doesn't: dashed means *this one is held* at three sites.
  - **The `mark` tip was re-aimed rather than joined by a second one.** It used
    to read *Tap the set number*, which was honest while that was the only way
    in; with `addNote` on the glass the hidden thing is no longer the control
    but what it is for — `+ Note` says *note* and says nothing about a verdict,
    and nothing on the screen says the verdict comes back. So it now teaches
    that, and arms from the *first* logged set rather than the second, which is
    both when the line it names is drawn and when there is a set to have an
    opinion about. A second tip would have put two hints on one feature, which
    is what `pickTip` exists to make impossible.
  - **The diary draws it read-only, and words are what earn a line.** A verdict
    with no note is a glyph and stays in the day panel's wrap; only words break
    out to full width (`logNoted`, `flexBasis: '100%'`), so a card with nothing
    written on it is the card it always was. The glyph is `neutral500` there
    rather than accent: in the session the mark is live and yours to change,
    in the diary it is history. No editing six weeks on — the panel is a
    record, and the one thing it already lets you write (*+ Save as routine*)
    creates a new object rather than rewriting the day.
  - **It never leaves the phone.** `BuddyProgress` carries `done` booleans and
    nothing else; what you thought of your own set is not the buddy's business.
    A buddy snapshot carries no `history` at all, so the diary copy changes
    nothing about that.
  - **It stays per set, and there is no per-routine note.** The words ride on a
    `SetMark`, and `up` / `down` is a verdict about *a weight* — an exercise
    holds three to five of those, so "heavier" at the exercise level is not a
    statement. A routine is a template that outlives every session run from it,
    so a note on one could only be timeless and could never reach a day; the
    timeless per-exercise slot is already `cueEdits`, and the machine is
    `setups`. If a *dated* per-exercise note is ever wanted it is
    `LoggedExercise.note?: string` — additive, so waiting for someone to ask
    costs nothing.
- **Numbers are also a gesture**: touch a kg or reps cell and slide up or down
  to step it. The gesture itself lives in `components/num-drag.tsx` — it is
  shared with the setup tour's profile step, which is where a first-run user now
  meets it; `NumCell` keeps the drawing and the refusal shake and calls
  `useNumberDrag` for the rest. Everything below is that module's. While a drag
  runs, the list's `scrollEnabled` goes off. Most sets never need the keyboard.
  This gesture and `DragList` are why `react-native-gesture-handler` is mounted
  at all (`GestureHandlerRootView` in `src/app/_layout.tsx`). Everything else on
  this screen — the swipe between exercises included — is still a plain
  `PanResponder`, and should stay one.
  **It is the app's one drag with no hold in front of it** — the stated
  exception to hold-to-grab, for the reason the next bullet gives.
  - **Touch and slide, with nothing in front of it — and the list pays for
    that.** There used to be a 120 ms stillness test (`HOLD_MS`,
    `activateAfterLongPress`), which is what told a scrub apart from the list's
    own scroll. It cost the gesture the thing it is for: a number you can change
    *now* is worth reaching for between sets, one you have to press and wait on
    first is a feature you remember existing. So the pan takes the cell after
    `GRAB_Y` (4px) of vertical travel and **the session list is no longer
    scrollable from a number cell** — you scroll from anywhere else in the row,
    which is most of it. `GIVE_X` (12px) fails the pan sideways, which is what
    still leaves the row's own swipe-between-exercises `PanResponder` alone.
  - **A pixel is worth what its speed says.** Below `SLOW_V` the travel is
    exactly `PX_PER_STEP` / `PX_PER_REP`; from there the gain climbs
    quadratically to `MAX_GAIN` at `FAST_V`, read *per frame*, so one gesture
    can sweep and then settle. Releasing above `FLING_V` glides on, launched at
    what the pointer had over that threshold (so the glide grows from nothing at
    the line rather than jumping at it) and at the *ungained* speed, decaying
    with `GLIDE_TAU`. What it buys is that plus-twenty-kilos is one gesture
    instead of 480px of travel; what it costs is reversibility — the figure is
    integrated frame by frame rather than mapped from the gesture's total
    travel, so dragging back only undoes if you drag back at the speed you came.
    The expensive direction was always the long one.
  - **The two columns have different travels, because they are different
    units.** `PX_PER_STEP` is 12 for the half-kilo column and `PX_PER_REP` is 20
    for the whole-unit one — reps, seconds of a hold, minutes of a run. Half a
    kilo is small enough that 12px still lands where you meant; a whole rep on
    the same distance turns a careful nudge into a lottery.
  - **The glide is cancelled by touching the cell, and by nothing else having
    to know.** `stopGlide` is the one path (unmount included, via an effect
    cleanup), and it answers whether there *was* one — which is what makes the
    touch that caught it count as having done something, so it doesn't also open
    the keyboard on the way up. It deliberately does not buzz: `buzz.step`
    reports a figure moving under your finger, and by then your finger is off.
  - **The cell is `box-only` always, focused or not, and that is
    load-bearing.** A number cell is a `TextInput`, and Android's
    `ReactEditText` answers every ACTION_DOWN with
    `requestDisallowInterceptTouchEvent(true)`. That walks up to
    `GestureHandlerRootView`, which reads it as a native view claiming the
    touch and **cancels every handler in the orchestrator** — so a pan still
    waiting on its activation offset is already dead. Moving to
    gesture-handler did not fix that; it is the same disallow one layer down,
    and for a year the drag simply never fired. What fixes it is never letting
    the finger reach the editor: `box-only` has `ReactViewGroup` intercept the
    touch natively, so no DOWN reaches the editor and nothing is cancelled.
    The cell used to return to `auto` once focused, so that a tap could place
    the caret inside a figure — and that gave the disallow back on every cell
    the keyboard had ever been opened on, which after one set is most of them.
    Four characters of numeral don't need an aimable caret; the drag is what
    the cell is for.
  - **So the tap is a gesture too, and it toggles.** `Gesture.Tap` races the
    pan and focuses the field — or blurs it when it already has focus, which is
    the way out of the keyboard that doesn't log a set. A pan that activated,
    stepped nothing and was released is routed to the same place: crossing
    `GRAB_Y` with a shaky thumb on what you meant as a tap costs you nothing,
    which is the other half of why it can be as small as 4px.
  - **It is the one gesture performed under your own thumb, so it is felt
    rather than watched** — and the two moments get different weights, on the
    haptics ladder in `src/data/haptics.ts`. `buzz.grab` is the cell being
    taken, at the same weight as a ticked set: it is what tells you the slide
    is yours rather than the list's, which is the one thing the screen can't
    show you under your own thumb. `buzz.step` is the quietest thing in the
    app, because it fires ten or twenty times inside one drag — and it is the
    one call in this module that leaves the cross-platform API, because
    `selectionAsync` is a 50 ms buzz on Android and `Segment_Frequent_Tick` is
    the constant Android defines for a value scrubbing under a finger. Both
    are gated on the `haptics` setting, like every other buzz.
  - **A step buzzes when the figure changes, not when the finger moves.**
    `onUpdate` runs per frame; the cell only changes once the accumulated value
    crosses the step grid, and stops changing entirely once the clamp at zero is
    holding it. So `emit` compares against the last figure it wrote and bails —
    which is what makes a buzz mean "the number moved" without exception, and
    incidentally stops a drag writing to the store sixty times a second.
  - **The list is `keyboardShouldPersistTaps="always"` for the same reason.**
    Under `handled` the ScrollView grabs any touch that isn't already a
    responder so it can dismiss the keyboard, and grabbing it means
    `setJSResponder` with the native responder blocked — which gesture-handler
    also answers by cancelling everything it owns. That would leave the drag
    working only while the keyboard is down, which is exactly when it isn't
    wanted. What it costs is tap-away-to-dismiss, which is why the cell's own
    second tap blurs it; Enter on reps still closes the keyboard by logging the
    set, and Android's back key is eaten by the IME before the app hears it —
    so the focused cell listens for `keyboardDidHide` and blurs itself, or it
    would sit there drawn as focused with nothing typing into it.
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
- **A set row can leave the same way, from its own sheet.** The routine asked
  for five and today has four in it — which used to mean a held Finish and a
  4/5 that read as a failure for the rest of the workout. So the mark sheet
  (behind the set's index digit) carries a held remove: unticked rows only —
  `removeSessionEx`'s rule one scope down, and unticking a lifted set first
  is what makes removing it a two-step decision rather than an accident —
  and never the last row, because an exercise with no sets is a state
  nothing draws; that case is the overview's ×. A following drop's `link` is
  cleared with it, since the set it continued just left. Leaving a row
  unticked stays legal and logs nothing at Finish; removing is for when the
  shorter day *is* the plan.
- **The overview reorders the session, and it moves stops, not exercises.**
  `DragList` like every other list here — hold the stop, move it, let go — and
  the pitch it measures is per stop, because a pair's block is taller than a
  lone row and a uniform one would land a long drag rows away from the line it
  drew. A pair travels whole — a hold that could pull one apart would be an
  unpairing control, and a running workout has no pairing controls — and
  `moveSessionStop` clears a dangling `with` rather
  than handing it the partner it never had (`appendSessionEx`'s rule, met
  from the other side). `active` keeps naming the exercise it named,
  wherever that exercise lands; the buddy needs no protocol change, because
  `progress` is keyed by exercise id and order was never a fact it carried.
- **A routine deletes from its editor, held.** `deleteRoutine` drops the plan
  rules pointing at it — through `dropEntries`, so the skips that named those
  rules go too — and ends a matching co-draft; `history` is untouched on purpose
  — entries carry their name frozen at log time, and a deleted rid there is
  already the case the plan screen handles.
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
- **While the turn is theirs that same row says so too — dashed, and their
  name on a line of its own.** `rest` holds a rest you earned and nothing else:
  their set does not end because a timer said so, it ends when they tick.
  Writing the wait as a rest of your own was the obvious move and it lied twice
  over — the guest of a fresh session opened on a three-minute countdown before
  either phone had lifted anything, and the number was invented. So the row's
  two holds are separately shaped: your rest is a clock you may cut short,
  their turn is a dash that lifts the moment their set lands and the row goes
  solid, which is the whole handover. Like every other buddy cue it only
  changes how the row *looks* — the inputs and the tick never stop working,
  because a phone in someone else's pocket must not block your set.
  - **Their turn carries a clock of its own: the rest they are still on.**
    Coming off their own set, "their set" means resting for the
    first minutes of it, and a bare name said nothing about how long. Their
    remainder rides along in `progress` (`BuddyProgress.rest`) and draws as
    *{name}'s rest · 1:40*, which is the same fact their name was already
    standing for, with the number it was missing.
  - **A remainder, never a stamp.** `rest.at` is a reading of the sender's
    `elapsed`, and the two session clocks share no origin — a guest joins
    mid-way, and `restSeconds` is a per-phone setting besides. So the wire
    carries seconds-left-at-send and the receiver re-anchors it to its own
    `elapsed` on arrival (`buddyRest`, transient, cleared everywhere
    `buddyProgress` is and everywhere `elapsed` goes back to zero). It is a
    protocol *addition*: an older build sends no figure, their rest simply
    never shows, and the row reads exactly as it always did.
  - **The rebroadcast is for the skip, not the start.** A rest beginning rides
    out on the session change that earned it; "start now" changes nothing else,
    so `s.rest` is in the broadcast effect's deps or the buddy would watch a
    countdown its owner had already dismissed.
  - **Every running wait is drawn, and each one names its owner.** Their rest
    used to be drawn *in place of* your own countdown, on the grounds that two
    descending numbers in one 12.5px line can't be told apart — they can't, and
    the fix is to name them rather than to hide one. Hiding one meant the
    commonest question in a shared session, *whose pause is that*, had no
    answer anywhere on the screen. So yours is a line (`myRest`) and theirs is
    a line under it (`theirRest`), and **yours is named only while theirs is
    there too**: alone it stays the bare `restLeftLabel`, because an owner is
    worth 5 characters exactly when there is somebody to be told apart from.
    Three things follow:
    - **Their rest shows whenever they have one, turn or no turn.** "How long
      until they're even back on the bar" is a fact about your session while
      you're both on the exercise, and `buddyLive.rest` is already 0 when
      you're not. It used to be gated on `theirTurn`, which hid it during the
      half of an alternating session that is yours.
    - **`held` is a separate question from what is drawn.** Only your own rest
      or their turn dashes the box and takes the accent off the index — a buddy
      resting through a set of *yours* is information, not a reason to make the
      row you're about to lift into look like it isn't yours.
    - **"Start now" rides on your line, so it is offered whenever your clock
      runs** — including under a turn of theirs, where it cuts your countdown
      (and its notification) short and leaves the row held. It used to be
      withheld there because the tap would have looked like it did nothing; now
      the line it sits on is the thing it visibly removes.
  - **A sealed exercise still shows the wait** (`WaitLines` standing alone
    under the last row, which is why it is a component rather than markup
    inside `SetRow`). Ticking your last set starts a rest whose set lives on
    the next exercise, so the row it would draw on doesn't exist yet — and a
    countdown that disappears for the length of the countdown is the same
    opacity in a different place. The `ask` is deliberately not repeated there:
    who takes the next set of an exercise you have finished is not your
    question.
- **One phone's session list never writes to the other's — it offers.** Adding
  an exercise mid-workout is the one way two shared sessions can drift apart
  after the invite, and the answer is `adoptBuddyEx`: an offer on the buddy
  line and a ledger in the overview sheet, each one tap, and nothing crosses
  without that tap. Auto-adding was the obvious move and it is the wrong one
  for the reason `bye` doesn't end their session and `removeSessionEx` refuses
  a ticked set — the other phone does not get to reach into a workout you are
  standing in the middle of. It would also grow `tot.all` under your thumb,
  which flips Finish between a tap and a hold, and shift what a swipe lands on.
  - **The offer is a diff, not an event.** `BuddyProgress.list` already carries
    every exercise id they hold, so "theirs, not mine" is read out of the
    message the app was already sending. An `exerciseAdded` event would be one
    thing in this protocol that a dropped link could lose for good; a diff
    re-derives itself from whichever message lands next, which is the whole
    reason `progress` is whole-state. It also covers drift nobody sent an event
    for — a guest who joined with a stale routine, two free sessions.
  - **`deps` is the one thing the diff can't derive**, and it is an additive
    optional field on `progress` exactly like `rest`: an id for a *custom*
    exercise of theirs is unnameable here, and a row you cannot read is not an
    offer. It carries `closureFor` — the exercises in their list that aren't
    seeded, plus the groups and kinds those file under — and it is absent from
    an all-seeded session, which is nearly all of them, and from an older
    build, whose extra exercises stay as unnameable as they are today.
    Receiving it writes nothing; `upsertShared` runs on the tap that accepts,
    the same place `acceptInvite` and `applyDraft` run it.
  - **Their set count is adopted, their numbers are not** — `mergeRoutine`'s
    rule again. The count is what makes the turn arithmetic (`mine <
    theirDone`) right on the first set rather than after you match rows by
    hand; the ghost stays your own history, because "last time" was never
    theirs.
  - **Two surfaces, and only one of them jumps.** The buddy line's offer sits
    in `jump`'s slot and is its other half — same errand, same one tap — so it
    lands you on the exercise, and it only shows while they are actually on it,
    which is what makes it self-clearing with nothing to dismiss and nothing to
    remember dismissing. The overview sheet lists *all* of them and does not
    move you: you may be taking on several, and it is the screen you would come
    to reconcile on anyway.
  - **Nothing goes the other way.** An exercise they drop is not dropped here —
    leaving your list is still your own held ×.
- Disconnect is explicit and two-sided: the phone that taps it sends `bye` and
  the other tears the pairing down (`endPairing`) instead of hunting for a
  reconnect. Neither side's *session* is touched — the workout keeps running
  solo, because ending someone's live session from another phone would throw
  away sets they actually lifted. Any path that ends a link has to send `bye`
  first, or the other phone spends the next hour reconnecting through it.
- **A sync row settles from either phone** (`buddySynced` — transient, the
  radio is the only writer, the sync screen only reads). Merging a pushed or
  pulled item answers with `itemAck`, and the ack is what upgrades the
  sender's *Sent* to *Received* — delivery says the bytes arrived, the ack
  says the merge ran. A pushed item also flips its own row on the receiving
  screen, so two open sync screens tick off together. The set resets with
  each snapshot, because it baselines the diff a stale id could dress up.
  Protocol *addition*, not change: an un-updated peer never acks and its
  buddy's marks stay delivery-based — degraded, never broken.
- **`knownBuddies` is the durable half of a buddy** (the connection is not, and
  still isn't persisted). With anyone on it the radio advertises and discovers
  while the app is open, so two paired phones find each other with nobody
  tapping anything; a buddy is re-accepted with no code. That is a deliberate
  battery trade, decided with Calvin — the alternative was both people having to
  tap before either could be seen. Silent re-accept is gated on the pairing
  secret, not the name — see below.
- **Nothing takes a name off that list but the user** (× / `forgetBuddy`). It is
  how you see who is around when you run into each other, which only works if
  it outlasts every link that ever dropped — including the ones you ended.
- **A buddy is *identified* by install id, *authenticated* by a shared secret.**
  The radio advertises `id|name` (`encodePeerName` / `decodePeerName`; `selfId`
  is ANDROID_ID or a once-minted random) and the snapshot carries the sender's
  id — so a rename lands as "same id, new name" and `rememberBuddy` renames the
  roster entry instead of meeting a stranger. `buddyIds` is a separate persisted
  key (roster name → id). But **both halves of the advertised name are
  self-asserted strings a nearby attacker can forge** — the id authenticates
  nothing on its own. So identity is *proved*, not asserted:
  - **The pairing secret (`buddySecrets`, `randomToken` in buddy-sync) is minted
    once during the code-gated first pairing** and persisted on both phones. On
    every reconnect the peer must prove it before this phone trusts them —
    before it sends its snapshot, merges an `item`, honours a `sessionInvite`,
    or applies a draft. The first pairing is still the only place a stranger
    gets on the roster, and Nearby's confirmed auth digits are still the gate
    there; the secret is what carries that trust across every later silent
    reconnect.
  - **`hello` is the first message on every link** (`parseBuddyMessage`
    honours nothing else from an unproven endpoint). A reconnect carries
    `proof = authProof(secret, digits)` — a keyed hash bound to *this*
    connection's Nearby auth digits, which both endpoints witness and no third
    party can predict, so a captured proof can't be replayed and the raw secret
    never re-crosses the wire. A first pairing carries `newToken` from the
    minting side instead (the requester, `!incoming`); the code was the gate, so
    this only seeds the secret. `authed` / `meta` in `<BuddyRadio>` are the
    transient per-endpoint handshake state; `buddyEndpoint` is not set on a
    reconnect until the proof checks out.
  - **A name-only impersonator gets a connection and nothing else.** It can
    match a roster name and be accepted at the link layer, but it can't produce
    the proof, so every sensitive message it sends is dropped and the link is
    torn down. Before this, matching the name was the whole test — it yielded
    the victim's full library snapshot and a write into their persisted store.
  - `PERSIST` is additive, so `buddySecrets` needed no `STORAGE_VERSION` bump.
    This is a **protocol change**: both phones need the build, and **a buddy
    paired before secrets existed has none — they re-pair once, through the
    code, to mint one** (a known name with no secret is treated as a stranger,
    not silently accepted). An id-less older build no longer auto-reconnects.
- **The only connection this app opens by itself is back to the buddy of the
  session in progress** (`s.buddy`), because a mid-workout drop has to heal
  without anyone tapping. Everyone else on the roster is discovered, listed and
  left alone: a link between two idle phones starts with `joinAsk` and does not
  outlive a `no` — decline disconnects. Nobody ends up connected to anybody
  they didn't answer for, which is why the roster button asks for a session
  rather than offering to connect.
- **The reconnect is level-triggered, tie-broken, and believed over the
  connection.** Three fixes to a heal that used to be one swallowed attempt,
  all in `<BuddyRadio>`:
  - **A ticker, because the found-event fires once.** `onEndpointFound` covers
    the buddy *reappearing*; a link that drops while the endpoint stays in
    Nearby's found-set never fires it again, and a failed `requestConnection`
    was simply swallowed. While the pairing stands and the link is down, the
    ticker re-requests whoever in `nearbyPeers` matches the buddy, every
    `RETRY_MS`, until one attempt lands. Failed advertising/discovery starts
    re-kick themselves the same way — Nearby refuses starts while the
    Bluetooth stack is still settling after a drop, and a swallowed refusal
    left the radio silent until `active` next toggled, which mid-workout is
    never.
  - **One side initiates** (`initiator`): both phones running the same code
    used to request the moment they saw each other, and Nearby fails a
    crossed pair more often than it resolves one. The lexicographically
    smaller install id is preferred — computable alone on both phones, since
    both ids are in the advertised names — and the other side holds back for
    `GRACE_TICKS` before trying anyway: a preference, not a veto, because
    Bluetooth discovery is not symmetric and a veto would be a deadlock.
  - **Two undelivered payloads kill a link** (`onPayloadFailed`, a new native
    event forwarding Nearby's FAILURE transfer update — `sendPayload`
    resolving only ever meant *enqueued*). This is the zombie case: the peer
    died without a clean disconnect, `onDisconnected` never fired, and a set
    `buddyEndpoint` kept `active` false — no advertising, no discovery, and a
    buddy who came back could never find this phone again. A locked phone
    never trips it (its process still receives natively, so deliveries
    succeed). `dropLink` is the one teardown both paths share; a false
    positive costs a silent re-link seconds later. Native change — both
    phones rebuild — but not a protocol change: an older peer sends nothing
    new and is sent nothing new.
- **Re-joining a shared workout is a button, not a resurrection.** A phone
  whose app died mid shared session resumes it *solo* (see the LIVE keys),
  while the pairing heals by itself: the survivor's ticker re-requests, the
  secret authenticates silently, and their broadcasts — still flowing, because
  a link drop never cleared their `sessionShared` — fill this phone's
  `buddyProgress` even though it is solo. That standing state is what the
  roster row reads: **Rejoin the workout** shows while the link is up, this
  phone holds an unshared session, and their unfinished shared broadcasts are
  arriving. The tap (`rejoinSession`) is local state only — `sessionShared`
  back on, `buddyJoin` joined, and the session surfaced — because the whole
  protocol is whole-state: this phone's broadcasts resume on the flip, their
  next message resyncs everything else, and `mergeTurns` / `mergeFirstUp`
  already decide which side's reset registers yield. The role is taken as the
  *opposite* of the one their progress now carries (`BuddyProgress.role`, an
  additive field with the usual older-build story), falling back to the
  persisted `sessionRole`, then 'guest' — the survivor kept the session
  running, so the tie honours them. Auto-re-attaching was considered and
  turned down for the reason `adoptBuddyEx` offers instead of writing: the
  other phone does not get to decide that your resumed workout is shared
  again.
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
- **The plain editor's rows reorder too, not just the co-draft's.** Same
  `DragList`, same `moveRoutineItem`. What travels is the *slot*, not the row
  inside it: the pair gutter lives in the slot, so a dragged row carries its
  own gap along and the pitch measured for it is the one the eye sees. A drag
  out of a pair breaks it with no
  bookkeeping and a drag back into adjacency remakes it — `with` is adjacency,
  and the gap glyph right there shows which of the two you just did.
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
  planned.** The dot used to test the plan first, so a freeform Saturday was
  invisible on the month grid and the day card called it "Nothing planned" with
  the session listed right underneath it. It is now also why the day panel keeps
  planned rows and logged cards in separate blocks: a day can be either, both or
  neither, per row, and all of those have to read correctly.
- **Every logged set's rest is `restSeconds`, not a constant** — a setting, 0
  meaning off. `REST_SECONDS` is gone from the session overlay.
- **A rest that ends out of the app arrives as a notification** (`restAlert`,
  `src/data/alarms.ts`, `<RestAlarm>` mounted in `Overlays`). It is the
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
  costs is `cancelAlarm` / `dismissAlarms`, which run at mount and may
  therefore never load it: they clear through an already-loaded module, and
  `init` sweeps the tray itself to cover the cold start after a process death —
  the *scheduled* alarms too, because a resumed rest (see the live-session
  bullet below) re-arms its remainder, and without the sweep the dead
  process's pending alarm would announce the same rest twice.
- **A day you planned something on says so, once, at a time you set**
  (`planAlert` / `planAlertAt`, `<PlanAlarm>` mounted in `Overlays` beside
  `<RestAlarm>`). Not in the design, which has no notifications at all. It is
  the rest alarm's trick at a day's scale rather than three minutes', and the
  same module owns both — `src/data/alarms.ts`, renamed from `rest-alarm.ts`
  when it stopped being about one thing.
  - **One loader, because the sweeps are app-wide.** `init` clears the tray
    *and* every alarm a dead process left pending, and it may only do that
    before this process schedules anything. Two modules would be two `init`s,
    and whichever ran second would cancel the first one's work. So the channel
    registry is shared too — `rest` and `plan` are separate Android channels,
    which is what lets the phone silence the reminder without silencing the
    rest timer, and one POST_NOTIFICATIONS grant covers both because the
    permission is the app's.
  - **A fortnight is stamped ahead, not a repeating trigger.** Android has no
    trigger that means "every third day from the 4th, unless it was
    cancelled" — but `plannedOn` already answers exactly that, so `<PlanAlarm>`
    asks it for each of the next `HORIZON` days and hands over dated alarms.
    The whole list is dropped and re-stamped whenever anything it was derived
    from moves: the rules, the routines' names, what has been logged, the time,
    the language, the day. What it costs is the horizon — a phone unopened for
    two weeks runs out — and that is the right failure, because a plan nobody
    has looked at in a fortnight is not one the app should keep announcing.
  - **One reminder per day, and it names the day's workouts** rather than one
    per rule: a day holding two is one thing to be told about. Today's rows
    drop what is already logged **or running right now** — the errand is "this
    is still to do", and a workout under way is neither done nor in `history`.
    A rule whose routine was deleted since contributes no name, and a day left
    with none is not announced; a chosen rest day has no rows at all, which is
    `plannedOn` doing the work rather than a second rule about rest.
  - **The title is `plannedToday`, the Today card's own words.** One phrase for
    one fact, in both places it is stated.
  - **Off by default, unlike `restAlert`.** A rest alert only ever fires inside
    a workout you started; this one speaks on a day you may not have opened the
    app at all, and something that speaks unprompted is asked for rather than
    assumed. The time is a stepper pair (`TimeStepper`, the plan sheet's `‹ n ›`
    grammar twice, minutes by `MINUTE_STEP`), not a preset list and not a
    keyboard — and it is drawn only while the switch is on, the same reason the
    plan sheet's Repeats field steps aside under *just this day*.
  - **Being asked for is why the tour asks.** The setup tour's week screen —
    the one place you decide you train Mon/Wed/Fri — offers it under the day
    list, gated on the week actually holding something, because a reminder
    about days you have not set is furniture. It uses the tour's `PermCard`
    rather than a switch, that being already this app's grammar for *an
    optional thing that needs Android's permission*, and it reads
    `planAlertLabel` / `planAlertHint` straight off the settings row rather
    than restating them. `TimeStepper` moved to `components/time-stepper.tsx`
    when the second caller arrived: two copies of a control are two things to
    keep in step. Skipping the week does **not** switch it back off — it
    announces nothing while the plan is empty and starts working by itself the
    day one exists, where un-asking would be the screen quietly overruling a
    choice made on it.
  - **`planAlert` / `planAlertAt` are additive `PERSIST` keys**, so
    `STORAGE_VERSION` stays 4. They ride in a backup like every other setting,
    are untouched by `mergePersisted`, and never cross to a buddy — when you
    like to be reminded is not their business.
- **The live session survives the process** (`session` / `active` / `elapsed` /
  `rest` / `sessionRole` ride in `PERSIST` — the LIVE keys, additive, so no
  version bump). An
  accidentally closed app or a process death mid-workout used to cost every
  ticked set. Four rules hold it together:
  - **The clock alone never schedules a write.** `elapsed` is skipped by the
    saver's dirty check — a write per second is exactly what that check exists
    to avoid — and rides along on the writes other keys earn. `flush` stamps
    the blob with `savedAt`, and `resumeSession` adds the wall gap back: the
    clock is wall-anchored, so stored plus gap is the second the interval
    would have reached, and `rest`, measured in `elapsed` ticks, comes back
    mid-countdown for free.
  - **A resumed session lands minimized** (`sessionMin`): the app opens on
    Today with the hero's **Back to workout ›** — the same place backing out
    of a live session lands — rather than teleporting into the overlay.
  - **Resume is solo on purpose.** The buddy link was never persisted and
    still isn't; re-linking is the radio's business, and a session that was
    shared simply comes back as yours. The way back into the *shared* half is
    an act — **Rejoin the workout** on the buddy's roster row (see the buddy
    bullets) — which is why `sessionRole` is the one buddy-shaped LIVE key:
    the resumed session has to remember which side of the workout it was.
  - **Backups carry none of it** (`dropLive`, both directions): the LIVE keys
    are crash recovery, not diary. A backup restored on another phone must not
    open a phantom workout, and a restore must not end one in progress — which
    matters now that the seeded side of `importState` holds `session: null`.
- **A live session runs under a foreground service**
  (`modules/expo-session-service`, `<SessionKeepalive>` in `Overlays` — beside
  `<RestAlarm>`, outside the `social` gate and the session overlay, because
  the service belongs to the session, not to the buddy half or to whether the
  overlay is showing). Three things it buys, in order: the process survives
  backgrounding, the screen locking and even an accidental swipe-away — RN's
  JS lives in the process, not the activity, so the clock, the countdown and
  the radio keep running in a pocket; a **partial wakelock keeps the CPU on
  only while the pairing needs the radio breathing** (`keepAwake` =
  shared-or-buddy — a suspended JS thread can't broadcast or heal a link,
  where a solo session's clock is wall-anchored and its alarm is already
  Android's, so there the battery would buy nothing); and the ongoing
  notification is the way back in — silent, low importance, the system
  chronometer counting from `now − elapsed` so it matches the in-app clock
  without ever re-posting. Repeated starts re-post the same notification id,
  which is how the title, a language switch and the wakelock follow state;
  stopping is the session ending, and an orphan is impossible because the
  service dies with the process it shares. The FGS type is `specialUse` — the
  same sideload bet as `USE_EXACT_ALARM`: `connectedDevice` would be the
  honest label but requires a *granted* Bluetooth runtime permission, which a
  solo lifter needn't have. Optional-bridged (`src/data/session-service.ts`),
  so Expo Go degrades to the LIVE keys alone. Native, but self-contained: the
  permissions and the `<service>` live in the module's own manifest, so no
  prebuild — autolinking finds it, both phones just rebuild.
- **Train alone** (`privateMode`) hides *and disables* the buddy half: the
  gate is `Overlays` unmounting `<BuddyRadio>` and the four buddy sheets, not
  hidden buttons, because the radio is what advertises and answers. Turning it
  on sends `bye` and tears the pairing down like any other teardown.
  `knownBuddies` survives — it is a curtain, not a divorce.
- **The Profile card, Insights and the AI coach have no design behind them at
  all** — the design knows nothing about statistics. They are derived entirely
  from `history` and stay out of persistence; see "Statistics & the AI coach"
  above for the rules that hold them together.
- **Backup is the durable slice in an envelope** (`src/data/backup.ts`),
  stamped with `STORAGE_VERSION` so an old file is migrated forward rather
  than loaded raw.
- **A restore has two answers, and they differ in kind rather than in degree**
  (`RestoreSheet`, `mergePersisted`). Replace *replaces*: the seeded defaults go
  down first, so a key the backup lacks resets instead of surviving — right for
  a new phone, wrong every other time, and for a year it was the only thing on
  offer. **Add what's missing** is the other one, and it is the rule this app
  already applies to a buddy's library (`upsertShared`) and to the coach's plan:
  additive, and what is on this phone wins. A backup that has never watched you
  lift does not get to overwrite what you actually did.
  - **That rule is why there is no conflict screen.** There is nothing to ask
    item by item — either the backup fills a gap, in which case take it, or it
    disagrees with something here, in which case here wins. Wanting the backup's
    version of everything is what Replace is, one hold away. A screen listing
    every differing row across nine key types, for an action taken twice a year,
    buys nothing that pair doesn't.
  - **Three parts, ticked, and one of them is a bundle on purpose.** Sessions
    (`history` + `lastLog` + `lastMarks`), the library (routines, custom
    exercises, *and* the group/equipment lists, because an exercise filed under
    a group this phone lacks is stranded outside the library's filter row), and
    the plan. `mergePersisted` returns **only the keys its parts touch**, so
    every setting, the profile and the whole buddy roster are untouched by
    construction rather than by being listed — which is what stops a merge
    handing this phone another phone's `selfId`.
  - **`lastMarks` moves with the `lastLog` it describes.** They are index for
    index, so taking one without the other puts a ▲ on a set it was never a
    verdict about. `lastLog` carries its session's date, so "newer wins" is
    exact rather than a guess.
  - **A session's identity is a content key** (`historyKey`), because
    `HistoryEntry` has no id — it never needed one until something could meet
    the same session twice. Deliberately not `JSON.stringify`: key order belongs
    to whichever literal built the object, and a migrated blob doesn't owe you
    the same one.
  - **The preview is the merge.** `restoreCounts` runs `mergePersisted` and
    measures it rather than counting in a second pass, so the sheet cannot
    promise a number the import then misses.
  - **An incoming plan rule whose routine didn't come along is dropped**, and so
    is a skip naming a rule that didn't — a rule names a routine, and one that
    names nothing would draw a planned day the app can't start. Only the
    *incoming* rows are filtered: an existing entry whose routine is gone is a
    state the plan screen already handles, and a merge has no business tidying
    it.
- **A Spotter file tapped in another app opens Spotter** (`android.intentFilters`
  in `app.json`, `src/app/+native-intent.ts`, `<Intake>`). Exporting a backup to
  a chat app and then tapping it there used to say *no supported app found*;
  now it comes back in. Six things about it are load-bearing:
  - **Android has no file *type* to mint.** Nothing lets an app declare that
    `.spotter` means `application/x-spotter` — the MIME type is decided by
    whichever app is *sending*, from its own extension table. And a document
    tapped in a chat arrives as `content://com.whatsapp.provider.media/item/…`,
    which has no filename in it, so a `pathPattern` on an extension matches
    nothing. **MIME is the only thing that can match**, so the filter claims
    three types and the export is named `2026-08-13.sptr` (`EXT` in
    `backup.ts`) — a name, not a registration. `.sptr` is in no sending app's
    extension table, so a received one falls back, usually to
    `application/octet-stream`; claiming that is what makes the tap work, and
    the price is Spotter appearing in *Open with* for every unknown binary on
    the phone. **This is the one bet in the feature** — Calvin's call, taken
    with the fallback known: if a sender guesses some third type, `.sptr.json`
    doubles the extension instead of replacing it, so the last one is the
    `.json` every table agrees about, at the cost of the shorter name.
    `application/json` is claimed because that is what the bytes honestly are
    and what the share declares on the way out — if a sender honours a declared
    type rather than re-deriving one, that is the claim that carries it — and
    `text/plain` for the coach's half, where an AI answering with a `.txt` or a
    `.md` is answering in the format `parsePlan` already reads. The envelope
    check is what makes all three harmless.
  - **`+native-intent` is the only seam that sees the URI.** A `content://` is
    not a route, and expo-router would go hunting for a screen named after the
    provider. `redirectSystemPath` gets the raw intent data on a cold start
    (it becomes the initial URL) and on a warm one, so the URI is lifted out
    there and the router is answered with `/`. It runs while the bundle is still
    starting, which is why it knows nothing about backups, plans or the store,
    and why the handoff is a module slot (`src/data/intake.ts`) rather than
    state: on a cold start there is no component tree yet to hand it to.
  - **One entry point, two payloads, and only one of them is provable.** An
    envelope is a backup; anything else is offered to `parsePlan`, and a plan
    found in it goes to the coach. So **a plan needs no file format of its
    own** — the AI already writes that block, and a file containing it, prose
    and all, is a plan. `readFile` classifies only the half `backup.ts` can
    prove and hands the rest back as text, which is what keeps the coach out of
    that module.
  - **Read the URI now, not later.** The read grant that came with the intent
    lives and dies with the activity that received it, so a stored
    `content://` is worth nothing. `<Intake>` still waits for `hydrated` — a
    restore that beat the phone's own blob back would be overwritten by the
    hydration a beat later — and that is the only thing it waits for.
  - **The file is staged in the cache before it is read, always.** `new
    File(content://…).text()` looks like it should work and does for about half
    the providers out there, which is the trap: it calls `exists()` on the way
    in, and expo-file-system resolves a content URI through `DocumentFile` —
    `fromSingleUri` when the first path segment is `document`, `fromTreeUri`
    otherwise. A chat app's URI is neither
    (`content://com.whatsapp.provider.media/item/…`) and `fromTreeUri` throws on
    a non-tree URI, so a perfectly readable file reports *could not be read*.
    The stream underneath was never the problem. `expo-file-system/legacy` keeps
    the branch that works — `contentResolver.openInputStream` for any content
    scheme — so `readFile` copies through it and reads the text off a `file://`.
    Unconditionally, not only for the URIs known to break: one path that behaves
    the same for every provider beats one that works until someone shares from
    an app nobody tested. It is also exactly what `copyToCacheDirectory` does
    for the document picker, which is why `pickAndRead` never hit this.
  - **Neither path writes on its own.** The backup lands on the same
    hold-to-restore confirm the picker asks through (`RestoreConfirm`, shared
    rather than written twice — it is the most destructive question in the app,
    and two copies are two chances for one to soften), and the plan lands on the
    coach's existing preview with Import still the only thing that commits. A
    wrong tap costs a sheet.
  - **Nothing here is persisted.** `coachIntake` is a one-shot handoff like
    `planFocus`, outside `PERSIST`; the intent filter is native config. No
    `STORAGE_VERSION` bump, no migration — but it *is* a native change, so it
    needs `npx expo prebuild --platform android` and a fresh build. Expo Go has
    no filter and simply never fires it, which degrades rather than breaks.

- **A message shared into Spotter arrives too** (`modules/expo-share-text`,
  `src/data/share-text.ts`). Hold the AI's reply, Share, Spotter — the coach's
  loop with no clipboard in it, which is the point: a chat AI produces a
  *message*, and until this the only way in was copy-and-paste.
  - **It needs native code, and this is the only thing in the app that needs it
    for this reason.** A share is `ACTION_SEND` with its payload in
    `Intent.EXTRA_TEXT`, and neither React Native's linking module nor
    expo-linking reads intent *extras* — both take only `intent.getData()`,
    which is null for a share. So the module is forty lines whose whole job is
    to hand JS a string; it knows nothing about plans, backups or the store,
    and `<Intake>` classifies it exactly as it classifies a tapped file.
  - **The lifecycle listener is what makes the warm case work**, and it is not
    optional. React Native's `onNewIntent` never calls `setIntent`, so
    `activity.intent` still holds whatever launched the app the first time —
    read the activity's intent on demand and you get the *first* share
    forever. `ShareTextPackage` registers the listener; expo autolinking
    discovers it by scanning for `Package`, so nothing declares it in
    `expo-module.config.json` (expo-linking does the same). Check
    `ExpoModulesPackageList.java` after a build if a share ever stops arriving.
  - **`EXTRA_TEXT` is removed as it is taken**, and the JS slot empties on
    read for the same reason: an activity keeps its launching intent, so a
    share left in place is re-offered on every configuration change and every
    return to the app — which for an import means the same plan offered
    forever.
  - **The bridge is optional** (`requireOptionalNativeModule`), like
    `buddy-radio.ts`: Expo Go has no module and no filter, so every call is a
    no-op and the paste box is still the way in. Which is why the prompt's
    rule 3 now leads with Share but **keeps paste as its third step** rather
    than dropping it — `parsePlan` reads both identically, and the fallback
    costs one line.

  What this does **not** cover is a *file* shared into Spotter rather than
  tapped — that is `ACTION_SEND` with an `EXTRA_STREAM`, another extra. Not
  built because tapping is how a file in a chat is opened anyway, and the two
  routes already cover both errands.
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

## Copy voice

Every user-facing string lives in `src/data/i18n.ts`; the full audit that
derived these rules is `design/copy-audit.md` (its §7 lists German lines that
deliberately beat their English — don't literalize them back).

- **Mechanism first, consequence second; the em-dash carries asides.** No
  exclamation marks, no praise — understatement is the register ("Ready.").
  Errors say what happened and the way out, never who's at fault.
- **Contractions are the default.** Write them out only where a line should
  slow the reader down (destructive confirmations: "It cannot be undone.").
- **Chevrons are `›`/`‹`, never `>`.** The freeform session is "Free session"
  in English and "Freies Training" in German — one term each, everywhere.
- **German is written, not translated.** du-form; apocopated imperatives in UI
  copy (*füg, trag, Zeig*), full imperatives only inside the coach prompt;
  buttons are infinitives (`start` is the one composed exception — it prefixes
  a routine name, and `startBare` exists for the bare-button sites).
- **German terms, decided once:** **Einheit** = a logged/counted session,
  **Session** = the live (shared) one, **Training** = the activity;
  **Handy** = the phone — **Gerät** is equipment only; **Partner**, not
  Buddy; **Wdh.**, not Whd.; a screen tap is a **Fingertipp**, *abhaken*
  means to tick; a plan's repeat is a **Wiederholung**. Trailing
  activity-ellipses attach (`Suche…`).
- **A generated phrase needs both German forms.** English composes a repeat
  uniformly — *every {n} days* — where German switches on the count: *jeden Tag*
  / *alle 3 Tage*, *jede Woche* / *alle 2 Wochen*. Two strings per unit, picked
  by `n === 1` in `repeatLabel`. The fun facts dodged this by only ever being
  plural; a repeat of one is the common case, so it is met head-on.
- **The seed library speaks both languages too.** Seeded exercise names carry
  `names.de` via `DE_NAMES` — only where a German gym genuinely says
  something else (`Butterfly` for the pec deck; `Plank` stays `Plank`) — and
  the cues and machine-setup labels have a full parallel table (`INFO_DE`),
  read through `infoFor(id, lang)`, never `INFO` directly. A user's rewrite
  (`cueEdits` / `setups` / a rename) is their own words and wins in both
  languages. `Exercise.name` stays English: it is the canonical join key the
  coach contract and `resolvePlan` match on, not a display string.

## Checks

Both must pass before committing:

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run test
```

`npx expo export --platform android` catches things that only break at bundle
time.

## The tests

Vitest, in plain Node, over the pure modules — `npm run test`, or
`test:watch`. There is no React Native harness and adding one is not the plan:
what is tested is `data/`, which takes values and hands answers back, and the
one stub in the suite (`test/react-native-stub.ts`) exists only because
`data/migrate` asks `design/tokens` whether a stored theme name is real and
`tokens` reads `Easing` at module scope. Keeping that list at one entry is the
property to defend — a setup needing a stub per native import rots the first
time the code gains one, which is the argument for testing `data/` rather than
screens.

`__DEV__` is defined `true`, so every run also fires the drift check in
`tokens` that asserts `buildPalette('blurple', true)` still equals the ported
Nocturne palette exactly. That is the one design invariant nothing else
checked.

What is covered, and why it is these two:

- **`data/migrate`** — the version chain, the shape guard and the backup
  merge. Every bug in it is silent and lands on real training data: a key
  dropped to its seeded default, a plan that wakes up empty, a merge that
  overwrites what you actually lifted. The chain is tested through
  `migrateBlob` rather than through `migrateV1/V2/V3` one at a time, because
  the *order* is the thing that has been wrong before — `migrateV3` reads the
  raw blob and the other two read the filtered one, and a refactor loses that
  fact quietly. There is a test named for exactly that.
- **`data/coach`** — `parsePlan` and `resolvePlan`, the seam. The far end is a
  chat model that will phrase things however it likes, so the fixtures are
  replies rather than payloads: prose around the block, a dropped tag, a
  placeholder row copied out of the template, `1e999`, and a German
  `"gewicht"` where a measure identifier belongs.

Both suites were checked by mutation rather than trusted for passing: putting
the `migrateV3(data, data)` bug back fails five tests, and flipping `fillGaps`
so a backup wins fails a sixth.

## Releasing

The repo is **proprietary** (`LICENSE`) — it used to carry Expo's MIT
boilerplate, which credited 650 Industries and licensed the app to everybody.
The bundled open-source components keep their own terms in
`THIRD-PARTY-NOTICES.md`, regenerated by `npm run licenses`; regenerate it when
dependencies change, because that file is the attribution their licences
actually require.

- **`app.json` states the version; `package.json` copies it.** `npm run version`
  checks, `-- --fix` syncs. A release build fails on a mismatch — the dev loop
  never runs it.
- **A release is also named, once, in the same file.**
  `expo.extra.buildName` — *Connection diagnostics* for 1.3.0 — and three
  things read it rather than restating it: the About section's own row, the
  diagnostics header (beside the version, which that header claimed long before
  it carried it), and the artefact dropped in `_builds/`. It is a *name*, like
  `Spotter`, so it is not translated: two phones and a log file have to be
  talking about the same build in either language. It is optional throughout —
  an unnamed release skips the row and keeps the old filename — which is what
  makes naming one a decision rather than a field to fill in.
- **Release signing goes through `plugins/with-release-signing.js`**, because
  `android/` is generated and the template's `signingConfig signingConfigs.debug`
  comes back on every prebuild. The key is *named* by `keystore.properties` (repo
  root, gitignored) or `SPOTTER_KEYSTORE*`, never stored here. With neither, the
  release build falls back to the debug key, says so, and names the artefact
  `-debugsigned`; a keystore that is named but missing is an error rather than a
  fallback. `docs/release-signing.md` carries the one thing that has to be read
  first — switching keys costs an uninstall, and an uninstall costs that phone's
  diary.
- **Play material lives in `docs/`** — the two privacy policies (EN + DE, both
  still needing a postal address and a public URL) and `play-data-safety.md`,
  which records the Data safety answers *with the reason for each*, so a feature
  that changes one is checked against a stated position rather than re-derived.
  It also holds the arguments for the two declarations Play will ask about,
  `USE_EXACT_ALARM` and `FOREGROUND_SERVICE_SPECIAL_USE`, and the fallback if
  either is refused.
- **The published copies live in a second repo** (`spotter-legal`, beside this
  one), because Play needs the policy at a public URL and GitHub Pages only
  publishes from a public repository — which the app's source is not. The same
  document therefore exists in four files, and they move together: a change to
  what the app does has to land in both `docs/*.md` and both pages, and bump
  the date on each. That repo has no third-party request on it by rule; a
  privacy page that hotlinks a webfont hands the reader's IP to Google before
  they have read a word.
- **Settings links to it, and only once there is something to link to.**
  `expo.extra.privacyUrl` in `app.json`, read the way `buildName` is and
  optional for a sharper reason: until the page is published there is nothing
  to open, and a row that opens nothing is worse than no row. Set the key and
  the ghost link appears under About; it is a URL, not copy, so it is not
  translated — only its label is (`privacyPolicy`).
- **The notices are published too, and that is the half that discharges the
  licence.** `THIRD-PARTY-NOTICES.md` is the attribution 738 bundled packages
  require, and MIT, BSD, Apache and OFL all require it to *travel with the
  binary* — a file that never leaves a private repo has accompanied nothing. So
  `npm run licenses` now writes `notices/index.html` into the sibling
  `spotter-legal` (or `$SPOTTER_LEGAL`) in the same pass, and
  `expo.extra.noticesUrl` draws an **Open source licences ›** link under the
  privacy one, on exactly the same terms — absent key, no row. Three things
  about it:
  - **One pass writes both**, so the page and the file cannot come to describe
    different dependency trees. The page is therefore *generated* and a hand
    edit is lost; the styling is the only part of it that lives in the other
    repo.
  - **A missing sibling is a log line, not an error.** This repo has to build on
    a machine that never cloned the pages.
  - **It is a link, not a screen.** Half a megabyte of licence text is a poor
    thing to bundle and parse on a phone and a fine thing to open in a browser —
    and the page keeps the browser's own find, which a `ScrollView` would not.
  Nothing here is worth an in-app screen *until* Spotter is distributed to
  anyone but Calvin; from that moment it is not optional.
