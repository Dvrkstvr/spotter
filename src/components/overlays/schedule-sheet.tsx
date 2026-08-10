/**
 * Pick which routine a weekday runs — or rest.
 *
 * Opened from the Plan screen's weekly rows. Not in the original design, which
 * cycled the day through the routines on tap; a real selector is the deliberate
 * replacement, since cycling capped the schedule at the three seed routines.
 */
import { Pressable, Text, View } from 'react-native';

import { CHECK_D, Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, wash } from '@/design/tokens';
import { Btn, H4, missingName } from '@/design/ui';
import { useStore } from '@/store/workout-store';
import { DOW } from '@/data/exercises';

export function ScheduleSheet() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, rInfo, exInfo } = useStore();
  const close = () => patch({ dayPick: null });
  useBackClose(close);

  const day = s.dayPick;
  if (day === null) return null;

  const current = s.schedule[day] ?? null;

  const pick = (rid: string | null) =>
    patch((st) => {
      const schedule = { ...st.schedule };
      if (rid) schedule[day] = rid;
      else delete schedule[day];
      return { schedule, dayPick: null };
    });

  const options = [
    ...s.routines.map((r) => ({
      key: r.id as string | null,
      ...rInfo(r),
      meta: `${r.items.length} ${L.exCount}`,
      detail: r.items
        .map((i) => {
          const e = ex(i.ex);
          return e ? exInfo(e).text : null;
        })
        .filter(Boolean)
        .join(' · '),
    })),
    { key: null, text: L.rest, missing: false, meta: '', detail: L.dayFree },
  ];

  return (
    <Sheet zIndex={83} maxHeight="78%" onClose={close}>
      <H4>{`${DOW[day]} · ${L.chooseRoutine}`}</H4>

      <View style={styles.list}>
        {options.map((o) => {
          const on = o.key === current;
          return (
            <Pressable key={o.key ?? '__rest'} onPress={() => pick(o.key)} style={styles.row}>
              <View style={styles.text}>
                <Text
                  style={[styles.name, on && { color: c.accent }, o.missing && missingName(c)]}
                >
                  {o.text}
                </Text>
                <Text style={styles.detail} numberOfLines={1}>
                  {o.detail}
                </Text>
              </View>
              <Text style={styles.meta}>{o.meta}</Text>
              {on && <Icon d={CHECK_D} size={14} strokeWidth={2.2} color={c.accent} />}
            </Pressable>
          );
        })}
      </View>

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
  closeBtn: { marginTop: 16, height: 40 },
}));
