/**
 * Something handed to Spotter from another app.
 *
 * Renders nothing until one arrives — it exists to own the handoff, the way
 * <RestAlarm> owns the alarm. Two ways in, and they cover the two things a chat
 * app can give you:
 *
 * - **a file, tapped** (`+native-intent` lifts the URI off the intent). Export a
 *   backup to a chat or a drive, tap it there weeks later, and it comes back in
 *   here rather than into "no supported app found".
 * - **a message, shared** (`share-text.ts`). Hold the AI's reply, Share,
 *   Spotter — which is the coach's whole loop without a clipboard, and the
 *   reason that bridge needs a native module at all.
 *
 * Both end as text, so everything past the first step is one path — and two
 * payloads come out of it, because only one of them can prove what it is:
 *
 * - an **envelope** is a backup, and lands on the same hold-to-restore confirm
 *   the picker in Settings asks through;
 * - **anything else** is offered to `parsePlan`, and a coach plan found in it is
 *   handed to <CoachOverlay> to preview — which is why a plan needs no file
 *   format of its own. The AI already writes that block; a file containing it,
 *   with or without prose around it, is a plan.
 *
 * Neither path writes anything on its own. The backup waits on a hold and the
 * plan waits on Import, so the worst a wrong tap costs is a sheet to dismiss.
 */
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import {
  RestoreSheet,
  restoreLine,
  type RestoreOutcome,
} from '@/components/overlays/restore-sheet';
import { Sheet } from '@/components/sheet';
import { classifyText, type Envelope, readFile } from '@/data/backup';
import { parsePlan } from '@/data/coach';
import { type Incoming, offerText, subscribeIncoming, takeIncoming } from '@/data/intake';
import { onSharedText, takeSharedText } from '@/data/share-text';
import { themed, useThemed } from '@/design/theme';
import { color, font } from '@/design/tokens';
import { Btn, H4 } from '@/design/ui';
import { useBackClose } from '@/hooks/use-back-close';
import { useStore } from '@/store/workout-store';

/**
 * What there is to say once the file has been read. A reason rather than a
 * finished sentence, so the line follows a language switch like every other
 * string instead of freezing in whichever one was on when the file landed.
 */
type Outcome =
  | { kind: 'unreadable' }
  | { kind: 'unknown' }
  | { kind: 'restored'; outcome: RestoreOutcome };

export function Intake() {
  const { L, hydrated, patch } = useStore();

  /** What is being worked on, drained out of the module slot. */
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  /** A validated backup waiting on the hold. */
  const [asked, setAsked] = useState<Envelope | null>(null);
  const [said, setSaid] = useState<Outcome | null>(null);

  /**
   * Drain the slot: once at mount, which is the cold-start case — the intent
   * was handled before React existed — and then on every notification, which is
   * a tap while the app was already open.
   */
  useEffect(() => {
    const drain = () => {
      const next = takeIncoming();
      if (next) setIncoming(next);
    };
    const stop = subscribeIncoming(drain);
    // A share is pulled the same way but from the native module, which holds
    // the cold-start one until something asks — there is no intent seam for it
    // the way `+native-intent` is one for a file.
    const stopShare = onSharedText(offerText);
    const shared = takeSharedText();
    if (shared) offerText(shared);
    drain();
    return () => {
      stop();
      stopShare();
    };
  }, []);

  /**
   * `patch`, readable from inside the read effect without joining its deps —
   * a dep on a store handle would re-read the file on every render. Updated in
   * an effect, per the compiler.
   */
  const writeRef = useRef({ patch });
  useEffect(() => {
    writeRef.current = { patch };
  });

  /**
   * Held until `hydrated`, and that is the whole reason this waits at all: a
   * restore replaces the durable slice, and doing it before the phone's own blob
   * has come back would be overwritten by the hydration a beat later.
   */
  useEffect(() => {
    if (!incoming || !hydrated) return;
    let alive = true;
    // A share is already text; a file has to be fetched first. Both end in the
    // same classification, so everything below this line is one path.
    const got =
      incoming.kind === 'text'
        ? Promise.resolve(classifyText(incoming.text))
        : readFile(incoming.uri);
    got.then((read) => {
      if (!alive) return;
      setIncoming(null);
      if (!read) return setSaid({ kind: 'unreadable' });
      // The sheet handles a backup from a newer build itself — it is the one
      // place that knows what each answer would do, so it is the one place that
      // says which of them are available.
      if (read.env) return setAsked(read.env);
      // Not a backup — so it gets one chance at being a plan. The coach owns
      // the preview and the import; this only decides that there is something
      // there worth opening it for.
      if (parsePlan(read.text).ok) {
        writeRef.current.patch({ coachOpen: true, coachIntake: read.text });
        return;
      }
      setSaid({ kind: 'unknown' });
    });
    return () => {
      alive = false;
    };
  }, [incoming, hydrated]);

  if (asked)
    return (
      <RestoreSheet
        env={asked}
        zIndex={91}
        onDone={(outcome) => {
          setAsked(null);
          setSaid({ kind: 'restored', outcome });
        }}
        onClose={() => setAsked(null)}
      />
    );

  if (said) return <Note outcome={said} L={L} onClose={() => setSaid(null)} />;
  return null;
}

/**
 * One line about a file, and the way out. Its own component for `useBackClose`,
 * like every other sheet — and a sheet rather than Settings' quiet `note` line
 * because nobody who tapped a file in a chat app is looking at Settings.
 */
function Note({
  outcome,
  L,
  onClose,
}: {
  outcome: Outcome;
  L: ReturnType<typeof useStore>['L'];
  onClose: () => void;
}) {
  const styles = useThemed(sheet);
  useBackClose(onClose);
  const done = outcome.kind === 'restored';
  return (
    <Sheet zIndex={91} maxHeight="70%" onClose={onClose}>
      <H4>{done ? L.intakeDoneTitle : L.intakeTitle}</H4>
      <Text style={styles.body}>
        {outcome.kind === 'restored'
          ? restoreLine(outcome.outcome, L)
          : outcome.kind === 'unreadable'
            ? L.intakeUnreadable
            : L.intakeUnknown}
      </Text>
      <Btn variant="secondary" block label={L.close} style={styles.close} onPress={onClose} />
    </Sheet>
  );
}

const sheet = themed(() => ({
  body: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.neutral400,
    marginTop: 8,
  },
  close: { marginTop: 16 },
}));
