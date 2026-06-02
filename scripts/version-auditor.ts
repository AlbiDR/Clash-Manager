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
const HTML_PATH = join(ROOT_DIR, 'Frontend-PWA', 'index.html');
const PROTOCOL_PATH = join(ROOT_DIR, 'Backend', 'supabase', 'functions', '_shared', 'protocol.ts');
const WORKSPACE_PATH = join(ROOT_DIR, 'pnpm-workspace.yaml');

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

function audit() {
  console.log('--- Clash Manager: Version Integrity Audit ---');
  const groundTruth = getGroundTruthVersion();
  console.log(`Ground Truth Version: ${groundTruth}`);

  let driftDetected = false;

  // 1. Version Scan
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

  if (existsSync(HTML_PATH)) {
    const html = readFileSync(HTML_PATH, 'utf-8');
    if (!html.includes(`"softwareVersion": "${groundTruth}"`)) {
      console.error(`[DRIFT] Frontend-PWA/index.html softwareVersion mismatch`);
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

  // 2. Catalog Scan
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
