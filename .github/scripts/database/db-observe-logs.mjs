// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import routeCatalog from '../../../Backend/supabase/functions/_shared/requestTraceRoutes.json' with { type: 'json' };

const REQUEST_TIMEOUT_MS = 25_000;
const DETAIL_LIMIT = 50;
const HTTP_STATUS_LIMIT = 20;
const SQLSTATE_LIMIT = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const OUTCOMES = new Set(['network_error', 'http_error', 'slow_success']);
const KNOWN_ROUTES = new Set(routeCatalog.routes);

export function previousCompleteUtcHour(value = Date.now()) {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  if (!Number.isFinite(time)) throw new Error('Invalid pair start time for log window.');
  const end = Math.floor(time / 3_600_000) * 3_600_000;
  const start = end - 3_600_000;
  const iso = milliseconds => new Date(milliseconds).toISOString();
  return { start: iso(start), end: iso(end), hourKey: iso(start).slice(0, 13) + ':00Z' };
}

export function buildProjectLogsSql() {
  return `
    SELECT 'edge_total' AS kind, '' AS key, count() AS count, '' AS payload
    FROM logs WHERE source = 'edge_logs'
    UNION ALL
    (SELECT 'http_status' AS kind, toString(toInt32OrZero(log_attributes['response.status_code'])) AS key,
      count() AS count, '' AS payload FROM logs
      WHERE source = 'edge_logs'
        AND toInt32OrZero(log_attributes['response.status_code']) BETWEEN 100 AND 599
      GROUP BY key ORDER BY count DESC LIMIT ${HTTP_STATUS_LIMIT + 1})
    UNION ALL
    SELECT 'postgrest_total' AS kind, '' AS key, count() AS count, '' AS payload
    FROM logs WHERE source = 'postgrest_logs'
    UNION ALL
    SELECT 'postgrest_timeout' AS kind, '' AS key, count() AS count, '' AS payload
    FROM logs WHERE source = 'postgrest_logs'
      AND match(lower(event_message), 'timeout|timed out')
    UNION ALL
    SELECT 'postgres_total' AS kind, '' AS key, count() AS count, '' AS payload
    FROM logs WHERE source = 'postgres_logs'
    UNION ALL
    SELECT 'function_total' AS kind, '' AS key, count() AS count, '' AS payload
    FROM logs WHERE source = 'function_logs'
    UNION ALL
    SELECT 'rpc_trace_total' AS kind, '' AS key, count() AS count, '' AS payload
    FROM logs WHERE source = 'function_logs'
      AND match(event_message, '"event"\\s*:\\s*"supabase_rpc_trace"')
    UNION ALL
    (SELECT 'postgres_sqlstate' AS kind, log_attributes['parsed.sql_state_code'] AS key,
      count() AS count, '' AS payload FROM logs
      WHERE source = 'postgres_logs'
        AND log_attributes['parsed.error_severity'] = 'ERROR'
        AND log_attributes['parsed.sql_state_code'] != ''
      GROUP BY key ORDER BY count DESC LIMIT ${SQLSTATE_LIMIT + 1})
    UNION ALL
    (SELECT 'data_api_failure' AS kind, '' AS key, toUInt64(0) AS count,
      toJSONString(tuple(formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC'), id,
        log_attributes['execution_id'],
        toString(toInt32OrZero(log_attributes['response.status_code'])),
        log_attributes['request.method'],
        extract(log_attributes['request.path'], '^(/rest/v1/(rpc/[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*))/?'),
        log_attributes['request_id'],
        log_attributes['trace_id'],
        log_attributes['response.headers.cf_ray'])) AS payload
      FROM logs WHERE source = 'edge_logs'
        AND startsWith(log_attributes['request.path'], '/rest/v1/')
        AND toInt32OrZero(log_attributes['response.status_code']) >= 400
      ORDER BY timestamp DESC LIMIT ${DETAIL_LIMIT + 1})
    UNION ALL
    (SELECT 'rpc_trace' AS kind, '' AS key, toUInt64(0) AS count,
      toJSONString(tuple(formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC'), id, log_attributes['execution_id'], event_message)) AS payload
      FROM logs WHERE source = 'function_logs'
        AND match(event_message, '"event"\\s*:\\s*"supabase_rpc_trace"')
      ORDER BY timestamp DESC LIMIT ${DETAIL_LIMIT + 1})
  `;
}

function safeHttp(response) {
  const status = Number.isInteger(response?.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
  let requestId = null;
  try {
    requestId = ['sb-request-id', 'x-request-id'].map(name => response.headers.get(name))
      .find(value => value && UUID.test(value)) ?? null;
  } catch { /* malformed headers are omitted */ }
  return status === null ? null : { status, requestId };
}

function failedEvidence(window, reason, http = null) {
  return {
    status: 'UNAVAILABLE', source: 'supabase-management-analytics-logs',
    window: { ...window, basis: 'previous_complete_utc_hour_at_pair_start' },
    http, sourceCoverage: { edge_logs: 'UNAVAILABLE', postgrest_logs: 'UNAVAILABLE', postgres_logs: 'UNAVAILABLE', function_logs: 'UNAVAILABLE' },
    aggregates: null, failedDataApiRequests: { limit: DETAIL_LIMIT, records: [], truncated: false, malformedCount: 0 },
    rpcTraces: { limit: DETAIL_LIMIT, records: [], truncated: false, malformedCount: 0 },
    unavailable: reason, unknowns: ['Log evidence could not be acquired or interpreted.'],
  };
}

function parseTuple(value, width) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === width ? parsed : null;
  } catch { return null; }
}

function safeRoute(pathValue) {
  if (typeof pathValue !== 'string') return 'OTHER_DATA_API_ROUTE';
  const normalized = pathValue.endsWith('/') ? pathValue.slice(0, -1) : pathValue;
  if (KNOWN_ROUTES.has(normalized)) return normalized;
  if (/^\/rest\/v1\/rpc\/[A-Za-z_][A-Za-z0-9_]*\/?$/.test(pathValue)) return '/rest/v1/rpc/OTHER_RPC';
  return 'OTHER_DATA_API_ROUTE';
}

function safeIdentifier(value) { return typeof value === 'string' && UUID.test(value) ? value : null; }
function safeTraceId(value) {
  return typeof value === 'string' && (/^[0-9a-f]{32}$/i.test(value) || UUID.test(value)) ? value : null;
}
function utcIso(value) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function safeMethod(value) { return ALLOWED_METHODS.has(value) ? value : 'OTHER'; }
function safeCfRay(value) { return typeof value === 'string' && /^[a-f0-9]{16}-[A-Z]{3,4}$/i.test(value) ? value : null; }

function normalizeTrace(timestamp, eventId, executionId, message) {
  let event;
  try { event = JSON.parse(message); } catch { return null; }
  if (!event || typeof event !== 'object' || Array.isArray(event) || event.event !== 'supabase_rpc_trace') return null;
  if (!utcIso(timestamp) || typeof event.route !== 'string' || !/^\/rest\/v1\/rpc\/[A-Za-z_][A-Za-z0-9_]*$/.test(event.route)
    || !ALLOWED_METHODS.has(event.method) || !OUTCOMES.has(event.outcome)
    || !Number.isSafeInteger(event.duration_ms) || event.duration_ms < 0
    || !(event.status === null || (Number.isInteger(event.status) && event.status >= 100 && event.status <= 599))) return null;
  return {
    at: utcIso(timestamp),
    logEventId: safeIdentifier(eventId), parentExecutionId: safeIdentifier(executionId),
    route: safeRoute(event.route), method: event.method, outcome: event.outcome,
    durationMs: event.duration_ms, status: event.status,
    responseRequestId: safeIdentifier(event.request_id),
  };
}

export function normalizeProjectLogsResponse(payload, window, http = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return failedEvidence(window, 'Malformed analytics response object.', http);
  }
  if (payload.error !== null && payload.error !== undefined && payload.error !== '') {
    // The error may quote SQL or sensitive values: never put it in the saved report.
    return failedEvidence(window, 'Analytics API returned a query error.', http);
  }
  if (!Array.isArray(payload.result)) return failedEvidence(window, 'Analytics response has no result row array.', http);
  const rows = payload.result;
  const counts = new Map();
  const httpStatuses = [];
  const sqlstates = [];
  const rawFailures = [];
  const rawTraces = [];
  let malformedRows = 0;
  const seenAggregateKeys = new Set();
  const seenHttpStatuses = new Set();
  const seenSqlstates = new Set();
  const aggregateKinds = new Set(['edge_total', 'postgrest_total', 'postgrest_timeout', 'postgres_total', 'function_total', 'rpc_trace_total']);
  const parseCount = value => {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
    if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : null;
    }
    return null;
  };
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.kind !== 'string') { malformedRows += 1; continue; }
    if (!aggregateKinds.has(row.kind) && !['http_status', 'postgres_sqlstate', 'data_api_failure', 'rpc_trace'].includes(row.kind)) {
      malformedRows += 1; continue;
    }
    const count = parseCount(row.count);
    if (count === null) { malformedRows += 1; continue; }
    if (aggregateKinds.has(row.kind)) {
      if (seenAggregateKeys.has(row.kind)) { malformedRows += 1; continue; }
      seenAggregateKeys.add(row.kind);
      counts.set(row.kind, count);
    } else if (row.kind === 'http_status') {
      const status = parseCount(row.key);
      if (status === null || status < 100 || status > 599 || seenHttpStatuses.has(status)) malformedRows += 1;
      else { seenHttpStatuses.add(status); httpStatuses.push({ status, count }); }
    } else if (row.kind === 'postgres_sqlstate') {
      if (typeof row.key !== 'string' || !/^[0-9A-Z]{5}$/.test(row.key) || seenSqlstates.has(row.key)) malformedRows += 1;
      else { seenSqlstates.add(row.key); sqlstates.push({ sqlstate: row.key, count }); }
    } else if (row.kind === 'data_api_failure') rawFailures.push(row.payload);
    else if (row.kind === 'rpc_trace') rawTraces.push(row.payload);
    else malformedRows += 1;
  }
  const failuresTruncated = rawFailures.length > DETAIL_LIMIT;
  const tracesTruncated = rawTraces.length > DETAIL_LIMIT;
  const httpStatusesTruncated = httpStatuses.length > HTTP_STATUS_LIMIT;
  const sqlstatesTruncated = sqlstates.length > SQLSTATE_LIMIT;
  let malformedFailures = 0;
  const failedDataApiRequests = rawFailures.slice(0, DETAIL_LIMIT).flatMap(payload => {
    const tuple = parseTuple(payload, 9);
    if (!tuple) { malformedFailures += 1; return []; }
    const [timestamp, eventId, executionId, status, method, route, requestId, traceId, cfRay] = tuple;
    const at = utcIso(timestamp);
    const numericStatus = Number(status);
    if (!at || !Number.isInteger(numericStatus) || numericStatus < 400 || numericStatus > 599) {
      malformedFailures += 1; return [];
    }
    return [{ at, gatewayEventId: safeIdentifier(eventId), parentExecutionId: safeIdentifier(executionId),
      requestId: safeIdentifier(requestId), traceId: safeTraceId(traceId),
      status: numericStatus, method: safeMethod(method), route: safeRoute(route), cfRay: safeCfRay(cfRay) }];
  });
  let malformedTraces = 0;
  const rpcTraces = rawTraces.slice(0, DETAIL_LIMIT).flatMap(payload => {
    const tuple = parseTuple(payload, 4);
    if (!tuple) { malformedTraces += 1; return []; }
    const trace = normalizeTrace(...tuple);
    if (!trace) { malformedTraces += 1; return []; }
    return [trace];
  });
  const sourceTotalKinds = { edge_logs: 'edge_total', postgrest_logs: 'postgrest_total', postgres_logs: 'postgres_total', function_logs: 'function_total' };
  const sourceCoverage = Object.fromEntries(Object.entries(sourceTotalKinds).map(([source, kind]) => [source,
    !counts.has(kind) ? 'UNAVAILABLE' : counts.get(kind) === 0 ? 'NO_EVENTS_OBSERVED' : 'EVENTS_OBSERVED']));
  const missingSources = Object.entries(sourceCoverage).filter(([, status]) => status === 'UNAVAILABLE').map(([name]) => name);
  const requiredAggregates = ['edge_total', 'postgrest_total', 'postgrest_timeout', 'postgres_total', 'function_total', 'rpc_trace_total'];
  const missingAggregates = requiredAggregates.filter(kind => !counts.has(kind));
  const unknowns = [];
  if (missingSources.length) unknowns.push(`Source aggregate row absent: ${missingSources.join(', ')}.`);
  for (const [source, status] of Object.entries(sourceCoverage)) if (status === 'NO_EVENTS_OBSERVED') {
    unknowns.push(`No events observed in ${source}; this query cannot establish source recording or coverage.`);
  }
  if (counts.get('function_total') > 0 && counts.get('rpc_trace_total') === 0) {
    unknowns.push('Function log events were observed but no supabase_rpc_trace events matched.');
  }
  if (missingAggregates.length) unknowns.push(`Required aggregate row absent: ${missingAggregates.join(', ')}.`);
  if (malformedRows) unknowns.push(`${malformedRows} malformed aggregate row(s) omitted.`);
  if (malformedFailures) unknowns.push(`${malformedFailures} malformed failed-request row(s) omitted.`);
  if (malformedTraces) unknowns.push(`${malformedTraces} malformed RPC trace row(s) omitted.`);
  if (failuresTruncated) unknowns.push(`Failed Data API records capped at ${DETAIL_LIMIT}; additional records may exist.`);
  if (tracesTruncated) unknowns.push(`RPC trace records capped at ${DETAIL_LIMIT}; additional records may exist.`);
  if (httpStatusesTruncated) unknowns.push(`HTTP status groups capped at ${HTTP_STATUS_LIMIT}; aggregate statuses are incomplete.`);
  if (sqlstatesTruncated) unknowns.push(`Postgres SQLSTATE groups capped at ${SQLSTATE_LIMIT}; aggregate states are incomplete.`);
  unknowns.push('HTTP status aggregates cover API Gateway events; they are not unique client operations.');
  unknowns.push('Response IDs are gateway cf-ray values when available; RPC response request IDs come from structured function traces.');
  return {
    status: missingSources.length || missingAggregates.length || malformedRows || malformedFailures || malformedTraces
      || httpStatusesTruncated || sqlstatesTruncated
      ? 'DEGRADED' : 'SUCCESS',
    source: 'supabase-management-analytics-logs',
    queryStatus: 'SUCCESS',
    window: { ...window, basis: 'previous_complete_utc_hour_at_pair_start' }, http,
    sourceCoverage,
    aggregates: {
      apiGatewayEntries: counts.get('edge_total') ?? null,
      httpStatuses: httpStatuses.sort((a, b) => a.status - b.status).slice(0, HTTP_STATUS_LIMIT),
      postgrestLogEntries: counts.get('postgrest_total') ?? null,
      postgrestTimeoutLogEntries: counts.get('postgrest_timeout') ?? null,
      postgresLogEntries: counts.get('postgres_total') ?? null,
      functionLogEntries: counts.get('function_total') ?? null,
      rpcTraceEvents: counts.get('rpc_trace_total') ?? null,
      postgresErrorsBySqlstate: sqlstates.sort((a, b) => a.sqlstate.localeCompare(b.sqlstate)).slice(0, SQLSTATE_LIMIT),
      groupTruncation: { httpStatuses: httpStatusesTruncated, postgresSqlstates: sqlstatesTruncated },
    },
    failedDataApiRequests: { limit: DETAIL_LIMIT, returnedCount: failedDataApiRequests.length,
      records: failedDataApiRequests, truncated: failuresTruncated, malformedCount: malformedFailures },
    rpcTraces: { limit: DETAIL_LIMIT, returnedCount: rpcTraces.length, records: rpcTraces,
      truncated: tracesTruncated, malformedCount: malformedTraces },
    unavailable: missingSources.length || missingAggregates.length || malformedRows || malformedFailures || malformedTraces
      || httpStatusesTruncated || sqlstatesTruncated
      ? 'One or more log source aggregates or detail records were incomplete.' : null,
    unknowns,
  };
}

export async function collectProjectLogEvidence({ projectRef, token, pairStartedAt = Date.now(), fetchImpl = fetch } = {}) {
  const window = previousCompleteUtcHour(pairStartedAt);
  const acquisitionStartedAt = new Date().toISOString();
  const withAcquisition = evidence => ({ ...evidence,
    acquisition: { startedAt: acquisitionStartedAt, completedAt: new Date().toISOString() } });
  if (typeof projectRef !== 'string' || !/^[a-z0-9]{20}$/.test(projectRef) || typeof token !== 'string' || !token) {
    return withAcquisition(failedEvidence(window, 'Project reference or Management API token unavailable.'));
  }
  const url = new URL(`https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs`);
  url.searchParams.set('sql', buildProjectLogsSql());
  url.searchParams.set('iso_timestamp_start', window.start);
  url.searchParams.set('iso_timestamp_end', window.end);
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' });
  } catch {
    return withAcquisition(failedEvidence(window, 'Analytics request failed or timed out.'));
  }
  const http = safeHttp(response);
  if (!response.ok) return withAcquisition(failedEvidence(window, `Analytics HTTP ${response.status}.`, http));
  let payload;
  try { payload = await response.json(); }
  catch { return withAcquisition(failedEvidence(window, 'Analytics response was not valid JSON.', http)); }
  return withAcquisition(normalizeProjectLogsResponse(payload, window, http));
}
