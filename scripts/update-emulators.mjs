/**
 * Put the running instances (back) on the sim-radio version: a fresh Metro
 * with EXPO_PUBLIC_SIM_RADIO, and Expo Go force-reloaded on every one of them
 * so it refetches the current JS. Windows-only, like the rest of the tooling.
 *
 *   npm run update:emu
 *   npm run update:emu -- --phone   — the cabled phone too (see start:emu)
 *
 * Exists because the failure mode is silent: a stale Metro process keeps
 * port 8081, the emulators keep loading exp://127.0.0.1:8081 from it, and
 * code changes never arrive. This kills the old Metro (only if it's a node
 * process), starts a fresh one in its own window, and cold-restarts the app.
 * The instances must already be up — `npm run start:emu` boots them.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELAY_PORT = Number(process.env.BUDDY_RELAY_PORT ?? 8787);
const METRO_PORT = 8081;
const APP = 'host.exp.exponent';

const wantPhone = process.argv.slice(2).includes('--phone');

const log = (m) => console.log(`[update:emu] ${m}`);
const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8' });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/* — SDK + running emulators — */

const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'E:\\android-sdk']
  .filter(Boolean)
  .find((c) => existsSync(path.join(c, 'platform-tools', 'adb.exe')));
if (!sdk) {
  log('no adb found (checked ANDROID_HOME, E:\\android-sdk)');
  process.exit(1);
}
const adb = path.join(sdk, 'platform-tools', 'adb.exe');

const devices = run(adb, ['devices'])
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.trim().split(/\s+/))
  .filter(([serial, state]) => serial && state === 'device')
  .map(([serial]) => serial);

// The phone is opt-in here for the same reason it is in start:emu — tethering
// keeps it on the cable, and a plain reload must not take it over. Passing
// `--phone` covers the instance `start:phone` opened, which would otherwise be
// the one thing left on stale code: exactly what this script exists to prevent.
const serials = devices.filter((s) => s.startsWith('emulator-') || (wantPhone && !s.includes(':')));
if (!serials.length) {
  log(
    wantPhone
      ? 'nothing to reload — no running emulator and no phone on the cable'
      : 'no running emulators — boot them first with `npm run start:emu` (`--phone` includes the cable)',
  );
  process.exit(1);
}
log(`targets: ${serials.join(', ')}`);

/* — a fresh Metro: kill whatever node process holds 8081, start our own — */

const portUp = (port) =>
  new Promise((res) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => {
      sock.destroy();
      res(true);
    });
    sock.on('error', () => res(false));
    sock.setTimeout(1000, () => {
      sock.destroy();
      res(false);
    });
  });

const pidOnPort = (port) => {
  const line = run('netstat', ['-ano'])
    .split(/\r?\n/)
    .find((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
  return line ? Number(line.trim().split(/\s+/).at(-1)) : null;
};

const pid = pidOnPort(METRO_PORT);
if (pid) {
  const name = run('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'])
    .split(',')[0]
    ?.replaceAll('"', '')
    .toLowerCase();
  if (name !== 'node.exe') {
    log(`port ${METRO_PORT} is held by ${name ?? 'an unknown process'} (pid ${pid}) — not killing it, aborting`);
    process.exit(1);
  }
  log(`killing old Metro (pid ${pid}) — a stale one serves stale code`);
  run('taskkill', ['/PID', String(pid), '/F']);
}

// detached + ignored stdio, or the `cmd /k` windows inherit this process's
// pipes and keep it alive after its work is done
const openWindow = (command, env) =>
  spawn(command, { shell: true, cwd: repoRoot, env, detached: true, stdio: 'ignore' }).unref();

if (!(await portUp(RELAY_PORT))) {
  log(`opening the buddy relay in its own window (:${RELAY_PORT})`);
  openWindow('start "buddy relay" cmd /k node scripts\\buddy-relay.mjs');
}

log('starting Metro with the sim radio (its own window)');
openWindow('start "metro (sim radio)" cmd /k "set EXPO_PUBLIC_SIM_RADIO=1&& npx expo start --go --localhost"', {
  ...process.env,
  ANDROID_HOME: sdk,
  PATH: `${path.join(sdk, 'platform-tools')};${process.env.PATH}`,
});

// The port opens before Metro can actually serve. /status isn't enough either
// — it answers as soon as the HTTP server binds, about a second before the dev
// server can produce a manifest, and Expo Go asked inside that gap opens its
// LauncherActivity and closes it again. Ask for the very thing Expo Go fetches;
// serving that is the only proof Metro is ready for it.
const metroReady = async () => {
  try {
    const status = await fetch(`http://127.0.0.1:${METRO_PORT}/status`);
    if (!(await status.text()).includes('packager-status:running')) return false;
    const res = await fetch(`http://127.0.0.1:${METRO_PORT}/`, {
      headers: { 'expo-platform': 'android', accept: 'application/expo+json,application/json' },
    });
    if (!res.ok) return false;
    const manifest = await res.json();
    return Boolean(manifest.launchAsset?.url ?? manifest.bundleUrl);
  } catch {
    return false;
  }
};

const deadline = Date.now() + 120_000;
while (!(await metroReady()) && Date.now() < deadline) await sleep(1000);
if (!(await metroReady())) {
  log('Metro never came up — check its window');
  process.exit(1);
}

/* — wire each emulator and cold-restart the app so it refetches the JS — */

// These get polled in loops, where one adb hiccup must not abort the run.
const probe = (serial, args) => {
  try {
    return run(adb, ['-s', serial, ...args]);
  } catch (e) {
    return e.stdout ?? '';
  }
};

const topActivity = (serial) =>
  probe(serial, ['shell', 'dumpsys', 'activity', 'activities'])
    .split(/\r?\n/)
    .find((l) => l.includes('topResumedActivity=')) ?? '';

// Teardown passes through a moment where nothing is resumed at all, so "not
// Expo Go any more" is true well before the activity manager has finished.
// Something else being genuinely resumed is what says it's done.
const foregroundSettled = (serial) => {
  const top = topActivity(serial);
  return Boolean(top) && !top.includes('null') && !top.includes(APP);
};

// ExperienceActivity is the loaded app. LauncherActivity is only the doorway:
// when Expo Go can't get the experience from the dev server it shows for a few
// hundred ms and closes again, never handing over. So the handover — not the
// package being in front — is what says the reload worked.
const experienceIsUp = (serial) => topActivity(serial).includes('ExperienceActivity');

const until = async (cond, ms) => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (cond()) return true;
    await sleep(150);
  }
  return cond();
};

// Don't poll for the package to stay in front: the LauncherActivity handover
// leaves about a second with nothing resumed at all, which reads as a crash.
// Wait for the experience to arrive, then check it sticks around.
const staysUp = async (serial) => {
  if (!(await until(() => experienceIsUp(serial), 20_000))) return false;
  const stop = Date.now() + 2000;
  while (Date.now() < stop) {
    await sleep(400);
    if (!experienceIsUp(serial)) return false;
  }
  return true;
};

for (const serial of serials) {
  for (const port of [METRO_PORT, RELAY_PORT])
    try {
      run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    } catch {
      log(`adb reverse failed for ${serial} port ${port}`);
    }

  // `am force-stop` returns while the activity manager is still tearing the
  // task down — the launcher only resumes a few hundred ms later. An `am start`
  // fired into that window is swallowed: the app either never appears or comes
  // up without reaching the front. That is why this script used to need running
  // twice — the first run stopped the app and the second, with nothing left to
  // tear down, opened it. Waiting for the launcher to actually be resumed is
  // the real signal; a sleep would just be a guess about someone else's work.
  probe(serial, ['shell', 'am', 'force-stop', APP]);
  if (!(await until(() => foregroundSettled(serial), 10_000)))
    log(`${serial}: nothing took the foreground after force-stop — starting anyway`);

  // Verify rather than assume: `am start` reports success for intents that
  // never produce a visible activity, so the old log lied on exactly the run
  // that failed.
  let up = false;
  for (let attempt = 1; attempt <= 3 && !up; attempt++) {
    const out = probe(serial, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `exp://127.0.0.1:${METRO_PORT}`, APP]);
    if (out.includes('Error:')) log(`${serial}: ${out.trim().split(/\r?\n/).at(-1)}`);
    up = await staysUp(serial);
    if (!up && attempt < 3) log(`${serial}: Expo Go did not stay up (attempt ${attempt}) — retrying`);
  }
  log(up ? `${serial} reloaded` : `${serial}: Expo Go never came to the front — is it installed? (first run: press a in Metro)`);
}

log('done — the emulators are fetching the current sim-radio bundle');
