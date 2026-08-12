/**
 * Settings — how the app looks, how a workout behaves, and the two lists that
 * drive the rest of it.
 *
 * Ordered by how often someone opens it for a thing: the palette and the rest
 * timer get changed and changed back, the muscle-group and equipment lists are
 * long and set up once — so they are folded away (see `Fold`) — and the
 * destructive half sits at the bottom next to About, where nobody lands by
 * accident.
 *
 * Muscle groups and equipment are user-owned: renaming one relabels it
 * everywhere, and leaving a label blank turns that entry into a divider in the
 * exercise library and its filter row. Owned, not authored — the seeded keys
 * are what every exercise is filed under, so those rows rename and reorder but
 * never delete (`SEEDED`). A divider you add is a row like any other and drags
 * into the middle of them.
 */
import Constants from 'expo-constants';
import { ReactNode, useState } from 'react';
import { Animated, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoldBtn } from '@/components/hold-btn';
import { RiseIn } from '@/components/motion';
import { ReorderRows } from '@/components/reorder-rows';
import { FullScreen, Sheet } from '@/components/sheet';
import { Envelope, pickAndRead, saveAndShare } from '@/data/backup';
import { hasRadio, isSimRadio, sayGoodbye } from '@/data/buddy-radio';
import { FIRST_UPS } from '@/data/buddy-sync';
import { DEFAULT_GROUPS, DEFAULT_KINDS } from '@/data/exercises';
import { dismissRestAlarms, ensureAlarmPermission } from '@/data/rest-alarm';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useDark, useThemed } from '@/design/theme';
import {
  color,
  font,
  motion,
  radius,
  t,
  ThemeMode,
  ThemeName,
  THEMES,
  themeSwatch,
  tracking,
} from '@/design/tokens';
import { Btn, H2, H4, H6, Seg } from '@/design/ui';
import { resolveNames, STORAGE_VERSION, useStore } from '@/store/workout-store';

/** Rest lengths worth a tap. 0 is the timer off — see `restSeconds`. */
const RESTS = [0, 60, 90, 120, 180, 300];

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

/**
 * The keys that ship with the app, by list. A row whose key is in here keeps
 * its name and its place editable but loses its × — see `ReorderRow.fixed`.
 */
const SEEDED = {
  group: new Set(DEFAULT_GROUPS.map((g) => g.key)),
  kind: new Set(DEFAULT_KINDS.map((k) => k.key)),
};

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

  /** A validated backup waiting on the hold-to-restore confirm. */
  const [pendingRestore, setPendingRestore] = useState<Envelope | null>(null);

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
        fixed: SEEDED[field].has(g.key),
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

  /**
   * Switching it on here is the calmest place to ask Android for the
   * permission — the user just said they want it. Switching it off clears the
   * tray with it, so a rest already announced doesn't outlive the setting;
   * <RestAlarm> cancels anything still scheduled on its own.
   */
  const setRestAlert = (on: boolean) => {
    patch({ restAlert: on });
    if (on) ensureAlarmPermission();
    else dismissRestAlarms();
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
    // Refused before the confirm ever shows: a hold-to-restore that would be
    // declined afterwards is a trick, not a safeguard. The store checks again
    // at the seam, so the message can never race the stamp.
    if (env.v > STORAGE_VERSION) return setNote(L.restoreNewer);
    // Confirm at the last possible moment — with the file already in hand, so
    // the question is about this backup rather than about the idea of one.
    // In the app's own grammar: the most destructive action here is the one
    // place that used to get an unthemed OS alert with a tap-to-confirm.
    setPendingRestore(env);
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

        {/* Only ever consulted when a session is shared — but it belongs here
            rather than in the session, because it is the answer you want the
            app to already know by the time you're both standing at the rack.
            The live session gets its own copy it can change (see `firstUp`). */}
        <Text style={styles.rowLabel}>{L.whoFirst}</Text>
        <Seg
          options={FIRST_UPS.map((p) => ({
            key: p,
            label: p === 'host' ? L.firstHost : p === 'random' ? L.firstRandom : L.firstAsk,
            on: s.firstUpDefault === p,
            pick: () => patch({ firstUpDefault: p }),
          }))}
        />
        <Text style={styles.hint}>{L.whoFirstHint}</Text>

        <ToggleRow
          label={L.hapticsLabel}
          hint={L.hapticsHint}
          on={s.haptics}
          set={(v) => patch({ haptics: v })}
        />
        <ToggleRow
          label={L.restAlertLabel}
          hint={L.restAlertHint}
          on={s.restAlert}
          set={setRestAlert}
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

        <Fold label={L.muscleGroups}>
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
        </Fold>

        <Fold label={L.equipment}>
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
        </Fold>

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

        {/* The danger corner: next to restore-from-backup in spirit, past
            everything people come here weekly for. Reopening the tour is safe
            in itself — it drafts locally — but *finishing* it re-applies the
            routine picks, which is why it lives down here and says so. */}
        <H6 style={styles.head}>{L.dangerHead}</H6>
        <Pressable
          onPress={() => patch({ onboardingOpen: true, settingsOpen: false })}
          style={styles.actionRow}
        >
          <Text style={styles.actionLabel}>{L.rerunSetup}</Text>
          <Text style={styles.hint}>{L.rerunSetupHint}</Text>
        </Pressable>

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

      {pendingRestore && (
        <RestoreConfirm
          onConfirm={() => {
            const n = importState(pendingRestore);
            setNote(n === null ? L.restoreNewer : L.restoreDone.replace('{n}', String(n)));
            setPendingRestore(null);
          }}
          onClose={() => setPendingRestore(null)}
        />
      )}
    </FullScreen>
  );
}

/**
 * The hold-to-restore confirm. Its own component so `useBackClose` mounts
 * with it — registered last, so Android back closes the question before it
 * closes Settings.
 */
function RestoreConfirm({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const styles = useThemed(sheet);
  const { L } = useStore();
  useBackClose(onClose);
  return (
    <Sheet zIndex={5} onClose={onClose}>
      <H4>{L.restoreTitle}</H4>
      <Text style={styles.confirmBody}>{L.restoreBody}</Text>
      <HoldBtn variant="primary" label={L.holdRestore} onConfirm={onConfirm} style={styles.confirmHold} />
      <Btn variant="secondary" block label={L.cancel} onPress={onClose} />
    </Sheet>
  );
}

/**
 * A section that starts folded — the two list sections, and only those.
 *
 * Twenty muscle groups and five equipment kinds are a screen and a half of
 * rows, sitting between the settings people change twice a week and the ones
 * they came here for once. They are the same rows either way; what folding
 * buys is that Data and About are now a scroll rather than a hunt.
 *
 * Folded is local state and resets with the overlay: which lists you had open
 * last week is not a preference, and persisting it would mean a `PERSIST` key
 * for a caret.
 *
 * The header carries the heading's own spacing so a folded section leaves the
 * same gap an unfolded one does — `foldHead`'s 18 + 4 is `head`'s 22, and the
 * body's 4 + 4 is its 8.
 */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  const styles = useThemed(sheet);
  const [open, setOpen] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));

  // Fired from the handler rather than an effect, the way <Btn> settles its
  // press scale: one gesture, one animation, no render in between.
  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(spin, {
      toValue: next ? 1 : 0,
      ...motion.move,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={styles.foldHead}
      >
        <H6 style={styles.foldLabel}>{label}</H6>
        <Animated.Text
          style={[
            styles.foldCaret,
            {
              transform: [
                {
                  rotate: spin.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-90deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        >
          ▾
        </Animated.Text>
      </Pressable>
      {/* Unfolding is a riseIn, the way every other block of content arrives
          here; folding is a cut, because there is nothing left to watch. */}
      {open && <RiseIn style={styles.foldBody}>{children}</RiseIn>}
    </View>
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
  confirmBody: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.neutral400,
    marginTop: 8,
  },
  confirmHold: { marginTop: 16, height: 42, marginBottom: 8 },
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

  foldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    paddingVertical: 4,
  },
  // Takes the row, so the caret stays pinned right whatever the label is in.
  foldLabel: { flex: 1, color: color.neutral500 },
  foldCaret: { fontFamily: font.regular, fontSize: 11, color: color.accent },
  foldBody: { marginTop: 4 },

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
