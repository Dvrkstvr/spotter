# Release signing

Until now every build — debug and release alike — was signed with Expo's
`debug.keystore`, the one whose password is the string `android` and which ships
inside the template. It is fine for sideloading onto your own two phones and it
is the one thing Play will not accept.

`plugins/with-release-signing.js` rewrites the generated
`android/app/build.gradle` at prebuild time so that `buildTypes.release` uses a
real key when one is configured, and says so loudly when one isn't.

## Read this before you sign anything

**Android identifies an app by its package name *and* its signature.** The
moment you install a release-signed Spotter over a debug-signed one, Android
refuses — `INSTALL_FAILED_UPDATE_INCOMPATIBLE` — and the only way through is to
uninstall first, **which erases that phone's training diary.**

Both phones currently carry debug-signed builds and real training data. So the
switch is done once, deliberately, in this order:

1. On **each** phone: Settings → Data → export a backup, and get the file off
   the phone (share it to yourself — do not leave the only copy on the device
   you are about to wipe).
2. Verify you can actually open both files somewhere else.
3. Uninstall Spotter on each phone.
4. Install the new release-signed APK.
5. Restore each backup — the app's own restore, hold-to-confirm.

After this, every future release-signed build installs over the last one
normally. Do it once and never again.

## Making the key

Run this yourself — nothing in this repo will ever hold your passwords. Pick a
directory **outside** the repo so the key cannot be committed by accident:

```bash
keytool -genkeypair -v -keystore C:/keys/spotter-upload.jks -alias spotter-upload -keyalg RSA -keysize 4096 -validity 10000
```

`keytool` comes with the JDK — the same one the build uses (Unity's, unless
`JAVA_HOME` says otherwise). It will ask for a keystore password, a key password
and your name and location; the name fields are cosmetic and never shown to
users.

**Back the file and both passwords up somewhere that survives this machine.**
If you enrol in Play App Signing this is your *upload* key, and Google can reset
a lost one — but only after an identity check and a delay. If you don't enrol,
losing it means you can never update the app again, under any circumstances.

## Wiring it up

```bash
cp keystore.properties.example keystore.properties
```

Fill in the four values, and **write the path with forward slashes** —
`C:/keys/spotter-upload.jks`. It is a `java.util.Properties` file, where a
backslash is an escape character: `C:
ope\key.jks` parses as a path with a
newline in it, and the build fails with a keystore name you will not recognise.

`keystore.properties` is gitignored, as are `*.jks` and `*.keystore`. CI uses environment variables instead — `SPOTTER_KEYSTORE`,
`SPOTTER_KEYSTORE_PASSWORD`, `SPOTTER_KEY_ALIAS`, `SPOTTER_KEY_PASSWORD` — and
the environment wins over the file.

Then rebuild. `android/` is regenerated, so the change only reaches Gradle
through a prebuild:

```bash
npx expo prebuild --platform android
```

`npm run build:apk` does that for you when `app.json` is newer than the
generated project, which it now is.

## Which key signed what

Both build scripts tell you, so an artefact is never ambiguous:

- Gradle prints `[spotter] no keystore configured — release will be signed with
  the DEBUG key` when it falls back.
- `npm run build:apk` prints the same warning before Gradle starts, and names
  the file `spotter-<date>-<hash>-debugsigned.apk`. A file in `_builds/` without
  that marker was signed with your key.

A *named but missing* keystore is an error, not a fallback: a typo in
`storeFile` fails the build rather than quietly producing something that won't
install anywhere.

To check an artefact after the fact:

```bash
keytool -printcert -jarfile _builds/spotter-20260822-1200-abc1234.apk
```

The debug key reads `CN=Android Debug, O=Android, C=US`. Yours will not.

## For Play

Play takes an App Bundle, not an APK:

```bash
npm run build:aab
```

The APK stays the sideload format for the two phones. Both come out of the same
release build and the same key.
