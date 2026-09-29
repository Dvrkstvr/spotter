/**
 * The line that says a pairing could not be made or kept.
 *
 * Not in the design, which has no radio. Every refusal <BuddyRadio> makes used
 * to be a disconnect and a line in a log that is off by default — so the two
 * phones that most needed telling (one holds a secret the other has lost) each
 * showed a screen on which nothing had happened. This is that refusal on the
 * glass: what happened, then the way out, in one sentence (`pairingIssue`).
 *
 * One component, because it is drawn in four places and they must not phrase
 * one fact four ways: the roster, the share sheet, above the tab bar, and the
 * session's buddy slot — the last two being where `buddyLeft` already speaks,
 * for the same reason. A pairing that ended mid-workout is noticed from inside
 * the workout or not at all.
 *
 * It borrows `buddyLeft`'s voice rather than `warn`'s colour. `warn` is *the
 * app would not do that*, said about your own tap; this is news about a
 * connection, and most of it is not even a refusal of yours.
 */
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { mendsByPairing, type PairingIssue } from '@/data/buddy-sync';
import { themed, useThemed } from '@/design/theme';
import { color, font, slop } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

const LINE = {
  stale: 'pairStale',
  knocked: 'pairKnocked',
  hailed: 'pairHailed',
  unconfirmed: 'pairUnconfirmed',
  stalled: 'pairStalled',
  theyOld: 'pairTheyOld',
  weOld: 'pairWeOld',
} as const satisfies Record<PairingIssue, string>;

export function PairingNote({
  style,
  inSharing = false,
}: {
  style?: StyleProp<ViewStyle>;
  /** drawn inside the share sheet — which is where the way out leads */
  inSharing?: boolean;
}) {
  const styles = useThemed(sheet);
  const { s, L, patch } = useStore();

  const issue = s.pairingIssue;
  // Training alone puts the buddy half away, and its news with it.
  if (!issue || s.privateMode) return null;

  // One tap into share mode, where pairing again is the fix — a version gap is
  // not mended by a code, and the sheet cannot lead to itself. The line stays
  // up through the sheet: it is still the instruction, and the other phone has
  // to be told to open sharing too. It goes when a link to them is trusted.
  const mend = mendsByPairing(issue.why) && !inSharing;
  const dismiss = () => patch({ pairingIssue: null });

  return (
    <View style={[styles.note, style]}>
      <Pressable
        style={styles.body}
        onPress={mend ? () => patch({ scanning: true }) : dismiss}
        accessibilityRole="button"
      >
        <Text style={styles.text}>{L[LINE[issue.why]].replace('{name}', issue.name)}</Text>
        {mend && <Text style={styles.mend}>{L.pairAgain}</Text>}
      </Pressable>
      <Pressable
        accessibilityLabel={L.close}
        hitSlop={slop}
        onPress={dismiss}
        style={styles.dismiss}
      >
        <Text style={styles.dismissGlyph}>×</Text>
      </Pressable>
    </View>
  );
}

const sheet = themed(() => ({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  body: { flex: 1 },
  text: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500 },
  mend: { fontFamily: font.regular, fontSize: 11.5, color: color.accent, marginTop: 3 },
  // The roster's × exactly — one reach for every small control.
  dismiss: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  dismissGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
}));
