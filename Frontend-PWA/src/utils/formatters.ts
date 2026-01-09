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

  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) return "-";

  const units = [
    { ms: 86400000, s: "d", l: "d ago" },
    { ms: 3600000, s: "h", l: "h ago" },
    { ms: 60000, s: "m", l: "m ago" },
  ];
  const elapsed = Date.now() - ts;
  const match = units.find((u) => elapsed >= u.ms);

  if (!match) return shortMode ? "New" : "Just now";
  const val = Math.floor(elapsed / match.ms);
  return shortMode ? `${val}${match.s}` : `${val}${match.l}`;
};

export const formatTimeAgo = (dateStr: string | null | undefined): string =>
  formatTime(dateStr, false);
export const formatTimeAgoShort = (
  dateStr: string | null | undefined,
): string => formatTime(dateStr, true);

export function parseTimeAgoValue(val: string | null | undefined): number {
  if (!val || val === "-" || val === "Just now") return 0;
  const match = val.match(/^(\d+)([ymdh]) ago$/);
  if (!match) return 99999999;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "m":
      return num;
    case "h":
      return num * 60;
    case "d":
      return num * 1440;
    case "y":
      return num * 525600;
    default:
      return num;
  }
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
