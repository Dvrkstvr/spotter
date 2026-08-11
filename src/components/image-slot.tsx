/**
 * <image-slot> from the design, as a React Native component.
 *
 * The web original is filled by dragging an image file onto it; the Android
 * equivalent is a tap that opens the photo picker. Empty-state chrome follows
 * the original: an 8%-grey frame, a 1.5px dashed ring, and a centred glyph and
 * caption at the original's opacities.
 *
 * Whatever fills the slot is moved out of the picker/camera cache into the
 * app's document directory first (src/data/photos.ts) — the cache is the
 * OS's to clear, and a reference photo has to outlive it.
 */
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { CAMERA_D, Icon, ImageGlyph } from '@/components/icon';
import { deletePersisted, persistImage } from '@/data/photos';
import { themed, useColors, useThemed } from '@/design/theme';
import { fill, font, radius, slop, wash } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

export type SlotShape = 'rect' | 'rounded' | 'circle' | 'pill';

export function ImageSlot({
  id,
  shape = 'rounded',
  cornerRadius = 12,
  placeholder,
  camera = false,
  cameraLabel,
  style,
}: {
  /** Persistence key — must be unique across the app. */
  id: string;
  shape?: SlotShape;
  /** Corner radius for shape="rounded". */
  cornerRadius?: number;
  placeholder: string;
  /**
   * Offer a shutter button beside the slot as well as the library.
   *
   * Off everywhere but the how-to sheet, and that is the whole point: CAMERA
   * is a dangerous permission, so the dialog has to belong to a moment the
   * user went looking for. Photographing the machine you are standing at, in
   * a sheet you opened to edit, is that moment. Setting a profile picture is
   * not — that slot picks from the library and never mentions the camera.
   */
  camera?: boolean;
  cameraLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemed(sheet);
  const c = useColors();
  const { s, patch } = useStore();
  const uri = s.images[id];

  const br =
    shape === 'circle' || shape === 'pill' ? 9999 : shape === 'rounded' ? cornerRadius : 0;

  const keep = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled) return;
    // Durable copy first; fall back to the cache URI if that fails —
    // better a fragile photo than none.
    const durable = await persistImage(res.assets[0].uri, id).catch(() => res.assets[0].uri);
    const old = uri;
    patch((st) => ({ images: { ...st.images, [id]: durable } }));
    if (old && old !== durable) deletePersisted(old);
  };

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    await keep(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }));
  };

  /**
   * The only place in the app that asks for CAMERA, and it asks here rather
   * than up front on purpose: the permission dialog lands on the tap that
   * asked for it, so the reason is on screen behind it. `mediaTypes: images`
   * keeps this a stills capture, which is what lets RECORD_AUDIO stay blocked
   * — that permission is only wanted for video.
   */
  const shoot = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    await keep(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 }));
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      onPress={pick}
      style={[styles.frame, { borderRadius: br }, style]}
    >
      {uri ? (
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, { borderRadius: br }]} resizeMode="cover" />
      ) : (
        <>
          <View style={styles.empty}>
            <ImageGlyph color={c.wash.text(45)} />
            <Text style={styles.caption} numberOfLines={2}>
              {placeholder}
            </Text>
          </View>
          <View pointerEvents="none" style={[styles.ring, { borderRadius: br }]} />
        </>
      )}

      {/* Inside the frame rather than beside it: three of these sit in the
          how-to sheet, and a row of buttons under each would cost more height
          than the slots themselves. The touch lands on the badge, not the
          slot behind it — nested Pressables give the inner one the responder. */}
      {camera && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cameraLabel}
          onPress={shoot}
          hitSlop={slop}
          style={({ pressed }) => [styles.shutter, pressed && styles.shutterOn]}
        >
          <Icon d={CAMERA_D} size={13} strokeWidth={1.6} color={c.neutral300} />
        </Pressable>
      )}
    </Pressable>
  );
}

const sheet = themed(() => ({
  /** The original's 8%-grey frame — as the same text wash `t.rule` uses, so
      it follows the theme instead of being the app's one literal colour. */
  frame: { overflow: 'hidden', backgroundColor: wash.text(8) },
  /** Bottom-right, on its own scrim so it reads over a photo as well as over
      the empty frame's dashed ring. */
  shutter: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: wash.bg(72),
    borderWidth: 1,
    borderColor: wash.text(14),
  },
  shutterOn: { backgroundColor: wash.accent(30) },
  empty: {
    ...fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  caption: {
    fontFamily: font.heading,
    fontSize: 13,
    lineHeight: 13 * 1.3,
    textAlign: 'center',
    color: wash.text(75),
  },
  ring: {
    ...fill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: wash.text(35),
  },
}));
