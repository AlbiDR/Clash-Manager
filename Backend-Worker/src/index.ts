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
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import fetch from "node-fetch";
import * as v from "valibot";
import ScoringKernel from "../../Backend-GAS/Scoring_Kernel";
import Time from "../../Backend-GAS/Time";
import { KeyService } from "./KeyService.js";
import {
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
  .map(k => k.trim())
  .filter(k => k && k !== "REPLACE_ME" && k !== "YOUR_KEYS"); // EPHEMERAL: intentionally resets on restart

if (rawKeys.length === 0) {
    console.warn("[Worker] Warning: No API_KEYS found in environment variables.");
} else {
    console.log(`[Worker] Initialized internal pool with ${rawKeys.length} keys.`);
}

const KEYS = new KeyService(rawKeys); // EPHEMERAL: intentionally resets on restart

// ============================================================================
//  EXPRESS APP SETUP
// ============================================================================

const app = express();

// CORS Middleware
app.use((req: Request, res: Response, next: NextFunction): void => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
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
const authMiddleware: RequestHandler = (req, res, next) => {
  const publicRoutes = [
    "/",
    "/health",
    "/capabilities",
    "/public/scan",
    "/public/subscribe",
  ];

  // Normalize path to handle trailing slashes consistently
  const path = req.path.replace(/\/$/, "") || "/";

  if (publicRoutes.includes(path)) {
    return next();
  }

  const secret = process.env["REMOTE_WORKER_SECRET"];
  const authHeader = req.headers.authorization;

  if (!secret) {
    // THREAT: Exposed privileged endpoints if secret is missing.
    console.error("[Auth] REMOTE_WORKER_SECRET not set in environment");
    res.status(500).json({ error: "Internal server configuration error" });
    return;
  }

  if (authHeader !== `Bearer ${secret}`) {
    // THREAT: Unauthenticated access to Royale API keys and clan data.
    res.status(401).json({ error: "Unauthorized" });
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
 * Fetch with timeout protection
 */
async function timeoutFetch(
  url: string,
  opts: Record<string, unknown> = {},
  timeout: number = CONFIG.timeout,
): Promise<fetch.Response> {
  return Promise.race([
    fetch(url, { ...opts, timeout }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeout),
    ),
  ]);
}

/**
 * Fetch with automatic retries, exponential backoff with jitter, and SMART KEY ROTATION
 */
async function fetchWithRotatedRetries<T = unknown>(
  url: string,
  baseOpts: Record<string, any>,
  retries: number = CONFIG.maxRetries,
  keyService?: KeyService,
): Promise<FetchResult<T>> {
  let attempt = 0;
  let lastErr: Error | null = null;

  // Use provided KeyService (for batches) or fallback to global singleton
  const manager = keyService ?? KEYS;

  while (attempt <= retries) {
    const currentKey = manager.getHealthyKey();
    if (!currentKey) {
      return { code: 429, content: "ERR_QUOTA_EMPTY" as unknown as T };
    }

    const opts = {
      ...baseOpts,
      headers: {
        ...(baseOpts["headers"] || {}),
        "Authorization": `Bearer ${currentKey}`
      }
    };

    try {
      const res = await timeoutFetch(url, opts);
      const code = res.status;
      const text = await res.text();

      if (code === 200) {
        manager.reportSuccess(currentKey);
        try {
          return { code, content: JSON.parse(text) as T };
        } catch {
          return { code, content: text as unknown as T };
        }
      }

      // Handle Failures
      manager.reportFailure(currentKey, code);
      
      if (code === 404) return { code, content: text as unknown as T };
      if (code === 403) throw new Error("auth_denied");
      if (code === 429) throw new Error("rate_limit");
      
      throw new Error(`upstream_status_${code}`);

    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
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
async function processBatch<T = unknown>(
  urls: string[],
  apiKeys: string[] = [],
  concurrency: number = CONFIG.concurrency,
  scoring: ScoringWeights | null = null,
  prophetCache?: Record<string, any>
): Promise<FetchResult<T>[]> {
  const results: FetchResult<T>[] = new Array(urls.length);
  let idx = 0;

  // Shared KeyService for the entire batch to preserve health state across requests
  const batchManager = apiKeys.length > 0 ? new KeyService(apiKeys) : undefined;

  async function worker(): Promise<void> {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;

      const url = urls[i];
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
              results[i] = { code: 502, content: "Invalid player profile format" };
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
                hasWar = logsValidation.output.some((b) =>
                  ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(
                    b.type,
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

            results[i] = {
              code: 200,
              content: {
                tag: profile.tag as PlayerTag,
                name: profile.name,
                trophies: profile.trophies,
                donations: profile.totalDonations,
                cards: profile.challengeCardsWon,
                war: totalWarScore,
                rawScore,
              } as T,
            };
          } else {
            results[i] = profileResult as FetchResult<T>;
          }
        } catch (e) {
          results[i] = {
            code: 500,
            content: `Scoring fetch failed: ${e instanceof Error ? e.message : "unknown"}`,
          };
        }
      } else {
        const res = await fetchWithRotatedRetries<T>(url, { method: "GET", headers }, CONFIG.maxRetries, batchManager);
        results[i] = res;
      }
    }
  }

  // Spawn worker pool
  const workers: Promise<void>[] = [];
  const spawn = Math.min(concurrency, urls.length);
  for (let i = 0; i < spawn; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Filter and sort if scoring is enabled
  if (scoring) {
    return results
      .filter(
        (r): r is FetchResult<T> =>
          r !== undefined &&
          r.code === 200 &&
          typeof r.content === "object" &&
          r.content !== null &&
          "rawScore" in r.content,
      )
      .sort((a, b) => {
        const aScore = (a.content as any).rawScore as number;
        const bScore = (b.content as any).rawScore as number;
        return bScore - aScore;
      })
      .slice(0, 200);
  }

  return results;
}

/**
 * Tournament scan batch processor
 */
async function processScanBatch(
  tags: TournamentTag[],
  apiKeys: string[] = [],
  concurrency: number = CONFIG.concurrency,
  blacklistSet: Set<PlayerTag> = new Set(),
  minTrophies: number = 4000,
  prophetCache?: Record<string, any>,
  debug?: any
): Promise<ScoredPlayer[]> {
  const candidates: ScoredPlayer[] = [];
  let idx = 0;
  let traceCaptured = false;

  // Shared KeyService for the entire batch to preserve health state across requests
  const batchManager = apiKeys.length > 0 ? new KeyService(apiKeys) : undefined;

  async function worker(): Promise<void> {
    while (true) {
      const i = idx++;
      if (i >= tags.length) return;

    const tag = tags[i];
    if (!tag) continue;

    const normalizedTag = tag.startsWith("#") ? tag : `#${tag}`;
    const url = `${CONFIG.apiBase}/tournaments/${encodeURIComponent(normalizedTag)}`;

    const headers: Record<string, string> = {
      "User-Agent": "ClanManagerWorker/1.2",
      "Accept-Encoding": "gzip",
    };

      try {
        const res = await fetchWithRotatedRetries<Tournament>(url, {
          method: "GET",
          headers,
        }, CONFIG.maxRetries, batchManager);

        // SUPER DIAGNOSTIC: Capture raw response of the first attempt
        if (debug && !traceCaptured) {
            traceCaptured = true;
            debug.firstUrl = url;
            debug.firstStatus = res.code;
            debug.firstContent = typeof res.content === "string" 
                ? res.content.substring(0, 1000) 
                : JSON.stringify(res.content).substring(0, 1000);
            debug.keyUsed = (headers["Authorization"] || "None").substring(0, 15) + "...";
        }

        if (res.code === 200 && typeof res.content === "object" && res.content !== null) {
          // THREAT: Malformed tournament data causing incorrect candidate discovery.
          // Target B [1]: Enforce strict validation boundary for Royale API data.
          const validation = v.safeParse(RoyaleTournamentResponseSchema, res.content);
          if (validation.success) {
            validation.output.membersList.forEach((p) => {
              if (p.trophies < minTrophies) return;
              if (p.clan?.tag) return;
              if (blacklistSet.has(p.tag as PlayerTag)) return;

              // STRATEGY 2: Deep Delegation - Apply Prophet Logic Server-Side
              if (prophetCache) {
                const normTag = p.tag.replace("#", "").trim().toLowerCase();
                const intel = prophetCache[normTag];
                // Lightweight scoring estimation (detailed scoring happens in profile fetch phase)
                // But we can flag "Heritage" candidates early here if needed.
                if (intel) {
                  // Bonus logic could go here, but strictly we need profile stats for true score.
                  // For now, we just pass them through.
                }
              }

              candidates.push({
                tag: p.tag as PlayerTag,
                name: p.name,
                trophies: p.trophies,
                donations: 0,
                cards: 0,
                war: 0,
                rawScore: 0,
              });
            });
          }
        }
      } catch (e) {
        console.warn(`[Worker] Scan failed for tournament ${tag}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  }

  const workers: Promise<void>[] = [];
  const spawn = Math.min(concurrency, tags.length);
  for (let i = 0; i < spawn; i++) {
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

app.get("/", (_req: Request, res: Response): void => {
  res.send("Clash Manager Worker is running");
});

app.get("/capabilities", (_req: Request, res: Response): void => {
  res.json({
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
app.get("/health", async (_req: Request, res: Response): Promise<void> => {
    // 1. Local Pool Diagnostics
    const pool = KEYS.getPoolStats();
    
    // 2. Upstream Check (Current Healthiest Key)
    const testKey = KEYS.getHealthyKey();
    let upstreamStatus = "UNKNOWN";
    
    if (testKey) {
        try {
            const upRes = await timeoutFetch(`${CONFIG.apiBase}/cards`, {
                headers: { Authorization: `Bearer ${testKey}` }
            }, 3000);
            upstreamStatus = upRes.status === 200 ? "OK" : `FAIL_${upRes.status}`;
            if (upRes.status === 200) KEYS.reportSuccess(testKey);
            if (upRes.status === 429 || upRes.status === 403) KEYS.reportFailure(testKey, upRes.status);
        } catch(e) { upstreamStatus = "TIMEOUT"; }
    }

    res.status(200).json({
        status: "success",
        checks: {
            upstream: upstreamStatus,
            pool: pool,
            memory: (process as any).memoryUsage().rss
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
    req: Request<object, object, AuditRequest>,
    res: Response,
  ): Promise<void> => {
    // THREAT: Malformed input causing downstream runtime failures.
    // Rationale: Strict validation at the entry point ensures only valid data reaches the KeyService.
    const result = v.safeParse(AuditRequestSchema, req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { apiKeys } = result.output;

      const auditUrl = `${CONFIG.apiBase}/cards`;
      const tasks = apiKeys.map(async (key): Promise<ApiKeyAuditResult> => {
        try {
          const response = await timeoutFetch(
            auditUrl,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${key}`,
                "User-Agent": "ClanManagerWorker/Audit",
              },
            },
            5000,
          );
          if (response.status === 200) KEYS.reportSuccess(key);
          if (response.status === 429 || response.status === 403) KEYS.reportFailure(key, response.status);
          
          return { key, status: response.status };
        } catch (e) {
          return {
            key,
            status: 500,
            error: e instanceof Error ? e.message : "unknown",
          };
        }
      });

      const results = await Promise.all(tasks);
      res.json({ results });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "unknown",
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
    req: Request<object, object, PublicScanRequest>,
    res: Response,
  ): Promise<void> => {
    // THREAT: Malformed scan tags or options causing inefficient upstream scanning or worker crashes.
    const result = v.safeParse(PublicScanRequestSchema, req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { tags, blacklist, minTrophies, scoring, apiKeys: reqApiKeys, prophetCache } = result.output;

      // THREAT: Manually parsing env keys bypasses the global KeyManager's health state.
      // Target B [3]: Remove dead/misleading code. Fall back to empty array so processScanBatch
      // correctly utilizes the global KeyManager singleton health metrics.
      const apiKeys = reqApiKeys ?? [];

      const blacklistSet = new Set(blacklist ?? []);
      const concurrency = Number(
        process.env["WORKER_CONCURRENCY"] ??
          req.query["c"] ??
          CONFIG.concurrency,
      );

      const candidates = await processScanBatch(
        tags as TournamentTag[],
        apiKeys,
        concurrency,
        blacklistSet as Set<PlayerTag>,
        minTrophies ?? 4000,
        prophetCache
      );

      if (scoring && candidates.length > 0) {
        const candidateTags = [...new Set(candidates.map((c) => c.tag))];
        const playerUrls = candidateTags.map((t) => {
            const nt = t.startsWith("#") ? t : `#${t}`;
            return `${CONFIG.apiBase}/players/${encodeURIComponent(nt)}`;
        });

        const scoredResults = await processBatch<ScoredPlayer>(
          playerUrls,
          apiKeys,
          concurrency,
          scoring,
          prophetCache
        );

        res.json({
          candidates: scoredResults
            .map((r) => r.content)
            .filter(
              (c): c is ScoredPlayer =>
                typeof c === "object" && c !== null && "tag" in c,
            ),
          _debug: {
            phase1: candidates.length,
            phase2: scoredResults.length,
            apiBase: CONFIG.apiBase
          }
        });
        return;
      }

      res.json({ candidates, _debug: { phase1: candidates.length, apiBase: CONFIG.apiBase } });
    } catch (e) {
      console.error("Failed /public/scan", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  },
);

// Push subscription storage (in-memory)
const subscriptions = new Set<string>(); // PERSISTENCE REQUIRED: Push subscriptions are lost on restart and must be migrated to a database.

app.post(
  "/public/subscribe",
  (req: Request<object, object, SubscriptionRequest>, res: Response): void => {
    // THREAT: Silent corruption of the subscription set if malformed data is accepted.
    const result = v.safeParse(SubscriptionRequestSchema, req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    const sub = result.output;
    subscriptions.add(JSON.stringify(sub));
    console.log(` New Push Subscription. Total: ${subscriptions.size}`);
    res.json({ success: true, count: subscriptions.size });
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
    req: Request<object, object, ScanRequest>,
    res: Response,
  ): Promise<void> => {
    // THREAT: Unauthorized data access if malformed tags bypass filters.
    const result = v.safeParse(ScanRequestSchema, req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { tags, apiKeys, blacklist, minTrophies, scoring, prophetCache } = result.output;

      const blacklistSet = new Set(blacklist ?? []);
      const concurrency = Number(
        process.env["WORKER_CONCURRENCY"] ??
          req.query["c"] ??
          CONFIG.concurrency,
      );

        const debug: any = {};
        const candidates = await processScanBatch(
            tags as TournamentTag[],
            apiKeys ?? [],
            concurrency,
            blacklistSet as Set<PlayerTag>,
            minTrophies ?? 4000,
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
            const candidateTags = [...new Set(candidates.map((c) => c.tag))];
            const playerUrls = candidateTags.map((t) => {
                const nt = t.startsWith("#") ? t : `#${t}`;
                return `${CONFIG.apiBase}/players/${encodeURIComponent(nt)}`;
            });

            const scoredResults = await processBatch<ScoredPlayer>(
                playerUrls,
                apiKeys ?? [],
                concurrency,
                scoring,
                prophetCache
            );

            res.json({
                candidates: scoredResults
                    .map((r) => r.content)
                    .filter(
                        (c): c is ScoredPlayer =>
                            typeof c === "object" && c !== null && "tag" in c,
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

        res.json({ 
            candidates, 
            _debug: { phase1: candidates.length, apiBase: CONFIG.apiBase, trace: debug },
            _metadata: metadata
        });
    } catch (e) {
      console.error("Failed /scan", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "unknown",
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
    req: Request<object, object, ClanFullRequest>,
    res: Response,
  ): Promise<void> => {
    // THREAT: Malformed clan tag causing upstream API errors or incorrect data snapshots.
    const result = v.safeParse(ClanFullRequestSchema, req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.issues });
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
          res.status(502).json({ error: "Invalid members data format", details: validation.issues });
          return;
        }
        membersData = validation.output as unknown as ClanMembers;
      } else {
        res.status(500).json({ error: "Failed to fetch members" });
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
        logData.items.forEach((log) => {
          const weekId = calculateWarWeekId(log.createdDate);
          const standings = log.standings ?? [];
          const normalizedTag = rawTag.startsWith("#") ? rawTag : "#" + rawTag;
          const myClan = standings.find((s) => s.clan.tag === normalizedTag);

          if (myClan?.clan.participants) {
            myClan.clan.participants.forEach((p) => {
              if (!warHistory[p.tag]) {
                warHistory[p.tag] = {};
              }
              const currentFame = warHistory[p.tag]?.[weekId] ?? 0;
              warHistory[p.tag]![weekId] = Math.max(currentFame, p.fame);
            });
          }
        });
      }

      res.json({
        members: membersData,
        race: raceData,
        history: warHistory,
      });
    } catch (e) {
      console.error("Failed /clan/full", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  },
);

app.post(
  "/clan/api",
  async (
    req: Request<object, object, ClanApiRequest>,
    res: Response,
  ): Promise<void> => {
    // THREAT: Invalid request types or tags leading to unhandled upstream responses.
    const result = v.safeParse(ClanApiRequestSchema, req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.issues });
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
        res.status(400).json({ error: "invalid type" });
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
        res.status(code).json({ error: "upstream error", details: content });
        return;
      }

      let transformed: unknown[] = [];

      if (type === "members") {
        // THREAT: Malformed upstream member list causing downstream runtime crashes.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleClanMembersResponseSchema, content);
        if (!validation.success) {
          res.status(502).json({ error: "Invalid upstream data format", details: validation.issues });
          return;
        }

        const formatRole = (role: string): string =>
          ({ leader: "Leader", coLeader: "Co-Leader", elder: "Elder" })[role] ??
          "Member";

        transformed = validation.output.items.map((m) => ({
          tag: m.tag,
          name: m.name,
          role: formatRole(m.role),
          kingLevel: m.expLevel,
          donations: m.donations,
          donationsReceived: m.donationsReceived,
        }));
      } else if (type === "warlog") {
        // THREAT: Corrupt war log data polluting clan historical records.
        // Target B [1]: Enforce strict validation boundary for Royale API data.
        const validation = v.safeParse(RoyaleWarLogResponseSchema, content);
        if (!validation.success) {
          res.status(502).json({ error: "Invalid upstream data format", details: validation.issues });
          return;
        }

        const parseCRDateISO = (t: string): string => {
          if (!t) return new Date().toISOString().split("T")[0] ?? "";
          return `${t.substring(0, 4)}-${t.substring(4, 6)}-${t.substring(6, 8)}`;
        };

        transformed = validation.output.items.map((r) => {
          const rawTag = decodeURIComponent(tag);
          const normalizedTag = rawTag.startsWith("#") ? rawTag : "#" + rawTag;

          const myStanding = r.standings.find((s) => s.clan.tag === normalizedTag);
          const opponents = r.standings.filter((s) => s.clan.tag !== normalizedTag);

          const myFame = myStanding ? myStanding.clan.fame : 0;
          const myRank = myStanding ? myStanding.rank : null;
          const bestRival = opponents.sort(
            (a, b) => b.clan.fame - a.clan.fame,
          )[0];

          let result = "lose";
          if (myRank === 1) result = "win";
          if (myRank === null) result = "n/a";

          return {
            result,
            endTime: parseCRDateISO(r.createdDate),
            opponent: bestRival ? bestRival.clan.name : "No Opponent",
            teamSize: 50,
            score: myFame,
            opponentScore: bestRival ? bestRival.clan.fame : 0,
          };
        });
      }

      res.json({ data: transformed });
    } catch (e) {
      console.error("Failed /clan/api", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  },
);

app.post(
  "/fetch",
  async (
    req: Request<object, object, FetchRequest>,
    res: Response,
  ): Promise<void> => {
    // THREAT: Arbitrary URL fetching or malformed scoring weights leading to resource exhaustion.
    const result = v.safeParse(FetchRequestSchema, req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.issues });
      return;
    }

    try {
      const { urls, apiKeys, scoring } = result.output;

      const concurrency = Number(
        process.env["WORKER_CONCURRENCY"] ??
          req.query["c"] ??
          CONFIG.concurrency,
      );

      const results = await processBatch(
        urls,
        apiKeys ?? [],
        concurrency,
        scoring ?? null,
      );

      res.json({ results });
    } catch (e) {
      console.error("Failed /fetch", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  },
);

// ============================================================================
//  SERVER STARTUP
// ============================================================================

app.listen(CONFIG.port, () => {
  console.log(
    `Worker listening on ${CONFIG.port} (concurrency=${CONFIG.concurrency})`,
  );
});