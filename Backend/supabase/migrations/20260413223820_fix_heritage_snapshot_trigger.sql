-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Synchronizing heritage snapshot logic with is_active schema standards
CREATE OR REPLACE FUNCTION substrate.handle_heritage_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO drivers.heritage_snapshots (
        member_tag,
        week_fame,
        tenure_days,
        is_active,
        snapshot_at
    )
    SELECT 
        m.tag,
        COALESCE(m.week_fame, 0),
        EXTRACT(DAY FROM (NOW() - m.joined_at))::integer,
        m.is_active,
        NOW()
    FROM drivers.members m
    WHERE m.is_active = true
    ON CONFLICT (member_tag, snapshot_at) DO NOTHING;
    
    RETURN NULL;
END;
$function$;
