#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: APK PERFORMANCE AUDIT
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The computed check behind Stage 11 (APK Optimization). Verifies
 * the three surfaces that stage owns: native WebView performance settings, the
 * service worker's caching setup, and the precache footprint every user
 * downloads on install.
 *
 * WHY THIS EXISTS
 * Stage 11 was the only lane in the pipeline with no computed check at all. Its
 * mandate was prose, so its output was prose: seven consecutive nights of
 * "audited native WebView settings, Service Worker caching, and Vite
 * manualChunks; zero source changes required", in two to six minutes, with
 * nothing that could have contradicted it. An audit whose verdict cannot be
 * wrong is not evidence, and a lane with no queue produces paragraphs.
 *
 * THE RULE ABOUT THRESHOLDS
 * Nothing here invents a number. The only hard failure is an asset that
 * exceeds `maximumFileSizeToCacheInBytes`, and that value is read from the
 * project's own vite config rather than chosen here. The footprint itself is
 * reported, not graded, because a byte budget picked by this script would be
 * exactly the hardcoded threshold the ADR forbids. Stage 11 judges the
 * footprint; this script measures it and hands over a ranked queue.
 *
 * THE FAILURE MODE THIS CATCHES AND NOTHING ELSE DOES
 * Workbox silently drops any file larger than `maximumFileSizeToCacheInBytes`
 * from the precache. No error, no warning, and the app simply degrades
 * offline for that asset. Equally silent: an asset that matches
 * `globPatterns` and is not in `globIgnores` is shipped to every user on
 * install whether or not it is needed offline. At the time of writing that
 * set includes a 313 KB Open Graph card, which exists for social link
 * previews and is never needed by a running app.
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');

const PATHS = {
  mainActivity: 'APK/src/com/albidr/clashmanager/MainActivity.java',
  androidManifest: 'APK/android/AndroidManifest.xml',
  serviceWorker: 'Frontend-PWA/src/app/sw.ts',
  viteConfig: 'Frontend-PWA/vite.config.ts',
  publicDir: 'Frontend-PWA/public',
};

/**
 * Invariants that must be present for the wrapper to perform as designed.
 * Each is a named, independently checkable fact with a stated consequence, so
 * a failure says what the user loses rather than only what changed.
 */
export const PERFORMANCE_INVARIANTS = [
  {
    id: 'webview-cache-mode',
    file: 'mainActivity',
    pattern: /setCacheMode\s*\(\s*WebSettings\.LOAD_CACHE_ELSE_NETWORK\s*\)/,
    consequence: 'Every navigation refetches from the network instead of serving the cached shell first.',
  },
  {
    id: 'webview-offscreen-preraster',
    file: 'mainActivity',
    pattern: /setOffscreenPreRaster\s*\(\s*true\s*\)/,
    consequence: 'Content is rasterised only when scrolled into view, producing visible blank frames while scrolling.',
  },
  {
    id: 'webview-dom-storage',
    file: 'mainActivity',
    pattern: /setDomStorageEnabled\s*\(\s*true\s*\)/,
    consequence: 'localStorage and IndexedDB are unavailable, so the app cannot persist anything between sessions.',
  },
  {
    id: 'webview-images-automatic',
    file: 'mainActivity',
    pattern: /setLoadsImagesAutomatically\s*\(\s*true\s*\)/,
    consequence: 'Images never load until touched, which reads as a broken layout.',
  },
  {
    id: 'webview-media-no-gesture',
    file: 'mainActivity',
    pattern: /setMediaPlaybackRequiresUserGesture\s*\(\s*false\s*\)/,
    consequence: 'Inline media requires a tap before it can start, breaking autoplaying UI affordances.',
  },
  {
    id: 'manifest-hardware-accelerated',
    file: 'androidManifest',
    pattern: /android:hardwareAccelerated="true"/,
    consequence: 'The WebView renders on the CPU, which drops frames on any scroll or animation.',
  },
  {
    id: 'sw-precache-route',
    file: 'serviceWorker',
    pattern: /precacheAndRoute\s*\(/,
    consequence: 'Nothing is precached, so the app shell is unavailable offline and cold starts hit the network.',
  },
  {
    id: 'sw-navigation-preload',
    file: 'serviceWorker',
    pattern: /navigationPreload\s*\.\s*enable\s*\(\s*\)/,
    consequence: 'Navigation requests wait for the service worker to boot before starting, adding latency to every cold navigation.',
  },
  {
    id: 'vite-manual-chunks',
    file: 'viteConfig',
    pattern: /manualChunks\s*\(/,
    consequence: 'Vendor code is not split, so a single large bundle blocks first paint.',
  },
];

/** Converts the glob subset used by the vite config into a regular expression. */
export function globToRegExp(glob) {
  let out = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        // `**/` spans any number of directories, including none.
        if (glob[index + 2] === '/') { out += '(?:.*/)?'; index += 2; } else { out += '.*'; index += 1; }
      } else {
        out += '[^/]*';
      }
    } else if (char === '{') {
      const close = glob.indexOf('}', index);
      out += `(?:${glob.slice(index + 1, close).split(',').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
      index = close;
    } else if (char === '?') {
      out += '[^/]';
    } else {
      out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** Reads the precache configuration out of the vite config, never from a constant here. */
export function readPrecacheConfig(viteSource) {
  const patterns = viteSource.match(/globPatterns:\s*\[([^\]]*)\]/s);
  const ignores = viteSource.match(/globIgnores:\s*\[([^\]]*)\]/s);
  const maxSize = viteSource.match(/maximumFileSizeToCacheInBytes:\s*([^,\n]+)/);

  const list = raw => (raw ? [...raw[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map(m => m[1]) : []);

  let maximumFileSizeToCacheInBytes = null;
  if (maxSize) {
    // Accepts the declared arithmetic form (5 * 1024 * 1024) without eval.
    const factors = maxSize[1].trim().split('*').map(part => Number(part.trim()));
    if (factors.every(Number.isFinite)) maximumFileSizeToCacheInBytes = factors.reduce((a, b) => a * b, 1);
  }

  return {
    globPatterns: list(patterns),
    globIgnores: list(ignores),
    maximumFileSizeToCacheInBytes,
  };
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push({ relative: path.relative(base, full).split(path.sep).join('/'), bytes: statSync(full).size });
  }
  return out;
}

/**
 * The set of assets that will actually be shipped into every user's precache:
 * everything matching globPatterns that is not excluded by globIgnores.
 */
export function computePrecacheSet(files, config) {
  const included = config.globPatterns.map(globToRegExp);
  const excluded = config.globIgnores.map(globToRegExp);
  return files
    .filter(file => included.some(re => re.test(file.relative)))
    .filter(file => !excluded.some(re => re.test(file.relative)))
    .sort((a, b) => b.bytes - a.bytes);
}

export function auditPerformance({ repoRoot = REPO_ROOT, readFile, listPublic } = {}) {
  const read = readFile || (key => readFileSync(path.join(repoRoot, PATHS[key]), 'utf8'));
  const sources = {};
  const violations = [];

  for (const key of ['mainActivity', 'androidManifest', 'serviceWorker', 'viteConfig']) {
    try { sources[key] = read(key); } catch { sources[key] = null; }
  }

  const checks = PERFORMANCE_INVARIANTS.map(invariant => {
    const source = sources[invariant.file];
    if (source === null) {
      const result = { id: invariant.id, status: 'UNREADABLE', consequence: invariant.consequence };
      violations.push(`${invariant.id}: ${PATHS[invariant.file]} could not be read, so the invariant is unverified.`);
      return result;
    }
    const present = invariant.pattern.test(source);
    if (!present) violations.push(`${invariant.id}: missing. ${invariant.consequence}`);
    return { id: invariant.id, status: present ? 'PRESENT' : 'MISSING', consequence: invariant.consequence };
  });

  const config = sources.viteConfig ? readPrecacheConfig(sources.viteConfig) : { globPatterns: [], globIgnores: [], maximumFileSizeToCacheInBytes: null };
  const files = listPublic ? listPublic() : walk(path.join(repoRoot, PATHS.publicDir));
  const precache = computePrecacheSet(files, config);
  const totalBytes = precache.reduce((sum, file) => sum + file.bytes, 0);

  // The one hard size failure, and its limit comes from the project's own
  // config: workbox drops an oversized file from the precache silently, so
  // the asset is simply absent offline with nothing logged anywhere.
  const oversized = config.maximumFileSizeToCacheInBytes
    ? precache.filter(file => file.bytes > config.maximumFileSizeToCacheInBytes)
    : [];
  for (const file of oversized) {
    violations.push(`precache-oversized: ${file.relative} is ${Math.round(file.bytes / 1024)} KB, above the declared maximumFileSizeToCacheInBytes. Workbox drops it from the precache silently and it will be missing offline.`);
  }

  return {
    version: 1,
    status: violations.length ? 'FAIL' : 'PASS',
    invariants: checks,
    precache: {
      fileCount: precache.length,
      totalBytes,
      maximumFileSizeToCacheInBytes: config.maximumFileSizeToCacheInBytes,
      // Ranked, so the lane gets a queue rather than a verdict. Not graded:
      // a byte budget invented here would be the hardcoded threshold the ADR
      // forbids, and the judgement of what belongs offline is the lane's.
      largest: precache.slice(0, 10).map(file => ({ file: file.relative, bytes: file.bytes })),
    },
    violations,
  };
}

function render(report) {
  const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;
  const lines = [`APK performance audit: ${report.status}`, ''];

  lines.push('Wrapper and caching invariants:');
  for (const check of report.invariants) {
    lines.push(`  ${check.status === 'PRESENT' ? 'ok  ' : 'FAIL'} ${check.id}`);
    if (check.status !== 'PRESENT') lines.push(`       ${check.consequence}`);
  }

  lines.push('', `Precache footprint: ${report.precache.fileCount} files, ${kb(report.precache.totalBytes)} shipped to every user on install.`);
  if (report.precache.maximumFileSizeToCacheInBytes) {
    lines.push(`Declared per-file cache limit: ${kb(report.precache.maximumFileSizeToCacheInBytes)} (read from vite.config.ts).`);
  }
  lines.push('Largest precached assets, the queue for this lane to judge:');
  for (const item of report.precache.largest) lines.push(`  ${kb(item.bytes).padStart(10)}  ${item.file}`);

  if (report.violations.length) {
    lines.push('', 'VIOLATIONS:');
    for (const violation of report.violations) lines.push(`  - ${violation}`);
  } else {
    lines.push('', 'No violations: every invariant is present and no asset exceeds the declared cache limit.');
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditPerformance();
  process.stdout.write(process.argv.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : render(report));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
