# Spotter — how training statistics are actually calculated

*26 Aug 2026. A research pass, not a spec. Scope: `src/data/stats.ts` — the
balance, the volume headline, the fun facts, `keyLifts` — read against what
the exercise-science literature and the comparable apps actually do. Sections 7
and 8 are the proposals, and each one says what it costs. Section 9 is a second
pass, answering three questions Calvin put to the first one.*

***Status: §7 is applied in full, 26 Aug 2026** — the `also` field and its
seeded table, the balance counting fractional sets, the per-muscle range, the
push:pull line, key lifts by estimated 1RM, and the strength card once
`Profile.sex` existed. Each carries a dated note at its own heading, and two of
those notes correct this document rather than only recording it. The §9.1
mockup's region-expansion UI is built as well — `BandBars`, which retired the
radar. Sections 1–6 describe the state of things **before** any of it and are
left that way deliberately: they are the argument, and rewriting them into the
past tense would leave the decisions with nothing to have been decided
against.*

The question that started it: **should the balance take body weight, height,
muscle group, sets and volume — and age?** The short answer is that four of
those six are the wrong knobs, one of them is already in and doing damage, and
the thing actually wrong with the balance is none of them.

---

## 1. What the balance does today

`trainingStats` reads six regions. For every ticked set it computes *work* —
kilos × reps, with a bodyweight set charged at `bodyKg` and a hold converted
at `HOLD_SECONDS_PER_REP` — files that work under the region its exercise's
**single** `group` rolls up into, divides each region's kilos by `REGION_MASS`
(a fixed table of how much skeletal muscle the region carries), re-normalises
the six, and reports each as a **share of 100%**. Below `EVEN_SHARE × 0.75`
(12.5%) a region is called weak.

Four decisions in that chain, and the literature disagrees with three of them.

---

## 2. The dominant error is attribution, not arithmetic

`Exercise` carries exactly one `group` (`exercises.ts:93`). So:

| Logged | Credited | Credited nothing |
|---|---|---|
| Bench Press | Chest 100% | triceps, front delts |
| Deadlift | `LowerBack` → **Back** 100% | hamstrings, glutes, quads, traps, forearms |
| Pull-up | Back 100% | biceps, rear delts |
| Overhead Press | Shoulders 100% | triceps, upper chest |
| Back Squat | `Quads` → **Legs** 100% | erectors, glutes, adductors |

A textbook push/pull/legs week logged in Spotter reports **Arms** as starved
while the lifter has done thirty hard sets of triceps and biceps work inside
their presses and rows. It reports **Back** as enormous because the deadlift's
kilos land there in full — the heaviest lift of the week attributed entirely to
a region it half-trains.

No re-weighting fixes this. `REGION_MASS`, `bodyKg` and `HOLD_SECONDS_PER_REP`
are all corrections applied *after* the work has been put in the wrong bucket.

This is also the one place the field has converged on an answer, and recently.

**Pelland et al., *Sports Medicine* (2025)** — 67 studies, 2,058 participants,
Muscle Physiology Laboratory, Florida Atlantic — re-analysed the whole
resistance-training dose-response literature three times over, counting each
set for a muscle three different ways:

- **total** — every set that involves the muscle counts as 1
- **direct** — only sets where the muscle is the prime mover count; indirect = 0
- **fractional** — direct = 1, **indirect = 0.5**

Fractional predicted hypertrophy better than either alternative (Bayes factor
9.48 against *total*, and up to ~54.8 across the model comparisons). Their
conclusion is explicit: distinguishing direct from indirect sets "appears
essential for predicting adaptations."

Spotter is currently running the **direct** method — the one that lost — on a
data model that can only ever run it.

> A bench press is 1 chest set + 0.5 triceps + 0.5 front delt. That single
> sentence is most of what a muscle-balance feature is.

---

## 3. Volume load is the wrong currency

`vol` and the balance's `work` are both **volume load** — kg × reps, tonnage.
It is the wrong unit for a stimulus comparison, and this is not a fringe
position:

- Volume load "does not drive muscle hypertrophy" — changes in it correlate
  poorly with both hypertrophy and strength gain.
- The standard counter-example: 3×5 @ 315 lb → 4,725 lb; 3×12 @ 185 lb →
  6,660 lb. A 40% jump in volume load, no reason to expect more growth.
- Blood-flow-restriction and light-load work generate 50–60% *higher* volume
  load for the same hypertrophy.
- It is described in the field as a "vanity metric" — one that makes you feel
  good without informing a decision.

The unit the literature actually uses is the **hard set per muscle per week**,
and has been since Schoenfeld's 2017 dose-response meta-analysis (<5 / 5–9 /
10+ weekly sets per muscle; roughly +0.37% growth per additional weekly set).
Renaissance Periodization's volume landmarks are stated in it (MV ≈ 6,
MEV ≈ 6–8, MAV ≈ 12–18, MRV ≈ 20–25 sets/week, varying by muscle). Every
serious tracker displays it.

A "hard set" is defined, and tightly enough to be checkable: **30–85% 1RM,
5–30 reps, 0–4 RIR.** Spotter can check the middle clause off a stored set
string. It cannot check the other two.

Volume load is not worthless — it is a perfectly good **within-exercise,
over-time** progress line, which is where Spotter's headline volume and fun
facts already use it. It is only wrong **across muscles**, which is exactly
where the balance uses it.

---

## 4. `REGION_MASS` is a patch on a self-inflicted wound

The reasoning behind it in `stats.ts` is sound *given kilos*: a working set of
squats moves five times what a working set of curls does, so raw kilos say
"legs enormous, arms starving" about every diary ever kept. Dividing by the
muscle each region carries restores an even body to six equal shares.

Two things about it:

- **The values are defensible.** Janssen et al. (2000), whole-body MRI on 468
  adults, is the reference: legs dominate, upper-body muscle is a minority
  share, and the sex difference is *larger* in the upper body (40%) than the
  lower (33%). Segmental DXA work puts trunk lean mass near 52%. Spotter's
  Legs 0.42 / Back 0.20 / Arms 0.12 / Shoulders 0.10 / Chest 0.09 / Core 0.07
  is a reasonable coarse read of that.
- **Nobody in the literature normalises training volume by muscle mass.** The
  targets are absolute sets per muscle per week, unnormalised. The idea that
  bigger muscles need proportionally more volume is explicitly described as
  speculative and unsupported by direct experimental work. RP's per-muscle
  landmarks vary far less than muscle mass does — back MAV 14–22 vs biceps
  10–18, where back carries roughly twice the muscle.

So `REGION_MASS` exists to undo a distortion that **counting sets would never
have introduced**. Switch the currency and the table becomes unnecessary —
which is the cleanest argument for switching.

---

## 5. Body weight, height and age: what each one is legitimately for

This is the direct answer to the question.

### Body weight — already in, and correctly, for one job only

`bodyKg` converts a bodyweight set into a load figure so a diary of pull-ups
and planks isn't worth zero. That is a real job and the app does it right.

Its *other* legitimate use in the field is **allometric scaling of strength**,
not volume: strength scales with roughly bodyweight^0.67 (muscle
cross-sectional area goes as the square of a linear dimension, mass as the
cube; empirical exponents for powerlifting totals sit near 0.65, and drop
toward 0.47 at elite level). Wilks, DOTS and IPF GL points are polynomial and
exponential approximations of that curve. It belongs to a "how strong am I"
read, not to a balance.

**It has no role in attributing volume to a muscle.**

### Height — no role in any of this

Height appears in the literature in two places, neither of them balance:

- **Lean-body-mass prediction** (Boer: `LBM = 0.407·kg + 0.267·cm − 19.2` for
  men) — a way to estimate muscle mass from what a phone can ask. Together,
  weight and height explain about 50% of the variance in skeletal muscle mass
  (Janssen). This would only matter if Spotter kept normalising by muscle
  mass, which §4 argues it should stop doing.
- **Moment arms and range of motion** — a taller lifter moves the bar further
  for the same volume load. Real, unmodelled anywhere, and no app models it.

**Recommendation: leave height out.** It would be a second correction on top
of a correction that shouldn't be there.

### Age — not a balance input; possibly a target input

Age is used in the field in exactly two ways:

- **Strength standards**, where a rough rule is subtracting ~5% of absolute
  1RM per decade after 40 — public tables are calibrated on trained adults
  20–40. Again a "how strong am I" question, not a balance one.
- **Volume tolerance**, weakly. Older adults get meaningful results from
  notably less: 2 sets per exercise, 2–3 sessions a week, effective dose
  ranges of 2–8 sets. Absolute muscle mass doesn't fall much until the end of
  the fifth decade, and the loss is mostly lower body.

So age could legitimately shift a **target band** — 10–20 sets/week for a
28-year-old, lower for a 65-year-old. It cannot legitimately shift a *share*:
a percentage of your own training is a percentage of your own training
whatever your age.

### The field the app doesn't have, and which matters more than any of these

**Sex.** It is the largest single moderator in every table above — muscle
distribution (upper-body difference 40% vs lower-body 33%), strength standards
(entirely separate tables), LBM prediction (different coefficients), allometric
exponents (0.55 vs 0.50 in the general population). Spotter's `Profile` is
`{ name, age, weight, height }`. If any body fact is worth adding it is that
one — and it carries a Play data-safety cost, so it is a decision rather than
an oversight to fix quietly.

> **Decided, 26 Aug 2026: added.** `Profile.sex` is `'male' | 'female'`,
> optional and absent until answered, cleared by pressing the lit chip again —
> two chips and no third, because a *prefer not to say* option would make the
> question louder than unanswered already is. It reaches the coach prompt
> behind `shareProfile` with the other body facts, never crosses to a buddy,
> and unblocks §7E. Adding it moved both privacy policies, both published
> pages and `docs/play-data-safety.md`, whose answer it does not change: the
> field is stored, never collected.

### And the field that would matter most of all

**Effort — RIR or RPE per set.** Proximity to failure is what decides whether
a set counts at all: sets at 0–4 RIR produce comparable hypertrophy across a
wide range of loads, and sets stopped more than ~5 reps short consistently
underperform. Every "hard set" definition in §3 has an RIR clause in it.

Spotter has no effort field, and adding one costs the set row its shape — two
fields and a tick. The honest position is to decline it, count every logged
set as a hard set, and know the balance is measuring *exposure* rather than
*stimulus*. Which is what every app that doesn't collect RIR is doing.

---

## 6. What comparable apps display

| App | Unit | Attribution | Form |
|---|---|---|---|
| **Hevy** | sets **and** volume load per muscle group, 30d / 3m / 1y / all | user labels primary + secondary per exercise | charts, against the previous period |
| **Alpha Progression** | weekly sets per muscle vs an effective range | built-in per-exercise mapping | tracked, and fed back into plan generation |
| **Boostcamp Pro** | per-muscle volume | built-in | body heatmap |
| **Totality** | fractional sets, averaged per week over the window | per-exercise `muscleVolumeDistribution` | weekly fractional sets, beside RIR/RPE/e1RM |
| **Strong** | — | — | no per-muscle volume at all |
| **Spotter** | share of mass-weighted volume load | single group, direct-only | radar + bars, % |

Three conventions worth taking from that table:

1. **Absolute sets per week, not a share.** A percentage can only ever say
   "relatively less". It cannot say *you are under-trained* — Chest at 17% is
   the same number at 4 sets/week and at 20. This is the biggest thing the
   current screen cannot say, and the reason its "weak" verdict is a
   comparison against your own other training rather than against anything.
2. **A window that is a rate.** Divide by weeks in the window so 8w and 12m
   are comparable and both read against the same 10–20 band.
3. **e1RM per lift as the strength read.** Epley (`w × (1 + r/30)`) or Brzycki,
   accurate to about ±5% in the 2–10 rep range and ±15–20% above it. This is
   the standard progressive-overload line, and `keyLifts` currently tracks top
   weight instead — which cannot tell 100×3 from 100×8.

Also, on the display side: **radar charts are widely criticised** for exactly
the failure mode this one has — "the layout hides gaps, the lines hide weight,
the shape hides scale", and they show symmetry where there is none. A bar per
region against a target band is the more honest form; the radar can stay as
the glance if the bars carry the numbers.

### What "balance" means elsewhere

The term is already taken, twice, and neither meaning is volume share:

- **Sports science:** agonist:antagonist *strength* ratios. The conventional
  hamstring:quadriceps ratio with 0.6 as the normality reference; below it
  flags hamstring/ACL injury risk. Measured on a dynamometer, not derivable
  from a diary.
- **Lifting practice:** push:pull **set** ratios — 1:1 as the default, 1:2
  pull-favoured for shoulder health or a desk worker's posture. This *is*
  derivable here, it is one line, and it is arguably a better finding than six
  percentages: "You pressed 24 sets and pulled 11."

### The load-monitoring family, for completeness

Session-RPE × duration (Foster), acute:chronic workload ratio (0.8–1.3 as the
"high-load, low-risk" band), training monotony (weekly mean load ÷ SD), and
strain (load × monotony) — 89% of injuries in Foster's original work were
preceded by strain spikes. All of it is team-sport internal-load monitoring,
all of it needs a session RPE Spotter doesn't collect, and none of it answers
a balance question. Recorded so it can be deliberately declined rather than
rediscovered later.

---

## 7. The proposal

Ordered by correctness bought per unit of disruption caused.

### A. Give an exercise a muscle contribution map — *the one that matters*

*Specced in `design/muscle-contribution-spec.md`, which supersedes the sketch
below: the field is `also` rather than `contrib`, for the reason in §9.1.*

```ts
/** Muscle-group keys to their share of a set. Absent means { [group]: 1 }. */
contrib?: Record<string, number>;
```

Additive optional field on `Exercise`, so no `STORAGE_VERSION` bump. Seed the
~60 seeded exercises with primary 1.0 and secondaries 0.5 — the Pelland
weighting, verbatim. A custom exercise carries none and falls back to
`{ [group]: 1 }`, byte-identical to today's behaviour, so nothing a user made
changes meaning. The editor need not expose it at first.

Everything else on this list is optional. **This one is the feature.**

### B. Count fractional hard sets, not mass-weighted kilos

*Applied, 26 Aug 2026, exactly as written below. `REGION_MASS`,
`HOLD_SECONDS_PER_REP`, `bodyKgOf`, `DEFAULT_BODY_KG`, `workOf` and the options
bag are gone; `regionsOf` arrived with them, taking the maximum within a set.
Two strings had to move with the arithmetic — `promptBalanceUnit` and
`insightsBalanceHint` both still said "% of volume, weighted by muscle size",
which for the coach is a wrong unit handed to a model that will act on it.
§§C–F are still open.*

`RegionStat.sets` becomes the fractional sum and `share` is computed off it.
Then, in one stroke:

- `REGION_MASS` leaves the balance (§4 — it is no longer correcting anything)
- `HOLD_SECONDS_PER_REP` leaves it: a plank set is a set
- `bodyKg` leaves it and goes back to being only what it is for, the
  bodyweight-volume figure — which retires the `opts` bag's whole reason for
  existing on `trainingStats`
- `DEFAULT_BODY_KG` stops silently shaping every share on the screen for the
  majority of phones that never filled the weight field in

The balance stops needing to know anything about the person. That is a
simplification as well as a correction.

### C. Report a rate against a band, and let "weak" mean something

*Applied, 26 Aug 2026, with §8's open question answered the way §9.1's mockup
argued, and the mockup's expandable rows built (`BandBars`, which retired
`BalanceRadar`): the range is stated **per muscle**, so `RegionStat` carries its rate
plus a `low` count and `TrainingStats.weak` became a list of muscles. One rule
had to be invented that the share model never needed — an untrained muscle is
not a weak one, or `Neck` is flagged every week for ever. The coach prompt
sends named muscles and weekly rates now instead of regions and percentages.
§§D–F are still open, and the region-expansion UI from the mockup is not
built: Insights lists the short muscles, but a region row does not yet open.*

`sets / weeks(window)` per region, drawn against 10–20 sets/week. That target
is stated per *muscle*, so a region rolling up two to five of them needs its
own band — the one piece of arithmetic the six-region roll-up makes awkward,
and it needs deciding rather than defaulting.

`weak` becomes *below the band* rather than below 0.75 × even.

The payoff is what the card can then say. Today: "Arms 9% — below even."
After: "Arms 6 sets a week — under the 10–20 range." The second is a finding;
the first is a comparison with your own bench press.

It also makes an *over*-trained region sayable for the first time, which the
share form structurally cannot express.

### D. Keep the six regions, and put a push:pull line under them

*Applied, 26 Aug 2026. `pushPull` on `TrainingStats`, and a card under the
cardio line on Insights. Two things the writing here did not anticipate: rear
delts pull and file under `Shoulders`, which is a known inaccuracy now stated
in `stats.ts` rather than quietly carried; and the ratio needed a null — there
is no ratio to a zero push, where a zero **pull** is `0` and is the finding
itself. It went into the coach prompt as a
separate decision afterwards, carrying its own aim — a bare ratio is a number a
model has to guess the good direction of.*

Six is right for a glance and the argument in `stats.ts` for it still holds.
But the roll-up hides one honest thing: **Arms** merges biceps and triceps,
which pair oppositely, and **Back** swallows the deadlift. A single derived
push:pull set ratio under the bars costs one line and says something the radar
cannot.

### E. Move body weight, height and age where they belong

*Applied, 26 Aug 2026, once `Profile.sex` existed. `data/strength.ts` and a
card on Insights. Two corrections to what is written below: the ⅔ exponent
cannot be applied **against** published standards, because those are quoted as
bodyweight multiples, which are linear — so the multiple is read as an anchor
at a reference weight and scaled from there, which is the same idea arrived at
from the other end. And **height still has no use**, here or anywhere: the
heading of this section promised it a home it does not get. Weight, sex and age
do the work; height remains what §5 said it was.*

Not into the balance — into a **strength** read the app doesn't have: e1RM per
key lift, scaled by bodyweight^0.67, against age-adjusted standards. That is
the card those three fields are actually for, and it is the honest answer to
"can you use my height and age?" — yes, for this; no, for that.

It needs sex to be more than decorative, so it is gated on a decision that
isn't mine to make (§5).

### F. Upgrade `keyLifts` to e1RM

*Applied, 26 Aug 2026. `e1rmOf` is Epley, with a true single returned
unchanged; the best set of a session is now chosen by estimate rather than by
weight, and `KeyLift` gained `e1rm` while `deltaKg` became a delta of estimates.
The coach prompt carries the figure beside the set it came from, labelled — a
bare second number reads as a target. Only the prompt consumes `keyLifts`
today; the Insights key-lift rows from the mockup are not built.*

Epley off the best set of each session. Independent of everything above,
smaller than all of it, and it closes a real blind spot: the current top-weight
reading calls a session that went 100×8 after last week's 100×3 "no change".

---

## 8. What not to build

- **RIR/RPE per set.** Highest-value missing input, wrong cost — the set row is
  two fields and a tick, and that is load-bearing. Decline knowingly and treat
  every logged set as a hard set.
- **sRPE / ACWR / monotony / strain.** Needs a per-session RPE, answers a
  question this app isn't asking, and imports a whole team-sport vocabulary.
- **Height, anywhere.** §5.
- **Age-adjusted *shares*.** Age can move a target, never a percentage.
- **Muscle-mass normalisation of set counts.** The rationale evaporates the
  moment the currency stops being kilos, and the literature never had one.

---

## 9. Three questions put to the first pass

*Calvin, 26 Aug 2026: a per-exercise muscle list with a contribution slider; a
body heatmap as an alternative to the radar; and forcing the profile fields in
onboarding.*

### 9.1 A contribution per muscle — yes, and it must not sum to 100%

*Now specced in full, with the seeded table, in
`design/muscle-contribution-spec.md`.*

The proposal is right and it is what §7A wants. But there is one way to read
it that would break the feature silently, so it goes first.

**Fractional counting is not a division of one set across muscles.** A bench
press does not give Chest 50% + Triceps 25% + Front delts 25%. It gives:

| | |
|---|---|
| Chest | **1.0** — a full chest set |
| Triceps | **0.5** — half a triceps set |
| Front delts | **0.5** — half a delt set |
| | *credited in total: 2.0* |

Because *how many sets did my triceps get this week* is a per-muscle question,
not a share of a pie. Every landmark in §3 — the 10–20 band, MEV, MRV, the
Pelland dose-response — is calibrated on **direct = 1**. A UI that presents
three sliders summing to 100 would credit the bench 0.5 chest sets, and every
muscle in the app would read as roughly half-trained against every published
number. The sliders are independent, and a compound exercise legitimately sums
past 100%.

A preacher curl is Biceps 100% and nothing else, exactly as proposed. A
deadlift is legitimately *several* 100s — glutes, hamstrings and erectors are
all prime movers of it — and that is correct rather than a bug.

#### The control: a seg, not a slider

Store continuous, offer discrete. A three-way `seg` per muscle —
**Primary** (100%) · **Secondary** (50%) · **Minor** (25%) — for three
reasons:

- The evidence supports two levels, not a hundred. Pelland tested 1.0 and 0.5;
  everything between them is extrapolation nobody has validated.
- A slider claims a precision nobody can calibrate to. This is `stats.ts`'s own
  argument about `REGION_MASS` — a table anyone can argue with in the tenths is
  honest, where four decimals claim a measurement nobody took.
- `seg` already exists in `ui.tsx`, so the editor gains no new control and no
  new gesture.

The stored type stays `number`, so a slider is a cheap later change if the seg
turns out to be too blunt. Going the other way — discovering that stored
percentages were never meaningful to the tenth — would not be.

#### The shape

```ts
/** Muscles this also works, and their share of a set. The filing `group` is always 1.0. */
also?: Record<string, number>;
```

Preferred over §7A's `contrib` (a complete map including the primary) for one
reason: `group` is not only the prime mover, it is the library's filing key,
the filter row and what search matches on. A complete map would state the
primary twice and give it somewhere to drift. `also` states it once.

Absent means today's behaviour exactly — `{ [group]: 1 }` — so no
`STORAGE_VERSION` bump, and no custom exercise changes meaning. Values are
capped at 1.0, which is what lets a deadlift name three prime movers.

Keys are into the user's own group list, so a renamed or deleted group strands
its contribution — resolved at read, never swept, exactly as an exercise filed
under a deleted group already is.

#### The rule that will bite: max within a set, sum across sets

```
Back Squat →  Quads 1.0 · Glutes 0.75 · Hamstrings 0.25 · Lower back 0.5
```

All but the last roll up into **Legs**. Summed, one set of squats credits Legs
2.0 sets and the whole region reads double. So a region takes the **maximum**
contribution among its muscles *within a set*, and sets add across the week:
one squat set is one Legs set, while a leg extension set and a leg curl set
are two.

Worth stating that this compromise exists **only because of the six-region
roll-up**. At muscle level there is nothing to reconcile — quads got 1.0 and
glutes got 0.75, both true, no maximum needed. Which is an argument for §9.2
rather than against §7C.

### 9.2 A body heatmap — viable, on licensed art and not on drawn geometry

Viable with almost no new dependency: `react-native-svg` 15.12.1 is already in
`package.json` and is in Expo Go's bundled native set, so nothing degrades. The
artwork is one small MIT package on top — see below, and note that the first
attempt at this got the art wrong in a way worth recording.

It is also the **more correct** display, not merely the prettier one. The radar
is stuck at six axes because twenty is unreadable as a polygon; a body has room
for twenty muscles by construction, so a heatmap shows the data at the
granularity §9.1 stores it at, with no roll-up and no maximum rule. And it
avoids the radar's specific documented failure — the shape hides scale and
implies symmetry where there is none.

Three constraints:

- **The ramp stays sequential.** Pale to full `accent400` for volume. Do not
  encode under/in/over the band as colour: the app's only second hue is `warn`,
  whose meaning is fixed as *the app would not do that*, and an under-trained
  calf is not a refusal. Volume goes on the body; the band verdict goes in the
  bars beside it. Two questions, two surfaces.
- **The body is an art asset with a licence**, and that turned out to be the
  whole difficulty. Recorded in full below.
- **It is a renderer over data that does not exist yet.** With one group per
  exercise it would paint Chest and leave the triceps grey after a bench day —
  today's wrong answer, in a form that looks authoritative. §7A first.

On offering it *beside* the radar: a `seg` over Body / Bars is this app's
grammar and is right. But the radar should be retired rather than kept as a
third, because the heatmap does its job better and three views of one number is
furniture on a screen already carrying a lot.

#### Do not draw the body from geometry. It was tried.

The first cut reasoned from `scripts/make-icons.mjs` — the brand assets are
*generated* from coordinates rather than drawn, so a body should be too, and
that sidesteps the licence question entirely. Twenty rounded rects and ellipses
over a silhouette of the same, front and back.

**It looked like a Lego man**, and Calvin turned it down on sight. The lesson is
worth keeping because the reasoning was plausible and still is: the constraint
that produces a good brand mark produces a bad human. A muscle map reads as a
body or it reads as nothing, and reading as a body takes an illustrator's bezier
work — dozens of curves per muscle — which is not something that can be typed
from a coordinate table.

So there are two options and no third: **licensed art, or no heatmap.**

#### The art exists, and it is MIT

`react-native-body-highlighter` — MIT, © 2022 ELABBASSI Hicham. React Native,
Expo-compatible, `react-native-svg` as its only peer, which this project already
has. Front and back, male and female, ~160 bezier paths over 35 named parts plus
a full body outline. Every colour is a prop (`colors`, `defaultFill`,
`defaultStroke`, `border`), so the figure paints from `useColors()` and rotates
with all six themes; `onBodyPartPress` carries the tap. The downstream React and
SwiftUI ports all credit it as the origin of the artwork and the repo asserts its
own copyright, so the grant covers the paths rather than only the component.

Four things settled with it:

- **Take it as a dependency, do not vendor the paths.** MIT permits the copy, but
  `npm run licenses` regenerates `THIRD-PARTY-NOTICES.md` from the dependency
  tree — so the attribution the licence requires maintains itself, where a
  vendored copy is a hand-written notice that goes stale.
- **Sixteen of seventeen group keys map.** Only `Lats` has no path of its own; it
  and `Back` both paint `upper-back` at the larger of the two, which is the *max
  within a region* rule from §9.1 one scope down. The Bars view still separates
  them, so nothing is lost, only unlocated.
- **Intensity is an index into a colour array, so the ramp is five steps rather
  than continuous.** That is the right limit: a continuous fill would claim a
  precision fractional counting does not have, and the exact figure is one tap
  away.
- **The package ships male and female figures and the app has no sex field.**
  Ship one figure and do not ask (§5) — the heatmap answers "where did my work
  go", an answer that does not change with the outline it is drawn on, and asking
  someone's sex to pick a silhouette would move Play's data-safety answer for no
  feature. If sex ever arrives for the strength card (§7E), this follows for free.

The mockup is `design/body-heatmap-mockup.html`, rebuilt on this art.

### 9.3 Forcing the profile fields in onboarding — no

Three reasons, heaviest first.

- **§7B removes the need.** `bodyKg` leaves the balance; height was never in
  it; age can only shift a target band (§5). Gating first use on three fields
  is paying full price for the one thing they still buy — a bodyweight set
  counting as work.
- **It contradicts why those fields are where they are.** The tour teaches the
  number drag on age, weight and height precisely because they are "figures
  where a wrong answer costs nothing", which is what makes them a safe place to
  learn a gesture every set row depends on. Mandatory fields are not low-stakes,
  and the step loses the property it was built around.
- **Forced fields get garbage.** A required weight collects `70` from everyone
  who would rather not say, and a fake `70` is indistinguishable from a real
  one — where a blank is honest and `bodyKgOf` already falls back knowingly.

There is a concrete cost besides: `docs/play-data-safety.md` records a position
per field, and moving health data from optional to **required** collection is a
worse disclosure with no feature behind it.

Instead, two things the app already does elsewhere:

- **Say what the field buys, at the field.** One line under weight — pull-ups
  and planks count as work once the app knows what you weigh. That is
  `finishLogsNothing`'s shape: a permanent statement of what something does,
  not a tip, and not a thing that retires.
- **Ask again where it pays off.** A diary holding bodyweight sets with no
  weight given earns one line on the Insights card offering it. The same
  reveal-when-relevant habit as the diagnostics rows.

And if the strength card of §7E ever brings **sex** in, that is the field to
force least and to give a stated reason next to hardest.

---

## Sources

Volume, sets and dose-response
- Pelland et al. (2025), *Sports Medicine* — [The Resistance Training Dose Response](https://link.springer.com/article/10.1007/s40279-025-02344-w) · [preprint](https://sportrxiv.org/index.php/server/preprint/view/460) · [summary of the set-counting comparison](https://fitchef.com/studies/training-volume-sets-per-week-study/)
- Schoenfeld, Ogborn & Krieger (2017) — [Dose-response relationship between weekly resistance training volume and increases in muscle mass](https://pubmed.ncbi.nlm.nih.gov/27433992/)
- [RP — Training Volume Landmarks for Muscle Growth](https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth)
- [Stronger By Science — everything you need to know about training volume](https://www.strongerbyscience.com/volume/)
- [How fractional training volume works](https://medium.com/in-fitness-and-in-health/how-fractional-training-volume-works-40c6b9af5b51)

Volume load's limits
- [House of Hypertrophy — Volume Load Does Not Drive Muscle Hypertrophy](https://houseofhypertrophy.com/volume-load/)
- [Bodyrecomposition — What Is Training Volume?](https://bodyrecomposition.com/training/what-is-training-volume)

Effort
- [Robinson et al. (2024) — proximity-to-failure meta-regressions](https://pubmed.ncbi.nlm.nih.gov/38970765/)
- [Proximity to failure: RIR and intensity for hypertrophy](https://nutrient-metrics.com/en/hypertrophy/proximity-to-failure/)

Body composition and scaling
- Janssen et al. (2000) — [Skeletal muscle mass and distribution in 468 men and women aged 18–88 yr](https://journals.physiology.org/doi/full/10.1152/jappl.2000.89.1.81)
- [Regional lean mass by DXA](https://www.nature.com/articles/s41598-021-96874-8)
- [Allometric scaling for strength athletes](https://fitnessrec.com/articles/allometric-scaling-for-strength-athletes-why-size-doesnt-equal-proportional-power) · [Wilks, DOTS and IPF GL explained](https://rpe.training/guides/wilks-dots-ipf-gl-explained/)
- [Boer / James / Hume LBM formulas](https://www.bodyspec.com/blog/post/ultimate_lean_body_mass_calculator_boer_james_hume_peters_formulas)

Standards and age
- [ExRx weightlifting performance standards](https://exrx.net/Testing/WeightLifting/StrengthStandards) · [Strength Level standards](https://strengthlevel.com/strength-standards) · [Barbell Medicine on strength standards](https://www.barbellmedicine.com/blog/strength-standards/)
- [Resistance exercise for sarcopenia: prescription and delivery](https://academic.oup.com/ageing/article/51/2/afac003/6527381) · [Weekly-sets approach in older individuals](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.759677/full)

Balance, as the term is used elsewhere
- [Alternative methods of determining hamstrings-to-quadriceps ratios](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6434009/)
- [Bret Contreras — pushing and pulling ratios](https://bretcontreras.com/topic-of-the-week-4-pushing-and-pulling-ratios/)

Load monitoring
- [Foster's session-RPE method: validity and usefulness](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full)
- [Training monotony and the acute-chronic workload index](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8200417/)

What the apps do
- [Hevy — muscle distribution chart](https://www.hevyapp.com/features/training-chart/) · [muscle group workout chart](https://www.hevyapp.com/features/muscle-group-workout-chart/)
- [Totality — how fractional set tracking works](https://totalityworkoutapp.com/guides/how-totality-tracks-muscle-volume/)
- [Hypertrophy tracker comparison](https://www.hypro.app/blog/best-workout-tracker-apps)
- [1RM formulas — Epley and Brzycki](https://arvo.guru/resources/one-rep-max-formulas)
- [Radar charts: why visual balance often misleads](https://ppcexpo.com/blog/radar-chart)
