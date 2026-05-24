// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import * as MaintenanceClient from "../MaintenanceClient";

// Mock Supabase JS Client
const mockFrom = {
  insert: vi.fn(),
};

mockFrom.insert.mockImplementation(() => {
  return Object.assign(Promise.resolve({ data: null, error: null }), mockFrom);
});

vi.mock("@supabase/supabase-js", () => {
  const mockClient = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn(() => mockFrom),
  };
  (mockClient as any).schema = vi.fn(() => mockClient);

  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("MaintenanceClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Pipeline Operations", () => {
    it("triggerBackendUpdate returns success/failure based on RPC", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
    });

    it("triggerBackendUpdate returns error if RPC fails", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'Trigger Failed' } } as any);

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Trigger Failed');
    });
  });

  describe("Push Notifications", () => {
    it("subscribeToPush inserts subscription", async () => {
      vi.mocked(mockFrom.insert).mockResolvedValue({ error: null } as any);

      const sub = { endpoint: 'https://push.com' } as any;
      const result = await MaintenanceClient.subscribeToPush(sub);
      expect(result).toBe(true);
      expect(mockFrom.insert).toHaveBeenCalled();
    });
  });
});
