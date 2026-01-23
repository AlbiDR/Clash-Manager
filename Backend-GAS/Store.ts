
/**
 * ============================================================================
 * 💾 MODULE: STORE (Persistence Layer)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Centralized persistence engine for Google Apps Script.
 * ⚙️ CAPABILITIES:
 *    1. Properties Manager: Safe JSON handling for Script Properties.
 *    2. Chunking Engine: Handles >9KB properties and >100KB cache items.
 *    3. Cache Manager: High-capacity caching with auto-segmentation.
 * 
 * 🛡️ ARCHITECTURE: 
 *    - Pure Service (No dependencies on Business Logic).
 *    - Global Singleton 'Store'.
 * ============================================================================
 */

declare var PropertiesService: GoogleAppsScript.Properties.PropertiesService;
declare var CacheService: GoogleAppsScript.Cache.CacheService;
declare var module: any;

const LIMITS = {
  // PropertiesService is ~9KB per property. We leave 500b buffer.
  PROPS_CHUNK_SIZE: 8500,
  PROPS_MAX_SINGLE: 9000,
  // CacheService is ~100KB. We leave 10KB buffer.
  CACHE_CHUNK_SIZE: 90000,
  // Default cache expiration in seconds (6 hours)
  CACHE_EXPIRATION: 21600,
};

/**
 * Escapes characters that have special meaning in regular expressions
 */
const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface IStore {
  props: {
    _service?: any;
    get(key: string, defaultVal?: string | null): string | null;
    set(key: string, val: string | number | boolean): void;
    getJSON<T>(key: string, defaultVal?: T): T;
    setJSON(key: string, val: any): boolean;
    getChunked<T>(baseKey: string, defaultVal?: T): T;
    setChunked(baseKey: string, val: any): boolean;
    delete(key: string): void;
  };
  cache: {
    putLarge(key: string, value: string, expirationSec?: number): void;
    getLarge(key: string): string | null;
  };
}

const Store: IStore = {
  /**
   * 💾 PROPS MANAGER
   * Wraps PropertiesService with JSON and Chunking support.
   */
  props: {
    get _service() {
      // @ts-ignore
      return typeof PropertiesService !== "undefined"
        ? PropertiesService.getScriptProperties()
        : null;
    },

    get(key: string, defaultVal: string | null = null) {
      if (!this._service) return defaultVal;
      const val = this._service.getProperty(key);
      return val !== null ? val : defaultVal;
    },

    set(key: string, val: string | number | boolean) {
      if (!this._service) return;
      this._service.setProperty(key, String(val));
    },

    getJSON<T>(key: string, defaultVal: T = {} as T): T {
      const raw = this.get(key);
      if (!raw) return defaultVal;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return defaultVal;
      }
    },

    setJSON(key: string, val: any) {
      try {
        const str = JSON.stringify(val);
        // Safety check for single property limit
        if (str.length > LIMITS.PROPS_MAX_SINGLE) return false;
        if (!this._service) return false;
        this._service.setProperty(key, str);
        return true;
      } catch (e) {
        console.error(`⚠️ Store: JSON Stringify error for '${key}'`);
        return false;
      }
    },

    getChunked<T>(baseKey: string, defaultVal: T = {} as T): T {
      try {
        if (!this._service) return defaultVal;
        
        // 1. Try reading as a simple key first (backward compatibility)
        const simple = this._service.getProperty(baseKey);
        if (simple) return JSON.parse(simple);

        // 2. Scan for chunks
        const allProps = this._service.getProperties();
        const safeKey = escapeRegex(baseKey);
        const chunkPattern = new RegExp(`^${safeKey}_(\\d+)$`);
        const chunks: Array<{ index: number; val: string }> = [];

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
        console.error(`🧩 Store: Chunk read error for '${baseKey}'`);
        return defaultVal;
      }
    },

    setChunked(baseKey: string, val: any) {
      try {
        if (!this._service) return false;
        const fullString = JSON.stringify(val);
        const totalChunks = Math.ceil(fullString.length / LIMITS.PROPS_CHUNK_SIZE);

        // 1. Write new chunks
        for (let i = 0; i < totalChunks; i++) {
          const chunk = fullString.slice(i * LIMITS.PROPS_CHUNK_SIZE, (i + 1) * LIMITS.PROPS_CHUNK_SIZE);
          this._service.setProperty(`${baseKey}_${i}`, chunk);
        }

        // 2. Prune orphaned chunks from previous writes
        const allProps = this._service.getProperties();
        const safeKey = escapeRegex(baseKey);
        const chunkPattern = new RegExp(`^${safeKey}_(\\d+)$`);

        Object.keys(allProps).forEach((k) => {
          const match = k.match(chunkPattern);
          if (match) {
            const index = parseInt(match[1]);
            if (index >= totalChunks) this._service.deleteProperty(k);
          }
        });

        // 3. Ensure the base key is clear (avoid confusion)
        this._service.deleteProperty(baseKey);
        return true;
      } catch (e) {
        console.error(`🧩 Store: Chunk write error for '${baseKey}'`);
        return false;
      }
    },

    delete(key: string) {
      if (this._service) this._service.deleteProperty(key);
    },
  },

  /**
   * 💾 CACHE HANDLER
   * Wraps CacheService with auto-segmentation for large items.
   */
  cache: {
    putLarge(key, value, expirationSec = LIMITS.CACHE_EXPIRATION) {
      const cache = CacheService.getScriptCache();

      if (value.length <= LIMITS.CACHE_CHUNK_SIZE) {
        cache.put(key, value, expirationSec);
        // Clean up any potential old meta/chunks for this key
        cache.remove(key + "_meta");
        return;
      }

      const chunks = value.match(new RegExp(".{1," + LIMITS.CACHE_CHUNK_SIZE + "}", "g"))!;
      chunks.forEach((chunk, i) => {
        cache.put(key + "_" + i, chunk, expirationSec);
      });

      cache.put(
        key + "_meta",
        JSON.stringify({ count: chunks.length }),
        expirationSec,
      );
      // Clean up the base key to ensure we don't return partial data
      cache.remove(key);
    },

    getLarge(key) {
      const cache = CacheService.getScriptCache();
      
      // 1. Try standard get
      const standard = cache.get(key);
      if (standard) return standard;

      // 2. Check for meta indicating chunks
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
            if (!part) return null; // Missing chunk = broken cache
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
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Store;
}

/**
 * 🌍 GLOBAL BRIDGE
 * Exposes 'Store' to the GAS global context.
 */
(function(scope: any) {
  Object.assign(scope, { Store });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default Store;
