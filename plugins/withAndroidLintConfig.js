// Expo config plugin: disable the Android Lint "ExtraTranslation" rule so
// lintVitalRelease passes during EAS builds.
//
// Background: app.json's top-level `locales` config (./locales/ios/mn.json)
// contains iOS-only NSLocationWhenInUseUsageDescription / NSCameraUsageDescription /
// NSPhotoLibraryUsageDescription keys. Expo prebuild writes those same keys into
// android/app/src/main/res/values-b+mn/strings.xml but does NOT write matching
// default-locale entries (because they aren't real Android string resources),
// causing `lintVitalRelease` to fail with ExtraTranslation errors.
//
// The keys are iOS-only and not used by any Android resource, so silencing the
// rule for the release build is safe and correct.

const { withAppBuildGradle } = require('@expo/config-plugins');

const LINT_BLOCK = `
    // [withAndroidLintConfig] iOS-only NS* permission strings end up in values-b+mn/strings.xml
    // without matching default-locale entries; disable the ExtraTranslation lint rule that
    // would otherwise fail lintVitalRelease for the release build.
    lint {
        disable 'ExtraTranslation'
    }`;

function applyLintBlock(contents) {
  if (contents.includes('[withAndroidLintConfig]')) {
    return contents; // already injected
  }

  // Inject just before the closing brace of the android { ... } block.
  // Find the `android {` opening and walk to its matching closing brace.
  const openIdx = contents.indexOf('android {');
  if (openIdx === -1) {
    throw new Error("withAndroidLintConfig: could not find 'android {' block in app/build.gradle");
  }

  let depth = 0;
  let i = openIdx + 'android '.length;
  for (; i < contents.length; i++) {
    const ch = contents[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // i is the index of the closing brace of the android block
        return contents.slice(0, i) + LINT_BLOCK + '\n' + contents.slice(i);
      }
    }
  }
  throw new Error("withAndroidLintConfig: unbalanced braces in app/build.gradle");
}

module.exports = function withAndroidLintConfig(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyLintBlock(cfg.modResults.contents);
    return cfg;
  });
};
