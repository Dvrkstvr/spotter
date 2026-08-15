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
- **Weak is below three quarters of an even split, not below even.** In any real
  week three regions are under the mean by definition, and a screen that flags
  half the body every time is noise rather than a finding.
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
- **`distanceKm` is the one number re-derived from the stored set strings.**
  Everything else is taken off `history` as written — volume is each entry's
  own `vol`, because that number was written by `totals()` and is already gated
  to `load` sets, and re-deriving it here would mean re-deciding what counts in
  a second place. Distance never had a total of its own, so it is parsed; an
  unrecorded `—` contributes nothing rather than zero.
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

### The coach's contract is the seam

`buildPrompt` writes the request and `parsePlan` reads the reply, and neither
knows who is on the other side. That is the whole design: today the far end is
a chat app reached through the Android share sheet, and a tiny on-device model
later answers the same fenced block with the preview and the import path
untouched.

- **The prompt is in the user's language; the contract inside it is not.** They
  read it before they send it — it is shown in full, which is what makes the
  privacy switch on the step before it mean something rather than being a
  promise. But `"measure": "load"` is an identifier in this app's data, not a
  word being translated, and a German reply carrying `"gewicht"` imports as
  nothing.
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
  and cannot teach hold-then-drag. `DragDemo` draws a pointer and a figure on an
  overlay above the cell (`pointerEvents: 'none'`); the `TextInput` underneath is
  untouched and still typeable. Every number in it is the real one — the travel
  is `DEMO_STEPS × PX_PER_STEP` and the pause before it moves is `HOLD_MS`, which
  is 120 ms and a stillness test rather than a wait. It is the one animation in
  the app deliberately **off** the native driver: the figure is text, which no
  driver can animate, so the pointer and the number share one JS clock instead of
  drifting apart on two. It does not buzz — `buzz.grab` reports that *your*
  finger took the cell, and the ring is that moment drawn instead.
- **The tour reads the tip strings.** `obFeatTick/Drag/Rest` are gone;
  `onboarding-overlay.tsx`'s `features()` reads `tipTick` / `tipDrag` / `tipRest`.
  One list, two surfaces, so a rundown card and an in-place hint cannot phrase
  one gesture two ways. The buddy card kept its own copy, having no tip twin —
  the button that opens pairing carries a label, so it fails the admission test
  in the right direction.
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
  it's the one that has to stay.
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
    you have *ticked* — the way in (`addNote`), else nothing. The offer arrives
    with the tick because a set you have lifted is a set you have an opinion
    about, where row 4 is a plan and has nothing to say yet; standing on every
    unlifted row it is 16px of furniture eight times over, on the screen
    working hardest not to become furniture. It borrows no outline — no fill
    and above all no dash, for the reason a tip doesn't: dashed means *this one
    is held* at three sites.
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
- **Numbers are also a gesture**: hold a kg or reps cell still for `HOLD_MS`,
  then drag up or down to step it (0.5 kg / 1 rep per `PX_PER_STEP`). The hold
  is only long enough to tell the finger apart from a scroll — gesture-handler
  fails the pan the moment it moves before the delay elapses, so `HOLD_MS` is a
  stillness test rather than a wait, and it is short enough that the gesture
  reads as touch-and-slide. While a drag runs, the list's `scrollEnabled` goes
  off. Most sets never need the keyboard. This one gesture is the reason
  `react-native-gesture-handler` is mounted at all (`GestureHandlerRootView` in
  `src/app/_layout.tsx`), and `Gesture.Pan().activateAfterLongPress()` is what
  keeps it apart from the list's own scroll. Everything else on this screen —
  the swipe between exercises included — is still a plain `PanResponder`, and
  should stay one.
  - **The cell is `box-only` always, focused or not, and that is
    load-bearing.** A number cell is a `TextInput`, and Android's
    `ReactEditText` answers every ACTION_DOWN with
    `requestDisallowInterceptTouchEvent(true)`. That walks up to
    `GestureHandlerRootView`, which reads it as a native view claiming the
    touch and **cancels every handler in the orchestrator** — so a pan waiting
    out `HOLD_MS` is already dead before the hold elapses. Moving to
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
    stepped nothing and was released is routed to the same place: overshooting
    `HOLD_MS` on what you meant as a tap costs you nothing, which is the other
    half of why the delay can be short.
  - **It is the one gesture performed under your own thumb, so it is felt
    rather than watched** — and the two moments get different weights, on the
    haptics ladder in `src/data/haptics.ts`. `buzz.grab` is the hold landing,
    at the same weight as a ticked set: it is what tells you when to start
    moving, and without it you either move too early and never take the cell
    or wait longer than you had to. `buzz.step` is the quietest thing in the
    app, because it fires ten or twenty times inside one drag — and it is the
    one call in this module that leaves the cross-platform API, because
    `selectionAsync` is a 50 ms buzz on Android and `Segment_Frequent_Tick` is
    the constant Android defines for a value scrubbing under a finger. Both
    are gated on the `haptics` setting, like every other buzz.
  - **A step buzzes when the figure changes, not when the finger moves.**
    `onUpdate` runs per frame; the cell only changes every `PX_PER_STEP`, and
    stops changing entirely once the clamp at zero is holding it. So the
    handler compares against the last figure it emitted and returns early —
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
  planned.** The dot used to test the plan first, so a freeform Saturday was
  invisible on the month grid and the day card called it "Nothing planned" with
  the session listed right underneath it. It is now also why the day panel keeps
  planned rows and logged cards in separate blocks: a day can be either, both or
  neither, per row, and all of those have to read correctly.
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

`npx expo export --platform android` catches things that only break at bundle
time. There are no tests yet.
