// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * NAVIGATION METADATA (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Single Source of Truth for application-level navigation.
 * ----------------------------------------------------------------------------
 */

/**
 * Defines the structure for a primary navigation item in the application.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture.
 */
export interface NavItem {
  /** The application path used for routing. */
  path: string;
  /** Unique internal name for the navigation route. */
  name: string;
  /** Human-readable label displayed in the UI. */
  label: string;
  /** Identifier for the icon associated with the route. */
  icon: string;
  /** Optional SVG viewBox override when the icon coordinate space differs from the default 0 0 24 24. */
  viewBox?: string;
}

/**
 * The authoritative list of primary navigation items.
 *
 * @remarks
 * Satisfies ADR Section IV: Navigation SSOT. Provides the central registry
 * used by the NavigationDock and other UI layout components.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    path: "/roster",
    name: "roster",
    label: "Roster",
    icon: "roster",
  },
  {
    path: "/headhunter",
    name: "headhunter",
    label: "Headhunter",
    icon: "headhunter",
    viewBox: "42 30 440 440",
  },
  {
    path: "/laboratory",
    name: "laboratory",
    label: "Laboratory",
    icon: "laboratory",
    viewBox: "0 0 23 24",
  },
  {
    path: "/settings",
    name: "settings",
    label: "Settings",
    icon: "settings",
  },
];
