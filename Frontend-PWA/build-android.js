const { TwaGenerator } = require('@bubblewrap/core');
const { join } = require('path');
const fs = require('fs');

async function build() {
  const projectDir = process.cwd();
  const twaManifest = JSON.parse(fs.readFileSync('twa-manifest.json', 'utf-8'));
  
  console.log('🔧 Initializing Bubblewrap Generator...');
  
  const generator = new TwaGenerator();
  
  // Build with signing
  console.log('📦 Building signed APK...');
  await generator.build(projectDir, 'release');
  
  console.log('✅ Build complete!');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
