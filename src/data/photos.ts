/**
 * Durable storage for user photos.
 *
 * Picker and camera results live in caches Android may clear at any time —
 * fine for a preview, wrong for a reference photo meant to last months. So
 * every filled image slot goes through here: downscaled, recompressed to
 * JPEG, and moved into the app's document directory. The store only ever
 * keeps document-directory URIs (plus whatever survived from before this
 * existed — see `deletePersisted`, which touches nothing it doesn't own).
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest width worth keeping for a full-screen reference photo. */
const PHOTO_PX = 1280;

const dirUri = () => new Directory(Paths.document, 'photos').uri;

/**
 * Persist a just-picked or just-shot image: resized when it's bigger than
 * a screen needs, JPEG'd, and moved out of the cache. Returns the durable
 * file URI to store. Throws when the source can't be read — callers fall
 * back to the fragile cache URI (better a fragile photo than none).
 */
export async function persistImage(uri: string, slotId: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  const sized =
    ref.width > PHOTO_PX
      ? await ImageManipulator.manipulate(ref).resize({ width: PHOTO_PX }).renderAsync()
      : ref;
  const out = await sized.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });

  const dir = new Directory(Paths.document, 'photos');
  dir.create({ intermediates: true, idempotent: true });
  // Timestamped name: a re-pick must change the URI, or Image's cache keeps
  // showing the old photo. The previous file is deleted by the slot.
  const dest = new File(dir, `${slotId.replace(/[^a-z0-9-]/gi, '_')}-${Date.now()}.jpg`);
  new File(out.uri).move(dest);
  return dest.uri;
}

/** Delete a photo this module persisted. Anything else is left alone. */
export function deletePersisted(uri: string | undefined) {
  if (!uri || !uri.startsWith(dirUri())) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // A missing or locked file is fine — it was a cleanup, not a promise.
  }
}
