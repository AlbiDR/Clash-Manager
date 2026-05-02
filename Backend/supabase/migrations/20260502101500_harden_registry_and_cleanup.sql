-- 🧹 CLEANUP: Remove legacy test row from recruit_buffer
DELETE FROM drivers.recruit_buffer WHERE id = 2;

-- 🛡️ HARDENING: Enable RLS on Registry Tables
ALTER TABLE drivers.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE substrate.discovery_anchors ENABLE ROW LEVEL SECURITY;

-- 🛡️ POLICIES: drivers.players
-- Rationale: Allow public read access to the player registry for score visibility,
-- but restrict mutations to the service role.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'Public Read Access') THEN
        CREATE POLICY "Public Read Access" ON drivers.players
            FOR SELECT TO public USING (true);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON drivers.players
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 🛡️ POLICIES: substrate.discovery_anchors
-- Rationale: Discovery anchors are used by the scanner and PWA to identify 
-- high-traffic clans. Public read is safe; mutations restricted.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovery_anchors' AND policyname = 'Public Read Access') THEN
        CREATE POLICY "Public Read Access" ON substrate.discovery_anchors
            FOR SELECT TO public USING (true);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovery_anchors' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON substrate.discovery_anchors
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
