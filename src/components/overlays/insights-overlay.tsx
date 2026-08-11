/**
 * Insights — the diary read back to you.
 *
 * Four questions in the order they get asked: what does my training *look*
 * like (the radar), what is it missing (the ranked weak points), is there more
 * of it than there was (volume), and what do I actually keep doing
 * (favourites). Then one number turned into a picture, because a tonne of
 * anything is an abstraction and thirty cars is not.
 *
 * Everything is derived at render by `data/stats.ts` from `history` alone.
 * Changing the period re-reads it; nothing here is stored, and nothing here
 * can change the diary.
 */
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BalanceRadar } from '@/components/balance-radar';
import { FullScreen } from '@/components/sheet';
import type { Strings } from '@/data/i18n';
import {
  EVEN_SHARE,
  favourites,
  funFact,
  groupDigits,
  pct,
  periodOf,
  PERIODS,
  type PeriodKey,
  type Region,
  trainingStats,
  volumeSeries,
} from '@/data/stats';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, t, tracking, wash } from '@/design/tokens';
import { Btn, H2, H6, missingName, Seg, Tag } from '@/design/ui';
import { useStore } from '@/store/workout-store';

/** A region's name. Takes `L` so it cannot be hoisted — see `ui.tsx`. */
const regionLabel = (r: Region, L: Strings): string =>
  ({
    Chest: L.regionChest,
    Back: L.regionBack,
    Shoulders: L.regionShoulders,
    Arms: L.regionArms,
    Core: L.regionCore,
    Legs: L.regionLegs,
  })[r];

const periodLabel = (k: PeriodKey, L: Strings) =>
  ({ '8w': L.period8w, '6m': L.period6m, '12m': L.period12m })[k];

/** What one bar of the volume chart covers, spelled out under its heading. */
const bucketLabel = (days: number, L: Strings) =>
  days <= 7 ? L.bucketWeek : days <= 14 ? L.bucket2Week : L.bucket4Week;

export function InsightsOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, exInfo } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => patch({ statsOpen: false });
  useBackClose(close);

  // Local, not in the store: which window you are looking at is a property of
  // looking, and re-opening the screen should start where the screen starts.
  const [period, setPeriod] = useState<PeriodKey>('8w');
  const p = periodOf(period);

  // Width the charts get: the screen, less the body padding on both sides.
  const [width, setWidth] = useState(0);

  const st = trainingStats(s.history, ex, p.days);
  const fav = favourites(s.history, p.days);
  const series = volumeSeries(s.history, p.days, p.bucketDays);
  const fact = funFact(st.volume, st.distanceKm);
  const peakVol = Math.max(1, ...series.map((b) => b.volume));

  const favEx = fav.exercise ? ex(fav.exercise.id) : undefined;
  const favExName = favEx ? exInfo(favEx) : null;

  return (
    <FullScreen zIndex={77}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.back} labelStyle={styles.backLabel} onPress={close} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width - 32)}
      >
        <H2 size={t.h2} style={styles.tight}>
          {L.insights}
        </H2>
        <Text style={styles.sub}>
          {L.insightsSub.replace('{days}', String(st.days)).replace('{n}', String(st.sessions))}
        </Text>

        <Seg
          style={styles.seg}
          options={PERIODS.map((x) => ({
            key: x.key,
            label: periodLabel(x.key, L),
            on: period === x.key,
            pick: () => setPeriod(x.key),
          }))}
        />

        {st.countedSets === 0 ? (
          // A window with nothing in it says so, once, instead of drawing five
          // charts of zero. Every panel below would otherwise be a flat line
          // presented as a finding.
          <Text style={styles.empty}>{L.insightsEmpty}</Text>
        ) : (
          <>
            {/* The hint reads as a caption *under* the chart rather than
                opposite the heading: the radar's top label is centred and
                lands level with that row, and three things competing for one
                line is what made the first version look broken. */}
            <View style={styles.card}>
              <H6 style={styles.cardTitle}>{L.insightsBalance}</H6>
              {width > 0 && (
                <BalanceRadar
                  balance={st.balance}
                  label={(r) => regionLabel(r, L)}
                  size={width - 28}
                  c={c}
                />
              )}
              <Text style={styles.caption}>{L.insightsBalanceHint}</Text>
            </View>

            {/* The honest version of the chart above: ranked, named, and with
                the number written out. This is what the coach prompt reads. */}
            <H6 style={styles.head}>{L.insightsWeak}</H6>
            {st.weak.length === 0 ? (
              <Text style={styles.note}>{L.insightsWeakNone}</Text>
            ) : (
              <View>
                {st.weak.map((w, i) => (
                  <View
                    key={w.region}
                    style={[styles.weakRow, i < st.weak.length - 1 && styles.ruled]}
                  >
                    <Text style={styles.weakName}>{regionLabel(w.region, L)}</Text>
                    {/* The track runs to twice an even split, so the marker
                        sits at its midpoint: a bar reaching half way is a
                        region getting its share. Nothing here exceeds that —
                        a weak region is under it by definition. */}
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${Math.min(100, (w.share / (EVEN_SHARE * 2)) * 100)}%` },
                        ]}
                      />
                      <View pointerEvents="none" style={styles.evenMark} />
                    </View>
                    <Text style={styles.weakPct}>{pct(w.share)}%</Text>
                    <Tag label={L.insightsLow} tone="outline" />
                  </View>
                ))}
              </View>
            )}

            {/* Cardio is not a muscle and is never balanced against the six —
                but "none at all" is exactly the sort of gap this screen is
                for, so it is stated on its own line. */}
            <View style={[styles.weakRow, styles.cardioRow]}>
              <Text style={styles.weakName}>{L.insightsCardio}</Text>
              <Text style={styles.cardioVal}>
                {st.cardioSessions === 0
                  ? L.insightsCardioNone
                  : L.insightsCardioSome.replace('{n}', String(st.cardioSessions))}
              </Text>
              {st.cardioSessions === 0 && <Tag label={L.insightsLow} tone="outline" />}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <H6 style={styles.cardTitle}>
                  {L.insightsVolume} · {bucketLabel(p.bucketDays, L)}
                </H6>
                <Text style={styles.cardHint}>{L.insightsVolumeHint}</Text>
              </View>
              <View style={styles.bars}>
                {series.map((b, i) => (
                  <View key={i} style={styles.barCell}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(2, (b.volume / peakVol) * VOL_H),
                          // The last bucket is the one you are in — brighter,
                          // because it is the only one you can still change.
                          opacity: i === series.length - 1 ? 1 : 0.45,
                        },
                      ]}
                    />
                  </View>
                ))}
              </View>
              <Text style={styles.barPeak}>
                {L.statsFootVolume.replace('{kg}', groupDigits(st.volume, L.thousandSep))}
              </Text>
            </View>

            <H6 style={styles.head}>{L.insightsFavourites}</H6>
            <View>
              {favExName && (
                <View style={[styles.favRow, styles.ruled]}>
                  <Text style={[styles.favName, favExName.missing && missingName(c)]}>
                    {favExName.text}
                  </Text>
                  <Tag label={L.favExercise} tone="neutral" />
                  <Text style={styles.favCount}>
                    {L.favLogged.replace('{n}', String(fav.exercise!.sessions))}
                  </Text>
                </View>
              )}
              {fav.session && (
                <View style={styles.favRow}>
                  <Text style={styles.favName} numberOfLines={1}>
                    {fav.session.name}
                  </Text>
                  <Tag label={L.favSession} tone="neutral" />
                  <Text style={styles.favCount}>
                    {L.favSessions.replace('{n}', String(fav.session.count))}
                  </Text>
                </View>
              )}
            </View>

            {fact && (
              <View style={styles.factCard}>
                <H6 style={styles.cardTitle}>{L.insightsFact}</H6>
                <Text style={styles.factText}>
                  {(fact.kind === 'volume' ? L.statsFactVolume : L.statsFactDistance)
                    .replace('{kg}', groupDigits(st.volume, L.thousandSep))
                    .replace('{km}', groupDigits(st.distanceKm, L.thousandSep))
                    .replace('{thing}', L[fact.key].replace('{n}', String(fact.n)))}
                </Text>
              </View>
            )}

            {/* What the six percentages left out, said rather than rounded
                away — otherwise a cardio-heavy month reads as a missing one. */}
            {st.looseSets > 0 && (
              <Text style={styles.foot}>
                {L.insightsLoose.replace('{n}', String(st.looseSets))}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </FullScreen>
  );
}

/** Volume bar height in px. */
const VOL_H = 56;

const sheet = themed(() => ({
  header: { paddingHorizontal: 8, paddingBottom: 4 },
  backLabel: { fontSize: 13 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  sub: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500, marginTop: 3 },
  seg: { marginTop: 12 },
  empty: { fontFamily: font.regular, fontSize: 13.5, color: color.neutral500, marginTop: 22 },

  card: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.neutral800,
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  cardTitle: { color: color.neutral500 },
  caption: { fontFamily: font.regular, fontSize: 10, color: color.neutral600, marginTop: 2 },
  cardHint: { flex: 1, textAlign: 'right', fontFamily: font.regular, fontSize: 10, color: color.neutral600 },

  head: { marginTop: 20, marginBottom: 6, color: color.neutral500 },
  note: { fontFamily: font.regular, fontSize: 13, color: color.neutral500 },

  weakRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  ruled: { borderBottomWidth: 1, borderBottomColor: t.rule },
  cardioRow: { borderTopWidth: 1, borderTopColor: t.rule, marginTop: 2 },
  weakName: { width: 88, fontFamily: font.regular, fontSize: 13, color: color.text },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.rule },
  fill: { height: '100%', borderRadius: 4, backgroundColor: color.accent, opacity: 0.5 },
  evenMark: {
    position: 'absolute',
    left: '50%',
    top: -3,
    bottom: -3,
    width: 1,
    backgroundColor: color.neutral500,
  },
  weakPct: {
    width: 34,
    textAlign: 'right',
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral400,
    fontVariant: ['tabular-nums'],
  },
  cardioVal: {
    flex: 1,
    textAlign: 'right',
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral400,
  },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: VOL_H, marginTop: 10 },
  barCell: { flex: 1, justifyContent: 'flex-end' },
  bar: { backgroundColor: color.accent, borderRadius: radius.sm },
  barPeak: { fontFamily: font.regular, fontSize: 10.5, color: wash.text(55), marginTop: 7 },

  favRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  favName: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.text },
  favCount: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },

  factCard: {
    marginTop: 16,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.neutral700,
  },
  factText: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 13 * 1.45,
    color: color.text,
    marginTop: 3,
  },
  foot: { fontFamily: font.regular, fontSize: 11, color: color.neutral600, marginTop: 14 },
}));
