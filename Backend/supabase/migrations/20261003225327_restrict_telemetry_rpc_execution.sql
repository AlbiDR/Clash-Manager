-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

-- These operational SECURITY DEFINER RPCs are called only by authenticated
-- Edge Functions. Browser roles must not be able to forge their records.
REVOKE ALL ON FUNCTION public.report_heartbeat(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_telemetry(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_telemetry(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.report_heartbeat(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_telemetry(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_telemetry(uuid, text, jsonb) TO service_role;

COMMIT;
