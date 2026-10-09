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

test('verifies anonymous feature reads with the PWA key, including legitimately empty recruit and blacklist datasets', async () => {
  const reads = [];
  await verifyAppAvailability({ ...config, fetchImpl: async (url, options) => {
    if (url.includes('/health?')) return Response.json(healthy);
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    reads.push(url);
    assert.equal(options.headers.apikey, config.key);
    assert.equal(options.headers['Accept-Profile'], 'features');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(url.includes('/roster_materialized?') ? [{ player_tag: '#MEMBER' }] : []);
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
    return url.includes('/roster_materialized?') ? new Response('', { status: 403 }) : Response.json([]);
  } }), /Anonymous roster_materialized read failed: HTTP 403/);
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


test('rejects an empty roster instead of reporting a populated app', async () => {
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async (url) => {
    if (url.includes('/health?')) return Response.json(healthy);
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    return Response.json([]);
  } }), /returned no members/);
});

test('uses full client snapshot reads without evaluating computed scoring views', async () => {
  const reads = [];
  const signals = [];
  await verifyAppAvailability({ ...config, fetchImpl: async (url, options) => {
    if (url.includes('/health?')) return Response.json(healthy);
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    reads.push(new URL(url));
    signals.push(options.signal);
    return Response.json([{ player_tag: '#MEMBER' }]);
  } });
  assert.deepEqual(reads.map(url => url.pathname), [
    '/rest/v1/roster_materialized', '/rest/v1/headhunter_materialized', '/rest/v1/recruit_blacklist_view',
  ]);
  assert.equal(reads[0].searchParams.has('limit'), false);
  assert.equal(reads[1].searchParams.get('limit'), '250');
  assert.equal(reads[2].searchParams.get('select'), 'player_tag');
  assert.ok(signals.every(signal => signal === signals[0]));
});

test('rejects a nonempty payload with no player identities', async () => {
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async (url) => {
    if (url.includes('/health?')) return Response.json(healthy);
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    return Response.json([{}]);
  } }), /without player identities/);
});

test('cancels and settles sibling reads before a failed pass can be retried', async () => {
  let pendingReads = 0;
  let abortedReads = 0;
  await assert.rejects(verifyAppAvailability({ ...config, fetchImpl: async (url, options) => {
    if (url.includes('/health?')) return Response.json(healthy);
    if (url.endsWith('/database/query')) return Response.json([{ blacklist_realtime_ready: true }]);
    if (url.includes('/roster_materialized?')) return new Response('', { status: 403 });
    pendingReads += 1;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        pendingReads -= 1;
        abortedReads += 1;
        reject(options.signal.reason);
      }, { once: true });
    });
  } }), /Anonymous roster_materialized read failed: HTTP 403/);
  assert.equal(abortedReads, 2);
  assert.equal(pendingReads, 0);
});
