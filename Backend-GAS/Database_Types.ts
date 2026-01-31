/**
 * ============================================================================
 * 📊 MODULE: DATABASE TYPES
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Type definitions for the Clan Database system.
 * ============================================================================
 */

export interface ClanMemberSnapshot {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  donations: number;
  donationsReceived: number;
  lastSeen: string;
}

export interface DatabaseUpdateResult {
    updated: number;
    appended: number;
    pruned: number;
}
