import fs from 'node:fs';
import path from 'node:path';

/**
 * APK & PWA Wrapper Integrity Auditor
 * Automates Target A, B, and C checks for Stage 10.
 *
 * [DECISION LOG]: Hardened manifest parity checks to include theme_color normalization,
 * expanded security auditing for SDK alignment, and injected deep shortcut verification
 * across PWA, TWA, and Android resources.
 */

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

/**
 * Normalizes color strings for comparison (removes casing differences).
 */
const normalizeColor = (c) => c?.toLowerCase();

function checkManifestParity() {
  info('Checking Manifest Parity...');
  const pwa = JSON.parse(fs.readFileSync(PWA_MANIFEST, 'utf8'));
  const apk = JSON.parse(fs.readFileSync(APK_RAW_MANIFEST, 'utf8'));
  const twa = JSON.parse(fs.readFileSync(TWA_MANIFEST, 'utf8'));

  const fields = ['name', 'short_name', 'theme_color', 'background_color', 'start_url', 'orientation'];
  fields.forEach(f => {
    let pwaVal = pwa[f];
    let apkVal = apk[f];
    let twaVal = twa[f === 'short_name' ? 'shortName' : f === 'background_color' ? 'backgroundColor' : f === 'theme_color' ? 'themeColor' : f === 'start_url' ? 'startUrl' : f];

    if (f.endsWith('_color')) {
      pwaVal = normalizeColor(pwaVal);
      apkVal = normalizeColor(apkVal);
      twaVal = normalizeColor(twaVal);
    }

    if (pwaVal === apkVal) ok(`Manifest ${f} matches (PWA/APK): ${pwaVal}`);
    else fail(`Manifest ${f} mismatch: PWA=${pwaVal}, APK=${apkVal}`);

    if (twaVal !== undefined) {
        if (pwaVal === twaVal) ok(`Manifest ${f} matches (PWA/TWA): ${pwaVal}`);
        else if (f === 'start_url' && twaVal.endsWith(pwaVal)) ok(`Manifest start_url suffix matches (TWA=${twaVal})`);
        else fail(`Manifest ${f} mismatch: PWA=${pwaVal}, TWA=${twaVal}`);
    }
  });
}

function checkShortcuts() {
  info('Checking Shortcut Parity...');
  const pwa = JSON.parse(fs.readFileSync(PWA_MANIFEST, 'utf8'));
  const twa = JSON.parse(fs.readFileSync(TWA_MANIFEST, 'utf8'));
  const strings = fs.readFileSync(STRINGS_XML, 'utf8');

  if (!pwa.shortcuts || !twa.shortcuts) {
    fail('Shortcuts missing from manifest(s)');
    return;
  }

  pwa.shortcuts.forEach((s, i) => {
    const twaS = twa.shortcuts[i];
    if (!twaS) {
      fail(`TWA shortcut ${i} missing`);
      return;
    }

    if (s.name === twaS.name) ok(`Shortcut ${i} name matches: ${s.name}`);
    else fail(`Shortcut ${i} name mismatch: PWA=${s.name}, TWA=${twaS.name}`);

    if (twaS.url.endsWith(s.url)) ok(`Shortcut ${i} URL matches: ${s.url}`);
    else fail(`Shortcut ${i} URL mismatch: PWA=${s.url}, TWA=${twaS.url}`);

    // Verify strings.xml entries
    if (strings.includes(`<string name="shortcut_name_${i}">${s.name}</string>`)) ok(`strings.xml shortcut_name_${i} matches`);
    else fail(`strings.xml shortcut_name_${i} mismatch or missing: expected ${s.name}`);

    if (strings.includes(`<string name="shortcut_short_name_${i}">${s.short_name}</string>`)) ok(`strings.xml shortcut_short_name_${i} matches`);
    else fail(`strings.xml shortcut_short_name_${i} mismatch or missing: expected ${s.short_name}`);
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

  const hostMatch = strings.match(/<string name="hostName">([^<]+)<\/string>/);
  if (hostMatch && hostMatch[1] === twa.host) ok(`Host matches strings.xml: ${twa.host}`);
  else fail(`Host mismatch: strings.xml=${hostMatch ? hostMatch[1] : 'NOT_FOUND'}, TWA=${twa.host}`);
}

function checkVersionSync() {
  info('Checking Version Synchronization...');
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const twa = JSON.parse(fs.readFileSync(TWA_MANIFEST, 'utf8'));
  const apktool = fs.readFileSync(APKTOOL_YML, 'utf8');

  const version = pkg.version;
  // Calculate expected versionCode: e.g. 14.2.6 -> 14260
  const parts = version.split('.').map(Number);
  const expectedCode = parts[0] * 1000 + parts[1] * 100 + parts[2] * 10;

  if (twa.appVersionName === version) ok(`TWA appVersionName matches package.json: ${version}`);
  else fail(`TWA appVersionName mismatch: ${twa.appVersionName} vs ${version}`);

  if (twa.appVersionCode === expectedCode) ok(`TWA appVersionCode matches: ${expectedCode}`);
  else fail(`TWA appVersionCode mismatch: ${twa.appVersionCode} vs ${expectedCode}`);

  const apkNameMatch = apktool.match(/versionName: (.*)/);
  if (apkNameMatch && apkNameMatch[1] === version) ok(`apktool.yml versionName matches: ${version}`);
  else fail(`apktool.yml versionName mismatch: ${apkNameMatch ? apkNameMatch[1] : 'not found'}`);

  const apkCodeMatch = apktool.match(/versionCode: (\d+)/);
  if (apkCodeMatch && Number(apkCodeMatch[1]) === expectedCode) ok(`apktool.yml versionCode matches: ${expectedCode}`);
  else fail(`apktool.yml versionCode mismatch: ${apkCodeMatch ? apkCodeMatch[1] : 'not found'}`);
}

function checkSecurity() {
  info('Checking Security Profile...');
  const manifest = fs.readFileSync(ANDROID_MANIFEST, 'utf8');
  const apktool = fs.readFileSync(APKTOOL_YML, 'utf8');

  if (manifest.includes('android:usesCleartextTraffic="false"')) ok('Cleartext traffic is forbidden');
  else fail('android:usesCleartextTraffic is NOT false');

  const targetSdkMatch = apktool.match(/targetSdkVersion: (\d+)/);
  const compileSdkMatch = manifest.match(/android:compileSdkVersion="(\d+)"/);

  if (targetSdkMatch && compileSdkMatch && targetSdkMatch[1] === compileSdkMatch[1]) {
    ok(`SDK Alignment: targetSdkVersion and compileSdkVersion match (${targetSdkMatch[1]})`);
  } else {
    fail(`SDK Mismatch: targetSdkVersion=${targetSdkMatch ? targetSdkMatch[1] : '?'}, compileSdkVersion=${compileSdkMatch ? compileSdkMatch[1] : '?'}`);
  }

  const required = [
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    'android.permission.INTERNET',
    'android.permission.VIBRATE'
  ];
  required.forEach(p => {
    if (manifest.includes(`android:name="${p}"`)) ok(`Permission present: ${p}`);
    else fail(`Permission MISSING: ${p}`);
  });
}

console.log('--- APK & PWA Wrapper Integrity Audit ---');
try {
  checkManifestParity();
  checkShortcuts();
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
