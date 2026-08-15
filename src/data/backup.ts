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
 * A file also arrives the other way now — tapped in a chat app, which launches
 * Spotter through the intent filter in `app.json` — so reading one is two
 * functions rather than one: `pickAndRead` for the picker the user opened
 * deliberately, `readFile` for a URI that showed up on its own.
 *
 * This module only does files. What goes in the envelope, and what a restore
 * means, is the store's business.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
// The one thing the current API cannot do — read an arbitrary `content://`.
// See `readFile`, which is the only caller and says why.
import * as Legacy from 'expo-file-system/legacy';
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
 * The extension, and the one thing here that is a bet rather than a fact.
 *
 * Android has no way for an app to mint a file type: the MIME type of a
 * document is decided by whichever app is *sending* it, from its own extension
 * table. `.sptr` is in nobody's table, so a phone that receives one falls back
 * — usually to `application/octet-stream`, and that is a fallback rather than a
 * standard, so it is not the same answer everywhere.
 *
 * Which is why the filter in `app.json` claims octet-stream *as well as* the
 * type this file honestly is. The cost is Spotter turning up in *Open with*
 * for any unknown binary on the phone; the envelope check is what makes that
 * harmless rather than dangerous, and a wrong tap costs one sheet.
 *
 * The share below still declares `application/json`, because that is what the
 * bytes are — and if the sending app honours a declared type instead of
 * re-deriving one from the name, that is the claim that carries it.
 *
 * If a sender turns out to guess something else again, the fix is `.sptr.json`:
 * the extension doubled rather than replaced, so the last one is the `.json`
 * every table on earth agrees about. Same mark, no bet.
 */
const EXT = '.sptr';

/**
 * Where a file handed in from outside is staged so it can be read at all — see
 * `readFile`. One fixed name because only one file is ever in flight (the
 * intake slot is one URI deep), and it is deleted the moment it has been read.
 */
const STAGE = 'intake.tmp';

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
    // Date first, and no `spotter-` prefix: the extension carries the name now,
    // and saying it twice reads as an accident rather than a decision.
    const file = new File(Paths.cache, `${saved.toISOString().slice(0, 10)}${EXT}`);
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
 * Say only what this module can prove about a piece of text: whether it is a
 * backup. Shared by the two ways something arrives from outside — a file that
 * was tapped, and a message that was shared — so both are judged by one rule.
 */
export function classifyText(text: string): { text: string; env: Envelope | null } {
  try {
    const raw: unknown = JSON.parse(text);
    return { text, env: isEnvelope(raw) ? raw : null };
  } catch {
    // Not JSON at all, which is the ordinary case for a shared chat message —
    // and not a failure: that is what the plan-in-prose path is for.
    return { text, env: null };
  }
}

/**
 * Read a file and say only what this module can prove: whether it is a backup.
 *
 * Two kinds of Spotter file arrive here — a backup, which proves itself with
 * the envelope, and a coach plan, which does not have one and does not need
 * one: `parsePlan` already finds its block inside arbitrary prose, so anything
 * that isn't a backup is handed back as text for the caller to try. Deciding
 * only the half that is provable is what keeps the coach out of this module.
 *
 * `null` means the bytes could not be read at all. A file whose text isn't
 * JSON is *not* a failure — that is the plan-in-prose case.
 *
 * The read has to happen promptly — the grant that came with the intent lives
 * and dies with the activity that received it, so the URI is worth nothing
 * stored.
 *
 * **The file is staged in the cache first, always, rather than read where it
 * lies.** `new File(content://…).text()` looks like it should work, and does
 * for about half of the providers out there, which is the trap: it calls
 * `exists()` on the way in, and expo-file-system resolves a content URI through
 * `DocumentFile` — `fromSingleUri` when the first path segment is `document`,
 * `fromTreeUri` otherwise. A chat app's URI is neither
 * (`content://com.whatsapp.provider.media/item/…`), and `fromTreeUri` throws on
 * a URI that is not a tree. The stream underneath would have been fine; it
 * never gets that far, and the failure surfaces as "could not be read" for
 * files that are perfectly readable.
 *
 * The legacy module keeps the branch that works — a plain
 * `contentResolver.openInputStream` for any content scheme — so the copy goes
 * through it and the text is read off a `file://` afterwards. Which is also
 * exactly what `copyToCacheDirectory` does for the document picker, and why
 * `pickAndRead` never hit this.
 *
 * Copying unconditionally rather than branching on the URI's shape is the
 * point: one path that behaves the same for every provider beats one that
 * works until someone shares from an app nobody tested.
 */
export async function readFile(
  uri: string
): Promise<{ text: string; env: Envelope | null } | null> {
  const stage = new File(Paths.cache, STAGE);
  try {
    await Legacy.copyAsync({ from: uri, to: stage.uri });
    return classifyText(await stage.text());
  } catch {
    return null;
  } finally {
    // Read once, kept never: this is someone's whole diary sitting in a
    // directory the OS may hand to anything, and the copy has done its job by
    // the time the text is in hand.
    try {
      if (stage.exists) stage.delete();
    } catch {}
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
 *
 * This is the deliberate half of the two ways in, and it stays backup-only:
 * someone who came to Settings to restore a backup asked a narrower question
 * than someone who tapped a file in a chat. The tap goes through `readFile`.
 */
export async function pickAndRead(): Promise<Envelope | 'cancelled' | 'invalid'> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return 'cancelled';
    return (await readFile(res.assets[0].uri))?.env ?? 'invalid';
  } catch {
    return 'invalid';
  }
}
