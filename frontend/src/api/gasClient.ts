/**
 * GAS API Client
 * Handles all communication with the Google Apps Script backend
 */

import type {
    ApiResponse,
    LegacyApiResponse,
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
const CACHE_KEY_MAIN = 'clash_manager_data_v6' // Unified Cache Key

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Inflates a Matrix-compressed response back into Objects.
 */
function inflatePayload(data: any): WebAppData {
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
        const response = await fetch(GAS_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, ...payload })
        })

        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json() as T
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
    // 'getwebappdata' endpoint returns both LB and HH in one compressed matrix
    const raw = await gasRequest<LegacyApiResponse<any>>('getwebappdata')
    
    if (!raw.success || !raw.data) {
        throw new Error(raw.error?.message || 'Failed to fetch data')
    }

    const inflated = inflatePayload(raw.data)
    
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

export async function getMembers(): Promise<ApiResponse<ClanMember[]>> {
    return gasRequest<ApiResponse<ClanMember[]>>('getMembers')
}

export async function dismissRecruits(ids: string[]): Promise<ApiResponse<DismissResponse>> {
    return gasRequest<ApiResponse<DismissResponse>>('dismissRecruits', { ids })
}

// Utility
export function isConfigured(): boolean {
    return Boolean(GAS_URL)
}

export function getApiUrl(): string {
    return GAS_URL || '(not configured)'
}
