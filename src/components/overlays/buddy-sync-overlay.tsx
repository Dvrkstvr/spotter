/**
 * Buddy sync — what the two devices would have to exchange to agree.
 *
 * Connects to the paired buddy (mock transport, see buddy-transport.ts),
 * diffs their snapshot against local state, and lists the differences in two
 * directions: things missing here (transferring genuinely imports them, with
 * dependencies) and things missing there (simulated — the demo note says so).
 * Missing translations from the #4 alias model ride along in both lists.
 *
 * The diff is computed once per connect so rows don't vanish as they're
 * transferred — each just flips to its Added/Sent mark.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECK_D, Icon } from '@/components/icon';
import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { BuddySnapshot, connectPeer, scanPeers, sendToPeer } from '@/data/buddy-transport';
import { BuddyDiff, diffBuddy, SyncItem, syncItemId } from '@/data/buddy-sync';
import { Strings } from '@/data/i18n';
import { color, font, t, tracking } from '@/design/tokens';
import { Btn, H2, H6, missingName, Tag } from '@/design/ui';
import { resolveNames, useStore } from '@/store/workout-store';

export function BuddySyncOverlay() {
  const { s, L, patch, importFromPeer } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => patch({ buddySync: false });
  useBackClose(close);

  const [snapshot, setSnapshot] = useState<BuddySnapshot | null>(null);
  const [diff, setDiff] = useState<BuddyDiff | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const buddyName = s.buddy;

  // Connect on open. The mock resolves names to peers; a real transport
  // would reconnect to the already-paired device here.
  useEffect(() => {
    let alive = true;
    setSnapshot(null);
    setDiff(null);
    setDone(new Set());
    const peer = scanPeers().find((p) => p.name === buddyName);
    if (!peer) return;
    connectPeer(peer.id).then((snap) => {
      if (alive) setSnapshot(snap);
    });
    return () => {
      alive = false;
    };
  }, [buddyName]);

  // Diff once, when the snapshot lands. Reads the store at that moment;
  // deliberately not re-diffed on every import so the list stays put.
  useEffect(() => {
    if (!snapshot) return;
    setDiff(
      diffBuddy(
        { groups: s.groups, kinds: s.kinds, custom: s.custom, routines: s.routines },
        snapshot
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const mark = (id: string) => setDone((prev) => new Set(prev).add(id));

  const receive = (item: SyncItem) => {
    if (!snapshot) return;
    importFromPeer(snapshot, item);
    mark(syncItemId(item));
  };

  const send = (item: SyncItem) => {
    if (!snapshot) return;
    const id = syncItemId(item);
    sendToPeer(snapshot.peer.id, item).then(() => mark(id));
  };

  const pending = (list: SyncItem[]) => list.filter((i) => !done.has(syncItemId(i)));

  return (
    <FullScreen zIndex={79}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.back} labelStyle={styles.backLabel} onPress={close} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <H2 size={t.h2} style={styles.tight}>
          {L.buddySync}
        </H2>
        <Text style={styles.demoNote}>{L.syncDemoNote}</Text>

        {!diff || !snapshot ? (
          <Text style={styles.connecting}>
            {L.connectingTo.replace('{name}', buddyName ?? '')}
          </Text>
        ) : (
          <>
            <Section
              title={L.missingHere}
              items={diff.receive}
              done={done}
              doneMark={L.addedMark}
              onTransfer={receive}
              onTransferAll={() => pending(diff.receive).forEach(receive)}
              L={L}
              lang={s.lang}
            />
            <Section
              title={L.missingThere.replace('{name}', snapshot.peer.name)}
              items={diff.send}
              done={done}
              doneMark={L.sentMark}
              onTransfer={send}
              onTransferAll={() => pending(diff.send).forEach(send)}
              L={L}
              lang={s.lang}
            />
            {diff.receive.length === 0 && diff.send.length === 0 && (
              <Text style={styles.inSync}>{L.inSync}</Text>
            )}
          </>
        )}
      </ScrollView>
    </FullScreen>
  );
}

function Section({
  title,
  items,
  done,
  doneMark,
  onTransfer,
  onTransferAll,
  L,
  lang,
}: {
  title: string;
  items: SyncItem[];
  done: Set<string>;
  doneMark: string;
  onTransfer: (item: SyncItem) => void;
  onTransferAll: () => void;
  L: Strings;
  lang: 'en' | 'de';
}) {
  if (items.length === 0) return null;

  const typeLabel: Record<SyncItem['type'], string> = {
    group: L.typeGroup,
    kind: L.typeKind,
    exercise: L.typeExercise,
    routine: L.typeRoutine,
  };

  const anyPending = items.some((i) => !done.has(syncItemId(i)));

  return (
    <View>
      <View style={styles.sectionHead}>
        <H6 style={styles.sectionTitle}>{title}</H6>
        {anyPending && items.length > 1 && (
          <Btn
            variant="ghost"
            label={L.transferAll}
            labelStyle={styles.transferAllLabel}
            onPress={onTransferAll}
          />
        )}
      </View>

      {items.map((item) => {
        const id = syncItemId(item);
        const isDone = done.has(id);
        const name = resolveNames(item.names, lang, item.fallback);
        return (
          <View key={id} style={styles.row}>
            <Tag tone="neutral" label={typeLabel[item.type]} />
            <View style={styles.rowText}>
              <Text style={[styles.rowName, name.missing && missingName]} numberOfLines={1}>
                {name.text}
              </Text>
              {item.kind === 'translation' && (
                <Text style={styles.rowSub} numberOfLines={1}>
                  {`+ ${item.lang.toUpperCase()} · ${item.text}`}
                </Text>
              )}
            </View>
            {isDone ? (
              <View style={styles.doneMark}>
                <Icon d={CHECK_D} size={12} strokeWidth={2.2} color={color.accent400} />
                <Text style={styles.doneMarkText}>{doneMark}</Text>
              </View>
            ) : (
              <Btn
                variant="ghost"
                label={L.transferOne}
                labelStyle={styles.transferLabel}
                onPress={() => onTransfer(item)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 6 },
  backLabel: { fontSize: 13 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  demoNote: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600, marginTop: 6 },
  connecting: { fontFamily: font.regular, fontSize: 13, color: color.neutral500, marginTop: 24 },
  inSync: { fontFamily: font.regular, fontSize: 13, color: color.neutral500, marginTop: 24 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 4 },
  sectionTitle: { flex: 1, color: color.neutral500 },
  transferAllLabel: { fontSize: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  rowText: { flex: 1 },
  rowName: { fontFamily: font.regular, fontSize: 14, color: color.text },
  rowSub: { fontFamily: font.regular, fontSize: 11, color: color.neutral500 },
  transferLabel: { fontSize: 12.5 },
  doneMark: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6 },
  doneMarkText: { fontFamily: font.regular, fontSize: 11.5, color: color.accent400 },
});
