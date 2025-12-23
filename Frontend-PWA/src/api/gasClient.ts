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

// Use a getter to avoid top-level ReferenceError during Vitest imports
const getGasUrl = () => {
    if (typeof localStorage === 'undefined') return import.meta.env.VITE_GAS_URL || ''
    return localStorage.getItem('cm_gas_url') || import.meta.env.VITE_GAS_URL || ''
}

const CACHE_KEY_MAIN = 'CLAN_MANAGER_DATA_V6' 

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
        z.union([z.string(), z.null()]),  // 7: last seen
        z.union([z.string(), z.null()]),  // 8: war rate
        z.string(),             // 9: history string
        z.number().optional(),  // 10: delta trend
        z.number().optional()   // 11: raw score
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
        dt: r[10] ?? 0,
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
    const url = getGasUrl()
    if (!url) {
        throw new Error('GAS_URL not configured.')
    }

    try {
        const response = await fetch(`${url}?action=${action}`, {
            method: action === 'getwebappdata' ? 'GET' : 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: action === 'getwebappdata' ? undefined : JSON.stringify({ action, ...payload })
        })

        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const text = await response.text()
        let envelope: any

        try {
            envelope = JSON.parse(text)
        } catch (e) {
            if (text.includes('<!DOCTYPE html') || text.includes('<html')) {
                throw new Error('Backend Critical Failure: Received HTML error page instead of JSON.')
            }
            throw new Error(`Malformed JSON response from server.`)
        }

        if (envelope.success === true && !envelope.status) {
            envelope.status = 'success'
        }

        if (envelope.status === 'success') {
            return envelope as T
        }

        if (envelope.status === 'error' || envelope.success === false) {
            throw new Error(envelope.error?.message || 'Unknown Backend Error')
        }

        throw new Error('Invalid response structure.')
    } catch (error) {
        console.error(`GAS API Error [${action}]:`, error)
        throw error
    }
}

// ============================================================================
// UNIFIED DATA STORE (SWR PATTERN)
// ============================================================================

export async function loadCache(): Promise<WebAppData | null> {
    try {
        const cached = await idb.get<WebAppData>(CACHE_KEY_MAIN)
        return cached || null
    } catch (e) {
        return null
    }
}

export async function fetchRemote(): Promise<WebAppData> {
    const envelope = await gasRequest<ApiResponse<any>>('getwebappdata')

    if (envelope.status !== 'success' || !envelope.data) {
        throw new Error('Failed to fetch data: Invalid response structure')
    }

    const inflated = await inflatePayload(envelope.data)
    idb.set(CACHE_KEY_MAIN, inflated).catch(() => {})
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

export function isConfigured(): boolean {
    return Boolean(getGasUrl())
}

export function getApiUrl(): string {
    return getGasUrl() || '(not configured)'
}
