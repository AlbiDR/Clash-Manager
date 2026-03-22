/**
 * MODULE: DATABASE TYPES
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Type definitions for the Clan Database system.
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

export const VER_DATABASE_TYPES = "1.0.0";

(function(scope: any) {
  Object.assign(scope, { DatabaseTypes: { VER_DATABASE_TYPES }, VER_DATABASE_TYPES });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

