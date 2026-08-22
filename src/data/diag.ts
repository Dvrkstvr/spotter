/**
 * The diagnostics log — what the app did, in the order it did it.
 *
 * Everything this app gets wrong that is worth chasing happens somewhere a
 * debugger cannot follow: a link healing in a gym, a rest alarm firing through
 * a locked screen, a session coming back after Android killed the process, two
 * phones disagreeing about whose set it is. By the time anyone can describe it,
 * the evidence is a memory of what the screen looked like. This writes it down
 * as it happens instead.
 *
 * Four rules shape the whole module:
 *
 * - **It records events, not state.** A set ticked, a rest scheduled, a proof
 *   refused, a payload sent. Never the per-second clock and never a drag's
 *   per-frame steps — the same argument the saver's dirty check makes about
 *   `elapsed`: a log that writes everything is unreadable, and reading it is
 *   the entire point.
 * - **Every line carries both clocks.** Wall time and the session's `elapsed`,
 *   because half of what is worth chasing here is precisely those two
 *   disagreeing — a screen lock, a resume, a buddy's rest re-anchored on
 *   arrival. One clock would make those lines say nothing.
 * - **It is off unless someone turned it on**, and it is a *setting*
 *   (`diag` in the store), so a phone that is not being tested spends nothing:
 *   `dlog` returns on its first line.
 * - **It never leaves the phone by itself.** No upload, nothing in a backup,
 *   nothing in a buddy snapshot — the same rule set marks follow. It goes out
 *   when the user exports it, and only there.
 *
 * ## Where the bytes live
 *
 * Two places, and the split is the one interesting thing in here.
 *
 * The **live log** is a file in the app's own document directory, appended
 * through a small in-memory buffer. That is what survives a process death, so
 * it has to be somewhere writing is cheap and unconditional.
 *
 * The **export** is a copy of that file written into a folder the user picked
 * (see `pickFolder`) — Calvin's `Development/Spotter`, so a buddy's log can be
 * fetched with the Files app after the workout instead of being mailed. It has
 * to be a *copy* rather than the live file itself, because a SAF document
 * cannot be cheaply appended: every write is open-truncate-write-close through
 * a content provider, and doing that per event would cost more than the feature
 * is worth. So the live log is fast and private, and the folder gets a whole
 * file at the moments worth exporting — a finished session, or the button.
 *
 * The grant SAF hands back is persistable and this module takes it that way, so
 * `diagDir` in the store survives a restart. It can still be revoked out from
 * under us — the folder is deleted, storage is cleared — and every write here
 * answers that with `false` rather than throwing, so the export row can say so
 * and offer the picker again.
 *
 * ## What is in a line
 *
 * `2026-08-21T17:42:03.115Z  12:40  buddy  payload sent  t=progress ok=true`
 *
 * Wall time to the millisecond, the session clock (`—` outside a session), the
 * tag, the message, then flat `key=value` fields. Flat on purpose: two logs from
 * two phones are read side by side, and JSON objects do not line up by eye.
 *
 * ## What is in the header
 *
 * Enough to tell two logs apart and to know what build produced each: the app
 * version, which radio this install actually runs, the language, the rest
 * length, whether alarms and haptics are on. Without it, "their rest never
 * showed" cannot be told apart from "their rest length is zero".
 *
 * Names are in it, because a log with `buddy=` and no name cannot be lined up
 * against the other phone's. Nothing else identifying is: `selfId` is written
 * short, and no set, weight or note ever reaches a line — what someone lifted
 * is diary, and this is a machine transcript.
 */
import { Directory, File, Paths } from 'expo-file-system';
// SAF lives only in the legacy module — the same reason `backup.ts` reaches for
// it. Nothing in the current API can be handed a user-picked tree.
import * as Legacy from 'expo-file-system/legacy';

/**
 * The areas a line can come from. Coarse on purpose — a tag is what you filter
 * by when scanning a hundred lines, so the useful number of them is small.
 */
export type DiagTag =
  | 'app' // launch, hydration, foreground/background
  | 'ses' // a session's life: start, tick, finish, resume
  | 'rest' // the countdown and its alarm
  | 'buddy' // the radio, the handshake, every message
  | 'plan' // rules, skips, the resolver
  | 'data' // persistence, backups, intake
  | 'err'; // anything that was caught

/** One recorded moment, before it becomes a line. */
type Entry = {
  /** wall clock, ms since epoch */
  at: number;
  /** the session clock in seconds, or null outside a session */
  elapsed: number | null;
  tag: DiagTag;
  msg: string;
  fields?: Record<string, unknown>;
};

/**
 * What the file is allowed to grow to before the older half is dropped.
 *
 * A ring rather than a cap, because the interesting lines are almost always the
 * last ones — the failure is what you came for, and the launch three days ago is
 * not. 512 KB is somewhere around six thousand lines, which is far more than one
 * workout writes and small enough to paste into a chat.
 */
const MAX_BYTES = 512 * 1024;
/** How much survives a rotation — the newest third, so the trim is rare. */
const KEEP_BYTES = Math.floor(MAX_BYTES / 3);

/** How long a cold line waits for company before it costs a disk write. */
const FLUSH_MS = 1200;

const DIR = 'diag';
const FILE = 'spotter.log';

/* ── module state ──────────────────────────────────────────────────────────
 *
 * Deliberately module-level rather than in the store: `dlog` is called from
 * places that have no hook to read with — a listener registered once, a
 * `catch` in a data module, the intake seam that runs before the tree exists.
 * The store owns the *setting*; `<Diagnostics>` mirrors it in here.
 */

/**
 * The `diag` setting, mirrored — with a third state that earns its keep.
 *
 * `null` is *undecided*, which is where every launch starts: the setting lives
 * in the persisted blob, so nothing knows the answer until hydration lands, and
 * the most valuable lines in the file — what the blob held, whether a session
 * resumed, how far its clock was advanced — all happen before that. Dropping
 * them would mean the one launch worth recording is the one that records
 * nothing.
 *
 * So while it is null, lines are held in `preroll` (bounded), and the first
 * `setDiagOn` either takes them or throws them away. After that the answer is
 * settled for the process and `dlog` returns on its first line, which is the
 * "off costs nothing" rule intact — it just starts one beat later than it looks.
 */
let on: boolean | null = null;
/** Lines recorded before the setting was known. Dropped unless it turns out on. */
let preroll: Entry[] = [];
/** How many of those are kept. Hydration is a handful; this is slack, not a budget. */
const PREROLL_MAX = 200;
/** The session clock, mirrored, so every line can carry it without being told. */
let elapsed: number | null = null;
/** Lines waiting on the debounce. */
let queue: Entry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
/**
 * The write in flight. Appends are serialised through it: two flushes racing on
 * one file is how a log ends up interleaved mid-line.
 */
let writing: Promise<void> = Promise.resolve();

/** What the header says about the build that wrote the file. */
export type DiagHeader = Record<string, string | number | boolean>;
let header: DiagHeader = {};

const file = () => new File(new Directory(Paths.document, DIR), FILE);

/** Two digits, and hours only once there are any — the session clock's format. */
const clock = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const h = Math.floor(m / 60);
  const mm = h ? String(m % 60).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
};

/**
 * A field's value, flattened to one token.
 *
 * Long strings are cut rather than wrapped: a line that wraps stops being
 * scannable, and no field here is worth more than a glance. `undefined` fields
 * are dropped by the caller loop, so an optional value costs nothing to pass.
 */
const val = (v: unknown): string => {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const cut = v.length > 60 ? `${v.slice(0, 57)}…` : v;
    // Quoted only when it would otherwise break the key=value scan.
    return /[\s=]/.test(cut) ? JSON.stringify(cut) : cut;
  }
  try {
    return JSON.stringify(v)?.slice(0, 60) ?? '?';
  } catch {
    return '?';
  }
};

const format = (e: Entry): string => {
  const fields = e.fields
    ? Object.entries(e.fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${val(v)}`)
        .join(' ')
    : '';
  return [
    new Date(e.at).toISOString(),
    (e.elapsed === null ? '—' : clock(e.elapsed)).padStart(7),
    e.tag.padEnd(5),
    e.msg,
    fields,
  ]
    .join('  ')
    .trimEnd();
};

/* ── the call every site makes ─────────────────────────────────────────── */

/**
 * Record one moment.
 *
 * Never throws and never awaits — it is called from listeners, from `catch`
 * blocks and from the middle of a gesture, and a diagnostic that can break the
 * thing it is diagnosing is worse than none.
 *
 * `hot` writes through immediately instead of waiting out the debounce. It is
 * for the moments whose whole point is that the process might not survive them:
 * a session's life, a link going down, a caught error. Everything else rides
 * along on the next flush, which is what keeps a workout's logging down to a
 * handful of disk writes.
 */
export function dlog(
  tag: DiagTag,
  msg: string,
  fields?: Record<string, unknown>,
  hot?: boolean
): void {
  if (on === false) return;
  const entry: Entry = { at: Date.now(), elapsed, tag, msg, fields };
  if (on === null) {
    // Undecided — hold it until hydration says. Oldest goes first, since the
    // point of the pre-roll is the launch that is still happening.
    preroll.push(entry);
    if (preroll.length > PREROLL_MAX) preroll.shift();
    return;
  }
  queue.push(entry);
  if (hot) {
    void flush();
    return;
  }
  timer ??= setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS);
}

/** Shorthand for the shape every `catch` wants. Always hot. */
export function dwarn(tag: DiagTag, msg: string, err: unknown): void {
  dlog(
    tag,
    msg,
    { err: err instanceof Error ? err.message : String(err) },
    true
  );
}

/* ── the switches `<Diagnostics>` drives ───────────────────────────────── */

/** Turn recording on or off, and settle the undecided state if it is still open. */
export function setDiagOn(next: boolean): void {
  if (next === on) return;
  const first = on === null;
  on = next;
  if (first) {
    // The launch's own lines, settled at last. Kept only if recording is on —
    // a phone that opted out never wrote them anywhere.
    if (next) queue.push(...preroll);
    preroll = [];
  }
  // Both directions flush: on, to get the pre-roll down before anything else
  // happens; off, because the lines are already recorded and the moment someone
  // reaches for the switch is usually just after what they wanted logged.
  void flush();
}

/** The session clock, so a line never has to be handed one. */
export function setDiagClock(secs: number | null): void {
  elapsed = secs;
}

/** What the header prints. Replaced whole — the caller builds it from state. */
export function setDiagHeader(h: DiagHeader): void {
  header = h;
}

/* ── the file ──────────────────────────────────────────────────────────── */

/**
 * UTF-8, by hand.
 *
 * Appending needs bytes (`FileHandle.writeBytes`), and this runtime has no
 * `TextEncoder`: Hermes doesn't ship one and Expo's winter runtime installs
 * `TextDecoder` and `TextEncoderStream` but not the encoder itself. Twenty
 * lines here beat a polyfill dependency for one call site — and the lines this
 * writes are nearly all ASCII, with the exception that matters being a German
 * routine or buddy name, which is exactly what the multi-byte branches cover.
 *
 * Lone surrogates are written as U+FFFD rather than dropped: a mangled name
 * must not be able to shift every byte after it.
 */
const utf8 = (s: string): Uint8Array => {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    let c = s.codePointAt(i)!;
    // `codePointAt` returns the combined code point (≥ 0x10000) for a
    // well-formed pair, so anything it hands back in the surrogate range is by
    // definition unpaired — replace it, and never consume the next char.
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    else if (c > 0xffff) i += 1; // a well-formed pair; codePointAt read both halves
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000)
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f)
      );
  }
  return new Uint8Array(out);
};

/**
 * Push the queue to disk, trimming if the file has outgrown its cap.
 *
 * **Appended through a file handle rather than rewritten**, which is the one
 * performance decision in the module worth stating: `File.write` replaces, so
 * the obvious version reads the whole log back and writes it out again on every
 * flush — half a megabyte of IO, up to once a second, during exactly the
 * activity being measured. Seeking to the end and writing the batch is O(the
 * batch). The rewrite survives as the fallback for a handle that won't open,
 * and as the trim, which genuinely has to rewrite.
 *
 * Serialised through `writing` so two callers cannot interleave — two flushes
 * racing on one handle is how a log ends up with half a line inside another.
 * Failures are swallowed: nothing upstream has a better answer than carrying on.
 */
export function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return writing;
  const batch = queue;
  queue = [];
  writing = writing
    .then(async () => {
      const text = `${batch.map(format).join('\n')}\n`;
      try {
        const dir = new Directory(Paths.document, DIR);
        if (!dir.exists) dir.create({ intermediates: true });
        const f = file();
        if (!f.exists) {
          f.create();
          f.write(text);
          return;
        }
        // `size` is the cheap question; reading the file back is not, which is
        // why the trim only happens when the cap is actually reached. Keeping
        // the newest third rather than trimming to the line makes this rare.
        if ((f.size ?? 0) + text.length > MAX_BYTES) {
          const kept = f.textSync().slice(-KEEP_BYTES);
          // Start at a line boundary, or the first line of the trimmed log is
          // half a line and reads as corruption.
          const from = kept.indexOf('\n');
          f.write(`… earlier lines dropped\n${from >= 0 ? kept.slice(from + 1) : kept}${text}`);
          return;
        }
        const h = f.open();
        try {
          h.offset = h.size ?? f.size ?? 0;
          h.writeBytes(utf8(text));
        } finally {
          h.close();
        }
      } catch {
        // A handle that would not open, on a file that exists: fall back to the
        // whole-file rewrite rather than lose the batch.
        try {
          const f = file();
          f.write((f.exists ? f.textSync() : '') + text);
        } catch {
          /* nothing upstream can do about it */
        }
      }
    })
    .catch(() => {});
  return writing;
}

/** The header block that tops every export. */
const headerText = (): string => {
  const rows = Object.entries(header).map(([k, v]) => `# ${k}: ${String(v)}`);
  return [
    '# Spotter diagnostics',
    `# exported: ${new Date().toISOString()}`,
    ...rows,
    '#',
    '# time (UTC)              clock  tag    what happened',
    '',
  ].join('\n');
};

/** The whole log as text — header, then every line still in the ring. */
export async function diagText(): Promise<string> {
  await flush();
  try {
    const f = file();
    return headerText() + (f.exists ? f.textSync() : '(nothing recorded)\n');
  } catch {
    return `${headerText()}(the log could not be read)\n`;
  }
}

/** Throw the log away. The switch's companion — a fresh test starts clean. */
export async function clearDiag(): Promise<void> {
  queue = [];
  await writing;
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    /* it was already unreadable */
  }
}

/* ── the folder ────────────────────────────────────────────────────────── */

/**
 * Ask for a folder to export into, once.
 *
 * Android will not let an app write into shared storage by a path, and that is
 * the right call — so the user picks the folder and the grant is persisted
 * against it. Returns the tree URI to store, or null if they backed out.
 */
export async function pickFolder(): Promise<string | null> {
  try {
    const res = await Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync();
    return res.granted ? res.directoryUri : null;
  } catch (e) {
    dwarn('data', 'diag folder pick failed', e);
    return null;
  }
}

/**
 * A picked folder, as something a person recognises.
 *
 * A SAF tree URI is
 * `content://com.android.externalstorage.documents/tree/primary%3ADevelopment%2FSpotter`,
 * and showing that in a settings row would be showing the machine's answer to a
 * question the user asked about their own phone. The tail after the volume name
 * is the path they picked, so that is what the row says. Anything that doesn't
 * decode falls back to the raw URI rather than to nothing — a folder that reads
 * oddly is still a folder you can tell you have set.
 */
export const folderLabel = (uri: string): string => {
  try {
    const tail = decodeURIComponent(uri.split('/tree/')[1] ?? uri);
    const path = tail.includes(':') ? tail.slice(tail.indexOf(':') + 1) : tail;
    return path || tail;
  } catch {
    return uri;
  }
};

/**
 * What a written file is called: date, time, and whose phone it came off.
 *
 * The name is the whole reason two logs can be told apart once they are sitting
 * in one folder on a laptop — which is the errand this feature exists for. A
 * timestamp alone would leave you opening both to find out which is which.
 */
export const diagFileName = (who: string, at: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}` +
    `-${p(at.getHours())}${p(at.getMinutes())}`;
  // Whatever the user called themselves has to survive being a filename.
  const name = who.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '');
  return `spotter-${stamp}${name ? `-${name}` : ''}.log`;
};

/**
 * Write the log into the picked folder.
 *
 * A fresh document each time rather than overwriting one: a workout's log is a
 * record of that workout, and the errand is comparing two of them. SAF invents
 * `name (1)` when a name is taken, which is a fine answer to two exports in the
 * same minute.
 *
 * `false` means the grant is gone or the write failed — the caller offers the
 * picker again rather than guessing which.
 */
export async function exportToFolder(dirUri: string, who: string): Promise<string | null> {
  try {
    const name = diagFileName(who);
    const text = await diagText();
    const uri = await Legacy.StorageAccessFramework.createFileAsync(dirUri, name, 'text/plain');
    await Legacy.writeAsStringAsync(uri, text);
    return name;
  } catch (e) {
    dwarn('data', 'diag export failed', e);
    return null;
  }
}
