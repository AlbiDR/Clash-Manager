/**
 * ============================================================================
 * ⚔️ MODULE: SERVICE_WAR_INTELLIGENCE - TypeScript Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Authoritative engine for Clan War state interpretation.
 * ⚙️ ROLE: Domain Service (Telemetry Analysis & State Management)
 * 🏷️ VERSION: 11.4.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { AppUtils } from "./Utilities";

// Global Declarations for GAS Environment
declare const CONFIG: AppConfig;
declare const Utils: AppUtils;

/**
 * 🛰️ INTELLIGENCE INTERFACES
 */
export type WarProtocol = "Trial Phase" | "Engagement Phase" | "Maintenance Mode" | "Seasonal Transition" | "Idle";

export interface WarSnapshot {
  protocol: WarProtocol;
  week: number;
  day: number;
  progress: string;
  isColosseum: boolean;
  isRaceFinished: boolean;
  isEstimated: boolean;
  minutesToReset: number;
  timestamp: string;
}

/**
 * 🚀 UI ENTRY POINT
 */
function logWarBriefing(): void {
  const intel = WarIntelligence.getSnapshot();
  const h = Math.floor(intel.minutesToReset / 60);
  const m = intel.minutesToReset % 60;
  
  console.log(`[WAR INTEL] Protocol: ${intel.protocol} | Week: ${intel.week} Day: ${intel.day}`);
  console.log(`[WAR INTEL] Status: ${intel.progress} | Reset in: ${h}h ${m}m`);
  if (intel.isEstimated) console.warn("⚠️ Data is estimated based on temporal logic.");
}

/**
 * 🧠 WAR INTELLIGENCE SERVICE
 */
export const WarIntelligence = (function() {
  const CACHE_KEY = "WAR_INTEL_SNAPSHOT";
  const CACHE_TTL = 900; // 15 Minutes
  const RESET_HOUR_UTC = 10;
  
  // Execution Cache (Singleton)
  let _currentSnapshot: WarSnapshot | null = null;

  return {
    /**
     * Resolves the current war state. Minimizes API/Antigravity quota by
     * prioritizing multi-level caching.
     */
    getSnapshot: function(): WarSnapshot {
      if (_currentSnapshot) return _currentSnapshot;

      // 1. Check Script Cache
      const cached = Utils.CacheHandler.getLarge(CACHE_KEY);
      if (cached) {
        _currentSnapshot = JSON.parse(cached) as WarSnapshot;
        // Update countdown dynamically even if cached
        _currentSnapshot.minutesToReset = calculateMinutesToReset(new Date());
        return _currentSnapshot;
      }

      // 2. Resolve via API (Atomic Lock)
      try {
        return Utils.executeSafely("WAR_INTEL_SYNC", () => {
          // Re-check cache inside lock to prevent race condition
          const doubleCheck = Utils.CacheHandler.getLarge(CACHE_KEY);
          if (doubleCheck) return (_currentSnapshot = JSON.parse(doubleCheck));

          const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
          const data = Utils.fetchRoyaleAPI([
            `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`
          ]);

          const payload = data && data[0] ? data[0] : null;
          const snapshot = synthesize(payload);

          Utils.CacheHandler.putLarge(CACHE_KEY, JSON.stringify(snapshot), CACHE_TTL);
          return (_currentSnapshot = snapshot);
        });
      } catch (e: any) {
        console.error(`War Intel Failure: ${e.message}`);
        return generateEstimate();
      }
    },

    /**
     * High-speed check for Trial Phase (Training Days)
     */
    isTrial: function(): boolean {
      return this.getSnapshot().protocol === "Trial Phase";
    }
  };

  /**
   * Translates raw RoyaleAPI telemetry into a validated WarSnapshot.
   */
  function synthesize(data: any): WarSnapshot {
    const now = new Date();
    const snapshot: WarSnapshot = {
      protocol: "Idle",
      week: 0,
      day: 0,
      progress: "Synchronized",
      isColosseum: false,
      isRaceFinished: false,
      isEstimated: false,
      minutesToReset: calculateMinutesToReset(now),
      timestamp: Utils.formatDate(now)
    };

    if (!data) return snapshot;

    // Handle Maintenance or Invalid States
    if (data.reason === "inMaintenance") {
      snapshot.protocol = "Maintenance Mode";
      return snapshot;
    }

    const pIdx = data.periodIndex; // Total days since start of season
    const sIdx = data.sectionIndex || 0; // Current Week (0-3)

    if (typeof pIdx === "undefined") {
      snapshot.protocol = "Seasonal Transition";
      return snapshot;
    }

    const dayInCycle = (pIdx % 7) + 1; // 1 (Mon) - 7 (Sun)
    snapshot.week = sIdx + 1;
    snapshot.day = dayInCycle;
    snapshot.isColosseum = sIdx >= 3;
    snapshot.isRaceFinished = data.state === "full";
    snapshot.progress = snapshot.isRaceFinished ? "Objectives Complete" : "Race Active";

    /**
     * ⚖️ LOGIC MATRIX: Trial vs Engagement
     * 1. If Colosseum Week (Week 4+) -> Always Engagement.
     * 2. If API state is 'war' or 'full' -> Engagement.
     * 3. If API state is 'training' -> Trial.
     * 4. Fallback: Days 1-3 (Mon-Wed) are Trial, Days 4-7 (Thu-Sun) are Engagement.
     */
    if (snapshot.isColosseum || data.state === "war" || data.state === "full") {
      snapshot.protocol = "Engagement Phase";
    } else if (data.state === "training") {
      snapshot.protocol = "Trial Phase";
    } else {
      snapshot.protocol = dayInCycle <= 3 ? "Trial Phase" : "Engagement Phase";
    }

    return snapshot;
  }

  /**
   * Fallback logic: Estimates war state based on the clock alone.
   * Used when API quota is empty or service is unreachable.
   */
  function generateEstimate(): WarSnapshot {
    const now = new Date();
    const utcDay = now.getUTCDay(); // 0 (Sun) - 6 (Sat)
    const utcHour = now.getUTCHours();

    // Adjust day based on 10:00 UTC Reset
    let effectiveDay = utcDay;
    if (utcHour < RESET_HOUR_UTC) {
        effectiveDay = utcDay === 0 ? 6 : utcDay - 1;
    }

    // Convert to 1 (Mon) - 7 (Sun)
    const dayNormalized = effectiveDay === 0 ? 7 : effectiveDay;

    return {
      protocol: dayNormalized <= 3 ? "Trial Phase" : "Engagement Phase",
      week: 0,
      day: dayNormalized,
      progress: "Temporal Estimation",
      isColosseum: false,
      isRaceFinished: false,
      isEstimated: true,
      minutesToReset: calculateMinutesToReset(now),
      timestamp: Utils.formatDate(now)
    };
  }

  function calculateMinutesToReset(now: Date): number {
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC, 0, 0));
    if (now.getTime() >= reset.getTime()) {
      reset.setUTCDate(reset.getUTCDate() + 1);
    }
    return Math.floor((reset.getTime() - now.getTime()) / 60000);
  }
})();
