// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import ScoringKernel from "../../../Backend-GAS/Scoring_Kernel.js";
import Time from "../../../Backend-GAS/Time.js";
import { KeyService } from "../KeyService.js";
import { Network } from "./Network.js";
import { RoyaleApiService } from "./RoyaleApiService.js";
import {
  RoyalePlayerSchema,
  RoyaleBattleLogResponseSchema,
  RoyaleTournamentResponseSchema,
} from "../schemas.js";
import type {
  FetchResult,
  ScoringWeights,
  ScoredPlayer,
  WarWeekId,
  ClashRoyalePlayer,
  BattleLogEntry,
  Tournament,
  ProphetIntel,
  ScanDebugInfo,
  TournamentTag,
  PlayerTag,
} from "../types.js";

/**
 * ============================================================================
 * [SERVICE] RECRUITMENT ORCHESTRATOR
 * ----------------------------------------------------------------------------
 * Handles high-level recruitment operations, including batch processing,
 * tournament scanning, and server-side scoring (Strategy 2: Deep Delegation).
 * ============================================================================
 */

export class RecruitmentService {
  private static readonly MAX_CONCURRENCY = parseInt(process.env["WORKER_CONCURRENCY"] ?? "20", 10);
  private static readonly MAX_RETRIES = parseInt(process.env["WORKER_RETRIES"] ?? "2", 10);
  private static readonly API_BASE = process.env["API_BASE"] ?? "https://proxy.royaleapi.dev/v1";

  /**
   * Uses the centralized Time kernel from the GAS backend to calculate a standardized
   * War Week ID (YYWnn format).
   *
   * @param dateString - ISO 8601 date string.
   * @returns The branded WarWeekId.
   */
  static calculateWarWeekId(dateString: string): WarWeekId {
    if (!dateString) return "Unknown" as WarWeekId;
    const date = Time.parseRoyaleApiDate(dateString);
    return Time.calculateWarWeekId(date) as WarWeekId;
  }

  /**
   * Implements a high-concurrency worker pool pattern to process multiple URLs
   * in parallel. This function handles both raw data fetching and specialized
   * recruitment scoring.
   *
   * @param targetEndpoints - Array of Royale API endpoints to process.
   * @param apiKeys - Optional array of keys for the local KeyService pool.
   * @param concurrencyLimit - Maximum simultaneous requests.
   * @param scoringWeights - Optional scoring weights to trigger recruitment processing.
   * @param prophetCache - Historical heritage data used for scoring multipliers.
   * @param minTrophyThreshold - Minimum trophies required to be included in results.
   * @param globalKeys - Global KeyService instance as fallback.
   * @returns Array of FetchResults; sorted by score if recruitment scoring was active.
   */
  static async processBatch<T = unknown>(
    targetEndpoints: string[],
    apiKeys: string[] = [],
    concurrencyLimit: number = this.MAX_CONCURRENCY,
    scoringWeights: ScoringWeights | null = null,
    prophetCache?: Record<string, ProphetIntel>,
    minTrophyThreshold: number = 0,
    globalKeys?: KeyService,
  ): Promise<FetchResult<T>[]> {
    const estimatedUsage = scoringWeights ? targetEndpoints.length * 2 : targetEndpoints.length;
    Network.quotaCheck(estimatedUsage);

    const batchProcessingResults: FetchResult<T>[] = new Array(targetEndpoints.length);
    let currentBatchIndex = 0;

    const batchManager = apiKeys.length > 0 ? new KeyService(apiKeys) : globalKeys;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = currentBatchIndex++;
        if (index >= targetEndpoints.length) return;

        const endpoint = targetEndpoints[index];
        if (!endpoint) continue;

        const requestHeaders: Record<string, string> = {
          "User-Agent": "ClanManagerWorker/10.1.4",
          "Accept-Encoding": "gzip",
        };

        if (scoringWeights && endpoint.includes("/players/") && !endpoint.includes("/battlelog")) {
          try {
            const profileResult = await RoyaleApiService.fetchWithRotatedRetries<ClashRoyalePlayer>(endpoint, {
              method: "GET",
              headers: requestHeaders,
            }, this.MAX_RETRIES, batchManager!);

            if (profileResult.code === 200 && typeof profileResult.content === "object" && profileResult.content !== null) {
              const profileValidation = v.safeParse(RoyalePlayerSchema, profileResult.content);
              if (!profileValidation.success) {
                batchProcessingResults[index] = { code: 502, content: "Invalid player profile format" as T };
                continue;
              }
              const playerProfile = profileValidation.output;

              const logUrl = `${endpoint}/battlelog`;
              const logsResult = await RoyaleApiService.fetchWithRotatedRetries<BattleLogEntry[]>(
                logUrl,
                {
                  method: "GET",
                  headers: requestHeaders,
                },
                this.MAX_RETRIES,
                batchManager!,
              );

              let hasWarActivity = false;
              if (logsResult.code === 200 && Array.isArray(logsResult.content)) {
                const logsValidation = v.safeParse(RoyaleBattleLogResponseSchema, logsResult.content);
                if (logsValidation.success) {
                  hasWarActivity = logsValidation.output.some((logEntry) =>
                    ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(logEntry.type),
                  );
                }
              }

              const currentLeagueTrophies = playerProfile.leagueStatistics?.currentSeason?.trophies || 0;
              const effectiveTrophies = (playerProfile.trophies || 0) + (playerProfile.trophies >= 9000 ? currentLeagueTrophies : 0);

              let rawPotentialScore = ScoringKernel.computeRecruitScore(
                effectiveTrophies,
                playerProfile.totalDonations ?? 0,
                playerProfile.warDayWins ?? 0,
                hasWarActivity,
                scoringWeights || { TROPHY: 1.0, DON: 0.07, WAR: 20.0, WAR_BASELINE_BONUS: 500 },
              );

              if (prophetCache) {
                   const normalizedTag = playerProfile.tag;
                   const historicalIntel = prophetCache[normalizedTag];
                   if (historicalIntel && historicalIntel.wins > 5) {
                      rawPotentialScore *= 1.25;
                   }
              }

              const warActivityBonus = hasWarActivity ? 500 : 0;
              const combinedWarScore = (playerProfile.warDayWins ?? 0) + warActivityBonus;

              if (minTrophyThreshold > 0 && effectiveTrophies < minTrophyThreshold) {
                  console.info(`[RecruitmentService] Discarded ${playerProfile.tag} (${playerProfile.name}): ${effectiveTrophies} < ${minTrophyThreshold}`);
                  batchProcessingResults[index] = { code: 200, content: null as T };
                  continue;
              }

              if (playerProfile.clan?.tag) {
                  batchProcessingResults[index] = { code: 200, content: null as T };
                  continue;
              }

              batchProcessingResults[index] = {
                code: 200,
                content: {
                  tag: playerProfile.tag,
                  name: playerProfile.name,
                  trophies: effectiveTrophies,
                  donations: playerProfile.totalDonations,
                  cards: playerProfile.challengeCardsWon,
                  war: combinedWarScore,
                  rawScore: rawPotentialScore,
                  clan: playerProfile.clan?.name || null,
                } as T,
              };
            } else {
              batchProcessingResults[index] = profileResult as FetchResult<T>;
            }
          } catch (scoringOperationError) {
            batchProcessingResults[index] = {
              code: 500,
              content: `Scoring fetch failed: ${scoringOperationError instanceof Error ? scoringOperationError.message : "unknown"}` as T,
            };
          }
        } else {
          const fetchResponse = await RoyaleApiService.fetchWithRotatedRetries<T>(endpoint, { method: "GET", headers: requestHeaders }, this.MAX_RETRIES, batchManager!);
          batchProcessingResults[index] = fetchResponse;
        }
      }
    };

    const workerPool: Promise<void>[] = [];
    const spawnCount = Math.min(concurrencyLimit, targetEndpoints.length);
    for (let i = 0; i < spawnCount; i++) {
      workerPool.push(worker());
    }
    await Promise.all(workerPool);

    if (scoringWeights) {
      return batchProcessingResults
        .filter(
          (resultRecord): resultRecord is FetchResult<T> =>
            resultRecord !== undefined &&
            resultRecord.code === 200 &&
            typeof resultRecord.content === "object" &&
            resultRecord.content !== null &&
            "rawScore" in resultRecord.content,
        )
        .sort((aCandidate, bCandidate) => {
          const aScore = (aCandidate.content as ScoredPlayer).rawScore;
          const bScore = (bCandidate.content as ScoredPlayer).rawScore;
          return bScore - aScore;
        })
        .slice(0, 200);
    }

    return batchProcessingResults;
  }

  /**
   * Phase 1 of the recruitment pipeline. Scans multiple open tournaments to
   * identify active, clanless players.
   *
   * @param tournamentTags - Tournament tags to scan.
   * @param apiKeys - Scoped API keys for rotation.
   * @param concurrencyLimit - Maximum concurrent scan requests.
   * @param dismissedPlayerTags - Set of player tags to ignore (dismissed/blacklisted).
   * @param prophetCache - Heritage data for scoring prioritization.
   * @param diagnosticTrace - Optional diagnostic object for tracing the first scan result.
   * @param globalKeys - Global KeyService instance as fallback.
   * @returns Array of unscored recruit candidates (metadata only).
   */
  static async processScanBatch(
    tournamentTags: TournamentTag[],
    apiKeys: string[] = [],
    concurrencyLimit: number = this.MAX_CONCURRENCY,
    dismissedPlayerTags: Set<PlayerTag> = new Set(),
    prophetCache?: Record<string, ProphetIntel>,
    diagnosticTrace?: ScanDebugInfo,
    globalKeys?: KeyService,
  ): Promise<ScoredPlayer[]> {
    Network.quotaCheck(tournamentTags.length);

    const recruitmentCandidates: ScoredPlayer[] = [];
    let currentBatchIndex = 0;
    let isTraceCaptured = false;

    const batchManager = apiKeys.length > 0 ? new KeyService(apiKeys) : globalKeys;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = currentBatchIndex++;
        if (index >= tournamentTags.length) return;

      const tag = tournamentTags[index];
      if (!tag) continue;

      const endpoint = `${this.API_BASE}/tournaments/${encodeURIComponent(tag)}`;

      const requestHeaders: Record<string, string> = {
        "User-Agent": "ClanManagerWorker/10.1.4",
        "Accept-Encoding": "gzip",
      };

        try {
          const apiResponse = await RoyaleApiService.fetchWithRotatedRetries<Tournament>(endpoint, {
            method: "GET",
            headers: requestHeaders,
          }, this.MAX_RETRIES, batchManager!);

          if (diagnosticTrace && !isTraceCaptured) {
              isTraceCaptured = true;
              diagnosticTrace.firstUrl = endpoint;
              diagnosticTrace.firstStatus = apiResponse.code;
              diagnosticTrace.firstContent = typeof apiResponse.content === "string"
                  ? apiResponse.content.substring(0, 1000)
                  : JSON.stringify(apiResponse.content).substring(0, 1000);
              diagnosticTrace.keyUsed = (requestHeaders["Authorization"] || "None").substring(0, 15) + "...";
          }

          if (apiResponse.code === 200 && typeof apiResponse.content === "object" && apiResponse.content !== null) {
            const tournamentValidation = v.safeParse(RoyaleTournamentResponseSchema, apiResponse.content);
            if (tournamentValidation.success) {
              tournamentValidation.output.membersList.forEach((memberCandidate) => {
                if (memberCandidate.clan?.tag) return;
                const candidateTag = memberCandidate.tag as PlayerTag;
                if (dismissedPlayerTags.has(candidateTag)) return;

                recruitmentCandidates.push({
                  tag: candidateTag,
                  name: memberCandidate.name || "Unknown",
                  rawScore: 0,
                });
              });
            }
          }
        } catch (scanOperationError) {
          console.warn(`[RecruitmentService] Scan failed for tournament ${tag}: ${scanOperationError instanceof Error ? scanOperationError.message : "unknown"}`);
        }
      }
    };

    const workerPool: Promise<void>[] = [];
    const spawnCount = Math.min(concurrencyLimit, tournamentTags.length);
    for (let i = 0; i < spawnCount; i++) {
      workerPool.push(worker());
    }
    await Promise.all(workerPool);

    return recruitmentCandidates;
  }
}
