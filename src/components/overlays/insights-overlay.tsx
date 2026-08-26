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
import { Tip } from '@/components/tip';
import type { Strings } from '@/data/i18n';
import {
  BAND,
  favourites,
  funFact,
  groupDigits,
  periodOf,
  PERIODS,
  rate,
  type PeriodKey,
  type Region,
  trainingStats,
  volumeSeries,
} from '@/data/stats';
import { pickTip } from '@/data/tips';
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
  const { s, L, patch, ex, exInfo, gInfo } = useStore();
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

  // The top favourite may have been deleted since — fall back to the first
  // ranked exercise that still resolves rather than dropping the row.
  const favExHit = fav.exercises.map((f) => ({ f, e: ex(f.id) })).find((x) => x.e);
  const favExName = favExHit ? exInfo(favExHit.e!) : null;

  // "Empty" means nothing was logged in the window at all. A cardio-only diary
  // has no counted (region) sets but real work — runs, loose sets, volume — so
  // gating the whole screen on `countedSets` hid its cardio line, distance, fun
  // fact, favourites, volume chart and the recommendations CTA.
  const nothing =
    st.countedSets === 0 && st.looseSets === 0 && st.volume === 0 && st.distanceKm === 0;

  return (
    <FullScreen zIndex={76}>
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

        {/* The second and last card tip. What it teaches is the property that
            makes this whole screen free — it only ever reads — which no chart
            on it can say about itself, and which is the answer to the question
            a statistics screen usually raises: what do I have to keep up to
            date for this to stay true? Nothing. */}
        {pickTip(s.tips, ['stats']) === 'stats' && (
          <Tip card id="stats" title={L.tipStats} sub={L.tipStatsSub} style={styles.statsTip} />
        )}

        <Seg
          style={styles.seg}
          options={PERIODS.map((x) => ({
            key: x.key,
            label: periodLabel(x.key, L),
            on: period === x.key,
            pick: () => setPeriod(x.key),
          }))}
        />

        {nothing ? (
          // A window with nothing in it says so, once, instead of drawing five
          // charts of zero. Every panel below would otherwise be a flat line
          // presented as a finding.
          <Text style={styles.empty}>{L.insightsEmpty}</Text>
        ) : (
          <>
            {/* The balance radar and its weak-point reading only mean something
                once strength sets have rolled into a region — a cardio-only
                window has none, so these step aside while the rest stays. */}
            {st.countedSets > 0 && (
              <>
                {/* The hint reads as a caption *under* the chart rather than
                    opposite the heading: the radar's top label is centred and
                    lands level with that row, and three things competing for
                    one line is what made the first version look broken. */}
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

                {/* The honest version of the chart above, and the one thing
                    on this screen that can say *not enough*: named muscles,
                    furthest short first, each against the same range. The
                    chart above is shares and can only rank; this is a rate
                    measured against a figure from outside this app. It is also
                    what the coach prompt reads. */}
                <H6 style={styles.head}>
                  {L.insightsWeak}
                  <Text style={styles.headAside}>
                    {'  '}
                    {L.insightsBand
                      .replace('{min}', String(BAND.min))
                      .replace('{max}', String(BAND.max))}
                  </Text>
                </H6>
                {st.weak.length === 0 ? (
                  <Text style={styles.note}>{L.insightsWeakNone}</Text>
                ) : (
                  <View>
                    {st.weak.map((w, i) => (
                      <View
                        key={w.group}
                        style={[styles.weakRow, i < st.weak.length - 1 && styles.ruled]}
                      >
                        <Text style={styles.weakName} numberOfLines={1}>
                          {gInfo(w.group).text}
                        </Text>
                        {/* The track runs to the top of the range, so the mark
                            sits where the range opens: a bar reaching it is a
                            muscle getting enough. Nothing here reaches it — a
                            low muscle is under it by definition. */}
                        <View style={styles.track}>
                          <View
                            style={[
                              styles.fill,
                              { width: `${Math.min(100, (w.perWeek / BAND.max) * 100)}%` },
                            ]}
                          />
                          <View pointerEvents="none" style={styles.bandMark} />
                        </View>
                        <Text style={styles.weakPct}>
                          {L.insightsPerWeek.replace('{n}', rate(w.perWeek))}
                        </Text>
                        <Tag
                          label={L.insightsShort.replace('{n}', rate(BAND.min - w.perWeek))}
                          tone="outline"
                        />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Cardio is not a muscle and is never balanced against the six —
                but "none at all" is exactly the sort of gap this screen is
                for, so it is stated on its own line. */}
            <View style={[styles.weakRow, styles.cardioRow]}>
              <Text style={styles.weakName}>{L.insightsCardio}</Text>
              <Text style={styles.cardioVal}>
                {st.cardioSessions === 0
                  ? L.insightsCardioNone
                  : (st.cardioSessions === 1 ? L.statsFootSession : L.statsFootSessions).replace(
                      '{n}',
                      String(st.cardioSessions)
                    )}
              </Text>
              {st.cardioSessions === 0 && <Tag label={L.insightsLow} tone="outline" />}
            </View>

            {/* The one ratio a diary can honestly compute, and it says the
                thing the six regions structurally cannot: Arms merges biceps
                and triceps, which pair oppositely, so a lifter who presses
                constantly and never rows reads as a perfectly healthy Arms.
                Hidden when neither half was trained — a legs-only window has
                no ratio, and a bar of two zeroes is furniture. */}
            {st.pushPull.ratio !== null && (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <H6 style={styles.cardTitle}>{L.insightsPushPull}</H6>
                  <Text style={styles.cardHint}>
                    {L.insightsRatio.replace('{n}', rate(st.pushPull.ratio))}
                  </Text>
                </View>
                <View style={styles.ppBar}>
                  <View
                    style={[
                      styles.ppPush,
                      // Never zero-width on either side: a half that vanishes
                      // reads as a rendering fault rather than as a finding,
                      // and "you never pull" is exactly what this is for.
                      {
                        flexGrow: Math.max(0.04, st.pushPull.push),
                        flexShrink: 1,
                        flexBasis: 0,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.ppPull,
                      { flexGrow: Math.max(0.04, st.pushPull.pull), flexShrink: 1, flexBasis: 0 },
                    ]}
                  />
                </View>
                <View style={styles.ppLegend}>
                  <Text style={styles.ppLabel}>
                    {L.insightsPush} {L.insightsPerWeek.replace('{n}', rate(st.pushPull.pushPerWeek))}
                  </Text>
                  <Text style={[styles.ppLabel, styles.ppLabelEnd]}>
                    {L.insightsPull} {L.insightsPerWeek.replace('{n}', rate(st.pushPull.pullPerWeek))}
                  </Text>
                </View>
              </View>
            )}

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
                    {L.favLogged.replace('{n}', String(favExHit!.f.sessions))}
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

            {/* The whole screen is a description; this is the one thing on it
                that does something about what it describes. */}
            <Btn
              variant="primary"
              block
              label={L.getRecommendations}
              style={styles.cta}
              onPress={() => patch({ coachOpen: true })}
            />
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
  statsTip: { marginTop: 12, marginBottom: 0 },
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
  headAside: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600, letterSpacing: 0 },

  /* Push against pull: one bar in two tones, because the whole reading is the
     proportion between them and two separate bars would have to be compared. */
  ppBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 8 },
  ppPush: { height: '100%', backgroundColor: color.accent },
  ppPull: { height: '100%', backgroundColor: color.accent700 },
  ppLegend: { flexDirection: 'row', marginTop: 5 },
  ppLabel: { flex: 1, fontFamily: font.regular, fontSize: 11, color: color.neutral500 },
  ppLabelEnd: { textAlign: 'right' },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.rule },
  fill: { height: '100%', borderRadius: 4, backgroundColor: color.accent, opacity: 0.5 },
  /* Where the range opens, on a track that runs to where it closes. A muscle
     under the band never reaches it, which is what makes the gap legible. */
  bandMark: {
    position: 'absolute',
    left: `${(10 / 20) * 100}%`,
    top: -3,
    bottom: -3,
    width: 1,
    backgroundColor: color.neutral500,
  },
  weakPct: {
    width: 52,
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
  cta: { marginTop: 18 },
}));
