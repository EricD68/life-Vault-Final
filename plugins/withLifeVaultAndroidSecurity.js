const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require('@expo/config-plugins');

function withSecureManifest(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application manifest entry was not generated.');

    application.$ = application.$ || {};
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = 'false';
    application.$['android:dataExtractionRules'] = '@xml/life_vault_data_extraction_rules';
    application.$['android:usesCleartextTraffic'] = 'false';

    return result;
  });
}

function withSecureGradleProperties(config) {
  return withGradleProperties(config, (result) => {
    const properties = result.modResults;
    const setProperty = (key, value) => {
      const existing = properties.find((entry) => entry.type === 'property' && entry.key === key);
      if (existing) existing.value = value;
      else properties.push({ type: 'property', key, value });
    };

    setProperty('android.minSdkVersion', '28');
    setProperty('android.compileSdkVersion', '36');
    setProperty('android.targetSdkVersion', '36');
    return result;
  });
}

function withBackupExclusionRules(config) {
  return withDangerousMod(config, ['android', async (result) => {
    const xmlDir = path.join(
      result.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'res',
      'xml'
    );
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(
      path.join(xmlDir, 'life_vault_data_extraction_rules.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup disableIfNoEncryptionCapabilities="true">\n    <exclude domain="root" path="." />\n    <exclude domain="file" path="." />\n    <exclude domain="database" path="." />\n    <exclude domain="sharedpref" path="." />\n    <exclude domain="external" path="." />\n    <exclude domain="device_root" path="." />\n    <exclude domain="device_file" path="." />\n    <exclude domain="device_database" path="." />\n    <exclude domain="device_sharedpref" path="." />\n  </cloud-backup>\n  <device-transfer>\n    <exclude domain="root" path="." />\n    <exclude domain="file" path="." />\n    <exclude domain="database" path="." />\n    <exclude domain="sharedpref" path="." />\n    <exclude domain="external" path="." />\n    <exclude domain="device_root" path="." />\n    <exclude domain="device_file" path="." />\n    <exclude domain="device_database" path="." />\n    <exclude domain="device_sharedpref" path="." />\n  </device-transfer>\n</data-extraction-rules>\n`,
      'utf8'
    );
    return result;
  }]);
}

module.exports = function withLifeVaultAndroidSecurity(config) {
  config = withSecureManifest(config);
  config = withSecureGradleProperties(config);
  config = withBackupExclusionRules(config);
  return config;
};
