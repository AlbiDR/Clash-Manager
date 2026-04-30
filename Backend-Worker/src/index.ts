// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [MODULE] CLASH MANAGER WORKER (TypeScript Edition)
 * ----------------------------------------------------------------------------
 * High-performance Express server for bulk API operations.
 * Migrated from JavaScript with full type safety and modern TS features.
 * ============================================================================
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core) / Layer 5 (@root) bridge.
 * - **Role:** Serves as the high-performance, stateless processing tier
 *   of the distributed architecture. Its primary role is to offload resource-intensive
 *   network operations (scanning and batch fetching) from the Google Apps Script
 *   environment, thereby bypassing GAS execution limits and UrlFetchApp quotas.
 *
 * **Constraints:**
 * - Stateless execution: No long-term persistence should be assumed for local variables.
 * - Concurrency bound: All batch operations are restricted by `WORKER_CONCURRENCY`.
 */

import express, {
  Request,
  Response as ExpressResponse,
  NextFunction,
  RequestHandler,
} from "express";
import * as v from "valibot";
import { KeyService } from "./KeyService.js";
import { WorkerHubController } from "./controllers/WorkerHubController.js";
import {
  Network,
  RoyaleApiService,
  RecruitmentService,
} from "./services/index.js";
import {
  HubErrorSchema,
  AuditRequestSchema,
  PublicScanRequestSchema,
  ScanRequestSchema,
  ClanFullRequestSchema,
  ClanApiRequestSchema,
  FetchRequestSchema,
  SubscriptionRequestSchema,
  RoyaleClanMembersResponseSchema,
  RoyaleCurrentRiverRaceSchema,
  RoyaleWarLogResponseSchema,
} from "./schemas.js";
import type {
  ServerConfig,
  ScoringWeights,
  ScoredPlayer,
  WarHistory,
  FetchRequest,
  ScanRequest,
  ClanFullRequest,
  ClanApiRequest,
  AuditRequest,
  PublicScanRequest,
  SubscriptionRequest,
  ApiKeyAuditResult,
  PlayerTag,
  TournamentTag,
  ClanMembers,
  CurrentRiverRace,
  RiverRaceLog,
  RiverRaceLogItem,
  RiverRaceStanding,
  RiverRaceParticipant,
  ScanDebugInfo,
  ProphetIntel,
  FetchResult,
} from "./types.js";

// ============================================================================
//  CONFIGURATION
// ============================================================================

const CONFIG: ServerConfig = {
  concurrency: parseInt(process.env["WORKER_CONCURRENCY"] ?? "20", 10),
  timeout: parseInt(process.env["WORKER_TIMEOUT_SEC"] ?? "45", 10) * 1000,
  maxRetries: parseInt(process.env["WORKER_RETRIES"] ?? "2", 10),
  port: parseInt(process.env["PORT"] ?? "8080", 10),
  apiBase: process.env["API_BASE"] ?? "https://proxy.royaleapi.dev/v1", // [SYNC] DEFAULT TO PROXY
} as const;


// Global Key Singleton
const rawKeys = Array.from(new Set(
  (process.env["API_KEYS"] ?? "")
    .split(",")
    .map(rawKey => rawKey.trim())
    .filter(rawKey => rawKey && rawKey !== "REPLACE_ME" && rawKey !== "YOUR_KEYS")
)); // EPHEMERAL: intentionally resets on restart

if (rawKeys.length === 0) {
    console.warn("[Worker] Warning: No API_KEYS found in environment variables.");
} else {
    console.log(`[Worker] Initialized internal pool with ${rawKeys.length} unique keys.`);
}

const KEYS = new KeyService(rawKeys); // EPHEMERAL: intentionally resets on restart

// ============================================================================
//  EXPRESS APP SETUP
// ============================================================================

export const app = express(); // EPHEMERAL: instance resets on restart

// CORS Middleware
app.use((request: Request, response: ExpressResponse, next: NextFunction): void => {
  response.header("Access-Control-Allow-Origin", "*");
  response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (request.method === "OPTIONS") {
    response.sendStatus(200);
    return;
  }
  next();
});

/**
 * [AUTH] AUTHENTICATION MIDDLEWARE
 *
 * @remarks
 * Validates the REMOTE_WORKER_SECRET for all privileged endpoints.
 * Public routes are explicitly exempted to allow health checks and public scans.
 * Registered before body-parsing to prevent unauthenticated DoS via large payloads.
 */
export const authMiddleware: RequestHandler = (request, response, next) => {
  const publicRoutes = [
    "/",
    "/health",
    "/capabilities",
    "/public/scan",
    "/public/subscribe",
  ];

  // Normalize path to handle trailing slashes consistently
  const path = request.path.replace(/\/$/, "") || "/";

  if (publicRoutes.includes(path)) {
    return next();
  }

  const secret = (process.env["REMOTE_WORKER_SECRET"] || "").trim();
  const authHeader = request.headers.authorization;

  if (!secret) {
    // THREAT: Exposed privileged endpoints if secret is missing.
    console.error("[Auth] REMOTE_WORKER_SECRET not set in environment");
    response.status(500).json({ error: "Internal server configuration error" });
    return;
  }

  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    // THREAT: Unauthenticated access to Royale API keys and clan data.
    // Target A [1]: Immediately halt and return 401 for unauthorized attempts.
    console.warn(`[Auth] Unauthorized attempt to privileged endpoint: ${path} from ${request.ip}`);
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

app.use(authMiddleware);

app.use(express.json({ limit: "5MB" }));

// ============================================================================
//  UTILITY FUNCTIONS
// ============================================================================

/**
 * [GUARD] ERROR MESSAGE EXTRACTION
 *
 * @remarks
 * Safely extracts an error message from an unknown error object.
 * THREAT: Unchecked property access on error objects leading to silent runtime crashes.
 *
 * @param errorPayload - The unknown error object to extract a message from.
 * @returns A string representation of the error message.
 */
function getErrorMessage(errorPayload: unknown): string {
  // [GUARD] STRUCTURAL ERROR EXTRACTION
  // Target B [1]: Enforce robust error classification using Valibot boundary.
  // This ensures that structured HubErrors (like quota exhaustion) are reported
  // with their human-readable messages instead of generic stringifications.
  const validation = v.safeParse(HubErrorSchema, errorPayload);
  if (validation.success) {
    return validation.output.message;
  }

  if (errorPayload instanceof Error) return errorPayload.message;
  return String(errorPayload);
}

// ============================================================================
//  LEGACY EXPORTS (FOR TESTING BACKWARD COMPATIBILITY)
// ============================================================================

/**
 * [LEGACY] BATCH PROCESSOR WRAPPER
 *
 * @remarks
 * Maintains backward compatibility for tests and internal callers that expect
 * the original processBatch signature. Automatically injects the global KEYS singleton.
 */
export async function processBatch<T = unknown>(
  targetEndpoints: string[],
  apiKeys: string[] = [],
  concurrencyLimit: number = CONFIG.concurrency,
  scoringWeights: ScoringWeights | null = null,
  prophetCache?: Record<string, ProphetIntel>,
  minTrophyThreshold: number = 0,
): Promise<FetchResult<T>[]> {
  // [GUARD] TYPE SAFETY: Target B [4]
  // THREAT: Untyped data leakage from the legacy bridge.
  // Rationale: Aligning the legacy wrapper return type with RecruitmentService ensures
  // that callers receive structured, typed results instead of ambiguous 'any' arrays.
  return RecruitmentService.processBatch<T>(
    targetEndpoints,
    apiKeys,
    concurrencyLimit,
    scoringWeights,
    prophetCache,
    minTrophyThreshold,
    KEYS
  );
}

/**
 * [LEGACY] SCAN PROCESSOR WRAPPER
 *
 * @remarks
 * Maintains backward compatibility for tests and internal callers that expect
 * the original processScanBatch signature. Automatically injects the global KEYS singleton.
 */
export async function processScanBatch(
  tournamentTags: TournamentTag[],
  apiKeys: string[] = [],
  concurrencyLimit: number = CONFIG.concurrency,
  dismissedPlayerTags: Set<PlayerTag> = new Set(),
  prophetCache?: Record<string, ProphetIntel>,
  diagnosticTrace?: ScanDebugInfo,
): Promise<ScoredPlayer[]> {
  return RecruitmentService.processScanBatch(
    tournamentTags,
    apiKeys,
    concurrencyLimit,
    dismissedPlayerTags,
    prophetCache,
    diagnosticTrace,
    KEYS
  );
}

// ============================================================================
//  ROUTES
// ============================================================================

/**
 * [ROUTE] ROOT
 * Returns a simple string to verify the worker is listening.
 */
app.get("/", (_request: Request, response: ExpressResponse): void => {
  response.send("Clash Manager Worker is running");
});

/**
 * [ROUTE] CAPABILITIES
 *
 * @remarks
 * Returns the worker's operational metadata, including its concurrency limits
 * and version info. Used by the GAS backend to calibrate request batches.
 */
app.get("/capabilities", (_request: Request, response: ExpressResponse): void => {
  response.json({
    status: "success",
    data: {
      version: "10.1.4",
      concurrency: CONFIG.concurrency,
      timeoutMs: CONFIG.timeout,
      maxRetries: CONFIG.maxRetries,
    }
  });
});

/**
 * [ROUTE] DIAGNOSTIC HEALTH HANDSHAKE
 *
 * @remarks
 * Performs a multi-tier health check to ensure the worker is operational:
 * 1. **Internal Pool:** Reports key availability and throttling status.
 * 2. **Upstream:** Executes a test call to the Royale API using the healthiest key.
 * 3. **System:** Reports memory usage (RSS).
 */
app.get("/health", async (request: Request, response: ExpressResponse): Promise<void> => {
    // 1. Local Pool Diagnostics
    const poolStats = KEYS.getPoolStats();
    
    // 2. Upstream Check (Current Healthiest Key)
    // THREAT: Unauthenticated quota depletion via public health endpoint.
    // Target A [1]: Only perform upstream checks for authenticated callers.
    const secret = (process.env["REMOTE_WORKER_SECRET"] || "").trim();
    const authHeader = request.headers.authorization;
    const isAuthenticated = secret && authHeader === `Bearer ${secret}`;

    const testApiKey = KEYS.getHealthyKey();
    let upstreamStatus = "SKIPPED_UNAUTHENTICATED";
    
    if (isAuthenticated && testApiKey) {
        try {
            // THREAT: Resource Exhaustion.
            // Even health checks consume quota. Track it.
            Network.quotaCheck(1);

            const healthCheckResponse = await RoyaleApiService.timeoutFetch(`${CONFIG.apiBase}/cards`, {
                headers: { Authorization: `Bearer ${testApiKey}` }
            }, 3000);

            Network.addQuotaUsage(1);

            upstreamStatus = healthCheckResponse.status === 200 ? "OK" : `FAIL_${healthCheckResponse.status}`;
            if (healthCheckResponse.status === 200) KEYS.reportSuccess(testApiKey);
            if (healthCheckResponse.status === 429 || healthCheckResponse.status === 403) KEYS.reportFailure(testApiKey, healthCheckResponse.status);
        } catch(healthCheckError) { upstreamStatus = "TIMEOUT"; }
    }

    response.status(200).json({
        status: "success",
        checks: {
            upstream: upstreamStatus,
            pool: poolStats,
            memory: process.memoryUsage().rss
        }
    });
});

/**
 * [ROUTE] KEY AUDIT
 *
 * @remarks
 * Validates an array of API keys provided in the request body against the Royale API.
 * Updates the global `KEYS` service with the health results of the audit.
 *
 * **Constraint:** Privileged endpoint; requires Bearer token.
 * **Validation:** Enforced via `AuditRequestSchema`.
 */
app.post(
  "/audit",
  async (
    request: Request<object, object, AuditRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Malformed input causing downstream runtime failures.
    // Rationale: Strict validation at the entry point ensures only valid data reaches the KeyService.
    const validationResult = v.safeParse(AuditRequestSchema, request.body);
    if (!validationResult.success) {
      response.status(400).json({ error: "Invalid request body", details: validationResult.issues });
      return;
    }

    try {
      const { apiKeys } = validationResult.output;

      // THREAT: Resource Exhaustion.
      // Audit batches can be large. Fail-fast if quota is low.
      Network.quotaCheck(apiKeys.length);

      const auditUrl = `${CONFIG.apiBase}/cards`;
      const auditTasks = apiKeys.map(async (apiKey): Promise<ApiKeyAuditResult> => {
        try {
          const auditResponse = await RoyaleApiService.timeoutFetch(
            auditUrl,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "User-Agent": "ClanManagerWorker/10.1.4",
              },
            },
            5000,
          );

          // Track usage for each audit attempt
          Network.addQuotaUsage(1);

          if (auditResponse.status === 200) KEYS.reportSuccess(apiKey);
          if (auditResponse.status === 429 || auditResponse.status === 403) KEYS.reportFailure(apiKey, auditResponse.status);
          
          return { key: apiKey, status: auditResponse.status };
        } catch (auditError) {
          return {
            key: apiKey,
            status: 500,
            error: auditError instanceof Error ? auditError.message : "unknown",
          };
        }
      });

      const auditResults = await Promise.all(auditTasks);
      response.json({ results: auditResults });
    } catch (operationError: unknown) {
      // THREAT: Unhandled audit failures leading to worker instability.
      // Rationale: Strict error capturing prevents untyped exceptions from crashing the route handler.
      response.status(500).json({
        error: getErrorMessage(operationError),
      });
    }
  },
);

/**
 * [ROUTE] PUBLIC RECRUITMENT SCAN
 *
 * @remarks
 * Public entry point for recruitment scans. Orchestrates two phases:
 * 1. **Discovery:** Scans tournaments for active, clanless players.
 * 2. **Scoring:** If `scoring` weights are provided, fetches full profiles
 *    and calculates RPoS (Raw Potential Score) server-side.
 *
 * **Validation:** Enforced via `PublicScanRequestSchema`.
 */
app.post(
  "/public/scan",
  async (
    request: Request<object, object, PublicScanRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Malformed scan tags or options causing inefficient upstream scanning or worker crashes.
    const validationResult = v.safeParse(PublicScanRequestSchema, request.body);
    if (!validationResult.success) {
      response.status(400).json({ error: "Invalid request body", details: validationResult.issues });
      return;
    }

    try {
      const { tags, blacklist, minTrophies, scoring, apiKeys, prophetCache } = validationResult.output;

      const blacklistSet = new Set(blacklist ?? []);

      const candidates = await RecruitmentService.processScanBatch(
        tags as TournamentTag[],
        apiKeys ?? [],
        CONFIG.concurrency,
        blacklistSet as Set<PlayerTag>,
        prophetCache,
        undefined,
        KEYS
      );

      if (scoring && candidates.length > 0) {
        const candidateTags = [...new Set(candidates.map((candidate) => candidate.tag))];
        const playerUrls = candidateTags.map((tag) => {
            return `${CONFIG.apiBase}/players/${encodeURIComponent(tag)}`;
        });

        const scoredResults = await RecruitmentService.processBatch<ScoredPlayer>(
          playerUrls,
          apiKeys ?? [],
          CONFIG.concurrency,
          scoring,
          prophetCache,
          minTrophies,
          KEYS
        );

        response.json({
          candidates: scoredResults
            .map((resultRecord) => resultRecord.content)
            .filter(
              (candidate): candidate is ScoredPlayer =>
                typeof candidate === "object" && candidate !== null && "tag" in candidate,
            ),
          _debug: {
            phase1: candidates.length,
            phase2: scoredResults.length,
            apiBase: CONFIG.apiBase
          }
        });
        return;
      }

      response.json({ candidates, _debug: { phase1: candidates.length, apiBase: CONFIG.apiBase } });
    } catch (operationError: unknown) {
      // THREAT: Silent scan failures or worker crashes on malformed tournament data.
      // Rationale: Ensuring all tournament-level exceptions are caught and classified prevents PWA data starvation.
      console.error("Failed /public/scan", operationError);
      response.status(500).json({
        error: getErrorMessage(operationError),
      });
    }
  },
);

/**
 * [ROUTE] PUBLIC PUSH SUBSCRIPTION
 *
 * @remarks
 * Ingests a standard browser PushSubscription for future notification dispatch.
 * Currently stores in an in-memory set; persistence required for durability.
 */
// Push subscription storage (in-memory)
// PERSISTENCE REQUIRED: Push subscriptions are lost on restart and must be migrated to a database.
const subscriptions = new Set<string>(); // PERSISTENCE REQUIRED: see [issue description]
const MAX_SUBSCRIPTIONS = 10000; // THREAT: Unbounded in-memory growth leading to Denial of Service (DoS).

app.post(
  "/public/subscribe",
  (request: Request<object, object, SubscriptionRequest>, response: ExpressResponse): void => {
    // THREAT: Denial of Service (DoS) via memory exhaustion.
    // Target B [1]: Enforce a hard boundary on in-memory collections that grow based on external input.
    if (subscriptions.size >= MAX_SUBSCRIPTIONS) {
      console.warn(`[Push] Subscription limit reached (${MAX_SUBSCRIPTIONS}). Rejecting new registration.`);
      response.status(507).json({ error: "Subscription limit reached", code: "ERR_LIMIT_EXCEEDED" });
      return;
    }

    // THREAT: Silent corruption of the subscription set if malformed data is accepted.
    const validationResult = v.safeParse(SubscriptionRequestSchema, request.body);
    if (!validationResult.success) {
      response.status(400).json({ error: "Invalid request body", details: validationResult.issues });
      return;
    }

    const pushSubscriptionPayload = validationResult.output;
    subscriptions.add(JSON.stringify(pushSubscriptionPayload));
    console.log(` New Push Subscription. Total: ${subscriptions.size}`);
    response.json({ success: true, count: subscriptions.size });
  },
);

/**
 * [ROUTE] INTERNAL RECRUITMENT SCAN
 *
 * @remarks
 * Privileged entry point for high-precision recruitment scans. Includes
 * advanced telemetry (`trace`) and deep integration with the Prophet Cache
 * (heritage data) for prioritization.
 *
 * **Constraint:** Privileged endpoint; requires Bearer token.
 * **Validation:** Enforced via `ScanRequestSchema`.
 */
app.post(
  "/scan",
  async (
    request: Request<object, object, ScanRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Unauthorized data access if malformed tags bypass filters.
    const validationResult = v.safeParse(ScanRequestSchema, request.body);
    if (!validationResult.success) {
      response.status(400).json({ error: "Invalid request body", details: validationResult.issues });
      return;
    }

    try {
      const { tags, apiKeys, blacklist, minTrophies, scoring, prophetCache } = validationResult.output;

      const blacklistSet = new Set(blacklist ?? []);

        const diagnosticTrace: ScanDebugInfo = {
          firstUrl: "",
          firstStatus: 0,
          firstContent: "",
          keyUsed: "",
        };
        const candidates = await RecruitmentService.processScanBatch(
            tags as TournamentTag[],
            apiKeys ?? [],
            CONFIG.concurrency,
            blacklistSet as Set<PlayerTag>,
            prophetCache,
            diagnosticTrace,
            KEYS
        );

        const serverMetadata = {
            version: "10.1.4",
            uptime: process.uptime(),
            pool: KEYS.getPoolStats(),
            envKeys: rawKeys.length > 0
        };

        if (scoring && candidates.length > 0) {
            const candidateTags = [...new Set(candidates.map((candidate) => candidate.tag))];
            const playerUrls = candidateTags.map((tag) => {
                return `${CONFIG.apiBase}/players/${encodeURIComponent(tag)}`;
            });

            const scoredResults = await RecruitmentService.processBatch<ScoredPlayer>(
                playerUrls,
                apiKeys ?? [],
                CONFIG.concurrency,
                scoring,
                prophetCache,
                minTrophies,
                KEYS
            );

            response.json({
                candidates: scoredResults
                    .map((resultRecord) => resultRecord.content)
                    .filter(
                        (candidate): candidate is ScoredPlayer =>
                            typeof candidate === "object" && candidate !== null && "tag" in candidate,
                    ),
                _debug: {
                    phase1: candidates.length,
                    phase2: scoredResults.length,
                    apiBase: CONFIG.apiBase,
                    trace: diagnosticTrace
                },
                _metadata: serverMetadata
            });
            return;
        }

        response.json({
            candidates, 
            _debug: { phase1: candidates.length, apiBase: CONFIG.apiBase, trace: diagnosticTrace },
            _metadata: serverMetadata
        });
    } catch (operationError: unknown) {
      // THREAT: Unauthorized data access or worker crash on internal scan.
      // Rationale: High-precision scans require a stable failure boundary to prevent GAS orchestrator timeouts.
      console.error("Failed /scan", operationError);
      response.status(500).json({
        error: getErrorMessage(operationError),
      });
    }
  },
);

/**
 * [ROUTE] CLAN SNAPSHOT
 *
 * @remarks
 * High-density endpoint that aggregates multiple Royale API resources into a
 * single response, minimizing network round-trips for the GAS orchestrator.
 * Resources included: Members List, Current River Race, and 52-Week War Log.
 *
 * **Constraint:** Privileged endpoint; requires Bearer token.
 * **Validation:** Enforced via `ClanFullRequestSchema`.
 */
app.post(
  "/clan/full",
  async (
    request: Request<object, object, ClanFullRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Malformed clan tag causing upstream API errors or incorrect data snapshots.
    const validationResult = v.safeParse(ClanFullRequestSchema, request.body);
    if (!validationResult.success) {
      response.status(400).json({ error: "Invalid request body", details: validationResult.issues });
      return;
    }

    try {
      const { tag, apiKeys } = validationResult.output;

      const rawTag = decodeURIComponent(tag);
      const cleanTag = encodeURIComponent(rawTag);
      const targetEndpoints = [
        `${CONFIG.apiBase}/clans/${cleanTag}/members`,
        `${CONFIG.apiBase}/clans/${cleanTag}/currentriverrace`,
        `${CONFIG.apiBase}/clans/${cleanTag}/riverracelog?limit=52`,
      ];

      const batchResults = await RecruitmentService.processBatch<
        ClanMembers | CurrentRiverRace | RiverRaceLog
      >(targetEndpoints, apiKeys ?? [], 3, null, undefined, 0, KEYS);

      let membersData =
        batchResults[0]?.code === 200 ? (batchResults[0].content as unknown) : null;
      let raceData =
        batchResults[1]?.code === 200
          ? (batchResults[1].content as unknown)
          : null;
      let logData =
        batchResults[2]?.code === 200 ? (batchResults[2].content as unknown) : null;

      if (membersData) {
        // THREAT: Malformed member list causing downstream UI crashes.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleClanMembersResponseSchema, membersData);
        if (!validation.success) {
          console.error("[Worker] Members validation failed for /clan/full", validation.issues);
          response.status(502).json({ error: "Invalid members data format", details: validation.issues });
          return;
        }
        membersData = validation.output;
      } else {
        response.status(500).json({ error: "Failed to fetch members" });
        return;
      }

      if (raceData) {
        // THREAT: Corrupt race status data polluting clan snapshots.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleCurrentRiverRaceSchema, raceData);
        if (!validation.success) {
          console.warn("[Worker] Race validation failed for /clan/full", validation.issues);
          raceData = null; // Graceful degradation for secondary resource
        } else {
          raceData = validation.output;
        }
      }

      if (logData) {
        // THREAT: Corrupt war log data polluting clan historical records.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleWarLogResponseSchema, logData);
        if (!validation.success) {
          console.warn("[Worker] War Log validation failed for /clan/full", validation.issues);
          logData = null; // Graceful degradation for secondary resource
        } else {
          logData = validation.output;
        }
      }

      // Pre-process war history
      const warHistory: WarHistory = {};

      if (logData && typeof logData === "object" && "items" in logData) {
        (logData as RiverRaceLog).items.forEach((logEntry: RiverRaceLogItem) => {
          const weekId = RecruitmentService.calculateWarWeekId(logEntry.createdDate);
          const standings = logEntry.standings ?? [];
          const myClan = standings.find((standing: RiverRaceStanding) => standing.clan.tag === rawTag);

          if (myClan?.clan.participants) {
            myClan.clan.participants.forEach((participant: RiverRaceParticipant) => {
              const participantTag = participant.tag as PlayerTag;
              if (!warHistory[participantTag]) {
                warHistory[participantTag] = {};
              }
              const currentFame = warHistory[participantTag]?.[weekId] ?? 0;
              warHistory[participantTag]![weekId] = Math.max(currentFame, participant.fame);
            });
          }
        });
      }

      response.json({
        members: membersData,
        race: raceData,
        history: warHistory,
      });
    } catch (operationError: unknown) {
      // THREAT: Corrupt clan snapshots polluting GAS state.
      // Rationale: Enforcing a clean error boundary for bulk fetches ensures the GAS backend receives a valid JSON error response.
      console.error("Failed /clan/full", operationError);
      response.status(500).json({
        error: getErrorMessage(operationError),
      });
    }
  },
);

/**
 * [ROUTE] CLAN RESOURCE FETCH
 *
 * @remarks
 * Bridges individual Royale API resources (Members, WarLog) with optional
 * local data transformation (e.g. role normalization).
 *
 * **Constraint:** Privileged endpoint; requires Bearer token.
 * **Validation:** Enforced via `ClanApiRequestSchema`.
 */
app.post(
  "/clan/api",
  async (
    request: Request<object, object, ClanApiRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Invalid request types or tags leading to unhandled upstream responses.
    const validationResult = v.safeParse(ClanApiRequestSchema, request.body);
    if (!validationResult.success) {
      response.status(400).json({ error: "Invalid request body", details: validationResult.issues });
      return;
    }

    try {
      const { tag, type, apiKeys } = validationResult.output;

      const cleanTag = encodeURIComponent(tag);
      let targetEndpoint = "";

      if (type === "members") {
        targetEndpoint = `${CONFIG.apiBase}/clans/${cleanTag}/members`;
      } else if (type === "warlog") {
        targetEndpoint = `${CONFIG.apiBase}/clans/${cleanTag}/riverracelog?limit=52`;
      } else {
        response.status(400).json({ error: "invalid type" });
        return;
      }

      const batchManager = (apiKeys && apiKeys.length > 0) ? new KeyService(apiKeys) : KEYS;

      const { code, content } = await RoyaleApiService.fetchWithRotatedRetries(targetEndpoint, {
        method: "GET",
        headers: {
          "User-Agent": "ClanManagerWorker/10.1.4",
        },
      }, CONFIG.maxRetries, batchManager);

      if (code !== 200) {
        response.status(code).json({ error: "upstream error", details: content });
        return;
      }

      let transformedData: unknown[] = [];

      if (type === "members") {
        // THREAT: Malformed upstream member list causing downstream runtime crashes.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleClanMembersResponseSchema, content);
        if (!validation.success) {
          response.status(502).json({ error: "Invalid upstream data format", details: validation.issues });
          return;
        }

        const formatRole = (role: string): string => {
          const roleMap: Record<string, string> = { leader: "Leader", coLeader: "Co-Leader", elder: "Elder" };
          return roleMap[role] ?? "Member";
        };

        transformedData = validation.output.items.map((member) => ({
          tag: member.tag,
          name: member.name,
          role: formatRole(member.role),
          kingLevel: member.expLevel,
          trophies: member.trophies,
          donations: member.donations,
          donationsReceived: member.donationsReceived,
        }));
      } else if (type === "warlog") {
        // THREAT: Corrupt war log data polluting clan historical records.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleWarLogResponseSchema, content);
        if (!validation.success) {
          response.status(502).json({ error: "Invalid upstream data format", details: validation.issues });
          return;
        }

        const parseCRDateISO = (dateString: string): string => {
          if (!dateString) return new Date().toISOString().split("T")[0] ?? "";
          return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`;
        };

        transformedData = validation.output.items.map((warLogEntry) => {
          const rawTag = decodeURIComponent(tag);

          const myStanding = warLogEntry.standings.find((standing) => standing.clan.tag === rawTag);
          const opponents = warLogEntry.standings.filter((standing) => standing.clan.tag !== rawTag);

          const myFame = myStanding ? myStanding.clan.fame : 0;
          const myRank = myStanding ? myStanding.rank : null;
          const bestRival = opponents.sort(
            (a, b) => b.clan.fame - a.clan.fame,
          )[0];

          let resultOutcome = "lose";
          if (myRank === 1) resultOutcome = "win";
          if (myRank === null) resultOutcome = "n/a";

          return {
            result: resultOutcome,
            endTime: parseCRDateISO(warLogEntry.createdDate),
            opponent: bestRival ? bestRival.clan.name : "No Opponent",
            teamSize: 50,
            score: myFame,
            opponentScore: bestRival ? bestRival.clan.fame : 0,
          };
        });
      }

      response.json({ data: transformedData });
    } catch (operationError: unknown) {
      // THREAT: Unhandled upstream errors in clan member/warlog fetching.
      // Rationale: Consistent error extraction prevents the "any Plague" from leaking into the PWA.
      console.error("Failed /clan/api", operationError);
      response.status(500).json({
        error: getErrorMessage(operationError),
      });
    }
  },
);

/**
 * [ROUTE] GENERIC BULK FETCH
 *
 * @remarks
 * Executes a high-concurrency batch fetch for an arbitrary list of URLs.
 * Supports recruitment scoring (Strategy 2: Deep Delegation).
 *
 * **Constraint:** Privileged endpoint; requires Bearer token.
 * **Validation:** Enforced via `FetchRequestSchema`.
 */
app.post(
  "/fetch",
  async (
    request: Request<object, object, FetchRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Arbitrary URL fetching or malformed scoring weights leading to resource exhaustion.
    const validationResult = v.safeParse(FetchRequestSchema, request.body);
    if (!validationResult.success) {
      response.status(400).json({ error: "Invalid request body", details: validationResult.issues });
      return;
    }

    try {
      const { urls, apiKeys, scoring, minTrophies } = validationResult.output;

      const batchResults = await RecruitmentService.processBatch(
        urls,
        apiKeys ?? [],
        CONFIG.concurrency,
        scoring ?? null,
        undefined,
        minTrophies,
        KEYS
      );

      response.json({ results: batchResults });
    } catch (operationError: unknown) {
      // THREAT: Resource exhaustion or worker crash on arbitrary fetch.
      // Rationale: Catching all fetch-related exceptions prevents the worker process from entering a zombie state.
      console.error("Failed /fetch", operationError);
      response.status(500).json({
        error: getErrorMessage(operationError),
      });
    }
  },
);

/**
 * [ROUTE] HUB STATE
 * 
 * @remarks
 * Exposes the synchronized Worker Hub payload to the PWA.
 * Rationale: Read-only cache delivery; data is pre-compiled by the Sync Daemon.
 * Serves internal clan data (Roster/Headhunter). Strictly stateless to prevent locking read queries.
 *
 * **Constraint:** Privileged endpoint; requires Bearer token.
 */
app.get("/hub/state", async (_request: Request, response: ExpressResponse): Promise<void> => {
  try {
    const state = await WorkerHubController.getHubState();
    response.json({ success: true, data: state });
  } catch (operationError: unknown) {
    // THREAT: Silent corruption or uninformative 500 errors in Hub state delivery.
    // Target B [1]: Robust error classification for the PWA ingress boundary using v.safeParse.
    const validation = v.safeParse(HubErrorSchema, operationError);

    if (validation.success && validation.output.code === "ERR_STATE_MISSING") {
      response.status(503).json({
        error: validation.output.message,
        layer: validation.output.layer
      });
    } else {
      const errorMessage = operationError instanceof Error ? operationError.message : String(operationError);
      response.status(500).json({ error: errorMessage || "unknown" });
    }
  }
});

/**
 * [ROUTE] MANUAL HUB SYNC
 * 
 * @remarks
 * Allows forcing a synchronization cycle manually (e.g. via GAS triggers or Webhooks).
 *
 * **Constraint:** Privileged endpoint; requires Bearer token.
 */
app.post("/hub/sync/manual", async (_request: Request, response: ExpressResponse): Promise<void> => {
  const secret = (process.env["REMOTE_WORKER_SECRET"] || "").trim();
  const gasBase = (process.env["VITE_GAS_URL"] || process.env["GAS_URL"] || "").trim();

  // THREAT: Hanging sync daemon due to missing upstream configuration.
  // Rationale: Fast failure if environment variables are not set prevents
  // malformed fetch attempts and unhandled promise rejections.
  // NOTE: Auth is handled by global authMiddleware.
  if (!secret || !gasBase) {
    console.error("[Worker] Manual sync failed: REMOTE_WORKER_SECRET or GAS_URL is not set.");
    response.status(500).json({
      error: "Worker configuration incomplete",
      details: "Upstream GAS URL or Secret is missing."
    });
    return;
  }

  const didSync = await WorkerHubController.executeSync(gasBase, secret);
  response.json({ success: didSync });
});

// ============================================================================
//  SERVER STARTUP
// ============================================================================

app.listen(CONFIG.port, () => {
  console.log(
    `Worker listening on ${CONFIG.port} (concurrency=${CONFIG.concurrency})`,
  );
  
  const gasUrl = process.env["VITE_GAS_URL"] || process.env["GAS_URL"];
  const secret = process.env["REMOTE_WORKER_SECRET"];
  
  if (gasUrl && secret) {
    WorkerHubController.startSyncDaemon(gasUrl, secret);
  } else {
    console.warn("[Worker] Hub Sync Daemon disabled: VITE_GAS_URL or REMOTE_WORKER_SECRET is missing.");
  }
});
