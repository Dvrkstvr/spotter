/**
 * Release build, one command: Gradle-builds the app and drops the artefact
 * into `_builds/` with a date + git-hash name — the file you sideload onto
 * the two phones. Windows-only, like the rest of this project's tooling.
 *
 *   npm run build:apk        the APK to sideload
 *   npm run build:aab        the App Bundle Play wants
 *
 * Skip-if-already-there: `android/` is regenerated (expo prebuild) when it is
 * missing or older than `app.json`; ANDROID_HOME / JAVA_HOME are only filled in
 * when the environment doesn't provide them (Unity's SDK and JDK, same as the
 * rest of the repo).
 *
 * Two things are checked before Gradle runs, because both are cheap here and
 * expensive afterwards: that the two files stating the version agree, and which
 * key is about to sign this. A debug-signed build still happens — it is the
 * sideload loop — but it is *named* `-debugsigned`, so the file in `_builds/`
 * says what it is rather than looking like the one you meant to upload.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = (m) => console.log(`[build:apk] ${m}`);

/* — environment: Unity's SDK and JDK unless already set — */

const env = { ...process.env };
if (!env.ANDROID_HOME && existsSync('E:\\android-sdk')) env.ANDROID_HOME = 'E:\\android-sdk';
if (!env.JAVA_HOME) {
  const unityJdk =
    'C:\\Program Files\\Unity\\Hub\\Editor\\6000.5.0f1\\Editor\\Data\\PlaybackEngines\\AndroidPlayer\\OpenJDK';
  if (existsSync(path.join(unityJdk, 'bin', 'java.exe'))) env.JAVA_HOME = unityJdk;
}
if (!env.JAVA_HOME) {
  log('no JAVA_HOME and the Unity JDK was not found — set JAVA_HOME to a JDK 17+');
  process.exit(1);
}

const run = (exe, args, cwd) =>
  execFileSync(exe, args, { cwd: cwd ?? repoRoot, env, stdio: 'inherit', shell: true });

/* — what we are building — */

// `--aab` is the same errand with a different Gradle task: Play takes an App
// Bundle, a phone takes an APK, and both are this one release build.
const aab = process.argv.includes('--aab');

/* — the version the two files state has to be one version — */

// A release artefact carrying the wrong versionName is a wrong artefact, so
// this fails the build rather than warning. The dev loop never runs it.
try {
  execFileSync('node', [path.join(repoRoot, 'scripts', 'sync-version.mjs')], {
    cwd: repoRoot, env, stdio: 'inherit', shell: true,
  });
} catch {
  process.exit(1);
}

/* — which key is about to sign this (see plugins/with-release-signing.js) — */

const signed = existsSync(path.join(repoRoot, 'keystore.properties')) || !!env.SPOTTER_KEYSTORE;
if (!signed) {
  log('no keystore.properties and no SPOTTER_KEYSTORE — signing with the DEBUG key');
  log('  a debug-signed build cannot be uploaded to Play, and will not install');
  log('  over a release-signed one — see docs/release-signing.md');
}

/* — native project: generated, so regenerate when absent or behind — */

// Staleness matters as much as absence: app name, icons, scheme and permission
// strings are baked into android/ at prebuild time, so an app.json edited since
// then builds an APK that silently still carries the old ones.
const manifest = path.join(repoRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const missing = !existsSync(path.join(repoRoot, 'android', 'gradlew.bat')) || !existsSync(manifest);
const stale = !missing && statSync(path.join(repoRoot, 'app.json')).mtimeMs > statSync(manifest).mtimeMs;

if (missing || stale) {
  log(missing ? 'android/ missing — running expo prebuild' : 'app.json is newer than android/ — running expo prebuild');
  run('npx', ['expo', 'prebuild', '--platform', 'android']);
}

/* — the build — */

const task = aab ? 'bundleRelease' : 'assembleRelease';
log(`gradlew ${task}`);
run(path.join(repoRoot, 'android', 'gradlew.bat'), [task], path.join(repoRoot, 'android'));

const built = aab
  ? path.join(repoRoot, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
  : path.join(repoRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(built)) {
  log(`build finished but ${built} is missing`);
  process.exit(1);
}

/* — name it by date + commit and place it in _builds/ — */

let hash = 'nogit';
try {
  hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {}

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

const outDir = path.join(repoRoot, '_builds');
mkdirSync(outDir, { recursive: true });
const mark = signed ? '' : '-debugsigned';
const out = path.join(outDir, `spotter-${stamp}-${hash}${mark}.${aab ? 'aab' : 'apk'}`);
copyFileSync(built, out);
log(`done → ${path.relative(repoRoot, out)}`);
