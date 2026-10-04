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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as RecruitClient from "../RecruitClient";

// Mock Supabase JS Client
const mockFrom = {
  select: vi.fn(),
  limit: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  abortSignal: vi.fn(),
  insert: vi.fn(),
};

// Mock Realtime Channel
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

// Make them fluent and thenable
[mockFrom.select, mockFrom.limit, mockFrom.eq, mockFrom.single, mockFrom.abortSignal, mockFrom.insert].forEach(m => {
  m.mockImplementation(() => {
    return Object.assign(Promise.resolve({ data: null, error: null }), mockFrom);
  });
});

// Hoisted mock client -- referenced directly in tests so vi.clearAllMocks()
// does not sever the reference to the mock factory's return value.
const mockClient = {
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  from: vi.fn(() => mockFrom),
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
  realtime: { isConnected: vi.fn(() => true) },
};
(mockClient as any).schema = vi.fn(() => mockClient);

let realtimeCleanups: Array<() => void> = [];

function subscribeToBlacklistForTest(
  onInsert: (playerTag: string) => void | Promise<void>,
  onDelete: (playerTag: string) => void | Promise<void>,
  onError = vi.fn(),
  onResync?: () => void | Promise<void>,
): () => void {
  const cleanup = RecruitClient.subscribeToBlacklist(onInsert, onDelete, onError, onResync);
  realtimeCleanups.push(cleanup);
  return cleanup;
}

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("RecruitClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCleanups = [];
    // vi.clearAllMocks() wipes mock implementations; restore safe defaults.
    mockClient.rpc.mockResolvedValue({ data: null, error: null });
    mockClient.channel.mockImplementation(() => mockChannel);
    mockClient.removeChannel.mockResolvedValue(undefined);
    mockClient.realtime.isConnected.mockReturnValue(true);
    mockChannel.on.mockReturnThis();
    mockChannel.subscribe.mockReturnThis();
  });

  afterEach(() => {
    realtimeCleanups.forEach(cleanup => cleanup());
    vi.unstubAllGlobals();
  });

  describe("Leaderboard harvest", () => {
    const harvestedPlayer = { tag: "#SCOUT", name: "Scout" };

    it("returns a validated direct harvest and forwards cancellation", async () => {
      const signal = new AbortController().signal;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [harvestedPlayer], region: "global" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(RecruitClient.scoutLeaderboard("global", signal)).resolves.toEqual({
        items: [harvestedPlayer],
        region: "global",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/functions/v1/query-royale-api"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ endpoint: "global" }),
          signal,
        }),
      );
    });

    it("unwraps and validates an enveloped harvest", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { items: [harvestedPlayer] } }),
      }));

      await expect(RecruitClient.scoutLeaderboard("local")).resolves.toEqual({
        items: [harvestedPlayer],
        region: "Unknown",
      });
    });

    it("uses the server's failure message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Leaderboard denied" }),
      }));

      await expect(RecruitClient.scoutLeaderboard("global")).rejects.toThrow(
        "Leaderboard denied",
      );
    });

    it("falls back to the HTTP status when an error body has no message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({}),
      }));

      await expect(RecruitClient.scoutLeaderboard("global")).rejects.toThrow(
        "Query failed with status 429",
      );
    });

    it("falls back to the HTTP status when the error body is unreadable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: vi.fn().mockRejectedValue(new Error("invalid JSON")),
      }));

      await expect(RecruitClient.scoutLeaderboard("local")).rejects.toThrow("HTTP 502");
    });

    it("rejects a malformed successful harvest", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [{ tag: 42 }] }),
      }));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(RecruitClient.scoutLeaderboard("global")).rejects.toThrow(
        "Invalid response structure from harvest engine.",
      );
      expect(consoleError).toHaveBeenCalledWith(
        "[Scout] Validation failed:",
        expect.any(Array),
      );
      consoleError.mockRestore();
    });
  });

  describe("Scouting", () => {
    it("scanRecruitsDirect returns mapped recruits", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({
        data: [{ player_tag: '#NEW', player_name: 'Newbie', trophies: 3000 }],
        error: null
      });

      const result = await RecruitClient.scanRecruitsDirect();
      expect(result).toHaveLength(1);
      expect(result![0].n).toBe('Newbie');
    });

    it("scanRecruitsDirect returns null if fetch fails", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({ data: null, error: { message: 'Fetch Failed' } } as any);
      const result = await RecruitClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });

    it("scanRecruitsDirect uses fallback for malformed rows", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({
        data: [{ malformed: true }],
        error: null
      });

      const result = await RecruitClient.scanRecruitsDirect();
      expect(result).toHaveLength(1);
      expect(result![0].n).toBe('');
      expect(result![0].t).toBe(0);
    });
  });

  describe("Mutations", () => {
    it("dismissRecruits normalizes player tags idempotently", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });
      const items = [{ id: '#ABC', score: 80 }, { id: 'XYZ', score: 90 }];

      await RecruitClient.dismissRecruits(items);

      expect(mockClient.rpc).toHaveBeenCalledWith('dismiss_recruits', {
        items: [
          { id: '#ABC', score: 80 },
          { id: '#XYZ', score: 90 }
        ]
      });
    });

    it("undismissRecruits normalizes player tags idempotently", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });
      const ids = ['#ABC', 'XYZ'];

      await RecruitClient.undismissRecruits(ids);

      expect(mockClient.rpc).toHaveBeenCalledWith('undismiss_recruits', {
        player_tags: ['#ABC', '#XYZ']
      });
    });

    it("dismissRecruits throws NetworkError on RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'Timeout' } } as any);

      const items = [{ id: 'ABC', score: 80 }];
      await expect(RecruitClient.dismissRecruits(items)).rejects.toThrow();
    });

    it("undismissRecruits normalizes tags and throws NetworkError on any RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'failed to fetch' } } as any);

      const ids = ['ABC'];
      await expect(RecruitClient.undismissRecruits(ids)).rejects.toThrow();

      // Verify tags are normalized
      expect(mockClient.rpc).toHaveBeenCalledWith('undismiss_recruits', { player_tags: ['#ABC'] });
    });

    it("dismissRecruits throws Valibot error on malformed RPC response", async () => {
      // success field is missing, which is required by DismissResponseSchema
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { count: 5 }, error: null });

      const items = [{ id: 'ABC', score: 80 }];
      await expect(RecruitClient.dismissRecruits(items)).rejects.toThrow();
    });
  });

  describe("Realtime", () => {
    it("subscribeToBlacklist sets up listeners for INSERT and DELETE", () => {
      const onInsert = vi.fn();
      const onDelete = vi.fn();

      subscribeToBlacklistForTest(onInsert, onDelete);

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: 'INSERT', schema: 'drivers', table: 'recruit_blacklist' },
        expect.any(Function)
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: 'DELETE', schema: 'drivers', table: 'recruit_blacklist' },
        expect.any(Function)
      );

      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it("onInsert callback is triggered on INSERT event with valid payload", () => {
      const onInsert = vi.fn();
      const onDelete = vi.fn();

      subscribeToBlacklistForTest(onInsert, onDelete);

      // Find the INSERT handler
      const insertHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === 'INSERT'
      )![2];

      insertHandler({ new: { player_tag: '#ABC' } });
      expect(onInsert).toHaveBeenCalledWith('#ABC');

      // Invalid payload should not trigger callback
      onInsert.mockClear();
      insertHandler({ new: { invalid: true } });
      expect(onInsert).not.toHaveBeenCalled();
    });

    it("propagates invalid external events through the typed error callback", () => {
      const onError = vi.fn();
      subscribeToBlacklistForTest(vi.fn(), vi.fn(), onError);

      const insertHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === "INSERT"
      )![2];
      insertHandler({ new: { invalid: true } });

      expect(onError).toHaveBeenCalledWith(expect.any(RecruitClient.BlacklistSubscriptionError));
      expect(onError.mock.calls[0]![0].message).toBe("Invalid blacklist insert event");
    });

    it("onDelete callback is triggered on DELETE event with valid payload", () => {
      const onInsert = vi.fn();
      const onDelete = vi.fn();

      subscribeToBlacklistForTest(onInsert, onDelete);

      // Find the DELETE handler
      const deleteHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === 'DELETE'
      )![2];

      deleteHandler({ old: { player_tag: '#XYZ' } });
      expect(onDelete).toHaveBeenCalledWith('#XYZ');

      // Invalid payload should not trigger callback
      onDelete.mockClear();
      deleteHandler({ old: {} });
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("shares one channel across callers and retains it until the final cleanup", () => {
      const rootOnInsert = vi.fn();
      const transientOnInsert = vi.fn();
      const rootCleanup = subscribeToBlacklistForTest(rootOnInsert, vi.fn());
      const transientCleanup = subscribeToBlacklistForTest(transientOnInsert, vi.fn());

      expect(mockClient.channel).toHaveBeenCalledTimes(1);
      expect(mockChannel.on).toHaveBeenCalledTimes(2);
      expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);

      const insertHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === "INSERT"
      )![2];

      // A Headhunter view can unmount without tearing down the app-shell's
      // subscription or starving its callback.
      transientCleanup();
      expect(mockClient.removeChannel).not.toHaveBeenCalled();

      insertHandler({ new: { player_tag: "#ROOT" } });
      expect(rootOnInsert).toHaveBeenCalledWith("#ROOT");
      expect(transientOnInsert).not.toHaveBeenCalled();

      rootCleanup();
      expect(mockClient.removeChannel).toHaveBeenCalledWith(mockChannel);
    });

    it("delivers one validated event to every active logical subscriber", () => {
      const firstOnDelete = vi.fn();
      const secondOnDelete = vi.fn();
      subscribeToBlacklistForTest(vi.fn(), firstOnDelete);
      subscribeToBlacklistForTest(vi.fn(), secondOnDelete);

      const deleteHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === "DELETE"
      )![2];

      deleteHandler({ old: { player_tag: "#SHARED" } });
      expect(firstOnDelete).toHaveBeenCalledWith("#SHARED");
      expect(secondOnDelete).toHaveBeenCalledWith("#SHARED");
    });

    it("isolates a failing subscriber and propagates its typed callback error", () => {
      const subscriberFailure = new Error("feature callback failed");
      const firstOnError = vi.fn();
      const secondOnInsert = vi.fn();
      subscribeToBlacklistForTest(() => { throw subscriberFailure; }, vi.fn(), firstOnError);
      subscribeToBlacklistForTest(secondOnInsert, vi.fn());

      const insertHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === "INSERT"
      )![2];
      insertHandler({ new: { player_tag: "#SHARED" } });

      expect(firstOnError).toHaveBeenCalledWith(expect.any(RecruitClient.BlacklistSubscriptionError));
      expect(firstOnError.mock.calls[0]![0].cause).toBe(subscriberFailure);
      expect(secondOnInsert).toHaveBeenCalledWith("#SHARED");
    });

    it("propagates an asynchronously rejected subscriber callback", async () => {
      const subscriberFailure = new Error("async feature callback failed");
      const onError = vi.fn();
      subscribeToBlacklistForTest(
        () => Promise.reject(subscriberFailure),
        vi.fn(),
        onError,
      );

      const insertHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === "INSERT"
      )![2];
      insertHandler({ new: { player_tag: "#ASYNC" } });

      await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(onError.mock.calls[0]![0]).toBeInstanceOf(RecruitClient.BlacklistSubscriptionError);
      expect(onError.mock.calls[0]![0].cause).toBe(subscriberFailure);
    });

    it("propagates a channel the server refused to every subscriber", () => {
      const firstOnError = vi.fn();
      const secondOnError = vi.fn();
      subscribeToBlacklistForTest(vi.fn(), vi.fn(), firstOnError);
      subscribeToBlacklistForTest(vi.fn(), vi.fn(), secondOnError);
      const subscriptionStatusHandler = vi.mocked(mockChannel.subscribe).mock.calls[0]![0];
      const channelFailure = new Error("join refused");

      subscriptionStatusHandler("CHANNEL_ERROR", channelFailure);

      expect(firstOnError.mock.calls[0]![0].cause).toBe(channelFailure);
      expect(secondOnError.mock.calls[0]![0].cause).toBe(channelFailure);
    });

    it("reports a refusal once until the channel joins again", () => {
      const onError = vi.fn();
      subscribeToBlacklistForTest(vi.fn(), vi.fn(), onError);
      const subscriptionStatusHandler = vi.mocked(mockChannel.subscribe).mock.calls[0]![0];

      subscriptionStatusHandler("CHANNEL_ERROR", new Error("join refused"));
      subscriptionStatusHandler("CHANNEL_ERROR", new Error("join refused"));
      expect(onError).toHaveBeenCalledOnce();

      subscriptionStatusHandler("SUBSCRIBED");
      subscriptionStatusHandler("CHANNEL_ERROR", new Error("join refused"));
      expect(onError).toHaveBeenCalledTimes(2);
    });

    it("does not report a dropped connection, and resyncs once the channel is back", () => {
      const onError = vi.fn();
      const onResync = vi.fn();
      subscribeToBlacklistForTest(vi.fn(), vi.fn(), onError, onResync);
      const subscriptionStatusHandler = vi.mocked(mockChannel.subscribe).mock.calls[0]![0];

      subscriptionStatusHandler("SUBSCRIBED");
      expect(onResync).not.toHaveBeenCalled();

      // The app went to the background and its WebSocket closed.
      mockClient.realtime.isConnected.mockReturnValue(false);
      subscriptionStatusHandler("CHANNEL_ERROR", new Error("socket closed: 1006"));
      subscriptionStatusHandler("CHANNEL_ERROR", new Error("channel error: connection lost"));
      expect(onError).not.toHaveBeenCalled();
      expect(onResync).not.toHaveBeenCalled();

      mockClient.realtime.isConnected.mockReturnValue(true);
      subscriptionStatusHandler("SUBSCRIBED");
      expect(onResync).toHaveBeenCalledOnce();

      subscriptionStatusHandler("SUBSCRIBED");
      expect(onResync).toHaveBeenCalledOnce();
    });

    it("reports a failed resync through the error channel", async () => {
      const onError = vi.fn();
      const resyncFailure = new Error("refresh failed");
      subscribeToBlacklistForTest(vi.fn(), vi.fn(), onError, () => Promise.reject(resyncFailure));
      const subscriptionStatusHandler = vi.mocked(mockChannel.subscribe).mock.calls[0]![0];

      mockClient.realtime.isConnected.mockReturnValue(false);
      subscriptionStatusHandler("CHANNEL_ERROR", new Error("socket closed: 1006"));
      mockClient.realtime.isConnected.mockReturnValue(true);
      subscriptionStatusHandler("SUBSCRIBED");

      await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(onError.mock.calls[0]![0].cause).toBe(resyncFailure);
    });

    it("does not report successful channel subscription statuses", () => {
      const onError = vi.fn();
      subscribeToBlacklistForTest(vi.fn(), vi.fn(), onError);
      const subscriptionStatusHandler = vi.mocked(mockChannel.subscribe).mock.calls[0]![0];

      subscriptionStatusHandler("SUBSCRIBED");

      expect(onError).not.toHaveBeenCalled();
    });

    it("throws a typed error when the channel cannot be initialized", () => {
      const setupFailure = new Error("channel setup failed");
      mockClient.channel.mockImplementationOnce(() => { throw setupFailure; });

      expect(() => subscribeToBlacklistForTest(vi.fn(), vi.fn())).toThrow(
        RecruitClient.BlacklistSubscriptionError,
      );
    });

    it("propagates synchronous channel cleanup failures", () => {
      const cleanupFailure = new Error("synchronous cleanup failed");
      const onError = vi.fn();
      mockClient.removeChannel.mockImplementationOnce(() => { throw cleanupFailure; });
      const cleanup = subscribeToBlacklistForTest(vi.fn(), vi.fn(), onError);

      cleanup();

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0]![0].cause).toBe(cleanupFailure);
    });

    it("propagates asynchronous channel cleanup failures", async () => {
      const cleanupFailure = new Error("asynchronous cleanup failed");
      const onError = vi.fn();
      mockClient.removeChannel.mockRejectedValueOnce(cleanupFailure);
      const cleanup = subscribeToBlacklistForTest(vi.fn(), vi.fn(), onError);

      cleanup();

      await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(onError.mock.calls[0]![0].cause).toBe(cleanupFailure);
    });

    it("uses a fresh topic if a new subscriber arrives before asynchronous cleanup settles", () => {
      const strictChannels = new Map<string, typeof mockChannel>();
      mockClient.channel.mockImplementation((topic: string) => {
        const existingChannel = strictChannels.get(topic);
        if (existingChannel) return existingChannel;

        let subscribed = false;
        const channel = {
          on: vi.fn(),
          subscribe: vi.fn(),
        } as typeof mockChannel;
        channel.on.mockImplementation(() => {
          if (subscribed) {
            throw new Error("cannot add callbacks after subscribe()");
          }
          return channel;
        });
        channel.subscribe.mockImplementation(() => {
          subscribed = true;
          return channel;
        });
        strictChannels.set(topic, channel);
        return channel;
      });

      let finishFirstRemoval: (() => void) | undefined;
      mockClient.removeChannel
        .mockImplementationOnce(
          () => new Promise<void>(resolve => { finishFirstRemoval = resolve; }),
        )
        .mockResolvedValueOnce(undefined);

      const firstCleanup = subscribeToBlacklistForTest(vi.fn(), vi.fn());
      const firstTopic = vi.mocked(mockClient.channel).mock.calls[0]![0];
      firstCleanup();

      // This mirrors a rapid component remount. The old topic is still joined
      // until Supabase resolves removeChannel(), so reusing it would throw when
      // adding the Postgres listeners. A new lifecycle must not touch it.
      expect(() => subscribeToBlacklistForTest(vi.fn(), vi.fn())).not.toThrow();
      const secondTopic = vi.mocked(mockClient.channel).mock.calls[1]![0];

      expect(secondTopic).not.toBe(firstTopic);
      expect(strictChannels.get(firstTopic)!.on).toHaveBeenCalledTimes(2);
      expect(strictChannels.get(secondTopic)!.on).toHaveBeenCalledTimes(2);

      finishFirstRemoval?.();
    });
  });
});
