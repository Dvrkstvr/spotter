/**
 * One version number, two files that state it.
 *
 * `app.json` is the source of truth: `expo.version` is what prebuild bakes
 * into the APK as `versionName`, so it is the number a phone actually shows
 * and the one Play reads. `package.json`'s is a copy — nothing builds from
 * it — which is exactly why it drifted to 1.0.0 while the app shipped 1.2.6.
 *
 *   npm run version         → check, and say so if they disagree
 *   npm run version -- --fix → copy app.json's over package.json's
 *
 * The check runs at the top of a release build (`scripts/build-apk.mjs`),
 * where a wrong number is a wrong artefact rather than a cosmetic slip. It
 * deliberately does not run on `typecheck` or the dev loop: mid-edit drift
 * is not an error, shipping it is.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = (m) => console.log(`[version] ${m}`);

const appPath = path.join(repoRoot, 'app.json');
const pkgPath = path.join(repoRoot, 'package.json');

const app = JSON.parse(readFileSync(appPath, 'utf8'));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const want = app.expo?.version;
if (!want) {
  log('app.json has no expo.version — nothing to sync against');
  process.exit(1);
}

if (pkg.version === want) {
  log(`ok — both say ${want} (versionCode ${app.expo?.android?.versionCode ?? '?'})`);
  process.exit(0);
}

if (!process.argv.includes('--fix')) {
  log(`app.json says ${want}, package.json says ${pkg.version}`);
  log('run `npm run version -- --fix` to copy app.json\'s over');
  process.exit(1);
}

// Rewritten by hand rather than through JSON.stringify of the whole object:
// package.json's key order and formatting are the file's, not ours to
// normalise on a version bump.
const src = readFileSync(pkgPath, 'utf8');
const next = src.replace(/("version"\s*:\s*")[^"]*(")/, `$1${want}$2`);
if (next === src) {
  log('could not find a "version" field to rewrite in package.json');
  process.exit(1);
}
writeFileSync(pkgPath, next);
log(`package.json ${pkg.version} → ${want}`);
