/**
 * Exercise picker — adds an exercise to the open routine or the live session,
 * depending on which one asked for it.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, t, wash } from '@/design/tokens';
import { Btn, H2, Input, missingName } from '@/design/ui';
import { Exercise } from '@/data/exercises';
import { myName, useStore } from '@/store/workout-store';

export function PickerOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, allEx, gInfo, kInfo, exInfo, lastFor } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => patch({ picker: null });
  useBackClose(close);

  // Sheet-local, not `s.query`: that one belongs to the Library tab, and a
  // trip through the picker must not wipe a search typed there.
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // Search matches the canonical name and every language's alias.
  const list = allEx().filter(
    (e) =>
      !q ||
      e.name.toLowerCase().includes(q) ||
      Object.values(e.names ?? {}).some((n) => n?.toLowerCase().includes(q))
  );

  const add = (e: Exercise) => {
    if (s.picker === 'routine' && s.routineOpen) {
      const rid = s.routineOpen;
      patch((st) => ({
        routines: st.routines.map((r) =>
          r.id === rid
            ? { ...r, items: [...r.items, { ex: e.id, sets: 3, reps: 10, w: e.last }] }
            : r
        ),
        // Adding to the live co-draft: sign the row and rebroadcast.
        ...(st.coDraft?.rid === rid
          ? {
              coDraft: {
                ...st.coDraft,
                rev: st.coDraft.rev + 1,
                addedBy: { ...st.coDraft.addedBy, [e.id]: myName(st) },
              },
            }
          : {}),
      }));
    } else {
      const last = lastFor(e.id);
      patch((st) => {
        const fresh = {
          ex: e.id,
          sets: Array.from({ length: 3 }, (_, k) => {
            // Three fresh sets where last time may have had fewer: the ghost
            // falls back to the first one, and its verdict falls back with it.
            const src = last.sets[k] ? k : 0;
            return {
              w: '',
              reps: '',
              done: false,
              prev: last.sets[src] || '—',
              prevMark: last.marks[src] ?? null,
            };
          }),
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
      {/* Same shape as Settings and Buddy sync: back alone in the header,
          the H2 title in the body — this was the one full-screen overlay
          with a small grey title squeezed into the header row. */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.back} labelStyle={styles.backLabel} onPress={close} />
      </View>

      <View style={styles.searchWrap}>
        <H2 size={t.h2} style={styles.title}>
          {L.addExercise}
        </H2>
        <Input placeholder={L.search} value={query} onChangeText={setQuery} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {list.map((e) => {
          const name = exInfo(e);
          return (
            <Pressable key={e.id} onPress={() => add(e)} style={styles.row}>
              <View style={styles.text}>
                <Text style={[styles.name, name.missing && missingName(c)]}>{name.text}</Text>
                <Text style={styles.kind}>
                  {kInfo(e.kind).text} · {gInfo(e.group).text}
                </Text>
              </View>
              <Text style={styles.plus}>+</Text>
            </Pressable>
          );
        })}

        {/* The library is deliberately narrow (see AGENTS.md) — the moment it
            lacks what you searched for is exactly the moment this overlay
            exists for, so creation is one tap away rather than a detour
            through the Library tab. The new-exercise sheet (z 88) opens over
            this one; saving drops the exercise straight into the list above. */}
        {!!q && (
          <Pressable
            onPress={() =>
              patch((st) => ({
                creating: {
                  name: query.trim(),
                  group: st.groups[0]?.key ?? '',
                  kind: st.kinds[0]?.key ?? '',
                  measure: 'load',
                },
              }))
            }
            style={styles.row}
          >
            <Text style={styles.create}>{L.createNamed.replace('{name}', query.trim())}</Text>
            <Text style={styles.plus}>+</Text>
          </Pressable>
        )}
      </ScrollView>
    </FullScreen>
  );
}

const sheet = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
  backLabel: { fontSize: 13 },
  title: { marginBottom: 10 },
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
  create: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.accent },
  kind: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  plus: { fontFamily: font.regular, fontSize: 18, color: color.accent },
}));
