/**
 * The balance, painted on a body.
 *
 * The second view of the balance card, and the *more granular* of the two: a
 * radar was stuck at six axes because twenty is unreadable as a polygon, where
 * a body has room for seventeen muscles by construction — no roll-up, no
 * maximum rule between regions, and no shape implying a symmetry nobody has.
 *
 * It answers **where did my work go**. Whether it was *enough* is the Bars
 * view's question and stays there, which is why the ramp is sequential and
 * single-hue: one colour climbing from the page, never `warn`, whose meaning
 * is fixed as *the app would not do that* at three other sites. An
 * under-trained calf is not a refusal.
 *
 * The artwork is `react-native-body-highlighter` (MIT, © 2022 ELABBASSI
 * Hicham) over `react-native-svg`, which Expo Go already bundles — so nothing
 * here needs a rebuild. The arithmetic is `data/body-map.ts`; this file owns
 * the drawing and the colours. See `design/body-heatmap-mockup.html`.
 */
import { memo, useRef, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import type { BodyPart, Slug } from 'react-native-body-highlighter';
// The artwork, not the component — see `Figure`. Deep imports into the
// package's own `dist`, which is plain typed data with no `exports` map to
// forbid it, so this is still a dependency rather than a vendored copy and
// `npm run licenses` still carries the attribution.
import { bodyBack } from 'react-native-body-highlighter/dist/assets/bodyBack';
import { bodyFemaleBack } from 'react-native-body-highlighter/dist/assets/bodyFemaleBack';
import { bodyFemaleFront } from 'react-native-body-highlighter/dist/assets/bodyFemaleFront';
import { bodyFront } from 'react-native-body-highlighter/dist/assets/bodyFront';
import Svg, { Path } from 'react-native-svg';

import { bodyPaint, HEAT_STEPS, INERT_SLUGS, type BodyPaint } from '@/data/body-map';
import type { Strings } from '@/data/i18n';
import { BAND, rate, type MuscleStat } from '@/data/stats';
import type { Sex } from '@/data/strength';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, t, type Palette } from '@/design/tokens';
import { missingName, Tag } from '@/design/ui';

/* ── the artwork's own geometry ────────────────────────────────────────────
 *
 * **Cropped to the bodies, which is what makes them big enough to hit.** The
 * package's wrapper draws each figure into a box a good deal larger than the
 * drawing in it — a tenth of the width and a sixth of the height is margin —
 * and at a fixed 200 × 400 with no viewBox of its own. Drawing the paths here
 * put the box in this file's hands, and cropping it spends every pixel of the
 * card on body: the same card width draws a figure about half again as wide,
 * so every muscle's touch target grows with it. That is the mockup's own
 * decision, arrived at for its reason and kept for one more.
 *
 * The boxes are **measured**, not eyeballed: the minimum and maximum of every
 * coordinate each path visits, control points included, since those bound a
 * bezier. That is a conservative superset, so a crop can never clip the
 * drawing. Front and back share one box per gender — a different one each
 * would draw the pair at two different heights — and the shared box is the
 * union of their two, with each side keeping its own centre. If the artwork
 * ever moves, these go stale *visibly*, which is the failure worth having.
 */
const CROP = {
  male: { front: '47 90 634 1259', back: '767 90 634 1259', units: 634, ratio: 1259 / 634 },
  female: { front: '-2 -7 644 1442', back: '821 -7 644 1442', units: 644, ratio: 1442 / 644 },
} as const;

/**
 * Between the two figures. They are one reading rather than two panels, so it
 * is a hair — but not less than this: cropped to the bodies, the box ends at
 * the fingertips, and at six the two figures reach for each other.
 */
const GAP = 14;
/**
 * A ceiling rather than a target: a phone spends the card's whole width, and
 * anything wider gets margin instead of a bigger body. A card is not a poster.
 */
const MAX_FIG_W = 220;
const HAIRLINE_PX = 0.6;
const SELECTED_PX = 1.5;

/**
 * Source rows before the panel stops listing them.
 *
 * Capped rather than scrolled, because the card is the answer to one tap and a
 * fifteen-row card is a screen. What is left over is *said* — a short list has
 * to read as narrowed rather than as all there was.
 */
const MAX_SOURCES = 5;

/**
 * The ramp: the untrained ground, then five steps of accent up from the page.
 *
 * Built here rather than in `data/body-map.ts`, and taken as a parameter
 * rather than read off the module, both for the same reason — the React
 * Compiler hoists a module-level colour read once, and the figure would keep
 * whichever theme happened to be loaded first.
 */
const heatRamp = (c: Palette): string[] => [
  // Nothing logged. The same grey an empty bar track is drawn on, so the two
  // views agree about what the bottom of the scale looks like.
  c.neutral900,
  // The washes start well clear of the card and climb in even strides. A
  // first cut ran 26/46/70 into `accent`, which put three of the five steps
  // within a few percent of the page: the figure read as one flat mid-purple,
  // and the two brightest steps were reached by almost nothing, so a real
  // diary never lit them. Rising to `accent200` spends the whole ramp instead
  // of its bottom third.
  c.wash.accent(38),
  c.wash.accent(60),
  c.wash.accent(82),
  c.accent400,
  c.accent200,
];

/** What one set of an exercise is worth to this muscle, as a pill reads it. */
const shareLabel = (share: number, L: Strings): string =>
  share >= 1
    ? L.bodyPrimary
    : share === 0.5
      ? '½'
      : share === 0.25
        ? '¼'
        : share === 0.75
          ? '¾'
          : `×${Math.round(share * 100) / 100}`;

/* ── the artwork, drawn here rather than by its component ──────────────────
 *
 * The package ships a `<Body>` that draws these same paths, and it was used
 * until the phone said otherwise: **its taps do not survive a finger.** A
 * synthetic tap with no movement selects a muscle; a tap with three pixels of
 * travel, or one held for 400 ms, selects nothing — while an ordinary
 * `Pressable` in the same ScrollView answers both. `<Body>` builds each
 * `<Path>` with a fixed prop list, so there is no way in from outside to fix
 * it, and a muscle map nobody can tap is the whole feature gone.
 *
 * `react-native-svg`'s `Path` takes the full responder API; `<Body>` simply
 * never passes it through. So the paths are imported and drawn here, which
 * also retires two workarounds it needed: every asset part carries a baked
 * `color` that outranked `defaultFill`, and `disabledParts` forces a
 * hardcoded near-white. Nothing here is vendored — the paths still arrive
 * from the package.
 *
 * What is lost is the package's own silhouette outline, which lives inside
 * its wrapper rather than in the asset data. The parts carry the figure on
 * their own strokes instead.
 */
const ART = {
  male: { front: bodyFront, back: bodyBack },
  female: { front: bodyFemaleFront, back: bodyFemaleBack },
} as const;

/**
 * How far a finger may wander and still have meant a tap.
 *
 * The other half of the fix: refusing termination outright would keep the
 * touch for ever and cost the card its scroll, on a view that is mostly
 * figure. So a press is held while the finger is inside this, and handed to
 * the scroller the moment it leaves — which is the same trade `num-drag`
 * makes one screen over, decided the same way.
 */
const TAP_SLOP = 8;

/** One figure, with its side named under it. */
const Figure = memo(function Figure({
  paint,
  side,
  label,
  figW,
  sex,
  selected,
  onPart,
}: {
  paint: BodyPaint[];
  side: 'front' | 'back';
  label: string;
  /** What one figure gets across. Its height follows the crop's own ratio. */
  figW: number;
  sex: Sex | undefined;
  selected: string | null;
  onPart: (slug: Slug) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  // The one place the profile's sex reaches this screen, and it reaches
  // nothing else on it: the reading is identical on either outline.
  // Unanswered draws the male figure rather than asking.
  const g = sex === 'female' ? 'female' : 'male';
  const box = CROP[g];
  // A stroke is in the artwork's units, so a width in px has to be converted —
  // and the conversion moves with the crop, not with a constant.
  const unitsPerPx = box.units / figW;
  const ramp = heatRamp(c);
  const by = new Map(paint.map((p) => [p.slug, p]));
  const inert = new Set<string>(INERT_SLUGS);

  // Written in a handler, never during render — the compiler's rule.
  const from = useRef({ x: 0, y: 0, far: false });
  const grant = (e: GestureResponderEvent) => {
    from.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, far: false };
  };
  const moved = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    if (Math.abs(pageX - from.current.x) > TAP_SLOP || Math.abs(pageY - from.current.y) > TAP_SLOP)
      from.current.far = true;
  };

  return (
    <View style={styles.figure}>
      <Svg viewBox={box[side]} width={figW} height={figW * box.ratio}>
        {ART[g][side].map((part: BodyPart) => {
          const slug = part.slug;
          const hit = slug ? by.get(slug) : undefined;
          const dead = !slug || inert.has(slug);
          // `neutral800` rather than the card's own colour: the head, hands
          // and feet have to *read* as body. At `surface` the head disappears
          // into the card and the figure looks decapitated — a grey plainly
          // off the accent ramp says "not a muscle" without saying "not
          // there".
          const fill = hit ? ramp[hit.step] : c.neutral800;
          // A selection is a *stroke*, never a fill — the fill is carrying a
          // value, and lighting it would overwrite the one thing the figure
          // is drawn to say.
          const on = !!hit && hit.group === selected;
          const d = [...(part.path?.common ?? []), ...(part.path?.left ?? []), ...(part.path?.right ?? [])];
          return d.map((one) => (
            <Path
              key={one}
              d={one}
              fill={fill}
              stroke={on ? c.accent300 : c.wash.scrim(50)}
              strokeWidth={(on ? SELECTED_PX : HAIRLINE_PX) * unitsPerPx}
              onStartShouldSetResponder={() => !dead}
              onResponderGrant={grant}
              onResponderMove={moved}
              // False while it still reads as a tap, so the press survives the
              // wobble every real finger has; true once it is a scroll, so the
              // card can still be scrolled through the figure.
              onResponderTerminationRequest={() => from.current.far}
              onResponderRelease={() => {
                if (!from.current.far && slug) onPart(slug);
              }}
            />
          ));
        })}
      </Svg>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
});

export function BodyHeat({
  muscles,
  muscleName,
  exName,
  sex,
  width,
  L,
}: {
  /** Every muscle in the window — `balance.flatMap((b) => b.muscles)`. */
  muscles: readonly MuscleStat[];
  /** A muscle-group key's name. The user's own list, so it comes from the store. */
  muscleName: (group: string) => string;
  /** An exercise id's name, and whether it is a missing translation. */
  exName: (id: string) => { text: string; missing: boolean };
  /** The profile's, when it has been answered. Never asked for by this screen. */
  sex: Sex | undefined;
  /** What the card gives it, so the two figures can be sized to fit. */
  width: number;
  L: Strings;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  // One muscle at a time, and local: which one you last tapped is a property
  // of looking, like the period seg above it and the settings `Fold`.
  const [sel, setSel] = useState<string | null>(null);

  const paint = bodyPaint(muscles);
  const figW = Math.min(MAX_FIG_W, Math.max(40, (width - GAP) / 2));

  const bySlug = new Map<Slug, BodyPaint>(paint.map((p) => [p.slug, p]));
  const tap = (slug: Slug) => {
    const group = bySlug.get(slug)?.group;
    if (!group) return;
    setSel((cur) => (cur === group ? null : group));
  };

  const stat = sel ? (muscles.find((m) => m.group === sel) ?? null) : null;
  const shown = stat ? stat.sources.slice(0, MAX_SOURCES) : [];
  const rest = stat ? stat.sources.length - shown.length : 0;

  return (
    <View>
      <View style={styles.bodies}>
        <Figure
          paint={paint}
          side="front"
          label={L.bodyFront}
          figW={figW}
          sex={sex}
          selected={sel}
          onPart={tap}
        />
        <Figure
          paint={paint}
          side="back"
          label={L.bodyBack}
          figW={figW}
          sex={sex}
          selected={sel}
          onPart={tap}
        />
      </View>

      {/* The ramp itself, so the figure is readable without a tap. Six cells,
          the untrained ground included — it is a step of the scale, and the
          caption under the card is what says which one. */}
      <View style={styles.legend} pointerEvents="none">
        {heatRamp(c).map((fill, i) => (
          <View
            key={i}
            style={[
              styles.legendCell,
              { backgroundColor: fill },
              i === 0 && styles.legendFirst,
              i === HEAT_STEPS - 1 && styles.legendLast,
            ]}
          />
        ))}
      </View>
      <View style={styles.legendAxis}>
        <Text style={styles.legendLabel}>{L.bodyScaleNone}</Text>
        <Text style={[styles.legendLabel, styles.legendLabelEnd]}>
          {L.bodyScaleMax.replace('{n}', String(BAND.max))}
        </Text>
      </View>

      {stat ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muscleName(stat.group)}
          onPress={() => setSel(null)}
          style={styles.panel}
        >
          <View style={styles.panelHead}>
            <Text style={styles.panelName} numberOfLines={1}>
              {muscleName(stat.group)}
            </Text>
            <Text style={styles.panelRate}>
              {stat.level === 'none' ? '' : L.insightsPerWeek.replace('{n}', rate(stat.perWeek))}
            </Text>
            {/* The same five words the bars use, off the same field — the two
                views are one reading drawn twice, and a tap that disagreed
                with the row behind it would be the one thing this card cannot
                afford. Outlined for the two levels that are findings; holding
                is stated quietly, which is the whole of the distinction. */}
            <Tag
              label={
                stat.level === 'none'
                  ? L.bodyNone
                  : stat.level === 'low'
                    ? L.insightsLow
                    : stat.level === 'keep'
                      ? L.insightsKeep
                      : stat.level === 'over'
                        ? L.insightsOver
                        : L.bodyInRange
              }
              tone={stat.level === 'low' || stat.level === 'over' ? 'outline' : 'quiet'}
            />
          </View>

          {/* Where the sets came from. Half a set off a bench press is the
              least intuitive figure in the app, and this is the only place it
              is ever explained — by the data rather than by a line of copy. */}
          {shown.map((src, i) => {
            const n = exName(src.id);
            return (
              <View key={src.id} style={[styles.srcRow, i < shown.length - 1 && styles.ruled]}>
                <Text style={[styles.srcName, n.missing && missingName(c)]} numberOfLines={1}>
                  {n.text}
                </Text>
                <Tag label={shareLabel(src.share, L)} tone="quiet" />
                <Text style={styles.srcSets}>{rate(src.perWeek)}</Text>
              </View>
            );
          })}
          {rest > 0 && <Text style={styles.srcMore}>{L.bodyMore.replace('{n}', String(rest))}</Text>}
        </Pressable>
      ) : (
        // Permanent, not a tip: it states what a control does rather than
        // teaching a gesture three times and retiring — `finishLogsNothing`'s
        // shape, and the only thing on the card that says the figure is
        // tappable at all.
        <Text style={styles.hint}>{L.bodyTap}</Text>
      )}
    </View>
  );
}

const sheet = themed(() => ({
  bodies: { flexDirection: 'row', justifyContent: 'center', gap: GAP },
  figure: { alignItems: 'center' },
  figureLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: color.neutral600,
    // Plain, now that the box *is* the body: this used to pull up into the
    // artwork's own bottom margin, and against a cropped figure that same
    // negative margin printed the label across the feet.
    marginTop: 3,
  },

  legend: { flexDirection: 'row', marginTop: 6 },
  legendCell: { flex: 1, height: 6 },
  legendFirst: { borderTopLeftRadius: 3, borderBottomLeftRadius: 3 },
  legendLast: { borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  legendAxis: { flexDirection: 'row', marginTop: 3 },
  legendLabel: { flex: 1, fontFamily: font.regular, fontSize: 10, color: color.neutral600 },
  legendLabelEnd: { textAlign: 'right' },

  panel: {
    marginTop: 9,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.accent700,
  },
  panelHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  panelName: { fontFamily: font.heading, fontSize: 14, color: color.text },
  panelRate: { flex: 1, fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },

  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, marginTop: 2 },
  ruled: { borderBottomWidth: 1, borderBottomColor: t.rule },
  srcName: { flexShrink: 1, fontFamily: font.regular, fontSize: 12.5, color: color.text },
  srcSets: {
    marginLeft: 'auto',
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    fontVariant: ['tabular-nums'] as const,
  },
  srcMore: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600, marginTop: 4 },

  // Further off the axis than the panel it stands in for, so it does not read
  // as one paragraph with the card's caption under it: two grey lines at one
  // weight saying two different things.
  hint: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600, marginTop: 13 },
}));
