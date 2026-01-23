
/**
 * ⚔️ WAR INTELLIGENCE - CLASP EDITION
 * VERSION: 12.3.0 | High-Robustness Snapshot Engine
 */

declare var CacheService: any;
declare var Utils: any;
declare var CONFIG: any;
declare var Logger: any;

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
  const K = "W_SNAP_V12_DBGR"; // Changed key to force fresh fetch for debugging
  const TTL = 900;       // 15 Min Cache
  const RESET_H = 10;    // 10:00 UTC Reset
  const VERSION = "12.3.1-DEBUG";

  return {
    getSnapshot(): WarSnapshot {
      const cached = CacheService.getScriptCache().get(K);
      if (cached) {
        const snap = JSON.parse(cached);
        snap.status = 'VAULT-STORED';
        return snap;
      }

      // @ts-ignore
      return Utils.executeSafely("WAR_SYNC", () => {
        try {
          // Robust tag handling: Ensure we don't double encode or miss coding
          let rawTag = CONFIG.SYSTEM.CLAN_TAG || "";
          if (rawTag.startsWith("#")) rawTag = rawTag.substring(1);
          const tag = encodeURIComponent(rawTag);
          
          // @ts-ignore
          const res = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/currentriverrace`]);
          
          if (!res?.[0]) throw new Error("API_EMPTY");

          // 🛡️ DEBUG LOGS: Surgical inspection of raw API payload
          Logger.log(`[DEBUG] API URL: ${CONFIG.SYSTEM.API_BASE}/clans/%23${tag}/currentriverrace`);
          Logger.log(`[DEBUG] Raw Keys: ${Object.keys(res[0]).join(", ")}`);
          if (res[0].clan) {
            Logger.log(`[DEBUG] Clan Found: ${res[0].clan.name} (${res[0].clan.tag}) | Fame: ${res[0].clan.fame}`);
          } else {
            Logger.log(`[DEBUG] CRITICAL: .clan object missing in response`);
          }
          if (res[0].clans) {
            Logger.log(`[DEBUG] Total Clans in Race: ${res[0].clans.length}`);
            Logger.log(`[DEBUG] Clan Tags: ${res[0].clans.map((c: any) => c.tag).join(", ")}`);
          }
          
          const snap = this.parse(res[0], 'HIGH-FIDELITY');
          CacheService.getScriptCache().put(K, JSON.stringify(snap), TTL);
          return snap;
        } catch (e) {
          return this.fallback();
        }
      });
    },

    parse(d: any, status: WarSnapshot['status'] = 'HIGH-FIDELITY'): WarSnapshot {
      const now = new Date();
      const pIdx = d?.periodIndex;
      const sIdx = d?.sectionIndex || 0;
      
      const isColosseum = sIdx >= 3;
      const rawDay = (pIdx !== undefined) ? (pIdx % 7) : this.estDay(now); 
      
      const isFinished = d?.state === "full";
      const clanData = d?.clan || {};
      
      // 🛡️ ROBUST FAME DETECTION: API sometimes uses different fields or nested values
      const fame = clanData.fame || clanData.periodPoints || clanData.medals || 0;

      // 🛡️ ROBUST RANK CALCULATION
      let rank = clanData.rank || 0; 
      if (d?.clans && Array.isArray(d.clans)) {
        // Sort by whatever "points" field is available
        const sorted = [...d.clans].sort((a: any, b: any) => {
          const valA = a.fame || a.periodPoints || a.medals || 0;
          const valB = b.fame || b.periodPoints || b.medals || 0;
          return valB - valA;
        });
        const myIndex = sorted.findIndex((c: any) => c.tag === clanData.tag);
        if (myIndex !== -1) rank = myIndex + 1;
      }
      
      // Phase & Day Labelling
      let phase: WarSnapshot['protocol']['phase'] = "IDLE";
      let label = "War Interval";
      let dayLabel = `Day ${rawDay + 1}`;

      if (rawDay <= 2) {
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
      const remainingStr = `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;

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
          clanTag: clanData.tag || "Unknown"
        },
        meta: {
          timestamp: now.toISOString(),
          version: VERSION
        }
      };
    },

    estDay(n: Date): number {
      const reset = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), RESET_H, 0, 0));
      let utcDay = n.getUTCDay(); // 0=Sun, 1=Mon, ..., 4=Thu
      if (n.getTime() < reset.getTime()) utcDay = (utcDay + 6) % 7;
      return (utcDay + 3) % 7; // Shift to 0=Thu
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
