/**
 * Sideload the newest `_builds/` APK onto the phone on the USB cable.
 * Windows-only, like the rest of this project's tooling.
 *
 *   npm run install:apk              newest APK in _builds/
 *   npm run install:apk -- --build   build one first, then install that
 *   npm run install:apk -- -s <serial> --no-launch
 *
 * Emulators are ignored on purpose — `npm run start:emu` owns those. The
 * install is always an in-place update (`adb install -r`), which keeps the
 * app's storage: the diary on that phone is real training data, so this
 * script never uninstalls. When the signatures don't match and Android
 * refuses the update, it says so and leaves the wiping to a command you
 * type yourself.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// app.json → expo.android.package. Still the pre-Spotter id on purpose: it is
// the app's identity to Android, and the training history is filed under it.
const PKG = 'com.calvinkohl.workoutdiary';

const log = (m) => console.log(`[install:apk] ${m}`);
const die = (m) => {
  log(m);
  process.exit(1);
};

/* — flags — */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (...names) => {
  const i = argv.findIndex((a) => names.includes(a));
  return i >= 0 ? argv[i + 1] : undefined;
};
const wantBuild = flag('--build');
const wantLaunch = !flag('--no-launch');
const wantedSerial = value('-s', '--device');

/* — adb, from the same SDK the rest of the tooling uses — */

const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'E:\\android-sdk']
  .filter(Boolean)
  .find((c) => existsSync(path.join(c, 'platform-tools', 'adb.exe')));
if (!sdk) die('no adb found (checked ANDROID_HOME, ANDROID_SDK_ROOT, E:\\android-sdk)');
const adb = path.join(sdk, 'platform-tools', 'adb.exe');

const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8' });
const shell = (serial, ...cmd) => {
  try {
    return run(adb, ['-s', serial, 'shell', ...cmd]).trim();
  } catch {
    return '';
  }
};

/* — the phone: one USB device, emulators and network targets skipped — */

// `emulator-5554` is an AVD; `192.168.1.7:5555` is adb-over-wifi. What's left
// is a serial number, i.e. something on the cable.
const devices = run(adb, ['devices'])
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.trim().split(/\s+/))
  .filter(([serial, state]) => serial && state)
  .filter(([serial]) => !serial.startsWith('emulator-') && !serial.includes(':'));

const unauthorized = devices.filter(([, state]) => state !== 'device');
const ready = devices.filter(([, state]) => state === 'device').map(([serial]) => serial);

if (!ready.length) {
  if (unauthorized.length)
    die(
      `phone found but adb can't use it (${unauthorized.map((d) => d.join(' → ')).join(', ')}) — ` +
        'unlock it, and accept the "Allow USB debugging" prompt',
    );
  die('no phone on USB — plug it in, unlock it, and turn on USB debugging in developer options');
}

let serial = ready[0];
if (wantedSerial) {
  if (!ready.includes(wantedSerial)) die(`${wantedSerial} is not among the connected phones: ${ready.join(', ')}`);
  serial = wantedSerial;
} else if (ready.length > 1) {
  die(`more than one phone connected (${ready.join(', ')}) — pick one with \`-- -s <serial>\``);
}

const model = shell(serial, 'getprop', 'ro.product.model') || 'phone';
log(`target: ${model} (${serial})`);

/* — the APK: newest in _builds/, or a fresh one — */

if (wantBuild) {
  log('building first');
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'build-apk.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

const outDir = path.join(repoRoot, '_builds');
const apks = existsSync(outDir)
  ? readdirSync(outDir)
      .filter((f) => f.endsWith('.apk'))
      .map((f) => path.join(outDir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  : [];
if (!apks.length) die('no APK in _builds/ — run `npm run build:apk` (or pass `-- --build`)');

const apk = apks[0];
const built = statSync(apk).mtime.toLocaleString();
log(`apk: ${path.relative(repoRoot, apk)} (built ${built})`);

// The filename carries the commit it was built from — say so when that isn't
// the commit that's checked out, because the usual cause is a forgotten build.
let head = null;
try {
  head = run('git', ['rev-parse', '--short', 'HEAD']).trim();
} catch {}
const stamped = path.basename(apk, '.apk').split('-').at(-1);
if (head && stamped && stamped !== head && stamped !== 'nogit')
  log(`note: built from ${stamped}, HEAD is ${head} — \`-- --build\` makes a current one`);

const installed = shell(serial, 'dumpsys', 'package', PKG).match(/versionName=(\S+)/)?.[1];
log(installed ? `replacing the installed ${installed} (its data stays)` : 'not installed yet — fresh install');

/* — install — */

const res = spawnSync(adb, ['-s', serial, 'install', '-r', apk], { encoding: 'utf8' });
const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
if (out) console.log(out);

if (res.status !== 0 || /Failure|failed/i.test(out)) {
  if (/SIGNATURE|UPDATE_INCOMPATIBLE|ALREADY_EXISTS/i.test(out))
    die(
      "the installed app was signed with a different key (a dev build's, most likely), so Android won't " +
        'update it in place. Uninstalling first is the fix — but that deletes the diary on this phone, ' +
        `so do it deliberately:\n\n  "${adb}" -s ${serial} uninstall ${PKG}`,
    );
  if (/VERSION_DOWNGRADE/i.test(out)) die('the phone has a newer versionCode than this APK — build a current one');
  if (/INSUFFICIENT_STORAGE/i.test(out)) die('the phone is out of space');
  die('install failed — see adb\'s output above');
}

log('installed');

/* — launch — */

if (wantLaunch) {
  try {
    run(adb, ['-s', serial, 'shell', 'am', 'start', '-n', `${PKG}/.MainActivity`]);
    log('launched');
  } catch {
    log('installed, but launching it failed — open it on the phone');
  }
}
