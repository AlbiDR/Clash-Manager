/**
 * ============================================================================
 * 🕰️ MODULE: TIME (Temporal Engine)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Centralized date, time, and war-cycle logic.
 * ⚙️ CAPABILITIES:
 *    1. War Cycle Logic: Calculates Week ID and Phases based on 10:00 UTC Reset.
 *    2. Date Parsing: Robust ISO 8601 parsing for RoyaleAPI dates.
 *    3. Logical Days: Handles "Monday" logic regardless of local timezone.
 * 
 * 🛡️ ARCHITECTURE: 
 *    - Pure Service: Deterministic logic, no external dependencies.
 *    - Single Source of Truth for "When is War?".
 * 
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";

declare var Utilities: GoogleAppsScript.Utilities.Utilities;
declare var module: any;
declare const CONFIG: AppConfig;

export interface WarPhaseResult {
  rawDay: number;
  isTraining: boolean;
  isBattle: boolean;
  phase: string;
}

export interface ITime {
  formatDate(date: Date | null | undefined): string;
  parseRoyaleApiDate(dateStr: string | Date | null | undefined): Date;
  calculateWarWeekId(d: Date | null | undefined): string;
  getLogicalDay(date: Date): number;
  getEligibleBattleDays(daysTracked: number, isColosseum?: boolean): number;
  getWarPhaseFromDate(date: Date, snapshot?: any, options?: { forceCalendarDay?: boolean }): WarPhaseResult;
  isWeekend(date: Date): boolean;
}

var Time: ITime = {
  
  /**
   * Formats a date to YYYY-MM-DD using the system timezone.
   */
  formatDate(date: Date | null | undefined): string {
    if (!date || isNaN(date.getTime())) return "";
    // @ts-ignore
    return Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, CONFIG.SYSTEM.DATE_FORMAT_VALUE);
  },

  /**
   * Parses RoyaleAPI date strings (YYYYMMDDTHHMMSS) or standard dates into a Date object.
   */
  parseRoyaleApiDate(dateStr: string | Date | null | undefined): Date {
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

  /**
   * Calculates the War Week ID (e.g., "23W45") based on the 10:00 UTC Monday reset.
   */
  calculateWarWeekId(d: Date | null | undefined): string {
    if (!d || isNaN(d.getTime())) return "Unknown";
    
    // 🛡️ RESET-AWARE NORMALIZATION (10:00 UTC Monday Reset)
    const date = new Date(d.getTime());
    const RESET_H = 10;
    const resetToday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), RESET_H, 0, 0);
    
    // Shift back if before reset to align with previous logical day/week
    if (date.getTime() < resetToday) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    
    // ISO-8601 Week Calculation (Pure UTC)
    date.setUTCHours(0, 0, 0, 0);
    const day = (date.getUTCDay() + 6) % 7; // 0=Mon, ..., 6=Sun
    date.setUTCDate(date.getUTCDate() + 3 - day); // Target Thursday
    
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
    const dayIndex = d.getUTCDay(); // 0=Sun, 1=Mon...
    return dayIndex === 0 ? 7 : dayIndex; // Return 1-7 (Mon-Sun)
  },

  /**
   * ⚔️ ELIGIBLE BATTLE DAYS CALCULATOR
   * Determines theoretical maximum battle days based on player tenure.
   * Standard Week = 4 Battle Days (Thu-Sun)
   * Colosseum Week = 7 Battle Days (All days count)
   */
  getEligibleBattleDays(daysTracked: number, isColosseum = false): number {
    if (daysTracked <= 0) return 0;
    
    const BATTLE_DAYS_PER_WEEK = isColosseum ? 7 : 4;
    const DAYS_PER_WEEK = 7;
    
    const fullWeeks = Math.floor(daysTracked / DAYS_PER_WEEK);
    const remainderDays = daysTracked % DAYS_PER_WEEK;
    
    // Full weeks contribute their full quota
    let eligibleDays = fullWeeks * BATTLE_DAYS_PER_WEEK;
    
    // Partial week: For standard weeks, assume 4/7 ratio of remainder
    // For colosseum, all remainder days count
    if (remainderDays > 0) {
      if (isColosseum) {
        eligibleDays += remainderDays;
      } else {
        // Conservative estimate: (remainderDays / 7) * 4, rounded up
        eligibleDays += Math.ceil((remainderDays / DAYS_PER_WEEK) * BATTLE_DAYS_PER_WEEK);
      }
    }
    
    return Math.max(1, eligibleDays); // At least 1 to prevent divide-by-zero
  },

  /**
   * 🕰️ WAR PHASE HEURISTIC (Single Source of Truth)
   * Determines the War Day based on the deterministic Monday 10:00 UTC cycle.
   */
  getWarPhaseFromDate(date: Date, snapshot?: any, options: { forceCalendarDay?: boolean } = {}): WarPhaseResult {
    const RESET_H = 10; // 10:00 UTC
    let utcDay = date.getUTCDay(); // 0=Sun, 1=Mon, ...

    // 🛡️ MODE A: High-Precision (Game Clock Aware)
    // Used for Live Logging & Participation Logic.
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
    // 🛡️ MODE B: Calendar-Consistent (Audit Mode)
    // Used for Repair/Historical Audits where "Monday" means "Monday".
    else {
        // Construct a safe "Noon" representation of the LOCAL date to ensure proper day index
        // This handles cases where local midnight is previous-day UTC
        const localBasedUTC = new Date(Date.UTC(
            date.getFullYear(), 
            date.getMonth(), 
            date.getDate(), 
            12, 0, 0
        ));
        utcDay = localBasedUTC.getUTCDay();
    }

    // 🛡️ DYNAMIC GROUNDING: If a snapshot is provided for the exact same date, trust it.
    if (snapshot && snapshot.protocol) {
      const snapDate = new Date(snapshot.meta.timestamp);
      // Compare calendar dates (YYYY-MM-DD)
      const isSameDate = snapDate.getUTCDate() === date.getUTCDate() && 
                         snapDate.getUTCMonth() === date.getUTCMonth() &&
                         snapDate.getUTCFullYear() === date.getUTCFullYear();
      
      if (isSameDate) {
        return {
          rawDay: snapshot.schedule.day - 1, // Snapshot day is 1-based
          isTraining: snapshot.protocol.phase === "TRIAL",
          isBattle: snapshot.protocol.phase !== "TRIAL",
          phase: snapshot.protocol.phase,
        };
      }
    }

    // 🛡️ HEURISTIC FALLBACK (Corrected Mapping)
    // Shift: Mon(1) -> 0, Tue(2) -> 1, Wed(3) -> 2 (Training)
    // Thu(4) -> 3, Fri(5) -> 4, Sat(6) -> 5, Sun(0) -> 6 (Battle)
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
if (typeof module !== "undefined" && module.exports) {
  module.exports = Time;
}

(function(scope: any) {
  Object.assign(scope, { Time });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default Time;
