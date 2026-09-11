// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PERFORMANCE_INVARIANTS,
  auditPerformance,
  computePrecacheSet,
  globToRegExp,
  readPrecacheConfig,
} from './audit-apk-performance.mjs';

const SOURCES = {
  mainActivity: `
    settings.setDomStorageEnabled(true);
    settings.setLoadsImagesAutomatically(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setOffscreenPreRaster(true);
    settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
  `,
  androidManifest: '<application android:hardwareAccelerated="true" />',
  serviceWorker: 'precacheAndRoute(self.__WB_MANIFEST || []);\nawait self.registration.navigationPreload.enable();',
  viteConfig: `
    manualChunks(id) { return "vendor"; }
    globPatterns: ["**/*.{js,css,png,webp}"],
    globIgnores: ["assets/branding/*.webp"],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  `,
};

const run = (overrides = {}, files = []) =>
  auditPerformance({
    readFile: key => {
      const merged = { ...SOURCES, ...overrides };
      if (merged[key] === null) throw new Error('unreadable');
      return merged[key];
    },
    listPublic: () => files,
  });

test('a healthy wrapper passes with no violations', () => {
  const report = run();
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.violations, []);
  assert.ok(report.invariants.every(i => i.status === 'PRESENT'));
});

test('every declared invariant can actually fail', () => {
  // The point of the lane. An audit whose verdict cannot be wrong is not
  // evidence, and Stage 11 had exactly that for seven nights.
  for (const invariant of PERFORMANCE_INVARIANTS) {
    const gutted = { ...SOURCES, [invariant.file]: 'nothing relevant here' };
    const report = auditPerformance({ readFile: key => gutted[key], listPublic: () => [] });
    assert.equal(report.status, 'FAIL', `${invariant.id} did not fail when removed`);
    assert.ok(
      report.violations.some(v => v.startsWith(`${invariant.id}:`)),
      `${invariant.id} was removed but not reported`,
    );
  }
});

test('a failure states the consequence, not just the diff', () => {
  const report = run({ mainActivity: 'settings.setDomStorageEnabled(true);' });
  const violation = report.violations.find(v => v.startsWith('webview-cache-mode:'));
  assert.match(violation, /refetches from the network/);
});

test('an unreadable source is unverified, never silently passing', () => {
  const report = run({ serviceWorker: null });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.violations.some(v => v.includes('could not be read')));
  assert.ok(report.invariants.some(i => i.status === 'UNREADABLE'));
});

test('reads the cache limit from the project config rather than inventing one', () => {
  const config = readPrecacheConfig(SOURCES.viteConfig);
  assert.equal(config.maximumFileSizeToCacheInBytes, 5 * 1024 * 1024);
  assert.deepEqual(config.globPatterns, ['**/*.{js,css,png,webp}']);
  assert.deepEqual(config.globIgnores, ['assets/branding/*.webp']);
});

test('an asset above the declared limit is a hard failure', () => {
  // Workbox drops it from the precache with no error, so the asset is simply
  // missing offline. Nothing else in the repository notices.
  const report = run({}, [{ relative: 'huge.png', bytes: 6 * 1024 * 1024 }]);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.violations.some(v => v.includes('precache-oversized') && v.includes('silently')));
});

test('the precache set honours globIgnores', () => {
  const files = [
    { relative: 'app.js', bytes: 10 },
    { relative: 'assets/branding/hero.webp', bytes: 900 },
    { relative: 'assets/icons/icon.png', bytes: 20 },
    { relative: 'notes.txt', bytes: 5 },
  ];
  const set = computePrecacheSet(files, readPrecacheConfig(SOURCES.viteConfig));
  assert.deepEqual(set.map(f => f.relative), ['assets/icons/icon.png', 'app.js'],
    'ignored webp and unmatched txt are excluded, and the result is ranked by size');
});

test('the footprint is reported and ranked, never graded against an invented budget', () => {
  const report = run({}, [
    { relative: 'big.png', bytes: 300_000 },
    { relative: 'small.png', bytes: 1_000 },
  ]);
  assert.equal(report.status, 'PASS', 'a large but legal asset is a queue item, not a violation');
  assert.equal(report.precache.totalBytes, 301_000);
  assert.equal(report.precache.largest[0].file, 'big.png');
});

test('glob translation handles the forms the vite config actually uses', () => {
  assert.ok(globToRegExp('**/*.{js,css}').test('a/b/c.js'));
  assert.ok(globToRegExp('**/*.{js,css}').test('top.css'), 'a leading **/ must match zero directories');
  assert.ok(!globToRegExp('**/*.{js,css}').test('a/b/c.png'));
  assert.ok(globToRegExp('assets/branding/*.webp').test('assets/branding/x.webp'));
  assert.ok(!globToRegExp('assets/branding/*.webp').test('assets/branding/deep/x.webp'), 'a single * must not cross a directory');
  assert.ok(globToRegExp('**/splash.png').test('images/splash.png'));
});
