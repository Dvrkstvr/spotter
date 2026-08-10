/**
 * How-to sheet — reference images you fill yourself, a video link, and the cues.
 *
 * The images and the video link were always yours to set; Edit hands you the
 * cues as well (deviation — the design ships `INFO.cues` read-only). Rewrites
 * are stored per exercise in `cueEdits`, the same override model as machine
 * setup, so the seeded text is still there to reset back to.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ImageSlot } from '@/components/image-slot';
import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius } from '@/design/tokens';
import { Btn, Field, H4, H6, Input, missingName, Tag } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function InstructionsSheet() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, ex, gInfo, kInfo, exInfo, setup, cues, mutCues } = useStore();
  const close = () => patch({ instrOpen: null });
  useBackClose(close);

  // Sheet-local, like the exercise sheet's: reopening lands on reading again.
  const [editing, setEditing] = useState(false);

  const e = ex(s.instrOpen!);
  if (!e) return null;

  const name = exInfo(e);
  const settings = setup(e.id);
  const list = cues(e.id);

  return (
    <Sheet zIndex={86} maxHeight="88%" onClose={close}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <H4 style={name.missing && missingName(c)}>{name.text}</H4>
          <Text style={styles.meta}>
            {kInfo(e.kind).text} · {gInfo(e.group).text}
          </Text>
        </View>
        <Btn
          variant="ghost"
          label={editing ? L.editDone : L.edit}
          labelStyle={styles.smallLabel}
          onPress={() => setEditing((v) => !v)}
        />
      </View>

      <View style={styles.mainFrame}>
        <ImageSlot
          id={`instr-main-${e.id}`}
          shape="rect"
          placeholder={L.dropGif}
          style={styles.mainSlot}
        />
      </View>

      <View style={styles.pairRow}>
        <View style={styles.pairFrame}>
          <ImageSlot
            id={`instr-a-${e.id}`}
            shape="rect"
            placeholder={L.startPos}
            style={styles.pairSlot}
          />
        </View>
        <View style={styles.pairFrame}>
          <ImageSlot
            id={`instr-b-${e.id}`}
            shape="rect"
            placeholder={L.endPos}
            style={styles.pairSlot}
          />
        </View>
      </View>

      <Field label={L.videoLink} style={styles.field}>
        <Input
          placeholder={L.pasteUrl}
          autoCapitalize="none"
          keyboardType="url"
          value={s.videos[e.id] ?? ''}
          onChangeText={(v) => patch((st) => ({ videos: { ...st.videos, [e.id]: v } }))}
        />
      </Field>

      {settings.length > 0 && (
        <View>
          <H6 style={styles.head}>{L.setup}</H6>
          <View style={styles.tags}>
            {settings.map((p, i) => (
              <Tag key={i} tone="accent" label={`${p[0]} ${p[1]}`} />
            ))}
          </View>
        </View>
      )}

      <H6 style={styles.head}>{L.cues}</H6>
      {editing ? (
        <>
          <View style={{ gap: 5 }}>
            {list.map((c, i) => (
              <View key={i} style={styles.cueEdit}>
                <Text style={styles.cueN}>{i + 1}</Text>
                <Input
                  style={styles.cueInput}
                  placeholder={L.cuePlaceholder}
                  multiline
                  value={c}
                  onChangeText={(v) => mutCues(e.id, (a) => { a[i] = v; })}
                />
                <Pressable
                  accessibilityLabel="Remove cue"
                  onPress={() => mutCues(e.id, (a) => { a.splice(i, 1); })}
                  style={styles.del}
                >
                  <Text style={styles.delGlyph}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Btn
            variant="ghost"
            label={L.addCue}
            labelStyle={styles.ghostLabel}
            style={styles.addBtn}
            onPress={() => mutCues(e.id, (a) => { a.push(''); })}
          />
        </>
      ) : (
        <View style={{ gap: 7 }}>
          {list.map((c, i) => (
            <View key={i} style={styles.cueRow}>
              <Text style={styles.cueN}>{i + 1}</Text>
              <Text style={styles.cueText}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

const sheet = themed(() => ({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleText: { flex: 1 },
  smallLabel: { fontSize: 11.5 },
  ghostLabel: { fontSize: 12.5 },
  meta: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, marginTop: 2 },
  mainFrame: {
    marginTop: 14,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: color.bg,
  },
  mainSlot: { width: '100%', height: 190 },
  pairRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pairFrame: { flex: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.bg },
  pairSlot: { width: '100%', height: 92 },
  field: { marginTop: 10 },
  head: { marginTop: 18, marginBottom: 8, color: color.neutral500 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cueRow: { flexDirection: 'row', gap: 9 },
  cueN: { fontFamily: font.regular, fontSize: 13, color: color.accent, fontVariant: ['tabular-nums'] },
  cueText: { flex: 1, fontFamily: font.regular, fontSize: 13, color: color.neutral300 },
  cueEdit: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  cueInput: { flex: 1, minHeight: 40, paddingVertical: 7, fontSize: 13 },
  del: { width: 22, height: 34, alignItems: 'center', justifyContent: 'center' },
  delGlyph: { fontFamily: font.regular, fontSize: 15, color: color.neutral600 },
  addBtn: { alignSelf: 'flex-start', marginTop: 7 },
  closeBtn: { marginTop: 18, height: 40 },
}));
