
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
declare var Utilities: GoogleAppsScript.Utilities.Utilities;
declare var module: any;

declare const CONFIG: AppConfig;
declare const Registry: IRegistry;

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const NETWORK_CONFIG = {
  MAX_FETCH_PER_EXECUTION: 100000,
  RETRY_MAX: 3,
  CACHE_TTL_SHORT: 900, // 15 mins
  KEYS: {
    FETCH_STATE: "FETCH_STATE",
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

    // 3. Check Cache & Deduplicate
    const finalResults = new Array(urls.length).fill(null);
    const urlsToFetch: string[] = [];
    const urlIndices = new Map<string, number[]>();

    urls.forEach((url, index) => {
      if (_EXECUTION_CACHE.has(url)) {
        finalResults[index] = _EXECUTION_CACHE.get(url);
      } else {
        if (!urlIndices.has(url)) {
          urlIndices.set(url, []);
          urlsToFetch.push(url);
        }
        urlIndices.get(url)!.push(index);
      }
    });

    if (urlsToFetch.length === 0) return finalResults;

    // 4. Check Quota Limits
    const remainingQuota = NETWORK_CONFIG.MAX_FETCH_PER_EXECUTION - _FETCH_COUNT;
    if (remainingQuota <= 0) {
        console.warn(`⚠️ API Budget Exceeded (${_FETCH_COUNT})`);
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
      
      for (let attempt = 0; attempt < NETWORK_CONFIG.RETRY_MAX; attempt++) {
        if (keyPool.length === 0) break;

        // Local Request Construction
        const requests = chunk.map(u => {
          const keyObj = keyPool[Math.floor(Math.random() * keyPool.length)];
          return {
            url: u,
            method: "get" as const,
            headers: {
              Authorization: `Bearer ${keyObj.value}`,
              "User-Agent": "ClanManagerBot/Network (GAS)",
              "Accept-Encoding": "gzip"
            },
            muteHttpExceptions: true
          };
        });

        try {
          let responses: any[];

          if (useRemote) {
            try {
              responses = NetworkInternal.remoteFetch(chunk, keyPool, scoring);
            } catch (e) {
              useRemote = false; // Fallback to local
              continue; // Retry as local immediately
            }
          } else {
            let localResponses: any[] = [];
            try {
              localResponses = UrlFetchApp.fetchAll(requests);
            } catch (e: any) {
              console.warn(`[Network] Batch failed: ${e.message}. Retrying...`);
              Utilities.sleep(1500);
              try {
                localResponses = UrlFetchApp.fetchAll(requests);
              } catch (e2) {
                console.error("[Network] Retry failed.");
                // If retry fails, treat all items in this chunk as failed
                localResponses = chunk.map(() => ({ getResponseCode: () => 500, getContentText: () => "" }));
              }
            }
            responses = localResponses;
          }

          let retryChunk = false;

          responses.forEach((r, i) => {
            const code = r.getResponseCode();
            const url = chunk[i];

            if (code === 200) {
              try {
                const json = JSON.parse(r.getContentText());
                _EXECUTION_CACHE.set(url, json);
                urlIndices.get(url)!.forEach(idx => finalResults[idx] = json);
              } catch (e) {}
            } else if (code === 404) {
              _EXECUTION_CACHE.set(url, null);
              urlIndices.get(url)!.forEach(idx => finalResults[idx] = null);
            } else if (code === 403 || code === 429) {
              if (!useRemote) {
                // Burn bad key locally
                const badKey = requests[i].headers["Authorization"].replace("Bearer ", "");
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
                const json = JSON.parse(res.getContentText());
                return {
                    members: { items: json.members.items },
                    race: { clan: json.race.clan },
                    history: json.history,
                    log: null
                };
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
