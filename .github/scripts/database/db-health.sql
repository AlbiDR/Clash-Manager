-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

WITH heartbeat_projection AS (
  SELECT
    heartbeat.component_id,
    heartbeat.status,
    heartbeat.last_success_at,
    heartbeat.last_triggered_at,
    heartbeat.last_failure_at,
    heartbeat.is_data_perfect,
    COALESCE((SELECT jsonb_agg(to_jsonb(stage_name) ORDER BY stage_name)
      FROM (SELECT DISTINCT item.value #>> '{}' AS stage_name
        FROM jsonb_array_elements(CASE
          WHEN jsonb_typeof(heartbeat.last_validation_report->'stages_called') = 'array'
            THEN heartbeat.last_validation_report->'stages_called' ELSE '[]'::jsonb END) AS item(value)
        WHERE jsonb_typeof(item.value) = 'string'
          AND item.value #>> '{}' ~ '^[A-Z][A-Z0-9_]{0,63}$') AS stages), '[]'::jsonb) AS stages_called,
    COALESCE((SELECT jsonb_agg(to_jsonb(stage_name) ORDER BY stage_name)
      FROM (SELECT DISTINCT item.value #>> '{}' AS stage_name
        FROM jsonb_array_elements(CASE
          WHEN jsonb_typeof(heartbeat.last_validation_report->'stages_run') = 'array'
            THEN heartbeat.last_validation_report->'stages_run' ELSE '[]'::jsonb END) AS item(value)
        WHERE jsonb_typeof(item.value) = 'string'
          AND item.value #>> '{}' ~ '^[A-Z][A-Z0-9_]{0,63}$') AS stages), '[]'::jsonb) AS stages_run,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', item.value->>'stage', 'passed', item.value->'passed')
        ORDER BY item.value->>'stage')
      FROM jsonb_array_elements(CASE
        WHEN jsonb_typeof(heartbeat.last_validation_report->'integrity_checks') = 'array'
          THEN heartbeat.last_validation_report->'integrity_checks' ELSE '[]'::jsonb END) AS item(value)
      WHERE jsonb_typeof(item.value) = 'object'
        AND item.value->>'stage' ~ '^[A-Z][A-Z0-9_]{0,63}$'
        AND jsonb_typeof(item.value->'passed') = 'boolean'), '[]'::jsonb) AS integrity_checks
  FROM substrate.pipeline_heartbeat AS heartbeat
  WHERE heartbeat.component_id IN ('ROYALE_DATA_INGESTOR', 'HEADHUNTER_SCANNER')
)
SELECT jsonb_build_object(
  'observedAt', now(),
  'postmasterStart', pg_postmaster_start_time(),
  'databaseBytes', pg_database_size(current_database()),
  'connections', (SELECT count(*) FROM pg_stat_activity),
  'maxConnections', current_setting('max_connections')::integer,
  'sharedBuffersBytes', pg_size_bytes(current_setting('shared_buffers')),
  'maintenanceWorkMemoryBytes', pg_size_bytes(current_setting('maintenance_work_mem')),
  'battlePrimaryKeyBytes', pg_relation_size('drivers.player_battles_pkey'),
  'ingestion', (SELECT jsonb_build_object(
    'component_id', heartbeat.component_id, 'status', heartbeat.status,
    'last_success_at', heartbeat.last_success_at, 'last_triggered_at', heartbeat.last_triggered_at,
    'last_failure_at', heartbeat.last_failure_at, 'is_data_perfect', heartbeat.is_data_perfect,
    'stages_called', heartbeat.stages_called, 'stages_run', heartbeat.stages_run,
    'integrity_checks', heartbeat.integrity_checks
  ) FROM heartbeat_projection AS heartbeat WHERE heartbeat.component_id = 'ROYALE_DATA_INGESTOR'),
  'heartbeats', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'component_id', heartbeat.component_id, 'status', heartbeat.status,
    'last_success_at', heartbeat.last_success_at, 'last_triggered_at', heartbeat.last_triggered_at,
    'last_failure_at', heartbeat.last_failure_at, 'is_data_perfect', heartbeat.is_data_perfect,
    'stages_called', heartbeat.stages_called, 'stages_run', heartbeat.stages_run,
    'integrity_checks', heartbeat.integrity_checks
  ) ORDER BY heartbeat.component_id), '[]'::jsonb)
    FROM heartbeat_projection AS heartbeat),
  'snapshotPublication', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'snapshotName', snapshot_name, 'generation', generation, 'refreshedAt', refreshed_at
  ) ORDER BY snapshot_name), '[]'::jsonb) FROM substrate.sync_snapshot_state),
  'databaseStats', (SELECT jsonb_build_object(
    'statsReset', stats_reset, 'numBackends', numbackends,
    'xactCommit', xact_commit, 'xactRollback', xact_rollback,
    'blocksRead', blks_read, 'blocksHit', blks_hit,
    'tempFiles', temp_files, 'tempBytes', temp_bytes, 'deadlocks', deadlocks
  ) FROM pg_stat_database WHERE datname = current_database()),
  'cron24h', (SELECT jsonb_build_object(
    'runs', count(*),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'startupTimeouts', count(*) FILTER (WHERE return_message = 'job startup timeout'),
    'firstStartupTimeout', min(start_time) FILTER (WHERE return_message = 'job startup timeout'),
    'lastStartupTimeout', max(start_time) FILTER (WHERE return_message = 'job startup timeout')
  ) FROM cron.job_run_details WHERE start_time >= now() - interval '24 hours'),
  'activeQueries', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'state', state, 'waitType', wait_event_type, 'wait', wait_event,
    'seconds', greatest(0, extract(epoch FROM clock_timestamp() - query_start))
  )), '[]'::jsonb) FROM pg_stat_activity
    WHERE pid <> pg_backend_pid() AND state = 'active'
      AND backend_type = 'client backend')
) AS health;
