#!/bin/bash
set -e

echo "🧹 Cleaning dist..."
rm -rf dist
mkdir -p dist

echo "🏗️ Transpiling TypeScript..."
./node_modules/.bin/tsc

echo "📄 Copying manifest..."
cp appsscript.json dist/Backend-GAS/

echo "🛠️ Processing files for GAS..."
cd dist/Backend-GAS
for f in *.js; do
  # Remove import and export statements, and also 'export default'
  sed -i '' 's/^import .*//g' "$f"
  sed -i '' 's/^export .*//g' "$f"
  # Rename to .gs
  mv "$f" "${f%.js}.gs"
done

echo "🚀 Pushing to GAS..."
# Use the global clasp (3.1.3) since we are pushing .gs files now
clasp push -f
