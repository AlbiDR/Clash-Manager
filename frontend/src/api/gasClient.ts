
/**
 * GAS API Client
 * Handles all communication with the GAS backend
 */

import type {
    ApiResponse,
    WebAppData,
    ClanMember,
    PingResponse,
    DismissResponse,
    LeaderboardMember,
    Recruit
} from '../types'

// ============================================================================
// CONFIGURATION
// ============================================================================

// Prioritize LocalStorage override, fall back to Build Env, default to empty
const GAS_URL = localStorage.getItem('cm_gas_url') || import.meta.env.VITE_GAS_URL || ''
const CACHE_KEY_MAIN = 'CLAN_MANAGER_DATA_V6' // Updated for v6 Gold Master

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Inflates a Matrix-compressed response back into Objects.
 */
function inflatePayload(data: any): WebAppData {
    // Handle String Transport Protocol: Double-parse if data is a string
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch (e) {
            console.error('Failed to parse double-encoded data:', e)
            // fallback to original data, though likely invalid
        }
    }

    // Legacy support or raw object pass-through
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

async function gasRequest<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
    if (!GAS_URL) {
        throw new Error('GAS_URL not configured. Set VITE_GAS_URL environment variable or configure in Settings.')
    }

    try {
        const response = await fetch(`${GAS_URL}?action=${action}`, {
            method: action === 'getwebappdata' ? 'GET' : 'POST', // Use GET for reads as per v6 spec
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            // GET requests cannot have body
            body: action === 'getwebappdata' ? undefined : JSON.stringify({ action, ...payload })
        })

        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const envelope = await response.json()

        // --------------------------------------------------------
        // CRITICAL FIX: Normalization Pattern
        // --------------------------------------------------------
        // We normalize the response HERE so downstream consumers (like fetchRemote)
        // don't need to know about legacy formats.

        // 1. Detect Legacy Format (from getWebAppData)
        if (envelope.success === true && !envelope.status) {
            envelope.status = 'success'
        }

        // 2. Standard Validation
        if (envelope.status === 'success') {
            return envelope as T
        }

        // 3. Error Handling
        if (envelope.status === 'error' || envelope.success === false) {
            const errorMsg = envelope.error?.message || 'Unknown Backend Error'
            console.error(`GAS API Error [${action}]:`, errorMsg, envelope.error)
            throw new Error(errorMsg)
        }

        // 4. Fallback
        console.warn(`GAS API Warning [${action}]: Unexpected response structure`, envelope)
        throw new Error('Invalid response structure: ' + JSON.stringify(envelope).substring(0, 100))
    } catch (error) {
        console.error(`GAS API Error [${action}]:`, error)
        throw error
    }
}

// ============================================================================
// UNIFIED DATA STORE (SWR PATTERN)
// ============================================================================

/**
 * 1. Synchronously load data from LocalStorage (Instant Render)
 */
export function loadCache(): WebAppData | null {
    const cached = localStorage.getItem(CACHE_KEY_MAIN)
    if (!cached) return null

    try {
        const parsed = JSON.parse(cached)
        return parsed
    } catch (e) {
        console.warn('Cache corrupted, clearing.')
        localStorage.removeItem(CACHE_KEY_MAIN)
        return null
    }
}

/**
 * 2. Fetch fresh data from server and update cache (Background Sync)
 * Fetches the UNIFIED payload (LB + HH) to save bandwidth.
 */
export async function fetchRemote(): Promise<WebAppData> {
    // 'getwebappdata' endpoint returns both LB and HH
    // Response Schema: { status: 'success', data: { ... } }
    const envelope = await gasRequest<ApiResponse<any>>('getwebappdata')

    if (envelope.status !== 'success' || !envelope.data) {
        throw new Error('Failed to fetch data: Invalid response structure')
    }

    const inflated = inflatePayload(envelope.data)

    // Save to cache
    localStorage.setItem(CACHE_KEY_MAIN, JSON.stringify(inflated))

    return inflated
}

// ============================================================================
// SPECIFIC ACTIONS
// ============================================================================

export async function ping(): Promise<ApiResponse<PingResponse>> {
    return gasRequest<ApiResponse<PingResponse>>('ping')
}

export async function checkApiStatus(): Promise<ApiResponse<PingResponse>> {
    return gasRequest<ApiResponse<PingResponse>>('ping')
}

export async function getMembers(): Promise<ApiResponse<ClanMember[]>> {
    return gasRequest<ApiResponse<ClanMember[]>>('getMembers')
}

export async function dismissRecruits(ids: string[]): Promise<ApiResponse<DismissResponse>> {
    return gasRequest<ApiResponse<DismissResponse>>('dismissRecruits', { ids })
}

export async function triggerBackendUpdate(): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return gasRequest<ApiResponse<{ success: boolean; message: string }>>('triggerUpdate')
}

// Utility
export function isConfigured(): boolean {
    return Boolean(GAS_URL)
}

export function getApiUrl(): string {
    return GAS_URL || '(not configured)'
}
