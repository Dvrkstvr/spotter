/** Choose a workout — every routine except today's, plus an empty session. */
import { Pressable, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { radio } from '@/data/buddy-radio';
import { todayDow } from '@/data/date';
import { countN } from '@/data/i18n';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, wash } from '@/design/tokens';
import { Btn, H4, missingName } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function PickWorkoutSheet() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, start, startCoDraft, rInfo, exInfo } = useStore();
  const close = () => patch({ pickWorkout: false });
  useBackClose(close);

  const todayRid = s.schedule[todayDow()];

  const exNames = (items: { ex: string }[]) =>
    items
      .map((i) => {
        const e = ex(i.ex);
        return e ? exInfo(e).text : null;
      })
      .filter(Boolean)
      .join(' · ');

  const options = [
    ...s.routines
      .filter((r) => r.id !== todayRid)
      .map((r) => ({
        key: r.id,
        ...rInfo(r),
        meta: countN(r.items.length, L.exCountOne, L.exCount),
        detail: exNames(r.items),
        go: () => start(r.id),
      })),
    {
      key: '__empty',
      text: L.emptySession,
      missing: false,
      meta: '',
      detail: L.addAsYouGo,
      go: () => start(null),
    },
  ];

  // Building a routine together needs a live link, not just a pairing.
  const canCoBuild = radio !== null && s.buddy !== null && s.buddyEndpoint !== null;

  return (
    <Sheet zIndex={84} maxHeight="78%" onClose={close}>
      <H4>{L.chooseWorkout}</H4>

      <View style={styles.list}>
        {options.map((o) => (
          <Pressable key={o.key} onPress={o.go} style={styles.row}>
            <View style={styles.text}>
              <Text style={[styles.name, o.missing && missingName(c)]}>{o.text}</Text>
              <Text style={styles.detail} numberOfLines={1}>
                {o.detail}
              </Text>
            </View>
            <Text style={styles.meta}>{o.meta}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>

      {canCoBuild && (
        <Pressable onPress={startCoDraft} style={styles.coRow}>
          <View style={styles.coDot} />
          <View style={styles.text}>
            <Text style={styles.coName}>{L.buildTogether}</Text>
            <Text style={styles.coDetail} numberOfLines={1}>
              {L.buildTogetherSub.replace('{name}', s.buddy ?? '')}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

const sheet = themed(() => ({
  list: { marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: wash.text(8),
  },
  text: { flex: 1 },
  name: { fontFamily: font.regular, fontSize: 14.5, color: color.text },
  detail: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  meta: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },
  chevron: { fontFamily: font.regular, fontSize: 15, color: color.accent },
  closeBtn: { marginTop: 16, height: 40 },

  coRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: color.accent800,
    borderRadius: radius.md,
    backgroundColor: wash.accent(10),
  },
  coDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent },
  coName: { fontFamily: font.regular, fontSize: 14.5, color: color.accent400 },
  coDetail: { fontFamily: font.regular, fontSize: 11, color: color.accent600 },
}));
