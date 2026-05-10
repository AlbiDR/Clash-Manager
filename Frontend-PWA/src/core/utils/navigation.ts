// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * NAVIGATION METADATA (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Single Source of Truth for application-level navigation.
 * ----------------------------------------------------------------------------
 */

export interface NavItem {
  path: string;
  name: string;
  label: string;
  icon: string;
}

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
  },
  {
    path: "/laboratory",
    name: "laboratory",
    label: "Laboratory",
    icon: "flask",
  },
  {
    path: "/settings",
    name: "settings",
    label: "Settings",
    icon: "settings",
  },
];
