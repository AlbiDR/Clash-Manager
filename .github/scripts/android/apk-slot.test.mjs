// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { compareSlots, slotOrdinal } from './apk-slot.mjs';

const slot = (version, buildNumber) => slotOrdinal(JSON.stringify({ version, buildNumber }));

test('orders the 2026-09-10 regression correctly', () => {
  // The sync replaced v14.50.46+330 with v14.50.33+312 and nothing objected.
  const beta = slot('14.50.46', 330);
  const nightly = slot('14.50.33', 312);
  assert.equal(compareSlots(beta, nightly), 1, 'Beta build must win');
  assert.equal(compareSlots(nightly, beta), -1, 'and the comparison must be symmetric');
});

test('orders by version before buildNumber', () => {
  // A higher buildNumber on an older version must NOT win: buildNumber is
  // monotonic per build machine, versionCode is what Android honours.
  assert.equal(compareSlots(slot('14.50.46', 1), slot('14.50.33', 999)), 1);
});

test('falls back to buildNumber within one version', () => {
  assert.equal(compareSlots(slot('14.50.46', 331), slot('14.50.46', 330)), 1);
  assert.equal(compareSlots(slot('14.50.46', 330), slot('14.50.46', 331)), -1);
});

test('reports an identical build as equal', () => {
  assert.equal(compareSlots(slot('14.50.46', 330), slot('14.50.46', 330)), 0);
});

test('a patch above 9 does not borrow from the minor slot', () => {
  // The bug android-version-code.mjs was written to kill. Guarded here too
  // because this comparison is what decides whether a build is discarded.
  assert.equal(compareSlots(slot('14.47.0', 1), slot('14.46.22', 1)), 1);
});

test('refuses to order a slot it cannot parse, rather than calling it older', () => {
  assert.throws(() => slotOrdinal('not json', 'a.json'), /not valid JSON/);
  assert.throws(() => slotOrdinal(JSON.stringify({ buildNumber: 1 })), /Not a valid semver/);
  assert.throws(() => slotOrdinal(JSON.stringify({ version: '1.2.3' })), /no usable buildNumber/);
  assert.throws(() => slotOrdinal(JSON.stringify({ version: '1.2.3', buildNumber: -1 })), /no usable buildNumber/);
  assert.throws(() => slotOrdinal(JSON.stringify({ version: '1.2.3', buildNumber: 1.5 })), /no usable buildNumber/);
});

test('orders the two real slots from the branches involved', () => {
  assert.equal(compareSlots(slot('14.50.46', 330), slot('14.50.46', 329)), 1);
});
