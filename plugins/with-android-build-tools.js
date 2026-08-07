/**
 * Expose `android.buildToolsVersion` (written to gradle.properties by
 * expo-build-properties) as `rootProject.ext.buildToolsVersion`.
 *
 * Third-party RN libraries (react-native-gesture-handler and friends) read
 * that ext via safeExtGet and otherwise fall back to their own default —
 * which the read-only Unity-junction SDK can't auto-install. The SDK ships
 * exactly one build-tools version, so everything must agree on it.
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const EXT_BLOCK = `ext {
  buildToolsVersion = findProperty('android.buildToolsVersion') ?: '35.0.0'
}

allprojects {`;

module.exports = function withAndroidBuildTools(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('ext {')) {
      cfg.modResults.contents = cfg.modResults.contents.replace('allprojects {', EXT_BLOCK);
    }
    return cfg;
  });
};
