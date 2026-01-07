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
  'app/src/main/res/mipmap-mdpi',
  'app/src/main/res/mipmap-hdpi',
  'app/src/main/res/mipmap-xhdpi',
  'app/src/main/res/mipmap-xxhdpi',
  'app/src/main/res/mipmap-xxxhdpi',
  'app/src/main/res/mipmap-anydpi-v26',
  'app/src/main/java/com/albidr/clashmanager',
  'app/src/main/res/values',
  'app/src/main/res/drawable',
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
        classpath 'com.android.tools.build:gradle:8.13.2'
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
    compileSdk 35

    defaultConfig {
        applicationId "com.albidr.clashmanager"
        minSdk 23
        targetSdk 35
        versionCode ${manifest.appVersionCode}
        versionName "${manifest.appVersionName || '1.0.0'}"
        manifestPlaceholders = [launcherName: "${manifest.launcherName}"]
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
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
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

// Generate proguard-rules.pro
writeFileWithVerification('app/proguard-rules.pro', `
# Keep the TWA/Android Browser Helper classes
-keep class com.google.androidbrowserhelper.** { *; }
-keep class androidx.browser.** { *; }
-keep class com.albidr.clashmanager.LauncherActivity { *; }
`);

// Generate LauncherActivity.java
writeFileWithVerification('app/src/main/java/com/albidr/clashmanager/LauncherActivity.java', `package com.albidr.clashmanager;



/**
 * Custom LauncherActivity to force a unique identity in Android Recents.
 * Extends the library class to maintain TWA functionality.
 */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    // No additional logic needed; inheriting from the library class
    // provides all standard TWA launch behavior while ensuring
    // a unique class name for OS-level task management.
}
`);

// Generate AndroidManifest.xml
writeFileWithVerification('app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="com.google.android.cct.notifications.NOTIFICATION_DELEGATION" />

    <application
        tools:replace="android:label,android:icon,android:roundIcon"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:theme="@android:style/Theme.Translucent.NoTitleBar"
        android:supportsRtl="true">

        <meta-data
            android:name="asset_statements"
            android:resource="@string/asset_statements" />

        <activity
            android:name=".LauncherActivity"
            tools:replace="android:label"
            android:exported="true"
            android:label="@string/app_name"
            android:icon="@mipmap/ic_launcher"
            android:roundIcon="@mipmap/ic_launcher_round"
            android:taskAffinity="com.albidr.clashmanager.sovereign"
            android:launchMode="singleTask"
            android:screenOrientation="${manifest.orientation || 'unspecified'}"
            android:supportsPictureInPicture="true"
            android:resizeableActivity="true"
            android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout">
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

            <meta-data
                android:name="android.support.customtabs.trusted.DISPLAY_MODE"
                android:value="immersive" />
            <meta-data
                android:name="android.support.customtabs.trusted.SCREEN_ORIENTATION"
                android:value="${manifest.orientation || 'default'}" />
        </activity>

        <service
            android:name="com.google.androidbrowserhelper.trusted.DelegationService"
            android:exported="true"
            tools:node="merge">
            <intent-filter>
                <action android:name="android.support.customtabs.trusted.TRUSTED_WEB_ACTIVITY_SERVICE" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </service>
    </application>
</manifest>
`);

// Generate values/strings.xml
// We include the SHA256 fingerprint if provided via ANDROID_SHA256 env var.
// This is critical for Digital Asset Links (DAL) verification.
// Standard TWA Handshake (Bi-directional Hardening):
const fingerprint = process.env.ANDROID_SHA256 || "";
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

// Generate values/styles.xml (Standard TWA Bridge Theme)
writeFileWithVerification('app/src/main/res/values/styles.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.ClashManager" parent="android:Theme.Translucent.NoTitleBar">
        <item name="android:windowBackground">@android:color/transparent</item>
        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
    </style>
</resources>
`);

// Generate Adaptive Icon XMLs
writeFileWithVerification('app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`);

writeFileWithVerification('app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`);

// Generate colors.xml (for icon background)
writeFileWithVerification('app/src/main/res/values/colors.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${manifest.backgroundColor || '#0B0E14'}</color>
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
  const foregroundPath = `app/src/main/res/mipmap-${dpi}/ic_launcher_foreground.png`;
  try {
    fs.copyFileSync(localIconPath, iconPath);
    fs.copyFileSync(localIconPath, foregroundPath);
    console.log(`✓ Created ${iconPath} and foreground`);
  } catch (err) {
    exitWithError(`Failed to create icon for ${dpi}: ${err.message}`);
  }
});

console.log('\n✅ Android project structure generated successfully!');
console.log('\n📊 Summary:');
console.log(`   - Package: com.albidr.clashmanager`);
console.log(`   - Version: ${manifest.appVersionCode} (${manifest.appVersionName || '1.0.0'})`);
console.log(`   - Target URL: https://${manifest.host}${manifest.startUrl}`);
console.log(`   - Min SDK: 23, Target SDK: 35`);
console.log(`   - Icon: ${localIconPath}`);

