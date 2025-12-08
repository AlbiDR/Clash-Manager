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
    DismissResponse
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
                    // Dispatch event for reactive updates (if needed)
                    // For now, simpler SWR: just return cached, next load gets fresh
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
 */
export async function getLeaderboard(): Promise<LegacyApiResponse<WebAppData>> {
    return getSWR('leaderboard', () => gasRequest<LegacyApiResponse<WebAppData>>('getLeaderboard'), 5)
}

/**
 * Get recruiter pool only
 */
export async function getRecruits(): Promise<ApiResponse<{ hh: WebAppData['hh']; timestamp: number }>> {
    return getSWR('recruits', () => gasRequest<ApiResponse<{ hh: WebAppData['hh']; timestamp: number }>>('getRecruits'), 5)
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
    const data = await gasRequest<LegacyApiResponse<WebAppData>>('refresh')
    // Update cache on manual refresh
    localStorage.setItem('gas_cache_leaderboard', JSON.stringify({ data, timestamp: Date.now() }))
    return data
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
