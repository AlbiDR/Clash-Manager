
/**
 * ============================================================================
 * ⚙️ MODULE: CORE (Execution Engine)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Low-level execution safety and primitive utilities.
 * ⚙️ CAPABILITIES:
 *    1. Mutex Locking: Script-wide atomic execution via LockService.
 *    2. Data Primitives: Pure helper functions (shuffleArray).
 *    3. Runtime Tracking: Execution metrics for performance monitoring.
 * 
 * 🛡️ ARCHITECTURE: 
 *    - Pure Service: Zero business logic dependencies.
 *    - Global Singleton 'Core'.
 * 
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

declare var LockService: GoogleAppsScript.Lock.LockService;
declare var SpreadsheetApp: any;
declare var module: any;

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const CORE_CONFIG = {
  /** Default lock timeout in milliseconds (30 seconds) */
  LOCK_TIMEOUT_MS: 30000,
};

/* ==========================================================================
   INTERFACES
   ========================================================================== */
export interface ICore {
  /**
   * Executes a callback within a script-wide mutex lock.
   * Prevents race conditions when multiple triggers fire simultaneously.
   * @param lockKey - Identifier for the lock (for logging/debugging)
   * @param callback - The function to execute atomically
   * @returns The return value of the callback
   * @throws Error if lock cannot be acquired within timeout
   */
  executeSafely<T>(lockKey: string, callback: () => T): T;

  /**
   * Fisher-Yates shuffle algorithm.
   * @param array - The array to shuffle (mutated in place)
   * @returns The shuffled array (same reference)
   */
  shuffleArray<T>(array: T[]): T[];

  /**
   * Runtime metrics for performance tracking.
   */
  runtime: {
    startTime: number;
    getElapsedMs(): number;
  };
}

/* ==========================================================================
   IMPLEMENTATION
   ========================================================================== */
const Core: ICore = {
  /**
   * 🔒 EXECUTE SAFELY (Mutex Lock)
   * Wraps any operation in a script-wide lock to prevent race conditions.
   */
  executeSafely<T>(lockKey: string, callback: () => T): T {
    // @ts-ignore
    if (typeof LockService === "undefined") {
      // Fallback for non-GAS environments (testing)
      return callback();
    }

    // @ts-ignore
    const lock = LockService.getScriptLock();
    try {
      const acquired = lock.tryLock(CORE_CONFIG.LOCK_TIMEOUT_MS);
      if (!acquired) {
        // Best-effort user notification
        try {
          // @ts-ignore
          if (typeof SpreadsheetApp !== "undefined") {
            SpreadsheetApp.getActiveSpreadsheet().toast(
              "System is busy. Please try again.",
              "⚠️ Locked",
            );
          }
        } catch (e) { /* Silently ignore notification failures */ }
        
        throw new Error(`Core: Lock timeout for '${lockKey}'`);
      }
      return callback();
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * 🔀 SHUFFLE ARRAY (Fisher-Yates)
   * Randomizes array order in O(n) time.
   */
  shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  /**
   * ⏱️ RUNTIME METRICS
   * Tracks execution time for performance monitoring.
   */
  runtime: {
    startTime: Date.now(),
    getElapsedMs(): number {
      return Date.now() - this.startTime;
    },
  },
};

/* ==========================================================================
   EXPORTS & GLOBAL BRIDGE
   ========================================================================== */
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Core;
}

(function(scope: any) {
  Object.assign(scope, { Core });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default Core;
