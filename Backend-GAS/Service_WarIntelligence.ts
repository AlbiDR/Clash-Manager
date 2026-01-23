
/**
 * ⚔️ WAR INTELLIGENCE - CLASP EDITION
 * VERSION: 12.2.0 | Posh Snapshot Engine
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
  const RESET_H = 10;    // 10:00 UTC Reset
  const VERSION = "12.2.0";

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
          // @ts-ignore
          const tag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
          // @ts-ignore
          const res = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${tag}/currentriverrace`]);
          
          if (!res?.[0]) throw new Error("API_EMPTY");
          
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
      // API periodIndex % 7 starts at 0 (Thu). 
      // Manual mapping to match in-game info:
      // 0=Thu, 1=Fri, 2=Sat, 3=Sun, 4=Mon, 5=Tue, 6=Wed
      
      const isFinished = d?.state === "full";
      const clanData = d?.clan || {};
      const fame = clanData.fame || 0;

      // Rank calculation: Compare fame with all other clans in the race
      let rank = clanData.rank || 0; // Fallback to provided rank if available
      if (d?.clans) {
        const allClans = [...d.clans].sort((a: any, b: any) => b.fame - a.fame);
        const myClanIndex = allClans.findIndex((c: any) => c.tag === clanData.tag);
        if (myClanIndex !== -1) rank = myClanIndex + 1;
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
          isRaceFinished: isFinished
        },
        meta: {
          timestamp: now.toISOString(),
          version: VERSION
        }
      };
    },

    estDay(n: Date): number {
      // Logic to est periodIndex (0-6) based on UTC time
      const reset = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), RESET_H, 0, 0));
      let utcDay = n.getUTCDay(); // 0=Sun, 1=Mon, ..., 4=Thu
      if (n.getTime() < reset.getTime()) utcDay = (utcDay + 6) % 7;
      
      // Shift to 0=Thu
      return (utcDay + 3) % 7;
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

      const borderTop = `┌── ${title} ${"─".repeat(width - title.length - 5)}┐`;
      const borderMid1 = `│ ${pad(line1, width - 2)} │`;
      const borderMid2 = `│ ${pad(line2, width - 2)} │`;
      const borderBot = `└${"─".repeat(width)}┘`;

      Logger.log(`\n${borderTop}\n${borderMid1}\n${borderMid2}\n${borderBot}\n`);
    }
  };
})();
