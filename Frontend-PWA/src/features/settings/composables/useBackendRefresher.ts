// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { reactive, onScopeDispose } from "vue";
import { triggerBackendUpdate } from "@core/api/GasClient";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";

/**
 * Domain-specific keys for backend refresh targets.
 */
export type TargetKey = "members" | "leaderboard" | "headhunters";

/**
 * Interface representing a backend refresh target and its current state.
 */
export interface RefreshTarget {
  key: TargetKey;
  label: string;
  desc: string;
  icon: string;
  cooldown: number;
  timer: number | null;
  status: "idle" | "loading" | "success" | "error" | "cooldown";
}

/**
 * COMPOSABLE: useBackendRefresher
 *
 * @remarks
 * Manages the state and execution logic for manual backend data refreshes.
 * Handles individual target cooldowns, loading states, and integrates with
 * the global application loading state.
 *
 * @returns
 * - `targets`: Reactive dictionary of all refresh targets and their states.
 * - `isRefreshing`: Global application hydration/refresh state.
 * - `refresh`: Function to trigger a refresh for a specific target.
 */
export function useBackendRefresher() {
  const clashDataStore = useClashDataStore();
  const { isRefreshing } = storeToRefs(clashDataStore);

  const targets = reactive<Record<TargetKey, RefreshTarget>>({
    members: {
      key: "members",
      label: "Clan Members",
      desc: "Update member list and roles",
      icon: "group",
      cooldown: 0,
      timer: null,
      status: "idle",
    },
    leaderboard: {
      key: "leaderboard",
      label: "Roster",
      desc: "Recalculate scores and ranks",
      icon: "leaderboard",
      cooldown: 0,
      timer: null,
      status: "idle",
    },
    headhunters: {
      key: "headhunters",
      label: "Headhunters",
      desc: "Refresh internal recruit data",
      icon: "target",
      cooldown: 0,
      timer: null,
      status: "idle",
    },
  });

  /**
   * Initiates a 60-second cooldown for a specific target.
   *
   * @param key - The target key to put on cooldown.
   */
  const startCooldown = (key: TargetKey) => {
    const target = targets[key];
    target.cooldown = 60;
    target.status = "cooldown";

    if (target.timer) clearInterval(target.timer);

    target.timer = window.setInterval(() => {
      target.cooldown--;
      if (target.cooldown <= 0) {
        if (target.timer) clearInterval(target.timer);
        target.timer = null;
        target.status = "idle";
      }
    }, 1000);
  };

  /**
   * Triggers an asynchronous backend update for the specified domain.
   *
   * @param key - The domain key to refresh.
   */
  const refresh = async (key: TargetKey) => {
    const target = targets[key];
    if (target.status === "loading" || target.cooldown > 0) return;

    target.status = "loading";

    try {
      const response = await triggerBackendUpdate(key);
      if (response.status === "success") {
        startCooldown(key);
      } else {
        // Still cooldown on failure to prevent spam
        startCooldown(key);
      }
    } catch (e) {
      console.error(`Backend refresh failed [${key}]`, e);
      startCooldown(key); // Cooldown on error too
    }
  };

  // Lifecycle Cleanup: Ensure no intervals leak if the scope is disposed.
  onScopeDispose(() => {
    Object.values(targets).forEach((t) => {
      if (t.timer) clearInterval(t.timer);
    });
  });

  return {
    targets,
    isRefreshing,
    refresh,
  };
}
