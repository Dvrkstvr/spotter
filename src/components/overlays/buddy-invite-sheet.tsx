/**
 * "Train together?" — the buddy tapped Start on a shared routine.
 *
 * Accepting upserts the starter's routine (their version wins, which is the
 * sync) and opens the same session as guest; declining just says so. Either
 * way the choice is one tap — this can appear mid-gym-floor.
 */
import { Text, View } from 'react-native';

import { radio } from '@/data/buddy-radio';
import { countN } from '@/data/i18n';
import { useBackClose } from '@/hooks/use-back-close';
import { Sheet } from '@/components/sheet';
import { themed, useThemed } from '@/design/theme';
import { color, font } from '@/design/tokens';
import { Btn, H4 } from '@/design/ui';
import { resolveNames, useStore } from '@/store/workout-store';

export function BuddyInviteSheet() {
  const styles = useThemed(sheet);
  const { s, L, acceptInvite, declineInvite } = useStore();

  const send = (t: 'sessionJoin' | 'sessionDecline') => {
    if (radio && s.buddyEndpoint)
      radio.sendPayload(s.buddyEndpoint, JSON.stringify({ v: 1, t })).catch(() => {});
  };

  const decline = () => {
    send('sessionDecline');
    declineInvite();
  };
  useBackClose(decline);

  const inv = s.buddyInvite;
  if (!inv) return null;

  const routineName = resolveNames(inv.routine.names, s.lang).text;
  const exCount = countN(inv.routine.items.length, L.exCountOne, L.exCount);

  return (
    <Sheet zIndex={89} maxHeight="50%" onClose={decline}>
      <H4>{L.trainTogether}</H4>
      <Text style={styles.body}>
        {L.inviteBody.replace('{name}', s.buddy ?? '').replace('{routine}', routineName)}
      </Text>
      <Text style={styles.meta}>{exCount}</Text>

      <View style={styles.actions}>
        <Btn variant="secondary" label={L.notNow} style={styles.action} onPress={decline} />
        <Btn
          variant="primary"
          label={L.join}
          style={styles.action}
          onPress={() => {
            send('sessionJoin');
            acceptInvite();
          }}
        />
      </View>
    </Sheet>
  );
}

const sheet = themed(() => ({
  body: { fontFamily: font.regular, fontSize: 14, color: color.text, marginTop: 10 },
  meta: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  action: { flex: 1, height: 42 },
}));
