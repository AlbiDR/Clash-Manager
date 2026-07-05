import fs from 'node:fs';
import path from 'node:path';

/**
 * APK & PWA Wrapper Integrity Auditor
 * Automates Target A, B, and C checks for Stage 10.
 */

const ROOT = '.';
const PWA_MANIFEST = 'Frontend-PWA/public/manifest.json';
const APK_RAW_MANIFEST = 'APK/android/res/raw/web_app_manifest.json';
const ASSET_LINKS = 'Frontend-PWA/public/.well-known/assetlinks.json';
const TWA_MANIFEST = 'APK/reference/twa-manifest.json';
const STRINGS_XML = 'APK/android/res/values/strings.xml';
const ANDROID_MANIFEST = 'APK/android/AndroidManifest.xml';
const APKTOOL_YML = 'APK/android/apktool.yml';
const PACKAGE_JSON = 'package.json';

const fail = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); process.exitCode = 1; };
const ok = (m) => console.log(`\x1b[32m✓ ${m}\x1b[0m`);
const info = (m) => console.log(`\x1b[34mℹ ${m}\x1b[0m`);

function checkManifestParity() {
  info('Checking Manifest Parity...');
  const pwa = JSON.parse(fs.readFileSync(PWA_MANIFEST, 'utf8'));
  const apk = JSON.parse(fs.readFileSync(APK_RAW_MANIFEST, 'utf8'));

  const fields = ['name', 'short_name', 'theme_color', 'background_color', 'start_url', 'orientation'];
  fields.forEach(f => {
    if (pwa[f] === apk[f]) ok(`Manifest ${f} matches: ${pwa[f]}`);
    else fail(`Manifest ${f} mismatch: PWA=${pwa[f]}, APK=${apk[f]}`);
  });
}

function checkAssetLinks() {
  info('Checking Digital Asset Links...');
  const al = JSON.parse(fs.readFileSync(ASSET_LINKS, 'utf8'));
  const twa = JSON.parse(fs.readFileSync(TWA_MANIFEST, 'utf8'));
  const strings = fs.readFileSync(STRINGS_XML, 'utf8');

  const alFingerprint = al[0].target.sha256_cert_fingerprints[0];
  const twaFingerprint = twa.fingerprints[0].sha256Fingerprint;

  if (alFingerprint === twaFingerprint) ok(`Fingerprints match: ${alFingerprint}`);
  else fail(`Fingerprint mismatch: AL=${alFingerprint}, TWA=${twaFingerprint}`);

  if (strings.includes('https://albidr.github.io')) ok('strings.xml assetStatements site is correct');
  else fail('strings.xml assetStatements site is incorrect or missing');
}

function checkVersionSync() {
  info('Checking Version Synchronization...');
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const twa = JSON.parse(fs.readFileSync(TWA_MANIFEST, 'utf8'));
  const apktool = fs.readFileSync(APKTOOL_YML, 'utf8');

  const version = pkg.version;
  if (twa.appVersionName === version) ok(`TWA appVersionName matches package.json: ${version}`);
  else fail(`TWA appVersionName mismatch: ${twa.appVersionName} vs ${version}`);

  const apkNameMatch = apktool.match(/versionName: (.*)/);
  if (apkNameMatch && apkNameMatch[1] === version) ok(`apktool.yml versionName matches: ${version}`);
  else fail(`apktool.yml versionName mismatch: ${apkNameMatch ? apkNameMatch[1] : 'not found'}`);
}

function checkSecurity() {
  info('Checking Security Profile...');
  const manifest = fs.readFileSync(ANDROID_MANIFEST, 'utf8');

  if (manifest.includes('android:usesCleartextTraffic="false"')) ok('Cleartext traffic is forbidden');
  else fail('android:usesCleartextTraffic is NOT false');

  const required = [
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    'android.permission.INTERNET'
  ];
  required.forEach(p => {
    if (manifest.includes(`android:name="${p}"`)) ok(`Permission present: ${p}`);
    else fail(`Permission MISSING: ${p}`);
  });
}

console.log('--- APK & PWA Wrapper Integrity Audit ---');
try {
  checkManifestParity();
  checkAssetLinks();
  checkVersionSync();
  checkSecurity();
} catch (e) {
  fail(`Audit crashed: ${e.message}`);
}

if (process.exitCode === 1) {
  console.log('\n\x1b[31m\x1b[1mAUDIT FAILED\x1b[0m');
  process.exit(1);
}
console.log('\n\x1b[32m\x1b[1mAUDIT PASSED\x1b[0m');
process.exit(0);
