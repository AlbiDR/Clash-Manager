
/**
 * ============================================================================
 * MODULE: WAR INTELLIGENCE (Snapshot Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Provides high-resolution snapshots of the current River Race
 * state. Orchestrates data acquisition from the Royale API and manages a
 * multi-tier fallback system to ensure UI stability.
 *
 * ARCHITECTURE:
 *    - Snapshot Lifecycle: High-Fidelity (Live) -> Vault-Stored (Cache) -> Heuristic (Fallback).
 *    - Phase Normalization: Maps the 7-day API period index to tactical phases.
 *    - Quota Preservation: Uses CacheService and PropertiesService to minimize API calls.
 *
 * ROLE: The Scout (Information Gathering).
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { RegistryContract } from "./Registry";

declare const CacheService: any;
declare const CONFIG: AppConfig;
declare const Registry: RegistryContract;
declare const Logger: any;

/**
 * WAR SNAPSHOT INTERFACE
 *
 * @property status - Quality of the data:
 *    - HIGH-FIDELITY: Freshly fetched from Royale API.
 *    - VAULT-STORED: Retrieved from L2 Script Cache.
 *    - HEURISTIC: Fallback from persistent storage (potentially stale).
 * @property protocol - Phase-specific metadata.
 * @property schedule - Time-based metrics and reset countdowns.
 * @property performance - Score and rank data for the clan.
 */
export interface WarSnapshot {
  status: 'HIGH-FIDELITY' | 'VAULT-STORED' | 'HEURISTIC';
  protocol: {
    phase: 'TRIAL' | 'ENGAGEMENT' | 'COLOSSEUM' | 'IDLE';
    label: string;
    dayLabel: string;
    isColosseum: boolean;
  };
  schedule: {
    week: number;
    day: number;
    minutesToReset: number;
    remainingTime: string;
  };
  performance: {
    fame: number;
    rank: number;
    isRaceFinished: boolean;
    clanTag: string;
  };
  meta: {
    timestamp: string;
    version: string;
  };
}

/**
 * ENTRY POINT: Triggerable by Apps Script
 * Orchestrates the snapshot acquisition and logs the result.
 */
function getWarSnapshot(): WarSnapshot {
  const snap = WarIntelligence.getSnapshot();
  WarIntelligence.log(snap);
  return snap;
}

/**
 * WAR INTELLIGENCE ENGINE
 * Singleton module for managing war state snapshots.
 */
const WarIntelligence = (() => {
  const K = "W_SNAP_V12_1"; // Cache Key
  const TTL = 900;          // 15 Min Cache (Quota Preservation)
  const RESET_H = 10;       // 10:00 UTC Reset (Game Standard)
  const VERSION = "12.4.1";

  return {
    /**
     * Primary data acquisition loop.
     *
     * @remarks
     * Implements a "Graceful Degradation" pattern. If the API fetch fails or
     * quotas are exceeded, it attempts to hydrate the snapshot from the
     * persistent "VAULT" (PropertiesService).
     *
     * @returns {WarSnapshot} A validated war state snapshot.
     * @warning Consumes CacheService, UrlFetchApp, and PropertiesService quotas.
     */
    getSnapshot(): WarSnapshot {
      // LEVEL 1: L2 CACHE (ScriptCache)
      const cached = CacheService.getScriptCache().get(K);
      if (cached) {
        const snap = JSON.parse(cached);
        snap.status = 'VAULT-STORED';
        return snap;
      }

      return Registry.Services.Core.executeSafely("WAR_SYNC", () => {
        try {
          let rawTag = CONFIG.SYSTEM.CLAN_TAG || "";
          if (rawTag.startsWith("#")) rawTag = rawTag.substring(1);
          const tag = encodeURIComponent(rawTag);
          
          // API HANDSHAKE
          const res = Registry.Services.Network.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/currentriverrace`]);
          
          if (!res?.[0]) throw new Error("API_EMPTY");
          
          const snap = this.parse(res[0], 'HIGH-FIDELITY');

          // PERSISTENCE SYNC
          // Save to both short-term cache and long-term persistent storage.
          CacheService.getScriptCache().put(K, JSON.stringify(snap), TTL);
          Registry.Services.Store.props.setChunked(K + "_PERSIST", snap);

          return snap;
        } catch (e: any) {
          // LEVEL 2: PERSISTENT FALLBACK (PropertiesService)
          // Essential for maintaining UI functionality during Royale API outages.
          const persisted = Registry.Services.Store.props.getChunked<WarSnapshot>(K + "_PERSIST");
          if (persisted) {
             persisted.status = 'HEURISTIC';
             return persisted;
          }
          return this.fallback();
        }
      });
    },

    /**
     * Transforms raw API response into a structured WarSnapshot.
     *
     * @param d - Raw JSON response from /currentriverrace.
     * @param status - Intentional quality status to assign.
     * @returns {WarSnapshot} The normalized snapshot.
     */
    parse(d: any, status: WarSnapshot['status'] = 'HIGH-FIDELITY'): WarSnapshot {
      const now = new Date();
      const pIdx = d?.periodIndex;
      const sIdx = d?.sectionIndex || 0;
      const isColosseum = sIdx >= 3;

      // UNIFIED PHASE DETECTION
      // Rationale: Converting the zero-indexed 7-day cycle (Monday-Sunday)
      // into descriptive game phases (Training vs Battle).
      let rawDay: number;
      if (pIdx !== undefined) {
        rawDay = pIdx % 7; // API Period Index normalization
      } else {
        // Fallback to time-based heuristic if API response is partial
        const heuristic = Registry.Services.Time.getWarPhaseFromDate(now);
        rawDay = heuristic.rawDay;
      }

      const isFinished = d?.state === "full";
      const rootClan = d?.clan || {};

      // TACTICAL FAME & RANK EXTRACTION
      // Intent: Finding the clan entry within the race array ensures we get
      // the most competitive "fresher" metrics compared to the root clan object.
      let fame = 0;
      let rank = 0;
      const clanTag = rootClan.tag || "";
      
      const isTraining = rawDay <= 2; // Training Days: Days 0, 1, 2

      if (d?.clans && Array.isArray(d.clans)) {
        const sorted = [...d.clans].sort((a: any, b: any) => {
          const valA = Registry.Services.Scoring.resolveWarFame(a);
          const valB = Registry.Services.Scoring.resolveWarFame(b);
          return valB - valA;
        });

        const myEntry = sorted.find((c: any) => c.tag === clanTag);
        if (myEntry) {
          fame = Registry.Services.Scoring.resolveWarFame(myEntry);
          rank = sorted.indexOf(myEntry) + 1;
        }
      } else if (isTraining) {
        fame = Registry.Services.Scoring.resolveWarFame(rootClan);
        rank = rootClan.rank || 0;
      }

      // Phase & Day Labelling
      let phase: WarSnapshot["protocol"]["phase"] = "IDLE";
      let label = "War Interval";
      let dayLabel = `Day ${rawDay + 1}`;

      if (isTraining) {
        phase = "TRIAL";
        label = "Training Days";
        dayLabel = `Training Day ${rawDay + 1}`;
      } else {
        phase = isColosseum ? "COLOSSEUM" : "ENGAGEMENT";
        label = isColosseum ? "Colosseum Week" : "Battle Days";
        dayLabel = `Battle Day ${rawDay - 2}`;
      }

      const mToReset = this.calcR(now);
      const h = Math.floor(mToReset / 60);
      const m = mToReset % 60;
      const remainingStr = `${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m`;

      return {
        status,
        protocol: { phase, label, dayLabel, isColosseum },
        schedule: {
          week: sIdx + 1,
          day: rawDay + 1,
          minutesToReset: mToReset,
          remainingTime: remainingStr
        },
        performance: {
          fame,
          rank,
          isRaceFinished: isFinished,
          clanTag: rootClan.tag || "Unknown"
        },
        meta: {
          timestamp: now.toISOString(),
          version: VERSION
        }
      };
    },

    /**
     * Calculates minutes until the 10:00 UTC Daily Reset.
     *
     * @param n - Current date.
     * @returns {number} Minutes remaining.
     */
    calcR(n: Date): number {
      const r = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), RESET_H, 0, 0));
      if (n.getTime() >= r.getTime()) r.setUTCDate(r.getUTCDate() + 1);
      return Math.floor((r.getTime() - n.getTime()) / 60000);
    },

    /**
     * Generates a structural fallback snapshot when no data is available.
     */
    fallback(): WarSnapshot {
      return this.parse(null, 'HEURISTIC');
    },

    /**
     * Logs the snapshot to the GAS Logger for debugging.
     *
     * @param s - The snapshot to log.
     */
    log(s: WarSnapshot) {
      const title = `WAR INTELLIGENCE: ${s.status} [v${s.meta.version}]`;
      const line1 = `Week ${s.schedule.week} | ${s.protocol.dayLabel} | Reset in ${s.schedule.remainingTime}`;
      const line2 = `Tactical: Rank ${s.performance.rank} | Fame: ${s.performance.fame.toLocaleString()}`;

      Logger.log(`\n${title.toUpperCase()}\n  ${line1}\n  ${line2}\n`);
    }
  };
})();
