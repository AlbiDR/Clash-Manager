-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

-- The public app reads the complete roster/recruit views. During ingestion
-- bursts on the free host, the old 3s cutoff canceled otherwise valid reads.
-- Keep the server budget below the client's 8s per-attempt deadline so it can
-- receive a response and retry within the overall 25s sync budget.
ALTER ROLE anon SET statement_timeout = '6s';
NOTIFY pgrst, 'reload config';

COMMIT;
