/**
 * What should come back from a backup — asked from both ways one arrives: the
 * picker in Settings, and a file tapped in another app (`<Intake>`).
 *
 * Two answers, and they are different in kind rather than in degree:
 *
 * - **Add what's missing** is additive and fires on a tap. Anything already on
 *   this phone wins, so the worst it can do is leave rows to delete — which is
 *   what lets it be a tap rather than a hold, and what makes a conflict screen
 *   unnecessary (see `mergePersisted` for the rule).
 * - **Replace everything** is the old behaviour, unchanged and still held. It
 *   is the right answer for a new phone and the wrong one every other time,
 *   which is why it is no longer the only one.
 *
 * Shared rather than written twice: it is the most destructive question in the
 * app, and two copies are two chances for one of them to soften. `zIndex` is a
 * prop because the callers stack it differently — from Settings it only has to
 * clear that screen, from an intake it is over the whole app.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HoldBtn } from '@/components/hold-btn';
import { Sheet } from '@/components/sheet';
import type { Envelope } from '@/data/backup';
import { fmtDateYear, type Strings } from '@/data/i18n';
import { themed, useThemed } from '@/design/theme';
import { color, font, radius, slop } from '@/design/tokens';
import { Btn, H4 } from '@/design/ui';
import { useBackClose } from '@/hooks/use-back-close';
import {
  RESTORE_PARTS,
  type RestoreCounts,
  type RestorePart,
  useStore,
} from '@/store/workout-store';

/** What a restore did, for the caller to say so in its own surface. */
export type RestoreOutcome =
  | { kind: 'replaced'; n: number }
  | { kind: 'added'; counts: RestoreCounts }
  | { kind: 'newer' };

/**
 * The one place an outcome becomes a sentence. Two screens report this and
 * neither owns the wording — the same reason `repeatLabel` is one function.
 */
export function restoreLine(o: RestoreOutcome, L: Strings): string {
  if (o.kind === 'newer') return L.restoreNewer;
  if (o.kind === 'replaced') return L.restoreDone.replace('{n}', String(o.n));
  const { sessions, routines, exercises } = o.counts;
  if (sessions + routines + exercises + o.counts.plan === 0) return L.mergeNothing;
  return L.mergeDone
    .replace('{s}', count(sessions, L.countSession, L.countSessions))
    .replace('{r}', count(routines, L.countRoutine, L.countRoutines))
    .replace('{e}', count(exercises, L.countExercise, L.countExercises));
}

/** Every count here can legitimately be one, so each carries its own agreement. */
const count = (n: number, one: string, many: string) =>
  (n === 1 ? one : many).replace('{n}', String(n));

export function RestoreSheet({
  env,
  onDone,
  onClose,
  zIndex = 5,
}: {
  env: Envelope;
  onDone: (o: RestoreOutcome) => void;
  onClose: () => void;
  zIndex?: number;
}) {
  const styles = useThemed(sheet);
  const { s, L, importState, mergeState, previewRestore } = useStore();
  useBackClose(onClose);

  const counts = previewRestore(env);
  const rows: { part: RestorePart; label: string; n: number; sub: string }[] = counts
    ? [
        {
          part: 'sessions',
          label: L.restorePartSessions,
          n: counts.sessions,
          sub: count(counts.sessions, L.countSession, L.countSessions),
        },
        {
          part: 'library',
          label: L.restorePartLibrary,
          n: counts.routines + counts.exercises,
          sub:
            count(counts.routines, L.countRoutine, L.countRoutines) +
            ', ' +
            count(counts.exercises, L.countExercise, L.countExercises),
        },
        {
          part: 'plan',
          label: L.restorePartPlan,
          n: counts.plan,
          sub: count(counts.plan, L.countRule, L.countRules),
        },
      ]
    : [];

  // Everything ticked to start with, because "add what's missing" is the whole
  // offer and un-ticking is the exception. `on` is what actually decides: a
  // part with nothing in it is never on, so an empty row can't quietly count
  // itself into the action's label or its result.
  const [picked, setPicked] = useState<ReadonlySet<RestorePart>>(() => new Set(RESTORE_PARTS));
  const on = (p: RestorePart) => picked.has(p) && (rows.find((r) => r.part === p)?.n ?? 0) > 0;
  const toggle = (p: RestorePart) => {
    const next = new Set(picked);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPicked(next);
  };

  const taking = new Set(RESTORE_PARTS.filter(on));
  const nothing = rows.every((r) => r.n === 0);

  return (
    <Sheet zIndex={zIndex} maxHeight="88%" onClose={onClose}>
      <H4>{L.restoreAskTitle}</H4>
      <Text style={styles.from}>
        {L.restoreFrom.replace('{date}', fmtDateYear(s.lang, new Date(env.saved)))}
      </Text>

      {counts === null ? (
        <Text style={styles.body}>{L.restoreNewer}</Text>
      ) : (
        <>
          {rows.map((r) => {
            // A row with nothing in it still renders: "no new sessions in this
            // backup" is an answer to the question the sheet asks, where a
            // missing row would read as a feature that isn't there.
            const empty = r.n === 0;
            return (
              <Pressable
                key={r.part}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on(r.part), disabled: empty }}
                disabled={empty}
                hitSlop={slop}
                onPress={() => toggle(r.part)}
                style={styles.row}
              >
                <View style={[styles.tick, on(r.part) && styles.tickOn]}>
                  {on(r.part) && <Text style={styles.tickMark}>✓</Text>}
                </View>
                <Text style={[styles.rowLabel, empty && styles.dim]}>{r.label}</Text>
                <Text style={[styles.rowSub, empty && styles.dim]}>
                  {empty ? L.restoreNoneNew : r.sub}
                </Text>
              </Pressable>
            );
          })}

          <Btn
            variant="primary"
            block
            label={L.restoreAdd}
            disabled={nothing || taking.size === 0}
            style={styles.add}
            onPress={() => {
              const got = mergeState(env, taking);
              onDone(got === null ? { kind: 'newer' } : { kind: 'added', counts: got });
            }}
          />
          {/* The same promise the coach's import makes, in the same words —
              it is the same rule, and two wordings would read as two rules. */}
          <Text style={styles.hint}>{nothing ? L.restoreAllHere : L.addOnlyMissing}</Text>
        </>
      )}

      <Text style={styles.body}>{L.restoreBody}</Text>
      <HoldBtn
        variant="primary"
        destructive
        label={L.holdReplace}
        onConfirm={() => {
          const n = importState(env);
          onDone(n === null ? { kind: 'newer' } : { kind: 'replaced', n });
        }}
        style={styles.hold}
      />
      <Btn variant="secondary" block label={L.cancel} onPress={onClose} />
    </Sheet>
  );
}

const sheet = themed(() => ({
  from: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.neutral500,
    marginTop: 4,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  tick: {
    width: 17,
    height: 17,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { borderColor: color.accent, backgroundColor: color.accent800 },
  tickMark: { fontFamily: font.regular, fontSize: 10, color: color.accent100 },
  rowLabel: { fontFamily: font.regular, fontSize: 13.5, color: color.text },
  rowSub: { marginLeft: 'auto', fontFamily: font.regular, fontSize: 12, color: color.neutral500 },
  dim: { color: color.neutral700 },
  add: { marginTop: 16 },
  hint: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 12 * 1.5,
    color: color.neutral500,
    marginTop: 8,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: color.neutral400,
    marginTop: 20,
  },
  hold: { marginTop: 12, height: 42, marginBottom: 8 },
}));
