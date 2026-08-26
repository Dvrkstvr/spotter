/**
 * The Statistics & Coach card, on the Profile screen.
 *
 * The way into the statistics view — and, deliberately, a thing worth reading
 * on its own. It says one true sentence about the last eight weeks before you
 * take it (`headlineOf`), draws the same six-region split the view opens on,
 * and closes with the two all-time numbers a diary is actually kept for.
 *
 * It wears the hero gradient, the treatment Today's hero card has to itself —
 * one card per screen gets to be the one that leads somewhere. Tapping it
 * opens Insights, including in the empty state: the screen explains what it
 * will show once there is something to show, which is more use than a card
 * that refuses to be pressed.
 *
 * Everything here is derived at render from `history`; see `data/stats.ts`.
 * Nothing new is persisted.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, t, tracking, wash } from '@/design/tokens';
import { CardKicker } from '@/design/ui';
import type { Strings } from '@/data/i18n';
import {
  MIN_SESSIONS,
  type Region,
  type TrainingStats,
  groupDigits,
  BAND,
  headlineOf,
  rate,
} from '@/data/stats';

/** The window the headline and the bars read. Eight weeks of real training. */
export const STATS_WINDOW_DAYS = 56;

/**
 * A region's name. Takes `L` so it can't be hoisted to whichever language
 * loaded first — the same rule the palette helpers follow in `ui.tsx`.
 */
const regionLabel = (r: Region, L: Strings): string =>
  ({
    Chest: L.regionChest,
    Back: L.regionBack,
    Shoulders: L.regionShoulders,
    Arms: L.regionArms,
    Core: L.regionCore,
    Legs: L.regionLegs,
  })[r];

export function StatsCard({
  /** The last `STATS_WINDOW_DAYS` — the headline and the bars. */
  recent,
  /** Everything ever logged — the footer's two numbers. */
  allTime,
  /**
   * A muscle-group key's name. Injected rather than looked up here: the group
   * list is the user's to rename and lives in the store, and this component is
   * given its numbers rather than fetching them.
   */
  muscleName,
  L,
  onPress,
}: {
  recent: TrainingStats;
  allTime: TrainingStats;
  muscleName: (group: string) => string;
  L: Strings;
  onPress: () => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const head = headlineOf(recent);

  // Too little logged to say anything: a split across two workouts is a
  // Tuesday, not a weakness. The card still stands — it is the door — but it
  // makes no claims and draws no chart.
  const empty = allTime.sessions < MIN_SESSIONS || head === null;

  // A rate against the band, not a share of your own training: "Calves got 2
  // sets a week" is a finding where "Legs 9%" was a comparison with your own
  // bench press.
  const line = empty
    ? L.statsEmpty
    : head.kind === 'low'
      ? // Picked off the *printed* figure rather than the raw one, so the
        // sentence agrees with the number beside it: `rate` rounds, and 1.02
        // sets a week prints as 1.
        (rate(head.perWeek) === '1' ? L.statsHeadWeakOne : L.statsHeadWeak)
          .replace('{muscle}', muscleName(head.group))
          .replace('{n}', rate(head.perWeek))
          .replace('{min}', String(BAND.min))
          .replace('{max}', String(BAND.max))
      : // The middle rung, and the reason the card no longer says *every
        // muscle in range* over six muscles ticking over at seven sets a week.
        // It needs no singular twin: a muscle only reaches it at `BAND.keep` a
        // week or more.
        head.kind === 'keep'
        ? L.statsHeadKeep
            .replace('{muscle}', muscleName(head.group))
            .replace('{n}', rate(head.perWeek))
        : L.statsHeadEven
            .replace('{region}', regionLabel(head.region, L))
            .replace('{n}', rate(head.perWeek));

  // Sets a week, on the same reading as the screen this opens: the line is the
  // *bottom of the range* rather than an even split, so a card of six short
  // bars means "not enough" rather than "evenly not much". The top of the range
  // floors the scale, so a lopsided eight weeks still reads as lopsided and a
  // week where everything is short still draws everything short.
  const peak = Math.max(BAND.max, ...recent.balance.map((b) => b.perWeek));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${L.statsTitle} — ${line}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
    <LinearGradient
      colors={[c.accent900, c.surface]}
      locations={[...t.heroGradient.locations]}
      start={t.heroGradient.start}
      end={t.heroGradient.end}
      style={styles.card}
    >
      <CardKicker>{L.statsTitle}</CardKicker>
      <Text style={[styles.headline, empty && styles.headlineEmpty]}>{line}</Text>

      {!empty && (
        <View
          accessibilityLabel={recent.balance
            .map((b) => `${regionLabel(b.region, L)} ${L.insightsPerWeek.replace('{n}', rate(b.perWeek))}`)
            .join(', ')}
        >
          <View style={styles.bars}>
            {recent.balance.map((b) => (
              <View key={b.region} style={styles.barCell}>
                <View
                  style={[
                    styles.bar,
                    {
                      // Never zero: a region you have not trained at all is the
                      // most interesting bar on the card, and a bar of no height
                      // is one the eye files as absent rather than as empty.
                      height: Math.max(3, (b.perWeek / peak) * BAR_H),
                      // A weak region is drawn quieter rather than redder: the
                      // chart's job is to show the shape, and the sentence above
                      // it has already named the one that matters. Three
                      // weights, because two would either scold a region that
                      // is only ticking over or hide one that is starving.
                      opacity: b.low > 0 ? 0.38 : b.keep > 0 ? 0.66 : 0.95,
                    },
                  ]}
                />
              </View>
            ))}
            {/* The bottom of the range — the line every bar is read against,
                and the only reason a short bar means anything. Drawn last on purpose:
                an absolutely-positioned first child paints above its siblings
                on web and below them on Android, so the layering has to be
                stated rather than left to paint order. On top is also where a
                threshold belongs — it is read across the bars, not behind
                them. */}
            <View
              pointerEvents="none"
              style={[styles.even, { bottom: (BAND.min / peak) * BAR_H }]}
            />
          </View>
          {/* Named, because the sentence above picks one of these out — a
              six-bar shape with no labels is decoration, and you would have no
              way to find the region it just told you about. Dimmed for `low`
              alone: the bar above already says which regions are merely
              holding, and a quiet label there would say it a second time. */}
          <View style={styles.barLabels}>
            {recent.balance.map((b) => (
              <Text
                key={b.region}
                numberOfLines={1}
                style={[styles.barLabel, b.low > 0 && styles.barLabelWeak]}
              >
                {regionLabel(b.region, L)}
              </Text>
            ))}
          </View>
        </View>
      )}

      <View style={styles.footRow}>
        <Text style={styles.foot}>
          {(allTime.sessions === 1
            ? L.statsFootSession
            : L.statsFootSessions.replace('{n}', String(allTime.sessions))) +
            (allTime.volume > 0
              ? `  ·  ${L.statsFootVolume.replace('{kg}', groupDigits(allTime.volume, L.thousandSep))}`
              : '')}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </LinearGradient>
    </Pressable>
  );
}

/** Bar height in px. Named because the even-split line is placed against it. */
const BAR_H = 34;

const sheet = themed(() => ({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.accent800,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  headline: {
    fontFamily: font.heading,
    fontSize: 15,
    lineHeight: 15 * 1.35,
    letterSpacing: tracking(15, -0.01),
    color: color.text,
    marginTop: 6,
  },
  headlineEmpty: { fontFamily: font.regular, fontSize: 13.5, color: color.neutral400 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: BAR_H,
    marginTop: 11,
  },
  barCell: { flex: 1, justifyContent: 'flex-end' },
  bar: { backgroundColor: color.accent, borderRadius: radius.sm },
  barLabels: { flexDirection: 'row', gap: 6, marginTop: 5 },
  barLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 8.5,
    color: color.neutral500,
  },
  barLabelWeak: { color: color.neutral700 },
  even: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.neutral500,
  },
  footRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  foot: { flex: 1, fontFamily: font.regular, fontSize: 11.5, color: wash.text(55) },
  chevron: { fontFamily: font.regular, fontSize: 17, lineHeight: 17, color: color.accent },
  /** Whole-card press feedback, the grammar every Pressable in the app uses. */
  pressed: { opacity: 0.82 },
}));
