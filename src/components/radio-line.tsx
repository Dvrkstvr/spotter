/**
 * What is stopping the radio, said where the search would have been.
 *
 * A refused start used to reach the diagnostics log and nothing else, so a
 * phone with Bluetooth off went on drawing a radar and calling its partner
 * "Not nearby" — two claims about a search that was not running. This is the
 * line that replaces them: which precondition is missing, and the way out.
 *
 * It is `finishLogsNothing`'s shape and not a tip's. A tip teaches something
 * invisible three times and retires; this is a statement of what is true, and
 * it stands for exactly as long as it is. So it borrows nothing that already
 * means something else — no dashed outline (*this one is held*), and no
 * `warn`, whose one meaning is *the app would not do that*. Nothing here was
 * refused by the app: a switch is off, and that is a fact about the phone.
 *
 * The way out is an accent link on the end of the sentence, in the grammar of
 * **Free session ›**, and the whole line takes the tap. It opens the place the
 * thing is changed — Android's dialog, or Android's settings — because none
 * of it is this app's to switch.
 */
import { Pressable, type StyleProp, Text, type ViewStyle } from 'react-native';

import { hasRadio, openRadioFix } from '@/data/buddy-radio';
import type { Strings } from '@/data/i18n';
import type { RadioState } from '@/data/radio-state';
import { themed, useThemed } from '@/design/theme';
import { color, font, slop } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

/** The sentence and its way out, per state. `ok` has neither. */
function radioCopy(state: RadioState, L: Strings): { says: string; fix: string } | null {
  switch (state) {
    case 'permission':
      return { says: L.radioPermission, fix: L.radioFixAllow };
    case 'blocked':
      return { says: L.radioBlocked, fix: L.radioFixSettings };
    case 'bluetooth':
      return { says: L.radioBluetooth, fix: L.radioFixBluetooth };
    case 'location':
      return { says: L.radioLocation, fix: L.radioFixLocation };
    case 'refused':
      return { says: L.radioRefused, fix: L.radioFixBluetooth };
    case 'ok':
      return null;
  }
}

/**
 * Whether the radio is known to be stopped. The two screens that draw the
 * line also have something to *stop* saying while it is — "Not nearby", the
 * radar — and they ask here so the three cannot come to disagree.
 */
export const radioDown = (state: RadioState) => hasRadio && state !== 'ok';

export function RadioLine({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useThemed(sheet);
  const { s, L } = useStore();
  const state = s.radioState;
  const copy = radioDown(state) ? radioCopy(state, L) : null;
  if (!copy) return null;
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={slop}
      onPress={() => openRadioFix(state)}
      style={style}
    >
      <Text style={styles.says}>
        {copy.says} <Text style={styles.fix}>{copy.fix}</Text>
      </Text>
    </Pressable>
  );
}

const sheet = themed(() => ({
  says: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 16, color: color.neutral500 },
  fix: { color: color.accent },
}));
