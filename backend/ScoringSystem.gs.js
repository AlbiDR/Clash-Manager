/**
 * ============================================================================
 * 🧠 MODULE: SCORING SYSTEM (CORE ENGINE)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The mathematical heart of the application.
 * ⚙️ ROLE: Pure Logic. Accepts raw data -> Returns Scores & Sort Orders.
 * 🔒 STATUS: PROTECTED "DO NOT MODIFY" ZONE.
 * 🏷️ VERSION: 5.1.3
 * 
 * 🧠 REASONING:
 *    - Separation of Concerns: This file knows nothing about Sheets or APIs.
 *      It only knows Math.
 *    - Stability: Moving this to its own file prevents accidental deletion
 *      or modification when editing the Leaderboard UI code.
 * ============================================================================
 */

const VER_SCORING_SYSTEM = '5.1.3';

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
  calculateWarRate: function(warHistoryMap, daysTracked, currentWeekId, currentDayIndex) {
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
      const isTrainingDay = (currentDayIndex >= 1 && currentDayIndex <= 3);

      if (isTrainingDay) {
        weeksSinceJoin--;
      }
    }

    const denominator = Math.min(52, weeksSinceJoin);
    
    const rateVal = denominator > 0 ? Math.round((activeWars / denominator) * 100) : 0;
    return Math.min(100, rateVal);
  },

  /**
   * Calculates Raw Score and Final Performance Score (with Decay).
   * SCORING V6 UPDATE: Includes 'averageFame' to stabilize rank based on history.
   */
  computeScores: function(currentFame, averageFame, weeklyDonations, trophies, warRateVal, lastSeenDate, now) {
    const W = CONFIG.LEADERBOARD.WEIGHTS;
    const P = CONFIG.LEADERBOARD.PENALTIES;

    // 1. Raw Score Calculation
    // V6 Formula: Mixed weighting of Current Fame (Volatile) and Average Fame (Stable)
    const rawScore = (currentFame * W.FAME) + 
                     (averageFame * (W.AVG_FAME || 0)) +
                     (weeklyDonations * W.DONATION) + 
                     (trophies * W.TROPHY) + 
                     (warRateVal * (W.WAR_RATE || 0));

    // 2. Inactivity Decay Calculation
    const daysInactive = Math.max(0, (now - lastSeenDate) / (1000 * 60 * 60 * 24));
    let finalScore = rawScore;
    
    if (daysInactive > P.INACTIVITY_GRACE_DAYS) {
      const decayDays = daysInactive - P.INACTIVITY_GRACE_DAYS;
      const decayFactor = Math.pow(1 - P.DECAY_RATE, decayDays);
      finalScore = rawScore * decayFactor;
    }

    return {
      raw: Math.round(rawScore),
      perf: Math.round(finalScore)
    };
  },

  /**
   * The Holy Grail Sorting Comparator.
   * Priority: Perf > Raw > WarRate > TotalDon > Tenure(Asc) > Trophies
   */
  comparator: function(rowA, rowB) {
    const L = CONFIG.SCHEMA.LB;
    
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
  }
};
// 🔒 END PROTECTION ZONE ===================================================
