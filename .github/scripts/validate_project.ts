import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * ============================================================================
 * SCRIPT: VALIDATE PROJECT
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Comprehensive integrity check for the entire repository.
 * VERSION: 2.1.0
 * ============================================================================
 */

// --- ESM path workaround ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration & Paths ---
const ROOT_DIR = path.resolve(__dirname, "../../");
const PWA_DIR = path.join(ROOT_DIR, "Frontend-PWA");

const PATHS = {
  packageJson: path.join(PWA_DIR, "package.json"),
  readme: path.join(ROOT_DIR, "README.md"),
  env: path.join(PWA_DIR, ".env"),
};

// --- Helpers ---
const log = {
  info: (msg: string) => console.log(`[INFO]  ${msg}`),
  pass: (msg: string) => console.log(`[PASS]  ${msg}`),
  warn: (msg: string) => console.log(`[WARN]  ${msg}`),
  fail: (msg: string) => console.error(`[FAIL]  ${msg}`),
  header: (msg: string) => console.log(`\n--- ${msg} ---`),
};

let hasFailure = false;

/**
 * 1. Scoring Integrity Check
 */
function extractWeightsFromConfig(
  text: string,
  section: string = "ROSTER",
): Record<string, number> | null {
  // Search for "ROSTER: {" then "WEIGHTS: {" inside it
  const rosterIdx = text.search(/ROSTER\s*:\s*{/);
  if (rosterIdx === -1) return null;
  
  const weightsIdx = text.indexOf("WEIGHTS", rosterIdx);
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
  const weights: Record<string, number> = {};
  let m;
  while ((m = re.exec(body)) !== null) {
    weights[m[1]] = Number(m[2]);
  }
  return weights;
}

function extractWeightsFromReadme(text: string): Record<string, number> {
  const formulaIdx = text.indexOf("Current Fame");
  const snippet =
    formulaIdx === -1 ? text : text.slice(formulaIdx, formulaIdx + 400);

  const mapping: Record<string, RegExp> = {
    FAME: /Current Fame[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    AVG_FAME: /(?:Avg|Average) Fame[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    DONATION: /Donations[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    TROPHY: /Trophies[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
    WAR_RATE: /War Rate[^0-9]*([0-9]+\.?[0-9eE-]*)/i,
  };
  const out: Record<string, number> = {};
  Object.keys(mapping).forEach((k) => {
    const m = snippet.match(mapping[k]);
    if (m) out[k] = Number(m[1]);
  });
  return out;
}

function checkScoringIntegrity() {
  log.header("1. Scoring Logic Integrity");
  // Scoring source of truth is now Supabase views (features.roster_view).
  // Static config validation against Configuration.ts has been decommissioned.
  log.info("Scoring integrity is enforced via Supabase view definitions. Skipping static check.");
}

/**
 * 2. URL Safety Check
 */
function checkUrlSafety() {
  log.header("2. Environment URL Safety");

  const supabaseUrl = process.env["VITE_SUPABASE_URL"];

  if (!supabaseUrl && fs.existsSync(PATHS.env)) {
    const envContent = fs.readFileSync(PATHS.env, "utf8");
    const match = envContent.match(/VITE_SUPABASE_URL=(.*)/);
    if (match) {
      const url = match[1].trim();
      log.info(`Supabase URL: ${url.slice(0, 40)}...`);
      log.pass("VITE_SUPABASE_URL is configured.");
      return;
    }
  }

  if (supabaseUrl) {
    log.pass(`VITE_SUPABASE_URL is set (${supabaseUrl.slice(0, 30)}...).`);
  } else {
    log.warn("VITE_SUPABASE_URL not found. Ensure it is set in the environment.");
  }
}

/**
 * 3. Environment Documentation Check
 */
function checkEnvDocumentation() {
  log.header("3. Environment Data Sync");

  const envExamplePath = path.join(PWA_DIR, ".env.example");

  if (!fs.existsSync(PATHS.env)) {
    log.info(".env file not found. Skipping sync check.");
    return;
  }

  if (!fs.existsSync(envExamplePath)) {
    log.warn("Missing .env.example! You should document your secrets.");
    return;
  }

  const parseKeys = (filePath: string) => {
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
    log.warn(`Undocumented secrets in .env: ${missingInExample.join(", ")}`);
    log.warn("Add these to .env.example to keep project healthy.");
  } else {
    log.pass(".env.example fully documents all active secrets.");
  }
}

// --- Main Execution ---
console.log("Starting Project Integrity Check...\n");

try {
  checkScoringIntegrity();
  checkUrlSafety();
  checkEnvDocumentation();
} catch (e: any) {
  log.fail(`Crash during validation: ${e.message}`);
  hasFailure = true;
}

console.log("\n--------------------------------------------------");
if (hasFailure) {
  console.log("Project Integrity Check FAILED. See errors above.");
  (process as any).exit(1);
} else {
  console.log("Project Integrity Check PASSED. All systems nominal.");
  (process as any).exit(0);
}
