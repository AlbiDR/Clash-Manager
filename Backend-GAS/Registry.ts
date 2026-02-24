/**
 * MODULE: REGISTRY (System Hub)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The Central Hub for service coordination and legacy action mapping.
 *    Acts as the "Single Source of Truth" for AI Agents and System Automation.
 * CAPABILITIES:
 *    1. Service Aggregation: Access all pure singletons from one object.
 *    2. Action Mapping: Maps legacy global functions to structured, queryable keys.
 * VERSION: 13.1.0
 * ============================================================================
 */

import Store from "./Store";
import Network from "./Network";
import Core from "./Core";
import View from "./View";
import Schema from "./Schema";
import Time from "./Time";
import Scoring from "./Scoring"; // Renamed
import Headhunter from "./Headhunter";
import Database from "./Database";
import Roster from "./Roster";
import ScoringKernel, { IScoringKernel } from './Scoring_Kernel'; // Renamed
import Reporting, { IReporting } from './Service_Reporting';

import type { IStore } from "./Store";
import type { INetwork } from "./Network";
import type { ICore } from "./Core";
import type { IView } from "./View";
import type { ISchema } from "./Schema";
import type { ITime } from "./Time";
import type { IScoring } from "./Scoring"; // Renamed
import type { IHeadhunter } from "./Headhunter";
import type { IDatabase } from "./Database";
import type { IRoster } from "./Roster_Types";

// Global Version Constant
// @ts-ignore
// HARDEN: Unified versioning prevents false-negative health check failures.
const VER_REGISTRY = "13.1.0";

declare var module: any;

// 1. Singletons are now explicitly imported above

// 2. Declare Legacy Global Functions (The "Old World")
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
    readonly Scoring: IScoring; // Renamed
    readonly Headhunter: IHeadhunter;
    readonly Database: IDatabase;
    readonly Roster: IRoster;
    readonly ScoringKernel: IScoringKernel; // Renamed
    readonly Reporting: IReporting;
  };
  Actions: Record<string, () => void>;
}

var Registry: IRegistry = {
  /**
   * INFRASTRUCTURE (Singletons)
   * Direct access to the "Clean Stack" services.
   */
  Services: {
    get Store() { return Store; },
    get Network() { return Network; },
    get Core() { return Core; },
    get View() { return View; },
    get Schema() { return Schema; },
    get Time() { return Time; },
    get Scoring() { return Scoring; }, // Renamed
    get Headhunter() { return Headhunter; },
    get Database() { return Database; },
    get Roster() { return Roster; },
    get ScoringKernel() { return ScoringKernel; }, // Renamed
    get Reporting() { return Reporting; }
  },

  /**
   * CAPABILITIES (Action Map)
   * A registry of everything the system can "DO".
   * Ideal for AI Agents to query capabilities.
   */
  Actions: {
    // DATA SYNC
    "sync:database": () => Database.update(),
    "sync:roster": () => Roster.update(),
    "sync:leaderboard": () => Roster.update(),
    "sync:webapp": () => refreshWebPayload(),

    // RECRUITMENT
    "headhunter:scout": () => Headhunter.scout(),

    // SYSTEM
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
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { Registry, VER_REGISTRY });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Registry;
