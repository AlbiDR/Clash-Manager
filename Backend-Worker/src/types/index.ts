/**
 * ============================================================================
 * [TYPES] TYPE DEFINITIONS: Backend Worker
 * ----------------------------------------------------------------------------
 * Comprehensive TypeScript interfaces and types for the Clash Manager Worker
 * ============================================================================
 */

// ============================================================================
// [VALIDATION] BRANDED TYPES (Compile-time safety for string validation)
// ============================================================================

export type PlayerTag = string & { readonly __brand: "PlayerTag" };
export type ClanTag = string & { readonly __brand: "ClanTag" };
export type TournamentTag = string & { readonly __brand: "TournamentTag" };
export type WarWeekId = string & { readonly __brand: "WarWeekId" };

// ============================================================================
// [API] CLASH ROYALE API TYPES
// ============================================================================

export interface ClashRoyalePlayer {
  tag: PlayerTag;
  name: string;
  trophies: number;
  totalDonations: number;
  warDayWins: number;
  challengeCardsWon: number;
  expLevel?: number;
  clan?: {
    tag: ClanTag;
    name: string;
  };
  leagueStatistics?: {
    currentSeason?: {
      trophies?: number;
    };
  };
}

export interface BattleLogEntry {
  type: "riverRacePvP" | "boatBattle" | "riverRaceDuel" | string;
  battleTime: string;
  team?: unknown[];
  opponent?: unknown[];
}

export interface TournamentMember {
  tag: PlayerTag;
  name: string;
  // NOTE: Tournament members report their in-tournament score, NOT global trophies.
  score: number;
  rank?: number;
  clan?: {
    tag: ClanTag;
    badgeId?: number;
  };
}

export interface Tournament {
  tag: TournamentTag;
  name: string;
  membersList?: TournamentMember[];
  status?: string;
}

export interface ClanMember {
  tag: PlayerTag;
  name: string;
  role: "leader" | "coLeader" | "elder" | "member";
  expLevel: number;
  trophies: number;
  donations: number;
  donationsReceived: number;
}

export interface ClanMembers {
  items: ClanMember[];
}

export interface RiverRaceParticipant {
  tag: PlayerTag;
  name: string;
  fame: number;
  repairPoints: number;
  boatAttacks: number;
  decksUsed: number;
  decksUsedToday: number;
}

export interface RiverRaceClan {
  tag: ClanTag;
  name: string;
  fame: number;
  participants: RiverRaceParticipant[];
}

export interface RiverRaceStanding {
  rank: number;
  clan: RiverRaceClan;
}

export interface CurrentRiverRace {
  state: string;
  clan: RiverRaceClan;
  standings: RiverRaceStanding[];
}

export interface RiverRaceLogItem {
  createdDate: string;
  seasonId: number;
  standings: RiverRaceStanding[];
}

export interface RiverRaceLog {
  items: RiverRaceLogItem[];
}

// ============================================================================
// [SYNC] FETCH & RESPONSE TYPES
// ============================================================================

export interface FetchResult<T = unknown> {
  code: number;
  content: T | string;
  keyUsed?: string;
}

export interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  error?: string;
}

// ============================================================================
// [LOGIC] SCORING & RECRUITMENT TYPES
// ============================================================================

export interface ScoringWeights {
  TROPHY: number;
  DON: number;
  WAR: number;
  WAR_BASELINE_BONUS?: number;
}

export interface ScoredPlayer {
  tag: PlayerTag;
  name: string;
  trophies?: number;
  donations?: number;
  cards?: number;
  war?: number;
  rawScore: number;
  clan?: string | null;
}

export type WarHistory = Record<PlayerTag, Record<WarWeekId, number>>;

export interface ClanContext {
  members: ClanMembers | null;
  race: CurrentRiverRace | null;
  history: WarHistory;
}

// ============================================================================
// [SYNC] REQUEST BODY TYPES
// ============================================================================

export interface FetchRequest {
  urls: string[];
  apiKeys?: string[];
  scoring?: ScoringWeights | null;
  minTrophies?: number;
}

/**
 * PROPHET INTELLIGENCE
 *
 * @remarks
 * Structural definition for incoming heritage data (Strategy 2: Deep Delegation).
 * Ensures that historical war performance and tenure metadata is strictly typed.
 */
export interface ProphetIntel {
  wins: number;
  active: boolean;
  lastFetch: number;
}

export interface ScanRequest {
  tags: TournamentTag[];
  apiKeys?: string[];
  blacklist?: PlayerTag[];
  minTrophies?: number;
  scoring?: ScoringWeights | null;
  prophetCache?: Record<string, ProphetIntel>; // Strategy 2: Deep Delegation
}

export interface ClanFullRequest {
  tag: ClanTag;
  apiKeys?: string[]; // THREAT: Optional keys allow fallback to global pool.
}

export interface ClanApiRequest {
  tag: ClanTag;
  type: "members" | "warlog";
  apiKeys?: string[]; // THREAT: Optional keys allow fallback to global pool.
}

export interface AuditRequest {
  apiKeys: string[];
}

export interface PublicScanRequest {
  tags: TournamentTag[];
  apiKeys?: string[];
  blacklist?: PlayerTag[];
  minTrophies?: number;
  scoring?: ScoringWeights | null;
  prophetCache?: Record<string, ProphetIntel>; // Strategy 2: Deep Delegation
}

export interface SubscriptionRequest {
  endpoint: string;
  keys?: {
    p256dh: string;
    auth: string;
  };
}

// ============================================================================
// [CONFIG] SERVER CONFIGURATION
// ============================================================================

export interface ServerConfig {
  readonly concurrency: number;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly port: number;
  readonly apiBase: string; // [SYNC] NEW: API Base URL
  readonly secret?: string;
}

export interface ScanDebugInfo {
  firstUrl: string;
  firstStatus: number;
  firstContent: string;
  keyUsed: string;
}

export interface ApiKeyAuditResult {
  key: string;
  status: number;
  error?: string;
}

// ============================================================================
// [UTIL] UTILITY TYPES
// ============================================================================

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Type guard for determining if a value is a valid scoring weights object
export function isScoringWeights(value: unknown): value is ScoringWeights {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["TROPHY"] === "number" &&
    typeof obj["DON"] === "number" &&
    typeof obj["WAR"] === "number"
  );
}

// Type guard for player tags
export function isPlayerTag(value: string): value is PlayerTag {
  return value.startsWith("#") || /^[0-9A-Z]+$/.test(value);
}

// Type guard for clan tags
export function isClanTag(value: string): value is ClanTag {
  return value.startsWith("#") || /^[0-9A-Z]+$/.test(value);
}
export * from './HubTypes';
