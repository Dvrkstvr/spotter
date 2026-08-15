/**
 * One-command buddy-testing setup: boots Android emulator(s) and/or wires up
 * the phone on the USB cable, opens the buddy relay in its own console window,
 * then runs Metro with the sim radio enabled. Windows-only, like the rest of
 * this project's tooling.
 *
 *   npm run start:emu              — boots up to 2 AVDs (buddy testing needs
 *                                    two instances)
 *   npm run start:emu -- 1         — boots just one
 *   npm run start:phone            — the cabled phone is one of the two, so
 *                                    only one AVD is booted (= `-- --phone`)
 *   npm run start:phone -- 0       — no emulator; two cabled phones are the pair
 *   npm run start:phone -- -s XYZ  — one named phone rather than all of them
 *
 * The count is how many emulators to *boot*; everything already attached gets
 * the current bundle either way, because a running instance left on stale code
 * is the silent failure this whole setup exists to avoid.
 *
 * Everything goes through adb, so no LAN address or firewall rule is ever
 * involved: Metro serves on localhost and both its port and the relay port are
 * reverse-forwarded into every target (127.0.0.1:<port> on the device lands on
 * this machine — which also makes the sim radio's derived ws://localhost:8787
 * work from inside it). For the phone that is a path down the cable, so it
 * neither needs nor cares about IP routing and works unchanged while this PC
 * is online *through* that same phone's tethering.
 *
 * The phone runs the app in Expo Go, not the installed Spotter: where the
 * NearbyBuddy native module exists the real radio always wins
 * (src/data/buddy-radio.ts), and an emulator has no Bluetooth to answer it, so
 * a mixed pair only ever meets on the sim. Expo Go keeps its own storage — the
 * diary there is scratch data and the real one is untouched.
 *
 * Everything is skip-if-already-there: running emulators count toward the
 * requested number, and an open relay port means no second relay window.
 * Emulators and the relay window outlive Metro on purpose — booting is the
 * slow part, and the relay window is where the d/l console keys live.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELAY_PORT = Number(process.env.BUDDY_RELAY_PORT ?? 8787);
const METRO_PORT = 8081;
const APP = 'host.exp.exponent';

const log = (m) => console.log(`[start:emu] ${m}`);
const die = (m) => {
  log(m);
  process.exit(1);
};
const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8' });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/* — flags — */

const argv = process.argv.slice(2);
const wantPhone = argv.includes('--phone');
const serialAt = argv.findIndex((a) => a === '-s' || a === '--device');
const wantedSerial = serialAt >= 0 ? argv[serialAt + 1] : undefined;
// The serial's own slot is skipped before looking for the count: plenty of
// phones have an all-digit serial, and `-s 12345678` must not read as "boot
// twelve million emulators".
const countArg = argv
  .filter((_, i) => serialAt < 0 || (i !== serialAt && i !== serialAt + 1))
  .find((a) => /^\d+$/.test(a));

/* — locate an SDK: adb is required, the emulator only to boot one — */

const roots = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  'E:\\android-sdk',
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
].filter(Boolean);

const adbRoot = roots.find((c) => existsSync(path.join(c, 'platform-tools', 'adb.exe')));
const emuRoot = roots.find((c) => existsSync(path.join(c, 'emulator', 'emulator.exe')));

if (!adbRoot) die('no adb found (checked ANDROID_HOME, ANDROID_SDK_ROOT, E:\\android-sdk, %LOCALAPPDATA%)');

// The emulator is only load-bearing when there is no phone to pair with: with
// `--phone` and a second phone (or one already-running AVD) this is testable
// without it, so its absence is a note rather than the end of the run.
if (!emuRoot) {
  const sdkmanager = roots
    .flatMap((root) => {
      const tools = path.join(root, 'cmdline-tools');
      if (!existsSync(tools)) return [];
      return ['latest', '16.0', '15.0', '14.0', '13.0', '12.0']
        .map((v) => path.join(tools, v, 'bin', 'sdkmanager.bat'))
        .filter(existsSync);
    })[0];
  log('no Android emulator found in any SDK (checked ANDROID_HOME, E:\\android-sdk,');
  log('%LOCALAPPDATA%\\Android\\Sdk). One-time setup, either way works:');
  log('');
  log('  a) Android Studio → Device Manager → add a device (installs the');
  log('     emulator and creates an AVD in one go — make two for buddy testing)');
  log('  b) into the existing SDK:');
  log(`       ${sdkmanager ?? 'sdkmanager.bat'} ^`);
  log('         "emulator" "system-images;android-34;google_apis;x86_64"');
  log('     then create AVDs with avdmanager.bat');
  log('');
  if (!wantPhone) {
    log('No emulator is still testable today: `npm run buddy-relay` plus');
    log('`npm run start:sim`, with the app open in Expo Go on phones.');
    process.exit(1);
  }
  log('carrying on with the cabled phone(s) — nothing will be booted');
}

const sdk = emuRoot ?? adbRoot;
const emulatorExe = path.join(sdk, 'emulator', 'emulator.exe');
const adb = path.join(adbRoot, 'platform-tools', 'adb.exe');

/* — what's attached: emulators, and the phone on the cable — */

const runningSerials = () =>
  run(adb, ['devices'])
    .split(/\r?\n/)
    .map((l) => l.match(/^(emulator-\d+)\tdevice$/)?.[1])
    .filter(Boolean);

// Same reading as install:apk. `emulator-5554` is an AVD and `192.168.1.7:5555`
// is adb-over-wifi; what's left is a serial number, i.e. something on a cable.
const cabled = () =>
  run(adb, ['devices'])
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state)
    .filter(([serial]) => !serial.startsWith('emulator-') && !serial.includes(':'));

// `adb emu avd name` prints the name, then an OK line.
const avdOf = (serial) => {
  try {
    return run(adb, ['-s', serial, 'emu', 'avd', 'name']).split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
};

const nameOf = (serial) => {
  if (serial.startsWith('emulator-')) return serial;
  try {
    return `${run(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.model']).trim() || 'phone'} (${serial})`;
  } catch {
    return serial;
  }
};

// The phone is opt-in rather than auto-detected: with USB tethering it is
// permanently on the cable, and a plain `start:emu` must not take it over.
let phones = [];
if (wantPhone) {
  const found = cabled();
  const unauthorized = found.filter(([, state]) => state !== 'device');
  phones = found.filter(([, state]) => state === 'device').map(([serial]) => serial);
  if (!phones.length) {
    if (unauthorized.length)
      die(
        `phone found but adb can't use it (${unauthorized.map((d) => d.join(' → ')).join(', ')}) — ` +
          'unlock it and accept the "Allow USB debugging" prompt',
      );
    die('no phone on USB — plug it in, unlock it, and turn on USB debugging in developer options');
  }
  if (wantedSerial) {
    if (!phones.includes(wantedSerial)) die(`${wantedSerial} is not among the connected phones: ${phones.join(', ')}`);
    phones = [wantedSerial];
  }
  for (const serial of phones) log(`phone: ${nameOf(serial)}`);
}

/* — boot what's missing — */

const avds = emuRoot
  ? run(emulatorExe, ['-list-avds'])
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[\w.-]+$/.test(l))
  : [];

if (emuRoot && !avds.length && !phones.length) {
  log(`the emulator is installed (${sdk}) but there are no AVDs yet —`);
  log('create one or two in Android Studio → Device Manager, or with avdmanager.bat.');
  process.exit(1);
}

// A phone counts as one of the two instances, so it changes what "enough"
// means — the default is the number still missing, not a fixed two.
const defaultCount = Math.max(0, Math.min(2 - phones.length, avds.length));
const wanted = countArg === undefined ? defaultCount : Number(countArg);
const running = runningSerials();
const runningAvds = running.map(avdOf).filter(Boolean);

if (wanted > 1 && avds.length < 2)
  log('only one AVD exists — the second buddy can be a phone in Expo Go (`--phone`), or create a second AVD');

const toBoot = avds.filter((a) => !runningAvds.includes(a)).slice(0, Math.max(0, wanted - running.length));

for (const name of toBoot) {
  log(`booting ${name}`);
  spawn(emulatorExe, ['-avd', name], { detached: true, stdio: 'ignore' }).unref();
}
if (!toBoot.length && wanted > 0) log(`${running.length} emulator(s) already running, nothing to boot`);
if (!toBoot.length && !wanted) log('no emulator asked for — the cabled phone(s) are the pair');

if (phones.length + running.length + toBoot.length < 2)
  log('note: buddy testing needs two instances, and only one is in play');

/* — the relay, in its own window (it owns the d/l console keys) — */

const portUp = (port) =>
  new Promise((res) => {
    const sock = net.connect({ host: '127.0.0.1', port }, () => {
      sock.destroy();
      res(true);
    });
    sock.on('error', () => res(false));
    sock.setTimeout(1500, () => {
      sock.destroy();
      res(false);
    });
  });

if (await portUp(RELAY_PORT)) {
  log(`relay already listening on :${RELAY_PORT}`);
} else {
  log(`opening the buddy relay in its own window (:${RELAY_PORT})`);
  spawn('start "buddy relay" cmd /k node scripts\\buddy-relay.mjs', { shell: true, cwd: repoRoot });
}

/* — wait for boots, then hand over to Metro — */

const booted = (serial) => {
  try {
    return run(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']).trim() === '1';
  } catch {
    return false;
  }
};

const target = Math.min(wanted, running.length + toBoot.length);
const deadline = Date.now() + 180_000;
let ready = runningSerials().filter(booted).length;
while (ready < target && Date.now() < deadline) {
  log(`waiting for emulators… ${ready}/${target} booted`);
  await sleep(4000);
  ready = runningSerials().filter(booted).length;
}
if (ready < target) log('still not fully booted — starting Metro anyway, press a again if the first try fails');

const targets = () => {
  const live = new Set(cabled().filter(([, state]) => state === 'device').map(([serial]) => serial));
  return [...phones.filter((s) => live.has(s)), ...runningSerials()];
};

// Reverse-forwarding is the whole transport here, and it does not survive USB
// re-enumerating — which is exactly what toggling tethering does. So it is
// re-armed on every tick below rather than set once and trusted.
const wire = (serial) => {
  for (const port of [METRO_PORT, RELAY_PORT]) {
    try {
      run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    } catch {
      return false;
    }
  }
  return true;
};

for (const serial of targets())
  if (!wire(serial)) log(`adb reverse failed for ${nameOf(serial)} — it may not reach Metro or the relay`);

// This script forwards port 8081 and opens exp://127.0.0.1:8081, so Metro
// landing on a different port because an old one still holds this one is not a
// survivable outcome — and the failure is silent, which is the same reason
// `update:emu` exists. Only a node process is killed; anything else aborts.
if (await portUp(METRO_PORT)) {
  const line = run('netstat', ['-ano'])
    .split(/\r?\n/)
    .find((l) => l.includes(`:${METRO_PORT}`) && l.includes('LISTENING'));
  const pid = line ? Number(line.trim().split(/\s+/).at(-1)) : null;
  const held = pid
    ? run('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']).split(',')[0]?.replaceAll('"', '').toLowerCase()
    : null;
  if (held !== 'node.exe')
    die(`port ${METRO_PORT} is held by ${held ?? 'an unknown process'} (pid ${pid}) — not killing it, aborting`);
  log(`killing the Metro already on :${METRO_PORT} (pid ${pid}) — a stale one serves stale code`);
  run('taskkill', ['/PID', String(pid), '/F']);
  await sleep(1000);
}

log('starting Metro with the sim radio — the app will open on each target by itself');
log('(first-ever run only: press a once so Expo CLI installs Expo Go; the rest clone from it)');
const metro = spawn('npx expo start --go --localhost', {
  shell: true,
  stdio: 'inherit',
  cwd: repoRoot,
  env: {
    ...process.env,
    EXPO_PUBLIC_SIM_RADIO: '1',
    // Expo's `a` key needs adb, and only looks at ANDROID_HOME + PATH.
    ANDROID_HOME: sdk,
    PATH: `${path.join(adbRoot, 'platform-tools')};${process.env.PATH}`,
  },
});
metro.on('exit', (code) => process.exit(code ?? 0));

/* — open the app on every target; `a` only ever reaches one of them — */

// These get polled in loops, where one adb hiccup must not abort the run.
const probe = (serial, args) => {
  try {
    return run(adb, ['-s', serial, ...args]);
  } catch (e) {
    return e.stdout ?? '';
  }
};

const goPath = (serial) => probe(serial, ['shell', 'pm', 'path', APP]).match(/^package:(.+)$/m)?.[1].trim() ?? null;

// ExperienceActivity is the loaded app. LauncherActivity is only the doorway:
// when Expo Go can't get the experience from the dev server it shows for a few
// hundred ms and closes again, never handing over. So the handover — not the
// package being in front — is what says the app actually came up.
const experienceIsUp = (serial) =>
  (
    probe(serial, ['shell', 'dumpsys', 'activity', 'activities'])
      .split(/\r?\n/)
      .find((l) => l.includes('topResumedActivity=')) ?? ''
  ).includes('ExperienceActivity');

// The port opens before Metro can serve, and Expo Go asked inside that gap
// opens its launcher and closes it again. Ask for the very thing Expo Go
// fetches; serving that is the only proof Metro is ready for it.
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

const opened = new Set();
const warned = new Set();
let cloneApk = null;

const warnOnce = (serial, m) => {
  if (warned.has(serial)) return;
  warned.add(serial);
  log(m);
};

const openAll = async () => {
  if (!(await metroReady())) return;
  const todo = targets().filter((s) => !opened.has(s));
  if (!todo.length) return;
  const source = runningSerials().find(goPath);

  for (const serial of todo) {
    wire(serial);
    if (!goPath(serial)) {
      // A phone's Expo Go is arm64 and an emulator's is x86_64, so the clone
      // below is emulator-to-emulator only; the phone is the user's one
      // manual step. Until some emulator has it (the very first run), keep
      // waiting for the user's `a`.
      if (!serial.startsWith('emulator-')) {
        warnOnce(serial, `${nameOf(serial)} has no Expo Go — install it from the Play Store (SDK 54 wants 54.0.8)`);
        continue;
      }
      if (!source) continue;
      try {
        if (!cloneApk) {
          cloneApk = path.join(os.tmpdir(), 'expo-go-clone.apk');
          run(adb, ['-s', source, 'pull', goPath(source), cloneApk]);
        }
        log(`installing Expo Go on ${serial} (cloned from ${source})`);
        run(adb, ['-s', serial, 'install', '-r', cloneApk]);
      } catch {
        log(`could not install Expo Go on ${serial} — press shift+a in Metro and pick it`);
        opened.add(serial);
        continue;
      }
    }

    // Verify rather than assume: `am start` reports success for intents that
    // never produce a visible activity, so the log used to lie on exactly the
    // run that failed. A locked phone is the usual cause, and retrying on the
    // next tick is the whole fix.
    probe(serial, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `exp://127.0.0.1:${METRO_PORT}`, APP]);
    const stop = Date.now() + 15_000;
    while (!experienceIsUp(serial) && Date.now() < stop) await sleep(500);
    if (experienceIsUp(serial)) {
      opened.add(serial);
      log(`app opened on ${nameOf(serial)}`);
    } else {
      warnOnce(serial, `${nameOf(serial)}: Expo Go didn't come to the front — unlock the screen and it'll be retried`);
    }
  }
};

const opener = setInterval(openAll, 10_000);
setTimeout(() => clearInterval(opener), 300_000);
openAll();
