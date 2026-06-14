// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * CLASH MANAGER - Version Integrity Auditor & Reconciler
 * ----------------------------------------------------------------------------
 * This script programmatically scans and reconciles the monorepo for version
 * drift and PNPM catalog protocol violations.
 */

interface PackageJson {
  name?: string;
  version: string;
  license?: string;
  packageManager?: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const ROOT_DIR = process.cwd();
const ROOT_PKG_PATH = join(ROOT_DIR, 'package.json');
const PWA_PKG_PATH = join(ROOT_DIR, 'Frontend-PWA', 'package.json');
const BACKEND_PKG_PATH = join(ROOT_DIR, 'Backend', 'package.json');
const HTML_ENTRY_PATH = join(ROOT_DIR, 'Frontend-PWA', 'src', 'core', 'theme', 'HtmlEntry.ts');
const MANIFEST_PATH = join(ROOT_DIR, 'Frontend-PWA', 'public', 'manifest.json');
const PROGRESSIVE_LIST_PATH = join(ROOT_DIR, 'Frontend-PWA', 'src', 'core', 'services', 'useProgressiveList.ts');
const PROTOCOL_PATH = join(ROOT_DIR, 'Backend', 'supabase', 'functions', '_shared', 'protocol.ts');
const WORKSPACE_PATH = join(ROOT_DIR, 'pnpm-workspace.yaml');

// README Paths
const ROOT_README = join(ROOT_DIR, 'README.md');
const PWA_README = join(ROOT_DIR, 'Frontend-PWA', 'README.md');
const BACKEND_README = join(ROOT_DIR, 'Backend', 'README.md');

const ARGS = process.argv.slice(2);
const IS_FIX_MODE = ARGS.includes('--fix');

function getGroundTruthVersion(): string {
  const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, 'utf-8')) as PackageJson;
  const pwaPkg = JSON.parse(readFileSync(PWA_PKG_PATH, 'utf-8')) as PackageJson;

  const versions = [rootPkg.version, pwaPkg.version];
  if (existsSync(BACKEND_PKG_PATH)) {
    const backendPkg = JSON.parse(readFileSync(BACKEND_PKG_PATH, 'utf-8')) as PackageJson;
    versions.push(backendPkg.version);
  }

  // Rule: Highest declared version is ground truth
  return versions.sort((a, b) => {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (partsA[i] > partsB[i]) return -1;
      if (partsA[i] < partsB[i]) return 1;
    }
    return 0;
  })[0];
}

function reconcilePackageJson(pkgPath: string, groundTruth: string, rootPkg: PackageJson) {
  if (!existsSync(pkgPath)) return [];
  const content = readFileSync(pkgPath, 'utf-8');
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

  // Synchronize engines and packageManager from root
  if (pkgPath !== ROOT_PKG_PATH) {
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
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  return issues;
}

function reconcileCatalogProtocol(pkgPath: string, catalogDeps: string[]) {
  if (!existsSync(pkgPath)) return [];
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;
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
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  return issues;
}

function extractCatalogDeps(): string[] {
  const content = readFileSync(WORKSPACE_PATH, 'utf-8');
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

function reconcileReadme(filePath: string, version: string) {
  if (!existsSync(filePath)) return [];
  let content = readFileSync(filePath, 'utf-8');
  const issues: string[] = [];
  let modified = false;

  // 1. Shields.io badges
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

  // 2. Roadmap version
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
    writeFileSync(filePath, content);
  }
  return issues;
}

function reconcileOtherFiles(groundTruth: string) {
  const issues: string[] = [];
  const majorVersion = groundTruth.split('.')[0];

  // 1. PWA Manifest ID
  if (existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    if (manifest.id !== `clash-manager-v${majorVersion}`) {
      issues.push(`[DRIFT] manifest.json id mismatch: expected clash-manager-v${majorVersion}`);
      if (IS_FIX_MODE) {
        manifest.id = `clash-manager-v${majorVersion}`;
        writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
      }
    }
  }

  // 2. Progressive List Comment
  if (existsSync(PROGRESSIVE_LIST_PATH)) {
    let content = readFileSync(PROGRESSIVE_LIST_PATH, 'utf-8');
    const expected = `[PERF] Optimized for v${groundTruth}:`;
    if (!content.includes(expected)) {
      issues.push(`[DRIFT] useProgressiveList.ts version comment mismatch`);
      if (IS_FIX_MODE) {
        content = content.replace(/\[PERF\] Optimized for v[0-9]+\.[0-9]+\.[0-9]+:/, expected);
        writeFileSync(PROGRESSIVE_LIST_PATH, content);
      }
    }
  }

  // 3. Protocol Constant
  if (existsSync(PROTOCOL_PATH)) {
    let content = readFileSync(PROTOCOL_PATH, 'utf-8');
    const expected = `version: '${groundTruth}'`;
    if (!content.includes(expected)) {
      issues.push(`[DRIFT] Backend protocol.ts version mismatch`);
      if (IS_FIX_MODE) {
        content = content.replace(/version: '[0-9]+\.[0-9]+\.[0-9]+'/, expected);
        writeFileSync(PROTOCOL_PATH, content);
      }
    }
  }

  // 4. HTML Entry Template Verification
  if (existsSync(HTML_ENTRY_PATH)) {
    const content = readFileSync(HTML_ENTRY_PATH, 'utf-8');
    const expected = '"softwareVersion": "${version}"';
    if (!content.includes(expected)) {
      issues.push(`[DRIFT] HtmlEntry.ts softwareVersion template mismatch`);
      // Note: This is a template, we don't automatically fix it if the string is completely missing
      // as it's a structural requirement rather than a version-specific one.
    }
  }

  return issues;
}

function audit() {
  console.log(`--- Clash Manager: Version Integrity ${IS_FIX_MODE ? 'Reconciliation' : 'Audit'} ---`);
  const groundTruth = getGroundTruthVersion();
  console.log(`Ground Truth Version: ${groundTruth}`);

  const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, 'utf-8')) as PackageJson;
  const catalogDeps = extractCatalogDeps();

  const allIssues = [
    ...reconcilePackageJson(ROOT_PKG_PATH, groundTruth, rootPkg),
    ...reconcilePackageJson(PWA_PKG_PATH, groundTruth, rootPkg),
    ...reconcilePackageJson(BACKEND_PKG_PATH, groundTruth, rootPkg),
    ...reconcileCatalogProtocol(ROOT_PKG_PATH, catalogDeps),
    ...reconcileCatalogProtocol(PWA_PKG_PATH, catalogDeps),
    ...reconcileOtherFiles(groundTruth),
    ...reconcileReadme(ROOT_README, groundTruth),
    ...reconcileReadme(PWA_README, groundTruth),
    ...reconcileReadme(BACKEND_README, groundTruth),
  ];

  if (allIssues.length === 0) {
    console.log('✅ Success: No version drift or catalog violations detected.');
  } else {
    allIssues.forEach(issue => console.error(issue));
    if (IS_FIX_MODE) {
      console.log('\n✨ Reconciliation complete. Drift has been synchronized.');
    } else {
      console.log('\n❌ Drift detected. Run with --fix to reconcile.');
      process.exit(1);
    }
  }
}

audit();
