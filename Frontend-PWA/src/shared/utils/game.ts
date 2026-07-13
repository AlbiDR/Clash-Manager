// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * [SHARED] GAME UTILITIES
 * ----------------------------------------------------------------------------
 * Rationale: UI-focused game helpers and formatters that are shared across
 * features but are not part of the core domain math or constants.
 * Layer: @shared/utils
 * ----------------------------------------------------------------------------
 */

/**
 * Normalizes a raw role string from the API into a display label and CSS class.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture.
 * Provides a standardized mapping for clan roles to ensure consistent terminology
 * across the Roster, Laboratory, and Headhunter features.
 *
 * @param roleStr - The raw role string (e.g., 'coleader', 'elder', 'member').
 * @returns Object containing the formatted label and its associated CSS class.
 *
 * [DECISION LOG] Use 'Co-Lead' as the display label for 'coleader' to preserve
 * horizontal space in compact mobile views while maintaining domain clarity.
 */
export function formatRole(roleStr: string): { label: string; class: string } {
  const r = (roleStr || "").toLowerCase();
  if (r.includes("leader") && !r.includes("co"))
    return { label: "Leader", class: "role-leader" };
  if (r.includes("coleader") || r.includes("co-leader"))
    return { label: "Co-Lead", class: "role-coleader" };
  if (r.includes("elder")) return { label: "Elder", class: "role-elder" };
  return { label: "Member", class: "role-member" };
}
