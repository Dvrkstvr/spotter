/**
 * One-command buddy-testing setup: boots Android emulator(s), opens the
 * buddy relay in its own console window, then runs Metro with the sim radio
 * enabled. Windows-only, like the rest of this project's tooling.
 *
 *   npm run start:emu        — boots up to 2 AVDs (buddy testing needs two
 *                              instances; the second can also be a phone)
 *   npm run start:emu -- 1   — boots just one
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

const log = (m) => console.log(`[start:emu] ${m}`);
const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8' });

/* — locate an SDK that actually has the emulator — */

const sdk = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  'E:\\android-sdk',
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
]
  .filter(Boolean)
  .find((c) => existsSync(path.join(c, 'emulator', 'emulator.exe')));

if (!sdk) {
  // Point at the sdkmanager that actually exists, whatever its version dir.
  const sdkmanager = ['E:\\android-sdk', path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')]
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
  log('No emulator is still testable today: `npm run buddy-relay` plus');
  log('`npm run start:sim`, with the app open in Expo Go on phones.');
  process.exit(1);
}

const emulatorExe = path.join(sdk, 'emulator', 'emulator.exe');
const adb = path.join(sdk, 'platform-tools', 'adb.exe');

/* — what exists, what's already running — */

const avds = run(emulatorExe, ['-list-avds'])
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => /^[\w.-]+$/.test(l));

if (!avds.length) {
  log(`the emulator is installed (${sdk}) but there are no AVDs yet —`);
  log('create one or two in Android Studio → Device Manager, or with avdmanager.bat.');
  process.exit(1);
}

const runningSerials = () =>
  run(adb, ['devices'])
    .split(/\r?\n/)
    .map((l) => l.match(/^(emulator-\d+)\tdevice$/)?.[1])
    .filter(Boolean);

// `adb emu avd name` prints the name, then an OK line.
const avdOf = (serial) => {
  try {
    return run(adb, ['-s', serial, 'emu', 'avd', 'name']).split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
};

const wanted = Math.max(1, Number(process.argv[2]) || Math.min(2, avds.length));
const running = runningSerials();
const runningAvds = running.map(avdOf).filter(Boolean);

if (wanted > 1 && avds.length < 2)
  log('only one AVD exists — the second buddy can be a phone in Expo Go, or create a second AVD');

const toBoot = avds.filter((a) => !runningAvds.includes(a)).slice(0, Math.max(0, wanted - running.length));

for (const name of toBoot) {
  log(`booting ${name}`);
  spawn(emulatorExe, ['-avd', name], { detached: true, stdio: 'ignore' }).unref();
}
if (!toBoot.length) log(`${running.length} emulator(s) already running, nothing to boot`);

/* — the relay, in its own window (it owns the d/l console keys) — */

const relayUp = await new Promise((res) => {
  const sock = net.connect({ host: '127.0.0.1', port: RELAY_PORT }, () => {
    sock.destroy();
    res(true);
  });
  sock.on('error', () => res(false));
  sock.setTimeout(1500, () => {
    sock.destroy();
    res(false);
  });
});

if (relayUp) {
  log(`relay already listening on :${RELAY_PORT}`);
} else {
  log(`opening the buddy relay in its own window (:${RELAY_PORT})`);
  spawn('start "buddy relay" cmd /k node scripts\\buddy-relay.mjs', {
    shell: true,
    cwd: repoRoot,
  });
}

/* — wait for boots, then hand over to Metro — */

const target = Math.min(wanted, running.length + toBoot.length);
const booted = (serial) => {
  try {
    return run(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']).trim() === '1';
  } catch {
    return false;
  }
};

const deadline = Date.now() + 180_000;
let ready = runningSerials().filter(booted).length;
while (ready < target && Date.now() < deadline) {
  log(`waiting for emulators… ${ready}/${target} booted`);
  await new Promise((res) => setTimeout(res, 4000));
  ready = runningSerials().filter(booted).length;
}
if (ready < target) log('still not fully booted — starting Metro anyway, press a again if the first try fails');

// Everything goes through adb, so no LAN address or firewall rule is ever
// involved: Metro serves on localhost and both its port and the relay port
// are reverse-forwarded into each emulator (127.0.0.1:<port> on the device
// lands on this machine — which also makes the sim radio's derived
// ws://localhost:8787 work from inside the emulator).
for (const serial of runningSerials()) {
  for (const port of [8081, RELAY_PORT]) {
    try {
      run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    } catch {
      log(`adb reverse failed for ${serial} port ${port} — that instance may not reach Metro or the relay`);
    }
  }
}

log('starting Metro with the sim radio — the app will open on each emulator by itself');
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
    PATH: `${path.join(sdk, 'platform-tools')};${process.env.PATH}`,
  },
});
metro.on('exit', (code) => process.exit(code ?? 0));

/* — open the app on every emulator; `a` only ever reaches one of them — */

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

const goPath = (serial) => {
  try {
    return (
      run(adb, ['-s', serial, 'shell', 'pm', 'path', 'host.exp.exponent']).match(
        /^package:(.+)$/m
      )?.[1].trim() ?? null
    );
  } catch {
    return null;
  }
};

const opened = new Set();
let cloneApk = null;

const openAll = async () => {
  if (!(await portUp(8081))) return;
  const todo = runningSerials().filter((s) => !opened.has(s));
  if (!todo.length) return;
  const source = runningSerials().find(goPath);
  for (const serial of todo) {
    if (!goPath(serial)) {
      // No Expo Go here yet — clone it from an emulator that has it. Until
      // one does (the very first run), keep waiting for the user's `a`.
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
    try {
      run(adb, ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8081']);
      opened.add(serial);
      log(`app opened on ${serial}`);
    } catch {
      // Metro or the emulator not quite ready — retry on the next tick.
    }
  }
};

const opener = setInterval(openAll, 10_000);
setTimeout(() => clearInterval(opener), 300_000);
