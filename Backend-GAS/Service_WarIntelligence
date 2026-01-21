/**
 * ============================================================================
 * ⚔️ MODULE: SERVICE_WAR_INTELLIGENCE
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: authoritative engine for Clan War state interpretation.
 * ⚙️ ROLE: Domain Service (Telemetry Analysis & State Management)
 * 🏷️ VERSION: 11.3.0
 * ============================================================================
 */

/**
 * @typedef {Object} WarSnapshot
 * @property {string} protocol - The active engagement mode (Trial vs Engagement).
 * @property {number} week - The current week of the season (1-4).
 * @property {number} day - The current day of the war cycle (1-7).
 * @property {string} progress - Narrative description of mission status.
 * @property {boolean} isColosseum - Flag for final-week regulations.
 * @property {boolean} isRaceFinished - Flag for goal completion (Full state).
 * @property {boolean} isEstimated - Flag indicating a clock-based fallback.
 * @property {number} minutesToReset - Delta until global 10:00 UTC rollover.
 * @property {string} timestamp - ISO-compliant localized reference time.
 */

/**
 * ENTRY POINT: WarSnapshot
 * Produces a high-level summary of the global war state and operational phase.
 */
function WarSnapshot() {
  const intel = WarIntelligence.getSnapshot();
  const h = Math.floor(intel.minutesToReset / 60);
  const m = intel.minutesToReset % 60;
  
  console.log("CLAN WAR OPERATIONS: INTELLIGENCE BRIEFING");
  console.log("Current Protocol:  " + intel.protocol);
  if (intel.week > 0) console.log("Cycle Chronology:  Week " + intel.week + ", Day " + intel.day);
  console.log("Mission Progress:  " + intel.progress);
  
  if (!isNaN(h)) {
    console.log("Phase Transition:  The next cycle is scheduled to begin in " + h + " hours and " + m + " minutes.");
  }

  if (intel.isColosseum)   console.log("Operational Note:  Colosseum engagement regulations are currently active.");
  if (intel.isRaceFinished) console.log("Operational Note:  Primary course objectives have been finalized.");
  if (intel.isEstimated)    console.log("Operational Note:  Displaying temporal calculation due to system concurrency.");

  console.log("Report Reference:  " + intel.timestamp);
}

/**
 * @namespace WarIntelligence
 * @description Core service for interpreting and caching global River Race states.
 */
var WarIntelligence = (function() {

  /** @private @const {string} */
  var ATOMIC_CACHE_KEY = "WAR_INTEL_STATE_V11";
  /** @private @const {number} */
  var CACHE_DURATION   = 600; 
  /** @private @const {number} */
  var WAR_RESET_UTC    = 10;
  /** @private @const {Object} */
  var PHASE = { TRIAL: "Trial Phase", ENGAGE: "Engagement Phase" };
  
  /** @private @var {WarSnapshot|null} RAM cache for single-execution memoization */
  var _executionCache = null;

  return {
    /**
     * Resolves the current war phase and metadata with a non-blocking architecture.
     * @returns {WarSnapshot} Intelligence Snapshot including protocol, chronology, and progress.
     */
    getSnapshot: function() {
      if (_executionCache) return _executionCache;

      try {
        var cached = Utils.CacheHandler.getLarge(ATOMIC_CACHE_KEY);
        if (cached) {
          _executionCache = JSON.parse(cached);
          _executionCache.minutesToReset = calculateMinutesToReset(new Date());
          return _executionCache;
        }
      } catch (e) {
        console.warn("Telemetry cache currently unavailable.");
      }

      try {
        return Utils.executeSafely("WAR_INTEL_RESOLUTION", function() {
          var reCheck = Utils.CacheHandler.getLarge(ATOMIC_CACHE_KEY);
          if (reCheck) return (_executionCache = JSON.parse(reCheck));

          var clanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
          var url = CONFIG.SYSTEM.API_BASE + "/clans/" + clanTag + "/currentriverrace";
          
          var stream = Utils.fetchRoyaleAPI([url]);
          var payload = (stream && stream.length > 0) ? stream[0] : null;

          _executionCache = synthesize(payload);

          Utils.CacheHandler.putLarge(ATOMIC_CACHE_KEY, JSON.stringify(_executionCache), CACHE_DURATION);
          return _executionCache;
        });
      } catch (e) {
        return (_executionCache = generateTemporalEstimate());
      }
    },

    /**
     * Boolean helper for Trial Phase detection.
     * @returns {boolean}
     */
    isTrial: function() {
      return this.getSnapshot().protocol === PHASE.TRIAL;
    }
  };

  /**
   * Transforms raw API telemetry into a synthesized Intelligence object.
   * @param {Object} data - Raw River Race telemetry.
   * @returns {WarSnapshot}
   * @private
   */
  function synthesize(data) {
    var now = new Date();
    var intel = {
      protocol: "Idle", week: 0, day: 0, progress: "Synchronized",
      isColosseum: false, isRaceFinished: false, isEstimated: false,
      minutesToReset: calculateMinutesToReset(now),
      timestamp: Utilities.formatDate(now, CONFIG.SYSTEM.TIMEZONE, "yyyy-MM-dd HH:mm:ss")
    };

    if (!data) return intel;
    if (data.reason === "inMaintenance") return (intel.protocol = "Maintenance Mode", intel);
    if (data.reason === "notFound" || data.state === "ended") return (intel.protocol = "Seasonal Transition", intel);

    var pIdx = data.periodIndex, sIdx = data.sectionIndex || 0;
    if (pIdx === undefined) return (intel.progress = "Awaiting Telemetry", intel);

    var dayInCycle = pIdx % 7;
    intel.week = sIdx + 1; 
    intel.day = dayInCycle + 1;
    intel.isColosseum = (sIdx >= 3);
    intel.isRaceFinished = (data.state === "full");
    intel.progress = intel.isRaceFinished ? "Mission Objectives Achieved" : "Engagement In Progress";

    // DECISION MATRIX
    if (intel.isColosseum || data.state === "war") intel.protocol = PHASE.ENGAGE;
    else if (data.state === "training") intel.protocol = PHASE.TRIAL;
    else intel.protocol = (dayInCycle < 3) ? PHASE.TRIAL : PHASE.ENGAGE;

    return intel;
  }

  /**
   * Calculates minute-delta until the 10:00 UTC reset.
   * @param {Date} now
   * @returns {number}
   * @private
   */
  function calculateMinutesToReset(now) {
    var reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), WAR_RESET_UTC, 0, 0));
    if (now >= reset) reset.setUTCDate(reset.getUTCDate() + 1);
    return Math.floor((reset.getTime() - now.getTime()) / 60000);
  }

  /**
   * Generates a Temporal Estimation when API/Locks are unavailable.
   * @returns {WarSnapshot}
   * @private
   */
  function generateTemporalEstimate() {
    var now = new Date();
    var utcDay = now.getUTCDay(), utcHour = now.getUTCHours();
    var effectiveDay = (utcHour < WAR_RESET_UTC) ? (utcDay === 0 ? 6 : utcDay - 1) : utcDay;
    
    return {
      protocol: (effectiveDay >= 1 && effectiveDay <= 3) ? PHASE.TRIAL : PHASE.ENGAGE,
      progress: "Temporal Estimation", week: 0, day: effectiveDay,
      isColosseum: false, isRaceFinished: false, isEstimated: true,
      minutesToReset: calculateMinutesToReset(now),
      timestamp: Utilities.formatDate(now, CONFIG.SYSTEM.TIMEZONE, "yyyy-MM-dd HH:mm:ss")
    };
  }

})();
