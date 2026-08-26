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
import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';

import { bodyPaint, HEAT_STEPS, HIDDEN_SLUGS, INERT_SLUGS, type BodyPaint } from '@/data/body-map';
import type { Strings } from '@/data/i18n';
import { BAND, rate, type MuscleStat } from '@/data/stats';
import type { Sex } from '@/data/strength';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, t, type Palette } from '@/design/tokens';
import { missingName, Tag } from '@/design/ui';

/* ── the artwork's own geometry ────────────────────────────────────────────
 *
 * The library draws into a fixed 200 × 400 box and exposes no viewBox, so a
 * figure is sized by `scale` alone. The mockup crops to the drawn bounds, and
 * that is not portable here: the crop is only computable from the package's
 * private viewBox, and the female wrapper uses three different ones. So the
 * figure keeps its own margin and is sized to draw a *body* the width the
 * mockup drew one at, which is the part legibility depends on.
 */
const BOX_W = 200;
/** Between the two figures. They are one reading, not two panels. */
const GAP = 6;
/**
 * The mockup's own figure size, and a ceiling rather than a target: every
 * phone computes at or just under it, and anything wider gets margin instead
 * of a bigger body. A card is not a poster.
 */
const MAX_SCALE = 0.67;
/** Outlines are in the artwork's units, so a width in px has to be converted. */
const UNITS_PER_PX = 724 / BOX_W;
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
  c.wash.accent(26),
  c.wash.accent(46),
  c.wash.accent(70),
  c.accent,
  c.accent400,
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

/** One figure, with its side named under it. */
const Figure = memo(function Figure({
  data,
  side,
  label,
  scale,
  sex,
  onPart,
}: {
  data: ExtendedBodyPart[];
  side: 'front' | 'back';
  label: string;
  scale: number;
  sex: Sex | undefined;
  onPart: (slug: Slug | undefined) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  return (
    <View style={styles.figure}>
      <Body
        data={data}
        side={side}
        scale={scale}
        // The one place the profile's sex reaches this screen, and it reaches
        // nothing else on it: the reading is identical on either outline.
        // Unanswered draws the male figure rather than asking.
        gender={sex === 'female' ? 'female' : 'male'}
        colors={heatRamp(c)}
        // Everything not listed in `data`: the head, the hands, the feet.
        // `disabledParts` is the library's own way to say this and is unusable
        // — it forces a hardcoded near-white fill that no theme can reach.
        defaultFill={c.surface}
        defaultStroke={c.wash.scrim(50)}
        defaultStrokeWidth={HAIRLINE_PX * UNITS_PER_PX}
        border={c.neutral800}
        hiddenParts={[...HIDDEN_SLUGS]}
        onBodyPartPress={(p) => onPart(p.slug)}
      />
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
  const scale = Math.min(MAX_SCALE, Math.max(0.1, (width - GAP) / 2 / BOX_W));

  // A selection is a *stroke*, never a fill — the fill is carrying a value,
  // and lighting it would overwrite the one thing the figure is drawn to say.
  const data: ExtendedBodyPart[] = paint.map((p) => ({
    slug: p.slug,
    // 1-based, and the ground is step 0, so every muscle carries an intensity
    // and `defaultFill` is left to mean *not a muscle* and nothing else.
    intensity: p.step + 1,
    ...(p.group === sel
      ? { styles: { stroke: c.accent300, strokeWidth: SELECTED_PX * UNITS_PER_PX } }
      : null),
  }));

  const bySlug = new Map<Slug, BodyPaint>(paint.map((p) => [p.slug, p]));
  const tap = (slug: Slug | undefined) => {
    if (!slug || INERT_SLUGS.includes(slug)) return;
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
        <Figure data={data} side="front" label={L.bodyFront} scale={scale} sex={sex} onPart={tap} />
        <Figure data={data} side="back" label={L.bodyBack} scale={scale} sex={sex} onPart={tap} />
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
              {stat.trained ? L.insightsPerWeek.replace('{n}', rate(stat.perWeek)) : ''}
            </Text>
            <Tag
              label={
                !stat.trained
                  ? L.bodyNone
                  : stat.low
                    ? L.insightsLow
                    : stat.over
                      ? L.insightsOver
                      : L.bodyInRange
              }
              tone={stat.low || stat.over ? 'outline' : 'quiet'}
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
    // Up into the figure's own bottom margin. The artwork's box is taller than
    // the body drawn in it (see the note at the top), so a caption sitting at
    // the box's foot reads as belonging to the card rather than to the figure.
    marginTop: -10,
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
