# Spotter — `also`: what else a set works

*26 Aug 2026. The spec for §7A / §9.1 of `design/stats-research.md`, which is
the research this rests on and the argument for every number in it. Scope: one
optional field on `Exercise`, one read helper, one roll-up rule, and the seeded
table. Nothing here changes what a set is, what `vol` counts, or how the
library files anything.*

**Status: not applied.** §7 is the plan; this is the first step of it, and it
is deliberately shippable alone — with the seed table in place and nothing else
changed, the balance is already less wrong.

---

## 1. The field

```ts
/**
 * Muscles a set of this *also* works, and what fraction of a set each gets.
 * The filing `group` is always worth 1 and is never named here.
 *
 * Absent means the exercise works exactly what it is filed under, which is
 * what every exercise meant before this existed and what every custom one
 * still means. Values are 0 < n ≤ 1; 0.5 is the evidence's own figure for an
 * indirect set (see the research doc, §2).
 */
also?: Record<string, number>;
```

Keys are muscle-group keys — into the user's own `groups` list, exactly like
`group` itself.

### Why only the secondaries

The first cut was `contrib?: Record<string, number>`, a complete map including
the primary. Rejected: `group` is not only the prime mover, it is the library's
filing key, what the filter row is built from, and what search matches on. A
complete map would state that fact twice and give the two copies somewhere to
drift — an exercise refiled from Chest to Shoulders whose `contrib` still says
Chest.

`also` states it once. The cost is that the primary cannot be weighted below
1.0, which is not a thing anyone needs: an exercise's filing group is by
definition what it trains most.

### Why a set can total more than 1.0

Stated here because it is the one way to read this field that would break it
silently. A bench press is **not** Chest 50% + Triceps 25% + Delts 25%. It is:

```
Chest        1.0   (implicit — the filing group)
also: { Triceps: 0.5, Shoulders: 0.5 }
                     credited in total: 2.0
```

"How many sets did my triceps get this week" is a per-muscle question, not a
share of a pie, and every landmark the answer is read against (10–20 sets/week,
MEV, MRV) is calibrated on **direct = 1**. A map normalised to sum to 1 would
credit the bench half a chest set and report the whole app as half-trained.

So the values are independent, an exercise may legitimately name several 1.0s
(the deadlift does), and nothing anywhere normalises them.

### Ranges, and what the editor offers

Three levels, as a `seg` — never a slider. The stored type is a number so a
slider stays a cheap later change, but the evidence has two levels in it
(Pelland tested 1.0 and 0.5) and a slider claims a precision nobody can
calibrate to. That is `stats.ts`'s own argument about `REGION_MASS`, one file
over.

| Label | Value | Means |
|---|---|---|
| **Primary** | `1` | a set of this is a full set for that muscle too |
| **Secondary** | `0.5` | meaningfully loaded — the literature's "indirect set" |
| **Minor** | `0.25` | stabilises, or is only briefly involved |

**The seeded table below uses only 1 and 0.5.** `0.25` exists for the user's
own judgement, because it is theirs to be wrong about; the seeded figures are
the app making a claim, and the app should only claim what the evidence has a
figure for.

---

## 2. Reading it — `contribOf`

Beside `measureOf` in `exercises.ts`, and the same shape of contract: it takes
the exercise or `undefined`, so a since-deleted exercise resolves to nothing
rather than throwing.

```ts
/**
 * Every muscle a set of this works, filing group included at 1.
 *
 * The one reading of `also`, so nothing downstream re-decides what the primary
 * is worth or whether a stored figure is plausible. A deleted exercise works
 * nothing — its sets fall to `looseSets`, exactly as they do today.
 */
export const contribOf = (e: Exercise | undefined): Record<string, number> => {
  if (!e) return {};
  const out: Record<string, number> = { [e.group]: 1 };
  for (const [g, n] of Object.entries(e.also ?? {})) {
    // The primary is 1 and says so once — a stored self-reference is a stale
    // map from before a refile, and must not be able to weight it down.
    if (g === e.group) continue;
    if (typeof n !== 'number' || !isFinite(n) || n <= 0) continue;
    out[g] = Math.min(1, n);
  }
  return out;
};
```

The clamp is here rather than only in the sanitiser because a blob can arrive
from a backup, a migration or a hand-edit as well as from a buddy, and this is
the one place every one of those is read through.

---

## 3. The roll-up — max within a set, sum across sets

The six regions each swallow two to five groups, so a squat that names Quads,
Glutes and Hamstrings would credit **Legs** 2.5 sets from one set if the
contributions were added. They are not: a region takes the **largest**
contribution among its own muscles *within one set*, and sets add across the
window.

One squat set is one Legs set. A leg extension set and a leg curl set are two.

```ts
/**
 * One set's contributions, rolled up to regions.
 *
 * `Math.max`, not a sum: `regionOf` is many-to-one, and a squat naming three
 * leg muscles is still one set of legs. Adding them is the single mistake this
 * feature can make that draws a plausible, wrong chart.
 */
const regionsOf = (c: Record<string, number>): Partial<Record<Region, number>> => {
  const out: Partial<Record<Region, number>> = {};
  for (const [g, n] of Object.entries(c)) {
    const r = regionOf(g);
    if (r) out[r] = Math.max(out[r] ?? 0, n);
  }
  return out;
};
```

Two consequences worth stating:

- **`looseSets` changes meaning slightly, and correctly.** A set is loose when
  its contributions reach *no* region — a cardio measure, or every named group
  being one the user invented. A set that reaches Chest and also a group with
  no region is not loose; it landed.
- **This compromise is the region view's, not the data's.** At muscle level
  there is nothing to reconcile — quads got 1.0 and glutes got 1.0, both true.
  Which is the argument for the body heatmap in the research doc's §9.2: it
  needs no maximum, because it draws what is stored.

---

## 4. The seeded table

Applied where `DE_NAMES` already is, so `EX` stays one expression and `SEEDS`
stays readable:

```ts
export const EX: Exercise[] = SEEDS.map((e) => {
  const out = DE_NAMES[e.id] ? { ...e, names: { en: e.name, de: DE_NAMES[e.id] } } : e;
  return ALSO[e.id] ? { ...out, also: ALSO[e.id] } : out;
});
```

### The rule the figures follow

A muscle is named at **0.5** if a hard set of this exercise would meaningfully
fatigue it — enough that a week of nothing but this exercise would still train
it. At **1.0** if it is a prime mover in its own right, not a helper. Absent
otherwise. Isolation exercises name nothing, which is what makes them
isolation.

These are judgements, coarse on purpose, and in the same class of claim as
`REGION_MASS`: arguable in the details, and only the structure is load-bearing.
The failure mode being fixed is *bench press credits triceps nothing*, and
every plausible table fixes it.

### Chest

```ts
const ALSO: Record<string, Record<string, number>> = {
  bench:      { Triceps: 0.5, Shoulders: 0.5 },
  incline:    { Shoulders: 0.5, Triceps: 0.5 },
  chestpress: { Triceps: 0.5, Shoulders: 0.5 },
  pushup:     { Triceps: 0.5, Shoulders: 0.5 },
  // pec, fly — isolation. Named nothing, which is the point of them.
```

### Back

```ts
  lat:        { Biceps: 0.5 },
  row:        { Lats: 0.5, Biceps: 0.5 },
  bbrow:      { Lats: 0.5, Biceps: 0.5, LowerBack: 0.5, Forearms: 0.5 },
  pullup:     { Lats: 1, Biceps: 0.5, Forearms: 0.5 },
  invrow:     { Lats: 0.5, Biceps: 0.5, Forearms: 0.5 },
  // sapd — isolation.
```

`pullup` is filed under `Back` and names `Lats` at 1.0: the lat *is* the prime
mover of a pull-up, and both roll into the Back region anyway, so this figure
is only ever read by a muscle-level view. It costs nothing and is true.

### Shoulders

```ts
  rear:       { Traps: 0.5, Back: 0.5 },
  lateral:    { Traps: 0.5 },
  pikepush:   { Triceps: 0.5, Chest: 0.5 },
  handstand:  { Core: 0.5, Triceps: 0.5 },
```

### Arms

```ts
  curl:       { Forearms: 0.5 },
  dip:        { Chest: 1, Shoulders: 0.5 },
  diamond:    { Chest: 1, Shoulders: 0.5 },
  chinup:     { Lats: 1, Forearms: 0.5 },
  deadhang:   { Lats: 0.5 },
  // tri — isolation.
```

`dip` and `diamond` are filed under Triceps and name Chest at 1.0. A dip is a
compound chest press and a diary that files it under arms should still see the
chest work; this is the clearest case in the table of a filing decision and a
training fact being two different things, which is why the field exists.

### Legs

```ts
  squat:      { Glutes: 1, Hamstrings: 0.5, LowerBack: 0.5, Adductors: 0.5 },
  frontsquat: { Glutes: 0.5, Core: 0.5, LowerBack: 0.5 },
  deadlift:   { Glutes: 1, Hamstrings: 1, Traps: 0.5, Forearms: 0.5, Quads: 0.5 },
  rdl:        { Glutes: 1, LowerBack: 0.5, Forearms: 0.5 },
  hipthrust:  { Hamstrings: 0.5 },
  legpress:   { Glutes: 0.5, Adductors: 0.5 },
  lunge:      { Glutes: 1, Hamstrings: 0.5, Adductors: 0.5 },
  airsquat:   { Glutes: 0.5 },
  splitsq:    { Glutes: 1, Adductors: 0.5, Hamstrings: 0.5 },
  nordic:     { Glutes: 0.5, Calves: 0.5 },
  bridge:     { Hamstrings: 0.5 },
  // legext, legcurl, hipadd, calfmach, calfbw, wallsit — isolation.
```

`deadlift` is the row this whole feature is for. It is filed under `LowerBack`,
which rolls into **Back**, so today the heaviest lift in most diaries credits
the back in full and the posterior chain nothing. Three prime movers named at
1.0 is not generosity — it is what a deadlift is.

### Core

```ts
  kneeraise:  { Obliques: 0.5, Forearms: 0.5, Lats: 0.5 },
  plank:      { Obliques: 0.5, Shoulders: 0.5 },
  sideplank:  { Core: 0.5, Shoulders: 0.5 },
  hollow:     { Obliques: 0.5 },
  lsit:       { Obliques: 0.5, Triceps: 0.5, Shoulders: 0.5 },
};
```

### Cardio

**All nine name nothing, and must keep naming nothing.** They are excluded from
the balance by measure before `also` is ever read, so a figure here would be
dead — and dead figures are how a later refactor accidentally files a Run under
Quads. Stated so it reads as a decision rather than an omission.

### Count

35 of 53 seeded exercises carry an entry. The 18 that don't are the isolation
movements and the cardio, which is the right shape: if most of the library
needed a table, the library would be filed wrong.

---

## 5. The seams

Six places touch `Exercise` field by field. Four need changing.

### `cleanExercise` — buddy-sync.ts:660 · **must change**

The sanitiser rebuilds an incoming exercise field by field and drops what it
doesn't know, so `also` needs naming explicitly — the same fact
`cleanRoutineItem` had to learn about `with`.

```ts
const also: Record<string, number> = {};
for (const [g, n] of Object.entries(isObj(v.also) ? v.also : {}))
  if (typeof n === 'number' && isFinite(n) && n > 0 && Object.keys(also).length < CAP.items)
    also[capStr(g)] = Math.min(1, n);
if (Object.keys(also).length) ex.also = also;
```

A **protocol addition, not a change**: an older build sends an exercise with no
`also`, which arrives meaning exactly what it means today. Neither phone
strictly needs rebuilding for this one — unlike `with`, nothing about a session
depends on it.

### `closureFor` — buddy-sync.ts:372 · **must change**

It collects the groups and kinds a shared custom exercise depends on, so the
receiving phone can name the row. With `also` an exercise depends on *more*
groups than its own:

```ts
groups: s.groups.filter((g) =>
  custom.some((e) => e.group === g.key || e.also?.[g.key] !== undefined)),
```

Without this a buddy's custom exercise arrives with contributions pointing at
group keys this phone has never heard of, and they file nowhere — silently,
and only in the statistics, which is the worst place to find out.

### `exEdits` — workout-store.tsx:295 · **must change**

Gains `also?: Record<string, number>`, so a seeded exercise can be re-weighted
the way it can already be renamed and refiled, and `resetEx` puts it back.

`editEx`'s `merged` spreads `...d`, so `also` **replaces wholesale** rather than
merging key by key — which is right and is the opposite of what `names` does
there. A contribution map is edited as a whole (removing a muscle has to be
expressible), where a `LangMap` is filled one language at a time.

### The exercise editor · **new UI**

A muscle picker plus the three-way `seg` per picked muscle. Two decisions:

- **The new-exercise sheet does not offer it.** Creating an exercise you then
  have to weight is friction at the worst moment, and `{ [group]: 1 }` is an
  honest default. It is an editor field, like machine setup.
- **The primary is drawn, not editable, at the top of the list** — labelled with
  the filing group and fixed at Primary. Leaving it out entirely reads as an
  omission; showing it is what makes the totals-past-100% arrangement legible.

### `parsePlan` / `resolvePlan` — coach.ts · **deliberately unchanged**

The AI is not given `also` and cannot write it. The contract's rule is that
import is additive and builds on what is here — and a muscle contribution is
not a plan, it is the app's own analysis of an exercise. An imported exercise
is written with the same literal the new-exercise sheet writes, `also` absent
along with `load`, and stays indistinguishable from a hand-made one.

### `PERSIST` / `STORAGE_VERSION` · **unchanged**

`custom` and `exEdits` are already persisted keys and this is an additive
optional field inside both. **No version bump, no migration.** It rides in a
backup inside `custom`; `mergePersisted`'s library part already moves custom
exercises whole, so nothing there changes either.

---

## 6. Tests

`contribOf` and the roll-up are pure, live in `data/`, and belong in the suite
under the same argument that put `migrateBlob`'s ordering there: the two rules
most worth defending are ones a refactor loses **silently**, with a plausible
chart on the other side.

- `contribOf` returns `{ [group]: 1 }` for an exercise with no `also`, so
  nothing that predates the field changes meaning.
- A stored `also` naming the primary does not weight it below 1.
- Values out of range are clamped, and `0` / negative / non-finite are dropped.
- **A squat set credits Legs 1, not 2.5** — the maximum rule, named as such.
- A leg extension set and a leg curl set credit Legs 2 — the sum rule, so the
  maximum can't be "fixed" into a global one.
- A set whose groups all lack a region is loose; a set that reaches one region
  and one region-less group is not.

Verify by mutation, as the existing suites were: swapping `Math.max` for `+`
must fail, and so must dropping the `g === e.group` guard.

---

## 7. What this does not touch

- **`vol` and `totals()`.** Volume load stays exactly what it is and keeps
  being the headline figure and the fun facts' input. This field is read by the
  balance only.
- **Filing.** `group` is unchanged everywhere — library, filter row, search,
  `routineFamily`, `styleOf`, the coach's group keys.
- **Routines, sessions, `history`, `lastLog`, `lastMarks`.** Nothing logged
  changes shape, and the balance re-derives from stored set strings as it
  already does, so the table applies retroactively to every session on the
  phone. That is the whole reason to do this one first.
- **The buddy's `progress`.** No new wire field; `deps` carries `also`'s groups
  by way of `closureFor` and nothing else moves.

---

## 8. Still to decide

Three, none blocking the field itself:

- **The per-region target band.** §7C wants sets/week against 10–20, but that
  figure is per *muscle* and a region rolls up two to five of them. Either the
  bands become per-region numbers someone authors, or the band lives on the
  muscle-level view and the region bars carry shares only. §9.2 leans toward
  the second.
- **Whether the deadlift stays filed under `LowerBack`.** `also` makes this
  much less urgent — the posterior chain now gets credited either way — but the
  filing still decides which region the *library* files it under, and Back is
  an odd answer. Separate decision, and cheaper after this than before it.
- **Whether v1 ships the editor at all.** The seed table alone fixes the
  headline error for every phone; the picker can follow. Shipping the data
  first is also how the figures get read against a real diary before anyone can
  argue with them.
