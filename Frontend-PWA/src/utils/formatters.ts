import type { MomentumInfo } from "../types";

/**
 * Centralized formatting utilities for consistency across the application.
 */

export function getScoreTone(score: number | undefined): string {
  const s = score || 0;
  if (s >= 80) return "tone-high";
  if (s >= 50) return "tone-mid";
  return "tone-low";
}

const formatTime = (
  dateStr: string | null | undefined,
  shortMode: boolean,
): string => {
  if (!dateStr) return "-";
  if (!shortMode && dateStr === "Just now") return dateStr;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";

  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 0) return shortMode ? "New" : "Just now";

  const units = [
    { s: 31536000, t: "y", l: "y ago" },
    { s: 2592000, t: "mo", l: "mo ago" },
    { s: 604800, t: "w", l: "w ago" },
    { s: 86400, t: "d", l: "d ago" },
    { s: 3600, t: "h", l: "h ago" },
    { s: 60, t: "m", l: "m ago" },
  ];

  for (const unit of units) {
    if (seconds >= unit.s) {
      const value = Math.floor(seconds / unit.s);
      return shortMode ? `${value}${unit.t}` : `${value}${unit.l}`;
    }
  }

  return shortMode ? "New" : "Just now";
};

export const formatTimeAgo = (dateStr: string | null | undefined): string =>
  formatTime(dateStr, false);
export const formatTimeAgoShort = (
  dateStr: string | null | undefined,
): string => formatTime(dateStr, true);

const TIME_AGO_REGEX = /^(\d+)(mo|[ymdhw]) ago$/;
const TIME_AGO_MULTIPLIERS: Record<string, number> = {
  m: 1,
  h: 60,
  d: 1440,
  w: 10080,
  mo: 43200,
  y: 525600,
};

/**
 * ⚡ OPTIMIZED PARSER
 * Converts human-readable time strings (e.g. "2d ago") into numeric minutes
 * for O(1) sorting performance.
 */
export function parseTimeAgoValue(val: string | null | undefined): number {
  if (!val || val === "-") return 99999999;

  // 1. Try parsing custom format: dd/MM/yyyy HH.mm.ss (Project Standard)
  // Example: "02/02/2026 18.46.52"
  const customMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})\.(\d{2})\.(\d{2})$/);
  if (customMatch) {
    const day = parseInt(customMatch[1], 10);
    const month = parseInt(customMatch[2], 10) - 1; // JS months are 0-indexed
    const year = parseInt(customMatch[3], 10);
    const hour = parseInt(customMatch[4], 10);
    const min = parseInt(customMatch[5], 10);
    const sec = parseInt(customMatch[6], 10);
    const date = new Date(year, month, day, hour, min, sec);
    if (!isNaN(date.getTime())) {
      const diffMs = Date.now() - date.getTime();
      return Math.floor(diffMs / 60000); // Return minutes
    }
  }

  // 2. Try parsing as Standard Date / ISO String (Fallback)
  const date = new Date(val);
  if (!isNaN(date.getTime())) {
    const diffMs = Date.now() - date.getTime();
    return Math.floor(diffMs / 60000); // Return minutes
  }

  // 3. Legacy Fallback: Parse "2d ago" strings (Old Backend / UI formatted)
  if (val === "Just now") return 0;
  const match = val.match(TIME_AGO_REGEX);
  if (!match) return 99999999;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  return num * (TIME_AGO_MULTIPLIERS[unit] || 1);
}

/**
 * 📈 MOMENTUM CALCULATOR
 * Analyzes the delta in Raw Score to produce a human-readable trend % and direction.
 */
export function calculateMomentum(
  dt: number,
  currentRaw: number,
): MomentumInfo | null {
  if (dt === 0 || currentRaw === 0) return null;
  const previousRaw = currentRaw - dt;

  // Safeguard: Score must be significant to show momentum
  if (previousRaw < 50) return null;

  // Safeguard: Ignore massive outliers/glitches (>1000% jump)
  if (previousRaw > 0 && dt / previousRaw > 10) return null;

  const percentChange = (dt / previousRaw) * 100;
  const absPercent = Math.abs(percentChange);

  let valStr = "";
  if (absPercent < 0.1 && absPercent > 0) valStr = "<0.1%";
  else if (absPercent < 10) valStr = absPercent.toFixed(1) + "%";
  else valStr = Math.round(absPercent) + "%";

  return {
    val: valStr,
    dir: dt > 0 ? "up" : "down",
    raw: dt,
  };
}

export function formatRole(roleStr: string): { label: string; class: string } {
  const r = (roleStr || "").toLowerCase();
  if (r.includes("leader") && !r.includes("co"))
    return { label: "Leader", class: "role-leader" };
  if (r.includes("coleader") || r.includes("co-leader"))
    return { label: "Co-Lead", class: "role-coleader" };
  if (r.includes("elder")) return { label: "Elder", class: "role-elder" };
  return { label: "Member", class: "role-member" };
}

/**
 * 🧹 CLEAN TAG
 * Removes leading '#' and converts to uppercase for API/Deep Link compatibility.
 */
export function cleanTag(tag: string | undefined): string {
  if (!tag) return "";
  return tag.replace(/^#/, "").toUpperCase().trim();
}
/**
 * 🧹 DESCRIPTION FORMATTER
 * Converts markdown-ish strings from Google Sheet notes/descriptions into semantic HTML.
 */
export function formatHeaderDescription(text: string): string {
  if (!text) return "";

  return (
    text
      // Section headers (Key: Value or Title:)
      .replace(
        /^(\*\*.*?\*\*|.*?:)\s*$/gm,
        '<div class="desc-section-title">$1</div>',
      )
      // Bold text (**text**)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Bullet points (• item)
      .replace(/^• (.+)$/gm, '<li class="bullet-item">$1</li>')
      // Wrap lists in ul (BEFORE converting newlines to <br>)
      // ⚡ FIX: Use non-greedy matching and group only consecutive li elements.
      // We use a lookahead (?=<li) to ensure we only eat newlines BETWEEN items,
      // preserving the trailing newline after the last item for proper spacing.
      .replace(
        /(<li class="bullet-item">.*?<\/li>[^\S\r\n]*(\r?\n(?=<li class="bullet-item">))?)+/g,
        (match) => {
          return `<ul class="desc-list">${match.trim().replace(/\n/g, "")}</ul>`;
        },
      )
      // Actual Line breaks
      .replace(/\n/g, "<br>")
  );
}
