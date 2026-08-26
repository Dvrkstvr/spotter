/**
 * The balance, as bars read against a range.
 *
 * This replaces the radar, and the reason is the unit rather than the shape. A
 * radar plots six numbers against each other, which is all a *share* could
 * ever be — and a share cannot say **not enough**. These plot sets per week
 * against 10–20, a figure that exists outside this app, on a track that is
 * identical for every row so two rows are also comparable by eye.
 *
 * A region opens to its muscles, because that is the level the range is stated
 * at: Legs at seventeen sets a week can be a trained quad and a starving calf
 * under one contented number. The region row carries its rate and its two
 * counts; the verdict lives one level down. See
 * `design/stats-revamp-mockup.html`.
 *
 * Under the range is two findings and not one, so the track has three fills
 * and a hairline at `BAND.keep` where they part — a muscle merely holding is
 * told from a starving one by the bar and not only by the tag beside it.
 */
import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Strings } from '@/data/i18n';
import { BAND, rate, type MuscleLevel, type Region, type RegionStat } from '@/data/stats';
import { themed, useThemed } from '@/design/theme';
import { color, font, t, wash } from '@/design/tokens';

/**
 * Where the track ends, as a multiple of the top of the range.
 *
 * Room above the band so an over-trained muscle has somewhere to go — a track
 * ending at `BAND.max` would draw *at the range* and *twice it* identically,
 * which is the one thing this chart exists not to do.
 */
const TRACK = BAND.max * 1.2;

const pctOf = (perWeek: number): `${number}%` => `${Math.min(100, (perWeek / TRACK) * 100)}%`;

/**
 * One row's bar. The same geometry at both levels, so the eye reads them
 * together — and the same three fills, so *starving* and *ticking over* are
 * told apart at a glance and not only in the tag beside them.
 *
 * A region takes the sharper of its two counts rather than a level of its own:
 * the band is stated per muscle, and a region cannot be measured against it.
 */
const Bar = memo(function Bar({ perWeek, level }: { perWeek: number; level: MuscleLevel }) {
  const styles = useThemed(sheet);
  return (
    <View style={styles.track}>
      {/* The range, drawn *into* the track rather than beside it: a bar is read
          against a target, not against the other bars. */}
      <View pointerEvents="none" style={styles.band} />
      {/* Where holding ends and starving begins. A hairline rather than a
          second washed block: the range is the thing being aimed at, and a
          track with two filled zones in it reads as two targets. */}
      <View pointerEvents="none" style={styles.keepMark} />
      {level !== 'none' && (
        <View
          style={[
            styles.fill,
            level === 'keep' && styles.fillKeep,
            level === 'low' && styles.fillLow,
            { width: pctOf(perWeek) },
          ]}
        />
      )}
      {perWeek > TRACK && <View pointerEvents="none" style={styles.overCap} />}
    </View>
  );
});

export function BandBars({
  balance,
  regionName,
  muscleName,
  L,
}: {
  balance: RegionStat[];
  /** A region's display name — passed in so this file holds no dictionary. */
  regionName: (r: Region) => string;
  /** A muscle-group key's name. The user's own list, so it comes from the store. */
  muscleName: (group: string) => string;
  L: Strings;
}) {
  const styles = useThemed(sheet);
  // One at a time. Six regions each opening to five muscles is a screen you
  // scroll past rather than read, and the question this answers — "why is that
  // one short?" — is asked about one region at a time anyway.
  const [open, setOpen] = useState<Region | null>(null);

  return (
    <View>
      {balance.map((b) => {
        const isOpen = open === b.region;
        return (
          <View key={b.region}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${regionName(b.region)} — ${L.insightsPerWeek.replace('{n}', rate(b.perWeek))}`}
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setOpen(isOpen ? null : b.region)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={[styles.caret, isOpen && styles.caretOpen]}>{isOpen ? '⌄' : '›'}</Text>
              <Text style={[styles.name, b.low > 0 && styles.nameLow]} numberOfLines={1}>
                {regionName(b.region)}
              </Text>
              <Bar perWeek={b.perWeek} level={b.low > 0 ? 'low' : b.keep > 0 ? 'keep' : 'in'} />
              <Text style={styles.num}>{rate(b.perWeek)}</Text>
              {/* Always a *count*, never a verdict: a region cannot be measured
                  against a figure stated per muscle. The sharper of the two
                  wins, which is `headlineOf`'s fixed order one scope down —
                  a starving calf is the thing to say about Legs whatever else
                  is merely ticking over beside it. */}
              <Text style={styles.flag}>
                {b.low > 0
                  ? L.insightsLowCount.replace('{n}', String(b.low))
                  : b.keep > 0
                    ? L.insightsKeepCount.replace('{n}', String(b.keep))
                    : ''}
              </Text>
            </Pressable>

            {isOpen && (
              <View style={styles.kids}>
                {b.muscles.map((m) => (
                  <View key={m.group} style={styles.row}>
                    <Text style={styles.caret} />
                    {/* Dimmed for `low` alone. A muscle being held is not a
                        weak one, and quietening its name would be the scolding
                        the split exists to stop. */}
                    <Text
                      style={[styles.name, styles.nameSub, m.level === 'low' && styles.nameLow]}
                      numberOfLines={1}
                    >
                      {muscleName(m.group)}
                    </Text>
                    <Bar perWeek={m.perWeek} level={m.level} />
                    {/* A dash, not a zero: untrained and barely trained are
                        different facts, and this is the level that says so. */}
                    <Text style={[styles.num, m.level === 'none' && styles.numOff]}>
                      {m.level === 'none' ? '—' : rate(m.perWeek)}
                    </Text>
                    <Text style={[styles.flag, m.level === 'low' && styles.flagLow]}>
                      {m.level === 'low'
                        ? L.insightsLow
                        : m.level === 'keep'
                          ? L.insightsKeep
                          : m.level === 'over'
                            ? L.insightsOver
                            : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const sheet = themed(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pressed: { opacity: 0.6 },
  caret: { width: 10, fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  caretOpen: { color: color.accent },
  name: { width: 74, fontFamily: font.regular, fontSize: 12.5, color: color.text },
  nameSub: { width: 66, paddingLeft: 8, fontSize: 12, color: color.neutral400 },
  nameLow: { color: color.neutral500 },

  track: { flex: 1, height: 9, borderRadius: 4, backgroundColor: color.neutral900, overflow: 'hidden' },
  band: {
    position: 'absolute',
    left: `${(BAND.min / TRACK) * 100}%`,
    width: `${((BAND.max - BAND.min) / TRACK) * 100}%`,
    top: 0,
    bottom: 0,
    backgroundColor: wash.accent(6),
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: color.neutral700,
  },
  keepMark: {
    position: 'absolute',
    left: `${(BAND.keep / TRACK) * 100}%`,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: color.neutral800,
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: color.accent },
  // Under the range is a quieter fill, never `warn`: a neglected calf is not a
  // refusal, and `warn` means *the app would not do that* at three other sites.
  // Two steps down rather than one, so the ramp spends the same distance the
  // body view's does — holding is nearer the accent than starving is, which is
  // the whole claim the split makes.
  fillKeep: { backgroundColor: color.accent600 },
  fillLow: { backgroundColor: color.accent800 },
  overCap: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 2, backgroundColor: color.accent200 },

  num: {
    width: 30,
    textAlign: 'right',
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral400,
    fontVariant: ['tabular-nums'] as const,
  },
  numOff: { color: color.neutral600 },
  flag: { width: 42, textAlign: 'right', fontFamily: font.regular, fontSize: 10, color: color.neutral500 },
  flagLow: { color: color.accent },

  kids: { borderLeftWidth: 1, borderLeftColor: t.rule, marginLeft: 4, paddingLeft: 6 },
}));
