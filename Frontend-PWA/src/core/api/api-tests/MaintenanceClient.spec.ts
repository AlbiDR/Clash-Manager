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
      vi.mocked(mockClient.rpc).mockResolvedValue({
        data: { success: true, message: "Trigger received" },
        error: null
      });

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true, message: "Trigger received" });
    });

    it("triggerBackendUpdate returns error if RPC fails", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'Trigger Failed' } } as any);

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Trigger Failed');
    });

    it("triggerBackendUpdate returns validation error if RPC returns malformed data", async () => {
      const mockClient = vi.mocked(createClient)();
      // Missing 'message' field
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_FAILED');
    });
  });

  describe("Push Notifications", () => {
    it("subscribeToPush inserts valid subscription", async () => {
      vi.mocked(mockFrom.insert).mockResolvedValue({ error: null } as any);

      const mockSub = {
        toJSON: () => ({
          endpoint: 'https://push.com/v1',
          keys: { p256dh: 'key1', auth: 'auth1' }
        })
      };

      const result = await MaintenanceClient.subscribeToPush(mockSub as any);
      expect(result).toBe(true);
      expect(mockFrom.insert).toHaveBeenCalledWith({
        subscription: {
          endpoint: 'https://push.com/v1',
          keys: { p256dh: 'key1', auth: 'auth1' }
        }
      });
    });

    it("subscribeToPush rejects invalid subscription", async () => {
      const mockSub = {
        toJSON: () => ({
          endpoint: 'not-a-url',
          keys: { p256dh: 'key1' } // Missing auth
        })
      };

      const result = await MaintenanceClient.subscribeToPush(mockSub as any);
      expect(result).toBe(false);
      expect(mockFrom.insert).not.toHaveBeenCalled();
    });

    it("subscribeToPush returns false if database insertion fails", async () => {
      vi.mocked(mockFrom.insert).mockResolvedValue({ error: { message: "DB Error" } } as any);

      const mockSub = {
        toJSON: () => ({
          endpoint: 'https://push.com/v1',
          keys: { p256dh: 'key1', auth: 'auth1' }
        })
      };

      const result = await MaintenanceClient.subscribeToPush(mockSub as any);
      expect(result).toBe(false);
    });
  });
});
