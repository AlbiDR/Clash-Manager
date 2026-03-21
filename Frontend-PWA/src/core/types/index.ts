
/**
 * TypeScript interfaces for Clash Royale Manager
 */

// API Response Envelope
export interface ApiResponse<T> {
  status: "success" | "error";
  data: T | null;
  error: { code: string; message: string } | null;
  timestamp: string;
}

// Legacy format from getWebAppData
export interface LegacyApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}


// Member in Leaderboard
export interface LeaderboardMember {
  id: string; // Player tag without #
  n: string; // Name
  t: number; // Trophies
  
  // STRICT NOMENCLATURE
  performanceScore: number; // Normalized % (0-100)
  performanceRawScore: number;  // Unbounded Calculation (e.g. 52102)

  dt?: number; // Score Trend (Raw Score Delta)
  d: {
    role: string;
    days: number;
    avg: number;
    seen?: string | null; // Made optional
    rate?: string | null; // Made optional
    wfame?: number;
    hist: string;
  };
}

// Recruit in Headhunter
export interface Recruit {
  id: string; // Player tag without #
  n: string; // Name
  t: number; // Trophies
  
  // STRICT NOMENCLATURE
  potentialScore: number; // Normalized % (0-100)
  potentialRawScore: number; // Unbounded Calculation (e.g. 52102)

  d: {
    don: number; // Donations
    war: number; // War Wins
    ago: string; // Found Date ISO
    cards?: number; // Cards Won (optional)
  };
  lastScan?: number; // Timestamp of last API validation
}

// Web App Data payload
export interface WebAppData {
  readonly lb: readonly LeaderboardMember[];
  readonly hh: readonly Recruit[];
  readonly playerTag?: string; // Player tag without # to highlight
  readonly timestamp: number;
  readonly dataSource?: "WORKER" | "GAS";
  readonly hubTimestamp?: number;
}

// Real-time clan member
export interface ClanMember {
  tag: string;
  name: string;
  role: string;
  kingLevel: number;
  donations: number;
  donationsReceived: number;
}

// Ping response
export interface PingResponse {
  version: string;
  status: string;
  scriptId?: string;
  spreadsheetUrl?: string;
  sheets?: Record<string, number>;
  modules: Record<string, string>;
  latency?: number;
}

// Momentum / Trend Calculation Result
export interface MomentumInfo {
  val: string;
  dir: "up" | "down";
  raw: number;
}

// Dismissal tuple
export interface DismissalRequest {
  id: string;
  score: number;
}

// Dismiss response
export interface DismissResponse {
  success: boolean;
  count?: number;
  message?: string;
}
