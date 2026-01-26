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
        /^(\*\*.*?\*\*|.*?:)$/gm,
        '<div class="desc-section-title">$1</div>',
      )
      // Bold text (**text**)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Bullet points (• item)
      .replace(/^• (.+)$/gm, '<li class="bullet-item">$1</li>')
      // Actual Line breaks
      .replace(/\n/g, "<br>")
      // Wrap lists in ul
      .replace(
        /(<li class="bullet-item">.*<\/li>\s*)+/g,
        '<ul class="desc-list">$&</ul>',
      )
  );
}
