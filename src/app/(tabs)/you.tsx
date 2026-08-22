/** Profile — who you are, your buddy, and a count of what you've built. */
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { GEAR_D, Icon } from '@/components/icon';
import { ImageSlot } from '@/components/image-slot';
import { Screen } from '@/components/screen';
import { StatsCard, STATS_WINDOW_DAYS } from '@/components/stats-card';
import { hasRadio, radio, sayGoodbye } from '@/data/buddy-radio';
import { encodePeerName } from '@/data/buddy-sync';
import { bodyKgOf, trainingStats } from '@/data/stats';
import { useBuddyLive } from '@/hooks/use-buddy-live';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, slop, t, tracking } from '@/design/tokens';
import { Btn, H2, H6, missingName } from '@/design/ui';
import { myName, useStore } from '@/store/workout-store';

export default function YouScreen() {
  const styles = useThemed(sheet);
  const c = useColors();
  const {
    s,
    L,
    patch,
    allEx,
    loggedThisMonth,
    ex,
    exInfo,
    turnMode,
    toggleTurnMode,
    adoptBuddyEx,
    endPairing,
    forgetBuddy,
    rejoinSession,
    requestSession,
  } = useStore();
  const buddyLive = useBuddyLive();

  // Arriving from a buddy bar (tab bar or session overlay): put the buddy
  // section under the thumb rather than making the user hunt for it. Waits
  // for the layout — on a first visit the section's y isn't known yet.
  const scrollRef = useRef<ScrollView>(null);
  const [buddyY, setBuddyY] = useState(0);
  useEffect(() => {
    if (!s.buddyFocus || buddyY <= 0) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, buddyY - 12), animated: true });
    patch({ buddyFocus: false });
  }, [s.buddyFocus, buddyY, patch]);

  const sayBye = () => sayGoodbye(s.buddyEndpoint);

  // The radio stops looking once a link is up, so while one is, "not nearby"
  // is a claim this phone can't make about anybody else. Say nothing instead.
  const looking = radio !== null && s.buddyEndpoint === null;

  const sub =
    [
      s.profile.age && `${s.profile.age} ${L.yrs}`,
      s.profile.weight && `${s.profile.weight} kg`,
      s.profile.height && `${s.profile.height} cm`,
    ]
      .filter(Boolean)
      .join(' · ') || L.addDetails;

  const measures = [
    { label: L.age, unit: L.yrs, key: 'age', keyboard: 'number-pad' },
    { label: L.bodyWeight, unit: 'kg', key: 'weight', keyboard: 'decimal-pad' },
    { label: L.height, unit: 'cm', key: 'height', keyboard: 'number-pad' },
  ] as const;

  const stats = [
    { k: L.thisMonth, v: loggedThisMonth() },
    { k: L.routines, v: s.routines.length },
    { k: L.exercises, v: allEx().length },
  ];

  // Two reads of the same history: the last eight weeks say what to work on,
  // everything ever logged says how much there has been. Derived at render —
  // `history` is the only input and nothing about this is persisted.
  // `bodyKg` is what a bodyweight set weighs: the balance would read a diary
  // of pull-ups and planks as an empty body without it. Blank profile, blank
  // field and nonsense all fall back inside `bodyKgOf`.
  const bodyKg = bodyKgOf(s.profile.weight);
  const recentStats = trainingStats(s.history, ex, STATS_WINDOW_DAYS, { bodyKg });
  const allTimeStats = trainingStats(s.history, ex, null, { bodyKg });

  return (
    <Screen scrollRef={scrollRef}>
      <View style={styles.head}>
        <H2 size={t.h2} style={styles.tight}>
          {L.you}
        </H2>
        {/* A Btn like its header siblings ("+ New"), not a bare Pressable —
            this was the one tap in the app that answered with nothing. */}
        <Btn
          variant="ghost"
          accessibilityLabel={L.settings}
          onPress={() => patch({ settingsOpen: true })}
          style={styles.gear}
        >
          <Icon d={GEAR_D} color={c.neutral400} size={21} />
        </Btn>
      </View>

      <View style={styles.identity}>
        <ImageSlot id="profile-avatar" shape="circle" placeholder={L.photo} style={styles.avatar} />
        <View style={styles.identityText}>
          <TextField
            value={s.profile.name}
            placeholder={L.yourName}
            onChange={(v) => patch((st) => ({ profile: { ...st.profile, name: v } }))}
          />
          <Text style={styles.identitySub}>{sub}</Text>
        </View>
      </View>

      {/* Directly under the identity, above Buddy: what the diary knows about
          you belongs beside who you are, and ahead of who you train with. */}
      <View style={styles.statsCard}>
        <StatsCard
          recent={recentStats}
          allTime={allTimeStats}
          L={L}
          onPress={() => patch({ statsOpen: true })}
        />
      </View>

      <H6 style={styles.sectionHead}>{L.aboutYou}</H6>
      <View>
        {measures.map((m) => (
          <View key={m.key} style={styles.measureRow}>
            <Text style={styles.measureLabel}>{m.label}</Text>
            <MeasureInput
              value={s.profile[m.key]}
              keyboard={m.keyboard}
              onChange={(v) => patch((st) => ({ profile: { ...st.profile, [m.key]: v } }))}
            />
            <Text style={styles.measureUnit}>{m.unit}</Text>
          </View>
        ))}
      </View>

      {/* Training alone takes the whole buddy half of this screen with it —
          the roster below included. Nothing is forgotten, it is only put
          away: the names come back the moment the switch does. */}
      {!s.privateMode && (
        <>
        <H6
          style={styles.sectionHead}
          onLayout={(e) => setBuddyY(e.nativeEvent.layout.y)}
        >
          {L.buddy}
        </H6>
        {s.buddy ? (
          <View style={styles.buddyCard}>
            <View style={styles.buddyAvatar}>
              <Text style={styles.buddyInitial}>{s.buddy[0]}</Text>
            </View>
            <View style={styles.buddyText}>
              <Text style={styles.buddyName}>{s.buddy}</Text>
              {/* Paired is standing; this line tracks the live link. */}
              <Text style={styles.buddyStatus}>
                {!hasRadio || s.buddyEndpoint ? L.connected : L.linkLost}
              </Text>
            </View>
            <Btn
              variant="ghost"
              label={L.sync}
              labelStyle={styles.syncLabel}
              // Still connected → straight to the sync screen; connection gone
              // → find the buddy nearby again first. Mock connects instantly.
              onPress={() =>
                patch(hasRadio && !s.buddyEndpoint ? { scanning: true } : { buddySync: true })
              }
            />
            <Btn
              variant="ghost"
              label={L.disconnect}
              labelStyle={styles.disconnect}
              onPress={() => {
                sayBye();
                endPairing();
              }}
            />
          </View>
        ) : (
          <View>
            <Text style={styles.buddySub}>{L.buddySub}</Text>
            <Btn
              variant="secondary"
              block
              label={L.invite}
              style={styles.inviteBtn}
              onPress={() => patch({ scanning: true })}
            />
          </View>
        )}

        {/* Everyone this phone is paired with. The radio keeps looking for them
            while the app is open, so a row goes live on its own when they walk
            in — and asking is the way into a workout already running. */}
        {s.knownBuddies.length > 0 && (
          <>
            <H6 style={styles.sectionHead}>{L.pairedBuddies}</H6>
            <View>
              {s.knownBuddies.map((name) => {
                const linked = s.buddy === name && (!hasRadio || s.buddyEndpoint !== null);
                // By recorded install id first: a buddy who renamed
                // themselves still shows as nearby under their roster name
                // until the next snapshot adopts the new one.
                const peer = s.nearbyPeers.find(
                  (p) => p.name === name || (p.id !== null && p.id === s.buddyIds[name])
                );
                // Asking is what opens a link, so there's nothing left to ask
                // once one is up: the request only shows to a buddy in range
                // while this phone is connected to nobody. (That's every row —
                // a link stops discovery, so nobody else is in range either.)
                const canAsk = radio !== null && s.buddyEndpoint === null && !!peer;
                // The way back into a shared workout this phone's app died out
                // of. The gates read as a sentence: the link healed (step 2's
                // ticker), this phone holds a resumed session that is no
                // longer shared, and *their* shared broadcasts are flowing —
                // which is the only way buddyProgress fills while this side is
                // solo, so it doubles as "they are still mid-workout". Shares
                // the action slot with canAsk, which needs the link down.
                const canRejoin =
                  linked &&
                  s.session !== null &&
                  !s.sessionShared &&
                  s.buddyProgress !== null &&
                  !s.buddyProgress.finished;
                return (
                  <View key={name} style={styles.knownRow}>
                    <Text style={styles.knownName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.knownState, linked && { color: c.accent400 }]}>
                      {linked
                        ? L.connected
                        : peer
                          ? L.buddyNearby
                          : looking
                            ? L.buddyAway
                            : ''}
                    </Text>
                    {canAsk && (
                      <Btn
                        variant="ghost"
                        label={L.requestSession}
                        labelStyle={styles.knownAction}
                        // The connection is opened to ask over, never for its own
                        // sake. <BuddyRadio> sends the ask once the link is up.
                        onPress={() => {
                          // A buddy paired before secrets existed has none, and a
                          // bare request can't be proved — there's no code stage
                          // unless both phones are in share mode. Asking anyway
                          // loops the reconnect ticker forever with the ask stuck
                          // 'waiting', so send them through Invite to re-pair (and
                          // mint a secret) instead.
                          if (s.buddySecrets[name] === undefined) {
                            patch({ scanning: true });
                            return;
                          }
                          requestSession(name);
                          if (peer)
                            radio
                              ?.requestConnection(
                                encodePeerName(s.selfId, myName(s)),
                                peer.endpointId
                              )
                              .catch(() => {});
                        }}
                      />
                    )}
                    {canRejoin && (
                      <Btn
                        variant="ghost"
                        label={L.rejoinWorkout}
                        labelStyle={styles.knownAction}
                        onPress={() => rejoinSession()}
                      />
                    )}
                    <Pressable
                      accessibilityLabel={L.forgetBuddy}
                      hitSlop={slop}
                      // Forgetting whoever is on the line is a disconnect, and a
                      // disconnect they aren't told about doesn't hold.
                      onPress={() => {
                        if (s.buddy === name) sayBye();
                        forgetBuddy(name);
                      }}
                      style={styles.forget}
                    >
                      <Text style={styles.forgetGlyph}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {s.joinSent && (
              <Pressable onPress={() => patch({ joinSent: null })}>
                <Text style={styles.askNote}>
                  {(s.joinSent.state === 'waiting' ? L.askSent : L.askDeclined).replace(
                    '{name}',
                    s.joinSent.to
                  )}
                </Text>
              </Pressable>
            )}
          </>
        )}
        </>
      )}

      {/* Full co-session detail — the session overlay's buddy bar stays
          minimal and taps through to here. */}
      {s.session && s.sessionShared && buddyLive && (
        <>
          <H6 style={styles.sectionHead}>{L.liveSession}</H6>
          <View style={styles.liveCard}>
            <View style={styles.liveStatusRow}>
              <Text style={styles.liveStatus} numberOfLines={1}>
                {buddyLive.text}
              </Text>
              {buddyLive.turn && <Text style={styles.liveTurn}>{buddyLive.turn}</Text>}
              {buddyLive.modeEx && (
                <Pressable
                  onPress={() => toggleTurnMode(buddyLive.modeEx!)}
                  style={styles.modeChip}
                >
                  <Text style={styles.modeChipLabel}>
                    {turnMode(buddyLive.modeEx) === 'alternate' ? L.modeAlternate : L.modeParallel}
                  </Text>
                </Pressable>
              )}
              {buddyLive.jump && (
                <Btn
                  variant="ghost"
                  label={L.jumpTo.replace('{ex}', buddyLive.jump.name)}
                  labelStyle={styles.jumpLabel}
                  onPress={() => patch({ active: buddyLive.jump!.index })}
                />
              )}
              {buddyLive.add && (
                <Btn
                  variant="ghost"
                  label={L.addTheirs.replace('{ex}', buddyLive.add.name)}
                  labelStyle={styles.jumpLabel}
                  onPress={() => adoptBuddyEx(buddyLive.add!.ex)}
                />
              )}
            </View>

            <View style={styles.liveHead}>
              <Text style={[styles.liveCol, styles.liveColName]}>{L.exercise}</Text>
              <Text style={[styles.liveCol, styles.liveColN]}>{L.me}</Text>
              <Text style={[styles.liveCol, styles.liveColN]} numberOfLines={1}>
                {s.buddy}
              </Text>
            </View>
            {s.session.list.map((entry, i) => {
              const meta = ex(entry.ex);
              const name = meta ? exInfo(meta) : { text: entry.ex, missing: false };
              const mine = entry.sets.filter((x) => x.done).length;
              const theirs = s.buddyProgress?.list.find((e) => e.ex === entry.ex);
              const theirDone = theirs ? theirs.done.filter(Boolean).length : null;
              const myActive = i === s.active;
              const theirActive = s.buddyProgress?.active === entry.ex;
              return (
                <View key={`${entry.ex}-${i}`} style={styles.liveRow}>
                  <Text
                    style={[
                      styles.liveRowName,
                      myActive && { color: c.accent200 },
                      name.missing && missingName(c),
                    ]}
                    numberOfLines={1}
                  >
                    {name.text}
                  </Text>
                  <Text style={[styles.liveRowN, myActive && { color: c.accent400 }]}>
                    {mine}/{entry.sets.length}
                  </Text>
                  <View style={styles.liveTheirCell}>
                    <Text
                      style={[
                        styles.liveRowN,
                        styles.liveTheirN,
                        theirActive && { color: c.accent400 },
                      ]}
                    >
                      {theirs ? `${theirDone}/${theirs.done.length}` : '—'}
                    </Text>
                    {theirActive && <View style={styles.theirDot} />}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <H6 style={styles.sectionHead}>{L.training}</H6>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.k} style={styles.stat}>
            <Text style={styles.statKey}>{stat.k}</Text>
            <Text style={styles.statValue}>{stat.v}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

/** The name field is an underlined heading, not a boxed .input. */
function TextField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor={c.neutral600}
      cursorColor={c.accent}
      selectionColor={c.accent}
      onChangeText={onChange}
      style={styles.nameInput}
    />
  );
}

function MeasureInput({
  value,
  keyboard,
  onChange,
}: {
  value: string;
  keyboard: 'number-pad' | 'decimal-pad';
  onChange: (v: string) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  return (
    <TextInput
      value={value}
      placeholder="—"
      placeholderTextColor={c.neutral600}
      cursorColor={c.accent}
      selectionColor={c.accent}
      keyboardType={keyboard}
      onChangeText={onChange}
      style={styles.measureInput}
    />
  );
}

const sheet = themed(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  gear: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  avatar: { width: 76, height: 76 },
  identityText: { flex: 1 },
  nameInput: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 5,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    color: color.text,
    fontFamily: font.heading,
    fontSize: 21,
    letterSpacing: tracking(21, -0.02),
  },
  identitySub: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, marginTop: 6 },

  statsCard: { marginTop: 18 },

  sectionHead: { marginTop: 22, marginBottom: 8, color: color.neutral500 },

  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  measureLabel: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  measureInput: {
    width: 74,
    minHeight: 36,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontFamily: font.regular,
    fontSize: 14,
    color: color.text,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
    fontVariant: ['tabular-nums'],
  },
  measureUnit: { width: 26, fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },

  buddyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  buddyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buddyInitial: { fontFamily: font.regular, fontSize: 12, color: color.accent300 },
  buddyText: { flex: 1 },
  buddyName: { fontFamily: font.regular, fontSize: 14, color: color.text },
  buddyStatus: { fontFamily: font.regular, fontSize: 11, color: color.accent400 },
  disconnect: { fontSize: 12 },
  syncLabel: { fontSize: 12 },

  liveCard: {
    borderRadius: radius.md,
    backgroundColor: t.rowBg,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  liveStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveStatus: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.text },
  liveTurn: { fontFamily: font.regular, fontSize: 11.5, color: color.accent400 },
  modeChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.md * 0.75,
    borderWidth: 1,
    borderColor: color.divider,
  },
  modeChipLabel: { fontFamily: font.regular, fontSize: 10, color: color.neutral400 },
  jumpLabel: { fontSize: 11.5 },
  liveHead: { flexDirection: 'row', gap: 8, marginTop: 10, paddingBottom: 4 },
  liveCol: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.07),
    textTransform: 'uppercase',
    color: color.neutral700,
  },
  liveColName: { flex: 1 },
  liveColN: { width: 52, textAlign: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  liveRowName: { flex: 1, fontFamily: font.regular, fontSize: 13, color: color.neutral300 },
  liveRowN: {
    width: 52,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 12,
    color: color.neutral500,
    fontVariant: ['tabular-nums'],
  },
  liveTheirCell: {
    width: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  liveTheirN: { width: undefined },
  theirDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.accent },
  buddySub: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500, marginBottom: 9 },
  inviteBtn: { height: 40, marginTop: 0 },

  knownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  knownName: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  knownState: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  knownAction: { fontSize: 12 },
  forget: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  forgetGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
  askNote: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, marginTop: 9 },

  stats: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  stat: { flex: 1, paddingVertical: 11, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: color.surface },
  statKey: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.08),
    textTransform: 'uppercase',
    color: color.neutral600,
  },
  statValue: {
    fontFamily: font.regular,
    fontSize: 19,
    color: color.text,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
}));
