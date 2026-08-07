/** How-to sheet — reference images you fill yourself, a video link, and the cues. */
import { StyleSheet, Text, View } from 'react-native';

import { ImageSlot } from '@/components/image-slot';
import { Sheet } from '@/components/sheet';
import { useBackClose } from '@/hooks/use-back-close';
import { color, font, radius } from '@/design/tokens';
import { Btn, Field, H4, H6, Input, missingName, Tag } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export function InstructionsSheet() {
  const { s, L, patch, ex, gInfo, kInfo, exInfo, setup, cues } = useStore();
  const close = () => patch({ instrOpen: null });
  useBackClose(close);

  const e = ex(s.instrOpen!);
  if (!e) return null;

  const name = exInfo(e);
  const settings = setup(e.id);

  return (
    <Sheet zIndex={86} maxHeight="88%" onClose={close}>
      <H4 style={name.missing && missingName}>{name.text}</H4>
      <Text style={styles.meta}>
        {kInfo(e.kind).text} · {gInfo(e.group).text}
      </Text>

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
      <View style={{ gap: 7 }}>
        {cues(e.id).map((c, i) => (
          <View key={i} style={styles.cueRow}>
            <Text style={styles.cueN}>{i + 1}</Text>
            <Text style={styles.cueText}>{c}</Text>
          </View>
        ))}
      </View>

      <Btn variant="secondary" block label={L.close} style={styles.closeBtn} onPress={close} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
  closeBtn: { marginTop: 18, height: 40 },
});
