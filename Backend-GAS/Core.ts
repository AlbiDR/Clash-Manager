
/**
 * ============================================================================
 * MODULE: CORE (Execution Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Low-level execution safety and primitive utilities.
 * CAPABILITIES:
 *    1. Mutex Locking: Script-wide atomic execution via LockService.
 *    2. Data Primitives: Pure helper functions (shuffleArray).
 *    3. Runtime Tracking: Execution metrics for performance monitoring.
 * 
 * ARCHITECTURE: 
 *    - Pure Service: Zero business logic dependencies.
 *    - Global Singleton 'Core'.
 * 
 *  VERSION: 13.1.0
 * ============================================================================
 */

// Global Version Constant
// HARDEN: Unified versioning prevents false-negative health check failures.
const VER_UTILITIES = "13.1.0";

declare var LockService: any;
declare var SpreadsheetApp: any;
declare var module: any;

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const CORE_CONFIG = {
  /** Default lock timeout in milliseconds (30 seconds) */
  LOCK_TIMEOUT_MS: 60000,
};

/* ==========================================================================
   INTERFACES
   ========================================================================== */
export interface CoreContract {
  /**
   * Executes a callback within a script-wide mutex lock.
   * Prevents race conditions when multiple triggers fire simultaneously.
   * @param context - Identifier for the lock (for logging/debugging)
   * @param operation - The function to execute atomically
   * @returns The return value of the callback
   * @throws Error if lock cannot be acquired within timeout
   */
  executeSafely<T>(context: string, operation: () => T): T;

  /**
   * Fisher-Yates shuffle algorithm.
   * @param array - The array to shuffle (mutated in place)
   * @returns The shuffled array (same reference)
   */
  shuffleArray<T>(array: T[]): T[];

  /**
   * Parses a war history string into a Map of player names to scores.
   * @param histStr - The war history string, e.g., "Player1:10,Player2:5"
   * @returns A Map where keys are player names and values are their scores.
   */
  parseWarHistory(histStr: string | null | undefined): Map<string, number>;

  /**
   * Resolves a property from an object using a list of priority keys.
   * @param obj - The object to search within.
   * @param priorityKeys - An array of keys to try in order of preference.
   * @param fallback - An optional fallback value if no key is found.
   * @returns The value of the first found property, or the fallback if none.
   */
  resolveProperty(obj: any, priorityKeys: string[], fallback?: any): any;

  /**
   * Creates a deep copy of an object or array.
   * @param obj - The item to clone.
   */
  deepClone<T>(obj: T): T;

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
var Core: CoreContract = {
  /**
   * EXECUTE SAFELY (Mutex Lock)
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
              "Locked",
            );
          }
        } catch (e: any) { /* Silently ignore notification failures */ }
        
        throw new Error(`Core: Lock timeout for '${lockKey}'`);
      }
      return callback();
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * SHUFFLE ARRAY (Fisher-Yates)
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
   * RUNTIME METRICS
   * Tracks execution time for performance monitoring.
   */
  runtime: {
    startTime: Date.now(),
    getElapsedMs(): number {
      return Date.now() - this.startTime;
    },
  },

  parseWarHistory(histStr: string | null | undefined): Map<string, number> {
    if (!histStr || histStr === "-" || typeof histStr !== "string")
      return new Map<string, number>();
    
    const historyMap = new Map<string, number>();
    // Resilience: Support both " | " (standard) and "," (GAS auto-format)
    const entries = histStr.split(/[|,]/);
    
    entries.forEach((entry) => {
      const cleanEntry = entry.trim();
      if (!cleanEntry) return;
      
      const parts = cleanEntry.split(/\s+/);
      // Valid entry format: "fame weekId" (e.g., "1200 24W12")
      if (parts.length >= 2) {
        const fame = Number(parts[0]);
        const weekId = parts[1]!;
        if (!isNaN(fame) && weekId) {
          historyMap.set(weekId, fame);
        }
      }
    });
    return historyMap;
  },

  resolveProperty(obj: any, priorityKeys: string[], fallback: any = 0): any {
    if (!obj || typeof obj !== "object") return fallback;
    for (const key of priorityKeys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return fallback;
  },

  deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item)) as unknown as T;
    }
    const copy = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        copy[key] = this.deepClone(obj[key]);
      }
    }
    return copy;
  }
};

/* ==========================================================================
   EXPORTS & GLOBAL BRIDGE
   ========================================================================== */
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Core;
}

(function(scope: any) {
  Object.assign(scope, { Core, VER_UTILITIES });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default Core;