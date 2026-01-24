
/**
 * ============================================================================
 * 📡 MODULE: NETWORK (API Engine)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The "Foreign Affairs" minister. Handles all external data fetching.
 * ⚙️ CAPABILITIES:
 *    1. Smart Fetching: Key Rotation, Quota Tracking, Error Handling.
 *    2. Remote Delegation: Offloads tasks to external workers if configured.
 *    3. Caching: Persistent & In-Memory caching to minimize network calls.
 * 
 * 🛡️ ARCHITECTURE: 
 *    - Dependencies: Store (Keys/Quota), Core (Safety/Shuffle).
 *    - Interface: Pure Data Provider.
 * 
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";
import type { ScoringWeights } from "./SharedTypes";

declare var UrlFetchApp: GoogleAppsScript.URL_Fetch.UrlFetchApp;
declare var CacheService: GoogleAppsScript.Cache.CacheService;
declare var Utilities: GoogleAppsScript.Utilities.Utilities;
declare var module: any;

declare const CONFIG: AppConfig;
declare const Registry: IRegistry;

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const NETWORK_CONFIG = {
  MAX_FETCH_DAILY_GUARD: 18000, // Safety threshold for daily budget
  MAX_FETCH_PER_EXECUTION: 2000, 
  RETRY_MAX: 3,
  CACHE_TTL_LONG: 900,  // 15 mins for profile data
  CACHE_TTL_SHORT: 300, // 5 mins for race stats
  KEYS: {
    FETCH_STATE: "FETCH_STATE_V2",
    WORKER_HEALTH: "WORKER_HEALTH_CACHE",
  }
};

// 🧠 EXECUTION CACHE: Stores API responses for the duration of one script execution.
const _EXECUTION_CACHE = new Map<string, any>();
let _FETCH_COUNT = 0;

/* ==========================================================================
   INTERFACES
   ========================================================================== */
export interface INetwork {
  fetchRoyaleAPI(urls: string[], scoring?: ScoringWeights | null): any[];
  fetchClanDataSmart(cleanTag: string): ClanDataResult;
  fetchPublicJson(type: "members" | "warlog"): any[] | null;
  auditKeysRemote(keys: Array<{ name: string; value: string }>): Array<{ name: string; success: boolean; error?: string }> | null;
  scanTournamentsRemote(tourneyTags: string[], minTrophies: number, blacklistSet: Set<string> | string[], scoring?: ScoringWeights | null): any[];
  remoteWorkerHealthy(): boolean;
  getRemainingQuota(): number;
}

export interface ClanDataResult {
  members: { items: any[] } | null;
  race: { clan: any } | null;
  history: Record<string, Record<string, number>> | null;
  log: any | null;
}

/* ==========================================================================
   INTERNAL HELPERS
   ========================================================================== */
const NetworkInternal = {
  /**
   * Initializes or refreshes the fetch count from Store
   */
  initQuota() {
    if (_FETCH_COUNT > 0) return;
    try {
      const st = Registry.Services.Store.props.getJSON(NETWORK_CONFIG.KEYS.FETCH_STATE, {}) as {
        date?: string;
        count?: number;
      };
      const today = new Date().toISOString().slice(0, 10);
      if (st && st.date === today) {
        _FETCH_COUNT = Number(st.count || 0);
      } else {
        _FETCH_COUNT = 0;
      }
    } catch (e) {
      _FETCH_COUNT = 0;
    }
  },

  /**
   * Updates the quota usage in Store
   */
  updateQuota(count: number) {
    _FETCH_COUNT += count;
    try {
      const today = new Date().toISOString().slice(0, 10);
      Registry.Services.Store.props.setJSON(NETWORK_CONFIG.KEYS.FETCH_STATE, {
        date: today,
        count: _FETCH_COUNT,
      });
    } catch (e: any) {
      console.error(`Quota Update Failed: ${e.message}`);
    }
  },

  /**
   * Sends a remote fetch request
   */
  remoteFetch(chunkUrls: string[], keyPool: any[], scoring: any): any[] {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) throw new Error("No remote worker");

    const payload = {
      urls: chunkUrls,
      apiKeys: keyPool.map(k => k.value),
      scoring: scoring
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) {
      headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;
    }

    const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/fetch`, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      headers: headers
    });

    if (res.getResponseCode() !== 200) throw new Error(`Remote worker error ${res.getResponseCode()}`);
    
    const body = JSON.parse(res.getContentText());
    if (!body || !Array.isArray(body.results)) throw new Error("Invalid remote response");

    return body.results.map((r: any) => ({
      getResponseCode: () => r.code,
      getContentText: () => typeof r.content === "string" ? r.content : JSON.stringify(r.content)
    }));
  },

  /**
   * Generates a stable cache key
   */
  hashKey(str: string): string {
    return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str)).slice(0, 50);
  }
};

/* ==========================================================================
   PUBLIC API
   ========================================================================== */
var Network: INetwork = {
  
  /**
   * ⚡ ULTRA-OPTIMIZED FETCH ENGINE
   * Handles caching, deduplication, key rotation, and quota management.
   */
  fetchRoyaleAPI(urls: string[], scoring = null) {
    if (!urls || urls.length === 0) return [];

    // 1. Initialize Quota
    if (_FETCH_COUNT === 0) NetworkInternal.initQuota();

    // 2. Prepare Key Pool
    let keyPool = [...CONFIG.SYSTEM.API_KEYS];
    if (!keyPool || keyPool.length === 0) {
      console.error("❌ CRITICAL: No API Keys found.");
      return new Array(urls.length).fill(null);
    }

    // 3. Check Cache (Exec + Script Service) & Deduplicate
    const finalResults = new Array(urls.length).fill(null);
    const urlsToFetch: string[] = [];
    const urlIndices = new Map<string, number[]>();
    const scriptCache = CacheService.getScriptCache();

    urls.forEach((url, index) => {
      // Priority 1: In-memory Execution Cache
      if (_EXECUTION_CACHE.has(url)) {
        finalResults[index] = _EXECUTION_CACHE.get(url);
        return;
      }

      // Priority 2: Persistent Script Cache
      const cacheKey = NetworkInternal.hashKey(url);
      const cachedStr = scriptCache.get(cacheKey);
      if (cachedStr) {
          try {
              const json = JSON.parse(cachedStr);
              _EXECUTION_CACHE.set(url, json);
              finalResults[index] = json;
              return;
          } catch(e) {}
      }

      // Need fetch
      if (!urlIndices.has(url)) {
        urlIndices.set(url, []);
        urlsToFetch.push(url);
      }
      urlIndices.get(url)!.push(index);
    });

    if (urlsToFetch.length === 0) return finalResults;

    // 4. Check Quota Limits (Daily Guard)
    const remainingQuota = NETWORK_CONFIG.MAX_FETCH_DAILY_GUARD - _FETCH_COUNT;
    if (remainingQuota <= 0) {
        console.warn(`🛑 CRITICAL: Daily URLFetch budget exhausted (${_FETCH_COUNT}). Throttling all requests.`);
        return finalResults;
    }

    // Truncate if necessary (Safety First)
    const validUrls = urlsToFetch.slice(0, remainingQuota);
    NetworkInternal.updateQuota(validUrls.length);

    // 5. Execution Strategy
    let useRemote = !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();
    const BATCH_SIZE = 100;

    for (let c = 0; c < validUrls.length; c += BATCH_SIZE) {
      const chunk = validUrls.slice(c, c + BATCH_SIZE);
      const isHighVolume = chunk.length > 5;
      
      for (let attempt = 0; attempt < NETWORK_CONFIG.RETRY_MAX; attempt++) {
        if (keyPool.length === 0) break;

        const localRequests = chunk.map(u => {
          const keyObj = keyPool[Math.floor(Math.random() * keyPool.length)];
          return {
            url: u,
            method: "get" as const,
            headers: { Authorization: `Bearer ${keyObj.value}`, "User-Agent": "ClanManagerBot/Network (GAS)", "Accept-Encoding": "gzip" },
            muteHttpExceptions: true
          };
        });

        try {
          let responses: any[];

          // 🛡️ WORKER FIRST STRATEGY: High volume MUST go through worker if available
          if (useRemote) {
            try {
              responses = NetworkInternal.remoteFetch(chunk, keyPool, scoring);
            } catch (e: any) {
                console.warn(`[Network] Worker Failure: ${e.message}.`);
                if (isHighVolume) {
                   console.error(`[Network] High Volume Batch FAILED. Blocking local fallback for quota safety.`);
                   useRemote = false; // Mark for next execution context
                   break; // Abort chunk
                }
                useRemote = false; 
                continue; // Retry single items locally if allowed
            }
          } else {
            // Local fallback (only for low volume or critical paths)
            if (isHighVolume && attempt > 0) {
               console.warn(`[Network] Quota Guard: Blocking local retry for large batch.`);
               break; 
            }
            
            try {
              responses = UrlFetchApp.fetchAll(localRequests);
            } catch (e: any) {
              console.warn(`[Network] Batch failed: ${e.message}.`);
              if (isHighVolume) break; // Don't even try local retry for large batches
              Utilities.sleep(1500);
              responses = UrlFetchApp.fetchAll(localRequests); // Simple retry for small chunks
            }
          }

          let retryChunk = false;

          responses.forEach((r, i) => {
            const code = r.getResponseCode();
            const url = chunk[i];

            if (code === 200) {
              try {
                const text = r.getContentText();
                const json = JSON.parse(text);
                _EXECUTION_CACHE.set(url, json);
                
                // Persist to script cache (15 min for player data, shorter for logs)
                const ttl = url.includes("members") || url.includes("players") ? NETWORK_CONFIG.CACHE_TTL_LONG : NETWORK_CONFIG.CACHE_TTL_SHORT;
                scriptCache.put(NetworkInternal.hashKey(url), text, ttl);

                urlIndices.get(url)!.forEach(idx => finalResults[idx] = json);
              } catch (e) {}
            } else if (code === 404) {
              _EXECUTION_CACHE.set(url, null);
              urlIndices.get(url)!.forEach(idx => finalResults[idx] = null);
            } else if (code === 403 || code === 429) {
              if (!useRemote) {
                // Burn bad key locally
                const badKey = localRequests[i].headers["Authorization"].replace("Bearer ", "");
                keyPool = keyPool.filter(k => k.value !== badKey);
              }
              retryChunk = true;
            } else if (code >= 500) {
              retryChunk = true;
            }
          });

          if (!retryChunk) break;
          if (attempt < NETWORK_CONFIG.RETRY_MAX - 1) Utilities.sleep(1000 * (attempt + 1));

        } catch (e) {
           if (attempt < NETWORK_CONFIG.RETRY_MAX - 1) Utilities.sleep(2000);
        }
      }
      Utilities.sleep(200); // Friendly pause
    }

    return finalResults;
  },

  fetchClanDataSmart(cleanTag) {
    const cacheKey = `clan_full_${cleanTag.replace(/%/g, '_')}`;
    const scriptCache = CacheService.getScriptCache();
    
    // 🧠 15-MINUTE PERSISTENT CACHE (Quota Saver)
    const cachedStr = scriptCache.get(cacheKey);
    if (cachedStr) {
      try {
        return JSON.parse(cachedStr);
      } catch (e) {}
    }

    const useRemote = !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();

    if (useRemote) {
        try {
            const payload = {
                tag: decodeURIComponent(cleanTag),
                apiKeys: CONFIG.SYSTEM.API_KEYS.map(k => k.value)
            };
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

            const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/clan/full`, {
                method: "post",
                contentType: "application/json",
                payload: JSON.stringify(payload),
                muteHttpExceptions: true,
                headers: headers
            });

            if (res.getResponseCode() === 200) {
                const text = res.getContentText();
                const json = JSON.parse(text);
                const result = {
                    members: { items: json.members.items },
                    race: { clan: json.race.clan },
                    history: json.history,
                    log: null
                };
                // Cache for 15 mins (Quota optimization)
                scriptCache.put(cacheKey, JSON.stringify(result), NETWORK_CONFIG.CACHE_TTL_LONG);
                return result;
            }
        } catch(e) {}
    }

    // Local Fallback
    const urls = [
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${Date.now()}`
    ];

    const [members, race, log] = this.fetchRoyaleAPI(urls);
    return { members, race, history: null, log };
  },

  fetchPublicJson(type) {
    if (!this.remoteWorkerHealthy()) return null;
    try {
        const payload = {
            tag: CONFIG.SYSTEM.CLAN_TAG,
            type: type,
            apiKeys: CONFIG.SYSTEM.API_KEYS.map(k => k.value)
        };
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

        const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/clan/api`, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
            headers: headers
        });

        if (res.getResponseCode() === 200) {
            return JSON.parse(res.getContentText()).data;
        }
    } catch(e) {}
    return null;
  },

  remoteWorkerHealthy() {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) return false;
    
    // Check execution cache
    if (_EXECUTION_CACHE.has("worker_health")) return _EXECUTION_CACHE.get("worker_health");

    // Check Store cache
    const now = Date.now();
    try {
      if (typeof PropertiesService !== "undefined") {
        const cached = Registry.Services.Store.props.getJSON(
          NETWORK_CONFIG.KEYS.WORKER_HEALTH,
          null,
        ) as { status: boolean; time: number } | null;
        if (cached && now - cached.time < 300000) { // 5 min TTL
            _EXECUTION_CACHE.set("worker_health", cached.status);
            return cached.status;
        }
      }
    } catch(e) {}

    // Verify
    let isHealthy = false;
    try {
        const headers: Record<string, string> = {};
        if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;
        const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/capabilities`, {
            method: "get",
            muteHttpExceptions: true,
            headers: headers
        });
        if (res.getResponseCode() === 200) isHealthy = true;
    } catch(e) {}

    // Persist
    _EXECUTION_CACHE.set("worker_health", isHealthy);
    Registry.Services.Store.props.setJSON(NETWORK_CONFIG.KEYS.WORKER_HEALTH, {
      status: isHealthy,
      time: now,
    });
    
    return isHealthy;
  },

  auditKeysRemote(keys) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) return null;
    try {
        const payload = { apiKeys: keys.map(k => k.value) };
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

        const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/audit`, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
            headers: headers
        });

        if (res.getResponseCode() !== 200) return null;
        const json = JSON.parse(res.getContentText());
        if (!json.results) return null;

        return keys.map(k => {
            const r = json.results.find((x: any) => x.key === k.value);
            if (!r) return { name: k.name, success: false, error: "Skipped" };
            if (r.status === 200) return { name: k.name, success: true };
            
            let err = `Error ${r.status}`;
            if (r.status === 403) err = "⛔ Access Denied";
            if (r.status === 429) err = "⚠️ Throttled";
            return { name: k.name, success: false, error: err };
        });
    } catch(e) { return null; }
  },

  scanTournamentsRemote(tourneyTags, minTrophies, blacklistSet, scoring = null) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) throw new Error("Worker not configured");
    
    const blacklist = Array.isArray(blacklistSet) ? blacklistSet : Array.from(blacklistSet);
    const payload = {
        tags: tourneyTags,
        apiKeys: CONFIG.SYSTEM.API_KEYS.map(k => k.value),
        blacklist: blacklist,
        minTrophies,
        scoring
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

    const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/scan`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        headers: headers
    });

    if (res.getResponseCode() !== 200) throw new Error(`Worker Error ${res.getResponseCode()}`);
    return JSON.parse(res.getContentText()).candidates || [];
  },

  getRemainingQuota() {
    NetworkInternal.initQuota();
    return Math.max(0, NETWORK_CONFIG.MAX_FETCH_DAILY_GUARD - _FETCH_COUNT);
  }
};

/* ==========================================================================
   EXPORTS
   ========================================================================== */
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Network;
}

(function(scope: any) {
  Object.assign(scope, { Network });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default Network;
