
/**
 * ============================================================================
 * 🔧 MODULE: REPAIR & ACTIVATION SYSTEM
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Critical utility suite for manual system recovery.
 * ⚙️ ROLE: Allows users to manually set URLs and Keys that persist in Prop Store.
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

import type { IRegistry } from "./Registry";

declare const Registry: IRegistry;
declare var PropertiesService: GoogleAppsScript.Properties.PropertiesService;

/**
 * 🚀 ACTIVATE INDUSTRIAL WORKER
 * Manually registers the Cloud Worker URL into persistent memory.
 * Usage: Run this once after a new Cloud deployment.
 */
function activateIndustrialWorker(): void {
  const URL = "https://clash-manager-worker.onrender.com";
  
  try {
     PropertiesService.getScriptProperties().setProperty("RemoteWorkerUrl", URL);
     console.log(`✅ SUCCESS: Industrial Worker registered at ${URL}`);
     console.info("Please run 'checkSystemHealth' from the menu to verify connectivity.");
  } catch (e: any) {
    console.error(`❌ FAILED: Could not save worker URL. ${e.message}`);
  }
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { activateIndustrialWorker });
