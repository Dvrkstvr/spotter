/**
 * Sign release builds with a real key instead of Expo's debug keystore.
 *
 * `android/` is generated, so the template's `signingConfig signingConfigs.debug`
 * under `buildTypes.release` — and the "Caution! In production..." comment above
 * it — come back on every prebuild. This rewrites both at prebuild time.
 *
 * **The keystore is named, never stored.** Nothing secret enters this repo:
 * the key's path and passwords come from `keystore.properties` at the repo root
 * (gitignored) or from SPOTTER_KEYSTORE* in the environment, and the environment
 * wins so CI needs no file. A relative `storeFile` resolves against the repo
 * root; an absolute one is used as given, which is the recommended shape — a
 * key that lives outside the tree cannot be committed by accident. Write it
 * with forward slashes: `keystore.properties` is a java.util.Properties file,
 * where a lone backslash is an escape character and `C:\nope` is a newline.
 *
 * **With neither, release falls back to the debug key and Gradle says so.**
 * `npm run android` stays one command on a machine that has never seen the
 * upload key, but nothing quietly produces an artefact that looks shippable
 * and isn't. See docs/release-signing.md.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

/** Marker so a second prebuild over an existing android/ is a no-op. */
const MARK = '/* spotter: release signing */';

const RESOLVE = `
    ${MARK}
    def spotterSign = [:]
    def spotterPropsFile = rootProject.file('../keystore.properties')
    if (spotterPropsFile.exists()) {
        def p = new Properties()
        spotterPropsFile.withInputStream { p.load(it) }
        spotterSign = [
            storeFile: p['storeFile'],
            storePassword: p['storePassword'],
            keyAlias: p['keyAlias'],
            keyPassword: p['keyPassword'],
        ]
    }
    if (System.getenv('SPOTTER_KEYSTORE')) {
        spotterSign = [
            storeFile: System.getenv('SPOTTER_KEYSTORE'),
            storePassword: System.getenv('SPOTTER_KEYSTORE_PASSWORD'),
            keyAlias: System.getenv('SPOTTER_KEY_ALIAS'),
            keyPassword: System.getenv('SPOTTER_KEY_PASSWORD'),
        ]
    }
    def spotterKeystore = null
    if (spotterSign.storeFile) {
        def f = new File(spotterSign.storeFile as String)
        spotterKeystore = f.isAbsolute() ? f : rootProject.file('../' + spotterSign.storeFile)
        // Named but not there is a mistake, never a fallback: silently signing
        // with the debug key here would answer a typo'd path with an artefact
        // that installs everywhere except over the last one.
        if (!spotterKeystore.exists()) {
            throw new GradleException("[spotter] keystore not found at \${spotterKeystore} - check storeFile in keystore.properties")
        }
    }
    def spotterSigned = spotterKeystore != null
    if (!spotterSigned) {
        project.logger.lifecycle('[spotter] no keystore configured - release will be signed with the DEBUG key (see docs/release-signing.md)')
    }
`;

const SIGNING = `    signingConfigs {
        release {
            if (spotterSigned) {
                storeFile spotterKeystore
                storePassword spotterSign.storePassword
                keyAlias spotterSign.keyAlias
                keyPassword spotterSign.keyPassword
            }
        }
        debug {`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;

    const anchor = '    signingConfigs {\n        debug {';
    if (!src.includes(anchor)) {
      throw new Error('with-release-signing: signingConfigs/debug block not found in app/build.gradle');
    }
    src = src.replace(anchor, RESOLVE + SIGNING);

    // Both build types carry `signingConfig signingConfigs.debug`; the release
    // one is the second. Asserted rather than guessed, so an Expo template
    // change fails the prebuild instead of leaving release debug-signed.
    const uses = src.match(/signingConfig signingConfigs\.debug/g) ?? [];
    if (uses.length !== 2) {
      throw new Error(
        `with-release-signing: expected 2 uses of signingConfigs.debug, found ${uses.length}`,
      );
    }
    const at = src.lastIndexOf('signingConfig signingConfigs.debug');
    src =
      src.slice(0, at) +
      'signingConfig spotterSigned ? signingConfigs.release : signingConfigs.debug' +
      src.slice(at + 'signingConfig signingConfigs.debug'.length);

    // The template's caution above it has been answered.
    src = src.replace(
      /\n *\/\/ Caution! In production, you need to generate your own keystore file\.\n *\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\./,
      '',
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
