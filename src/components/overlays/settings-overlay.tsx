/**
 * Settings — how the app looks, how a workout behaves, and the two lists that
 * drive the rest of it.
 *
 * Ordered by how often someone opens it for a thing: the palette and the rest
 * timer get changed and changed back, the muscle-group and equipment lists are
 * long and set up once, and the destructive half sits at the bottom next to
 * About, where nobody lands by accident.
 *
 * Muscle groups and equipment are user-owned: renaming one relabels it
 * everywhere, and leaving a label blank turns that entry into a divider in the
 * exercise library and its filter row.
 */
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReorderRows } from '@/components/reorder-rows';
import { FullScreen } from '@/components/sheet';
import { pickAndRead, saveAndShare } from '@/data/backup';
import { hasRadio, isSimRadio, sayGoodbye } from '@/data/buddy-radio';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useDark, useThemed } from '@/design/theme';
import {
  color,
  font,
  radius,
  t,
  ThemeMode,
  ThemeName,
  THEMES,
  themeSwatch,
  tracking,
} from '@/design/tokens';
import { Btn, H2, H6, Seg } from '@/design/ui';
import { resolveNames, STORAGE_VERSION, useStore } from '@/store/workout-store';

/** Rest lengths worth a tap. 0 is the timer off — see `restSeconds`. */
const RESTS = [0, 60, 90, 120, 180, 300];

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

/**
 * `blurple` → `themeBlurple`, the dictionary key holding its display name.
 * Typed rather than cast to string, so adding a theme without translating it
 * fails here instead of rendering `undefined`.
 */
const themeKey = (n: ThemeName) =>
  `theme${n[0].toUpperCase()}${n.slice(1)}` as `theme${Capitalize<ThemeName>}`;

export function SettingsOverlay() {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, L, patch, allEx, reorder, endPairing, exportState, importState } = useStore();
  const insets = useSafeAreaInsets();
  const dark = useDark();
  const close = () => patch({ settingsOpen: false });
  useBackClose(close);

  /** What the last export or restore did, until something else happens. */
  const [note, setNote] = useState<string | null>(null);

  /**
   * Rows edit the active language only. An entry with no name in this
   * language shows the other language's name as its placeholder — greyed, the
   * cue that typing here adds the missing translation rather than renaming.
   */
  const rowsFor = (list: typeof s.groups, field: 'group' | 'kind') =>
    list.map((g) => {
      const r = resolveNames(g.labels, s.lang);
      return {
        key: g.key,
        label: g.labels[s.lang] ?? '',
        placeholder: r.missing ? r.text : L.dividerHint,
        count: allEx().filter((e) => e[field] === g.key).length || ('' as const),
      };
    });

  const groupRows = rowsFor(s.groups, 'group');
  const kindRows = rowsFor(s.kinds, 'kind');

  // Which of the three transports this install actually runs — the single
  // most useful diagnostic across two phones and the emulator rig.
  const buildLabel = hasRadio ? (isSimRadio ? L.buildSim : L.buildStandalone) : L.buildDemo;

  const aboutRows: [string, string][] = [
    [L.version, Constants.expoConfig?.version ?? '—'],
    [L.buildKind, buildLabel],
    [L.expoSdk, Constants.expoConfig?.sdkVersion ?? '54.0.0'],
    [L.sessionsLogged, String(s.history.length)],
  ];

  const setLabel = (listKey: 'groups' | 'kinds', i: number, v: string) =>
    patch((st) => ({
      [listKey]: st[listKey].map((x, j) =>
        j === i ? { ...x, labels: { ...x.labels, [st.lang]: v } } : x
      ),
    }));

  /**
   * Going private has to reach the other phone. A link this one simply stops
   * answering is one the buddy spends the next hour reconnecting through, and
   * the roster would re-pair on sight the moment the switch came back.
   */
  const setPrivate = (on: boolean) => {
    if (on) {
      sayGoodbye(s.buddyEndpoint);
      endPairing();
    }
    patch({ privateMode: on });
  };

  const doExport = async () => {
    setNote(null);
    if (!(await saveAndShare(exportState(), STORAGE_VERSION, L.exportBackup)))
      setNote(L.backupFailed);
  };

  const doImport = async () => {
    setNote(null);
    const env = await pickAndRead();
    if (env === 'cancelled') return;
    if (env === 'invalid') return setNote(L.restoreFailed);
    // Confirm at the last possible moment — with the file already in hand, so
    // the question is about this backup rather than about the idea of one.
    Alert.alert(L.restoreTitle, L.restoreBody, [
      { text: L.cancel, style: 'cancel' },
      {
        text: L.restoreGo,
        style: 'destructive',
        onPress: () => setNote(L.restoreDone.replace('{n}', String(importState(env)))),
      },
    ]);
  };

  return (
    <FullScreen zIndex={78}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Btn variant="ghost" label={L.back} labelStyle={styles.backLabel} onPress={close} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <H2 size={t.h2} style={styles.tight}>
          {L.settings}
        </H2>

        <H6 style={[styles.head, styles.firstHead]}>{L.appearance}</H6>
        <Seg
          options={MODES.map((m) => ({
            key: m,
            label: m === 'system' ? L.modeSystem : m === 'light' ? L.modeLight : L.modeDark,
            on: s.themeMode === m,
            pick: () => patch({ themeMode: m }),
          }))}
        />
        <View style={styles.swatches}>
          {THEMES.map((th) => (
            <Swatch
              key={th.key}
              name={th.key}
              label={L[themeKey(th.key)]}
              dark={dark}
              on={s.theme === th.key}
              pick={() => patch({ theme: th.key })}
            />
          ))}
        </View>

        <H6 style={styles.head}>{L.workout}</H6>
        <Text style={styles.rowLabel}>{L.restBetween}</Text>
        <View style={styles.chips}>
          {RESTS.map((secs) => {
            const on = s.restSeconds === secs;
            return (
              <Pressable
                key={secs}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => patch({ restSeconds: secs })}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, on && { color: c.accent }]}>
                  {secs === 0
                    ? L.restOff
                    : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{L.restHint}</Text>

        <ToggleRow
          label={L.hapticsLabel}
          hint={L.hapticsHint}
          on={s.haptics}
          set={(v) => patch({ haptics: v })}
        />

        <H6 style={styles.head}>{L.privacy}</H6>
        <ToggleRow
          label={L.trainAlone}
          hint={L.trainAloneHint}
          on={s.privateMode}
          set={setPrivate}
        />

        <H6 style={styles.head}>{L.language}</H6>
        <Seg
          options={(['en', 'de'] as const).map((code) => ({
            key: code,
            label: code === 'en' ? 'English' : 'Deutsch',
            on: s.lang === code,
            pick: () => patch({ lang: code }),
          }))}
        />

        <H6 style={styles.head}>{L.muscleGroups}</H6>
        <ReorderRows
          rows={groupRows}
          placeholder={L.dividerHint}
          onLabel={(i, v) => setLabel('groups', i, v)}
          onDelete={(i) => patch((st) => ({ groups: st.groups.filter((_, j) => j !== i) }))}
          onReorder={(from, to) => reorder('groups', from, to)}
        />
        <Btn
          variant="ghost"
          label={L.addGroup}
          labelStyle={styles.ghostLabel}
          style={styles.addBtn}
          onPress={() =>
            patch((st) => ({ groups: [...st.groups, { key: `g${Date.now()}`, labels: {} }] }))
          }
        />

        <H6 style={styles.head}>{L.equipment}</H6>
        <ReorderRows
          rows={kindRows}
          placeholder={L.dividerHint}
          onLabel={(i, v) => setLabel('kinds', i, v)}
          onDelete={(i) => patch((st) => ({ kinds: st.kinds.filter((_, j) => j !== i) }))}
          onReorder={(from, to) => reorder('kinds', from, to)}
        />
        <Btn
          variant="ghost"
          label={L.addEquipment}
          labelStyle={styles.ghostLabel}
          style={styles.addBtn}
          onPress={() =>
            patch((st) => ({ kinds: [...st.kinds, { key: `k${Date.now()}`, labels: {} }] }))
          }
        />

        <H6 style={styles.head}>{L.data}</H6>
        <Pressable onPress={doExport} style={styles.actionRow}>
          <Text style={styles.actionLabel}>{L.exportBackup}</Text>
          <Text style={styles.hint}>{L.exportHint}</Text>
        </Pressable>
        <Pressable onPress={doImport} style={styles.actionRow}>
          <Text style={styles.actionLabel}>{L.importBackup}</Text>
          <Text style={styles.hint}>{L.importHint}</Text>
        </Pressable>
        {note && <Text style={styles.note}>{note}</Text>}

        <H6 style={styles.head}>{L.about}</H6>
        {aboutRows.map(([label, value]) => (
          <View key={label} style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{label}</Text>
            <Text style={styles.aboutValue} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ))}
        <Text style={styles.copyright}>
          {L.copyright.replace('{year}', String(new Date().getFullYear()))}
        </Text>
      </ScrollView>
    </FullScreen>
  );
}

/**
 * One theme, drawn as the thing it produces: its page colour with its accent
 * sitting on it, in whichever mode is resolved right now. A swatch that always
 * showed the dark palette would be lying to anyone running light.
 */
function Swatch({
  name,
  label,
  dark,
  on,
  pick,
}: {
  name: ThemeName;
  label: string;
  dark: boolean;
  on: boolean;
  pick: () => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const sw = themeSwatch(name, dark);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={pick}
      style={styles.swatch}
    >
      <View style={[styles.disc, { backgroundColor: sw.bg, borderColor: sw.surface }]}>
        <View style={[styles.discDot, { backgroundColor: sw.accent }]} />
        {on && <View style={styles.discRing} pointerEvents="none" />}
      </View>
      <Text style={[styles.swatchLabel, on && { color: c.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  set,
}: {
  label: string;
  hint: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={set}
        trackColor={{ false: c.neutral800, true: c.accent700 }}
        thumbColor={on ? c.accent : c.neutral500}
      />
    </View>
  );
}

const sheet = themed(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  backLabel: { fontSize: 13 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16 },
  tight: { letterSpacing: tracking(t.h2, -0.02) },
  head: { marginTop: 22, marginBottom: 8, color: color.neutral500 },
  firstHead: { marginTop: 20 },
  ghostLabel: { fontSize: 12.5 },
  addBtn: { alignSelf: 'flex-start', marginTop: 7 },

  rowLabel: { fontFamily: font.regular, fontSize: 14, color: color.text },
  hint: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 16,
    color: color.neutral600,
    marginTop: 3,
  },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  swatch: { width: 52, alignItems: 'center', gap: 5 },
  disc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discDot: { width: 16, height: 16, borderRadius: 8 },
  discRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: color.accent,
  },
  swatchLabel: { fontFamily: font.regular, fontSize: 10, color: color.neutral500 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.divider,
  },
  chipOn: { borderColor: color.accent },
  chipLabel: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  toggleText: { flex: 1 },

  actionRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.rule },
  actionLabel: { fontFamily: font.regular, fontSize: 14, color: color.accent },
  note: { fontFamily: font.regular, fontSize: 12, color: color.accent400, marginTop: 10 },

  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: t.rule,
  },
  aboutLabel: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: color.neutral500 },
  aboutValue: { fontFamily: font.regular, fontSize: 12.5, color: color.neutral300 },
  copyright: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600, marginTop: 14 },
}));
