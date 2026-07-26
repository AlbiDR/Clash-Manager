-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Drop Orphaned Views
-- =============================================================================
-- These six views were created in the master migration as convenience layers for
-- features (war analytics, governance dashboard, pipeline health screen, recruit
-- listing) that were never implemented. No Edge Function and no PWA client query
-- references any of these views. They have been verified as unreferenced by
-- Stage 4 (Optimization) on every nightly pipeline run since 2026-06-20.
--
-- The underlying tables (drivers.war_activity, drivers.war_history,
-- substrate.raw_war_log, substrate.governance_telemetry,
-- substrate.pipeline_heartbeat, drivers.recruits) are kept intact. Only the
-- unused view shortcuts are removed.
--
-- If any of these features are implemented in the future, the views can be
-- recreated via a new migration at that time.
-- =============================================================================

DROP VIEW IF EXISTS drivers.recruits_view CASCADE;
DROP VIEW IF EXISTS features.governance_report CASCADE;
DROP VIEW IF EXISTS substrate.view_pipeline_health CASCADE;
DROP VIEW IF EXISTS features.war_activity_view CASCADE;
DROP VIEW IF EXISTS features.war_loyalty_view CASCADE;
DROP VIEW IF EXISTS features.war_performance_analytics_view CASCADE;
