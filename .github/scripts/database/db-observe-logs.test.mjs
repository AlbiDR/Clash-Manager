// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectLogsSql, collectProjectLogEvidence, normalizeProjectLogsResponse, previousCompleteUtcHour } from './db-observe-logs.mjs';

const idA = '0190abc0-1234-5678-9abc-def012345678';
const idB = '0190abc0-1234-5678-9abc-def012345679';
const idC = '0190abc0-1234-5678-9abc-def012345680';
const idD = '0190abc0-1234-5678-9abc-def012345681';
const window = previousCompleteUtcHour('2026-10-13T16:28:22Z');
const validTrace = {
  event: 'supabase_rpc_trace', route: '/rest/v1/rpc/report_heartbeat', method: 'POST',
  outcome: 'http_error', duration_ms: 1002, status: 503, request_id: idC,
  private_payload: 'TRACE_SECRET player-identity',
};
const baseRows = [
  { kind: 'edge_total', count: 17 }, { kind: 'http_status', key: '504', count: 2 },
  { kind: 'postgrest_total', count: 4 }, { kind: 'postgrest_timeout', count: 3 },
  { kind: 'postgres_total', count: 5 }, { kind: 'postgres_sqlstate', key: '40P01', count: 1 },
  { kind: 'function_total', count: 1 }, { kind: 'rpc_trace_total', count: 1 },
  { kind: 'data_api_failure', count: 0, payload: JSON.stringify(['2026-10-13T15:30:00.000000Z', idA, idB, '504', 'GET', '/rest/v1/roster_materialized', idC, idD, '0123456789abcdef-DUB']) },
  { kind: 'rpc_trace', count: 0, payload: JSON.stringify(['2026-10-13T15:31:00Z', idA, idB, JSON.stringify(validTrace)]) },
];

test('uses exactly one GET over the previous complete UTC hour and sanitizes safe projections', async () => {
  let calls = 0;
  let requested;
  const result = await collectProjectLogEvidence({
    projectRef: 'abcdefghijklmnopqrst', token: 'fixture-token', pairStartedAt: Date.parse('2026-10-13T16:28:22Z'),
    fetchImpl: async (url, init) => {
      calls += 1; requested = { url: new URL(url), init };
      return new Response(JSON.stringify({ result: baseRows, error: null }), { status: 200,
        headers: { 'sb-request-id': idA } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(requested.init.method, 'GET');
  assert.equal(requested.url.pathname, '/v1/projects/abcdefghijklmnopqrst/analytics/endpoints/logs');
  assert.equal(requested.url.searchParams.get('iso_timestamp_start'), '2026-10-13T15:00:00.000Z');
  assert.equal(requested.url.searchParams.get('iso_timestamp_end'), '2026-10-13T16:00:00.000Z');
  assert.match(requested.url.searchParams.get('sql'), /source = 'function_logs'/);
  assert.match(requested.url.searchParams.get('sql'), /formatDateTime\(timestamp,.*'UTC'\)/);
  assert.match(requested.url.searchParams.get('sql'), /extract\(log_attributes\['request.path'\], '\^\(\/rest\/v1/);
  assert.match(requested.url.searchParams.get('sql'), /log_attributes\['request_id'\]/);
  assert.match(requested.url.searchParams.get('sql'), /log_attributes\['trace_id'\]/);
  assert.match(requested.init.signal.constructor.name, /AbortSignal/);
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(result.aggregates.httpStatuses, [{ status: 504, count: 2 }]);
  assert.equal(result.aggregates.postgrestTimeoutLogEntries, 3);
  assert.deepEqual(result.aggregates.postgresErrorsBySqlstate, [{ sqlstate: '40P01', count: 1 }]);
  assert.equal(result.failedDataApiRequests.records[0].route, '/rest/v1/roster_materialized');
  assert.equal(result.failedDataApiRequests.records[0].gatewayEventId, idA);
  assert.equal(result.failedDataApiRequests.records[0].parentExecutionId, idB);
  assert.equal(result.failedDataApiRequests.records[0].requestId, idC);
  assert.equal(result.failedDataApiRequests.records[0].traceId, idD);
  assert.equal(result.failedDataApiRequests.records[0].cfRay, '0123456789abcdef-DUB');
  assert.equal(result.rpcTraces.records[0].parentExecutionId, idB);
  assert.equal(result.rpcTraces.records[0].responseRequestId, idC);
  assert.equal(result.failedDataApiRequests.records[0].requestId, result.rpcTraces.records[0].responseRequestId);
  assert.equal(result.failedDataApiRequests.records[0].at, '2026-10-13T15:30:00.000Z');
  assert.doesNotMatch(JSON.stringify(result), /TRACE_SECRET|player-identity|private_payload|event_message|fixture-token/);
  assert.doesNotMatch(JSON.stringify(result), /SELECT |response\.body|Authorization/);
});

test('retains native W3C trace IDs separately from response UUID request IDs', () => {
  const traceId = '01a1371224a27d9983a1291e173c3744';
  const rows = baseRows.map(row => row.kind !== 'data_api_failure' ? row : {
    ...row, payload: JSON.stringify(['2026-10-13T15:30:00Z', idA, idB, '500', 'POST',
      '/rest/v1/rpc/sync_recruits', idC, traceId, '0123456789abcdef-DUB']),
  });
  const result = normalizeProjectLogsResponse({ result: rows }, window);
  assert.equal(result.failedDataApiRequests.records[0].traceId, traceId);
  assert.equal(result.failedDataApiRequests.records[0].requestId, idC);
});

test('does not retain data-like URL paths, non-scalar HTTP values, or malformed trace JSON', () => {
  const unsafePath = JSON.stringify(['2026-10-13T15:30:00Z', 'not-uuid', 'player-secret', '500', 'weird-secret-method', '/rest/v1/player/private-player-id', 'not-request-id', 'not-trace-id', 'unsafe-ray?secret']);
  const rows = [...baseRows.filter(row => row.kind !== 'rpc_trace' && row.kind !== 'data_api_failure'),
    { kind: 'data_api_failure', count: 0, payload: unsafePath },
    { kind: 'rpc_trace', count: 0, payload: JSON.stringify(['2026-10-13T15:31:00Z', 'bad', 'bad', '{not-json']) }];
  const result = normalizeProjectLogsResponse({ result: rows, error: null }, window, { status: 200, requestId: null });
  assert.equal(result.failedDataApiRequests.records[0].route, 'OTHER_DATA_API_ROUTE');
  assert.equal(result.failedDataApiRequests.records[0].gatewayEventId, null);
  assert.equal(result.failedDataApiRequests.records[0].parentExecutionId, null);
  assert.equal(result.failedDataApiRequests.records[0].requestId, null);
  assert.equal(result.failedDataApiRequests.records[0].traceId, null);
  assert.equal(result.failedDataApiRequests.records[0].cfRay, null);
  assert.equal(result.failedDataApiRequests.records[0].method, 'OTHER');
  assert.equal(result.rpcTraces.malformedCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /player-secret|private-player-id|unsafe-ray/);
});

test('exact route catalog preserves known routes but masks arbitrary relation and RPC identifiers', () => {
  const privateRelation = 'playerIdentitySecret';
  const privateRpc = 'lookupPlayerSecretByEmail';
  const rows = [...baseRows.filter(row => row.kind !== 'data_api_failure' && row.kind !== 'rpc_trace'),
    { kind: 'data_api_failure', count: 0, payload: JSON.stringify(['2026-10-13T15:30:00Z', idA, idB, '500', 'GET', `/rest/v1/${privateRelation}`, idC, idD, null]) },
    { kind: 'data_api_failure', count: 0, payload: JSON.stringify(['2026-10-13T15:30:01Z', idA, idB, '500', 'POST', `/rest/v1/rpc/${privateRpc}`, idC, idD, null]) },
    { kind: 'rpc_trace', count: 0, payload: JSON.stringify(['2026-10-13T15:31:00Z', idA, idB, JSON.stringify({ ...validTrace, route: `/rest/v1/rpc/${privateRpc}` })]) }];
  const result = normalizeProjectLogsResponse({ result: rows, error: null }, window);
  assert.equal(result.failedDataApiRequests.records[0].route, 'OTHER_DATA_API_ROUTE');
  assert.equal(result.failedDataApiRequests.records[1].route, '/rest/v1/rpc/OTHER_RPC');
  assert.equal(result.rpcTraces.records[0].route, '/rest/v1/rpc/OTHER_RPC');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${privateRelation}|${privateRpc}`));
});

test('caps individual error and trace records and reports truncation', () => {
  const rows = [...baseRows.filter(row => row.kind !== 'data_api_failure' && row.kind !== 'rpc_trace'),
    ...Array.from({ length: 51 }, (_, index) => ({ kind: 'data_api_failure', count: 0, payload: JSON.stringify([
      '2026-10-13T15:30:00Z', idA, idB, '500', 'GET', `/rest/v1/relation_${index}`, idC, idD, null,
    ]) })),
    ...Array.from({ length: 51 }, (_, index) => ({ kind: 'rpc_trace', count: 0, payload: JSON.stringify([
      '2026-10-13T15:31:00Z', idA, idB, JSON.stringify({ ...validTrace, request_id: idB, route: `/rest/v1/rpc/call_${index}` }),
    ]) }))];
  const result = normalizeProjectLogsResponse({ result: rows, error: null }, window);
  assert.equal(result.failedDataApiRequests.records.length, 50);
  assert.equal(result.failedDataApiRequests.truncated, true);
  assert.equal(result.rpcTraces.records.length, 50);
  assert.equal(result.rpcTraces.truncated, true);
  assert.ok(result.unknowns.some(value => /Failed Data API records capped/.test(value)));
  assert.ok(result.unknowns.some(value => /RPC trace records capped/.test(value)));
});

test('caps excessive aggregate groups and marks incomplete aggregate coverage degraded', () => {
  const rows = [...baseRows.filter(row => row.kind !== 'http_status' && row.kind !== 'postgres_sqlstate'),
    ...Array.from({ length: 21 }, (_, index) => ({ kind: 'http_status', key: String(100 + index), count: 1 })),
    ...Array.from({ length: 31 }, (_, index) => ({ kind: 'postgres_sqlstate', key: `X${String(index).padStart(4, '0')}`, count: 1 }))];
  const result = normalizeProjectLogsResponse({ result: rows, error: null }, window);
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.aggregates.httpStatuses.length, 20);
  assert.equal(result.aggregates.postgresErrorsBySqlstate.length, 30);
  assert.deepEqual(result.aggregates.groupTruncation, { httpStatuses: true, postgresSqlstates: true });
});

test('HTTP 200 with an API query error, malformed response, and missing source rows never report success', () => {
  const apiError = normalizeProjectLogsResponse({ result: baseRows, error: 'SQL details SECRET' }, window, { status: 200 });
  assert.equal(apiError.status, 'UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(apiError), /SQL details|SECRET/);
  assert.equal(normalizeProjectLogsResponse({ result: 'not-an-array', error: null }, window).status, 'UNAVAILABLE');
  const missing = normalizeProjectLogsResponse({ result: baseRows.filter(row => row.kind !== 'postgrest_timeout'), error: null }, window);
  assert.equal(missing.status, 'DEGRADED');
  assert.ok(missing.unknowns.some(value => /postgrest_timeout/.test(value)));
});

test('successful query separates zero function events from positive function source coverage', () => {
  const zero = normalizeProjectLogsResponse({ result: baseRows.map(row => row.kind === 'function_total' || row.kind === 'rpc_trace_total'
    ? { ...row, count: 0 } : row).filter(row => row.kind !== 'data_api_failure' && row.kind !== 'rpc_trace'), error: null }, window);
  assert.equal(zero.queryStatus, 'SUCCESS');
  assert.equal(zero.status, 'SUCCESS');
  assert.equal(zero.sourceCoverage.function_logs, 'NO_EVENTS_OBSERVED');
  assert.equal(zero.aggregates.functionLogEntries, 0);
  assert.equal(zero.aggregates.rpcTraceEvents, 0);
  assert.ok(zero.unknowns.some(value => /No events observed in function_logs/.test(value)));

  const noMatchingTrace = normalizeProjectLogsResponse({ result: baseRows.map(row => row.kind === 'rpc_trace_total'
    ? { ...row, count: 0 } : row).filter(row => row.kind !== 'rpc_trace'), error: null }, window);
  assert.equal(noMatchingTrace.queryStatus, 'SUCCESS');
  assert.equal(noMatchingTrace.sourceCoverage.function_logs, 'EVENTS_OBSERVED');
  assert.ok(noMatchingTrace.unknowns.some(value => /no supabase_rpc_trace events matched/.test(value)));

  const missing = normalizeProjectLogsResponse({ result: baseRows.filter(row => row.kind !== 'function_total'), error: null }, window);
  assert.equal(missing.status, 'DEGRADED');
  assert.equal(missing.sourceCoverage.function_logs, 'UNAVAILABLE');
});

test('nullish, empty, boolean, unsafe, and duplicate counts or aggregate keys degrade coverage', () => {
  const totals = new Set(['edge_total', 'postgrest_total', 'postgrest_timeout', 'postgres_total', 'function_total', 'rpc_trace_total']);
  for (const invalidCount of [null, '', false, true, '01', '1.0', Number.MAX_SAFE_INTEGER + 1]) {
    const rows = baseRows.filter(row => row.kind !== 'data_api_failure' && row.kind !== 'rpc_trace')
      .map(row => totals.has(row.kind) ? { ...row, count: invalidCount } : row);
    const result = normalizeProjectLogsResponse({ result: rows, error: null }, window);
    assert.equal(result.queryStatus, 'SUCCESS');
    assert.equal(result.status, 'DEGRADED');
    assert.ok(result.unknowns.some(value => /malformed aggregate row/.test(value)));
  }
  const duplicateTotal = normalizeProjectLogsResponse({ result: [...baseRows, { kind: 'function_total', count: 900 }], error: null }, window);
  assert.equal(duplicateTotal.status, 'DEGRADED');
  assert.equal(duplicateTotal.aggregates.functionLogEntries, 1);
  const duplicateGroups = normalizeProjectLogsResponse({ result: [...baseRows,
    { kind: 'http_status', key: '504', count: 999 }, { kind: 'postgres_sqlstate', key: '40P01', count: 999 }], error: null }, window);
  assert.equal(duplicateGroups.status, 'DEGRADED');
  assert.deepEqual(duplicateGroups.aggregates.httpStatuses, [{ status: 504, count: 2 }]);
  assert.deepEqual(duplicateGroups.aggregates.postgresErrorsBySqlstate, [{ sqlstate: '40P01', count: 1 }]);
});

test('timezone-naive detail timestamps are omitted as malformed instead of parsed in host local time', () => {
  const rows = [...baseRows.filter(row => row.kind !== 'data_api_failure' && row.kind !== 'rpc_trace'),
    { kind: 'data_api_failure', count: 0, payload: JSON.stringify(['2026-10-13 15:30:00', idA, idB, '500', 'GET', '/rest/v1/roster_materialized', idC, idD, null]) },
    { kind: 'rpc_trace', count: 0, payload: JSON.stringify(['2026-10-13 15:31:00', idA, idB, JSON.stringify(validTrace)]) }];
  const result = normalizeProjectLogsResponse({ result: rows, error: null }, window);
  assert.equal(result.failedDataApiRequests.records.length, 0);
  assert.equal(result.failedDataApiRequests.malformedCount, 1);
  assert.equal(result.rpcTraces.records.length, 0);
  assert.equal(result.rpcTraces.malformedCount, 1);
});

test('HTTP and network failures return unavailable evidence without retrying or preserving bodies', async () => {
  let calls = 0;
  const httpFailure = await collectProjectLogEvidence({ projectRef: 'abcdefghijklmnopqrst', token: 't',
    pairStartedAt: Date.parse('2026-10-13T16:28:22Z'), fetchImpl: async () => {
      calls += 1; return new Response('SECRET provider body', { status: 429, headers: { 'x-request-id': idA } });
    } });
  assert.equal(calls, 1);
  assert.equal(httpFailure.status, 'UNAVAILABLE');
  assert.equal(httpFailure.http.status, 429);
  assert.equal(httpFailure.http.requestId, idA);
  assert.doesNotMatch(JSON.stringify(httpFailure), /SECRET provider body/);
  const networkFailure = await collectProjectLogEvidence({ projectRef: 'abcdefghijklmnopqrst', token: 't', fetchImpl: async () => {
    calls += 1; throw new Error('request URL had sensitive text');
  } });
  assert.equal(calls, 2);
  assert.equal(networkFailure.status, 'UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(networkFailure), /sensitive text/);
  const missing = await collectProjectLogEvidence({ projectRef: null, token: null });
  assert.equal(missing.status, 'UNAVAILABLE');
  assert.match(missing.unavailable, /unavailable/);
});

test('ClickHouse query is explicitly source-scoped, time API bounded, and limits details', () => {
  const sql = buildProjectLogsSql();
  assert.doesNotMatch(sql, /select\s+\*/i);
  assert.doesNotMatch(sql, /count\s*\(\s*\*/i);
  assert.match(sql, /LIMIT 51/);
  assert.match(sql, /parsed\.sql_state_code/);
  assert.match(sql, /supabase_rpc_trace/);
});
