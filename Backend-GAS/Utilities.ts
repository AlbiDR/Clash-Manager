
/**
 * ============================================================================
 * 🛠️ MODULE: UTILITIES (TypeScript Edition)
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
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 */

import type { ScoringWeights } from "./SharedTypes";
import type { AppConfig } from "./Configuration";

// Global Version Constant
// @ts-ignore
const VER_UTILITIES = "11.0.0";

declare var SpreadsheetApp: any;
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var CacheService: any;
declare var ContentService: any;
declare var Utilities: any;
declare var ScriptApp: any;
declare var Logger: any;
declare var module: any;

declare namespace GoogleAppsScript {
  export namespace Events {
    export type DoGet = any;
    export type DoPost = any;
    export type AppsScriptEvent = any;
    export type SheetsOnEdit = any;
  }
  export namespace Spreadsheet {
    export type Sheet = any;
    export type Spreadsheet = any;
    export type Range = any;
    export type Banding = any;
  }
  export namespace Content {
    export type TextOutput = any;
  }
}

// Global CONFIG and other GAS services declaration
declare const CONFIG: AppConfig;

// 🧠 EXECUTION CACHE: Stores API responses for the duration of one script execution.
const _EXECUTION_CACHE = new Map<string, any>();

// 🛡️ API BUDGET: Prevents runaway execution from burning daily quotas.
let _FETCH_COUNT = 0;
const MAX_FETCH_PER_EXECUTION = 100000;

/**
 * 🛠️ UTILITIES INTERFACE
 */
export interface AppUtils {
  executeSafely<T>(lockKey: string, callback: () => T): T;
  Props: {
    get(key: string, defaultVal?: string | null): string | null;
    set(key: string, val: string | number | boolean): void;
    getJSON<T>(key: string, defaultVal?: T): T;
    setJSON(key: string, val: any): boolean;
    getChunked<T>(baseKey: string, defaultVal?: T): T;
    setChunked(baseKey: string, val: any): boolean;
    getFetchState(): { date?: string; count?: number };
    setFetchState(stateObj: { date: string; count: number }): boolean;
    delete(key: string): void;
  };
  auditKeysRemote(
    keys: Array<{ name: string; value: string }>,
  ): Array<{ name: string; success: boolean; error?: string }> | null;
  scanTournamentsRemote(
    tourneyTags: string[],
    minTrophies: number,
    blacklistSet: Set<string> | string[],
    scoring?: ScoringWeights | null,
  ): any[];
  fetchPublicJson(type: "members" | "warlog"): any[] | null;
  fetchClanDataSmart(cleanTag: string): {
    members: { items: any[] } | null;
    race: { clan: any } | null;
    history: Record<string, Record<string, number>> | null;
    log: any | null;
  };
  fetchRoyaleAPI(urls: string[], scoring?: ScoringWeights | null): any[];
  remoteFetchChunk(
    chunkUrls: string[],
    keyPool: Array<{ name: string; value: string }>,
    scoring?: ScoringWeights | null,
  ): any[];
  remoteWorkerHealthy(): boolean;
  CacheHandler: {
    putLarge(key: string, value: string, expirationSec?: number): void;
    getLarge(key: string): string | null;
  };
  formatDate(date: Date | null | undefined): string;
  parseRoyaleApiDate(dateStr: string | Date | null | undefined): Date;
  calculateWarWeekId(d: Date | null | undefined): string;
  parseWarHistory(histStr: string | null | undefined): Map<string, number>;
  shuffleArray<T>(array: T[]): T[];
  backupSheet(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    sheetName: string,
  ): void;
  enforceGlobalTabHygiene(ss?: GoogleAppsScript.Spreadsheet.Spreadsheet): void;
  drawMobileCheckbox(sheet: GoogleAppsScript.Spreadsheet.Sheet): void;
  refreshMobileControls(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void;
  applyStandardLayout(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    contentRows: number,
    contentCols: number,
    optHeaders?: string[] | null,
  ): void;
  resolveSchemaIndices(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headerMap: Record<string, string>,
    headerRow?: number,
    startCol?: number,
  ): Record<string, number>;
  bootDynamicSchema(): void;
  /**
   * 🛡️ ROBUST PROPERTY RESOLVER
   */
  resolveProperty(obj: any, priorityKeys: string[], fallback?: any): any;
  resolveWarFame(p: any): number;
}

const Utils: AppUtils = {
  /**
   * 🔒 EXECUTE SAFELY (Mutex Lock)
   */
  executeSafely: function (lockKey, callback) {
    const lock = LockService.getScriptLock();
    try {
      const success = lock.tryLock(60000);
      if (!success) {
        try {
          SpreadsheetApp.getActiveSpreadsheet().toast(
            "System is busy. Please try again in 30s.",
            "⚠️ Locked",
          );
        } catch (e) {}
        throw new Error(`System Busy: Could not acquire lock for ${lockKey}`);
      }
      return callback();
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * 💾 PROPS MANAGER
   */
  Props: {
    // @ts-ignore
    _service:
      typeof PropertiesService !== "undefined"
        ? PropertiesService.getScriptProperties()
        : null,

    get: function (this: any, key: string, defaultVal: string | null = null) {
      if (!this._service) return defaultVal;
      const val = this._service.getProperty(key);
      return val !== null ? val : defaultVal;
    },

    set: function (this: any, key: string, val: string | number | boolean) {
      if (!this._service) return;
      this._service.setProperty(key, String(val));
    },

    getJSON: function (this: any, key: string, defaultVal: any = {}) {
      const raw = this.get(key);
      if (!raw) return defaultVal;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return defaultVal;
      }
    },

    setJSON: function (this: any, key: string, val: any) {
      try {
        const str = JSON.stringify(val);
        if (str.length > 9000) return false;
        if (!this._service) return false;
        this._service.setProperty(key, str);
        return true;
      } catch (e) {
        console.error(`⚠️ Props: JSON Stringify error for '${key}'`);
        return false;
      }
    },

    getChunked: function (this: any, baseKey: string, defaultVal: any = {}) {
      try {
        if (!this._service) return defaultVal;
        const simple = this._service.getProperty(baseKey);
        if (simple) return JSON.parse(simple);

        const allProps = this._service.getProperties();
        const chunkPattern = new RegExp(`^${baseKey}_(\\d+)$`);
        const chunks: Array<{ index: number; val: string }> = [];

        Object.keys(allProps).forEach((k) => {
          const match = k.match(chunkPattern);
          if (match) {
            chunks.push({ index: parseInt(match[1]), val: allProps[k] });
          }
        });

        if (chunks.length === 0) return defaultVal;

        chunks.sort((a, b) => a.index - b.index);
        const fullString = chunks.map((c) => c.val).join("");
        return JSON.parse(fullString);
      } catch (e) {
        console.error(`🧩 Props: Chunk read error for '${baseKey}'`);
        return defaultVal;
      }
    },

    setChunked: function (this: any, baseKey: string, val: any) {
      try {
        if (!this._service) return false;
        const fullString = JSON.stringify(val);
        const CHUNK_SIZE = 8500;
        const totalChunks = Math.ceil(fullString.length / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
          const chunk = fullString.substr(i * CHUNK_SIZE, CHUNK_SIZE);
          this._service.setProperty(`${baseKey}_${i}`, chunk);
        }

        const allProps = this._service.getProperties();
        const chunkPattern = new RegExp(`^${baseKey}_(\\d+)$`);

        Object.keys(allProps).forEach((k) => {
          const match = k.match(chunkPattern);
          if (match) {
            const index = parseInt(match[1]);
            if (index >= totalChunks) this._service.deleteProperty(k);
          }
        });

        this._service.deleteProperty(baseKey);
        return true;
      } catch (e) {
        console.error(`🧩 Props: Chunk write error for '${baseKey}'`);
        return false;
      }
    },

    getFetchState: function (this: any) {
      return this.getJSON("FETCH_STATE", {});
    },

    setFetchState: function (this: any, stateObj: any) {
      return this.setJSON("FETCH_STATE", stateObj);
    },

    delete: function (this: any, key: string) {
      if (this._service) this._service.deleteProperty(key);
    },
  },

  /**
   * 🔑 REMOTE AUDIT DELEGATE
   */
  auditKeysRemote: function (keys) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) return null;

    try {
      const payload = {
        apiKeys: keys.map((k) => k.value),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
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

      if (res.getResponseCode() !== 200) return null;

      const json = JSON.parse(res.getContentText());
      if (!json.results || !Array.isArray(json.results)) return null;

      return keys.map((k) => {
        const remoteResult = json.results.find((r: any) => r.key === k.value);
        if (!remoteResult) {
          return { name: k.name, success: false, error: "Worker skipped key" };
        }
        if (remoteResult.status === 200) return { name: k.name, success: true };

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
   */
  scanTournamentsRemote: function (
    tourneyTags,
    minTrophies,
    blacklistSet,
    scoring = null,
  ) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) {
      throw new Error("Worker not configured for scanning");
    }

    const keyPool = CONFIG.SYSTEM.API_KEYS;
    const blacklistArray = Array.isArray(blacklistSet)
      ? blacklistSet
      : Array.from(blacklistSet);

    try {
      const payload = {
        tags: tourneyTags,
        apiKeys: keyPool.map((k) => k.value),
        blacklist: blacklistArray,
        minTrophies: minTrophies,
        scoring: scoring,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
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
      throw e;
    }
  },

  /**
   * 🌐 PUBLIC API OFFLOAD
   */
  fetchPublicJson: function (type) {
    const useRemote =
      !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();

    if (!useRemote) return null;

    try {
      const payload = {
        tag: CONFIG.SYSTEM.CLAN_TAG,
        type: type,
        apiKeys: CONFIG.SYSTEM.API_KEYS.map((k) => k.value),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
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
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  /**
   * ⚡ SMART CLAN FETCH
   */
  fetchClanDataSmart: function (cleanTag) {
    const useRemote =
      !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();

    if (useRemote) {
      try {
        const payload = {
          tag: decodeURIComponent(cleanTag),
          apiKeys: CONFIG.SYSTEM.API_KEYS.map((k) => k.value),
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
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
          return {
            members: { items: json.members.items },
            race: { clan: json.race.clan },
            history: json.history,
            log: null,
          };
        }
      } catch (e) {}
    }

    const urls = [
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`,
    ];

    const [membersData, raceData, logData] = this.fetchRoyaleAPI(urls);
    return {
      members: membersData,
      race: raceData,
      history: null,
      log: logData,
    };
  },

  /**
   * ⚡ ULTRA-OPTIMIZED FETCH ENGINE
   */
  fetchRoyaleAPI: function (urls, scoring = null) {
    if (!urls || urls.length === 0) return [];

    try {
      const st = this.Props.getFetchState();
      const today = new Date().toISOString().slice(0, 10);
      if (st && st.date === today) {
        _FETCH_COUNT = Number(st.count || 0);
      } else {
        _FETCH_COUNT = 0;
      }
    } catch (e) {}

    let keyPool = [...CONFIG.SYSTEM.API_KEYS];
    if (!keyPool || keyPool.length === 0) {
      throw new Error("CRITICAL: No API Keys found.");
    }

    const finalResults = new Array(urls.length).fill(null);
    let urlsToFetch: string[] = [];
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

    const remainingQuota = MAX_FETCH_PER_EXECUTION - _FETCH_COUNT;
    if (remainingQuota <= 0) {
      console.error(
        `⚠️ API Budget Exceeded (${_FETCH_COUNT}/${MAX_FETCH_PER_EXECUTION})`,
      );
      return finalResults;
    }

    if (urlsToFetch.length > remainingQuota) {
      urlsToFetch = urlsToFetch.slice(0, remainingQuota);
    }

    _FETCH_COUNT += urlsToFetch.length;
    try {
      const today = new Date().toISOString().slice(0, 10);
      this.Props.setFetchState({ date: today, count: _FETCH_COUNT });
    } catch (e) {}

    let useRemote =
      !!CONFIG.SYSTEM.REMOTE_WORKER_URL && this.remoteWorkerHealthy();

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
            method: "get" as const,
            headers: {
              Authorization: `Bearer ${keyObj.value}`,
              "User-Agent": "ClanManagerBot/6.0 (GAS)",
              "Accept-Encoding": "gzip",
            },
            muteHttpExceptions: true,
          };
        });

        try {
          let responses: any[];

          if (useRemote) {
            try {
              responses = this.remoteFetchChunk(chunkUrls, keyPool, scoring);
            } catch (workerErr) {
              useRemote = false;
              throw workerErr;
            }
          } else {
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
                  .get(url)!
                  .forEach((idx) => (finalResults[idx] = json));
              } catch (e) {}
            } else if (code === 404) {
              _EXECUTION_CACHE.set(url, null);
              urlIndices.get(url)!.forEach((idx) => (finalResults[idx] = null));
            } else if (code === 403 || code === 429) {
              if (!useRemote) {
                const badKeyVal = requests[i].headers["Authorization"].replace(
                  "Bearer ",
                  "",
                );
                keyPool = keyPool.filter((k) => k.value !== badKeyVal);
              }
              retryChunk = true;
            } else {
              if (code >= 500) retryChunk = true;
            }
          });

          if (!retryChunk) break;
          // @ts-ignore
          if (retryChunk && attempt < CONFIG.SYSTEM.RETRY_MAX - 1)
            Utilities.sleep(1000 * (attempt + 1));
        } catch (e: any) {
          if (e && e.message && e.message.indexOf("urlfetch") > -1)
            return finalResults;
          // @ts-ignore
          if (attempt < CONFIG.SYSTEM.RETRY_MAX - 1) Utilities.sleep(2000);
        }
      }
      // @ts-ignore
      Utilities.sleep(200);
    }

    return finalResults;
  },

  /**
   * Remote worker fetch delegate
   */
  remoteFetchChunk: function (chunkUrls, keyPool, scoring = null) {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL)
      throw new Error("No remote worker configured.");
    try {
      const payload = {
        urls: chunkUrls,
        apiKeys: (keyPool || []).map((k) => k.value),
        scoring: scoring,
      };
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
        headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;

      const res = UrlFetchApp.fetch(
        CONFIG.SYSTEM.REMOTE_WORKER_URL + "/fetch",
        {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
          headers: headers,
        },
      );

      if (res.getResponseCode() !== 200)
        throw new Error("Remote worker error " + res.getResponseCode());
      const body = JSON.parse(res.getContentText());
      if (!body || !Array.isArray(body.results))
        throw new Error("Invalid remote response");

      return body.results.map((r: any) => ({
        getResponseCode: () => r.code,
        getContentText: () =>
          typeof r.content === "string" ? r.content : JSON.stringify(r.content),
      }));
    } catch (e) {
      throw e;
    }
  },

  /**
   * Check remote worker health
   */
  remoteWorkerHealthy: function () {
    if (!CONFIG.SYSTEM.REMOTE_WORKER_URL) return false;
    if (_EXECUTION_CACHE.has("worker_health"))
      return _EXECUTION_CACHE.get("worker_health");

    const CACHE_KEY = "WORKER_HEALTH_CACHE";
    const now = Date.now();
    try {
      const cached = this.Props.getJSON(CACHE_KEY, null) as {
        status: boolean;
        time: number;
      } | null;
      if (cached && now - cached.time < 300000) {
        _EXECUTION_CACHE.set("worker_health", cached.status);
        return cached.status;
      }
    } catch (e) {}

    let isHealthy = false;
    try {
      const headers: Record<string, string> = {};
      if (CONFIG.SYSTEM.REMOTE_WORKER_SECRET)
        headers.Authorization = `Bearer ${CONFIG.SYSTEM.REMOTE_WORKER_SECRET}`;
      const res = UrlFetchApp.fetch(
        CONFIG.SYSTEM.REMOTE_WORKER_URL + "/capabilities",
        { method: "get", muteHttpExceptions: true, headers: headers },
      );
      if (res.getResponseCode() === 200) isHealthy = true;
    } catch (e) {}

    _EXECUTION_CACHE.set("worker_health", isHealthy);
    try {
      this.Props.setJSON(CACHE_KEY, { status: isHealthy, time: now });
    } catch (e) {}

    return isHealthy;
  },

  /**
   * 💾 CACHE HANDLER
   */
  CacheHandler: {
    putLarge: function (key, value, expirationSec = 21600) {
      const cache = CacheService.getScriptCache();
      const CHUNK_SIZE = 90000;

      if (value.length <= CHUNK_SIZE) {
        cache.put(key, value, expirationSec);
        cache.remove(key + "_meta");
        return;
      }

      const chunks = value.match(new RegExp(".{1," + CHUNK_SIZE + "}", "g"))!;
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
          for (let i = 0; i < count; i++) keys.push(key + "_" + i);

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
      : // @ts-ignore
        Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, "yyyy-MM-dd"),

  parseRoyaleApiDate: function (dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr === "string" && /^\d{8}T\d{6}/.test(dateStr)) {
      const y = parseInt(dateStr.substr(0, 4), 10);
      const m = parseInt(dateStr.substr(4, 2), 10) - 1;
      const d = parseInt(dateStr.substr(6, 2), 10);
      const h = parseInt(dateStr.substr(9, 2), 10);
      const min = parseInt(dateStr.substr(11, 2), 10);
      const s = parseInt(dateStr.substr(13, 2), 10);
      return new Date(Date.UTC(y, m, d, h, min, s));
    }
    return new Date(dateStr as any);
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
      return new Map<string, number>();
    const historyMap = new Map<string, number>();
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
   */
  backupSheet: function (ss, sheetName) {
    try {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      const MAX_BACKUPS = 5;
      const backup1Name = `Backup 1 ${sheetName}`;
      const existingBackup1 = ss.getSheetByName(backup1Name);

      if (existingBackup1) {
        const currentLastRow = sheet.getLastRow();
        const currentLastCol = sheet.getLastColumn();

        if (
          currentLastRow === existingBackup1.getLastRow() &&
          currentLastCol === existingBackup1.getLastColumn()
        ) {
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

            if (JSON.stringify(currentData) === JSON.stringify(backupData)) {
              console.log(`🛡️ Backup skipped for '${sheetName}'`);
              this.enforceGlobalTabHygiene(ss);
              return;
            }
          }
        }
      }

      console.log(`🛡️ Creating backup for '${sheetName}'...`);
      const oldestName = `Backup ${MAX_BACKUPS} ${sheetName}`;
      const oldest = ss.getSheetByName(oldestName);
      if (oldest) ss.deleteSheet(oldest);

      for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
        const currentName = `Backup ${i} ${sheetName}`;
        const nextName = `Backup ${i + 1} ${sheetName}`;
        const existing = ss.getSheetByName(currentName);
        if (existing) existing.setName(nextName);
      }

      const copy = sheet.copyTo(ss);
      copy.setName(backup1Name);
      copy.setTabColor("#cccccc");
      this.enforceGlobalTabHygiene(ss);
      sheet.activate();
    } catch (e: any) {
      console.warn(`⚠️ Backup Failed for '${sheetName}': ${e.message}`);
    }
  },

  /**
   * GLOBAL HYGIENE PROTOCOL
   */
  enforceGlobalTabHygiene: function (ss) {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    const VISIBLE_WHITELIST = [
      CONFIG.SHEETS.DB,
      CONFIG.SHEETS.LB,
      CONFIG.SHEETS.HH,
    ];
    const allSheets = ss.getSheets();

    allSheets.forEach((sheet: GoogleAppsScript.Spreadsheet.Sheet) => {
      const name = sheet.getName();
      if (VISIBLE_WHITELIST.includes(name)) {
        if (sheet.isSheetHidden()) sheet.showSheet();
      } else {
        if (!sheet.isSheetHidden()) sheet.hideSheet();
      }
    });

    const ALL_SORT_ORDER = [...VISIBLE_WHITELIST];
    VISIBLE_WHITELIST.forEach((baseName) => {
      for (let i = 1; i <= 5; i++)
        ALL_SORT_ORDER.push(`Backup ${i} ${baseName}`);
    });

    ALL_SORT_ORDER.forEach((name, index) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        const targetIndex = index + 1;
        if (sheet.getIndex() !== targetIndex) {
          try {
            ss.setActiveSheet(sheet);
            ss.moveActiveSheet(targetIndex);
          } catch (e) {}
        }
      }
    });
    SpreadsheetApp.flush();
  },

  drawMobileCheckbox: function (sheet) {
    if (!sheet) return;
    const mobileTrigger = sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || "A1");
    if (
      mobileTrigger.getDataValidation() == null ||
      mobileTrigger.getDataValidation()!.getCriteriaType() !=
        SpreadsheetApp.DataValidationCriteria.CHECKBOX
    ) {
      mobileTrigger.insertCheckboxes();
    }
    mobileTrigger
      .setBackground(null)
      .setFontColor(null)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setNote("⚡ QUICK UPDATE:\n(Select to run)");
  },

  refreshMobileControls: function (ss) {
    const sheets = [CONFIG.SHEETS.DB, CONFIG.SHEETS.LB, CONFIG.SHEETS.HH];
    sheets.forEach((name) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        this.drawMobileCheckbox(sheet);
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
    if (Array.isArray(optHeaders) && optHeaders.length > 0)
      contentCols = optHeaders.length;

    const lastDataRow = L.DATA_START_ROW - 1 + Math.max(contentRows, 0);
    const totalRows = Math.max(lastDataRow + 1, L.DATA_START_ROW + 1);
    const totalCols = contentCols + 2;

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

    sheet.setColumnWidth(1, L.BUFFER_SIZE);
    sheet.setColumnWidth(totalCols, L.BUFFER_SIZE);
    sheet.setRowHeight(totalRows, L.BUFFER_SIZE);

    this.drawMobileCheckbox(sheet);

    if (contentCols > 0) {
      sheet.setColumnWidths(2, contentCols, 100);
      sheet.getRange(1, 1, 1, totalCols).breakApart();
      sheet
        .getRange(1, 2, 1, contentCols)
        .merge()
        .setHorizontalAlignment("left")
        .setFontWeight("bold")
        .setFontColor("#888888");

      const tableRange = sheet.getRange(2, 2, 1 + contentRows, contentCols);
      tableRange
        .getBandings()
        .forEach((b: GoogleAppsScript.Spreadsheet.Banding) => b.remove());
      tableRange.applyRowBanding(
        SpreadsheetApp.BandingTheme.LIGHT_GREY,
        true,
        false,
      );
      tableRange.setBorder(true, true, true, true, null, null);

      const headerRange = sheet.getRange(2, 2, 1, contentCols);
      if (Array.isArray(optHeaders) && optHeaders.length > 0)
        headerRange.setValues([optHeaders]);
      headerRange
        .setBorder(true, true, true, true, true, true)
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setWrap(true);

      if (contentRows > 0) {
        sheet
          .getRange(L.DATA_START_ROW, 2, contentRows, contentCols)
          .setHorizontalAlignment("center")
          .setWrap(false);
      }
    }
    sheet.setHiddenGridlines(true);
  },

  resolveSchemaIndices: function (
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headerMap: Record<string, string>,
    headerRow = 2,
    startCol = 1,
  ) {
    if (!sheet) return {};
    const sheetName = sheet.getName();
    const headers = sheet.getRange(headerRow, startCol, 1, 40).getValues()[0];
    const resolved: Record<string, number> = {};

    Object.keys(headerMap).forEach((key) => {
      const targetLabel = headerMap[key].toLowerCase().trim();
      const idx = headers.findIndex(
        (h: any) =>
          String(h || "")
            .toLowerCase()
            .trim() === targetLabel,
      );
      if (idx !== -1) {
        resolved[key] = idx;
      } else {
        console.warn(
          `Dynamic Schema: Could not find column '${headerMap[key]}' in ${sheetName}. Verify header exists in Row ${headerRow}.`,
        );
      }
    });
    return resolved;
  },

  bootDynamicSchema: function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    console.info("⚡ Booting Dynamic Schema Sync...");
    const lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
    if (lbSheet)
      Object.assign(
        CONFIG.SCHEMA.LB,
        this.resolveSchemaIndices(lbSheet, CONFIG.SCHEMA.LB_HEADERS),
      );
    const hhSheet = ss.getSheetByName(CONFIG.SHEETS.HH);
    if (hhSheet)
      Object.assign(
        CONFIG.SCHEMA.HH,
        this.resolveSchemaIndices(hhSheet, CONFIG.SCHEMA.HH_HEADERS),
      );
  },
  /**
   * 🛡️ ROBUST PROPERTY RESOLVER
   * Ingests an object and returns the first matching value from a list of priority keys.
   */
  resolveProperty: function (obj, priorityKeys, fallback = 0) {
    if (!obj || typeof obj !== "object") return fallback;
    for (const key of priorityKeys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return fallback;
  },

  /**
   * ⚔️ UNIFIED WAR FAME RESOLVER
   * Standardized across Service, Logger, Leaderboard, and Recruiter.
   * Logic: Uses truthy check to skip 0/undefined/null and find the first active field.
   */
  resolveWarFame: function (p) {
    if (!p || typeof p !== "object") return 0;
    return (
      Number(
        p.fame || p.medals || p.periodPoints || p.repairPoints || 0
      )
    );
  },
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Utils;
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { Utils, VER_UTILITIES });

export default Utils;
