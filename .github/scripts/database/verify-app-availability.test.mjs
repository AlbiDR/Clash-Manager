// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAppAvailability } from './verify-app-availability.mjs';

const config = { projectId: 'project', url: 'https://project.supabase.co', key: 'public-key', token: 'management-token' };
const healthy = [
  { name: 'db', healthy: true },
  { name: 'rest', healthy: true },
];

test('verifies anonymous feature reads with the PWA key, including empty datasets', async () => {
  const reads = [];
  await verifyAppAvailability({ ...config, fetchImpl: async (url, options) => {
    if (url.includes('/health?')) return Response.json(healthy);
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    reads.push(url);
    assert.equal(options.headers.apikey, config.key);
    assert.equal(options.headers['Accept-Profile'], 'features');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json([]);
  } });
  assert.equal(reads.length, 3);
});

test('requires the PWA credentials instead of silently skipping the check', async () => {
  await assert.rejects(verifyAppAvailability({ ...config, key: '' }), /requires the project ID/);
});

test('rejects an unavailable database even when management APIs respond', async () => {
  const services = healthy.map((s) => s.name === 'db' ? { ...s, healthy: false } : s);
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async () => Response.json(services) }), /db is unavailable/);
});

test('rejects anonymous permission errors even when service health passes', async () => {
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async (url) => {
    if (url.includes('/health?')) return Response.json(healthy);
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    return url.includes('/roster_view?') ? new Response('', { status: 403 }) : Response.json([]);
  } }), /Anonymous roster_view read failed: HTTP 403/);
});

test('rejects malformed successful responses and missing services', async () => {
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async (url) => {
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    return Response.json(url.includes('/health?') ? healthy : { error: 'unavailable' });
  } }), /did not return a row array/);
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async () => Response.json([]) }), /db is unavailable/);
});

test('rejects a missing blacklist publication even when services are healthy', async () => {
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async (url, options) => {
    if (url.includes('/health?')) return Response.json(healthy);
    assert.equal(JSON.parse(options.body).read_only, true);
    return Response.json([{ blacklist_realtime_ready: false }]);
  } }), /Blacklist Realtime publication or anonymous read access is missing/);
});
