/**
 * The Settings screen's editable, reorderable list — used for both muscle
 * groups and equipment, which are identical in the design.
 *
 * The web original reorders with HTML5 drag-and-drop; here a pan gesture on the
 * grip does the same job. Both of the original's cues are kept: the grip turns
 * accent while dragging, and a 2px accent line marks where the row will land.
 *
 * A row with an empty label is a divider in the lists that read these — hence
 * the "leave empty for a divider" placeholder.
 */
import { useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { GripIcon } from '@/components/icon';
import { Input } from '@/design/ui';
import { color, font } from '@/design/tokens';

export type ReorderRow = {
  key: string;
  label: string;
  /** Overrides the list placeholder — e.g. the other language's name. */
  placeholder?: string;
  count: number | '';
};

const GAP = 5;

export function ReorderRows({
  rows,
  placeholder,
  onLabel,
  onDelete,
  onReorder,
}: {
  rows: ReorderRow[];
  placeholder: string;
  onLabel: (index: number, value: string) => void;
  onDelete: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [rowHeight, setRowHeight] = useState(36);
  const [dy] = useState(() => new Animated.Value(0));

  /** Row pitch — the distance one row travels to displace the next. */
  const pitch = rowHeight + GAP;
  const landing = (from: number, offset: number) =>
    Math.max(0, Math.min(rows.length - 1, from + Math.round(offset / pitch)));

  // Rebuilt every render, so the closures always see the current pitch and row
  // count. React Native reads the handler props at event time, so a gesture in
  // flight picks up the newest ones.
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
        if (to !== from) onReorder(from, to);
        dy.setValue(0);
        setDrag(null);
      },
      onPanResponderTerminate: () => {
        dy.setValue(0);
        setDrag(null);
      },
    });

  return (
    <View style={{ gap: GAP }}>
      {rows.map((row, i) => {
        const isDragging = drag?.from === i;
        const isTarget = !!drag && drag.to === i && drag.from !== i;
        return (
          <Animated.View
            key={row.key}
            onLayout={i === 0 ? (e) => setRowHeight(e.nativeEvent.layout.height) : undefined}
            style={[
              styles.row,
              { borderTopColor: isTarget ? color.accent : 'transparent' },
              isDragging && {
                transform: [{ translateY: dy }],
                zIndex: 2,
                elevation: 2,
              },
            ]}
          >
            <View
              {...responderFor(i).panHandlers}
              accessibilityLabel="Drag to reorder"
              style={styles.grip}
            >
              <GripIcon color={isDragging ? color.accent : color.neutral700} />
            </View>
            <Input
              style={styles.input}
              placeholder={row.placeholder ?? placeholder}
              value={row.label}
              onChangeText={(v) => onLabel(i, v)}
            />
            <Text style={styles.count}>{row.count}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove"
              onPress={() => onDelete(i)}
              style={styles.del}
            >
              <Text style={styles.delGlyph}>×</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
  del: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  delGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
});
