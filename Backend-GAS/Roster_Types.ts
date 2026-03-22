/**
 * [TYPES] ROSTER TYPES
 */

export interface PlayerResult {
  member: any;
  tag: string;
  name: string;
  role: string;
  trophies: number;
  daysTracked: number;
  avgDailyDonations: number;
  totalDonations: number;
  lastSeen: Date;
  warRateVal: number;
  avgWarFame: number;
  historyString: string;
  scores: { raw: number; perf: number };
  cleanKey: string;
}

export interface ClanMemberResult {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  donations: number;
  lastSeen: string;
  warDayWins: number;
  donationsReceived: number;
}

export interface WarLogItem {
  createdDate: string;
  standings: Array<{
    clan: {
      tag: string;
      participants: Array<{ tag: string; fame: number }>;
    };
  }>;
}

export interface RaceParticipant {
  tag: string;
  fame: number;
  medals: number;
  repairPoints: number;
}

export interface RosterContract {
  synchronizeLeaderboard(): void;
  getProphetCache(): Map<string, any>;
  getTopPerformers(count?: number): string[];
}

export const VER_ROSTER_TYPES = "1.0.0";

(function(scope: any) {
  Object.assign(scope, { RosterTypes: { VER_ROSTER_TYPES }, VER_ROSTER_TYPES });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
