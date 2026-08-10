/**
 * "{name} would like to train with you" — the answer to a session request.
 *
 * Nothing between two paired phones happens without this: the radio opens a
 * link to carry the request, but neither side is in anything until this sheet
 * is answered, and a no takes the link back down with it.
 *
 * Two shapes, one question. If this phone is mid-routine the ask is really
 * "let me in", and saying yes sends the ordinary session invite — the same
 * join as any other, which their phone accepts without asking again because
 * they're the one who asked. Otherwise it's just "shall we", and yes leaves
 * the two linked for whatever they start next.
 */
import { Text, View } from 'react-native';

import { radio } from '@/data/buddy-radio';
import { routineClosure } from '@/data/buddy-sync';
import { useBackClose } from '@/hooks/use-back-close';
import { Sheet } from '@/components/sheet';
import { themed, useThemed } from '@/design/theme';
import { color, font } from '@/design/tokens';
import { Btn, H4 } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function JoinAskSheet() {
  const styles = useThemed(sheet);
  const { s, L, patch, routine, rInfo, endPairing } = useStore();

  const send = (payload: object) => {
    if (radio && s.buddyEndpoint)
      radio.sendPayload(s.buddyEndpoint, JSON.stringify(payload)).catch(() => {});
  };

  // No is the end of the link as well as of the question — a connection that
  // outlived a refusal is exactly the thing this handshake is here to prevent.
  // The refusal has to reach them before the link goes, though, or their phone
  // reads it as a drop and comes back to ask again.
  const decline = () => {
    const ep = s.buddyEndpoint;
    const sent =
      radio && ep
        ? radio.sendPayload(ep, JSON.stringify({ v: 1, t: 'joinReply', ok: false })).catch(() => {})
        : Promise.resolve();
    sent.then(() => {
      if (radio && ep) radio.disconnectFrom(ep).catch(() => {});
    });
    endPairing();
  };
  useBackClose(decline);

  if (s.joinAsk === null) return null;
  // The name arrives with the snapshot a beat before the ask; either source
  // will do, and the sheet re-renders when the other one lands.
  const who = s.joinAsk || s.buddy || '';
  // Only a routine session can be joined — freeform doesn't travel (v1).
  const r = routine(s.session?.rid);

  // Mid-routine, the invite *is* the yes — sending a joinReply as well would
  // clear their asked-for flag first and win them a second prompt for the
  // thing they just asked for.
  const accept = () => {
    if (r) {
      send({ v: 1, t: 'sessionInvite', invite: { routine: r, ...routineClosure(s, r) } });
      patch({
        joinAsk: null,
        sessionShared: true,
        sessionRole: 'host',
        buddyJoin: 'pending',
      });
    } else {
      send({ v: 1, t: 'joinReply', ok: true });
      patch({ joinAsk: null });
    }
  };

  return (
    <Sheet zIndex={89} maxHeight="50%" onClose={decline}>
      <H4>{r ? L.joinAskTitle : L.trainTogether}</H4>
      <Text style={styles.body}>
        {r
          ? L.joinAskBody.replace('{name}', who).replace('{routine}', rInfo(r).text)
          : L.joinAskIdleBody.replace('{name}', who)}
      </Text>

      <View style={styles.actions}>
        <Btn variant="secondary" label={L.notNow} style={styles.action} onPress={decline} />
        <Btn
          variant="primary"
          label={r ? L.letThemIn : L.letsTrain}
          style={styles.action}
          onPress={accept}
        />
      </View>
    </Sheet>
  );
}

const sheet = themed(() => ({
  body: { fontFamily: font.regular, fontSize: 14, color: color.text, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  action: { flex: 1, height: 42 },
}));
