-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

SELECT jsonb_build_object(
  'observedAt', now(),
  'databaseBytes', pg_database_size(current_database()),
  'connections', (SELECT count(*) FROM pg_stat_activity),
  'maxConnections', current_setting('max_connections')::integer,
  'sharedBuffersBytes', pg_size_bytes(current_setting('shared_buffers')),
  'maintenanceWorkMemoryBytes', pg_size_bytes(current_setting('maintenance_work_mem')),
  'battlePrimaryKeyBytes', pg_relation_size('drivers.player_battles_pkey'),
  'ingestion', (SELECT to_jsonb(heartbeat) FROM features.pipeline_heartbeat_view heartbeat
    WHERE component_id = 'ROYALE_DATA_INGESTOR'),
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
