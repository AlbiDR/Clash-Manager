// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as MaintenanceClient from "../MaintenanceClient";

// Mock Supabase JS Client
const mockFrom = {
  insert: vi.fn(),
};

mockFrom.insert.mockImplementation(() => {
  return Object.assign(Promise.resolve({ data: null, error: null }), mockFrom);
});

// Hoisted mock client -- referenced directly in tests so vi.clearAllMocks()
// does not sever the reference to the mock factory's return value.
const mockClient = {
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  from: vi.fn(() => mockFrom),
};
(mockClient as any).schema = vi.fn(() => mockClient);

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("MaintenanceClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() wipes mock implementations; restore a safe default.
    mockClient.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe("Pipeline Operations", () => {
    it("triggerBackendUpdate returns success/failure based on RPC", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({
        data: { success: true, message: "Trigger received" },
        error: null
      });

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true, message: "Trigger received" });
    });

    it("triggerBackendUpdate returns error if RPC fails", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'Trigger Failed' } } as any);

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Trigger Failed');
    });

    it("triggerBackendUpdate returns validation error if RPC returns malformed data", async () => {
      // Missing 'message' field
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await MaintenanceClient.triggerBackendUpdate();
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_FAILED');
    });
  });

  describe("Push Notifications", () => {
    it("subscribeToPush registers a valid subscription through the features RPC", async () => {
      // The write must go through the RPC, not a direct table insert: the
      // drivers schema is not exposed on the remote Data API, so an insert is
      // rejected with PGRST106 before it reaches a row.
      vi.mocked(mockClient.rpc).mockResolvedValue({
        data: { success: true, refreshed: false },
        error: null,
      });

      const mockSub = {
        toJSON: () => ({
          endpoint: 'https://push.com/v1',
          keys: { p256dh: 'key1', auth: 'auth1' }
        })
      };

      const result = await MaintenanceClient.subscribeToPush(mockSub as any);
      expect(result).toBe(true);
      expect(mockClient.rpc).toHaveBeenCalledWith('register_push_subscription', {
        subscription: {
          endpoint: 'https://push.com/v1',
          keys: { p256dh: 'key1', auth: 'auth1' }
        }
      });
      expect(mockFrom.insert).not.toHaveBeenCalled();
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
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("subscribeToPush returns false if the RPC transport fails", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { message: "DB Error" } } as any);

      const mockSub = {
        toJSON: () => ({
          endpoint: 'https://push.com/v1',
          keys: { p256dh: 'key1', auth: 'auth1' }
        })
      };

      const result = await MaintenanceClient.subscribeToPush(mockSub as any);
      expect(result).toBe(false);
    });

    it("subscribeToPush returns false when the RPC reports failure in-band", async () => {
      // The RPC surfaces a rejected payload (e.g. a missing endpoint) as
      // success:false with no transport error, so the absence of an error is
      // not sufficient evidence that the subscription was stored.
      vi.mocked(mockClient.rpc).mockResolvedValue({
        data: { success: false, message: "Push subscription is missing an endpoint." },
        error: null,
      });

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
