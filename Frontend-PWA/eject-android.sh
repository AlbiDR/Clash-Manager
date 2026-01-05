#!/bin/bash

# Eject Android Project Script
# Purpose: Generate the permanent Android project structure from Bubblewrap
# Usage: ./eject-android.sh

echo "🚀 Starting Ejection Process..."

cd Frontend-PWA

# 1. Install Bubblewrap CLI if missing (locally)
if ! command -v bubblewrap &> /dev/null; then
    echo "📦 Installing Bubblewrap CLI..."
    npm install -g @bubblewrap/cli
fi

# 2. Initialize if manifest is missing (Safety check)
if [ ! -f "twa-manifest.json" ]; then
    echo "⚠️ twa-manifest.json missing. Initializing..."
    bubblewrap init --manifest=https://albidr.github.io/Clash-Manager/manifest.webmanifest
fi

# 3. Build (This generates the 'android' folder in a temp location usually, but we force it)
# We use 'bubblewrap build' but we want to KEEP the artifacts.
echo "🏗️  Generating Android Project..."
# Bubblewrap usually creates the project in a hidden folder or compiles it.
# To get the source, we can use the `update` command or manually inspect.
# ACTUALLY: Bubblewrap creates a folder named after the package ID in the current dir.
bubblewrap build --skipPwaValidation --skipSigning

# 4. Locate and Move
# We need to find the folder. It's usually 'com.albidr.clashmanager' or similar based on twa-manifest.
PROJECT_DIR=$(find . -maxdepth 1 -type d -name "com.*" | head -n 1)

if [ -z "$PROJECT_DIR" ]; then
    echo "❌ Could not find generated project directory!"
    exit 1
fi

echo "📂 Found project: $PROJECT_DIR"
echo "🚚 Moving to './android'..."

rm -rf android
mv "$PROJECT_DIR" android

# 5. Clean up
echo "🧹 Cleaning up generated artifacts..."
rm -f *.apk *.aab

echo "✅ Ejection Complete!"
echo "You now have a permanent 'android/' directory."
echo "Please commit this directory to git."
