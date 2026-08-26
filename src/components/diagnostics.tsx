/**
 * The diagnostics harness — mounted once beside the overlays, renders nothing.
 *
 * Owns the side-effecting half of `src/data/diag.ts` the way <RestAlarm> owns
 * the alarm and <BuddyRadio> owns the radio: the module is called from places
 * with no hook to read from — a listener registered once, a `catch` inside a
 * data module — so something has to keep it in step with the store. That is
 * this.
 *
 * **Most of what it records, it derives.** A transition in state is a fact the
 * store already holds, and watching one here costs nothing at the site that
 * caused it: a session appearing, a rest being stamped or skipped, a link going
 * up or down. Only what leaves no trace in state gets a `dlog` where it happens
 * — a payload sent, a proof refused, an alarm handed to Android — because those
 * are events rather than values, and by the next render they are over.
 *
 * That split is deliberate and worth keeping. A store littered with logging
 * calls is a store where the logging and the behaviour drift apart; a component
 * that reads transitions can only ever report what actually happened.
 *
 * Outside the `social` gate, like <RestAlarm>: the buddy half switching off is
 * itself one of the things worth having in the file.
 */
import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { hasRadio, isSimRadio } from '@/data/buddy-radio';
import { dlog, exportToFolder, flush, setDiagClock, setDiagHeader, setDiagOn } from '@/data/diag';
import { myName, useStore } from '@/store/workout-store';

/**
 * How long the automatic export waits after a session ends.
 *
 * The teardown of a shared workout — the goodbye, the link coming down, the
 * radio restarting — lands in the seconds *after* the last set is filed, and an
 * export on the instant cuts every one of them off. Twenty seconds covers it
 * with room to spare and is still well inside the time anyone spends putting
 * their phone away.
 */
const EXPORT_SETTLE_MS = 20_000;

export function Diagnostics() {
  const { s, totals, hydrated } = useStore();

  /* — the switch, first: nothing below records anything while it is off — */

  // Gated on hydration, because the pre-hydration `s.diag` is the seed (false),
  // and settling the undecided state to it would take/discard the preroll
  // before the real persisted value is known — dropping the store's own
  // `hydrated` line and `app/launched`, the most valuable lines in the file.
  // The first `setDiagOn` after hydration is the one that claims the preroll.
  useEffect(() => {
    if (!hydrated) return;
    setDiagOn(s.diag);
    if (s.diag) dlog('app', 'diagnostics on', undefined, true);
  }, [hydrated, s.diag]);

  /* — the second clock every line carries — */

  // `elapsed` ticks every second, so this effect runs every second and does one
  // assignment. That is the whole cost of a session clock on every line, and it
  // is what makes a log from two phones comparable at all.
  useEffect(() => {
    setDiagClock(s.session ? s.elapsed : null);
  }, [s.session, s.elapsed]);

  /* — the header: what build wrote this file, and whose phone it is — */

  const who = myName(s);
  useEffect(() => {
    setDiagHeader({
      who,
      // Short: enough to tell two installs apart in a log, not the whole id.
      self: s.selfId.slice(0, 8),
      // Which build wrote the file, in the two ways it can be asked: the number
      // Play and the phone read, and the name this release goes by. Both are
      // stated once in `app.json` — the header claimed the version long before
      // it carried it, which is exactly the line you want when two phones on
      // two builds disagree about a link.
      version: Constants.expoConfig?.version ?? '?',
      ...(Constants.expoConfig?.extra?.buildName
        ? { buildName: String(Constants.expoConfig.extra.buildName) }
        : {}),
      build: hasRadio ? (isSimRadio ? 'sim' : 'standalone') : 'expo-go',
      lang: s.lang,
      restSeconds: s.restSeconds,
      restAlert: s.restAlert,
      haptics: s.haptics,
      privateMode: s.privateMode,
      firstUp: s.firstUpDefault,
      routines: s.routines.length,
      sessionsLogged: s.history.length,
    });
  }, [
    who,
    s.selfId,
    s.lang,
    s.restSeconds,
    s.restAlert,
    s.haptics,
    s.privateMode,
    s.firstUpDefault,
    s.routines.length,
    s.history.length,
  ]);

  /* — the app's own life — */

  useEffect(() => {
    dlog('app', 'launched', undefined, true);
    const sub = AppState.addEventListener('change', (st) => {
      dlog('app', `state ${st}`, undefined, true);
      // Android suspends the JS thread on a lock, and a process killed while
      // backgrounded takes the queue with it — the same argument the store's
      // saver makes about flushing on background.
      if (st !== 'active') void flush();
    });
    return () => sub.remove();
  }, []);

  /* — the session — */

  /**
   * The live totals, kept one render behind the transition that needs them.
   *
   * `totals()` reads the *current* session, and by the time the end-of-session
   * effect runs there isn't one — so asking it there reported `0 of 0` for
   * every workout ever logged. The numbers have to be captured while the
   * session is still standing, which is what this is.
   */
  const totalsRef = useRef({ done: 0, all: 0, vol: 0 });
  const live = s.session ? totals() : null;
  useEffect(() => {
    if (live) totalsRef.current = live;
  });

  const session = s.session;
  const prevSession = useRef<typeof session>(null);
  const dir = s.diagDir;
  // The switch gates the automatic export too: with diagnostics off there is no
  // visible row to stop it (Settings hides them), so a picked folder alone must
  // not keep writing a log — buddy names and all — after the feature is off.
  const diagOn = s.diag;
  // The settle timer below, cleared only when the app goes away — which is also
  // the one case where there is nothing left to export from.
  const exportAt = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prev = prevSession.current;
    prevSession.current = session;
    if (session && !prev) {
      dlog(
        'ses',
        'session started',
        {
          rid: session.rid ?? 'free',
          name: session.name,
          ex: session.list.length,
          // A session that arrives already minimized is a resumed one — the
          // store lands it that way on purpose, and it is the single most
          // useful thing to be able to tell apart in this file.
          resumed: s.sessionMin || undefined,
          elapsed: s.elapsed || undefined,
        },
        true
      );
      return;
    }
    if (!session && prev) {
      const t = totalsRef.current;
      dlog('ses', 'session ended', { sets: t.done, of: t.all, vol: Math.round(t.vol) }, true);
      // The log's natural unit is a workout, so this is the moment to put a
      // copy in the folder: after a shared session both phones have written
      // their file and the buddy's can be fetched with the Files app. Only
      // when a folder was picked — the export row is the manual half.
      //
      // **After a settle, not on the instant**, and the first real logs are
      // what taught this: the file written the moment a session ends stops at
      // this very line, and the goodbye, the link coming down and the teardown
      // all land in the twenty seconds after it — which for a shared workout is
      // the most interesting part of the file. The cost is a force-close inside
      // that window losing the automatic copy, which the Save row answers.
      if (dir && diagOn)
        exportAt.current = setTimeout(() => {
          void exportToFolder(dir, who).then((n) => dlog('data', 'log exported', { file: n }));
        }, EXPORT_SETTLE_MS);
    }
    // `who` and the totals are read at the moment of a transition rather than
    // watched; joining them would re-fire this on every ticked set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(
    () => () => {
      if (exportAt.current) clearTimeout(exportAt.current);
    },
    []
  );

  /* — the set, the exercise, and the two clocks around a rest — */

  /**
   * A set landing is the event this file was missing.
   *
   * Everything a workout does hangs off it — the rest, the alarm, the turn, the
   * buddy's next broadcast — and until now it could only be inferred from a
   * rest being stamped, which meant a drop set or a superset (the two cases
   * that deliberately earn no rest) left no trace at all. Derived from the
   * count rather than logged at the tick, so it costs the store nothing and
   * catches an untick as readily as a tick.
   */
  const done = live?.done ?? 0;
  const prevDone = useRef(0);
  useEffect(() => {
    const was = prevDone.current;
    prevDone.current = done;
    // A session ending takes the count to zero, and that is not an untick.
    if (!session || done === was) return;
    dlog('ses', done > was ? 'set logged' : 'set unticked', { done, of: totalsRef.current.all });
  }, [done, session]);

  /**
   * Which exercise — and **only when it changes.**
   *
   * This used to depend on `s.session`, which is copy-on-write, so every
   * keystroke and every frame of a number drag re-fired it: 281 of the 616
   * lines in the first real log were this one line repeating `i=1`. That is
   * precisely the per-frame recording the module's own rules forbid.
   */
  const active = s.active;
  const hasSession = !!session;
  useEffect(() => {
    if (hasSession) dlog('ses', 'exercise', { i: active });
  }, [active, hasSession]);

  /**
   * How many exercises the session holds, which is not a constant: one can be
   * added mid-workout, adopted from the buddy, or removed. Without it an
   * `active` the routine's own length cannot explain — the first log showed
   * `i=5` in a session that started with five — is unanswerable after the fact.
   */
  const listLen = session?.list.length ?? 0;
  useEffect(() => {
    if (listLen) dlog('ses', 'list', { n: listLen });
  }, [listLen]);

  const rest = s.rest;
  const prevRest = useRef<typeof rest>(null);
  useEffect(() => {
    const prev = prevRest.current;
    prevRest.current = rest;
    if (rest && !prev) dlog('rest', 'started', { at: rest.at, secs: s.restSeconds });
    // A rest replaced by a fresh one used to fall through every branch and log
    // nothing — so a workout with twenty rests in it recorded two. `at` is what
    // identifies a rest, exactly as <RestAlarm> reads it.
    else if (rest && prev && rest.at !== prev.at)
      dlog('rest', 'restarted', { at: rest.at, secs: s.restSeconds });
    else if (rest && prev && rest.skipped && !prev.skipped) dlog('rest', 'skipped');
    else if (!rest && prev) dlog('rest', 'cleared', { wasSkipped: prev.skipped });
    // `restSeconds` is read at the transition, not watched: changing the
    // setting mid-rest is not the start of one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest]);

  /* — the buddy: the link, the pairing, and the shape of the shared session — */

  const endpoint = s.buddyEndpoint;
  useEffect(() => {
    dlog('buddy', endpoint ? 'link up' : 'link down', { endpoint: endpoint ?? undefined }, true);
  }, [endpoint]);

  useEffect(() => {
    dlog('buddy', 'pairing', { buddy: s.buddy ?? 'none' }, true);
  }, [s.buddy]);

  useEffect(() => {
    dlog('buddy', 'shared session', { shared: s.sessionShared, role: s.sessionRole ?? 'none', join: s.buddyJoin ?? 'none' });
  }, [s.sessionShared, s.sessionRole, s.buddyJoin]);

  // How many of them the radio can currently see. The reconnect ticker only
  // fires for a buddy who is *in* this list, so an empty one during a drop is
  // the difference between "not discovered" and "discovered, request failing"
  // — two completely different bugs that look identical from the screen.
  const peers = s.nearbyPeers.length;
  useEffect(() => {
    dlog('buddy', 'peers visible', { n: peers });
  }, [peers]);

  return null;
}
