/**
 * Release-APK build, one command: Gradle-builds the app and drops the APK
 * into `_builds/` with a date + git-hash name — the file you sideload onto
 * the two phones. Windows-only, like the rest of this project's tooling.
 *
 *   npm run build:apk
 *
 * Skip-if-already-there: `android/` is only regenerated (expo prebuild) when
 * missing; ANDROID_HOME / JAVA_HOME are only filled in when the environment
 * doesn't provide them (Unity's SDK and JDK, same as the rest of the repo).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
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

/* — native project: generated, so regenerate when absent — */

if (!existsSync(path.join(repoRoot, 'android', 'gradlew.bat'))) {
  log('android/ missing — running expo prebuild');
  run('npx', ['expo', 'prebuild', '--platform', 'android']);
}

/* — the build — */

log('gradlew assembleRelease');
run(path.join(repoRoot, 'android', 'gradlew.bat'), ['assembleRelease'], path.join(repoRoot, 'android'));

const apk = path.join(repoRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apk)) {
  log(`build finished but ${apk} is missing`);
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
const out = path.join(outDir, `workout-diary-${stamp}-${hash}.apk`);
copyFileSync(apk, out);
log(`done → ${path.relative(repoRoot, out)}`);
