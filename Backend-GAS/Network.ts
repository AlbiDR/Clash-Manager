// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * MODULE: NETWORK (API ENGINE)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The central orchestration layer for all external data
 * acquisition. Manages the lifecycle of API requests, quota preservation,
 * and distributed execution via remote workers.
 * 
 * ARCHITECTURE:
 *    - Multi-Tier Caching: In-memory (L1) and CacheService (L2).
 *    - Intelligent Delegation: Offloads high-concurrency tasks to Cloud Run.
 *    - Quota Guard: Hard limits on UrlFetchApp usage to prevent script failure.
 * 
 */

// Global Version Constant
// @ts-ignore
export const VER_NETWORK = "1.1.0";
import type { AppConfig } from "./Configuration";
import type { RegistryContract } from "./Registry";
import type { ScoringWeights } from "./Shared_Types";

declare var UrlFetchApp: any;
declare var CacheService: any;
declare var Utilities: any;
declare var PropertiesService: any;
declare var module: any;

declare const CONFIG: AppConfig;
declare const Registry: RegistryContract;

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const NETWORK_CONFIG = {
  MAX_FETCH_DAILY_GUARD: 19000, // Safety threshold for daily budget
  MAX_FETCH_PER_EXECUTION: 2000, 
  RETRY_MAX: 3,
  CACHE_TTL_LONG: 900,  // 15 mins for profile data
  CACHE_TTL_SHORT: 300, // 5 mins for race stats
  KEYS: {
    FETCH_STATE: "FETCH_STATE_V2",
    WORKER_HEALTH: "WORKER_HEALTH_CACHE",
  }
};

// EXECUTION CACHE: Stores API responses for the duration of one script execution.
const _EXECUTION_CACHE = new Map<string, any>();
let _FETCH_COUNT = 0;
let _REMOTE_FETCH_COUNT = 0;
let _LAST_WORKER_ERROR = "N/A";

/* ==========================================================================
   INTERFACES
   ========================================================================== */
/**
 * Interface for the Network Service.
 * Orchestrates API calls with built-in quota management and remote delegation.
 */
export interface NetworkContract {
  /**
   * Executes a batch of Royale API requests with smart caching and rotation.
   *
   * @param urls - Array of fully qualified API endpoints to fetch.
   * @param scoring - Optional weights for server-side recruit scoring.
   * @returns Array of parsed JSON responses corresponding to the input URLs.
   * @warning Consumes UrlFetchApp and CacheService quotas.
   */
  fetchRoyaleAPI(urls: string[], scoring?: any, context?: string): any[];
  
  /**
   * Executes a single Royale API request with smart caching.
   *
   * @param url - The fully qualified API endpoint to fetch.
   * @param scoring - Optional weights for server-side recruit scoring.
   * @returns The parsed JSON response or null if the request failed.
   */
  fetchRoyaleAPIOne(url: string, scoring?: ScoringWeights | null): any;

  /**
   * Fetches an aggregated clan snapshot (Members + Race + History).
   *
   * @param cleanTag - The encoded clan tag (including %23).
   * @returns A structured result containing members, race, and history data.
   * @warning Consumes UrlFetchApp and CacheService quotas.
   */
  fetchClanDataSmart(cleanTag: string): ClanDataResult;

  /**
   * Retrieves public JSON data via the remote worker's proxy.
   *
   * @param type - The data type to retrieve ('members' or 'warlog').
   * @returns Array of transformed objects or null if the worker is offline.
   * @warning Consumes UrlFetchApp quota for the worker handshake.
   */
  fetchPublicJson(type: "members" | "warlog"): any[] | null;

  /**
   * Audits a pool of API keys using the remote worker to avoid local rate limits.
   *
   * @param keys - Array of key objects { name, value } to validate.
   * @returns Audit results with success/error status per key.
   * @warning Consumes UrlFetchApp quota.
   */
  auditKeysRemote(keys: Array<{ name: string; value: string }>): Array<{ name: string; success: boolean; error?: string }> | null;

  /**
   * Scans global tournaments for potential recruits using the remote worker.
   *
   * @param tourneyTags - List of tournament tags to scan.
   * @param minTrophies - Minimum trophy threshold for filtering.
   * @param blacklistSet - Set or array of player tags to ignore.
   * @param scoring - Optional weights for calculating recruit potential.
   * @returns List of scored player candidates.
   * @warning Consumes UrlFetchApp quota.
   */
  scanTournamentsRemote(tourneyTags: string[], minTrophies: number, blacklistSet: Set<string> | string[], scoring?: ScoringWeights | null): any[];

  /**
   * Performs a diagnostic health check on the Remote Worker.
   *
   * @param force - If true, bypasses the health cache and performs a fresh handshake.
   * @returns Boolean indicating if the worker is reachable and healthy.
   * @warning Consumes UrlFetchApp quota.
   */
  remoteWorkerHealthy(force?: boolean): boolean;

  /**
   * Returns a concise summary of worker health and memory.
   */
  getWorkerSummary(): string;

  /**
   * Returns the remaining UrlFetchApp quota for the current 24-hour period.
   */
  getRemainingQuota(): number;

  /**
   * Returns the last recorded error from a remote worker interaction.
   */
  getLastWorkerError(): string;

  /**
   * Generic remote worker execution.
   */
  fetchRemoteWorker(endpoint: string, payload: any): any;

  /**
   * Returns a summary of total fetches performed during the current execution.
   */
  getExecutionStats(): { total: number; remote: number; local: number };

  /**
   * Resets the internal execution cache. Used primarily for testing.
   */
  _clearCache(): void;
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
    } catch (e: any) {
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
   * Sends a remote fetch request to the worker.
   */
  remoteFetch(chunkUrls: string[], keyPool: any[], scoring: any): any[] {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) throw new Error("No remote worker");

    const payload = {
      urls: chunkUrls,
      apiKeys: keyPool.map(k => k.value),
      scoring: scoring
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

    const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/fetch`, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      headers: headers
    });

    const code = res.getResponseCode();
    if (code !== 200) {
        const errBody = JSON.parse(res.getContentText() || "{}");
        throw new Error(`Worker Error ${code}: ${errBody.error || "Unknown"}`);
    }
    
    try {
      const body = JSON.parse(res.getContentText());
      if (!body || !Array.isArray(body.results)) throw new Error("Invalid remote payload structure");
      
      _REMOTE_FETCH_COUNT += chunkUrls.length;

      if (body.results.length === 0 && chunkUrls.length > 0) {
        console.warn(`Network: Worker returned ZERO results for ${chunkUrls.length} URLs.`);
      }

      return body.results.map((r: any) => ({
        getResponseCode: () => r.code,
        getContentText: () => typeof r.content === "string" ? r.content : JSON.stringify(r.content)
      }));
    } catch (e: any) {
      console.error(`Network: Failed to parse remote response: ${e.message}`);
      throw new Error("Worker responded with malformed JSON");
    }
  },

  /**
   * Generates a stable cache key
   */
  hashKey(str: string): string {
    return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str)).slice(0, 50);
  },

  /**
   * INTERNAL: Extracts War History from River Race Log response.
   * Mirrors the logic from the Backend Worker to ensure consistency.
   */
  _parseWarHistoryFromLog(log: any): Record<string, Record<string, number>> {
    const history: Record<string, Record<string, number>> = {};
    if (!log || !log.items) return history;

    const clanTag = (CONFIG.SYSTEM.CLAN_TAG.startsWith("#") ? CONFIG.SYSTEM.CLAN_TAG : "#" + CONFIG.SYSTEM.CLAN_TAG).toUpperCase();

    log.items.forEach((item: any) => {
      const weekId = Registry.Services.Time.calculateWarWeekId(Registry.Services.Time.parseRoyaleApiDate(item.createdDate));
      const myClan = item.standings?.find((s: any) => s.clan.tag.toUpperCase() === clanTag);
      
      if (myClan?.clan?.participants) {
        myClan.clan.participants.forEach((p: any) => {
          if (!history[p.tag]) history[p.tag] = {};
          const currentFame = history[p.tag]![weekId] || 0;
          history[p.tag]![weekId] = Math.max(currentFame, p.fame || 0);
        });
      }
    });

    return history;
  }
};

/* ==========================================================================
   PUBLIC API
   ========================================================================== */
var Network: NetworkContract = {
  
  /**
   * NETWORK FETCH ENGINE
   *
   * @remarks
   * Implements a multi-tier caching strategy:
   * 1. Execution Cache (Map): Instant lookup for duplicate URLs within the same script run.
   * 2. Script Cache (CacheService): Persistent storage (5-15 mins) across different executions.
   *
   * High-volume requests (>5 URLs) are prioritized for Remote Worker delegation to preserve
   * the limited Google Apps Script UrlFetchApp quota for critical operations.
   *
   * @param urls - Array of fully qualified API endpoints to fetch.
   * @param scoring - Optional weights for server-side recruit scoring.
   * @returns Array of parsed JSON responses corresponding to the input URLs.
   * @warning Consumes UrlFetchApp and CacheService quotas.
   */
  fetchRoyaleAPI(urls: string[], scoring: any = null, context: string = ""): any[] {
    if (!urls) return [];
    if (!Array.isArray(urls)) {
      throw new Error(`Network: fetchRoyaleAPI expects an Array of URLs. Received: ${typeof urls}. Use fetchRoyaleAPIOne for single requests.`);
    }
    if (urls.length === 0) return [];

    // 1. Initialize Quota
    if (_FETCH_COUNT === 0) NetworkInternal.initQuota();

    // 2. Prepare Key Pool
    let keyPool = [...CONFIG.SYSTEM.API_KEYS];
    if (!keyPool || keyPool.length === 0) {
      console.error("CRITICAL: No API Keys found.");
      return new Array(urls.length).fill(null);
    }

    // 3. Check Cache (Exec + Script Service) & Deduplicate
    const finalResults = new Array(urls.length).fill(null);
    const urlsToFetch: string[] = [];
    const urlIndices = new Map<string, number[]>();
    const scriptCache = CacheService.getScriptCache();

    urls.forEach((url, index) => {
      // LEVEL 1: Execution Cache (Intra-run)
      if (_EXECUTION_CACHE.has(url)) {
        finalResults[index] = _EXECUTION_CACHE.get(url);
        return;
      }

      // LEVEL 2: Script Cache (Inter-run)
      const cacheKey = NetworkInternal.hashKey(url);
      const cachedStr = scriptCache.get(cacheKey);
      if (cachedStr) {
          try {
              const json = JSON.parse(cachedStr);
              _EXECUTION_CACHE.set(url, json);
              finalResults[index] = json;
              return;
          } catch(e: any) {}
      }

      // COLLECT: Identify unique URLs requiring a fresh network fetch.
      if (!urlIndices.has(url)) {
        urlIndices.set(url, []);
        urlsToFetch.push(url);
      }
      urlIndices.get(url)!.push(index);
    });

    if (urlsToFetch.length === 0) return finalResults;

    // 5. Execution Strategy
    let useRemote = !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();

    let validUrls: string[] = [];
    if (!useRemote) {
        // LOCAL QUOTA GUARD
        const remainingQuota = NETWORK_CONFIG.MAX_FETCH_DAILY_GUARD - _FETCH_COUNT;
        if (remainingQuota <= 0) {
            console.warn(`Critical: Daily URLFetch budget exhausted (${_FETCH_COUNT}). Throttling all local requests.`);
            return finalResults;
        }
        validUrls = urlsToFetch.slice(0, remainingQuota);
        NetworkInternal.updateQuota(validUrls.length);
    } else {
        // [BLOCK-CONSOLIDATION]: Silence individual small fetches (<=5) to prevent
        // GAS log fragmentation and token waste.
        if (urlsToFetch.length > 5 || context) {
            console.info(`Network: Delegating ${urlsToFetch.length} fetches to Remote Worker${context ? ` (${context})` : ""}.`);
        }
        validUrls = urlsToFetch;
    }

    const BATCH_SIZE = 100;

    for (let c = 0; c < validUrls.length; c += BATCH_SIZE) {
      const chunk = validUrls.slice(c, c + BATCH_SIZE);
      const isHighVolume = chunk.length > 50;
      
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

          if (useRemote) {
            try {
              responses = NetworkInternal.remoteFetch(chunk, keyPool, scoring);
            } catch (e: any) {
                console.warn(`Network: Worker Failure: ${e.message}.`);
                if (isHighVolume) {
                   console.error(`Network: High Volume Batch FAILED. Blocking local fallback.`);
                   useRemote = false; 
                   break;
                }
                useRemote = false; 
                continue;
            }
          } else {
            if (isHighVolume && attempt > 0) {
               console.warn(`Network: Quota Guard: Blocking local retry for large batch.`);
               break; 
            }
            
            try {
              responses = UrlFetchApp.fetchAll(localRequests);
            } catch (e: any) {
              console.warn(`Network: Batch failed: ${e.message}.`);
              if (isHighVolume) break;
              Utilities.sleep(1500);
              responses = UrlFetchApp.fetchAll(localRequests);
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
                
                if (!url.includes("/battlelog")) {
                  const ttl = url.includes("members") || url.includes("players") ? NETWORK_CONFIG.CACHE_TTL_LONG : NETWORK_CONFIG.CACHE_TTL_SHORT;
                  try {
                    scriptCache.put(NetworkInternal.hashKey(url), text, ttl);
                  } catch (e: any) {}
                }

                urlIndices.get(url)!.forEach(idx => finalResults[idx] = json);
              } catch (e: any) {}
            } else if (code === 404) {
              _EXECUTION_CACHE.set(url, null);
              urlIndices.get(url)!.forEach(idx => finalResults[idx] = null);
            } else if (code === 403 || code === 429) {
              if (!useRemote) {
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

        } catch (e: any) {
           if (attempt < NETWORK_CONFIG.RETRY_MAX - 1) Utilities.sleep(2000);
        }
      }
      Utilities.sleep(200);
    }

    return finalResults;
  },

  fetchRoyaleAPIOne(url, scoring = null) {
    if (typeof url !== "string") throw new Error("Network: fetchRoyaleAPIOne expects a string URL.");
    const results = this.fetchRoyaleAPI([url], scoring);
    return results && results.length > 0 ? results[0] : null;
  },

  fetchClanDataSmart(cleanTag) {
    const cacheKey = `clan_full_v2_${cleanTag.replace(/%/g, '_')}`;
    const scriptCache = CacheService.getScriptCache();
    
    const cachedStr = scriptCache.get(cacheKey);
    if (cachedStr) {
      try {
        return JSON.parse(cachedStr);
      } catch (e: any) {}
    }

    const useRemote = !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();

    if (useRemote) {
        try {
            const payload = {
                tag: decodeURIComponent(cleanTag),
                apiKeys: CONFIG.SYSTEM.API_KEYS.map((k: { name: string; value: string }) => k.value)
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
                scriptCache.put(cacheKey, JSON.stringify(result), NETWORK_CONFIG.CACHE_TTL_LONG);
                return result;
            }
        } catch(e: any) {}
    }

    const urls = [
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${Date.now()}`
    ];

    const [members, race, log] = this.fetchRoyaleAPI(urls);
    const history = (log && !Array.isArray(log)) ? NetworkInternal._parseWarHistoryFromLog(log) : null;
    
    return { members, race, history, log: log || null };
  },

  fetchPublicJson(type) {
    if (!this.remoteWorkerHealthy()) return null;
    try {
        const payload = {
            tag: CONFIG.SYSTEM.CLAN_TAG,
            type: type,
            apiKeys: CONFIG.SYSTEM.API_KEYS.map((k: { name: string; value: string }) => k.value)
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
    } catch(e: any) {}
    return null;
  },

  remoteWorkerHealthy(force: boolean = false) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) {
        _LAST_WORKER_ERROR = "RemoteWorkerUrl is not configured in Script Properties.";
        return false;
    }
    
    _LAST_WORKER_ERROR = "Initiating Handshake...";

    const now = Date.now();
    try {
      if (!force && typeof PropertiesService !== "undefined") {
        const cached = Registry.Services.Store.props.getJSON(
          NETWORK_CONFIG.KEYS.WORKER_HEALTH,
          null,
        ) as { status: boolean; time: number; error?: string } | null;
        if (cached && now - cached.time < 300000) {
            _EXECUTION_CACHE.set("worker_health", cached.status);
            _LAST_WORKER_ERROR = cached.error || "";
            return cached.status;
        }
      }
    } catch(e: any) {}

    let isHealthy = false;
    try {
        const headers: Record<string, string> = {};
        const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/health`, {
            method: "get",
            muteHttpExceptions: true,
            headers: headers
        });
        if (res.getResponseCode() === 200) {
            const diagnostic = JSON.parse(res.getContentText() || "{}");
            if (diagnostic.status === "success" && (diagnostic?.checks?.upstream === "OK" || diagnostic?.checks?.upstream === "UNKNOWN")) {
                isHealthy = true;
                _LAST_WORKER_ERROR = "";
            } else {
                _LAST_WORKER_ERROR = `Degraded: Upstream=${diagnostic?.checks?.upstream || 'Fail'}`;
                isHealthy = (diagnostic.status === "success");
            }

            if (diagnostic?.checks?.pool?.total === 0) {
                _LAST_WORKER_ERROR = "CRITICAL: No API Keys Configured on Worker.";
                isHealthy = false;
            }
        } else {
            _LAST_WORKER_ERROR = `HTTP ${res.getResponseCode()}`;
        }
    } catch(e: any) { 
        _LAST_WORKER_ERROR = String(e);
    }

    _EXECUTION_CACHE.set("worker_health", isHealthy);
    Registry.Services.Store.props.setJSON(NETWORK_CONFIG.KEYS.WORKER_HEALTH, {
      status: isHealthy,
      time: now,
      error: _LAST_WORKER_ERROR
    });
    
    return isHealthy;
  },

  auditKeysRemote(keys: { name: string; value: string }[]) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) return null;
    try {
        const payload = { apiKeys: keys.map((k: { name: string; value: string }) => k.value) };
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
            return { name: k.name, success: false, error: `Error ${r.status}` };
        });
    } catch(e: any) { return null; }
  },

  scanTournamentsRemote(tourneyTags, minTrophies, blacklistSet, scoring = null) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) throw new Error("Worker not configured");
    const blacklist = Array.isArray(blacklistSet) ? blacklistSet : Array.from(blacklistSet);
    
    const prophetData: Record<string, any> = {}; 
    const pCache = Registry.Services.Roster.getProphetCache();
    if (pCache?.forEach) {
        pCache.forEach((v: any, k: string) => { prophetData[k.replace("#", "").trim().toLowerCase()] = v; });
    }

    const payload = { tags: tourneyTags, apiKeys: CONFIG.SYSTEM.API_KEYS.map((k: any) => k.value), blacklist, minTrophies, scoring, prophetCache: prophetData };
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
  },

  getWorkerSummary() {
    const isHealthy = this.remoteWorkerHealthy();
    return isHealthy ? `Worker Healthy (Remote Enabled)` : `Worker Offline (${_LAST_WORKER_ERROR})`;
  },

  getLastWorkerError() {
    return _LAST_WORKER_ERROR;
  },

  fetchRemoteWorker(endpoint, payload) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) throw new Error("Worker not configured");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

    const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}${endpoint}`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        headers: headers
    });

    if (res.getResponseCode() !== 200) throw new Error(`Worker Error ${res.getResponseCode()}`);
    return JSON.parse(res.getContentText());
  },

  getExecutionStats() {
    return {
      total: _FETCH_COUNT + _REMOTE_FETCH_COUNT,
      remote: _REMOTE_FETCH_COUNT,
      local: _FETCH_COUNT
    };
  },

  _clearCache() {
    _EXECUTION_CACHE.clear();
    _FETCH_COUNT = 0;
    _REMOTE_FETCH_COUNT = 0;
  }
};



(function(scope: any) {
  Object.assign(scope, { Network, VER_NETWORK });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Network;
