const {
  createRunOncePlugin,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const GRADLE_VERSION = '8.13';
const ONNX_RUNTIME_VERSION = '1.24.3';
const ONNX_RUNTIME_PACKAGE = 'ai.onnxruntime.reactnative.OnnxruntimePackage';
const ONNX_RUNTIME_PIN = `// Lemua pins ONNX Runtime to avoid dynamic Maven metadata lookup.
allprojects {
  configurations.configureEach {
    resolutionStrategy.force 'com.microsoft.onnxruntime:onnxruntime-android:${ONNX_RUNTIME_VERSION}'
  }
}`;

const withOnnxRuntimePackage = (config) =>
  withMainApplication(config, (config) => {
    const { modResults } = config;
    const packageListAnchor = 'PackageList(this).packages.apply {';
    const registrationMarker = 'Lemua ensures ONNX Runtime is registered';
    if (modResults.contents.includes(registrationMarker)) return config;

    if (!modResults.contents.includes(packageListAnchor)) {
      throw new Error(
        'Could not find the Android package list to register ONNX Runtime.',
      );
    }

    modResults.contents = modResults.contents.replace(
      packageListAnchor,
      `${packageListAnchor}
          // ${registrationMarker}
          if (none { it is ${ONNX_RUNTIME_PACKAGE} }) {
            add(${ONNX_RUNTIME_PACKAGE}())
          }`,
    );
    return config;
  });

const withAndroidGradleVersion = (config) =>
  withDangerousMod(withOnnxRuntimePackage(config), [
    'android',
    (config) => {
      const androidRoot = config.modRequest.platformProjectRoot;
      const wrapperPropertiesPath = path.join(
        androidRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      );
      const contents = fs.readFileSync(wrapperPropertiesPath, 'utf8');
      const nextContents = contents.replace(
        /^distributionUrl=.*$/m,
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
      );

      if (contents !== nextContents) {
        fs.writeFileSync(wrapperPropertiesPath, nextContents);
      }

      const buildGradlePath = path.join(androidRoot, 'build.gradle');
      const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
      if (!buildGradle.includes('Lemua pins ONNX Runtime')) {
        const pluginAnchor = 'apply plugin: "expo-root-project"';
        if (!buildGradle.includes(pluginAnchor)) {
          throw new Error(
            'Could not add the ONNX Runtime version pin to android/build.gradle.',
          );
        }
        fs.writeFileSync(
          buildGradlePath,
          buildGradle.replace(pluginAnchor, `${ONNX_RUNTIME_PIN}\n\n${pluginAnchor}`),
        );
      }

      return config;
    },
  ]);

module.exports = createRunOncePlugin(
  withAndroidGradleVersion,
  'with-android-gradle-version',
  '1.0.0',
);
