
export const WAR_CONSTANTS = {
  MAX_FAME: 3200,
  WIN_THRESHOLD: 2000,
  STREAK_BONUS: 160
}

const PREDICTION_WEIGHTS: Record<number, number[]> = {
  1: [1.0],
  2: [0.70, 0.30],
  3: [0.60, 0.30, 0.10],
  4: [0.50, 0.25, 0.15, 0.10],
  5: [0.40, 0.25, 0.15, 0.12, 0.08]
}

/**
 * Calculates the projected next fame score based on weighted history and streaks.
 * @param fameHistory Array of fame scores sorted from Newest to Oldest.
 */
export function calculatePrediction(fameHistory: number[]): number {
  const n = fameHistory.length
  if (n === 0) return 0

  // 1. Dynamic Weighting
  const lookbackCount = Math.min(n, 5)
  const ratios = PREDICTION_WEIGHTS[lookbackCount] || [1.0]
  
  let projection = 0
  
  for (let i = 0; i < ratios.length; i++) {
    // Safety check in case history is shorter than ratio set (though lookbackCount handles this)
    if (fameHistory[i] !== undefined) {
      projection += fameHistory[i] * ratios[i]
    }
  }

  // 2. Streak Bonus (Form Modifier)
  // Checks the 3 most recent wars (indices 0, 1, 2)
  if (n >= 3) {
    if (
      fameHistory[0] > WAR_CONSTANTS.WIN_THRESHOLD && 
      fameHistory[1] > WAR_CONSTANTS.WIN_THRESHOLD && 
      fameHistory[2] > WAR_CONSTANTS.WIN_THRESHOLD
    ) {
      projection += WAR_CONSTANTS.STREAK_BONUS
    }
  }

  // 3. Clamp Result
  return Math.max(0, Math.min(WAR_CONSTANTS.MAX_FAME, projection))
}
