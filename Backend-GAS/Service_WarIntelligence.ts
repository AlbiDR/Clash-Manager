
/**
 * ⚔️ WAR INTELLIGENCE - CLASP EDITION
 * VERSION: 12.1.0 | High-Precision Snapshot Engine
 */

declare var CacheService: any;
declare var Utils: any;
declare var CONFIG: any;
declare var Logger: any;

/**
 * 🚀 WAR SNAPSHOT INTERFACE
 */
export interface WarSnapshot {
  status: 'LIVE' | 'CACHED' | 'ESTIMATED';
  protocol: {
    phase: 'TRIAL' | 'ENGAGEMENT' | 'COLOSSEUM' | 'IDLE';
    label: string;
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
  const K = "W_SNAP_V12"; // Cache Key
  const TTL = 900;       // 15 Min Cache
  const RESET_H = 10;    // 10:00 UTC Reset (Typical Royale Reset)
  const VERSION = "12.1.0";

  return {
    getSnapshot(): WarSnapshot {
      // 1. Memory/Cache Handshake
      const cached = CacheService.getScriptCache().get(K);
      if (cached) {
        const snap = JSON.parse(cached);
        snap.status = 'CACHED';
        return snap;
      }

      // 2. Atomic Execution
      // @ts-ignore
      return Utils.executeSafely("WAR_SYNC", () => {
        try {
          // @ts-ignore
          const tag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
          // @ts-ignore
          const res = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${tag}/currentriverrace`]);
          
          if (!res?.[0]) throw new Error("API_EMPTY");
          
          const snap = this.parse(res[0], 'LIVE');
          CacheService.getScriptCache().put(K, JSON.stringify(snap), TTL);
          return snap;
        } catch (e) {
          return this.fallback();
        }
      });
    },

    parse(d: any, status: 'LIVE' | 'ESTIMATED' = 'LIVE'): WarSnapshot {
      const now = new Date();
      const pIdx = d?.periodIndex;
      const sIdx = d?.sectionIndex || 0;
      
      // 1. Calculate Core Metrics
      const isColosseum = sIdx >= 3;
      const day = (pIdx !== undefined) ? (pIdx % 7) + 1 : this.estDay(now);
      const isFinished = d?.state === "full";
      const clanData = d?.clan || {};
      const fame = clanData.fame || 0;
      
      // 2. Determine War Phase & Label
      let phase: WarSnapshot['protocol']['phase'] = "IDLE";
      let label = "War Interval";

      if (d?.state === "war" || isFinished) {
        if (isColosseum) {
          phase = "COLOSSEUM";
          label = "Colosseum Week";
        } else {
          phase = "ENGAGEMENT";
          label = "Battle Days";
        }
      } else if (d?.state === "training") {
        phase = "TRIAL";
        label = "Training Days";
      } else {
        // Heuristic fallback based on day index
        phase = day <= 3 ? "TRIAL" : "ENGAGEMENT";
        label = phase === "TRIAL" ? "Training Days" : "Battle Days";
      }

      // 3. Time Calculations
      const mToReset = this.calcR(now);
      const h = Math.floor(mToReset / 60);
      const m = mToReset % 60;
      const remainingStr = `${h}h ${m}m`;

      return {
        status: status,
        protocol: {
          phase,
          label,
          isColosseum
        },
        schedule: {
          week: sIdx + 1,
          day: day,
          minutesToReset: mToReset,
          remainingTime: remainingStr
        },
        performance: {
          fame: fame,
          rank: clanData.rank || 0,
          isRaceFinished: isFinished
        },
        meta: {
          timestamp: now.toISOString(),
          version: VERSION
        }
      };
    },

    estDay(n: Date): number {
      const h = n.getUTCHours();
      const d = (h < RESET_H) ? (n.getUTCDay() === 0 ? 6 : n.getUTCDay() - 1) : n.getUTCDay();
      return d === 0 ? 7 : d;
    },

    calcR(n: Date): number {
      const r = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), RESET_H, 0, 0));
      if (n.getTime() >= r.getTime()) r.setUTCDate(r.getUTCDate() + 1);
      return Math.floor((r.getTime() - n.getTime()) / 60000);
    },

    fallback(): WarSnapshot {
      return this.parse(null, 'ESTIMATED');
    },

    log(s: WarSnapshot) {
      const line = "--------------------------------------------------";
      Logger.log("\n[WAR INTELLIGENCE REPORT]");
      Logger.log(line);
      Logger.log(`STATUS: ${s.status} | PHASE: ${s.protocol.label.toUpperCase()}`);
      Logger.log(`SCHEDULE: Week ${s.schedule.week}, Day ${s.schedule.day}`);
      Logger.log(`RESET IN: ${s.schedule.remainingTime}`);
      Logger.log(line);
      Logger.log("CLAN PERFORMANCE:");
      Logger.log(`Fame: ${s.performance.fame.toLocaleString()} | Rank: ${s.performance.rank}`);
      Logger.log(line);
      Logger.log(`TS: ${s.meta.timestamp} | VER: ${s.meta.version}\n`);
    }
  };
})();
