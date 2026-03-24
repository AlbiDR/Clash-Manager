/**
 * ============================================================================
 * CLASH MANAGER WORKER (TypeScript Edition)
 * ----------------------------------------------------------------------------
 * High-performance Express server for bulk API operations
 * Migrated from JavaScript with full type safety and modern TS features
 * ============================================================================
 *
 * @remarks
 * The Backend-Worker serves as the high-performance, stateless processing tier
 * of the distributed architecture. Its primary role is to offload resource-intensive
 * network operations (scanning and batch fetching) from the Google Apps Script
 * environment, thereby bypassing GAS execution limits and UrlFetchApp quotas.
 */

import express, {
  Request,
  Response as ExpressResponse,
  NextFunction,
  RequestHandler,
} from "express";
import * as v from "valibot";
import ScoringKernel from "../../Backend-GAS/Scoring_Kernel";
import Time from "../../Backend-GAS/Time";
import { KeyService } from "./KeyService.js";
import { WorkerHubController } from "./controllers/WorkerHubController.js";
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
  RoyaleWarLogResponseSchema,
  RoyaleCurrentRiverRaceSchema,
  RoyalePlayerSchema,
  RoyaleBattleLogResponseSchema,
  RoyaleTournamentResponseSchema,
} from "./schemas.js";
import type {
  ServerConfig,
  FetchResult,
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
  WarWeekId,
  ClashRoyalePlayer,
  BattleLogEntry,
  Tournament,
  ClanMembers,
  CurrentRiverRace,
  RiverRaceLog,
  ProphetIntel,
  ScanDebugInfo,
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
const rawKeys = (process.env["API_KEYS"] ?? "")
  .split(",")
  .map(rawKey => rawKey.trim())
  .filter(rawKey => rawKey && rawKey !== "REPLACE_ME" && rawKey !== "YOUR_KEYS"); // EPHEMERAL: intentionally resets on restart

if (rawKeys.length === 0) {
    console.warn("[Worker] Warning: No API_KEYS found in environment variables.");
} else {
    console.log(`[Worker] Initialized internal pool with ${rawKeys.length} keys.`);
}

const KEYS = new KeyService(rawKeys); // EPHEMERAL: intentionally resets on restart

// ============================================================================
//  EXPRESS APP SETUP
// ============================================================================

const app = express(); // EPHEMERAL: instance resets on restart

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
const authMiddleware: RequestHandler = (request, response, next) => {
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

  const secret = process.env["REMOTE_WORKER_SECRET"];
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

app.use(express.json({ limit: "50mb" }));

// ============================================================================
//  UTILITY FUNCTIONS
// ============================================================================

/**
 * [GUARD] ERROR MESSAGE EXTRACTION
 *
 * Safely extracts an error message from an unknown error object.
 * THREAT: Unchecked property access on error objects leading to silent runtime crashes.
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Fetch with timeout protection
 */
async function timeoutFetch(
  url: string,
  opts: Record<string, unknown> = {},
  timeout: number = CONFIG.timeout,
): Promise<globalThis.Response> {
  return fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(timeout),
  } as RequestInit);
}

/**
 * Fetch with automatic retries, exponential backoff with jitter, and SMART KEY ROTATION
 */
async function fetchWithRotatedRetries<T = unknown>(
  url: string,
  baseOpts: Record<string, unknown>,
  retries: number = CONFIG.maxRetries,
  keyService?: KeyService,
): Promise<FetchResult<T>> {
  let attempt = 0;
  let lastErr: Error | null = null;

  // Use provided KeyService (for batches) or fallback to global singleton
  const manager = keyService ?? KEYS;

  while (attempt <= retries) {
    const currentApiKey = manager.getHealthyKey();
    if (!currentApiKey) {
      return { code: 429, content: "ERR_QUOTA_EMPTY" as unknown as T };
    }

    const fetchOptions = {
      ...baseOpts,
      headers: {
        ...(baseOpts["headers"] || {}),
        "Authorization": `Bearer ${currentApiKey}`
      }
    };

    try {
      const fetchResponse = await timeoutFetch(url, fetchOptions);
      const responseCode = fetchResponse.status;
      const responseText = await fetchResponse.text();

      if (responseCode === 200) {
        manager.reportSuccess(currentApiKey);
        try {
          return { code: responseCode, content: JSON.parse(responseText) as T };
        } catch {
          return { code: responseCode, content: responseText as unknown as T };
        }
      }

      // Handle Failures
      manager.reportFailure(currentApiKey, responseCode);
      
      if (responseCode === 404) return { code: responseCode, content: responseText as unknown as T };
      if (responseCode === 403) throw new Error("auth_denied");
      if (responseCode === 429) throw new Error("rate_limit");
      
      throw new Error(`upstream_status_${responseCode}`);

    } catch (fetchError) {
      lastErr = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      attempt++;
      
      if (attempt <= retries) {
        const backoff = Math.min(10000, (500 * Math.pow(2, attempt)) + (Math.random() * 1000));
        console.warn(`[Worker] Rotate-Retry ${attempt}/${retries} for ${url.slice(-20)}. Backoff: ${Math.round(backoff)}ms. Reason: ${lastErr.message}`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  return {
    code: 520,
    content: `Fetch exhausted: ${lastErr?.message ?? "unknown"}`,
  };
}

/**
 * Calculate War Week ID (ISO Week Number format: YYWnn)
 *
 * @remarks
 * Uses centralized Time module from GAS to ensure 10:00 UTC Monday reset consistency.
 */
function calculateWarWeekId(dateStr: string): WarWeekId {
  if (!dateStr) return "Unknown" as WarWeekId;
  const date = Time.parseRoyaleApiDate(dateStr);
  return Time.calculateWarWeekId(date) as WarWeekId;
}

/**
 * Generic batch processor with worker pool pattern
 */
export async function processBatch<T = unknown>(
  urls: string[],
  apiKeys: string[] = [],
  concurrency: number = CONFIG.concurrency,
  scoring: ScoringWeights | null = null,
  prophetCache?: Record<string, ProphetIntel>
): Promise<FetchResult<T>[]> {
  const results: FetchResult<T>[] = new Array(urls.length);
  let batchIndex = 0;

  // Shared KeyService for the entire batch to preserve health state across requests
  const batchManager = apiKeys.length > 0 ? new KeyService(apiKeys) : undefined;

  async function worker(): Promise<void> {
    while (true) {
      const currentBatchIndex = batchIndex++;
      if (currentBatchIndex >= urls.length) return;

      const url = urls[currentBatchIndex];
      if (!url) continue;

      const headers: Record<string, string> = {
        "User-Agent": "ClanManagerWorker/1.0",
        "Accept-Encoding": "gzip",
      };

      // Special handling for player profiles with scoring
      if (scoring && url.includes("/players/") && !url.includes("/battlelog")) {
        try {
          const profileResult = await fetchWithRotatedRetries<ClashRoyalePlayer>(url, {
            method: "GET",
            headers,
          }, CONFIG.maxRetries, batchManager);

          if (profileResult.code === 200 && typeof profileResult.content === "object" && profileResult.content !== null) {
            // THREAT: Malformed player profile causing downstream scoring errors.
            // Target B [1]: Enforce [VALIDATION] boundary for Royale API data.
            const profileValidation = v.safeParse(RoyalePlayerSchema, profileResult.content);
            if (!profileValidation.success) {
              results[currentBatchIndex] = { code: 502, content: "Invalid player profile format" };
              continue;
            }
            const profile = profileValidation.output;

            const logUrl = `${url}/battlelog`;
            const logsResult = await fetchWithRotatedRetries<BattleLogEntry[]>(
              logUrl,
              {
                method: "GET",
                headers,
              },
              CONFIG.maxRetries,
              batchManager,
            );

            let hasWar = false;
            if (logsResult.code === 200 && Array.isArray(logsResult.content)) {
              // THREAT: Malformed battle logs causing incorrect war activity detection.
              // Target B [1]: Enforce [VALIDATION] boundary for Royale API data.
              const logsValidation = v.safeParse(RoyaleBattleLogResponseSchema, logsResult.content);
              if (logsValidation.success) {
                hasWar = logsValidation.output.some((logEntry) =>
                  ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(
                    logEntry.type,
                  ),
                );
              }
            }

            // Use shared scoring system (Kernel)
            let rawScore = ScoringKernel.computeRecruitScore(
              profile.trophies ?? 0,
              profile.totalDonations ?? 0,
              profile.warDayWins ?? 0,
              hasWar,
              scoring || { TROPHY: 1.0, DON: 0.07, WAR: 20.0, WAR_BASELINE_BONUS: 500 },
            );

            // STRATEGY 2: Deep Delegation - Prophet Bonus
            // Rationale: By offloading the "Prophet Bonus" (Heritage logic)
            // to the worker, we ensure that recruitment lists returned
            // to the GAS backend are already prioritized based on
            // historical elite performance, saving GAS compute cycles.
            if (prophetCache) {
                 const normTag = profile.tag.replace("#", "").trim().toLowerCase();
                 const intel = prophetCache[normTag];
                 // Threshold: 5 Wins.
                 // We only apply the 25% multiplier to players with
                 // proven historical war success to minimize false positives.
                 if (intel && intel.wins > 5) {
                    rawScore *= 1.25;
                 }
            }

            const warBonus = hasWar ? 500 : 0;
            const totalWarScore = (profile.warDayWins ?? 0) + warBonus;

            // STRATEGY: Strict Clanless Enforcement
            // Rationale: Even if a player was clanless during Phase 1 (Discovery),
            // they may have joined a clan by Phase 2 (Scoring).
            // Rejecting them here prevents uninvitable recruits from reaching GAS.
            if (scoring && profile.clan?.tag) {
                results[currentBatchIndex] = { code: 200, content: null as unknown as T };
                continue;
            }

            results[currentBatchIndex] = {
              code: 200,
              content: {
                tag: profile.tag as PlayerTag,
                name: profile.name,
                trophies: profile.trophies,
                donations: profile.totalDonations,
                cards: profile.challengeCardsWon,
                war: totalWarScore,
                rawScore,
                clan: profile.clan?.name || null,
              } as unknown as T,
            };
          } else {
            results[currentBatchIndex] = profileResult as FetchResult<T>;
          }
        } catch (scoringError) {
          results[currentBatchIndex] = {
            code: 500,
            content: `Scoring fetch failed: ${scoringError instanceof Error ? scoringError.message : "unknown"}`,
          };
        }
      } else {
        const fetchResponse = await fetchWithRotatedRetries<T>(url, { method: "GET", headers }, CONFIG.maxRetries, batchManager);
        results[currentBatchIndex] = fetchResponse;
      }
    }
  }

  // Spawn worker pool
  const workers: Promise<void>[] = [];
  const spawnCount = Math.min(concurrency, urls.length);
  for (let workerIndex = 0; workerIndex < spawnCount; workerIndex++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Filter and sort if scoring is enabled
  if (scoring) {
    return results
      .filter(
        (resultRecord): resultRecord is FetchResult<T> =>
          resultRecord !== undefined &&
          resultRecord.code === 200 &&
          typeof resultRecord.content === "object" &&
          resultRecord.content !== null &&
          "rawScore" in resultRecord.content,
      )
      .sort((aCandidate, bCandidate) => {
        const aScore = (aCandidate.content as unknown as ScoredPlayer).rawScore;
        const bScore = (bCandidate.content as unknown as ScoredPlayer).rawScore;
        return bScore - aScore;
      })
      .slice(0, 200);
  }

  return results;
}

/**
 * Tournament scan batch processor
 */
export async function processScanBatch(
  tags: TournamentTag[],
  apiKeys: string[] = [],
  concurrency: number = CONFIG.concurrency,
  blacklistSet: Set<PlayerTag> = new Set(),
  prophetCache?: Record<string, ProphetIntel>,
  debug?: ScanDebugInfo
): Promise<ScoredPlayer[]> {
  const candidates: ScoredPlayer[] = [];
  let batchIndex = 0;
  let traceCaptured = false;

  // Shared KeyService for the entire batch to preserve health state across requests
  const batchManager = apiKeys.length > 0 ? new KeyService(apiKeys) : undefined;

  async function worker(): Promise<void> {
    while (true) {
      const currentBatchIndex = batchIndex++;
      if (currentBatchIndex >= tags.length) return;

    const tag = tags[currentBatchIndex];
    if (!tag) continue;

    const normalizedTag = tag.startsWith("#") ? tag : `#${tag}`;
    const url = `${CONFIG.apiBase}/tournaments/${encodeURIComponent(normalizedTag)}`;

    const headers: Record<string, string> = {
      "User-Agent": "ClanManagerWorker/1.2",
      "Accept-Encoding": "gzip",
    };

      try {
        const fetchResponse = await fetchWithRotatedRetries<Tournament>(url, {
          method: "GET",
          headers,
        }, CONFIG.maxRetries, batchManager);

        // SUPER DIAGNOSTIC: Capture raw response of the first attempt
        if (debug && !traceCaptured) {
            traceCaptured = true;
            debug.firstUrl = url;
            debug.firstStatus = fetchResponse.code;
            debug.firstContent = typeof fetchResponse.content === "string"
                ? fetchResponse.content.substring(0, 1000)
                : JSON.stringify(fetchResponse.content).substring(0, 1000);
            debug.keyUsed = (headers["Authorization"] || "None").substring(0, 15) + "...";
        }

        if (fetchResponse.code === 200 && typeof fetchResponse.content === "object" && fetchResponse.content !== null) {
          // THREAT: Malformed tournament data causing incorrect candidate discovery.
          // Target B [1]: Enforce strict validation boundary for Royale API data.
          const validation = v.safeParse(RoyaleTournamentResponseSchema, fetchResponse.content);
          if (validation.success) {
            validation.output.membersList?.forEach((memberCandidate) => {
              // DESIGN CONSTRAINT: Reject ALL players with any clan affiliation.
              // Rationale: Only clanless players are recruitable. Filtering at the
              // earliest stage (tournament member scan) prevents wasting API quota
              // on profile fetches for non-recruitable targets.
              if (memberCandidate.clan?.tag) return;
        const candidateTag = memberCandidate.tag as PlayerTag;
        if (blacklistSet.has(candidateTag)) return;

              // STRATEGY 2: Deep Delegation - Apply Prophet Logic Server-Side
              if (prophetCache) {
                const normTag = memberCandidate.tag.replace("#", "").trim().toLowerCase();
                const intel = prophetCache[normTag];
                if (intel) {
                  // Bonus logic could go here, but strictly we need profile stats for true score.
                }
              }

              candidates.push({
          tag: candidateTag,
                name: memberCandidate.name || "Unknown",
                // NOTE: We omit 'trophies' since tournament score is not global rank.
                // This prevents the incorrect filtering that caused zero-yields.
                rawScore: 0,
              });
            });
          } else {
            const rawContent = fetchResponse.content as unknown as Record<string, unknown>;
            console.warn(`[WORKER SCAN FAIL] Schema rejected tournament response for tag: ${rawContent?.["tag"] || "Unknown"}`);
            console.warn(JSON.stringify(validation.issues, null, 2));
            const membersList = rawContent?.["membersList"];
            if (Array.isArray(membersList) && membersList.length > 0) {
              console.warn(`[SAMPLE REJECTED MEMBER]`, JSON.stringify(membersList[0], null, 2));
            }
          }
        }
      } catch (scanBatchError) {
        console.warn(`[Worker] Scan failed for tournament ${tag}: ${scanBatchError instanceof Error ? scanBatchError.message : "unknown"}`);
      }
    }
  }

  const workers: Promise<void>[] = [];
  const spawnCount = Math.min(concurrency, tags.length);
  for (let workerIndex = 0; workerIndex < spawnCount; workerIndex++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return candidates;
}

// ============================================================================
//  MIDDLEWARE
// ============================================================================


// ============================================================================
//  ROUTES
// ============================================================================

app.get("/", (_request: Request, response: ExpressResponse): void => {
  response.send("Clash Manager Worker is running");
});

app.get("/capabilities", (_request: Request, response: ExpressResponse): void => {
  response.json({
    status: "success",
    data: {
      version: "10.1.1",
      concurrency: CONFIG.concurrency,
      timeoutMs: CONFIG.timeout,
      maxRetries: CONFIG.maxRetries,
    }
  });
});

/**
 * DIAGNOSTIC HEALTH HANDSHAKE
 *
 * @remarks
 * Performs a multi-tier health check:
 * 1. Internal Pool: Reports key availability and throttling status.
 * 2. Upstream: Executes a test call to the Royale API using the healthiest key.
 * 3. System: Reports memory usage (RSS).
 */
app.get("/health", async (_request: Request, response: ExpressResponse): Promise<void> => {
    // 1. Local Pool Diagnostics
    const pool = KEYS.getPoolStats();
    
    // 2. Upstream Check (Current Healthiest Key)
    const testKey = KEYS.getHealthyKey();
    let upstreamStatus = "UNKNOWN";
    
    if (testKey) {
        try {
            const healthCheckResponse = await timeoutFetch(`${CONFIG.apiBase}/cards`, {
                headers: { Authorization: `Bearer ${testKey}` }
            }, 3000);
            upstreamStatus = healthCheckResponse.status === 200 ? "OK" : `FAIL_${healthCheckResponse.status}`;
            if (healthCheckResponse.status === 200) KEYS.reportSuccess(testKey);
            if (healthCheckResponse.status === 429 || healthCheckResponse.status === 403) KEYS.reportFailure(testKey, healthCheckResponse.status);
        } catch(healthCheckError) { upstreamStatus = "TIMEOUT"; }
    }

    response.status(200).json({
        status: "success",
        checks: {
            upstream: upstreamStatus,
            pool: pool,
            memory: process.memoryUsage().rss
        }
    });
});

/**
 * KEY AUDIT ENDPOINT
 *
 * @remarks
 * Validates an array of API keys provided in the request body.
 * Updates the global KeyService pool with the results of the audit.
 */
app.post(
  "/audit",
  async (
    request: Request<object, object, AuditRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Malformed input causing downstream runtime failures.
    // Rationale: Strict validation at the entry point ensures only valid data reaches the KeyService.
    const result = v.safeParse(AuditRequestSchema, request.body);
    if (!result.success) {
      response.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { apiKeys } = result.output;

      const auditUrl = `${CONFIG.apiBase}/cards`;
      const auditTasks = apiKeys.map(async (apiKey): Promise<ApiKeyAuditResult> => {
        try {
          const auditResponse = await timeoutFetch(
            auditUrl,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "User-Agent": "ClanManagerWorker/Audit",
              },
            },
            5000,
          );
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
    } catch (err: unknown) {
      // THREAT: Unhandled audit failures leading to worker instability.
      // Rationale: Strict error capturing prevents untyped exceptions from crashing the route handler.
      response.status(500).json({
        error: getErrorMessage(err),
      });
    }
  },
);

/**
 * PUBLIC SCAN ENDPOINT
 *
 * @remarks
 * Entry point for unauthenticated recruitment scans.
 * Supports two phases:
 * 1. Discovery: Scans tournaments for active, clanless players.
 * 2. Scoring: If 'scoring' is provided, fetches full profiles and
 *    calculates potential scores server-side.
 */
app.post(
  "/public/scan",
  async (
    request: Request<object, object, PublicScanRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Malformed scan tags or options causing inefficient upstream scanning or worker crashes.
    const result = v.safeParse(PublicScanRequestSchema, request.body);
    if (!result.success) {
      response.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { tags, blacklist, scoring, apiKeys: reqApiKeys, prophetCache } = result.output;

      // THREAT: Manually parsing env keys bypasses the global KeyManager's health state.
      // Target B [3]: Remove dead/misleading code. Fall back to empty array so processScanBatch
      // correctly utilizes the global KeyManager singleton health metrics.
      const apiKeys = reqApiKeys ?? [];

      const blacklistSet = new Set(blacklist ?? []);

      // THREAT: Allowing unauthenticated query params to override concurrency
      // creates a potential DoS/Resource Exhaustion vector where a malicious
      // caller could force the worker to spawn thousands of concurrent fetchers.
      const concurrency = Number(
        process.env["WORKER_CONCURRENCY"] ??
          CONFIG.concurrency,
      );

      const candidates = await processScanBatch(
        tags as TournamentTag[],
        apiKeys,
        concurrency,
        blacklistSet as Set<PlayerTag>,
        prophetCache
      );

      if (scoring && candidates.length > 0) {
        const candidateTags = [...new Set(candidates.map((candidate) => candidate.tag))];
        const playerUrls = candidateTags.map((tag) => {
            const normalizedTag = tag.startsWith("#") ? tag : `#${tag}`;
            return `${CONFIG.apiBase}/players/${encodeURIComponent(normalizedTag)}`;
        });

        const scoredResults = await processBatch<ScoredPlayer>(
          playerUrls,
          apiKeys,
          concurrency,
          scoring,
          prophetCache
        );

        response.json({
          candidates: scoredResults
            .map((result) => result.content)
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
    } catch (err: unknown) {
      // THREAT: Silent scan failures or worker crashes on malformed tournament data.
      // Rationale: Ensuring all tournament-level exceptions are caught and classified prevents PWA data starvation.
      console.error("Failed /public/scan", err);
      response.status(500).json({
        error: getErrorMessage(err),
      });
    }
  },
);

// Push subscription storage (in-memory)
// PERSISTENCE REQUIRED: Push subscriptions are lost on restart and must be migrated to a database.
const subscriptions = new Set<string>(); // PERSISTENCE REQUIRED: see [issue description]

app.post(
  "/public/subscribe",
  (request: Request<object, object, SubscriptionRequest>, response: ExpressResponse): void => {
    // THREAT: Silent corruption of the subscription set if malformed data is accepted.
    const result = v.safeParse(SubscriptionRequestSchema, request.body);
    if (!result.success) {
      response.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    const subscriptionPayload = result.output; // PATHOGEN: Anemic variable 'sub' replaced with domain-descriptive name.
    subscriptions.add(JSON.stringify(subscriptionPayload));
    console.log(` New Push Subscription. Total: ${subscriptions.size}`);
    response.json({ success: true, count: subscriptions.size });
  },
);

/**
 * INTERNAL SCAN ENDPOINT
 *
 * @remarks
 * High-precision recruitment scan with advanced debugging and
 * Prophet Cache integration. Used by the GAS backend for
 * administrative headhunting.
 */
app.post(
  "/scan",
  async (
    request: Request<object, object, ScanRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Unauthorized data access if malformed tags bypass filters.
    const result = v.safeParse(ScanRequestSchema, request.body);
    if (!result.success) {
      response.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { tags, apiKeys, blacklist, scoring, prophetCache } = result.output;

      const blacklistSet = new Set(blacklist ?? []);

      // THREAT: Allowing query params to override concurrency creates a potential
      // DoS/Resource Exhaustion vector. Privileged callers should still be
      // restricted to environment-defined concurrency limits.
      const concurrency = Number(
        process.env["WORKER_CONCURRENCY"] ??
          CONFIG.concurrency,
      );

        const debug: ScanDebugInfo = {} as ScanDebugInfo;
        const candidates = await processScanBatch(
            tags as TournamentTag[],
            apiKeys ?? [],
            concurrency,
            blacklistSet as Set<PlayerTag>,
            prophetCache,
            debug
        );

        const metadata = {
            version: "10.1.4",
            uptime: process.uptime(),
            pool: KEYS.getPoolStats(),
            envKeys: rawKeys.length > 0
        };

        if (scoring && candidates.length > 0) {
            const candidateTags = [...new Set(candidates.map((candidate) => candidate.tag))];
            const playerUrls = candidateTags.map((tag) => {
                const normalizedTag = tag.startsWith("#") ? tag : `#${tag}`;
                return `${CONFIG.apiBase}/players/${encodeURIComponent(normalizedTag)}`;
            });

            const scoredResults = await processBatch<ScoredPlayer>(
                playerUrls,
                apiKeys ?? [],
                concurrency,
                scoring,
                prophetCache
            );

            response.json({
                candidates: scoredResults
                    .map((result) => result.content)
                    .filter(
                        (candidate): candidate is ScoredPlayer =>
                            typeof candidate === "object" && candidate !== null && "tag" in candidate,
                    ),
                _debug: {
                    phase1: candidates.length,
                    phase2: scoredResults.length,
                    apiBase: CONFIG.apiBase,
                    trace: debug
                },
                _metadata: metadata
            });
            return;
        }

        response.json({
            candidates, 
            _debug: { phase1: candidates.length, apiBase: CONFIG.apiBase, trace: debug },
            _metadata: metadata
        });
    } catch (err: unknown) {
      // THREAT: Unauthorized data access or worker crash on internal scan.
      // Rationale: High-precision scans require a stable failure boundary to prevent GAS orchestrator timeouts.
      console.error("Failed /scan", err);
      response.status(500).json({
        error: getErrorMessage(err),
      });
    }
  },
);

/**
 * CLAN SNAPSHOT ENDPOINT
 *
 * @remarks
 * Aggregates a multi-resource snapshot of a clan in a single response:
 * 1. Members List
 * 2. Current River Race Status
 * 3. 52-Week War History (Reconciled)
 *
 * This minimizes the number of round-trips from GAS to the Worker.
 */
app.post(
  "/clan/full",
  async (
    request: Request<object, object, ClanFullRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Malformed clan tag causing upstream API errors or incorrect data snapshots.
    const result = v.safeParse(ClanFullRequestSchema, request.body);
    if (!result.success) {
      response.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { tag, apiKeys } = result.output;

      const rawTag = decodeURIComponent(tag);
      const cleanTag = encodeURIComponent(rawTag);
      const urls = [
        `${CONFIG.apiBase}/clans/${cleanTag}/members`,
        `${CONFIG.apiBase}/clans/${cleanTag}/currentriverrace`,
        `${CONFIG.apiBase}/clans/${cleanTag}/riverracelog?limit=52`,
      ];

      const results = await processBatch<
        ClanMembers | CurrentRiverRace | RiverRaceLog
      >(urls, apiKeys, 3, null);

      let membersData =
        results[0]?.code === 200 ? (results[0].content as ClanMembers) : null;
      let raceData =
        results[1]?.code === 200
          ? (results[1].content as CurrentRiverRace)
          : null;
      let logData =
        results[2]?.code === 200 ? (results[2].content as RiverRaceLog) : null;

      if (membersData) {
        // THREAT: Malformed member list causing downstream UI crashes.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleClanMembersResponseSchema, membersData);
        if (!validation.success) {
          console.error("[Worker] Members validation failed for /clan/full", validation.issues);
          response.status(502).json({ error: "Invalid members data format", details: validation.issues });
          return;
        }
        membersData = validation.output as unknown as ClanMembers;
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
          raceData = validation.output as unknown as CurrentRiverRace;
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
          logData = validation.output as unknown as RiverRaceLog;
        }
      }

      // Pre-process war history
      const warHistory: WarHistory = {};

      if (logData?.items) {
        logData.items.forEach((logEntry) => {
          const weekId = calculateWarWeekId(logEntry.createdDate);
          const standings = logEntry.standings ?? [];
          const normalizedTag = rawTag.startsWith("#") ? rawTag : "#" + rawTag;
          const myClan = standings.find((standing) => standing.clan.tag === normalizedTag);

          if (myClan?.clan.participants) {
            myClan.clan.participants.forEach((participant) => {
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
    } catch (err: unknown) {
      // THREAT: Corrupt clan snapshots polluting GAS state.
      // Rationale: Enforcing a clean error boundary for bulk fetches ensures the GAS backend receives a valid JSON error response.
      console.error("Failed /clan/full", err);
      response.status(500).json({
        error: getErrorMessage(err),
      });
    }
  },
);

app.post(
  "/clan/api",
  async (
    request: Request<object, object, ClanApiRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Invalid request types or tags leading to unhandled upstream responses.
    const result = v.safeParse(ClanApiRequestSchema, request.body);
    if (!result.success) {
      response.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { tag, type, apiKeys } = result.output;

      const cleanTag = encodeURIComponent(tag);
      let url = "";

      if (type === "members") {
        url = `${CONFIG.apiBase}/clans/${cleanTag}/members`;
      } else if (type === "warlog") {
        url = `${CONFIG.apiBase}/clans/${cleanTag}/riverracelog?limit=52`;
      } else {
        response.status(400).json({ error: "invalid type" });
        return;
      }

      // THREAT: Ignoring provided apiKeys in /clan/api leads to quota exhaustion on the global pool.
      // Target B [3]: Use the validated keys from the request body via a batch-scoped KeyManager.
      // Fall back to global KeyManager if apiKeys is empty.
      const batchManager = (apiKeys && apiKeys.length > 0) ? new KeyService(apiKeys) : undefined;

      const { code, content } = await fetchWithRotatedRetries(url, {
        method: "GET",
        headers: {
          "User-Agent": "ClanManagerWorker/1.0",
        },
      }, CONFIG.maxRetries, batchManager);

      if (code !== 200) {
        response.status(code).json({ error: "upstream error", details: content });
        return;
      }

      let transformed: unknown[] = [];

      if (type === "members") {
        // THREAT: Malformed upstream member list causing downstream runtime crashes.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleClanMembersResponseSchema, content);
        if (!validation.success) {
          response.status(502).json({ error: "Invalid upstream data format", details: validation.issues });
          return;
        }

        const formatRole = (role: string): string =>
          ({ leader: "Leader", coLeader: "Co-Leader", elder: "Elder" })[role] ??
          "Member";

        transformed = validation.output.items.map((member) => ({
          tag: member.tag,
          name: member.name,
          role: formatRole(member.role),
          kingLevel: member.expLevel,
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

        transformed = validation.output.items.map((warLogEntry) => {
          const rawTag = decodeURIComponent(tag);
          const normalizedTag = rawTag.startsWith("#") ? rawTag : "#" + rawTag;

          const myStanding = warLogEntry.standings.find((standing) => standing.clan.tag === normalizedTag);
          const opponents = warLogEntry.standings.filter((standing) => standing.clan.tag !== normalizedTag);

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

      response.json({ data: transformed });
    } catch (err: unknown) {
      // THREAT: Unhandled upstream errors in clan member/warlog fetching.
      // Rationale: Consistent error extraction prevents the "any Plague" from leaking into the PWA.
      console.error("Failed /clan/api", err);
      response.status(500).json({
        error: getErrorMessage(err),
      });
    }
  },
);

app.post(
  "/fetch",
  async (
    request: Request<object, object, FetchRequest>,
    response: ExpressResponse,
  ): Promise<void> => {
    // THREAT: Arbitrary URL fetching or malformed scoring weights leading to resource exhaustion.
    const result = v.safeParse(FetchRequestSchema, request.body);
    if (!result.success) {
      response.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { urls, apiKeys, scoring } = result.output;

      // THREAT: Resource Exhaustion via unauthenticated concurrency override.
      const concurrency = Number(
        process.env["WORKER_CONCURRENCY"] ??
          CONFIG.concurrency,
      );

      const batchResults = await processBatch(
        urls,
        apiKeys ?? [],
        concurrency,
        scoring ?? null,
      );

      response.json({ results: batchResults });
    } catch (err: unknown) {
      // THREAT: Resource exhaustion or worker crash on arbitrary fetch.
      // Rationale: Catching all fetch-related exceptions prevents the worker process from entering a zombie state.
      console.error("Failed /fetch", err);
      response.status(500).json({
        error: getErrorMessage(err),
      });
    }
  },
);

/**
 * HUB STATE ENDPOINT
 * 
 * Publicly exposes the synchronized Worker Hub payload to the PWA.
 * Strictly stateless to prevent locking read queries.
 */
app.get("/hub/state", async (_request: Request, response: ExpressResponse): Promise<void> => {
  try {
    const state = await WorkerHubController.getHubState();
    response.json({ success: true, data: state });
  } catch (err: unknown) {
    // THREAT: Silent corruption or uninformative 500 errors in Hub state delivery.
    // Target B [1]: Robust error classification for the PWA ingress boundary using v.safeParse.
    const validation = v.safeParse(HubErrorSchema, err);

    if (validation.success && validation.output.code === "ERR_STATE_MISSING") {
      response.status(503).json({
        error: validation.output.message,
        layer: validation.output.layer
      });
    } else {
      const errorMessage = err instanceof Error ? err.message : String(err);
      response.status(500).json({ error: errorMessage || "unknown" });
    }
  }
});

/**
 * MANUAL SYNC ENDPOINT
 * 
 * Allows forcing a synchronization cycle manually (e.g. via GAS triggers or Webhooks).
 * Requires the REMOTE_WORKER_SECRET.
 */
app.post("/hub/sync/manual", async (_request: Request, response: ExpressResponse): Promise<void> => {
  const secret = process.env["REMOTE_WORKER_SECRET"] || "";
  const gasBase = process.env["VITE_GAS_URL"] || process.env["GAS_URL"] || "";
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