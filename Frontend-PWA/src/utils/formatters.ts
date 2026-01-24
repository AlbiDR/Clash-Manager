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

/**
 * ⚡ PERFORMANCE: Pre-compiled regex and multiplier map for O(1) unit lookup
 * during list sorting.
 */
const TIME_AGO_REGEX = /^(\d+)([ymdh]) ago$/;
const TIME_MULTIPLIERS: Record<string, number> = {
  m: 1,
  h: 60,
  d: 1440,
  y: 525600,
};

export function parseTimeAgoValue(val: string | null | undefined): number {
  if (!val || val === "-" || val === "Just now") return 0;

  const match = val.match(TIME_AGO_REGEX);
  if (!match) return 99999999;

  const num = parseInt(match[1], 10);
  const unit = match[2];

  return num * (TIME_MULTIPLIERS[unit] || 1);
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
  return tag.trim().replace(/^#/, "").toUpperCase();
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
