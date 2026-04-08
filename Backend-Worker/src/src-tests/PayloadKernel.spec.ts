// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { PayloadKernel } from "../services/PayloadKernel.js";

describe("PayloadKernel (Worker Hub)", () => {
  it("should generate a proper HubState matrix from raw GAS data", () => {
    const rawFeed = {
      timestamp: new Date().toISOString(),
      source: "GAS_RAW_STORE",
      tables: {
        roster: [["#123", "PlayerOne"]],
        headhunter: [["#456", "RecruitA"]]
      }
    };

    const state = PayloadKernel.generateMatrix(rawFeed);
    
    expect(state).toBeDefined();
    expect(state.metadata.source).toBe("RENDER_WORKER");
    expect(state.metadata.status).toBe("healthy");
    expect(state.metadata.version).toBe("10.1.4");
    expect(state.data.roster).toHaveLength(1);
    expect(state.data.headhunter).toHaveLength(1);
    expect(state.data.roster[0]?.[1]).toBe("PlayerOne");
  });

  it("should throw a typed HubError perfectly when tables are missing", () => {
    const rawFeed = {
      malformed: true
    };

    expect(() => PayloadKernel.generateMatrix(rawFeed)).toThrowError("Upstream (GAS) returned malformed or unvalidated table data.");
    
    try {
      PayloadKernel.generateMatrix(rawFeed);
    } catch (e: any) {
      expect(e.code).toBe("ERR_MATRIX_CORRUPTED");
      expect(e.layer).toBe("WORKER_PAYLOAD_KERNEL");
    }
  });
});
