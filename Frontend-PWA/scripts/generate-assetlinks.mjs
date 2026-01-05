import fs from 'fs';
import path from 'path';

// Usage: node generate-assetlinks.mjs <sha256_fingerprint>
// Example: node generate-assetlinks.mjs 12:34:56...

const fingerprint = process.argv[2];

if (!fingerprint) {
    console.error("Please provide the SHA-256 fingerprint as an argument.");
    process.exit(1);
}

const assetLinks = [
    {
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": "com.albidr.clashmanager",
            "sha256_cert_fingerprints": [
                fingerprint
            ]
        }
    }
];

const outputPath = path.resolve('public/.well-known/assetlinks.json');
const dirPath = path.dirname(outputPath);

if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(assetLinks, null, 2));
console.log(`✅ Generated assetlinks.json at ${outputPath}`);
