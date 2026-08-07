/**
 * Exercise picker — adds an exercise to the open routine or the live session,
 * depending on which one asked for it.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { color, font, wash } from '@/design/tokens';
import { Btn, Input } from '@/design/ui';
import { Exercise } from '@/data/exercises';
import { useStore } from '@/store/workout-store';

export function PickerOverlay() {
  const { s, L, patch, allEx, gLabel, kLabel } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => patch({ picker: null, query: '' });
  useBackClose(close);

  const q = s.query.trim().toLowerCase();
  const list = allEx().filter((e) => !q || e.name.toLowerCase().includes(q));

  const add = (e: Exercise) => {
    if (s.picker === 'routine' && s.routineOpen) {
      const rid = s.routineOpen;
      patch((st) => ({
        routines: st.routines.map((r) =>
          r.id === rid
            ? { ...r, items: [...r.items, { ex: e.id, sets: 3, reps: 10, w: e.last }] }
            : r
        ),
      }));
    } else {
      patch((st) => {
        const fresh = {
          ex: e.id,
          sets: Array.from({ length: 3 }, (_, k) => ({
            w: '',
            reps: '',
            done: false,
            prev: e.lastSets[k] || e.lastSets[0] || '—',
          })),
        };
        // Adding from a screen with no session open starts one.
        if (!st.session) {
          return {
            session: { rid: null, name: L.freeSession, list: [fresh] },
            active: 0,
            elapsed: 0,
            summary: null,
          };
        }
        return {
          session: { ...st.session, list: [...st.session.list, fresh] },
          active: st.session.list.length,
        };
      });
    }
    close();
  };

  return (
    <FullScreen zIndex={85}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.back} labelStyle={styles.backLabel} onPress={close} />
        <Text style={styles.title}>{L.addExercise}</Text>
      </View>

      <View style={styles.searchWrap}>
        <Input
          placeholder={L.search}
          value={s.query}
          onChangeText={(v) => patch({ query: v })}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {list.map((e) => (
          <Pressable key={e.id} onPress={() => add(e)} style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.name}>{e.name}</Text>
              <Text style={styles.kind}>
                {kLabel(e.kind)} · {gLabel(e.group)}
              </Text>
            </View>
            <Text style={styles.plus}>+</Text>
          </Pressable>
        ))}
      </ScrollView>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
  backLabel: { fontSize: 13 },
  title: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.neutral400 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: wash.text(8),
  },
  text: { flex: 1 },
  name: { fontFamily: font.regular, fontSize: 14, color: color.text },
  kind: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  plus: { fontFamily: font.regular, fontSize: 18, color: color.accent },
});
