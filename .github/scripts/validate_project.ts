import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// @ts-expect-error - plain .mjs module, deliberately shared with the APK scripts
// which are not TypeScript. It is the single source of truth for the semver to
// Android versionCode derivation; see its header for the regression it replaces.
import { androidVersionCode, assertVersionCodeNotRegressed } from './android-version-code.mjs';

/**
 * ============================================================================
 * SCRIPT: VALIDATE PROJECT
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Comprehensive integrity check for the entire repository.
 * Enforces versioning, catalog requirements, DB baseline checks, and env sync.
 * ============================================================================
 */

// --- ESM path workaround ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration & Paths ---
const ROOT_DIR = path.resolve(__dirname, '../../');
const PWA_DIR = path.join(ROOT_DIR, 'Frontend-PWA');
const BACKEND_DIR = path.join(ROOT_DIR, 'Backend');

const PATHS = {
  packageJson: path.join(PWA_DIR, 'package.json'),
  readme: path.join(ROOT_DIR, 'README.md'),
  env: path.join(PWA_DIR, '.env'),
  rootPkg: path.join(ROOT_DIR, 'package.json'),
  pwaPkg: path.join(PWA_DIR, 'package.json'),
  backendPkg: path.join(BACKEND_DIR, 'package.json'),
  htmlEntry: path.join(PWA_DIR, 'src', 'core', 'theme', 'HtmlEntry.ts'),
  manifest: path.join(PWA_DIR, 'public', 'manifest.json'),
  progressiveList: path.join(PWA_DIR, 'src', 'core', 'services', 'useProgressiveList.ts'),
  protocol: path.join(BACKEND_DIR, 'supabase', 'functions', '_shared', 'protocol.ts'),
  workspace: path.join(ROOT_DIR, 'pnpm-workspace.yaml'),
  rootReadme: path.join(ROOT_DIR, 'README.md'),
  pwaReadme: path.join(PWA_DIR, 'README.md'),
  backendReadme: path.join(BACKEND_DIR, 'README.md'),
  dbBaseline: path.join(BACKEND_DIR, 'supabase', 'migrations', '20260531232406_master_migration.sql'),
  dbTypes: path.join(BACKEND_DIR, 'supabase', 'database.types.ts'),
};

const ARGS = process.argv.slice(2);
const IS_FIX_MODE = ARGS.includes('--fix');

// --- Helpers ---
const log = {
  info: (msg: string) => console.log(`[INFO]  ${msg}`),
  pass: (msg: string) => console.log(`[PASS]  ${msg}`),
  warn: (msg: string) => console.log(`[WARN]  ${msg}`),
  fail: (msg: string) => console.error(`[FAIL]  ${msg}`),
  header: (msg: string) => console.log(`\n--- ${msg} ---`),
};

let hasFailure = false;

interface PackageJson {
  name?: string;
  version: string;
  license?: string;
  packageManager?: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts { "schema.table": Set<columnName> } for every `CREATE TABLE IF NOT
 * EXISTS` block in the baseline migration. Table-level constraints (PRIMARY
 * KEY, FOREIGN KEY, CONSTRAINT, UNIQUE, CHECK) are not column declarations
 * and are skipped.
 */
function parseBaselineTableColumns(content: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const tablePattern = /CREATE TABLE IF NOT EXISTS (\w+\.\w+) \(([\s\S]*?)\n\);/g;
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    const [tableKey, body] = [match[1], match[2]];
    const columns = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('--')) continue;
      if (/^(PRIMARY KEY|FOREIGN KEY|CONSTRAINT|UNIQUE|CHECK)\b/i.test(line)) continue;
      const colMatch = /^"?(\w+)"?\s+[A-Za-z]/.exec(line);
      if (colMatch) columns.add(colMatch[1]);
    }
    tables.set(tableKey, columns);
  }
  return tables;
}

/**
 * Extracts { "schema.table": Set<columnName> } from database.types.ts's Row
 * types, for the schemas the baseline migration actually declares tables in.
 * database.types.ts is generated from the live database, so this is what's
 * actually true, independent of what any migration claims.
 */
function parseLiveTableColumns(content: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const lines = content.split('\n');
  const trackedSchemas = new Set(['substrate', 'drivers', 'public', 'features']);
  let currentSchema: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const schemaMatch = /^  (\w+): \{$/.exec(lines[i]);
    if (schemaMatch && trackedSchemas.has(schemaMatch[1])) {
      currentSchema = schemaMatch[1];
      i++;
      continue;
    }
    if (currentSchema && /^    Tables: \{$/.test(lines[i])) {
      i++;
      while (i < lines.length && !/^    \}$/.test(lines[i])) {
        const tableMatch = /^      (\w+): \{$/.exec(lines[i]);
        if (tableMatch) {
          const tableName = tableMatch[1];
          i++;
          if (i < lines.length && /^        Row: \{$/.test(lines[i])) {
            i++;
            const columns = new Set<string>();
            while (i < lines.length && !/^        \}$/.test(lines[i])) {
              const colMatch = /^ {10}(\w+)\??:/.exec(lines[i]);
              if (colMatch) columns.add(colMatch[1]);
              i++;
            }
            tables.set(`${currentSchema}.${tableName}`, columns);
          }
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return tables;
}

/**
 * 1. Scoring Integrity Check
 */
function checkScoringIntegrity() {
  log.header('1. Scoring Logic Integrity');
  log.info('Scoring integrity is enforced via Supabase view definitions. Skipping static check.');
}

/**
 * 2. URL Safety Check
 */
function checkUrlSafety() {
  log.header('2. Environment URL Safety');

  const supabaseUrl = process.env['VITE_SUPABASE_URL'];

  if (!supabaseUrl && fs.existsSync(PATHS.env)) {
    const envContent = fs.readFileSync(PATHS.env, 'utf8');
    const match = envContent.match(/VITE_SUPABASE_URL=(.*)/);
    if (match) {
      const url = match[1].trim();
      log.info(`Supabase URL: ${url.slice(0, 40)}...`);
      log.pass('VITE_SUPABASE_URL is configured.');
      return;
    }
  }

  if (supabaseUrl) {
    log.pass(`VITE_SUPABASE_URL is set (${supabaseUrl.slice(0, 30)}...).`);
  } else {
    log.warn('VITE_SUPABASE_URL not found. Ensure it is set in the environment.');
  }
}

/**
 * 3. Environment Documentation Check
 */
function checkEnvDocumentation() {
  log.header('3. Environment Data Sync');

  const envExamplePath = path.join(PWA_DIR, '.env.example');

  if (!fs.existsSync(PATHS.env)) {
    log.info('.env file not found. Skipping sync check.');
    return;
  }

  if (!fs.existsSync(envExamplePath)) {
    log.warn('Missing .env.example! You should document your secrets.');
    return;
  }

  const parseKeys = (filePath: string) => {
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('=')[0]);
  };

  const envKeys = new Set(parseKeys(PATHS.env));
  const exampleKeys = new Set(parseKeys(envExamplePath));

  const missingInExample = [...envKeys].filter((k) => !exampleKeys.has(k));

  if (missingInExample.length > 0) {
    log.warn(`Undocumented secrets in .env: ${missingInExample.join(', ')}`);
    log.warn('Add these to .env.example to keep project healthy.');
  } else {
    log.pass('.env.example fully documents all active secrets.');
  }
}

/**
 * 4. Version & Catalog Drift Checks
 */
function getGroundTruthVersion(): string {
  const rootPkg = JSON.parse(fs.readFileSync(PATHS.rootPkg, 'utf-8')) as PackageJson;
  const pwaPkg = JSON.parse(fs.readFileSync(PATHS.pwaPkg, 'utf-8')) as PackageJson;

  const versions = [rootPkg.version, pwaPkg.version];
  if (fs.existsSync(PATHS.backendPkg)) {
    const backendPkg = JSON.parse(fs.readFileSync(PATHS.backendPkg, 'utf-8')) as PackageJson;
    versions.push(backendPkg.version);
  }

  // Sorting helper (returns descending version comparison)
  return versions.sort((a, b) => {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    const partsCount = 3;
    for (let i = 0; i < partsCount; i++) {
      if (partsA[i] > partsB[i]) return -1;
      if (partsA[i] < partsB[i]) return 1;
    }
    return 0;
  })[0];
}

function reconcilePackageJson(pkgPath: string, groundTruth: string, rootPkg: PackageJson): string[] {
  if (!fs.existsSync(pkgPath)) return [];
  const content = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(content) as PackageJson;
  const issues: string[] = [];
  let modified = false;

  if (pkg.version !== groundTruth) {
    issues.push(`[DRIFT] ${pkgPath} version is ${pkg.version}, expected ${groundTruth}`);
    if (IS_FIX_MODE) {
      pkg.version = groundTruth;
      modified = true;
    }
  }

  if (pkgPath !== PATHS.rootPkg) {
    if (JSON.stringify(pkg.engines) !== JSON.stringify(rootPkg.engines)) {
      issues.push(`[DRIFT] ${pkgPath} engines mismatch`);
      if (IS_FIX_MODE) {
        pkg.engines = rootPkg.engines;
        modified = true;
      }
    }
    if (pkg.packageManager !== rootPkg.packageManager) {
      issues.push(`[DRIFT] ${pkgPath} packageManager mismatch`);
      if (IS_FIX_MODE) {
        pkg.packageManager = rootPkg.packageManager;
        modified = true;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  return issues;
}

function extractCatalogDeps(): string[] {
  if (!fs.existsSync(PATHS.workspace)) return [];
  const content = fs.readFileSync(PATHS.workspace, 'utf-8');
  const catalogLines = content.split('catalogs:')[1]?.split('\n') || [];
  const deps: string[] = [];

  for (const line of catalogLines) {
    const match = line.match(/^\s+["']?(@?[a-z0-9/-]+)["']?:/);
    if (match) {
      deps.push(match[1]);
    }
  }
  return deps;
}

function reconcileCatalogProtocol(pkgPath: string, catalogDeps: string[]): string[] {
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
  const issues: string[] = [];
  let modified = false;

  const processDeps = (deps?: Record<string, string>) => {
    if (!deps) return;
    for (const dep of catalogDeps) {
      if (deps[dep] && deps[dep] !== 'catalog:') {
        issues.push(`[CATALOG] ${dep} in ${pkgPath} is ${deps[dep]}, should be "catalog:"`);
        if (IS_FIX_MODE) {
          deps[dep] = 'catalog:';
          modified = true;
        }
      }
    }
  };

  processDeps(pkg.dependencies);
  processDeps(pkg.devDependencies);

  if (modified) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  return issues;
}

function reconcileReadme(filePath: string, version: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  let content = fs.readFileSync(filePath, 'utf-8');
  const issues: string[] = [];
  let modified = false;

  const badgeRegex = /-(v[0-9]+\.[0-9]+\.[0-9]+)-/g;
  let match;
  while ((match = badgeRegex.exec(content)) !== null) {
    if (match[1] !== `v${version}`) {
      issues.push(`[DOC] Badge "${match[1]}" in ${filePath} should be "v${version}"`);
      if (IS_FIX_MODE) {
        content = content.replace(match[0], match[0].replace(match[1], `v${version}`));
        modified = true;
      }
    }
  }

  const roadmapRegex = /Roadmap \(v([0-9]+\.[0-9]+\.[0-9]+)\)/;
  const roadmapMatch = content.match(roadmapRegex);
  if (roadmapMatch && roadmapMatch[1] !== version) {
    issues.push(`[DOC] Roadmap "v${roadmapMatch[1]}" in ${filePath} should be "v${version}"`);
    if (IS_FIX_MODE) {
      content = content.replace(roadmapMatch[0], `Roadmap (v${version})`);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
  }
  return issues;
}

function reconcileOtherFiles(groundTruth: string): string[] {
  const issues: string[] = [];
  const majorVersion = groundTruth.split('.')[0];

  if (fs.existsSync(PATHS.manifest)) {
    const manifest = JSON.parse(fs.readFileSync(PATHS.manifest, 'utf-8'));
    if (manifest.id !== `clash-manager-v${majorVersion}`) {
      issues.push(`[DRIFT] manifest.json id mismatch: expected clash-manager-v${majorVersion}`);
      if (IS_FIX_MODE) {
        manifest.id = `clash-manager-v${majorVersion}`;
        fs.writeFileSync(PATHS.manifest, JSON.stringify(manifest, null, 2) + '\n');
      }
    }
  }

  if (fs.existsSync(PATHS.progressiveList)) {
    let content = fs.readFileSync(PATHS.progressiveList, 'utf-8');
    const expected = `[PERF] Optimized for v${groundTruth}:`;
    if (!content.includes(expected)) {
      issues.push(`[DRIFT] useProgressiveList.ts version comment mismatch`);
      if (IS_FIX_MODE) {
        content = content.replace(/\[PERF\] Optimized for v[0-9]+\.[0-9]+\.[0-9]+:/, expected);
        fs.writeFileSync(PATHS.progressiveList, content);
      }
    }
  }

  if (fs.existsSync(PATHS.protocol)) {
    let content = fs.readFileSync(PATHS.protocol, 'utf-8');
    const expected = `version: '${groundTruth}'`;
    if (!content.includes(expected)) {
      issues.push(`[DRIFT] Backend protocol.ts version mismatch`);
      if (IS_FIX_MODE) {
        content = content.replace(/version: '[0-9]+\.[0-9]+\.[0-9]+'/, expected);
        fs.writeFileSync(PATHS.protocol, content);
      }
    }
  }

  if (fs.existsSync(PATHS.htmlEntry)) {
    const content = fs.readFileSync(PATHS.htmlEntry, 'utf-8');
    const expected = '"softwareVersion": "${version}"';
    if (!content.includes(expected)) {
      issues.push(`[DRIFT] HtmlEntry.ts softwareVersion template mismatch`);
    }
  }

  // Sync versionInfo in APK/android/apktool.yml
  const apktoolPath = path.join(ROOT_DIR, 'APK', 'android', 'apktool.yml');
  if (fs.existsSync(apktoolPath)) {
    let content = fs.readFileSync(apktoolPath, 'utf-8');
    
    // Derived by the single shared implementation. This used to be written out
    // by hand here, and the hand-written version was not monotonic: a minor
    // bump from any patch above 10 produced a LOWER code than the release
    // before it, which Android treats as un-installable.
    const expectedCode = androidVersionCode(groundTruth);

    const nameRegex = /versionName:\s*['"]?([0-9.]+)['"]?/;
    const codeRegex = /versionCode:\s*['"]?(\d+)['"]?/;
    
    const nameMatch = content.match(nameRegex);
    const codeMatch = content.match(codeRegex);
    
    let modified = false;
    
    if (!nameMatch || nameMatch[1] !== groundTruth) {
      issues.push(`[DRIFT] apktool.yml versionName mismatch: expected ${groundTruth}`);
      if (IS_FIX_MODE) {
        content = content.replace(nameRegex, `versionName: ${groundTruth}`);
        modified = true;
      }
    }
    
    if (!codeMatch || Number(codeMatch[1]) !== expectedCode) {
      // Independent of the formula on purpose. Whatever arithmetic produced the
      // new code, it must still be above the one already recorded, because
      // Android refuses to install an APK whose versionCode is not higher than
      // the installed one. This catches a regression even if a future edit to
      // the formula looks perfectly reasonable to whoever writes it, and it is
      // never auto-fixed: silently rewriting a regressing code is exactly how
      // this would reach users.
      assertVersionCodeNotRegressed(codeMatch ? Number(codeMatch[1]) : undefined, expectedCode, 'apktool.yml versionCode');

      issues.push(`[DRIFT] apktool.yml versionCode mismatch: expected ${expectedCode}`);
      if (IS_FIX_MODE) {
        content = content.replace(codeRegex, `versionCode: ${expectedCode}`);
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(apktoolPath, content);
    }
  }

  // Sync APK/reference/twa-manifest.json
  const twaManifestPath = path.join(ROOT_DIR, 'APK', 'reference', 'twa-manifest.json');
  if (fs.existsSync(twaManifestPath)) {
    const twaCode = androidVersionCode(groundTruth);
    const twaManifest = JSON.parse(fs.readFileSync(twaManifestPath, 'utf-8'));
    let twaModified = false;

    if (twaManifest.appVersionName !== groundTruth) {
      issues.push(`[DRIFT] twa-manifest.json appVersionName mismatch: expected ${groundTruth}`);
      if (IS_FIX_MODE) { twaManifest.appVersionName = groundTruth; twaModified = true; }
    }
    if (twaManifest.appVersion !== groundTruth) {
      issues.push(`[DRIFT] twa-manifest.json appVersion mismatch: expected ${groundTruth}`);
      if (IS_FIX_MODE) { twaManifest.appVersion = groundTruth; twaModified = true; }
    }
    if (twaManifest.appVersionCode !== twaCode) {
      assertVersionCodeNotRegressed(
        typeof twaManifest.appVersionCode === 'number' ? twaManifest.appVersionCode : undefined,
        twaCode,
        'twa-manifest.json appVersionCode',
      );
      issues.push(`[DRIFT] twa-manifest.json appVersionCode mismatch: expected ${twaCode}`);
      if (IS_FIX_MODE) { twaManifest.appVersionCode = twaCode; twaModified = true; }
    }

    if (twaModified) {
      fs.writeFileSync(twaManifestPath, JSON.stringify(twaManifest, null, 2) + '\n');
    }
  }

  return issues;
}

function checkVersionIntegrity() {
  log.header('4. Version & Monorepo Integrity Audit');
  const groundTruth = getGroundTruthVersion();
  log.info(`Ground Truth Version: ${groundTruth}`);

  const rootPkg = JSON.parse(fs.readFileSync(PATHS.rootPkg, 'utf-8')) as PackageJson;
  const catalogDeps = extractCatalogDeps();

  const allIssues = [
    ...reconcilePackageJson(PATHS.rootPkg, groundTruth, rootPkg),
    ...reconcilePackageJson(PATHS.pwaPkg, groundTruth, rootPkg),
    ...reconcilePackageJson(PATHS.backendPkg, groundTruth, rootPkg),
    ...reconcileCatalogProtocol(PATHS.rootPkg, catalogDeps),
    ...reconcileCatalogProtocol(PATHS.pwaPkg, catalogDeps),
    ...reconcileOtherFiles(groundTruth),
    ...reconcileReadme(PATHS.rootReadme, groundTruth),
    ...reconcileReadme(PATHS.pwaReadme, groundTruth),
    ...reconcileReadme(PATHS.backendReadme, groundTruth),
  ];

  if (allIssues.length === 0) {
    log.pass('No version drift or catalog violations detected.');
  } else {
    allIssues.forEach((issue) => log.fail(issue));
    if (IS_FIX_MODE) {
      log.pass('Reconciliation complete. Drift has been synchronized.');
    } else {
      log.fail('Version integrity audit failed.');
      hasFailure = true;
    }
  }
}

/**
 * 5. Database Baseline & Security Audit
 */
function checkDatabaseBaseline() {
  log.header('5. Database Migration Baseline & Security Audit');

  if (!fs.existsSync(PATHS.dbBaseline)) {
    log.warn(`Database baseline file not found at ${PATHS.dbBaseline}. Skipping.`);
    return;
  }

  const content = fs.readFileSync(PATHS.dbBaseline, 'utf-8');
  const lines = content.split('\n');
  const dbErrors: string[] = [];

  // Function search_path check
  const funcPattern = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([\w\.]+)/i;
  const asPattern = /AS\s+\$(?:function)?\$/i;
  const searchPathPattern = /SET\s+search_path/i;

  let currentFunc: string | null = null;
  let funcStartLine = 0;
  let inFuncHeader = false;
  let hasSearchPath = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = funcPattern.exec(line);
    if (m) {
      currentFunc = m[1];
      funcStartLine = i + 1;
      inFuncHeader = true;
      hasSearchPath = false;
      continue;
    }

    if (inFuncHeader) {
      if (searchPathPattern.test(line)) {
        hasSearchPath = true;
      }
      if (asPattern.test(line)) {
        if (!hasSearchPath) {
          dbErrors.push(`Function ${currentFunc} at line ${funcStartLine} missing SET search_path`);
        }
        inFuncHeader = false;
        currentFunc = null;
      }
    }
  }

  // Idempotent CREATE TABLE check
  //
  // Tracks `/* ... */` block-comment state across lines, not just `--` line
  // comments, so prose in a docblock (e.g. "the CREATE TABLE above already
  // declares...") is never misread as a bad DDL statement. A block comment
  // that opens and closes on the same line is handled by stripping it before
  // the pattern match runs.
  const tablePattern = /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)([\w\.]+)/i;
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line.replace(/\/\*.*?\*\//g, '');

    if (inBlockComment) {
      const closeIdx = line.indexOf('*/');
      if (closeIdx === -1) {
        continue;
      }
      line = line.slice(closeIdx + 2);
      inBlockComment = false;
    }

    const openIdx = line.indexOf('/*');
    if (openIdx !== -1) {
      line = line.slice(0, openIdx);
      inBlockComment = true;
    }

    if (line.includes('--')) {
      continue;
    }
    const m = tablePattern.exec(line);
    if (m) {
      if (line.includes("'") || line.includes('"')) {
        continue;
      }
      dbErrors.push(`Table ${m[1]} at line ${i + 1} missing IF NOT EXISTS`);
    }
  }

  // Row Level Security check
  const tables: string[] = [];
  const tableIfPattern = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([\w\.]+)/gi;
  let match;
  while ((match = tableIfPattern.exec(content)) !== null) {
    tables.push(match[1]);
  }

  for (const table of tables) {
    if (table.includes('elite_tags')) {
      continue;
    }
    const rlsPattern = new RegExp(`ALTER\\s+TABLE\\s+${escapeRegExp(table)}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
    if (!rlsPattern.test(content)) {
      dbErrors.push(`Table ${table} missing RLS`);
    }
  }

  // Idempotent CREATE TRIGGER check
  const triggerPattern = /CREATE\s+(?!OR\s+REPLACE\s+)TRIGGER/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (triggerPattern.test(line)) {
      dbErrors.push(`Trigger at line ${i + 1} missing OR REPLACE`);
    }
  }

  // Formatting & character checks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('—')) {
      dbErrors.push(`Line ${i + 1} has em-dash`);
    }
    let hasAboveBMP = false;
    for (const char of line) {
      const codePoint = char.codePointAt(0);
      if (codePoint !== undefined && codePoint > 0xFFFF) {
        hasAboveBMP = true;
        break;
      }
    }
    if (hasAboveBMP) {
      dbErrors.push(`Line ${i + 1} has emoji/non-BMP char`);
    }
  }

  // Out of line UNIQUE constraints check.
  // Must match a single ALTER TABLE statement that adds a UNIQUE constraint,
  // e.g.: ALTER TABLE foo ADD CONSTRAINT bar UNIQUE (col);
  // Inline UNIQUE inside CREATE TABLE and FK-only ALTER TABLE statements are not flagged.
  const outOfLineUniquePattern = /ALTER\s+TABLE\s+\S+\s+ADD\s+CONSTRAINT\s+\S+\s+UNIQUE\b/i;
  if (outOfLineUniquePattern.test(content)) {
    dbErrors.push('Found out-of-line UNIQUE constraints');
  }

  // Unqualified moddatetime trigger function check
  if (/EXECUTE\s+FUNCTION\s+moddatetime/i.test(content)) {
    dbErrors.push('Unqualified moddatetime call found');
  }

  // Phantom column check (2026-08-26 audit): every column a CREATE TABLE IF
  // NOT EXISTS block declares must actually exist live, or the IF NOT EXISTS
  // guard silently strands it against the already-existing table -- exactly
  // what made public.report_heartbeat raise 42703 on every call for 3.5
  // months (2026-04-30 to 2026-08-17) before anyone noticed, and what a
  // second pass found again on substrate.discovery_cache.discovered_at.
  // database.types.ts is generated from the live database and is the
  // authority here, not this file's own declarations.
  if (!fs.existsSync(PATHS.dbTypes)) {
    log.warn(`database.types.ts not found at ${PATHS.dbTypes}. Skipping phantom-column check.`);
  } else {
    const liveTables = parseLiveTableColumns(fs.readFileSync(PATHS.dbTypes, 'utf-8'));
    const migrationTables = parseBaselineTableColumns(content);
    for (const [tableKey, migrationCols] of migrationTables) {
      const liveCols = liveTables.get(tableKey);
      if (!liveCols) continue; // Table not in database.types.ts; not this check's concern.
      const phantom = [...migrationCols].filter((c) => !liveCols.has(c));
      if (phantom.length > 0) {
        dbErrors.push(
          `Table ${tableKey} declares column(s) not present in database.types.ts, ` +
          `likely silently skipped by CREATE TABLE IF NOT EXISTS: ${phantom.join(', ')}`,
        );
      }
    }
  }

  if (dbErrors.length === 0) {
    log.pass('All database baseline rules and security conditions satisfied.');
  } else {
    dbErrors.forEach((e) => log.fail(e));
    log.fail('Database baseline security check failed.');
    hasFailure = true;
  }
}

// --- Main Execution ---
console.log(`Starting Project Integrity Check... ${IS_FIX_MODE ? '(FIX MODE ACTIVE)' : ''}\n`);

try {
  checkScoringIntegrity();
  checkUrlSafety();
  checkEnvDocumentation();
  checkVersionIntegrity();
  checkDatabaseBaseline();
} catch (e: any) {
  log.fail(`Crash during validation: ${e.message}`);
  hasFailure = true;
}

console.log('\n--------------------------------------------------');
if (hasFailure) {
  log.fail('Project Integrity Check FAILED. See errors above.');
  process.exit(1);
} else {
  log.pass('Project Integrity Check PASSED. All systems nominal.');
  process.exit(0);
}
