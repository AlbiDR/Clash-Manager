/**
 * ============================================================================
 * ⚔️ MODULE: SERVICE_WAR_SNAPSHOT - Agentic Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Direct state engine for Clan War phase detection.
 * 🏷️ VERSION: 11.6.0 (Renamed & Trigger-Optimized)
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { AppUtils } from "./Utilities";

declare const CONFIG: AppConfig;
declare const Utils: AppUtils;

/**
 * 📦 GLOBAL TRIGGER
 * Call this from other modules or triggers to get the current state.
 */
function GetWarSnapshot(): WarSnapshotResult {
  return WarSnapshot.get();
}

export interface WarSnapshotResult {
  protocol: "Trial Phase" | "Engagement Phase" | "Maintenance Mode" | "Seasonal Transition" | "Idle";
  week: number;
  day: number;
  isColosseum: boolean;
  isRaceFinished: boolean;
  isEstimated: boolean;
  minutesToReset: number;
  timestamp: string;
}

/**
 * 🧠 WAR SNAPSHOT SERVICE
 * Singleton optimized for minimal token density and quota preservation.
 */
export const WarSnapshot = (() => {
  const CACHE_KEY = "WAR_INTEL_SNAP";
  const TTL = 900; // 15 Minutes
  const UTC_RESET_HOUR = 10;
  
  let _RAM_CACHE: WarSnapshotResult | null = null;

  return {
    /**
     * @returns {WarSnapshotResult} Atomic state of the current war.
     */
    get(): WarSnapshotResult {
      // 1. Memory Check (Zero Quota)
      if (_RAM_CACHE) return { ..._RAM_CACHE, minutesToReset: this.calcReset(new Date()) };

      // 2. Script Cache Check (Low Quota)
      const cached = Utils.CacheHandler.getLarge(CACHE_KEY);
      if (cached) {
        _RAM_CACHE = JSON.parse(cached);
        return { ..._RAM_CACHE!, minutesToReset: this.calcReset(new Date()) };
      }

      // 3. API Fetch (Normal Quota - Locked to prevent race conditions)
      return Utils.executeSafely("WAR_SYNC_LOCK", () => {
        try {
          const tag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
          const data = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${tag}/currentriverrace`]);
          const result = this.synthesize(data?.[0]);
          
          Utils.CacheHandler.putLarge(CACHE_KEY, JSON.stringify(result), TTL);
          return (_RAM_CACHE = result);
        } catch (e) {
          console.warn("API Offline: Generating Time-Based Estimate.");
          return this.generateEstimate();
        }
      });
    },

    synthesize(data: any): WarSnapshotResult {
      const now = new Date();
      const base: WarSnapshotResult = {
        protocol: "Idle", week: 0, day: 0, isColosseum: false, 
        isRaceFinished: false, isEstimated: false, 
        minutesToReset: this.calcReset(now), timestamp: Utils.formatDate(now)
      };

      if (!data) return base;
      if (data.reason === "inMaintenance") return { ...base, protocol: "Maintenance Mode" };

      const pIdx = data.periodIndex;
      const sIdx = data.sectionIndex || 0;
      if (pIdx === undefined) return { ...base, protocol: "Seasonal Transition" };

      const day = (pIdx % 7) + 1;
      const isColosseum = sIdx >= 3;
      const isRaceFinished = data.state === "full";
      
      // Phase Logic: Colosseum or 'war' state = Engagement. 'training' = Trial.
      let protocol: WarSnapshotResult["protocol"] = "Engagement Phase";
      if (!isColosseum && data.state === "training") {
        protocol = "Trial Phase";
      } else if (!isColosseum && data.state !== "war" && day <= 3) {
        protocol = "Trial Phase";
      }

      return { ...base, protocol, week: sIdx + 1, day, isColosseum, isRaceFinished };
    },

    generateEstimate(): WarSnapshotResult {
      const now = new Date();
      const utcDay = now.getUTCDay();
      const h = now.getUTCHours();
      // Adjust for UTC 10:00 reset
      let day = (h < UTC_RESET_HOUR) ? (utcDay === 0 ? 6 : utcDay - 1) : utcDay;
      day = day === 0 ? 7 : day; 

      return {
        protocol: day <= 3 ? "Trial Phase" : "Engagement Phase",
        week: 0, day, isColosseum: false, isRaceFinished: false, isEstimated: true,
        minutesToReset: this.calcReset(now), timestamp: Utils.formatDate(now)
      };
    },

    calcReset(d: Date): number {
      const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), UTC_RESET_HOUR, 0, 0));
      if (d.getTime() >= r.getTime()) r.setUTCDate(r.getUTCDate() + 1);
      return Math.floor((r.getTime() - d.getTime()) / 60000);
    }
  };
})();