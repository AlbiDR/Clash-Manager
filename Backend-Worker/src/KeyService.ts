/**
 * KEY MANAGEMENT ENGINE
 *
 * @remarks
 * Orchestrates a pool of Royale API keys to ensure maximum throughput and
 * resiliency against rate-limiting (429) and authorization failures (403).
 * Implements a rotation strategy with intelligent cooldown penalties.
 */

export interface KeyState {
  isHealthy: boolean;
  cooldownUntil: number;
  failureCount: number;
}

export class KeyService {
  private keyMap: Map<string, KeyState> = new Map(); // EPHEMERAL: intentionally resets on restart

  /**
   * Initializes the service with a raw list of API tokens.
   */
  constructor(rawKeys: string[] = []) {
    rawKeys.filter(Boolean).forEach((keyString) => {
      // THREAT: Duplicate keys in configuration could bypass rate-limit cooldowns.
      // Target A [2]: Utilizing a Map ensures that each unique token has exactly
      // one health and cooldown state, closing the "Silent Failure" risk where
      // duplicate keys could be used while others are in cooldown.
      if (!this.keyMap.has(keyString)) {
        this.keyMap.set(keyString, {
          isHealthy: true,
          cooldownUntil: 0,
          failureCount: 0,
        });
      }
    });
  }

  /**
   * Selects a random healthy key from the pool.
   *
   * @returns A valid API key string or null if all keys are in cooldown.
   */
  public getHealthyKey(): string | null {
    const now = Date.now();
    const healthyKeys: string[] = [];

    for (const [keyVal, state] of this.keyMap.entries()) {
      if (state.isHealthy || now > state.cooldownUntil) {
        healthyKeys.push(keyVal);
      }
    }

    if (healthyKeys.length === 0) return null;

    const selectedKeyVal = healthyKeys[Math.floor(Math.random() * healthyKeys.length)];
    if (!selectedKeyVal) return null;

    const state = this.keyMap.get(selectedKeyVal);
    if (state) {
      state.isHealthy = true; // Mark as healthy if it passed the cooldown check
    }

    return selectedKeyVal;
  }

  /**
   * Logs a failure for a specific key and applies the appropriate cooldown penalty.
   *
   * @param keyVal - The API token that failed.
   * @param code - The HTTP status code returned by the upstream API.
   */
  public reportFailure(keyVal: string, code: number): void {
    const state = this.keyMap.get(keyVal);
    if (!state) return;

    if (code === 429) {
      // THROTTLED: Sidelined for 60s
      // Rationale: A 429 indicates we've hit the per-key rate limit.
      // A 60s cooldown allows the upstream bucket to reset safely.
      state.isHealthy = false;
      state.cooldownUntil = Date.now() + 60000;
      console.warn(`[KeyService] Key throttled (429). Sidelined for 60s.`);
    } else if (code === 403) {
      // BANNED/INVALID: Sidelined for 1 hour
      // Rationale: A 403 usually means the key's IP restriction or
      // validity has changed. A long cooldown prevents "banging" on
      // a broken key, which could lead to a permanent developer ban.
      state.isHealthy = false;
      state.cooldownUntil = Date.now() + 3600000;
      console.error(`[KeyService] Key rejected (403). Sidelined for 1 hour.`);
    } else {
      state.failureCount++;
      if (state.failureCount >= 5) {
        // Jitter Penalty: 30s
        // Rationale: For generic failures (5xx, timeouts), we apply
        // a short penalty after multiple consecutive errors to
        // dampen the impact of transient upstream instability.
        state.isHealthy = false;
        state.cooldownUntil = Date.now() + 30000;
        state.failureCount = 0;
      }
    }
  }

  /**
   * Resets the failure state for a key upon a successful request.
   */
  public reportSuccess(keyVal: string): void {
    const state = this.keyMap.get(keyVal);
    if (state) {
      state.isHealthy = true;
      state.failureCount = 0;
    }
  }

  /**
   * Returns current metrics for the key pool.
   */
  public getPoolStats() {
    const now = Date.now();
    let total = 0;
    let available = 0;
    let throttled = 0;

    for (const state of this.keyMap.values()) {
      total++;
      if (state.isHealthy || now > state.cooldownUntil) {
        available++;
      } else {
        throttled++;
      }
    }

    return { total, available, throttled };
  }
}
