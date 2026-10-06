// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.5.0";
import { fetchWithRotation, processBatch } from "../_shared/muscle.ts";
import {
  RoyaleLocationListSchema,
  RoyaleRankingListSchema,
  RoyaleSeasonListSchema,
  RoyalePlayerSchema,
  HarvestedPlayerSchema
} from "../_shared/schemas.ts";
import { AuditEntry } from "../_shared/types.ts";
import {
  PLAYER_LEADERBOARD_LIMIT,
  TARGET_HARVEST_FLOOR,
  MIN_LOCAL_POL_FLOOR,
  MAX_HARVEST_EPOCHS,
  MAX_SEASON_RANKING_PAGES,
  GLOBAL_LOCATION,
  DEFAULT_FALLBACK_ID,
  DEFAULT_FALLBACK_COUNTRY,
  INITIAL_INDEX
} from "../_shared/config.ts";

/**
 * L1 Core: Harvester Utility (@features)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Handles Royale API discovery queries and clanless player harvesting.
 * Encapsulates multi-tier discovery logic (Global, Local, and International).
 * ----------------------------------------------------------------------------
 */

// EPHEMERAL: intentionally resets on cold start.
// Top-level cache to minimize locations list roundtrips.
let cachedCountries: { id: number; name: string }[] | null = null;

/**
 * Executes a single rankings query against the Royale API proxy and filters for clanless players.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture (Layer 1 Core Engine) and Section V: Data Loader.
 * Reconciles structural API contracts with runtime types.
 *
 * Security Requirements:
 * - Accesses endpoint via fetchWithRotation.
 * - Handled under internal bearer tokens and anonymous key routing constraints to enforce Principle of Least Privilege.
 *
 * Failure Modes & Recovery:
 * - Downstream Proxy Failures: Throws if response is non-2xx.
 * - Structural Payload Drift: Throws if valibot validation against RoyaleRankingListSchema fails.
 *
 * @param endpointPath - The path parameter for the downstream proxy request.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns Filtered array of discovered clanless player records.
 * @throws {Error} If the HTTP request fails or the response fails schema verification.
 */
async function fetchRankings(
  endpointPath: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
  paginate = false
): Promise<v.InferOutput<typeof HarvestedPlayerSchema>[]> {
  const players = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
  const visitedCursors = new Set<string>();
  let pagePath = endpointPath;
  const pageLimit = paginate ? MAX_SEASON_RANKING_PAGES : 1;
  for (let pageIndex = INITIAL_INDEX; pageIndex < pageLimit; pageIndex++) {
    logAudit("HARVEST_PLAYERS_FETCH", "called", { path: pagePath });

    const playerRankingsResponse = await fetchWithRotation(pagePath);
    if (!playerRankingsResponse.ok) {
      throw new Error(`Failed to fetch player rankings: ${playerRankingsResponse.status}`);
    }

    const rankingApiRaw: unknown = await playerRankingsResponse.json();
    const rankingIntegrity = v.safeParse(RoyaleRankingListSchema, rankingApiRaw);

    if (!rankingIntegrity.success) {
      // [THREAT ANNOTATION] Threat Vector: Structural Payload Drift.
      // If the remote proxy shifts its response structure, failing fast here prevents downstream state pollution
      // or parsing crashes in the core app.
      throw new Error("Player rankings payload failed structural validation.");
    }

    const observedRankingItems = rankingIntegrity.output.items;

    // Filter for clanless players
    const clanlessPlayers = observedRankingItems.filter((rankingItem) => {
      const rankingClan = rankingItem.clan;
      return !rankingClan || !rankingClan.tag;
    });

    logAudit("HARVEST_PLAYERS_RESULT", "run", {
      path: pagePath, ranked: observedRankingItems.length, clanless: clanlessPlayers.length,
    });
    for (const rankingItem of clanlessPlayers) {
      players.set(rankingItem.tag, { tag: rankingItem.tag, name: rankingItem.name, clan: null });
    }
    const after = rankingIntegrity.output.paging?.cursors?.after;
    if (!paginate || !after || observedRankingItems.length === INITIAL_INDEX) break;
    if (visitedCursors.has(after)) throw new Error("Player rankings returned a repeated pagination cursor.");
    visitedCursors.add(after);
    pagePath = `${endpointPath}&after=${encodeURIComponent(after)}`;
  }
  return Array.from(players.values());
}

/**
 * Live boards can be empty after the monthly reset. A completed worldwide
 * board supplies candidates, whose current profiles must still be clanless.
 * This runs once per request, after all requested live regions are exhausted.
 */
export async function harvestSeasonPlayers(
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<{ items: v.InferOutput<typeof HarvestedPlayerSchema>[], region: string }> {
  logAudit("HARVEST_SEASON_FALLBACK", "called");
  const response = await fetchWithRotation("/locations/global/seasons");
  if (!response.ok) throw new Error(`Failed to fetch completed seasons: ${response.status}`);
  const seasons = v.parse(RoyaleSeasonListSchema, await response.json());
  const latestSeason = seasons.items.map(season => season.id).sort().at(-1);
  if (!latestSeason) throw new Error("No completed season is available for leaderboard harvesting.");

  const candidates = await fetchRankings(
    `/locations/global/pathoflegend/${latestSeason}/rankings/players?limit=${PLAYER_LEADERBOARD_LIMIT}`,
    logAudit,
    true,
  );
  const profiles = await processBatch(candidates.map(candidate => async () => {
    const profileResponse = await fetchWithRotation(`/players/${encodeURIComponent(candidate.tag)}`);
    // Deleted accounts are no longer recruitment candidates.
    if (profileResponse.status === 404) return null;
    if (!profileResponse.ok) throw new Error(`Failed to verify recruit profile: ${profileResponse.status}`);
    const profile = v.parse(RoyalePlayerSchema, await profileResponse.json());
    if (profile.tag !== candidate.tag) throw new Error("Recruit profile tag does not match the season candidate.");
    return profile.clan?.tag ? null : { tag: profile.tag, name: profile.name, clan: null };
  }));
  const items = profiles.filter(profile => profile !== null);
  logAudit("HARVEST_SEASON_VERIFIED", "run", { season: latestSeason, candidates: candidates.length, clanless: items.length });
  return { items, region: `Global (completed season ${latestSeason})` };
}

/**
 * GLOBAL HARVESTER: Worldwide scope only.
 *
 * Reads the live worldwide board and, when it holds fewer clanless players than
 * TARGET_HARVEST_FLOOR (the first days after a monthly reset), adds the verified
 * recruits of the newest completed worldwide season. Live players come first so
 * the recruitment queue starts with the current board. No country board is ever
 * consulted: a worldwide request must not return regional players.
 */
export async function harvestGlobalPlayers(
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<{ items: v.InferOutput<typeof HarvestedPlayerSchema>[], region: string }> {
  const liveItems = await harvestClanlessPlayers(GLOBAL_LOCATION, logAudit);
  if (liveItems.length >= TARGET_HARVEST_FLOOR) return { items: liveItems, region: "Global" };

  logAudit("GLOBAL_LIVE_BOARD_THIN", "run", { live: liveItems.length, floor: TARGET_HARVEST_FLOOR });
  const season = await harvestSeasonPlayers(logAudit);
  const merged = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
  for (const item of liveItems) merged.set(item.tag, item);
  for (const item of season.items) if (!merged.has(item.tag)) merged.set(item.tag, item);
  return { items: Array.from(merged.values()), region: season.region };
}

/**
 * INTERNATIONAL HARVESTER: Concurrent Discovery
 *
 * Shuffles country catalog and picks a batch of random regions to query in parallel.
 *
 * @remarks
 * Satisfies ADR Section III: Command-Query Separation and Section V: Performance (Lazy Loading & Bundling).
 * Implements dynamic geographic rotation to avoid querying static cohorts and circumvent API rate limits.
 *
 * Security & Authorization:
 * - Downstream calls to /locations must run through authorized proxy rotating bearer credentials.
 * - Does not expose internal credentials to client-facing surfaces.
 *
 * Potential Failure States:
 * - Location Directory Missing/Obsolete: Fallback path queries default location ID if locations response is offline.
 * - Schema Mismatch: Aborts catalog loading if locations payload fails RoyaleLocationListSchema checks.
 * - Downstream Cascading Timeouts: Handled by individual try/catch boundaries within concurrency-limited execution batch.
 *
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns Object containing the consolidated list of players and the compiled populated regions label string.
 * @throws {Error} If the root locations fetch fails or fails schema validation, and fallback catalog is unresolvable.
 */
export async function harvestInternationalPlayers(
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<{ items: v.InferOutput<typeof HarvestedPlayerSchema>[], region: string }> {
  logAudit("INTERNATIONAL_DETECTED", "run");

  if (!cachedCountries) {
    logAudit("COUNTRIES_DIRECTORY_FETCH", "called");
    const locationsResponse = await fetchWithRotation("/locations");
    if (!locationsResponse.ok) {
      throw new Error(`Failed to retrieve locations catalog: ${locationsResponse.status}`);
    }

    const locationsCatalogRaw: unknown = await locationsResponse.json();
    const locationsValidation = v.safeParse(RoyaleLocationListSchema, locationsCatalogRaw);

    if (!locationsValidation.success) {
      throw new Error("Locations catalog failed structural validation.");
    }

    const observedLocationsList = locationsValidation.output.items;

    cachedCountries = observedLocationsList
      .filter((locationCandidate) => locationCandidate.isCountry === true)
      .map((locationCandidate) => ({ id: locationCandidate.id, name: locationCandidate.name }));
  }

  if (!cachedCountries || cachedCountries.length === INITIAL_INDEX) {
    // [THREAT ANNOTATION] Threat Vector: Downstream Location catalog corruption.
    // If locations data is manipulated or missing, fallback to the default locale ensures continuity of operation.
    logAudit("COUNTRIES_CATALOG_EMPTY_FALLBACK", "run");
    const harvestResults = await harvestClanlessPlayers(String(DEFAULT_FALLBACK_ID), logAudit);
    return { items: harvestResults, region: DEFAULT_FALLBACK_COUNTRY };
  }

  // [DECISION LOG] Shuffle country catalog randomly prior to concurrent query allocation.
  // Prevents bias towards alphabetical countries and distributes query volume evenly across downstream regional proxies,
  // reducing the risk of rate-limiting or localized proxy bans.
  const shuffledCandidates = [...cachedCountries];
  for (let shuffleIndex = shuffledCandidates.length - 1; shuffleIndex > 0; shuffleIndex--) {
    const swapIndex = Math.floor(Math.random() * (shuffleIndex + 1));
    [shuffledCandidates[shuffleIndex], shuffledCandidates[swapIndex]] =
      [shuffledCandidates[swapIndex], shuffledCandidates[shuffleIndex]];
  }

  const targetCountriesCount = Math.min(MAX_HARVEST_EPOCHS, shuffledCandidates.length);
  const countriesToQuery = shuffledCandidates.slice(INITIAL_INDEX, targetCountriesCount);

  logAudit("CONCURRENT_BATCH_START", "run", { countries: countriesToQuery.map(countryCandidate => countryCandidate.name) });

  const batchTasks = countriesToQuery.map((countryCandidate) => {
    return async () => {
      try {
        const harvestResults = await harvestClanlessPlayers(String(countryCandidate.id), logAudit);
        return { country: countryCandidate.name, players: harvestResults, failed: false };
      } catch (harvestError: unknown) {
        // [THREAT ANNOTATION] Threat Vector: Cascading concurrent timeout spikes.
        // Wrapping the parallel worker task in individual try-catch blocks isolates regional proxy down-times
        // and prevents a single bad country API endpoint from failing the entire international discovery batch.
        console.warn(`[HARVEST] Failed concurrent query for ${countryCandidate.name}:`, harvestError instanceof Error ? harvestError.message : String(harvestError));
        return { country: countryCandidate.name, players: [], failed: true };
      }
    };
  });

  const batchResults = await processBatch(batchTasks);
  const mergedPlayersMap = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
  const queriedRegions: string[] = [];
  // [THREAT ANNOTATION] Threat Vector: an outage indistinguishable from an empty result.
  // Every per-country failure above is swallowed into an empty player list, and
  // populated_regions only counts countries that RETURNED players. So a batch in
  // which every single region errored produced the same audit entry as a batch
  // that queried perfectly and found nobody clanless: total_harvested 0,
  // populated_regions []. Discovery cannot be told it has gone blind. Failures
  // are counted separately so the two cases are distinguishable.
  const failedRegions: string[] = [];

  for (const batchResult of batchResults) {
    if (batchResult.failed) {
      failedRegions.push(batchResult.country);
      continue;
    }
    if (batchResult.players.length > INITIAL_INDEX) {
      queriedRegions.push(batchResult.country);
      for (const harvestedPlayer of batchResult.players) {
        mergedPlayersMap.set(harvestedPlayer.tag, harvestedPlayer);
      }
    }
  }

  const mergedPlayers = Array.from(mergedPlayersMap.values());
  const everyRegionFailed = countriesToQuery.length > INITIAL_INDEX
    && failedRegions.length === countriesToQuery.length;

  logAudit(everyRegionFailed ? "CONCURRENT_BATCH_FAILED" : "CONCURRENT_BATCH_SUCCESS", "run", {
    total_harvested: mergedPlayers.length,
    populated_regions: queriedRegions,
    failed_regions: failedRegions,
    queried_regions_count: countriesToQuery.length,
  });

  // A batch where EVERY attempted region errored is an outage, not a result.
  // Returning an empty list here would tell discovery it queried the world and
  // found nobody clanless, which is the same thing it hears on a genuinely quiet
  // day, so a sustained upstream failure would look like a shrinking recruit
  // pool for as long as it lasted. Throwing costs nothing that was worth having:
  // in exactly this case the empty return carried no players either, so the only
  // thing lost is the false reassurance. clinicalServe converts it to an error
  // response, which is how the sibling guards in this handler already report an
  // unusable upstream.
  if (everyRegionFailed) {
    throw new Error(
      `International harvest failed across all ${countriesToQuery.length} attempted regions: ${failedRegions.join(", ")}`,
    );
  }

  const regionLabel = queriedRegions.length > INITIAL_INDEX
    ? `International (${queriedRegions.join(", ")})`
    : "International";

  return { items: mergedPlayers, region: regionLabel };
}

/**
 * PRIMARY HARVESTER: Discovery Engine
 *
 * Queries the worldwide Path of Legends board, or one country's boards, to locate unaffiliated players.
 *
 * @remarks
 * Satisfies ADR Section I: Foundation of "Clinical" Logic (Adaptive Formulas) and Section IV: Deep Delegation Strategy.
 * Scope is strict: the worldwide board never borrows from countries and a country never borrows from the world.
 *
 * Security Controls:
 * - Inherits JWT verification and bearer authorization validated by public RPC gateway.
 *
 * Failure Modes & Recovery:
 * - Global Timeout Spikes: If the global Path of Legends query fails entirely, throws to allow higher-level control surfaces to recover.
 * - Local Board Outage: A failed country query throws; an empty country board returns an empty array and is reported as such.
 *
 * @param location - "global" or a numeric location identifier as a string.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns Array of discovered clanless player objects, empty when the requested board has none.
 * @throws {Error} If the global Path of Legends fetch or the local queries fail.
 */
export async function harvestClanlessPlayers(
  location: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<v.InferOutput<typeof HarvestedPlayerSchema>[]> {
  if (location === GLOBAL_LOCATION) {
    try {
      // [DECISION LOG] WORLDWIDE ONLY. The global harvest never reads a country
      // board: a worldwide request answered with regional players is as wrong as a
      // local request answered with worldwide ones. A thin live board is recovered
      // by harvestGlobalPlayers from the completed worldwide season, not from countries.
      const polPath = `/locations/global/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      return await fetchRankings(polPath, logAudit);
    } catch (globalPolError: unknown) {
      console.error("[HARVEST] Global Path of Legends query failed:", globalPolError instanceof Error ? globalPolError.message : String(globalPolError));
      throw globalPolError;
    }
  } else {
    try {
      const polPath = `/locations/${location}/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const polResults = await fetchRankings(polPath, logAudit);

      if (polResults.length >= MIN_LOCAL_POL_FLOOR) {
        return polResults;
      }

      const rankingsPath = `/locations/${location}/rankings/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const rankingsResults = await fetchRankings(rankingsPath, logAudit);

      const mergedResults = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
      for (const harvestedItem of polResults) mergedResults.set(harvestedItem.tag, harvestedItem);
      for (const harvestedItem of rankingsResults) mergedResults.set(harvestedItem.tag, harvestedItem);

      return Array.from(mergedResults.values());
    } catch (localError: unknown) {
      console.error(`[HARVEST] Local harvest failed for ${location}:`, localError instanceof Error ? localError.message : String(localError));
      throw localError;
    }
  }
}
