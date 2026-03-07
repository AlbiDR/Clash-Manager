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
import ScoringKernel, { ScoringKernelContract } from './ScoringKernel'; // Renamed
import Reporting, { ReportingContract } from './Reporting';
import WebappController, { WebappControllerContract } from './WebappController';
import BattleLog, { BattleLogContract } from './BattleLog';
import Orchestrator, { OrchestratorContract } from './Orchestrator';

import type { StoreContract } from "./Store";
import type { NetworkContract } from "./Network";
import type { CoreContract } from "./Core";
import type { ViewContract } from "./View";
import type { SchemaContract } from "./Schema";
import type { TimeContract } from "./Time";
import type { ScoringContract } from "./Scoring"; // Renamed
import type { HeadhunterContract } from "./Headhunter";
import type { DatabaseContract } from "./Database";
import type { RosterContract } from "./RosterTypes";
import type { BattleLogContract } from "./BattleLog";
import type { WebappControllerContract } from "./WebappController";

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

export interface RegistryContract {
  Services: {
    readonly Store: StoreContract;
    readonly Network: NetworkContract;
    readonly Core: CoreContract;
    readonly View: ViewContract;
    readonly Schema: SchemaContract;
    readonly Time: TimeContract;
    readonly Scoring: ScoringContract; // Renamed
    readonly Headhunter: HeadhunterContract;
    readonly Database: DatabaseContract;
    readonly Roster: RosterContract;
    readonly ScoringKernel: ScoringKernelContract; // Renamed
    readonly Reporting: ReportingContract;
    readonly WebappController: WebappControllerContract;
    readonly BattleLog: BattleLogContract;
    readonly Orchestrator: OrchestratorContract;
  };
  Actions: Record<string, () => void>;
}

var Registry: RegistryContract = {
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
    get Reporting() { return Reporting; },
    get WebappController() { return WebappController; },
    get BattleLog() { return BattleLog; },
    get Orchestrator() { return Orchestrator; }
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
    "sync:webapp": () => WebappController.refreshWebPayload(),

    // RECRUITMENT
    "headhunter:scout": () => Headhunter.scout(),

    // SYSTEM
    "system:health": () => Orchestrator.checkSystemHealth(),
    "system:warmup": () => taskWarmUpWorker(),
    "system:triggers": () => Orchestrator.createTriggers(),
    "system:master": () => Orchestrator.dispatchMaster(),
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
