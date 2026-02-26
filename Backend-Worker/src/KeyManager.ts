/**
 * KEY MANAGEMENT ENGINE
 *
 * @remarks
 * Orchestrates a pool of Royale API keys to ensure maximum throughput and
 * resiliency against rate-limiting (429) and authorization failures (403).
 * Implements a rotation strategy with intelligent cooldown penalties.
 */

export interface KeyState {
  value: string;
  isHealthy: boolean;
  cooldownUntil: number;
  failureCount: number;
}

export class KeyManager {
  private keys: KeyState[] = []; // EPHEMERAL: intentionally resets on restart

  /**
   * Initializes the manager with a raw list of API tokens.
   */
  constructor(rawKeys: string[] = []) {
    this.keys = rawKeys
      .filter(Boolean)
      .map((k) => ({
        value: k,
        isHealthy: true,
        cooldownUntil: 0,
        failureCount: 0,
      }));
  }

  /**
   * Selects a random healthy key from the pool.
   *
   * @returns A valid API key string or null if all keys are in cooldown.
   */
  public getHealthyKey(): string | null {
    const now = Date.now();
    const healthy = this.keys.filter(
      (k) => k.isHealthy || now > k.cooldownUntil,
    );
    if (healthy.length === 0) return null;

    const key = healthy[Math.floor(Math.random() * healthy.length)];
    if (!key) return null;

    key.isHealthy = true; // Mark as healthy if it passed the cooldown check
    return key.value;
  }

  /**
   * Logs a failure for a specific key and applies the appropriate cooldown penalty.
   *
   * @param keyVal - The API token that failed.
   * @param code - The HTTP status code returned by the upstream API.
   */
  public reportFailure(keyVal: string, code: number): void {
    const key = this.keys.find((k) => k.value === keyVal);
    if (!key) return;

    if (code === 429) {
      // THROTTLED: Sidelined for 60s
      // Rationale: A 429 indicates we've hit the per-key rate limit.
      // A 60s cooldown allows the upstream bucket to reset safely.
      key.isHealthy = false;
      key.cooldownUntil = Date.now() + 60000;
      console.warn(`[KeyManager] Key throttled (429). Sidelined for 60s.`);
    } else if (code === 403) {
      // BANNED/INVALID: Sidelined for 1 hour
      // Rationale: A 403 usually means the key's IP restriction or
      // validity has changed. A long cooldown prevents "banging" on
      // a broken key, which could lead to a permanent developer ban.
      key.isHealthy = false;
      key.cooldownUntil = Date.now() + 3600000;
      console.error(`[KeyManager] Key rejected (403). Sidelined for 1 hour.`);
    } else {
      key.failureCount++;
      if (key.failureCount >= 5) {
        // Jitter Penalty: 30s
        // Rationale: For generic failures (5xx, timeouts), we apply
        // a short penalty after multiple consecutive errors to
        // dampen the impact of transient upstream instability.
        key.isHealthy = false;
        key.cooldownUntil = Date.now() + 30000;
        key.failureCount = 0;
      }
    }
  }

  /**
   * Resets the failure state for a key upon a successful request.
   */
  public reportSuccess(keyVal: string): void {
    const key = this.keys.find((k) => k.value === keyVal);
    if (key) {
      key.isHealthy = true;
      key.failureCount = 0;
    }
  }

  /**
   * Returns current metrics for the key pool.
   */
  public getPoolStats() {
    const now = Date.now();
    return {
      total: this.keys.length,
      available: this.keys.filter((k) => k.isHealthy || now > k.cooldownUntil)
        .length,
      throttled: this.keys.filter((k) => !k.isHealthy && now <= k.cooldownUntil)
        .length,
    };
  }
}
