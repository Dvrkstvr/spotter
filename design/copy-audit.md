# Spotter — copy & tone audit

*11 Aug 2026. Scope: every user-facing string — `src/data/i18n.ts` (the whole
DICT, both languages), the seeded content in `src/data/exercises.ts` (names,
cues, setup labels, routine names), and the coach prompt assembled in
`src/data/coach.ts`. Verified against usage sites; no strings hide outside
these files — every screen reads `L.*`.*

**Status: sections 2–6 were applied on 11 Aug 2026.** Sections 2–5: string
pass in `i18n.ts`, the `startBare` key + two call sites, and the §8 rules now
in AGENTS.md. §6: seeded exercises carry `names.de` (`DE_NAMES` in
`exercises.ts`, jargon-tier names deliberately absent), and the cues and
setup labels have a full German table (`INFO_DE`) resolved by
`infoFor(id, lang)` — the store's `setup()`/`cues()` read through it, user
overrides still win in both languages. The `insights` title (§5.4) stays
"Insights" pending a decision.

The purpose of this document is the same as the mockup's: it is the spec for a
copy pass. Section 2 is wrong-and-should-change; sections 3–5 are proposals
with reasons; section 6 is a decision to make; section 7 is what must *not* be
"fixed"; section 8 is the style rules worth writing into AGENTS.md so the next
string lands in the voice by default.

---

## 1. The voice the app already has

Derived from the copy itself — this is what "in the design language" means
here, stated as rules:

- **Plain declaratives: mechanism, then consequence.** "Runs after every set
  you tick off. Off hides the countdown entirely." The sentence tells you what
  happens, then what that means for you. Never the reverse, never a promise.
- **The em-dash aside is the house punctuation.** "Both optional, and neither
  is asked again." A second thought attached to the first, not a new paragraph.
- **No exclamation marks. No emoji. No praise.** The biggest moment in the app
  says "Ready." — with a full stop. Understatement *is* the register.
- **Errors state the fact and the way out, never blame.** "The plan block is
  there but its JSON is broken. Ask the AI to send the block again."
- **The wit is dry and load-bearing.** "…you just have to be looking at it."
  "…there is no reason to want them yet." A joke that also carries the
  information; never a joke instead of it.
- **Second person, always.** "you", "du" — never "the user", never passive
  where active fits.
- **German register:** du-form throughout; colloquial apocopated imperatives in
  UI copy (*füg, trag, erstell, Zeig, Tipp, Hak*); infinitives on buttons
  (*Speichern, Abbrechen, Entfernen*); full imperatives only inside the coach
  prompt (*Kopiere, Öffne*), which is written text handed to a machine and
  correctly a notch more formal.

The Statistics & Coach strings live up to the mockup's own copy; the tone gap
is not between old and new features. It is (a) a few strings that never got
the voice, and (b) German that stayed too close to the English word order.

---

## 2. Wrong — fix regardless of taste

These change meaning or are broken German. Everything here is a string-only
edit unless marked.

### 2.1 `obPickSub` says the opposite of what it means (DE)

> EN: "Untick anything you do not want …"
> DE: "**Hak ab**, was du nicht willst …"

*Abhaken* is to **tick**. The German instructs the user to tick what they
don't want — the inversion of the English, and contradicted by the app's own
usage (`savedEmpty`: "Nichts **abgehakt** — nichts gespeichert"). Proposed:

> `Ausgewählt für {style}. Nimm den Haken raus bei allem, was du nicht willst — bearbeiten kannst du sie später sowieso.`

### 2.2 "zuletzt vor heute" (DE composition)

`fmtLastDone` composes `lastDone + agoToday` for a same-day session:
EN "last done today" ✓, DE "**zuletzt vor heute**" ✗ — because `lastDone` is
"zuletzt vor" and `agoToday` is "heute". The comment on `daysAgo` ("no 'vor'
of their own") documents the design and `agoToday` breaks it. Move the *vor*
into the strings that need it:

| key | now | proposed |
|---|---|---|
| `lastDone` | `zuletzt vor` | `zuletzt` |
| `agoToday` | `heute` | `heute` (unchanged) |
| `oneDayAgo` | `einem Tag` | `gestern` |
| `daysAgo` | `{n} Tagen` | `vor {n} Tagen` |

Yields "zuletzt heute" / "zuletzt gestern" / "zuletzt vor 3 Tagen" — and
"gestern" now matches the EN "yesterday" instead of the stiffer "vor einem
Tag". Update the comment beside `daysAgo` in the same edit.

### 2.3 "hinten" is not "behind" (DE, two sites)

- `coachWeakPreselect`: "Aus deinen Daten gewählt: {list} **hinten**." —
  *hinten* is spatial (at the back of the room). Proposed:
  `Aus deinen Daten: {list} hinken hinterher.` — reusing the verb the insights
  screen already owns (`insightsWeakNone`: "Nichts hinkt hinterher").
- `promptWeakHead`: "**Hinten:**" → `Im Rückstand:`

### 2.4 `goalBalanced` (DE)

"**Ausgewogen alles**" is not a German phrase. → `Rundum ausgewogen`.

### 2.5 `start` reads as a bare imperative on two buttons (DE)

`L.start` = "Starte" exists to compose the Today hero: "Starte Brust A" —
natural. But the same key is rendered **bare** on the Plan day card
([plan.tsx:211](src/app/(tabs)/plan.tsx:211)) and as "Starte ›" on the
routines list ([routines.tsx:67](src/app/(tabs)/routines.tsx:67)), where a
lone du-imperative breaks the app's own button grammar (every other button is
an infinitive: *Speichern, Verwerfen, Zusammen starten*). Needs one new key —
`startBare: 'Start' / 'Starten'` — and two call-site swaps. EN unaffected
("Start" works everywhere).

### 2.6 `dropGif` describes an interaction that doesn't exist (EN + DE)

"Drop a GIF or video frame" / "GIF oder Videobild ablegen" — but the image
slot is filled by the photo picker (documented deviation in AGENTS.md); there
is no drag-and-drop on a phone. The string predates the deviation. Proposed:
EN `Add a GIF or video frame`, DE `GIF oder Videobild hinzufügen`.

### 2.7 `hapticsHint`: "Summen" (DE)

"Ein kurzes **Summen**" — *Summen* is what a bee does. A phone buzz is
*Vibrieren*. Proposed: `Vibriert kurz, wenn ein Satz abgehakt ist und wenn die
Pause um ist.` (Also tightens the doubled "wenn … und wenn".)

### 2.8 "Gerät" means two different things (DE, real collision)

The DE dictionary uses **Gerät** both for equipment (`equipment`, `typeKind`)
and for the phone (`missingHere: 'Fehlt auf deinem Gerät'`,
`nearbyDevice: 'Gerät in der Nähe'`). In the sync sheet the two meet: items
typed *Gerät* (a barbell) listed under the header *Fehlt auf deinem Gerät*
(your phone). The app already says **Handy** for the phone everywhere else
("auf diesem Handy", "{name}s Handy") — these two are the outliers:

| key | now | proposed |
|---|---|---|
| `missingHere` | Fehlt auf deinem Gerät | `Fehlt auf deinem Handy` |
| `nearbyDevice` | Gerät in der Nähe | `Handy in der Nähe` |

EN has the same drift in miniature — `missingHere/missingThere` say
"device" while the whole app says "phone" ("this phone", "both phones",
`planMissing`: "Not on {name}'s phone yet"). Proposed: EN
`Missing on your phone` / `Missing on {name}'s phone`.

---

## 3. English tone findings

### 3.1 Three names for the freeform session

The EN copy calls the same idea **"Freeform workout >"** (`orStart`, Today),
**"Empty session"** (`emptySession`, the pick-workout sheet), and **"Free
session"** (`freeSession` — the fallback *name a logged session is filed
under*, and the phrase `dayFree` uses). German already unified all of it to
"Freies Training". Proposed EN term: **free session** (it's already the one
users see on the calendar and in `dayFree`):

| key | now | proposed |
|---|---|---|
| `orStart` | Freeform workout > | `Free session ›` |
| `emptySession` | Empty session | `Free session` |
| `freeSession` | Free session | (unchanged) |

Note the `>` → `›` in `orStart` either way: every other chevron in the app is
`›`/`‹` (`Next ›`, `‹ Back`, `Get recommendations ›`).

*(DE `orStart` is "Oder einfach loslegen" — a different sentence than the EN,
but arguably the more in-voice one. Keep it; cross-language copy doesn't have
to be literal, only the terminology does.)*

### 3.2 Two registers: "Do not sort it" vs "isn't a Spotter plan"

The onboarding strings avoid contractions ("Do **not** sort it", "you would
not guess", "anything you do **not** want", `whoFirstHint`'s "when you **are**
level") while the import/coach strings contract freely ("isn't", "wasn't",
"Who's up?"). Both blocks are post-design, so neither inherits authority; the
uncontracted lines read stiff next to the app's spoken-plain voice.

Proposed rule: **contract by default; stay uncontracted only where the line
should slow the reader down** (destructive confirmations — `restoreBody`'s
"It cannot be undone." is right as is). Concretely:

- `obStyleMixedSub` → `Don't sort it — put all of it in front of me.`
- `obHowSub` → `Four things you wouldn't guess by looking at a screen.`
- `obPickSub` → `… anything you don't want …`
- `whoFirstHint` → `… when you're level on an exercise …`
- `measureHint`, `obStyleSub` etc. have no contraction opportunities — untouched.

### 3.3 Small EN polish

- `obPermsSub`: "you only lose the thing it does" — "it" has no clean
  antecedent ("either"?). → `Spotter works without either — you only lose the
  one thing each does.`
- Singular forms missing where 1 is reachable: `insightsSub` ("1 sessions"),
  `promptWeek` if a 1-per-week plan is ever allowed, `favSessions`. The
  dictionary already owns the `countRoutine`/`countRoutines` pattern —
  worth a pass if these bother anyone in practice; not urgent.

---

## 4. German: strictly-translated lines, with rewrites

Ordered by how loudly they read as translation. Everything is string-only.

| key | now | proposed | why |
|---|---|---|---|
| `obFeatTick` | Ein **Tipp** hakt den Satz ab | `Ein Fingertipp hakt den Satz ab` | *Tipp* is a hint/piece of advice; a screen tap is a *Fingertipp*. |
| `obStyleSub` | …immer einen **Tipp** entfernt | `…immer einen Fingertipp entfernt` | same |
| `obPermsTitle` | Zwei Dinge **zum Erlauben** | `Zwei Dinge brauchen dein Okay` | nominalized calque; the EN deliberately avoids "permissions" jargon, this keeps that. |
| `obPermsSub` | …es fehlt nur genau das eine. | `…dir fehlt dann nur genau das, was sie können.` | current is cryptic; also fixes the EN antecedent problem in parallel (3.3). |
| `obPermRadioNo` | …jederzeit **umkehrbar**. | `…Lässt sich in den Einstellungen jederzeit wieder einschalten.` | *umkehrbar* is spec language, not speech. |
| `obLevelNewSub` | …oder **Neustart von vorn**. | `…oder noch mal ganz von vorn.` | "Neustart von vorn" is doubled. |
| `askDeclined` | {name} **sagt gerade nicht** | `{name} sagt: gerade nicht` | current parses as "is currently not speaking". |
| `whosUp` | Wer fängt an? | `Wer ist dran?` | collides with the *setting* `whoFirst` ("Wer fängt an"); EN keeps the two apart ("Who goes first" / "Who's up?"), and *Wer ist dran?* is the phrase a gym actually uses. Bids "Ich"/"Du" still answer it. |
| `whoFirstHint` | „Zufall“ **wirft einmal** pro Übung… | `„Zufall“ entscheidet einmal pro Übung per Münzwurf; „Fragen“ überlässt es euch beiden und wirft sonst die Münze.` | *wirft* without an object dangles. |
| `importGuessed` | …die du nicht hast — diese **liegen unter** {group} / {kind}. | `Die KI nennt eine Muskelgruppe oder ein Gerät, das es hier nicht gibt — einsortiert unter {group} / {kind}.` | *einsortiert* is the natural "filed under"; also retires "Ausrüstung" (see 5.3). |
| `importDropped` | {n} übersprungen: **nennen** eine Übung… | `{n} übersprungen — dort steht eine Übung, die es hier nicht gibt und die nirgends definiert ist.` | plural verb breaks at n = 1; rewrite is number-proof. |
| `rerunSetupHint` | Das Speichern **ihrer** Routinen-Auswahl ersetzt… | `…Speicherst du dort eine Routinen-Auswahl, ersetzt sie die mitgelieferten Routinen auf diesem Handy — selbst erstellte und alles Aufgezeichnete bleiben unberührt.` | *ihrer* (the tour's) misreads as a stray Sie-form; du-form matches the app. |
| `promptIntro` | Du bist ein erfahrener **Trainer**. | `Du bist ein erfahrener Trainer für Krafttraining.` | EN says *strength coach*; the qualifier steers the AI and got lost. |
| `restAlertHint` | …**Sie** verschwindet von selbst… | `…Die Benachrichtigung verschwindet von selbst, sobald du die App wieder öffnest.` | "Sie" has no visible antecedent (the label above is a verb phrase) and misreads as Sie-form. |
| `exportHint` | …als eine Datei **zum Aufheben**. | `…als eine Datei, die du woanders aufbewahrst.` | "somewhere else" is the entire point of a backup and got lost. |
| `forgetBuddy` | Diesen Partner **entfernen** | `Diesen Partner vergessen` | EN chose *forget* deliberately (roster metaphor, feels less destructive than delete); DE flattened it. |
| `promptRuleGroup` / `promptRuleKind` | …muss **eines von diesen** sein: {list} | `…muss eines davon sein: {list}` | lighter. |
| `holdAddSet` | **Halten für neuen Satz** | `Für einen neuen Satz halten` | telegraphic, missing article; also aligns with the app's only two hold-patterns: „Zum ⟨Verb⟩ halten“ (Beenden, Löschen, Wiederherstellen) and „Für ⟨Ziel⟩ halten“ (die nächste Übung). |
| `holdDeleteRoutine` | Zum Löschen der Routine halten | `Zum Löschen halten` | the button lives inside the routine's own editor; naming it again is the translationese. (Judgment call — current is not wrong.) |
| `seatBarHeight` | Sitz / Stangenhöhe | `Sitz-/Stangenhöhe` | German compound ellipsis takes the hyphen. |
| `chooseWorkout` | Training **auswählen** | `Training wählen` | matches `chooseRoutine` ("Routine wählen"). |
| `obLevelNewSub`… `obPickSub` | — | — | see §2 for the meaning-level ones. |

**Ellipsis spacing (DE, mechanical):** the DE strings mix attached and spaced
ellipses — `Suche…` but `Verbinde neu …`, `warte auf Antwort …`,
`suche {name} …`, `Warte, bis {name} beitritt …`, `Synchronisiere mit
{name} …`, `wählt eine Übung aus …`, `Verbinde mit {name} …`. EN attaches
everywhere. Attach all of them (trailing activity-ellipsis is UI convention,
not sentence ellipsis). `obAndMore` ("… und zwei mehr.") is a *leading*
ellipsis standing for omitted words and is correctly spaced — leave it.

**`Whd.` vs `Wdh.` (DE, mechanical):** the standard German abbreviation for
*Wiederholungen* is **Wdh.** — which `draftLegend` uses, while `reps`,
`measureLoad` and `obFeatDragSub` write `Whd.`. Unify on `Wdh.` (three edits).

---

## 5. Terminology — decide once, then the strings follow

### 5.1 Einheit / Session / Training (DE)

Three words share the job EN does with two (*session*, *workout*). The good
news: the split is already almost systematic — worth codifying rather than
flattening:

- **Einheit** — the logged, counted thing. Stats, diary, history.
  (`statsFootSessions`, `lastSession`, `sessionsLogged`, `restoreDone` ✓)
- **Session** — the live thing happening now, especially shared.
  (`liveSession`, `invite` "Session teilen", `buddySub`, `obFeatBuddySub` ✓)
- **Training** — the activity as a whole. (`finishWorkout` "Training beenden",
  `freeSession` "Freies Training", `requestSession` "Training anfragen" ✓)

Every current string already sits on the right side of this line. Write the
rule down (AGENTS.md, §8) so the next string does too. Colloquial compounds
(`measureHint`'s "Kletter-Session") are outside the rule.

### 5.2 Buddy vs Partner (DE)

The DE term is **Trainingspartner/Partner** (`buddy`, `obPermRadio`,
`forgetBuddy`, `obDoneNote` "Partner-Radio") — but two strings still say
Buddy: `buddySync` ("Buddy-Sync") and `buildStandalone` ("echtes
**Buddy**-Radio", contradicting `obDoneNote`'s "Partner-Radio" directly).
Proposed: `Partner-Sync`, `Standalone · echtes Partner-Radio`.

### 5.3 Ausrüstung vs Gerät (DE)

The equipment list is **Gerät(e)** everywhere the user manages it
(`equipment`, `typeKind`, `addEquipment`, `obDoneNote`) — but the coach flow
switches to **Ausrüstung** (`coachGearHead`, `promptGear`, `importGuessed`).
The values shown *are* the Geräte list (Langhantel, Maschine…). Proposed:

| key | now | proposed |
|---|---|---|
| `coachGearHead` | Ausrüstung einplanen | `Verfügbare Geräte` |
| `promptGear` | Ausrüstung: {gear}. | `Geräte: {gear}.` |
| `importGuessed` | …oder Ausrüstung… | (covered by the §4 rewrite) |

`coachGearHead`'s current "Ausrüstung einplanen" also mistranslates —
"equipment to plan *with*" became "plan equipment *in*".

### 5.4 `insights` (DE title — judgment call)

The screen is titled "Insights" in German. The app happily keeps established
loanwords (Cardio, Prompt, Backup, Sync) but "Insights" is the one that reads
as app-store English rather than borrowed German. If a German word is wanted:
**„Auswertung“** fits the diary register exactly (the evaluation of what was
recorded). Defensible either way — flagging, not prescribing.

---

## 6. The structural gap: seeded content is English-only

The largest German-experience issue is not in the dictionary at all. On a
German phone:

1. **Every seeded cue is an English sentence.** "Shoulder blades pinched,
   feet planted." — ~80 cue lines in `INFO`. These are full prose, not
   gym vocabulary, and they sit on the how-to sheet a beginner opens most.
2. **Every setup label is English.** "Bar height", "Seat", "Pulley height" —
   ~40 labels, same sheet, editable outside edit mode (they're notes about
   the machine you're standing at — in the wrong language).
3. **Seeded exercise names are English by decision** (AGENTS.md:
   "language-neutral gym vocabulary"). That holds for *Bench Press, Dip,
   Plank* — it does not hold for the cardio and accessory names: *Run, Walk,
   Swim, Jump Rope, Stair Climber, Standing Calf Raise, Walking Lunge,
   Hanging Knee Raise* are plain English words with obvious everyday German
   (*Laufen, Gehen, Schwimmen, Seilspringen, Stepper, Wadenheben stehend,
   Ausfallschritte, Knieheben hängend*).

The infrastructure for (3) already exists and costs nothing: `Exercise.names`
is a `LangMap`, `exInfo` resolves it, `resolvePlan` already matches across
every language, and `EX` is code, not persisted state — seeding `names.de` is
additive with no migration. History keeps names frozen at log time, which is
already documented behavior.

(1) and (2) need a small model decision: `ExerciseInfo` carries single
strings, and `cueEdits`/`setup` overrides are the user's own single-language
text. The seed side would need per-language variants (e.g. `INFO` keyed by
lang with EN fallback) while overrides stay single strings — bounded (~120
short strings to write) but it is a code change, not a copy change. Recommend
sequencing it separately from the string pass above.

---

## 7. Already right — protect these from a copy pass

The audit exists to unify tone, and several German lines are *better* than
their English — loose translation done right. A future pass must not
"correct" them toward literalness:

- `obHowSub`: "Vier Dinge, die man einem Bildschirm nicht ansieht." — better
  than the EN.
- `insightsFact`: "Fun fact" → **"Zum Angeben"** — a genuinely great loose
  translation; do not literalize to „Wissenswertes“.
- `obTagline`: "…das dir nicht im Weg steht." ✓
- `noDetail`: "Aufgezeichnet, bevor dieses Handy die einzelnen Sätze behalten
  hat." ✓
- `trainAloneHint`: "Wer gekoppelt ist, bleibt gespeichert." — tighter than
  the EN.
- `joinAskTitle` "Darf ich mitmachen?", `letThemIn` "Reinlassen", `letsTrain`
  "Los geht's" — exactly the register.
- `statsHeadWeak`: "{region} kommt zu kurz…" ✓
- `dangerHead`: "Von vorn" ✓

Deliberate-looking conventions to keep as they are:

- `{pct}%` without a space (German typography wants "25 %", but the charts
  spend the space better; it is at least consistent).
- „Gänsefüßchen“ in DE, curly quotes in EN — already consistent.
- Apocopated imperatives in UI (*füg, trag, Zeig*) vs full imperatives in the
  coach prompt (*Kopiere, Öffne*) — a real register split that works.
- `theirTurn` "Satz von {name}" (avoids genitive-apostrophe trouble with
  names ending in -s).
- `restNote` "Genieß deinen Tag in vollen Zügen." — warmer than the house
  tone, but it's the rest day; the one place warmth belongs, and it's the
  design's own line.

---

## 8. Proposed style rules (for AGENTS.md)

> **Copy voice.** Mechanism first, consequence second; the em-dash carries
> asides. No exclamation marks, no praise — understatement is the register.
> Errors say what happened and the way out, never who's at fault. Contractions
> are the default; write them out only where a line should slow the reader
> down (destructive confirmations). Chevrons are `›`/`‹`, never `>`.
>
> **German is written, not translated.** du-form; apocopated imperatives in UI
> copy, full imperatives only inside the coach prompt; buttons are
> infinitives. Terms: **Einheit** = logged session, **Session** = the live
> (shared) one, **Training** = the activity; **Handy** = the phone, **Gerät**
> = equipment only; **Partner**, not Buddy; **Wdh.**, not Whd. Trailing
> ellipses attach (`Suche…`). A German line that reads better than a literal
> rendering wins — see design/copy-audit.md §7 for the protected examples.

---

## Appendix: full change list by key

For the eventual PR — every proposed edit in one place. DE unless marked EN.

**Meaning/grammar (§2):** `obPickSub` · `lastDone`+`oneDayAgo`+`daysAgo` ·
`coachWeakPreselect` · `promptWeakHead` · `goalBalanced` · `startBare` (new
key + 2 call sites) · `dropGif` (EN+DE) · `hapticsHint` · `missingHere`
(EN+DE) · `missingThere` (EN) · `nearbyDevice`

**EN tone (§3):** `orStart` · `emptySession` · `obStyleMixedSub` · `obHowSub`
· `obPickSub` · `whoFirstHint` · `obPermsSub`

**DE naturalness (§4):** `obFeatTick` · `obStyleSub` · `obPermsTitle` ·
`obPermsSub` · `obPermRadioNo` · `obLevelNewSub` · `askDeclined` · `whosUp` ·
`whoFirstHint` · `importGuessed` · `importDropped` · `rerunSetupHint` ·
`promptIntro` · `restAlertHint` · `exportHint` · `forgetBuddy` ·
`promptRuleGroup` · `promptRuleKind` · `holdAddSet` · `holdDeleteRoutine` ·
`seatBarHeight` · `chooseWorkout` · ellipsis spacing (7 strings) · `reps` +
`measureLoad` + `obFeatDragSub` (Wdh.)

**Terminology (§5):** `buddySync` · `buildStandalone` · `coachGearHead` ·
`promptGear` · (`insights` — decision pending)

**Separate work item (§6):** seed `names.de` for non-jargon exercises;
per-language `INFO` cues and setup labels (model change).
