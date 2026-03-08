
/**
 * ============================================================================
 * MODULE: STORE (Persistence Layer)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized persistence engine for Google Apps Script.
 * CAPABILITIES:
 *    1. Properties Manager: Safe JSON handling for Script Properties.
 *    2. Chunking Engine: Handles >9KB properties and >100KB cache items.
 *    3. Cache Manager: High-capacity caching with auto-segmentation.
 *    4. Atomic Locking: Prevents race conditions during writes.
 *    5. Compression: Auto-gzip for optimal storage usage.
 * 
 * ARCHITECTURE: 
 *    - Pure Service: Zero dependencies.
 *    - Internal Core: DRY logic for chunking/compression/locking.
 *    - Public Facade: Clean, categorized API.
 * 
 * VERSION: 2.0.0 (Refactored)
 * ============================================================================
 */

declare var PropertiesService: any;
declare var CacheService: any;
declare var LockService: any;
declare var Utilities: any;
declare var module: any;

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const CONSTANTS = {
  CACHE: {
    CHUNK_SIZE: 90000, // 100KB - 10KB buffer
    EXPIRATION: 21600, // 6 hours
  },
  COMPRESSION: {
    PREFIX: "gzip:",
    THRESHOLD: 2048,   // 2KB
  },
  PROPS: {
    CHUNK_SIZE: 8500,  // 9KB - 500b buffer
    MAX_SINGLE: 9000,
  },
};

/* ==========================================================================
   INTERFACES
   ========================================================================== */
/**
 * @remarks
 * The Store service provides a unified abstraction over Google Apps Script's
 * primary persistence mechanisms:
 *
 * 1. PropertiesService (props): Best for structured settings and metadata.
 *    Persistent, shared across script executions, but limited to 9KB per key.
 * 2. CacheService (cache): Best for ephemeral, high-volume data (e.g. API responses).
 *    Fast and high-capacity, but volatile with a maximum TTL of 6 hours.
 *
 * The Store automatically handles platform constraints via intelligent
 * chunking and transparent GZIP compression.
 */
export interface StoreContract {
  cache: {
    /**
     * @warning Consumes CacheService quota.
     */
    getLarge(key: string): string | null;
    /**
     * @warning Consumes CacheService quota.
     */
    putLarge(key: string, value: string, expirationSec?: number): void;
    /**
     * @warning Consumes CacheService quota.
     */
    remove(key: string): void;
  };
  props: {
    _service?: any; // Exposed for testing/mocking
    /**
     * @warning Consumes PropertiesService quota.
     */
    delete(key: string): void;
    /**
     * @warning Consumes PropertiesService quota.
     */
    get(key: string, defaultVal?: string | null): string | null;
    /**
     * @warning Consumes PropertiesService quota.
     */
    getChunked<T>(baseKey: string, defaultVal?: T): T;
    /**
     * @warning Consumes PropertiesService quota.
     */
    getJSON<T>(key: string, defaultVal?: T): T;
    /**
     * @warning Consumes PropertiesService quota.
     */
    set(key: string, val: string | number | boolean): void;
    /**
     * @warning Consumes PropertiesService quota and LockService quota.
     */
    setChunked(baseKey: string, val: any): boolean;
    /**
     * @warning Consumes PropertiesService quota.
     */
    setJSON(key: string, val: any): boolean;
  };
  compress(data: any): string;
  decompress(str: string): any;
  withLock<T>(key: string, callback: () => T, timeoutMs?: number): T;
}

/* ==========================================================================
   INTERNAL HELPERS (The "Brain")
   ========================================================================== */
const StoreInternal = {
  /**
   * Escapes strings for use in Regular Expressions.
   *
   * @remarks
   * Essential for chunking operations where the baseKey contains special
   * characters (e.g. parentheses or brackets in player tags or complex keys).
   */
  escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * Reassembles data that was split across multiple storage slots.
   *
   * @remarks
   * This implements a "Fallback & Scan" strategy:
   * 1. Attempt a direct read (legacy or small data).
   * 2. If direct read fails, scan all available keys for indexed chunks
   *    matching the baseKey pattern.
   *
   * This approach ensures backward compatibility with unchunked data while
   * allowing the system to scale beyond platform limits.
   */
  readChunks(
    baseKey: string,
    fetcher: (k: string) => string | null,
    scanner: () => string[]
  ): string | null {
    // 1. Try standard read
    const standard = fetcher(baseKey);
    if (standard) return standard;

    // 2. Scan for indexed chunks
    const safeKey = this.escapeRegex(baseKey);
    const chunkPattern = new RegExp(`^${safeKey}_(\\d+)$`);
    
    // Scan all keys (expensive but necessary for Props; Cache handles differently usually)
    const allKeys = scanner();
    const chunks: Array<{ index: number; val: string }> = [];

    allKeys.forEach(k => {
      const match = k.match(chunkPattern);
      if (match) {
        const part = fetcher(k);
        if (part) chunks.push({ index: parseInt(match[1]), val: part });
      }
    });

    if (chunks.length === 0) return null;

    // 3. Reassemble
    // Intent: Sorting ensures chunks are rejoined in the correct sequence.
    chunks.sort((a, b) => a.index - b.index);
    return chunks.map((c: { val: string }) => c.val).join("");
  },

  /**
   * Splits large data into multiple storage slots.
   *
   * @remarks
   * Implements a "Write & Prune" strategy:
   * 1. Deterministically calculates the number of chunks required.
   * 2. Overwrites or creates the necessary chunk slots.
   * 3. Prunes "orphan" chunks -- leftovers from previous larger writes that
   *    are no longer part of the current data set.
   *
   * This prevents storage bloat and "Ghost Data" bugs where partial old
   * data is appended to new data during reassembly.
   */
  writeChunks(
    baseKey: string,
    value: string,
    chunkSize: number,
    writer: (k: string, v: string) => void,
    deleter: (k: string) => void,
    scanner: () => string[]
  ): void {
    const totalChunks = Math.ceil(value.length / chunkSize);

    // 1. Write new chunks
    for (let i = 0; i < totalChunks; i++) {
        const chunk = value.slice(i * chunkSize, (i + 1) * chunkSize);
        writer(`${baseKey}_${i}`, chunk);
    }

    // 2. Prune orphans
    // Intent: Identify and remove any indices (e.g. chunk_5) that existed in
    // the previous write but are beyond the new totalChunks limit.
    const safeKey = this.escapeRegex(baseKey);
    const chunkPattern = new RegExp(`^${safeKey}_(\\d+)$`);
    const allKeys = scanner();

    allKeys.forEach(k => {
        const match = k.match(chunkPattern);
        if (match) {
            const index = parseInt(match[1]);
            if (index >= totalChunks) deleter(k);
        }
    });

    // 3. Clear base key
    // Intent: We clear the base key to signify that this item is now
    // exclusively managed in chunked mode.
    deleter(baseKey);
  },

  /**
   * Transparent GZIP Compression.
   *
   * @remarks
   * Uses a threshold (2KB) to balance CPU overhead with storage savings.
   * Compressing tiny objects often results in larger base64 strings due to
   * GZIP header overhead; the threshold ensures we only compress when
   * significant gains are expected.
   */
  compress(data: any): string {
    try {
      // @ts-ignore
      if (typeof Utilities === "undefined") return JSON.stringify(data);
      
      const json = JSON.stringify(data);
      if (json.length < CONSTANTS.COMPRESSION.THRESHOLD) return json;

      // @ts-ignore
      const blob = Utilities.newBlob(json).getBytes();
      // @ts-ignore
      const zipped = Utilities.gzip(blob);
      // @ts-ignore
      return CONSTANTS.COMPRESSION.PREFIX + Utilities.base64Encode(zipped);
    } catch(e: any) {
      console.warn("Store: Compression failed, using raw JSON");
      return JSON.stringify(data);
    }
  },

  /**
   * Transparent GZIP Decompression.
   */
  decompress(str: string): any {
    try {
      // Intent: If the string lacks our custom prefix, we assume it's raw JSON.
      if (!str || !str.startsWith(CONSTANTS.COMPRESSION.PREFIX)) return JSON.parse(str);
      // @ts-ignore
      if (typeof Utilities === "undefined") return JSON.parse(str);

      const base64 = str.replace(CONSTANTS.COMPRESSION.PREFIX, "");
      // @ts-ignore
      const decoded = Utilities.base64Decode(base64);
      // @ts-ignore
      const unzipped = Utilities.ungzip(decoded).getDataAsString();
      return JSON.parse(unzipped);
    } catch (e: any) {
      console.error("Store: Decompression failed");
      return null;
    }
  },

  /**
   * High-Level Concurrency Guard.
   *
   * @remarks
   * Wraps operations in a Google LockService script lock. This is critical
   * for "Read-Modify-Write" cycles (like chunking) where concurrent executions
   * could otherwise result in partial writes or race conditions.
   */
  withLock<T>(key: string, task: () => T, timeoutMs = 10000): T {
    // @ts-ignore
    if (typeof LockService === "undefined" || !key) return task();
    // @ts-ignore
    const lock = LockService.getScriptLock();
    try {
      if (lock.tryLock(timeoutMs)) {
        return task();
      } else {
        throw new Error(`Store: Lock timeout for '${key}'`);
      }
    } finally {
      lock.releaseLock();
    }
  }
};

/* ==========================================================================
   PUBLIC API
   ========================================================================== */
var Store: StoreContract = {
  
  // ------------------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------------------
  compress: StoreInternal.compress,
  decompress: StoreInternal.decompress,
  withLock: StoreInternal.withLock,

  // ------------------------------------------------------------------------
  // CACHE MANANGER (CacheService)
  // ------------------------------------------------------------------------
  cache: {
    getLarge(key: string) {
      const cache = CacheService.getScriptCache();
      
      // Specialized read for Cache (supports meta optimization)
      const standard = cache.get(key);
      if (standard) return standard;

      const meta = cache.get(`${key}_meta`);
      if (meta) {
        try {
          const { count } = JSON.parse(meta);
          const keys = Array.from({ length: count }, (_, i) => `${key}_${i}`);
          const chunks = cache.getAll(keys);
          
          let fullString = "";
          for (let i = 0; i < count; i++) {
             const chunk = chunks[`${key}_${i}`];
             if (!chunk) return null; // Broken chain
             fullString += chunk;
          }
          return fullString;
        } catch (e: any) { return null; }
      }
      return null;
    },

    putLarge(key: string, value: string, expirationSec = CONSTANTS.CACHE.EXPIRATION) {
      const cache = CacheService.getScriptCache();

      if (value.length <= CONSTANTS.CACHE.CHUNK_SIZE) {
        cache.put(key, value, expirationSec);
        cache.remove(`${key}_meta`);
        return;
      }

      // Chunking (Cache doesn't need scan cleanup, just overwrite)
      const totalChunks = Math.ceil(value.length / CONSTANTS.CACHE.CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = value.slice(i * CONSTANTS.CACHE.CHUNK_SIZE, (i + 1) * CONSTANTS.CACHE.CHUNK_SIZE);
        cache.put(`${key}_${i}`, chunk, expirationSec);
      }

      cache.put(
        `${key}_meta`,
        JSON.stringify({ count: totalChunks }),
        expirationSec
      );
      cache.remove(key); // Clear base
    },

    remove(key: string) {
      const cache = CacheService.getScriptCache();
      cache.remove(key);
      
      const meta = cache.get(`${key}_meta`);
      if (meta) {
        try {
          const { count } = JSON.parse(meta);
          const keys = Array.from({ length: count }, (_, i) => `${key}_${i}`);
          cache.removeAll(keys);
          cache.remove(`${key}_meta`);
        } catch (e: any) {
          // If meta is corrupt, we still try a best-effort delete of the meta key itself
          cache.remove(`${key}_meta`);
        }
      }
    }
  },

  // ------------------------------------------------------------------------
  // PROPS MANAGER (PropertiesService)
  // ------------------------------------------------------------------------
  props: {
    get _service() {
      // @ts-ignore
      return typeof PropertiesService !== "undefined"
        ? PropertiesService.getScriptProperties()
        : null;
    },

    delete(key: string) {
      if (this._service) this._service.deleteProperty(key);
    },

    get(key: string, defaultVal: string | null = null) {
      if (!this._service) return defaultVal;
      const val = this._service.getProperty(key);
      return val !== null ? val : defaultVal;
    },

    getChunked<T>(baseKey: string, defaultVal: T = {} as T): T {
      if (!this._service) return defaultVal;

      try {
        const resultStr = StoreInternal.readChunks(
           baseKey, 
           (k) => this._service.getProperty(k), 
           () => Object.keys(this._service.getProperties())
        );

        if (!resultStr) return defaultVal;
        return StoreInternal.decompress(resultStr);

      } catch (e: any) {
        console.error(`Store: Chunk read error for '${baseKey}'`);
        return defaultVal;
      }
    },

    getJSON<T>(key: string, defaultVal: T = {} as T): T {
      const raw = this.get(key);
      if (!raw) return defaultVal;
      try {
        return StoreInternal.decompress(raw);
      } catch (e: any) {
        return defaultVal;
      }
    },

    set(key: string, val: string | number | boolean) {
      if (!this._service) return;
      this._service.setProperty(key, String(val));
    },

    setChunked(baseKey: string, val: any) {
      return StoreInternal.withLock(`LOCK_${baseKey}`, () => {
        try {
          if (!this._service) return false;
          
          const str = StoreInternal.compress(val);
          
          StoreInternal.writeChunks(
            baseKey,
            str,
            CONSTANTS.PROPS.CHUNK_SIZE,
            (k, v) => this._service.setProperty(k, v),
            (k) => this._service.deleteProperty(k),
            () => Object.keys(this._service.getProperties())
          );
          
          return true;
        } catch (e: any) {
            console.error(`Store: Chunk write error for '${baseKey}'`);
            return false;
        }
      });
    },

    setJSON(key: string, val: any) {
       try {
        const str = StoreInternal.compress(val);
        
        if (str.length > CONSTANTS.PROPS.MAX_SINGLE) return false;
        if (!this._service) return false;
        
        this._service.setProperty(key, str);
        return true;
      } catch (e: any) {
        console.error(`Store: JSON Stringify error for '${key}'`);
        return false;
      }
    }
  }
};

/* ==========================================================================
   EXPORTS & GLOBAL BRIDGE
   ========================================================================== */
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Store;
}

(function(scope: any) {
  Object.assign(scope, { Store });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Store;