/** Share mode — discover others sharing nearby and pair with a typed code. */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { hasRadio, radio } from '@/data/buddy-radio';
import { diffBuddy, shareableSlice } from '@/data/buddy-sync';
import { connectPeer, scanPeers } from '@/data/buddy-transport';
import { useBackClose } from '@/hooks/use-back-close';
import { color, font, wash } from '@/design/tokens';
import { Btn, H4, Input } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function ScanSheet() {
  const { s, L, patch } = useStore();

  // Which endpoint got our invite — its row reads "Invite sent" until the
  // code stage arrives or the request dies.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // The inviter's typed code attempt, and whether the last one was wrong.
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);

  const pa = s.pendingAuth;

  // Leaving the code stage (paired, cancelled, or failed) resets the local
  // trail so the list is fresh if we come back.
  useEffect(() => {
    if (!pa) {
      setSentTo(null);
      setCode('');
      setWrong(false);
    }
  }, [pa]);

  const cancelAuth = () => {
    if (radio && s.pendingAuth) radio.rejectConnection(s.pendingAuth.endpointId).catch(() => {});
    patch({ pendingAuth: null });
  };
  const close = () => {
    cancelAuth();
    patch({ scanning: false });
  };
  useBackClose(close);

  // Real radio: live Nearby endpoints, discovered by <BuddyRadio> while this
  // sheet is open — anyone else who also has sharing open. Expo Go: the
  // canned mock list.
  const nearby = hasRadio
    ? s.nearbyPeers.map((p) => ({ id: p.endpointId, name: p.name, device: L.nearbyDevice }))
    : scanPeers();

  const invite = (n: { id: string; name: string }) => {
    if (hasRadio && radio) {
      // Just request — the code stage decides the pairing; <BuddyRadio>
      // opens the sync screen once the connection lands.
      const me = s.profile.name.trim() || 'Workout Diary';
      setSentTo(n.id);
      radio.requestConnection(me, n.id).catch(() => setSentTo(null));
      return;
    }
    // Mock pairing connects first — the sync screen only opens if the two
    // sides actually differ, mirroring the real radio.
    patch({ buddy: n.name, scanning: false });
    connectPeer(n.id).then((snap) =>
      patch((st) => {
        const diff = diffBuddy(shareableSlice(st), snap);
        return {
          buddySnapshot: snap,
          buddySync: diff.receive.length > 0 || diff.send.length > 0,
        };
      })
    );
  };

  const tryCode = (v: string) => {
    setWrong(false);
    setCode(v);
    if (!pa || v.length < pa.digits.length) return;
    if (v.trim().toUpperCase() === pa.digits.trim().toUpperCase()) {
      radio?.acceptConnection(pa.endpointId).catch(() => {});
    } else {
      setWrong(true);
      setCode('');
    }
  };

  /* — the code stage: the invitee shows it, the inviter types it — */
  if (pa) {
    return (
      <Sheet zIndex={87} maxHeight="70%" onClose={cancelAuth}>
        <H4>{L.authTitle}</H4>
        <Text style={styles.authName}>{pa.name}</Text>

        {pa.incoming ? (
          <>
            <Text style={styles.authDigits}>{pa.digits}</Text>
            <Text style={styles.authHint}>{L.authShowHint.replace('{name}', pa.name)}</Text>
          </>
        ) : (
          <>
            <Input
              style={styles.authInput}
              value={code}
              onChangeText={tryCode}
              maxLength={pa.digits.length}
              keyboardType={/^\d+$/.test(pa.digits) ? 'number-pad' : 'default'}
              autoFocus
            />
            <Text style={[styles.authHint, wrong && styles.authWrong]}>
              {wrong ? L.authWrong : L.authEnterHint.replace('{name}', pa.name)}
            </Text>
          </>
        )}

        <Btn variant="secondary" block label={L.cancel} style={styles.closeBtn} onPress={cancelAuth} />
      </Sheet>
    );
  }

  return (
    <Sheet zIndex={87} maxHeight="70%" onClose={close}>
      <H4>{L.nearby}</H4>

      <View style={styles.searchingRow}>
        <SearchingDot />
        <Text style={styles.searching}>{L.searching}</Text>
      </View>
      <Text style={styles.shareHint}>{L.shareHint}</Text>

      <View style={styles.list}>
        {nearby.map((n) => {
          const sent = sentTo === n.id;
          return (
            <Pressable key={n.id} disabled={sent} onPress={() => invite(n)} style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.initial}>{n.name[0]}</Text>
              </View>
              <View style={styles.text}>
                <Text style={styles.name}>{n.name}</Text>
                <Text style={styles.device}>{n.device}</Text>
              </View>
              <Text style={[styles.invite, sent && styles.inviteSent]}>
                {sent ? L.inviteSent : L.inviteShort}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

/**
 * The scanning indicator. The design loops its `riseIn` keyframe here, which
 * also shifts 8px — on a 7px dot that reads as a glitch, so only the opacity
 * half of it is kept.
 */
function SearchingDot() {
  const [p] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [p]);

  return <Animated.View style={[styles.dot, { opacity: p }]} />;
}

const styles = StyleSheet.create({
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent },
  searching: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },
  shareHint: { fontFamily: font.regular, fontSize: 11, color: color.neutral600, marginTop: 6 },

  authName: { fontFamily: font.regular, fontSize: 13, color: color.neutral400, marginTop: 10 },
  authDigits: {
    fontFamily: font.heading,
    fontSize: 44,
    letterSpacing: 10,
    color: color.accent,
    textAlign: 'center',
    marginVertical: 18,
    fontVariant: ['tabular-nums'],
  },
  authHint: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500 },
  authWrong: { color: color.accent },
  authInput: {
    marginVertical: 18,
    alignSelf: 'center',
    minWidth: 160,
    textAlign: 'center',
    fontFamily: font.heading,
    fontSize: 30,
    letterSpacing: 8,
    paddingVertical: 8,
  },
  inviteSent: { color: color.neutral500 },

  list: { marginTop: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: wash.text(8),
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: font.regular, fontSize: 12, color: color.neutral400 },
  text: { flex: 1 },
  name: { fontFamily: font.regular, fontSize: 14, color: color.text },
  device: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  invite: { fontFamily: font.regular, fontSize: 11.5, color: color.accent },
  closeBtn: { marginTop: 16, height: 40 },
});
