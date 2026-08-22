/**
 * The Settings screen's editable, reorderable list — used for both muscle
 * groups and equipment, which are identical in the design.
 *
 * The web original reorders with HTML5 drag-and-drop; here `DragList` does the
 * same job — hold the row, move it, let go. Both of the original's cues are
 * kept: the grip turns accent while dragging, and a 2px accent line marks where
 * the row will land.
 *
 * The grip is no longer the handle — the row is — but it stays, because a list
 * has to *say* it reorders and this is the app's word for that. See `DragList`.
 * The label itself is a text field, so a hold that starts there goes to the
 * keyboard rather than to the drag; the grip, the count and the space between
 * them are what a thumb reaching to move a row lands on.
 *
 * A row with an empty label is a divider in the lists that read these — hence
 * the "leave empty for a divider" placeholder. A divider is an added row like
 * any other, so it drags anywhere, the seeded block included; only the × is
 * withheld from the seeded rows themselves (see `fixed`).
 */
import { Text, View } from 'react-native';

import { DragList } from '@/components/drag-list';
import { GripIcon } from '@/components/icon';
import { HoldBtn } from '@/components/hold-btn';
import { Input } from '@/design/ui';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, slop } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

export type ReorderRow = {
  key: string;
  label: string;
  /** Overrides the list placeholder — e.g. the other language's name. */
  placeholder?: string;
  count: number | '';
  /**
   * A seeded entry: no ×, because these keys are what exercises are filed
   * under. Deleting one doesn't tidy the list, it strands every exercise
   * pointing at it — they fall back to rendering the raw key (`LowerBack`) and
   * drop out of the library's filter row. Renaming and reordering stay open,
   * which is what the list is actually for.
   */
  fixed?: boolean;
};

const GAP = 5;

export function ReorderRows({
  rows,
  placeholder,
  onLabel,
  onDelete,
  onReorder,
  onScrub,
}: {
  rows: ReorderRow[];
  placeholder: string;
  onLabel: (index: number, value: string) => void;
  onDelete: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  /** Passed up to the Settings scroller for the length of a drag. */
  onScrub?: (on: boolean) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { L } = useStore();

  return (
    <DragList
      count={rows.length}
      keyOf={(i) => rows[i].key}
      rowStyle={() => styles.row}
      liftStyle={{ backgroundColor: c.bg }}
      gap={GAP}
      onReorder={onReorder}
      onScrub={onScrub}
    >
      {(i, d) => {
        const row = rows[i];
        return (
          <>
            <View accessibilityLabel={L.dragReorder} style={styles.grip}>
              <GripIcon color={d.held ? c.accent : c.neutral700} />
            </View>
            <Input
              style={styles.input}
              placeholder={row.placeholder ?? placeholder}
              value={row.label}
              onChangeText={(v) => onLabel(i, v)}
            />
            <Text style={styles.count}>{row.count}</Text>
            {/* The slot is held open on a fixed row rather than removed: every
                input in the list keeps the same width, so a seeded row and one
                you added still read as one column. */}
            {row.fixed ? (
              <View style={styles.del} />
            ) : (
              // Held, not tapped: these keys are what exercises are filed
              // under, and a deleted one strands them — the opposite of the
              // recoverable taps the app hands out freely.
              <HoldBtn
                destructive
                label="×"
                accessibilityLabel={L.remove}
                hitSlop={slop}
                onConfirm={() => onDelete(i)}
                style={styles.del}
                labelStyle={styles.delGlyph}
              />
            )}
          </>
        );
      }}
    </DragList>
  );
}

const sheet = themed(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 2 },
  grip: { width: 20, height: 26, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, paddingVertical: 5, paddingHorizontal: 9 },
  count: {
    width: 26,
    textAlign: 'right',
    fontFamily: font.regular,
    fontSize: 11,
    color: color.neutral600,
  },
  del: {
    width: 22,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderColor: 'transparent',
  },
  delGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
}));
