/**
 * ============================================================================
 * 🧠 MODULE: SCORING SYSTEM (CORE ENGINE)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The mathematical heart of the application.
 * ⚙️ ROLE: Pure Logic. Accepts raw data -> Returns Scores & Sort Orders.
 * 🔒 STATUS: PROTECTED "DO NOT MODIFY" ZONE.
 * 🏷️ VERSION: 10.1.0
 *
 * 🧠 REASONING:
 *    - Separation of Concerns: This file knows nothing about Sheets or APIs.
 *      It only knows Math.
 *    - Stability: Moving this to its own file prevents accidental deletion
 *      or modification when editing the Leaderboard UI code.
 * ============================================================================
 */

const VER_SCORING_SYSTEM = "10.1.0";

// 🔒 =======================================================================
// 🔒 SCORING SYSTEM PROTECTION ZONE
// 🔒 DO NOT MODIFY THE CODE INSIDE THIS OBJECT WITHOUT EXPLICIT AUTHORIZATION.
// 🔒 This engine defines the mathematically proven scoring and sorting logic.
// 🔒 =======================================================================
const ScoringSystem = {
  /**
   * Calculates the War Participation Rate.
   * Logic: (Weeks with Fame > 0) / (Weeks Since Joining)
   *
   * HYBRID UPDATE (v5.1.2): "Time-Boxed Grace Period"
   * - Training Days (Mon, Tue, Wed): "Grace Logic". Fame is often impossible to get
   *   on these days. We must exclude the current week if they have 0 fame,
   *   otherwise everyone's rate drops unfairly.
   * - Battle Days (Thu, Fri, Sat, Sun): "Strict Logic". Fame is available.
   *   If they haven't attacked yet, it counts as a "Miss". This drops their
   *   War Rate (e.g., 98%), creating visual urgency.
   *
   * @param {number} currentDayIndex - ISO Day Number (1=Mon, 7=Sun) based on Clan Timezone.
   */
  calculateWarRate: function (
    warHistoryMap,
    daysTracked,
    currentWeekId,
    currentDayIndex,
  ) {
    let activeWars = 0;
    let hasCurrentParticipation = false;

    warHistoryMap.forEach((fame, weekId) => {
      if (fame > 0) {
        activeWars++;
        if (weekId === currentWeekId) hasCurrentParticipation = true;
      }
    });

    // Max denominator is 52 (log limit).
    // Math.ceil ensures partial weeks (e.g. 8 days = 2 weeks) count as full opportunity windows.
    let weeksSinceJoin = Math.max(1, Math.ceil(daysTracked / 7));

    // ⚡ HYBRID LOGIC:
    if (!hasCurrentParticipation && weeksSinceJoin > 1) {
      // TRAINING DAYS (Mon=1, Tue=2, Wed=3)
      // We apply Grace Period because Fame generation is usually disabled.
      // BATTLE DAYS (Thu=4, Fri=5, Sat=6, Sun=7)
      // We apply Strict Mode (Denominator stays high, Rate drops).
      const isTrainingDay = currentDayIndex >= 1 && currentDayIndex <= 3;

      if (isTrainingDay) {
        weeksSinceJoin--;
      }
    }

    const denominator = Math.min(52, weeksSinceJoin);

    const rateVal =
      denominator > 0 ? Math.round((activeWars / denominator) * 100) : 0;
    return Math.min(100, rateVal);
  },

  /**
   * Calculates Raw Score and Final Performance Score (with Decay).
   * SCORING V6 UPDATE: Includes 'averageFame' to stabilize rank based on history.
   */
  computeScores: function (
    currentFame,
    averageFame,
    weeklyDonations,
    trophies,
    warRateVal,
    lastSeenDate,
    now,
  ) {
    const W = (typeof CONFIG !== 'undefined' ? CONFIG.LEADERBOARD.WEIGHTS : { FAME: 3, AVG_FAME: 15, DONATION: 50, TROPHY: 0.0002, WAR_RATE: 150 });
    const P = (typeof CONFIG !== 'undefined' ? CONFIG.LEADERBOARD.PENALTIES : { INACTIVITY_GRACE_DAYS: 4, DECAY_RATE: 0.08 });

    // 1. Raw Score Calculation
    // V6 Formula: Mixed weighting of Current Fame (Volatile) and Average Fame (Stable)
    const rawScore =
      currentFame * W.FAME +
      averageFame * (W.AVG_FAME || 0) +
      weeklyDonations * W.DONATION +
      trophies * W.TROPHY +
      warRateVal * (W.WAR_RATE || 0);

    // 2. Inactivity Decay Calculation
    const daysInactive = Math.max(
      0,
      (now - lastSeenDate) / (1000 * 60 * 60 * 24),
    );
    let finalScore = rawScore;

    if (daysInactive > P.INACTIVITY_GRACE_DAYS) {
      const decayDays = daysInactive - P.INACTIVITY_GRACE_DAYS;
      const decayFactor = Math.pow(1 - P.DECAY_RATE, decayDays);
      finalScore = rawScore * decayFactor;
    }

    return {
      raw: Math.round(rawScore),
      perf: Math.round(finalScore),
    };
  },

  /**
   * The Holy Grail Sorting Comparator.
   * Priority: Perf > Raw > WarRate > TotalDon > Tenure(Asc) > Trophies
   */
  comparator: function (rowA, rowB) {
    const L = (typeof CONFIG !== 'undefined' ? CONFIG.SCHEMA.LB : { PERF_SCORE: 14, RAW_SCORE: 13, WAR_RATE: 10, TOTAL_DON: 8, DAYS: 5, TROPHIES: 4 });

    // 1. Performance Score (Current Status - Decayed)
    const diffPerf = rowB[L.PERF_SCORE] - rowA[L.PERF_SCORE];
    if (diffPerf !== 0) return diffPerf;

    // 2. Raw Score (Status before inactivity penalty)
    const diffRaw = rowB[L.RAW_SCORE] - rowA[L.RAW_SCORE];
    if (diffRaw !== 0) return diffRaw;

    // 3. War Rate (Reliability)
    // We parse the string "85%" back to number 85 for comparison
    const getWarVal = (r) => parseInt(r[L.WAR_RATE]) || 0;
    const diffWar = getWarVal(rowB) - getWarVal(rowA);
    if (diffWar !== 0) return diffWar;

    // 4. Total Donations (Lifetime contribution)
    const diffDon = rowB[L.TOTAL_DON] - rowA[L.TOTAL_DON];
    if (diffDon !== 0) return diffDon;

    // 5. Tenure (New Blood > Dead Wood)
    // For players with identical low scores, prefer the one with fewer days tracked.
    // This pushes inactive veterans (High Days, Low Score) to the bottom.
    const diffDays = rowA[L.DAYS] - rowB[L.DAYS]; // Ascending Order
    if (diffDays !== 0) return diffDays;

    // 6. Trophies (Last Resort)
    return rowB[L.TROPHIES] - rowA[L.TROPHIES];
  },

  /**
   * 🏗️ UNIFIED RAW SCORE (Recruit-Equivalent)
   * ----------------------------------------------------------------------------
   * WHY: This formula is the "Universal Yardstick". By using the exact same
   * math for both active Clan Members and found Recruits, we eliminate
   * environmental bias (e.g., tenure bonuses) and see who is truly better "on paper".
   *
   * @param {Object} weights - { TROPHY: number, DON: number, WAR: number }
   */
  calculateRecruitRawScore: function (
    trophies,
    totalDonations,
    warDayWins,
    hasRecentWar,
    weights
  ) {
    const W = weights || { TROPHY: 1.0, DON: 0.07, WAR: 20.0 };
    const warBonus = hasRecentWar ? 500 : 0;
    const totalWarScore = (warDayWins || 0) + warBonus;

    return Math.round(
      (trophies || 0) * W.TROPHY +
        (totalDonations || 0) * W.DON +
        totalWarScore * W.WAR,
    );
  },

  /**
   * ⚖️ HYBRID BENCHMARK CALCULATOR (V7)
   * ----------------------------------------------------------------------------
   * WHY: Prevents "Benchmark Hijacking". In V6, discovery of a single Global
   * Top 50 player would crush the scores of all other recruits.
   *
   * REASONING (40/60 Split): We lean 60% towards the External Pool because
   * Clan members naturally accrue higher scores due to consistent War access
   * (the +500 bonus). Weighting the Pool higher ensures the benchmark is
   * aspirational and fair to recruits who lack daily War opportunity.
   *
   * HOW:
   * 1. Clan Side: Pulls members with Perf > 50 (Our "Trusted Elite").
   * 2. Pool Side: Pulls Top 5% of Blacklisted "Elite Recruits" (The "Market Standard").
   * 3. Result: If we find a God-tier player, they score >100%, but don't
   *    make a Great recruit (90%) look like a Poor recruit (40%).
   */
  calculateHybridBenchmark: function (clanScoredList, blacklistScoredList) {
    // 1. CLAN BASELINE (Performance Score >= 50)
    const clanPool = (clanScoredList || []).filter((c) => c.perfScore >= 50);
    const avgClanRef =
      clanPool.length > 0
        ? clanPool.reduce((a, b) => a + b.rawScore, 0) / clanPool.length
        : 0;

    // 2. DISCOVERY BASELINE (Top 5% of Blacklist, Min 3)
    const pool = [...(blacklistScoredList || [])].sort(
      (a, b) => b.rawScore - a.rawScore,
    );
    const poolSize = Math.max(
      3, // Min pool size
      Math.ceil(pool.length * 0.05), // Top 5%
    );
    const topPool = pool.slice(0, poolSize);
    const avgPoolRef =
      topPool.length > 0
        ? topPool.reduce((a, b) => a + b.rawScore, 0) / topPool.length
        : 0;

    // 3. HYBRID MERGE (40/60 Split)
    // Failsafe: If one side is empty, use the other 100%
    let finalBenchmark = 1;
    if (avgClanRef > 0 && avgPoolRef > 0) {
      finalBenchmark = avgClanRef * 0.4 + avgPoolRef * 0.6;
    } else if (avgClanRef > 0) {
      finalBenchmark = avgClanRef;
    } else if (avgPoolRef > 0) {
      finalBenchmark = avgPoolRef;
    }

    // Logger only available in GAS
    if (typeof console !== 'undefined' && console.log) {
        console.log(
        `⚖️ Hybrid Benchmark: Clan(Avg:${Math.round(avgClanRef)}) + Pool(Avg:${Math.round(avgPoolRef)}) = Result:${Math.round(finalBenchmark)}`,
        );
    }

    return Math.max(1, finalBenchmark);
  },

  /**
   * 🎯 POTENTIAL SCORE CALCULATOR
   * ----------------------------------------------------------------------------
   * WHY: Enforces a structural cap at 100%. Even if a recruit is "Better than
   * the Benchmark", we display 100% to keep the UI clean and the mental model
   * of "Performance vs Gold Standard" intuitive.
   *
   * @param {number} rawScore - The calculated yardstick score.
   * @param {number} benchmark - The hybrid pivot point.
   */
  calculatePotentialScore: function (rawScore, benchmark) {
    if (!benchmark || benchmark <= 0) return 0;
    const score = Math.round((rawScore / benchmark) * 100);
    return Math.min(100, score);
  },
};

// 🌍 NODE.JS COMPATIBILITY
// Allows this file to be 'required' in the Node Worker without breaking GAS.
if (typeof module !== "undefined" && module.exports) {
  module.exports = ScoringSystem;
}
// 🔒 END PROTECTION ZONE ===================================================
