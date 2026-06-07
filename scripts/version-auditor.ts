// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * CLASH MANAGER - Version Integrity Auditor
 * ----------------------------------------------------------------------------
 * This script programmatically scans the monorepo for version drift and
 * PNPM catalog protocol violations.
 */

interface PackageJson {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const ROOT_DIR = process.cwd();
const ROOT_PKG_PATH = join(ROOT_DIR, 'package.json');
const PWA_PKG_PATH = join(ROOT_DIR, 'Frontend-PWA', 'package.json');
const HTML_ENTRY_PATH = join(ROOT_DIR, 'Frontend-PWA', 'src', 'core', 'theme', 'HtmlEntry.ts');
const MANIFEST_PATH = join(ROOT_DIR, 'Frontend-PWA', 'public', 'manifest.json');
const PROGRESSIVE_LIST_PATH = join(ROOT_DIR, 'Frontend-PWA', 'src', 'core', 'services', 'useProgressiveList.ts');
const PROTOCOL_PATH = join(ROOT_DIR, 'Backend', 'supabase', 'functions', '_shared', 'protocol.ts');
const WORKSPACE_PATH = join(ROOT_DIR, 'pnpm-workspace.yaml');

// README Paths
const ROOT_README = join(ROOT_DIR, 'README.md');
const PWA_README = join(ROOT_DIR, 'Frontend-PWA', 'README.md');
const BACKEND_README = join(ROOT_DIR, 'Backend', 'README.md');

function getGroundTruthVersion(): string {
  const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, 'utf-8')) as PackageJson;
  const pwaPkg = JSON.parse(readFileSync(PWA_PKG_PATH, 'utf-8')) as PackageJson;

  // Rule: Identify the highest declared version
  const versions = [rootPkg.version, pwaPkg.version];
  return versions.sort().reverse()[0];
}

function checkPackageCatalogProtocol(pkgPath: string, catalogDeps: string[]) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const issues: string[] = [];

  for (const dep of catalogDeps) {
    if (allDeps[dep] && allDeps[dep] !== 'catalog:') {
      issues.push(`Dependency "${dep}" in ${pkgPath} is "${allDeps[dep]}", should be "catalog:"`);
    }
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

function checkReadmeBadges(filePath: string, version: string): string[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const issues: string[] = [];

  // Standard shields.io badge pattern: -v14.0.0-
  const badgeRegex = /-(v[0-9]+\.[0-9]+\.[0-9]+)-/g;
  let match;
  while ((match = badgeRegex.exec(content)) !== null) {
    if (match[1] !== `v${version}`) {
      issues.push(`Badge version "${match[1]}" in ${filePath} should be "v${version}"`);
    }
  }
  return issues;
}

function checkBackendRoadmap(filePath: string, version: string): string[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const issues: string[] = [];

  // Roadmap pattern: Roadmap (v14.0.0)
  const roadmapRegex = /Roadmap \(v([0-9]+\.[0-9]+\.[0-9]+)\)/;
  const match = content.match(roadmapRegex);
  if (match && match[1] !== version) {
    issues.push(`Roadmap version "v${match[1]}" in ${filePath} should be "v${version}"`);
  }
  return issues;
}

function audit() {
  console.log('--- Clash Manager: Version Integrity Audit ---');
  const groundTruth = getGroundTruthVersion();
  console.log(`Ground Truth Version: ${groundTruth}`);

  let driftDetected = false;

  // 1. Version Scan (Manifests & substrate)
  const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, 'utf-8')) as PackageJson;
  if (rootPkg.version !== groundTruth) {
    console.error(`[DRIFT] Root package.json version is ${rootPkg.version}`);
    driftDetected = true;
  }

  const pwaPkg = JSON.parse(readFileSync(PWA_PKG_PATH, 'utf-8')) as PackageJson;
  if (pwaPkg.version !== groundTruth) {
    console.error(`[DRIFT] Frontend-PWA/package.json version is ${pwaPkg.version}`);
    driftDetected = true;
  }

  const majorVersion = groundTruth.split('.')[0];

  if (existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    if (manifest.id !== `clash-manager-v${majorVersion}`) {
      console.error(`[DRIFT] Frontend-PWA/public/manifest.json id mismatch: expected clash-manager-v${majorVersion}, got ${manifest.id}`);
      driftDetected = true;
    }
  }

  if (existsSync(PROGRESSIVE_LIST_PATH)) {
    const content = readFileSync(PROGRESSIVE_LIST_PATH, 'utf-8');
    if (!content.includes(`[PERF] Optimized for v${groundTruth}:`)) {
      console.error(`[DRIFT] useProgressiveList.ts version comment mismatch`);
      driftDetected = true;
    }
  }

  if (existsSync(HTML_ENTRY_PATH)) {
    const content = readFileSync(HTML_ENTRY_PATH, 'utf-8');
    if (!content.includes('"softwareVersion": "${version}"')) {
      console.error(`[DRIFT] HtmlEntry.ts softwareVersion template mismatch`);
      driftDetected = true;
    }
  }

  if (existsSync(PROTOCOL_PATH)) {
    const protocol = readFileSync(PROTOCOL_PATH, 'utf-8');
    if (!protocol.includes(`version: '${groundTruth}'`)) {
      console.error(`[DRIFT] Backend protocol.ts version mismatch`);
      driftDetected = true;
    }
  }

  // 2. Documentation Scan (Badges & Roadmap)
  const readmeIssues = [
    ...checkReadmeBadges(ROOT_README, groundTruth),
    ...checkReadmeBadges(PWA_README, groundTruth),
    ...checkReadmeBadges(BACKEND_README, groundTruth),
    ...checkBackendRoadmap(BACKEND_README, groundTruth)
  ];

  if (readmeIssues.length > 0) {
    driftDetected = true;
    readmeIssues.forEach(issue => console.error(`[DOC-DRIFT] ${issue}`));
  }

  // 3. Catalog Scan
  const catalogDeps = extractCatalogDeps();
  const rootIssues = checkPackageCatalogProtocol(ROOT_PKG_PATH, catalogDeps);
  const pwaIssues = checkPackageCatalogProtocol(PWA_PKG_PATH, catalogDeps);

  if (rootIssues.length > 0 || pwaIssues.length > 0) {
    driftDetected = true;
    [...rootIssues, ...pwaIssues].forEach(issue => console.error(`[CATALOG] ${issue}`));
  }

  if (!driftDetected) {
    console.log('✅ Audit Passed: No version drift or catalog violations detected.');
  } else {
    process.exit(1);
  }
}

audit();
