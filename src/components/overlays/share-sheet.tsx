/**
 * Share a workout — a picture of one logged session, handed to Android.
 *
 * A preview, two segs (which card, which shape), the content switches, a folded
 * Look, and one Share button that opens **Android's own share sheet**: the
 * user picks where it goes — a story, a post, a friend — and the app writes no
 * target of its own. That is Calvin's call and it is also the cheaper one:
 * `expo-sharing` is already in the tree for backups, it works in Expo Go, and
 * the system sheet already knows which apps are installed and which contacts
 * you message most. What it gives up is a caption, which would need an Intent
 * with `EXTRA_TEXT`; the card carries everything a caption would have said.
 *
 * The preview *is* the export at a smaller width: the same `<ShareCard>` is
 * drawn a second time, off-glass and exactly 1080 pixels wide, only while
 * Share is being answered, and `toDataURL` reads that one. See
 * `design/share-workout-mockup.html`.
 *
 * Opened from two doors (`s.share.from`). From Plan it starts on the Log card,
 * the card that panel already is, and a type picked there is not remembered —
 * the summary opens on whatever you last shared from the summary.
 */
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type Svg from 'react-native-svg';

import { RiseIn } from '@/components/motion';
import { EXPORT_W, ShareCard } from '@/components/share-card';
import { Sheet } from '@/components/sheet';
import { DICT, LANG_NAME, themeKey, type Lang } from '@/data/i18n';
import { cardFileName, cardOf, prefsOf, type CardType } from '@/data/share-card';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useDark, useThemed } from '@/design/theme';
import { color, font, paletteOf, slop, THEMES, themeSwatch, type ThemeName } from '@/design/tokens';
import { Btn, Chip, H5, H6, Seg } from '@/design/ui';
import { resolveNames, useStore } from '@/store/workout-store';

/** The preview's width per shape — a story is tall, so it is drawn narrower. */
const PREVIEW_W = { story: 180, post: 262 } as const;

export function ShareSheet() {
  const styles = useThemed(sheet);
  const c = useColors();
  const appDark = useDark();
  const { s, L, ex, routine, closeShare, setShareCard } = useStore();
  const prefs = prefsOf(s.shareCard);
  const from = s.share?.from ?? 'summary';
  const [type, setType] = useState<CardType>(from === 'plan' ? 'log' : prefs.type);
  // Asked every time, never stored: the name belongs to someone who didn't
  // press Share.
  const [buddy, setBuddy] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);
  const exportRef = useRef<Svg>(null);

  useBackClose(closeShare);

  const at = s.share?.at ?? -1;
  const entry = s.history[at];
  if (!entry) return null;

  // The card's own look: whatever was chosen, else the app's.
  const lang: Lang = prefs.look.lang ?? s.lang;
  const dark = prefs.look.mode ? prefs.look.mode === 'dark' : appDark;
  const theme: ThemeName = prefs.look.theme ?? s.theme;
  const cardColors = paletteOf(theme, dark);
  const CL = DICT[lang] ?? DICT.en;
  const custom =
    prefs.look.lang !== undefined ||
    prefs.look.mode !== undefined ||
    prefs.look.theme !== undefined;

  // Names in the card's language, plainly — the missing-translation grey is a
  // hint to the owner, and on a picture for strangers it would read as a bug.
  const nameOf = (id: string) => {
    const e = ex(id);
    return e ? resolveNames(e.names, lang, e.name).text || e.name : id;
  };
  const r = routine(entry.rid);
  // What it was called that day wins, as on Plan's day panel.
  const title = entry.name?.trim() || (r ? resolveNames(r.names, lang).text : '') || CL.freeSession;

  const model = cardOf({
    history: s.history,
    at,
    ex,
    nameOf,
    title,
    L: CL,
    lang,
    weights: prefs.weights,
    buddy,
  });
  const card = {
    model,
    type,
    shape: prefs.shape,
    exercises: prefs.exercises,
    body: prefs.body,
    sex: s.profile.sex,
    c: cardColors,
  };

  const pickType = (t: CardType) => {
    setType(t);
    if (from === 'summary') setShareCard({ type: t });
  };

  /** Read the off-glass copy once it has been laid out, write it, hand it over. */
  const capture = () => {
    const svg = exportRef.current;
    if (!svg) return;
    svg.toDataURL(async (b64) => {
      try {
        const file = new File(Paths.cache, cardFileName(entry.date, title));
        // Same name twice in a day is the same card again; overwrite it rather
        // than letting the cache grow a copy per tap.
        file.create({ overwrite: true });
        file.write(b64, { encoding: 'base64' });
        if (!(await Sharing.isAvailableAsync())) throw new Error('no share target');
        await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: L.shareTitle });
      } catch {
        setFailed(true);
      } finally {
        setExporting(false);
      }
    });
  };

  const share = () => {
    setFailed(false);
    setExporting(true);
  };

  const lookLine = `${LANG_NAME[lang]} · ${dark ? L.modeDark : L.modeLight} · ${L[themeKey(theme)]}`;

  return (
    <>
      <Sheet onClose={closeShare} zIndex={90} maxHeight="92%">
        <H5>{L.shareTitle}</H5>

        <View style={styles.preview}>
          <ShareCard {...card} width={PREVIEW_W[prefs.shape]} />
        </View>

        <View style={styles.segs}>
          <Seg
            options={(['highlights', 'log'] as const).map((t) => ({
              key: t,
              label: t === 'log' ? L.shareLog : L.shareHighlights,
              on: type === t,
              pick: () => pickType(t),
            }))}
          />
          <Seg
            options={(['story', 'post'] as const).map((sh) => ({
              key: sh,
              label: sh === 'story' ? L.shareStory : L.sharePost,
              on: prefs.shape === sh,
              pick: () => setShareCard({ shape: sh }),
            }))}
          />
        </View>

        <H6 style={styles.head}>{L.shareOnCard}</H6>
        {/* A switch that means nothing on this card is not drawn: Log has no
            list to hide (it *is* the list) and no figure. */}
        {type === 'highlights' && (
          <SwitchRow
            label={L.shareExercises}
            on={prefs.exercises}
            set={(v) => setShareCard({ exercises: v })}
          />
        )}
        <SwitchRow
          label={L.shareWeights}
          on={prefs.weights}
          set={(v) => setShareCard({ weights: v })}
        />
        {type === 'highlights' && (
          <SwitchRow label={L.shareBody} on={prefs.body} set={(v) => setShareCard({ body: v })} />
        )}
        {!!entry.buddy && (
          <SwitchRow
            label={L.shareBuddy.replace('{name}', entry.buddy)}
            hint={L.shareOnce}
            on={buddy}
            set={setBuddy}
          />
        )}

        {/* Folded, with its value on the fold: most cards go out in the app's
            own look, and three rows of choices shouldn't stand between you
            and Share every time. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: lookOpen }}
          onPress={() => setLookOpen((o) => !o)}
          style={styles.fold}
        >
          <Text style={styles.foldLabel}>{L.shareLook}</Text>
          <Text style={styles.foldValue} numberOfLines={1}>
            {lookLine}
          </Text>
          <Text style={[styles.caret, lookOpen && styles.caretOpen]}>▾</Text>
        </Pressable>
        {lookOpen && (
          <RiseIn style={styles.look}>
            <View style={styles.lookRow}>
              <Text style={styles.lookKey}>{L.language}</Text>
              <View style={styles.chips}>
                {(['en', 'de'] as const).map((code) => (
                  <Chip
                    key={code}
                    label={LANG_NAME[code]}
                    on={lang === code}
                    onPress={() => setShareCard({ look: { ...prefs.look, lang: code } })}
                  />
                ))}
              </View>
            </View>
            <View style={styles.lookRow}>
              <Text style={styles.lookKey}>{L.mode}</Text>
              <View style={styles.chips}>
                {(['dark', 'light'] as const).map((m) => (
                  <Chip
                    key={m}
                    label={m === 'dark' ? L.modeDark : L.modeLight}
                    on={dark === (m === 'dark')}
                    onPress={() => setShareCard({ look: { ...prefs.look, mode: m } })}
                  />
                ))}
              </View>
            </View>
            <View style={styles.lookRow}>
              <Text style={styles.lookKey}>{L.colourTheme}</Text>
              <View style={styles.swatches}>
                {THEMES.map((th) => {
                  const sw = themeSwatch(th.key, dark);
                  const on = theme === th.key;
                  return (
                    <Pressable
                      key={th.key}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={L[themeKey(th.key)]}
                      hitSlop={slop}
                      onPress={() => setShareCard({ look: { ...prefs.look, theme: th.key } })}
                      style={[styles.disc, { backgroundColor: sw.bg, borderColor: sw.surface }]}
                    >
                      <View style={[styles.discDot, { backgroundColor: sw.accent }]} />
                      {on && (
                        <View
                          style={[styles.discRing, { borderColor: c.text }]}
                          pointerEvents="none"
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {custom && (
              <Btn
                variant="ghost"
                label={L.shareMatchApp}
                style={styles.match}
                labelStyle={styles.matchLabel}
                onPress={() => setShareCard({ look: {} })}
              />
            )}
          </RiseIn>
        )}

        <Btn
          variant="primary"
          block
          label={L.share}
          disabled={exporting}
          style={styles.shareBtn}
          onPress={share}
        />
        <Text style={styles.note}>{failed ? L.shareFailed : L.shareNote}</Text>
      </Sheet>

      {/* The export: the same card again, laid out at exactly 1080 pixels —
          `toDataURL` draws a view at its own laid-out size — and never on the
          glass. It exists only while Share is being answered. */}
      {exporting && (
        <View
          pointerEvents="none"
          style={styles.offGlass}
          onLayout={() => requestAnimationFrame(capture)}
        >
          <ShareCard {...card} width={EXPORT_W / PixelRatio.get()} svgRef={exportRef} />
        </View>
      )}
    </>
  );
}

function SwitchRow({
  label,
  hint,
  on,
  set,
}: {
  label: string;
  hint?: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  // The whole row is the switch: the label is the thing a thumb aims at, and
  // a row that ignores it reads as broken.
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={() => set(!on)}
      style={styles.switchRow}
    >
      <Text style={styles.switchLabel} numberOfLines={1}>
        {label}
        {hint ? <Text style={styles.switchHint}>{`  ${hint}`}</Text> : null}
      </Text>
      <Switch
        value={on}
        onValueChange={set}
        trackColor={{ false: c.neutral800, true: c.accent700 }}
        thumbColor={on ? c.accent : c.neutral500}
      />
    </Pressable>
  );
}

const DISC = 26;

const sheet = themed(() => ({
  preview: { alignItems: 'center', marginTop: 12 },
  segs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  head: { marginTop: 16, marginBottom: 2, color: color.neutral500 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  switchLabel: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.text },
  switchHint: { fontSize: 11.5, color: color.neutral600 },
  fold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  foldLabel: { fontFamily: font.regular, fontSize: 14, color: color.text },
  foldValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.neutral500,
  },
  caret: {
    fontFamily: font.regular,
    fontSize: 11,
    color: color.accent,
    transform: [{ rotate: '-90deg' }],
  },
  caretOpen: { transform: [{ rotate: '0deg' }] },
  look: { gap: 10, paddingTop: 12 },
  lookRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lookKey: { width: 72, fontFamily: font.regular, fontSize: 12.5, color: color.neutral500 },
  chips: { flexDirection: 'row', gap: 6 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discDot: { width: DISC / 2, height: DISC / 2, borderRadius: DISC / 4 },
  discRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: DISC / 2 + 4,
    borderWidth: 1.5,
  },
  match: { alignSelf: 'flex-end' },
  matchLabel: { fontSize: 12.5 },
  shareBtn: { marginTop: 18 },
  note: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    textAlign: 'center',
    marginTop: 8,
  },
  /** Behind everything and transparent — laid out, never seen. */
  offGlass: { position: 'absolute', top: 0, left: 0, opacity: 0, zIndex: -1 },
}));
