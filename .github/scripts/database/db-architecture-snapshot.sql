-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Read-only inventory. No payloads, query text, cron commands, credential
-- values, or function bodies leave the database. Counters are observations,
-- never proof of unused objects or measured table growth.
WITH app_relations AS (
  SELECT c.*, n.nspname AS schema_name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('substrate', 'drivers', 'features', 'public')
    AND c.relkind IN ('r', 'p', 'v', 'm')
), app_routines AS (
  SELECT p.*, n.nspname AS schema_name, l.lanname AS language
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname IN ('substrate', 'drivers', 'features', 'public')
    AND p.prokind = 'f'
), battle_retention AS (
  SELECT (SELECT value::integer FROM substrate.config WHERE key = 'BATTLE_RAW_KEEP_DAYS') AS days,
    (SELECT value::integer FROM substrate.config WHERE key = 'BATTLE_PURGE_BATCH_ROWS') AS batch
), old_battles AS (
  SELECT pb.battle_time, EXISTS (
    SELECT 1 FROM drivers.player_battle_daily d WHERE d.player_tag = pb.player_tag
      AND d.battle_date = (pb.battle_time AT TIME ZONE 'UTC')::date AND d.battle_type = pb.battle_type
  ) AS has_summary
  FROM drivers.player_battles pb, battle_retention limits
  WHERE (pb.battle_time AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date - limits.days
)
SELECT jsonb_build_object(
  'version', 1,
  'observedAt', clock_timestamp(),
  'serverStartedAt', pg_postmaster_start_time(),
  'databaseBytes', pg_database_size(current_database()),
  'databaseStatsResetAt', (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
  'statementStatsResetAt', (SELECT stats_reset FROM extensions.pg_stat_statements_info),
  'settings', (SELECT jsonb_object_agg(name, jsonb_build_object('value', setting, 'unit', unit, 'pendingRestart', pending_restart))
    FROM pg_settings WHERE name IN ('shared_buffers', 'maintenance_work_mem', 'work_mem', 'max_connections',
      'jit', 'max_parallel_workers_per_gather', 'autovacuum', 'pg_stat_statements.track_planning')),
  'tables', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.schema_name || '.' || r.relname, 'schema', r.schema_name, 'name', r.relname,
    'bytes', pg_total_relation_size(r.oid), 'heapBytes', pg_relation_size(r.oid),
    'indexBytes', pg_indexes_size(r.oid),
    'toastBytes', CASE WHEN r.reltoastrelid <> 0 THEN pg_total_relation_size(r.reltoastrelid) ELSE 0 END,
    'plannerRows', CASE WHEN r.reltuples >= 0 THEN r.reltuples ELSE NULL END,
    'statisticsRows', s.n_live_tup, 'deadRows', s.n_dead_tup,
    'inserted', s.n_tup_ins, 'updated', s.n_tup_upd, 'deleted', s.n_tup_del,
    'lastVacuum', s.last_vacuum, 'lastAutovacuum', s.last_autovacuum,
    'lastAnalyze', s.last_analyze, 'lastAutoanalyze', s.last_autoanalyze,
    'rls', r.relrowsecurity, 'options', r.reloptions,
    'anonSelect', has_table_privilege('anon', r.oid, 'SELECT'),
    'anonWrite', has_table_privilege('anon', r.oid, 'INSERT,UPDATE,DELETE'),
    'comment', obj_description(r.oid, 'pg_class')
  ) ORDER BY pg_total_relation_size(r.oid) DESC), '[]'::jsonb)
    FROM app_relations r LEFT JOIN pg_stat_user_tables s ON s.relid = r.oid WHERE r.relkind IN ('r', 'p')),
  'platformStorage', (SELECT COALESCE(jsonb_agg(jsonb_build_object('schema', schema, 'bytes', bytes) ORDER BY bytes DESC), '[]'::jsonb)
    FROM (SELECT schemaname AS schema, sum(pg_total_relation_size(relid)) AS bytes
      FROM pg_stat_user_tables WHERE schemaname NOT IN ('substrate', 'drivers', 'features', 'public') GROUP BY schemaname) totals),
  'columns', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', r.schema_name || '.' || r.relname, 'name', a.attname,
    'type', format_type(a.atttypid, a.atttypmod), 'nullable', NOT a.attnotnull
  ) ORDER BY r.schema_name, r.relname, a.attnum), '[]'::jsonb)
    FROM app_relations r JOIN pg_attribute a ON a.attrelid = r.oid WHERE a.attnum > 0 AND NOT a.attisdropped),
  'indexes', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.schema_name || '.' || c.relname, 'table', r.schema_name || '.' || r.relname,
    'name', c.relname, 'bytes', pg_relation_size(i.indexrelid),
    'unique', i.indisunique, 'primary', i.indisprimary, 'valid', i.indisvalid,
    'method', am.amname, 'key', i.indkey::text, 'keyCount', i.indnkeyatts,
    'opclasses', i.indclass::text, 'collations', i.indcollation::text,
    'options', i.indoption::text,
    'predicate', pg_get_expr(i.indpred, i.indrelid), 'expressions', pg_get_expr(i.indexprs, i.indrelid),
    'scans', s.idx_scan, 'constraintBacked', EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid = i.indexrelid)
  ) ORDER BY pg_relation_size(i.indexrelid) DESC), '[]'::jsonb)
    FROM app_relations r JOIN pg_index i ON i.indrelid = r.oid JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_am am ON am.oid = c.relam LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = c.oid),
  'foreignKeys', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', co.conname, 'from', r.schema_name || '.' || r.relname,
    'to', pn.nspname || '.' || parent.relname, 'keys', co.conkey::text,
    'columns', (SELECT jsonb_agg(a.attname ORDER BY k.position) FROM unnest(co.conkey) WITH ORDINALITY k(num, position)
      JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.num),
    'onDelete', CASE co.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION' END,
    'validated', co.convalidated,
    'indexed', EXISTS (SELECT 1 FROM pg_index ix WHERE ix.indrelid = co.conrelid AND ix.indisvalid
      AND ix.indnkeyatts >= cardinality(co.conkey)
      AND ix.indpred IS NULL AND ix.indexprs IS NULL
      AND (SELECT array_agg(k::smallint ORDER BY k) FROM unnest(co.conkey) k)
        = (SELECT array_agg(k::smallint ORDER BY k) FROM unnest(ix.indkey::smallint[]) WITH ORDINALITY ik(k, pos)
          WHERE pos <= cardinality(co.conkey)))
  ) ORDER BY r.schema_name, r.relname, co.conname), '[]'::jsonb)
    FROM app_relations r JOIN pg_constraint co ON co.conrelid = r.oid AND co.contype = 'f'
    JOIN pg_class parent ON parent.oid = co.confrelid JOIN pg_namespace pn ON pn.oid = parent.relnamespace),
  'views', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.schema_name || '.' || r.relname, 'schema', r.schema_name,
    'name', r.relname, 'materialized', r.relkind = 'm', 'options', r.reloptions,
    'anonSelect', has_table_privilege('anon', r.oid, 'SELECT'),
    'comment', obj_description(r.oid, 'pg_class'), 'definitionHash', md5(pg_get_viewdef(r.oid))
  ) ORDER BY r.schema_name, r.relname), '[]'::jsonb) FROM app_relations r WHERE r.relkind IN ('v', 'm')),
  'viewDependencies', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'from', r.schema_name || '.' || r.relname, 'to', depn.nspname || '.' || dep.relname
  )), '[]'::jsonb) FROM app_relations r JOIN pg_rewrite rw ON rw.ev_class = r.oid
    JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid AND d.refclassid = 'pg_class'::regclass
    JOIN pg_class dep ON dep.oid = d.refobjid JOIN pg_namespace depn ON depn.oid = dep.relnamespace
    WHERE r.relkind IN ('v', 'm') AND dep.oid <> r.oid),
  'routines', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.schema_name || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'name', p.schema_name || '.' || p.proname, 'schema', p.schema_name,
    'language', p.language, 'securityDefiner', p.prosecdef,
    'searchPathFixed', EXISTS (SELECT 1 FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%'),
    'anonExecute', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'definitionHash', md5(pg_get_functiondef(p.oid)),
    'references', (SELECT COALESCE(jsonb_agg(DISTINCT matched[1]), '[]'::jsonb)
      FROM regexp_matches(replace(p.prosrc, '"', ''), '((?:substrate|drivers|features|public)\.[a-zA-Z_][a-zA-Z_0-9]*)', 'g') matched),
    'comment', obj_description(p.oid, 'pg_proc')
  ) ORDER BY p.schema_name, p.proname), '[]'::jsonb) FROM app_routines p),
  'triggers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', t.tgname, 'table', r.schema_name || '.' || r.relname,
    'routine', pn.nspname || '.' || p.proname, 'enabled', t.tgenabled,
    'timing', CASE WHEN (t.tgtype::integer & 2) <> 0 THEN 'BEFORE'
      WHEN (t.tgtype::integer & 64) <> 0 THEN 'INSTEAD OF' ELSE 'AFTER' END,
    'level', CASE WHEN (t.tgtype::integer & 1) <> 0 THEN 'ROW' ELSE 'STATEMENT' END
  ) ORDER BY r.schema_name, r.relname, t.tgname), '[]'::jsonb)
    FROM app_relations r JOIN pg_trigger t ON t.tgrelid = r.oid AND NOT t.tgisinternal
    JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace),
  'policies', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', schemaname || '.' || tablename, 'name', policyname, 'command', cmd, 'roles', roles
  ) ORDER BY schemaname, tablename, policyname), '[]'::jsonb)
    FROM pg_policies WHERE schemaname IN ('substrate', 'drivers', 'features', 'public')),
  'jobs', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', j.jobid, 'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
    'runs24h', s.runs, 'failed24h', s.failed, 'startupTimeouts24h', s.startup_timeouts,
    'meanCompletedMs', s.mean_ms, 'maxCompletedMs', s.max_ms,
    'references', (SELECT COALESCE(jsonb_agg(DISTINCT matched[1]), '[]'::jsonb)
      FROM regexp_matches(j.command, '((?:substrate|drivers|features|public)\.[a-zA-Z_][a-zA-Z_0-9]*)', 'g') matched)
  ) ORDER BY j.jobname), '[]'::jsonb) FROM cron.job j LEFT JOIN LATERAL (
    SELECT count(*) AS runs, count(*) FILTER (WHERE status = 'failed') AS failed,
      count(*) FILTER (WHERE return_message = 'job startup timeout') AS startup_timeouts,
      avg(extract(epoch FROM end_time - start_time) * 1000) FILTER (WHERE status = 'succeeded') AS mean_ms,
      max(extract(epoch FROM end_time - start_time) * 1000) FILTER (WHERE status = 'succeeded') AS max_ms
    FROM cron.job_run_details WHERE jobid = j.jobid AND start_time >= now() - interval '24 hours'
  ) s ON true),
  'queries', (SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (
    SELECT queryid::text AS id, r.rolname AS role, toplevel, calls, total_exec_time AS total_ms,
      mean_exec_time AS mean_ms, max_exec_time AS max_ms, rows,
      shared_blks_hit, shared_blks_read, temp_blks_written,
      CASE WHEN query ~* '^\s*(SELECT|WITH)' THEN 'SELECT/WITH'
        WHEN query ~* '^\s*(INSERT|UPDATE|DELETE)' THEN 'DML' ELSE 'OTHER' END AS operation,
      (SELECT COALESCE(jsonb_agg(DISTINCT matched[1]), '[]'::jsonb)
        FROM regexp_matches(replace(query, '"', ''), '((?:substrate|drivers|features|public|cron|net)\.[a-zA-Z_][a-zA-Z_0-9]*)', 'g') matched) AS references
    FROM extensions.pg_stat_statements s JOIN pg_roles r ON r.oid = s.userid
    WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    ORDER BY total_exec_time DESC LIMIT 40
  ) q),
  'lifecycle', jsonb_build_object(
    'telemetry', (SELECT jsonb_build_object('rows', count(*), 'oldest', min(created_at), 'newest', max(created_at),
      'metadataBytes', COALESCE(sum(pg_column_size(metadata)), 0), 'largestMetadataBytes', max(pg_column_size(metadata)))
      FROM substrate.governance_telemetry),
    'telemetryEvents', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.metadata_bytes DESC), '[]'::jsonb) FROM (
      SELECT event_type, count(*) AS rows, sum(pg_column_size(metadata)) AS metadata_bytes
      FROM substrate.governance_telemetry GROUP BY event_type) e),
    'rawWarLog', (SELECT jsonb_build_object('rows', count(*), 'oldest', min(ingested_at), 'newest', max(ingested_at),
      'payloadBytes', COALESCE(sum(pg_column_size(payload)), 0)) FROM substrate.raw_war_log),
    'battles', (SELECT jsonb_build_object('rows', count(*), 'oldest', min(battle_time), 'newest', max(battle_time))
      FROM drivers.player_battles),
    'battleDaily', (SELECT jsonb_build_object('rows', count(*), 'oldest', min(battle_date), 'newest', max(battle_date))
      FROM drivers.player_battle_daily),
    'battleRetention', (SELECT jsonb_build_object('keepDays', (SELECT days FROM battle_retention),
      'purgeBatchRows', (SELECT batch FROM battle_retention), 'oldRows', count(*),
      'oldRowsWithSummary', count(*) FILTER (WHERE has_summary),
      'oldRowsWithoutSummary', count(*) FILTER (WHERE NOT has_summary)) FROM old_battles),
    'recruitLedger', (SELECT jsonb_build_object('rows', count(*), 'oldest', min(created_at), 'newest', max(created_at))
      FROM drivers.recruit_ledger)
  ),
  'retentionConfig', (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'value', value) ORDER BY key), '[]'::jsonb)
    FROM substrate.config WHERE key ~ '^[A-Z_]*(KEEP_DAYS|RETENTION|PURGE_BATCH|FOLD_)[A-Z_]*$'),
  'migrations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version), '[]'::jsonb)
    FROM supabase_migrations.schema_migrations)
) AS architecture;
