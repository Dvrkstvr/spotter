/**
 * The diary as one file.
 *
 * Everything durable lives in a single AsyncStorage blob (see `PERSIST` in the
 * store), which makes a backup almost free — but it also means the only copy
 * of a year's training is inside one app's private storage on one phone. This
 * is the way out: the same blob, wrapped in an envelope that says what it is,
 * handed to the share sheet.
 *
 * The envelope is not decoration. A restore overwrites real training, so the
 * file has to be able to prove it is a Spotter backup rather than any other
 * JSON the picker let through, and it has to carry the storage version it was
 * written at so an old backup can be migrated forward instead of loaded raw.
 *
 * This module only does files. What goes in the envelope, and what a restore
 * means, is the store's business.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type Envelope = {
  app: 'spotter';
  /** the STORAGE_KEY version the data was written at */
  v: number;
  /** ISO timestamp, for the human reading the file name */
  saved: string;
  data: Record<string, unknown>;
};

const isEnvelope = (raw: unknown): raw is Envelope =>
  typeof raw === 'object' &&
  raw !== null &&
  (raw as Envelope).app === 'spotter' &&
  // The version is load-bearing — it decides which migrations run and whether
  // the file is from a newer build — so a file that lost it is not provably a
  // backup any more, and must not take the loaded-raw path by default.
  Number.isFinite((raw as Envelope).v) &&
  typeof (raw as Envelope).data === 'object' &&
  (raw as Envelope).data !== null;

/**
 * Write the backup and hand it to the share sheet. Cache rather than documents
 * on purpose: the share sheet copies it wherever the user is actually keeping
 * it, and a stale export left in app storage is just another thing to leak.
 */
export async function saveAndShare(
  data: Record<string, unknown>,
  v: number,
  dialogTitle: string
): Promise<boolean> {
  try {
    const saved = new Date();
    const env: Envelope = { app: 'spotter', v, saved: saved.toISOString(), data };
    const file = new File(Paths.cache, `spotter-${saved.toISOString().slice(0, 10)}.json`);
    // Two exports on the same day land on the same name, and `create` throws
    // on an existing file unless told otherwise.
    file.create({ overwrite: true });
    file.write(JSON.stringify(env));
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick a backup and read it back.
 *
 * The picker is left unfiltered rather than asking for `application/json`:
 * a file that has been round-tripped through a chat app or a cloud drive
 * routinely comes back as octet-stream, and a filter that hides the user's own
 * backup is worse than one that shows too much. The envelope check is the real
 * gate, and it happens here.
 */
export async function pickAndRead(): Promise<Envelope | 'cancelled' | 'invalid'> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return 'cancelled';
    const raw: unknown = JSON.parse(await new File(res.assets[0].uri).text());
    return isEnvelope(raw) ? raw : 'invalid';
  } catch {
    return 'invalid';
  }
}
