/** Profile — who you are, your buddy, and a count of what you've built. */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GEAR_D, Icon } from '@/components/icon';
import { ImageSlot } from '@/components/image-slot';
import { Screen } from '@/components/screen';
import { color, font, radius, t, tracking } from '@/design/tokens';
import { Btn, H2, H6 } from '@/design/ui';
import { useStore } from '@/store/workout-store';

export default function YouScreen() {
  const { s, L, patch, allEx, loggedThisMonth } = useStore();

  const sub =
    [
      s.profile.age && `${s.profile.age} yrs`,
      s.profile.weight && `${s.profile.weight} kg`,
      s.profile.height && `${s.profile.height} cm`,
    ]
      .filter(Boolean)
      .join(' · ') || L.addDetails;

  const measures = [
    { label: L.age, unit: L.yrs, key: 'age', keyboard: 'number-pad' },
    { label: L.bodyWeight, unit: 'kg', key: 'weight', keyboard: 'decimal-pad' },
    { label: L.height, unit: 'cm', key: 'height', keyboard: 'number-pad' },
  ] as const;

  const stats = [
    { k: L.thisMonth, v: loggedThisMonth() },
    { k: L.routines, v: s.routines.length },
    { k: L.exercises, v: allEx().length },
  ];

  return (
    <Screen>
      <View style={styles.head}>
        <H2 size={t.h2} style={styles.tight}>
          {L.you}
        </H2>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.settings}
          onPress={() => patch({ settingsOpen: true })}
          style={styles.gear}
        >
          <Icon d={GEAR_D} color={color.neutral400} size={21} />
        </Pressable>
      </View>

      <View style={styles.identity}>
        <ImageSlot id="profile-avatar" shape="circle" placeholder={L.photo} style={styles.avatar} />
        <View style={styles.identityText}>
          <TextField
            value={s.profile.name}
            placeholder={L.yourName}
            onChange={(v) => patch((st) => ({ profile: { ...st.profile, name: v } }))}
          />
          <Text style={styles.identitySub}>{sub}</Text>
        </View>
      </View>

      <H6 style={styles.sectionHead}>{L.aboutYou}</H6>
      <View>
        {measures.map((m) => (
          <View key={m.key} style={styles.measureRow}>
            <Text style={styles.measureLabel}>{m.label}</Text>
            <MeasureInput
              value={s.profile[m.key]}
              keyboard={m.keyboard}
              onChange={(v) => patch((st) => ({ profile: { ...st.profile, [m.key]: v } }))}
            />
            <Text style={styles.measureUnit}>{m.unit}</Text>
          </View>
        ))}
      </View>

      <H6 style={styles.sectionHead}>{L.buddy}</H6>
      {s.buddy ? (
        <View style={styles.buddyCard}>
          <View style={styles.buddyAvatar}>
            <Text style={styles.buddyInitial}>{s.buddy[0]}</Text>
          </View>
          <View style={styles.buddyText}>
            <Text style={styles.buddyName}>{s.buddy}</Text>
            <Text style={styles.buddyStatus}>{L.connected}</Text>
          </View>
          <Btn
            variant="ghost"
            label={L.disconnect}
            labelStyle={styles.disconnect}
            onPress={() => patch({ buddy: null })}
          />
        </View>
      ) : (
        <View>
          <Text style={styles.buddySub}>{L.buddySub}</Text>
          <Btn
            variant="secondary"
            block
            label={L.invite}
            style={styles.inviteBtn}
            onPress={() => patch({ scanning: true })}
          />
        </View>
      )}

      <H6 style={styles.sectionHead}>{L.training}</H6>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.k} style={styles.stat}>
            <Text style={styles.statKey}>{stat.k}</Text>
            <Text style={styles.statValue}>{stat.v}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

/** The name field is an underlined heading, not a boxed .input. */
function TextField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor={color.neutral600}
      cursorColor={color.accent}
      selectionColor={color.accent}
      onChangeText={onChange}
      style={styles.nameInput}
    />
  );
}

function MeasureInput({
  value,
  keyboard,
  onChange,
}: {
  value: string;
  keyboard: 'number-pad' | 'decimal-pad';
  onChange: (v: string) => void;
}) {
  return (
    <TextInput
      value={value}
      placeholder="—"
      placeholderTextColor={color.neutral600}
      cursorColor={color.accent}
      selectionColor={color.accent}
      keyboardType={keyboard}
      onChangeText={onChange}
      style={styles.measureInput}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  gear: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  avatar: { width: 76, height: 76 },
  identityText: { flex: 1 },
  nameInput: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 5,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    color: color.text,
    fontFamily: font.heading,
    fontSize: 21,
    letterSpacing: tracking(21, -0.02),
  },
  identitySub: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral500, marginTop: 6 },

  sectionHead: { marginTop: 22, marginBottom: 8, color: color.neutral500 },

  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: t.rowPadV,
    paddingHorizontal: t.rowPadH,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  measureLabel: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  measureInput: {
    width: 74,
    minHeight: 36,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontFamily: font.regular,
    fontSize: 14,
    color: color.text,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
    fontVariant: ['tabular-nums'],
  },
  measureUnit: { width: 26, fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },

  buddyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  buddyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buddyInitial: { fontFamily: font.regular, fontSize: 12, color: color.accent300 },
  buddyText: { flex: 1 },
  buddyName: { fontFamily: font.regular, fontSize: 14, color: color.text },
  buddyStatus: { fontFamily: font.regular, fontSize: 11, color: color.accent400 },
  disconnect: { fontSize: 12 },
  buddySub: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral500, marginBottom: 9 },
  inviteBtn: { height: 40, marginTop: 0 },

  stats: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  stat: { flex: 1, paddingVertical: 11, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: color.surface },
  statKey: {
    fontFamily: font.regular,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.08),
    textTransform: 'uppercase',
    color: color.neutral600,
  },
  statValue: {
    fontFamily: font.regular,
    fontSize: 19,
    color: color.text,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
});
