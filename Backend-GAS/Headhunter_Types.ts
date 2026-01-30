
/**
 * ============================================================================
 * 🔭 MODULE: HEADHUNTER TYPES
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Shared interfaces for the Recruitment system.
 * ============================================================================
 */

export interface Recruit {
  tag: string;
  name: string;
  trophies: number;
  donations: number;
  cards: number;
  war: number;
  foundDate: Date;
  invited: boolean;
  rawScore: number;
  potentialScore?: number;
}

export interface BlacklistEntry {
  t: string; // tag
  e: number; // expiry timestamp
  s: number; // rawScore
}

export interface BlacklistResult {
  ids: Set<string>;
  entries: Array<{ rawScore: number }>;
}

export interface TournamentMember {
  tag: string;
  name: string;
  trophies: number;
  clan: { tag: string; name: string; badgeId: number };
}

export interface TournamentResult {
  tag: string;
  type: string;
  status: string;
  creatorTag: string;
  name: string;
  description: string;
  capacity: number;
  maxCapacity: number;
  items?: TournamentResult[];
  membersList?: TournamentMember[];
}
