-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Create the Recruit Blacklist table
CREATE TABLE IF NOT EXISTS drivers.recruit_blacklist (
    tag TEXT PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the Recruit Events ledger
CREATE TABLE IF NOT EXISTS drivers.recruit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tag TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('DISCOVERED', 'INVITED', 'DISCARDED', 'JOINED_CLAN', 'PURGED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by player tag
CREATE INDEX IF NOT EXISTS idx_recruit_events_tag ON drivers.recruit_events(tag);
