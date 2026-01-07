#!/usr/bin/env node

/**
 * Generates a minimal Android TWA project from twa-manifest.json
 * This runs in GitHub Actions to create the project on-the-fly
 */

const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync('twa-manifest.json', 'utf8'));

// Create directory structure
const dirs = [
  'app/src/main/java/com/albidr/clashmanager',
  'app/src/main/res/values',
  'app/src/main/res/drawable',
  'gradle/wrapper'
];

dirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));

// Generate build.gradle (project level)
fs.writeFileSync('build.gradle', `
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'
        classpath 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`);

// Generate app/build.gradle
fs.writeFileSync('app/build.gradle', `
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
fs.writeFileSync('app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="${manifest.launcherName}"
        android:theme="@android:style/Theme.Translucent.NoTitleBar"
        tools:ignore="MissingApplicationIcon">

        <activity
            android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
            android:exported="true"
            android:label="${manifest.launcherName}">
            <meta-data
                android:name="android.support.customtabs.trusted.DEFAULT_URL"
                android:value="https://${manifest.host}${manifest.startUrl}" />
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
                    android:pathPrefix="${manifest.startUrl.split('#')[0]}" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`);

// Generate gradle.properties
fs.writeFileSync('gradle.properties', `
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.enableJetifier=true
`);

// Generate settings.gradle
fs.writeFileSync('settings.gradle', `
include ':app'
rootProject.name = "Clash Manager"
`);

// Generate gradlew wrapper
fs.writeFileSync('gradlew', fs.readFileSync('/dev/stdin', 'utf8'));
fs.chmodSync('gradlew', 0o755);

console.log('✅ Android project structure generated successfully!');
