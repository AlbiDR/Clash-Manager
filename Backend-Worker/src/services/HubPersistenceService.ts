// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { promises as fs } from "fs";
import * as path from "path";
import { HubState, HubError } from "../types/HubTypes.js";

/**
 * ============================================================================
 * [MODULE] HUB PERSISTENCE SERVICE
 * ----------------------------------------------------------------------------
 * Autonomous file-system driver. Persists the HubState payload using
 * atomic file renaming to guarantee 100% read consistency for the PWA.
 * ============================================================================
 */

export class HubPersistenceService {
  private static readonly FILE_DIR = path.resolve(process.cwd(), "data");
  private static readonly FILE_NAME = "hub_state.json";
  private static readonly FILE_PATH = path.join(this.FILE_DIR, this.FILE_NAME);

  /**
   * Initializes the persistence directory if it doesn't exist.
   */
  static async init(): Promise<void> {
    try {
      await fs.mkdir(this.FILE_DIR, { recursive: true });
    } catch (e) {
      console.error("[HubPersistence] Failed to initialize directory:", e);
    }
  }

  /**
   * Writes the state atomically to prevent JSON corruption during PWA reads.
   * 
   * @param state The structured HubState payload.
   */
  static async saveState(state: HubState): Promise<void> {
    const tempFilePath = path.join(this.FILE_DIR, `hub_state_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`);
    const rawData = JSON.stringify(state);
    
    try {
      // 1. Write to a temporary file
      await fs.writeFile(tempFilePath, rawData, { encoding: "utf8" });

      // 2. Atomically rename the temporary file to overwrite the target
      // This strictly avoids race conditions if the PWA is requesting the file
      // at the exact millisecond it is being updated.
      await fs.rename(tempFilePath, this.FILE_PATH);
    } catch (err: any) {
      // Clean up the temp file if the atomic rename fails
      await fs.rm(tempFilePath, { force: true });
      
      const error: HubError = {
        code: "ERR_PERSISTENCE_FAILED",
        message: `Atomic save failed. ${err.message}`,
        layer: "WORKER_PERSISTENCE"
      };
      
      console.error("[HubPersistence]", error);
      throw error;
    }
  }

  /**
   * Retrieves the latest committed HubState.
   * 
   * @returns The parsed HubState or null if no state has been committed yet.
   */
  static async loadState(): Promise<HubState | null> {
    try {
      const data = await fs.readFile(this.FILE_PATH, { encoding: "utf8" });
      return JSON.parse(data) as HubState;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return null;
      }
      console.error("[HubPersistence] Failed to load state:", err);
      return null; // Fallback to null on corruption, letting the daemon overwrite it soon.
    }
  }
}
