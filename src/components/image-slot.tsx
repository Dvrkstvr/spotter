/**
 * <image-slot> from the design, as a React Native component.
 *
 * The web original is filled by dragging an image file onto it; the Android
 * equivalent is a tap that opens the photo picker. Empty-state chrome follows
 * the original: an 8%-grey frame, a 1.5px dashed ring, and a centred glyph and
 * caption at the original's opacities.
 */
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { ImageGlyph } from '@/components/icon';
import { fill, font, wash } from '@/design/tokens';
import { useStore } from '@/store/workout-store';

export type SlotShape = 'rect' | 'rounded' | 'circle' | 'pill';

export function ImageSlot({
  id,
  shape = 'rounded',
  cornerRadius = 12,
  placeholder,
  style,
}: {
  /** Persistence key — must be unique across the app. */
  id: string;
  shape?: SlotShape;
  /** Corner radius for shape="rounded". */
  cornerRadius?: number;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { s, patch } = useStore();
  const uri = s.images[id];

  const br =
    shape === 'circle' || shape === 'pill' ? 9999 : shape === 'rounded' ? cornerRadius : 0;

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (res.canceled) return;
    patch((st) => ({ images: { ...st.images, [id]: res.assets[0].uri } }));
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
            <ImageGlyph color={wash.text(45)} />
            <Text style={styles.caption} numberOfLines={2}>
              {placeholder}
            </Text>
          </View>
          <View pointerEvents="none" style={[styles.ring, { borderRadius: br }]} />
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: 'rgba(127, 127, 127, 0.08)' },
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
});
