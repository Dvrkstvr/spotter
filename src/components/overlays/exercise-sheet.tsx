/**
 * Exercise sheet — machine settings you can edit, last session, and where it's used.
 *
 * Edit mode (a deviation; the design's exercises are fixed) turns the identity
 * of an exercise over to the user: its name in the active language, its muscle
 * group, its equipment — for the seeded library as much as for exercises you
 * made yourself, so "Pec Deck" can become whatever your gym calls it. The cues
 * are edited where they're read, in the How-to sheet.
 *
 * Machine setup stays editable in both modes on purpose: it's a note about the
 * machine you're standing at, changed mid-workout, and hiding it behind a
 * mode toggle would cost a tap exactly when you have a bar in your hands.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon, MARK_D } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { measureOf } from '@/data/exercises';
import { useBackClose } from '@/hooks/use-back-close';
import { fmtDayTiny } from '@/data/i18n';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, slop, wash } from '@/design/tokens';
import { Btn, Chip, Field, H4, H6, Input, missingName, Tag } from '@/design/ui';
import { measureLabel, resolveNames, useStore } from '@/store/workout-store';

export function ExerciseSheet() {
  const styles = useThemed(sheet);
  const c = useColors();
  const {
    s,
    L,
    patch,
    ex,
    gInfo,
    kInfo,
    exInfo,
    rInfo,
    setup,
    mutSetup,
    lastFor,
    editEx,
    exEdited,
    resetEx,
  } = useStore();
  const close = () => patch({ exOpen: null });
  useBackClose(close);

  // Which mode the sheet is in belongs to the sheet: it dies with it, and
  // reopening an exercise should always land on the reading view.
  const [editing, setEditing] = useState(false);

  const e = ex(s.exOpen!);
  if (!e) return null;

  const name = exInfo(e);
  const rows = setup(e.id);
  // Really logged numbers when there are any, else the seed. The seed has no
  // date (the design hardcoded '5 Aug' here), so the date column stays empty.
  const last = lastFor(e.id);
  const lastWhen = last.date
    ? fmtDayTiny(s.lang, new Date(`${last.date}T00:00:00`))
    : '';
  const usedIn = s.routines
    .filter((r) => r.items.some((i) => i.ex === e.id))
    .map((r) => rInfo(r).text);

  return (
    <Sheet zIndex={70} maxHeight="80%" scrimOpacity={62} onClose={close}>
      <View style={styles.titleRow}>
        {editing ? (
          // Writes the active language only; when that language has no name
          // yet the other one shows greyed as the placeholder — type to add
          // the translation. Same rule as the routine title.
          <Field label={L.name} style={styles.nameField}>
            <Input
              value={e.names?.[s.lang] ?? ''}
              placeholder={name.missing ? name.text : e.name}
              onChangeText={(v) => editEx(e.id, { names: { [s.lang]: v } })}
            />
          </Field>
        ) : (
          <H4 style={[styles.title, name.missing && missingName(c)]}>{name.text}</H4>
        )}
        <Btn
          variant="ghost"
          label={editing ? L.editDone : L.edit}
          labelStyle={styles.smallLabel}
          onPress={() => setEditing((v) => !v)}
        />
      </View>

      {editing ? (
        <>
          {/* Wrapping chips, not a Seg: twenty groups in a single
              non-wrapping row run off the screen, and a group past the clip
              can't be picked at all. Same treatment as equipment below. */}
          <H6 style={styles.head}>{L.muscleGroup}</H6>
          <View style={styles.chips}>
            {s.groups
              .map((g) => ({ ...g, r: resolveNames(g.labels, s.lang) }))
              .filter((g) => g.r.text.trim())
              .map((g) => (
                <Chip
                  key={g.key}
                  label={g.r.text}
                  on={e.group === g.key}
                  missing={g.r.missing}
                  onPress={() => editEx(e.id, { group: g.key })}
                />
              ))}
          </View>

          <H6 style={styles.head}>{L.equipment}</H6>
          <View style={styles.chips}>
            {s.kinds
              .map((k) => ({ ...k, r: resolveNames(k.labels, s.lang) }))
              .filter((k) => k.r.text.trim())
              .map((k) => (
                <Chip
                  key={k.key}
                  label={k.r.text}
                  on={e.kind === k.key}
                  missing={k.r.missing}
                  onPress={() => editEx(e.id, { kind: k.key })}
                />
              ))}
          </View>

          {/* Read-only on purpose. A logged set is one string shape for every
              measure, so changing it here would not break the history — it
              would silently re-read "— × 90" as 90 reps, which is worse. */}
          <H6 style={styles.head}>{L.measure}</H6>
          <View style={styles.tagRow}>
            <Tag tone="neutral" label={measureLabel(measureOf(e), L)} />
          </View>
          <Text style={styles.measureNote}>{L.measureFixed}</Text>
        </>
      ) : (
        <View style={styles.tagRow}>
          <Tag tone="neutral" label={gInfo(e.group).text} />
          <Tag tone="outline" label={kInfo(e.kind).text} />
          <View style={styles.spacer} />
          <Btn
            variant="secondary"
            label={L.howTo}
            labelStyle={styles.smallLabel}
            style={styles.smallBtn}
            onPress={() => patch({ instrOpen: e.id })}
          />
        </View>
      )}

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
              accessibilityLabel={L.remove}
              hitSlop={slop}
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
        // An empty key, not the literal word 'Setting': the placeholder says
        // what goes here, and a pre-filled English word was being saved (and
        // synced to the buddy) by anyone who didn't clear it first.
        onPress={() => mutSetup(e.id, (a) => { a.push(['', '']); })}
      />

      {editing ? (
        <>
          <Btn
            variant="secondary"
            block
            label={L.editHowTo}
            style={styles.howToBlock}
            onPress={() => patch({ instrOpen: e.id })}
          />
          {exEdited(e.id) && (
            <Btn
              variant="ghost"
              label={L.resetExercise}
              labelStyle={styles.resetLabel}
              style={styles.addBtn}
              onPress={() => resetEx(e.id)}
            />
          )}
        </>
      ) : (
        <>
          <H6 style={styles.head}>{L.lastSession}</H6>
          <View style={{ gap: 4 }}>
            {/* The one screen with room for a mark's words in full — the set
                row itself only ever has space for the glyph. */}
            {last.sets.map((v, i) => {
              const m = last.marks[i];
              return (
                <View key={i} style={styles.lastItem}>
                  <View style={styles.lastRow}>
                    <Text style={styles.lastN}>
                      {L.setLabel.replace('{n}', String(i + 1))}
                    </Text>
                    <Text style={styles.lastV}>{v}</Text>
                    {m && <Icon d={MARK_D[m.mark]} size={14} color={c.accent400} strokeWidth={2.2} />}
                    <Text style={styles.lastWhen}>{i === 0 ? lastWhen : ''}</Text>
                  </View>
                  {m?.note?.trim() ? (
                    <Text style={styles.lastNote}>{m.note.trim()}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          <H6 style={styles.head}>{L.usedIn}</H6>
          <View style={styles.usedIn}>
            {usedIn.map((n) => (
              <Tag key={n} tone="accent" label={n} />
            ))}
          </View>
        </>
      )}

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

const sheet = themed(() => ({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1 },
  nameField: { flex: 1 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  spacer: { flex: 1 },
  smallBtn: { paddingVertical: 4, paddingHorizontal: 9 },
  smallLabel: { fontSize: 11.5 },
  ghostLabel: { fontSize: 12.5 },
  resetLabel: { fontSize: 12.5, color: color.neutral400 },
  head: { marginTop: 18, marginBottom: 8, color: color.neutral500 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  measureNote: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 11 * 1.45,
    color: color.neutral600,
    marginTop: 7,
  },
  howToBlock: { marginTop: 18, height: 40 },

  setupRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  setupKey: { flex: 1, paddingVertical: 5, paddingHorizontal: 9 },
  setupValue: { width: 64, textAlign: 'center', paddingVertical: 5, paddingHorizontal: 2 },
  del: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  delGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
  addBtn: { alignSelf: 'flex-start', marginTop: 7 },

  /** The rule sits on the item, so a mark's note stays inside its own row. */
  lastItem: { paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: wash.text(7) },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lastNote: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: color.neutral500 },
  lastN: { width: 34, fontFamily: font.regular, fontSize: 13.5, color: color.neutral600, fontVariant: ['tabular-nums'] },
  lastV: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: color.text, fontVariant: ['tabular-nums'] },
  lastWhen: { fontFamily: font.regular, fontSize: 13.5, color: color.neutral600, fontVariant: ['tabular-nums'] },

  usedIn: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  closeBtn: { marginTop: 16, height: 40 },
}));
