
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
import { idb } from '../utils/idb'

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
 * Includes Zod validation to ensure data integrity.
 * 
 * ⚡ OPTIMIZATION: Zod is loaded dynamically to save ~26KB from main bundle.
 */
export async function inflatePayload(data: any): Promise<WebAppData> {
    // Handle String Transport Protocol: Double-parse if data is a string
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch (e) {
            console.error('Failed to parse double-encoded data:', e)
            throw new Error('Data corruption: Double-encoding failure')
        }
    }

    // Legacy support or raw object pass-through check (skip validation if not matrix)
    if (!data || data.format !== 'matrix') {
        console.warn('Received non-matrix data format. Skipping validation.')
        return data as WebAppData
    }

    // 🛡️ DYNAMIC IMPORT: Load Zod only when we have data to validate
    const { z } = await import('zod')

    // Schema Definitions (Lazy Loaded)
    const LeaderboardRowSchema = z.tuple([
        z.string(),             // 0: id
        z.string(),             // 1: name
        z.number(),             // 2: trophies
        z.number(),             // 3: performance score
        z.string(),             // 4: role
        z.number(),             // 5: days tracked
        z.number(),             // 6: avg daily donations
        z.union([z.string(), z.null()]),  // 7: last seen (can be null/empty in matrix sometimes)
        z.union([z.string(), z.null()]),  // 8: war rate
        z.string(),             // 9: history string
        z.number().optional(),  // 10: delta trend (optional for backward compat)
        z.number().optional()   // 11: raw score (optional for backward compat)
    ])

    const RecruitRowSchema = z.tuple([
        z.string(),             // 0: id
        z.string(),             // 1: name
        z.number(),             // 2: trophies
        z.number(),             // 3: performance score
        z.number(),             // 4: donations
        z.number(),             // 5: war wins
        z.string(),             // 6: found ago (iso date)
        z.number().optional()   // 7: cards won (optional)
    ])

    const PayloadSchema = z.object({
        format: z.literal('matrix'),
        schema: z.object({
            lb: z.array(z.string()),
            hh: z.array(z.string())
        }),
        lb: z.array(LeaderboardRowSchema),
        hh: z.array(RecruitRowSchema),
        timestamp: z.number()
    })

    // 🛡️ VALIDATION STEP
    const result = PayloadSchema.safeParse(data)
    
    if (!result.success) {
        console.error('❌ Zod Validation Failed:', result.error.format())
        // We can choose to throw or return partial data. 
        // For robustness, we throw to trigger the error boundary / refresh logic.
        throw new Error('API Schema Mismatch: The backend data structure does not match the frontend expectation.')
    }

    const validData = result.data
    const { lb, hh, timestamp } = validData

    // Inflate Leaderboard
    const inflatedLB: LeaderboardMember[] = lb.map(r => ({
        id: r[0],
        n: r[1],
        t: r[2],
        s: r[3],
        d: {
            role: r[4],
            days: r[5],
            avg: r[6],
            seen: r[7] || '',
            rate: r[8] || '',
            hist: r[9]
        },
        dt: r[10] ?? 0, // Default to 0 if missing
        r: r[11] ?? 0
    }))

    // Inflate Recruits
    const inflatedHH: Recruit[] = hh.map(r => ({
        id: r[0],
        n: r[1],
        t: r[2],
        s: r[3],
        d: {
            don: r[4],
            war: r[5],
            ago: r[6],
            cards: r[7] ?? 0
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

        // 🛡️ ROBUST PARSING: Handle GAS HTML Errors gracefully
        const text = await response.text()
        let envelope: any

        try {
            envelope = JSON.parse(text)
        } catch (e) {
            // Check for common HTML error signatures from Google
            if (text.includes('<!DOCTYPE html') || text.includes('<html') || text.includes('Google Drive - Page Not Found')) {
                throw new Error('Backend Critical Failure: The server timed out or returned an HTML error page instead of JSON.')
            }
            throw new Error(`Malformed JSON response from server: ${text.substring(0, 100)}...`)
        }

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
 * 1. Asynchronously load data from IndexedDB (Non-blocking hydration)
 */
export async function loadCache(): Promise<WebAppData | null> {
    try {
        const cached = await idb.get<WebAppData>(CACHE_KEY_MAIN)
        return cached || null
    } catch (e) {
        console.warn('Cache load failed:', e)
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

    const inflated = await inflatePayload(envelope.data)

    // Save to cache (Async)
    idb.set(CACHE_KEY_MAIN, inflated).catch(e => console.warn('Cache write failed:', e))

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

export async function triggerBackendUpdate(target?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return gasRequest<ApiResponse<{ success: boolean; message: string }>>('triggerUpdate', { target })
}

// Utility
export function isConfigured(): boolean {
    return Boolean(GAS_URL)
}

export function getApiUrl(): string {
    return GAS_URL || '(not configured)'
}
