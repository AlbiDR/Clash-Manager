#!/bin/bash

# Clash Manager Android Build Helper
# This script uses npx to run bubblewrap without global installation.
# Requires: Node.js, Java 11+, Android SDK

echo "🚀 Preparing Clash Manager Android Build..."

# 1. Ensure dependencies are built
npm run build

# 2. Check if twa-manifest.json exists
if [ ! -f "twa-manifest.json" ]; then
    echo "⚠️ twa-manifest.json not found. Initializing..."
    npx @bubblewrap/cli init --manifest=https://albidr.github.io/Clash-Manager/manifest.webmanifest
fi

# 3. Process the manifestation
echo "📦 Building Android Project..."
npx @bubblewrap/cli build

echo "✅ Build attempt finished."
echo "If successful, your APK/AAB files are in the current directory."
echo "Don't forget to configure your Digital Asset Links on albidr.github.io"
