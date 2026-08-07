/** Exercise sheet — machine settings you can edit, last session, and where it's used. */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { color, font, wash } from '@/design/tokens';
import { Btn, H4, H6, Input, Tag } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function ExerciseSheet() {
  const { s, L, patch, ex, gLabel, kLabel, setup, mutSetup } = useStore();
  const close = () => patch({ exOpen: null });
  useBackClose(close);

  const e = ex(s.exOpen!);
  if (!e) return null;

  const rows = setup(e.id);
  const usedIn = s.routines.filter((r) => r.items.some((i) => i.ex === e.id)).map((r) => r.name);

  return (
    <Sheet zIndex={70} maxHeight="80%" scrimOpacity={62} onClose={close}>
      <H4>{e.name}</H4>

      <View style={styles.tagRow}>
        <Tag tone="neutral" label={gLabel(e.group)} />
        <Tag tone="outline" label={kLabel(e.kind)} />
        <View style={styles.spacer} />
        <Btn
          variant="secondary"
          label={L.howTo}
          labelStyle={styles.smallLabel}
          style={styles.smallBtn}
          onPress={() => patch({ instrOpen: e.id })}
        />
      </View>

      <H6 style={styles.head}>{L.machineSetup}</H6>
      <View style={{ gap: 5 }}>
        {rows.map((pair, i) => (
          <View key={i} style={styles.setupRow}>
            <Input
              style={styles.setupKey}
              placeholder={L.seatBarHeight}
              value={pair[0]}
              onChangeText={(v) => mutSetup(e.id, (a) => { a[i][0] = v; })}
            />
            <Input
              style={styles.setupValue}
              placeholder="—"
              value={pair[1]}
              onChangeText={(v) => mutSetup(e.id, (a) => { a[i][1] = v; })}
            />
            <Pressable
              accessibilityLabel="Remove setting"
              onPress={() => mutSetup(e.id, (a) => { a.splice(i, 1); })}
              style={styles.del}
            >
              <Text style={styles.delGlyph}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Btn
        variant="ghost"
        label={L.addSetting}
        labelStyle={styles.ghostLabel}
        style={styles.addBtn}
        onPress={() => mutSetup(e.id, (a) => { a.push(['Setting', '']); })}
      />

      <H6 style={styles.head}>{L.lastSession}</H6>
      <View style={{ gap: 4 }}>
        {e.lastSets.map((v, i) => (
          <View key={i} style={styles.lastRow}>
            <Text style={styles.lastN}>Set {i + 1}</Text>
            <Text style={styles.lastV}>{v}</Text>
            <Text style={styles.lastWhen}>{i === 0 ? '5 Aug' : ''}</Text>
          </View>
        ))}
      </View>

      <H6 style={styles.head}>{L.usedIn}</H6>
      <View style={styles.usedIn}>
        {usedIn.map((name) => (
          <Tag key={name} tone="accent" label={name} />
        ))}
      </View>

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  spacer: { flex: 1 },
  smallBtn: { paddingVertical: 4, paddingHorizontal: 9 },
  smallLabel: { fontSize: 11.5 },
  ghostLabel: { fontSize: 12.5 },
  head: { marginTop: 18, marginBottom: 8, color: color.neutral500 },

  setupRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  setupKey: { flex: 1, paddingVertical: 5, paddingHorizontal: 9 },
  setupValue: { width: 64, textAlign: 'center', paddingVertical: 5, paddingHorizontal: 2 },
  del: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  delGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
  addBtn: { alignSelf: 'flex-start', marginTop: 7 },

  lastRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: wash.text(7),
  },
  lastN: { width: 34, fontFamily: font.regular, fontSize: 13.5, color: color.neutral600, fontVariant: ['tabular-nums'] },
  lastV: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.text, fontVariant: ['tabular-nums'] },
  lastWhen: { fontFamily: font.regular, fontSize: 13.5, color: color.neutral600, fontVariant: ['tabular-nums'] },

  usedIn: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  closeBtn: { marginTop: 16, height: 40 },
});
