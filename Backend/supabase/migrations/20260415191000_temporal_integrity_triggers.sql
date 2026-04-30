-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [TEMPORAL INTEGRITY ENFORCEMENT]
-- Enforces idempotent `updated_at` timestamps across the data model to never trust the client.

begin;

-- [STAIR 1] - Ensure extension exists
create extension if not exists moddatetime schema extensions;

-- [STAIR 2] - Create Moddatetime Triggers
-- Note: 'drivers.clans' already has handle_updated_at_clans, skipping to avoid duplicates.

-- Table: drivers.members
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'handle_updated_at_members') THEN
        CREATE TRIGGER handle_updated_at_members
            BEFORE UPDATE ON drivers.members
            FOR EACH ROW
            EXECUTE FUNCTION extensions.moddatetime (updated_at);
    END IF;
END $$;

-- Table: drivers.war_activity
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'handle_updated_at_war_activity') THEN
        CREATE TRIGGER handle_updated_at_war_activity
            BEFORE UPDATE ON drivers.war_activity
            FOR EACH ROW
            EXECUTE FUNCTION extensions.moddatetime (updated_at);
    END IF;
END $$;

-- Table: drivers.war_history
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'handle_updated_at_war_history') THEN
        CREATE TRIGGER handle_updated_at_war_history
            BEFORE UPDATE ON drivers.war_history
            FOR EACH ROW
            EXECUTE FUNCTION extensions.moddatetime (updated_at);
    END IF;
END $$;

-- Table: drivers.war_opponents
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'handle_updated_at_war_opponents') THEN
        CREATE TRIGGER handle_updated_at_war_opponents
            BEFORE UPDATE ON drivers.war_opponents
            FOR EACH ROW
            EXECUTE FUNCTION extensions.moddatetime (updated_at);
    END IF;
END $$;

-- Table: substrate.config
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'handle_updated_at_config') THEN
        CREATE TRIGGER handle_updated_at_config
            BEFORE UPDATE ON substrate.config
            FOR EACH ROW
            EXECUTE FUNCTION extensions.moddatetime (updated_at);
    END IF;
END $$;

commit;
