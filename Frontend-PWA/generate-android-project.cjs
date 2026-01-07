#!/usr/bin/env node

/**
 * Generates a minimal Android TWA project from twa-manifest.json
 * This runs in GitHub Actions to create the project on-the-fly
 */

const fs = require('fs');
const path = require('path');

function exitWithError(message) {
  console.error(`❌ ERROR: ${message}`);
  process.exit(1);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  } catch (err) {
    exitWithError(`Failed to create directory ${dir}: ${err.message}`);
  }
}

function writeFileWithVerification(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
    if (!fs.existsSync(filePath)) {
      exitWithError(`File was not created: ${filePath}`);
    }
    const size = fs.statSync(filePath).size;
    console.log(`✓ Created ${filePath} (${size} bytes)`);
  } catch (err) {
    exitWithError(`Failed to write ${filePath}: ${err.message}`);
  }
}

console.log('🚀 Starting Android project generation...\n');

// Load and validate manifest
let manifest;
try {
  if (!fs.existsSync('twa-manifest.json')) {
    exitWithError('twa-manifest.json not found');
  }
  manifest = JSON.parse(fs.readFileSync('twa-manifest.json', 'utf8'));
  console.log(`✓ Loaded twa-manifest.json (version code: ${manifest.appVersionCode})\n`);
} catch (err) {
  exitWithError(`Failed to read twa-manifest.json: ${err.message}`);
}

// Create directory structure
console.log('📁 Creating directory structure...');
const dirs = [
  'app/src/main/java/com/albidr/clashmanager',
  'app/src/main/res/values',
  'app/src/main/res/mipmap-mdpi',
  'app/src/main/res/mipmap-hdpi',
  'app/src/main/res/mipmap-xhdpi',
  'app/src/main/res/mipmap-xxhdpi',
  'app/src/main/res/mipmap-xxxhdpi',
  'gradle/wrapper'
];

dirs.forEach(ensureDir);
console.log('');

// Generate build.gradle (project level)
console.log('📝 Generating build files...');
writeFileWithVerification('build.gradle', `
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.5.0'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}
`);

// Generate app/build.gradle
writeFileWithVerification('app/build.gradle', `
plugins {
    id 'com.android.application'
}

android {
    namespace 'com.albidr.clashmanager'
    compileSdk 34

    defaultConfig {
        applicationId "com.albidr.clashmanager"
        minSdk 23
        targetSdk 34
        versionCode ${manifest.appVersionCode}
        versionName "${manifest.appVersionName || '1.0.0'}"
    }

    signingConfigs {
        release {
            storeFile file("../signing.keystore")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias "${manifest.signingKey.alias}"
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
}
`);

// Generate AndroidManifest.xml
writeFileWithVerification('app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@android:style/Theme.Translucent.NoTitleBar"
        android:supportsRtl="true">

        <meta-data
            android:name="asset_statements"
            android:resource="@string/asset_statements" />

        <activity
            android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
            android:exported="true"
            android:label="@string/app_name"
            android:taskAffinity=""
            android:launchMode="singleTask">
            <meta-data
                android:name="android.support.customtabs.trusted.DEFAULT_URL"
                android:value="https://${manifest.host}${manifest.startUrl}" />
            <meta-data
                android:name="android.support.customtabs.trusted.FALLBACK_STRATEGY"
                android:value="customtabs" />
            <meta-data
                android:name="android.support.customtabs.trusted.STATUS_BAR_COLOR"
                android:resource="@android:color/transparent" />
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="https"
                    android:host="${manifest.host}"
                    android:pathPrefix="/" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`);

// Generate values/strings.xml
// We include the SHA256 fingerprint if provided via ANDROID_SHA256 env var.
// This is critical for Digital Asset Links (DAL) verification.
// Standard TWA Handshake (Bubblewrap Method):
const assetStatements = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "web",
      site: `https://${manifest.host}`
    }
  }
];

// We must double-escape quotes for Android XML string resources
const assetStatementsEscaped = JSON.stringify(assetStatements).replace(/"/g, '\\"');

writeFileWithVerification('app/src/main/res/values/strings.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${manifest.launcherName}</string>
    <string name="asset_statements">${assetStatementsEscaped}</string>
</resources>
`);

// Generate gradle.properties
writeFileWithVerification('gradle.properties', `
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.enableJetifier=true
android.defaults.buildfeatures.buildconfig=true
android.nonTransitiveRClass=false
`);

// Generate settings.gradle
writeFileWithVerification('settings.gradle', `
include ':app'
rootProject.name = "Clash Manager"
`);

// Copy launcher icons from local public directory
console.log('📦 Setting up app icons...');

// Use local maskable icon file
const localIconPath = path.join(__dirname, 'public', 'maskable-icon-512x512.png');

if (!fs.existsSync(localIconPath)) {
  exitWithError(`Icon file not found: ${localIconPath}`);
}

console.log(`✓ Found local icon: ${localIconPath}`);

// Copy the icon to all mipmap directories
const iconDirs = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
iconDirs.forEach(dpi => {
  const iconPath = `app/src/main/res/mipmap-${dpi}/ic_launcher.png`;
  try {
    fs.copyFileSync(localIconPath, iconPath);
    console.log(`✓ Created ${iconPath}`);
  } catch (err) {
    exitWithError(`Failed to create icon for ${dpi}: ${err.message}`);
  }
});

console.log('\n✅ Android project structure generated successfully!');
console.log('\n📊 Summary:');
console.log(`   - Package: com.albidr.clashmanager`);
console.log(`   - Version: ${manifest.appVersionCode} (${manifest.appVersionName || '1.0.0'})`);
console.log(`   - Target URL: https://${manifest.host}${manifest.startUrl}`);
console.log(`   - Min SDK: 23, Target SDK: 34`);
console.log(`   - Icon: ${localIconPath}`);

