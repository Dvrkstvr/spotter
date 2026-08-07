# Workout Diary

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any code.

## What this project is

An Android workout logger built from the **Workout Diary v2** design in Claude
Design (project `4c9a34bb-759f-4961-8040-29e00e6aae7a`, file
`Workout Diary v2.dc.html`). The design is the spec. When code and design
disagree, that's a bug in the code unless someone decided otherwise on purpose.

The design system is **Nocturne** — dark-only, Inter, a blurple accent. Its
`styles.css` is ported to `src/design/tokens.ts` (values) and `src/design/ui.tsx`
(the `.btn` / `.input` / `.tag` / `.seg` / `.field` / `.hr` classes).

## Rules that matter here

- **Never hardcode a colour, radius, or spacing.** Everything comes from
  `src/design/tokens.ts`. If a value isn't there, it belongs there.
- **`color-mix()` has no RN equivalent** — use the `wash.*` helpers in tokens,
  which resolve to literal rgba. Don't inline your own.
- **CSS letter-spacing is em, RN's is px.** Always go through `tracking(size, em)`.
- **All state lives in `src/store/workout-store.tsx`**, a direct port of the
  design's `Component` class — same shape, same mutators. Add state there, not in
  a screen.
- **The React Compiler is on** (`experiments.reactCompiler` in `app.json`). That
  means no reading or writing `ref.current` during render. Lazy `useState` for
  `Animated.Value`; update latest-value refs inside an effect.
- **Overlays are siblings of the navigator**, rendered from
  `src/components/overlays/index.tsx` in the design's z-order. That is what lets
  them cover the tab bar. Adding one means adding it there, in the right place.
- **Each overlay owns its own back handling** via `useBackClose`. There is no
  central back router — BackHandler runs listeners newest-first, which is what
  makes the layering work. Don't re-register on every render or it breaks.

## Deliberate deviations from the design

Keep these; they're decisions, not drift. Each is commented at its site.

- `tab` is not in the store — expo-router owns which screen is showing.
- The buddy strip follows connected-buddy state, where the design gates it on a
  canvas prop.
- The scanning dot pulses opacity only; the design loops a keyframe that also
  shifts 8px, which on a 7px dot reads as a glitch.
- `<image-slot>` is filled by the photo picker rather than drag-and-drop.
- The design's `recent` array is computed but never rendered — not ported.
- "Today" is pinned to Friday 7 August 2026 (`TODAY_DOW` / `TODAY_DOM`), because
  the design's seed data is written around that date.

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
