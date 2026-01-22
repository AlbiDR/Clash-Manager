#!/bin/bash
set -e # Exit immediately if any command fails

# 1. Force the script to run from the directory where THIS script is located
cd "$(dirname "$0")"

echo "🧹 Cleaning old build..."
if [ -d "dist" ]; then
  rm -rf dist
fi
mkdir -p dist

echo "🏗️  Compiling TypeScript..."
# Use npx to ensure we use the local typescript version
if ! npx tsc; then
    echo "❌ TypeScript compilation failed."
    exit 1
fi

# Check if dist is empty (compilation silently failed or no files matched)
if [ -z "$(ls -A dist)" ]; then
   echo "❌ Error: 'dist' folder is empty after compilation. Check tsconfig includes."
   exit 1
fi

echo "📦 Compilation Manifest (dist/):"
ls -1 dist/

echo "📄 Copying appsscript.json..."
if [ ! -f "appsscript.json" ]; then
    echo "❌ Error: appsscript.json not found!"
    exit 1
fi
cp appsscript.json dist/

echo "🛠️  Fixing files for Google Apps Script..."

# Process files: Convert JS to GAS-compatible GS
# We need to strip ES Module syntax because GAS runs in a global scope (mostly).
find dist -name "*.js" | while read -r f; do
  echo "  > Processing $(basename "$f")"
  
  # 1. Remove "import" lines entirely
  sed -i.bak '/^import /d' "$f"
  
  # 2. Remove "export" keyword but keep the declaration
  # e.g., "export const CONFIG" -> "const CONFIG"
  # e.g., "export function foo" -> "function foo"
  sed -i.bak 's/^export //g' "$f"
  
  # 3. Remove "export" inside lines (e.g. "export type") if any remain, or default exports
  sed -i.bak '/^export default/d' "$f"
  
  # 4. Remove Object.defineProperty for exports (CommonJS artifact)
  sed -i.bak '/Object.defineProperty(exports/d' "$f"
  
  # 5. Remove "use strict"; lines (GAS adds this implicitly/doesn't strictly need it)
  sed -i.bak '/^"use strict";/d' "$f"

  # Clean up temp files created by sed
  rm "${f}.bak"
  
  # Rename .js to .gs
  mv "$f" "${f%.js}.gs"
done

# Final Safety Check: Do we have .gs files?
count=$(find dist -name "*.gs" | wc -l)
if [ "$count" -eq "0" ]; then
   echo "❌ Error: No .gs files found in dist after processing. Aborting push."
   exit 1
fi

echo "🚀 Pushing to Google Apps Script..."
# Clasp will use the rootDir from .clasp.json (which is ./dist)
# It will verify files against .claspignore (which now whitelist *.gs)
npx clasp push --force

echo "✅ SUCCESS: Your scripts have been deployed."
