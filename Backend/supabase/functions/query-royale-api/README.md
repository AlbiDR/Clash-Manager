// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Royale API Proxy (`query-royale-api`)

The **Leaderboard Harvesting Gate**. A specialized Edge Function (Layer 1) responsible for performing secure, transient queries against the Clash Royale API leaderboards.

---

## Purpose
The `query-royale-api` function acts as a secure proxy for the PWA, allowing it to harvest potential recruits from Global and Local leaderboards without exposing API keys to the client or polluting the persistent database substrate with transient candidates.

## Architectural Context
- **Layer**: Layer 1 (@core / @kernel)
- **Role**: L5 Control Layer Proxy
- **Runtime**: Deno (Supabase Edge Functions)
- **Security**: Requires an Internal Bearer Token or a valid Supabase Anon Key.

## Logic Subsystems

### Global Harvesting
- **Endpoint**: `/locations/global/rankings/players`
- **Behavior**: Retrieves the live worldwide player trophy leaderboard top 1000 in a single request.
- **Validation**: Strict structural validation via `RoyaleRankingListSchema`.

> **Why `/rankings/players` and not `/pathoflegend/players`?** The `/pathoflegend/players`
> path is an undocumented, unofficial endpoint that proved unreliable in production:
> it returned only 1 result globally and 0 results locally, regardless of the `limit`
> parameter. The documented `/rankings/players` endpoint is stable, honors `limit=1000`,
> and returns the current live leaderboard for both `global` and individual country IDs.

### Local Harvesting & Country Rotation
- **Endpoint**: `/locations/{id}/rankings/players`
- **Identification**: Automatically identifies the clan's registered location by fetching clan details for the configured `CLAN_TAG`.
- **International Rotation**: If the clan is registered as "International" (ID 57000101) or non-country, the function performs a **Dynamic Country Rotation**:
    1. Fetches the full locations catalog from `/locations`.
    2. Filters for valid country locations (`isCountry: true`).
    3. Randomly selects a country for the current request to ensure diverse discovery.
    4. **Rationale**: Rotating countries for International clans prevents stagnation in the recruitment pool by accessing distinct regional leaderboards that would otherwise be ignored.
- **Ephemeral Caching**: The locations catalog is cached in-memory (`cachedCountries`) at the module level to minimize roundtrips during an execution instance lifecycle.
- **Epoch Ceiling**: Up to 30 countries are probed per request (`MAX_HARVEST_EPOCHS`). Many micro-territories return 0 ranked players; a higher ceiling improves the probability of finding a populated leaderboard within a single invocation.

## Security & Validation Boundaries

### Inbound Validation
All requests are validated against `PayloadSchema` to ensure they specify a valid endpoint (`local` or `global`).

### Outbound Validation (Zero-Trust)
External data from the Clash Royale API is treated as untrusted. Every response is parsed and validated using Valibot schemas before being returned to the client:
- `RoyaleRankingListSchema`: Validates player rankings.
- `RoyaleClanSchema`: Validates clan profile details for location identification.
- `RoyaleLocationListSchema`: Validates the locations catalog.

### Error Handling
The function utilizes `clinicalServe` for standardized error reporting and audit logging. Failures in external API calls or structural validation result in a direct rejection to protect the PWA from malformed data.

## Environment Dependencies
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`: Infrastructure identity.
- `INTERNAL_BEARER_TOKEN`: Secure function-to-function communication.
- `CLAN_TAG`: Targeted clan for local harvesting.
- `ROYALE_API_KEYS`: Injected via the Key Farm (`muscle.ts`) for authenticated Royale API access.
