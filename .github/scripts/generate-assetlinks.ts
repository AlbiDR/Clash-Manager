import fs from "fs";
import path from "path";

/**
 * ============================================================================
 * 🛠️ SCRIPT: GENERATE ASSETLINKS (TypeScript Edition)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Generates the Android Assetlinks JSON for Digital Asset Links.
 * 🏷️ VERSION: 2.0.0
 * ============================================================================
 */

interface AndroidTarget {
  namespace: "android_app";
  package_name: string;
  sha256_cert_fingerprints: string[];
}

interface AssetLink {
  relation: string[];
  target: AndroidTarget;
}

const fingerprint = (process as any).argv[2];

if (!fingerprint) {
  console.error("❌ Please provide the SHA-256 fingerprint as an argument.");
  (process as any).exit(1);
}

const assetLinks: AssetLink[] = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.clashmanager",
      sha256_cert_fingerprints: [fingerprint],
    },
  },
];

const outputPath = path.resolve("public/.well-known/assetlinks.json");
const dirPath = path.dirname(outputPath);

if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

try {
  fs.writeFileSync(outputPath, JSON.stringify(assetLinks, null, 2));
  console.log(`✅ Generated assetlinks.json at ${outputPath}`);
} catch (error: any) {
  console.error(`❌ Failed to write assetlinks.json: ${error.message}`);
  (process as any).exit(1);
}
