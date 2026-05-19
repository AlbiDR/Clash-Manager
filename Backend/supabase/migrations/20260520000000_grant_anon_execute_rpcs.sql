-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Grant EXECUTE privileges to anon role for PWA-facing features RPCs.
-- The PWA connects using the publishable (anon) key.

BEGIN;

GRANT EXECUTE ON FUNCTION features.dismiss_recruits(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION features.undismiss_recruits(text[]) TO anon;
GRANT EXECUTE ON FUNCTION features.trigger_backend_update() TO anon;
GRANT EXECUTE ON FUNCTION features.process_queue(jsonb) TO anon;

COMMIT;
