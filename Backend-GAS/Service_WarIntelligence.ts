
/**
 * ⚔️ WAR INTELLIGENCE - CLASP EDITION
 * VERSION: 12.4.1 | High-Resolution Snapshot Engine
 */

import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";


declare const CacheService: any;
declare const CONFIG: AppConfig;
declare const Registry: IRegistry;
declare const Logger: any;

/**
 * 🚀 WAR SNAPSHOT INTERFACE
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
 * 🚀 ENTRY POINT: Triggerable by Apps Script
 */
function getWarSnapshot(): WarSnapshot {
  const snap = WarIntelligence.getSnapshot();
  WarIntelligence.log(snap);
  return snap;
}

const WarIntelligence = (() => {
  const K = "W_SNAP_V12_1"; // Busted for v12.4.1 fix
  const TTL = 900;       // 15 Min Cache
  const RESET_H = 10;    // 10:00 UTC Reset
  const VERSION = "12.4.1";

  return {
    getSnapshot(): WarSnapshot {
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
          
          const res = Registry.Services.Network.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/currentriverrace`]);
          
          if (!res?.[0]) throw new Error("API_EMPTY");
          
          const snap = this.parse(res[0], 'HIGH-FIDELITY');
          CacheService.getScriptCache().put(K, JSON.stringify(snap), TTL);
          Registry.Services.Store.props.setChunked(K + "_PERSIST", snap); // 🛡️ Persist
          return snap;
        } catch (e: any) {
          // 🛡️ FALLBACK: Try persistent store if API fails
          const persisted = Registry.Services.Store.props.getChunked<WarSnapshot>(K + "_PERSIST");
          if (persisted) {
             persisted.status = 'HEURISTIC';
             return persisted;
          }
          return this.fallback();
        }
      });
    },

    parse(d: any, status: WarSnapshot['status'] = 'HIGH-FIDELITY'): WarSnapshot {
      const now = new Date();
      const pIdx = d?.periodIndex;
      const sIdx = d?.sectionIndex || 0;
      const isColosseum = sIdx >= 3;

      // 🛡️ UNIFIED PHASE DETECTION
      // 🛡️ UNIFIED PHASE DETECTION
      let rawDay: number;
      if (pIdx !== undefined) {
        rawDay = pIdx % 7;
      } else {
        const heuristic = Registry.Services.Time.getWarPhaseFromDate(now);
        rawDay = heuristic.rawDay;
      }

      const isFinished = d?.state === "full";
      const rootClan = d?.clan || {};

      // 🛡️ TACTICAL FAME & RANK EXTRACTION
      // 🛡️ UNIFIED FAME EXTRACTION
      let fame = 0;
      let rank = 0;
      const clanTag = rootClan.tag || "";
      
      // Calculate isTraining EARLY for use in logic
      const isTraining = rawDay <= 2;

      if (d?.clans && Array.isArray(d.clans)) {
        // Find our clan in the race array for potentially fresher data
        const sorted = [...d.clans].sort((a: any, b: any) => {
          const valA = Registry.Services.ScoringSystem.resolveWarFame(a);
          const valB = Registry.Services.ScoringSystem.resolveWarFame(b);
          return valB - valA;
        });

        const myEntry = sorted.find((c: any) => c.tag === clanTag);
        // If player has participated, use their contribution
        if (myEntry) {
          fame = Registry.Services.ScoringSystem.resolveWarFame(myEntry);
          rank = sorted.indexOf(myEntry) + 1;
        }
      } else if (isTraining) {
        // During Training Days, fame is often 0 or meaningless "Medals"
        fame = Registry.Services.ScoringSystem.resolveWarFame(rootClan);
        rank = rootClan.rank || 0; // Rank might still be available on rootClan
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



    calcR(n: Date): number {
      const r = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), RESET_H, 0, 0));
      if (n.getTime() >= r.getTime()) r.setUTCDate(r.getUTCDate() + 1);
      return Math.floor((r.getTime() - n.getTime()) / 60000);
    },

    fallback(): WarSnapshot {
      return this.parse(null, 'HEURISTIC');
    },

    log(s: WarSnapshot) {
      const v = `[v${s.meta.version}]`;
      const title = `WAR INTELLIGENCE: ${s.status} ${v}`;
      const width = 60;
      
      const pad = (str: string, len: number) => str + " ".repeat(Math.max(0, len - str.length));
      
      const line1 = `Week ${s.schedule.week} | ${s.protocol.dayLabel} | Reset in ${s.schedule.remainingTime}`;
      const line2 = `Tactical: Rank ${s.performance.rank}° | Fame: ${s.performance.fame.toLocaleString()}`;

      const borderTop = `┌── ${title} ${"─".repeat(Math.max(0, width - title.length - 5))}┐`;
      const borderMid1 = `│ ${pad(line1, width - 2)} │`;
      const borderMid2 = `│ ${pad(line2, width - 2)} │`;
      const borderBot = `└${"─".repeat(width)}┘`;

      Logger.log(`\n${borderTop}\n${borderMid1}\n${borderMid2}\n${borderBot}\n`);
    }
  };
})();