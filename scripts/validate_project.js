const fs = require("fs");
const path = require("path");

// --- Configuration & Paths ---
const ROOT_DIR = path.resolve(__dirname, "..");
const PWA_DIR = path.join(ROOT_DIR, "Frontend-PWA");
const TAURI_DIR = path.join(PWA_DIR, "src-tauri");
const GAS_DIR = path.join(ROOT_DIR, "Backend-GAS");

const PATHS = {
  packageJson: path.join(PWA_DIR, "package.json"),
  tauriConf: path.join(TAURI_DIR, "tauri.conf.json"),
  cargoToml: path.join(TAURI_DIR, "Cargo.toml"),
  backendConfig: path.join(GAS_DIR, "Configuration.gs.js"),
  readme: path.join(ROOT_DIR, "README.md"),
  env: path.join(PWA_DIR, ".env"),
};

// --- Helpers ---
const log = {
  info: (msg) => console.log(`[INFO]  ${msg}`),
  pass: (msg) => console.log(`[PASS]  ${msg}`),
  warn: (msg) => console.log(`[WARN]  ${msg}`),
  fail: (msg) => console.error(`[FAIL]  ${msg}`),
  header: (msg) => console.log(`\n--- ${msg} ---`),
};

let hasFailure = false;

// --- 1. Version Sync Check ---
function checkVersionSync() {
  log.header("1. Version Synchronization");

  if (!fs.existsSync(PATHS.packageJson) || !fs.existsSync(PATHS.tauriConf)) {
    log.fail("Missing package.json or tauri.conf.json");
    hasFailure = true;
    return;
  }

  const pkg = require(PATHS.packageJson);
  const tauri = require(PATHS.tauriConf);

  log.info(`Package Version: ${pkg.version}`);
  log.info(`Tauri Version:   ${tauri.version}`);

  if (pkg.version === tauri.version) {
    log.pass("Versions are synchronized.");
  } else {
    log.warn(
      `Version mismatch! Standardize before release. (Package: ${pkg.version} vs Tauri: ${tauri.version})`
    );
    // Warning only, strictly speaking they don't *have* to match for dev, but good for release.
  }
}

// --- 2. Scoring Integrity Check ---
function extractWeightsFromConfig(text, section = "LEADERBOARD") {
  const secIdx = text.lastIndexOf(section + ":");
  if (secIdx === -1) return null;
  const weightsIdx = text.indexOf("WEIGHTS", secIdx);
  if (weightsIdx === -1) return null;
  const braceStart = text.indexOf("{", weightsIdx);
  if (braceStart === -1) return null;

  let i = braceStart;
  let depth = 0;
  while (i < text.length) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  if (depth !== 0) return null;

  const body = text.slice(braceStart + 1, i);
  const re = /([A-Z_]+)\s*:\s*([0-9.eE+-]+)/g;
  const weights = {};
  let m;
  while ((m = re.exec(body)) !== null) {
    weights[m[1]] = Number(m[2]);
  }
  return weights;
}

function extractWeightsFromReadme(text) {
  const formulaIdx = text.indexOf("Current Fame");
  const snippet =
    formulaIdx === -1 ? text : text.slice(formulaIdx, formulaIdx + 400);

  const mapping = {
    FAME: /Current Fame[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    AVG_FAME: /Avg Fame[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    DONATION: /Donations[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    TROPHY: /Trophies[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    WAR_RATE: /War Rate[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
  };
  const out = {};
  Object.keys(mapping).forEach((k) => {
    const m = snippet.match(mapping[k]);
    if (m) out[k] = Number(m[1]);
  });
  return out;
}

function checkScoringIntegrity() {
  log.header("2. Scoring Logic Integrity");

  if (!fs.existsSync(PATHS.backendConfig) || !fs.existsSync(PATHS.readme)) {
    log.fail("Missing Backend Configuration or README for scoring check.");
    hasFailure = true;
    return;
  }

  const configText = fs.readFileSync(PATHS.backendConfig, "utf8");
  const readmeText = fs.readFileSync(PATHS.readme, "utf8");

  const cfgWeights = extractWeightsFromConfig(configText);
  const docWeights = extractWeightsFromReadme(readmeText);

  if (!cfgWeights) {
    log.fail("Could not find WEIGHTS in Configuration.gs.js");
    hasFailure = true;
    return;
  }
  if (!docWeights || Object.keys(docWeights).length === 0) {
    log.warn("Could not find weights in README (Is documentation missing?)");
    return;
  }

  const keys = ["FAME", "AVG_FAME", "DONATION", "TROPHY", "WAR_RATE"];
  let allMatch = true;

  keys.forEach((k) => {
    const cfgVal = cfgWeights[k];
    const docVal = docWeights[k];
    const diff = Math.abs((Number(cfgVal) || 0) - (Number(docVal) || 0));

    if (diff > 1e-6) {
      log.fail(`Mismatch ${k}: Config=${cfgVal} vs Doc=${docVal}`);
      allMatch = false;
      hasFailure = true;
    }
  });

  if (allMatch) {
    log.pass("Documentation matches backend logic perfectly.");
  }
}

// --- 3. Tauri Configuration Health ---
function checkTauriConfig() {
  log.header("3. Tauri Configuration Health");

  if (!fs.existsSync(PATHS.tauriConf)) return;
  const tauri = require(PATHS.tauriConf);
  const plugins = tauri.plugins || {};

  const emptyPlugins = Object.entries(plugins).filter(
    ([_, config]) =>
      typeof config === "object" &&
      config !== null &&
      Object.keys(config).length === 0
  );

  if (emptyPlugins.length > 0) {
    log.fail(
      `Found empty plugin configurations: ${emptyPlugins.map((e) => e[0]).join(", ")}`
    );
    log.fail(
      "Empty plugin objects cause crashes in Tauri v2. Remove them from tauri.conf.json."
    );
    hasFailure = true;
  } else {
    log.pass("Plugin configuration looks clean (no empty objects).");
  }

  if (
    tauri.identifier === "com.tauri.dev" ||
    tauri.identifier === "com.your.app"
  ) {
    log.warn(
      `Generic Bundle ID detected: "${tauri.identifier}". Change before releasing.`
    );
  } else {
    log.pass(`Bundle ID validated: ${tauri.identifier}`);
  }
}

// --- 4. URL Safety Check ---
function checkUrlSafety() {
  log.header("4. Environment URL Safety");

  let gasUrl = process.env.VITE_GAS_URL;

  // Try reading local .env if env var is missing
  if (!gasUrl && fs.existsSync(PATHS.env)) {
    const envContent = fs.readFileSync(PATHS.env, "utf8");
    const match = envContent.match(/VITE_GAS_URL=(.*)/);
    if (match) gasUrl = match[1].trim();
  }

  if (!gasUrl) {
    log.warn("VITE_GAS_URL not found in env or .env. Cannot validate.");
    return;
  }

  log.info(`Target URL: ${gasUrl.slice(0, 40)}...`);

  if (gasUrl.includes("/exec")) {
    log.pass("Targeting PRODUCTION deployment (/exec).");
  } else if (gasUrl.includes("/dev") || gasUrl.includes("/test")) {
    log.warn(
      "⚠️  Targeting DEVELOPMENT deployment (/dev or /test). Be careful!"
    );
  } else {
    log.info("URL endpoint type unknown (not standard /exec or /dev).");
  }

  if (gasUrl.includes("script.google.com")) {
    log.pass("Verified Google Apps Script domain.");
  } else {
    log.warn("URL does not look like a Google Apps Script URL.");
  }
}

// --- 5. Asset Health Check ---
function checkAssets() {
  log.header("5. Asset Integrity Check");

  const tauri = require(PATHS.tauriConf);
  const iconConfig = tauri.bundle?.icon || [];
  let allAssetsFound = true;

  if (!Array.isArray(iconConfig)) {
    log.warn("Tauri icon config is not an array. Skipping check.");
    return;
  }

  iconConfig.forEach((iconPath) => {
    // Icons are relative to src-tauri root (usually) or local path
    const fullPath = path.join(TAURI_DIR, iconPath);
    if (!fs.existsSync(fullPath)) {
      log.fail(`Missing Icon: ${iconPath} (Expected at: ${fullPath})`);
      hasFailure = true;
      allAssetsFound = false;
    }
  });

  if (allAssetsFound) {
    log.pass(`Verified ${iconConfig.length} icon assets exist.`);
  }
}

// --- 6. Environment Documentation Check ---
function checkEnvDocumentation() {
  log.header("6. Environment Data Sync");

  const envExamplePath = path.join(PWA_DIR, ".env.example");

  if (!fs.existsSync(PATHS.env)) {
    log.info(".env file not found (Clean checkout?). Skipping sync check.");
    return;
  }

  if (!fs.existsSync(envExamplePath)) {
    log.warn("⚠️  Missing .env.example! You should document your secrets.");
    return;
  }

  const parseKeys = (filePath) => {
    return fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("=")[0]);
  };

  const envKeys = new Set(parseKeys(PATHS.env));
  const exampleKeys = new Set(parseKeys(envExamplePath));

  const missingInExample = [...envKeys].filter((k) => !exampleKeys.has(k));

  if (missingInExample.length > 0) {
    log.warn(
      `Undocumented secrets in .env: ${missingInExample.join(", ")}`
    );
    log.warn("👉 Add these to .env.example to keep project healthy.");
  } else {
    log.pass(".env.example fully documents all active secrets.");
  }
}

// --- Main Execution ---
console.log("🚀 Starting Project Integrity Check...\n");

try {
  checkVersionSync();
  checkScoringIntegrity();
  checkTauriConfig();
  checkUrlSafety();
  checkAssets();
  checkEnvDocumentation();
} catch (e) {
  log.fail(`Crash during validation: ${e.message}`);
  hasFailure = true;
}

console.log("\n--------------------------------------------------");
if (hasFailure) {
  console.log("❌ Project Integrity Check FAILED. See errors above.");
  process.exit(1);
} else {
  console.log("✅ Project Integrity Check PASSED. All systems nominal.");
  process.exit(0);
}
