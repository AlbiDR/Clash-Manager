// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import fs from "fs";
import path from "path";

/**
 * ============================================================================
 * SCRIPT: GENERATE ASSETLINKS (TypeScript Edition)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Generates the Android Assetlinks JSON for Digital Asset Links.
 * VERSION: 2.1.0
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
  console.error("[ERROR] Please provide the SHA-256 fingerprint as an argument.");
  (process as any).exit(1);
}

const assetLinks: AssetLink[] = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.albidr.clashmanager",
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
  console.log(`[OK] Generated assetlinks.json at ${outputPath}`);
} catch (error: any) {
  console.error(`[ERROR] Failed to write assetlinks.json: ${error.message}`);
  (process as any).exit(1);
}
