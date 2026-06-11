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
- **Behavior**: Retrieves the top 1000 players globally.
- **Validation**: Strict structural validation via `RoyaleRankingListSchema`.

### Local Harvesting & Country Rotation
- **Endpoint**: `/locations/{id}/rankings/players`
- **Identification**: Automatically identifies the clan's registered location via the `CLAN_TAG` configuration.
- **International Rotation**: If the clan is registered as "International", the function performs a **Dynamic Country Rotation**:
    1. Fetches the full locations catalog from `/locations`.
    2. Filters for valid country locations (`isCountry: true`).
    3. Randomly selects a country for the current request.
    4. **Rationale**: Rotating countries for International clans provides a more diverse set of potential recruits compared to the static "Global" pool, which often overlaps with the Global leaderboard.
- **Ephemeral Caching**: The locations catalog is cached in-memory (`cachedCountries`) to minimize roundtrips to the Royale API during a single execution instance.

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
