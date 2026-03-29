// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";
import { HubPersistenceService } from "../services/HubPersistenceService.js";
import { HubState } from "../types/HubTypes.js";

describe("HubPersistenceService", () => {
  const dirPath = path.resolve(process.cwd(), "test_data");
  
  // Override internal paths for isolated testing via prototype / mocked methods
  const MOCK_FILE_PATH = path.join(dirPath, "hub_state.json");

  beforeEach(() => {
    vi.spyOn(fs, "mkdir").mockResolvedValue(true as any);
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "rename").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({ 
      metadata: { 
        source: "TEST", 
        timestamp: "now", 
        lastCompiled: "now",
        lastFetched: "now",
        version: "test", 
        status: "healthy" 
      },
      data: { roster: [], headhunter: [] }
    }));
    vi.spyOn(fs, "rm").mockResolvedValue();

    // Force internal paths via mock
    (HubPersistenceService as any).FILE_DIR = dirPath;
    (HubPersistenceService as any).FILE_PATH = MOCK_FILE_PATH;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize the directory", async () => {
    await HubPersistenceService.init();
    expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
  });

  it("should save state using an atomic rename operation", async () => {
    const dummyState: HubState = { 
        metadata: { 
            source: "SAVE_TEST", 
            timestamp: "now", 
            lastCompiled: "now",
            lastFetched: "now",
            version: "test", 
            status: "healthy" 
        }, 
        data: { roster: [], headhunter: [] } 
    };

    await HubPersistenceService.saveState(dummyState);

    expect(fs.writeFile).toHaveBeenCalled();
    expect(fs.rename).toHaveBeenCalled();
  });

  it("should cleanup temporary file and throw HubError on rename failure", async () => {
      vi.spyOn(fs, "rename").mockRejectedValue(new Error("Permission denied"));

      const dummyState: HubState = { 
        metadata: { 
            source: "SAVE_TEST", 
            timestamp: "now", 
            lastCompiled: "now",
            lastFetched: "now",
            version: "test", 
            status: "healthy" 
        }, 
        data: { roster: [], headhunter: [] } 
      };

      try {
        await HubPersistenceService.saveState(dummyState);
      } catch (err: any) {
        expect(err.code).toBe("ERR_PERSISTENCE_FAILED");
        expect(err.layer).toBe("WORKER_PERSISTENCE");
      }

      expect(fs.rm).toHaveBeenCalled();
  });

  it("should load state properly from disk", async () => {
     const state = await HubPersistenceService.loadState();
     expect(fs.readFile).toHaveBeenCalledWith(MOCK_FILE_PATH, { encoding: "utf8" });
     expect(state?.metadata.source).toBe("TEST");
  });

  it("should return null if file does not exist", async () => {
      const enoent = new Error("ENOENT");
      (enoent as any).code = "ENOENT";
      vi.spyOn(fs, "readFile").mockRejectedValue(enoent);

      const state = await HubPersistenceService.loadState();
      expect(state).toBeNull();
  });
});
