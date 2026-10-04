// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import {
  createSupabaseClient,
  getSupabaseUrl,
  getSupabaseKey,
} from "./SupabaseClient";
import { NetworkError } from "./ApiErrors";
import type {
  ApiResponse,
  DismissResponse,
  DismissalRequest,
  Recruit,
} from "@core/types";
import { mapSbHeadhunterRow } from "./DataMappers";
import * as v from "valibot";
import {
  DismissResponseSchema,
  BlacklistEventSchema,
  LeaderboardHarvestSchema,
} from "./RecruitSchemas";

const BLACKLIST_CHANNEL_NAME = "cm-blacklist-sync";

type BlacklistSubscriber = {
  onInsert: (playerTag: string) => void | Promise<void>;
  onDelete: (playerTag: string) => void | Promise<void>;
  onError: (error: BlacklistSubscriptionError) => void;
};

/** Typed transport failure propagated from Layer 1 to the subscribing feature. */
export class BlacklistSubscriptionError extends NetworkError {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "BlacklistSubscriptionError";
    this.cause = cause;
    Object.setPrototypeOf(this, BlacklistSubscriptionError.prototype);
  }
}

type BlacklistChannel = ReturnType<
  ReturnType<typeof createSupabaseClient>["channel"]
>;

type BlacklistSubscription = {
  client: ReturnType<typeof createSupabaseClient>;
  channel: BlacklistChannel;
  subscribers: Set<BlacklistSubscriber>;
};

// `createSupabaseClient()` is deliberately a singleton. Realtime's `channel()`
// therefore returns the same channel for a repeated topic, and its API rejects
// adding Postgres callbacks after that channel has subscribed. Keep one physical
// channel and fan its validated events out to each logical caller instead.
let blacklistSubscription: BlacklistSubscription | null = null;
let blacklistChannelGeneration = 0;

function notifyBlacklistSubscribers(
  subscribers: Set<BlacklistSubscriber>,
  event: keyof Pick<BlacklistSubscriber, "onInsert" | "onDelete">,
  playerTag: string,
): void {
  const eventName = event.slice(2).toLowerCase();
  for (const subscriber of subscribers) {
    try {
      const callbackResult = subscriber[event](playerTag);
      if (callbackResult instanceof Promise) {
        void callbackResult.catch((subscriberError: unknown) => {
          subscriber.onError(new BlacklistSubscriptionError(
            `Blacklist ${eventName} handler failed`,
            subscriberError,
          ));
        });
      }
    } catch (subscriberError) {
      // One consumer's feature-level failure must not silence the other active
      // consumers of this shared transport channel.
      subscriber.onError(new BlacklistSubscriptionError(
        `Blacklist ${eventName} handler failed`,
        subscriberError,
      ));
    }
  }
}

function notifyBlacklistErrors(
  subscribers: Set<BlacklistSubscriber>,
  error: BlacklistSubscriptionError,
): void {
  for (const subscriber of subscribers) subscriber.onError(error);
}

function nextBlacklistChannelName(): string {
  blacklistChannelGeneration += 1;
  // The first app lifetime keeps the established topic. A fresh generation
  // receives a distinct topic so a rapid remount cannot receive the still
  // joined channel while Supabase finishes its asynchronous removeChannel().
  return blacklistChannelGeneration === 1
    ? BLACKLIST_CHANNEL_NAME
    : `${BLACKLIST_CHANNEL_NAME}-${blacklistChannelGeneration}`;
}

function releaseBlacklistSubscriber(
  subscription: BlacklistSubscription,
  subscriber: BlacklistSubscriber,
): void {
  subscription.subscribers.delete(subscriber);
  if (subscription.subscribers.size > 0) return;

  // Clear the in-memory lease before the asynchronous Realtime leave completes,
  // so a later app lifetime can establish a fresh subscription instead of
  // retaining callbacks from an unmounted shell.
  blacklistSubscription = null;

  try {
    void Promise.resolve(subscription.client.removeChannel(subscription.channel)).catch(
      (channelRemovalError: unknown) => {
        subscriber.onError(new BlacklistSubscriptionError(
          "Failed to remove blacklist subscription",
          channelRemovalError,
        ));
      },
    );
  } catch (channelRemovalError) {
    subscriber.onError(new BlacklistSubscriptionError(
      "Failed to remove blacklist subscription",
      channelRemovalError,
    ));
  }
}

/**
 * RECRUIT CLIENT (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative transport layer for the Headhunter recruitment feature.
 * Features: Dismissal Operations, Blacklist Subscriptions, Direct Scouting.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 */

/**
 * Dismisses one or more recruits from the recruitment pool.
 *
 * @remarks
 * Requires an active network connection. Normalizes player tags before execution
 * (satisfies ADR Section III: Validation Boundaries).
 *
 * @param dismissalRequests - Array of dismissal requests containing player IDs.
 * @returns A Promise resolving to an ApiResponse.
 * @throws {NetworkError} If the network is unavailable or the RPC fails.
 */
export async function dismissRecruits(
  dismissalRequests: DismissalRequest[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  // [ADR] Normalize IDs: Ensure all tags have the # prefix to satisfy drivers.recruit_blacklist CHECK constraints.
  const normalizedItems = dismissalRequests.map(dismissalRequest => ({
    ...dismissalRequest,
    id: dismissalRequest.id.startsWith('#') ? dismissalRequest.id : `#${dismissalRequest.id}`
  }));

  // [THREAT:] Unvalidated RPC results can cause logic corruption in the feature layer.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data: dismissRpcResponse, error: dismissRpcError } = await supabase.rpc('dismiss_recruits', { items: normalizedItems });

  // [DESIGN] CONNECTION REQUIRED: Dismissal requires an active connection.
  // The offline queue has been removed. On any failure, throw immediately so
  // the caller can roll back the optimistic tombstone and inform the user.
  if (dismissRpcError) throw new NetworkError(dismissRpcError.message);

  return { success: true, data: v.parse(DismissResponseSchema, dismissRpcResponse) };
}

/**
 * Restores one or more dismissed recruits to the active pool.
 *
 * @remarks
 * Requires an active network connection. Normalizes player tags before execution
 * (satisfies ADR Section III: Validation Boundaries).
 *
 * @param targetTags - Array of player tags to restore.
 * @returns A Promise resolving to an ApiResponse.
 * @throws {NetworkError} If the network is unavailable or the RPC fails.
 */
export async function undismissRecruits(
  targetTags: string[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  const playerTagCandidates = targetTags.map(playerTagCandidate => playerTagCandidate.startsWith('#') ? playerTagCandidate : `#${playerTagCandidate}`);

  // [THREAT:] Unvalidated RPC results can cause logic corruption in the feature layer.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data: undismissRpcResponse, error: undismissRpcError } = await supabase.rpc('undismiss_recruits', { player_tags: playerTagCandidates });

  // [DESIGN] CONNECTION REQUIRED: Undismissal requires an active connection.
  if (undismissRpcError) throw new NetworkError(undismissRpcError.message);

  return { success: true, data: v.parse(DismissResponseSchema, undismissRpcResponse) };
}

/**
 * Executes a transient harvest of clanless players from global or local leaderboards.
 *
 * @remarks
 * Communicates with the `query-royale-api` Edge Function. This is a read-only
 * operation that does not persist data to the database.
 *
 * @param mode - The target leaderboard scope ('local' | 'global').
 * @param signal - Optional AbortSignal for request cancellation.
 * @returns A promise resolving to the validated harvest payload.
 * @throws {NetworkError} If the network is unavailable or the Edge Function fails.
 * @throws {v.ValiError} If the response fails schema validation.
 */
export async function scoutLeaderboard(
  mode: "local" | "global",
  signal?: AbortSignal,
): Promise<v.InferOutput<typeof LeaderboardHarvestSchema>> {
  const functionUrl = `${getSupabaseUrl()}/functions/v1/query-royale-api`;

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getSupabaseKey()}`,
    },
    body: JSON.stringify({ endpoint: mode }),
    signal,
  });

  if (!response.ok) {
    const errorDetails = await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}` }));
    throw new NetworkError(
      errorDetails.error ?? `Query failed with status ${response.status}`,
    );
  }

  const responseJson: unknown = await response.json();

  // [GUARD] VALIDATION BOUNDARY: Enforce schema on Edge Function response.
  const envelopeValidation = v.safeParse(
    v.union([
      v.object({ data: LeaderboardHarvestSchema }),
      LeaderboardHarvestSchema,
    ]),
    responseJson,
  );

  if (!envelopeValidation.success) {
    console.error("[Scout] Validation failed:", envelopeValidation.issues);
    throw new Error("Invalid response structure from harvest engine.");
  }

  const payload =
    "data" in envelopeValidation.output && envelopeValidation.output.data
      ? envelopeValidation.output.data
      : (envelopeValidation.output as v.InferOutput<
          typeof LeaderboardHarvestSchema
        >);

  return payload;
}

/**
 * Establishes a Realtime subscription on `drivers.recruit_blacklist`.
 *
 * @remarks
 * Listens for INSERT (cross-device dismissals) and DELETE (undismissals) events.
 * Requires `REPLICA IDENTITY FULL` on the table for DELETE payloads to carry
 * the old row data. Returns a cleanup function that removes the channel.
 *
 * **Architectural Context:**
 * - Layer: Layer 1 (@core). Acts as a transport factory only, providing the
 *   subscription infrastructure. No business logic is implemented here.
 * - Callers in Layer 3 (@features) supply the specific event handlers and logic.
 *
 * @param onInsert - Called with the player_tag when a blacklist row is inserted.
 * @param onDelete - Called with the player_tag when a blacklist row is deleted.
 * @param onError - Receives typed setup, validation, callback, channel, and cleanup failures.
 * @returns Cleanup function; call on component unmount. Multiple callers share
 * one physical Realtime channel, while retaining independent callbacks and
 * cleanup leases.
 */
export function subscribeToBlacklist(
  onInsert: (playerTag: string) => void | Promise<void>,
  onDelete: (playerTag: string) => void | Promise<void>,
  onError: (error: BlacklistSubscriptionError) => void,
): () => void {
  const subscriber: BlacklistSubscriber = { onInsert, onDelete, onError };

  if (!blacklistSubscription) {
    const client = createSupabaseClient();
    const subscribers = new Set<BlacklistSubscriber>();

    try {
      const channel = client
        .channel(nextBlacklistChannelName())
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "drivers", table: "recruit_blacklist" },
          (realtimePayload: unknown) => {
            // [THREAT:] Unvalidated realtime payloads (Target C) can cause runtime crashes.
            // [DECISION LOG] Replaced implicit 'any' and unsafe casting with strict
            // Valibot validation using BlacklistEventSchema to ensure data integrity.
            const blacklistValidation = v.safeParse(BlacklistEventSchema, realtimePayload);
            if (blacklistValidation.success && "new" in blacklistValidation.output) {
              notifyBlacklistSubscribers(
                subscribers,
                "onInsert",
                blacklistValidation.output.new.player_tag,
              );
            } else {
              notifyBlacklistErrors(subscribers, new BlacklistSubscriptionError(
                "Invalid blacklist insert event",
                blacklistValidation.issues,
              ));
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "drivers", table: "recruit_blacklist" },
          (realtimePayload: unknown) => {
            // [THREAT:] Unvalidated realtime payloads (Target C) can cause runtime crashes.
            // [DECISION LOG] Replaced implicit 'any' and unsafe casting with strict
            // Valibot validation using BlacklistEventSchema to ensure data integrity.
            const blacklistValidation = v.safeParse(BlacklistEventSchema, realtimePayload);
            if (blacklistValidation.success && "old" in blacklistValidation.output) {
              notifyBlacklistSubscribers(
                subscribers,
                "onDelete",
                blacklistValidation.output.old.player_tag,
              );
            } else {
              notifyBlacklistErrors(subscribers, new BlacklistSubscriptionError(
                "Invalid blacklist delete event",
                blacklistValidation.issues,
              ));
            }
          },
        );

      blacklistSubscription = {
        client,
        channel,
        subscribers,
      };

      channel.subscribe((_status, realtimeSubscriptionError) => {
        // [DECISION LOG] Renamed callback parameter from 'err' to realtimeSubscriptionError
        // to keep callback-boundary diagnostics descriptive and intact.
        if (realtimeSubscriptionError) {
          notifyBlacklistErrors(subscribers, new BlacklistSubscriptionError(
            "Blacklist subscription failed",
            realtimeSubscriptionError,
          ));
        }
      });
    } catch (realtimeSetupError) {
      blacklistSubscription = null;
      throw new BlacklistSubscriptionError(
        "Failed to initialize blacklist subscription",
        realtimeSetupError,
      );
    }
  }

  const subscription = blacklistSubscription;
  subscription.subscribers.add(subscriber);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseBlacklistSubscriber(subscription, subscriber);
  };
}

/**
 * Performs a direct query of the headhunter pool for diagnostic verification.
 *
 * @remarks
 * Directly queries the `headhunter_view` table up to a limit of 20 items.
 * Satisfies Layer 1 Core Diagnostic queries and bypasses caching pipelines.
 *
 * @returns A Promise resolving to an array of Recruits or `null` if the query or mapping fails.
 */
export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const supabase = createSupabaseClient();
  const { data: rawHeadhunterRows, error: headhunterFetchError } = await supabase.from('headhunter_view').select('*').limit(20);
  if (headhunterFetchError || !rawHeadhunterRows) return null;
  return rawHeadhunterRows.map(mapSbHeadhunterRow);
}
