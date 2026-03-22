/**
 * ============================================================================
 * MODULE: TIME (Temporal Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized date, time, and war-cycle logic.
 * CAPABILITIES:
 *    1. War Cycle Logic: Calculates Week ID and Phases based on 10:00 UTC Reset.
 *    2. Date Parsing: Robust ISO 8601 parsing for RoyaleAPI dates.
 *    3. Logical Days: Handles "Monday" logic regardless of local timezone.
 * 
 * ARCHITECTURE:
 *    - Pure Service: Deterministic logic, no external dependencies.
 *    - Single Source of Truth for "When is War?".
 * 
 *  VERSION: 1.0.1
 * ============================================================================
 */

import { CONFIG } from "./Configuration";

/**
 * GLOBAL VERSION
 */
export const VER_TIME = "1.0.1";

declare var Utilities: any;
declare var module: any;

export interface WarPhaseResult {
  rawDay: number;
  isTraining: boolean;
  isBattle: boolean;
  phase: string;
}

export interface TimeContract {
  formatDate(date: Date | null | undefined): string;
  formatDatetime(date: Date | null | undefined): string;
  formatShortDate(date: Date | null | undefined): string;
  parseRoyaleApiDate(dateStr: string | Date | null | undefined): Date;
  parseFlexibleDate(val: any): Date;
  calculateWarWeekId(d: Date | null | undefined): string;
  getLogicalDay(date: Date): number;
  getEligibleBattleDays(daysTracked: number, isColosseum?: boolean): number;
  getWarPhaseFromDate(date: Date, snapshot?: any, options?: { forceCalendarDay?: boolean }): WarPhaseResult;
  isWeekend(date: Date): boolean;
}

var Time: TimeContract = {
  
  /**
   * Formats a date using the system's precise dot-separated pattern (dd/MM/yyyy HH.mm.ss).
   * Used for sheet-stored values to prevent ambiguous auto-formatting.
   *
   * @remarks
   * GAS-Only: Falls back to ISO string in Node.js environments.
   */
  formatDate(date: Date | null | undefined): string {
    if (!date || isNaN(date.getTime()) || date.getTime() === 0) return "";
    if (typeof Utilities !== "undefined") {
      // @ts-ignore
      return Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, CONFIG.SYSTEM.DATE_FORMAT_VALUE);
    }
    return date.toISOString().replace("T", " ").split(".")[0] || "";
  },

  /**
   * Formats a date using the system's human-readable pattern (dd/MM/yyyy HH:mm).
   *
   * @remarks
   * GAS-Only: Falls back to ISO string in Node.js environments.
   */
  formatDatetime(date: Date | null | undefined): string {
    if (!date || isNaN(date.getTime()) || date.getTime() === 0) return "";
    if (typeof Utilities !== "undefined") {
      // @ts-ignore
      return Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, CONFIG.SYSTEM.DATE_FORMAT_DATETIME);
    }
    return date.toISOString().replace("T", " ").split(".")[0]?.slice(0, 16) || "";
  },

  /**
   * Formats a date to a simple dd/MM/yyyy string.
   *
   * @remarks
   * GAS-Only: Falls back to YYYY-MM-DD in Node.js environments.
   */
  formatShortDate(date: Date | null | undefined): string {
    if (!date || isNaN(date.getTime())) return "";
    if (typeof Utilities !== "undefined") {
      // @ts-ignore
      return Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, CONFIG.SYSTEM.DATE_FORMAT_DATE);
    }
    return date.toISOString().split("T")[0] || "";
  },

  /**
   * Parses RoyaleAPI date strings (YYYYMMDDTHHMMSS) or standard dates into a Date object.
   */
  parseRoyaleApiDate(dateStr: string | Date | null | undefined): Date {
    if (!dateStr) return new Date(0); // Sentinel
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
    
    const d = new Date(dateStr as any);
    return isNaN(d.getTime()) ? new Date(0) : d;
  },

  /**
   * Robustly parses various date formats back into a Date object.
   * Handles Date objects, ISO 8601 strings, and custom formats like dd/MM/yyyy HH.mm.ss.
   */
  parseFlexibleDate(val: any): Date {
    if (val === null || val === undefined) return new Date(0); // Sentinel
    
    // 0. Handle already instantiated Date objects (Safer Type Check)
    if (Object.prototype.toString.call(val) === "[object Date]") {
        return isNaN(val.getTime()) ? new Date(0) : val;
    }
    
    const s = String(val).trim();
    if (!s || s === "N/A" || s === "-" || s === "" || s === "null") return new Date(0);

    // 1. Try numeric parsing (Spreadsheet Serial vs Unix Timestamps)
    const num = Number(val);
    if (!isNaN(num) && typeof val !== "string") {
        // 1.1 Spreadsheet Serial Dates (e.g. 46023 for 2026)
        if (num > 30000 && num < 70000) {
            const date = new Date(1899, 11, 30, 0, 0, 0);
            const days = Math.floor(num);
            const ms = Math.round((num - days) * 86400 * 1000);
            date.setDate(date.getDate() + days);
            date.setMilliseconds(date.getMilliseconds() + ms);
            return isNaN(date.getTime()) ? new Date(0) : date;
        }
        
        // 1.2 Unix Timestamps (Seconds or Milliseconds)
        if (num >= 1000000000) {
          const date = new Date(num < 10000000000 ? num * 1000 : num);
          return isNaN(date.getTime()) ? new Date(0) : date;
        }
    }

    // 2. Try ISO 8601 parsing (e.g. 2026-01-30T13:42:37Z)
    if (s.includes("-") && s.includes("T")) {
        const isoDate = new Date(s);
        if (!isNaN(isoDate.getTime())) return isoDate;
    }

    // 3. Try dd/MM/yyyy (Project Standard without time)
    const matchNoTime = s.match(/^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{4})$/);
    if (matchNoTime) {
        const day = parseInt(matchNoTime[1]!, 10);
        const month = parseInt(matchNoTime[2]!, 10) - 1;
        const year = parseInt(matchNoTime[3]!, 10);
        
        if (month < 0 || month > 11 || day < 1 || day > 31) return new Date(0); 
        
        const date = new Date(year, month, day, 0, 0, 0);
        return isNaN(date.getTime()) ? new Date(0) : date;
    }

    // 4. Try dd/MM/yyyy HH.mm.ss parsing
    const match = s.match(/^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{4})\s+(\d{1,2})[:.\s](\d{2})(?:[:.\s](\d{2}))?$/);
    if (match) {
        const day = parseInt(match[1]!, 10);
        const month = parseInt(match[2]!, 10) - 1;
        const year = parseInt(match[3]!, 10);
        const hour = parseInt(match[4]!, 10);
        const min = parseInt(match[5]!, 10);
        const sec = match[6] ? parseInt(match[6]!, 10) : 0;
        
        if (month < 0 || month > 11 || day < 1 || day > 31) return new Date(0);
        
        const date = new Date(year, month, day, hour, min, sec);
        return isNaN(date.getTime()) ? new Date(0) : date;
    }

    const fallback = new Date(s);
    if (!isNaN(fallback.getTime())) return fallback;
    
    return new Date(0);
  },

  /**
   * Calculates the War Week ID (e.g., "23W45") based on the 10:00 UTC Monday reset.
   */
  calculateWarWeekId(d: Date | null | undefined): string {
    if (!d || isNaN(d.getTime())) return "Unknown";
    
    const date = new Date(d.getTime());
    const RESET_H = 10;
    const resetToday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), RESET_H, 0, 0);
    
    if (date.getTime() < resetToday) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    
    date.setUTCHours(0, 0, 0, 0);
    const day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() + 3 - day);
    
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const firstThursDay = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - firstThursDay);
    
    const weekNum = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
    const yearShort = date.getUTCFullYear().toString().slice(-2);
    
    return `${yearShort}W${weekNum.toString().padStart(2, "0")}`;
  },

  /**
   * Returns the logical day index (1=Mon, 7=Sun) based on 10:00 UTC reset.
   */
  getLogicalDay(date: Date): number {
    const d = new Date(date.getTime());
    const RESET_H = 10;
    const resetToday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_H, 0, 0);
    
    if (d.getTime() < resetToday) {
      d.setUTCDate(d.getUTCDate() - 1);
    }
    const dayIndex = d.getUTCDay();
    return dayIndex === 0 ? 7 : dayIndex;
  },

  /**
   * ELIGIBLE BATTLE DAYS CALCULATOR
   */
  getEligibleBattleDays(daysTracked: number, isColosseum = false): number {
    if (daysTracked <= 0) return 0;
    
    const BATTLE_DAYS_PER_WEEK = isColosseum ? 7 : 4;
    const DAYS_PER_WEEK = 7;
    
    const fullWeeks = Math.floor(daysTracked / DAYS_PER_WEEK);
    const remainderDays = daysTracked % DAYS_PER_WEEK;
    
    let eligibleDays = fullWeeks * BATTLE_DAYS_PER_WEEK;
    
    if (remainderDays > 0) {
      if (isColosseum) {
        eligibleDays += remainderDays;
      } else {
        eligibleDays += Math.ceil((remainderDays / DAYS_PER_WEEK) * BATTLE_DAYS_PER_WEEK);
      }
    }
    
    return Math.max(1, eligibleDays);
  },

  /**
   * WAR PHASE HEURISTIC
   */
  getWarPhaseFromDate(date: Date, snapshot?: any, options: { forceCalendarDay?: boolean } = {}): WarPhaseResult {
    const RESET_H = 10;
    let utcDay = date.getUTCDay();

    if (!options.forceCalendarDay) {
        const reset = new Date(
          Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            RESET_H,
            0,
            0,
            0,
          ),
        );

        if (date.getTime() < reset.getTime()) {
          utcDay = (utcDay + 6) % 7;
        }
    } 
    else {
        const localBasedUTC = new Date(Date.UTC(
            date.getFullYear(), 
            date.getMonth(), 
            date.getDate(), 
            12, 0, 0
        ));
        utcDay = localBasedUTC.getUTCDay();
    }

    if (snapshot && snapshot.protocol) {
      const snapDate = new Date(snapshot.meta.timestamp);
      const isSameDate = snapDate.getUTCDate() === date.getUTCDate() && 
                         snapDate.getUTCMonth() === date.getUTCMonth() &&
                         snapDate.getUTCFullYear() === date.getUTCFullYear();
      
      if (isSameDate) {
        return {
          rawDay: snapshot.schedule.day - 1,
          isTraining: snapshot.protocol.phase === "TRIAL",
          isBattle: snapshot.protocol.phase !== "TRIAL",
          phase: snapshot.protocol.phase,
        };
      }
    }

    const rawDay = (utcDay + 6) % 7;

    return {
      rawDay: rawDay,
      isTraining: rawDay <= 2,
      isBattle: rawDay >= 3,
      phase: rawDay <= 2 ? "TRIAL" : "ENGAGEMENT",
    };
  },

  isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  },
};

// @ts-ignore
try {  } catch (e) {}

(function(scope: any) {
  Object.assign(scope, { Time, VER_TIME });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Time;
