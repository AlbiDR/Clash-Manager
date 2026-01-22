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
# Capture output to check for errors explicitly if needed, but set -e handles status codes
if ! ./node_modules/.bin/tsc; then
    echo "❌ TypeScript compilation failed."
    exit 1
fi

# Check if dist is empty (compilation silently failed or no files matched)
if [ -z "$(ls -A dist)" ]; then
   echo "❌ Error: 'dist' folder is empty after compilation. Check tsconfig includes."
   exit 1
fi

echo "📄 Copying appsscript.json..."
if [ ! -f "appsscript.json" ]; then
    echo "❌ Error: appsscript.json not found!"
    exit 1
fi
cp appsscript.json dist/

echo "🛠️  Fixing files for Google Apps Script..."

# Process files
find dist -name "*.js" | while read -r f; do
  echo "  > Processing $(basename "$f")"
  
  # Strip import statements (e.g., import { X } from './Y';)
  # Matches lines starting with 'import '
  sed -i.bak '/^import /d' "$f"
  
  # Strip export keywords (e.g., export const X = ... -> const X = ...)
  # Matches 'export ' at the start of the line or after whitespace
  sed -i.bak 's/^export //g' "$f"
  sed -i.bak 's/ export / /g' "$f"
  
  # Strip default exports (e.g., export default X; -> remove line)
  sed -i.bak '/^export default/d' "$f"

  # Clean up temp files created by sed
  rm "${f}.bak"
  
  # Rename .js to .gs so Google recognizes it as a server script
  mv "$f" "${f%.js}.gs"
done

echo "🚀 Pushing to Google Apps Script..."
# We run clasp from the folder containing .clasp.json (which is current dir)
# clasp.json points rootDir to ./dist, so it will push content of dist
clasp push --force

echo "✅ SUCCESS: Your scripts have been deployed."
