/**
 * Put the running emulators (back) on the sim-radio version: a fresh Metro
 * with EXPO_PUBLIC_SIM_RADIO, and Expo Go force-reloaded on every emulator
 * so it refetches the current JS. Windows-only, like the rest of the tooling.
 *
 *   npm run update:emu
 *
 * Exists because the failure mode is silent: a stale Metro process keeps
 * port 8081, the emulators keep loading exp://127.0.0.1:8081 from it, and
 * code changes never arrive. This kills the old Metro (only if it's a node
 * process), starts a fresh one in its own window, and cold-restarts the app.
 * Emulators must already be running — `npm run start:emu` boots them.
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

const log = (m) => console.log(`[update:emu] ${m}`);
const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8' });

/* — SDK + running emulators — */

const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'E:\\android-sdk']
  .filter(Boolean)
  .find((c) => existsSync(path.join(c, 'platform-tools', 'adb.exe')));
if (!sdk) {
  log('no adb found (checked ANDROID_HOME, E:\\android-sdk)');
  process.exit(1);
}
const adb = path.join(sdk, 'platform-tools', 'adb.exe');

const serials = run(adb, ['devices'])
  .split(/\r?\n/)
  .map((l) => l.match(/^(emulator-\d+)\tdevice$/)?.[1])
  .filter(Boolean);
if (!serials.length) {
  log('no running emulators — boot them first with `npm run start:emu`');
  process.exit(1);
}
log(`emulators: ${serials.join(', ')}`);

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

// The port opens before Metro can actually serve — reloading then makes
// Expo Go silently fall back to its cached (stale) bundle. /status says
// when it's really ready.
const metroReady = async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${METRO_PORT}/status`);
    return (await res.text()).includes('packager-status:running');
  } catch {
    return false;
  }
};

const deadline = Date.now() + 120_000;
while (!(await metroReady()) && Date.now() < deadline)
  await new Promise((res) => setTimeout(res, 2000));
if (!(await metroReady())) {
  log('Metro never came up — check its window');
  process.exit(1);
}

/* — wire each emulator and cold-restart the app so it refetches the JS — */

for (const serial of serials) {
  for (const port of [METRO_PORT, RELAY_PORT])
    try {
      run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    } catch {
      log(`adb reverse failed for ${serial} port ${port}`);
    }
  try {
    run(adb, ['-s', serial, 'shell', 'am', 'force-stop', 'host.exp.exponent']);
    run(adb, ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `exp://127.0.0.1:${METRO_PORT}`, 'host.exp.exponent']);
    log(`${serial} reloaded`);
  } catch {
    log(`${serial}: could not open Expo Go — is it installed? (first run: press a in Metro)`);
  }
}

log('done — the emulators are fetching the current sim-radio bundle');
