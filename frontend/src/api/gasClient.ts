/**
 * GAS API Client
 * Handles all communication with the Google Apps Script backend
 */

import type {
    ApiResponse,
    LegacyApiResponse,
    WebAppData,
    ClanMember,
    WarLogEntry,
    PingResponse,
    DismissResponse,
    LeaderboardMember,
    Recruit
} from '../types'

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Your GAS Web App URL - Update this after deploying the backend
 * Format: https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
 */
const GAS_URL = import.meta.env.VITE_GAS_URL || ''

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Inflates a Matrix-compressed response back into Objects.
 * Compatible with legacy Object-based responses for seamless migration.
 */
function inflatePayload(data: any): WebAppData {
    // If it's old format (no format tag or schema), return as is
    if (!data || data.format !== 'matrix' || !data.schema) {
        return data as WebAppData
    }

    const { lb, hh, timestamp } = data
    
    // Inflate Leaderboard: [id, n, t, s, role, days, avg, seen, rate, hist]
    const inflatedLB: LeaderboardMember[] = (lb || []).map((r: any[]) => ({
        id: r[0],
        n: r[1],
        t: r[2],
        s: r[3],
        d: {
            role: r[4],
            days: r[5],
            avg: r[6],
            seen: r[7],
            rate: r[8],
            hist: r[9]
        }
    }))

    // Inflate Recruits: [id, n, t, s, don, war, ago, cards]
    const inflatedHH: Recruit[] = (hh || []).map((r: any[]) => ({
        id: r[0],
        n: r[1],
        t: r[2],
        s: r[3],
        d: {
            don: r[4],
            war: r[5],
            ago: r[6],
            cards: r[7]
        }
    }))

    return {
        lb: inflatedLB,
        hh: inflatedHH,
        timestamp: timestamp
    }
}

// ============================================================================
// CORE FETCH UTILITY
// ============================================================================

/**
 * Makes a request to the GAS API using POST to bypass CORS/caching issues.
 * GAS Web Apps return a 302 redirect which fetch handles automatically.
 */
async function gasRequest<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
    if (!GAS_URL) {
        throw new Error('GAS_URL not configured. Set VITE_GAS_URL environment variable.')
    }

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain' // GAS handles this better than application/json
            },
            body: JSON.stringify({
                action,
                ...payload
            })
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        return data as T
    } catch (error) {
        console.error(`GAS API Error [${action}]:`, error)
        throw error
    }
}

/**
 * Stale-While-Revalidate Caching Wrapper
 * Returns cached data immediately (if available) and triggers background fetch
 */
async function getSWR<T>(key: string, fetcher: () => Promise<T>, ttlMinutes = 5): Promise<T> {
    const cacheKey = `gas_cache_${key}`
    const cached = localStorage.getItem(cacheKey)

    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached)
            const ageMinutes = (Date.now() - timestamp) / (1000 * 60)

            // Background revalidation based on TTL
            if (ageMinutes > ttlMinutes) {
                fetcher().then(fresh => {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        data: fresh,
                        timestamp: Date.now()
                    }))
                }).catch(e => console.warn('Background revalidation failed:', e))
            }

            return data as T
        } catch (e) {
            console.warn('Cache parse error:', e)
            localStorage.removeItem(cacheKey)
        }
    }

    // No cache or error, fetch fresh
    const fresh = await fetcher()
    localStorage.setItem(cacheKey, JSON.stringify({
        data: fresh,
        timestamp: Date.now()
    }))
    return fresh
}

// ============================================================================
// API METHODS
// ============================================================================

/**
 * Health check - verify API is online
 */
export async function ping(): Promise<ApiResponse<PingResponse>> {
    return gasRequest<ApiResponse<PingResponse>>('ping')
}

/**
 * Get leaderboard and recruiter data (cached on server)
 * 🛠️ Includes automatic Payload Inflation (Matrix -> Objects)
 */
export async function getLeaderboard(): Promise<LegacyApiResponse<WebAppData>> {
    // We define a specialized fetcher that handles the inflation
    const fetcher = async () => {
        const raw = await gasRequest<LegacyApiResponse<any>>('getLeaderboard')
        if (raw.success && raw.data) {
            raw.data = inflatePayload(raw.data)
        }
        return raw as LegacyApiResponse<WebAppData>
    }

    return getSWR('leaderboard', fetcher, 5)
}

/**
 * Get recruiter pool only
 * 🛠️ Includes automatic Payload Inflation
 */
export async function getRecruits(): Promise<ApiResponse<{ hh: WebAppData['hh']; timestamp: number }>> {
    const fetcher = async () => {
        const raw = await gasRequest<ApiResponse<any>>('getRecruits')
        if (raw.status === 'success' && raw.data) {
            // Check if raw.data is a wrapper containing the full matrix payload
            // The backend endpoint returns { hh: ..., timestamp: ... } 
            // If the backend returns full compressed object for getRecruits, we inflate it.
            // Note: getRecruits endpoint usually returns a subset. 
            // Currently API_Public returns { hh: parsed.data.hh ... }
            // If parsed.data was matrix, hh is an array of arrays.
            
            // We need to check if the 'hh' inside data is a matrix or objects.
            const sample = raw.data.hh?.[0];
            if (Array.isArray(sample)) {
                 // Manual inflation for just the hh part since we don't have the full payload wrapper
                 raw.data.hh = raw.data.hh.map((r: any[]) => ({
                    id: r[0],
                    n: r[1],
                    t: r[2],
                    s: r[3],
                    d: {
                        don: r[4],
                        war: r[5],
                        ago: r[6],
                        cards: r[7]
                    }
                }))
            }
        }
        return raw as ApiResponse<{ hh: WebAppData['hh']; timestamp: number }>
    }

    return getSWR('recruits', fetcher, 5)
}

/**
 * Get real-time clan members from Clash Royale API
 */
export async function getMembers(): Promise<ApiResponse<ClanMember[]>> {
    return gasRequest<ApiResponse<ClanMember[]>>('getMembers')
}

/**
 * Get war log history
 */
export async function getWarLog(): Promise<ApiResponse<WarLogEntry[]>> {
    return gasRequest<ApiResponse<WarLogEntry[]>>('getWarLog')
}

/**
 * Force refresh the cached data
 */
export async function refresh(): Promise<LegacyApiResponse<WebAppData>> {
    const raw = await gasRequest<LegacyApiResponse<any>>('refresh')
    
    // Inflate if necessary
    if (raw.success && raw.data) {
        raw.data = inflatePayload(raw.data)
    }
    
    const finalData = raw as LegacyApiResponse<WebAppData>
    
    // Update cache on manual refresh
    localStorage.setItem('gas_cache_leaderboard', JSON.stringify({ data: finalData, timestamp: Date.now() }))
    return finalData
}

/**
 * Mark recruits as dismissed/invited
 */
export async function dismissRecruits(ids: string[]): Promise<ApiResponse<DismissResponse>> {
    return gasRequest<ApiResponse<DismissResponse>>('dismissRecruits', { ids })
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Check if the API is configured
 */
export function isConfigured(): boolean {
    return Boolean(GAS_URL)
}

/**
 * Get the configured API URL (for debugging)
 */
export function getApiUrl(): string {
    return GAS_URL || '(not configured)'
}
