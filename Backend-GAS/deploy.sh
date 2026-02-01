#!/bin/bash
set -e # Exit immediately if any command fails

# 1. Force the script to run from the directory where THIS script is located
cd "$(dirname "$0")"

echo " Cleaning old build..."
if [ -d "dist" ]; then
  rm -rf dist
fi
mkdir -p dist

echo "  Compiling TypeScript..."
# Use npx to ensure we use the local typescript version
if ! npx tsc; then
    echo " TypeScript compilation failed."
    exit 1
fi

# Check if dist is empty (compilation silently failed or no files matched)
if [ -z "$(ls -A dist)" ]; then
   echo " Error: 'dist' folder is empty after compilation. Check tsconfig includes."
   exit 1
fi

echo " Compilation Manifest (dist/):"
ls -1 dist/

echo "📄 Copying appsscript.json..."
if [ ! -f "appsscript.json" ]; then
    echo " Error: appsscript.json not found!"
    exit 1
fi
cp appsscript.json dist/

# Ensure .clasp.json exists (Clasp requires this specific filename)
if [ ! -f ".clasp.json" ]; then
    if [ -f "clasp.json" ]; then
        echo "  Found clasp.json but expected .clasp.json. Renaming..."
        mv clasp.json .clasp.json
    else
        echo " Error: .clasp.json not found! Please run 'clasp clone <scriptId>' or create it."
        exit 1
    fi
fi

# Validation: Check if .clasp.json has a valid scriptId
if ! grep -qE '"scriptId":[[:space:]]*"[a-zA-Z0-9_-]{20,}"' .clasp.json; then
    echo " Error: .clasp.json does not contain a valid scriptId."
    exit 1
fi

echo "Fixing files for Google Apps Script..."

# Process files: Convert JS to GAS-compatible GS
# We need to strip ES Module syntax because GAS runs in a global scope (mostly).
find dist -name "*.js" | while read -r f; do
  echo "  > Processing $(basename "$f")"
  
  # 1. Remove "import" lines entirely (tolerant of whitespace)
  sed -i.bak '/^[[:space:]]*import /d' "$f"
  
  # 2. Remove "export default" lines ENTIRELY (Must be BEFORE generic export strip)
  # Matches "export default Something;" or "export default {" with optional indentation
  sed -i.bak '/^[[:space:]]*export default/d' "$f"

  # 3. Remove "export" keyword but keep the declaration (tolerant of whitespace)
  # Uses capture group \1 to preserve the indentation
  sed -i.bak 's/^\([[:space:]]*\)export /\1/g' "$f"
  
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
   echo " Error: No .gs files found in dist after processing. Aborting push."
   exit 1
fi

echo " Pushing to Google Apps Script..."
# Clasp will use the rootDir from .clasp.json (which is ./dist)
# It will verify files against .claspignore (which now whitelist *.gs)
npx clasp push --force

echo " SUCCESS: Your scripts have been deployed."
