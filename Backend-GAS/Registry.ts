/**
 * ============================================================================
 * 🛰️ MODULE: REGISTRY (System Hub)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The Central Hub for service coordination and legacy action mapping.
 *    Acts as the "Single Source of Truth" for AI Agents and System Automation.
 * ⚙️ CAPABILITIES:
 *    1. Service Aggregation: Access all pure singletons from one object.
 *    2. Action Mapping: Maps legacy global functions to structured, queryable keys.
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

import Store from "./Store";
import Network from "./Network";
import Core from "./Core";
import View from "./View";
import Schema from "./Schema";
import Time from "./Time";
import ScoringSystem from "./ScoringSystem";
import Headhunter from "./Headhunter";

import type { IStore } from "./Store";
import type { INetwork } from "./Network";
import type { ICore } from "./Core";
import type { IView } from "./View";
import type { ISchema } from "./Schema";
import type { ITime } from "./Time";
import type { IScoringSystem } from "./ScoringSystem";
import type { IHeadhunter } from "./Headhunter";

// Global Version Constant
// @ts-ignore
const VER_REGISTRY = "1.0.0";

declare var module: any;

// 1. Singletons are now explicitly imported above

// 2. Declare Legacy Global Functions (The "Old World")
declare function updateClanDatabase(): void;
declare function updateLeaderboard(): void;
declare function scoutRecruits(): void;
declare function checkSystemHealth(): void;
declare function refreshWebPayload(): void;
declare function createTriggers(): void;
declare function taskWarmUpWorker(): void;
declare function dispatchMaster(): void;

export interface IRegistry {
  Services: {
    readonly Store: IStore;
    readonly Network: INetwork;
    readonly Core: ICore;
    readonly View: IView;
    readonly Schema: ISchema;
    readonly Time: ITime;
    readonly ScoringSystem: IScoringSystem;
    readonly Headhunter: IHeadhunter;
  };
  Actions: Record<string, () => void>;
}

var Registry: IRegistry = {
  /**
   * 🏢 INFRASTRUCTURE (Singletons)
   * Direct access to the "Clean Stack" services.
   */
  Services: {
    get Store() { return Store; },
    get Network() { return Network; },
    get Core() { return Core; },
    get View() { return View; },
    get Schema() { return Schema; },
    get Time() { return Time; },
    get ScoringSystem() { return ScoringSystem; },
    get Headhunter() { return Headhunter; }
  },

  /**
   * ⚡ CAPABILITIES (Action Map)
   * A registry of everything the system can "DO".
   * Ideal for AI Agents to query capabilities.
   */
  Actions: {
    // 📊 DATA SYNC
    "sync:database": () => updateClanDatabase(),
    "sync:leaderboard": () => updateLeaderboard(),
    "sync:webapp": () => refreshWebPayload(),

    // 🕵️ RECRUITMENT
    "recruit:scout": () => Headhunter.scout(),

    // 🛠️ SYSTEM
    "system:health": () => checkSystemHealth(),
    "system:warmup": () => taskWarmUpWorker(),
    "system:triggers": () => createTriggers(),
    "system:master": () => dispatchMaster(),
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Registry;
}

/**
 * 🌍 GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { Registry, VER_REGISTRY });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Registry;
