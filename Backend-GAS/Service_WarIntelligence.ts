/**
 * ⚔️ WAR INTELLIGENCE - CLASP EDITION
 * VERSION: 11.6.0 | Optimized for Agentic Quota
 */

/**
 * 🚀 ENTRY POINT: Triggerable by Apps Script
 * Returns or logs the current war state.
 */
function GetWarSnapshot(): any {
  return WarIntelligence.getSnapshot();
}

const WarIntelligence = (() => {
  const K = "W_SNAP_V11"; // Cache Key
  const TTL = 900;       // 15 Min Cache
  const RESET_H = 10;    // 10:00 UTC Reset

  return {
    getSnapshot() {
      // 1. Memory/Cache Handshake
      const cached = CacheService.getScriptCache().get(K);
      if (cached) return JSON.parse(cached);

      // 2. Atomic Execution
      // @ts-ignore
      return Utils.executeSafely("WAR_SYNC", () => {
        try {
          // @ts-ignore
          const tag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
          // @ts-ignore
          const res = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${tag}/currentriverrace`]);
          const snap = this.parse(res?.[0]);

          CacheService.getScriptCache().put(K, JSON.stringify(snap), TTL);
          return snap;
        } catch (e) {
          return this.fallback();
        }
      });
    },

    parse(d: any) {
      const now = new Date();
      const pIdx = d?.periodIndex;
      const sIdx = d?.sectionIndex || 0;
      
      // State Calculation Logic
      const isCol = sIdx >= 3;
      const day = (pIdx !== undefined) ? (pIdx % 7) + 1 : this.estDay(now);
      const isFinished = d?.state === "full";
      
      // Phase Logic: Training (Trial) vs War (Engagement)
      let phase: "Trial Phase" | "Engagement Phase" | "Idle" = "Idle";
      if (d?.reason === "inMaintenance") phase = "Idle";
      else if (isCol || d?.state === "war" || isFinished) phase = "Engagement Phase";
      else if (d?.state === "training") phase = "Trial Phase";
      else phase = day <= 3 ? "Trial Phase" : "Engagement Phase";

      return {
        protocol: phase,
        week: sIdx + 1,
        day: day,
        isColosseum: isCol,
        isRaceFinished: isFinished,
        minutesToReset: this.calcR(now),
        isEstimated: !d,
        timestamp: now.toISOString()
      };
    },

    estDay(n: Date) {
      const h = n.getUTCHours();
      const d = (h < RESET_H) ? (n.getUTCDay() === 0 ? 6 : n.getUTCDay() - 1) : n.getUTCDay();
      return d === 0 ? 7 : d;
    },

    calcR(n: Date) {
      const r = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), RESET_H, 0, 0));
      if (n.getTime() >= r.getTime()) r.setUTCDate(r.getUTCDate() + 1);
      return Math.floor((r.getTime() - n.getTime()) / 60000);
    },

    fallback() {
      const now = new Date();
      const d = this.estDay(now);
      return {
        protocol: d <= 3 ? "Trial Phase" : "Engagement Phase",
        week: 0, day: d, isColosseum: false, isRaceFinished: false,
        minutesToReset: this.calcR(now), isEstimated: true, timestamp: now.toISOString()
      };
    }
  };
})();