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
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { hasRadio, isSimRadio } from '@/data/buddy-radio';
import { dlog, exportToFolder, flush, setDiagClock, setDiagHeader, setDiagOn } from '@/data/diag';
import { myName, useStore } from '@/store/workout-store';

export function Diagnostics() {
  const { s, totals } = useStore();

  /* — the switch, first: nothing below records anything while it is off — */

  useEffect(() => {
    setDiagOn(s.diag);
    if (s.diag) dlog('app', 'diagnostics on', undefined, true);
  }, [s.diag]);

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

  const session = s.session;
  const prevSession = useRef<typeof session>(null);
  const dir = s.diagDir;
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
      const t = totals();
      dlog('ses', 'session ended', { sets: t.done, of: t.all, vol: Math.round(t.vol) }, true);
      // The log's natural unit is a workout, so this is the moment to put a
      // copy in the folder: after a shared session both phones have written
      // their file and the buddy's can be fetched with the Files app. Only
      // when a folder was picked — the export row is the manual half.
      if (dir) void exportToFolder(dir, who).then((n) => dlog('data', 'log exported', { file: n }));
    }
    // `totals` and `who` are read at the moment of a transition rather than
    // watched; joining them would re-fire this on every ticked set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /* — which exercise, and the two clocks around a rest — */

  useEffect(() => {
    if (s.session) dlog('ses', 'exercise', { i: s.active });
  }, [s.active, s.session]);

  const rest = s.rest;
  const prevRest = useRef<typeof rest>(null);
  useEffect(() => {
    const prev = prevRest.current;
    prevRest.current = rest;
    if (rest && !prev) dlog('rest', 'started', { at: rest.at, secs: s.restSeconds });
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
