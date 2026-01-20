/**
 * ============================================================================
 * 🛠️ MODULE: UTILITIES
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Centralized helper library for the entire project.
 * ⚙️ CAPABILITIES:
 *    1. Smart API Engine: Caching, Deduplication, Key Rotation, Quota Safety.
 *    2. Date & WeekID Calculation (ISO-like Week Logic).
 *    3. Layout Engine (Standardized "Signature" look for all sheets).
 *    4. Data Parsing (War History String -> Map objects).
 *    5. Backup System (Rolling backups for sheet safety).
 *    6. Cache Engine: Handles 100KB+ payloads via chunking (Fixes GAS Limit).
 *    7. Safety Lock: Mutex locking to prevent Race Conditions.
 *    8. Properties Manager: Safe JSON handling for Script Properties.
 * 🏷️ VERSION: 10.0.9
 * ============================================================================
 */

const VER_UTILITIES = "10.0.9";

// 🧠 EXECUTION CACHE: Stores API responses for the duration of one script execution.
const _EXECUTION_CACHE = new Map();

// 🛡️ API BUDGET: Prevents runaway execution from burning daily quotas.
// UPDATED (v5.2.0): Increased from 400 to 600 to allow "Deep Net Level 2" scans.
let _FETCH_COUNT = 0;
const MAX_FETCH_PER_EXECUTION = 100000;

const Utils = {
  /**
   * 🔒 EXECUTE SAFELY (Mutex Lock)
   * Prevents race conditions by acquiring a Script Lock before running critical code.
   * Useful for ensuring only one update runs at a time.
   *
   * @param {string} lockKey - Name of the process for logging (e.g. "UPDATE_DB")
   * @param {Function} callback - The code to run if lock is acquired
   * @return {any} The result of the callback
   */
  executeSafely: function (lockKey, callback) {
    const lock = LockService.getScriptLock();
    try {
      // Attempt to acquire lock for 60 seconds.
      const success = lock.tryLock(60000);

      if (!success) {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        try {
          ss.toast("System is busy. Please try again in 30s.", "⚠️ Locked");
        } catch (e) {}
        throw new Error(`System Busy: Could not acquire lock for ${lockKey}`);
      }

      // Lock acquired, run critical section
      return callback();
    } catch (e) {
      // Re-throw to ensure caller knows it failed
      throw e;
    } finally {
      // Always release the lock, even if callback fails
      lock.releaseLock();
    }
  },

  /**
   * 💾 PROPS MANAGER (Script Properties Wrapper)
   * Centralizes access to persistent storage for Metadata and Config.
   * Robust against JSON errors and handles type conversion.
   */
  Props: {
    _service: PropertiesService.getScriptProperties(),

    get: function (key, defaultVal = null) {
      const val = this._service.getProperty(key);
      return val !== null ? val : defaultVal;
    },

    set: function (key, val) {
      this._service.setProperty(key, String(val));
    },

    getJSON: function (key, defaultVal = {}) {
      const raw = this._service.getProperty(key);
      if (!raw) return defaultVal;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return defaultVal;
      }
    },

    setJSON: function (key, val) {
      try {
        const str = JSON.stringify(val);
        // Check size limit (9KB per value)
        if (str.length > 9000) {
          return false;
        }
        this._service.setProperty(key, str);
        return true;
      } catch (e) {
        console.error(
          `⚠️ Props: JSON Stringify error for '${key}': ${e.message}`,
        );
        return false;
      }
    },

    /**
     * 🧩 CHUNKED STORAGE (For >9KB Properties)
     * Automatically splits large JSON objects into keys like KEY_0, KEY_1, KEY_2...
     */
    getChunked: function (baseKey, defaultVal = {}) {
      try {
        // 1. Check for legacy single key first (Migration path)
        const simple = this._service.getProperty(baseKey);
        if (simple) {
          return JSON.parse(simple);
        }

        // 2. Scan for chunks
        const allProps = this._service.getProperties();
        const chunkPattern = new RegExp(`^${baseKey}_(\\d+)$`);
        const chunks = [];

        Object.keys(allProps).forEach((k) => {
          const match = k.match(chunkPattern);
          if (match) {
            chunks.push({ index: parseInt(match[1]), val: allProps[k] });
          }
        });

        if (chunks.length === 0) return defaultVal;

        // 3. Reassemble
        chunks.sort((a, b) => a.index - b.index);
        const fullString = chunks.map((c) => c.val).join("");
        return JSON.parse(fullString);
      } catch (e) {
        console.error(
          `🧩 Props: Chunk read error for '${baseKey}': ${e.message}`,
        );
        return defaultVal;
      }
    },

    setChunked: function (baseKey, val) {
      try {
        const fullString = JSON.stringify(val);
        const CHUNK_SIZE = 8500; // Safety buffer below 9000 limit
        const totalChunks = Math.ceil(fullString.length / CHUNK_SIZE);

        // 1. Write new chunks
        for (let i = 0; i < totalChunks; i++) {
          const chunk = fullString.substr(i * CHUNK_SIZE, CHUNK_SIZE);
          this._service.setProperty(`${baseKey}_${i}`, chunk);
        }

        // 2. Clean up old excess chunks
        // If we previously had 5 chunks and now only need 2, delete _2, _3, _4
        const allProps = this._service.getProperties();
        const chunkPattern = new RegExp(`^${baseKey}_(\\d+)$`);

        Object.keys(allProps).forEach((k) => {
          const match = k.match(chunkPattern);
          if (match) {
            const index = parseInt(match[1]);
            if (index >= totalChunks) {
              this._service.deleteProperty(k);
            }
          }
        });

        // 3. Clean up legacy single key if it exists
        this._service.deleteProperty(baseKey);

        return true;
      } catch (e) {
        console.error(
          `🧩 Props: Chunk write error for '${baseKey}': ${e.message}`,
        );
        return false;
      }
    },

    // ---- Fetch state persistence (to coordinate quota across runs)
    _fetchStateKey: "FETCH_STATE",

    getFetchState: function () {
      return this.getJSON(this._fetchStateKey, {});
    },

    setFetchState: function (stateObj) {
      return this.setJSON(this._fetchStateKey, stateObj);
    },

    delete: function (key) {
      this._service.deleteProperty(key);
    },
  },

  /**
   * 🔑 REMOTE AUDIT DELEGATE
   * Offloads API key verification to the worker to save GAS quota.
   */
  auditKeysRemote: function (keys) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) return null;

    try {
      const payload = {
        apiKeys: keys.map((k) => k.value),
      };

      const headers = { "Content-Type": "application/json" };
      if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
        headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

      const res = UrlFetchApp.fetch(
        CONFIG.SYSTEM.REMOTE_WORKER_URL + "/audit",
        {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
          headers: headers,
        },
      );

      if (res.getResponseCode() !== 200) {
        return null;
      }

      const json = JSON.parse(res.getContentText());
      if (!json.results || !Array.isArray(json.results)) return null;

      return keys.map((k) => {
        const remoteResult = json.results.find((r) => r.key === k.value);

        if (!remoteResult) {
          return { name: k.name, success: false, error: "Worker skipped key" };
        }

        if (remoteResult.status === 200) {
          return { name: k.name, success: true };
        }

        let errorMsg = `Error ${remoteResult.status}`;
        if (remoteResult.status === 403) errorMsg = "⛔ Access Denied";
        if (remoteResult.status === 429) errorMsg = "⚠️ Throttled";
        return { name: k.name, success: false, error: errorMsg };
      });
    } catch (e) {
      return null;
    }
  },

  /**
   * 📡 REMOTE SCAN DELEGATE
   * Offloads heavy tournament filtering logic to the worker.
   * Returns: Array of valid candidate objects (filtered and ready for scoring).
   */
  scanTournamentsRemote: function (
    tourneyTags,
    minTrophies,
    blacklistSet,
    scoring = null,
    benchmark = null,
  ) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) {
      throw new Error("Worker not configured for scanning");
    }

    const keyPool = CONFIG.SYSTEM.API_KEYS;
    const blacklistArray = Array.from(blacklistSet);

    try {
      const payload = {
        tags: tourneyTags,
        apiKeys: keyPool.map((k) => k.value),
        blacklist: blacklistArray,
        minTrophies: minTrophies,
        scoring: scoring, // Pass scoring weights to worker
        benchmark: benchmark, // Pass benchmark for push triggers
      };

      const headers = { "Content-Type": "application/json" };
      if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
        headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

      const res = UrlFetchApp.fetch(CONFIG.SYSTEM.REMOTE_WORKER_URL + "/scan", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        headers: headers,
      });

      if (res.getResponseCode() !== 200) {
        throw new Error(`Worker returned ${res.getResponseCode()}`);
      }

      const json = JSON.parse(res.getContentText());
      if (!json.candidates || !Array.isArray(json.candidates)) {
        throw new Error("Invalid worker response format");
      }

      return json.candidates;
    } catch (e) {
      // Let caller handle fallback or throw
      throw e;
    }
  },

  /**
   * 🌐 PUBLIC API OFFLOAD (Worker Optimized)
   * Delegates "Members" and "WarLog" requests to the worker to bypass GAS transformation logic.
   * Returns transformed array if successful, or null to trigger local fallback.
   */
  fetchPublicJson: function (type) {
    const useRemote =
      !!CONFIG.SYSTEM.REMOTE_WORKER_URL && Utils.remoteWorkerHealthy();

    if (!useRemote) return null;

    try {
      const payload = {
        tag: CONFIG.SYSTEM.CLAN_TAG,
        type: type,
        apiKeys: CONFIG.SYSTEM.API_KEYS.map((k) => k.value),
      };

      const headers = { "Content-Type": "application/json" };
      if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
        headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

      const res = UrlFetchApp.fetch(
        CONFIG.SYSTEM.REMOTE_WORKER_URL + "/clan/api",
        {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
          headers: headers,
        },
      );

      if (res.getResponseCode() === 200) {
        const json = JSON.parse(res.getContentText());
        return json.data;
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  },

  /**
   * ⚡ SMART CLAN FETCH (Worker Optimized)
   * Attempts to fetch Members, Race, and History via the Worker's optimized /clan/full endpoint.
   * If successful, returns pre-processed history map + raw data.
   * If failed/disabled, falls back to standard fetchRoyaleAPI calls (handled by caller fallback logic).
   */
  fetchClanDataSmart: function (cleanTag) {
    const useRemote =
      !!CONFIG.SYSTEM.REMOTE_WORKER_URL && Utils.remoteWorkerHealthy();

    // 1. Try Remote Worker (Aggregated)
    if (useRemote) {
      try {
        const payload = {
          tag: cleanTag, // Already encoded or raw? Worker expects raw tag, let's decode if needed or pass as is.
          // Worker uses it to build URL: /clans/${encodeURIComponent(tag)}/members
          // If we pass "%23TAG", encoding it again is bad.
          // Standardize: pass CLEAN tag (no #, no URL encoding yet)
          apiKeys: CONFIG.SYSTEM.API_KEYS.map((k) => k.value),
        };
        // Decode incase it was passed encoded
        payload.tag = decodeURIComponent(cleanTag);

        const headers = { "Content-Type": "application/json" };
        if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
          headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

        const res = UrlFetchApp.fetch(
          CONFIG.SYSTEM.REMOTE_WORKER_URL + "/clan/full",
          {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
            headers: headers,
          },
        );

        if (res.getResponseCode() === 200) {
          const json = JSON.parse(res.getContentText());
          // Return standardized structure
          return {
            members: { items: json.members.items },
            race: { clan: json.race.clan },
            // Worker returns a history object: { tag: { week: fame } }
            // We return it as 'history' so Leaderboard knows it's pre-processed
            history: json.history,
            log: null, // No log needed if history exists
          };
        } else {
        }
      } catch (e) {}
    }

    // 2. Fallback: Standard Fetch (GAS iterates 3 URLs)
    // NOTE: This uses fetchRoyaleAPI which *might* still use Worker /fetch for individual calls if configured,
    // but performs the aggregation logic locally in GAS.
    const urls = [
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`,
    ];

    const [membersData, raceData, logData] = Utils.fetchRoyaleAPI(urls);
    return {
      members: membersData,
      race: raceData,
      history: null, // Null history triggers local parsing logic
      log: logData,
    };
  },

  /**
   * ⚡ ULTRA-OPTIMIZED FETCH ENGINE
   * Includes Circuit Breaker logic for Remote Worker fallbacks.
   */
  fetchRoyaleAPI: function (urls, scoring = null) {
    if (!urls || urls.length === 0) return [];

    // Load persisted fetch state to coordinate across executions
    try {
      const st = this.Props.getFetchState();
      const today = new Date().toISOString().slice(0, 10);
      if (st && st.date === today) {
        _FETCH_COUNT = Number(st.count || 0);
      } else {
        _FETCH_COUNT = 0;
      }
    } catch (e) {}

    // 1. Initialize Key Pool
    let keyPool = [...CONFIG.SYSTEM.API_KEYS];
    if (!keyPool || keyPool.length === 0) {
      throw new Error(
        "CRITICAL: No API Keys found in Script Properties. Add at least one key (CRK1, CRK2, etc.) to Configuration.",
      );
    }

    const finalResults = new Array(urls.length).fill(null);
    let urlsToFetch = [];
    const urlIndices = new Map();

    // 2. Cache Check & Deduplication
    urls.forEach((url, index) => {
      if (_EXECUTION_CACHE.has(url)) {
        finalResults[index] = _EXECUTION_CACHE.get(url);
      } else {
        if (!urlIndices.has(url)) {
          urlIndices.set(url, []);
          urlsToFetch.push(url);
        }
        urlIndices.get(url).push(index);
      }
    });

    if (urlsToFetch.length === 0) return finalResults;

    // Post-deduplication quota accounting
    const remainingQuota = MAX_FETCH_PER_EXECUTION - _FETCH_COUNT;
    if (remainingQuota <= 0) {
      console.error(
        `⚠️ API Budget Exceeded (${_FETCH_COUNT}/${MAX_FETCH_PER_EXECUTION}). Aborting further fetches.`,
      );
      return finalResults;
    }

    if (urlsToFetch.length > remainingQuota) {
      urlsToFetch = urlsToFetch.slice(0, remainingQuota);
    }

    // Account for the permitted fetches
    _FETCH_COUNT += urlsToFetch.length;
    try {
      const today = new Date().toISOString().slice(0, 10);
      this.Props.setFetchState({
        date: today,
        count: _FETCH_COUNT,
      });
    } catch (e) {}

    // 🛡️ CIRCUIT BREAKER: Determine remote capability
    // If worker fails, we will disable this flag for the rest of this batch execution
    let useRemote =
      !!CONFIG.SYSTEM.REMOTE_WORKER_URL && Utils.remoteWorkerHealthy();

    // 3. Batch Processing
    const BATCH_SIZE = 100;

    for (let c = 0; c < urlsToFetch.length; c += BATCH_SIZE) {
      const chunkUrls = urlsToFetch.slice(c, c + BATCH_SIZE);

      for (let attempt = 0; attempt < CONFIG.SYSTEM.RETRY_MAX; attempt++) {
        if (keyPool.length === 0)
          throw new Error("CRITICAL: All API Keys exhausted.");

        const requests = chunkUrls.map((u) => {
          const keyObj = keyPool[Math.floor(Math.random() * keyPool.length)];
          return {
            url: u,
            method: "get",
            headers: {
              Authorization: `Bearer ${keyObj.value}`,
              "User-Agent": "ClanManagerBot/6.0 (GAS)",
              "Accept-Encoding": "gzip",
            },
            muteHttpExceptions: true,
          };
        });

        try {
          let responses;

          if (useRemote) {
            try {
              // Offload to remote worker
              responses = Utils.remoteFetchChunk(chunkUrls, keyPool, scoring);
            } catch (workerErr) {
              useRemote = false; // Disable remote for subsequent retries/batches
              throw workerErr; // Throw to trigger the catch block below and retry via local
            }
          } else {
            // Local Fetch (Fallback or Default)
            responses = UrlFetchApp.fetchAll(requests);
          }

          let retryChunk = false;

          responses.forEach((r, i) => {
            const code = r.getResponseCode();
            const url = chunkUrls[i];

            if (code === 200) {
              try {
                const json = JSON.parse(r.getContentText());
                _EXECUTION_CACHE.set(url, json);
                urlIndices
                  .get(url)
                  .forEach((idx) => (finalResults[idx] = json));
              } catch (e) {}
            } else if (code === 404) {
              _EXECUTION_CACHE.set(url, null);
              urlIndices.get(url).forEach((idx) => (finalResults[idx] = null));
            } else if (code === 403 || code === 429) {
              if (useRemote) {
                // If using remote worker, the worker manages key rotation.

                retryChunk = true;
              } else {
                const badKeyVal = requests[i].headers["Authorization"].replace(
                  "Bearer ",
                  "",
                );
                const keyObj = keyPool.find((k) => k.value === badKeyVal);
                const keyName = keyObj ? keyObj.name : "Unknown Key";

                keyPool = keyPool.filter((k) => k.value !== badKeyVal);
                const gIdx = CONFIG.SYSTEM.API_KEYS.findIndex(
                  (k) => k.value === badKeyVal,
                );
                if (gIdx > -1) CONFIG.SYSTEM.API_KEYS.splice(gIdx, 1);
                retryChunk = true;
              }
            } else {
              const errorBody = r.getContentText().substring(0, 200);
              console.error(
                `[API ERROR] ${code} at ${url}\nResponse: ${errorBody}`,
              );

              if (code >= 500) retryChunk = true;
            }
          });

          if (!retryChunk) break;
          if (retryChunk && attempt < CONFIG.SYSTEM.RETRY_MAX - 1) {
            Utilities.sleep(1000 * (attempt + 1));
          }
        } catch (e) {
          // If platform reports URLFETCH daily quota reached, mark and abort
          if (
            e &&
            e.message &&
            e.message.indexOf(
              "Service invoked too many times for one day: urlfetch",
            ) > -1
          ) {
            // Abort current batch but don't latch for the whole day
            return finalResults;
          }

          console.error(
            `Fetch Network Error (Attempt ${attempt + 1}): ${e.message}`,
          );
          if (attempt < CONFIG.SYSTEM.RETRY_MAX - 1) Utilities.sleep(2000);
        }
      }

      // Small pause between batches
      Utilities.sleep(200);
    }

    return finalResults;
  },

  // Remote worker fetch delegate (uses configured remote worker to offload bulk fetches)
  remoteFetchChunk: function (chunkUrls, keyPool, scoring = null) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL)
      throw new Error("No remote worker configured.");
    try {
      const payload = {
        urls: chunkUrls,
        apiKeys: (keyPool || []).map((k) => k.value),
        scoring: scoring,
      };
      const headers = { "Content-Type": "application/json" };
      if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
        headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;
      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        headers: headers,
      };
      const res = UrlFetchApp.fetch(
        CONFIG.SYSTEM.REMOTE_WORKER_URL + "/fetch",
        options,
      );
      const code = res.getResponseCode();
      if (code !== 200) throw new Error("Remote worker returned " + code);
      const body = JSON.parse(res.getContentText());
      if (!body || !Array.isArray(body.results))
        throw new Error("Invalid remote worker response");
      // Normalize into response-like objects
      return body.results.map((r) => {
        return {
          getResponseCode: function () {
            return r.code;
          },
          getContentText: function () {
            return typeof r.content === "string"
              ? r.content
              : JSON.stringify(r.content);
          },
        };
      });
    } catch (e) {
      throw e;
    }
  },

  // Check remote worker health & capabilities (with 5-min persistent caching)
  remoteWorkerHealthy: function () {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) return false;

    // 1. Tier 1: Per-execution cache
    if (_EXECUTION_CACHE.has("worker_health"))
      return _EXECUTION_CACHE.get("worker_health");

    // 2. Tier 2: Persistent cache (5-minute TTL)
    const CACHE_KEY = "WORKER_HEALTH_CACHE";
    const now = Date.now();
    try {
      const cached = this.Props.getJSON(CACHE_KEY, null);
      if (cached && now - cached.time < 300000) {
        // 5 minutes
        _EXECUTION_CACHE.set("worker_health", cached.status);
        return cached.status;
      }
    } catch (e) {}

    // 3. Tier 3: Live check
    let isHealthy = false;
    try {
      const headers = {};
      if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
        headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;
      const res = UrlFetchApp.fetch(
        CONFIG.SYSTEM.REMOTE_WORKER_URL + "/capabilities",
        {
          method: "get",
          muteHttpExceptions: true,
          headers: headers,
        },
      );
      if (res.getResponseCode() === 200) {
        isHealthy = true;
      } else {
      }
    } catch (e) {}

    // Save to all caches
    _EXECUTION_CACHE.set("worker_health", isHealthy);
    try {
      this.Props.setJSON(CACHE_KEY, { status: isHealthy, time: now });
    } catch (e) {}

    return isHealthy;
  },

  /**
   * 💾 CACHE HANDLER (Chunking for >100KB Payloads)
   */
  CacheHandler: {
    putLarge: function (key, value, expirationSec = 21600) {
      const cache = CacheService.getScriptCache();
      const CHUNK_SIZE = 90000; // 90KB safe limit

      if (value.length <= CHUNK_SIZE) {
        cache.put(key, value, expirationSec);
        cache.remove(key + "_meta");
        return;
      }

      const chunks = value.match(new RegExp(".{1," + CHUNK_SIZE + "}", "g"));
      chunks.forEach((chunk, i) => {
        cache.put(key + "_" + i, chunk, expirationSec);
      });

      cache.put(
        key + "_meta",
        JSON.stringify({ count: chunks.length }),
        expirationSec,
      );
      cache.remove(key);
    },

    getLarge: function (key) {
      const cache = CacheService.getScriptCache();
      const standard = cache.get(key);
      if (standard) return standard;

      const meta = cache.get(key + "_meta");
      if (meta) {
        try {
          const { count } = JSON.parse(meta);
          const keys = [];
          for (let i = 0; i < count; i++) {
            keys.push(key + "_" + i);
          }

          const chunks = cache.getAll(keys);
          let fullString = "";
          for (let i = 0; i < count; i++) {
            const part = chunks[key + "_" + i];
            if (!part) return null;
            fullString += part;
          }
          return fullString;
        } catch (e) {
          return null;
        }
      }
      return null;
    },
  },

  formatDate: (date) =>
    !date || isNaN(date.getTime())
      ? ""
      : Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, "yyyy-MM-dd"),

  parseRoyaleApiDate: function (dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    if (/^\d{8}T\d{6}/.test(dateStr)) {
      const y = parseInt(dateStr.substr(0, 4), 10);
      const m = parseInt(dateStr.substr(4, 2), 10) - 1;
      const d = parseInt(dateStr.substr(6, 2), 10);
      const h = parseInt(dateStr.substr(9, 2), 10);
      const min = parseInt(dateStr.substr(11, 2), 10);
      const s = parseInt(dateStr.substr(13, 2), 10);
      return new Date(Date.UTC(y, m, d, h, min, s));
    }
    return new Date(dateStr);
  },

  calculateWarWeekId: function (d) {
    if (!d || isNaN(d.getTime())) return "Unknown";
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum =
      1 +
      Math.round(
        ((date.getTime() - week1.getTime()) / 86400000 -
          3 +
          ((week1.getDay() + 6) % 7)) /
          7,
      );
    const yearShort = date.getFullYear().toString().slice(-2);
    return `${yearShort}W${weekNum.toString().padStart(2, "0")}`;
  },

  parseWarHistory: (histStr) => {
    if (!histStr || histStr === "-" || typeof histStr !== "string")
      return new Map();
    const historyMap = new Map();
    histStr.split(" | ").forEach((entry) => {
      const parts = entry.trim().split(" ");
      if (parts.length === 2) historyMap.set(parts[1], Number(parts[0]));
    });
    return historyMap;
  },

  shuffleArray: (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  /**
   * 🛡️ ROBUST BACKUP SYSTEM
   * - Rotates backups (1-5).
   * - Compares content to prevent redundant backups.
   * - SELF-HEALING: Enforces Global Sort Order and Visibility on every run.
   */
  backupSheet: function (ss, sheetName) {
    try {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      const MAX_BACKUPS = 5;
      const backup1Name = `Backup 1 ${sheetName}`;
      const existingBackup1 = ss.getSheetByName(backup1Name);

      // 1. REDUNDANCY CHECK: Skip if data hasn't changed
      if (existingBackup1) {
        const currentLastRow = sheet.getLastRow();
        const currentLastCol = sheet.getLastColumn();

        // If dimensions match, check content
        if (
          currentLastRow === existingBackup1.getLastRow() &&
          currentLastCol === existingBackup1.getLastColumn()
        ) {
          // Optimization: Skip Row 1 (Timestamps often change, data does not)
          const startRow = currentLastRow > 1 ? 2 : 1;
          const numRows =
            currentLastRow > 1 ? currentLastRow - startRow + 1 : 1;

          if (currentLastRow > 0) {
            const currentData = sheet
              .getRange(startRow, 1, numRows, currentLastCol)
              .getValues();
            const backupData = existingBackup1
              .getRange(startRow, 1, numRows, currentLastCol)
              .getValues();

            // Fast Stringify comparison
            if (JSON.stringify(currentData) === JSON.stringify(backupData)) {
              console.log(
                `🛡️ Backup: Skipped for '${sheetName}' (Content matches Backup 1).`,
              );
              // Even if skipped, we MUST run the Global Hygiene logic to fix any sorting errors
              this.enforceGlobalTabHygiene(ss);
              return;
            }
          }
        }
      }

      console.log(`🛡️ Creating new backup for '${sheetName}'...`);

      // 2. ROTATION: Delete Oldest, Shift Others
      const oldestName = `Backup ${MAX_BACKUPS} ${sheetName}`;
      const oldest = ss.getSheetByName(oldestName);
      if (oldest) ss.deleteSheet(oldest);

      for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
        const currentName = `Backup ${i} ${sheetName}`;
        const nextName = `Backup ${i + 1} ${sheetName}`;
        const existing = ss.getSheetByName(currentName);
        if (existing) existing.setName(nextName);
      }

      // 3. CREATION: Copy current
      const copy = sheet.copyTo(ss);
      copy.setName(backup1Name);
      copy.setTabColor("#cccccc"); // Set Gray color for backups

      // 4. GLOBAL HYGIENE: Enforce Order and Visibility for ALL tabs
      // This ensures that even if one tab acted, the whole workbook is tidied up.
      this.enforceGlobalTabHygiene(ss);

      // Activate source to be safe
      sheet.activate();
    } catch (e) {
      console.warn(`⚠️ Backup Failed for '${sheetName}': ${e.message}`);
    }
  },

  /**
   * GLOBAL HYGIENE PROTOCOL (AGGRESSIVE)
   * Enforces strict visibility and ordering for the entire workbook.
   * STRATEGY: Whitelist only main tabs. HIDE EVERYTHING ELSE.
   */
  enforceGlobalTabHygiene: function (ss) {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Define the Whitelist (The ONLY tabs allowed to be seen)
    // Order matters here for the final sort.
    const VISIBLE_WHITELIST = [
      CONFIG.SHEETS.DB,
      CONFIG.SHEETS.LB,
      CONFIG.SHEETS.HH,
    ];

    // 2. Scan ALL sheets in the workbook
    const allSheets = ss.getSheets();

    allSheets.forEach((sheet) => {
      const name = sheet.getName();

      // A. AGGRESSIVE VISIBILITY ENFORCEMENT
      if (VISIBLE_WHITELIST.includes(name)) {
        // Must be Visible
        if (sheet.isSheetHidden()) sheet.showSheet();
      } else {
        // Must be Hidden (Backups, random sheets, errors, duplicates)
        if (!sheet.isSheetHidden()) sheet.hideSheet();
      }
    });

    // 3. ENFORCE ORDER (1, 2, 3...)
    // We sort visible main tabs first, then hidden backup clusters.
    const ALL_SORT_ORDER = [...VISIBLE_WHITELIST];

    // Add backup patterns for each main sheet (1-5)
    VISIBLE_WHITELIST.forEach((baseName) => {
      for (let i = 1; i <= 5; i++) {
        ALL_SORT_ORDER.push(`Backup ${i} ${baseName}`);
      }
    });

    ALL_SORT_ORDER.forEach((name, index) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        const targetIndex = index + 1; // 1-based index
        if (sheet.getIndex() !== targetIndex) {
          try {
            // Optimization: If sheet is hidden, we don't NEED to activate it to move it in modern GAS,
            // but moveActiveSheet is more reliable across different environment states.
            // However, setActiveSheet on a hidden sheet can be problematic.
            // Let's use the spreadsheet.moveSheet() method if available, or stay with moveActiveSheet safely.
            ss.setActiveSheet(sheet);
            ss.moveActiveSheet(targetIndex);
          } catch (e) {
            console.warn(
              `Hygiene: Could not move '${name}' to ${targetIndex} - ${e.message}`,
            );
          }
        }
      }
    });

    // 4. COMMIT CHANGES
    SpreadsheetApp.flush();
  },

  drawMobileCheckbox: function (sheet) {
    if (!sheet) return;
    const mobileTrigger = sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || "A1");
    if (
      mobileTrigger.getDataValidation() == null ||
      mobileTrigger.getDataValidation().getCriteriaType() !=
        SpreadsheetApp.DataValidationCriteria.CHECKBOX
    ) {
      mobileTrigger.insertCheckboxes();
    }
    mobileTrigger
      .setBackground(null)
      .setFontColor(null)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setNote(
        '⚡ QUICK UPDATE:\nClick/Tap this checkbox to run the update for this specific tab.\n(Requires "Enable Mobile Controls" setup once).',
      );
  },

  refreshMobileControls: function (ss) {
    const sheets = [CONFIG.SHEETS.DB, CONFIG.SHEETS.LB, CONFIG.SHEETS.HH];
    sheets.forEach((name) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        Utils.drawMobileCheckbox(sheet);
        sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || "A1").setValue(false);
      }
    });
  },

  applyStandardLayout: function (
    sheet,
    contentRows,
    contentCols,
    optHeaders = null,
  ) {
    if (!sheet) return;

    const L = CONFIG.LAYOUT;
    const DATA_START_ROW = L.DATA_START_ROW;
    const HEADER_ROW = 2;
    const STATUS_ROW = 1;
    const COL_BUFFER_LEFT = 1;
    const COL_DATA_START = 2;

    if (Array.isArray(optHeaders) && optHeaders.length > 0) {
      contentCols = optHeaders.length;
    }

    const lastDataRow = DATA_START_ROW - 1 + Math.max(contentRows, 0);
    const totalRows = Math.max(lastDataRow + 1, DATA_START_ROW + 1);
    const lastDataCol = COL_DATA_START - 1 + contentCols;
    const totalCols = lastDataCol + 1;

    const currentRows = sheet.getMaxRows();
    const currentCols = sheet.getMaxColumns();

    if (currentRows < totalRows)
      sheet.insertRowsAfter(currentRows, totalRows - currentRows);
    if (currentCols < totalCols)
      sheet.insertColumnsAfter(currentCols, totalCols - currentCols);
    if (currentRows > totalRows)
      sheet.deleteRows(totalRows + 1, currentRows - totalRows);
    if (currentCols > totalCols)
      sheet.deleteColumns(totalCols + 1, currentCols - totalCols);

    try {
      sheet.setColumnWidth(COL_BUFFER_LEFT, L.BUFFER_SIZE);
      sheet.setColumnWidth(totalCols, L.BUFFER_SIZE);
      sheet.setRowHeight(totalRows, L.BUFFER_SIZE);
    } catch (e) {
      console.warn("Layout: Resize buffer failed", e);
    }

    const buffers = [];
    if (totalRows >= 2)
      buffers.push(sheet.getRange(2, COL_BUFFER_LEFT, totalRows - 1, 1));
    buffers.push(sheet.getRange(1, totalCols, totalRows, 1));
    buffers.push(sheet.getRange(totalRows, 1, 1, totalCols));

    buffers.forEach((rng) => {
      rng
        .setBackground(null)
        .clearContent()
        .clearDataValidations()
        .clearNote()
        .setBorder(false, false, false, false, false, false);
    });

    Utils.drawMobileCheckbox(sheet);

    if (contentCols > 0) {
      sheet.setColumnWidths(COL_DATA_START, contentCols, 100);

      sheet.getRange(STATUS_ROW, 1, 1, totalCols).breakApart();
      const statusRange = sheet.getRange(
        STATUS_ROW,
        COL_DATA_START,
        1,
        contentCols,
      );
      statusRange
        .merge()
        .setHorizontalAlignment("left")
        .setVerticalAlignment("middle")
        .setFontWeight("bold")
        .setFontColor("#888888");

      const tableRows = 1 + contentRows;
      const tableRange = sheet.getRange(
        HEADER_ROW,
        COL_DATA_START,
        tableRows,
        contentCols,
      );
      const existingBandings = sheet.getBandings();
      if (existingBandings) existingBandings.forEach((b) => b.remove());
      tableRange.applyRowBanding(
        SpreadsheetApp.BandingTheme.LIGHT_GREY,
        true,
        false,
      );
      tableRange.setBorder(true, true, true, true, null, null);

      const headerRange = sheet.getRange(
        HEADER_ROW,
        COL_DATA_START,
        1,
        contentCols,
      );
      if (Array.isArray(optHeaders) && optHeaders.length > 0) {
        headerRange.setValues([optHeaders]);
      }
      headerRange
        .setBorder(true, true, true, true, true, true)
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle")
        .setWrap(true);

      if (contentRows > 0) {
        const dataRange = sheet.getRange(
          DATA_START_ROW,
          COL_DATA_START,
          contentRows,
          contentCols,
        );
        dataRange
          .setHorizontalAlignment("center")
          .setVerticalAlignment("middle")
          .setWrap(false);
      }
    }
    sheet.setHiddenGridlines(true);
  },

  /**
   * 🏗️ DYNAMIC SCHEMA RESOLVER
   * Analyzes a sheet with standard headers and returns a mapping of internal keys
   * to their current column indices (0-based).
   */
  resolveSchemaIndices: function (
    sheet,
    headerMap,
    headerRow = 2,
    startCol = 1, // Start at Column A (Absolute Indexing)
  ) {
    if (!sheet) return {};

    // Read a wide range of headers to be safe (up to 40 columns)
    const headers = sheet.getRange(headerRow, startCol, 1, 40).getValues()[0];
    const resolved = {};

    Object.keys(headerMap).forEach((key) => {
      const targetLabel = headerMap[key].toLowerCase().trim();
      const idx = headers.findIndex(
        (h) =>
          String(h || "")
            .toLowerCase()
            .trim() === targetLabel,
      );

      if (idx !== -1) {
        resolved[key] = idx;
      } else {
        console.warn(
          `Dynamic Schema: Could not find column '${headerMap[key]}' in ${sheet.getName()}.`,
        );
      }
    });

    return resolved;
  },

  /**
   * ⚡ BOOT DYNAMIC SCHEMA
   * Automatically updates the CONFIG.SCHEMA indices based on the actual sheet live layout.
   */
  bootDynamicSchema: function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;

    console.log("⚡ Booting Dynamic Schema Sync...");

    const lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
    if (lbSheet) {
      const resolvedLB = this.resolveSchemaIndices(
        lbSheet,
        CONFIG.SCHEMA.LB_HEADERS,
      );
      Object.assign(CONFIG.SCHEMA.LB, resolvedLB);
    }

    const hhSheet = ss.getSheetByName(CONFIG.SHEETS.HH);
    if (hhSheet) {
      const resolvedHH = this.resolveSchemaIndices(
        hhSheet,
        CONFIG.SCHEMA.HH_HEADERS,
      );
      Object.assign(CONFIG.SCHEMA.HH, resolvedHH);
    }
  },
};
