
/**
 * MODULE: SCHEMA (Data Mapping Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Manages the mapping between Spreadsheet Columns and Logic.
 * CAPABILITIES:
 *    1. Dynamic Discovery: Finds columns by Name, not fixed Index (Safety).
 *    2. Configuration Sync: Updates Global CONFIG with discovered indices.
 * VERSION: 1.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";

// Global Version Constant
// @ts-ignore
const VER_SCHEMA = "1.0.0";

declare var SpreadsheetApp: any;
declare var module: any;

declare const CONFIG: AppConfig;

export interface SchemaContract {
  bootDynamicSchema(): void;
  resolveSchemaIndices(
    sheet: any,
    headerMap: Record<string, string>,
    headerRow?: number,
    startCol?: number,
  ): Record<string, number>;
}

const SchemaInternal = {
  _cache: new Map<string, Record<string, number>>()
};

var Schema: SchemaContract = {
  
  resolveSchemaIndices: function (
    sheet: any,
    headerMap: Record<string, string>,
    headerRow = 2,
    startCol = 1,
  ) {
    if (!sheet) return {};
    const sheetName = sheet.getName();
    const cacheKey = `SCHEMA_V2:${sheetName}:${headerRow}:${startCol}:${Object.keys(headerMap).sort().join(',')}`;
    
    // 1. Memory Cache
    if (SchemaInternal._cache.has(cacheKey)) {
        return SchemaInternal._cache.get(cacheKey)!;
    }

    // 2. Persistent Cache (CacheService)
    try {
      const cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        SchemaInternal._cache.set(cacheKey, parsed);
        return parsed;
      }
    } catch (e) {}

    // 3. Discovery (Slow Path)
    // Read headers safely (Limit to 30 columns to avoid over-fetching, starting from startCol)
    const headers = sheet.getRange(headerRow, startCol, 1, 30).getValues()[0];
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
    
    // Save to caches
    SchemaInternal._cache.set(cacheKey, resolved);
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(resolved), 3600); // 1 hour cache
    } catch (e) {}
    
    return resolved;
  },

  bootDynamicSchema: function (): string {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return "No Spreadsheet";
    
    // Safety check for CONFIG presence
    if (typeof CONFIG === 'undefined' || !CONFIG.SHEETS) return "Missing Config";

    const results: string[] = [];
    const sync = (sheetName: string, targetConfig: any, headerMap: any) => {
      const s = ss.getSheetByName(sheetName);
      if (s) {
        Object.assign(targetConfig, this.resolveSchemaIndices(s, headerMap, 2, 2));
        results.push(sheetName);
      }
    };

    if (CONFIG.SHEETS.ROSTER) sync(CONFIG.SHEETS.ROSTER, CONFIG.SCHEMA.ROSTER, CONFIG.SCHEMA.ROSTER_HEADERS);
    if (CONFIG.SHEETS.HH) sync(CONFIG.SHEETS.HH, CONFIG.SCHEMA.HH, CONFIG.SCHEMA.HH_HEADERS);
    if (CONFIG.SHEETS.DB) sync(CONFIG.SHEETS.DB, CONFIG.SCHEMA.DB, CONFIG.SCHEMA.DB_HEADERS);

    return results.length > 0 ? results.join(', ') : "None";
  },
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Schema;
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { Schema, VER_SCHEMA });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Schema;