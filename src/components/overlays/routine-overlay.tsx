/**
 * Routine editor — rename it, tune sets/reps/weight per exercise, start it.
 *
 * Deviation: the design has an Edit toggle here, but it only ever swapped its
 * own label — the rows are always editable and the delete control is always
 * visible. A button that does nothing is worse than no button, so it's gone.
 *
 * When the open routine is the live co-draft (built together with the
 * connected buddy — see `coDraft` in the store), the editor grows a second
 * skin: a live header, per-row attribution chips, drag-to-reorder, the
 * buddy's reps/weight as a read-only line, and Save-for-both / Start-together
 * in place of the plain start button. Structure syncs both ways; the sets
 * column is the shared one, reps and kg stay per-person.
 */
import { useState } from 'react';
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GripIcon } from '@/components/icon';
import { HoldBtn } from '@/components/hold-btn';
import { FullScreen } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { radio } from '@/data/buddy-radio';
import { measureOf, Routine } from '@/data/exercises';
import { countN, repeatLabel } from '@/data/i18n';
import { rulesFor } from '@/data/plan';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, slop, t, tracking, wash } from '@/design/tokens';
import { Btn, Input, missingName } from '@/design/ui';
import { CoDraft, fmt, myName, num, schemeLine, unitTag, useStore } from '@/store/workout-store';

/**
 * Write a reps or kg cell — and record that somebody chose it.
 *
 * The number on its own isn't enough. A row starts life carrying whatever the
 * picker filled in from the exercise, and those are nobody's decision, so the
 * session leaves them alone in favour of what you actually lifted last time.
 * Typing in the cell is what turns the figure into a plan (`planned` on
 * `RoutineItem`), and a plan is what reaches the session — which is the whole
 * reason two people sit down and set weights together.
 *
 * The sets column is deliberately not marked: it already translates, as the
 * number of rows you get.
 */
const planNum = (r: Routine, n: number, field: 'reps' | 'w', v: number) => {
  r.items[n][field] = v;
  r.items[n].planned = true;
};

export function RoutineOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const {
    s, L, patch, ex, routine, gInfo, kInfo, exInfo, rInfo, mutRoutine, deleteRoutine, start, draftPayload,
  } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => patch({ routineOpen: null });
  useBackClose(close);

  const r = routine(s.routineOpen);
  if (!r) return null;

  // The co-draft skin needs the pairing to still exist; if the buddy was
  // disconnected mid-draft this falls back to the plain editor.
  const draft = s.coDraft?.rid === r.id && s.buddy ? s.coDraft : null;

  // Every rule that puts this routine on the calendar, in the same words the
  // Plan row pills and the plan sheet use — one formatter, three surfaces.
  const rules = rulesFor(s.plan, r.id);
  const days = rules.length
    ? rules.map((e) => repeatLabel(e.repeat, L, s.lang)).join(' · ')
    : L.unscheduled;
  const summary = `${days} · ${countN(
    r.items.reduce((a, i) => a + i.sets, 0),
    L.setCountOne,
    L.setCount
  )}`;

  // Ending the draft: tell the buddy (the payload makes the message
  // self-sufficient — their phone merges it even if it missed updates),
  // then keep the routine. Start makes this phone the session host.
  const finish = (reason: 'save' | 'start') => {
    const payload = draftPayload();
    if (payload && radio && s.buddyEndpoint)
      radio
        .sendPayload(s.buddyEndpoint, JSON.stringify({ v: 1, t: 'draftEnd', reason, draft: payload }))
        .catch(() => {});
    if (reason === 'save') patch({ coDraft: null, routineOpen: null });
    else {
      patch({ coDraft: null });
      start(r.id, 'host');
    }
  };

  return (
    <FullScreen zIndex={75}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.backRoutines} labelStyle={styles.headLabel} onPress={close} />
        <View style={styles.spacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Edits the name in the active language only; when that language has
            no name yet the other one shows as the placeholder, greyed — type
            to add the translation. */}
        <TextInput
          value={r.names[s.lang] ?? ''}
          placeholder={rInfo(r).missing ? rInfo(r).text : ''}
          placeholderTextColor={c.neutral600}
          onChangeText={(v) =>
            mutRoutine(r.id, (copy) => {
              copy.names = { ...copy.names, [s.lang]: v };
            })
          }
          cursorColor={c.accent}
          selectionColor={c.accent}
          style={styles.nameInput}
        />
        {draft ? (
          <>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{L.buildingWith.replace('{name}', s.buddy ?? '')}</Text>
            </View>
            <Text style={styles.legend}>{L.draftLegend}</Text>
          </>
        ) : (
          <Text style={styles.summary}>{summary}</Text>
        )}

        <View style={styles.colHead}>
          {draft && <View style={styles.grip} />}
          {draft && <View style={styles.chip} />}
          <Text style={[styles.colLabel, styles.colName]}>{L.exercise}</Text>
          <Text style={[styles.colLabel, styles.colNarrow, draft && styles.colShared]}>
            {L.sets}
          </Text>
          <Text style={[styles.colLabel, styles.colNarrow]}>{L.reps}</Text>
          <Text style={[styles.colLabel, styles.colWide]}>{L.unitKg}</Text>
          <View style={styles.colDel} />
        </View>

        {draft ? (
          <DraftRows r={r} draft={draft} buddy={s.buddy ?? ''} />
        ) : (
          <View style={{ gap: t.gap }}>
            {r.items.map((item, n) => {
              const e = ex(item.ex);
              const name = e ? exInfo(e) : null;
              return (
                <View key={`${item.ex}-${n}`} style={styles.row}>
                  <View style={styles.rowText}>
                    {/* One line, like the co-draft rows below and every other
                        list — a long custom name must not break the grid. */}
                    <Text style={[styles.rowName, name?.missing && missingName(c)]} numberOfLines={1}>
                      {name?.text}
                    </Text>
                    {/* The column headers say "reps" and "kg" for the whole
                        grid, but a routine can mix measures — Full Body A
                        ends on a plank. The tag is where that row says so. */}
                    <Text style={styles.rowKind} numberOfLines={1}>
                      {e
                        ? [kInfo(e.kind).text, gInfo(e.group).text, unitTag(measureOf(e), L)]
                            .filter(Boolean)
                            .join(' · ')
                        : ''}
                    </Text>
                  </View>
                  <Input
                    style={[styles.numInput, styles.colNarrow]}
                    keyboardType="number-pad"
                    defaultValue={String(item.sets)}
                    onChangeText={(v) =>
                      mutRoutine(r.id, (copy) => {
                        copy.items[n].sets = Math.max(1, Math.round(num(v, item.sets)));
                      })
                    }
                  />
                  <Input
                    style={[styles.numInput, styles.colNarrow]}
                    keyboardType="number-pad"
                    defaultValue={String(item.reps)}
                    onChangeText={(v) =>
                      mutRoutine(r.id, (copy) =>
                        planNum(copy, n, 'reps', Math.max(1, Math.round(num(v, item.reps))))
                      )
                    }
                  />
                  <Input
                    style={[styles.numInput, styles.colWide]}
                    keyboardType="decimal-pad"
                    defaultValue={fmt(item.w)}
                    onChangeText={(v) =>
                      mutRoutine(r.id, (copy) => planNum(copy, n, 'w', Math.max(0, num(v, item.w))))
                    }
                  />
                  {/* Held, not tapped: the × sits a thumb-width from the kg
                      cell and takes the row's planned numbers with it. */}
                  <HoldBtn
                    destructive
                    label="×"
                    accessibilityLabel={L.removeExercise}
                    hitSlop={slop}
                    onConfirm={() => mutRoutine(r.id, (copy) => { copy.items.splice(n, 1); })}
                    style={styles.colDel}
                    labelStyle={styles.delGlyph}
                  />
                </View>
              );
            })}
          </View>
        )}

        {draft?.buddyPicking && (
          <Text style={styles.pickingHint}>
            {L.buddyPickingEx.replace('{name}', s.buddy ?? '')}
          </Text>
        )}

        <Btn
          variant="secondary"
          block
          label={L.addExerciseBtn}
          style={styles.addBtn}
          onPress={() => patch({ picker: 'routine' })}
        />
        {draft ? (
          <View style={styles.endRow}>
            <Btn
              variant="secondary"
              label={L.saveForBoth}
              style={styles.endBtn}
              onPress={() => finish('save')}
            />
            <Btn
              variant="primary"
              label={L.startTogether}
              style={styles.endBtn}
              labelStyle={styles.startLabel}
              onPress={() => finish('start')}
            />
          </View>
        ) : (
          <>
            {/* One workout at a time: while a session runs this button can
                only take you back to it (the guard in `start`), so it says
                that instead of promising a start it cannot deliver. */}
            <Btn
              variant={s.session ? 'secondary' : 'primary'}
              block
              label={s.session ? `${L.backToWorkout} ›` : L.startRoutine}
              style={styles.startBtn}
              labelStyle={styles.startLabel}
              onPress={() => (s.session ? patch({ sessionMin: false, routineOpen: null }) : start(r.id))}
            />
            {/* The only way a routine leaves the phone, so it wears the hold
                grammar. Hidden mid-co-draft: deleting what the buddy is
                still editing is a conversation, not a button. */}
            <HoldBtn
              destructive
              label={L.holdDeleteRoutine}
              onConfirm={() => deleteRoutine(r.id)}
              style={styles.deleteBtn}
              labelStyle={styles.deleteLabel}
            />
          </>
        )}
      </ScrollView>
    </FullScreen>
  );
}

/**
 * The co-draft's rows: grip to drag-reorder (the ReorderRows gesture, with
 * the same landing-line cue), an initial chip for whoever added the row, and
 * the buddy's reps/weight as a read-only line. Number cells keep local text
 * while focused so an incoming broadcast never clobbers mid-typing.
 */
function DraftRows({ r, draft, buddy }: { r: Routine; draft: CoDraft; buddy: string }) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, ex, exInfo, gInfo, kInfo, mutRoutine, moveRoutineItem } = useStore();

  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [rowHeight, setRowHeight] = useState(52);
  const [dy] = useState(() => new Animated.Value(0));

  const landing = (from: number, offset: number) =>
    Math.max(0, Math.min(r.items.length - 1, from + Math.round(offset / rowHeight)));

  // Rebuilt every render so the closures always see the current row count;
  // React Native reads handler props at event time (the ReorderRows pattern).
  const responderFor = (from: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        dy.setValue(0);
        setDrag({ from, to: from });
      },
      onPanResponderMove: (_, g) => {
        dy.setValue(g.dy);
        const to = landing(from, g.dy);
        setDrag((d) => (d && d.to !== to ? { ...d, to } : d));
      },
      onPanResponderRelease: (_, g) => {
        const to = landing(from, g.dy);
        if (to !== from) moveRoutineItem(r.id, from, to);
        dy.setValue(0);
        setDrag(null);
      },
      onPanResponderTerminate: () => {
        dy.setValue(0);
        setDrag(null);
      },
    });

  return (
    <View>
      {r.items.map((item, n) => {
        const e = ex(item.ex);
        const name = e ? exInfo(e) : null;
        const by = draft.addedBy[item.ex] ?? myName(s);
        const theirs = by === buddy;
        const vals = draft.buddyVals[item.ex];
        const isDragging = drag?.from === n;
        const isTarget = !!drag && drag.to === n && drag.from !== n;
        return (
          <Animated.View
            key={`${item.ex}-${n}`}
            onLayout={n === 0 ? (ev) => setRowHeight(ev.nativeEvent.layout.height) : undefined}
            style={[
              styles.row,
              styles.draftRow,
              { borderTopColor: isTarget ? c.accent : 'transparent' },
              isDragging && { transform: [{ translateY: dy }], zIndex: 2, elevation: 2 },
            ]}
          >
            <View
              {...responderFor(n).panHandlers}
              accessibilityLabel={L.dragReorder}
              style={styles.grip}
            >
              <GripIcon color={isDragging ? c.accent : c.neutral700} />
            </View>
            <View style={[styles.chip, theirs ? styles.chipBuddy : styles.chipMe]}>
              <Text style={[styles.chipText, theirs ? styles.chipTextBuddy : styles.chipTextMe]}>
                {(by[0] ?? '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowName, name?.missing && missingName(c)]} numberOfLines={1}>
                {name?.text}
              </Text>
              <Text style={styles.rowKind} numberOfLines={1}>
                {e
                  ? [kInfo(e.kind).text, gInfo(e.group).text, unitTag(measureOf(e), L)]
                      .filter(Boolean)
                      .join(' · ')
                  : ''}
              </Text>
              <Text style={styles.buddyLine} numberOfLines={1}>
                {vals
                  ? `${buddy} · ${schemeLine({ sets: 1, ...vals }, measureOf(e), L, true)}`
                  : `${buddy} · —`}
              </Text>
            </View>
            <NumCell
              style={[styles.numInput, styles.colNarrow, styles.sharedCell]}
              keyboard="number-pad"
              value={String(item.sets)}
              onText={(v) =>
                mutRoutine(r.id, (copy) => {
                  copy.items[n].sets = Math.max(1, Math.round(num(v, item.sets)));
                })
              }
            />
            <NumCell
              style={[styles.numInput, styles.colNarrow]}
              keyboard="number-pad"
              value={String(item.reps)}
              onText={(v) =>
                mutRoutine(r.id, (copy) =>
                  planNum(copy, n, 'reps', Math.max(1, Math.round(num(v, item.reps))))
                )
              }
            />
            <NumCell
              style={[styles.numInput, styles.colWide]}
              keyboard="decimal-pad"
              value={fmt(item.w)}
              onText={(v) =>
                mutRoutine(r.id, (copy) => planNum(copy, n, 'w', Math.max(0, num(v, item.w))))
              }
            />
            <HoldBtn
              destructive
              label="×"
              accessibilityLabel={L.removeExercise}
              hitSlop={slop}
              onConfirm={() => mutRoutine(r.id, (copy) => { copy.items.splice(n, 1); })}
              style={styles.colDel}
              labelStyle={styles.delGlyph}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * A number cell that owns its text while focused: the store value shows when
 * idle (so the buddy's shared-sets change appears), but a broadcast landing
 * mid-typing can't overwrite what's under the cursor.
 */
function NumCell({
  value,
  onText,
  keyboard,
  style,
}: {
  value: string;
  onText: (v: string) => void;
  keyboard: 'number-pad' | 'decimal-pad';
  style?: StyleProp<TextStyle>;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Input
      style={style}
      keyboardType={keyboard}
      value={text ?? value}
      onFocus={() => setText(value)}
      onChangeText={(v) => {
        setText(v);
        onText(v);
      }}
      onBlur={() => setText(null)}
    />
  );
}

const sheet = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 6 },
  headLabel: { fontSize: 13 },
  spacer: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },

  nameInput: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 5,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    color: color.text,
    fontFamily: font.heading,
    fontSize: 26,
    letterSpacing: tracking(26, -0.02),
  },
  summary: { fontFamily: font.regular, fontSize: 12, color: color.neutral500, marginTop: 6 },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  liveText: { fontFamily: font.regular, fontSize: 12, color: color.neutral400 },
  legend: { fontFamily: font.regular, fontSize: 10.5, color: color.neutral600, marginTop: 3 },

  colHead: { flexDirection: 'row', gap: 10, paddingTop: 14, paddingHorizontal: 2, paddingBottom: 6 },
  colLabel: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.07),
    textTransform: 'uppercase',
    color: color.neutral700,
    textAlign: 'center',
  },
  colName: { flex: 1, textAlign: 'left' },
  colNarrow: { width: 38 },
  colWide: { width: 56 },
  colDel: {
    width: 22,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderColor: 'transparent',
  },
  colShared: { color: color.accent700 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderRadius: t.rowRadius,
    backgroundColor: t.rowBg,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  /* Draft rows carry the drag landing line; transparent until targeted so
     the layout never shifts. bg keeps the dragged row readable in flight. */
  draftRow: { borderTopWidth: 2, borderTopColor: 'transparent', backgroundColor: color.bg },
  rowText: { flex: 1 },
  rowName: { fontFamily: font.regular, fontSize: 14, color: color.text },
  rowKind: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  buddyLine: { fontFamily: font.regular, fontSize: 10.5, color: color.accent600, marginTop: 1 },
  numInput: {
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontVariant: ['tabular-nums'],
  },
  sharedCell: {
    borderColor: color.accent700,
    color: color.accent400,
    backgroundColor: wash.accent(8),
  },
  delGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },

  grip: { width: 20, height: 26, alignItems: 'center', justifyContent: 'center' },
  chip: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipMe: { backgroundColor: color.neutral800 },
  chipBuddy: { backgroundColor: color.accent800 },
  chipText: { fontFamily: font.heading, fontSize: 9 },
  chipTextMe: { color: color.neutral200 },
  chipTextBuddy: { color: color.accent200 },

  pickingHint: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    fontStyle: 'italic',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  addBtn: { marginTop: 12, height: 40 },
  startBtn: { marginTop: 8, height: 44 },
  deleteBtn: { marginTop: 8, height: 40 },
  deleteLabel: { color: color.neutral500 },
  startLabel: { fontSize: 15 },
  endRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  endBtn: { flex: 1, height: 44 },
}));
