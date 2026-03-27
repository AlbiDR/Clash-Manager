// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { HubError } from "../types/HubTypes.js";

/**
 * ============================================================================
 * [MODULE] NETWORK (WORKER HUB EDITION)
 * ----------------------------------------------------------------------------
 * Handles Quota Guarding for the Render Worker's autonomous 5m Hub loops.
 * ============================================================================
 */

export class Network {
  private static _fetchCount: number = 0; // EPHEMERAL: intentionally resets on restart
  private static _lastResetDate: string = new Date().toISOString().slice(0, 10); // EPHEMERAL: intentionally resets on restart
  
  // Daily budget strictly for the autonomous worker daemon.
  // The global 20,000 threshold across all Royale API keys is shared,
  // but the worker gets a generous baseline since it operates at 5m intervals.
  // (12 requests/hour = 288 requests/day base, but scanning consumes more).
  private static readonly MAX_FETCH_DAILY_GUARD = 15000;

  /**
   * Initializes or resets the daily quota counter if a new day has started.
   */
  private static _checkReset(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this._lastResetDate !== today) {
      this._fetchCount = 0;
      this._lastResetDate = today;
    }
  }

  /**
   * Increments the internal quota counter.
   * @param count Number of requests to add.
   */
  static addQuotaUsage(count: number = 1): void {
    this._checkReset();
    this._fetchCount += count;
  }

  /**
   * Evaluates if the system has sufficient quota for the next batch of requests.
   * Must be called before any high-volume fetch operation.
   * 
   * @param expectedUsage The number of requests the next operation intends to make.
   * @throws {HubError} Throws a typed HubError if quota is insufficient.
   */
  static quotaCheck(expectedUsage: number = 1): void {
    this._checkReset();
    
    if (this._fetchCount + expectedUsage > this.MAX_FETCH_DAILY_GUARD) {
      console.error(`[Network] Quota Guard Tripped: Attempted ${expectedUsage}, Currently at ${this._fetchCount}/${this.MAX_FETCH_DAILY_GUARD}`);
      const err: HubError = {
        code: "ERR_QUOTA_EXHAUSTED",
        message: "Daily Developer API Quota exhausted for the Autonomous Hub.",
        layer: "WORKER_HUB"
      };
      throw err;
    }
  }

  /**
   * Returns current quota utilization stats.
   */
  static getQuotaStats() {
    this._checkReset();
    return {
      used: this._fetchCount,
      limit: this.MAX_FETCH_DAILY_GUARD,
      remaining: this.MAX_FETCH_DAILY_GUARD - this._fetchCount
    };
  }
}
