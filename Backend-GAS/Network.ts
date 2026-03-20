
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
const VER_NETWORK = "1.0.1";
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
  fetchRoyaleAPI(urls: string[], scoring?: ScoringWeights | null): any[];
  
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
  fetchRoyaleAPI(urls: string[], scoring = null) {
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
      // Prevents redundant network calls if the same URL is requested multiple
      // times within a single trigger execution (e.g. nested logic loops).
      if (_EXECUTION_CACHE.has(url)) {
        finalResults[index] = _EXECUTION_CACHE.get(url);
        return;
      }

      // LEVEL 2: Script Cache (Inter-run)
      // Shared across all concurrent and subsequent executions. Significant
      // quota saver for frequently accessed player profiles and clan stats.
      const cacheKey = NetworkInternal.hashKey(url);
      const cachedStr = scriptCache.get(cacheKey);
      if (cachedStr) {
          try {
              const json = JSON.parse(cachedStr);
              _EXECUTION_CACHE.set(url, json);
              finalResults[index] = json;
              // console.log(`[Network] L2 Hit: ${url.slice(-30)}`);
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

    // 4. Check Quota Limits (Daily Guard)
    const remainingQuota = NETWORK_CONFIG.MAX_FETCH_DAILY_GUARD - _FETCH_COUNT;
    if (remainingQuota <= 0) {
        console.warn(`Critical: Daily URLFetch budget exhausted (${_FETCH_COUNT}). Throttling all requests.`);
        return finalResults;
    }

    // Truncate if necessary (Safety First)
    const validUrls = urlsToFetch.slice(0, remainingQuota);
    NetworkInternal.updateQuota(validUrls.length);

    // 5. Execution Strategy
    let useRemote = !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();
    // BATCH SIZE: 100
    // Intent: Balancing request overhead with Remote Worker payload limits.
    // Smaller batches increase overhead; larger batches risk memory/timeout issues.
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

          // STRATEGY: Prioritize Remote Worker for all batches to maximize GAS lifespan.
          if (useRemote) {
            try {
              responses = NetworkInternal.remoteFetch(chunk, keyPool, scoring);
            } catch (e: any) {
                console.warn(`Network: Worker Failure: ${e.message}.`);

                // CONSTRAINT: High volume local fallback is strictly forbidden.
                // Fetching large batches (50+) locally consumes ~0.25% of the total
                // daily UrlFetchApp quota (20,000) per call. Under concurrent load,
                // this would crash the entire clan infrastructure within minutes.
                if (isHighVolume) {
                   console.error(`Network: High Volume Batch FAILED. Blocking local fallback to protect core service quota.`);
                   useRemote = false; 
                   break; // Abort this chunk; do not fall back.
                }

                // ELEGANT DEGRADATION: Small batches can safely fall back to local fetch.
                useRemote = false; 
                continue;
            }
          } else {
            // LOCAL EXECUTION: Only for low-volume or when worker is confirmed offline.
            if (isHighVolume && attempt > 0) {
               // QUOTA GUARD: Large batches are never retried locally to prevent
               // accidental exhaustion during "retry storms".
               console.warn(`Network: Quota Guard: Blocking local retry for large batch.`);
               break; 
            }
            
            try {
              responses = UrlFetchApp.fetchAll(localRequests);
            } catch (e: any) {
              console.warn(`Network: Batch failed: ${e.message}.`);
              if (isHighVolume) break; // No retry for high-volume local failures.

              // JITTER: Brief sleep before retry.
              // Intent: Allow transient network issues to resolve during local fallback.
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
                
                // Persist to script cache (SKIP for battle logs due to size limits)
                if (!url.includes("/battlelog")) {
                  const ttl = url.includes("members") || url.includes("players") ? NETWORK_CONFIG.CACHE_TTL_LONG : NETWORK_CONFIG.CACHE_TTL_SHORT;
                  try {
                    scriptCache.put(NetworkInternal.hashKey(url), text, ttl);
                  } catch (e: any) {
                    // Silently skip if cache write fails
                  }
                }

                urlIndices.get(url)!.forEach(idx => finalResults[idx] = json);
              } catch (e: any) {
                // Silently skip parse errors
              }
            } else if (code === 404) {
              _EXECUTION_CACHE.set(url, null);
              urlIndices.get(url)!.forEach(idx => finalResults[idx] = null);
            } else if (code === 403 || code === 429) {
              if (!useRemote) {
                // KEY ROTATION: Burn bad key locally.
                // 403 (Invalid) or 429 (Throttled) indicates the specific API key is
                // no longer viable. We remove it from the pool for the remainder
                // of this execution to avoid repeated failures.
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

  /**
   * SINGLE FETCH HELPER
   * Wraps the batch fetcher for single-URL convenience and type safety.
   */
  fetchRoyaleAPIOne(url, scoring = null) {
    if (typeof url !== "string") throw new Error("Network: fetchRoyaleAPIOne expects a string URL.");
    const results = this.fetchRoyaleAPI([url], scoring);
    return results && results.length > 0 ? results[0] : null;
  },

  /**
   * CLAN DATA AGGREGATOR
   *
   * @remarks
   * Fetches a complete clan snapshot (Members + Race + History).
   * Prioritizes the Remote Worker's optimized `/clan/full` endpoint which
   * aggregates these data points into a single network call, significantly
   * reducing total execution time and quota usage.
   *
   * @param cleanTag - The encoded clan tag (including %23).
   * @returns A structured result containing members, race, and history data.
   * @warning Consumes UrlFetchApp and CacheService quotas.
   */
  fetchClanDataSmart(cleanTag) {
    const cacheKey = `clan_full_v2_${cleanTag.replace(/%/g, '_')}`;
    const scriptCache = CacheService.getScriptCache();
    
    // 15-MINUTE PERSISTENT CACHE (Quota Saver)
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
                // Cache for 15 mins (Quota optimization)
                scriptCache.put(cacheKey, JSON.stringify(result), NETWORK_CONFIG.CACHE_TTL_LONG);
                return result;
            }
        } catch(e: any) {}
    }

    // Local Fallback
    const urls = [
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${Date.now()}`
    ];

    const [members, race, log] = this.fetchRoyaleAPI(urls);
    const history = (log && !Array.isArray(log)) ? NetworkInternal._parseWarHistoryFromLog(log) : null;
    
    return { members, race, history, log: log || null };
  },

  /**
   * REMOTE DATA PROXY
   *
   * @remarks
   * Retrieves public JSON data via the remote worker's proxy.
   * Utilizes worker-cached data to bypass direct API rate limits and
   * preserve the local GAS UrlFetchApp quota.
   *
   * @param type - The data type to retrieve ('members' or 'warlog').
   * @returns Array of transformed objects or null if the worker is offline.
   * @warning Consumes UrlFetchApp quota for the worker handshake.
   */
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

  /**
   * DIAGNOSTIC HEALTH HANDSHAKE
   *
   * @remarks
   * The Remote Worker's health status is cached in two places:
   * 1. In-memory (_EXECUTION_CACHE): For immediate reuse within a script run.
   * 2. Persistent Store (PropertiesService): To avoid redundant handshakes
   *    across multiple script executions (5-minute TTL).
   *
   * This ensures the system remains responsive even if the worker is cold-starting
   * or experiencing temporary latency.
   *
   * @param force - If true, bypasses the health cache and performs a fresh handshake.
   * @returns Boolean indicating if the worker is reachable and healthy.
   * @warning Consumes UrlFetchApp and PropertiesService quotas.
   */
  remoteWorkerHealthy(force: boolean = false) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) {
        _LAST_WORKER_ERROR = "RemoteWorkerUrl is not configured in Script Properties.";
        return false;
    }
    
    _LAST_WORKER_ERROR = "Initiating Handshake...";

    // HYDRATION: Check persistent health cache to avoid unnecessary handshakes.
    const now = Date.now();
    try {
      if (!force && typeof PropertiesService !== "undefined") {
        const cached = Registry.Services.Store.props.getJSON(
          NETWORK_CONFIG.KEYS.WORKER_HEALTH,
          null,
        ) as { status: boolean; time: number; error?: string } | null;
        if (cached && now - cached.time < 300000) { // 5 min TTL
            _EXECUTION_CACHE.set("worker_health", cached.status);
            _LAST_WORKER_ERROR = cached.error || "";
            return cached.status;
        }
      }
    } catch(e: any) {}

    // HANDSHAKE: Verify worker reachability and upstream health.
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
            if (diagnostic.status === "success" && diagnostic?.checks?.upstream === "OK") {
                isHealthy = true;
                _LAST_WORKER_ERROR = "";
            } else if (diagnostic.status === "success" && diagnostic?.checks?.upstream === "UNKNOWN") {
                isHealthy = true;
                _LAST_WORKER_ERROR = "";
            } else {
                _LAST_WORKER_ERROR = `Degraded: Upstream=${diagnostic?.checks?.upstream || 'Fail'}`;
                isHealthy = (diagnostic.status === "success"); // Reachable
            }
        } else {
            _LAST_WORKER_ERROR = `HTTP ${res.getResponseCode()}`;
            if (res.getResponseCode() === 401) _LAST_WORKER_ERROR += " (Secret Mismatch)";
            if (res.getResponseCode() === 404) _LAST_WORKER_ERROR += " (Wrong version or URL)";
        }
    } catch(e: any) { 
        _LAST_WORKER_ERROR = String(e);
    }

    // PERSISTENCE: Synchronize health status across the architecture.
    _EXECUTION_CACHE.set("worker_health", isHealthy);
    Registry.Services.Store.props.setJSON(NETWORK_CONFIG.KEYS.WORKER_HEALTH, {
      status: isHealthy,
      time: now,
      error: _LAST_WORKER_ERROR
    });
    
    return isHealthy;
  },

  /**
   * REMOTE KEY AUDIT
   *
   * @remarks
   * Audits a pool of API keys using the remote worker to avoid local rate limits.
   * Delegation to the worker prevents GAS from being throttled by Supercell's
   * IP-based rate limiting during high-volume key validation.
   *
   * @param keys - Array of key objects { name, value } to validate.
   * @returns Audit results with success/error status per key.
   * @warning Consumes UrlFetchApp quota.
   */
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
            
            let err = `Error ${r.status}`;
            if (r.status === 403) err = "Access Denied";
            if (r.status === 429) err = "Throttled";
            return { name: k.name, success: false, error: err };
        });
    } catch(e: any) { return null; }
  },

  /**
   * REMOTE TOURNAMENT SCANNER
   *
   * @remarks
   * Scans global tournaments for potential recruits using the remote worker.
   * This high-concurrency operation is delegated to the worker to circumvent
   * GAS execution time limits and UrlFetchApp daily quotas.
   *
   * @param tourneyTags - List of tournament tags to scan.
   * @param minTrophies - Minimum trophy threshold for filtering.
   * @param blacklistSet - Set or array of player tags to ignore.
   * @param scoring - Optional weights for calculating recruit potential.
   * @returns List of scored player candidates.
   * @warning Consumes UrlFetchApp quota.
   */
  scanTournamentsRemote(tourneyTags, minTrophies, blacklistSet, scoring = null) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) throw new Error("Worker not configured");
    
    const blacklist = Array.isArray(blacklistSet) ? blacklistSet : Array.from(blacklistSet);
    
    const prophetData: Record<string, any> = {}; 
    const pCache = Registry.Services.Roster.getProphetCache();
    if (pCache && typeof pCache.forEach === "function") {
        pCache.forEach((v: any, k: string) => {
            prophetData[k.replace("#", "").trim().toLowerCase()] = v;
        });
    }

    const payload = {
        tags: tourneyTags,
        apiKeys: CONFIG.SYSTEM.API_KEYS.map((k: { name: string; value: string }) => k.value),
        blacklist: blacklist,
        minTrophies,
        scoring,
        prophetCache: prophetData
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET) headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

    // DIAGNOSTIC PROBE: Log Payload Summary


    const res = UrlFetchApp.fetch(`${CONFIG.SYSTEM.REMOTE_WORKER_URL}/scan`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        headers: headers
    });

    const code = res.getResponseCode();
    const text = res.getContentText();



    if (code !== 200) throw new Error(`Worker Error ${code}`);
    return JSON.parse(text).candidates || [];
  },

  getRemainingQuota() {
    NetworkInternal.initQuota();
    return Math.max(0, NETWORK_CONFIG.MAX_FETCH_DAILY_GUARD - _FETCH_COUNT);
  },

  getWorkerSummary() {
    const isHealthy = this.remoteWorkerHealthy();
    if (!isHealthy) return `Worker Offline (${_LAST_WORKER_ERROR})`;
    
    // Attempt to find memory info from last handshake
    // Since we don't store it in health cache yet, just return status
    return `Worker Healthy (Remote Enabled)`;
  },

  getLastWorkerError() {
    return _LAST_WORKER_ERROR;
  },

  fetchRemoteWorker(endpoint: string, payload: any): any {
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

    const code = res.getResponseCode();
    if (code !== 200) throw new Error(`Worker Error ${code}: ${res.getContentText()}`);
    return JSON.parse(res.getContentText());
  },

  _clearCache() {
    _EXECUTION_CACHE.clear();
    _FETCH_COUNT = 0;
  }
};

/* ==========================================================================
   EXPORTS
   ========================================================================== */
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = { Network, VER_NETWORK };
}

(function(scope: any) {
  Object.assign(scope, { Network, VER_NETWORK });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Network;
