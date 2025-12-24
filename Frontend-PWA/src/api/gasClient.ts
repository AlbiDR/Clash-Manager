/**
 * GAS API Client
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

const getGasUrl = () => {
    if (typeof localStorage === 'undefined') return import.meta.env.VITE_GAS_URL || ''
    return localStorage.getItem('cm_gas_url') || import.meta.env.VITE_GAS_URL || ''
}

const CACHE_KEY_MAIN = 'CLAN_MANAGER_DATA_V6' 

/**
 * Inflates the matrix-compressed payload into structured objects.
 * @param data Raw payload
 * @param skipValidation If true, bypasses Zod schema validation (Use ONLY for trusted local cache)
 */
export async function inflatePayload(data: any, skipValidation = false): Promise<WebAppData> {
    if (typeof data === 'string') {
        data = JSON.parse(data)
    }

    if (!data || data.format !== 'matrix') {
        return data as WebAppData
    }

    let lbRaw: any[] = []
    let hhRaw: any[] = []
    let ts = Date.now()

    if (skipValidation) {
        // ⚡ FAST PATH: Trusted Cache (No Zod overhead)
        lbRaw = data.lb || []
        hhRaw = data.hh || []
        ts = data.timestamp || Date.now()
    } else {
        // 🛡️ SLOW PATH: Network Data (Validate Schema)
        const { z } = await import('zod')
        const result = z.object({
            lb: z.array(z.array(z.any())),
            hh: z.array(z.array(z.any())),
            timestamp: z.number()
        }).safeParse(data)
        
        if (!result.success) throw new Error('API Schema Mismatch')
        lbRaw = result.data.lb
        hhRaw = result.data.hh
        ts = result.data.timestamp
    }

    return {
        lb: lbRaw.map(r => ({
            id: r[0], n: r[1], t: r[2], s: r[3],
            d: { role: r[4], days: r[5], avg: r[6], seen: r[7], rate: r[8], hist: r[9] },
            dt: r[10] ?? 0, r: r[11] ?? 0
        })),
        hh: hhRaw.map(r => ({
            id: r[0], n: r[1], t: r[2], s: r[3],
            d: { don: r[4], war: r[5], ago: r[6], cards: r[7] ?? 0 }
        })),
        timestamp: ts
    }
}

async function gasRequest<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
    const url = getGasUrl()
    if (!url) throw new Error('GAS_URL not configured.')

    const response = await fetch(`${url}?action=${action}`, {
        method: action === 'getwebappdata' ? 'GET' : 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: action === 'getwebappdata' ? undefined : JSON.stringify({ action, ...payload })
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    const envelope = JSON.parse(text)

    if (envelope.success === true || envelope.status === 'success') return envelope as T
    throw new Error(envelope.error?.message || 'Unknown Backend Error')
}

export async function loadCache(): Promise<WebAppData | null> {
    return idb.get<WebAppData>(CACHE_KEY_MAIN)
}

export async function fetchRemote(): Promise<WebAppData> {
    // ⚡ PERFORMANCE: Start Zod library download in parallel with Network Request.
    // This eliminates the waterfall effect where Zod is requested only after the JSON payload arrives.
    // The previous critical chain audit showed v-zod blocked for ~4.2s.
    const zodPreload = import('zod');

    const envelope = await gasRequest<ApiResponse<any>>('getwebappdata')
    if (!envelope.data) throw new Error('Invalid response structure')
    
    // Ensure Zod is fully loaded before attempting inflation
    await zodPreload;

    const inflated = await inflatePayload(envelope.data, false) // Validate network data
    idb.set(CACHE_KEY_MAIN, inflated).catch(() => {})
    return inflated
}

export async function ping(): Promise<ApiResponse<PingResponse>> {
    return gasRequest<ApiResponse<PingResponse>>('ping')
}

export async function dismissRecruits(ids: string[]): Promise<ApiResponse<DismissResponse>> {
    return gasRequest<ApiResponse<DismissResponse>>('dismissRecruits', { ids })
}

export async function triggerBackendUpdate(target?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return gasRequest<ApiResponse<{ success: boolean; message: string }>>('triggerUpdate', { target })
}

export function isConfigured(): boolean { return Boolean(getGasUrl()) }
export function getApiUrl(): string { return getGasUrl() || '(not configured)' }
