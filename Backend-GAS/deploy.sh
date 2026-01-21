#!/bin/bash
set -e

# 1. Force the script to run from the directory where THIS script is located
cd "$(dirname "$0")"

echo "🧹 Cleaning old build..."
rm -rf dist
mkdir -p dist

echo "🏗️  Compiling TypeScript..."
# Use the local project tsc
./node_modules/.bin/tsc

echo "📄 Copying appsscript.json..."
cp appsscript.json dist/

echo "🛠️  Fixing files for Google Apps Script..."
# This part removes 'import' and 'export' and renames to .gs
for f in dist/*.js; do
  [ -e "$f" ] || continue
  echo "  > Processing $(basename "$f")"
  
  # Strip imports and exports (Portable version for Mac and Linux)
  sed -i.bak '/^import /d' "$f"
  sed -i.bak 's/^export //g' "$f"
  sed -i.bak '/^export default/d' "$f"
  
  # Clean up temp files
  rm "${f}.bak"
  
  # Rename .js to .gs so Google recognizes it
  mv "$f" "${f%.js}.gs"
done

echo "🚀 Pushing to Google Apps Script..."
# We run clasp from the folder containing .clasp.json
clasp push -f

echo "✅ SUCCESS: Your scripts are back in the GAS Editor."
