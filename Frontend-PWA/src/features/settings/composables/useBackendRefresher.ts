// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { reactive, onScopeDispose } from "vue";
import { triggerBackendUpdate } from "@core/api/MaintenanceClient";
import {
  useClashDataStore,
  BACKEND_REFRESH_COOLDOWN_SECONDS,
  BACKEND_REFRESH_COOLDOWN_INTERVAL
} from "@core";
import { useHaptics } from "@shared";
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
  const haptics = useHaptics();
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
    target.cooldown = BACKEND_REFRESH_COOLDOWN_SECONDS;
    target.status = "cooldown";

    if (target.timer) clearInterval(target.timer);

    target.timer = window.setInterval(() => {
      target.cooldown--;
      if (target.cooldown <= 0) {
        if (target.timer) clearInterval(target.timer);
        target.timer = null;
        target.status = "idle";
      }
    }, BACKEND_REFRESH_COOLDOWN_INTERVAL);
  };

  /**
   * Triggers an asynchronous backend update for the specified domain.
   *
   * @param key - The domain key to refresh.
   */
  const refresh = async (key: TargetKey) => {
    const target = targets[key];
    if (target.status === "loading" || target.cooldown > 0) return;

    // [DECISION LOG] BROKERED TACTILE FEEDBACK: Triggers a standard tap haptic
    // to acknowledge manual refresh intent in the Android WebView shell.
    haptics.tap();

    target.status = "loading";

    try {
      // NOTE: the backend's trigger_backend_update RPC takes no target argument and
      // always runs the full pipeline; `key` only selects which button/cooldown
      // this click affects locally, it does not scope what the backend refreshes.
      const response = await triggerBackendUpdate();
      if (!response.success) {
        console.error(`Backend refresh failed [${key}]`, response.error);
      }
      // Cooldown applies on both outcomes to prevent spamming the trigger.
      startCooldown(key);
    } catch (backendRefreshError) {
      console.error(`Backend refresh failed [${key}]`, backendRefreshError);
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
