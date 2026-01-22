/**
 * TypeScript interfaces for Clash Royale Manager
 */

// API Response Envelope
export interface ApiResponse<T> {
  readonly status: "success" | "error";
  readonly data: T | null;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly timestamp: string;
}

// Legacy format from getWebAppData
export interface LegacyApiResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: { readonly code: string; readonly message: string } | null;
}

// Member in Leaderboard
export interface LeaderboardMember {
  readonly id: string; // Player tag without #
  readonly n: string; // Name
  readonly t: number; // Trophies
  
  // STRICT NOMENCLATURE
  readonly performanceScore: number; // Normalized % (0-100)
  readonly performanceRawScore: number;  // Unbounded Calculation (e.g. 52102)

  readonly dt?: number; // Score Trend (Raw Score Delta)
  readonly d: {
    readonly role: string;
    readonly days: number;
    readonly avg: number;
    readonly seen?: string | null; // Made optional
    readonly rate?: string | null; // Made optional
    readonly wfame?: number;
    readonly hist: string;
  };
}

// Recruit in Headhunter
export interface Recruit {
  readonly id: string; // Player tag without #
  readonly n: string; // Name
  readonly t: number; // Trophies
  
  // STRICT NOMENCLATURE
  readonly potentialScore: number; // Normalized % (0-100)
  readonly potentialRawScore: number; // Unbounded Calculation (e.g. 52102)

  readonly d: {
    readonly don: number; // Donations
    readonly war: number; // War Wins
    readonly ago: string; // Found Date ISO
    readonly cards?: number; // Cards Won (optional)
  };
}

// Web App Data payload
export interface WebAppData {
  readonly lb: readonly LeaderboardMember[];
  readonly hh: readonly Recruit[];
  readonly playerTag?: string; // Player tag without # to highlight
  readonly timestamp: number;
}

// Real-time clan member
export interface ClanMember {
  readonly tag: string;
  readonly name: string;
  readonly role: string;
  readonly kingLevel: number;
  readonly donations: number;
  readonly donationsReceived: number;
}

// Ping response
export interface PingResponse {
  readonly version: string;
  readonly status: string;
  readonly scriptId?: string;
  readonly spreadsheetUrl?: string;
  readonly sheets?: Record<string, number>;
  readonly modules: Record<string, string>;
  readonly latency?: number;
}

// Dismiss response
export interface DismissResponse {
  readonly success: boolean;
  readonly count?: number;
  readonly message?: string;
}
